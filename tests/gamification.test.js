// XP, levels, achievements, quests and the daily score.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','profile.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='home';
    track=function(n,p){ _tracked.push([n,p||{}]); };
    go=function(v){ _nav.push(v); };
    playSound=function(){}; haptic=function(){}; showXPToast=function(){};
    showAchievementToast=function(a){ _tracked.push(['toast',a]); };
    launchConfetti=function(){}; renderHome=function(){};
    habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');
    log=JSON.parse(localStorage.getItem('hvi_log')||'{}');
    meta=JSON.parse(localStorage.getItem('hvi_meta')||'{}');
    journal=JSON.parse(localStorage.getItem('hvi_journal3')||'{}');
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    mealLog=JSON.parse(localStorage.getItem('hvi_meal_log')||'{}');
    sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
    weightLog={}; prs=JSON.parse(localStorage.getItem('hvi_prs')||'{}');
    achievements=JSON.parse(localStorage.getItem('hvi_achievements')||'[]');
    gamification=JSON.parse(localStorage.getItem('hvi_gamification')||'{"xp":0}');
    dietMeta={dailyGoals:{calories:2500,protein:180,carbs:280,fat:80}};
    workoutMeta={activeProgram:'ppl',currentDayIndex:0};
  `);
  return s;
}

module.exports = function () {
  const r = createReporter('gamification');

  r.section('levels follow the XP curve');
  {
    const s = sb({});
    r.check('0 XP is level 1', run(s, 'getLevel(0)') === 1);
    r.check('99 XP still level 1', run(s, 'getLevel(99)') === 1);
    r.check('100 XP is level 2', run(s, 'getLevel(100)') === 2);
    r.check('400 XP is level 3', run(s, 'getLevel(400)') === 3);
    r.check('negative XP cannot produce NaN', run(s, 'getLevel(-50)') === 1,
      `(${run(s, 'getLevel(-50)')})`);
    r.check('rubbish XP is safe', run(s, 'getLevel("abc")') === 1 && run(s, 'getLevel(undefined)') === 1);
    const p = JSON.parse(run(s, 'JSON.stringify(xpToNextLevel(150))'));
    r.check('progress is within the band', p.progress === 50 && p.needed === 300, `(${p.progress}/${p.needed})`);
    r.check('progress fraction sane', p.pct > 0 && p.pct < 1);
  }

  r.section('XP accumulates and splits by pillar');
  {
    const s = sb({});
    run(s, "awardXP(60,'body'); awardXP(40,'mind');");
    const g = JSON.parse(s.localStorage._d['hvi_gamification']);
    r.check('total XP', g.xp === 100, `(${g.xp})`);
    r.check('pillar XP tracked', g.pillarXP.body === 60 && g.pillarXP.mind === 40);
    r.check('level rose to 2', run(s, 'getLevel(gamification.xp)') === 2);
  }

  r.section('achievements unlock once');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Read' }]),
      hvi_log: JSON.stringify({ h1: { streak: 7, lastCompletedDate: T, completedToday: true } }),
    });
    run(s, 'checkAchievements()');
    const first = JSON.parse(s.localStorage._d['hvi_achievements'] || '[]');
    r.check('streak achievements unlocked', first.includes('streak_3') && first.includes('streak_7'), `(${first})`);
    run(s, 'checkAchievements(); checkAchievements();');
    const again = JSON.parse(s.localStorage._d['hvi_achievements']);
    r.check('no duplicates on repeat checks', again.length === first.length, `(${first.length} -> ${again.length})`);
    r.check('an unearned one stays locked', !again.includes('streak_30'));
  }

  // Which three quests appear is seeded by the date, so pin the pool rather
  // than depending on today's rotation.
  r.section('daily quests pay out once per day');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }]),
      hvi_log: JSON.stringify({
        h1: { completedToday: true, streak: 1 },
        h2: { completedToday: true, streak: 1 },
        h3: { completedToday: true, streak: 1 } }),
    });
    run(s, `getDailyQuests = function(){ return [
      { id:'q_test', icon:'x', label:'Test quest', xp: 25, check: function(){ return true; } } ]; };`);
    run(s, 'checkDailyQuests()');
    const xp1 = run(s, 'gamification.xp');
    r.check('a quest paid out', xp1 === 25, `(${xp1} XP)`);
    run(s, 'checkDailyQuests(); checkDailyQuests();');
    r.check('re-running pays nothing more', run(s, 'gamification.xp') === xp1, `(${run(s,'gamification.xp')})`);
    const doneToday = JSON.parse(run(s, `JSON.stringify(gamification.questsCompleted['${T}']||[])`));
    r.check('recorded against today', doneToday.length > 0);
  }

  // Opening the workout tab auto-creates an empty entry for the day. Treating
  // that as a workout handed out score, told the coach a session happened, and
  // marked the share card complete.
  r.section('an opened-but-empty workout is not a workout');
  {
    const empty = sb({ hvi_workout_log: JSON.stringify({ [T]: {
      programId: 'ppl', dayIndex: 0,
      exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 60, reps: 5, completed: false }] }],
    }})});
    r.check('trainedOnDay says no', run(empty, `trainedOnDay('${T}')`) === false);
    r.check('daily score gives no workout points', run(empty, 'computeDailyScore()') === 0,
      `(${run(empty, 'computeDailyScore()')} — points for opening the tab)`);

    const real = sb({ hvi_workout_log: JSON.stringify({ [T]: {
      programId: 'ppl', dayIndex: 0,
      exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 60, reps: 5, completed: true }] }],
    }})});
    r.check('a logged workout scores', run(real, 'computeDailyScore()') === 30,
      `(${run(real, 'computeDailyScore()')})`);

    const imported = sb({ hvi_workout_log: JSON.stringify({ [T]: {
      dayName: 'Morning Run', exercises: [], source: 'strava' } }) });
    r.check('an imported activity counts too', run(imported, 'computeDailyScore()') === 30,
      `(${run(imported, 'computeDailyScore()')})`);
  }

  r.section('the daily score adds up');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1' }, { id: 'h2' }]),
      hvi_log: JSON.stringify({ h1: { completedToday: true }, h2: { completedToday: true } }),
      hvi_journal3: JSON.stringify({ [T]: { win: 'shipped it' } }),
      hvi_workout_log: JSON.stringify({ [T]: { programId:'ppl', dayIndex:0,
        exercises:[{ exerciseId:'bench_press', sets:[{ weight:60, reps:5, completed:true }] }] } }),
      hvi_meal_log: JSON.stringify({ [T]: { meals: [{ id:'m1', name:'Lunch',
        items:[{ name:'Food', calories:2500, protein:180, carbs:280, fat:80 }] }] } }),
    });
    const score = run(s, 'computeDailyScore()');
    r.check('habits 40 + workout 30 + journal 15 + nutrition 15 = 100', score === 100, `(${score})`);
  }

  r.section('character stage tracks level');
  {
    const s = sb({});
    r.check('level 1 is stage 1', run(s, 'avatarStage(1)') === 1);
    r.check('level 20 is the final stage', run(s, 'avatarStage(20)') === 6);
    r.check('stages never regress', run(s, `(function(){
      var prev=0; for (var l=1; l<=30; l++){ var st=avatarStage(l); if (st<prev) return false; prev=st; }
      return true; })()`) === true);
    r.check('titles are defined across levels', run(s, `(function(){
      for (var l=1; l<=30; l++) if (!getLevelTitle(l)) return false; return true; })()`) === true);
  }

  // questsCompleted kept every date forever and rode the sync payload both ways
  // on every launch. Only today is ever read, but a lifetime total feeds an
  // achievement, so it cannot simply be truncated.
  r.section('quest history is bounded without losing the total');
  {
    const days = {};
    for (let i = 0; i < 120; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toLocaleDateString('en-CA')] = ['q_habit', 'q_workout'];
    }
    const s = sb({ hvi_gamification: JSON.stringify({ xp: 5000, questsCompleted: days }) });
    run(s, `gamification = JSON.parse(localStorage.getItem('hvi_gamification'));`);

    r.check('the total is seeded from existing history',
      run(s, '_ensureQuestTotal()') === 240, `(${run(s, '_ensureQuestTotal()')})`);

    run(s, '_trimQuestDays()');
    const kept = run(s, 'Object.keys(gamification.questsCompleted).length');
    r.check('old days are dropped', kept === 30, `(${kept})`);
    r.check('but the total survives', run(s, 'gamification.questsTotal') === 240,
      '(lifetime achievement progress wiped)');
    r.check('and today is still there',
      run(s, `!!gamification.questsCompleted[today()]`) === true,
      "(today's quest state lost — they would all reset)");

    // Seeding must happen once, not on every read.
    run(s, '_ensureQuestTotal(); _ensureQuestTotal();');
    r.check('re-reading does not recount', run(s, 'gamification.questsTotal') === 240,
      '(total drifts every time it is read)');

    // The helper being right is not the point; the achievement that consumes it
    // is. Summing the trimmed map instead of the banked total would silently
    // roll someone back from 240 quests to 60 and revoke what they had earned.
    const seen = run(s, `(function(){
      const src = String(checkAchievements);
      return /totalQuests\\s*=\\s*_ensureQuestTotal\\(\\)/.test(src);
    })()`);
    r.check('the achievement check reads the banked total', seen === true,
      '(counts only the days that survived trimming)');
  }

  r.section('a fresh account starts at zero and counts up');
  {
    const s = sb({ hvi_gamification: JSON.stringify({ xp: 0 }) });
    run(s, `gamification = JSON.parse(localStorage.getItem('hvi_gamification'));`);
    r.check('starts at zero', run(s, '_ensureQuestTotal()') === 0);
    run(s, `gamification.questsCompleted[today()] = ['q_a','q_b'];
            gamification.questsTotal = _ensureQuestTotal() + 2;`);
    r.check('counts what was completed', run(s, 'gamification.questsTotal') === 2);
    run(s, '_trimQuestDays()');
    r.check('nothing trimmed under the limit',
      run(s, 'Object.keys(gamification.questsCompleted).length') === 1);
  }

  r.section('the trimmed map is meaningfully smaller');
  {
    const days = {};
    for (let i = 0; i < 400; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toLocaleDateString('en-CA')] = ['q_habit', 'q_workout', 'q_journal'];
    }
    const s = sb({ hvi_gamification: JSON.stringify({ xp: 1, questsCompleted: days }) });
    run(s, `gamification = JSON.parse(localStorage.getItem('hvi_gamification'));`);
    const before = run(s, 'JSON.stringify(gamification.questsCompleted).length');
    run(s, '_ensureQuestTotal(); _trimQuestDays();');
    const after = run(s, 'JSON.stringify(gamification.questsCompleted).length');
    r.check('a year of history shrinks by over 90%', after < before * 0.1,
      `(${before} -> ${after} bytes)`);
  }

  // The radar drew the stat name and its number as two separate texts, with
  // the number always nudged ten pixels down. That offset is unconditional,
  // so at the two bottom points of the pentagon the number landed on the name
  // and rendered as "VI93". It was visible in a store screenshot.
  r.section('radar labels do not collide or run off the edge');
  {
    const s = sb({});
    const size = 210;
    const svg = run(s, `_buildRadarChart([
      { key:'STR', name:'Strength',   val: 71, color:'#ef4444' },
      { key:'WIS', name:'Wisdom',     val: 44, color:'#a78bfa' },
      { key:'DIS', name:'Discipline', val: 44, color:'#c4a96c' },
      { key:'VIT', name:'Vitality',   val: 93, color:'#4ade80' },
      { key:'SPI', name:'Spirit',     val: 58, color:'#f59e0b' },
    ], ${size})`) || '';

    const texts = svg.match(/<text[\s\S]*?<\/text>/g) || [];
    r.check('one label per stat, not two', texts.length === 5, `(${texts.length} text elements)`);

    // Each label carries its own number, so there is nothing to overlap with.
    const pairs = [['STR', 71], ['WIS', 44], ['DIS', 44], ['VIT', 93], ['SPI', 58]];
    const missing = pairs.filter(([k, v]) =>
      !texts.some(t => t.includes(k) && t.includes(String(v))));
    r.check('each label carries its value', missing.length === 0,
      `(${missing.map(p => p[0]).join(', ')})`);

    // Every label has to fit inside the viewBox or it is clipped.
    const coords = texts.map(t => [
      parseFloat((t.match(/x="([\d.]+)"/) || [])[1]),
      parseFloat((t.match(/y="([\d.]+)"/) || [])[1]),
    ]);
    const margin = 22;                      // half the width of the widest label
    const outside = coords.filter(([x, y]) =>
      x < margin || x > size - margin || y < 6 || y > size - 6);
    r.check('all labels sit inside the viewBox', outside.length === 0,
      `(${JSON.stringify(outside)} outside 0..${size})`);
  }

  return r.finish();
};
