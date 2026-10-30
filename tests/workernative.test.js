// Sign-in started in the iPhone or Android app, as the Worker sees it.
//
// The provider sends the person back to https://get-arete.com/ in a browser
// sheet. That page hands the code to the Worker, which keeps the tokens for ten
// minutes. Only the app that started the sign-in can collect them, because the
// state ends in the SHA-256 of a secret that never leaves the app.
const path = require('path');
const crypto = require('crypto');
const { APP, createReporter } = require('./harness');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function kv() {
  const m = new Map();
  return {
    _m: m,
    get: async k => (m.has(k) ? m.get(k).v : null),
    put: async (k, v, o) => { m.set(k, { v, ttl: o && o.expirationTtl }); },
    delete: async k => { m.delete(k); },
    list: async () => ({ keys: [], list_complete: true }),
  };
}

module.exports = async function () {
  const r = createReporter('workernative');
  const worker = (await import(path.join(APP, 'worker', 'worker.js'))).default;
  const env = { HEALTH_KV: kv(), WHOOP_CLIENT_ID: 'cid', WHOOP_SECRET: 'sec' };

  // The provider's token endpoint, stubbed. Records what the Worker sent.
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    sent.push({ url: String(url), body: String(opts && opts.body) });
    const b = new URLSearchParams(String(opts && opts.body));
    if (b.get('code') === 'good') return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
  };
  const post = (p, body, origin = 'https://get-arete.com') => worker.fetch(new Request('https://w.test' + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }), env);

  try {
    const verifier = crypto.randomBytes(32).toString('hex');
    const state = 'n_whoop_' + sha(verifier);

    r.section('the browser page hands the code over');
    {
      const res = await post('/oauth/native-exchange', { code: 'good', state });
      r.check('it is exchanged', res.status === 200, `(${res.status})`);
      r.check('with the site root as the return address', /redirect_uri=https%3A%2F%2Fget-arete\.com%2F/.test(sent[0].body) && /client_secret=sec/.test(sent[0].body));
      const kept = env.HEALTH_KV._m.get('oauth:' + state);
      r.check('the tokens wait for ten minutes, keyed by the state', !!kept && kept.ttl === 600 && JSON.parse(kept.v).token.access_token === 'AT');
      const body = await res.json();
      r.check('and the page itself never sees them', !('token' in body) && !JSON.stringify(body).includes('AT'), JSON.stringify(body));
      r.check('the page is allowed to read the answer', res.headers.get('Access-Control-Allow-Origin') === 'https://get-arete.com');
    }

    r.section('only the app that started it can collect them');
    {
      const wrong = await post('/oauth/native-claim', { state, verifier: crypto.randomBytes(32).toString('hex') });
      r.check('a wrong secret is refused', wrong.status === 403, `(${wrong.status})`);
      r.check('and the tokens stay put', env.HEALTH_KV._m.has('oauth:' + state));
      const ok = await post('/oauth/native-claim', { state, verifier }, 'capacitor://localhost');
      const d = await ok.json();
      r.check('the right secret gets them', ok.status === 200 && d.service === 'whoop' && d.token.access_token === 'AT' && d.token.refresh_token === 'RT', JSON.stringify(d));
      r.check('the iPhone app may read the answer', ok.headers.get('Access-Control-Allow-Origin') === 'capacitor://localhost');
      r.check('once only', !env.HEALTH_KV._m.has('oauth:' + state) && (await post('/oauth/native-claim', { state, verifier })).status === 404);
    }

    r.section('bad input is turned away');
    {
      const v2 = crypto.randomBytes(32).toString('hex'), s2 = 'n_whoop_' + sha(v2);
      r.check('a code the provider refuses stores nothing', (await post('/oauth/native-exchange', { code: 'bad', state: s2 })).status === 400 && !env.HEALTH_KV._m.has('oauth:' + s2));
      r.check('a state of the wrong shape', (await post('/oauth/native-exchange', { code: 'good', state: 'whoop_abc' })).status === 400);
      r.check('an unknown service', (await post('/oauth/native-exchange', { code: 'good', state: 'n_evil_' + sha(v2) })).status === 400);
      r.check('a claim with no secret', (await post('/oauth/native-claim', { state: s2 })).status === 400);
      r.check('nothing at all', (await worker.fetch(new Request('https://w.test/oauth/native-claim', { method: 'POST', body: 'not json' }), env)).status === 400);
    }
  } finally {
    global.fetch = realFetch;
  }
  return r.finish();
};
