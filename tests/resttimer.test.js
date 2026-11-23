// The rest timer on the lock screen: in the iPhone app each rest also runs as
// a Live Activity (RestTimerPlugin.swift) and a notification sounds when it is
// over while the app is closed. These sandboxes stand in for Capacitor and
// record what the web code asks of it.
const fs = require('fs');
const path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'bodymap.js'];
const T = new Date().toLocaleDateString('en-CA');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

function fakeCapacitor(platform, perm, answer) {
  const calls = [];
  const plugin = {
    start(o) { calls.push(['start', o]); return Promise.resolve({ started: true }); },
    stop() { calls.push(['stop']); return Promise.resolve(); },
  };
  const notes = {
    perm: perm || 'granted',
    checkPermissions() { calls.push(['check']); return Promise.resolve({ display: this.perm }); },
    requestPermissions() { calls.push(['ask']); this.perm = answer || 'granted'; return Promise.resolve({ display: this.perm }); },
    cancel(o) { calls.push(['cancel', o]); return Promise.resolve(); },
    schedule(o) { calls.push(['schedule', o]); return Promise.resolve(); },
  };
  return { calls, cap: { getPlatform: () => platform, registerPlugin: n => (n === 'RestTimer' ? plugin : null), Plugins: { LocalNotifications: notes } } };
}

const SESSION = JSON.stringify({ [T]: { programId: 'ppl', dayIndex: 0, touched: true, exercises: [
  { exerciseId: 'bench_press', sets: [{ weight: 80, reps: 5, completed: false }, { weight: 80, reps: 5, completed: false }, { weight: 80, reps: 5, completed: false }] },
  { exerciseId: 'barbell_curl', sets: [{ weight: 30, reps: 10, completed: false }] },
] } });

function sb(capacitor, store) {
  const s = createSandbox({ files: FILES, store: Object.assign({ hvi_workout_log: SESSION }, store || {}), capacitor });
  run(s, `
    settings={units:'metric'}; curView='workoutActive';
    track=function(){}; go=function(){}; playSound=function(){}; haptic=function(){}; awardXP=function(){};
    checkDailyQuests=function(){}; launchConfetti=function(){}; showMilestone=function(){};
    trackWeeklyWorkout=function(){}; startWorkoutTimer=function(){}; stopWorkoutTimer=function(){};
    takeBackLapsedQuests=function(){}; _showToast=function(){};
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    workoutMeta={activeProgram:'ppl'}; prs={};
  `);
  return s;
}
const stop = s => run(s, 'if (restTimer) { clearInterval(restTimer); restTimer = null; } 0');

module.exports = async function () {
  const r = createReporter('resttimer');

  r.section('a finished set puts its rest on the lock screen');
  {
    const f = fakeCapacitor('ios');
    const s = sb(f.cap);
    r.check('a rest left over from before the app opened is cleared at start', f.calls.some(c => c[0] === 'stop'));
    f.calls.length = 0;
    run(s, 'toggleSet(0, 0)');
    await flush();
    const st = f.calls.find(c => c[0] === 'start');
    r.check('the rest starts on the lock screen', !!st);
    const o = st ? st[1] : {};
    r.check('for the exercise\'s own rest, ending when the bar does', o.duration === 180 && o.endsAt === run(s, 'restTimerEnd'), JSON.stringify(o));
    r.check('named after the exercise', o.title === 'Bench Press' || /bench/i.test(o.title), o.title);
    r.check('and saying which set is next', o.detail === 'Set 2 of 3 next', o.detail);
    const sch = f.calls.find(c => c[0] === 'schedule');
    const n = sch && sch[1].notifications[0];
    r.check('a notification is set for the end of the rest', n && n.schedule.at.getTime() === o.endsAt, JSON.stringify(n));
    r.check('that stays quiet while the app is open', n && n.silent === true);
    r.check('and says the rest is over', n && n.title === 'Rest over' && /Set 2 of 3 next/.test(n.body), n && n.body);
    stop(s);
  }

  r.section('after the last set it names the next exercise');
  {
    const f = fakeCapacitor('ios');
    const s = sb(f.cap);
    run(s, `workoutLog['${T}'].exercises[0].sets.forEach(function (x) { x.completed = true; }); workoutLog['${T}'].exercises[0].sets[2].completed = false;`);
    f.calls.length = 0;
    run(s, 'toggleSet(0, 2)');
    await flush();
    const st = f.calls.find(c => c[0] === 'start');
    r.check('"Next:" and the exercise after it', st && /^Next: /.test(st[1].detail) && /curl/i.test(st[1].detail), st && st[1].detail);
    stop(s);
  }

  r.section('skipping takes it off');
  {
    const f = fakeCapacitor('ios');
    const s = sb(f.cap);
    run(s, 'toggleSet(0, 0)');
    await flush();
    f.calls.length = 0;
    run(s, 'stopRestTimer()');
    await flush();
    r.check('the lock screen rest ends', f.calls.some(c => c[0] === 'stop'));
    r.check('and the notification is cancelled', f.calls.some(c => c[0] === 'cancel' && c[1].notifications[0].id === 1201));
    // Skipped while the app was still asking iOS about notifications: the
    // answer must not arm an alert for a rest that is gone.
    const g = fakeCapacitor('ios');
    const t = sb(g.cap);
    run(t, 'toggleSet(0, 0); stopRestTimer()');
    await flush();
    r.check('a rest skipped at once leaves no alert behind', !g.calls.some(c => c[0] === 'schedule'));
  }

  r.section('when the rest runs out');
  {
    const f = fakeCapacitor('ios');
    const s = sb(f.cap);
    run(s, 'toggleSet(0, 0)');
    await flush();
    f.calls.length = 0;
    run(s, 'setTimeout = function (fn) { fn(); return 0; }; restTimerEnd = Date.now() - 1; _updateRestTimer()');
    await flush();
    r.check('it leaves the lock screen after "Rest over" has shown', f.calls.some(c => c[0] === 'stop'));
    r.check('and the timer stops', run(s, 'restTimer') === null);
    // Off the workout screen the bar is not there; the timer used to run on forever.
    const g = fakeCapacitor('ios');
    const t = sb(g.cap);
    run(t, 'toggleSet(0, 0)');
    await flush();
    g.calls.length = 0;
    run(t, `setTimeout = function (fn) { fn(); return 0; }; var _real = document.getElementById; document.getElementById = function (id) { return id === 'rest-timer-bar' ? null : _real(id); }; restTimerEnd = Date.now() - 1; _updateRestTimer()`);
    await flush();
    r.check('on another screen too', run(t, 'restTimer') === null && g.calls.some(c => c[0] === 'stop'));
  }

  r.section('a new rest replaces the last');
  {
    const f = fakeCapacitor('ios');
    const s = sb(f.cap);
    run(s, 'toggleSet(0, 0)');
    await flush();
    run(s, 'toggleSet(0, 1)');
    await flush();
    const starts = f.calls.filter(c => c[0] === 'start');
    r.check('each rest goes to the lock screen', starts.length === 2 && starts[1][1].detail === 'Set 3 of 3 next', JSON.stringify(starts.map(c => c[1].detail)));
    r.check('the notification is re-set, never stacked', f.calls.filter(c => c[0] === 'cancel').length >= 2);
    stop(s);
  }

  r.section('notifications are asked for once');
  {
    const f = fakeCapacitor('ios', 'prompt', 'denied');
    const s = sb(f.cap);
    run(s, 'toggleSet(0, 0)');
    await flush();
    r.check('at the first rest', f.calls.filter(c => c[0] === 'ask').length === 1);
    r.check('a no schedules nothing', !f.calls.some(c => c[0] === 'schedule'));
    run(s, 'toggleSet(0, 1)');
    await flush();
    r.check('and is never asked again', f.calls.filter(c => c[0] === 'ask').length === 1);
    r.check('the lock screen countdown runs anyway', f.calls.filter(c => c[0] === 'start').length === 2);
    stop(s);
    // Even when no answer comes back (the question still open), once is all.
    const g = fakeCapacitor('ios', 'prompt', 'prompt');
    const t = sb(g.cap);
    run(t, 'toggleSet(0, 0)'); await flush();
    run(t, 'toggleSet(0, 1)'); await flush();
    r.check('even when no answer came back', g.calls.filter(c => c[0] === 'ask').length === 1);
    stop(t);
  }

  r.section('the preset row runs a plain rest');
  {
    const f = fakeCapacitor('ios');
    const s = sb(f.cap);
    f.calls.length = 0;
    run(s, 'startRestTimer(90)');
    await flush();
    const st = f.calls.find(c => c[0] === 'start');
    r.check('called "Rest", for 90 seconds', st && st[1].title === 'Rest' && st[1].duration === 90 && st[1].detail === '');
    stop(s);
  }

  r.section('finishing the session clears it');
  {
    const f = fakeCapacitor('ios');
    const s = sb(f.cap);
    run(s, 'toggleSet(0, 0)');
    await flush();
    f.calls.length = 0;
    try { run(s, 'finishWorkout()'); } catch (e) { /* the rest of finishing is tested elsewhere */ }
    await flush();
    r.check('the lock screen rest ends with the session', f.calls.some(c => c[0] === 'stop'));
    stop(s);
  }

  r.section('nothing outside the iPhone app');
  {
    const web = sb(undefined);
    run(web, 'toggleSet(0, 0)');
    await flush();
    r.check('the web runs the bar alone', run(web, '_restNative()') === null && run(web, 'restTimer') !== null);
    stop(web);
    const f = fakeCapacitor('android');
    const a = sb(f.cap);
    run(a, 'toggleSet(0, 0)');
    await flush();
    r.check('nor Android, which has no Live Activities', !f.calls.some(c => c[0] === 'start' || c[0] === 'schedule'));
    stop(a);
  }

  r.section('the iPhone project');
  {
    const read = f => fs.readFileSync(path.join(APP, 'native/ios/App', f), 'utf8');
    const pbx = read('App.xcodeproj/project.pbxproj');
    r.check('has the widget extension, embedded in the app', /productType = "com\.apple\.product-type\.app-extension"/.test(pbx) && /RestTimerWidget\.appex in Embed Foundation Extensions/.test(pbx));
    r.check('the activity\'s shape is compiled into both', (pbx.match(/RestTimerAttributes\.swift in Sources/g) || []).length === 4);
    const versions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(m => m[1]);
    r.check('the extension\'s build number matches the app\'s (App Store rejects a mismatch)', versions.length === 4 && new Set(versions).size === 1, versions.join());
    const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map(m => m[1]);
    r.check('and so does its version', marketing.length === 4 && new Set(marketing).size === 1, marketing.join());
    r.check('the app still opens on iOS 15: ActivityKit is weakly linked', (pbx.match(/"-weak_framework",\s*ActivityKit/g) || []).length === 2);
    r.check('Info.plist allows Live Activities', /<key>NSSupportsLiveActivities<\/key>\s*<true\/>/.test(read('App/Info.plist')));
    r.check('the storyboard uses the controller that registers the plugin', /customClass="MainViewController"/.test(read('App/Base.lproj/Main.storyboard')) && /registerPluginInstance\(RestTimerPlugin\(\)\)/.test(read('App/MainViewController.swift')));
    r.check('the plugin answers to the name the web uses', /jsName = "RestTimer"/.test(read('App/RestTimerPlugin.swift')));
    r.check('and goes stale when the rest ends, so it shows as over', /staleDate: endsAt/.test(read('App/RestTimerPlugin.swift')));
    r.check('the widget extension is a WidgetKit extension', /com\.apple\.widgetkit-extension/.test(read('RestTimerWidget/Info.plist')));
  }

  return r.finish();
};
