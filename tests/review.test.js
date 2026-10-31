// The weekly review.
//
// It replaced a recap that said "Great week!" whatever the week was, and that
// on a Monday counted only Monday. These hold that it covers the right week,
// that its facts come from the person's own logs, that it names the gap that
// matters most, that it works without AI, and that the focus carries into the
// week and is checked the next.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'patterns.js', 'integrations.js', 'profile.js', 'review.js', 'coach.js'];

function sb(extra) {
  const s = createSandbox({ files: FILES, store: Object.assign({ hvi_onboarded: 'true' }, extra || {}) });
  // The week under review is the one that ended last Sunday (or today, on a Sunday).
  const days = JSON.parse(run(s, 'JSON.stringify(reviewWeek().days)'));
  const d = i => days[i];
  const set = (w, r, c) => ({ weight: w, reps: r, completed: c !== false });
  const meals = (cal, p) => ({ meals: [{ id: 'm', name: 'Food', items: [{ name: 'x', calories: cal, protein: p, carbs: 0, fat: 0 }] }] });
  const hist = { h1: ['2026-01-01', d(1), d(4)], h2: ['2026-01-01'].concat(days) };
  run(s, `
    settings = { units: 'metric', trainingDays: [1, 3, 5, 6] };
    curView = 'home'; track = function () {};
    habits = [{ id: 'h1', name: 'Read 30 minutes', schedule: 'daily' }, { id: 'h2', name: 'Meditate', schedule: 'daily' }];
    log = {}; journal = { '${d(0)}': { win: 'Good session' }, '${d(2)}': { win: 'Match' }, '${d(5)}': { struggle: 'Tired' } };
    workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0 };
    workoutLog = {
      '${d(0)}': { programId: 'ppl', dayIndex: 0, dayName: 'Push', exercises: [{ exerciseId: 'bench_press', sets: [${JSON.stringify(set(80, 8))}] }] },
      '${d(2)}': { dayName: 'Soccer', duration: 90, exercises: [], source: 'whoop', strain: 15.2, avgHr: 156 },
      '${d(4)}': { programId: 'ppl', dayIndex: 2, dayName: 'Legs', exercises: [{ exerciseId: 'squat', sets: [${JSON.stringify(set(100, 5))}] }], whoop: { strain: 8 } },
    };
    LS.set('hvi_burn_log', { '${d(2)}': { kcal: 900, strain: 15.2, n: 1 }, '${d(4)}': { kcal: 400, strain: 8, n: 1 } });
    LS.set('hvi_meal_log', { '${d(0)}': ${JSON.stringify(meals(2600, 185))}, '${d(1)}': ${JSON.stringify(meals(2400, 150))},
      '${d(2)}': ${JSON.stringify(meals(2300, 140))}, '${d(4)}': ${JSON.stringify(meals(2700, 190))}, '${d(5)}': ${JSON.stringify(meals(2500, 120))} });
    sleepLog = { '${d(0)}': { hours: 6.5 }, '${d(1)}': { hours: 5.5 }, '${d(2)}': { hours: 7, whoopRecovery: 70 },
      '${d(3)}': { hours: 6 }, '${d(4)}': { hours: 5.8, whoopRecovery: 40 }, '${d(5)}': { hours: 7.5 }, '${d(6)}': { hours: 6.2 } };
    LS.set('hvi_habit_history', ${JSON.stringify(hist)});
    LS.set('hvi_weight_log', { '${d(0)}': 80.4, '${d(6)}': 79.9 });
    dietMeta = { dailyGoals: { calories: 2500, protein: 180, carbs: 300, fat: 70 }, goalType: 'cut' };
    showToast = function () {};
  `);
  return { s, days };
}
const facts = s => JSON.parse(run(s, 'JSON.stringify(weekReviewFacts(reviewWeek()))'));

module.exports = async function () {
  const r = createReporter('review');

  r.section('it covers Monday to Sunday, the week just ending');
  {
    const { s } = sb();
    const wk = when => JSON.parse(run(s, `JSON.stringify(reviewWeek(new Date('${when}')))`));
    r.check('on a Sunday evening, the week ending today', wk('2026-11-01T18:00:00').id === '2026-11-01' && wk('2026-11-01T18:00:00').start === '2026-10-26');
    r.check('on a Monday, the week before, not just Monday', wk('2026-11-02T08:00:00').id === '2026-11-01');
    r.check('on a Wednesday, still last week', wk('2026-11-04T12:00:00').id === '2026-11-01');
    r.check('on a Saturday, the week before that', wk('2026-10-31T12:00:00').id === '2026-10-25');
    const src = require('fs').readFileSync(require('path').join(require('./harness').APP, 'profile.js'), 'utf8');
    r.check('Sunday evening and Monday count as one week, so it shows once', /reviewWeek\(\)\.id/.test(src.slice(src.indexOf('function checkWeeklyRecap'), src.indexOf('function showWeeklyRecap'))));
  }

  r.section('the facts come from their own logs');
  {
    const { s } = sb();
    const f = facts(s);
    r.check('sessions against the plan', f.training.sessions === 3 && f.training.planned === 4, JSON.stringify(f.training));
    r.check('hard ones by strain or by name', f.training.hard === 2);
    r.check('what Whoop says they burned', f.training.burned === 1300);
    r.check('food on the days it was logged', f.food.logged === 5 && f.food.cal === 2500 && f.food.proteinDays === 2, JSON.stringify(f.food));
    r.check('sleep, short nights and recovery', f.sleep.avg === 6.4 && f.sleep.short === 2 && f.sleep.recovery === 55, JSON.stringify(f.sleep));
    r.check('habits, and the one missed most', Math.round(f.habits.rate * 100) === 64 && f.habits.missed && f.habits.missed.name === 'Read 30 minutes' && f.habits.missed.done === 2, JSON.stringify(f.habits));
    r.check('journal days and weight', f.journaled === 3 && f.weight.from === 80.4 && f.weight.to === 79.9);
    const L = JSON.parse(run(s, 'JSON.stringify(weekReviewLines(weekReviewFacts(reviewWeek())))'));
    r.check('said plainly', L.training === '3 of 4 sessions, 2 hard, 1,300 cal burned' && L.sleep === '6h 24m a night, 2 under 6h, recovery 55%', JSON.stringify(L));
  }

  r.section('without AI, it still names the gap that matters most');
  {
    const { s } = sb();
    const rec = JSON.parse(run(s, 'JSON.stringify(_rvLocal(weekReviewFacts(reviewWeek()), null))'));
    r.check('short sleep outweighs one missed session here', rec.focus === 'Sleep 7 hours or more on 5 nights' && rec.kind === 'sleep', JSON.stringify(rec));
    r.check('with the numbers behind it', /6h 24m/.test(rec.read) && /2 nights under 6 hours/.test(rec.read), rec.read);
    r.check('and no em dashes', !/—/.test(rec.read + rec.focus));
    // Six planned and three done: the sessions are the gap, so they are not also a win.
    run(s, `settings.trainingDays = [0, 1, 2, 3, 4, 5]`);
    const short = JSON.parse(run(s, 'JSON.stringify(_rvLocal(weekReviewFacts(reviewWeek()), null))'));
    r.check('what went well never contradicts what held it back', !(/sessions done/.test(short.read) && /planned sessions happened/.test(short.read)), short.read);
    run(s, `settings.trainingDays = [1, 3, 5, 6]`);
    const next = JSON.parse(run(s, `JSON.stringify(_rvLocal(weekReviewFacts(reviewWeek()), { kind: 'sleep', target: 5, focus: 'Sleep 7 hours or more on 5 nights' }))`));
    r.check('next week it says whether the focus happened', /^Last week's focus was to sleep 7 hours or more on 5 nights: 2 of 5\./.test(next.read), next.read);
  }

  r.section('the coach writes it when AI is allowed');
  {
    const { s } = sb({ hvi_ai_consent: 'yes' });
    run(s, `_calls = []; _aiFetch = function (msgs) { _calls.push(msgs); return Promise.resolve('{"read": "You trained 3 times \\u2014 two of them hard. Sleep held you back at 6h 24m.", "focus": "Sleep 7 hours on 5 nights."}'); };`);
    run(s, `LS.set('hvi_week_review', { '${JSON.parse(run(s, 'JSON.stringify(reviewWeek())')).id.replace(/.*/, m => m)}': null })`);
    const prevId = run(s, `_rvShift(reviewWeek().id, -7)`);
    run(s, `LS.set('hvi_week_review', { '${prevId}': { id: '${prevId}', focus: 'Hit 180 g of protein on 5 days', kind: 'protein', target: 5, read: 'x', by: 'local' } })`);
    const rec = JSON.parse(JSON.stringify(await run(s, 'buildWeekReview(reviewWeek())')));
    const sent = run(s, `JSON.stringify(_calls[0])`);
    r.check('from the facts', /TRAINING: 3 of 4 sessions, 2 hard, 1,300 cal burned/.test(sent) && /Soccer \(strain 15\.2\) hard/.test(sent), sent.slice(0, 300));
    r.check('and last week\'s focus, to judge', /LAST WEEK'S FOCUS: Hit 180 g of protein on 5 days/.test(sent));
    r.check('its answer is kept, cleaned of em dashes', rec.by === 'coach' && !/—/.test(rec.read) && rec.focus === 'Sleep 7 hours on 5 nights', JSON.stringify(rec));
    await run(s, 'buildWeekReview(reviewWeek())');
    r.check('and asked once a week, not each time it opens', run(s, '_calls.length') === 1);

    const { s: bad } = sb({ hvi_ai_consent: 'yes' });
    run(bad, `_aiFetch = function () { return Promise.resolve('Sorry, I cannot help with that.'); };`);
    const fb = JSON.parse(JSON.stringify(await run(bad, 'buildWeekReview(reviewWeek())')));
    r.check('an answer that is not a review falls back to the one written here', fb.by === 'local' && fb.focus === 'Sleep 7 hours or more on 5 nights', JSON.stringify(fb));
    run(bad, `_aiFetch = function () { return Promise.resolve('{"read": "A proper review from the coach, with 6h 24m in it.", "focus": "Sleep 7 hours on 5 nights"}'); };`);
    r.check('which the coach rewrites once it can', JSON.parse(JSON.stringify(await run(bad, 'buildWeekReview(reviewWeek())'))).by === 'coach');

    const { s: off } = sb({ hvi_ai_consent: 'no' });
    run(off, `_called = false; _aiFetch = function () { _called = true; return Promise.reject(new Error('no')); };`);
    const o = JSON.parse(JSON.stringify(await run(off, 'buildWeekReview(reviewWeek())')));
    r.check('with AI switched off, nothing is sent', run(off, '_called') === false && o.by === 'local');
  }

  r.section('the focus carries into the week');
  {
    const { s } = sb();
    await run(s, 'buildWeekReview(reviewWeek())');
    r.check('it is this week\'s focus', run(s, 'weekFocus()') === 'Sleep 7 hours or more on 5 nights');
    r.check('the coach is told it', /THIS WEEK'S FOCUS \(set in their weekly review; help them hit it\): Sleep 7 hours or more on 5 nights/.test(run(s, 'buildCoachSystemPrompt()')));
    r.check('and so is the daily focus', /This week's focus, from their weekly review: Sleep 7 hours/.test(run(s, '_coachInsightContext()')));
    run(s, `var all = LS.get('hvi_week_review', {}); var k = Object.keys(all)[0]; var old = all[k]; delete all[k]; all['2026-01-04'] = old; LS.set('hvi_week_review', all);`);
    r.check('a focus from weeks ago has lapsed', run(s, 'weekFocus()') === null);
    r.check('reviews follow you to your other devices', run(s, `SYNC_KEYS.indexOf('hvi_week_review') !== -1 && MERGE_KEYS.indexOf('hvi_week_review') !== -1`) === true);
  }

  r.section('the sheet');
  {
    const { s } = sb();
    run(s, `document.body.contains = function () { return true; };`);
    const rec = JSON.parse(JSON.stringify(await run(s, 'showWeekReview()')));
    const html = s._els._boundary.innerHTML;
    r.check('leads with the review, then the numbers', html.indexOf('wr-read') < html.indexOf('wr-rows') && /3 of 4 sessions, 2 hard, 1,300 cal burned/.test(html));
    r.check('fills in the read and next week\'s focus', s._els['wr-read'].textContent === rec.read && s._els['wr-focus-v'].textContent === rec.focus);
    r.check('no "Great week!" whatever the week', !/Great week/.test(html));
    r.check('the old recap button opens it', /showWeekReview\(\); return;/.test(require('fs').readFileSync(require('path').join(require('./harness').APP, 'profile.js'), 'utf8')));
  }

  return r.finish();
};
