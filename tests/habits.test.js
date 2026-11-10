// Habit streaks, completion history, and local date keys.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={}; curView='habits';
    track=function(){}; go=function(v){ _nav.push(v); };
    playSound=function(){}; awardXP=function(){}; launchConfetti=function(){};
    haptic=function(){}; checkDailyQuests=function(){}; maybeAwardStreakShield=function(){};
    renderHabits=function(){}; updateHabitUI=function(){}; checkAchievements=function(){};
    habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');
    log=JSON.parse(localStorage.getItem('hvi_log')||'{}');
    meta=JSON.parse(localStorage.getItem('hvi_meta')||'{}');
    workoutMeta={}; gamification={xp:0};
  `);
  return s;
}
const H = [{ id: 'h1', name: 'Read', schedule: 'daily' }];

module.exports = function () {
  const r = createReporter('habits');

  // The only writer of habit history sat below a sanitise pass that cleared
  // completedToday first, so it could never fire and the history stayed empty.
  r.section('completing a habit records it in history');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(0) }),
    });
    run(s, "tapHabit('h1','')");
    const hist = JSON.parse(s.localStorage._d['hvi_habit_history'] || '{}');
    r.check('today is recorded', (hist.h1 || []).includes(dk(0)), `(${JSON.stringify(hist)})`);
    r.check('streak started', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 1);

    run(s, "tapHabit('h1','')");   // un-tick
    const hist2 = JSON.parse(s.localStorage._d['hvi_habit_history'] || '{}');
    r.check('un-ticking removes it again', !(hist2.h1 || []).includes(dk(0)), `(${JSON.stringify(hist2)})`);
  }

  // Ticking, unticking and ticking again on one day reset a long streak to 1:
  // the second tick saw a last completion of today, not yesterday, and
  // recounted. And an unticked habit kept the day, so its streak carried on.
  r.section('taking a tick back puts the streak where it was');
  {
    const mk = entry => {
      const s = sb({
        hvi_habits: JSON.stringify(H),
        hvi_log: JSON.stringify({ h1: entry }),
        hvi_meta: JSON.stringify({ lastOpenedDate: dk(0) }),
      });
      run(s, `awardXP=function(n){ _tracked.push(['xp', n]); }; showMilestone=function(){}; checkMilestones=function(){};`);
      return s;
    };
    const xp = s => JSON.parse(run(s, 'JSON.stringify(_tracked.filter(function(t){return t[0]==="xp"}).map(function(t){return t[1]}))'));

    const s = mk({ streak: 4, lastCompletedDate: dk(1), completedToday: false });
    run(s, "tapHabit('h1','')");
    r.check('a tick moves the streak on', run(s, 'log.h1.streak') === 5);
    run(s, "tapHabit('h1','')");
    r.check('unticking puts it back', run(s, 'log.h1.streak') === 4, `(${run(s, 'log.h1.streak')})`);
    r.check('and the last completion with it', run(s, 'log.h1.lastCompletedDate') === dk(1),
      `(${run(s, 'log.h1.lastCompletedDate')})`);
    run(s, "tapHabit('h1','')");
    r.check('ticking again reaches the same streak, not 1', run(s, 'log.h1.streak') === 5, `(${run(s, 'log.h1.streak')})`);
    run(s, "tapHabit('h1','')");
    run(s, 'validateStreaks()');
    r.check('an unticked habit is still due today, not broken', run(s, 'log.h1.streak') === 4);

    // What unticking under the old code left behind: today as the last
    // completion, not completed, and nothing to restore from.
    const old = mk({ streak: 5, lastCompletedDate: dk(0), completedToday: false });
    run(old, "tapHabit('h1','')");
    r.check('a tick left half undone by an older version keeps its streak', run(old, 'log.h1.streak') === 5,
      `(${run(old, 'log.h1.streak')})`);

    const first = mk({ streak: 0, lastCompletedDate: '', completedToday: false });
    run(first, "tapHabit('h1','')"); run(first, "tapHabit('h1','')");
    r.check('a first tick taken back leaves no streak', run(first, 'log.h1.streak') === 0 && run(first, 'log.h1.lastCompletedDate') === '');

    // 6 -> 7 is a milestone day: 15 for the tick and 50 for the week.
    const week = mk({ streak: 6, lastCompletedDate: dk(1), completedToday: false });
    run(week, "tapHabit('h1','')");
    const gave = xp(week).reduce((a, b) => a + b, 0);
    run(week, "tapHabit('h1','')");
    const net = xp(week).reduce((a, b) => a + b, 0);
    r.check('the milestone tick gives its bonus and award', gave === 65, `(${gave})`);
    r.check('unticking takes back exactly what the tick gave', net === 0, `(${JSON.stringify(xp(week))})`);
    run(week, "tapHabit('h1','')"); run(week, "tapHabit('h1','')");
    r.check('so ticking back and forth earns nothing', xp(week).reduce((a, b) => a + b, 0) === 0);
  }

  r.section('history survives the daily rollover');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 5, lastCompletedDate: dk(1), completedToday: true } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(1) }),
    });
    run(s, 'checkReset()');
    const hist = JSON.parse(s.localStorage._d['hvi_habit_history'] || '{}');
    r.check('yesterday backfilled', (hist.h1 || []).includes(dk(1)), `(${JSON.stringify(hist)})`);
    r.check('streak kept (completed yesterday)', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 5);
    r.check('completedToday cleared', JSON.parse(s.localStorage._d['hvi_log']).h1.completedToday === false);

    run(s, 'checkReset()');   // idempotent
    const again = JSON.parse(s.localStorage._d['hvi_habit_history']).h1;
    r.check('no duplicate entries', again.filter(x => x === dk(1)).length === 1, `(${again})`);
  }

  r.section('a missed day breaks the streak');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 9, lastCompletedDate: dk(3), completedToday: false } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(1) }),
    });
    run(s, 'checkReset()');
    r.check('streak reset', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 0);
  }

  // toISOString() is UTC. West of Greenwich it rolls to tomorrow in the
  // evening, so keys stopped matching the locally-written data.
  r.section('date keys are local, not UTC');
  {
    const s = sb({ hvi_habits: JSON.stringify(H), hvi_log: '{}', hvi_meta: '{}' });
    r.check('dateKey matches today()', run(s, 'dateKey(new Date()) === today()') === true,
      `(${run(s, 'dateKey(new Date())')} vs ${run(s, 'today()')})`);
    // A calendar day back, not 24 hours: on the day the clocks go back, 24
    // hours before 23:30 is still the same date.
    r.check('handles a Date for a past day',
      run(s, `(function(){ var d = new Date(); d.setDate(d.getDate() - 1); return dateKey(d) === yesterday(); })()`) === true);
    // 23:00 local must stay on today's date whatever the offset
    r.check('late evening stays on the same local day', run(s, `(function(){
      var d=new Date(); d.setHours(23,0,0,0);
      return dateKey(d) === d.toLocaleDateString('en-CA');
    })()`) === true);
  }

  r.section('weekly schedules count completions');
  {
    const weekly = [{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 3 }];
    const now = new Date();
    // Completions earlier this week, written with local keys
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const done = [];
    for (let i = 0; i < 2 && (() => { const d = new Date(start); d.setDate(start.getDate() + i); return d < now; })(); i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (d.toLocaleDateString('en-CA') !== now.toLocaleDateString('en-CA')) done.push(d.toLocaleDateString('en-CA'));
    }
    const s = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: done }),
    });
    const due = run(s, `isHabitDueToday(habits[0])`);
    r.check('still due below the weekly target', due === true, `(done ${done.length}/3, due=${due})`);

    // At the target it should stop being due
    const s2 = sb({
      hvi_habits: JSON.stringify([{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 1 }]),
      hvi_log: JSON.stringify({ h2: { streak: 0, lastCompletedDate: dk(0), completedToday: true } }),
      hvi_meta: '{}', hvi_habit_history: '{}',
    });
    r.check("today's completion counts toward the target",
      run(s2, 'isHabitDueToday(habits[0])') === false, '(today ignored — the UTC key never matched)');
  }


  // Reported: a streak survived a week of not logging. checkReset() zeroed it
  // correctly, then cloudPull()'s "keep higher streak" merge restored the stale
  // number from the cloud, so the streak was effectively immortal.
  r.section('a cloud pull cannot revive a broken streak');
  {
    const stale = { h1: { streak: 9, lastCompletedDate: dk(5), completedToday: false } };
    const s = createSandbox({
      files: FILES,
      store: {
        hvi_habits: JSON.stringify(H),
        hvi_log: JSON.stringify(stale),
        hvi_meta: JSON.stringify({ lastOpenedDate: dk(5) }),
        hvi_session: JSON.stringify({ access_token: 't', refresh_token: 'r', user: { id: 'U1' } }),
      },
      fetch: url => url.includes('/rest/v1/hvi_data')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ data: { hvi_log: stale } }]) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    });
    run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
      playSound=function(){}; awardXP=function(){}; haptic=function(){};
      maybeAwardStreakShield=function(){}; renderHabits=function(){};
      setSyncStatus=function(){}; _syncToast=function(){};
      habits=JSON.parse(localStorage.getItem('hvi_habits'));
      log=JSON.parse(localStorage.getItem('hvi_log'));
      meta=JSON.parse(localStorage.getItem('hvi_meta')); workoutMeta={};`);
    run(s, 'checkReset()');
    const afterReset = JSON.parse(s.localStorage._d['hvi_log']).h1.streak;
    r.check('the rollover breaks it', afterReset === 0, `(${afterReset})`);
    return run(s, 'cloudPull()').then(() => {
      const after = JSON.parse(s.localStorage._d['hvi_log']).h1.streak;
      r.check('the pull does not bring it back', after === 0, `(${after} — stale streak restored)`);
      return rest(r);
    });
  }
}

function rest(r) {
  // Only "was it due yesterday" was checked before, so a multi-day gap left the
  // streak intact whenever the final day happened not to be a due day.
  r.section('a gap of several days breaks the streak');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 12, lastCompletedDate: dk(7), completedToday: false } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(7) }),
    });
    run(s, 'validateStreaks()');
    r.check('a week away ends it', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 0,
      `(${JSON.parse(s.localStorage._d['hvi_log']).h1.streak})`);
  }

  r.section('an unbroken streak is left alone');
  {
    const today = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 4, lastCompletedDate: dk(0), completedToday: true } }),
      hvi_meta: '{}' });
    run(today, 'validateStreaks()');
    r.check('completed today survives', JSON.parse(today.localStorage._d['hvi_log'] || '{}').h1?.streak === 4
      || run(today, 'log.h1.streak') === 4);

    const yest = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 4, lastCompletedDate: dk(1), completedToday: false } }),
      hvi_meta: '{}' });
    run(yest, 'validateStreaks()');
    r.check('completed yesterday survives', run(yest, 'log.h1.streak') === 4, `(${run(yest,'log.h1.streak')})`);
  }

  r.section('scheduled habits only break on days they were due');
  {
    // Due Mondays only. Missing a Tuesday must not end the streak.
    const monOnly = [{ id: 'h1', name: 'Long run', schedule: 'specific', days: [1] }];
    const lastMon = (() => { const d = new Date();
      while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); })();
    const s = sb({
      hvi_habits: JSON.stringify(monOnly),
      hvi_log: JSON.stringify({ h1: { streak: 3, lastCompletedDate: lastMon, completedToday: false } }),
      hvi_meta: '{}' });
    run(s, 'validateStreaks()');
    const kept = run(s, 'log.h1.streak');
    const daysSince = Math.round((new Date(new Date().toDateString()) - new Date(lastMon + 'T12:00')) / 86400000);
    r.check('non-due days do not break it', daysSince < 7 ? kept === 3 : kept === 0,
      `(streak ${kept}, ${daysSince}d since the last Monday)`);
  }

  r.section('validation is idempotent');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 6, lastCompletedDate: dk(4), completedToday: false } }),
      hvi_meta: '{}' });
    run(s, 'validateStreaks(); validateStreaks(); validateStreaks();');
    r.check('still zero, no side effects', run(s, 'log.h1.streak') === 0);
  }


  // Weekly habits count weeks, not days: a missed Tuesday is fine, a week that
  // never hit the target is not.
  r.section('weekly habits break after a missed week');
  {
    const weekly = [{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 3 }];
    // Week boundaries match the rest of the app: Sunday start
    const curStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d; })();
    const dayIn = (weeksBack, offset) => {
      const d = new Date(curStart);
      d.setDate(d.getDate() - weeksBack * 7 + offset);
      return d.toLocaleDateString('en-CA');
    };
    const lastCompleted = dayIn(1, 1);

    // Hit the target last week -> the streak stands
    const hit = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 5, lastCompletedDate: lastCompleted, completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [dayIn(2, 1), dayIn(1, 1), dayIn(1, 3), dayIn(1, 5)] }),
    });
    run(hit, 'validateStreaks()');
    r.check('target met last week keeps the streak', run(hit, 'log.h2.streak') === 5,
      `(${run(hit, 'log.h2.streak')})`);

    // Only one session last week against a target of three -> broken
    const missed = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 5, lastCompletedDate: lastCompleted, completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [dayIn(2, 1), dayIn(1, 1)] }),
    });
    run(missed, 'validateStreaks()');
    r.check('falling short of the target breaks it', run(missed, 'log.h2.streak') === 0,
      `(${run(missed, 'log.h2.streak')})`);

    // Nothing at all last week -> broken
    const none = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 5, lastCompletedDate: dayIn(3, 1), completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [dayIn(3, 1), dayIn(3, 2), dayIn(3, 4)] }),
    });
    run(none, 'validateStreaks()');
    r.check('a blank week breaks it', run(none, 'log.h2.streak') === 0, `(${run(none, 'log.h2.streak')})`);
  }

  r.section('a brand new weekly habit is not punished');
  {
    const weekly = [{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 3 }];
    const curStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d; })();
    const thisWeek = (() => { const d = new Date(curStart); return d.toLocaleDateString('en-CA'); })();
    const s = sb({
      hvi_habits: JSON.stringify(weekly),
      // Created and completed this week only: there is no elapsed week to judge
      hvi_log: JSON.stringify({ h2: { streak: 1, lastCompletedDate: thisWeek, completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [thisWeek] }),
    });
    run(s, 'validateStreaks()');
    r.check('no prior week means no break', run(s, 'log.h2.streak') === 1, `(${run(s, 'log.h2.streak')})`);
  }

  // The tick asked only "was it done yesterday?". A habit due on Monday,
  // Wednesday and Friday, or one done three times a week, fell back to 1 on
  // every tick that followed a rest day, however long it had been kept.
  r.section('a tick carries the streak across rest days');
  {
    const dow = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getDay(); };
    const mk = (habit, entry, hist) => sb({
      hvi_habits: JSON.stringify([Object.assign({ id: 'h1', name: 'Gym' }, habit)]),
      hvi_log: JSON.stringify({ h1: Object.assign({ completedToday: false }, entry) }),
      hvi_meta: '{}', hvi_habit_history: JSON.stringify(hist || {}) });
    const tick = s => { run(s, "tapHabit('h1','')"); return run(s, 'log.h1.streak'); };

    // Due today and the day before yesterday. Yesterday was a rest day.
    const rest = mk({ schedule: 'specific', days: [dow(0), dow(2)] }, { streak: 5, lastCompletedDate: dk(2) });
    run(rest, 'validateStreaks()');
    r.check('the launch check keeps it', run(rest, 'log.h1.streak') === 5);
    r.check('and so does the tick', tick(rest) === 6, `(${run(rest, 'log.h1.streak')})`);
    run(rest, "tapHabit('h1','')");
    r.check('taking it back restores the streak and its date', run(rest, 'log.h1.streak') === 5 && run(rest, 'log.h1.lastCompletedDate') === dk(2));

    const week = mk({ schedule: 'specific', days: [dow(0)] }, { streak: 3, lastCompletedDate: dk(7) });
    r.check('six rest days in a row are still not a miss', tick(week) === 4, `(${run(week, 'log.h1.streak')})`);

    const skipped = mk({ schedule: 'specific', days: [dow(0), dow(1), dow(2)] }, { streak: 5, lastCompletedDate: dk(2) });
    r.check('a day it was due on and skipped starts it again', tick(skipped) === 1, `(${run(skipped, 'log.h1.streak')})`);
    const fortnight = mk({ schedule: 'specific', days: [dow(0)] }, { streak: 3, lastCompletedDate: dk(14) });
    r.check('as does a skipped week for a once-a-week day', tick(fortnight) === 1, `(${run(fortnight, 'log.h1.streak')})`);

    r.check('daily: done yesterday carries on', tick(mk({ schedule: 'daily' }, { streak: 4, lastCompletedDate: dk(1) })) === 5);
    r.check('daily: a missed day starts again', tick(mk({ schedule: 'daily' }, { streak: 4, lastCompletedDate: dk(2) })) === 1);
    r.check('daily: no schedule set is daily', tick(mk({}, { streak: 4, lastCompletedDate: dk(2) })) === 1);
    r.check('a first ever tick is 1', tick(mk({ schedule: 'specific', days: [dow(0)] }, { streak: 0, lastCompletedDate: '' })) === 1);
    r.check('a last completion dated in the future does not carry on', tick(mk({ schedule: 'daily' }, { streak: 5, lastCompletedDate: dk(-1) })) === 1);
  }

  r.section('a weekly habit counts each completion while its weeks hold');
  {
    const weekly = { schedule: 'weekly', perWeek: 3 };
    const curStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d; })();
    const dayIn = (weeksBack, offset) => {
      const d = new Date(curStart);
      d.setDate(d.getDate() - weeksBack * 7 + offset);
      return d.toLocaleDateString('en-CA');
    };
    const mk = (entry, hist, extra) => {
      const s = sb({
        hvi_habits: JSON.stringify([Object.assign({ id: 'h2', name: 'Gym' }, weekly)]),
        hvi_log: JSON.stringify({ h2: Object.assign({ completedToday: false }, entry) }),
        hvi_meta: '{}', hvi_habit_history: JSON.stringify({ h2: hist }) });
      if (extra) run(s, extra);
      return s;
    };
    const tick = s => { run(s, "tapHabit('h2','')"); return run(s, 'log.h2.streak'); };

    const held = mk({ streak: 5, lastCompletedDate: dayIn(1, 5) }, [dayIn(1, 1), dayIn(1, 3), dayIn(1, 5)]);
    r.check('last week met its target: the tick carries on', tick(held) === 6, `(${run(held, 'log.h2.streak')})`);
    const short = mk({ streak: 5, lastCompletedDate: dayIn(1, 1) }, [dayIn(2, 1), dayIn(1, 1)]);
    r.check('last week fell short: it starts again', tick(short) === 1, `(${run(short, 'log.h2.streak')})`);
    const blank = mk({ streak: 5, lastCompletedDate: dayIn(2, 5) }, [dayIn(2, 1), dayIn(2, 3), dayIn(2, 5)]);
    r.check('a week with nothing in it: it starts again', tick(blank) === 1, `(${run(blank, 'log.h2.streak')})`);

    // A short week is a week, not something a shield covers.
    const shielded = mk({ streak: 5, lastCompletedDate: dayIn(1, 1) }, [dayIn(2, 1), dayIn(1, 1)],
      `getStreakShields=function(){ return 2; }; useStreakShield=function(id){ _tracked.push(['shield', id]); };`);
    run(shielded, 'validateStreaks()');
    r.check('a short week breaks it without spending a shield',
      run(shielded, 'log.h2.streak') === 0 && run(shielded, '_tracked.filter(function(t){return t[0]==="shield"}).length') === 0);

    // The rule itself, on fixed dates so it does not depend on the day the
    // suite runs. 8 March 2026 is a Sunday, the start of a week.
    const s = mk({ streak: 1, lastCompletedDate: '' }, []);
    const misses = (h, last, t, hist) => run(s, `_streakMisses(${JSON.stringify(h)}, { lastCompletedDate: '${last}' }, '${t}', ${JSON.stringify({ h2: hist || [] })})`);
    const W = { id: 'h2', schedule: 'weekly', perWeek: 3 };
    r.check('a new run this week is not judged by the short week before it',
      misses(W, '2026-03-09', '2026-03-11', ['2026-03-02', '2026-03-09']) === 0);
    r.check('last week met', misses(W, '2026-03-06', '2026-03-11', ['2026-03-02', '2026-03-04', '2026-03-06']) === 0);
    r.check('last week short', misses(W, '2026-03-06', '2026-03-11', ['2026-03-04', '2026-03-06']) === 1);
    r.check('a blank week in between', misses(W, '2026-02-27', '2026-03-11', ['2026-02-23', '2026-02-25', '2026-02-27']) === 1);
    r.check('no record from before this week is not a miss', misses(W, '2026-03-06', '2026-03-11', []) === 0);
    r.check('on the first day of a week, the week just ended is judged',
      misses(W, '2026-03-06', '2026-03-08', ['2026-03-04', '2026-03-06']) === 1
      && misses(W, '2026-03-06', '2026-03-08', ['2026-03-02', '2026-03-04', '2026-03-06']) === 0);
    const MWF = { id: 'h2', schedule: 'specific', days: [1, 3, 5] };
    r.check('Mon/Wed/Fri: Tuesday is not a miss', misses(MWF, '2026-03-09', '2026-03-11') === 0);
    r.check('Mon/Wed/Fri: a skipped Monday is one', misses(MWF, '2026-03-06', '2026-03-11') === 1);
    r.check('Mon/Wed/Fri: a skipped Friday and Monday are two', misses(MWF, '2026-03-04', '2026-03-11') === 2);
    const D = { id: 'h2', schedule: 'daily' };
    r.check('daily: yesterday', misses(D, '2026-03-10', '2026-03-11') === 0);
    r.check('daily: the day before', misses(D, '2026-03-09', '2026-03-11') === 1);
    r.check('today or never is nothing missed', misses(D, '2026-03-11', '2026-03-11') === 0 && misses(D, '', '2026-03-11') === 0);
    r.check('a log entry with no habit behind it counts as daily', run(s, `_streakMisses(undefined, { lastCompletedDate: '2026-03-09' }, '2026-03-11', {})`) === 1);

    // A run restarted this week must survive the next morning's check.
    if (new Date().getDay() >= 1) {
      const again = mk({ streak: 1, lastCompletedDate: dk(1) }, [dayIn(2, 1), dayIn(1, 1), dk(1)]);
      run(again, 'validateStreaks()');
      r.check('restarted yesterday after a short week: still 1 this morning', run(again, 'log.h2.streak') === 1, `(${run(again, 'log.h2.streak')})`);
      r.check('and today makes 2', tick(again) === 2, `(${run(again, 'log.h2.streak')})`);
    }
  }

  r.section('daily habits are unaffected by the weekly rule');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 4, lastCompletedDate: dk(1), completedToday: false } }),
      hvi_meta: '{}', hvi_habit_history: '{}' });
    run(s, 'validateStreaks()');
    r.check('completed yesterday still survives', run(s, 'log.h1.streak') === 4, `(${run(s, 'log.h1.streak')})`);
  }

  // The ninety-day activity grid read lastCompletedDate, which holds exactly
  // one date per habit. However long someone had been going, every cell but
  // the most recent was empty — the feature could not work by construction.
  r.section('the activity heatmap reflects real history');
  {
    // buildHeatmapHTML lives in profile.js, which this suite's sandbox does
    // not load, so this section builds its own.
    const s = createSandbox({
      files: ['data.js', 'app.js', 'connect.js', 'today.js', 'premium.js', 'workout.js',
              'diet.js', 'integrations.js', 'profile.js'],
      store: {
        hvi_habits: JSON.stringify([{ id: 'h1', name: 'Read', schedule: 'daily' }]),
        hvi_log: JSON.stringify({ h1: { streak: 3, lastCompletedDate: dk(1), completedToday: false } }),
        hvi_habit_history: JSON.stringify({ h1: [1, 2, 3, 10, 40, 80].map(dk) }),
      },
    });
    run(s, `
      settings={}; curView='habits'; track=function(){}; go=function(){};
      habits=JSON.parse(localStorage.getItem('hvi_habits'));
      log=JSON.parse(localStorage.getItem('hvi_log'));
      gamification={xp:0}; tdeeProfile=null;
    `);
    const html = run(s, 'buildHeatmapHTML()') || '';
    const lit = (html.match(/hm-heat-[1-4]/g) || []).length;
    r.check('every logged day is lit', lit === 6, `(${lit} of 6 cells lit)`);
    r.check('and the rest are empty', (html.match(/hm-heat-0/g) || []).length === 91 - 6,
      `(${(html.match(/hm-heat-0/g) || []).length} empty)`);
  }

  return r.finish();
};
