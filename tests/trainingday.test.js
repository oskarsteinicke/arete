// Sleep and recovery decide today's sets.
//
// Readiness used to stop at a sentence on the workout screen: the session came
// out the same after four hours of sleep as after eight. Now last night's sleep
// (or a Whoop recovery score) and the last week's training decide whether the
// session is as planned, a set lighter, or a deload, and the person can still
// train the full plan with one tap until they have logged anything.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

// Bench last done for 3 x 8 at 80; squat at 100 x 5; pull-ups at bodyweight.
const HISTORY = {
  [dk(9)]: { programId: 'ppl', dayIndex: 0, touched: true, exercises: [
    { exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8, completed: true }, { weight: 80, reps: 8, completed: true }] },
    { exerciseId: 'squat', sets: [{ weight: 100, reps: 5, completed: true }] },
    { exerciseId: 'pullup', sets: [{ weight: 0, reps: 10, completed: true }] },
  ] },
};
// The same three on a program that prescribes its own numbers.
const PROG = { id: 'cp_test', name: 'Test Block', ai: true, days: [
  { name: 'Day A', focus: 'Strength', ex: ['bench_press', 'squat', 'pullup'],
    rx: { bench_press: [4, 6], squat: [5, 5], pullup: [2, 10] } },
] };

function sb({ sleep, workouts, units = 'metric', habitsDone } = {}) {
  const s = createSandbox({ files: FILES, store: {
    hvi_onboarded: 'true',
    hvi_sleep_log: JSON.stringify(sleep || {}),
    hvi_workout_log: JSON.stringify(Object.assign({}, HISTORY, workouts || {})),
    hvi_workout_meta: JSON.stringify({ activeProgram: 'cp_test', currentDayIndex: 0 }),
    hvi_custom_programs: JSON.stringify([PROG]),
    hvi_settings: JSON.stringify({ units }),
    hvi_habits: JSON.stringify([{ id: 'h1', name: 'Read', schedule: 'daily' }]),
    hvi_log: JSON.stringify({ h1: { streak: habitsDone ? 9 : 0, lastCompletedDate: habitsDone ? T : '', completedToday: !!habitsDone } }),
  } });
  // The sandbox does not run the app's start-up, so its state is loaded here.
  run(s, `
    settings = { units: '${units}' }; curView = 'workout';
    track = function () {}; playSound = function () {}; haptic = function () {};
    habits = JSON.parse(localStorage.getItem('hvi_habits') || '[]');
    log = JSON.parse(localStorage.getItem('hvi_log') || '{}');
    sleepLog = JSON.parse(localStorage.getItem('hvi_sleep_log') || '{}');
    workoutLog = JSON.parse(localStorage.getItem('hvi_workout_log') || '{}');
    workoutMeta = JSON.parse(localStorage.getItem('hvi_workout_meta'));
    mealLog = {}; weightLog = {}; prs = {}; gamification = { xp: 0 };
    dietMeta = { dailyGoals: { calories: 2500, protein: 180, carbs: 280, fat: 80 }, goalType: 'maintain' };
  `);
  return s;
}
const call = s => JSON.parse(run(s, 'JSON.stringify(todaysTrainingCall())') || 'null');
const tier = s => (call(s) || { tier: null }).tier;
const session = s => JSON.parse(run(s, `curView = 'workoutActive'; renderWorkoutActive(); JSON.stringify(workoutLog[today()])`));
const sets = (wl, eid) => (wl.exercises.find(e => e.exerciseId === eid) || { sets: [] }).sets;
const shape = (wl, eid) => { const ss = sets(wl, eid); return `${ss.length}x${ss[0] && ss[0].reps}@${ss[0] && ss[0].weight}`; };

module.exports = function () {
  const r = createReporter('trainingday');

  r.section('last night decides the day');
  {
    r.check('eight hours: as planned', tier(sb({ sleep: { [T]: { hours: 8, quality: 4 } } })) === 'full');
    r.check('six and a half: still as planned', tier(sb({ sleep: { [T]: { hours: 6.5 } } })) === 'full');
    r.check('five and a half: a lighter session', tier(sb({ sleep: { [T]: { hours: 5.5 } } })) === 'trim');
    r.check('four: a deload', tier(sb({ sleep: { [T]: { hours: 4 } } })) === 'deload');
    r.check('enough hours rated 2 of 5: lighter', tier(sb({ sleep: { [T]: { hours: 7.5, quality: 2 } } })) === 'trim');
    r.check('a rating alone counts', tier(sb({ sleep: { [T]: { quality: 1 } } })) === 'trim');
    const why = call(sb({ sleep: { [T]: { hours: 5.25 } } }));
    r.check('and it says what it saw', /5h 15m of sleep/.test(why.why) && why.value === '5.3h', JSON.stringify(why));
    r.check('the night before last is not last night', call(sb({ sleep: { [dk(1)]: { hours: 3 } } })) === null);
    r.check('no sleep and an easy week: no call at all', call(sb({})) === null);
  }

  r.section('a Whoop score is the reading when there is one');
  {
    r.check('green: as planned', tier(sb({ sleep: { [T]: { whoopRecovery: 72 } } })) === 'full');
    r.check('low yellow: lighter', tier(sb({ sleep: { [T]: { whoopRecovery: 45 } } })) === 'trim');
    r.check('red: deload', tier(sb({ sleep: { [T]: { whoopRecovery: 28 } } })) === 'deload');
    r.check('it overrides the hours, which it already counts', tier(sb({ sleep: { [T]: { whoopRecovery: 72, hours: 5 } } })) === 'full');
    const c = call(sb({ sleep: { [T]: { whoopRecovery: 28 } } }));
    r.check('and is what the card shows', c.value === '28%' && /Whoop recovery 28%/.test(c.why), JSON.stringify(c));
  }

  r.section('a hard week counts, habits and meals do not');
  {
    const hard = {};
    for (let i = 1; i <= 4; i++) hard[dk(i)] = { programId: 'ppl', dayIndex: 0, touched: true, exercises: [{ exerciseId: 'squat', sets: [{ weight: 100, reps: 5, completed: true }] }] };
    r.check('four days in a row with no sleep logged: lighter', tier(sb({ workouts: hard })) === 'trim');
    r.check('four days in a row on a short night: deload', tier(sb({ workouts: hard, sleep: { [T]: { hours: 5.5 } } })) === 'deload');
    r.check('and it says so', /4 days of training in a row/.test(call(sb({ workouts: hard })).why), call(sb({ workouts: hard })).why);
    r.check('ticked or unticked habits make no difference',
      tier(sb({ sleep: { [T]: { hours: 7.5 } }, habitsDone: false })) === 'full' &&
      tier(sb({ sleep: { [T]: { hours: 5.5 } }, habitsDone: true })) === 'trim');
  }

  r.section('a lighter session: a set and a couple of reps fewer, same weight');
  {
    const wl = session(sb({ sleep: { [T]: { hours: 5.5 } } }));
    r.check('the session records what it was built with', wl.tier === 'trim', `(${wl.tier})`);
    r.check('bench 4 x 6 becomes 3 x 4 at the same 80', shape(wl, 'bench_press') === '3x4@80', shape(wl, 'bench_press'));
    r.check('squat 5 x 5 becomes 4 x 4 at the same 100', shape(wl, 'squat') === '4x4@100', shape(wl, 'squat'));
    r.check('two sets stay two', shape(wl, 'pullup') === '2x8@0', shape(wl, 'pullup'));
    r.check('nothing is ticked off for you', wl.exercises.every(e => e.sets.every(x => !x.completed)));
  }

  r.section('a deload: same sets, about 60% of the weight');
  {
    const wl = session(sb({ sleep: { [T]: { hours: 4 } } }));
    r.check('bench 80 becomes 47.5, rounded to a 2.5 kg step', shape(wl, 'bench_press') === '4x6@47.5', shape(wl, 'bench_press'));
    r.check('squat 100 becomes 60', shape(wl, 'squat') === '5x5@60', shape(wl, 'squat'));
    r.check('bodyweight stays bodyweight', shape(wl, 'pullup') === '2x10@0', shape(wl, 'pullup'));
    const lb = session(sb({ sleep: { [T]: { hours: 4 } }, units: 'imperial' }));
    r.check('in pounds it rounds to 5', shape(lb, 'bench_press') === '4x6@50', shape(lb, 'bench_press'));
  }

  r.section('a good night never adds weight');
  {
    const wl = session(sb({ sleep: { [T]: { hours: 9, quality: 5 } } }));
    r.check('the plan is the plan', shape(wl, 'bench_press') === '4x6@80' && shape(wl, 'squat') === '5x5@100' && wl.tier === 'full',
      `${shape(wl, 'bench_press')} ${shape(wl, 'squat')}`);
    const r2 = r; // keep the reporter name short below
    const prep = JSON.parse(run(sb({}), `JSON.stringify([adjustPrescription(4, 6, 80, 'full'), adjustPrescription(3, 1, 80, 'trim'), adjustPrescription(3, 5, 1.25, 'deload')])`));
    r2.check('one rep stays one; a tiny weight is left alone',
      prep[0].weight === 80 && prep[1].reps === 1 && prep[2].weight === 1.25, JSON.stringify(prep));
  }

  r.section('training the full plan anyway');
  {
    const s = sb({ sleep: { [T]: { hours: 5.5 } } });
    session(s);
    let card = run(s, `trainingAdviceHTML('session')`) || '';
    r.check('the session says why it is lighter', /Lighter session today/.test(card) && /5h 30m of sleep/.test(card), card.replace(/\s+/g, ' ').slice(0, 160));
    r.check('with a way to train as planned', /setSessionPlan\(true\)[^>]*>Train as planned/.test(card));
    run(s, 'setSessionPlan(true)');
    let wl = JSON.parse(run(s, 'JSON.stringify(workoutLog[today()])'));
    r.check('one tap rebuilds the full plan', shape(wl, 'bench_press') === '4x6@80' && wl.asPlanned === true && wl.tier === 'full', shape(wl, 'bench_press'));
    wl = session(s);
    r.check('and it stays that way on the next visit', shape(wl, 'bench_press') === '4x6@80', shape(wl, 'bench_press'));
    card = run(s, `trainingAdviceHTML('session')`) || '';
    r.check('the lighter session is still offered', /Training as planned/.test(card) && /setSessionPlan\(false\)[^>]*>Use the lighter session/.test(card));
    run(s, 'setSessionPlan(false)');
    wl = JSON.parse(run(s, 'JSON.stringify(workoutLog[today()])'));
    r.check('and taking it brings the lighter sets back', shape(wl, 'bench_press') === '3x4@80' && !wl.asPlanned, shape(wl, 'bench_press'));
  }

  r.section('sleep logged after the session was opened');
  {
    const s = sb({});
    let wl = session(s);
    r.check('opened before logging sleep: the plan', shape(wl, 'bench_press') === '4x6@80');
    run(s, `sleepLog[today()] = { hours: 5 };`);
    wl = session(s);
    r.check('nothing logged yet, so it follows the night', shape(wl, 'bench_press') === '3x4@80', shape(wl, 'bench_press'));
  }

  r.section('a started session is never rebuilt');
  {
    const s = sb({});
    session(s);
    run(s, `const wl = workoutLog[today()]; wl.exercises[0].sets[0].completed = true; _wSave(wl);`);
    run(s, `sleepLog[today()] = { hours: 4 };`);
    const wl = session(s);
    r.check('a ticked set keeps the session as it was', shape(wl, 'bench_press') === '4x6@80' && wl.exercises[0].sets[0].completed, shape(wl, 'bench_press'));
    run(s, 'setSessionPlan(false)');
    r.check('and the switch does nothing to it', shape(JSON.parse(run(s, 'JSON.stringify(workoutLog[today()])')), 'bench_press') === '4x6@80');
    const card = run(s, `trainingAdviceHTML('session')`) || '';
    r.check('the card offers no switch once sets are logged', !/setSessionPlan/.test(card), card.replace(/\s+/g, ' ').slice(0, 160));
  }

  // Found in the simulator: the switch prepares today's session from the tab,
  // and the session count went up by one before anything was trained.
  r.section('a prepared session is not a session');
  {
    const s = sb({ sleep: { [T]: { hours: 5.5 } } });
    const count = () => JSON.parse(run(s, 'JSON.stringify(_workoutStats())'));
    const before = count();
    run(s, 'setSessionPlan(true)');
    const after = count();
    r.check('preparing today\'s sets does not count', after.thisWeek === before.thisWeek && after.totalSessions === before.totalSessions,
      `(${before.totalSessions} -> ${after.totalSessions})`);
    run(s, `const wl = workoutLog[today()]; wl.exercises[0].sets[0].completed = true; _wSave(wl);`);
    r.check('one completed set does', count().totalSessions === before.totalSessions + 1, `(${count().totalSessions})`);
  }

  r.section('the Workout tab shows the numbers the session will have');
  {
    const s = sb({ sleep: { [T]: { hours: 5.5 } } });
    const html = run(s, `curView = 'workout'; renderWorkout(); document.getElementById('view').innerHTML`) || '';
    r.check('bench reads 3 × 4, not 4 × 6', /Bench Press[\s\S]{0,120}3 × 4/.test(html) && !/Bench Press[\s\S]{0,120}4 × 6/.test(html));
    r.check('with the reason above it', /Lighter session today/.test(html));
  }

  r.section('asking for last night, without nagging');
  {
    const lately = sb({ sleep: { [dk(2)]: { hours: 7 } } });
    const a = JSON.parse(run(lately, 'JSON.stringify(trainingAdvice())') || 'null');
    r.check('someone who logs sleep is asked for last night', a && a.kind === 'ask' && /showSleepPrompt\(\)/.test(a.action.fn), JSON.stringify(a));
    r.check('but not inside the session', (run(lately, `trainingAdviceHTML('session')`) || '') === '');
    r.check('someone who never logs sleep is not asked', run(sb({}), 'trainingAdvice()') === null);
    r.check('a normal day says nothing inside the session', (run(sb({ sleep: { [T]: { hours: 8 } } }), `trainingAdviceHTML('session')`) || '') === '');
  }

  r.section('the coach knows what today\'s session is');
  {
    const s = createSandbox({ files: FILES.concat(['profile.js', 'coach.js']), store: {
      hvi_onboarded: 'true', hvi_sleep_log: JSON.stringify({ [T]: { hours: 4 } }),
      hvi_workout_log: JSON.stringify(HISTORY), hvi_custom_programs: JSON.stringify([PROG]),
      hvi_workout_meta: JSON.stringify({ activeProgram: 'cp_test', currentDayIndex: 0 }) } });
    run(s, `settings = { units: 'metric' }; track = function () {};
      sleepLog = JSON.parse(localStorage.getItem('hvi_sleep_log')); workoutLog = JSON.parse(localStorage.getItem('hvi_workout_log'));
      workoutMeta = JSON.parse(localStorage.getItem('hvi_workout_meta')); habits = []; log = {}; mealLog = {}; weightLog = {}; prs = {};
      dietMeta = { dailyGoals: { calories: 2500, protein: 180, carbs: 280, fat: 80 }, goalType: 'maintain' };`);
    const fn = ['buildCoachSystemPrompt', '_coachSystemPrompt', 'buildCoachContext', '_buildCoachContext', 'coachSystemPrompt'].find(n => run(s, `typeof ${n}`) === 'function');
    const prompt = fn ? String(run(s, `${fn}()`) || '') : '';
    r.check('it is told the session is a deload, and why', /TODAY'S SESSION: a deload/.test(prompt) && /4h of sleep/.test(prompt), fn ? prompt.slice(prompt.indexOf('SLEEP:'), prompt.indexOf('SLEEP:') + 260) : '(no prompt builder found)');
    r.check('and not to push past it', /Do not tell them to push harder/.test(prompt));
  }

  return r.finish();
};
