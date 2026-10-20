/* 用户报词：catatonic / catatonia（cata + tonos(张力) + -ic/-ia）
   结构本来就对，但 ton 的释义在词根表里是"声音、调"，用于本词是错的 → 逐词给正确释义。
   只对这些词生效，不动全局 ton 词根（tone/tonic 仍是"声音、调"正确）。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const raw = fs.readFileSync(DIR + '/index.html', 'utf8');
const NL = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const TON = ['ton', '张力、紧张（希腊 tonos 拉紧；muscle tone 肌张力）'];
const CATA = 'cata';
const ADD = [
  ['catatonic', { prefix: CATA, roots: [TON], suffixes: [['ic', '形容词后缀，…的']] }],
  ['catatonically', { prefix: CATA, roots: [TON], suffixes: [['ic', '形容词后缀'], ['al', '形容词后缀'], ['ly', '副词后缀']] }],
  ['catatonia', { prefix: CATA, roots: [TON], suffixes: [['ia', '名词后缀，表病症、状态']] }],
  ['catatonias', { prefix: CATA, roots: [TON], suffixes: [['ia', '名词后缀'], ['s', '复数']] }],
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
