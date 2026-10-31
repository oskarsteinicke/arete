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

  // With Whoop: what goes with how recovered someone wakes up. Recovery is
  // stored on the morning it was measured, so what was done the day before
  // lines up with the next morning's number.
  const W = ['data.js', 'app.js', 'connect.js', 'patterns.js'];
  const whoopSb = (fill, store) => {
    const sleepLog = {}, journal = {}, workoutLog = {}, burns = {}, hist = { h1: [], h2: [], h3: [], h4: [] };
    for (let i = 1; i <= 40; i++) fill(i, { sleepLog, journal, workoutLog, burns, hist });
    Object.keys(hist).forEach(k => hist[k].sort());
    const s = createSandbox({ files: W, store: Object.assign({ hvi_onboarded: 'true', hvi_habit_history: JSON.stringify(hist), hvi_burn_log: JSON.stringify(burns) }, store || {}) });
    run(s, `settings = {}; curView = 'home'; track = function () {};
      habits = [{ id: 'h1', name: 'Read' }, { id: 'h2', name: 'Walk' }, { id: 'h3', name: 'Stretch' }, { id: 'h4', name: 'Water' }];
      log = {}; journal = ${JSON.stringify(journal)}; workoutLog = ${JSON.stringify(workoutLog)}; workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0 };
      mealLog = {}; sleepLog = ${JSON.stringify(sleepLog)}; dietMeta = { dailyGoals: {} };`);
    return s;
  };
  const night = (o, d, rec, extra) => { o.sleepLog[d] = Object.assign({}, o.sleepLog[d] || {}, { hours: 7, source: 'whoop', whoopRecovery: rec }, extra || {}); };

  r.section('with Whoop: the journal and the next morning');
  {
    const s = whoopSb((i, o) => {
      const wrote = i % 2 === 0;
      if (wrote) o.journal[dk(i)] = { win: 'A good day' };
      night(o, dk(i - 1), (wrote ? 70 : 52) + (i % 3));
    });
    const p = get(s, 'journal-recovery');
    r.check('the morning after journaling recovers better here', !!p && /^The morning after you journal, your recovery averages 7\d%\. After days you skip it, 5\d%\.$/.test(p.text), p && p.text);
  }

  r.section('with Whoop: bedtime and recovery');
  {
    const s = whoopSb((i, o) => night(o, dk(i), i % 2 ? 72 + (i % 3) : 48 + (i % 3), { bedtime: i % 2 ? '22:30' : '00:30' }));
    const p = get(s, 'bedtime-recovery');
    r.check('in bed by 11 against after midnight', !!p && /^When you are in bed by 11, your recovery averages 7\d%\. After midnight, 4\d%\.$/.test(p.text), p && p.text);
  }

  r.section('with Whoop: hard days and the next morning');
  {
    const s = whoopSb((i, o) => {
      const hard = i % 3 === 0;
      if (hard) {
        o.workoutLog[dk(i)] = { dayName: 'Soccer', exercises: [], source: 'whoop', strain: 15.5 };
        o.burns[dk(i)] = { kcal: 900, strain: 15.5, n: 1 };
      }
      night(o, dk(i - 1), (hard ? 44 : 70) + (i % 2) * 3);
    });
    const p = get(s, 'hard-recovery');
    r.check('a hard day is followed by a lower recovery here', !!p && /^After hard training days your recovery averages 4\d%\. After rest days, 7\d%\.$/.test(p.text), p && p.text);
  }

  r.section('with Whoop: recovery and the habits that day');
  {
    const s = whoopSb((i, o) => {
      const green = i % 2 === 1;
      night(o, dk(i), green ? 75 + (i % 4) : 38 + (i % 4));
      o.hist.h1.push(dk(i));
      if (green) { o.hist.h2.push(dk(i)); o.hist.h3.push(dk(i)); o.hist.h4.push(dk(i)); }
      else if (i % 4 === 0) o.hist.h2.push(dk(i));
    });
    const p = get(s, 'recovery-habits');
    r.check('green mornings go with more habits done', !!p && /^On mornings your recovery is green \(67%\+\), you finish 100% of your habits\. Under 50%, \d\d%\.$/.test(p.text), p && p.text);
  }

  r.section('with Whoop: the same care against false patterns');
  {
    const few = whoopSb((i, o) => { if (i > 8) return; const wrote = i % 2 === 0; if (wrote) o.journal[dk(i)] = { win: 'x' }; night(o, dk(i - 1), wrote ? 75 : 45); });
    r.check('four mornings a side are not a pattern', !get(few, 'journal-recovery'));
    const flat = whoopSb((i, o) => { if (i % 2 === 0) o.journal[dk(i)] = { win: 'x' }; night(o, dk(i - 1), 60 + (i % 5)); });
    r.check('a gap of a point or two is not one either', !get(flat, 'journal-recovery'));
    const none = sb(month());
    r.check('without Whoop, none of these appear', !(JSON.parse(patterns(none) || '[]')).some(p => /recovery/.test(p.id)));
    const sleepy = whoopSb((i, o) => night(o, dk(i), i % 2 ? 80 : 40, { hours: i % 2 ? 8 : 5.5 }));
    r.check('hours of sleep against recovery is never offered, since Whoop builds one from the other', !(JSON.parse(patterns(sleepy) || '[]')).some(p => /sleep-recovery/.test(p.id)));
  }

  return r.finish();
};
