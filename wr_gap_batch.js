/* 缺口集直接注入器（目标② 的方法）：把"拆不出的词"本身当词根注入。
   自带护栏：① 只挑 enhanced 里确实拆不出的词 ② 跳过已是词根/WHOLE_ONLY 的词
             ③ 跳过守护清单涉及的词（键或数组值里出现过的任何形式）
             ④ 注入后**自测**：由无到有 > 0、丢失 = 0，否则放弃（一个字都不写）
   用法：WR_N=30（默认 30） WR_DRYRUN=1 只测量 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const N = parseInt(process.env.WR_N || '30', 10);
const DRY = process.env.WR_DRYRUN === '1';
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
  'globalThis.__A = { d: decompose, R: ROOTS, W: WHOLE_ONLY, B: BASEWORDS };',
].join('\n'));
const A = globalThis.__A;

/* 守护清单：收集所有出现过的字符串（键 + 数组值） */
const guarded = new Set();
(function walk(o) {
  if (o == null) return;
  if (typeof o === 'string') { guarded.add(o.toLowerCase()); return; }
  if (Array.isArray(o)) { o.forEach(walk); return; }
  if (typeof o === 'object') { Object.keys(o).forEach(k => { guarded.add(k.toLowerCase()); walk(o[k]); }); }
})(D.gw);
console.log('守护清单涉及 ' + guarded.size + ' 个形式');

const ok = w => { try { return !!A.d(w); } catch (e) { return false; } };
const words = Object.keys(D.en).filter(w => /^[a-z]{3,}$/.test(w)).sort();
const before = new Set(words.filter(w => !ok(w)));
console.log('当前拆不出: ' + before.size);

const EX = (process.env.WR_EXCLUDE || '').split(',').map(s => s.trim()).filter(Boolean);
if (EX.length) console.log('排除名单: ' + EX.join(' '));
const pick = [];
for (const w of words) {
  if (pick.length >= N) break;
  if (!before.has(w)) continue;
  if (w.length < 6) continue;
  if (EX.includes(w)) continue;
  if (A.R[w] || A.W[w] || A.B[w]) continue;
  const forms = [w, w + 's', w + 'es', w.replace(/y$/, 'ies')];
  if (forms.some(f => guarded.has(f))) continue;
  pick.push(w);
}
console.log('本轮挑中 ' + pick.length + ' 个词: ' + pick.join(' '));

/* 组条目（整词作词根，释义取 ecdict 中文，退化为 enhanced） */
const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const entries = pick.map(w => {
  const ec = D.ec[w] || {};
  let gloss = clean(ec.t || ec.translation);
  if (!gloss) gloss = clean(D.en[w] && (D.en[w].m || D.en[w].meaning)) || '（见词典）';
  return '  "' + w + '": [' + JSON.stringify(gloss) + ', [' + JSON.stringify(w) + '], {"lang": "英语", "word": ' + JSON.stringify(w) + '}],';
});

/* 注入并自测（内存中改 ROOTS，不落盘） */
pick.forEach((w, i) => {
  const ec = D.ec[w] || {};
  let gloss = clean(ec.t || ec.translation) || clean(D.en[w] && (D.en[w].m || D.en[w].meaning)) || '（见词典）';
  A.R[w] = [gloss, [w], { lang: '英语', word: w }];
});
const after = words.filter(w => !ok(w));
const afterSet = new Set(after);
const gains = [...before].filter(w => !afterSet.has(w));
const losses = after.filter(w => !before.has(w));
console.log('自测 → 由无到有 ' + gains.length + '  丢失 ' + losses.length + (losses.length ? '  (' + losses.slice(0, 8).join(', ') + ')' : ''));
console.log('样例收益: ' + gains.slice(0, 12).join(' '));
if (DRY) { console.log('（DRYRUN，未写入）'); process.exit(0); }
if (losses.length > 0 || gains.length === 0) { console.log('*** 自测不过 → 一个字都没写 ***'); process.exit(1); }

/* 落盘：插到 ROOTS 表末尾 */
const rs = L.findIndex(l => l.startsWith('const ROOTS = {'));
const re = L.findIndex((l, i) => i > rs && l.trim() === '};');
if (rs < 0 || re < 0) { console.log('✗ ROOTS 锚点没找到'); process.exit(1); }
const NL2 = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const txt = raw.replace('const ROOTS = {', 'const ROOTS = {' + NL2 + entries.join(NL2));
if (txt === raw) { console.log('✗ ROOTS 锚点未命中'); process.exit(1); }
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已写入 ' + entries.length + ' 条整词词根');
