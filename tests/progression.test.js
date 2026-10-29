// Every prescribed rep last time earns the next weight today.
//
// The app used to leave this to a tip ("try 82.5 kg today") and start the
// session at last time's weight, so every increase was typed by hand, and an
// AI-built program had no way to get heavier at all. Now the session starts
// at the earned weight, says why on the exercise, and can be taken back.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

const PROG = { id: 'cp_test', name: 'Test Block', ai: true, days: [
  { name: 'Day A', focus: 'Strength', ex: ['bench_press', 'incline_db', 'pullup'],
    rx: { bench_press: [4, 6], incline_db: [3, 8], pullup: [3, 8] } },
] };
// Same lifts with no prescription: the exercise's own sets and reps apply.
const PLAIN = { id: 'cp_plain', name: 'Plain', days: [{ name: 'Day P', focus: 'Press', ex: ['bench_press', 'ohp'] }] };

const sets = (n, w, r, done = true) => Array.from({ length: n }, () => ({ weight: w, reps: r, completed: done }));
const day = (exercises, extra) => Object.assign({ programId: 'cp_test', dayIndex: 0, touched: true, exercises }, extra || {});
// A session where every prescribed rep was hit, three days ago.
const GOOD = { [dk(3)]: day([
  { exerciseId: 'bench_press', sets: sets(4, 80, 6) },
  { exerciseId: 'incline_db', sets: sets(3, 30, 8) },
  { exerciseId: 'pullup', sets: sets(3, 0, 8) },
]) };

function sb({ history = GOOD, sleep = {}, units = 'metric', program = 'cp_test' } = {}) {
  const s = createSandbox({ files: FILES, store: {
    hvi_onboarded: 'true',
    hvi_sleep_log: JSON.stringify(sleep),
    hvi_workout_log: JSON.stringify(history),
    hvi_workout_meta: JSON.stringify({ activeProgram: program, currentDayIndex: 0 }),
    hvi_custom_programs: JSON.stringify([PROG, PLAIN]),
  } });
  run(s, `
    settings = { units: '${units}' }; curView = 'workout';
    track = function () {}; playSound = function () {}; haptic = function () {};
    habits = []; log = {}; mealLog = {}; weightLog = {}; prs = {}; gamification = { xp: 0 };
    sleepLog = JSON.parse(localStorage.getItem('hvi_sleep_log'));
    workoutLog = JSON.parse(localStorage.getItem('hvi_workout_log'));
    workoutMeta = JSON.parse(localStorage.getItem('hvi_workout_meta'));
    dietMeta = { dailyGoals: { calories: 2500, protein: 180, carbs: 280, fat: 80 }, goalType: 'maintain' };
  `);
  return s;
}
const session = s => JSON.parse(run(s, `curView = 'workoutActive'; renderWorkoutActive(); JSON.stringify(workoutLog[today()])`));
const ex = (wl, eid) => wl.exercises.find(e => e.exerciseId === eid) || { sets: [] };
const shape = (wl, eid) => { const ss = ex(wl, eid).sets; return `${ss.length}x${ss[0] && ss[0].reps}@${ss[0] && ss[0].weight}`; };
const html = s => run(s, `document.getElementById('view').innerHTML`) || '';

module.exports = function () {
  const r = createReporter('progression');

  r.section('every rep last time earns the next weight');
  {
    const wl = session(sb());
    r.check('bench 4 x 6 at 80 becomes 4 x 6 at 82.5', shape(wl, 'bench_press') === '4x6@82.5', shape(wl, 'bench_press'));
    r.check('the session remembers what it raised', JSON.stringify(ex(wl, 'bench_press').raised) === '{"from":80,"to":82.5}', JSON.stringify(ex(wl, 'bench_press').raised));
    r.check('dumbbells go up a dumbbell: 30 to 32', shape(wl, 'incline_db') === '3x8@32', shape(wl, 'incline_db'));
    r.check('bodyweight stays bodyweight', shape(wl, 'pullup') === '3x8@0' && !ex(wl, 'pullup').raised, shape(wl, 'pullup'));
    r.check('nothing is ticked off for you', wl.exercises.every(e => e.sets.every(x => !x.completed)));
  }

  r.section('the step is one a gym actually has');
  {
    const at = (eid, w, units) => run(sb({ units }), `weightStep('${eid}', ${w})`);
    r.check('a loaded bar: 2.5 kg', at('bench_press', 80) === 2.5);
    r.check('a light bar: 1.25 kg', at('ohp', 30) === 1.25);
    r.check('in pounds: 5, or 2.5 when light', at('bench_press', 185, 'imperial') === 5 && at('ohp', 65, 'imperial') === 2.5);
    r.check('dumbbells in pounds: 5', at('incline_db', 50, 'imperial') === 5);
    const lb = session(sb({ units: 'imperial', history: { [dk(3)]: day([{ exerciseId: 'bench_press', sets: sets(4, 185, 6) }]) } }));
    r.check('185 lb becomes 190', shape(lb, 'bench_press') === '4x6@190', shape(lb, 'bench_press'));
  }

  r.section('anything short of every rep holds the weight');
  {
    const missRep = session(sb({ history: { [dk(3)]: day([{ exerciseId: 'bench_press', sets: sets(3, 80, 6).concat(sets(1, 80, 5)) }]) } }));
    r.check('one rep short: same 80', shape(missRep, 'bench_press') === '4x6@80' && !ex(missRep, 'bench_press').raised, shape(missRep, 'bench_press'));
    const missSet = session(sb({ history: { [dk(3)]: day([{ exerciseId: 'bench_press', sets: sets(3, 80, 6).concat(sets(1, 80, 6, false)) }]) } }));
    r.check('a set not done: same 80', shape(missSet, 'bench_press') === '4x6@80', shape(missSet, 'bench_press'));
    const fewer = session(sb({ history: { [dk(3)]: day([{ exerciseId: 'bench_press', sets: sets(3, 80, 6) }]) } }));
    r.check('three sets where the program says four: same 80', shape(fewer, 'bench_press') === '4x6@80', shape(fewer, 'bench_press'));
    const s = sb({ history: { [dk(30)]: day([{ exerciseId: 'bench_press', sets: sets(4, 80, 6) }]) } });
    const stale = session(s);
    r.check('a month away: same 80', shape(stale, 'bench_press') === '4x6@80', shape(stale, 'bench_press'));
    r.check('and the note says why', /been a while/.test(html(s)), html(s).match(/w-ex-tip[^]*?<\/div>/)?.[0]);
  }

  r.section('without a prescription, the exercise\'s own target counts');
  {
    const s = sb({ program: 'cp_plain' });
    const target = run(s, 'EXERCISES.bench_press.dr'), n = run(s, 'EXERCISES.bench_press.ds');
    run(s, `workoutLog['${dk(3)}'] = { programId: 'cp_plain', dayIndex: 0, touched: true, exercises: [{ exerciseId: 'bench_press', sets: ${JSON.stringify(sets(n, 100, target + 2))} }] };`);
    const wl = session(s);
    r.check('more than the target at 100 earns 102.5', shape(wl, 'bench_press') === `${n}x${target}@102.5`, shape(wl, 'bench_press'));
    r.check('starting back at the target reps, not last time\'s extra', ex(wl, 'bench_press').sets[0].reps === target);
  }

  r.section('a short night waits');
  {
    let s = sb({ sleep: { [T]: { hours: 5.5 } } });
    let wl = session(s);
    r.check('a lighter day keeps last time\'s 80', shape(wl, 'bench_press') === '3x4@80' && !ex(wl, 'bench_press').raised, shape(wl, 'bench_press'));
    r.check('and says the raise is waiting', /You earned 82\.5 kg last time\. It waits for a better night/.test(html(s)));
    run(s, 'setSessionPlan(true)');
    wl = JSON.parse(run(s, 'JSON.stringify(workoutLog[today()])'));
    r.check('training the full plan anyway: full sets, still 80', shape(wl, 'bench_press') === '4x6@80', shape(wl, 'bench_press'));
    s = sb({ sleep: { [T]: { hours: 4 } } });
    wl = session(s);
    r.check('a deload is 60% of 80, not of 82.5', shape(wl, 'bench_press') === '4x6@47.5', shape(wl, 'bench_press'));
  }

  // Found while building this: a deload's 47.5 would have become the next
  // session's starting weight, undoing weeks of work after one bad night.
  r.section('a lighter day is not the new baseline');
  {
    const afterDeload = Object.assign({}, GOOD, { [dk(1)]: day([{ exerciseId: 'bench_press', sets: sets(4, 47.5, 6) }], { tier: 'deload' }) });
    let wl = session(sb({ history: afterDeload }));
    r.check('after a deload, the session before it decides: 82.5', shape(wl, 'bench_press') === '4x6@82.5', shape(wl, 'bench_press'));
    const missedThenDeload = { [dk(3)]: day([{ exerciseId: 'bench_press', sets: sets(4, 80, 5) }]),
      [dk(1)]: day([{ exerciseId: 'bench_press', sets: sets(4, 47.5, 6) }], { tier: 'deload' }) };
    wl = session(sb({ history: missedThenDeload }));
    r.check('and if that one was short: 80, not 47.5', shape(wl, 'bench_press') === '4x6@80', shape(wl, 'bench_press'));
    const afterTrim = Object.assign({}, GOOD, { [dk(1)]: day([{ exerciseId: 'bench_press', sets: sets(3, 80, 4) }], { tier: 'trim' }) });
    wl = session(sb({ history: afterTrim }));
    r.check('a lighter day\'s fewer reps do not cancel a raise already earned', shape(wl, 'bench_press') === '4x6@82.5', shape(wl, 'bench_press'));
    const onlyDeload = { [dk(1)]: day([{ exerciseId: 'bench_press', sets: sets(4, 47.5, 6) }], { tier: 'deload' }) };
    wl = session(sb({ history: onlyDeload }));
    r.check('with nothing else on record, the lighter day is still used', ex(wl, 'bench_press').sets[0].weight > 0, shape(wl, 'bench_press'));
  }

  r.section('the exercise says why, and the raise can be taken back');
  {
    const s = sb();
    session(s);
    let page = html(s);
    r.check('it says what it did', /Up to 82\.5 kg\. Every rep at 80 kg last time\./.test(page));
    r.check('with a way to keep 80', /setRaise\(0, false\)[^>]*>Keep 80 kg/.test(page));
    // One set done at 82.5, one typed by hand to 85.
    run(s, `const wl = workoutLog[today()]; wl.exercises[0].sets[0].completed = true; wl.exercises[0].sets[1].weight = 85; _wSave(wl);`);
    run(s, 'setRaise(0, false)');
    let w = JSON.parse(run(s, 'JSON.stringify(workoutLog[today()].exercises[0])'));
    r.check('keeping 80 changes the sets not yet done', w.sets[2].weight === 80 && w.sets[3].weight === 80, w.sets.map(x => x.weight).join());
    r.check('but not a set already done', w.sets[0].weight === 82.5);
    r.check('or a weight typed by hand', w.sets[1].weight === 85);
    page = html(s);
    r.check('it says it was kept, and offers the raise again', /Kept at 80 kg\. You earned 82\.5 kg last time\./.test(page) && /setRaise\(0, true\)[^>]*>Go up to 82\.5 kg/.test(page));
    run(s, 'setRaise(0, true)');
    w = JSON.parse(run(s, 'JSON.stringify(workoutLog[today()].exercises[0])'));
    r.check('going up again puts 82.5 back', w.sets[2].weight === 82.5 && w.sets[3].weight === 82.5 && w.sets[1].weight === 85 && !w.raised.kept, w.sets.map(x => x.weight).join());
    run(s, `workoutLog[today()].exercises[0].sets.forEach(x => x.completed = true); rerenderWorkoutActive();`);
    r.check('once every set is done there is nothing to switch', !/setRaise\(0,/.test(html(s)));
  }

  r.section('the Workout tab says how many lifts go up');
  {
    const s = sb();
    run(s, `curView = 'workout'; renderWorkout();`);
    r.check('before the session is opened', /Heavier on 2 lifts today/.test(html(s)), (html(s).match(/w-hero-up[^<]*<?/) || [''])[0]);
    session(s);
    run(s, `setRaise(0, false); curView = 'workout'; renderWorkout();`);
    r.check('and counts one fewer when one is kept', /Heavier on 1 lift today/.test(html(s)));
    const tired = sb({ sleep: { [T]: { hours: 5 } } });
    run(tired, `curView = 'workout'; renderWorkout();`);
    r.check('nothing goes up on a lighter day', !/Heavier on/.test(html(tired)));
  }

  r.section('the tip and the session agree');
  {
    const s = sb();
    const tip = run(s, `getProgressionTip('bench_press', findProgram('cp_test').days[0]).msg`);
    const wl = session(s);
    r.check('the tip names the weight the session starts at', new RegExp(`try ${ex(wl, 'bench_press').sets[0].weight} kg today`, 'i').test(tip), tip);
    const held = sb({ history: { [dk(3)]: day([{ exerciseId: 'bench_press', sets: sets(4, 80, 5) }]) } });
    r.check('and the prescribed reps are the target it names', /hit 6 before going heavier/i.test(run(held, `getProgressionTip('bench_press', findProgram('cp_test').days[0]).msg`)));
  }

  return r.finish();
};
