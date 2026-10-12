// The store builds talk to the same server as the website, from a different
// address. Found in the iPhone simulator: a program request failed there and
// worked on the web, because the server only answered the website.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');
const read = f => fs.readFileSync(path.join(APP, f), 'utf8');

// A coach overlay that remembers what was done to it, in a page whose visible
// part can be changed the way a keyboard changes it.
function chat({ standalone } = {}) {
  const s = createSandbox({ files: ['data.js', 'app.js', 'connect.js', 'diet.js', 'coach.js'], store: { hvi_ai_consent: 'yes', hvi_onboarded: 'true' } });
  run(s, `(function () {
    const classes = new Set(['coach-overlay', 'coach-hidden']);
    const props = {};
    const ov = { style: { top: '', bottom: '', height: '', setProperty(k, v) { props[k] = v; }, getPropertyValue(k) { return props[k] || ''; } },
      classList: { add(c) { classes.add(c); }, remove(c) { classes.delete(c); }, contains(c) { return classes.has(c); },
        toggle(c, on) { (on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c); } } };
    const input = { blurred: 0, focus() {}, blur() { this.blurred++; }, value: '' };
    const msgs = { scrollTop: 0, scrollHeight: 900, innerHTML: '' };
    const real = document.getElementById.bind(document);
    document.getElementById = id => id === 'coach-overlay' ? ov : id === 'coach-input' ? input : id === 'coach-msgs' ? msgs : real(id);
    window.screen = { height: 874 };
    window.visualViewport = { height: 778, offsetTop: 0 };
    ${standalone ? 'navigator.standalone = true;' : ''}
    globalThis.__chat = { ov, input, msgs, classes, props };
    isPremium = function () { return true; };
  })()`);
  return s;
}
const at = (s, height, offsetTop) => run(s, `window.visualViewport.height = ${height}; window.visualViewport.offsetTop = ${offsetTop}; _coachFit();`);
const box = s => JSON.parse(run(s, `JSON.stringify({ top: __chat.ov.style.top, bottom: __chat.ov.style.bottom, height: __chat.ov.style.height, kb: __chat.classes.has('coach-kb'), hidden: __chat.classes.has('coach-hidden'), gap: __chat.props['--coach-gap'], scrolled: __chat.msgs.scrollTop, blurred: __chat.input.blurred })`));

function loadWorker() {
  const sb = {
    console, JSON, Math, Date, Object, Array, String, Number, Promise, Error,
    URL, URLSearchParams, Set, Map, TextEncoder, TextDecoder, parseInt, parseFloat, isNaN, isFinite,
    crypto: require('crypto').webcrypto,
    Response: class { constructor(b, i) { this.body = b; this.status = (i && i.status) || 200; this.headers = (i && i.headers) || {}; } },
    fetch: () => Promise.reject(new Error('no network in this test')),
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(APP, 'worker/worker.js'), 'utf8')
    .replace(/export\s+default\s*\{/, 'globalThis.__worker = {'), sb, { filename: 'worker.js' });
  return sb;
}
const preflight = (sb, origin, urlPath) => sb.__worker.fetch({
  method: 'OPTIONS', url: 'https://arete-ai.oskarsteinicke.workers.dev' + urlPath,
  headers: { get: k => (k === 'Origin' ? origin : null) },
}, {});

module.exports = async function () {
  const r = createReporter('native');
  const sb = loadWorker();
  const allow = async (origin, urlPath = '/groq') => (await preflight(sb, origin, urlPath)).headers['Access-Control-Allow-Origin'];

  r.section('the store builds can reach the server');
  {
    // What a web view compares against its own address. Anything else and the
    // answer is discarded before the app sees it.
    r.check('the iPhone build is answered as itself', await allow('capacitor://localhost') === 'capacitor://localhost', `(${await allow('capacitor://localhost')})`);
    r.check('so is the Android build', await allow('https://localhost') === 'https://localhost', `(${await allow('https://localhost')})`);
    r.check('the website still is', await allow('https://get-arete.com') === 'https://get-arete.com');
    for (const p of ['/', '/groq', '/account/delete', '/push/subscribe', '/founder/claim']) {
      r.check(`the iPhone build may call ${p}`, await allow('capacitor://localhost', p) === 'capacitor://localhost');
    }
    const pre = await preflight(sb, 'capacitor://localhost', '/account/delete');
    r.check('with the sign-in header account deletion needs', /Authorization/.test(pre.headers['Access-Control-Allow-Headers'] || ''));
  }

  r.section('other sites are not answered as themselves');
  {
    for (const o of ['https://evil.example', 'http://localhost', 'capacitor://evil', 'null', '']) {
      const got = await allow(o);
      r.check(`${o || '(no origin)'} is not echoed back`, got === 'https://get-arete.com', `(${got})`);
    }
  }

  // Measured in the iPhone simulator. The page is 778pt tall. With the keyboard
  // up the phone keeps it 778pt and shows only 416pt of it, starting 362pt
  // down, so a chat laid out against the whole page had its header 300pt
  // above the top of the screen.
  r.section('the chat stays on screen with the keyboard up');
  {
    const s = chat();
    run(s, 'openCoach()');
    let b = box(s);
    r.check('open, no keyboard: it fills what is in view', !b.hidden && b.top === '0px' && b.height === '778px' && !b.kb, JSON.stringify(b));
    at(s, 416, 362);
    b = box(s);
    r.check('keyboard up: it moves to the part that can be seen', b.top === '362px' && b.height === '416px', JSON.stringify(b));
    r.check('and is not pinned to the bottom of the full page any more', b.bottom === 'auto');
    r.check('it takes nearly all of that, not four fifths', b.kb === true);
    r.check('the latest message is kept in view', b.scrolled === 900, `(${b.scrolled})`);
    r.check('the page already starts under the status bar, so the gap is small', b.gap === '8px', `(${b.gap})`);
    // The phone lets the page be dragged with the keyboard up.
    at(s, 416, 300);
    r.check('dragging the page takes the chat with it', box(s).top === '300px');
    at(s, 778, 0);
    b = box(s);
    r.check('keyboard down: back to the full page', b.top === '0px' && b.height === '778px' && !b.kb, JSON.stringify(b));

    at(s, 416, 362);
    run(s, 'closeCoach()');
    b = box(s);
    r.check('closing puts the keyboard away with it', b.blurred === 1, `(${b.blurred})`);
    r.check('and leaves nothing behind for next time', b.hidden && b.top === '' && b.height === '' && b.bottom === '' && !b.kb, JSON.stringify(b));
    at(s, 300, 100);
    r.check('a closed chat is left alone', box(s).top === '' && box(s).height === '');

    const pwa = chat({ standalone: true });
    run(pwa, 'openCoach()'); at(pwa, 416, 362);
    r.check('an installed web app draws under the status bar, so the chat stops short of it', box(pwa).gap === '56px', `(${box(pwa).gap})`);

    const src = read('coach.js');
    r.check('it follows the keyboard opening and closing', /visualViewport\.addEventListener\('resize', _coachFit\)/.test(src));
    r.check('and the page being dragged', /visualViewport\.addEventListener\('scroll', _coachFit\)/.test(src));
    const css = read('style.css');
    const panel = (css.match(/^\.coach-panel \{[^}]*height[^}]*\}/m) || [''])[0];
    r.check('the chat can never be taller than what is in view', /max-height:\s*100%/.test(panel), panel.replace(/\s+/g, ' '));
    r.check('with the keyboard up it uses the room there is', /\.coach-overlay\.coach-kb \.coach-panel \{[^}]*height:\s*calc\(100% - var\(--coach-gap/.test(css));
    const inputSize = +((css.match(/\.coach-input \{[^}]*font-size:\s*([\d.]+)px/) || [])[1] || 0);
    r.check('the message box is set at 16px', inputSize >= 16, `(${inputSize}px)`);
  }

  // iOS draws a previous/next/done bar over the page, and sometimes counts it
  // in the space it reports and sometimes does not (68pt out, second time the
  // keyboard opened). Web code cannot correct that, so the store build drops
  // the bar and resizes the page itself.
  r.section('the store build makes room for the keyboard');
  {
    const cfg = JSON.parse(read('native/capacitor.config.json'));
    r.check('the page is resized to sit above the keyboard', cfg.plugins && cfg.plugins.Keyboard && cfg.plugins.Keyboard.resize === 'native', JSON.stringify(cfg.plugins));
    const pkg = JSON.parse(read('native/package.json'));
    r.check('the keyboard plugin is a dependency', !!(pkg.dependencies && pkg.dependencies['@capacitor/keyboard']));
    r.check('and is linked into the iPhone project', /CapacitorKeyboard/.test(read('native/ios/App/CapApp-SPM/Package.swift')));

    const s = createSandbox({ files: ['data.js', 'app.js'], store: { hvi_onboarded: 'true' }, capacitor: { isNativePlatform: () => true } });
    run(s, `(function () { const c = new Set(); document.documentElement.classList = { add(x) { c.add(x); }, remove(x) { c.delete(x); }, contains(x) { return c.has(x); } }; })()`);
    run(s, '_kbOpen()');
    r.check('keyboard up: the page is marked', run(s, `document.documentElement.classList.contains('kb-open')`) === true);
    run(s, '_kbClosed()');
    r.check('keyboard down: the mark is gone', run(s, `document.documentElement.classList.contains('kb-open')`) === false);
    const app = read('app.js');
    r.check('both are wired to the plugin, in the store build only',
      /if \(window\.Capacitor\) \{\s*window\.addEventListener\('keyboardWillShow', _kbOpen\);\s*window\.addEventListener\('keyboardDidShow', _kbShown\);\s*window\.addEventListener\('keyboardWillHide', _kbClosed\);/.test(app));
    r.check('the tab bar also comes back if the first sign is missed', /addEventListener\('keyboardDidHide', _kbClosed\)/.test(app) && /addEventListener\('focusout', _kbFocusLeft\)/.test(app));
    const left = JSON.parse(run(s, `(function () {
      const real = setTimeout; setTimeout = function (fn) { fn(); return 0; };
      const out = [];
      _kbOpen(); document.activeElement = { tagName: 'INPUT' }; _kbFocusLeft(); out.push(document.documentElement.classList.contains('kb-open'));
      document.activeElement = { tagName: 'BODY' }; _kbFocusLeft(); out.push(document.documentElement.classList.contains('kb-open'));
      setTimeout = real;
      return JSON.stringify(out);
    })()`));
    r.check('moving to another field keeps it away, leaving the fields brings it back', left[0] === true && left[1] === false, JSON.stringify(left));
    // The phone no longer scrolls the focused field into view by itself.
    const seen = JSON.parse(run(s, `(function () {
      const calls = [];
      const real = setTimeout; setTimeout = function (fn) { fn(); return 0; };
      document.activeElement = { tagName: 'INPUT', scrollIntoView(o) { calls.push(o && o.block); } };
      _kbShown();
      document.activeElement = { tagName: 'BUTTON', scrollIntoView() { calls.push('button'); } };
      _kbShown();
      setTimeout = real;
      return JSON.stringify(calls);
    })()`));
    r.check('the field being typed in is brought into view', seen.length === 1 && seen[0] === 'nearest', JSON.stringify(seen));
    const css = read('style.css');
    const hide = (css.match(/\.kb-open #nav[^{]*\{[^}]*\}/) || [''])[0];
    r.check('the tab bar and floating buttons step aside while typing', /display:\s*none/.test(hide) && /\.kb-open \.coach-fab/.test(hide) && /\.kb-open \.quick-log-fab/.test(hide), hide.replace(/\s+/g, ' ').slice(0, 120));
  }

  // The app decides where to send things; the store build must use the same server.
  r.section('the app calls the server by its full address');
  {
    const shipped = fs.readdirSync(APP).filter(f => /\.js$/.test(f) && f !== 'service-worker.js');
    const relative = [];
    for (const f of shipped) {
      const src = fs.readFileSync(path.join(APP, f), 'utf8');
      // A path-only fetch resolves against capacitor://localhost in the store build.
      for (const m of src.matchAll(/fetch\(\s*['"`](\/(?:groq|account|push|founder|oauth|stripe|health)[^'"`]*)/g)) relative.push(`${f}: ${m[1]}`);
    }
    r.check('no server call is written as a bare path', relative.length === 0, `(${relative.join(', ')})`);
  }

  return r.finish();
};
