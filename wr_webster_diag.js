/* Webster 口径残留诊断（只读，不写任何数据）：
   把 946 个"完全拆不出"的正文词 / 46 个词表词，逐个标明被哪道筛子挡下。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const WEBSTER = DIR + '/_archive/2026-10-过程稿';
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
  'globalThis.__A = { d: decompose, pd: (typeof partialDecompose === "function" ? partialDecompose : null), R: ROOTS, W: WHOLE_ONLY, B: BASEWORDS, BT: BASEWORDS_BATCH };',
].join('\n'));
const A = globalThis.__A;
const gset = new Set();
(function walk(o) {
  if (o == null) return;
  if (typeof o === 'string') { gset.add(o.toLowerCase()); return; }
  if (Array.isArray(o)) { o.forEach(walk); return; }
  if (typeof o === 'object') { Object.keys(o).forEach(k => { gset.add(k.toLowerCase()); walk(o[k]); }); }
})(D.gw);
const ok = w => { try { return !!A.d(w); } catch (e) { return false; } };
const okp = w => { try { return !!A.pd && !!A.pd(w); } catch (e) { return false; } };

function diag(label, list) {
  const c = { short: [], noDict: [], have: [], guard: [], fixable: [] };
  for (const w of list) {
    if (w.length < 5) { c.short.push(w); continue; }
    if (A.R[w] || A.W[w] || A.B[w] || A.BT[w]) { c.have.push(w); continue; }
    if (gset.has(w)) { c.guard.push(w); continue; }
    if (!D.ec[w]) { c.noDict.push(w); continue; }
    c.fixable.push(w);
  }
  console.log('=== ' + label + '（' + list.length + ' 词）===');
  console.log('  过短(<5)        : ' + c.short.length + '  例: ' + c.short.slice(0, 12).join(' '));
  console.log('  不在 ECDICT     : ' + c.noDict.length + '  例: ' + c.noDict.slice(0, 12).join(' '));
  console.log('  已是词根/整词   : ' + c.have.length + '  例: ' + c.have.slice(0, 12).join(' '));
  console.log('  守护清单涉及    : ' + c.guard.length + '  例: ' + c.guard.slice(0, 12).join(' '));
  console.log('  **仍可修(真词)** : ' + c.fixable.length + (c.fixable.length ? '  全部: ' + c.fixable.slice(0, 60).join(' ') : ''));
}

const cands = new Set();
try { for (const t of (fs.readFileSync(WEBSTER + '/webster_defs.txt', 'utf8').toLowerCase().match(/[a-z]{3,}/g) || [])) cands.add(t); } catch (e) { }
const wl = [];
try { for (const l of fs.readFileSync(WEBSTER + '/webster_words.txt', 'utf8').split(/\r?\n/)) { const x = l.trim().toLowerCase(); if (/^[a-z]{3,}$/.test(x)) { cands.add(x); wl.push(x); } } } catch (e) { }
const all = [...cands].sort();
const fail = all.filter(w => !ok(w) && !okp(w));
diag('Webster 释义正文残留', fail);
diag('Webster 词表残留', wl.filter(w => !ok(w) && !okp(w)));
