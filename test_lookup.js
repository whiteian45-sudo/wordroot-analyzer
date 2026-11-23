/* 查词辅助回归（常驻测试，勿删）
   用法：node test_lookup.js

   覆盖：
   1) suggestWord 的同音/首位换位召回（fobia→phobia 等）
   2) BNC 词频排序（pag→page 这类距离相同的近邻）
   3) lemmaOf 的词形还原（biggest→big、happiness→happy 等）
   4) 边界：词典里查得到的词，analyze 不会走词形还原（modest 不能变成 mod）

   加载真实 enhanced.json / oxford.json / bnc.json。典型耗时 2~4 秒。
*/
const fs = require('fs');
const DIR = __dirname;

const UI_SHIM = "var LANG='zh';" +
  "var POS_OF={};\n" +
  "function EN_MODE(){return false;}" +
  "function gl(m,zh){return zh||'';}" +
  "function langEn(s){return s;}\n";

function loadCore(content) {
  const lines = content.split('\n');
  const start = lines.findIndex(l => l.includes('<script id="core">')) + 1;
  const end = lines.findIndex((l, i) => l.trim() === '</script>' && i > start);
  if (start <= 0 || end < 0) throw new Error('index.html 里找不到 core 脚本块');
  return UI_SHIM + lines.slice(start, end).join('\n');
}

const core = loadCore(fs.readFileSync(DIR + '/index.html', 'utf8'));
const __ENH = JSON.parse(fs.readFileSync(DIR + '/enhanced.json', 'utf8'));
const __OXF = JSON.parse(fs.readFileSync(DIR + '/oxford.json', 'utf8'));
const __BNC = JSON.parse(fs.readFileSync(DIR + '/bnc.json', 'utf8'));

/* 期望值。带 BNC 的用例是按当前 bnc.json 实测锁定的；改权重或换数据时要同步审。 */
const SUGGEST = {
  fobia: 'phobia',
  sycology: 'psychology',
  nolwedge: 'knowledge',
  ereceive: 'receive',
  binery: 'binary',
  recieve: 'receive',
  definately: 'definitely',
  pag: 'page',
  fod: 'food',
  concet: 'concept'
};
const LEMMA = {
  biggest: 'big',
  happiest: 'happy',
  nice: 'nice',
  nicest: 'nice',
  carried: 'carry',
  running: 'run',
  making: 'make',
  happiness: 'happy',
  penniless: 'penny',
  beautiful: 'beauty',
  forcefully: 'forceful',
  studies: 'study',
  boxes: 'box',
  dogs: 'dog'
};
/* 边界：这些词在 enhanced.json 里查得到，analyze 必须原样返回，不能走 lemmaOf */
const BOUNDARY = ['modest', 'interest', 'honest', 'forest'];

const probe = `
Object.assign(ENHANCED, __ENH);
Object.assign(OXFORD, __OXF);
for (const lv of Object.keys(__BNC)) {
  for (const hw of Object.keys(__BNC[lv])) {
    BNC_LEVEL.set(hw, lv);
    for (const f of __BNC[lv][hw]) BNC_LEVEL.set(f, lv);
  }
}
const out = { suggest: {}, lemma: {}, analyze: {}, construct: null };
for (const w of __SUG__) out.suggest[w] = suggestWord(w);
for (const w of __LEM__) out.lemma[w] = lemmaOf(w);
for (const w of __BND__) {
  const r = analyze(w);
  out.analyze[w] = { found: !!r.found, word: r.word || '', source: r.source || '' };
}
try { out.construct = { ok: true, r: analyze('constructor') }; }
catch (e) { out.construct = { ok: false, err: String(e && e.message || e) }; }
JSON.stringify(out);
`;

const out = JSON.parse(eval(core + probe
  .replace('__SUG__', JSON.stringify(Object.keys(SUGGEST)))
  .replace('__LEM__', JSON.stringify(Object.keys(LEMMA)))
  .replace('__BND__', JSON.stringify(BOUNDARY))));

let fail = 0;
function check(label, got, want) {
  if (got === want) return;
  fail++;
  console.log('  ✗ ' + label + ' 期望 ' + JSON.stringify(want) + ' 实得 ' + JSON.stringify(got));
}

console.log('== 拼写纠错 suggestWord ==');
for (const [w, want] of Object.entries(SUGGEST)) check(w, out.suggest[w], want);
if (!fail) console.log('  ✓ ' + Object.keys(SUGGEST).length + ' 例全部通过');

let fail2 = 0;
function checkLemma(label, got, want) {
  if (got === want) return;
  fail2++;
  console.log('  ✗ ' + label + ' 期望 ' + JSON.stringify(want) + ' 实得 ' + JSON.stringify(got));
}
console.log('== 词形还原 lemmaOf ==');
for (const [w, want] of Object.entries(LEMMA)) checkLemma(w, out.lemma[w], want);
if (!fail2) console.log('  ✓ ' + Object.keys(LEMMA).length + ' 例全部通过');

let fail3 = 0;
console.log('== 边界：查得到的词不走还原 ==');
for (const w of BOUNDARY) {
  const r = out.analyze[w];
  if (!r.found || r.word !== w) {
    fail3++;
    console.log('  ✗ ' + w + ' 被还原/漏查：' + JSON.stringify(r));
  }
}
if (!out.construct.ok) {
  fail3++;
  console.log('  ✗ analyze("constructor") 抛错: ' + out.construct.err);
}
if (!fail3) console.log('  ✓ ' + BOUNDARY.length + ' 个词典词原样返回；constructor 不崩');

console.log('== 提示 ==');
console.log('  已知伪还原（modest→mod 等）只对词典外的词生效；边界用例已保证词典内词不受影响。');

if (fail + fail2 + fail3 > 0) {
  console.log('✗ 查词辅助回归失败（' + (fail + fail2 + fail3) + ' 项）');
  process.exitCode = 1;
} else {
  console.log('✓ 查词辅助回归全部通过');
}
