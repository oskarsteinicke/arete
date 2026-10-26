// Screenshots of every main screen, for comparing a visual change before and
// after it lands. Uses the same month of data as the store screenshots.
//
//   node --experimental-websocket native/shoot-brand.js <label>
//
// Writes brand-shots/<label>/<screen>-<phone|desktop>-<dark|light>.png outside
// the repo (see OUT). Phone shots are the whole scrolled page at 375px;
// desktop shots are the first screen at 1280x800.
const http = require('http'), fs = require('fs'), path = require('path');
const { launch } = require('./capture.js');

const ROOT = path.join(__dirname, '..');
const LABEL = process.argv[2] || 'shots';
const OUT = path.join(process.env.BRAND_OUT || path.join(require('os').tmpdir(), 'arete-brand-shots'), LABEL);
const PORT = 4210;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

// The store screenshots' month of data, reused rather than copied.
const storeSrc = fs.readFileSync(path.join(__dirname, 'shoot-store-assets.js'), 'utf8');
const SEED = eval('`' + storeSrc.slice(storeSrc.indexOf('const SEED = `') + 'const SEED = `'.length, storeSrc.indexOf('})();`;') + 5) + '`');

// [name, hash, extra script run after load, needs fresh (not onboarded) state]
const SCREENS = [
  ['home', 'home'],
  ['habits', 'habits'],
  ['nutrition', 'diet'],
  ['workout', 'workout'],
  ['session', 'workoutActive'],
  ['journal', 'library', `libTab = 'journal'; go('library', {}, false);`],
  ['coach', 'home', `openCoach(); document.activeElement && document.activeElement.blur();`],
  ['profile', 'stats'],
  ['signin', 'home', `_authMode = 'signin'; renderAuth();`],
  ['onboarding', 'home', '', true],
];

function page(hash, theme, fresh) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const extra = `(function () {
    ${fresh ? `localStorage.clear(); localStorage.setItem('hvi_from_landing', '1');` : ''}
    const s = JSON.parse(localStorage.getItem('hvi_settings') || '{}'); s.theme = '${theme}'; localStorage.setItem('hvi_settings', JSON.stringify(s));
    localStorage.setItem('hvi_ai_consent', 'yes');
    localStorage.setItem('hvi_coach_history', JSON.stringify([
      { role: 'user', content: 'Should I train today?' },
      { role: 'assistant', content: 'Yes. You slept 7h 30m and your last leg day was three days ago. Do Push A as planned and stop one rep short on the last set of bench.' }]));
  })();`;
  html = html.replace('<head>', `<head>\n<script>\n${SEED}\n${extra}\nlocation.hash = ${JSON.stringify(hash)};\n</script>`);
  html = html.replace(/\(window\.requestIdleCallback\|\|function\(cb\)\{setTimeout\(cb,800\)\}\)\(function\(\)\{[\s\S]*?\}\);/, '/* lazy loader replaced */');
  return html.replace('</head>', '<script src="coach.js"></script><script src="social.js"></script><script src="bodymap.js"></script>\n</head>');
}

let current = null;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__shot') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end(page(current.hash, current.theme, current.fresh));
  }
  if (/service-worker\.js$/.test(u.pathname)) { res.writeHead(404); return res.end(); }
  const file = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
server.listen(PORT, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await launch();
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  try {
    for (const theme of ['dark', 'light']) {
      for (const [name, hash, after, fresh] of SCREENS) {
        if (only && !only.includes(name)) continue;
        for (const [size, w, h, full] of [['phone', 375, 812, true], ['desktop', 1280, 800, false]]) {
          current = { hash, theme, fresh };
          // Let the whole scrolled page lay out for a full-length phone shot.
          const before = `(async () => {
            ${after || ''}
            await new Promise(r => setTimeout(r, 900));
            ${full ? `const st = document.createElement('style'); st.textContent = 'html,body{height:auto!important;overflow:visible!important}#app{height:auto!important}.view{overflow:visible!important;height:auto!important}#install-banner{display:none!important}'; document.head.appendChild(st);` : ''}
          })()`;
          const out = path.join(OUT, `${name}-${size}-${theme}.png`);
          await c.shoot({ url: `http://localhost:${PORT}/__shot?r=${Math.random()}`, width: w, height: h, scale: size === 'phone' ? 2 : 1,
            settleMs: 2600, out, before, fullPage: full && !['coach', 'signin', 'onboarding'].includes(name) });
          console.log(`  ${path.basename(out)}`);
        }
      }
    }
    const errs = c.errors().filter(e => !/ServiceWorker/.test(e));
    if (errs.length) console.log('page errors:', errs.slice(0, 5));
  } catch (e) { console.error('FAILED:', e.message); process.exitCode = 1; }
  finally { await c.close(); server.close(); process.exit(); }
});
