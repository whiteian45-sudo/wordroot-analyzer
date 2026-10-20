/* 用户报词：contraindication 一族（contra + indic + -ation/-ate）
   引擎把 indic 误读成 ind(靛蓝) + ic，或把 cat 误读成 cata(向下) → 用逐词切分表纠正。
   只对这些词生效，不影响任何其他词。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const raw = fs.readFileSync(DIR + '/index.html', 'utf8');
const NL = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const IND = ['indic', '指出、指示（拉丁 indicare ← dicere 说）'];
const ADD = [
  ['contraindicate', { prefix: 'contra', roots: [IND], suffixes: [['ate', '动词后缀，使…']] }],
  ['contraindicated', { prefix: 'contra', roots: [IND], suffixes: [['at', '动词词干'], ['ed', '过去分词/形容词后缀']] }],
  ['contraindicates', { prefix: 'contra', roots: [IND], suffixes: [['ate', '动词后缀'], ['s', '第三人称单数']] }],
  ['contraindicating', { prefix: 'contra', roots: [IND], suffixes: [['at', '动词词干'], ['ing', '现在分词后缀']] }],
  ['contraindication', { prefix: 'contra', roots: [IND], suffixes: [['ation', '名词后缀，表行为、状态']] }],
  ['contraindications', { prefix: 'contra', roots: [IND], suffixes: [['ation', '名词后缀'], ['s', '复数']] }],
  ['contraindicative', { prefix: 'contra', roots: [IND], suffixes: [['at', '动词词干'], ['ive', '形容词后缀，…的']] }],
];
const anchor = 'const WORD_SPLIT = {';
if (raw.indexOf(anchor) < 0) { console.log('✗ 找不到 WORD_SPLIT'); process.exit(1); }
let txt = raw; const added = [];
for (const [w, rec] of ADD) {
  if (txt.indexOf('"' + w + '":') >= 0) { console.log('跳过（已存在）: ' + w); continue; }
  txt = txt.replace(anchor, anchor + NL + '  ' + JSON.stringify(w) + ': ' + JSON.stringify(rec) + ',');
  added.push(w);
}
if (!added.length) { console.log('无需改动'); process.exit(0); }
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已加入 WORD_SPLIT: ' + added.join(', '));
