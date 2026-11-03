// The app offline.
//
// index.html used to delete every cache but one by a name it had hard-coded
// ('arete-v180'). The service worker's cache is renamed every release, so a
// release later that line was deleting the current cache on every load: the
// offline copy the app had just saved was thrown away each time, and opening
// it without a connection gave the browser's error page. These hold that the
// page leaves caches to the service worker, that the service worker clears
// old ones itself, and that with the network gone the app is still served.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { APP, createReporter } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const html = read('index.html'), sw = read('service-worker.js');

// The service worker, run with no network and a cache holding `saved`.
function worker(saved) {
  const handlers = {}, store = new Map(saved.map(u => [u, 'saved:' + u]));
  const caches = {
    open: async () => ({ put: async (req, res) => store.set(new URL(req.url).pathname + new URL(req.url).search, res), addAll: async () => {} }),
    keys: async () => [],
    delete: async () => true,
    match: async (req, opts) => {
      const u = new URL(req.url), key = u.pathname + u.search;
      if (store.has(key)) return store.get(key);
      if (opts && opts.ignoreSearch && store.has(u.pathname)) return store.get(u.pathname);
      return undefined;
    },
  };
  const self = {
    addEventListener: (k, fn) => { handlers[k] = fn; },
    clients: { claim: async () => {} }, registration: {}, skipWaiting() {},
  };
  vm.runInNewContext(sw, { self, caches, location: { origin: 'https://get-arete.com' }, URL,
    fetch: () => Promise.reject(new TypeError('offline')), Promise, console });
  return async url => {
    let answer = null;
    handlers.fetch({ request: { method: 'GET', url: 'https://get-arete.com' + url }, respondWith: p => { answer = p; } });
    return answer ? await answer : 'not handled';
  };
}

module.exports = async function () {
  const r = createReporter('offline');

  r.section('the page leaves caches to the service worker');
  {
    const code = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
    r.check('index.html deletes no cache', !/caches\.delete|caches\.keys/.test(code));
    r.check('and names no cache version of its own', !/arete-v\d+/.test(code));
    r.check('the service worker clears old caches when a new version takes over',
      /addEventListener\('activate'[\s\S]*?caches\.keys\(\)[\s\S]*?filter\(k => k !== CACHE\)[\s\S]*?caches\.delete/.test(sw));
  }

  r.section('everything the page loads is saved for offline');
  {
    const assets = (sw.match(/const ASSETS = \[([\s\S]*?)\];/) || [])[1] || '';
    const saved = [...assets.matchAll(/'([^']+)'/g)].map(m => m[1]);
    const loaded = [...html.matchAll(/<script src="([^"?]+)/g), ...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g), ...html.matchAll(/\.src='([^'?]+)/g)]
      .map(m => '/' + m[1].replace(/^\//, '')).filter(u => !/^\/\/|https?:/.test(u));
    const missing = [...new Set(loaded)].filter(u => !saved.includes(u));
    r.check('every script and stylesheet index.html loads is in the install list', loaded.length >= 15 && missing.length === 0, `(${missing.join(', ') || loaded.length})`);
    r.check('and the page itself', saved.includes('/') && saved.includes('/index.html'));
  }

  r.section('with the network gone, it is still served');
  {
    const offline = worker(['/index.html', '/app.js', '/app.js?v=233', '/style.css']);
    r.check('the page, from the copy saved last time', await offline('/index.html') === 'saved:/index.html');
    r.check('a script, by the exact version the page asks for', await offline('/app.js?v=233') === 'saved:/app.js?v=233');
    r.check('a version not saved yet: the install\'s plain copy stands in', await offline('/style.css?v=233') === 'saved:/style.css');
    r.check('an invite link opens the saved page', await offline('/index.html?join=ABC123') === 'saved:/index.html');
    r.check('something never saved is a miss, not someone else\'s file', await offline('/review.js?v=233') === undefined);
  }

  return r.finish();
};
