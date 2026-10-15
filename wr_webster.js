/* Webster 口径复测：把 webster_defs.txt 释义正文里的词逐个过引擎，
   统计 完整拆解 / 仅部分拆解 / 完全拆不出（= "释义正文可疑" 的口径）。只读，不写任何数据。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const raw = fs.readFileSync(DIR + '/index.html', 'utf8');
const SHIM = "var LANG='zh';function EN_MODE(){return false;}function gl(m,zh){return zh||'';}\n";
const L = raw.split('\n');
const cs = L.findIndex(l => l.includes('<script id="core">')) + 1;
const ce = L.findIndex((l, i) => l.trim() === '</script>' && i > cs);
const core = SHIM + L.slice(cs, ce).map(x => x.replace(/\r$/, '')).join('\n');
const g = n => { try { return JSON.parse(fs.readFileSync(DIR + '/' + n, 'utf8')); } catch (e) { return {}; } };
const D = { en: g('enhanced.json'), ox: g('oxford.json'), ec: g('ecdict.json') };
eval(core + '\n' + [
  'Object.assign(ENHANCED, ' + JSON.stringify(D.en) + ');',
  'Object.assign(OXFORD, ' + JSON.stringify(D.ox) + ');',
  'Object.assign(ECDICT, ' + JSON.stringify(D.ec) + ');',
  'globalThis.__A = { d: decompose, pd: (typeof partialDecompose === "function" ? partialDecompose : null) };',
].join('\n'));
const A = globalThis.__A;

let defs = '';
try { defs = fs.readFileSync(DIR + '/webster_defs.txt', 'utf8'); } catch (e) { console.log('✗ 读不到 webster_defs.txt'); process.exit(1); }
let words = [];
try { words = fs.readFileSync(DIR + '/webster_words.txt', 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean); } catch (e) { }

/* ❶ 释义正文里的所有词（去重） */
const tokens = new Set();
for (const t of defs.toLowerCase().match(/[a-z]{3,}/g) || []) tokens.add(t);
const list = [...tokens].sort();
let full = 0, partOnly = 0, none = 0;
const noneList = [];
for (const w of list) {
  let d = null; try { d = A.d(w); } catch (e) { d = null; }
  if (d) { full++; continue; }
  let p = null; try { p = A.pd ? A.pd(w) : null; } catch (e) { p = null; }
  if (p) { partOnly++; } else { none++; noneList.push(w); }
}
console.log('=== Webster 口径复测（释义正文）===');
console.log('webster_defs.txt 字符数: ' + defs.length + '；正文不同词数: ' + list.length);
console.log('  完整拆解   : ' + full);
console.log('  仅部分拆解 : ' + partOnly);
console.log('  **完全拆不出** : ' + none + '   （10-13 口径："释义正文可疑 5345"）');
console.log('完全拆不出 样例: ' + noneList.slice(0, 30).join(' '));

/* ❷ 词条表口径 */
if (words.length) {
  let f2 = 0, p2 = 0, n2 = 0; const n2list = [];
  for (const w of words) {
    if (!/^[a-z]{3,}$/.test(w)) continue;
    let d = null; try { d = A.d(w); } catch (e) { d = null; }
    if (d) { f2++; continue; }
    let p = null; try { p = A.pd ? A.pd(w) : null; } catch (e) { p = null; }
    if (p) p2++; else { n2++; n2list.push(w); }
  }
  console.log('=== 词条表口径（webster_words.txt，' + words.length + ' 词）===');
  console.log('  完整拆解 ' + f2 + ' | 仅部分 ' + p2 + ' | **完全拆不出** ' + n2 + '   （10-13 口径："词条表可疑 627"）');
  console.log('词条表拆不出 样例: ' + n2list.slice(0, 30).join(' '));
}
