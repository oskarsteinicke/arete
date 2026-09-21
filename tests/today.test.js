// The daily spine: what to do today, and a number that a missed day does not
// destroy.
//
// The old home screen led with a streak count, which is the one metric that
// punishes hardest exactly when someone is most likely to quit. These checks
// hold the replacement to its promise: consistency counts only the days a
// habit was actually due, a single miss costs a shield rather than the streak,
// and the priority list can explain its own order.
const { createSandbox, run, runCatching, createReporter } = require('./harness');

const ALL = ['data.js', 'app.js', 'connect.js', 'today.js', 'premium.js', 'workout.js',
             'diet.js', 'integrations.js', 'profile.js', 'social.js'];

const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

const BASE = `
  settings={}; curView='home'; track=function(){}; history={pushState:function(){}};
  setTimeout=function(){}; go=function(v){ _went=v; }; _went='';
  playSound=function(){}; haptic=function(){}; awardXP=function(){}; launchConfetti=function(){};
  checkDailyQuests=function(){}; checkAchievements=function(){}; checkMilestones=function(){};
  showToast=function(t){ _toasts.push(t); }; _toasts=[];
  renderHabits=function(){}; refreshPillarRing=function(){};
  journal={}; meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
  workoutLog={}; workoutMeta={activeProgram:'ppl',currentDayIndex:0,lastWorkoutDate:''};
  mealLog={}; dietMeta={dailyGoals:{calories:2000,protein:150,carbs:200,fat:60}};
  weightLog={}; sleepLog={}; prs={}; achievements=[]; challenges=[]; goals=[];
  gamification={xp:0,level:1,pillarXP:{}}; routines={}; routineLog={};
  habitLinks={}; tdeeProfile=null; customPrograms={}; integrations={};
`;

function sb(store, extra) {
  const s = createSandbox({ files: ALL, store: Object.assign({ hvi_onboarded: 'true' }, store) });
  run(s, BASE);
  run(s, `
    habits = JSON.parse(localStorage.getItem('hvi_habits') || '[]');
    log = JSON.parse(localStorage.getItem('hvi_log') || '{}');
  `);
  if (extra) run(s, extra);
  return s;
}

// One daily habit, kept on the days listed.
function daily(doneDaysAgo) {
  const hist = { h1: doneDaysAgo.map(dk) };
  return {
    hvi_habits: JSON.stringify([{ id: 'h1', name: 'Read', category: 'learning', schedule: 'daily' }]),
    hvi_log: JSON.stringify({ h1: { streak: 3, lastCompletedDate: dk(doneDaysAgo[0] ?? 1), completedToday: doneDaysAgo.includes(0) } }),
    hvi_habit_history: JSON.stringify(hist),
  };
}

module.exports = function () {
  const r = createReporter('today');

  r.section('consistency counts the days a habit was actually due');
  {
    // Kept 5 of the last 7 days, missing two.
    const s = sb(daily([1, 2, 3, 5, 6]));
    const c = run(s, `consistency7('h1')`);
    r.check('due is the whole window for a daily habit', c.due === 7, `(due ${c.due})`);
    r.check('done counts the kept days', c.done === 5, `(done ${c.done})`);
    r.check('and the text says so', run(s, `consistencyText(consistency7('h1'))`) === '5 of last 7',
      `(${run(s, `consistencyText(consistency7('h1'))`)})`);
  }

  // A Mon/Wed/Fri habit kept every Mon, Wed and Fri is perfect, not 43%.
  r.section('a habit due three days a week is judged on those three days');
  {
    const dows = [0, 1, 2, 3, 4, 5, 6].map(i => new Date(Date.now() - i * 86400000).getDay());
    const dueDays = [1, 3, 5];                       // Mon, Wed, Fri
    const dueOffsets = [0, 1, 2, 3, 4, 5, 6].filter(i => dueDays.includes(dows[i]));
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Gym', category: 'fitness', schedule: 'specific', days: dueDays }]),
      hvi_log: JSON.stringify({ h1: { streak: 2, lastCompletedDate: dk(dueOffsets[0] || 1), completedToday: dueOffsets.includes(0) } }),
      hvi_habit_history: JSON.stringify({ h1: dueOffsets.map(dk) }),
    });
    const c = run(s, `consistency7('h1')`);
    r.check('only due days are counted', c.due === dueOffsets.length, `(due ${c.due}, expected ${dueOffsets.length})`);
    r.check('kept every one of them', c.pct === 1, `(${c.done}/${c.due})`);
  }

  r.section('a brand new habit is not reported as failing');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Read', schedule: 'daily' }]),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_history: JSON.stringify({}),
    });
    const txt = run(s, `consistencyText(consistency7('h1'))`);
    r.check('no zero-shaming', !/0 of/.test(txt), `(${txt})`);
  }

  // The habit row used to read "Start your streak" the day after a miss, which
  // erases a fortnight of work in four words.
  r.section('the habit row shows consistency, not a broken streak');
  {
    const s = sb(daily([1, 2, 3, 4, 5, 6]));   // kept six days, missed today only
    run(s, `log.h1.streak = 0; log.h1.completedToday = false;`);
    const html = run(s, `habitRowHTML(habits[0])`);
    r.check('does not say "Start your streak"', !/Start your streak/.test(html), '(streak language survived)');
    r.check('reports the six kept days', /6 of last 7/.test(html), `(${(html.match(/hi-streak[^>]*>([^<]*)</) || [])[1]})`);
  }

  r.section('one missed day spends a shield instead of the streak');
  {
    const s = sb(daily([2, 3, 4, 5]), `gamification.streakShields = 2;`);
    run(s, `log.h1.streak = 12; log.h1.lastCompletedDate = ${JSON.stringify(dk(2))}; log.h1.completedToday = false;`);
    run(s, `validateStreaks()`);
    r.check('the streak survives', run(s, 'log.h1.streak') === 12, `(streak ${run(s, 'log.h1.streak')})`);
    r.check('a shield was spent', run(s, 'getStreakShields()') === 1, `(${run(s, 'getStreakShields()')} left)`);
    r.check('and the user is told', run(s, '_toasts').some(t => /shield/i.test(t)), `(${JSON.stringify(run(s, '_toasts'))})`);
    // The point of the shield: completing it today has to continue the count.
    run(s, `tapHabit('h1','')`);
    r.check('completing today continues the streak', run(s, 'log.h1.streak') === 13,
      `(streak ${run(s, 'log.h1.streak')})`);
  }

  r.section('with no shield, or a longer gap, the streak still breaks');
  {
    const s = sb(daily([2, 3, 4]), `gamification.streakShields = 0;`);
    run(s, `log.h1.streak = 12; log.h1.lastCompletedDate = ${JSON.stringify(dk(2))}; validateStreaks()`);
    r.check('no shield means it breaks', run(s, 'log.h1.streak') === 0, `(${run(s, 'log.h1.streak')})`);

    const s2 = sb(daily([4, 5, 6]), `gamification.streakShields = 3;`);
    run(s2, `log.h1.streak = 12; log.h1.lastCompletedDate = ${JSON.stringify(dk(4))}; validateStreaks()`);
    r.check('three missed days is not shielded', run(s2, 'log.h1.streak') === 0, `(${run(s2, 'log.h1.streak')})`);
    r.check('and no shield was wasted on it', run(s2, 'getStreakShields()') === 3, `(${run(s2, 'getStreakShields()')})`);
  }

  r.section('the spine leads with what is slipping');
  {
    const s = sb({
      hvi_habits: JSON.stringify([
        { id: 'solid', name: 'Read', schedule: 'daily' },
        { id: 'slipping', name: 'Meditate', schedule: 'daily' },
      ]),
      hvi_log: JSON.stringify({
        solid: { streak: 6, lastCompletedDate: dk(1), completedToday: false },
        slipping: { streak: 0, lastCompletedDate: dk(6), completedToday: false },
      }),
      hvi_habit_history: JSON.stringify({
        solid: [1, 2, 3, 4, 5, 6].map(dk),
        slipping: [6].map(dk),
      }),
    });
    const p = run(s, 'todayPriorities()');
    r.check('the neglected habit is first', p[0] && p[0].id === 'slipping', `(${p.map(x => x.id).join(', ')})`);
    r.check('it says why', /Slipping/.test(p[0] && p[0].why || ''), `(${p[0] && p[0].why})`);
    r.check('at most three items', p.length <= 3, `(${p.length})`);
  }

  r.section('an open goal holds one of the three slots');
  {
    const s = sb({
      hvi_habits: JSON.stringify([
        { id: 'a', name: 'A', schedule: 'daily' }, { id: 'b', name: 'B', schedule: 'daily' },
        { id: 'c', name: 'C', schedule: 'daily' }, { id: 'd', name: 'D', schedule: 'daily' },
      ]),
      hvi_log: JSON.stringify(Object.fromEntries(['a','b','c','d'].map(k =>
        [k, { streak: 0, lastCompletedDate: '', completedToday: false }]))),
      hvi_goals: JSON.stringify([{ id: 'g1', text: 'Run a half marathon', done: false }]),
    });
    const p = run(s, 'todayPriorities()');
    r.check('the goal is present', p.some(x => x.kind === 'goal'), `(${p.map(x => x.kind).join(', ')})`);
    r.check('habits still fill the rest', p.filter(x => x.kind === 'habit').length === 2, `(${p.length} items)`);
  }

  r.section('a finished day offers reflection instead of an empty panel');
  {
    const s = sb(daily([0]));
    run(s, `log.h1.completedToday = true;`);
    const p = run(s, 'todayPriorities()');
    r.check('something is still offered', p.length > 0);
    r.check('and it is the reflection', p[0].kind === 'reflect', `(${p[0].kind})`);
  }

  r.section('the spine renders for someone with nothing at all');
  {
    const s = sb({ hvi_habits: '[]', hvi_log: '{}' });
    const res = runCatching(s, 'todaySpineHTML()');
    r.check('it does not throw', res.ok, `(${res.error})`);
    const html = run(s, 'todaySpineHTML()');
    r.check('it renders something', typeof html === 'string' && html.length > 0);
    r.check('no NaN leaks into the markup', !/NaN|undefined/.test(html), '(bad interpolation)');
  }

  r.section('mood is one tap and survives a reload');
  {
    const s = sb(daily([1]));
    run(s, `setTodayMood(4)`);
    r.check('stored', (run(s, 'todayMood()') || {}).mood === 4, `(${JSON.stringify(run(s, 'todayMood()'))})`);
    r.check('persisted', /"mood":4/.test(s.localStorage._d.hvi_mood_log || ''), `(${s.localStorage._d.hvi_mood_log})`);
    run(s, `setTodayMood(99)`);
    r.check('out-of-range is clamped, not stored raw', (run(s, 'todayMood()') || {}).mood === 5,
      `(${JSON.stringify(run(s, 'todayMood()'))})`);
    // Every other per-day log travels with the account; one that silently does
    // not is a support question waiting to happen.
    r.check('and it syncs like every other daily log',
      run(s, `SYNC_KEYS.includes('hvi_mood_log')`), '(mood would not follow you to another device)');
  }

  // Asking someone who chose "forge discipline" for a training split and a
  // protein target is two screens of setup about a part of the app they just
  // said they were not here for.
  r.section('onboarding only asks what the chosen path needs');
  {
    const s = sb({});
    const plan = p => { run(s, `_obPath='${p}'`); return run(s, '_obPlan()'); };
    r.check('habits path is three steps', plan('habits').length === 3, `(${plan('habits').join(',')})`);
    r.check('and skips the training split', !plan('habits').includes(4));
    r.check('and skips the macro targets', !plan('habits').includes(5));
    r.check('fitness keeps the split', plan('fitness').includes(4) && !plan('fitness').includes(5),
      `(${plan('fitness').join(',')})`);
    r.check('nutrition keeps the macros', plan('nutrition').includes(5) && !plan('nutrition').includes(4),
      `(${plan('nutrition').join(',')})`);
    r.check('the full path still asks everything', plan('all').length === 5, `(${plan('all').join(',')})`);

    // Skipping a screen must not leave the targets it would have set undefined.
    run(s, `_obPath='habits'; _went=''; obFinish();`);
    const goals = JSON.parse(s.localStorage._d.hvi_diet_meta || '{}').dailyGoals || {};
    r.check('macro targets are still sane', goals.calories > 0 && goals.protein > 0,
      `(${JSON.stringify(goals)})`);
    r.check('onboarding is marked done', s.localStorage._d.hvi_onboarded === 'true');
  }

  // The Why was rendered by the spine and again by a card below it, so home
  // said the same sentence twice — and the second one was clipped mid-word by
  // the bottom of the screen.
  r.section('home states the identity line once');
  {
    const why = 'I want to be the kind of person who does what he said he would.';
    const s = sb({ hvi_why: JSON.stringify(why), hvi_goals: JSON.stringify([{ id: 'g1', text: 'Bench 100', done: false }]) },
      `settings={}; meta.lastOpenedDate=today(); editWhy=function(){ _edited=true; }; _edited=false;`);
    const html = run(s, `renderHome(); document.getElementById('view').innerHTML`) || '';
    const count = html.split(why).length - 1;
    r.check('the Why appears exactly once', count === 1, `(${count} times)`);
    r.check('and it is editable from there', /editWhy\(\)/.test(html), '(no way to change it)');
    r.check('the goals screen is still reachable', /go\('goals'\)/.test(html), '(only path to goals was the card)');
    r.check('the open goal count is shown', /1 active goal\b/.test(html), '(no goal summary)');
  }

  r.section('the spine is on the home screen');
  {
    const src = require('fs').readFileSync(
      require('path').join(require('./harness').APP, 'app.js'), 'utf8');
    r.check('renderHome calls it', /todaySpineHTML\(\)/.test(src), '(home never renders the spine)');
    const idx = require('fs').readFileSync(
      require('path').join(require('./harness').APP, 'index.html'), 'utf8');
    r.check('the script is loaded', /today\.js/.test(idx), '(file exists but is never loaded)');
    const sw = require('fs').readFileSync(
      require('path').join(require('./harness').APP, 'service-worker.js'), 'utf8');
    r.check('and precached', /today\.js/.test(sw), '(offline would serve a home screen without it)');
  }

  return r.finish();
};
