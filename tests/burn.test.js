// What Whoop measured feeds the rest of the day.
//
// A Whoop activity used to be judged by its name, so a 15-strain match was a
// "moderate" day, and what it burned changed nothing. Now strain sets the day
// type, the calories a session burned beyond a usual day raise the target (as
// carbs), and heavy days count toward training load, not only how many there were.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'integrations.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);
const GOALS = { calories: 2500, protein: 180, carbs: 300, fat: 70 };

// worn: days back that Whoop recorded a night. burns: { daysBack: [kcal, strain] }.
function sb({ worn = 0, burns = {}, today: todayEntry = null, trainingDays } = {}) {
  const sleep = {}, burnLog = {};
  for (let i = 1; i <= worn; i++) sleep[dk(i)] = { hours: 7.5, source: 'whoop', whoopRecovery: 60 };
  Object.entries(burns).forEach(([n, [kcal, strain]]) => { burnLog[dk(+n)] = { kcal, strain, n: 1 }; });
  const s = createSandbox({ files: FILES, store: { hvi_onboarded: 'true', hvi_burn_log: JSON.stringify(burnLog) } });
  run(s, `
    settings = { units: 'metric', trainingDays: ${JSON.stringify(trainingDays || [0, 1, 2, 3, 4, 5, 6])} };
    curView = 'home'; track = function () {};
    sleepLog = ${JSON.stringify(sleep)};
    workoutLog = ${JSON.stringify(todayEntry ? { [T]: todayEntry } : {})};
    workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0 };
    dietMeta = { dailyGoals: ${JSON.stringify(GOALS)}, goalType: 'maintain' };
  `);
  return s;
}
const targets = s => JSON.parse(run(s, 'JSON.stringify(getTodaysMacroTargets())'));
const soccer = strain => ({ dayName: 'Soccer', duration: 90, exercises: [], source: 'whoop', strain, avgHr: 150 });

module.exports = async function () {
  const r = createReporter('burn');

  r.section('the Whoop sync keeps what each day burned');
  {
    const s = sb();
    const w = (id, day, strain, kj, h) => ({ id, start: `${day}T${h}:00:00.000Z`, end: `${day}T${h}:50:00.000Z`, timezone_offset: '+00:00',
      sport_name: id, score_state: 'SCORED', score: { strain, kilojoule: kj, average_heart_rate: 130 } });
    const d1 = dk(2), d2 = dk(3);
    run(s, `_b = { '${d2}': { kcal: 900, strain: 12, n: 2 } };
      applyWhoopData({ since: '${d2}T12:00:00.000Z', workouts: [
        ${JSON.stringify(w('walking', d1, 2.1, 1674, '08'))}, ${JSON.stringify(w('soccer', d1, 14.3, 3347, '18'))},
        ${JSON.stringify(w('walking', d2, 3, 1255, '16'))} ] }, sleepLog, workoutLog, _b)`);
    const b = JSON.parse(run(s, 'JSON.stringify(_b)'));
    r.check('every activity of the day counts, the walk included', b[d1] && b[d1].kcal === 1200 && b[d1].n === 2, JSON.stringify(b[d1]));
    r.check('with the day\'s hardest strain', b[d1].strain === 14.3);
    r.check('a day the sync only saw part of is not shrunk', b[d2].kcal === 900, JSON.stringify(b[d2]));
  }

  r.section('strain decides how hard a Whoop day was');
  {
    r.check('a 15-strain match is a hard day', targets(sb({ today: soccer(15.2) })).type === 'hard');
    r.check('a 9-strain one is not', targets(sb({ today: soccer(9) })).type === 'moderate');
    const legs = { programId: 'ppl', dayIndex: 2, dayName: 'Legs', exercises: [{ exerciseId: 'squat', sets: [{ weight: 100, reps: 5, completed: true }] }], whoop: { strain: 8 } };
    r.check('a leg day logged here stays hard, whatever Whoop read', targets(sb({ today: legs })).type === 'hard');
    const push = { programId: 'ppl', dayIndex: 0, dayName: 'Push', exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8, completed: true }] }], whoop: { strain: 15 } };
    r.check('and a session Whoop measured at 14+ becomes one', targets(sb({ today: push })).type === 'hard');
  }

  r.section('calories burned beyond a usual day raise the target');
  {
    // Ten worn days, five with 600 kcal of training: a usual day is 300.
    const usual = { 2: [600, 10], 4: [600, 10], 6: [600, 10], 8: [600, 10], 10: [600, 10] };
    const s = sb({ worn: 10, burns: Object.assign({ 0: [900, 15.2] }, usual), today: soccer(15.2) });
    r.check('a usual day is worked out from the last four weeks', run(s, 'typicalBurn()') === 300, `(${run(s, 'typicalBurn()')})`);
    const t = targets(s);
    r.check('900 burned against a usual 300 adds 600 calories', t.calories === 2500 + 600 + 18 * 4 && t.burn && t.burn.extra === 600, JSON.stringify(t));
    r.check('as carbs, instead of the hard day\'s +20%', t.carbs === 300 + 150);
    r.check('and the hard day keeps its extra protein', t.protein === 198);
    r.check('it says why, in plain words', run(s, 'macroAdjustReason()') === 'Soccer burned 900 cal, 600 more than a usual day · +600 cal as carbs, protein +10%', run(s, 'macroAdjustReason()'));

    // On a cut only half comes back, so a hard day widens the deficit.
    run(s, `dietMeta.goalType = 'cut'`);
    const tc = targets(s);
    r.check('on a cut, half of the extra comes back', tc.calories === 2500 + 300 + 18 * 4 && tc.carbs === 300 + 75, JSON.stringify(tc));
    r.check('and it says so', run(s, 'macroAdjustReason()') === 'Soccer burned 900 cal, 600 more than a usual day · +300 cal as carbs, half of it so you stay in a deficit · protein +10%', run(s, 'macroAdjustReason()'));
    const hugeCut = sb({ worn: 10, burns: Object.assign({ 0: [2600, 19] }, usual), today: soccer(19) });
    run(hugeCut, `dietMeta.goalType = 'cut'`);
    r.check('at most 500 on a cut', targets(hugeCut).burn.extra === 500);
    run(s, `dietMeta.goalType = 'maintain'`);

    const low = sb({ worn: 10, burns: Object.assign({ 0: [200, 9] }, usual), today: soccer(9) });
    const tl = targets(low);
    r.check('a session under a usual day\'s burn takes nothing away', tl.calories === 2500 && tl.carbs === 300 && tl.adjusted === false, JSON.stringify(tl));

    const huge = sb({ worn: 10, burns: Object.assign({ 0: [2600, 19] }, usual), today: soccer(19) });
    r.check('one day adds at most 1,000', targets(huge).burn.extra === 1000);

    const fresh = sb({ worn: 3, burns: { 0: [900, 15.2], 2: [600, 10] }, today: soccer(15.2) });
    const tf = targets(fresh);
    r.check('until there are a week of Whoop days, the day type decides as before', !tf.burn && tf.carbs === 360, JSON.stringify(tf));

    const rest = sb({ worn: 10, burns: usual, trainingDays: [] });
    r.check('a rest day keeps its own carb cut', targets(rest).carbs === 225 && !targets(rest).burn);
    r.check('what the day was planned to be ignores what was burned',
      !JSON.parse(run(s, 'JSON.stringify(getTodaysMacroTargets(_plannedSession()))')).burn);
  }

  r.section('heavy days count toward training load, not only how many');
  {
    // Seventeen usual days of 300, then three of 700: 1.9 times a usual three days.
    const burns = {};
    for (let i = 4; i <= 20; i++) burns[i] = [300, 9];
    for (let i = 1; i <= 3; i++) burns[i] = [700, 12];
    const heavy = sb({ worn: 20, burns });
    const st = JSON.parse(run(heavy, 'JSON.stringify(getRecoveryStatus())'));
    r.check('three heavy days ask for rest', st.status === 'fatigued' && /1\.9× your usual training/.test(st.why || ''), JSON.stringify(st));

    const yburns = {}; for (let i = 2; i <= 12; i++) yburns[i] = [300, 9]; yburns[1] = [400, 18.5];
    const hard = JSON.parse(run(sb({ worn: 12, burns: yburns }), 'JSON.stringify(getRecoveryStatus())'));
    r.check('so does an all-out day yesterday', hard.status === 'fatigued' && hard.why === 'strain 18.5 yesterday', JSON.stringify(hard));

    const calm = {}; for (let i = 1; i <= 12; i++) calm[i] = [300, 9];
    r.check('a usual week stays fresh', JSON.parse(run(sb({ worn: 12, burns: calm }), 'JSON.stringify(getRecoveryStatus())')).status === 'fresh');
    r.check('and without Whoop nothing changes', JSON.parse(run(sb(), 'JSON.stringify(getRecoveryStatus())')).status === 'fresh');
  }

  r.section('what each day burned follows you to your other devices');
  {
    const s = sb();
    r.check('it is in the backup, merged day by day', run(s, `SYNC_KEYS.indexOf('hvi_burn_log') !== -1 && MERGE_KEYS.indexOf('hvi_burn_log') !== -1`) === true);
  }

  return r.finish();
};
