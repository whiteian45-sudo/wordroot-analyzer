/* 缺口集注入器（2026-10-15 重写）：把"拆不出的常见词"登记为【基本词】（BASEWORDS_BATCH），
   而不是当成词根塞进 ROOTS。

   ★ 为什么重写：原版往 ROOTS 里写「整词自己当词根」
       "abstractions": ["n. 抽象…", ["abstractions"], {"lang": "英语", "word": "abstractions"}]
     后果有三：① 查 abstractions 显示"abstractions 是词根，含义 n.抽象"——把"没拆出来"包装成"拆出来了"，
     词源还是自我循环（abstractions ← 英语 abstractions）；② 词根目录里混进两千多条这种伪词根；
     ③ 原来的自测（由无到有 > 0、丢失 = 0）因为自己刚改了数据必然通过，等于没有护栏。
     2026-10-15 已把 ROOTS 里那 2236 条摘出来转进 BASEWORDS_BATCH，本脚本改成从一开始就走基本词表。

   ★ 基本词表闸门（见 index.html 的 INFLECT_SUF）：只在【正在剥变形后缀】s/es/ed/ing/er/est 时当落点，
     所以 welcomed 能拆 welcome+ed，而 welcome 本身不会被"整词命中"冒充拆解，也不会顶掉别的词的真拆解。

   自测（有意义的口径）：本词常见变形由无到有 > 0，且全量 enhanced 拆解丢失 = 0，否则一个字都不写。
   用法：WR_N=30（默认 30） WR_EXCLUDE=a,b WR_DRYRUN=1 只测量 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const N = parseInt(process.env.WR_N || '30', 10);
const DRY = process.env.WR_DRYRUN === '1';
const raw = fs.readFileSync(DIR + '/index.html', 'utf8');
const L = raw.split('\n');
const cs = L.findIndex(l => l.includes('<script id="core">')) + 1;
const ce = L.findIndex((l, i) => l.trim() === '</script>' && i > cs);
const SHIM = "var LANG='zh';function EN_MODE(){return false;}function gl(m,zh){return zh||'';}\n";
const core = SHIM + L.slice(cs, ce).map(x => x.replace(/\r$/, '')).join('\n');
const g = n => { try { return JSON.parse(fs.readFileSync(DIR + '/' + n, 'utf8')); } catch (e) { return {}; } };
const D = { en: g('enhanced.json'), ox: g('oxford.json'), ec: g('ecdict.json'), gw: g('guard_words.json') };
eval(core + '\n' + [
  'Object.assign(ENHANCED, ' + JSON.stringify(D.en) + ');',
  'Object.assign(OXFORD, ' + JSON.stringify(D.ox) + ');',
  'Object.assign(ECDICT, ' + JSON.stringify(D.ec) + ');',
  'globalThis.__A = { d: decompose, R: ROOTS, W: WHOLE_ONLY, B: BASEWORDS, BB: BASEWORDS_BATCH };',
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
  if (w.length < 6) continue;                       // 短词当基词容易误伤（defer→def+er 那类）
  if (EX.includes(w)) continue;
  if (A.R[w] || A.W[w] || A.B[w]) continue;         // 已是词根/整词表/基本词，不重复登记
  const forms = [w, w + 's', w + 'es', w.replace(/y$/, 'ies')];
  if (forms.some(f => guarded.has(f))) continue;
  pick.push(w);
}
console.log('本轮挑中 ' + pick.length + ' 个词: ' + pick.join(' '));

/* 取中文释义当基本词含义：优先 ecdict，退化 enhanced，再退化占位 */
const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const glossOf = w => {
  const ec = D.ec[w] || {};
  return clean(ec.t || ec.translation) || clean(D.en[w] && (D.en[w].m || D.en[w].meaning)) || '（见词典）';
};

/* 该词会被这条登记影响的词形（基本词闸门只在剥变形后缀时生效，所以看变形） */
const probes = w => [w + 's', w + 'es', w.replace(/y$/, 'ies'), w + 'ed', w + 'ing', w + 'er'];
const probeWords = [...new Set(pick.flatMap(probes))].filter(p => /^[a-z]{3,}$/.test(p));
const probeBefore = new Set(probeWords.filter(p => !ok(p)));

/* 在内存里登记（BASEWORDS_BATCH + BASEWORDS 同步，模拟 index.html 里的合并动作） */
pick.forEach(w => { const gl = glossOf(w); A.BB[w] = gl; if (!Object.prototype.hasOwnProperty.call(A.B, w)) A.B[w] = gl; });

const probeAfter = new Set(probeWords.filter(p => !ok(p)));
const gains = [...probeBefore].filter(p => !probeAfter.has(p));
const allAfter = words.filter(w => !ok(w));
const afterSet = new Set(allAfter);
const losses = allAfter.filter(w => !before.has(w));
console.log('自测 → 变形由无到有 ' + gains.length + '  全量拆解丢失 ' + losses.length + (losses.length ? '  (' + losses.slice(0, 8).join(', ') + ')' : ''));
if (gains.length) console.log('样例收益: ' + gains.slice(0, 12).join(' '));
if (DRY) { console.log('（DRYRUN，未写入）'); process.exit(0); }
if (losses.length > 0 || gains.length === 0) { console.log('*** 自测不过 → 一个字都没写 ***'); process.exit(1); }

/* 落盘：插到 BASEWORDS_BATCH 表末尾 */
const bs = L.findIndex(l => l.startsWith('const BASEWORDS_BATCH = {'));
const be = L.findIndex((l, i) => i > bs && l.trim() === '};');
if (bs < 0 || be < 0) { console.log('✗ BASEWORDS_BATCH 锚点没找到'); process.exit(1); }
if (L.slice(bs + 1, be).some(l => pick.some(w => l.startsWith('  "' + w + '":')))) {
  console.log('✗ 本批有词已在表里，放弃'); process.exit(1);
}
const lines = [];
for (let i = 0; i < pick.length; i += 3) {
  lines.push('  ' + pick.slice(i, i + 3).map(w => JSON.stringify(w) + ': ' + JSON.stringify(glossOf(w))).join(', ') + ',');
}
/* 按行数组重组：L 由 raw.split('\n') 得来，每个非末行自带行尾 \r，
   join('\n') 能原样还原；插入行补上 \r 就是 CRLF，不破坏行尾。 */
const CR = raw.indexOf('\r\n') >= 0 ? '\r' : '';
const txt = L.slice(0, be).concat(lines.map(l => l + CR), L.slice(be)).join('\n');
fs.writeFileSync(DIR + '/index.html', txt);
console.log('✅ 已写入 ' + pick.length + ' 条基本词');
