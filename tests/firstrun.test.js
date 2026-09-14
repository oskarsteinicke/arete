// Every screen, opened by someone with no data.
//
// GA4 says 136 of 243 sessions are first visits, so this is the majority case,
// not an edge case. A screen that throws when empty is failing more people than
// one that throws when full.
const { createSandbox, run, runCatching, createReporter } = require('./harness');

const ALL = ['data.js', 'app.js', 'connect.js', 'premium.js', 'workout.js', 'diet.js',
             'integrations.js', 'profile.js', 'social.js', 'coach.js', 'bodymap.js'];

const VIEWS = ['home', 'pillar', 'habits', 'habitCreate', 'stats', 'progressPhotos', 'workout',
  'workoutPicker', 'workoutActive', 'workoutHistory', 'workoutBuilder', 'exerciseBrowser',
  'workoutProgress', 'diet', 'dietAddMeal', 'dietRecipes', 'dietRecipeDetail', 'dietGoals',
  'dietTrend', 'dietTDEE', 'library', 'calendar', 'sleep', 'challenges', 'goals',
  'character', 'leaderboard', 'prHistory'];

// What init() leaves behind on a fresh install. Set directly rather than by
// calling init(), which schedules timers and network the suite should not run.
const FRESH = `
  settings={}; curView='home'; track=function(){}; history={pushState:function(){}};
  closeQuickLog=function(){}; qTimer=null; setTimeout=function(){};
  habits=DEFAULT_HABITS.slice(); log={};
  habits.forEach(h => log[h.id] = {streak:0,lastCompletedDate:'',completedToday:false});
  journal={}; meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
  workoutLog={}; workoutMeta={activeProgram:'ppl',currentDayIndex:0,lastWorkoutDate:''};
  mealLog={}; dietMeta={dailyGoals:{calories:2000,protein:150,carbs:200,fat:60}};
  weightLog={}; sleepLog={}; prs={}; achievements=[]; challenges=[]; goals=[];
  gamification={xp:0,level:1,pillarXP:{}}; routines={}; routineLog={};
  habitLinks={}; tdeeProfile=null; customPrograms={}; integrations={};
`;

function fresh() {
  const s = createSandbox({ files: ALL, store: { hvi_onboarded: 'true' } });
  run(s, FRESH);
  return s;
}

module.exports = function () {
  const r = createReporter('firstrun');

  r.section('every screen survives having no data');
  {
    for (const v of VIEWS) {
      const s = fresh();
      const res = runCatching(s, `go(${JSON.stringify(v)}, {}, false)`);
      const html = run(s, `document.getElementById('view').innerHTML`) || '';
      r.check(v, res.ok && html.length > 0,
        res.ok ? '(rendered nothing)' : `(${res.error})`);
    }
  }

  // go() writes only the view name into the URL; anything identifying what to
  // show travels in history state, which a cold launch does not have. Restoring
  // such a view gives the screen without its subject, and renderPillar threw
  // outright on exactly that.
  r.section('a cold launch cannot restore a screen that needs an id');
  {
    const src = require('fs').readFileSync(
      require('path').join(require('./harness').APP, 'app.js'), 'utf8');
    const m = src.match(/const NEEDS_PARAM = \[([^\]]*)\]/);
    r.check('the exclusion list exists', !!m, '(hash restore is unguarded again)');
    const listed = m ? m[1] : '';
    // Whatever reads a param out of go()'s arguments belongs on that list.
    for (const [view, prop] of [['pillar', 'curPillar'], ['dietRecipeDetail', 'curRecipeId']]) {
      r.check(`${view} is excluded`, listed.includes(`'${view}'`),
        `(${prop} would be null on restore)`);
    }
  }

  r.section('and a pillar with no id goes home instead of throwing');
  {
    const s = fresh();
    run(s, `_went=''; go=function(v){ _went=v; }; curPillar=null;`);
    const res = runCatching(s, 'renderPillar()');
    r.check('it does not throw', res.ok, `(${res.error})`);
    r.check('it redirects home', run(s, '_went') === 'home', `(${run(s, '_went')})`);
  }

  return r.finish();
};
