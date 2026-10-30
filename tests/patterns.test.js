// Your patterns: how someone's own days move together, from their logs.
//
// Checked with months where the answer is known: every habit done after a
// good night and one in four after a short one, protein hit on training days
// and missed on rest days. The traps are the ones that make a pattern lie:
// counting today before it is over, counting a habit as missed before it
// existed, counting weekly habits as due every day, and calling a handful of
// days a pattern.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'connect.js', 'patterns.js'];
const COACH = ['data.js', 'app.js', 'connect.js', 'premium.js', 'workout.js', 'diet.js',
               'integrations.js', 'profile.js', 'social.js', 'coach.js', 'patterns.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);
const sets = (n, w, r) => Array.from({ length: n }, () => ({ weight: w, reps: r, completed: true }));

// 40 days: every third night short (5.5 h), the rest 7.5 h. After a good night
// all four daily habits are done; after a short one only h1. Training on even
// days, with protein over target on training days and well under on rest days.
function month({ shortNights = null, todayShort = false } = {}) {
  const sleepLog = {}, hist = { h1: [], h2: [], h3: [], h4: [], late: [], weekly: [] }, workoutLog = {}, mealLog = {};
  let shortsLeft = shortNights == null ? Infinity : shortNights;
  for (let i = 1; i <= 40; i++) {
    const d = dk(i);
    const short = i % 3 === 0 && shortsLeft-- > 0;
    sleepLog[d] = { hours: short ? 5.5 : 7.5, quality: short ? 2 : 4 };
    hist.h1.push(d);
    if (!short) { hist.h2.push(d); hist.h3.push(d); hist.h4.push(d); if (i <= 10) hist.late.push(d); }
    else hist.weekly.push(d);
    const trained = i % 2 === 0;
    if (trained) workoutLog[d] = { programId: 'ppl', dayIndex: 0, exercises: [{ exerciseId: 'bench_press', sets: sets(3, 80, 6) }] };
    mealLog[d] = { meals: [{ id: 'm' + i, name: 'Day', items: [{ name: 'Food', calories: 2400, protein: trained ? 185 : 110, carbs: 250, fat: 70 }] }] };
  }
  if (todayShort) sleepLog[T] = { hours: 4, quality: 1 };
  Object.keys(hist).forEach(k => hist[k].sort());
  return { sleepLog, hist, workoutLog, mealLog };
}

const HABITS = `[{ id: 'h1', name: 'Read', category: 'learning' }, { id: 'h2', name: 'Walk', category: 'fitness' },
  { id: 'h3', name: 'Stretch', category: 'fitness' }, { id: 'h4', name: 'Water', category: 'health' },
  { id: 'late', name: 'Cold shower', category: 'discipline' },
  { id: 'weekly', name: 'Long run', category: 'fitness', schedule: 'weekly', perWeek: 2 }]`;

function sb(data, files = FILES) {
  const s = createSandbox({ files, store: { hvi_onboarded: 'true', hvi_habit_history: JSON.stringify(data ? data.hist : {}) } });
  run(s, `
    settings = {}; curView = 'home'; track = function () {}; history = { pushState: function () {} };
    habits = ${data ? HABITS : '[]'}; log = {}; journal = {}; meta = {}; prs = {}; achievements = []; challenges = []; goals = [];
    gamification = { xp: 0, level: 1, pillarXP: {} };
    workoutLog = ${JSON.stringify(data ? data.workoutLog : {})}; workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0 };
    mealLog = ${JSON.stringify(data ? data.mealLog : {})}; weightLog = {}; sleepLog = ${JSON.stringify(data ? data.sleepLog : {})};
    dietMeta = { dailyGoals: { calories: 2600, protein: 175, carbs: 300, fat: 75 }, goalType: 'maintain' };
  `);
  return s;
}
const patterns = s => run(s, 'JSON.stringify(findPatterns())');
const get = (s, id) => (JSON.parse(patterns(s) || '[]')).find(p => p.id === id);

module.exports = function () {
  const r = createReporter('patterns');

  r.section('sleep and habits: the pattern the data holds');
  {
    const p = get(sb(month()), 'sleep-habits');
    r.check('it is found', !!p);
    r.check('after good nights, every habit (a habit is not missed before it existed)', p && p.a.show === '100%', p && p.a.show);
    r.check('after short nights, one in four or one in five', p && p.b.value >= 0.2 && p.b.value <= 0.25, p && p.b.show);
    r.check('in plain words', p && /^After 7\+ hours of sleep you finish 100% of your habits\. After under 6 hours, 2\d%\.$/.test(p.text), p && p.text);
  }

  r.section('weekly habits are not due every day');
  {
    // The weekly habit is only ever done after short nights. Counted as due
    // daily, it would pull the good-night share below 100%.
    const p = get(sb(month()), 'sleep-habits');
    r.check('the good-night share stays at 100%', p && p.a.value === 1, p && p.a.show);
  }

  r.section('today is not over, so it does not count');
  {
    const a = get(sb(month()), 'sleep-habits'), b = get(sb(month({ todayShort: true })), 'sleep-habits');
    r.check('a short night last night with nothing done yet changes nothing', a && b && a.b.value === b.b.value && a.nb === b.nb, `${a && a.nb} vs ${b && b.nb}`);
  }

  r.section('a few days are not a pattern');
  {
    const p = get(sb(month({ shortNights: 4 })), 'sleep-habits');
    r.check('four short nights are not enough', !p, p && p.text);
    r.check('nothing at all with no logs', patterns(sb(null)) === '[]');
  }

  r.section('training and protein');
  {
    const p = get(sb(month()), 'training-protein');
    r.check('found', !!p);
    r.check('in plain words', p && p.text === 'On training days you hit your protein target 100% of the time. On rest days, 0%.', p && p.text);
  }

  r.section('the wording never claims a cause');
  {
    const all = JSON.parse(patterns(sb(month())) || '[]');
    r.check('several patterns to check', all.length >= 2, all.length);
    r.check('no "because", "causes", "leads to" or "makes you"', all.every(p => !/because|causes?\b|leads to|makes you/i.test(p.text)), all.map(p => p.text).join(' | '));
    r.check('no em dashes', all.every(p => !/—/.test(p.text)));
    r.check('strongest first', all.every((p, i) => i === 0 || all[i - 1].score >= p.score));
  }

  r.section('home shows one, and only when there is one');
  {
    const card = String(run(sb(month()), 'patternCardHTML()') || '');
    r.check('a card with the pattern', /Your pattern/.test(card) && /pt-bar/.test(card), card.slice(0, 120));
    r.check('nothing without data', run(sb(null), 'patternCardHTML()') === '');
  }

  r.section('the coach is told, as patterns rather than causes');
  {
    const s = sb(month(), COACH);
    const p = String(run(s, 'buildCoachSystemPrompt()') || '');
    r.check('the section is there', /PATTERNS IN THEIR OWN LOGS \(last 60 days; things that went together, not proof of cause\)/.test(p), (p.match(/PATTERNS.*/) || ['(missing)'])[0]);
    r.check('with the strongest pattern', /After 7\+ hours of sleep you finish 100% of your habits/.test(p) || /On training days you hit your protein target/.test(p));
    r.check('and a rule against calling it a cause', /never as the cause of anything/.test(p));
  }

  return r.finish();
};
