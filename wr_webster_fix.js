/* Webster 口径补漏：从 webster_words.txt + webster_defs.txt 取"拆不出"的词，
   只保留 ECDICT 里真实存在的词（自动滤掉拼写错误、碎片、缩写），整词作词根注入。
   自带护栏：自测 由无到有 > 0 且 丢失 = 0，否则一个字都不写。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const N = parseInt(process.env.WR_N || '400', 10);
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
const forms = w => [w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'ly', w + 'ness', w + 'ic', w + 'ity',
  w.replace(/y$/, 'ies'), w.replace(/e$/, 'ing'), w.replace(/e$/, 'ed')];
const guarded = w => forms(w).some(f => gset.has(f));

const cands = new Set();
try { for (const t of (fs.readFileSync(DIR + '/webster_defs.txt', 'utf8').toLowerCase().match(/[a-z]{3,}/g) || [])) cands.add(t); } catch (e) { }
try { for (const l of fs.readFileSync(DIR + '/webster_words.txt', 'utf8').split(/\r?\n/)) { const x = l.trim().toLowerCase(); if (/^[a-z]{3,}$/.test(x)) cands.add(x); } } catch (e) { }
console.log('Webster 口径候选词（去重）: ' + cands.size);

const ok = w => { try { return !!A.d(w); } catch (e) { return false; } };
const okp = w => { try { return !!A.pd && !!A.pd(w); } catch (e) { return false; } };

const all = [...cands].sort();
const failing = all.filter(w => !ok(w) && !okp(w));
const inDict = failing.filter(w => D.ec[w]);
const EX = (process.env.WR_EXCLUDE || '').split(',').map(s => s.trim()).filter(Boolean);
const pick = [];
let skippedShort = 0, skippedGuarded = 0, skippedHave = 0;
for (const w of inDict) {
  if (pick.length >= N) break;
  if (w.length < 5) { skippedShort++; continue; }
  if (EX.includes(w)) continue;
  if (A.R[w] || A.W[w] || A.B[w] || A.BT[w]) { skippedHave++; continue; }
  if (guarded(w)) { skippedGuarded++; continue; }
  pick.push(w);
}
console.log('完全拆不出: ' + failing.length + '（其中 ECDICT 真词 ' + inDict.length + '）');
console.log('跳过: 过短(<5) ' + skippedShort + ' | 已是词根/整词 ' + skippedHave + ' | 守护涉及 ' + skippedGuarded);
console.log('本轮挑中 ' + pick.length + ' 个: ' + pick.slice(0, 40).join(' '));

const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const esc = t => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const entries = pick.map(w => {
  const ec = D.ec[w] || {};
  const gloss = clean(ec.t || ec.translation) || '（见词典）';
  return '  "' + w + '": [' + JSON.stringify(gloss) + ', [' + JSON.stringify(w) + '], {"lang": "英语", "word": ' + JSON.stringify(w) + '}],';
});
if (!pick.length) { console.log('无候选，结束（一个字没写 ✓）'); process.exit(0); }
if (process.env.WR_DRYRUN === '1') { console.log('（DRYRUN，未写入）样例: ' + entries.slice(0, 3).join(' ')); process.exit(0); }

const before = new Set(all.filter(w => !ok(w)));
pick.forEach(w => { const ec = D.ec[w] || {}; A.R[w] = [clean(ec.t || ec.translation) || '（见词典）', [w], { lang: '英语', word: w }]; });
const after = all.filter(w => !ok(w));
const afterSet = new Set(after);
const gains = [...before].filter(w => !afterSet.has(w));
const losses = after.filter(w => !before.has(w));
console.log('自测 → 由无到有 ' + gains.length + '  丢失 ' + losses.length + (losses.length ? ' (' + losses.slice(0, 8).join(',') + ')' : ''));
if (losses.length || !gains.length) { console.log('*** 自测不过 → 一个字都没写 ***'); process.exit(1); }

const NL = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const txt = raw.replace('const ROOTS = {', 'const ROOTS = {' + NL + entries.join(NL));
if (txt === raw) { console.log('✗ ROOTS 锚点未命中'); process.exit(1); }
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已写入 ' + entries.length + ' 条（Webster 口径补漏）');
