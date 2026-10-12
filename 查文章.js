/* 查文章.js —— 把一篇文章里的每个单词拆开，列出「拆分 + 含义」，并自动挑出可疑的
 *
 * 用法（两种都行）：
 *   1) node 查文章.js 文章.txt          ← 文章放进项目目录
 *   2) node 查文章.js                   ← 默认读 article.txt
 *
 * 产出：
 *   · 查文章报告.txt   —— 全部词条（按文中出现顺序），含每个语素的含义与整词中文释义
 *   · 控制台          —— 只打摘要 + 可疑词清单（中文在 .txt 里更清楚，控制台是 GBK）
 *
 * 可疑判据（都是这几天报词时总结出来的失败模式）：
 *   MISS        无拆解                      ← 常见词缺基本词/词根
 *   PART        部分拆解（含 ??）            ← 剥完只剩"不认识的一截"
 *   PREFIX      短前缀劫持（tri||??ck 那种）  ← 缺词 → 被 2~3 字母前缀抢走
 *   STEM?       疑似应该是 "词干+e"          ← traces→trac-es、placed→plac-ed（基本词变形输给同源词根）
 *   MEAN?       单一词根的释义与整词释义毫无交集 ← 疑似假阳性（bio+nice 那种）
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const inFile = process.argv[2] || 'article.txt';
const inPath = path.isAbsolute(inFile) ? inFile : path.join(DIR, inFile);

if (!fs.existsSync(inPath)) {
  console.log('找不到文件：' + inPath);
  console.log('把文章存成 ' + path.join(DIR, 'article.txt') + '（或直接拖到 查文章.bat 上），再跑一次。');
  process.exit(1);
}
const text = fs.readFileSync(inPath, 'utf8');

// ---------- 载入引擎 ----------
const raw = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const SHIM = "var LANG='zh';function EN_MODE(){return false;}function gl(m,zh){return zh||'';}function langEn(s){return s;}\n";
const L = raw.split('\n');
const cs = L.findIndex(l => l.includes('<script id="core">')) + 1;
const ce = L.findIndex((l, i) => l.trim() === '</script>' && i > cs);
const g = n => { try { return JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8')); } catch (e) { return {}; } };
globalThis.__D = { en: g('enhanced.json'), ox: g('oxford.json'), ec: g('ecdict.json') };
const tail = [
  'Object.assign(ENHANCED, globalThis.__D.en);',
  'Object.assign(OXFORD, globalThis.__D.ox);',
  'Object.assign(ECDICT, globalThis.__D.ec);',
  'globalThis.__API = { decompose: decompose, partialDecompose: partialDecompose, ENHANCED: ENHANCED, OXFORD: OXFORD, ECDICT: ECDICT };',
].join('\n');
eval(SHIM + L.slice(cs, ce).join('\n') + '\n' + tail);
// const 声明的表不会从 eval 里漏出来，必须由 tail 显式导出
// 只解构表：decompose / partialDecompose 是函数声明，本来就会从 eval 里漏出来（重复声明会报错）
const { ENHANCED, OXFORD, ECDICT } = globalThis.__API;

// ---------- 分词 ----------
const seen = new Set();
const words = [];
(text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).forEach(tok => {
  let w = tok.replace(/[’]/g, "'").toLowerCase();
  w = w.replace(/'s$/, '').replace(/^'+|'+$/g, '');   // 去所有格：committee's → committee
  if (w.length < 3 || seen.has(w)) return;
  seen.add(w);
  words.push(w);
});

// ---------- 释义（判断语素含义是否贴合） ----------
function gloss(w) {
  const en = ENHANCED[w] || {};
  if (en.meaning) return String(en.meaning).slice(0, 40);
  const ox = OXFORD[w] || {}, o = ox.o || ox;
  if (o.def_zh) return String(o.def_zh).slice(0, 40);
  if (ECDICT[w] && ECDICT[w].t) return String(ECDICT[w].t).split('\n')[0].slice(0, 40);
  return '';
}

// 功能词与极常见的语法词：它们本来就"无可拆"，单独标记，不混进可疑清单
const FUNC = new Set(('the a an and or but if of to in on at for with from by as is are was were be been being am ' +
  'do does did have has had will would shall should can could may might must not no nor so such than that this these ' +
  'those there their they them then than when where which who whom whose what why how all any both each few more ' +
  'most other some such only own same too very just also into over under again further once here its it he she we you ' +
  'i his her our your my me him us them').split(/\s+/));

// ---------- 拆解 ----------
function morphList(d) {
  const out = [];
  if (d.prefix) out.push({ m: d.prefix.m, meaning: d.prefix.meaning || '' });
  (d.roots || []).forEach(r => out.push({ m: r.m, meaning: r.meaning || '' }));
  (d.suffixes || []).forEach(s => out.push({ m: '-' + s.m, meaning: s.meaning || '' }));
  return out;
}
const rows = [];
words.forEach(w => {
  const full = decompose(w, 0);
  const part = full || partialDecompose(w);
  const gl = gloss(w);
  if (FUNC.has(w)) { rows.push({ w, kind: 'FUNC', text: '（功能词）', gl }); return; }
  if (!part) { rows.push({ w, kind: 'MISS', text: '（无拆解）', gl }); return; }
  const ms = morphList(part);
  const text = ms.map(x => x.m + (x.meaning ? '(' + x.meaning + ')' : '')).join(' + ');
  let kind = full ? 'ok' : 'PART';
  if (!full && part.prefix && part.prefix.m.length <= 3 && (part.unknown || !(part.roots || []).length)) kind = 'PREFIX';
  // 疑似"词干+e"：形如 Xed/Xing 且 X+e 是词典里的词，而当前读法是 词根+后缀
  const mStem = w.match(/^(.*?)(ed|ing)$/);
  if (kind === 'ok' && mStem && mStem[1] && !/e$/.test(mStem[1]) && ECDICT[mStem[1] + 'e']) {
    const last = (part.suffixes || [])[(part.suffixes || []).length - 1];
    const rootEndsE = (part.roots || []).some(r => /e$/.test(r.m));
    if (last && (last.m === 'ed' || last.m === 'ing') && !rootEndsE) kind = 'STEM?';
  }
  // 疑似假阳性：只有一个词根，且它的释义与整词释义没有任何共同汉字
  if (kind === 'ok' && (part.roots || []).length === 1 && !part.prefix && !(part.suffixes || []).length && gl) {
    const rm = String(part.roots[0].meaning || '');
    const common = [...rm].some(ch => /[\u4e00-\u9fff]/.test(ch) && gl.indexOf(ch) >= 0);
    if (rm && !common) kind = 'MEAN?';
  }
  rows.push({ w, kind, text, gl });
});

// ---------- 报告 ----------
const LABEL = { FUNC: '· 功能词', MISS: '✗无拆解', PART: '△部分拆解', PREFIX: '✗短前缀劫持', 'STEM?': '?应为词干+e', 'MEAN?': '?疑似假阳性', ok: '✓' };
const susp = rows.filter(r => r.kind !== 'ok' && r.kind !== 'FUNC');
const lines = [];
lines.push('文章：' + inPath);
lines.push('共 ' + rows.length + ' 个不重复单词（长度≥3）；可疑 ' + susp.length + ' 个');
lines.push('');
lines.push('=== 可疑清单（先看这些）===');
susp.forEach(r => lines.push([LABEL[r.kind], r.w, r.text, r.gl ? '‖ ' + r.gl : ''].join('  ')));
lines.push('');
lines.push('=== 全部词条（按出现顺序）===');
rows.forEach(r => lines.push([LABEL[r.kind], r.w, r.text, r.gl ? '‖ ' + r.gl : ''].join('  ')));
fs.writeFileSync(path.join(DIR, '查文章报告.txt'), lines.join('\n'), 'utf8');

console.log('读入 ' + inPath + '：' + rows.length + ' 个不重复单词，可疑 ' + susp.length + ' 个');
const by = {};
susp.forEach(r => { by[r.kind] = (by[r.kind] || 0) + 1; });
Object.keys(by).forEach(k => console.log('  ' + LABEL[k] + ' ' + by[k] + ' 个'));
console.log('可疑词（前 60）：');
susp.slice(0, 60).forEach(r => console.log('  ' + LABEL[r.kind] + '  ' + r.w + '  ' + r.text));
console.log('\n完整报告（含中文释义）：查文章报告.txt');
