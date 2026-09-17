// Workout session integrity and the Progress view's numbers.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','bodymap.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='workoutActive';
    track=function(){}; go=function(v){ _nav.push(v); curView=v; };
    playSound=function(){}; haptic=function(){}; awardXP=function(){};
    checkDailyQuests=function(){}; launchConfetti=function(){}; showMilestone=function(){};
    trackWeeklyWorkout=function(){}; startWorkoutTimer=function(){}; stopWorkoutTimer=function(){};
    startRestTimer=function(){}; _showToast=function(){};
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    workoutMeta=JSON.parse(localStorage.getItem('hvi_workout_meta')||'{}');
    weightLog=JSON.parse(localStorage.getItem('hvi_weight_log')||'{}');
    prs=JSON.parse(localStorage.getItem('hvi_prs')||'{}');
    tdeeProfile=JSON.parse(localStorage.getItem('hvi_tdee_profile')||'null');
  `);
  return s;
}
const completed = s => {
  const wl = JSON.parse(s.localStorage._d['hvi_workout_log'])[T];
  if (!wl) return 0;
  return (wl.exercises||[]).reduce((n,e) => n + (e.sets||[]).filter(x=>x.completed).length, 0);
};

module.exports = function () {
  const r = createReporter('workout');

  // Reopening mid-session used to rebuild the day from scratch whenever the
  // program/day pointer had drifted — wiping every set already logged.
  r.section('an in-progress session survives a reopen');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [T]: {
        programId: 'ppl', dayIndex: 2, touched: true,
        exercises: [
          { exerciseId: 'bench_press', sets: [
            { weight: 80, reps: 8, completed: true },
            { weight: 80, reps: 8, completed: true },
            { weight: 85, reps: 6, completed: true },
          ]},
          { exerciseId: 'squat', sets: [{ weight: 100, reps: 5, completed: false }] },
        ],
      }}),
      // pointer drifted back to day 0, e.g. a stale cloud copy won the pull
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0 }),
    });
    r.check('three sets logged', completed(s) === 3, `(${completed(s)})`);
    run(s, 'renderWorkoutActive()');
    r.check('all three survive', completed(s) === 3, `(${completed(s)} — DATA LOST)`);
    const meta = JSON.parse(s.localStorage._d['hvi_workout_meta']);
    r.check('the screen follows the live session', meta.currentDayIndex === 2, `(day ${meta.currentDayIndex})`);
  }

  r.section('sessions from before the touched flag also survive');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [T]: {
        programId: 'ppl', dayIndex: 2,          // no `touched`
        exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8, completed: true }] }],
      }}),
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0 }),
    });
    run(s, 'renderWorkoutActive()');
    r.check('recognised by its completed sets', completed(s) === 1, `(${completed(s)})`);
  }

  r.section('an untouched day still rebuilds for the current program');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [T]: {
        programId: 'ppl', dayIndex: 2,
        exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 0, reps: 10, completed: false }] }],
      }}),
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0 }),
    });
    run(s, 'renderWorkoutActive()');
    const wl = JSON.parse(s.localStorage._d['hvi_workout_log'])[T];
    r.check('rebuilt for day 0', wl.dayIndex === 0, `(day ${wl.dayIndex})`);
  }

  r.section('a day only counts as trained once something is logged');
  {
    const s = sb({ hvi_workout_log: JSON.stringify({
      [T]:     { programId:'ppl', dayIndex:0, exercises:[{ exerciseId:'bench_press', sets:[{weight:60,reps:5,completed:false}] }] },
      [dk(1)]: { programId:'ppl', dayIndex:0, exercises:[{ exerciseId:'bench_press', sets:[{weight:60,reps:5,completed:true}] }] },
      [dk(2)]: { dayName:'Run', exercises:[], source:'strava' },
    })});
    r.check('an opened-but-empty day is not trained', run(s, `trainedOnDay('${T}')`) === false);
    r.check('a logged day is trained', run(s, `trainedOnDay('${dk(1)}')`) === true);
    r.check('an imported activity counts', run(s, `trainedOnDay('${dk(2)}')`) === true);
  }

  // Epley, so a 5x100 session compares fairly with 8x85.
  r.section('estimated 1RM');
  {
    const s = sb({});
    r.check('100kg x 5 -> 117', Math.round(run(s,'_e1rm(100,5)')) === 117, `(${Math.round(run(s,'_e1rm(100,5)'))})`);
    r.check('a single rep is the weight', run(s,'_e1rm(140,1)') === 140);
    r.check('no weight means nothing', run(s,'_e1rm(0,10)') === 0);
  }

  r.section('strength is scored against an average lifter');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [dk(2)]: { programId:'ppl', dayIndex:0, touched:true, exercises:[
        { exerciseId:'bench_press',  sets:[{ weight:80,  reps:1, completed:true }] },  // 1.00x
        { exerciseId:'barbell_curl', sets:[{ weight:28,  reps:1, completed:true }] },  // 0.35x
        { exerciseId:'squat',        sets:[{ weight:130, reps:1, completed:true }] },  // 1.63x
      ]}}),
      hvi_weight_log: JSON.stringify({ [dk(1)]: 80 }),
      hvi_tdee_profile: JSON.stringify({ sex:'male', weight_kg:80 }),
    });
    const rel = JSON.parse(run(s,'JSON.stringify(_wpRelStrength())') || '{}');
    r.check('chest at bodyweight is about average', Math.abs(rel.chest.pct - 100) <= 1, `(${rel.chest && rel.chest.pct}%)`);
    r.check('a 28kg curl scores like an 80kg bench', rel.biceps.pct === rel.chest.pct,
      `(${rel.biceps.pct}% vs ${rel.chest.pct}%)`);
    r.check('quads above average', Math.abs(rel.quads.pct - 125) <= 1, `(${rel.quads.pct}%)`);
    r.check('bodyweight read from the log', run(s,'_wpBodyweight()') === 80);
  }

  r.section('muscle labels map to regions');
  {
    const s = sb({});
    const R = l => JSON.parse(run(s, `JSON.stringify(_wpRegionsFor(${JSON.stringify(l)}))`) || '[]');
    r.check('"Quads/Glutes" credits both', R('Quads/Glutes').sort().join() === 'glutes,quads');
    r.check('"Chest/Tri" credits both', R('Chest/Tri').sort().join() === 'chest,triceps');
    r.check('"Cardio" credits nothing', R('Cardio').length === 0);
    r.check('an unknown label is safe', R('Zzz').length === 0);
    const labels = [...new Set((require('fs').readFileSync(require('path').join(__dirname,'..','data.js'),'utf8')
      .match(/muscle:\s*'[^']*'/g) || []).map(x => x.replace(/muscle:\s*'/,'').replace(/'$/,'')))];
    const unmapped = labels.filter(l => R(l).length === 0);
    r.check('every data.js label resolves except cardio-ish',
      unmapped.every(l => /cardio|explosive/i.test(l)), `(${unmapped.join(', ')})`);
  }

  r.section('the body map renders');
  {
    const s = sb({});
    const svg = run(s, '_wpBodyMapSVG({chest:10,quads:4}, 10)') || '';
    r.check('emits an svg', svg.startsWith('<svg'));
    r.check('front and back', /FRONT/.test(svg) && /BACK/.test(svg));
    r.check('no NaN or undefined', !/NaN|undefined/.test(svg));
    r.check('uses the real artwork', (svg.match(/<path/g) || []).length >= 100,
      `(${(svg.match(/<path/g) || []).length} paths)`);
  }

  // ── What the tip claims you did last time ────────────────────────────────
  const S = (w, r, extra) => Object.assign({ weight: w, reps: r, completed: true }, extra || {});
  const withLast = (sets) => sb({
    hvi_workout_log: JSON.stringify({ [dk(3)]: { exercises: [
      { exerciseId: 'bench_press', name: 'Bench Press', sets } ] } }),
  });

  // An average is a number that was never performed. 8, 8, 5 became "avg 7".
  r.section('the tip reports the reps actually done');
  {
    const s = withLast([S(100, 8), S(100, 8), S(100, 5)]);
    const msg = run(s, `getProgressionTip('bench_press').msg`);
    r.check('every set is shown', /8, 8, 5/.test(msg), `(${msg})`);
    r.check('no invented average', !/avg/.test(msg), '(reporting a rep count never hit)');
  }

  r.section('uniform sets collapse rather than repeating');
  {
    const s = withLast([S(100, 8), S(100, 8), S(100, 8)]);
    const msg = run(s, `getProgressionTip('bench_press').msg`);
    r.check('reads as 8 x 3', /8 \u00d7 3/.test(msg), `(${msg})`);
  }

  // Every other performance number in the app excludes warmups.
  r.section('warmups do not count as working sets');
  {
    // A completed warmup plus two of three working sets done. Counting the
    // warmup inflates both halves of the ratio and overstates the session.
    const s = withLast([S(40, 15, { warmup: true }), S(100, 8), S(100, 8),
                        { weight: 100, reps: 0, completed: false }]);
    const msg = run(s, `getProgressionTip('bench_press').msg`);
    r.check('the ratio counts working sets only', /2\/3 sets/.test(msg),
      `(${msg} — warmup counted as a working set)`);
    r.check('the warmup weight is not reported', !/40/.test(msg), `(${msg})`);
  }

  r.section('the weight carries its unit');
  {
    const s = withLast([S(100, 8), S(100, 8), S(100, 8)]);
    r.check('metric says kg', /100 kg/.test(run(s, `getProgressionTip('bench_press').msg`)));
    const i = withLast([S(220, 8), S(220, 8), S(220, 8)]);
    run(i, `settings.units='imperial';`);
    r.check('imperial says lbs', /220 lbs/.test(run(i, `getProgressionTip('bench_press').msg`)),
      `(${run(i, `getProgressionTip('bench_press').msg`)})`);
  }

  // The target used to be read from last session's first set, so it chased
  // itself: hit 12 once and it asked for 12 from then on.
  r.section('the rep target comes from the program, not last time');
  {
    const s = withLast([S(100, 12), S(100, 6), S(100, 6)]);
    const msg = run(s, `getProgressionTip('bench_press').msg`);
    const target = run(s, `(lookupExercise('bench_press')||{}).dr`);
    r.check('the program defines a target', typeof target === 'number', `(${target})`);
    r.check('and the tip asks for that', new RegExp(`hit ${target} before`).test(msg),
      `(${msg}, program target ${target})`);
  }

  // ── What gets prefilled into today's sets ────────────────────────────────
  // This took the heaviest weight from anywhere in the session and the reps
  // from whichever set was last, describing a set nobody performed.
  r.section('prefill describes one real set');
  {
    const s = withLast([S(100, 8), S(100, 8), S(80, 15)]);
    const pick = run(s, `(function(){ const t = topWorkingSet(getLastExerciseSession('bench_press').ex.sets);
                                      return t.weight + 'x' + t.reps; })()`);
    r.check('takes 100x8, not 100x15', pick === '100x8',
      `(${pick} — weight and reps from different sets)`);

    // A heavy warmup must not become the prefill either.
    const w = run(s, `(function(){ const t = topWorkingSet([
      {weight:120, reps:1, completed:true, warmup:true},
      {weight:100, reps:8, completed:true}]); return t.weight + 'x' + t.reps; })()`);
    r.check('and skips warmups', w === '100x8', `(${w})`);

    const none = run(s, `topWorkingSet([{weight:100, reps:8, completed:false}]) === null`);
    r.check('nothing completed gives nothing', none === true);

    // The original bug was not in choosing a set, it was in composing two
    // values from different ones. Taking a single set object makes that
    // impossible by construction, so guard the construction: both prefilled
    // values must come from the same variable.
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(require('./harness').APP, 'workout.js'), 'utf8');
    const block = src.slice(src.indexOf('// Prefill from one real set'),
                            src.indexOf('const lastR', src.indexOf('// Prefill from one real set')) + 60);
    r.check('prefill reads weight and reps off one set',
      /const top = topWorkingSet\(/.test(block) &&
      /lastW = top \?/.test(block) && /lastR = top \?/.test(block),
      '(weight and reps sourced separately again)');
    r.check('and does not scan for a max independently',
      !/Math\.max\(\.\.\.lastSets/.test(block), '(back to mixing two sets)');
  }

  // ── Removing a whole exercise ────────────────────────────────────────────
  r.section('a whole exercise can be removed mid-workout');
  {
    const s = sb({ hvi_workout_log: JSON.stringify({ [T]: { exercises: [
      { exerciseId: 'bench_press', sets: [S(100, 8)] },
      { exerciseId: 'squat', sets: [{ weight: 0, reps: 0, completed: false }] } ] } }) });
    run(s, `confirm=function(){ _asked = true; return true; }; _asked=false;
            rerenderWorkoutActive=function(){};`);
    run(s, 'removeExercise(1)');
    const ids = run(s, `workoutLog['${T}'].exercises.map(e => e.exerciseId).join(',')`);
    r.check('it is gone', ids === 'bench_press', `(${ids})`);
    r.check('and persisted', JSON.parse(s.localStorage._d['hvi_workout_log'])[T].exercises.length === 1,
      '(reappears on reload)');
  }

  // Nothing on the active workout view can add an exercise, so emptying it
  // without an escape leaves a blank screen and the nav bar.
  r.section('emptying the session is not a dead end');
  {
    const s = sb({ hvi_workout_log: JSON.stringify({ [T]: { programId: 'ppl', dayIndex: 0,
      exercises: [{ exerciseId: 'bench_press', sets: [S(100, 8)] }] } }) });
    run(s, `confirm=function(){ return true; };`);
    run(s, 'removeExercise(0)');
    r.check('no exercises remain', run(s, `workoutLog['${T}'].exercises.length`) === 0);
    const html = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('it says so', /Nothing left/.test(html), `(${html.slice(0, 60)})`);
    r.check('and offers a way forward', /exerciseBrowser/.test(html),
      '(blank screen with no route out)');
  }

  r.section('removing logged work asks first');
  {
    const s = sb({ hvi_workout_log: JSON.stringify({ [T]: { exercises: [
      { exerciseId: 'bench_press', sets: [S(100, 8), S(100, 8)] } ] } }) });
    run(s, `_msg=''; confirm=function(m){ _msg=m; return false; }; rerenderWorkoutActive=function(){};`);
    run(s, 'removeExercise(0)');
    r.check('it warns what will be lost', /2 logged sets/.test(run(s, '_msg')), `(${run(s, '_msg')})`);
    r.check('and declining keeps it',
      run(s, `workoutLog['${T}'].exercises.length`) === 1, '(removed despite cancelling)');
  }

  r.section('rest defaults to three minutes');
  {
    const s = sb({});
    r.check('the constant is 180s', run(s, 'DEFAULT_REST_SEC') === 180);
    r.check('and that is what is armed', run(s, 'restTimerDur') === 180,
      `(${run(s, 'restTimerDur')})`);
  }

  // Two separate places moved the program on. finishWorkout advanced the day
  // and stamped lastWorkoutDate; the next morning checkReset saw that stamp
  // and advanced again. Nothing else ever writes lastWorkoutDate — synced
  // workouts from Apple Health and the rest do not — so the second advance was
  // always a duplicate, and every session skipped the day after it.
  r.section('a finished workout moves the program on by one day, not two');
  {
    const s = sb({
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0, lastWorkoutDate: '' }),
      hvi_workout_log: JSON.stringify({ [T]: {
        programId: 'ppl', dayIndex: 0, touched: true,
        exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 100, reps: 5, completed: true }] }],
      } }),
    });
    run(s, `
      habits=[]; log={}; journal={}; achievements=[]; gamification={xp:0,level:1,pillarXP:{}};
      meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
      setHabitHistory=function(){}; maybeAwardStreakShield=function(){}; checkAchievements=function(){};
      checkMilestones=function(){}; showToast=function(){}; renderHome=function(){};
      checkSleepPrompt=function(){}; checkInvitePrompt=function(){};
    `);
    const days = run(s, `findProgram('ppl').days.map(d => d.name)`);
    run(s, 'finishWorkout()');
    const after = run(s, 'workoutMeta.currentDayIndex');
    r.check(`finishing ${days[0]} leaves you on ${days[1]}`, after === 1, `(on ${days[after]})`);

    // Next morning, first open of the day.
    run(s, `workoutMeta.lastWorkoutDate = ${JSON.stringify(dk(1))};
            meta.lastOpenedDate = ${JSON.stringify(dk(1))}; checkReset();`);
    const next = run(s, 'workoutMeta.currentDayIndex');
    r.check('opening the app the next day does not advance again', next === 1,
      `(on ${days[next]} — ${days[1]} skipped)`);

    // And the day is not stuck either: the next finish still moves it on.
    run(s, `workoutLog[today()] = { programId:'ppl', dayIndex:1, touched:true,
              exercises:[{ exerciseId:'bench_press', sets:[{ weight:100, reps:5, completed:true }] }] };
            finishWorkout();`);
    r.check('the following session advances normally', run(s, 'workoutMeta.currentDayIndex') === 2,
      `(index ${run(s, 'workoutMeta.currentDayIndex')})`);
  }

  return r.finish();
};
