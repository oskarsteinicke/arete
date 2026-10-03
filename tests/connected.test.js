// Cross-section reactions: readiness driving training advice, and one section's
// input completing a habit owned by another.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','social.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='workout';
    track=function(){}; go=function(v){ _nav.push(v); };
    playSound=function(){}; haptic=function(){}; awardXP=function(){};
    launchConfetti=function(){}; checkDailyQuests=function(){}; checkAchievements=function(){};
    renderHabits=function(){}; updateHabitUI=function(){}; _connectToast=function(m){ _tracked.push(['toast',m]); };
    habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');
    log=JSON.parse(localStorage.getItem('hvi_log')||'{}');
    sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
    journal=JSON.parse(localStorage.getItem('hvi_journal3')||'{}');
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    mealLog={}; weightLog={}; prs={}; gamification={xp:0}; meta={};
    workoutMeta={activeProgram:'ppl',currentDayIndex:0};
    dietMeta={dailyGoals:{calories:2500,protein:180,carbs:280,fat:80},goalType:'maintain'};
  `);
  return s;
}
const H = [{ id: 'h1', name: 'Sleep 7h', schedule: 'daily' }];

module.exports = function () {
  const r = createReporter('connected');

  // Quality is 40% of the sleep score. Counting an unrecorded one as zero
  // capped every synced night at 0.6 and read as poor recovery.
  r.section('sleep scores on what was actually recorded');
  {
    const mk = (entry) => {
      const s2 = sb({ hvi_habits: '[]', hvi_log: '{}',
        hvi_sleep_log: JSON.stringify({ [dk(0)]: entry }) });
      run(s2, `sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log'));
               workoutLog={}; mealLog={}; dietMeta={}; habits=[]; log={};`);
      return run(s2, 'getReadiness().factors.sleep');
    };
    const both = mk({ hours: 8, quality: 5 });
    const hoursOnly = mk({ hours: 8 });
    r.check('eight hours with a top rating scores full', both === 1, `(${both})`);
    r.check('eight hours with no rating is not punished for it',
      hoursOnly === 1, `(${hoursOnly} — unrecorded quality counted as zero)`);
    const poor = mk({ hours: 8, quality: 1 });
    r.check('but a genuinely poor rating still lowers it', poor < hoursOnly, `(${poor})`);
    const qualityOnly = mk({ quality: 5 });
    r.check('a rating with no hours scores on the rating', qualityOnly === 1, `(${qualityOnly})`);
  }

  // Readiness was computed from sleep, load, habits and nutrition but only ever
  // shown on the home screen — the workout screen never saw it.
  r.section('readiness becomes advice for today\'s session');
  {
    const rested = sb({
      hvi_habits: '[]', hvi_log: '{}',
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8.5, quality: 5 } }),
    });
    const good = JSON.parse(run(rested, 'JSON.stringify(trainingAdvice())') || 'null');
    r.check('advice is produced once there is a signal', !!good, '(none)');
    r.check('a rested day says go heavy', /heavy|as planned/i.test(good.headline), `(${good.headline})`);

    const wrecked = sb({
      hvi_habits: '[]', hvi_log: '{}',
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 3, quality: 1 } }),
    });
    const bad = JSON.parse(run(wrecked, 'JSON.stringify(trainingAdvice())') || 'null');
    r.check('a bad night lowers the score', bad.score < good.score, `(${bad.score} vs ${good.score})`);
    r.check('and changes the instruction', bad.headline !== good.headline, `(${bad.headline})`);
    r.check('it names the limiting factor', /sleep/i.test(bad.detail), `(${bad.detail})`);
    r.check('it renders on the workout screen', /w-advice/.test(run(wrecked, 'trainingAdviceHTML()') || ''));
  }

  r.section('no advice without any signal');
  {
    const blank = sb({ hvi_habits: '[]', hvi_log: '{}', hvi_sleep_log: '{}' });
    r.check('a brand new user sees nothing', run(blank, 'trainingAdvice()') === null);
    r.check('and no markup is emitted', run(blank, 'trainingAdviceHTML()') === '');
  }

  r.section('logging sleep ticks a habit that belongs to the habits section');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8 } }),
    });
    run(s, "window.Arete.emit('sleep:logged', { hours: 8 })");
    r.check('the linked habit completed itself', run(s, 'log.h1.completedToday') === true);
    r.check('and the user was told', run(s, '_tracked.some(function(t){return t[0]==="toast"})') === true);

    // Not enough sleep shouldn't tick it
    const short = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 5 } }),
    });
    run(short, "window.Arete.emit('sleep:logged', { hours: 5 })");
    r.check('under the threshold does not tick', run(short, 'log.h1.completedToday') === false);
  }

  r.section('journalling ticks a linked habit');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Reflect' }]),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'journal' }),
      hvi_journal3: JSON.stringify({ [T]: { win: 'shipped the audit' } }),
    });
    run(s, "window.Arete.emit('journal:saved', {})");
    r.check('completed from a journal entry', run(s, 'log.h1.completedToday') === true);

    const empty = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Reflect' }]),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'journal' }),
      hvi_journal3: JSON.stringify({ [T]: { win: '' } }),
    });
    run(empty, "window.Arete.emit('journal:saved', {})");
    r.check('a blank entry does not count', run(empty, 'log.h1.completedToday') === false);
  }

  r.section('a habit only auto-completes for its own trigger');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8 } }),
    });
    run(s, "window.Arete.emit('workout:completed', {})");
    r.check('a workout does not tick a sleep habit', run(s, 'log.h1.completedToday') === false);
    run(s, "window.Arete.emit('sleep:logged', {})");
    r.check('its own trigger does', run(s, 'log.h1.completedToday') === true);
  }

  r.section('auto-completion is idempotent');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 2, lastCompletedDate: dk(1), completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8 } }),
    });
    run(s, "window.Arete.emit('sleep:logged', {})");
    const after = run(s, 'log.h1.streak');
    run(s, "window.Arete.emit('sleep:logged', {}); window.Arete.emit('sleep:logged', {});");
    r.check('the streak advances once', run(s, 'log.h1.streak') === after, `(${after} -> ${run(s,'log.h1.streak')})`);
  }


  // BMR is driven by bodyweight, so targets set months ago stop matching the
  // person using them.
  r.section('bodyweight drift offers new targets');
  {
    const profile = { age: 25, sex: 'male', weight_kg: 90, height_cm: 180,
                      activity: 'moderate', goal: 'cut' };
    const drifted = sb({
      hvi_habits: '[]', hvi_log: '{}',
      hvi_tdee_profile: JSON.stringify(profile),
      hvi_weight_log: JSON.stringify({ [dk(1)]: 82 }),   // 8kg down
    });
    run(drifted, `tdeeProfile=JSON.parse(localStorage.getItem('hvi_tdee_profile'));
                  weightLog=JSON.parse(localStorage.getItem('hvi_weight_log'));
                  dietMeta={dailyGoals:{calories:2400,protein:210,carbs:210,fat:80},goalType:'cut'};`);
    const d = JSON.parse(run(drifted, 'JSON.stringify(bodyweightDrift())') || 'null');
    r.check('drift detected', !!d, '(none)');
    r.check('reports the direction', d.deltaKg < 0, `(${d.deltaKg})`);
    r.check('a lighter person needs fewer calories', d.next.target < d.current,
      `(${d.next.target} vs ${d.current})`);
    r.check('it is offered, not applied', run(drifted, 'dietMeta.dailyGoals.calories') === 2400);
    r.check('the prompt renders', /dw-drift/.test(run(drifted, 'bodyweightDriftHTML()') || ''));

    run(drifted, 'applyBodyweightDrift()');
    r.check('applying updates the targets', run(drifted, 'dietMeta.dailyGoals.calories') === d.next.target,
      `(${run(drifted, 'dietMeta.dailyGoals.calories')})`);
    r.check('macros move with it', run(drifted, 'dietMeta.dailyGoals.protein') === d.next.protein);
    r.check('the profile is brought in step', Math.abs(run(drifted, 'tdeeProfile.weight_kg') - 82) < 0.2,
      `(${run(drifted, 'tdeeProfile.weight_kg')})`);
    r.check('so the prompt does not reappear', run(drifted, 'bodyweightDrift()') === null);
  }

  r.section('the threshold is 1.5kg, and it actually fires');
  {
    const mk = (logged) => {
      const s2 = sb({
        hvi_habits: '[]', hvi_log: '{}',
        hvi_tdee_profile: JSON.stringify({ age:25, sex:'male', weight_kg:80, height_cm:180,
                                           activity:'moderate', goal:'maintain' }),
        hvi_weight_log: JSON.stringify({ [dk(1)]: logged }),
      });
      run(s2, `tdeeProfile=JSON.parse(localStorage.getItem('hvi_tdee_profile'));
               weightLog=JSON.parse(localStorage.getItem('hvi_weight_log'));
               dietMeta={dailyGoals:{calories:computeTDEETargets({weightKg:80,heightCm:180,age:25,
                 sex:'male',activity:'moderate',goal:'maintain'}).target,protein:200,carbs:270,fat:90},
                 goalType:'maintain'};`);
      return s2;
    };
    // 1.5kg shifts the target by 18-28 cal, so the calorie guard must sit below
    // that — otherwise raising the weight threshold changes nothing at all.
    const up = mk(81.5);
    r.check('1.5kg up is surfaced', run(up, 'bodyweightDrift()') !== null, '(suppressed by the calorie guard)');
    const down = mk(78.5);
    r.check('1.5kg down is surfaced', run(down, 'bodyweightDrift()') !== null);
    const one = mk(81);
    r.check('a single kilo no longer nags', run(one, 'bodyweightDrift()') === null);
    const half = mk(80.4);
    r.check('half a kilo is still ignored', run(half, 'bodyweightDrift()') === null);
    r.check('and renders nothing', run(half, 'bodyweightDriftHTML()') === '');
  }

  r.section('drift needs a profile to compare against');
  {
    const s3 = sb({ hvi_habits: '[]', hvi_log: '{}',
      hvi_weight_log: JSON.stringify({ [dk(1)]: 82 }) });
    run(s3, `tdeeProfile=null; weightLog=JSON.parse(localStorage.getItem('hvi_weight_log'));
             dietMeta={dailyGoals:{calories:2500}};`);
    r.check('no profile means no prompt', run(s3, 'bodyweightDrift()') === null);
  }

  r.section('the shared formula is used by both paths');
  {
    const s4 = sb({ hvi_habits: '[]', hvi_log: '{}' });
    const t = JSON.parse(run(s4, `JSON.stringify(computeTDEETargets({
      weightKg: 80, heightCm: 180, age: 25, sex: 'male', activity: 'moderate', goal: 'maintain' }))`) || 'null');
    r.check('reference BMR is 1805', t.bmr === 1805, `(${t.bmr})`);
    r.check('TDEE applies the activity multiplier', t.tdee === Math.round(1805 * 1.55), `(${t.tdee})`);
    r.check('maintain adds no offset', t.target === t.tdee);
    r.check('macros roughly reconstruct the target',
      Math.abs((t.protein*4 + t.carbs*4 + t.fat*9) - t.target) < 12,
      `(${t.protein*4 + t.carbs*4 + t.fat*9} vs ${t.target})`);
    r.check('rubbish input returns nothing', run(s4, "computeTDEETargets({weightKg:0})") === null);
  }

  // Training changes nutrition silently. The card after a session has to say
  // what the session itself changed, and not claim credit for what the plan
  // had already set that morning.
  r.section('a finished session reports what it fed');
  {
    const dow = new Date().getDay();
    const logged = JSON.stringify({ [T]: { dayName: 'Legs', exercises: [{ exerciseId: 'squat', sets: [{ weight: 100, reps: 5, completed: true }] }] } });
    const mk = (trainingDays) => {
      const s2 = sb({ hvi_habits: '[]', hvi_log: '{}', hvi_workout_log: logged });
      run(s2, `settings.trainingDays = ${JSON.stringify(trainingDays)};`);
      return s2;
    };

    const rest = mk([0, 1, 2, 3, 4, 5, 6].filter(d => d !== dow));   // today was a planned rest day
    const before = run(rest, 'JSON.stringify(getTodaysMacroTargets(_plannedSession()))');
    const sum = run(rest, `sessionFedSummary(JSON.parse(${JSON.stringify(before)}), ['Gym'])`);
    r.check('training on a rest day is reported as a change', sum.nutrition.changed && sum.nutrition.fromRest,
      `(${JSON.stringify(sum.nutrition)})`);
    r.check('carbs rise from the rest-day number', sum.nutrition.carbs > sum.nutrition.carbsFrom,
      `(${sum.nutrition.carbsFrom} -> ${sum.nutrition.carbs})`);
    r.check('the habit it ticked is named', sum.habits[0] === 'Gym', `(${JSON.stringify(sum.habits)})`);
    const html = run(rest, `sessionFedHTML(sessionFedSummary(JSON.parse(${JSON.stringify(before)}), []))`);
    r.check('the card shows the old number struck through', /<s>\d+<\/s> → <b data-count-from/.test(html), '(no before → after)');

    const planned = mk([dow]);   // planned training day, and it was trained
    run(planned, `workoutMeta = { activeProgram: 'custom-legs', currentDayIndex: 0 };
                  findProgram = function(){ return { days: [{ name: 'Legs' }] }; };`);
    const pBefore = run(planned, 'JSON.stringify(getTodaysMacroTargets(_plannedSession()))');
    const same = run(planned, `sessionFedSummary(JSON.parse(${JSON.stringify(pBefore)}), [])`);
    r.check('a session the plan already expected is not claimed as a change', !same.nutrition.changed,
      `(${JSON.stringify(same.nutrition)})`);
    r.check('it shows the adjustment against the base goal instead',
      same.nutrition.carbsFrom === 280 && same.nutrition.carbs > 280, `(${same.nutrition.carbsFrom} -> ${same.nutrition.carbs})`);

    const stale = run(rest, `sessionFedHTML(Object.assign(sessionFedSummary(null, []), { date: '2000-01-01' }))`);
    r.check('a summary from another day renders nothing', stale === '', '(stale card shown)');
  }

  // The card names the habits a session ticked, so a toast on top of it would
  // say the same thing twice, over the card it is repeating.
  r.section('a workout ticks its linked habit for the card, without a toast');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'workout' }),
    });
    run(s, "window.Arete.emit('workout:completed')");
    r.check('the linked habit completed itself', run(s, 'log.h1.completedToday') === true);
    r.check('and is kept for the session card', run(s, 'JSON.stringify(_workoutAutoDone)') === JSON.stringify([H[0].name]),
      `(${run(s, 'JSON.stringify(_workoutAutoDone)')})`);
    r.check('with no toast over the card', run(s, '_tracked.some(function(t){return t[0]==="toast"})') === false,
      '(toast shown after a workout)');
  }

  // The count-up is a morning moment. Replaying it on every trip back to home
  // would turn it into noise, and the score has to be right without it.
  r.section('the readiness reveal plays once a day');
  {
    const s = sb({ hvi_habits: '[]', hvi_log: '{}',
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8, quality: 4 } }) });
    run(s, `sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log'));`);
    const score = run(s, 'getReadiness().score');
    const first = run(s, 'todayBriefingHTML()');
    const burst = run(s, 'todayBriefingHTML()');
    run(s, '_readyRevealUntil = 0');   // the launch's opening burst of renders is over
    const second = run(s, 'todayBriefingHTML()');
    r.check('the first home of the day reveals it', /tb-ready--reveal/.test(first), '(no reveal class)');
    r.check('a re-render in the same launch burst keeps it', /tb-ready--reveal/.test(burst), '(reveal cut off at launch)');
    r.check('later ones do not', !/tb-ready--reveal/.test(second), '(reveal replays)');
    r.check('the real score is announced while it counts',
      new RegExp(`aria-label="Readiness ${score},`).test(first), `(score ${score} missing)`);
    r.check('and shown outright once the reveal is spent',
      new RegExp(`tb-ready-num[^>]*>${score}<`).test(second), `(score ${score} missing)`);
  }

  return r.finish();
};
