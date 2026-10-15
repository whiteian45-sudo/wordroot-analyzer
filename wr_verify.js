/* 核实：把"拆不出"的词逐条归类，确认没有"漏网的错词"。
   类别：A 守护钉住 / B 已是词根或整词读法 / C 非 a-z 或过短 / D 其他（= 真漏网，应为 0） */
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
  'globalThis.__A = { d: decompose, R: ROOTS, W: WHOLE_ONLY, B: BASEWORDS, BT: BASEWORDS_BATCH };',
].join('\n'));
const A = globalThis.__A;

/* 守护清单里的所有形式（键 + 数组值），以及派生的常见词形 */
const gset = new Set();
(function walk(o) {
  if (o == null) return;
  if (typeof o === 'string') { gset.add(o.toLowerCase()); return; }
  if (Array.isArray(o)) { o.forEach(walk); return; }
  if (typeof o === 'object') { Object.keys(o).forEach(k => { gset.add(k.toLowerCase()); walk(o[k]); }); }
})(D.gw);
const forms = w => [w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'ly', w + 'ness', w + 'ic', w + 'ity',
  w.replace(/y$/, 'ies'), w.replace(/e$/, 'ing'), w.replace(/e$/, 'ed')];
const guarded = w => forms(w).some(f => gset.has(f));

const all = Object.keys(D.en);
const alpha = all.filter(w => /^[a-z]+$/.test(w));
const failA = alpha.filter(w => { try { return !A.d(w); } catch (e) { return true; } });
const buckets = { A: [], B: [], C: [], D: [] };
for (const w of failA) {
  if (A.R[w] || A.W[w] || A.B[w] || A.BT[w]) { buckets.B.push(w); continue; }
  if (guarded(w)) { buckets.A.push(w); continue; }
  if (w.length < 3) { buckets.C.push(w); continue; }
  buckets.D.push(w);
}
const nonAlphaFails = all.filter(w => !/^[a-z]+$/.test(w)).filter(w => { try { return !A.d(w); } catch (e) { return true; } });
console.log('enhanced 词条 ' + all.length + '（纯 a-z ' + alpha.length + '，含其他字符 ' + (all.length - alpha.length) + '）');
console.log('纯 a-z 中拆不出: ' + failA.length);
console.log('  A 守护钉住      : ' + buckets.A.length);
console.log('  B 已是词根/整词  : ' + buckets.B.length);
console.log('  C 过短(<3)      : ' + buckets.C.length);
console.log('  D **其他（真漏网）**: ' + buckets.D.length);
console.log('含非 a-z 字符且拆不出: ' + nonAlphaFails.length + (nonAlphaFails.length ? '  例: ' + nonAlphaFails.slice(0, 10).join(', ') : ''));
if (buckets.D.length) console.log('D 类样例: ' + buckets.D.slice(0, 40).join(' '));
if (buckets.A.length) console.log('A 类样例: ' + buckets.A.slice(0, 15).join(' '));
console.log('总计（纯 a-z 拆不出 + 非 a-z 拆不出） = ' + (failA.length + nonAlphaFails.length));
