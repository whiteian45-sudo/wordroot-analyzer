/* 手工补词进 WORD_SPLIT（用户报的词）：ectopic / ectopia
   ectopic = ecto(外) + top(位置，希腊 topos) + -ic；ectopia = ecto + top + -ia
   只在该词内生效，不影响任何其他词。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const raw = fs.readFileSync(DIR + '/index.html', 'utf8');
const NL = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const ADD = [
  ['ectopic', { prefix: 'ecto', roots: [['top', '位置、地方（希腊 topos）']], suffixes: [['ic', '形容词后缀，…的']] }],
  ['ectopia', { prefix: 'ecto', roots: [['top', '位置、地方（希腊 topos）']], suffixes: [['ia', '名词后缀，表状态、病症']] }],
  ['ectopically', { prefix: 'ecto', roots: [['top', '位置、地方（希腊 topos）']], suffixes: [['ic', '形容词后缀，…的'], ['al', '形容词后缀，…的'], ['ly', '副词后缀']] }],
];
let txt = raw;
let added = [];
for (const [w, rec] of ADD) {
  if (txt.indexOf('"' + w + '":') >= 0) { console.log('跳过（已存在）: ' + w); continue; }
  const line = '  ' + JSON.stringify(w) + ': ' + JSON.stringify(rec) + ',';
  const anchor = 'const WORD_SPLIT = {';
  if (txt.indexOf(anchor) < 0) { console.log('✗ 找不到 WORD_SPLIT 表'); process.exit(1); }
  txt = txt.replace(anchor, anchor + NL + line);
  added.push(w);
}
if (!added.length) { console.log('无需改动'); process.exit(0); }
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已加入 WORD_SPLIT: ' + added.join(', '));
