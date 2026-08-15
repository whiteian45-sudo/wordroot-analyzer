/* UI 真机验证（常驻）：headless Chrome 打开 8756 页面，验证加载遮罩出现→淡出→移除。
   用法：node test_ui.js（需主服务在跑） */
const { spawn } = require('child_process');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9222;
const URL = 'http://127.0.0.1:8756/';
const DIR = 'D:/Program Files/词根词缀';
const userData = process.env.TEMP + '/cdp_ui_' + process.pid;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userData, '--disable-gpu', '--no-first-run',
    '--window-size=1280,820', 'about:blank'
  ], { detached: true, stdio: 'ignore' });

  await sleep(1500);
  // 创建新 tab
  let tab;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' });
      tab = await r.json();
      break;
    } catch (e) { await sleep(500); }
  }
  if (!tab) { console.log('✗ 无法连接 CDP'); proc.kill(); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id;
    pending[mid] = { res, rej };
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) { pending[m.id].res(m.result); delete pending[m.id]; }
  };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('Runtime.enable');

  // 导航到页面，加载中途截图（遮罩应显示）
  await send('Page.navigate', { url: URL });
  await sleep(500);
  const mid = await send('Runtime.evaluate', {
    expression: "!!document.getElementById('load-mask')",
    returnByValue: true
  });
  console.log('加载中途: 遮罩存在 =', mid.result.value);

  // 等加载完成
  await sleep(3000);
  const mask = await send('Runtime.evaluate', {
    expression: "document.getElementById('load-mask') ? 'mask仍在' : 'mask已移除'",
    returnByValue: true
  });
  const state = await send('Runtime.evaluate', {
    expression: "'DATA_READY=' + DATA_READY + ' ECDICT=' + Object.keys(ECDICT).length + ' ENHANCED=' + Object.keys(ENHANCED).length",
    returnByValue: true
  });
  console.log('加载完成: ', mask.result.value, '|', state.result.value);

  // 模拟拖拽 transport → 验证自动分析（不再手动点按钮）
  const drag = await send('Runtime.evaluate', {
    expression: `
      const dt = new DataTransfer();
      dt.setData('text/plain', 'transport');
      document.getElementById('input').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      'input=' + document.getElementById('input').value + ' | result=' + document.getElementById('result').innerHTML.length + '字符 | 含分解=' + document.getElementById('result').innerHTML.includes('词根词缀分解');
    `,
    returnByValue: true
  });
  console.log('拖拽自动分析: ', drag.result.value);

  // 截图确认界面正常
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(DIR + '/_ui_test.png', Buffer.from(shot.data, 'base64'));
  console.log('截图: ' + DIR + '/_ui_test.png');

  ws.close(); proc.kill();
  try { require('child_process').execSync('rm -rf "' + userData + '"'); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('验证失败:', e.message); process.exit(1); });
