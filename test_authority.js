/* 权威优先级回归（常驻测试，勿删）
   用法：node test_authority.js [--limit N]

   守的规则：人工逐词表（WORD_SPLIT）与 morph.json 数据层给出的拆解，是「权威读法」，
   不得被评分重排、词性冲突接管或分层解析覆盖。2026-11-23 的重构曾让顶层词性接管
   无条件作用于早退结果，导致 289 个词的数据层读法被推翻（词族/置信度一起丢）。

   加载真实 morph.json 与 ecdict 词性，和浏览器里的条件一致。
   典型耗时：全量约 5~10 秒。
*/
const fs = require('fs');
const DIR = __dirname;
const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? (parseInt(args[i + 1], 10) || 0) : 0; })();

const UI_SHIM = "var LANG='zh';" +
  "var POS_OF={'affable':'a','compatible':'a','usable':'a','visible':'a'," +
  "'responsible':'a','creative':'a','believable':'a','nationalize':'v','interpret':'v'," +
  "'limber':'a','premonish':'v','maidenly':'a','blandish':'v','perishable':'a'};\n" +
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

let ECDICT_POS_DICT = null;
function POS_GET(w) {
  if (!ECDICT_POS_DICT) {
    try { ECDICT_POS_DICT = JSON.parse(fs.readFileSync(DIR + '/ecdict.json', 'utf8')); }
    catch (e) { ECDICT_POS_DICT = {}; }
  }
  const t = (ECDICT_POS_DICT[w] && ECDICT_POS_DICT[w].t) || '';
  if (!t) return '';
  const out = [];
  const re = /(?:^|[\n;；])\s*(n|vt|vi|v|a|adj|ad|adv)\./g;
  let m;
  while ((m = re.exec(t))) {
    let p = m[1];
    p = p === 'adj' ? 'a' : ((p === 'ad' || p === 'adv') ? 'adv' : ((p === 'vt' || p === 'vi') ? 'v' : p));
    if (/^(n|v|a|adv)$/.test(p) && out.indexOf(p) < 0) out.push(p);
  }
  return out.join('/');
}

const core = loadCore(fs.readFileSync(DIR + '/index.html', 'utf8'));
const __MORPH = JSON.parse(fs.readFileSync(DIR + '/morph.json', 'utf8'));

const probe = `
if (typeof MORPH !== 'undefined' && MORPH.words) Object.assign(MORPH.words, __MORPH.words);
function fmtBd(d) {
  if (!d) return null;
  return (d.prefix ? d.prefix.m + '|' : '') + (d.roots || []).map(r => r.m).join('+')
    + (d.suffixes || []).map(s => '-' + s.m).join('');
}
const out = {
  splitTotal: 0, splitSkipped: 0, splitBad: [],
  morphTotal: 0, morphChecked: 0, morphBad: [],
  skip: { split: 0, block: 0, whole: 0, noData: 0 }
};

/* 1) WORD_SPLIT：整词预置表必须原样输出 */
for (const w of Object.keys(WORD_SPLIT)) {
  out.splitTotal++;
  const sp = WORD_SPLIT[w];
  const selfBlocked = own(ROOT_BLOCK, w) && ROOT_BLOCK[w].indexOf(w) >= 0 && (
    own(BASEWORDS, w) || own(BASEWORDS_SHORT, w) || own(BASEWORDS_SHORT_ADJ, w) || own(WHOLE_ONLY, w));
  if (selfBlocked) { out.splitSkipped++; continue; }
  const exp = (sp.prefix ? sp.prefix + '|' : '')
    + (sp.roots || []).map(x => x[0]).join('+')
    + (sp.suffixes || []).map(x => '-' + x[0]).join('');
  const got = fmtBd(decompose(w));
  if (got !== exp) out.splitBad.push({ w, exp, got });
}

/* 2) morph 数据层：没被更高优先级规则挡住的词，读法必须来自数据层且原样保留 */
const morphWords = Object.keys(MORPH.words);
const words = __LIMIT__ > 0 ? morphWords.slice(0, __LIMIT__) : morphWords;
for (const w of words) {
  out.morphTotal++;
  if (own(WORD_SPLIT, w)) { out.skip.split++; continue; }
  if (own(ROOT_BLOCK, w)) { out.skip.block++; continue; }
  if (rootOf(w, 0, '')) { out.skip.whole++; continue; }
  const dataBd = morphDataToBd(w);
  if (!dataBd) { out.skip.noData++; continue; }
  out.morphChecked++;
  const d = decompose(w);
  const got = fmtBd(d);
  const exp = fmtBd(dataBd);
  const famOk = !(dataBd.family && dataBd.family.length)
    || JSON.stringify((d && d.family) || []) === JSON.stringify(dataBd.family);
  if (got !== exp || !(d && d.dataSource) || !famOk) {
    out.morphBad.push({
      w, exp, got,
      dataSource: !!(d && d.dataSource),
      famOk: famOk
    });
  }
}
JSON.stringify(out);
`;

const out = JSON.parse(eval(core + probe.replace('__LIMIT__', String(LIMIT))));

const MAX_SHOW = 20;
const ok = out.splitBad.length === 0 && out.morphBad.length === 0;

console.log('== 权威优先级回归 ==');
console.log('WORD_SPLIT 预置表：' + out.splitTotal + ' 词，跳过 ' + out.splitSkipped + '，被改写 ' + out.splitBad.length);
for (const b of out.splitBad.slice(0, MAX_SHOW)) {
  console.log('  ✗ ' + String(b.w).padEnd(22) + ' 期望[' + b.exp + '] 实得[' + (b.got || '∅') + ']');
}
console.log('morph 数据层：' + out.morphTotal + ' 词（检查 ' + out.morphChecked + '）'
  + '；跳过 预置表 ' + out.skip.split + ' / ROOT_BLOCK ' + out.skip.block
  + ' / 整词 ' + out.skip.whole + ' / 无数据 ' + out.skip.noData
  + '；被改写 ' + out.morphBad.length);
for (const b of out.morphBad.slice(0, MAX_SHOW)) {
  console.log('  ✗ ' + String(b.w).padEnd(22) + ' 期望[' + b.exp + '] 实得[' + (b.got || '∅') + ']'
    + (b.dataSource ? '' : ' dataSource=丢失') + (b.famOk ? '' : ' 词族=丢失'));
}
if (out.splitBad.length > MAX_SHOW || out.morphBad.length > MAX_SHOW) {
  console.log('  ……更多失败项已省略');
}

if (ok) {
  console.log('✓ 权威读法全部保留');
} else {
  console.log('✗ 权威优先级回归失败');
  process.exitCode = 1;
}
