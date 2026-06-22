const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const transcribeService = require('../services/transcribeService');
const sparkService = require('../services/sparkService');
const documentService = require('../services/documentService');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ── 接口1：上传录音 → 返回转写文本（带说话人标记）
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传录音文件' });
    const text = await transcribeService.transcribeAudio(req.file.path);
    res.json({ success: true, transcribeText: text.text || text });
  } catch (error) {
    console.error('transcribe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── 接口2：分析文本 → 返回会议内容、各方观点（不生成文档）
// body: { text, speakerMap }
router.post('/analyze', async (req, res) => {
  try {
    const { text, speakerMap } = req.body;
    if (!text) return res.status(400).json({ error: '请提供转写文本' });
    const analysisResult = await sparkService.analyzeMeetingText(text, speakerMap || '');
    res.json({
      success: true,
      meetingContent: analysisResult.meetingContent,
      meetingRecords: analysisResult.meetingRecords,
      speakerViews: analysisResult.speakerViews || null,
      actionItems: analysisResult.actionItems || [],
    });
  } catch (error) {
    console.error('analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── 接口3：生成文档 → 返回下载路径
// body: { meetingContent, meetingRecords, speakerViews, actionItems, basicInfo }
router.post('/generate', async (req, res) => {
  try {
    const { meetingContent, meetingRecords, speakerViews, actionItems = [], basicInfo = {} } = req.body;
    if (!meetingContent) return res.status(400).json({ error: '缺少会议内容数据' });

    const outputPath = path.join(__dirname, '../output', `会议纪要_${Date.now()}.docx`);
    await documentService.generateDocument(
      { meetingContent, meetingRecords, speakerViews, actionItems },
      outputPath,
      basicInfo
    );
    res.json({ success: true, documentPath: outputPath });
  } catch (error) {
    console.error('generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── 下载文档
router.get('/download', (req, res) => {
  const { filePath } = req.query;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  res.download(filePath, path.basename(filePath));
});

module.exports = router;
