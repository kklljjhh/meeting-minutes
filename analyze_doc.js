const fs = require('fs');
const xml = fs.readFileSync('d:/all/651/doc_structure.xml', 'utf8');

// 提取填充颜色
const colorMatches = xml.match(/w:fill="([A-F0-9a-f]+)"/g) || [];
// 提取字体
const fontMatches = xml.match(/w:ascii="([^"]+)"/g) || [];
// 提取字号
const sizeMatches = xml.match(/w:sz[^>]*val="(\d+)"/g) || [];
// 提取主题色
const themeColorMatches = xml.match(/w:themeColor="([^"]+)"/g) || [];
// 提取边框颜色
const borderColorMatches = xml.match(/w:color="([^"]+)"/g) || [];
// 提取列宽
const colWidths = xml.match(/w:w="(\d+)"/g) || [];
// 提取行高
const rowHeights = xml.match(/w:trHeight[^/]*/g) || [];

console.log('=== 填充颜色 ===');
console.log([...new Set(colorMatches)].join('\n'));
console.log('\n=== 字体 ===');
console.log([...new Set(fontMatches)].join('\n'));
console.log('\n=== 字号 ===');
console.log([...new Set(sizeMatches)].join('\n'));
console.log('\n=== 主题色 ===');
console.log([...new Set(themeColorMatches)].join('\n'));
console.log('\n=== 边框颜色 ===');
console.log([...new Set(borderColorMatches)].join('\n'));
console.log('\n=== 列宽(前20) ===');
console.log([...new Set(colWidths)].slice(0,20).join('\n'));
console.log('\n=== 行高 ===');
console.log([...new Set(rowHeights)].join('\n'));
