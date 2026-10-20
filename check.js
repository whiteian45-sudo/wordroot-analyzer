/* 一键体检 + 历史趋势（对应评审建议 #12）
   跑：node check.js   （或双击 check.bat）
   做：体检 → 守护 → 审计 → 把数字追加进 history.json → 打印趋势
   失败（体检/守护不过）时退出码为 1，可用于 CI 或提交前拦截。 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const HIST = path.join(DIR, 'history.json');

function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

console.log('=== 1/3 体检 ===');
const h = run('node test_health.js');
const hOK = h.ok && /体检通过/.test(h.out) && !/✗/.test(h.out);
(h.out.match(/✓[^\n]*/g) || []).slice(0, 8).forEach(l => console.log('  ' + l.trim()));
console.log(hOK ? '  ✓ 体检通过' : '  ✗ 体检未通过');

console.log('=== 2/3 守护 ===');
const g = run('node test_decompose.js --guard');
const gOK = g.ok && /守护清单全部通过/.test(g.out) && !/✗/.test(g.out);
console.log('  ' + (gOK ? '✓ 守护 738 全过' : '✗ 守护有回归'));

console.log('=== 3/3 审计 ===');
const a = run('node test_decompose.js --audit --brief');
const m = a.out.match(/未拆出:\s*(\d+)\s+完整拆解:\s*(\d+)\s+低匹配\(<0\.4\):\s*(\d+)/);
if (!m) { console.log('  ✗ 审计输出解析失败'); process.exit(1); }
const rec = { time: new Date().toISOString().slice(0, 19).replace('T', ' '), unD: +m[1], full: +m[2], low: +m[3], guard: gOK, health: hOK };
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: DIR, encoding: 'utf8' }).trim(); } catch (e) { }
rec.commit = commit;

let hist = [];
try { hist = JSON.parse(fs.readFileSync(HIST, 'utf8')); if (!Array.isArray(hist)) hist = []; } catch (e) { hist = []; }
const last = hist[hist.length - 1];
hist.push(rec);
fs.writeFileSync(HIST, JSON.stringify(hist, null, 1));

const d = (k, v) => (last && typeof last[k] === 'number') ? (v - last[k] >= 0 ? ' (+' + (v - last[k]) + ')' : ' (' + (v - last[k]) + ')') : '';
console.log('  未拆出 ' + rec.unD + d('unD', rec.unD) + ' | 完整拆解 ' + rec.full + d('full', rec.full) + ' | 低匹配 ' + rec.low + d('low', rec.low));
console.log('  已记入 history.json（共 ' + hist.length + ' 条记录，HEAD=' + (commit || '?') + '）');

const prev = hist.slice(-11, -1);
if (prev.length) {
  console.log('=== 最近 10 次趋势（未拆出）===');
  prev.concat([rec]).forEach(r => console.log('  ' + r.time + '  ' + r.commit.padEnd(8) + ' 未拆出 ' + String(r.unD).padStart(5) + '  低匹配 ' + String(r.low).padStart(4)));
}
const bad = !hOK || !gOK;
console.log(bad ? '\n*** 有检查未通过（退出码 1）***' : '\n✅ 全部通过');
process.exit(bad ? 1 : 0);
