/* 词根词缀引擎测试工具（常驻，勿删）
   用法：
   node test_decompose.js 词1 词2 ...   → 打印每个词的拆解+演变链+同根词
   node test_decompose.js --diff        → 对比 git HEAD 与当前，全量 diff 受影响词
   node test_decompose.js --enhanced    → 检查 enhanced 空 breakdown 词是否被误触发
   注意：eval 是 const 作用域隔离，测试代码需拼进同一 eval。
*/
const fs = require('fs');
const { execSync } = require('child_process');
const DIR = 'D:/Program Files/词根词缀';

function loadCore(content) {
  const lines = content.split('\n');
  const start = lines.findIndex(l => l.includes('<script id="core">')) + 1;
  const end = lines.findIndex((l, i) => l.trim() === '</script>' && i > start);
  return lines.slice(start, end).join('\n');
}

const args = process.argv.slice(2);
const currentCore = loadCore(fs.readFileSync(DIR + '/index.html', 'utf8'));

if (args.includes('--diff')) {
  const oldCore = loadCore(execSync(`git -C "${DIR}" show HEAD:index.html`).toString('utf8'));
  const dict = JSON.parse(fs.readFileSync(DIR + '/ecdict.json', 'utf8'));
  // 默认定向子串：没传子串时自动对比 git HEAD 与当前，取词根/前缀/后缀表【新增或删减】的词素当子串过滤。
  // 裸 --diff 不再全扫 75.7 万词——那是每词跑一遍 decompose 的计算开销（数据本就全在内存，换数据库提速不了）；
  // 对"仅增删词素"的改动，子串过滤是受影响词的精确超集。评分 SCORE 或拆解算法改变才牵连任意词→需全量。
  // 也可手动传子串（优先用自选）：node test_decompose.js --diff proto zoa zoo stice
  const subs = args.filter(a => a !== '--diff');
  const tableKeys = core => {
    const load = `JSON.stringify({r:Object.keys(ROOTS),p:Object.keys(PREFIXES),s:Object.keys(SUFFIXES)})`;
    return JSON.parse(eval(core + load));
  };
  const o = tableKeys(oldCore), n = tableKeys(currentCore);
  const os = new Set([...o.r, ...o.p, ...o.s]), ns = new Set([...n.r, ...n.p, ...n.s]);
  const diffs = [...ns].filter(k => !os.has(k)).concat([...os].filter(k => !ns.has(k)));
  const sc = c => (c.match(/const SCORE\s*=\s*\{[^}]*\}/) || [''])[0];
  const scoreChanged = sc(oldCore) !== sc(currentCore);
  const useSubs = subs.length ? subs : (scoreChanged ? [] : diffs);
  const notes = subs.length ? '手动: ' + subs.join(',')
    : (scoreChanged ? '评分/算法改动→需全量' : (diffs.length ? '定向: ' + diffs.join(',') : '词素表无增减'));
  const skip = !scoreChanged && !useSubs.length;
  const ws = skip ? [] : Object.keys(dict).filter(w => w.length < 40 && /[a-z]{3}/.test(w)
    && (useSubs.length === 0 || useSubs.some(s => w.includes(s))));
  console.log(skip
    ? '词根/前缀/后缀表无增减——无结构变化可跳过；若只改了释义/词源文案，diff 不反映，可忽略。'
    : '扫描词数: ' + ws.length + ' (' + notes + ')');
  const probe = `
function sig(w) {
  const d = decompose(w);
  if (!d) return null;
  return (d.prefix ? d.prefix.m + '|' : '') + (d.roots || []).map(r => r.m).join('+') + (d.suffixes || []).map(s => '-' + s.m).join('');
}
const words = __WORDS__;
const res = {};
for (const w of words) res[w] = sig(w);
JSON.stringify(res);
`;
  const run = c => JSON.parse(eval(c + probe.replace('__WORDS__', JSON.stringify(ws))));
  const oldR = run(oldCore), newR = run(currentCore);
  const changed = [];
  for (const w of ws) if (oldR[w] !== newR[w]) changed.push({ w, old: oldR[w] || '∅', neu: newR[w] || '∅' });
  console.log('受影响词数:', changed.length);
  changed.forEach(c => console.log(c.w.padEnd(24), '[' + c.old + '] -> [' + c.neu + ']'));
} else if (args.includes('--guard')) {
  // 回归守护：对照 guard_words.json，任何词拆解变化立即报警
  const guard = JSON.parse(fs.readFileSync(DIR + '/guard_words.json', 'utf8'));
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
const words = __WORDS__;
const res = {};
for (const w of words) {
  res[w] = { d: fmt(decompose(w)), p: fmt(partialDecompose(w)) };
}
JSON.stringify(res);
`;
  const all = {};
  for (const [cat, ws] of Object.entries(guard)) {
    if (cat === '说明') continue;
    for (const w of Object.keys(ws)) all[w] = ws[w];
  }
  const words = Object.keys(all);
  const got = JSON.parse(eval(currentCore + probe.replace('__WORDS__', JSON.stringify(words))));
  let fail = 0;
  for (const w of words) {
    const exp = all[w];
    const g = got[w];
    if (exp.d !== undefined && g.d !== exp.d) { console.log('✗', w.padEnd(14), 'decompose 期望[' + exp.d + '] 实得[' + g.d + ']'); fail++; }
    if (exp.p !== undefined && g.p !== exp.p) { console.log('✗', w.padEnd(14), 'partial 期望[' + exp.p + '] 实得[' + g.p + ']'); fail++; }
  }
  console.log(fail === 0 ? '✓ 守护清单全部通过 (' + words.length + ' 词)' : '✗ ' + fail + ' 个词回归！');
} else if (args.includes('--audit')) {
  // enhanced 全量审计：用 chain(真实词源) 当 ground truth，跑引擎拆解对比
  // 输出词素匹配率统计 + 匹配率低的词（疑似误拆），供人工复核
  const enh = JSON.parse(fs.readFileSync(DIR + '/enhanced.json', 'utf8'));
  const words = [];
  for (const [w, e] of Object.entries(enh)) {
    if (e && e.chain && e.chain.length && w.length <= 30) {
      words.push({ w, chain: e.chain.map(c => c.m).filter(m => typeof m === 'string') });
    }
  }
  const probe = `
function emorphs(w) {
  const d = decompose(w);
  if (!d) return null;
  const arr = [];
  if (d.prefix) arr.push(d.prefix.m.replace(/-.*$/, ''));
  (d.roots || []).forEach(r => arr.push(r.m));
  (d.suffixes || []).forEach(s => arr.push(s.m));
  return arr;
}
function matchRate(cms, ems) {
  let m = 0;
  for (const cm of cms) {
    const ok = ems.some(em => em === cm || (em.length >= 2 && cm.length >= 2 && (em.startsWith(cm) || cm.startsWith(em))));
    if (ok) m++;
  }
  return cms.length ? m / cms.length : 1;
}
const words = __WORDS__;
const stat = { total: 0, null: 0, partialOnly: 0, complete: 0, low: 0 };
const low = [];
for (const item of words) {
  const w = item.w;
  const ems = emorphs(w);
  stat.total++;
  if (!ems) { stat.null++; continue; }
  const rate = matchRate(item.chain, ems);
  if (rate === 0) { stat.null++; continue; }  // 引擎词素完全对不上，当漏拆
  stat.complete++;
  if (rate < 0.4) {
    stat.low++;
    low.push(w + '  chain=[' + item.chain.join(',') + ']  引擎=[' + ems.join(',') + '] 匹配率=' + rate.toFixed(2));
  }
}
console.log('总词数:', stat.total, ' 引擎未拆出:', stat.null, ' 完整拆解:', stat.complete, ' 低匹配(<0.4):', stat.low);
console.log('=== 低匹配词（疑似误拆）===');
console.log(low.join('\\n'));
`;
  console.log(eval(currentCore + probe.replace('__WORDS__', JSON.stringify(words))));
} else if (args.includes('--enhanced')) {
  const oldCore = loadCore(execSync(`git -C "${DIR}" show HEAD:index.html`).toString('utf8'));
  const enh = JSON.parse(fs.readFileSync(DIR + '/enhanced.json', 'utf8'));
  const ws = Object.entries(enh).filter(([, e]) => !e.breakdown || !e.breakdown.length).map(([w]) => w);
  const probe = `
const words = __WORDS__;
const res = {};
for (const w of words) res[w] = enhancedMorphFallback(w) !== '';
JSON.stringify(res);
`;
  const run = c => JSON.parse(eval(c + probe.replace('__WORDS__', JSON.stringify(ws))));
  const oldR = run(oldCore), newR = run(currentCore);
  const changed = [];
  for (const w of ws) if (oldR[w] !== newR[w]) changed.push({ w, old: oldR[w], neu: newR[w] });
  console.log('enhanced 空 breakdown 词数:', ws.length, '受影响:', changed.length);
  changed.forEach(c => console.log(c.w.padEnd(24), '旧:', c.old, '-> 新:', c.neu));
} else {
  // 默认：查指定词的拆解+演变链+同根词
  const words = args.length ? args : ['triceratops'];
  const probe = `
buildIndex();
const words = __WORDS__;
for (const w of words) {
  const bd = decompose(w) || partialDecompose(w);
  let line = w.padEnd(18);
  if (!bd) line += '(无拆解)';
  else {
    line += '=> ' + (bd.prefix ? bd.prefix.m + '|' : '') + (bd.roots || []).map(r => r.m).join('+')
      + (bd.suffixes || []).map(s => '-' + s.m).join('') + (bd.unknown ? '|??' + bd.unknown : '');
    const h = morphBlockHTML(w, bd);
    const ci = h.indexOf('词源演变链');
    if (ci >= 0) {
      const clean = h.slice(ci, ci + 600).replace(/<[^>]*>/g, '');
      line += '  演变链: ' + clean.replace(/  +/g, ' ').slice(0, 130);
    }
  }
  console.log(line);
  // 同根词
  const c = findCognates(w);
  const morphs = c.morphs.map(m => m.m + '->[' + m.words.slice(0, 10).join(',') + ']').join('; ');
  const srcs = c.srcs.map(s => s.lang + s.word + '->[' + s.words.slice(0, 6).join(',') + ']').join('; ');
  if (morphs || srcs) console.log('  └ 同根: ' + (morphs + (morphs && srcs ? ' | ' : '') + srcs));
}
`;
  eval(currentCore + probe.replace('__WORDS__', JSON.stringify(words)));
}
