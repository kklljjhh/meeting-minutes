const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const config = require('../config');

const DASHSCOPE_API_KEY = config.dashscopeApiKey;
const UPLOAD_POLICY_URL = 'https://dashscope.aliyuncs.com/api/v1/uploads';
const TRANSCRIBE_SUBMIT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
const TASK_QUERY_BASE = 'https://dashscope.aliyuncs.com/api/v1/tasks/';

/**
 * 步骤1：获取百炼临时存储上传凭证
 */
async function getUploadPolicy() {
  const resp = await axios.get(UPLOAD_POLICY_URL, {
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    params: {
      action: 'getPolicy',
      model: 'fun-asr'
    },
    timeout: 15000
  });
  if (!resp.data || !resp.data.data) {
    throw new Error(`获取上传凭证失败: ${JSON.stringify(resp.data)}`);
  }
  return resp.data.data;
}

/**
 * 步骤2：将本地文件上传到百炼临时 OSS，返回 oss:// 格式 URL
 */
async function uploadFileToOss(policyData, filePath) {
  const fileName = path.basename(filePath);
  const key = `${policyData.upload_dir}/${fileName}`;

  const form = new FormData();
  form.append('OSSAccessKeyId', policyData.oss_access_key_id);
  form.append('Signature', policyData.signature);
  form.append('policy', policyData.policy);
  form.append('x-oss-object-acl', policyData.x_oss_object_acl);
  form.append('x-oss-forbid-overwrite', policyData.x_oss_forbid_overwrite);
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('file', fs.createReadStream(filePath), fileName);

  console.log('[转写] 上传文件到百炼临时存储:', fileName);
  const resp = await axios.post(policyData.upload_host, form, {
    headers: form.getHeaders(),
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (resp.status !== 200) {
    throw new Error(`文件上传失败，HTTP ${resp.status}`);
  }

  return `oss://${key}`;
}

/**
 * 步骤3：提交 Fun-ASR 转录任务，返回 task_id
 */
async function submitTranscribeTask(ossUrl) {
  console.log('[转写] 提交 Fun-ASR 任务, URL:', ossUrl);
  const resp = await axios.post(
    TRANSCRIBE_SUBMIT_URL,
    {
      model: 'fun-asr',
      input: { file_urls: [ossUrl] },
      parameters: {
        language_hints: ['zh'],
        diarization_enabled: true  // 开启说话人分离
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable'  // 允许访问 oss:// 临时存储
      },
      timeout: 30000
    }
  );

  const taskId = resp.data && resp.data.output && resp.data.output.task_id;
  if (!taskId) {
    throw new Error(`提交任务失败: ${JSON.stringify(resp.data)}`);
  }
  console.log('[转写] 任务已提交, task_id:', taskId);
  return taskId;
}

/**
 * 步骤4：轮询任务状态，最多等待 15 分钟
 */
async function waitForResult(taskId) {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));

    const resp = await axios.get(`${TASK_QUERY_BASE}${taskId}`, {
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const output = resp.data && resp.data.output;
    if (!output) continue;

    const status = output.task_status;
    console.log('[转写] 任务状态:', status);

    if (status === 'SUCCEEDED') {
      const results = output.results || [];
      if (!results.length || results[0].subtask_status !== 'SUCCEEDED') {
        throw new Error(`子任务失败: ${JSON.stringify(results[0])}`);
      }
      return results[0].transcription_url;
    }

    if (status === 'FAILED') {
      throw new Error(`转写任务失败: ${JSON.stringify(output)}`);
    }
    // PENDING / RUNNING 继续等待
  }
  throw new Error('转写超时（超过15分钟）');
}

/**
 * 步骤5：下载转录结果 JSON，提取带说话人标记的文本
 */
async function downloadAndParseResult(transcriptionUrl) {
  console.log('[转写] 下载识别结果:', transcriptionUrl);
  const resp = await axios.get(transcriptionUrl, { timeout: 30000 });
  const data = resp.data;

  const transcripts = data.transcripts || [];
  if (!transcripts.length) return '（未识别到文本）';

  // 合并所有 channel 的 sentences，按 begin_time 排序后输出
  const sentences = [];
  for (const transcript of transcripts) {
    for (const sentence of (transcript.sentences || [])) {
      sentences.push(sentence);
    }
  }
  sentences.sort((a, b) => a.begin_time - b.begin_time);

  if (!sentences.length) {
    // 无句子级结果，直接返回全文
    return transcripts.map(t => t.text).join('\n') || '（未识别到文本）';
  }

  // 按说话人分组，连续同一说话人的句子合并
  const lines = [];
  let lastSpk = null;
  let buf = '';

  for (const s of sentences) {
    const spkId = s.speaker_id !== undefined && s.speaker_id !== null
      ? `说话人${s.speaker_id + 1}`
      : '说话人1';

    if (spkId !== lastSpk) {
      if (buf.trim()) lines.push(`${lastSpk}：${buf.trim()}`);
      buf = s.text || '';
      lastSpk = spkId;
    } else {
      buf += s.text || '';
    }
  }
  if (buf.trim()) lines.push(`${lastSpk}：${buf.trim()}`);

  return lines.join('\n') || '（未识别到文本）';
}

/**
 * 主入口：完整转录流程
 */
async function transcribeAudio(filePath) {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('缺少阿里云配置，请在 .env 中设置 DASHSCOPE_API_KEY');
  }

  // 1. 获取上传凭证
  const policy = await getUploadPolicy();

  // 2. 上传文件
  const ossUrl = await uploadFileToOss(policy, filePath);

  // 3. 提交转录任务
  const taskId = await submitTranscribeTask(ossUrl);

  // 4. 等待结果
  const transcriptionUrl = await waitForResult(taskId);

  // 5. 解析结果
  const text = await downloadAndParseResult(transcriptionUrl);
  console.log('[转写] 完成，前200字:', text.substring(0, 200));

  return { text };
}

module.exports = { transcribeAudio };
