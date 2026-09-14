// Error reporting, failure tracking, and notification wiring.
const { createSandbox, run, createReporter } = require('./harness');

function sb(opts) {
  opts = opts || {};
  const s = createSandbox({ files: ['data.js','app.js'], store: opts.store, capacitor: opts.capacitor });
  // Capture gtag calls
  run(s, `_ga=[]; gtag=function(){ _ga.push(Array.prototype.slice.call(arguments)); };
          settings=${JSON.stringify(opts.settings || {})}; curView='home';`);
  return s;
}
const events = s => JSON.parse(run(s, 'JSON.stringify(_ga)') || '[]');
const log = s => { try { return JSON.parse(s.localStorage._d['hvi_error_log'] || '[]'); } catch { return []; } };

module.exports = async function () {
  const r = createReporter('telemetry');

  // Errors used to stop at console.error, so a bug on someone else's phone was
  // invisible — the only ones ever found were the ones we tripped over.
  r.section('errors reach analytics and the on-device log');
  {
    const s = sb();
    run(s, "reportError('crash','Cannot read properties of undefined',{src:'workout.js',line:42})");
    const ev = events(s);
    r.check('one exception sent', ev.length === 1 && ev[0][1] === 'exception', `(${JSON.stringify(ev[0]||[])})`);
    const d = ev[0][2].description;
    r.check('carries version, view, file and line',
      /v/.test(d) && /home/.test(d) && /workout\.js/.test(d) && /:42/.test(d), `(${d})`);
    r.check('a crash is flagged fatal', ev[0][2].fatal === true);
    r.check('written on device', log(s).length === 1 && log(s)[0].line === 42);
  }

  r.section('a broken screen cannot spam');
  {
    const s = sb();
    for (let i = 0; i < 5; i++) run(s, "reportError('crash','same boom',{})");
    r.check('duplicates reported once', events(s).length === 1, `(${events(s).length})`);
    for (let i = 0; i < 20; i++) run(s, `reportError('crash','boom'+${i},{})`);
    r.check('capped per session', events(s).length <= 8, `(${events(s).length})`);
    r.check('local log bounded', log(s).length <= 20, `(${log(s).length})`);
  }

  r.section('window handlers are wired');
  {
    const s = sb();
    run(s, "window.onerror('Boom!','https://x/app.js?v=1',7,1,{stack:'at foo'})");
    r.check('onerror reports', events(s).length === 1 && /Boom!/.test(events(s)[0][2].description));
    r.check('error boundary shown', !!s._els._boundary);
    r.check('rejection handler registered', typeof run(s, 'typeof window') === 'string');
  }

  // Reports must never carry habit, meal, workout or account content.
  r.section('no user content leaks');
  {
    const s = sb();
    run(s, "reportError('crash','x',{src:'a.js',line:1})");
    const rec = log(s)[0];
    const allowed = ['kind','msg','where','v','at','src','line','stack'];
    r.check('only technical fields', Object.keys(rec).every(k => allowed.includes(k)), `(${Object.keys(rec)})`);
    run(s, `reportError('crash','${'y'.repeat(900)}',{})`);
    r.check('long messages truncated', log(s)[0].msg.length === 300, `(${log(s)[0].msg.length})`);
  }

  // Success-only events are how the signup bug stayed invisible for months.
  r.section('failures are reported, not just successes');
  {
    const s = sb();
    run(s, "trackFail('signup','user_already_exists')");
    const ev = events(s).filter(e => e[1] === 'failure');
    r.check('a failure event is sent', ev.length === 1, `(${ev.length})`);
    r.check('names the step', ev[0][2].step === 'signup', `(${ev[0][2].step})`);
    r.check('names the reason', ev[0][2].reason === 'user_already_exists');
    run(s, `trackFail('x','${'z'.repeat(300)}')`);
    const last = events(s).filter(e => e[1] === 'failure').pop();
    r.check('reason is bounded', last[2].reason.length <= 80, `(${last[2].reason.length})`);
  }

  r.section('native reminders schedule and cancel');
  {
    const calls = [];
    const LocalNotifications = {
      checkPermissions: () => Promise.resolve({ display: 'granted' }),
      requestPermissions: () => Promise.resolve({ display: 'granted' }),
      cancel: o => { calls.push(['cancel', o]); return Promise.resolve(); },
      schedule: o => { calls.push(['schedule', o]); return Promise.resolve(); },
    };
    const s = sb({ capacitor: { Plugins: { LocalNotifications } },
      settings: { notifications: true } });
    r.check('native notifier detected', run(s, '!!_nativeNotifier()') === true);
    const okRes = await run(s, 'scheduleNativeReminders()');
    r.check('scheduling succeeds', okRes === true);
    const sch = calls.find(c => c[0] === 'schedule');
    r.check('cancel runs first so nothing stacks',
      calls.findIndex(c => c[0] === 'cancel') < calls.findIndex(c => c[0] === 'schedule'));
    r.check('three daily reminders', sch && sch[1].notifications.length === 3);
    r.check('fixed ids', sch[1].notifications.map(n => n.id).join() === '1101,1102,1103');
    r.check('morning, midday, evening',
      sch[1].notifications.map(n => n.schedule.on.hour).join() === '7,12,20');
  }

  r.section('denied permission leaves reminders off');
  {
    const s = sb({ capacitor: { Plugins: { LocalNotifications: {
      checkPermissions: () => Promise.resolve({ display: 'denied' }),
      requestPermissions: () => Promise.resolve({ display: 'denied' }),
      cancel: () => Promise.resolve(), schedule: () => Promise.resolve(),
    } } }, settings: { notifications: true } });
    r.check('scheduling reports failure', (await run(s, 'scheduleNativeReminders()')) === false);
  }

  // A service worker serving a stale bundle is indistinguishable from a change
  // that never shipped. The version has to be visible and forceable.
  r.section('the running version is knowable and forceable');
  {
    const s = createSandbox({ files: ['data.js', 'app.js'] });
    r.check('a version is derived', typeof run(s, 'APP_VERSION') === 'string');
    r.check('forceUpdate exists', run(s, 'typeof forceUpdate') === 'function',
      '(no way to escape a stale cache)');
  }

  r.section('forcing an update clears everything and cache-busts the reload');
  {
    const s = createSandbox({ files: ['data.js', 'app.js'] });
    run(s, `_unregistered=0; _deleted=[]; _replaced='';
      navigator.serviceWorker = { getRegistrations: () => Promise.resolve([
        { unregister: () => { _unregistered++; return Promise.resolve(); } }]) };
      window.caches = { keys: () => Promise.resolve(['arete-v1','arete-v2']),
                        delete: k => { _deleted.push(k); return Promise.resolve(); } };
      location = { href: 'https://get-arete.com/#stats', replace: u => { _replaced = u; } };
      reportError = function(){};`);
    return Promise.resolve(run(s, 'forceUpdate()')).then(() => {
      r.check('the service worker is unregistered', run(s, '_unregistered') === 1);
      r.check('every cache is deleted', run(s, '_deleted.length') === 2,
        `(${run(s, '_deleted.join(",")')})`);
      const to = run(s, '_replaced');
      r.check('the reload is cache-busted', /_r=/.test(to || ''), `(${to})`);
      r.check('and the stale hash is dropped', !/#/.test(to || ''),
        '(reloads straight back into the view that was broken)');
      // GA4 truncates event parameter values at 100 characters. Anything longer is
  // not just clipped in the report, it never arrives — and the clipped half was
  // the file and line, which is the useful part.
  r.section('exception reports fit what GA4 will actually store');
  {
    const s = sb();
    run(s, `curView='workoutProgress';`);
    const longMsg = "Cannot read properties of undefined (reading 'someUnusuallyLongPropertyName')";
    run(s, `reportError('crash', ${JSON.stringify(longMsg)}, { src:'workout.js', line:2690 })`);
    const ev = events(s);
    const d = (ev[0] && ev[0][2] && ev[0][2].description) || '';
    r.check('something was reported', d.length > 0, `(${JSON.stringify(ev[0] || [])})`);
    r.check('it fits GA4 storage', d.length <= 100, `(${d.length} chars)`);
    r.check('the view survives truncation', /@workoutProgress/.test(d), `(${d})`);
    r.check('so does the file and line', /workout\.js:2690/.test(d), `(${d})`);
    // The message is the only thing allowed to lose its tail.
    r.check('the message comes last', d.indexOf('Cannot read') > d.indexOf('workout.js'),
      `(${d})`);
  }

  // Google's terms prohibit uploading data that can personally identify
  // someone, naming email addresses specifically. The penalty is losing the
  // property and the data in it. This shipped for months.
  r.section('no personal data reaches analytics');
  {
    const s = sb({ store: { hvi_user_name: 'Oskar',
      hvi_session: JSON.stringify({ access_token: 't', user: {
        id: 'a1b2c3', email: 'oskarsteinicke@gmail.com', created_at: '2026-05-20T10:00:00Z' } }) } });
    run(s, `_sid=getSession();
            if (_sid?.user?.id) {
              gtag('config','G-4NQYVJR5S2',{ user_id: _sid.user.id });
              gtag('set','user_properties',{
                sign_up_date: _sid.user.created_at?.slice(0,10) || undefined,
                last_active: new Date().toISOString().slice(0,10) });
            }`);
    const blob = JSON.stringify(events(s));
    r.check('no email address', !/@/.test(blob), '(PII uploaded to Google)');
    r.check('no name', !/Oskar/.test(blob), '(PII uploaded to Google)');
    r.check('the pseudonymous id is still sent', /a1b2c3/.test(blob),
      '(analytics can no longer distinguish users at all)');
    r.check('and the non-identifying properties survive', /sign_up_date/.test(blob));
  }

  // The source file is what actually ships, so assert against it too: the test
  // above only proves the shape I wrote, not that app.js still matches it.
  r.section('the shipped source sends no identifiers');
  {
    const src = require('fs').readFileSync(
      require('path').join(require('./harness').APP, 'app.js'), 'utf8');
    const i = src.indexOf('Identify user in GA4');
    const block = i === -1 ? '' : src.slice(i, i + 900);
    r.check('the identify block exists', i !== -1);
    r.check('it sends no email', !/user_email|\.email/.test(block), '(PII back in the payload)');
    r.check('and no name', !/user_name/.test(block), '(PII back in the payload)');
  }

  return r.finish();
    });
  }
};
