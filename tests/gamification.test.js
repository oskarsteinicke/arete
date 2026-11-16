// XP, levels, achievements, quests and the daily score.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','profile.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store, extra) {
  const s = createSandbox({ files: FILES.concat(extra || []), store });
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

  // Taking XP back (an unticked habit, an undone meal) goes through awardXP
  // with a negative amount.
  r.section('XP taken back');
  {
    const s = sb({});
    run(s, "_shown = []; showXPToast = function (t) { _shown.push(t); }; awardXP(20,'body'); awardXP(-15,'body');");
    const g = JSON.parse(s.localStorage._d['hvi_gamification']);
    r.check('comes off the total and the pillar', g.xp === 5 && g.pillarXP.body === 5, `(${g.xp}, ${g.pillarXP.body})`);
    r.check('the toast says "-15 XP", not "+-15 XP"', run(s, '_shown[1]') === '-15 XP' && run(s, '_shown[0]') === '+20 XP');
    run(s, "awardXP(-50,'body');");
    const h = JSON.parse(s.localStorage._d['hvi_gamification']);
    r.check('and never goes below zero', h.xp === 0 && h.pillarXP.body === 0, `(${h.xp}, ${h.pillarXP.body})`);
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


  // Reaching a level was a sound and nothing on screen. It now gets a moment,
  // and only once: unticking and re-ticking a habit across the line must not
  // bring it back.
  r.section('reaching a level is shown, once');
  {
    const s = sb({});
    run(s, `gamification = { xp: 3595, level: 6, pillarXP: {} }; _q = []; queueLevelUp = function (a, b) { _q.push(levelUpFrom(a, b)); };`);
    run(s, `awardXP(10, 'body')`);                       // 3605 XP is level 7
    r.check('crossing into level 7 asks for the screen, counting from 6', run(s, 'JSON.stringify(_q)') === '[6]', run(s, 'JSON.stringify(_q)'));
    r.check('and the level is remembered as shown', JSON.parse(s.localStorage._d['hvi_gamification']).lvlSeen === 7);
    run(s, `awardXP(-10, 'body'); awardXP(10, 'body')`); // untick, tick again
    r.check('crossing the same line again does not', run(s, 'JSON.stringify(_q)') === '[6,0]', run(s, 'JSON.stringify(_q)'));
    run(s, `awardXP(10, 'body')`);
    r.check('a gain inside a level asks for nothing', run(s, '_q.length') === 2, `(${run(s, '_q.length')})`);

    run(s, `_made = []; var _ce = document.createElement; document.createElement = function (t) { var e = _ce.call(document, t); _made.push(e); return e; };
            document.querySelectorAll = function () { return []; };`);
    const made = code => { run(s, `_made = []; ${code}`); return run(s, `_made.length ? _made[0].innerHTML : ''`); };
    const plain = made('showLevelUp(6, 7)');
    r.check('an ordinary level says so and shows the new number', /Level up/.test(plain) && /id="lvl-num">7</.test(plain), '(wrong or missing)');
    r.check('with the title for that level', />Hoplite</.test(plain), '(no title)');
    r.check('and no old figure to replace', !/lvl-old/.test(plain));
    const evo = made('showLevelUp(7, 8)');
    r.check('a new stage is announced as an evolution', /Your character evolved/.test(evo), '(not announced)');
    r.check('the old figure hands over to the new one', /lvl-old[\s\S]*avatar-m-3\.png[\s\S]*lvl-new[\s\S]*avatar-m-4\.png/.test(evo), '(figures missing or out of order)');
    r.check('and the old title gives way to the new', /<s>Hoplite<\/s>Strategos/.test(evo), '(titles wrong)');
    r.check('no level gained, no screen', made('showLevelUp(8, 8)') === '');
  }

  // The character screen had a second set of stage names (Recruit, Initiate,
  // Warrior, Champion...) beside the level titles, so the two disagreed.
  r.section('the character screen uses the same names as the level');
  {
    const s = sb({});
    run(s, `gamification = { xp: 3700, level: 7, pillarXP: {} }; achievements = []; userName = function () { return 'Oskar'; };`);
    const html = run(s, `renderCharacter(); document.getElementById('view').innerHTML`) || '';
    r.check('the level and its title', /Lv\.7 Hoplite/.test(html), '(missing)');
    r.check('the next form is the next title', /Next form: Strategos at Lv\.8/.test(html), `(${(html.match(/char-stage">([^<]*)/) || [])[1]})`);
    r.check('none of the old second set remains', !/Recruit|Initiate|Champion|Philosopher\b/.test(html));
  }

  // A quest paid out the moment its condition was met, and that was final.
  // Undoing the meal, unticking the habit or deleting the set left the quest
  // and its XP behind. The draw is pinned so the result does not depend on
  // which quests today's date happens to pick.
  r.section('taking something back takes back the quest it finished');
  {
    const pin = ids => `getDailyQuests = function () { return QUEST_POOL.filter(function (q) { return ${JSON.stringify(ids)}.indexOf(q.id) > -1; }); };`;
    const quest = id => JSON.parse(run(sbQ, `JSON.stringify(QUEST_POOL.filter(function (q) { return q.id === '${id}'; }).map(function (q) { return q.xp; }))`))[0];
    const sbQ = sb({});
    const done = s => JSON.parse(run(s, `JSON.stringify((gamification.questsCompleted || {})[today()] || [])`));

    // Habits: three ticked finishes "Complete 3 or more habits".
    const H = () => sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }, { id: 'h3', name: 'C' }]),
      hvi_log: JSON.stringify({ h1: { streak: 0, completedToday: false }, h2: { streak: 0, completedToday: false }, h3: { streak: 0, completedToday: false } }),
    });
    const h = H();
    run(h, pin(['q_any_3']) + ` tapHabit('h1', ''); tapHabit('h2', ''); tapHabit('h3', '');`);
    const ticked = run(h, 'gamification.xp'), total = run(h, 'gamification.questsTotal');
    r.check('three ticks finish the quest', done(h).includes('q_any_3') && ticked === 30 + quest('q_any_3'), `(${ticked} XP)`);
    run(h, `tapHabit('h3', '')`);
    r.check('unticking one takes the quest back, XP and all', !done(h).includes('q_any_3') && run(h, 'gamification.xp') === 20, `(${run(h, 'gamification.xp')} XP)`);
    r.check('and the lifetime count with it', run(h, 'gamification.questsTotal') === total - 1);
    run(h, `tapHabit('h3', '')`);
    r.check('ticking it again finishes it again, for exactly the same total', done(h).includes('q_any_3') && run(h, 'gamification.xp') === ticked, `(${run(h, 'gamification.xp')} XP)`);
    run(h, `tapHabit('h3', ''); tapHabit('h3', ''); tapHabit('h3', ''); tapHabit('h3', '');`);
    r.check('back and forth collects nothing extra', run(h, 'gamification.xp') === ticked && run(h, 'gamification.questsTotal') === total);

    // Meals: "Stay within calorie goal" and "Log 3 or more meals".
    const M = () => { const s = sb({}); run(s, pin(['q_calories', 'q_3_meals']) + ` renderDiet = function () {}; confirm = function () { return true; };`); return s; };
    const food = kcal => JSON.stringify([{ name: 'Food', calories: kcal, protein: 20, carbs: 30, fat: 10 }]);
    const m = M();
    const id1 = run(m, `_commitMeal('Breakfast', ${food(500)}, 'test')`);
    r.check('a meal within the goal finishes the calorie quest', done(m).includes('q_calories'));
    run(m, `undoMeal(${JSON.stringify(id1)})`);
    r.check('undoing the meal takes it back', !done(m).includes('q_calories') && run(m, 'gamification.xp') === 0, `(${run(m, 'gamification.xp')} XP)`);

    const m2 = M();
    const a = run(m2, `_commitMeal('Breakfast', ${food(500)}, 'test')`);
    run(m2, `_commitMeal('Lunch', ${food(600)}, 'test')`);
    run(m2, `undoMeal(${JSON.stringify(a)})`);
    r.check('a quest that still holds is kept', done(m2).includes('q_calories'));
    run(m2, `_commitMeal('Dinner', ${food(500)}, 'test'); _commitMeal('Snack', ${food(200)}, 'test');`);
    r.check('three meals finish the meals quest', done(m2).includes('q_3_meals'));
    const before = run(m2, 'gamification.xp');
    run(m2, `deleteMeal(-1, (LS.get('hvi_meal_log', {})[today()].meals[0] || {}).id)`);
    r.check('deleting one of them takes that quest back', !done(m2).includes('q_3_meals') && run(m2, 'gamification.xp') === before - run(m2, 'MEAL_XP') - quest('q_3_meals'), `(${before} -> ${run(m2, 'gamification.xp')})`);
    run(m2, `_commitMeal('Second dinner', ${food(5000)}, 'test')`);
    r.check('going past the goal later never costs a quest already earned', done(m2).includes('q_calories'));

    // Training: "Log 3+ sets on any exercise".
    const W = (ids) => {
      const s = sb({ hvi_workout_log: JSON.stringify({ [T]: { exercises: [{ exerciseId: 'bench_press', sets: [0, 1, 2, 3].map(() => ({ weight: 60, reps: 8, completed: false })) }] } }) });
      run(s, pin(ids || ['q_3_sets']) + ` confirm = function () { return true; }; rerenderWorkoutActive = function () {}; startRestTimer = function () {}; prs = { bench_press: { weight: 200, reps: 10, date: '2026-01-01' } };`);
      run(s, `toggleSet(0, 0); toggleSet(0, 1); toggleSet(0, 2);`);
      return s;
    };
    const w = W();
    r.check('three sets finish the sets quest', done(w).includes('q_3_sets'));
    run(w, `toggleSet(0, 2)`);
    r.check('unticking a set takes it back', !done(w).includes('q_3_sets'));
    const w2 = W(); run(w2, `toggleSet(0, 3); removeSet(0); removeSet(0);`);
    r.check('removing logged sets takes it back', !done(w2).includes('q_3_sets'), JSON.stringify(done(w2)));
    const w3 = W(); run(w3, `removeExercise(0)`);
    r.check('removing the exercise takes it back', !done(w3).includes('q_3_sets'));
    // Removing the exercise undoes both training quests at once: each is paid back.
    const w4 = W(['q_workout', 'q_3_sets']);
    const xp4 = run(w4, 'gamification.xp'), n4 = run(w4, 'gamification.questsTotal');
    r.check('a session can finish two quests', done(w4).length === 2, JSON.stringify(done(w4)));
    run(w4, `removeExercise(0)`);
    r.check('and taking it away takes back both, XP and count', done(w4).length === 0 && run(w4, 'gamification.xp') === xp4 - quest('q_workout') - quest('q_3_sets') && run(w4, 'gamification.questsTotal') === n4 - 2, `(${xp4} -> ${run(w4, 'gamification.xp')}, ${n4} -> ${run(w4, 'gamification.questsTotal')})`);

    // Journal: an entry cleared back to nothing.
    const j = sb({}, ['social.js']);
    run(j, pin(['q_journal']) + ` renderLibrary = function () {}; journal = {}; _getJournalQs = function () { return [{ key: 'wins' }]; };
      document.getElementById('j-wins').value = 'Ran 5k'; saveJournal();`);
    r.check('writing in the journal finishes the journal quest', done(j).includes('q_journal'));
    run(j, `document.getElementById('j-wins').value = ''; saveJournal();`);
    r.check('clearing it again takes it back', !done(j).includes('q_journal'));

    // What it must never do.
    const g = sb({});
    run(g, `getDailyQuests = function () { return [{ id: 'q_boom', xp: 30, check: function () { throw new Error('bad data'); } }]; };
      gamification.xp = 100; gamification.questsTotal = 5; gamification.questsCompleted = { [today()]: ['q_boom', 'q_retired'] };`);
    r.check('a quest it cannot check, or no longer knows, keeps what it paid', run(g, 'takeBackLapsedQuests()') === 0 && run(g, 'gamification.xp') === 100 && done(g).length === 2);
    run(g, `getDailyQuests = function () { return [{ id: 'q_low', xp: 500, check: function () { return false; } }]; }; gamification.questsCompleted[today()] = ['q_low'];`);
    run(g, 'takeBackLapsedQuests()');
    r.check('XP never goes below zero', run(g, 'gamification.xp') === 0);
    r.check('a previous day is never touched', (() => { const s2 = sb({}); run(s2, `getDailyQuests = function () { return [{ id: 'q_old', xp: 50, check: function () { return false; } }]; };
      gamification.xp = 50; gamification.questsCompleted = { '2026-01-01': ['q_old'] }; takeBackLapsedQuests();`); return run(s2, 'gamification.xp') === 50; })());
  }

  return r.finish();
};
