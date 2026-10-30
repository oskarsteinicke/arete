// Store screenshots (captioned, brand look) and the Play feature graphic,
// made from the real app with the store screenshots' month of demo data.
//
//   node --experimental-websocket native/store-shots/store.js ios      -> native/store-assets-ios/
//   node --experimental-websocket native/store-shots/store.js play     -> native/store-assets/
//   node --experimental-websocket native/store-shots/store.js graphic  -> native/store-assets/00-feature-graphic.png
//
// The app runs on a virtual clock (vclock.js): timers and animations only move
// when the script advances them, so every capture is a settled, repeatable
// state. AI replies are canned (see mock), and the user is "Alex": the brand is
// faceless, so the founder's name never appears. No screen shows the character
// art, which is being redrawn.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { chrome, sleep } = require('./studio');

const APP = path.resolve(__dirname, '..', '..');
const NATIVE = path.resolve(__dirname, '..');
const PORT = 4290;
const TARGETS = {
  // vw x vh is the phone's screen in points. The native shells inset the web
  // view below the status bar and above the home indicator (iOS contentInset
  // "always"), so the app itself is captured at the height between them.
  ios:  { out: 'store-assets-ios', vw: 440, vh: 956, statusH: 62, bottomH: 34, W: 1320, H: 2868, device: 'ios' },
  play: { out: 'store-assets',     vw: 412, vh: 915, statusH: 30, bottomH: 20, W: 1440, H: 2880, device: 'android' },
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

// The month of demo data from shoot-store-assets.js, made faceless and given a
// short night, so the app's own sleep-to-training connection shows.
const storeSrc = fs.readFileSync(path.join(NATIVE, 'shoot-store-assets.js'), 'utf8');
let SEED = eval('`' + storeSrc.slice(storeSrc.indexOf('const SEED = `') + 'const SEED = `'.length, storeSrc.indexOf('})();`;') + 5) + '`');
SEED = SEED.replace("localStorage.setItem('hvi_user_name', 'Oskar');", "localStorage.setItem('hvi_user_name', 'Alex');")
  .replace('Trained before class for the fifth day running.', 'Trained early for the fifth day running.')
  .replace("S('hvi_from_landing', '1');", `S('hvi_from_landing', '1');
localStorage.setItem('hvi_install_dismissed', '1');
localStorage.setItem('hvi_ai_consent', 'yes');
S('hvi_coach_insight', { date: T, text: 'You slept 5 h 30 min. Keep Push A, drop the top set and go heavy on Saturday.' });
S('hvi_coach_history', []);
(function (S, dk, T) {
  const sl = JSON.parse(localStorage.getItem('hvi_sleep_log') || '{}');
  sl[T] = { bedtime: '01:12', wake: '06:42', hours: 5.5, quality: 2 }; S('hvi_sleep_log', sl);
  S('hvi_achievements', 'first_habit streak_3 streak_7 streak_30 perfect_day perfect_3 first_workout workouts_10 workouts_50 first_pr pr_5 journal_7 nutrition_7 level_5 level_10 all_pillars streak_14 streak_100 perfect_7 workouts_25 first_quest quests_7 pr_10 nutrition_30 sleep_7 sleep_30 xp_1000 xp_5000 perfect_14 workouts_100 pr_25 level_20 streak_60'.split(' '));
  const wl = JSON.parse(localStorage.getItem('hvi_workout_log') || '{}');
  let k = 0;
  for (const d of Object.keys(wl).sort()) {
    if (d === T) continue;
    const ex = (wl[d].exercises || []).find(e => e.exerciseId === 'bench_press');
    if (ex) { const w = 67.5 + 2.5 * k++; ex.sets.forEach(s => { s.weight = w; }); }
  }
  delete wl[T];
  S('hvi_workout_log', wl);
  S('hvi_workout_meta', { activeProgram: 'ppl', currentDayIndex: 0, lastWorkoutDate: dk(2) });
})(S, dk, T);`);

const MEAL = [
  { name: 'Eggs (2 large)', calories: 156, protein: 13, carbs: 1, fat: 11 },
  { name: 'Toast (2 slices)', calories: 160, protein: 6, carbs: 30, fat: 2 },
  { name: 'Coffee with milk', calories: 30, protein: 2, carbs: 3, fat: 1 },
];
const COACH = 'You slept **5 h 30 min** and your recovery is low. Keep Push A, drop the top set and go heavy on Saturday.';
const MOCK = `(url, opts) => {
  if (!/workers\\.dev/.test(url)) return null;
  const body = String(opts.body || '');
  if (/nutrition macro calculator/.test(body)) return { delay: 900, body: { choices: [{ message: { content: ${JSON.stringify(JSON.stringify(MEAL))} } }] } };
  if (/groq/.test(url)) return { delay: 1500, body: { choices: [{ message: { content: ${JSON.stringify(COACH)} } }] } };
  return null; }`;

const CSS = `<style>input, textarea { caret-color: transparent !important; } *:focus, *:focus-visible { outline: none !important; } #install-banner { display: none !important; }</style>`;
function appPage(view) {
  let html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const vclock = fs.readFileSync(path.join(__dirname, 'vclock.js'), 'utf8');
  html = html.replace('<head>', `<head>\n<script>${vclock}</script>\n<script>${SEED}\nlocation.hash = ${JSON.stringify(view)};\n</script>`);
  html = html.replace(/\(window\.requestIdleCallback\|\|function\(cb\)\{setTimeout\(cb,800\)\}\)\(function\(\)\{[\s\S]*?\}\);/, '/* lazy loader replaced */');
  return html.replace('</head>', `<script src="coach.js"></script><script src="social.js"></script><script src="bodymap.js"></script>${CSS}\n</head>`);
}

const tickThree = `['h01','h05','h07'].forEach(id => { try { tapHabit(id, ''); } catch (e) {} }); 0`;
const clean = `document.querySelectorAll('.milestone-overlay,.lvl-overlay,.streak-toast,.xp-toast,.toast,#ach-toast').forEach(e => e.remove()); 0`;
const setVal = (sel, v) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 0; })()`;

// [file, caption lines, background, start view, steps]
const SHOTS = [
  ['01-sleep-sets-the-session', ['YOUR SLEEP', 'SETS THE SESSION'], 'ink', 'stats', async d => {
    await d.js(`go('workout', {}, false)`); await d.settle(2600); }],
  // Opened over the nutrition screen: over home, the character shows behind the sheet.
  ['02-coach', ['A COACH THAT', 'KNOWS YOUR DAY'], 'cream', 'diet', async d => {
    await d.js(tickThree); await d.settle(2000); await d.js(clean);
    await d.js(`openCoach()`); await d.settle(900);
    await d.js(setVal('#coach-input', 'Should I go heavy today?'));
    await d.tap('#coach-send-btn'); await d.settle(3200); }],
  ['03-habits', ['BUILD HABITS', 'THAT STICK'], 'ink', 'stats', async d => {
    await d.js(tickThree); await d.settle(2500); await d.js(clean);
    await d.js(`go('habits', {}, false)`); await d.settle(1000);
    await d.tap(`[onclick^="tapHabit('h04'"]`); await d.settle(2800); await d.js(clean); await d.settle(200); }],
  ['04-nutrition', ['TYPE A MEAL.', "IT'S LOGGED"], 'cream', 'diet', async d => {
    await d.js(`go('dietAddMeal', {}, false)`); await d.settle(800);
    await d.js(`(() => { const sec = document.getElementById('describe-textarea').closest('.dm-section'); const v = document.getElementById('view'); v.scrollTop += sec.getBoundingClientRect().top - __TOP__; return 0; })()`);
    await d.settle(200);
    await d.js(setVal('#describe-textarea', 'Two eggs, toast and a coffee'));
    await d.tap('#calc-macros-btn'); await d.settle(1800); }],
  ['05-every-set', ['EVERY SET.', 'EVERY PR'], 'ink', 'workout', async d => {
    await d.js(`go('workoutActive', {}, false)`); await d.settle(1500); await d.js(clean);
    await d.tap('#w-check-0-0'); await d.settle(700);
    await d.tap('#w-check-0-1'); await d.settle(1600); }],
  ['06-muscle-map', ['SEE WHAT', 'YOU TRAINED'], 'cream', 'stats', async d => {
    await d.js(`go('workoutProgress', {}, false)`); await d.settle(2200);
    await d.js(`(() => { const el = document.querySelector('[aria-label="Muscle map coloured by training"]'); const v = document.getElementById('view'); v.scrollTop += el.getBoundingClientRect().top - __TOP__ - 120; return 0; })()`);
    await d.settle(900); }],
  ['07-journal', ['THREE QUESTIONS.', 'EVERY NIGHT'], 'ink', 'stats', async d => {
    await d.js(`libTab = 'journal'; go('library', {}, false)`); await d.settle(900);
    const tas = await d.js(`[...document.querySelectorAll('.j-ta')].map(t => '#' + t.id)`);
    const answers = ['Hit every set, even the last one.', 'Sleep matters more than I thought.', 'In bed by 11.'];
    for (let i = 0; i < 3 && i < tas.length; i++) await d.js(setVal(tas[i], answers[i]));
    await d.settle(800); }],
];

let current = { view: 'home' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__app') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); return res.end(appPage(current.view)); }
  if (u.pathname.startsWith('/__store/')) {
    const f = path.join(__dirname, u.pathname.slice(9));
    if (f.startsWith(__dirname) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(res); }
  }
  if (u.pathname.startsWith('/__raw/')) {
    const f = path.join(RAW, path.basename(u.pathname));
    if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': 'image/png' }); return fs.createReadStream(f).pipe(res); }
  }
  if (/service-worker\.js$/.test(u.pathname)) { res.writeHead(404); return res.end(); }
  const file = path.join(APP, decodeURIComponent(u.pathname));
  if (!file.startsWith(APP) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'arete-store-'));

// Chrome's PNGs carry an alpha channel, which App Store Connect rejects.
const flatten = f => execFileSync('python3', ['-c', `from PIL import Image; im = Image.open(${JSON.stringify(f)}).convert('RGB'); im.save(${JSON.stringify(f)}, optimize=True)`]);

async function captureApp(c, t) {
  await c.size(t.vw, t.vh - t.statusH - t.bottomH, 3, true);
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {});
  for (const [file, , , view, steps] of SHOTS) {
    current = { view };
    await c.open(`http://localhost:${PORT}/__app?r=${Math.random()}`);
    await c.eval('document.fonts.ready.then(() => 1)'); await sleep(300);
    await c.eval(`window.__mock = ${MOCK}`);
    const d = {
      js: e => c.eval(e.replace(/__TOP__/g, '16')),   // a little air above a section scrolled to the top
      async settle(ms) { for (let x = 0; x < ms; x += 1000 / 30) await c.eval('__advance(33.333)'); },
      async tap(sel) {
        const r = await c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        if (!r) throw new Error(`${file}: nothing at ${sel}`);
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      },
    };
    await d.settle(2500);
    await steps(d);
    const width = await c.eval('document.documentElement.clientWidth');
    if (width !== t.vw) throw new Error(`${file}: laid out at ${width}px, expected ${t.vw}px`);
    await c.shot(path.join(RAW, `${file}.png`));
    console.log('  captured', file);
  }
}

async function compose(c, t, which) {
  await c.size(t.W, t.H, 1, false);
  await c.open(`http://localhost:${PORT}/__store/store.html?r=${Math.random()}`);
  await c.eval('document.fonts.ready.then(() => 1)');
  const out = path.join(NATIVE, t.out); fs.mkdirSync(out, { recursive: true });
  for (const [file, caption, bg] of SHOTS) {
    await c.eval(`render(${JSON.stringify({ W: t.W, H: t.H, device: t.device, vw: t.vw, vh: t.vh, statusH: t.statusH, bottomH: t.bottomH, caption, bg, img: `/__raw/${file}.png` })})`);
    const f = path.join(out, `${file}.png`);
    await c.shot(f); flatten(f);
    console.log('  wrote', path.relative(APP, f));
  }
}

async function graphic(c) {
  await c.size(1024, 500, 1, false);
  await c.open(`http://localhost:${PORT}/__store/store.html?r=${Math.random()}`);
  await c.eval('document.fonts.ready.then(() => 1)');
  await c.eval('featureGraphic()');
  const f = path.join(NATIVE, 'store-assets', '00-feature-graphic.png');
  await c.shot(f); flatten(f);
  console.log('  wrote', path.relative(APP, f));
}

server.listen(PORT, async () => {
  const which = process.argv[2];
  if (!TARGETS[which] && which !== 'graphic') { console.error('usage: store.js ios|play|graphic'); process.exit(1); }
  const c = await chrome();
  try {
    if (which === 'graphic') await graphic(c);
    else { const t = TARGETS[which]; await captureApp(c, t); await compose(c, t, which); }
    const errs = c.errors.filter(e => !/ServiceWorker|Failed to fetch|groq|net::/.test(e));
    if (errs.length) console.log('page errors:', JSON.stringify(errs.slice(0, 6)));
  } catch (e) { console.log('FAILED', e.stack); process.exitCode = 1; }
  finally { c.close(); server.close(); fs.rmSync(RAW, { recursive: true, force: true }); process.exit(); }
});
