const fs = require('fs');
const xml = fs.readFileSync('d:/all/651/doc_structure.xml', 'utf8');

// 提取所有段落文本和对应样式
const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
const paras = xml.match(paraRegex) || [];

paras.slice(0, 30).forEach((p, i) => {
  const text = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
  const bold = p.includes('w:b/>') || p.includes('w:b />');
  const size = (p.match(/w:sz w:val="(\d+)"/) || [])[1];
  const color = (p.match(/w:color w:val="([^"]+)"/) || [])[1];
  const fill = (p.match(/w:fill="([^"]+)"/) || [])[1];
  const align = (p.match(/w:jc w:val="([^"]+)"/) || [])[1];
  if (text.trim()) {
    console.log(`[${i}] "${text}" bold=${bold} size=${size} color=${color} align=${align}`);
  }
});

// 提取表格列宽结构
const tblRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
const tables = xml.match(tblRegex) || [];
console.log(`\n表格数量: ${tables.length}`);
tables.forEach((tbl, ti) => {
  const cols = tbl.match(/w:gridCol w:w="(\d+)"/g) || [];
  const rows = (tbl.match(/<w:tr[ >]/g) || []).length;
  console.log(`表${ti+1}: ${rows}行, 列宽: ${cols.join(', ')}`);
});
