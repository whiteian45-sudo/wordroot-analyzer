/* 拆解引擎全量差异（常驻工具，勿删）
   用法：
     node wr_engine_diff.js [--from <rev>] [--to <rev>] [--scope morph|enhanced|both]
                           [--limit N] [--max-diff N] [--with-meaning] [--exit-code]
   --from / --to  版本，默认 HEAD -> 工作区（工作区用 WORK）
   --scope        词表：morph（默认，22.8 万词，覆盖数据层）/ enhanced（1.39 万）/ both
   --limit        只扫前 N 个词（冒烟）
   --with-meaning 签名里带上词根释义（释义改动也会报出来，默认只看结构）
   --exit-code    有差异时返回 1（给脚本用；默认总是 0）

   加载真实 morph.json 与 ecdict 词性，和浏览器里的拆解条件一致。
   典型耗时：morph 全量约 5~10 秒。改引擎后先跑它，再跑 --guard / --audit / test_health。
*/
const fs = require('fs');
const { execSync } = require('child_process');
const DIR = __dirname;

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] || def) : def;
}
const FROM = opt('--from', 'HEAD');
const TO = opt('--to', 'WORK');
const SCOPE = opt('--scope', 'morph');
const LIMIT = parseInt(opt('--limit', '0'), 10) || 0;
const MAX_DIFF = parseInt(opt('--max-diff', '200'), 10) || 200;
const WITH_MEANING = args.includes('--with-meaning');

/* 与 test_decompose.js 一致的测试垫片：core 里的渲染函数会用到 gl()/EN_MODE() */
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

/* 真实词性：直接读 ecdict.json 的 t 字段（懒加载，第一次用到 POS 时才解析） */
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

function coreOf(rev) {
  if (/^(WORK|work)$/.test(rev)) return loadCore(fs.readFileSync(DIR + '/index.html', 'utf8'));
  if (!/^[\w.~^\/-]+$/.test(rev)) throw new Error('版本名不合法: ' + rev);
  const html = execSync('git -C "' + DIR + '" show ' + rev + ':index.html',
    { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  return loadCore(html);
}

let __MORPH = null;
try { __MORPH = JSON.parse(fs.readFileSync(DIR + '/morph.json', 'utf8')); } catch (e) { /* 没有也能跑 */ }

/* 词表：morph = morph.json 的 words 键；enhanced = enhanced.json 的键 */
function buildWords() {
  const sets = [];
  if (SCOPE === 'morph' || SCOPE === 'both') {
    if (!__MORPH || !__MORPH.words) throw new Error('缺少 morph.json，无法跑 morph 范围');
    sets.push(Object.keys(__MORPH.words));
  }
  if (SCOPE === 'enhanced' || SCOPE === 'both') {
    const enh = JSON.parse(fs.readFileSync(DIR + '/enhanced.json', 'utf8'));
    sets.push(Object.keys(enh));
  }
  if (!sets.length) throw new Error('--scope 只能是 morph / enhanced / both');
  let words = sets.length === 1 ? sets[0] : [...new Set([].concat(...sets))];
  if (LIMIT > 0) words = words.slice(0, LIMIT);
  return words;
}

const words = buildWords();

const probe = `
if (typeof MORPH !== 'undefined' && MORPH.words && __MORPH) Object.assign(MORPH.words, __MORPH.words);
function sig(w) {
  const d = decompose(w);
  if (!d) return null;
  const roots = (d.roots || []).map(r => r.m + (WITH_MEANING_FLAG ? '=' + (r.meaning || '') : ''));
  return (d.prefix ? d.prefix.m + '|' : '') + roots.join('+')
    + (d.suffixes || []).map(s => '-' + s.m).join('');
}
const words = __WORDS__;
const res = {};
for (const w of words) res[w] = sig(w);
JSON.stringify(res);
`;

function run(core) {
  const t0 = Date.now();
  const res = JSON.parse(eval(core + probe
    .replace('__WORDS__', JSON.stringify(words))
    .replace('WITH_MEANING_FLAG', WITH_MEANING ? 'true' : 'false')));
  return { res, ms: Date.now() - t0 };
}

const oldCore = coreOf(FROM);
const newCore = coreOf(TO);
const a = run(oldCore), b = run(newCore);

const changed = [];
for (const w of words) if (a.res[w] !== b.res[w]) changed.push({ w, old: a.res[w], neu: b.res[w] });

console.log('引擎差异  ' + FROM + ' -> ' + TO + '  范围 ' + SCOPE + '(' + words.length + ' 词)');
console.log('旧 ' + a.ms + 'ms / 新 ' + b.ms + 'ms');
console.log('变化词数: ' + changed.length);
for (const c of changed.slice(0, MAX_DIFF)) {
  console.log(c.w.padEnd(26) + ' [' + (c.old || '∅') + '] -> [' + (c.neu || '∅') + ']');
}
if (changed.length > MAX_DIFF) console.log('……另有 ' + (changed.length - MAX_DIFF) + ' 个未列出（--max-diff 调大）');
if (args.includes('--exit-code')) process.exitCode = changed.length ? 1 : 0;
