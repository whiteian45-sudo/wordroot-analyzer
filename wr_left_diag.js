/* 诊断剩余"未拆出"的成分（只读）：为何没进 WORD_SPLIT / 为何拆不出 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
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
  'globalThis.__A = { d: decompose, pd: partialDecompose, P: PREFIXES, S: SUFFIXES, R: ROOTS, W: (typeof WORD_SPLIT !== "undefined" ? WORD_SPLIT : {}) };',
].join('\n'));
const A = globalThis.__A;
const gset = new Set();
(function walk(o) { if (o == null) return; if (typeof o === 'string') { gset.add(o.toLowerCase()); return; } if (Array.isArray(o)) { o.forEach(walk); return; } if (typeof o === 'object') { Object.keys(o).forEach(k => { gset.add(k.toLowerCase()); walk(o[k]); }); } })(D.gw);

const words = Object.keys(D.en).filter(w => /^[a-z]{3,}$/.test(w));
const fail = words.filter(w => { try { return !A.d(w); } catch (e) { return true; } });
const c = { hasChain: [], noChain: [], inTable: [], short2: [], guard: [] };
for (const w of fail) {
  if (A.W[w]) { c.inTable.push(w); continue; }
  const e = D.en[w];
  const segs = (e && Array.isArray(e.chain)) ? e.chain.map(x => x && x.m).filter(x => typeof x === 'string') : [];
  if (segs.length >= 2) c.hasChain.push([w, segs]); else c.noChain.push(w);
}
console.log('未拆出总数: ' + fail.length);
console.log('  A 有词素链(≥2段)但没进表 : ' + c.hasChain.length);
console.log('  B 没有词素链             : ' + c.noChain.length);
console.log('  C 已在 WORD_SPLIT 表里    : ' + c.inTable.length);
console.log('\nA 类样例（含链）:');
c.hasChain.slice(0, 20).forEach(([w, s]) => console.log('   ' + w.padEnd(16) + ' chain=[' + s.join(',') + ']'));
console.log('\nB 类样例（无链）: ' + c.noChain.slice(0, 30).join(' '));
const len = { '3-5': 0, '6-8': 0, '9-11': 0, '12+': 0 };
for (const w of fail) { const n = w.length; if (n <= 5) len['3-5']++; else if (n <= 8) len['6-8']++; else if (n <= 11) len['9-11']++; else len['12+']++; }
console.log('\n长度分布: ' + JSON.stringify(len));
const guardedN = fail.filter(w => gset.has(w)).length;
console.log('其中守护清单直接涉及的: ' + guardedN);
