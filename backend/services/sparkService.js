const axios = require('axios');
const config = require('../config');

// XF_SPARK_PASSWORD 格式：APIKey:APISecret
const [sparkApiKey, sparkApiSecret] = (config.xfSparkPassword || '').split(':');
const SPARK_URL = config.xfSparkUrl || 'https://spark-api-open.xf-yun.com/v1/chat/completions';

// 调用星火 HTTP 接口（兼容 OpenAI 格式）
async function callSpark(prompt) {
  if (!sparkApiKey || !sparkApiSecret) {
    throw new Error('缺少讯飞Spark配置，请检查 .env 中的 XF_SPARK_PASSWORD');
  }

  const resp = await axios.post(
    SPARK_URL,
    {
      model: 'generalv3.5',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
      stream: false
    },
    {
      headers: {
        'Authorization': `Bearer ${sparkApiKey}:${sparkApiSecret}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  const content = resp.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Spark 返回异常: ${JSON.stringify(resp.data)}`);
  }
  console.log('[Spark] 返回长度:', content.length, '前100字:', content.substring(0, 100));
  return content;
}

// 从 Spark 返回中提取 JSON
function extractJson(content) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    try {
      const fixed = match[0].replace(/,\s*$/, '') + '}}';
      return JSON.parse(fixed);
    } catch (_) {
      console.error('[Spark] JSON解析失败:', e.message);
      return null;
    }
  }
}

async function analyzeMeetingText(text, speakerMap) {
  const MAX_LEN = 3000;
  const truncatedText = text.length > MAX_LEN
    ? text.substring(0, MAX_LEN) + '\n（文本较长，已截取前段）'
    : text;

  const speakerMapStr = speakerMap && speakerMap.trim() ? speakerMap.trim() : '';
  const hasSpeakers = /说话人\d+[：:]/.test(text) || !!speakerMapStr;

  // 解析说话人映射为对象，如 {1: "张三", 2: "李四"}
  const nameMap = {};
  if (speakerMapStr) {
    speakerMapStr.split(/[,，]/).forEach(part => {
      const m = part.trim().match(/说话人(\d+)\s*[=＝]\s*(.+)/);
      if (m) nameMap[m[1]] = m[2].trim();
    });
  }

  // 把文本中的"说话人N："直接替换为真实姓名，让大模型直接看到真名
  function applyNameMap(str) {
    if (!Object.keys(nameMap).length) return str;
    return str.replace(/说话人(\d+)/g, (_, n) => nameMap[n] || `说话人${n}`);
  }

  const resolvedText = applyNameMap(truncatedText);

  const prompt1 = `你是企业会议纪要助手，请分析以下企业内部工作会议的文本，输出JSON。
注意：这是真实的企业工作会议记录，内容仅供内部分析使用。
${speakerMapStr ? `\n说话人映射：${speakerMapStr}\n` : ''}
会议文本：
${resolvedText}

严格按如下JSON格式输出，字段内容必须来自会议文本，禁止使用示例文字：
{
  "purpose": "根据会议文本总结的会议目的，至少3句话，包含背景、目标、计划",
  "problems": ["从会议文本提取的第一个待解决问题", "第二个待解决问题"],
  "plans": ["从会议文本提取的第一条行动计划或决策", "第二条行动计划"],
  "speakers": [
    {"name": "说话人编号或真实姓名", "points": ["该说话人提出的第一个观点", "第二个观点"]}
  ]
}

严格要求：
- 所有字段内容必须根据上方会议文本生成，禁止复制JSON格式说明中的文字
- purpose至少3句话，概括会议核心内容
- problems列出会议中提到的真实问题，至少2条
- plans列出会议中讨论的真实计划或决策，至少2条
- speakers列出所有出现的说话人，每人2-4条真实观点
- 若有说话人映射，用真实姓名替换说话人编号
- 只输出JSON，不要任何其他文字`;

  const prompt2 = `你是企业会议纪要助手，请根据以下企业内部工作会议文本，生成详细的会议记录分块，输出JSON。
注意：这是真实的企业工作会议记录，内容仅供内部分析使用。
${speakerMapStr ? `\n说话人映射（请用真实姓名替换说话人编号）：${speakerMapStr}\n` : ''}
会议文本：
${resolvedText}

输出格式：
{
  "blocks": [
    {
      "title": "模块标题（如：平台定位讨论、内容运营策略、人员配置方案等）",
      "content": "详细内容（6-10句话，完整还原讨论要点、方案细节、决策结论，保留具体数字、时间、措施，若有说话人映射则用真实姓名）"
    }
  ]
}

要求：
- 划分3-5个模块，每个模块聚焦一个主题
- 每个模块内容6-10句话，必须详细
- 保留具体的数字、时间节点、人名、措施
- 若有说话人映射，所有说话人编号替换为真实姓名
- 严禁编造、假设、推测任何内容，只写会议文本中明确出现的内容
- 若某模块在文本中无对应内容，不得输出该模块
- 只输出JSON，不要其他文字`;

  const prompt3 = `你是企业会议纪要助手，请从以下企业内部工作会议文本中，提取所有明确的后续行动项，输出JSON。
注意：这是真实的企业工作会议记录，内容仅供内部分析使用。
${speakerMapStr ? `\n说话人映射（请用真实姓名替换说话人编号）：${speakerMapStr}\n` : ''}
会议文本：
${resolvedText}

输出格式：
{
  "actions": [
    {
      "content": "具体任务内容",
      "owner": "负责人真实姓名（根据说话人映射替换，若无映射则用说话人编号）",
      "deadline": "截止时间（如有提及，格式如2026-07-01；若未提及则留空）"
    }
  ]
}

要求：
- 提取会议中所有任务、待办事项、决策、分工安排，尽量多提取，不要遗漏
- content字段必须填写，描述具体任务内容
- 若能从文本判断负责人，owner填写真实姓名（有说话人映射则替换），否则留空字符串
- 若文本中提到截止时间，deadline填写（格式如2026-07-01），否则留空字符串
- 严禁编造负责人或截止时间，没有就留空
- 只输出JSON，不要其他文字`;

  console.log('[Spark] 开始第一次请求（概要）...');
  let content1 = await callSpark(prompt1);
  // 若被安全过滤（返回非JSON提示），用简化prompt重试一次
  if (!content1.includes('{')) {
    console.log('[Spark] 第一次请求被过滤，使用简化prompt重试...');
    const prompt1Retry = `请将下面的工作会议记录整理成JSON，只输出JSON：\n会议文本：${resolvedText.substring(0,1500)}\n格式：{"purpose":"会议目的","problems":["问题1"],"plans":["计划1"],"speakers":[{"name":"说话人1","points":["观点1"]}]}`;
    content1 = await callSpark(prompt1Retry);
  }
  const parsed1 = extractJson(content1);

  console.log('[Spark] 开始第二次请求（会议记录）...');
  const content2 = await callSpark(prompt2);
  const parsed2 = extractJson(content2);

  console.log('[Spark] 开始第三次请求（行动项）...');
  const content3 = await callSpark(prompt3);
  const parsed3 = extractJson(content3);

  console.log('[Spark] 第一次解析结果:', parsed1 ? '成功' : '失败');
  console.log('[Spark] 第二次解析结果:', parsed2 ? `成功 blocks=${(parsed2.blocks||[]).length}` : '失败');
  console.log('[Spark] 第三次解析结果:', parsed3 ? `成功 actions=${(parsed3.actions||[]).length}` : '失败');

  const meetingContent = {
    purpose: (parsed1 && parsed1.purpose) || '（未能提取会议目的）',
    problems: (parsed1 && parsed1.problems) || [],
    plans: (parsed1 && parsed1.plans) || [],
  };

  const speakerViews = hasSpeakers && parsed1 && parsed1.speakers && parsed1.speakers.length > 0
    ? { speakers: parsed1.speakers }
    : null;

  const meetingRecords = {
    blocks: (parsed2 && parsed2.blocks && parsed2.blocks.length > 0)
      ? parsed2.blocks
      : []
  };

  return { meetingContent, meetingRecords, speakerViews, actionItems: (parsed3 && parsed3.actions) || [] };
}

module.exports = { analyzeMeetingText };
