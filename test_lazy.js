/* test_lazy.js —— 按需词典 / 自动纠错 / 直接输入 的端到端验证
 *
 * 用法：先起主服务（双击 start.bat 或 python server.py），再 node test_lazy.js
 * 需要本机有 Chrome（或 Edge，自动回退）；跑完自动关掉 headless 浏览器。
 *
 * 为什么单独一支：这三块都是 2026-10-25 改的，且都是"异步 + 按需取词"，
 * test_health.js 那种纯静态检查看不到它们真的能不能跑。检查项：
 *   1) LAZY_DICT 是否启用、ECDICT 是否真的没被整包塞满
 *   2) 常用词（enhanced 命中）不该打 /lookup 请求
 *   3) 长尾词（只有 ecdict 有）/ 短语 / 段落模式 都能按需取回来
 *   4) 自动纠错横幅 + 「保留原词」不被反复纠回（死循环回归）
 *   5) 焦点不在输入框时直接敲字母能开始查新词
 * 任一失败退出码为 1。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const PORT = 9223;
const URL = 'http://127.0.0.1:8756/';
const CHROME = process.env.WR_CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(p => fs.existsSync(p));

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const ok = (name, pass, detail) => {
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + (detail ? '：' + detail : ''));
  if (!pass) failed++;
};

(async () => {
  if (!CHROME) { console.log('✗ 找不到 Chrome/Edge，可用 WR_CHROME=<路径> 指定'); process.exit(1); }
  const userData = path.join(process.env.TEMP || '.', 'cdp_lazy_' + process.pid);
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userData, '--disable-gpu', '--no-first-run',
    '--window-size=1440,1000', 'about:blank'], { detached: true, stdio: 'ignore' });

  const cleanup = () => {
    try { proc.kill(); } catch (e) {}
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch (e) {}
  };

  await sleep(1500);
  let tab = null;
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' });
      tab = await r.json(); break;
    } catch (e) { await sleep(500); }
  }
  if (!tab) { console.log('✗ 无法连接 CDP（Chrome 没起来？）'); cleanup(); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pending = {}; const errors = [];
  const send = (method, params) => new Promise(res => {
    const mid = ++id; pending[mid] = res;
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
  };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async (expr, awaitP) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP });
    if (r.exceptionDetails) return 'EVAL 失败：' + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  };

  // 数一下 /lookup 打了几次：用来证明"常用词不发请求"
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "window.__lookupCalls=0;(function(){const f=window.fetch;window.fetch=function(u){try{if(String(u).includes('/lookup'))window.__lookupCalls++;}catch(e){}return f.apply(this,arguments);};})();"
  });

  const t0 = Date.now();
  await send('Page.navigate', { url: URL });
  let ready = false;
  for (let i = 0; i < 360; i++) {
    await sleep(500);
    if (await ev('typeof DATA_READY !== "undefined" && DATA_READY')) { ready = true; break; }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('=== 装载 ===');
  ok('页面就绪', ready, secs + 's');
  const lazy = await ev('LAZY_DICT');
  const keys = await ev('Object.keys(ECDICT).length');
  if (!lazy) {
    console.log('  · 本次走的是整包模式（没有 dict.db），按需相关的检查跳过');
    console.log('  · ECDICT =', keys);
  } else {
    ok('按需词典已启用', lazy === true);
    ok('启动时没有把全量词典塞进内存', keys < 5000, 'ECDICT=' + keys + ' 条');
  }

  if (lazy) {
    console.log('=== 查词 ===');
    const c0 = await ev('window.__lookupCalls');
    const common = await ev(`(async()=>{ input.value='transport'; await search();
      const h=document.getElementById('result').innerHTML;
      return h.includes('词根词缀分解') && h.includes('transport'); })()`, true);
    ok('常用词走考试词库', common === true);
    ok('常用词不发 /lookup 请求', (await ev('window.__lookupCalls')) === c0, '请求数 ' + c0 + ' → ' + await ev('window.__lookupCalls'));

    const longtail = await ev(`(async()=>{ input.value='zyzzyva'; await search();
      return document.getElementById('result').innerHTML.includes('象鼻虫'); })()`, true);
    ok('长尾词按需取回（zyzzyva）', longtail === true);

    const phrase = await ev(`(async()=>{ input.value='give up'; await search();
      const h=document.getElementById('result').innerHTML;
      return h.includes('短语') && h.includes('放弃'); })()`, true);
    ok('短语卡按需取回（give up）', phrase === true);

    const para = await ev(`(async()=>{ input.value='The zyzzyva escaped from the microfiche. Transport arrived.'; await search();
      await new Promise(r=>setTimeout(r,600));
      const h=document.getElementById('result').innerHTML;
      return h.includes('class="para"') && (h.match(/class="ptok"/g)||[]).length >= 3; })()`, true);
    ok('段落模式批量取词', para === true);
  }

  console.log('=== 自动纠错 ===');
  const ac = await ev(`(async()=>{ input.value='recieve'; await search();
    const h=document.getElementById('result').innerHTML;
    return input.value + '|' + h.includes('spell-autocorrect') + '|' + h.includes('receive'); })()`, true);
  ok('拼错自动改查正确词 + 出横幅', ac === 'receive|true|true', String(ac));

  const undo = await ev(`(async()=>{
    const b=document.querySelector('[data-ac-undo]'); if(!b) return '无按钮';
    b.click(); await new Promise(r=>setTimeout(r,300));
    const h=document.getElementById('result').innerHTML;
    return input.value + '|' + h.includes('spell-autocorrect') + '|' + h.includes('你是不是想查'); })()`, true);
  ok('「保留原词」生效且不被反复纠回', undo === 'recieve|false|true', String(undo));

  console.log('=== 键盘 ===');
  const typed = await ev(`(()=>{ input.blur(); input.value='transport';
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true,cancelable:true}));
    return input.value + '|' + (document.activeElement===input); })()`);
  ok('直接敲字母即开始查新词', typed === 'z|true', String(typed));

  console.log('=== 复习 ===');
  const rev = await ev(`(async()=>{ await startReview(true);
    return !!document.querySelector('.rev-word') || document.getElementById('history').innerHTML.includes('复习'); })()`, true);
  ok('复习会话能起来（含按需补词）', rev === true);

  console.log('=== 运行时异常 ===');
  ok('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' / '));

  ws.close(); cleanup();
  console.log(failed ? '\n✗ ' + failed + ' 项未通过' : '\n✅ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('验证失败:', e.message); process.exit(1); });
