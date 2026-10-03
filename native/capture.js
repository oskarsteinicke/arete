// Screenshots through Chrome's DevTools protocol, at a real phone viewport.
//
// The obvious way — `chrome --headless --window-size=440,956 --screenshot` —
// is quietly wrong for anything narrower than 500px. Headless Chrome will not
// make a window narrower than that, so it lays the page out at 500 and then
// crops the capture back to the width you asked for. Every store screenshot
// taken that way lost its right edge: "WEDNESDAY, SE", "Stea", "Profi". The
// file is the right size and nothing reports an error.
//
// Emulation.setDeviceMetricsOverride has no such floor. It also sets `mobile`,
// which makes Chrome honour the page's viewport meta the way a phone does.
//
// Needs Node's WebSocket, which Node 20 keeps behind a flag:
//   node --experimental-websocket <script>
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch() {
  if (typeof WebSocket === 'undefined') {
    throw new Error('run with: node --experimental-websocket ' + path.basename(process.argv[1]));
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'arete-cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    // Google Fonts, analytics and the Discord count never resolve here, and a
    // pending request holds the load event open.
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
    '--disable-background-networking', '--no-first-run', '--disable-sync',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Chrome announces the port it picked on stderr.
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not start')), 15000);
    chrome.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    chrome.on('exit', code => reject(new Error('Chrome exited ' + code)));
  });

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map(), waiters = [], errors = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      // Uncaught page exceptions, so a caller can assert a page loaded clean.
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        errors.push((d.exception && d.exception.description || d.text || 'error').split('\n')[0]);
      }
      for (const w of [...waiters]) if (w.method === msg.method) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg.params); }
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = method => new Promise(resolve => waiters.push({ method, resolve }));

  await send('Page.enable');
  await send('Runtime.enable');

  return {
    // Load `url` at a phone-sized viewport, let it settle, optionally run
    // `before` in the page, and write a PNG. `fullPage` captures the whole
    // document instead of the viewport.
    async shoot({ url, width, height, scale = 3, out, settleMs = 2500, before, fullPage = false }) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: true });
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await loaded;
      await sleep(settleMs);
      if (before) {
        await send('Runtime.evaluate', { expression: before, awaitPromise: true });
        await sleep(400);
      }
      const params = { format: 'png' };
      if (fullPage) {
        const m = await send('Page.getLayoutMetrics');
        const h = Math.ceil((m.cssContentSize || m.contentSize).height);
        Object.assign(params, { captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: h, scale: 1 } });
      }
      const { data } = await send('Page.captureScreenshot', params);
      fs.writeFileSync(out, Buffer.from(data, 'base64'));
      // What the page actually laid out at, so a caller can prove it was not cropped.
      const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.clientWidth' });
      return { layoutWidth: result.value, bytes: fs.statSync(out).size };
    },
    // Capture the page as it is now, without reloading it, so a caller can
    // photograph a state it drove the page into.
    async snap(out) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(out, Buffer.from(data, 'base64'));
    },
    // Run an expression in the current page and return its value.
    async evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    },
    errors: () => errors.slice(),
    async close() {
      try { ws.close(); } catch {}
      try { chrome.kill('SIGKILL'); } catch {}
    },
  };
}

module.exports = { launch };
