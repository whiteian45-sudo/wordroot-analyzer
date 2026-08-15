/* 评分调参实验工具（常驻）：验证不同 SCORE 权重下，清空 ROOT_BLOCK 后
   守护词能否靠纯评分拆对、病根词是否自愈、误伤哨兵是否守住。
   用法：node tune_scoring.js
   改 tunables 里的参数范围后重跑。 */
const fs = require('fs');
const DIR = 'D:/Program Files/词根词缀';
const lines = fs.readFileSync(DIR + '/index.html', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('<script id="core">')) + 1;
const end = lines.findIndex((l, i) => l.trim() === '</script>' && i > start);
const core = lines.slice(start, end).join('\n');

// 观察词集
const guard = {};
const gj = JSON.parse(fs.readFileSync(DIR + '/guard_words.json', 'utf8'));
for (const [cat, ws] of Object.entries(gj)) {
  if (cat === '说明') continue;
  for (const [w, v] of Object.entries(ws)) guard[w] = v.d;
}
// 病根词：过去靠 ROOT_BLOCK 才拆对的
const rootsW = ['astrophile', 'anastrophe', 'retropatellar', 'dorough', 'eavestrough', 'tropism', 'entropy', 'trophic', 'isometric', 'complete', 'apply', 'unhappiness', 'astrophysics', 'diastrophe'];
// 误伤哨兵：绝不能错拆的词
const sentinels = ['cerate', 'coops', 'wallops', 'losses', 'benches', 'services', 'examples', 'isolate', 'family', 'only', 'willing', 'fetter', 'spleen', 'canary', 'mobile', 'graduate', 'document', 'eviscerated', 'incarcerated', 'zoomed', 'zoonose', 'zoonotic', 'protocol', 'binary', 'protonation', 'unprotonated', 'astrophil'];

const tunables = [];
for (const SUF of [0, 2, 3, 5, 7, 9]) {
  for (const PRE of [0.2, 0.5, 1.0]) {
    tunables.push({ SUF, PRE });
  }
}

const probe = `
function fmt(x) {
  if (!x) return null;
  let s = '';
  if (x.prefix) s += x.prefix.m + '|';
  if (x.roots) s += x.roots.map(r => r.m).join('+');
  if (x.suffixes) s += x.suffixes.map(sf => '-' + sf.m).join('');
  if (x.unknown) s += '|??' + x.unknown;
  return s;
}
const combos = __COMBOS__;
const guard = __GUARD__;
const rootsW = __ROOTSW__;
const sentinels = __SENTINELS__;
const out = [];
for (const c of combos) {
  SCORE.SUF = c.SUF; SCORE.PRE = c.PRE;
  // 清空 ROOT_BLOCK，纯评分测试
  for (const k of Object.keys(ROOT_BLOCK)) delete ROOT_BLOCK[k];
  const gFail = [];
  for (const [w, sig] of Object.entries(guard)) {
    const got = fmt(decompose(w));
    if (got !== sig) gFail.push(w + '(' + sig + '≠' + got + ')');
  }
  const rRes = {}; for (const w of rootsW) rRes[w] = fmt(decompose(w));
  const sBad = [];
  for (const w of sentinels) {
    const got = fmt(decompose(w));
    if (got !== null) sBad.push(w + '(' + got + ')');
  }
  out.push({ SUF: c.SUF, PRE: c.PRE, gFail: gFail.slice(0, 10), gf: gFail.length, rRes, sBad });
}
JSON.stringify(out);
`;

const result = JSON.parse(eval(core + probe
  .replace('__COMBOS__', JSON.stringify(tunables))
  .replace('__GUARD__', JSON.stringify(guard))
  .replace('__ROOTSW__', JSON.stringify(rootsW))
  .replace('__SENTINELS__', JSON.stringify(sentinels))));

for (const r of result) {
  const ok = r.gf === 0;
  console.log(`SUF=${r.SUF} PRE=${r.PRE}  guard失败=${r.gf} ${ok ? '✓' : '✗'} ${ok ? '' : '  [' + r.gFail.join(',') + ']'}`);
  if (ok) {
    // 打印病根词结果（清空 ROOT_BLOCK 后靠纯评分）
    const selfHeal = Object.entries(r.rRes)
      .filter(([w, v]) => v === 'astro+phil-e' || v === 'com|plete' || v === 'ap|ply' || v === 'trop-ism' || v === 'en|trop-y' || v === 'troph-ic' || v === 'iso|metr-ic' || v === 'un-happi-ness' || v === 'un-happi+ness');
    console.log('   病根词(纯评分):', JSON.stringify(r.rRes));
    console.log('   误伤哨兵违规:', r.sBad.length ? r.sBad.join(', ') : '无');
  }
}
