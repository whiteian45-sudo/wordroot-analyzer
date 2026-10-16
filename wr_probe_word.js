/* 单词探针：node wr_probe_word.js ectopic [more...] */
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
  'globalThis.__A = { d: decompose, pd: partialDecompose };',
].join('\n'));
const A = globalThis.__A;
const sig = w => { const d = A.d(w); if (!d) return 'MISS'; return (d.prefix ? d.prefix.m + '|' : '') + (d.roots || []).map(r => r.m + '(' + r.meaning + ')').join('+') + (d.suffixes || []).map(s => '-' + s.m + '(' + s.meaning + ')').join(''); };
const words = process.argv.slice(2);
for (const w0 of words) {
  const w = w0.toLowerCase();
  const e = D.en[w];
  console.log('=== ' + w + ' ===');
  console.log('  decompose        : ' + sig(w));
  const p = A.pd(w); console.log('  partial          : ' + (p ? JSON.stringify(p).slice(0, 200) : 'MISS'));
  console.log('  enhanced 有词条   : ' + (e ? '有' : '**没有**'));
  if (e) { console.log('    breakdown     : ' + (e.breakdown || '—')); console.log('    chain         : ' + (Array.isArray(e.chain) ? e.chain.map(x => x.m).join(',') : '—')); }
  console.log('  ecdict 释义      : ' + ((D.ec[w] && (D.ec[w].t || D.ec[w].translation)) ? String(D.ec[w].t || D.ec[w].translation).replace(/\s+/g, ' ').slice(0, 80) : '—'));
  console.log('  oxford 有        : ' + (D.ox[w] ? '有' : '没有'));
}
