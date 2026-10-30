// go() and the lazily-loaded screens.
//
// social.js, coach.js and bodymap.js are appended at requestIdleCallback, so on
// a cold load there is a window where the app is interactive and they have not
// arrived. Anything go() does during that window has to survive their absence.
const fs = require('fs'), path = require('path');
const { APP, createSandbox, run, runCatching, createReporter } = require('./harness');

// Exactly what index.html loads with a blocking <script src>. The three lazy
// ones are deliberately absent.
const EAGER = ['data.js', 'app.js', 'connect.js', 'premium.js', 'workout.js',
               'diet.js', 'integrations.js', 'profile.js'];
const LAZY_FILES = ['social.js', 'coach.js', 'bodymap.js'];

function boot(files) {
  const s = createSandbox({ files, store: { hvi_onboarded: 'true' } });
  // The state init() would have established before the first go().
  run(s, `settings={}; curView='home'; habits=[]; log={}; journal={};
          workoutLog={}; workoutMeta={}; mealLog={}; weightLog={};
          meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
          sleepLog={}; prs={}; gamification={xp:0,level:1}; achievements=[];
          routines={}; routineLog={}; challenges=[]; goals=[]; habitLinks={};
          tdeeProfile=null; customPrograms={}; qTimer=null;
          dietMeta={dailyGoals:{calories:2200,protein:160,carbs:220,fat:70}};
          track=function(){}; closeQuickLog=function(){};
          history={pushState:function(){}};`);
  return s;
}

module.exports = function () {
  const r = createReporter('routing');

  // An object literal resolves every identifier the moment it is built. Listing
  // a lazily-loaded screen in it threw ReferenceError on the first navigation
  // of a cold session, before any view could render — so the whole screen was
  // replaced by the error boundary, not just the one section that was late.
  r.section('navigating before the lazy scripts arrive');
  {
    const s = boot(EAGER);
    const res = runCatching(s, `go('home', {}, false)`);
    r.check('home renders with social.js still in flight', res.ok, `(${res.error || ''})`);
    r.check('and something was actually painted',
      (run(s, `document.getElementById('view').innerHTML`) || '').length > 0);
  }

  r.section('a lazy screen waits instead of throwing');
  {
    const s = boot(EAGER);
    const res = runCatching(s, `go('library', {}, false)`);
    r.check('no ReferenceError', res.ok, `(${res.error || ''})`);
    const html = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('shows a loading state', /Loading/.test(html), `(${html.slice(0, 60)})`);
    r.check('and does not silently bounce to home', !/pillar|habit-card/.test(html));
  }

  r.section('once the script lands the screen renders');
  {
    const s = boot(EAGER.concat(LAZY_FILES));
    // In a browser, `window` IS the global object, so a top-level `function
    // renderLibrary` in social.js becomes window.renderLibrary — which is what
    // go() looks up. The harness keeps `window` as a separate object, so the
    // stub has to be attached there explicitly. The check below verifies the
    // assumption this relies on actually holds in the real files.
    run(s, `window._libraryCalled=false;
            window.renderLibrary=function(){ window._libraryCalled=true; };`);
    run(s, `go('library', {}, false)`);
    r.check('renderLibrary is reached', run(s, 'window._libraryCalled') === true);
  }

  // go() resolves lazy screens as window[name]. That only works because each is
  // a top-level function declaration in its file — those become properties of
  // the global object. Nested in a block or assigned to a `const`, they would
  // not, and the screen would hang on "Loading" forever.
  r.section('every lazy screen is reachable off the global object');
  {
    const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    const map = src.slice(src.indexOf('const LAZY_VIEWS = {'));
    const names = [...map.slice(0, map.indexOf('};')).matchAll(/'(render[A-Za-z0-9_]*)'/g)].map(m => m[1]);
    r.check('the map names some screens', names.length > 0);
    for (const fn of names) {
      const declared = LAZY_FILES.some(f =>
        new RegExp(`^(?:async\\s+)?function\\s+${fn}\\b`, 'm')
          .test(fs.readFileSync(path.join(APP, f), 'utf8')));
      r.check(`${fn} is a top-level declaration`, declared,
        '(would never appear on window, so the screen would hang)');
    }
  }

  // The PWA restores the last view from the URL hash on launch, so the Profile
  // tab reopens straight into renderStats — before social.js has arrived.
  r.section('reopening on a lazy-dependent screen');
  {
    const s = boot(EAGER);
    const res = runCatching(s, `window._statsSubView='calendar'; go('stats', {}, false);`);
    r.check('stats renders without social.js', res.ok, `(${res.error || ''})`);
    const html = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('and paints something', html.length > 0, '(blank screen on reopen)');
    r.check('showing it is waiting', /Loading/.test(html), `(${html.slice(0, 50)})`);

    // Once the helpers land the calendar draws properly.
    run(s, `_calDots=function(){ return ''; }; _calLegend=function(){ return ''; };
            _calViewToggle=function(){ return ''; }; buildCalDayDetail=function(){ return ''; };
            calSelectDate=function(){}; calPrev=function(){}; calNext=function(){};
            window._statsSubView='calendar'; renderStats();`);
    const after = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('then the calendar renders', /cal-view-seg|cal-wcol/.test(after),
      `(${after.slice(0, 60)})`);
  }

  // The regression guard. Whichever way the map is written, no screen owned by
  // a lazily-loaded file may be named as a bare identifier inside go().
  r.section('no lazy screen is referenced directly in go()');
  {
    const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    const body = src.slice(src.indexOf('function go(view'));
    const rendersLiteral = body.slice(body.indexOf('const renders = {'),
                                      body.indexOf('};', body.indexOf('const renders = {')));

    // Every render* function each lazy file defines.
    const lazyOwned = new Set();
    for (const f of LAZY_FILES) {
      const t = fs.readFileSync(path.join(APP, f), 'utf8');
      for (const m of t.matchAll(/^(?:async\s+)?function\s+(render[A-Za-z0-9_]*)/gm)) {
        lazyOwned.add(m[1]);
      }
    }
    r.check('the lazy files do define screens', lazyOwned.size > 0,
      '(scan found none — the guard below would pass vacuously)');

    const leaked = [...lazyOwned].filter(fn =>
      new RegExp(`(^|[^\\w.'"\`])${fn}\\b`).test(rendersLiteral));
    r.check('none of them appear in the renders map', leaked.length === 0,
      `(${leaked.join(', ')} would throw before any screen could render)`);
  }

  // The page changed on a 60px drag, and the sideways test only had to pass
  // for a moment, so a slightly crooked scroll moved you to another tab.
  r.section('only a deliberate swipe changes the page');
  {
    const s = boot(EAGER);
    const W = 390;
    const swipe = (g) => run(s, `_isPageSwipe(${JSON.stringify(Object.assign({ dy: 0, maxDy: 0, ms: 250 }, g))}, ${W})`);
    r.check('a quick, straight swipe across the screen does', swipe({ dx: -180, dy: 12, maxDy: 18 }) === true);
    r.check('in either direction', swipe({ dx: 180, dy: -10, maxDy: 14 }) === true);
    r.check('the old 60px trigger does not', swipe({ dx: 70, dy: 8, maxDy: 8 }) === false);
    r.check('nor a short flick', swipe({ dx: 130, dy: 5, maxDy: 5, ms: 120 }) === false);
    r.check('nor a scroll that drifts sideways', swipe({ dx: 200, dy: 60, maxDy: 90 }) === false);
    r.check('nor one that went up and came back', swipe({ dx: 200, dy: 4, maxDy: 55 }) === false);
    r.check('nor a slow drag while reading', swipe({ dx: 220, dy: 6, maxDy: 10, ms: 1500 }) === false);
    r.check('nor two fingers', swipe({ dx: -200, multi: true }) === false);
    r.check('nor one that started on something with its own gesture', swipe({ dx: -200, blocked: true }) === false);
    r.check('on a wider screen it takes 40% of the width',
      run(s, `_isPageSwipe({ dx: 200, dy: 0, maxDy: 0, ms: 250 }, 768)`) === false &&
      run(s, `_isPageSwipe({ dx: 320, dy: 0, maxDy: 0, ms: 250 }, 768)`) === true);

    // Fake nodes, parent-linked up to #view, standing in for the real DOM.
    run(s, `
      getComputedStyle = function (n) { return { overflowX: n._ox || 'visible' }; };
      _node = function (cls, parent, extra) { return Object.assign({ id: '', parentElement: parent, scrollWidth: 300, clientWidth: 300,
        matches: function (sel) { return sel.split(',').some(function (q) { return q.trim() === cls; }); } }, extra || {}); };
      _view = _node('', null, { id: 'view' });
      _card = _node('.card', _view);
    `);
    r.check('a touch on an ordinary card can swipe', run(s, `_swipeBlocked(_node('.label', _card))`) === false);
    r.check('a habit row keeps its swipe-to-complete', run(s, `_swipeBlocked(_node('.hi-name', _node('.hi', _card)))`) === true);
    r.check('a field keeps its text selection', run(s, `_swipeBlocked(_node('input', _card))`) === true);
    r.check('a row that scrolls sideways keeps its scroll',
      run(s, `_swipeBlocked(_node('.chip', _node('.wp-chips', _card, { scrollWidth: 620, clientWidth: 390, _ox: 'auto' })))`) === true);
    r.check('but one that fits does not block',
      run(s, `_swipeBlocked(_node('.chip', _node('.wp-chips', _card, { scrollWidth: 390, clientWidth: 390, _ox: 'auto' })))`) === false);
  }


  // Every screen used to slide in from the right, whichever way you were going,
  // and a redraw of the screen you were on replayed the whole arrival.
  r.section('a screen arrives from the side it is heading to');
  {
    const s = boot(EAGER);
    const dir = (a, b) => run(s, `_viewDir(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
    r.check('a tab further along the bar comes from the right', dir('home', 'diet') === 1);
    r.check('one further back comes from the left', dir('diet', 'habits') === -1);
    r.check('a sub-screen counts as its tab', dir('workoutActive', 'home') === -1 && dir('dietAddMeal', 'stats') === 1);
    r.check('going deeper inside a tab comes from the right', dir('workout', 'workoutActive') === 1);
    r.check('and coming back out comes from the left', dir('workoutActive', 'workout') === -1);

    run(s, `_seen = []; renderHome = function () { _seen.push(_arriving); }; renderHabits = function () { _seen.push(_arriving); };`);
    run(s, `go('home'); go('home', {}, false); go('habits'); go('habits', {}, false); go('home', {}, false);`);
    r.check('the first draw of a screen is an arrival', run(s, '_seen[0]') === true);
    r.check('a redraw of the same screen is not', run(s, '_seen[1]') === false && run(s, '_seen[3]') === false, run(s, 'JSON.stringify(_seen)'));
    r.check('moving to another screen is, even from the back button', run(s, '_seen[2]') === true && run(s, '_seen[4]') === true, run(s, 'JSON.stringify(_seen)'));
    r.check('and the flag does not outlive the draw', run(s, '_arriving') === false);
    r.check('the direction is handed to the stylesheet', run(s, `document.getElementById('view').style.getPropertyValue('--view-dx')`) === '-24px',
      run(s, `document.getElementById('view').style.getPropertyValue('--view-dx')`));
  }

  // A redraw used to jump to the top as well: log water halfway down Nutrition
  // and the screen threw you back up to the heading.
  r.section('a redraw keeps your place; an arrival starts at the top');
  {
    const s = boot(EAGER);
    run(s, `renderHome = function () {}; renderHabits = function () {}; go('home');`);
    run(s, `document.getElementById('view').scrollTop = 640; go('home', {}, false);`);
    r.check('redrawing the same screen stays where you were', run(s, `document.getElementById('view').scrollTop`) === 640,
      run(s, `document.getElementById('view').scrollTop`));
    run(s, `go('habits');`);
    r.check('moving to another screen starts at the top', run(s, `document.getElementById('view').scrollTop`) === 0);
  }

  // Redrawn rings emptied and refilled from zero. After a meal they should move
  // on from where they were.
  r.section('rings carry on from where they stood');
  {
    const s = boot(EAGER);
    run(s, `
      _ring = function (off, val) { var st = { '--ring-off': off }; var c = { style: { animation: '', getPropertyValue: function (k) { return st[k] || ''; }, setProperty: function (k, v) { st[k] = v; } }, _st: st };
        var v = { textContent: String(val) }; return { _c: c, _v: v, querySelector: function (sel) { return /circle/.test(sel) ? c : v; } }; };
      _draw = function (off, val) { _w = [_ring(off, val)]; document.querySelectorAll = function () { return _w; }; carryRings('t', '.wrap', '.val'); return _w[0]; };
    `);
    r.check('the first draw has nothing to carry', run(s, `_draw('140.43', 420)._c._st['--ring-from']`) === undefined);
    r.check('after a change it starts from the old position', run(s, `_draw('105.50', 1060)._c._st['--ring-from']`) === '140.43');
    r.check('and its number counts on from the old one', run(s, `_w[0]._v.textContent`) == 420, `(${run(s, '_w[0]._v.textContent')})`);
    r.check('unchanged and redrawn in place, it stays put', run(s, `_draw('105.50', 1060)._c.style.animation`) === 'none');
    r.check('unchanged on arrival, it still makes its entrance',
      run(s, `_arriving = true; var a = _draw('105.50', 1060)._c.style.animation; _arriving = false; a`) === '');
    r.check('nothing carries over from another day',
      run(s, `_ringMemo.t.day = '2000-01-01'; _draw('60.00', 2000)._c._st['--ring-from']`) === undefined);
  }


  // Inside the store build the web view is not "standalone", so the app told
  // people to add the app they were already using to their home screen.
  r.section('the install hint is for the web, not the store build');
  {
    const shown = (capacitor) => {
      const s = createSandbox({ files: ['data.js', 'app.js'], store: { hvi_onboarded: 'true' }, capacitor,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15' });
      run(s, `var _byId = document.getElementById; document.getElementById = function (id) { return id === 'install-banner' ? null : _byId.call(document, id); };
              _seen = []; track = function (n) { _seen.push(n); }; _showInstallBanner();`);
      return run(s, `_seen.indexOf('install_banner_shown') !== -1`);
    };
    r.check('Safari on an iPhone is offered it', shown(undefined) === true, '(the web hint is gone too)');
    r.check('the native app is not', shown({ platform: 'ios' }) === false, '(native app asks to be installed)');
  }


  // Found by running the store build: things that only make sense on the web.
  r.section('the store build does not offer what it cannot do');
  {
    const src = f => fs.readFileSync(path.join(APP, f), 'utf8');
    r.check('the privacy policy opens the live page, not a file the bundle lacks',
      /window\.open\('https:\/\/get-arete\.com\/privacy\.html'/.test(src('profile.js')) && !/window\.open\('\/privacy\.html'/.test(src('profile.js')),
      '(dead link in the native app)');
    r.check('no leftover upgrade prompt with a price nobody can pay', !/showProPrompt|\$4\.99\/MONTH/.test(src('app.js')), '(dead Pro prompt is back)');

    const web = createSandbox({ files: ['data.js', 'app.js', 'integrations.js'], store: {} });
    const native = createSandbox({ files: ['data.js', 'app.js', 'integrations.js'], store: {}, capacitor: { platform: 'ios' } });
    r.check('connected devices are offered on the web', /Connected Devices/.test(run(web, 'renderIntegrationsSection()') || ''), '(section gone from the web too)');
    // The app signs in through a browser sheet now (integrations: _connectNative).
    const nativeHtml = run(native, 'renderIntegrationsSection()') || '';
    r.check('and in the native app, through a browser sheet', /Whoop/.test(nativeHtml) && typeof run(native, 'typeof _connectNative') === 'string' && run(native, '_oauthRedirectUri()') === 'https://get-arete.com/', '(Connect would return to capacitor://localhost, which no provider accepts)');
    r.check('but not Apple Health, which is a Shortcut on the web', !/Apple Health/.test(nativeHtml));
    // "Version: dev" and an Update button that clears a service-worker cache
    // the store build does not have.
    r.check('the cache-clearing Update row is web only', /\$\{window\.Capacitor \? '' : `<div[^`]*>Version<\/div>/.test(src('profile.js')), '(Update button shown in the store build)');
  }

  return r.finish();
};
