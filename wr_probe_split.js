/* 直接探针：确认 WORD_SPLIT 是否生效（只读） */
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
  'globalThis.__A = { d: decompose, has: (typeof WORD_SPLIT !== "undefined"), n: (typeof WORD_SPLIT !== "undefined" ? Object.keys(WORD_SPLIT).length : -1) };',
].join('\n'));
const A = globalThis.__A;
console.log('WORD_SPLIT 存在? ' + A.has + '  条目数 = ' + A.n);
const sig = w => { const d = A.d(w); if (!d) return 'MISS'; return (d.prefix ? d.prefix.m + '|' : '') + (d.roots || []).map(r => r.m).join('+') + (d.suffixes || []).map(s => '-' + s.m).join(''); };
for (const w of ['abolish', 'abolition', 'abominable', 'abbreviate', 'ability', 'absorb', 'mobile', 'complete', 'questions', 'architecture', 'canary']) {
  console.log('  ' + w.padEnd(14) + ' → ' + sig(w) + '     期望(enhanced chain): ' + ((D.en[w] && D.en[w].chain) ? D.en[w].chain.map(c => c.m).join(',') : '—'));
}
