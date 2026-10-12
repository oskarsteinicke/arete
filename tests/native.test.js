// The store builds talk to the same server as the website, from a different
// address. Found in the iPhone simulator: a program request failed there and
// worked on the web, because the server only answered the website.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { APP, createReporter } = require('./harness');

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
