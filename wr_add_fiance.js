/* 补法语借词 fiancé / fiancée（含 ASCII 变体）：整词读法 + 词源，进 WHOLE_ONLY。
   这类词在英语里没有可拆词根，硬拆会造假词源 → 用整词读法最诚实。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const raw = fs.readFileSync(DIR + '/index.html', 'utf8');
const NL = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const ADD = [
  ['fiancé', '未婚夫（法语借词：fiancer 许诺 ← fiance 承诺；-é 阳性过去分词）'],
  ['fiancée', '未婚妻（法语借词：fiancer 许诺 ← fiance 承诺；-ée 阴性）'],
  ['fiance', '未婚夫（fiancé 的 ASCII 拼法；法语 fiance 承诺）'],
  ['fiancee', '未婚妻（fiancée 的 ASCII 拼法；法语 fiance 承诺 + -ée 阴性）'],
];
const anchor = 'const WHOLE_ONLY = {';
if (raw.indexOf(anchor) < 0) { console.log('✗ 找不到 WHOLE_ONLY 表'); process.exit(1); }
let txt = raw;
const added = [];
for (const [w, gl] of ADD) {
  if (txt.indexOf('"' + w + '":') >= 0) { console.log('跳过（已存在）: ' + w); continue; }
  txt = txt.replace(anchor, anchor + NL + '  ' + JSON.stringify(w) + ': ' + JSON.stringify(gl) + ',');
  added.push(w);
}
if (!added.length) { console.log('无需改动'); process.exit(0); }
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已加入 WHOLE_ONLY: ' + added.join(', '));
