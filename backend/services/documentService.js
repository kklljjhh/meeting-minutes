const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType, BorderStyle, ShadingType,
  VerticalAlign, PageOrientation, convertInchesToTwip
} = require('docx');
const fs = require('fs');
const path = require('path');

// ===== 样式常量（严格对齐 demo）=====
const FONT_BOLD  = '思源黑体 CN Bold';
const FONT_REG   = '思源黑体 CN Regular';
const COLOR_TEXT = '404040';
const FILL_GREEN = 'BADDB2';
const FILL_GRAY  = 'F9FAFB';
const FILL_WHITE = 'FFFFFF';

// 外层大表 4 列（twip）
const OUTER_COL_WIDTHS = [1216, 5336, 1199, 1996];
const OUTER_FULL = OUTER_COL_WIDTHS.reduce((a, b) => a + b, 0); // 9747

// 内嵌后续行动项表格 4 列（twip）
const INNER_COL_WIDTHS = [875, 3544, 2692, 2400];

// ===== 边框 =====
const NO_BORDER = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const DOTTED_INNER = {
  top:    { style: BorderStyle.DOTTED, size: 4, color: 'auto' },
  bottom: { style: BorderStyle.DOTTED, size: 4, color: 'auto' },
  left:   { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
  right:  { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
};

const SECTION_BORDER = {
  top:    { style: BorderStyle.DOUBLE, size: 4, color: 'auto' },
  bottom: { style: BorderStyle.DOTTED, size: 4, color: 'auto' },
  left:   { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
  right:  { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
};

const SECTION_BORDER_LAST = {
  top:    { style: BorderStyle.DOUBLE, size: 4, color: 'auto' },
  bottom: { style: BorderStyle.DOUBLE, size: 4, color: 'auto' },
  left:   { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
  right:  { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
};

const CONTENT_BORDER = {
  top:    { style: BorderStyle.DOTTED, size: 4, color: 'auto' },
  bottom: { style: BorderStyle.DOUBLE, size: 4, color: 'auto' },
  left:   { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
  right:  { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
};

const INNER_CELL_BORDER = {
  top:    { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
  left:   { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
  right:  { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
};

// ===== 辅助函数 =====
function run(text, { bold = false, size = 24, color = COLOR_TEXT, font } = {}) {
  return new TextRun({
    text: String(text || ''),
    bold,
    size,
    color,
    font: font || (bold ? FONT_BOLD : FONT_REG),
  });
}

function para(children, { align = AlignmentType.LEFT, spaceBefore = 0, spaceAfter = 0, indent } = {}) {
  return new Paragraph({
    alignment: align,
    spacing: { before: spaceBefore, after: spaceAfter },
    indent,
    children: Array.isArray(children) ? children : [children],
  });
}

function cell(paragraphs, {
  colspan = 1,
  fill = null,
  borders = DOTTED_INNER,
  vAlign = VerticalAlign.CENTER,
} = {}) {
  return new TableCell({
    children: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
    columnSpan: colspan,
    shading: fill ? { type: ShadingType.SOLID, color: fill } : undefined,
    borders,
    verticalAlign: vAlign,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

// 绿色节标题行（跨4列）
function sectionRow(text, borders = SECTION_BORDER) {
  return new TableRow({
    height: { value: 624, rule: 'atLeast' },
    children: [cell(
      para(run(text, { bold: true, size: 28, font: FONT_BOLD }), { align: AlignmentType.CENTER }),
      { colspan: 4, fill: FILL_GREEN, borders }
    )]
  });
}

// 标签+值 行（4列）
function infoRow(col1Label, col1Val, col2Label, col2Val) {
  return new TableRow({
    height: { value: 397, rule: 'atLeast' },
    children: [
      cell(para(run(col1Label, { size: 24 })), { colspan: 1, borders: DOTTED_INNER }),
      cell(para(run(col1Val || '', { size: 24 })), { colspan: 1, borders: DOTTED_INNER }),
      cell(para(run(col2Label, { size: 24 })), { colspan: 1, borders: DOTTED_INNER }),
      cell(para(run(col2Val || '', { size: 24 })), { colspan: 1, borders: DOTTED_INNER }),
    ]
  });
}

// 构建后续行动项内嵌表格
function buildActionTable(actionItems) {
  const headerRow = new TableRow({
    height: { value: 696, rule: 'atLeast' },
    children: [
      cell(para(run('序号', { bold: true, size: 28 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run('行动项内容', { bold: true, size: 28 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run('负责人', { bold: true, size: 28 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run('截止时间', { bold: true, size: 28 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: INNER_CELL_BORDER }),
    ]
  });

  const dataRows = actionItems.length > 0 ? actionItems.map((item, i) => new TableRow({
    height: { value: 976, rule: 'atLeast' },
    children: [
      cell(para(run(String(i + 1), { size: 21 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run(item.content || '', { size: 21 })), { colspan: 1, borders: INNER_CELL_BORDER, vAlign: VerticalAlign.TOP }),
      cell(para(run(item.owner || '', { size: 21 })), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run(item.deadline || '', { size: 21 })), { colspan: 1, borders: INNER_CELL_BORDER }),
    ]
  })) : [new TableRow({
    height: { value: 976, rule: 'atLeast' },
    children: [
      cell(para(run('1', { size: 21 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run('/', { size: 21 })), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run('/', { size: 21 })), { colspan: 1, borders: INNER_CELL_BORDER }),
      cell(para(run('/', { size: 21 })), { colspan: 1, borders: INNER_CELL_BORDER }),
    ]
  })];

  return new Table({
    width: { size: OUTER_COL_WIDTHS[1] + OUTER_COL_WIDTHS[2] + OUTER_COL_WIDTHS[3] + OUTER_COL_WIDTHS[0], type: WidthType.DXA },
    columnWidths: INNER_COL_WIDTHS,
    rows: [headerRow, ...dataRows],
  });
}

async function generateDocument(meetingData, outputPath, basicInfo = {}) {
  const { meetingContent = {}, meetingRecords = {}, speakerViews, actionItems = [] } = meetingData;
  const blocks = meetingRecords.blocks || [];

  const {
    meetingName    = '会议纪要',
    convener       = '',
    date           = new Date().toLocaleDateString('zh-CN'),
    startTime      = '',
    location       = '',
    duration       = '',
    recorder       = '',
    reviewer       = '',
    attendees      = '',
    distributeList = '',
    ccList         = '',
  } = basicInfo;

  const rows = [];

  // ── Row1：文档标题（白底无边框）
  rows.push(new TableRow({
    height: { value: 624, rule: 'atLeast' },
    children: [cell(
      para(run(meetingName, { bold: true, size: 28 }), { align: AlignmentType.CENTER }),
      { colspan: 4, fill: FILL_WHITE, borders: NO_BORDER }
    )]
  }));

  // ── Row2：空白间隔行
  rows.push(new TableRow({
    height: { value: 579, rule: 'atLeast' },
    children: [cell(
      para(run('')),
      { colspan: 4, fill: FILL_WHITE, borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.DOUBLE, size: 4, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      }}
    )]
  }));

  // ── Row3：基本信息（绿色节标题）
  rows.push(sectionRow('基本信息'));

  // ── Row4-8：基本信息字段
  rows.push(infoRow('会议名称', meetingName, '召集人员', convener));
  rows.push(infoRow('会议日期', date, '开始时间', startTime));
  rows.push(infoRow('会议地点', location, '持续时间', duration));
  rows.push(infoRow('记录人员', recorder, '审核人员', reviewer));

  // 参加人员（列1 + 跨3列）
  rows.push(new TableRow({
    height: { value: 397, rule: 'atLeast' },
    children: [
      cell(para(run('参加人员', { size: 24 })), { colspan: 1, borders: DOTTED_INNER }),
      cell(para(run(attendees, { size: 24 })), { colspan: 3, borders: {
        top: { style: BorderStyle.DOTTED, size: 4, color: 'auto' },
        bottom: { style: BorderStyle.DOUBLE, size: 4, color: 'auto' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'auto' },
        right: { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
      }}),
    ]
  }));

  // ── Row9：会议内容（绿色）
  rows.push(sectionRow('会议内容'));

  // ── Row10：会议内容正文
  rows.push(new TableRow({
    height: { value: 976, rule: 'atLeast' },
    children: [cell(
      para(run(meetingContent.purpose || '/', { size: 24 })),
      { colspan: 4, borders: DOTTED_INNER, vAlign: VerticalAlign.TOP }
    )]
  }));

  // ── Row11：发放材料（绿色）
  rows.push(sectionRow('发放材料'));

  // 发放材料表头
  rows.push(new TableRow({
    height: { value: 397, rule: 'atLeast' },
    children: [
      cell(para(run('序号', { bold: true, size: 24 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: DOTTED_INNER }),
      cell(para(run('描述', { bold: true, size: 24 }), { align: AlignmentType.CENTER }), { colspan: 3, borders: DOTTED_INNER }),
    ]
  }));

  // 发放材料内容（暂无则填无）
  rows.push(new TableRow({
    height: { value: 397, rule: 'atLeast' },
    children: [
      cell(para(run('1', { size: 24 }), { align: AlignmentType.CENTER }), { colspan: 1, borders: DOTTED_INNER }),
      cell(para(run('无', { size: 24 })), { colspan: 3, borders: DOTTED_INNER }),
    ]
  }));

  // ── Row：会议记录（绿色）
  rows.push(sectionRow('会议记录'));

  // ── 会议记录正文 + 嵌套后续行动项表格
  const recordParas = [];

  // 各模块内容
  blocks.forEach((block, i) => {
    recordParas.push(para(run(`${i + 1}. ${block.title || ''}`, { bold: true, size: 32, font: FONT_BOLD })));
    const lines = (block.content || '').split(/[。！？]/).filter(s => s.trim());
    lines.forEach((line, li) => {
      const suffix = li < lines.length - 1 ? '。' : '';
      recordParas.push(para(
        run(line + suffix, { size: 24 }),
        { indent: { left: 440 }, spaceBefore: li === 0 ? 80 : 0 }
      ));
    });
    recordParas.push(para(run('')));
  });

  // 后续行动项标题
  recordParas.push(para(run('后续行动项', { bold: true, size: 28 })));

  // 嵌套行动项表格
  recordParas.push(buildActionTable(actionItems));

  rows.push(new TableRow({
    height: { value: 1550, rule: 'atLeast' },
    children: [cell(recordParas, {
      colspan: 4,
      borders: CONTENT_BORDER,
      vAlign: VerticalAlign.TOP,
      fill: FILL_GRAY
    })]
  }));

  // ── 会议纪要发放/抄送范围（绿色）
  rows.push(sectionRow('会议纪要发放/抄送范围'));

  rows.push(new TableRow({
    height: { value: 714, rule: 'atLeast' },
    children: [cell([
      para(run(`主送：${distributeList || attendees || '/'}`, { size: 24 })),
      para(run(`抄送：${ccList || '/'}`, { size: 24 })),
    ], { colspan: 4, borders: DOTTED_INNER })]
  }));

  // ── 与会人员签字（绿色）
  rows.push(sectionRow('与会人员签字', SECTION_BORDER_LAST));

  rows.push(new TableRow({
    height: { value: 1550, rule: 'atLeast' },
    children: [cell(
      para(run('')),
      { colspan: 4, borders: {
        top: { style: BorderStyle.DOTTED, size: 4, color: 'auto' },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
        left: { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
        right: { style: BorderStyle.SINGLE, size: 8, color: 'auto' },
      }}
    )]
  }));

  // ===== 构建文档（横向 A4）=====
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: {
            orientation: PageOrientation.LANDSCAPE,
            width: convertInchesToTwip(11.69),
            height: convertInchesToTwip(8.27),
          },
          margin: {
            top: 1276,
            bottom: 1440,
            left: 1080,
            right: 1080,
          },
        }
      },
      children: [
        new Table({
          width: { size: 5000, type: WidthType.PCT },
          columnWidths: OUTER_COL_WIDTHS,
          rows,
        })
      ]
    }]
  });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = { generateDocument };
