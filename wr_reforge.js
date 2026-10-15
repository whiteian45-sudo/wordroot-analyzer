/* 低匹配回炉：把 enhanced 的 chain（真实词素链）里缺的词素补进 ROOTS，
   释义直接取 enhanced.breakdown（"ab 远离 + ol 生长 + ish 动词后缀"）。
   护栏：自测 由无到有 > 0 且 丢失 = 0 才写；WR_DRYRUN=1 只打印。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const DRY = process.env.WR_DRYRUN === '1';
const LIMIT = parseInt(process.env.WR_N || '2000', 10);
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
  'globalThis.__A = { d: decompose, R: ROOTS, W: WHOLE_ONLY, B: BASEWORDS, BT: BASEWORDS_BATCH, P: PREFIXES, S: SUFFIXES };',
].join('\n'));
const A = globalThis.__A;
const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);

/* breakdown 解析：'ab 远离 + ol 生长 + ish 动词后缀' → {ab:'远离', ol:'生长', ish:'动词后缀'} */
function glossMap(w) {
  const m = {};
  const b = (D.en[w] || {}).breakdown;
  if (typeof b !== 'string') return m;
  for (const piece of b.split(/\s*\+\s*/)) {
    const t = piece.trim();
    if (!t) continue;
    const sp = t.indexOf(' ');
    if (sp < 0) continue;
    const seg = clean(t.slice(0, sp));
    const mean = clean(t.slice(sp + 1));
    if (seg && mean && !m[seg]) m[seg] = mean;
  }
  return m;
}
const exists = s => !!(A.R[s] || A.W[s] || A.B[s] || A.BT[s] || A.P[s] || A.S[s]);
/* 守护理赔：凡是被守护报出问题的"受害者词"里包含的词素，一律跳过（避免切坏它们） */
const VICT = (process.env.WR_VICTIMS || '').split(',').map(s => s.trim()).filter(Boolean);
const isVictimPart = s => VICT.some(v => v.includes(s));
if (VICT.length) console.log('守卫受害者词: ' + VICT.join(' '));

/* 找出"引擎把整词当一段、但 enhanced 有 ≥2 段真实词素链"的词 */
const words = Object.keys(D.en).filter(w => /^[a-z]{3,}$/.test(w)).sort();
const need = new Map();   // 词素 → 释义
let lowCount = 0, exWords = 0;
for (const w of words) {
  const e = D.en[w];
  if (!e || !Array.isArray(e.chain) || e.chain.length < 2) continue;
  const segs = e.chain.map(c => (c && typeof c.m === 'string') ? c.m : null).filter(Boolean);
  if (segs.length < 2) continue;
  let d = null; try { d = A.d(w); } catch (err) { d = null; }
  if (!d) continue;
  const em = [].concat(d.prefix ? [d.prefix.m] : [], (d.roots || []).map(r => r.m), (d.suffixes || []).map(s => s.m)).filter(Boolean);
  if (em.length >= 2) continue;               // 已经有 ≥2 段，不低匹配
  lowCount++;
  const gm = glossMap(w);
  let add = 0;
  for (const s of segs) {
    if (s.length < 2) continue;
    if (isVictimPart(s)) continue;
    if (exists(s) || need.has(s)) { continue; }
    const gl = gm[s];
    if (!gl) continue;                        // 没有释义就不加（避免编造）
    need.set(s, gl); add++;
  }
  if (add) exWords++;
  if (need.size >= LIMIT) break;
}
console.log('低匹配候选词 ' + lowCount + '；其中可补词素 ' + exWords + '；新增词素 ' + need.size + ' 个');
console.log('样例: ' + [...need.entries()].slice(0, 20).map(([k, v]) => k + '=' + v).join('  '));
if (!need.size) { console.log('无需补，结束'); process.exit(0); }

const entries = [...need.entries()].map(([k, v]) =>
  '  "' + k + '": [' + JSON.stringify(v) + ', [' + JSON.stringify(k) + '], {"lang": "词源词素", "word": ' + JSON.stringify(k) + '}],');
if (DRY) { console.log('（DRYRUN，未写入）前 3 条: ' + entries.slice(0, 3).join(' ')); process.exit(0); }

/* 自测：写入前后对比（只针对 enhanced 全量） */
const ok = w => { try { return !!A.d(w); } catch (e) { return false; } };
const before = new Set(words.filter(w => !ok(w)));
for (const [k, v] of need) A.R[k] = [v, [k], { lang: '词源词素', word: k }];
const after = words.filter(w => !ok(w));
const afterSet = new Set(after);
const gains = [...before].filter(w => !afterSet.has(w));
const losses = after.filter(w => !before.has(w));
console.log('自测 → 由无到有 ' + gains.length + '  丢失 ' + losses.length + (losses.length ? ' (' + losses.slice(0, 8).join(',') + ')' : ''));
if (losses.length || !gains.length) { console.log('*** 自测不过 → 一个字都没写 ***'); process.exit(1); }

const NL = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const txt = raw.replace('const ROOTS = {', 'const ROOTS = {' + NL + entries.join(NL));
if (txt === raw) { console.log('✗ 锚点未命中'); process.exit(1); }
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已写入 ' + entries.length + ' 条词源词素（低匹配回炉）');
