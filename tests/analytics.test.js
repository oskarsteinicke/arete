// Usage analytics: Google Analytics and PostHog, behind one consent switch.
//
// These sandboxes load app.js with a test key swapped in for the project
// token, and a stand-in for the PostHog library that records each call.
// Nothing here reaches PostHog.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, run, runCatching, createReporter, APP } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const TEST_KEY = 'phc_testkey1234567890';
const PLACEHOLDER = /const POSTHOG_KEY = '[^']*';/;

// A fake of the posthog-js surface Arete uses. `load()` stands for array.js
// arriving: it marks the library loaded and calls the loaded callback.
const FAKE_PH = `
  window.posthog = {
    _calls: [], _n: 1, _id: 'anon-1', _out: false, __loaded: false, _cfg: null,
    init(k, c) { this._calls.push(['init', k, c]); this._cfg = c; },
    capture(n, p, o) { this._calls.push(['capture', n, p, o || {}]); },
    identify(id, set, once) { this._calls.push(['identify', id, set, once]); this._id = id; },
    reset() { this._calls.push(['reset']); this._id = 'anon-' + (++this._n); },
    get_distinct_id() { return this._id; },
    opt_out_capturing() { this._calls.push(['opt_out']); this._out = true; },
    opt_in_capturing() { this._calls.push(['opt_in']); this._out = false; },
    has_opted_out_capturing() { return this._out; },
    load() { this.__loaded = true; this._cfg.loaded(this); },
  };`;

// opts: tz (time zone), store, key (true: test key, false: a placeholder in
// place of a token), files (extra app files to load after app.js), gpc, capacitor.
function sb(opts = {}) {
  const s = createSandbox({ files: ['data.js'], store: opts.store || {}, capacitor: opts.capacitor });
  run(s, `
    Intl = { DateTimeFormat: function () { return { resolvedOptions: function () { return { timeZone: ${JSON.stringify(opts.tz === undefined ? 'America/New_York' : opts.tz)} }; } }; } };
    navigator.globalPrivacyControl = ${opts.gpc ? 'true' : 'undefined'};
    _ga = []; gtag = function () { _ga.push(Array.prototype.slice.call(arguments)); };
    window.dataLayer = [];
    _appended = [];
    document.head.appendChild = function (el) { _appended.push(el); };
    _listeners = {};
    document.addEventListener = function (n, fn) { (_listeners[n] = _listeners[n] || []).push(fn); };
    ${FAKE_PH}
  `);
  let src = read('app.js');
  src = src.replace(PLACEHOLDER, opts.key === false
    ? `const POSTHOG_KEY = '[INSERT YOUR phc_ PROJECT KEY]';`
    : `const POSTHOG_KEY = '${TEST_KEY}';`);
  vm.runInContext(src, s, { filename: 'app.js' });
  for (const f of (opts.files || [])) vm.runInContext(read(f), s, { filename: f });
  run(s, `settings={}; curView='home'; history={pushState:function(){}}; closeQuickLog=function(){}; qTimer=null;
          playSound=function(){}; awardXP=function(){}; launchConfetti=function(){}; haptic=function(){};
          checkDailyQuests=function(){}; checkAchievements=function(){}; renderHabits=function(){};
          updateHabitUI=function(){}; checkMilestones=function(){}; showMilestone=function(){};
          showToast=function(){}; maybeAwardStreakShield=function(){};`);
  return s;
}
const J = (s, expr) => JSON.parse(run(s, `JSON.stringify(${expr})`) || 'null');
const calls = (s, kind) => J(s, `window.posthog._calls.filter(function (c) { return c[0] === '${kind}'; })`) || [];
const captured = (s, name) => calls(s, 'capture').filter(c => !name || c[1] === name);
const gaEvents = (s, name) => (J(s, '_ga') || []).filter(e => e[0] === 'event' && (!name || e[1] === name));
const SESSION = (id, extra) => JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: 9999999999,
  user: Object.assign({ id, email: 'alex@example.com', created_at: '2026-10-01T09:00:00Z' }, extra || {}) });

module.exports = async function () {
  const r = createReporter('analytics');

  r.section('who has to be asked first');
  {
    const req = tz => { const s = sb({ tz }); return run(s, 'analyticsConsentRequired()'); };
    r.check('Berlin, London, Zurich and Lisbon ask first',
      ['Europe/Berlin', 'Europe/London', 'Europe/Zurich', 'Europe/Lisbon'].every(req));
    r.check('so do Iceland, the Canaries, Svalbard and Cyprus',
      ['Atlantic/Reykjavik', 'Atlantic/Canary', 'Arctic/Longyearbyen', 'Asia/Nicosia'].every(req));
    r.check('New York, São Paulo, Tokyo and Sydney do not',
      !['America/New_York', 'America/Sao_Paulo', 'Asia/Tokyo', 'Australia/Sydney'].some(req));
    r.check('no time zone at all counts as asking first', req('') === true);

    const us = sb();
    r.check('elsewhere it is on until turned off', run(us, 'analyticsAllowed()') === true && run(us, 'analyticsNeedsAnswer()') === false);
    const eu = sb({ tz: 'Europe/Berlin' });
    r.check('in the EU it is off until a yes', run(eu, 'analyticsAllowed()') === false && run(eu, 'analyticsNeedsAnswer()') === true);
    r.check('a yes turns it on', run(sb({ tz: 'Europe/Berlin', store: { hvi_analytics: 'granted' } }), 'analyticsAllowed()') === true);
    r.check('a no keeps it off anywhere', run(sb({ store: { hvi_analytics: 'denied' } }), 'analyticsAllowed()') === false);
    const gpc = sb({ gpc: true });
    r.check('Global Privacy Control counts as a no, without asking', run(gpc, 'analyticsAllowed()') === false && run(gpc, 'analyticsNeedsAnswer()') === false);
    r.check('unless they turn it on themselves', run(sb({ gpc: true, store: { hvi_analytics: 'granted' } }), 'analyticsAllowed()') === true);
  }

  r.section('without a yes, nothing loads and nothing is sent');
  {
    const s = sb({ tz: 'Europe/Berlin' });
    r.check('start does nothing', run(s, 'analyticsStart()') === false);
    r.check('PostHog is never initialised', calls(s, 'init').length === 0);
    r.check('the Google tag is never fetched', run(s, '_appended.length') === 0);
    run(s, `track('habit_complete', { source: 'hand' }); track('page_view', { page_title: 'home' }); reportError('crash', 'boom');`);
    r.check('no event reaches Google', (J(s, '_ga') || []).length === 0, JSON.stringify(J(s, '_ga')));
    r.check('nor PostHog', captured(s).length === 0);
    r.check('and nothing waits in the queue to go later', run(s, 'window.dataLayer.length') === 0);
    const off = sb({ store: { hvi_analytics: 'denied' } });
    r.check('the same for someone who said no outside the EU', run(off, 'analyticsStart()') === false && calls(off, 'init').length === 0);
  }

  r.section('with analytics allowed');
  {
    const s = sb({ store: { hvi_utm: JSON.stringify({ source: 'tiktok', medium: 'social', campaign: 'launch' }) } });
    r.check('start runs once', run(s, 'analyticsStart()') === true && run(s, 'analyticsStart()') === false);
    const init = calls(s, 'init');
    const cfg = (init[0] || [])[2] || {};
    r.check('PostHog is initialised once, with the project key', init.length === 1 && init[0][1] === TEST_KEY);
    r.check('on the EU host', cfg.api_host === 'https://eu.i.posthog.com');
    r.check('with the current defaults', /^20\d\d-\d\d-\d\d$/.test(cfg.defaults || ''), `(${cfg.defaults})`);
    const off = ['autocapture', 'capture_pageview', 'capture_pageleave', 'capture_heatmaps', 'capture_dead_clicks',
      'capture_exceptions', 'capture_performance', 'rageclick'];
    r.check('autocapture, page views, heatmaps, dead clicks, errors and timing are off', off.every(k => cfg[k] === false),
      off.filter(k => cfg[k] !== false).join(', '));
    const on = ['disable_session_recording', 'disable_surveys', 'disable_product_tours', 'disable_external_dependency_loading',
      'advanced_disable_flags', 'mask_all_text', 'mask_all_element_attributes', 'mask_personal_data_properties',
      'opt_out_persistence_by_default'];
    r.check('recordings, surveys, extra scripts and flags are disabled; text is masked', on.every(k => cfg[k] === true),
      on.filter(k => cfg[k] !== true).join(', '));
    r.check('identity is kept in localStorage', cfg.persistence === 'localStorage');
    r.check('guests get a person profile too', cfg.person_profiles === 'always');
    r.check('URLs are cleaned and a late opt-out is honoured', run(s, 'typeof window.posthog._cfg.before_send') === 'function' && run(s, 'typeof window.posthog._cfg.loaded') === 'function');

    const tag = J(s, '_appended.map(function (e) { return e.src; })');
    r.check('the Google tag loads, async', tag.length === 1 && /googletagmanager\.com\/gtag\/js\?id=G-4NQYVJR5S2/.test(tag[0]) && run(s, '_appended[0].async') === true);
    r.check('and is configured', (J(s, '_ga') || []).some(e => e[0] === 'config' && e[1] === 'G-4NQYVJR5S2'));
    r.check('with the campaign that brought them', (J(s, '_ga') || []).some(e => e[0] === 'set' && e[2] && e[2].traffic_source === 'tiktok'));

    const opened = captured(s, 'app_opened');
    r.check('app_opened is sent once', opened.length === 1 && gaEvents(s, 'app_opened').length === 1);
    const o = (opened[0] || [])[3] || {};
    r.check('carrying platform, version and guest status for the person',
      o.$set && o.$set.platform === 'web' && o.$set.auth_status === 'guest' && 'app_version' in o.$set, JSON.stringify(o));
    r.check('and the original traffic source, set once', o.$set_once && o.$set_once.initial_traffic_source === 'tiktok'
      && o.$set_once.initial_traffic_medium === 'social' && o.$set_once.initial_traffic_campaign === 'launch', JSON.stringify(o.$set_once));
    const p = (opened[0] || [])[2] || {};
    r.check('every event says where and as whom', p.platform === 'web' && p.auth_status === 'guest' && 'app_version' in p);
  }

  r.section('without a project token, PostHog stays off');
  {
    const s = sb({ key: false });
    run(s, 'analyticsStart()');
    r.check('PostHog is not initialised', calls(s, 'init').length === 0);
    r.check('Google Analytics carries on', run(s, '_appended.length') === 1 && gaEvents(s, 'app_opened').length === 1);
    // The project token (phc_) is public; a personal API key (phx_) is a
    // secret and must never be in the app.
    const shipped = (read('app.js').match(PLACEHOLDER) || [''])[0];
    r.check('the shipped file carries a project token', /'phc_[A-Za-z0-9]{20,}'/.test(shipped), shipped);
    r.check('and no personal API key anywhere', !/phx_[A-Za-z0-9]/.test(read('app.js') + read('index.html')));
  }

  r.section('what PostHog is sent, and what it never is');
  {
    const s = sb({ store: { hvi_user_name: 'Alex' } });
    run(s, `analyticsStart(); window.posthog.load();
      habits = [{ id: 'h05', name: 'Morning workout', category: 'fitness' },
                { id: 'cu_1', name: 'Take my meds', category: 'health' },
                { id: 'h01', name: 'Meditate', category: 'mindset' }];
      log = { h05: { streak: 2, lastCompletedDate: '', completedToday: false },
              cu_1: { streak: 0, lastCompletedDate: '', completedToday: false },
              h01: { streak: 0, lastCompletedDate: '', completedToday: false } };
      tapHabit('h05', 'a'); tapHabit('cu_1', '__auto'); tapHabit('h01', 'r');`);
    const hc = captured(s, 'habit_complete').map(c => c[2]);
    r.check('three completions', hc.length === 3);
    r.check('by hand, automatically and from a routine', hc.map(x => x.source).join() === 'hand,auto,routine', JSON.stringify(hc));
    r.check('a ready-made habit by its library id', hc[0].kind === 'ready' && hc[0].habit_id === 'h05' && hc[0].pillar === 'body');
    r.check('a habit they wrote by kind alone', hc[1].kind === 'custom' && !('habit_id' in hc[1]) && hc[1].pillar === 'body');
    const everything = JSON.stringify(J(s, 'window.posthog._calls')) + JSON.stringify(J(s, '_ga'));
    r.check('no habit name reaches either service', !/Morning workout|Take my meds|Meditate/.test(everything));
    r.check('nor a name', !/Alex/.test(everything));

    run(s, `window.posthog._calls = []; _ga = [];
      track('sleep_logged', { hours: 7.5, via: 'prompt' });
      track('journal_save', { word_count: 212 });
      track('mood_logged', { mood: 2 });
      track('meal_logged', { meal_type: 'Breakfast', items: 3, via: 'photo' });
      track('ai_program_request', { days: 4, minutes: 45, equipment: 'gym', level: 'beginner' });
      track('onboarding_complete', { path: 'fitness', program: 'ppl', nutrition: 'cut' });
      track('workout_complete', { program: 'ppl' });
      track('workout_complete', { program: 'cp_8f2a' });
      track('install_banner_shown', { type: 'ios' });`);
    const by = n => (captured(s, n)[0] || [])[2] || {};
    r.check('sleep: that it was logged, not the hours', !('hours' in by('sleep_logged')) && by('sleep_logged').via === 'prompt');
    r.check('journal: no word count', !('word_count' in by('journal_save')) && captured(s, 'journal_save').length === 1);
    r.check('mood: not the mood', !('mood' in by('mood_logged')));
    r.check('meal: the count and the way, not the meal', by('meal_logged').items === 3 && by('meal_logged').via === 'photo' && !('meal_type' in by('meal_logged')));
    r.check('program request: none of the workout details', ['days', 'minutes', 'equipment', 'level'].every(k => !(k in by('ai_program_request'))));
    r.check('onboarding: path and program, not the diet goal', by('onboarding_complete').path === 'fitness' && !('nutrition' in by('onboarding_complete')));
    r.check('and the path is kept on the person', ((captured(s, 'onboarding_complete')[0] || [])[3].$set || {}).onboarding_path === 'fitness');
    const progs = captured(s, 'workout_complete').map(c => c[2].program);
    r.check('a built-in program by name, a custom one as custom', progs.join() === 'ppl,custom', progs.join());
    r.check('events with no analytic use stay with Google only', captured(s, 'install_banner_shown').length === 0 && gaEvents(s, 'install_banner_shown').length === 1);
    r.check('Google keeps the events it had', gaEvents(s, 'sleep_logged').length === 1 && gaEvents(s, 'onboarding_complete').length === 1);

    run(s, `window.posthog._calls = []; _ga = []; trackFail('signup', 'Email address "alex@example.com" is invalid');`);
    const both = JSON.stringify(J(s, 'window.posthog._calls')) + JSON.stringify(J(s, '_ga'));
    r.check('a failure reason never carries an email address', /\[email\]/.test(both) && !/alex@example\.com/.test(both), both.slice(0, 200));

    const names = Object.keys(J(s, 'PH_EVENTS'));
    const wanted = ['app_opened', 'sign_up', 'login', 'logout', 'onboarding_started', 'onboarding_complete', 'onboarding_skipped',
      'habit_created', 'habit_ready_added', 'habit_complete', 'workout_complete', 'meal_logged', 'coach_message', 'coach_action', 'account_deleted'];
    r.check('every event asked for is forwarded', wanted.every(n => names.includes(n)), wanted.filter(n => !names.includes(n)).join());
    // Google gets every event's properties as written, so the call sites
    // themselves must not pass names, codes or content.
    const files = ['app.js', 'connect.js', 'today.js', 'premium.js', 'workout.js', 'diet.js', 'logany.js',
      'integrations.js', 'profile.js', 'review.js', 'social.js', 'coach.js', 'patterns.js'];
    const leaks = [];
    for (const f of files) {
      for (const m of read(f).matchAll(/track\('([a-z_]+)',\s*\{([^}]*)\}/g)) {
        const keys = [...m[2].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=[:,]|$)/g)].map(x => x[1]);
        if (keys.some(k => /^(name|habit_name|from|code|email|text|message|content|query|note)$/.test(k))) leaks.push(f + ' ' + m[1] + ' {' + m[2].trim() + '}');
      }
    }
    r.check('no event anywhere passes a name, a code or content', leaks.length === 0, leaks.join(' | '));
    const props = Object.values(J(s, 'PH_EVENTS')).flatMap(v => Array.isArray(v) ? v : v.props);
    r.check('no forwarded property could hold a name, an email or content',
      !props.some(k => /name|email|text|message|content|hours|weight|mood|calorie|word/.test(k)), props.join());
  }

  r.section('the events added');
  {
    const s = sb({ files: ['workout.js', 'diet.js', 'connect.js', 'profile.js'] });
    run(s, `analyticsStart(); window.posthog.load(); go = function () {};
            habits = []; log = {}; curHabitCat = 'learning';
            renderOnboarding(0); renderOnboarding(1); renderOnboarding(0);`);
    r.check('onboarding_started, once per device', captured(s, 'onboarding_started').length === 1);
    run(s, `renderOnboarding(3); obSkip();`);
    const sk = captured(s, 'onboarding_skipped');
    r.check('onboarding_skipped, with the screen it happened on', sk.length === 1 && sk[0][2].step === 3, JSON.stringify(sk));
    run(s, `document.getElementById('hc-name').value = 'Duolingo 15 min'; saveHabit();`);
    const hcr = captured(s, 'habit_created');
    r.check('habit_created, with its pillar and schedule', hcr.length === 1 && hcr[0][2].pillar === 'mastery' && hcr[0][2].schedule === 'daily', JSON.stringify(hcr));
    r.check('and not its name', !/Duolingo/.test(JSON.stringify(J(s, 'window.posthog._calls')) + JSON.stringify(J(s, '_ga'))));
    run(s, `addReadyHabit('h13')`);
    const ra = captured(s, 'habit_ready_added');
    r.check('habit_ready_added, with the library id and pillar', ra.length === 1 && ra[0][2].habit_id === 'h13' && ra[0][2].pillar === 'body', JSON.stringify(ra));
  }

  r.section('a page view is a move to another screen');
  {
    const s = sb({ files: ['workout.js', 'diet.js', 'connect.js', 'premium.js', 'integrations.js', 'profile.js'],
      store: { hvi_onboarded: 'true' } });
    run(s, `analyticsStart(); window.posthog.load();
            habits=[]; log={}; journal={}; workoutLog={}; workoutMeta={}; mealLog={}; weightLog={};
            meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0}; sleepLog={}; prs={};
            gamification={xp:0,level:1}; achievements=[]; routines={}; routineLog={}; challenges=[]; goals=[];
            habitLinks={}; tdeeProfile=null; customPrograms={};
            dietMeta={dailyGoals:{calories:2200,protein:160,carbs:220,fat:70}};
            renderHome=function(){}; renderHabits=function(){};`);
    const views = () => captured(s, '$pageview').map(c => c[2].screen);
    run(s, `go('home', {}, false)`);
    r.check('the first screen counts', views().join() === 'home', views().join());
    run(s, `go('home', {}, false); go('home', {}, false)`);
    r.check('redrawing it does not', views().join() === 'home', views().join());
    run(s, `go('habits'); go('habits', {}, false)`);
    r.check('moving to another screen counts once', views().join() === 'home,habits', views().join());
    r.check('Google gets the same, under its own name', gaEvents(s, 'page_view').length === 2);
    r.check('PostHog gets it as $pageview, nothing else', captured(s, 'page_view').length === 0);
  }

  r.section('a guest, then an account: one person');
  {
    const s = sb();
    run(s, `analyticsStart(); window.posthog.load();`);
    r.check('a guest is never identified', calls(s, 'identify').length === 0 && calls(s, 'reset').length === 0);
    r.check('and keeps the anonymous ID PostHog gave the device', run(s, 'window.posthog.get_distinct_id()') === 'anon-1');
    run(s, `localStorage.setItem('hvi_session', ${JSON.stringify(SESSION('uuid-alex'))}); analyticsIdentify();`);
    const id = calls(s, 'identify');
    r.check('signing in identifies them by the account ID', id.length === 1 && id[0][1] === 'uuid-alex');
    r.check('which PostHog joins to the anonymous ID, with no reset in between', calls(s, 'reset').length === 0);
    r.check('as an account, with its sign-up date', id[0][2].auth_status === 'authenticated' && id[0][3].signup_date === '2026-10-01', JSON.stringify(id[0]));
    r.check('and no email anywhere', !/alex@example\.com/.test(JSON.stringify(J(s, 'window.posthog._calls'))));
    run(s, `analyticsIdentify(); analyticsIdentify();`);
    r.check('asking again changes nothing', calls(s, 'identify').length === 1);
    r.check('the account is remembered', s.localStorage._d.hvi_ph_uid === 'uuid-alex');

    // The next launch: PostHog's own storage still says uuid-alex.
    const next = sb({ store: { hvi_session: SESSION('uuid-alex'), hvi_ph_uid: 'uuid-alex' } });
    run(next, `window.posthog._id = 'uuid-alex'; analyticsStart(); window.posthog.load();`);
    r.check('reopening the app sends no second identify', calls(next, 'identify').length === 0 && calls(next, 'reset').length === 0);
    r.check('and its events go out as the account', (captured(next, 'app_opened')[0] || [])[2].auth_status === 'authenticated');
  }

  r.section('signing up does not also count as a login');
  {
    const s = sb();
    run(s, `analyticsStart(); window.posthog.load(); init = function () {}; sendWelcomeWebhook = function () {};
      authSignUp = async function () { return { ok: true }; };
      authSignIn = async function () { localStorage.setItem('hvi_session', ${JSON.stringify(SESSION('uuid-new'))}); return { ok: true }; };
      document.getElementById('auth-email').value = 'alex@example.com';
      document.getElementById('auth-password').value = 'secret123';
      document.getElementById('auth-confirm').value = 'secret123';
      document.getElementById('auth-name').value = 'Alex';
      _authMode = 'signup';`);
    await run(s, 'submitAuth()');
    r.check('sign_up is sent', captured(s, 'sign_up').length === 1);
    r.check('login is not', captured(s, 'login').length === 0 && gaEvents(s, 'login').length === 0);
    r.check('and the new account is identified', calls(s, 'identify').length === 1 && calls(s, 'identify')[0][1] === 'uuid-new');
    const order = J(s, `window.posthog._calls.map(function (c) { return c[0] === 'capture' ? c[1] : c[0]; })`);
    r.check('the guest\'s sign-up comes first, then identify joins it', order.indexOf('sign_up') < order.indexOf('identify'), order.join());

    const t = sb();
    run(t, `analyticsStart(); window.posthog.load(); init = function () {};
      authSignIn = async function () { localStorage.setItem('hvi_session', ${JSON.stringify(SESSION('uuid-old'))}); return { ok: true }; };
      document.getElementById('auth-email').value = 'alex@example.com';
      document.getElementById('auth-password').value = 'secret123';
      _authMode = 'signin';`);
    await run(t, 'submitAuth()');
    r.check('an existing account signing in sends login', captured(t, 'login').length === 1 && calls(t, 'identify')[0][1] === 'uuid-old');
  }

  r.section('signing out gives the next person a fresh identity');
  {
    const s = sb({ store: { hvi_session: SESSION('uuid-alex'), hvi_ph_uid: 'uuid-alex' } });
    run(s, `window.posthog._id = 'uuid-alex'; analyticsStart(); window.posthog.load();
            cloudPush = async function () {}; fetch = async function () { return { ok: true, json: async function () { return {}; } }; };
            location.reload = function () { _reloaded = true; };`);
    await run(s, 'authSignOut()');
    const seq = J(s, `window.posthog._calls.map(function (c) { return c[0] === 'capture' ? c[1] : c[0]; })`);
    r.check('logout is sent as the account, then reset', seq.indexOf('logout') > -1 && seq.indexOf('logout') < seq.indexOf('reset'), seq.join());
    const lo = captured(s, 'logout')[0] || [];
    r.check('logout goes at once, before the reload', lo[3] && lo[3].send_instantly === true && lo[2].auth_status === 'authenticated', JSON.stringify(lo));
    r.check('the device now has a new anonymous ID', run(s, 'window.posthog.get_distinct_id()') === 'anon-2');
    r.check('and the account is forgotten', !('hvi_ph_uid' in s.localStorage._d));

    // Another person signs in on the same device.
    const b = sb({ store: {} });
    run(b, `window.posthog._id = 'anon-2'; analyticsStart(); window.posthog.load();
            localStorage.setItem('hvi_session', ${JSON.stringify(SESSION('uuid-sam'))}); analyticsIdentify();`);
    r.check('the next account is identified on the fresh ID', calls(b, 'identify').length === 1 && calls(b, 'identify')[0][1] === 'uuid-sam' && calls(b, 'reset').length === 0);

    // Signed out while PostHog had not loaded (offline): the next launch resets.
    const late = sb({ store: { hvi_ph_uid: 'uuid-alex' } });
    run(late, `window.posthog._id = 'uuid-alex'; analyticsStart(); window.posthog.load();`);
    r.check('a sign-out PostHog missed is caught on the next launch', calls(late, 'reset').length === 1 && !('hvi_ph_uid' in late.localStorage._d));
    r.check('before anything is sent as the old account', (captured(late, 'app_opened')[0] || [])[2].auth_status === 'guest');

    // A different account without a sign-out in between.
    const sw = sb({ store: { hvi_session: SESSION('uuid-sam'), hvi_ph_uid: 'uuid-alex' } });
    run(sw, `window.posthog._id = 'uuid-alex'; analyticsStart(); window.posthog.load();`);
    const sq = J(sw, `window.posthog._calls.filter(function (c) { return c[0] === 'reset' || c[0] === 'identify'; }).map(function (c) { return c[0] + (c[1] ? ':' + c[1] : ''); })`);
    r.check('a switched account is reset before it is identified', sq.join() === 'reset,identify:uuid-sam', sq.join());
  }

  r.section('turning it off stops everything');
  {
    const s = sb({ store: { hvi_session: SESSION('uuid-alex') } });
    run(s, `analyticsStart(); window.posthog.load();
            localStorage.setItem('ph_${TEST_KEY}_posthog', '{"distinct_id":"uuid-alex"}');
            localStorage.setItem('hvi_keep', 'yes');
            window.posthog._calls = []; _ga = [];
            setAnalyticsChoice(false);`);
    r.check('the choice is kept', s.localStorage._d.hvi_analytics === 'denied');
    r.check('PostHog is opted out', calls(s, 'opt_out').length === 1);
    r.check('Google Analytics is disabled', run(s, "window['ga-disable-G-4NQYVJR5S2']") === true);
    r.check("PostHog's identifier and the remembered account leave the device",
      !(`ph_${TEST_KEY}_posthog` in s.localStorage._d) && !('hvi_ph_uid' in s.localStorage._d) && s.localStorage._d.hvi_keep === 'yes');
    run(s, `track('habit_complete', { source: 'hand' }); track('page_view', { page_title: 'home' }); reportError('crash', 'x');`);
    r.check('nothing more reaches either service', captured(s).length === 0 && (J(s, '_ga') || []).length === 0);
    r.check('anything already waiting to go is dropped', run(s, "window.posthog._cfg.before_send({ event: 'x', properties: {} })") === null);

    const next = sb({ store: { hvi_analytics: 'denied' } });
    r.check('the next launch starts nothing', run(next, 'analyticsStart()') === false && calls(next, 'init').length === 0 && run(next, '_appended.length') === 0);

    run(s, `setAnalyticsChoice(true)`);
    r.check('turning it back on opts back in', calls(s, 'opt_in').length === 1 && run(s, "window['ga-disable-G-4NQYVJR5S2']") === false);
    const back = sb({ store: { hvi_analytics: 'granted' } });
    run(back, `analyticsStart(); window.posthog._out = true; window.posthog.load();`);
    r.check("a later launch clears PostHog's own record of the old no", calls(back, 'opt_in').length === 1);
  }

  r.section('a yes part-way through a visit');
  {
    const s = sb({ tz: 'Europe/Berlin' });
    run(s, `window.dataLayer.push(['event', 'from_before']); setAnalyticsChoice(true);`);
    r.check('starts both services', calls(s, 'init').length === 1 && run(s, '_appended.length') === 1);
    r.check('without sending anything queued before the yes', !JSON.stringify(J(s, 'window.dataLayer')).includes('from_before'));
    r.check('and counts the open', captured(s, 'app_opened').length === 1);
  }

  r.section('the question on Home');
  {
    const eu = sb({ tz: 'Europe/Berlin' });
    const card = run(eu, 'analyticsConsentCardHTML()');
    r.check('asked where it has to be', /an-card/.test(card) && /Allow/.test(card) && /No thanks/.test(card));
    const btns = card.match(/<button class="an-btn"/g) || [];
    r.check('both answers look alike', btns.length === 2);
    r.check('it links to how it works', /privacy\.html#analytics/.test(card));
    run(eu, `answerAnalytics(false)`);
    r.check('a no is kept and the question goes', eu.localStorage._d.hvi_analytics === 'denied' && run(eu, 'analyticsConsentCardHTML()') === '');
    r.check('and nothing started', calls(eu, 'init').length === 0);
    r.check('not asked outside the EU', run(sb(), 'analyticsConsentCardHTML()') === '');
    r.check('Home shows it', /analyticsConsentCardHTML\(\)/.test(read('app.js').slice(read('app.js').indexOf('function renderHome'))));
    const prof = read('profile.js');
    r.check('Profile has the switch', /Usage analytics/.test(prof) && /setAnalyticsChoice\(true\)/.test(prof) && /setAnalyticsChoice\(false\)/.test(prof));
  }

  r.section('addresses go out screen-deep');
  {
    const s = sb();
    run(s, 'analyticsStart()');
    const ev = J(s, `window.posthog._cfg.before_send({ event: '$pageview', properties: {
        $current_url: 'https://get-arete.com/#access_token=abc.def&refresh_token=xyz&type=recovery',
        $referrer: 'https://www.google.com/search?q=arete+habits',
        $initial_current_url: 'https://get-arete.com/index.html?join=ABCD12#leaderboard',
        $set_once: { $initial_referrer: '$direct', $initial_current_url: 'https://get-arete.com/?state=n_123&code=zz' },
        $pathname: '/', screen: 'home' },
      $set_once: { $initial_current_url: 'capacitor://localhost/index.html#diet' } })`);
    r.check('a reset link loses its tokens', ev.properties.$current_url === 'https://get-arete.com/', ev.properties.$current_url);
    r.check('an outside referrer keeps only its site', ev.properties.$referrer === 'https://www.google.com', ev.properties.$referrer);
    r.check('an invite loses its code but keeps the screen', ev.properties.$initial_current_url === 'https://get-arete.com/index.html#leaderboard', ev.properties.$initial_current_url);
    r.check('nested first-visit addresses are cleaned too', ev.properties.$set_once.$initial_current_url === 'https://get-arete.com/'
      && ev.properties.$set_once.$initial_referrer === '$direct', JSON.stringify(ev.properties.$set_once));
    r.check('the iPhone app\'s address keeps its screen', ev.$set_once.$initial_current_url === 'capacitor://localhost/index.html#diet');
    r.check('everything else is left alone', ev.properties.screen === 'home' && ev.properties.$pathname === '/');
  }

  r.section('where Arete is running');
  {
    r.check('a browser tab', run(sb(), 'analyticsPlatform()') === 'web');
    r.check('the iPhone app', run(sb({ capacitor: { getPlatform: () => 'ios' } }), 'analyticsPlatform()') === 'ios');
    r.check('the Android app', run(sb({ capacitor: { getPlatform: () => 'android' } }), 'analyticsPlatform()') === 'android');
    const pwa = sb();
    run(pwa, `window.matchMedia = function (q) { return { matches: /standalone/.test(q), addEventListener: function () {} }; }`);
    r.check('the installed web app', run(pwa, 'analyticsPlatform()') === 'pwa');
  }

  r.section('offline at launch, and coming back');
  {
    const s = sb();
    run(s, `analyticsStart(); _appended = [];`);
    run(s, `_phRetryLoad()`);
    r.check('nothing is refetched while the first load may still arrive', run(s, '_appended.length') === 0);
    run(s, `_phLoadFailed = true; _phRetryLoad()`);
    const src = J(s, '_appended.map(function (e) { return e.src; })');
    r.check('a failed load is fetched again when the connection returns', src.length === 1 && src[0] === 'https://eu-assets.i.posthog.com/static/array.js', JSON.stringify(src));
    run(s, `_phRetryLoad()`);
    r.check('once', run(s, '_appended.length') === 1);
    run(s, `window.posthog.load(); _phLoadFailed = true; _phRetryLoad()`);
    r.check('and never once the library is in', run(s, '_appended.length') === 1);
    const crash = sb();
    run(crash, `window.posthog.init = function () { throw new Error('blocked'); }`);
    const res = runCatching(crash, `analyticsStart(); track('habit_complete', { source: 'hand' }); 'ok'`);
    r.check('a broken library never breaks the app', res.ok && res.value === 'ok', res.error);
    const none = sb();
    run(none, `window.posthog = undefined`);
    const res2 = runCatching(none, `analyticsStart(); track('login', {}); analyticsIdentify(); analyticsLogout(); setAnalyticsChoice(false); 'ok'`);
    r.check('nor does a missing one (blocked or an old cached page)', res2.ok && res2.value === 'ok', res2.error);
  }

  r.section('coming back to the app after a while counts as opening it');
  {
    const s = sb();
    run(s, `analyticsStart(); window.posthog.load(); window.posthog._calls = [];`);
    const fire = () => run(s, `_listeners.visibilitychange.forEach(function (fn) { fn(); })`);
    run(s, `document.visibilityState = 'hidden'`); fire();
    run(s, `_hiddenAt = Date.now() - 5 * 60 * 1000; document.visibilityState = 'visible'`); fire();
    r.check('not after five minutes', captured(s, 'app_opened').length === 0);
    run(s, `document.visibilityState = 'hidden'`); fire();
    run(s, `_hiddenAt = Date.now() - 31 * 60 * 1000; document.visibilityState = 'visible'`); fire();
    const o = captured(s, 'app_opened');
    r.check('after half an hour, once', o.length === 1 && o[0][2].resume === true);
  }

  r.section('the pages');
  {
    const html = read('index.html');
    r.check('index.html has the official PostHog loader', /e\.__SV\|\|\(window\.posthog=e/.test(html) && /-assets\.i\.posthog\.com/.test(html) && /\/static\/array\.js/.test(html));
    r.check('but does not start it: app.js does, once allowed', !/posthog\.init\(/.test(html));
    r.check('and no longer loads Google Analytics before asking', !/googletagmanager\.com/.test(html) && /function gtag\(\)\{dataLayer\.push\(arguments\);\}/.test(html));
    const landing = read('landing.html');
    r.check('the landing page respects a no from the app', /localStorage\.getItem\('hvi_analytics'\) !== 'denied'/.test(landing) && /ga-disable-G-4NQYVJR5S2/.test(landing));
    const policy = read('privacy.html');
    r.check('the privacy policy names PostHog and the switch', /PostHog/.test(policy) && /Usage analytics/.test(policy) && /id="analytics"/.test(policy));
    r.check('and says what is never sent', /never sent/i.test(policy) && /messages to the coach/.test(policy));
  }

  return r.finish();
};
