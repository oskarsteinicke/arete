// Log anything: one sentence about the day, sorted into meals, water, sleep,
// habits, weight and mood, checked, and logged only on a tap.
//
// The traps: ticking a habit the person said they skipped, ticking "Read" for
// the word "already", treating a glass of water as the water habit, trusting
// whatever the AI returns (unknown habits, 99,999 calories), mixing up pounds
// and kilos, and an Undo that leaves half of it behind.
const fs = require('fs'), path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'connect.js', 'today.js', 'diet.js', 'profile.js', 'logany.js'];
const T = new Date().toLocaleDateString('en-CA');

function sb({ imperial = false } = {}) {
  const s = createSandbox({ files: FILES, store: { hvi_onboarded: 'true' } });
  run(s, `
    settings = { units: '${imperial ? 'imperial' : 'metric'}' }; curView = 'home'; track = function () {}; go = function () {};
    history = { pushState: function () {} };
    habits = [{ id: 'h01', name: 'Meditate / breathwork (10+ min)', category: 'mindset' },
              { id: 'h09', name: 'Read 30 minutes', category: 'learning' },
              { id: 'h07', name: 'Drink 3L water', category: 'health' },
              { id: 'h05', name: 'Morning workout / movement', category: 'fitness' }];
    log = { h01: { streak: 2, completedToday: false }, h09: { streak: 0, completedToday: false }, h07: { streak: 0, completedToday: false }, h05: { streak: 1, completedToday: true } };
    journal = {}; meta = {}; prs = {}; achievements = []; challenges = []; goals = []; gamification = { xp: 0, level: 1, pillarXP: {} };
    mealLog = {}; weightLog = {}; sleepLog = { '${T}': { hours: 7, quality: 4 } }; workoutLog = {}; workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0 };
    dietMeta = { dailyGoals: { calories: 2600, protein: 175, carbs: 300, fat: 75 }, goalType: 'maintain' };
    LS.set('hvi_meal_log', mealLog); LS.set('hvi_sleep_log', sleepLog);
  `);
  return s;
}
const local = (s, text) => JSON.parse(run(s, `JSON.stringify(_laLocal(${JSON.stringify(text)}))`));
const clean = (s, raw) => JSON.parse(run(s, `JSON.stringify(_laSanitize(${JSON.stringify(raw)}))`));
const of = (list, type) => list.filter(e => e.type === type);

module.exports = async function () {
  const r = createReporter('logany');

  r.section('the plain reader catches the obvious');
  {
    const s = sb();
    r.check('half a litre of water', of(local(s, 'had half a litre of water'), 'water')[0]?.ml === 500);
    r.check('glasses and millilitres add up', of(local(s, '2 glasses of water and 500 ml water'), 'water')[0]?.ml === 1000);
    r.check('"slept about 6 hours"', of(local(s, 'slept about 6 hours'), 'sleep')[0]?.hours === 6);
    r.check('"slept 7h 30m"', of(local(s, 'slept 7h 30m'), 'sleep')[0]?.hours === 7.5);
    r.check('"weighed 80.4 kg"', of(local(s, 'weighed 80.4 kg this morning'), 'weight')[0]?.value === 80.4);
    r.check('"did my meditation" ticks Meditate', of(local(s, 'did my meditation'), 'habit').map(e => e.id).join() === 'h01');
    const eggs = of(local(s, 'two eggs and toast'), 'meal')[0];
    r.check('common foods become a meal', !!eggs && eggs.items.length >= 1 && eggs.items.every(it => it.calories > 0), JSON.stringify(eggs));
  }

  r.section('and does not tick habits that were not done');
  {
    const s = sb();
    r.check('"didn\'t meditate" ticks nothing', of(local(s, "didn't meditate today"), 'habit').length === 0);
    r.check('"skipped my workout" ticks nothing', of(local(s, 'skipped my workout'), 'habit').length === 0);
    r.check('"already" is not "read"', of(local(s, 'already had lunch'), 'habit').length === 0);
    r.check('a litre of water is water, not the water habit', of(local(s, 'a litre of water'), 'habit').length === 0 && of(local(s, 'a litre of water'), 'water')[0]?.ml === 1000);
  }

  r.section('what the AI sends back is checked, not trusted');
  {
    const s = sb();
    const out = clean(s, { entries: [
      { type: 'habit', id: 'h01' }, { type: 'habit', id: 'made_up' }, { type: 'habit', id: 'h01' },
      { type: 'meal', meal: 'Brunch', items: [{ name: 'Eggs (2 large)', calories: 156, protein: 13, carbs: 1, fat: 11 }, { name: 'Glitch', calories: 99999 }] },
      { type: 'sleep', bedtime: '23:30', wake: '07:00' },
      { type: 'mood', mood: 9 }, { type: 'mood', mood: 4 },
      { type: 'weight', value: 176, unit: 'lb' },
      { type: 'water', ml: 500000 },
      { type: 'launch_rockets' },
    ] });
    r.check('an unknown habit is dropped, a repeat is folded', of(out, 'habit').map(e => e.id).join() === 'h01');
    const meal = of(out, 'meal')[0];
    r.check('99,999 calories is dropped, the real item kept', meal && meal.items.length === 1 && meal.items[0].name === 'Eggs (2 large)', JSON.stringify(meal));
    r.check('an unknown meal name becomes the meal for this hour', meal && ['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(meal.meal));
    r.check('bedtime and wake give the hours', of(out, 'sleep')[0]?.hours === 7.5);
    r.check('a mood of 9 is dropped, 4 kept', of(out, 'mood').map(e => e.mood).join() === '4');
    r.check('176 lb is stored as 79.8 kg for a metric user', of(out, 'weight')[0]?.value === 79.8);
    r.check('500 litres of water is dropped', of(out, 'water').length === 0);
    r.check('unknown types are dropped', out.every(e => ['habit', 'meal', 'sleep', 'mood', 'weight', 'water'].includes(e.type)));
    const imp = clean(sb({ imperial: true }), [{ type: 'weight', value: 80, unit: 'kg' }]);
    r.check('80 kg is stored as 176.4 lbs for an imperial user', imp[0]?.value === 176.4);
  }

  r.section('the AI is asked for exactly this');
  {
    const s = sb();
    const p = String(run(s, '_laPrompt()'));
    r.check('JSON only', /Output ONLY a JSON object/.test(p));
    r.check('with the habit list, ids and names', /\[h01\] Meditate \/ breathwork \(10\+ min\)/.test(p) && /\[h09\] Read 30 minutes/.test(p));
    r.check('never plans, never invention', /never plans/.test(p) && /Never invent/.test(p));
  }

  r.section('read through the AI, or on the phone when it fails');
  {
    const s = sb();
    run(s, `aiConsent = function () { return 'yes'; };
      _aiFetch = function () { return Promise.resolve('\`\`\`json\\n{"entries":[{"type":"water","ml":750},{"type":"habit","id":"h09"}]}\\n\`\`\`'); };`);
    const viaAI = JSON.parse(await run(s, `_laRead('had 750 ml water and read').then(x => JSON.stringify(x))`));
    r.check('the AI answer is used, code fences and all', of(viaAI, 'water')[0]?.ml === 750 && of(viaAI, 'habit')[0]?.id === 'h09', JSON.stringify(viaAI));
    run(s, `_aiFetch = function () { return Promise.reject(new Error('offline')); };`);
    const viaPhone = JSON.parse(await run(s, `_laRead('half a litre of water').then(x => JSON.stringify(x))`));
    r.check('offline, the phone reads it', of(viaPhone, 'water')[0]?.ml === 500);
    r.check('and says it only read the basics', /only the basics/.test(String(run(s, '_laNote'))));
  }

  r.section('logging it, and one Undo for all of it');
  {
    const s = sb();
    run(s, `_undo = _laApply([
      { type: 'meal', meal: 'Breakfast', items: [{ name: 'Eggs (2 large)', calories: 156, protein: 13, carbs: 1, fat: 11 }, { name: 'Toast (2 slices)', calories: 160, protein: 6, carbs: 30, fat: 2 }] },
      { type: 'water', ml: 500 }, { type: 'sleep', hours: 6.5 }, { type: 'habit', id: 'h01' },
      { type: 'weight', value: 80.4 }, { type: 'mood', mood: 4 }]);`);
    const meals = JSON.parse(run(s, `JSON.stringify((LS.get('hvi_meal_log', {})['${T}'] || {}).meals || [])`));
    r.check('the meal is logged with both items', meals.length === 1 && meals[0].name === 'Breakfast' && meals[0].items.length === 2);
    r.check('the water', run(s, `(LS.get('hvi_water_log', {}) || {})['${T}']`) === 500);
    r.check('last night\'s sleep', run(s, `LS.get('hvi_sleep_log', {})['${T}'].hours`) === 6.5);
    r.check('the habit is ticked through the app\'s own tap', run(s, `log.h01.completedToday`) === true && run(s, `(LS.get('hvi_habit_history', {}).h01 || []).includes('${T}')`) === true);
    r.check('the weight', run(s, `LS.get('hvi_weight_log', {})['${T}']`) === 80.4);
    r.check('the mood', run(s, `(LS.get('hvi_mood_log', {})['${T}'] || {}).mood`) === 4);
    run(s, '_undo()');
    r.check('Undo: the meal is gone', JSON.parse(run(s, `JSON.stringify((LS.get('hvi_meal_log', {})['${T}'] || {}).meals || [])`)).length === 0);
    r.check('the water is gone', !run(s, `(LS.get('hvi_water_log', {}) || {})['${T}']`));
    r.check('the sleep is back to what it was', run(s, `LS.get('hvi_sleep_log', {})['${T}'].hours`) === 7);
    r.check('the habit is unticked', run(s, `log.h01.completedToday`) === false);
    r.check('the weight is gone', run(s, `LS.get('hvi_weight_log', {})['${T}']`) == null);
    r.check('the mood is gone', !run(s, `(LS.get('hvi_mood_log', {})['${T}'] || null)`));
  }

  r.section('a habit already done today is shown as done, not ticked again');
  {
    const s = sb();
    r.check('marked as already done', run(s, `_laDescribe({ type: 'habit', id: 'h05' }).already`) === true);
    run(s, `_laApply([{ type: 'habit', id: 'h05' }])`);
    r.check('and left done (a second tap would untick it)', run(s, 'log.h05.completedToday') === true);
  }

  // With Whoop connected, Whoop's night is the record.
  r.section('a night Whoop already sent is not overwritten');
  {
    const s = sb();
    run(s, `sleepLog[today()] = { hours: 7.4, bedtime: '23:10', wake: '07:05', source: 'whoop' };
      whoopHasNight = function (d) { return !!(sleepLog[d] && sleepLog[d].source === 'whoop'); };`);
    const d = run(s, `JSON.stringify(_laDescribe({ type: 'sleep', hours: 5 }))`);
    r.check('the sleep line says Whoop has it and is not ticked', JSON.parse(d).already === true && /Whoop/.test(JSON.parse(d).sub), d);
    run(s, `_laApply([{ type: 'sleep', hours: 5 }])`);
    r.check('and logging leaves Whoop\'s night alone', run(s, `sleepLog[today()].hours`) === 7.4);
    run(s, `sleepLog[today()] = { hours: 6 }`);
    r.check('a night typed in by hand can still be changed', run(s, `_laDescribe({ type: 'sleep', hours: 5 }).already`) === false);
  }

  // ── workouts ──────────────────────────────────────────────────────────────
  // The traps: "2 eggs" read as sets, "squat" winning over "front squat",
  // pounds stored as kilos, a set of 500 reps, an exercise the app has never
  // heard of, a session finished twice, the program skipping a day for a
  // stray set of curls, Whoop's reading lost, and an Undo that leaves the
  // record, the XP or the ticked habit behind.
  const wo = list => of(list, 'workout')[0];
  const ex = (w, id) => w && w.exercises.find(x => x.id === id);

  r.section('the plain reader reads sets and reps');
  {
    const s = sb();
    const one = wo(local(s, 'bench 3x8 at 80'));
    r.check('"bench 3x8 at 80"', !!ex(one, 'bench_press') && ex(one, 'bench_press').sets.length === 3 && ex(one, 'bench_press').sets.every(x => x.reps === 8 && x.weight === 80), JSON.stringify(one));
    const two = wo(local(s, 'bench 3x8 at 80, squats 5x5 at 100'));
    r.check('two exercises in one sentence', two && two.exercises.length === 2 && ex(two, 'squat').sets.length === 5 && ex(two, 'squat').sets[0].weight === 100);
    const bw = wo(local(s, '3 sets of 10 pull-ups'));
    r.check('"3 sets of 10 pull-ups", bodyweight', !!ex(bw, 'pullup') && ex(bw, 'pullup').sets.length === 3 && ex(bw, 'pullup').sets[0].weight === 0, JSON.stringify(bw));
    r.check('"front squats" is a front squat, not a squat', !!ex(wo(local(s, 'front squats 3x5 at 90')), 'front_squat') && !ex(wo(local(s, 'front squats 3x5 at 90')), 'squat'));
    r.check('"incline bench" is the incline press, not the bench', !!ex(wo(local(s, 'incline bench 3x8 at 60')), 'incline_bench') && !ex(wo(local(s, 'incline bench 3x8 at 60')), 'bench_press'));
    r.check('"incline db", "incline dumbbell press" and "dumbbell rows" are the DB lifts',
      !!ex(wo(local(s, 'incline db 3x10 at 30')), 'incline_db') && !!ex(wo(local(s, 'incline dumbbell press 3x10 at 30')), 'incline_db') && !!ex(wo(local(s, 'dumbbell rows 3x10 at 25')), 'db_row'));
    r.check('pounds said, kilos stored for a metric user', ex(wo(local(s, 'deadlift 1x5 at 315 lbs')), 'deadlift')?.sets[0].weight === 142.9);
    r.check('"squats 5x5 100kg", the unit after the number', ex(wo(local(s, 'squats 5x5 100kg')), 'squat')?.sets[0].weight === 100);
    r.check('"two eggs and toast" is not a workout', !wo(local(s, 'two eggs and toast')));
    r.check('a number without sets and reps is not one either', !wo(local(s, 'bench pressed 80 today')));
    const mixed = local(s, 'two eggs and toast, bench 3x8 at 80, slept about 6 hours');
    r.check('and it sits alongside the rest of the day', !!wo(mixed) && of(mixed, 'sleep').length === 1 && of(mixed, 'meal').length === 1);
    const aliases = String(run(s, `JSON.stringify(Object.values(_LA_EX_ALIAS).filter(id => !EXERCISES[id]))`));
    r.check('every nickname points at a real exercise', aliases === '[]', aliases);
  }

  r.section('what the AI sends back for a workout is checked');
  {
    const s = sb();
    const out = wo(clean(s, { entries: [
      { type: 'workout', exercises: [
        { id: 'bench_press', sets: 3, reps: 8, weight: 80, unit: 'kg' },
        { id: 'made_up_lift', sets: 3, reps: 8, weight: 80 },
        { id: 'squat', sets: [{ reps: 5, weight: 225 }, { reps: 500, weight: 100 }, { reps: 5, weight: 5000 }], unit: 'lb' },
        { id: 'bench_press', sets: 1, reps: 6, weight: 85, unit: 'kg' },
        { id: 'ohp', sets: 99, reps: 8, weight: 40 },
      ] },
      { type: 'workout', exercises: [{ id: 'pullup', sets: 3, reps: 10, weight: 0 }] },
      { type: 'workout', exercises: [] },
    ] }));
    r.check('an exercise the app does not know is dropped', !ex(out, 'made_up_lift'));
    r.check('"sets": 3 is three sets', ex(out, 'bench_press') && ex(out, 'bench_press').sets.length === 4);
    r.check('the same exercise twice is one exercise, sets in order', ex(out, 'bench_press') && ex(out, 'bench_press').sets[3].weight === 85 && out.exercises.filter(x => x.id === 'bench_press').length === 1);
    r.check('225 lb is stored as 102.1 kg; 500 reps and 5,000 lb are dropped', ex(out, 'squat') && ex(out, 'squat').sets.length === 1 && ex(out, 'squat').sets[0].weight === 102.1, JSON.stringify(ex(out, 'squat')));
    r.check('99 sets is not a set count', !ex(out, 'ohp'));
    r.check('two workout entries are one session', of(clean(s, { entries: [{ type: 'workout', exercises: [{ id: 'squat', sets: 1, reps: 5, weight: 100 }] }, { type: 'workout', exercises: [{ id: 'pullup', sets: 1, reps: 5, weight: 0 }] }] }), 'workout').length === 1 && !!ex(out, 'pullup'));
    const imp = wo(clean(sb({ imperial: true }), [{ type: 'workout', exercises: [{ id: 'bench_press', sets: 1, reps: 5, weight: 100, unit: 'kg' }, { id: 'squat', sets: 1, reps: 5, weight: 600 }] }]));
    r.check('for someone on pounds, kilos said become pounds', ex(imp, 'bench_press')?.sets[0].weight === 220.5);
    r.check('and a weight with no unit is already theirs, up to their own scale', ex(imp, 'squat')?.sets[0].weight === 600);
  }

  r.section('the AI is told the exercises by id');
  {
    const s = sb();
    const p = String(run(s, '_laPrompt()'));
    r.check('the workout entry and its shape', /"type":"workout"/.test(p) && /When the sets differ, list them/.test(p));
    r.check('with every exercise\'s id and name', /\[bench_press\] Bench Press/.test(p) && /\[front_squat\] Front Squat/.test(p));
    r.check('and the person\'s own unit for when none is said', /"kg" if they did not say/.test(p) && /"lb" if they did not say/.test(String(run(sb({ imperial: true }), '_laPrompt()'))));
  }

  r.section('the list says what logging it will do');
  {
    const s = sb();
    const d = (e) => JSON.parse(run(s, `JSON.stringify(_laDescribe(${JSON.stringify(e)}))`));
    const bench = { id: 'bench_press', sets: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }, { reps: 8, weight: 80 }] };
    const one = d({ type: 'workout', exercises: [bench] });
    r.check('one exercise: "Bench Press 3×8 at 80 kg"', one.kind === 'Workout' && one.main === 'Bench Press 3×8 at 80 kg', one.main);
    r.check('a first time is a new PR, and today\'s planned Push A', /New PR: Bench Press/.test(one.sub) && /Counts as Push A/.test(one.sub), one.sub);
    const two = d({ type: 'workout', exercises: [bench, { id: 'squat', sets: [{ reps: 5, weight: 100 }, { reps: 3, weight: 110 }] }] });
    r.check('more: a count, then each one, sets that differ set by set', two.main === '2 exercises, 5 sets' && /Barbell Squat 100×5, 110×3 kg/.test(two.sub), JSON.stringify(two));
    run(s, `prs.bench_press = { weight: 100, reps: 8 };`);
    r.check('below the record: no PR claimed', !/New PR/.test(d({ type: 'workout', exercises: [bench] }).sub));
    run(s, `prs.bench_press = { weight: 100, reps: 5 };`);
    r.check('but 80×8 beats 100×5 on weight times reps, as on the workout screen', /New PR: Bench Press/.test(d({ type: 'workout', exercises: [bench] }).sub));
    r.check('curls alone are not today\'s Push A', !/Counts as/.test(d({ type: 'workout', exercises: [{ id: 'barbell_curl', sets: [{ reps: 10, weight: 30 }] }] }).sub));
    run(s, `workoutLog[today()] = { programId: 'ppl', dayIndex: 0, touched: true, exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8, completed: true }] }] };`);
    r.check('with a session going: "Added to today\'s session"', /Added to today's session/.test(d({ type: 'workout', exercises: [bench] }).sub));
  }

  r.section('a new session is finished as Finish finishes one, and Undo takes all of it back');
  {
    const s = sb();
    run(s, `log.h05.completedToday = false; LS.set('hvi_habit_links', { h05: 'workout' });
      workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0, lastWorkoutDate: '2026-01-01' }; LS.set('hvi_workout_meta', workoutMeta);
      _undo = _laApply([{ type: 'workout', exercises: [
        { id: 'bench_press', sets: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }, { reps: 8, weight: 80 }] },
        { id: 'incline_db', sets: [{ reps: 10, weight: 30 }, { reps: 10, weight: 30 }] }] }]);`);
    const w = JSON.parse(run(s, `JSON.stringify(LS.get('hvi_workout_log', {})[today()])`));
    r.check('the sets are in today\'s log, finished', w && w.exercises.length === 2 && w.exercises.every(x => x.sets.every(st => st.completed)) && w.exercises[0].sets.length === 3);
    r.check('as today\'s Push A', w && w.programId === 'ppl' && w.dayIndex === 0 && w.dayName === 'Push A');
    r.check('the rest of the app sees a session today', run(s, `trainedOnDay(today())`) === true && run(s, `classifyTodaySession().source`) === 'logged');
    r.check('the records are set', run(s, `JSON.stringify([prs.bench_press.weight, prs.bench_press.reps, prs.incline_db.weight])`) === '[80,8,30]');
    r.check('the program moves to its next day', run(s, `workoutMeta.currentDayIndex`) === 1 && run(s, `workoutMeta.lastWorkoutDate === today()`) === true);
    r.check('XP for the session and both records', run(s, `gamification.xp`) >= 250, `(${run(s, 'gamification.xp')})`);
    r.check('this week counts it', run(s, `gamification.weeklyStats.workoutDays.includes(today())`) === true);
    r.check('the habit linked to working out is ticked', run(s, `log.h05.completedToday`) === true);
    run(s, '_undo()');
    r.check('Undo: the session is gone', !run(s, `LS.get('hvi_workout_log', {})[today()]`) && run(s, `trainedOnDay(today())`) === false);
    r.check('the records are gone', run(s, `JSON.stringify(prs)`) === '{}' && run(s, `JSON.stringify(LS.get('hvi_prs', {}))`) === '{}');
    r.check('the program is back on Push A', run(s, `workoutMeta.currentDayIndex`) === 0 && run(s, `workoutMeta.lastWorkoutDate`) === '2026-01-01');
    r.check('the XP is back to where it was', run(s, `gamification.xp`) === 0, `(${run(s, 'gamification.xp')})`);
    r.check('the week no longer counts it', run(s, `gamification.weeklyStats.workoutDays.includes(today())`) === false);
    r.check('and the linked habit is unticked', run(s, `log.h05.completedToday`) === false);
  }

  r.section('a session already going today gets the sets, and is left to its own Finish');
  {
    const s = sb();
    run(s, `workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0 };
      workoutLog[today()] = { programId: 'ppl', dayIndex: 0, touched: true, exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8, completed: true }] }] };
      LS.set('hvi_workout_log', workoutLog);
      _undo = _laApply([{ type: 'workout', exercises: [{ id: 'bench_press', sets: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }] }, { id: 'ohp', sets: [{ reps: 8, weight: 40 }] }] }]);`);
    const w = JSON.parse(run(s, `JSON.stringify(workoutLog[today()])`));
    r.check('the bench sets join the ones there', w.exercises.find(x => x.exerciseId === 'bench_press').sets.length === 3);
    r.check('a new exercise is added', !!w.exercises.find(x => x.exerciseId === 'ohp'));
    r.check('it is not finished for them: same day, no session XP', run(s, `workoutMeta.currentDayIndex`) === 0 && run(s, `gamification.xp`) === 200, `(${run(s, 'gamification.xp')})`);
    run(s, '_undo()');
    r.check('Undo leaves it as it was', JSON.parse(run(s, `JSON.stringify(workoutLog[today()])`)).exercises.length === 1 && JSON.parse(run(s, `JSON.stringify(workoutLog[today()])`)).exercises[0].sets.length === 1);
  }

  r.section('a day Whoop logged on its own keeps Whoop\'s reading under the sets');
  {
    const s = sb();
    run(s, `workoutLog[today()] = { dayName: 'Soccer', duration: 90, exercises: [], source: 'whoop', whoopId: 'w1', strain: 15.2, avgHr: 150, calories: 900 };
      LS.set('hvi_workout_log', workoutLog);
      _undo = _laApply([{ type: 'workout', exercises: [{ id: 'squat', sets: [{ reps: 5, weight: 100 }] }] }]);`);
    const w = JSON.parse(run(s, `JSON.stringify(workoutLog[today()])`));
    r.check('the sets are the session now', !w.source && w.exercises[0].exerciseId === 'squat');
    r.check('with Whoop\'s reading under it, as a sync would put it', w.whoop && w.whoop.id === 'w1' && w.whoop.sport === 'Soccer' && w.whoop.strain === 15.2 && w.whoop.minutes === 90, JSON.stringify(w.whoop));
    run(s, '_undo()');
    r.check('Undo gives Whoop\'s day back', JSON.parse(run(s, `JSON.stringify(workoutLog[today()])`)).source === 'whoop');
  }

  r.section('pounds stay pounds for someone on pounds');
  {
    const s = sb({ imperial: true });
    run(s, `_laApply(_laSanitize([{ type: 'workout', exercises: [{ id: 'bench_press', sets: 3, reps: 5, weight: 225 }] }]))`);
    r.check('225 is stored as 225, their unit', run(s, `workoutLog[today()].exercises[0].sets[0].weight`) === 225 && run(s, `prs.bench_press.weight`) === 225);
  }

  r.section('the toast names the new records');
  {
    const s = sb();
    run(s, `_msg = ''; showActionToast = function (m) { _msg = m; }; closeLogAnything = function () {};
      _laEntries = [{ type: 'workout', on: true, exercises: [{ id: 'bench_press', sets: [{ reps: 8, weight: 80 }] }, { id: 'squat', sets: [{ reps: 5, weight: 100 }] }] }, { type: 'water', ml: 500, on: true }];
      applyLogAnything();`);
    r.check('"Logged 2 things, 2 new PRs"', run(s, '_msg') === 'Logged 2 things, 2 new PRs', run(s, '_msg'));
  }

  r.section('no mic button inside the native apps');
  {
    const s = sb();
    run(s, `window.webkitSpeechRecognition = function () {};`);
    r.check('on the web, where the browser can listen, there is one', !!run(s, '_laSR()'));
    run(s, `window.Capacitor = { isNativePlatform: function () { return true; } };`);
    r.check('in the app, where it would need microphone permission, there is not', !run(s, '_laSR()'));
  }

  r.section('the words follow the brand');
  {
    const code = fs.readFileSync(path.join(APP, 'logany.js'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    r.check('no em dashes', !/—/.test(code));
  }

  return r.finish();
};
