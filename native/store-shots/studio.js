// Minimal Chrome driver for the promo pipeline: launch headless Chrome, talk
// DevTools protocol, evaluate, screenshot. Run with node --experimental-websocket.
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function chrome({ gpu = false } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'arete-studio-'));
  const args = ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com',
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--disable-background-networking', '--disable-sync',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--force-color-profile=srgb', '--font-render-hinting=none'];
  if (!gpu) args.push('--disable-gpu');
  args.push('about:blank');
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await new Promise((res, rej) => { let buf = ''; const to = setTimeout(() => rej(new Error('no chrome')), 20000);
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//); if (m) { clearTimeout(to); res(m[1]); } }); });
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let seq = 0; const pending = new Map(), handlers = {}, errors = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
      (handlers[m.method] || []).forEach(f => f(m.params)); } };
  // Every call times out, so a hung renderer fails loudly instead of waiting forever.
  const send = (method, params = {}, ms = 45000) => new Promise((res, rej) => { const id = ++seq;
    const to = setTimeout(() => { pending.delete(id); rej(new Error(`timeout: ${method}`)); }, ms);
    pending.set(id, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  const once = ev => new Promise(r => { (handlers[ev] = handlers[ev] || []).push(function h(p) { handlers[ev] = handlers[ev].filter(x => x !== h); r(p); }); });
  return {
    send, once, errors,
    async size(width, height, scale = 1, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile }); },
    async open(url) { const l = once('Page.loadEventFired'); await send('Page.navigate', { url }); await l; },
    async eval(expression) { const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text); return result.value; },
    async shot(out, opts = {}) { const { data } = await send('Page.captureScreenshot', { format: opts.format || 'png', quality: opts.quality, optimizeForSpeed: true, captureBeyondViewport: false, ...(opts.clip ? { clip: opts.clip } : {}) });
      const buf = Buffer.from(data, 'base64'); if (out) fs.writeFileSync(out, buf); return buf; },
    close() { try { ws.close(); } catch {} proc.kill('SIGKILL'); },
  };
}
module.exports = { chrome, sleep };
