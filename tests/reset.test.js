// Forgotten passwords. Someone asked for a reset twice, got an email with no
// link in it, tried to sign in about fifteen times and gave up. Supabase's
// template is set in its dashboard, but the app had nothing to offer either:
// no way to use a code, and a link opened in a browser was sent on to the
// landing page, where its sign-in was thrown away unread.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, run, createReporter, APP } = require('./harness');

const json = (status, obj) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(obj) });
const SESSION = { access_token: 'AT1', refresh_token: 'RT1', token_type: 'bearer', expires_in: 3600, user: { id: 'u1', email: 'her@example.com' } };

function sb(routes, extra) {
  const s = createSandbox({ files: ['data.js', 'app.js'], fetch: (url, opts) => routes(url, opts || {}) });
  run(s, `settings={}; curView='home'; track=function(n,p){ _tracked.push([n,p||{}]); }; trackFail=function(){};
          _inits=0; init=function(){ _inits++; }; _toasts=[]; showToast=function(m){ _toasts.push(m); };
          history={ pushState:function(){}, replaceState:function(a,b,u){ _nav.push('replace:'+u); } }; ${extra || ''}`);
  return s;
}
const calls = (s, part) => s._fetches.filter(f => f.url.includes(part));
const body = f => JSON.parse((f && f.opts && f.opts.body) || '{}');
const screen = s => s._els['auth-overlay'].innerHTML;
const err = s => s._els['auth-error'].textContent;
const set = (s, id, v) => run(s, `document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(v)}`);

module.exports = async function () {
  const r = createReporter('reset');

  r.section('"Forgot password?" leads to a screen that finishes the job');
  {
    const s = sb(url => (url.includes('/recover') ? json(200, {}) : json(404, {})));
    run(s, "_authMode='signin'; renderAuth()");
    set(s, 'auth-email', 'her@example.com');
    await run(s, 'handleForgotPassword()');
    const req = calls(s, '/auth/v1/recover')[0];
    r.check('a reset email is asked for', !!req && body(req).email === 'her@example.com');
    r.check('with its link pointed at the app', req && /redirect_to=https%3A%2F%2Fget-arete\.com%2F/.test(req.url), req && req.url);
    r.check('the next screen asks for the code', run(s, '_authMode') === 'reset' && /id="auth-code"/.test(screen(s)) && /one-time-code/.test(screen(s)));
    r.check('and a new password, twice', /id="auth-password"/.test(screen(s)) && /id="auth-confirm"/.test(screen(s)));
    r.check('it says where the email went, and that the link works too', screen(s).includes('her@example.com') && /tap the link/.test(screen(s)));
    r.check('with a way to send it again', /resendReset\(\)/.test(screen(s)));
  }

  r.section('asking again too soon says so plainly');
  {
    const s = sb(() => json(429, { error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 52 seconds.' }));
    run(s, "_authMode='signin'; renderAuth()");
    set(s, 'auth-email', 'her@example.com');
    await run(s, 'handleForgotPassword()');
    r.check('it says to wait a minute', /Wait a minute/.test(err(s)), `(${err(s)})`);
    r.check('and stays on sign in', run(s, '_authMode') === 'signin');
  }

  r.section('the code and a new password sign her in');
  {
    const s = sb((url, o) => {
      if (url.includes('/auth/v1/verify')) return json(200, SESSION);
      if (url.includes('/auth/v1/user') && o.method === 'PUT') return json(200, { id: 'u1' });
      return json(404, {});
    }, "_resetEmail='her@example.com'; _authMode='reset';");
    run(s, 'renderAuth()');
    set(s, 'auth-code', '123 456'); set(s, 'auth-password', 'newpass123'); set(s, 'auth-confirm', 'newpass123');
    await run(s, 'submitNewPassword()');
    const v = calls(s, '/auth/v1/verify')[0];
    r.check('the code is checked as a recovery code for her email', v && body(v).type === 'recovery' && body(v).email === 'her@example.com' && body(v).token === '123456', JSON.stringify(v && body(v)));
    const put = calls(s, '/auth/v1/user').find(f => f.opts.method === 'PUT');
    r.check('the new password is saved with the session the code gave', put && body(put).password === 'newpass123' && put.opts.headers.Authorization === 'Bearer AT1');
    r.check('she is signed in', JSON.parse(s.localStorage._d.hvi_session || '{}').user?.id === 'u1');
    r.check('the app starts up signed in', run(s, '_inits') === 1);
    r.check('and says what happened', /Password changed/.test(run(s, '_toasts.join()')));
  }

  r.section('a wrong or old code is turned away');
  {
    const s = sb(url => (url.includes('/verify') ? json(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }) : json(200, {})),
      "_resetEmail='her@example.com'; _authMode='reset';");
    run(s, 'renderAuth()');
    set(s, 'auth-code', '000000'); set(s, 'auth-password', 'newpass123'); set(s, 'auth-confirm', 'newpass123');
    await run(s, 'submitNewPassword()');
    r.check('it says the code is wrong or expired', /wrong or has expired/.test(err(s)), `(${err(s)})`);
    r.check('nothing is signed in', !s.localStorage._d.hvi_session);
    r.check('and no password is sent', calls(s, '/auth/v1/user').length === 0);

    const t = sb(() => json(200, {}), "_resetEmail='her@example.com'; _authMode='reset';");
    run(t, 'renderAuth()');
    set(t, 'auth-code', '12'); set(t, 'auth-password', 'newpass123'); set(t, 'auth-confirm', 'newpass123');
    await run(t, 'submitNewPassword()');
    r.check('a code that is not 6 digits never leaves the phone', /6 digits/.test(err(t)) && t._fetches.length === 0);
    set(t, 'auth-code', '123456'); set(t, 'auth-confirm', 'different1');
    await run(t, 'submitNewPassword()');
    r.check('nor do passwords that do not match', /do not match/.test(err(t)) && t._fetches.length === 0);
  }

  // A code works once. If the password is refused after the code was taken,
  // sending the code again would fail and strand her.
  r.section('a refused password can be tried again without a new code');
  {
    let puts = 0;
    const s = sb((url, o) => {
      if (url.includes('/verify')) return json(200, SESSION);
      if (o.method === 'PUT') return ++puts === 1 ? json(422, { error_code: 'weak_password', msg: 'Password should contain at least one number.' }) : json(200, {});
      return json(404, {});
    }, "_resetEmail='her@example.com'; _authMode='reset';");
    run(s, 'renderAuth()');
    set(s, 'auth-code', '123456'); set(s, 'auth-password', 'password'); set(s, 'auth-confirm', 'password');
    await run(s, 'submitNewPassword()');
    r.check("Supabase's reason is shown", /at least one number/.test(err(s)), `(${err(s)})`);
    run(s, 'renderAuth()');
    r.check('the code box is gone, the code was used', !/id="auth-code"/.test(screen(s)));
    set(s, 'auth-password', 'password1'); set(s, 'auth-confirm', 'password1');
    await run(s, 'submitNewPassword()');
    r.check('the second try sends only the password', calls(s, '/verify').length === 1 && puts === 2);
    r.check('and finishes', run(s, '_inits') === 1);
  }

  r.section('the same password again still ends signed in');
  {
    const s = sb((url, o) => (url.includes('/verify') ? json(200, SESSION) : o.method === 'PUT' ? json(422, { error_code: 'same_password', msg: 'New password should be different from the old password.' }) : json(404, {})),
      "_resetEmail='her@example.com'; _authMode='reset';");
    run(s, 'renderAuth()');
    set(s, 'auth-code', '123456'); set(s, 'auth-password', 'oldpass1'); set(s, 'auth-confirm', 'oldpass1');
    await run(s, 'submitNewPassword()');
    r.check('she is let in, told nothing changed', run(s, '_inits') === 1 && /already your password/.test(run(s, '_toasts.join()')));
  }

  r.section('the link in the email signs her in and asks for the new password');
  {
    const hash = '#access_token=AT2&expires_at=1999999999&expires_in=3600&refresh_token=RT2&token_type=bearer&type=recovery';
    const s = sb((url, o) => (url.includes('/auth/v1/user') && !o.method ? json(200, { id: 'u2', email: 'her@example.com' }) : json(200, {})));
    s.location.hash = hash;
    const out = JSON.parse(await run(s, 'takeAuthLink().then(function (x) { return JSON.stringify(x); })'));
    const saved = JSON.parse(s.localStorage._d.hvi_session || '{}');
    r.check('it is read as a password reset', out && out.type === 'recovery', JSON.stringify(out));
    r.check('the session is kept, with who it belongs to', saved.access_token === 'AT2' && saved.refresh_token === 'RT2' && saved.user?.id === 'u2');
    r.check('the tokens leave the address bar', s._nav.some(n => /^replace:/.test(n) && !/access_token/.test(n)), s._nav.join(' '));

    const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    const start = app.slice(app.indexOf('async function init()'), app.indexOf('async function init()') + 900);
    r.check('startup reads the link before anything else', /takeAuthLink\(\)/.test(start) && start.indexOf('takeAuthLink') < start.indexOf('getAccessToken()'));
    r.check("and opens the new-password screen for a reset", /link\.type === 'recovery'[^\n]*_authMode = 'newpass'/.test(start));

    run(s, "_authMode='newpass'; renderAuth()");
    r.check('that screen asks for no code', /Choose a new password/.test(screen(s)) && !/id="auth-code"/.test(screen(s)));
    set(s, 'auth-password', 'newpass123'); set(s, 'auth-confirm', 'newpass123');
    await run(s, 'submitNewPassword()');
    const put = calls(s, '/auth/v1/user').find(f => f.opts.method === 'PUT');
    r.check('saving sends the password with the link\'s session', put && body(put).password === 'newpass123' && put.opts.headers.Authorization === 'Bearer AT2');
    r.check('without starting the app a second time', run(s, '_inits') === 0);
  }

  r.section('an old link says what to do');
  {
    const s = sb(() => json(200, {}));
    s.location.hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    const out = JSON.parse(await run(s, 'takeAuthLink().then(function (x) { return JSON.stringify(x); })'));
    r.check('it is seen as expired', out && out.error === 'otp_expired', JSON.stringify(out));
    r.check('nothing is signed in', !s.localStorage._d.hvi_session);
    const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    r.check('and the sign-in screen explains it', /link\.error\)[\s\S]{0,200}expired or was used already/.test(app));
  }

  r.section('a link opened in a fresh browser is not sent to the landing page');
  {
    const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    const script = head.slice(head.lastIndexOf('<script>', head.indexOf("'/landing.html'")) + 8, head.indexOf('</script>', head.indexOf("'/landing.html'")));
    const visit = h => {
      const went = [];
      const loc = { search: '', hash: h, replace(u) { went.push(u); } };
      const win = { location: loc, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, matchMedia: () => ({ matches: false }), URLSearchParams };
      win.window = win;
      vm.runInNewContext(script.replace(/window\.location/g, 'location'), win);
      return went;
    };
    r.check('a plain first visit still sees the landing page', visit('').includes('/landing.html'), JSON.stringify(visit('')));
    r.check('a reset link stays in the app', !visit('#access_token=AT&type=recovery').includes('/landing.html'));
    r.check('so does an expired one, to be told about it', !visit('#error=access_denied&error_code=otp_expired').includes('/landing.html'));
  }

  // A reload can land at any moment: a new version taking over, or the first
  // visit's service worker. The link is cleared from the address bar at once,
  // so whatever it carried has to live somewhere a reload does not wipe.
  r.section('a reload does not lose the reset');
  {
    const tab = '_d:{}, getItem:function(k){ return k in this._d ? this._d[k] : null; }, setItem:function(k,v){ this._d[k]=String(v); }, removeItem:function(k){ delete this._d[k]; }';
    const hash = '#access_token=AT3&expires_in=3600&refresh_token=RT3&token_type=bearer&type=recovery';
    const userOk = (url, o) => (url.includes('/auth/v1/user') && !o.method ? json(200, { id: 'u3' }) : o.method === 'PUT' ? json(200, {}) : json(200, {}));

    const s = sb(userOk, `sessionStorage = { ${tab} };`);
    s.location.hash = hash;
    await run(s, 'takeAuthLink()');
    s.location.hash = '';
    const again = JSON.parse(await run(s, 'takeAuthLink().then(function (x) { return JSON.stringify(x); })'));
    r.check('after a reload the new-password screen comes back', again && again.type === 'recovery', JSON.stringify(again));
    run(s, "_authMode='newpass'; renderAuth()");
    set(s, 'auth-password', 'newpass123'); set(s, 'auth-confirm', 'newpass123');
    await run(s, 'submitNewPassword()');
    r.check('once the password is saved it stops asking', (await run(s, 'takeAuthLink().then(function (x) { return String(x); })')) === 'null');

    // Reloaded while the link was still being read: the address bar is clean
    // by then, so only the tab's copy can finish the job.
    const slow = sb(() => new Promise(() => {}), `sessionStorage = { ${tab} };`);
    slow.location.hash = hash;
    run(slow, 'takeAuthLink()');
    const kept = run(slow, 'JSON.stringify(sessionStorage._d)');
    const after = sb(userOk, `sessionStorage = { ${tab} }; sessionStorage._d = ${kept};`);
    const done = JSON.parse(await run(after, 'takeAuthLink().then(function (x) { return JSON.stringify(x); })'));
    r.check('a reload in the middle of reading the link still signs her in', done && done.type === 'recovery' &&
      JSON.parse(after.localStorage._d.hvi_session || '{}').user?.id === 'u3', JSON.stringify(done));
  }

  r.section('a first visit is not reloaded out from under the person');
  {
    const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
    const at = html.indexOf("addEventListener('controllerchange'");
    const script = html.slice(html.lastIndexOf('<script>', at) + 8, html.indexOf('</script>', at));
    const visit = controlled => {
      let reloads = 0, onChange = null;
      const sw = { controller: controlled ? {} : null, register: () => ({ then(f) { f({ update() {} }); } }),
        addEventListener: (k, f) => { if (k === 'controllerchange') onChange = f; } };
      const win = { navigator: { serviceWorker: sw }, location: { reload() { reloads++; } } };
      win.window = win;
      vm.runInNewContext(script, win);
      if (onChange) onChange();
      return reloads;
    };
    r.check('the first service worker taking over does not reload the page', visit(false) === 0);
    r.check('a new version replacing an old one still does', visit(true) === 1);
  }

  r.section('the athlete program has no sport in its name');
  {
    const s = createSandbox({ files: ['data.js'] });
    const p = JSON.parse(run(s, "JSON.stringify(WORKOUT_PROGRAMS.find(function(x){return x.id==='athlete'}))") || 'null');
    r.check('it is called Athlete', p && p.name === 'Athlete', JSON.stringify(p && p.name));
    const shipped = fs.readdirSync(APP).filter(f => /\.(js|html)$/.test(f) && f !== 'service-worker.js');
    const named = shipped.filter(f => /soccer|⚽/i.test(fs.readFileSync(path.join(APP, f), 'utf8')));
    r.check('no screen names a sport', named.length === 0, `(${named.join(', ')})`);
  }

  return r.finish();
};
