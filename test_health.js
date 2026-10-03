/* 一体化体检工具（常驻，勿删）—— 2026-10-03 新建
   用法：
     node test_health.js          默认抽样体检（每 37 个词取一个，约 1 万词，十几秒）
     node test_health.js --full   全量（76 万词，慢）
     node test_health.js --quiet  只报问题
   与既有工具的分工：
     test_decompose.js --guard  拆解回归（词素表/评分改动必跑）
     test_decompose.js --diff   定向/全量对比 git HEAD
     test_health.js             表完整性 + 原型链 + 渲染冒烟 + 覆盖率 + 性能（本文件）
   退出码非 0 表示有致命问题（原型链泄漏 / 渲染 undefined / 抛异常）。
   注意：core 块里的渲染函数会调用 UI 块的 gl()/EN_MODE()，这里按测试惯例补 shim。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const SHIM = "var LANG='zh';function EN_MODE(){return false;}function gl(m,zh){return zh||'';}function langEn(s){return s;}\n";
function loadCore(c) {
  const L = c.split('\n');
  const s = L.findIndex(l => l.includes('<script id="core">')) + 1;
  const e = L.findIndex((l, i) => l.trim() === '</script>' && i > s);
  return SHIM + L.slice(s, e).join('\n');
}
const RAW = fs.readFileSync(DIR + '/index.html', 'utf8');
const core = loadCore(RAW);
const QUIET = process.argv.includes('--quiet');
const FULL = process.argv.includes('--full');
const say = (...a) => { if (!QUIET) console.log(...a); };
let fatal = 0;

/* ---------- 1. 源码级重复 key（对象字面量重复 key 会静默取后者，曾踩过 9 组） ---------- */
const loneLF = (RAW.match(/\n/g) || []).length - (RAW.match(/\r\n/g) || []).length;
if (loneLF) { fatal++; console.log('✗ index.html 行尾混用：孤立 LF ' + loneLF + ' 行（补丁脚本忘了 CRLF 转换？见 windows-file-patching-pitfalls）'); }
else say('✓ 行尾：index.html 全 CRLF（' + (RAW.match(/\r\n/g) || []).length + ' 行）');
function tableBlock(name) {
  const a = RAW.indexOf('const ' + name + ' = {');
  if (a < 0) return '';
  return RAW.slice(a, RAW.indexOf('\n};', a));
}
for (const t of ['ROOTS', 'PREFIXES', 'SUFFIXES', 'BASEWORDS']) {
  const blk = tableBlock(t), seen = {}, dup = [];
  for (const m of blk.matchAll(/^\s{2}"([A-Za-z][A-Za-z0-9]*)"\s*:/gm)) {
    if (seen[m[1]]) dup.push(m[1]);
    seen[m[1]] = 1;
  }
  if (dup.length) { fatal++; console.log('✗ [' + t + '] 源码级重复 key ' + dup.length + ' 个: ' + dup.join(' ')); }
  else say('✓ [' + t + '] 无重复 key');
}

/* ---------- 2/3/5/7/8. 一次 eval 拿全部指标 ---------- */
const probe = `
buildIndex();
var T = ['ROOTS','PREFIXES','SUFFIXES','BASEWORDS','BASEWORDS_BATCH','MORPH_SRC','MORPH_SRC_PATCH','MORPH_BASE','GRIMM',
  'MORPH_EN','CHUNK_CLS','WHOLE_ONLY','BASEWORD_OVERRIDE','ROOT_BLOCK','IN_INTO','IN_NOT','CHAIN_NOTE','SUFFIX_LORE','ASSIM',
  'ENHANCED','ECDICT','OXFORD','ETYM','STRESS','THES','EX'];
var out = { leak: [], typeErr: [], missingEn: { r: [], p: [], s: [] }, noEx: 0, noSrc: 0, chainUndef: [], smoke: null, danger: [], perf: 0 };
T.forEach(function (t) {
  var tbl = eval(t);
  if (tbl && (typeof tbl['constructor'] !== 'undefined' || typeof tbl['toString'] !== 'undefined')) out.leak.push(t);
});
out.typeErr = Object.keys(ROOTS).filter(function (k) { return !Array.isArray(ROOTS[k]) || !Array.isArray(ROOTS[k][1]); })
  .concat(Object.keys(PREFIXES).filter(function (k) { return typeof PREFIXES[k] !== 'string'; }))
  .concat(Object.keys(SUFFIXES).filter(function (k) { return typeof SUFFIXES[k] !== 'string'; }));
out.missingEn.r = Object.keys(ROOTS).filter(function (k) { return !MORPH_EN[k]; });
out.missingEn.p = Object.keys(PREFIXES).filter(function (k) { return !MORPH_EN[k]; });
out.missingEn.s = Object.keys(SUFFIXES).filter(function (k) { return !MORPH_EN[k]; });
out.noEx = Object.keys(ROOTS).filter(function (k) { return !(ROOTS[k][1] || []).length; }).length;
out.noSrc = Object.keys(ROOTS).filter(function (k) { return !(ROOTS[k][2] && ROOTS[k][2].lang); }).length;
function srcOk(tbl, name) {
  for (var k in tbl) { var v = tbl[k]; if (v && typeof v === 'object' && v.lang && !v.word) out.chainUndef.push(name + ':' + k); }
}
srcOk(MORPH_SRC, 'MORPH_SRC'); srcOk(MORPH_SRC_PATCH, 'MORPH_SRC_PATCH');
for (var k in ROOTS) { var s = ROOTS[k][2]; if (s && s.lang && !s.word) out.chainUndef.push('ROOTS:' + k); }
['constructor','constructors','valueOf','toString','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toLocaleString','__proto__','apply','length','name']
  .forEach(function (w) {
    try {
      var bd = decompose(w, 0) || partialDecompose(w);
      var h = bd ? morphBlockHTML(w, bd) : '';
      out.danger.push([w, /undefined|NaN|\\[object|native code/.test(h) ? 'BAD' : 'ok']);
    } catch (e) { out.danger.push([w, 'THROW:' + e.message]); }
  });
var W_IN = __WORDS__;
var miss = 0, part = 0, bad = [], err = [];
for (var i = 0; i < W_IN.length; i++) {
  try {
    var d = decompose(W_IN[i], 0);
    var b = d || partialDecompose(W_IN[i]);
    if (!b) { miss++; continue; }
    if (!d) part++;
    if (/undefined|NaN|\\[object/.test(morphBlockHTML(W_IN[i], b))) bad.push(W_IN[i]);
  } catch (e) { err.push(W_IN[i] + ':' + e.message); }
}
out.smoke = { n: W_IN.length, miss: miss, part: part, bad: bad.slice(0, 8), badN: bad.length, err: err.slice(0, 5), errN: err.length };
var probeWords = ['transport','delicti','contrarian','pedophilia','pineapple','sequitur','cryptography','biopsy','necropolis','photography'];
var t0 = Date.now();
for (var i2 = 0; i2 < 2000; i2++) decompose(probeWords[i2 % probeWords.length], 0);
out.perf = Date.now() - t0;
JSON.stringify(out);
`;
const dict = JSON.parse(fs.readFileSync(DIR + '/ecdict.json', 'utf8'));
const words = FULL ? Object.keys(dict).filter(w => /^[a-z]{2,}$/.test(w))
  : Object.keys(dict).filter(w => /^[a-z]{2,}$/.test(w)).filter((_, i) => i % 37 === 0);
const r = JSON.parse(eval(core + probe.split('__WORDS__').join(JSON.stringify(words))));

if (r.leak.length) { fatal++; console.log('✗ 原型链泄漏（' + r.leak.length + ' 张表）: ' + r.leak.join(' ')); }
else say('✓ 原型链硬化：' + 26 + ' 张表 TBL["constructor"] 均为 undefined');
if (r.typeErr.length) { fatal++; console.log('✗ 类型断言失败: ' + r.typeErr.slice(0, 10).join(' ')); }
else say('✓ 值类型断言：ROOTS 全数组、前后缀全字符串');

const badDanger = r.danger.filter(d => d[1] !== 'ok');
if (badDanger.length) { fatal++; console.log('✗ 危险词冒烟失败: ' + badDanger.map(d => d[0] + '=' + d[1]).join(' ')); }
else say('✓ 危险词冒烟：' + r.danger.map(d => d[0]).join(' ') + ' 全部正常');

if (r.chainUndef.length) { fatal++; console.log('✗ 来源缺 word（演变链会渲染 undefined）: ' + r.chainUndef.join(' ')); }
else say('✓ 词素来源：无「有语言无源词」的条目');

if (r.smoke.badN || r.smoke.errN) {
  fatal++;
  console.log('✗ 渲染冒烟：含 undefined/NaN ' + r.smoke.badN + ' ' + r.smoke.bad.join(' ')
    + ' | 抛异常 ' + r.smoke.errN + ' ' + r.smoke.err.join(' '));
} else say('✓ 渲染冒烟：抽样 ' + r.smoke.n + ' 词，0 个 undefined/NaN、0 异常（无拆解 ' + r.smoke.miss + '、仅 partial ' + r.smoke.part + '）');

const enMiss = r.missingEn.r.length + r.missingEn.p.length + r.missingEn.s.length;
say((enMiss ? '· ' : '✓ ') + '英文模式词素名缺失 ' + enMiss + ' 个（ROOTS ' + r.missingEn.r.length + ' / 前缀 ' + r.missingEn.p.length + ' / 后缀 ' + r.missingEn.s.length + '）'
  + (enMiss && !QUIET ? '\n    ' + r.missingEn.r.slice(0, 14).join(' ') + (r.missingEn.r.length > 14 ? ' …' : '')
    + ' | 前缀: ' + r.missingEn.p.join(' ') + ' | 后缀: ' + r.missingEn.s.join(' ') : ''));
say('· 词根表：例词为空 ' + r.noEx + ' 个 / 词源来源为空 ' + r.noSrc + ' 个');
say('· 性能：2000 次 decompose ' + r.perf + 'ms（' + (r.perf / 2000).toFixed(2) + 'ms/词）');

console.log(fatal ? '\n✗ 体检发现 ' + fatal + ' 类致命问题' : '\n✓ 体检通过（无致命问题）');
process.exit(fatal ? 1 : 0);
