// Where a new visitor came from, from the first page they see into the app.
//
// A tagged link to the site (?utm_source=instagram) was sent on to the landing
// page with its tags dropped, and the landing page's Start link went to a bare
// "/". So nobody new ever reached the app with a source: every channel looked
// the same, and a friend's challenge link lost its challenge on the way.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, run, createReporter, APP } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');

// The first inline script in index.html: the one that decides between the
// landing page and the app. Run with a stand-in for the browser.
function arrive({ search = '', hash = '', referrer = '', store = {}, capacitor = false, standalone = false }) {
  const html = read('index.html');
  const m = /<script>\s*\/\/ Leaderboard invite link[\s\S]*?<\/script>/.exec(html);
  const src = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  const went = [];
  const location = { search, hash, hostname: 'get-arete.com', replace(u) { went.push(u); } };
  const ls = { _d: Object.assign({}, store), getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); } };
  const window = { location, matchMedia: () => ({ matches: standalone }), Capacitor: capacitor ? {} : undefined };
  vm.runInNewContext(src, { location, window, document: { referrer }, localStorage: ls, navigator: { standalone: false }, URLSearchParams, URL, encodeURIComponent });
  return { went: went[0] || null, store: ls._d };
}

// source.js on a page with the given address, referrer and links.
function page({ search = '', referrer = '', hrefs = ['/'], loading = false }) {
  const links = hrefs.map(h => ({ _h: h, getAttribute() { return this._h; }, setAttribute(k, v) { this._h = v; } }));
  const listeners = [];
  const window = {};
  const document = { referrer, readyState: loading ? 'loading' : 'complete',
    querySelectorAll: sel => (sel === 'a[href^="/"]' ? links : []),
    addEventListener: (n, fn) => listeners.push([n, fn]) };
  vm.runInNewContext(read('source.js'), { window, document, location: { search, hostname: 'get-arete.com' }, URLSearchParams, URL });
  return { src: window.areteSource(), hrefs: () => links.map(l => l._h), fire: () => listeners.forEach(([, fn]) => fn()), waiting: listeners.map(l => l[0]) };
}

module.exports = async function () {
  const r = createReporter('source');

  r.section('a new visitor keeps their source on the way to the landing page');
  {
    r.check('a tagged link keeps its tags', arrive({ search: '?utm_source=instagram&utm_medium=social&utm_campaign=bio' }).went === '/landing.html?utm_source=instagram&utm_medium=social&utm_campaign=bio');
    r.check('an untagged link passes on the site that sent them', arrive({ referrer: 'https://www.reddit.com/r/getdisciplined/comments/abc' }).went === '/landing.html?ref=www.reddit.com');
    r.check('a visit from nowhere goes on bare', arrive({}).went === '/landing.html');
    r.check("the site's own pages are not a source", arrive({ referrer: 'https://get-arete.com/free-habit-tracker' }).went === '/landing.html');
    r.check('a referrer that is not an address is ignored', arrive({ referrer: 'not a url' }).went === '/landing.html');
    r.check('tags win over the referrer', arrive({ search: '?utm_source=tiktok', referrer: 'https://www.google.com/' }).went === '/landing.html?utm_source=tiktok');
    r.check('someone who already uses the app goes straight in', arrive({ search: '?utm_source=instagram', store: { hvi_onboarded: 'true' } }).went === null);
    r.check('so does the installed app', arrive({ standalone: true }).went === null && arrive({ capacitor: true }).went === null);
    r.check('a password reset link is still left alone', arrive({ hash: '#access_token=abc&type=recovery' }).went === null);
  }

  r.section('an invitation skips the landing page');
  {
    const join = arrive({ search: '?join=ab12cd&utm_source=share&utm_medium=group' });
    r.check('a group invite goes straight to the app, code kept', join.went === null && join.store.hvi_pending_join === 'AB12CD');
    const ch = arrive({ search: '?challenge=eyJ0IjoiN2RheSJ9&utm_source=share&utm_medium=challenge' });
    r.check('a challenge goes straight to the app too', ch.went === null && ch.store.hvi_from_landing === '1', `(sent to ${ch.went})`);
    r.check('an ordinary new visitor still sees the landing page', arrive({ search: '?x=1' }).went === '/landing.html');
  }

  r.section('the landing page hands the source on to the app');
  {
    const tagged = page({ search: '?utm_source=instagram&utm_medium=social&utm_campaign=bio&x=1', hrefs: ['/', '/', '/privacy.html'] });
    r.check('tags are read as they are', JSON.stringify(tagged.src) === JSON.stringify({ utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'bio' }), JSON.stringify(tagged.src));
    r.check('and put on the Start links', tagged.hrefs()[0] === '/?utm_source=instagram&utm_medium=social&utm_campaign=bio', tagged.hrefs()[0]);
    r.check('and every other link into the site', tagged.hrefs()[2] === '/privacy.html?utm_source=instagram&utm_medium=social&utm_campaign=bio');

    const src = (o) => { const s = page(o).src; return s ? s.utm_source + ' / ' + s.utm_medium : null; };
    r.check('a search engine is organic', src({ referrer: 'https://www.google.com/' }) === 'google / organic' && src({ referrer: 'https://www.google.co.uk/search' }) === 'google / organic'
      && src({ referrer: 'https://duckduckgo.com/' }) === 'duckduckgo / organic' && src({ referrer: 'https://www.bing.com/search?q=x' }) === 'bing / organic');
    r.check('a network is social, by its plain name', src({ referrer: 'https://l.instagram.com/?u=x' }) === 'instagram / social' && src({ referrer: 'https://t.co/abc' }) === 'x / social'
      && src({ referrer: 'https://out.reddit.com/x' }) === 'reddit / social' && src({ referrer: 'https://www.youtube.com/watch' }) === 'youtube / social'
      && src({ referrer: 'https://www.tiktok.com/@x' }) === 'tiktok / social' && src({ referrer: 'https://www.pinterest.co.uk/pin/1' }) === 'pinterest / social');
    r.check('any other site is a referral under its own name', src({ referrer: 'https://www.producthunt.com/posts/arete' }) === 'producthunt.com / referral'
      && src({ referrer: 'https://news.ycombinator.com/item?id=1' }) === 'news.ycombinator.com / referral');
    r.check('a look-alike is not mistaken for a network', src({ referrer: 'https://notinstagram.com/' }) === 'notinstagram.com / referral' && src({ referrer: 'https://mygoogle.example.com/' }) === 'mygoogle.example.com / referral');
    r.check('the site index.html passed on is used when the browser has none', src({ search: '?ref=www.reddit.com' }) === 'reddit / social');
    r.check("the site's own pages are not a source", src({ referrer: 'https://get-arete.com/' }) === null && src({ search: '?ref=get-arete.com' }) === null);
    r.check('nothing known means nothing added', src({}) === null && page({ hrefs: ['/'] }).hrefs()[0] === '/');
    const odd = page({ search: '?ref=' + encodeURIComponent('evil.com/?a=1&utm_campaign=x"><script>'), hrefs: ['/'] });
    r.check('a passed-on site cannot smuggle anything else in', /^[a-z0-9.-]+$/.test(odd.src.utm_source) && !('utm_campaign' in odd.src)
      && /^\/\?utm_source=[a-z0-9.-]+&utm_medium=referral$/.test(odd.hrefs()[0]), odd.hrefs()[0]);

    const mixed = page({ referrer: 'https://www.google.com/', hrefs: ['/', '/landing.html', '/?join=AB12', '/#features', '//other.example/x', '/free-habit-tracker'] }).hrefs();
    r.check('links that already carry something are left alone', mixed[2] === '/?join=AB12' && mixed[3] === '/#features' && mixed[4] === '//other.example/x', mixed.join(' '));
    r.check('the rest carry the source', mixed[0] === '/?utm_source=google&utm_medium=organic' && mixed[1] === '/landing.html?utm_source=google&utm_medium=organic' && mixed[5] === '/free-habit-tracker?utm_source=google&utm_medium=organic');

    const early = page({ referrer: 'https://www.google.com/', loading: true });
    r.check('run before the page has its links, it waits for them', early.hrefs()[0] === '/' && early.waiting[0] === 'DOMContentLoaded');
    early.fire();
    r.check('then tags them', early.hrefs()[0] === '/?utm_source=google&utm_medium=organic');

    for (const f of ['landing.html', 'free-habit-tracker.html', 'self-improvement-app.html', 'workout-nutrition-tracker.html']) {
      r.check(`${f} loads it`, /<script src="\/source\.js"><\/script>/.test(read(f)));
    }
    r.check('it stores nothing and sends nothing', !/localStorage|sessionStorage|cookie|fetch\(|sendBeacon|XMLHttpRequest/.test(read('source.js').replace(/\/\/.*$/gm, '')));
  }

  r.section('the app records the source and leaves the rest of the address');
  {
    const boot = search => {
      const s = createSandbox({ files: ['data.js'], store: {} });
      run(s, `location.search = ${JSON.stringify(search)}; location.pathname = '/'; location.hash = '';
              _replaced = []; history = { replaceState: function (a, b, u) { _replaced.push(u); } };`);
      vm.runInContext(read('app.js'), s, { filename: 'app.js' });
      return s;
    };
    const a = boot('?utm_source=instagram&utm_medium=social&utm_campaign=bio');
    r.check('the tags are kept', JSON.stringify(JSON.parse(a.localStorage._d.hvi_utm)) === JSON.stringify({ source: 'instagram', medium: 'social', campaign: 'bio' }), a.localStorage._d.hvi_utm);
    r.check('and taken off the address', run(a, '_replaced[0]') === '/');
    const b = boot('?challenge=eyJ0IjoiN2RheSJ9&utm_source=share&utm_medium=challenge');
    r.check('a challenge on the same link is left for the app to read', run(b, '_replaced[0]') === '/?challenge=eyJ0IjoiN2RheSJ9', run(b, '_replaced[0]'));
    r.check('with its source recorded', JSON.parse(b.localStorage._d.hvi_utm).source === 'share' && JSON.parse(b.localStorage._d.hvi_utm).medium === 'challenge');
    const c = boot('?join=AB12CD');
    r.check('an untagged address is not touched', run(c, '_replaced.length') === 0 && !('hvi_utm' in c.localStorage._d));
    run(a, `window.posthog = undefined;`);
    r.check('PostHog gets it as the original source, once', JSON.stringify(run(a, '_phPersonSetOnce()')).includes('"initial_traffic_source":"instagram"'));
  }

  r.section('shared links say they were shared, and arrive whole');
  {
    const social = read('social.js');
    r.check('a challenge link is tagged', /\?challenge=\$\{payload\}&utm_source=share&utm_medium=challenge/.test(social));
    r.check('a group invite is tagged', /\?join=\$\{code\}&utm_source=share&utm_medium=group/.test(social));
    r.check('the plain invite still is', /utm_source=share&utm_medium=invite/.test(read('app.js')));

    const s = createSandbox({ files: ['data.js', 'app.js', 'social.js'], store: {} });
    run(s, `settings = {}; track = function () {}; go = function () {}; _showToast = function () {};
            _saved = null; _getChallenges = function () { return []; }; _saveChallenges = function (c) { _saved = c; }; renderChallenges = function () {};`);
    const through = obj => {
      const enc = run(s, `_encodeChallenge(${JSON.stringify(obj)})`);
      // What the app reads back from the address.
      const got = new URLSearchParams('?challenge=' + enc + '&utm_source=share').get('challenge');
      return JSON.stringify(JSON.parse(run(s, `JSON.stringify(_decodeChallenge(${JSON.stringify(got)}))`))) === JSON.stringify(obj);
    };
    // Every template and start day for a month, under plain and accented
    // names. An accent can put a "+" in the code, which arrives as a space.
    const ids = JSON.parse(run(s, 'JSON.stringify(CHALLENGE_TEMPLATES.map(function (t) { return t.id; }))'));
    let plus = 0, ok = 0, n = 0, unsafe = 0;
    for (const t of ids) for (let d = 1; d <= 28; d++) for (const name of ['A friend', 'Alex', 'Zoë', 'André', 'Søren', 'Πέτρος', 'Þór']) {
      const obj = { t, s: `2026-11-${String(d).padStart(2, '0')}`, e: `2026-12-${String(d).padStart(2, '0')}`, n: name };
      n++; if (/\+/.test(Buffer.from(JSON.stringify(obj)).toString('base64'))) plus++;
      if (through(obj)) ok++;
      if (/[+ ]/.test(run(s, `_encodeChallenge(${JSON.stringify(obj)})`))) unsafe++;
    }
    r.check('every challenge survives the trip through a link', ok === n, `(${ok} of ${n})`);
    r.check('including the ones whose code holds a plus sign', plus > 0, `(${plus} of ${n} do)`);
    r.check('and no link is written with a bare plus sign in it', unsafe === 0, `(${unsafe})`);
    r.check('a name outside Latin letters makes a link too', through({ t: ids[0], s: '2026-11-14', e: '2026-11-21', n: 'Łukasz 🏛' }));

    // Links shared before this change.
    const oldPlus = Buffer.from('{"t":"' + ids[0] + '","s":"2026-11-14","e":"2026-11-21","n":"Sam>>?"}').toString('base64');
    const arrived = new URLSearchParams('?challenge=' + oldPlus).get('challenge');
    r.check('an old link with a plus sign is read again', /\+/.test(oldPlus) && / /.test(arrived) && run(s, `_decodeChallenge(${JSON.stringify(arrived)}).n`) === 'Sam>>?', `(${oldPlus})`);
    // The old way wrote accents as single Latin-1 bytes, which is where the
    // plus signs came from: find one such link and read it as it arrives.
    let oldLatin = null, oldName = '';
    for (const t of ids) for (const name of ['Zoë', 'André', 'Søren', 'Jürgen', 'Chloé', 'Åsa']) {
      const b64 = Buffer.from('{"t":"' + t + '","s":"2026-11-14","e":"2026-12-01","n":"' + name + '"}', 'latin1').toString('base64');
      if (!oldLatin && /\+/.test(b64)) { oldLatin = b64; oldName = name; }
    }
    const latinArrived = oldLatin && new URLSearchParams('?challenge=' + oldLatin).get('challenge');
    r.check('an old link with an accented name, plus sign and all, still opens', !!oldLatin && / /.test(latinArrived) && run(s, `_decodeChallenge(${JSON.stringify(latinArrived)}).n`) === oldName, `(${oldName}: ${oldLatin})`);

    const enc = run(s, `_encodeChallenge({ t: ${JSON.stringify(ids[0])}, s: '2026-11-14', e: '2026-11-21', n: 'Alex' })`);
    run(s, `acceptChallenge(${JSON.stringify(decodeURIComponent(enc))})`);
    r.check('accepting one adds the challenge', run(s, '_saved && _saved.length') === 1 && run(s, '_saved[0].createdBy') === 'Alex');
  }

  return r.finish();
};
