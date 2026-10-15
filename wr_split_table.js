/* 逐词切分表（WORD_SPLIT）生成器：改引擎，不碰全局词根。
   ① 在 `const WHOLE_ONLY = {` 前插入 WORD_SPLIT 表
   ② 在 decompose() 的第 0 步前插入钩子（仅 depth===0 且词命中该表时生效）
   数据来源：enhanced 的 chain（真实词素链）+ breakdown（释义）；守护清单涉及的词一律跳过。
   用法：WR_APPLY=1 才写入；否则只打印统计。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const APPLY = process.env.WR_APPLY === '1';
const raw = fs.readFileSync(DIR + '/index.html', 'utf8');
const SHIM = "var LANG='zh';function EN_MODE(){return false;}function gl(m,zh){return zh||'';}\n";
const L = raw.split('\n');
const cs = L.findIndex(l => l.includes('<script id="core">')) + 1;
const ce = L.findIndex((l, i) => l.trim() === '</script>' && i > cs);
const core = SHIM + L.slice(cs, ce).map(x => x.replace(/\r$/, '')).join('\n');
const g = n => { try { return JSON.parse(fs.readFileSync(DIR + '/' + n, 'utf8')); } catch (e) { return {}; } };
const D = { en: g('enhanced.json'), ox: g('oxford.json'), ec: g('ecdict.json'), gw: g('guard_words.json') };
eval(core + '\n' + [
  'Object.assign(ENHANCED, ' + JSON.stringify(D.en) + ');',
  'Object.assign(OXFORD, ' + JSON.stringify(D.ox) + ');',
  'Object.assign(ECDICT, ' + JSON.stringify(D.ec) + ');',
  'globalThis.__A = { d: decompose, P: PREFIXES, S: SUFFIXES, R: ROOTS };',
].join('\n'));
const A = globalThis.__A;

/* 守护清单涉及的所有形式 —— 这些词一律不覆盖 */
const gset = new Set();
(function walk(o) {
  if (o == null) return;
  if (typeof o === 'string') { gset.add(o.toLowerCase()); return; }
  if (Array.isArray(o)) { o.forEach(walk); return; }
  if (typeof o === 'object') { Object.keys(o).forEach(k => { gset.add(k.toLowerCase()); walk(o[k]); }); }
})(D.gw);
const formsOf = w => [w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'ly', w + 'ness', w + 'ic', w + 'ity',
  w.replace(/y$/, 'ies'), w.replace(/e$/, 'ing'), w.replace(/e$/, 'ed')];
const isGuarded = w => formsOf(w).some(f => gset.has(f));

const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
function glossMap(w) {
  const m = {};
  const b = (D.en[w] || {}).breakdown;
  if (typeof b !== 'string') return m;
  for (const piece of b.split(/\s*\+\s*/)) {
    const t = piece.trim(); const sp = t.indexOf(' ');
    if (sp < 0) continue;
    const seg = clean(t.slice(0, sp)), mean = clean(t.slice(sp + 1));
    if (seg && mean && !m[seg]) m[seg] = mean;
  }
  return m;
}

/* 生成 WORD_SPLIT：词 → {prefix, roots:[[m,释义]], suffixes:[[m,释义]]} */
const split = {};
let skipGuard = 0, skipShort = 0;
for (const w of Object.keys(D.en).sort()) {
  if (!/^[a-z]{3,}$/.test(w)) continue;
  const e = D.en[w];
  if (!e || !Array.isArray(e.chain) || e.chain.length < 2) continue;
  const segs = e.chain.map(c => (c && typeof c.m === 'string') ? clean(c.m) : null).filter(Boolean);
  if (segs.length < 2) continue;
  /* 只处理"引擎切得不对"的词：引擎输出的词素数 != 真实词素数 */
  let d = null; try { d = A.d(w); } catch (err) { d = null; }
  const em = d ? [].concat(d.prefix ? [d.prefix.m] : [], (d.roots || []).map(r => r.m), (d.suffixes || []).map(s => s.m)).filter(Boolean) : [];
  const same = em.length === segs.length && segs.every((s, i) => em[i] === s);
  if (same) continue;
  if (isGuarded(w)) { skipGuard++; continue; }
  /* 守护回归受害者：凡与受害者词互相包含、或**同前 4 字母同族**的表项，一律剔除（自愈循环用） */
  if ((process.env.WR_VICTIMS || '').split(',').filter(Boolean).some(v => {
    const t = v.trim();
    if (!t) return false;
    return w.includes(t) || t.includes(w) || (w.length >= 4 && t.length >= 4 && w.slice(0, 4) === t.slice(0, 4));
  })) { skipGuard++; continue; }
  /* 可信度筛：单字母片段最多 1 个；且"每段都像词素"或"整条链至少含一个已知词素"二者之一 */
  if (segs.filter(s => s.length < 2).length > 1) { skipShort++; continue; }
  const known = s => !!(A.P[s] || A.S[s] || A.R[s]);
  const strictOK = segs.every(s => s.length < 2 || known(s) || s.length >= 4);
  const hasKnown = segs.some(s => known(s));
  if (!strictOK && !hasKnown) { skipShort++; continue; }
  const gm = glossMap(w);
  /* 分类：首段若是已知前缀 → prefix；末段若是已知后缀 → suffixes；其余 → roots */
  let prefix = null; let roots = []; let suffixes = [];
  let i0 = 0, i1 = segs.length;
  if (segs.length >= 3 && A.P[segs[0]]) { prefix = segs[0]; i0 = 1; }
  while (i1 - 1 > i0 && A.S[segs[i1 - 1]]) { suffixes.unshift(segs[i1 - 1]); i1--; }
  for (let i = i0; i < i1; i++) roots.push(segs[i]);
  if (!roots.length) continue;
  const mean = s => gm[s] || (A.S[s] ? A.S[s] : A.P[s] ? A.P[s] : (A.R[s] && A.R[s][0]) || '词素');
  split[w] = { prefix: prefix, roots: roots.map(s => [s, mean(s)]), suffixes: suffixes.map(s => [s, mean(s)]) };
}
const keys = Object.keys(split);
console.log('生成 WORD_SPLIT: ' + keys.length + ' 个词（跳过守护涉及 ' + skipGuard + '、含单字母词素 ' + skipShort + '）');
console.log('样例: ' + keys.slice(0, 12).map(k => k + '=' + [split[k].prefix, split[k].roots.map(r => r[0]).join('+'), split[k].suffixes.map(s => s[0]).join('-')].filter(Boolean).join('|')).join('  '));
if (!APPLY) { console.log('（未写入；WR_APPLY=1 才写）'); process.exit(0); }

/* ① 表：插在 const WHOLE_ONLY = { 之前 */
const tbl = ['const WORD_SPLIT = {',
  '  /* 逐词切分覆盖表（2026-10-15）：仅对下面这些词生效，作用域限定在词本身，不污染其他词。',
  '     数据来自 enhanced 的 chain（真实词素链）+ breakdown（释义）。 */']
  .concat(keys.map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(split[k]) + ','))
  .concat(['};', '']);
const NL = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
let txt = raw.replace('const WHOLE_ONLY = {', tbl.join(NL) + 'const WHOLE_ONLY = {');
if (txt === raw) { console.log('✗ 表锚点未命中'); process.exit(1); }

/* ② 钩子：插在 decompose 的第 0 步之前 */
const hook = [
  '  /* 逐词切分覆盖（2026-10-15）：只在该词本身命中 WORD_SPLIT 时生效（depth 0），',
  '     不改变任何其他词的切分 —— 这是"全局词根"做不到的（全局词根会切坏同形词）。 */',
  '  if (!depth && own(WORD_SPLIT, w)) {   /* depth 可能是 0 也可能被省略（内部调用） */',
  '    const sp = WORD_SPLIT[w];',
  '    return {',
  '      prefix: sp.prefix ? { m: sp.prefix, meaning: own(PREFIXES, sp.prefix) ? PREFIXES[sp.prefix] : \'前缀\', cognates: [] } : null,',
  '      roots: (sp.roots || []).map(function (x) { return { m: x[0], meaning: x[1], cognates: [], isBase: false }; }),',
  '      suffixes: (sp.suffixes || []).map(function (x) { return { m: x[0], meaning: x[1] }; })',
  '    };',
  '  }',
  '  // 0. 整段本身是词根/基本词'];
const anchor = '  // 0. 整段本身是词根/基本词' + NL + '  const whole = rootOf(w, depth);';
const hookFull = hook.slice(0, -1).concat(['  // 0. 整段本身是词根/基本词', '  const whole = rootOf(w, depth);']);
const before = txt;
txt = txt.replace(anchor, hookFull.join(NL));
if (txt === before) { console.log('✗ 钩子锚点未命中（两行锚点）'); process.exit(1); }
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已写入引擎：WORD_SPLIT 表 ' + keys.length + ' 条 + decompose 钩子');
