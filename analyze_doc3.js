const fs = require('fs');
const xml = fs.readFileSync('d:/all/651/doc_structure.xml', 'utf8');

// 提取所有表格行，分析每行的填充色和内容
const rowRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
const rows = xml.match(rowRegex) || [];

rows.forEach((row, i) => {
  const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
  const texts = cells.map(cell => {
    const t = (cell.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
    const fill = (cell.match(/w:fill="([^"]+)"/) || [])[1] || '';
    const bold = cell.includes('<w:b/>') || cell.includes('<w:b />');
    const size = (cell.match(/w:sz w:val="(\d+)"/) || [])[1] || '';
    const colspan = (cell.match(/w:gridSpan w:val="(\d+)"/) || [])[1] || '1';
    return `"${t}"[fill:${fill},bold:${bold},sz:${size},span:${colspan}]`;
  });
  console.log(`Row${i+1}: ${texts.join(' | ')}`);
});
