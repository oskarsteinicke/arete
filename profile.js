// ══════════════════════════════════════════════════════════════════════════
// Northstar — Profile Module
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// GAMIFICATION
// ══════════════════════════════════════════════════════════════════════════

const ACHIEVEMENTS = [
  { id: 'first_habit',   icon: '⚡', name: 'First Step',       desc: 'Complete your first habit' },
  { id: 'streak_3',      icon: '🔥', name: 'On Fire',    desc: '3-day streak on any habit' },
  { id: 'streak_7',      icon: '🔥', name: 'Locked In',  desc: '7-day streak on any habit' },
  { id: 'streak_30',     icon: '💎', name: 'Iron Will',  desc: '30-day streak on any habit' },
  { id: 'perfect_day',   icon: '⭐', name: 'Full Send',        desc: 'Complete all habits in one day' },
  { id: 'perfect_3',     icon: '🌟', name: 'Consistent', desc: '3 perfect habit days' },
  { id: 'first_workout', icon: '💪', name: 'First Rep',  desc: 'Log your first workout' },
  { id: 'workouts_10',   icon: '🏋', name: 'Iron Regular', desc: 'Log 10 workouts' },
  { id: 'workouts_50',   icon: '🏆', name: 'Gym Rat',    desc: 'Log 50 workouts' },
  { id: 'first_pr',      icon: '🏆', name: 'Personal Best', desc: 'Set your first PR' },
  { id: 'pr_5',          icon: '💥', name: 'Getting Stronger', desc: 'Set 5 PRs' },
  { id: 'journal_7',     icon: '📖', name: 'Self Aware', desc: 'Journal for 7 days' },
  { id: 'nutrition_7',   icon: '🥗', name: 'Dialed In',  desc: 'Log meals 7 days' },
  { id: 'level_5',       icon: '⬆️', name: 'Leveling Up',     desc: 'Reach Level 5' },
  { id: 'level_10',      icon: '👑', name: 'Elite',           desc: 'Reach Level 10' },
  { id: 'all_pillars',   icon: '🏛', name: 'Five Pillars',    desc: 'Complete a habit in every pillar' },
  { id: 'streak_14',     icon: '🔥', name: 'Two Weeks',       desc: '14-day streak on any habit' },
  { id: 'streak_100',    icon: '💎', name: 'Unbreakable',     desc: '100-day streak on any habit' },
  { id: 'perfect_7',     icon: '🌟', name: 'Perfect Week',    desc: '7 perfect habit days in total' },
  { id: 'workouts_25',   icon: '💪', name: 'Regular',         desc: 'Log 25 workouts' },
  { id: 'first_quest',   icon: '⚡', name: 'On a Mission',    desc: 'Complete your first daily quest' },
  { id: 'quests_7',      icon: '🎯', name: 'Quest Master',    desc: 'Complete 7 daily quests total' },
  { id: 'pr_10',         icon: '💥', name: 'Record Breaker',  desc: 'Set 10 personal records' },
  { id: 'nutrition_30',  icon: '🥗', name: 'Dialled In',      desc: 'Log meals on 30 different days' },
  { id: 'sleep_7',       icon: '😴', name: 'Well Rested',      desc: 'Log sleep for 7 days' },
  { id: 'sleep_30',      icon: '💤', name: 'Sleep Master',     desc: 'Log sleep for 30 days' },
  { id: 'xp_1000',       icon: '⚡', name: 'XP Grinder',       desc: 'Earn 1,000 XP total' },
  { id: 'xp_5000',       icon: '💫', name: 'XP Legend',        desc: 'Earn 5,000 XP total' },
  { id: 'perfect_14',    icon: '🌟', name: 'Perfect Fortnight', desc: '14 perfect habit days total' },
  { id: 'workouts_100',  icon: '🏆', name: 'Century Club',     desc: 'Log 100 workouts' },
  { id: 'pr_25',         icon: '💥', name: 'PR Machine',       desc: 'Set 25 personal records' },
  { id: 'level_20',      icon: '👑', name: 'Northstar',        desc: 'Reach Level 20' },
  { id: 'streak_60',     icon: '🔥', name: 'Relentless',       desc: '60-day streak on any habit' },
];

// ── Level Titles ──────────────────────────────────────────────────────────
const LEVEL_TITLES = [
  { min: 1,  title: 'Seeker' },
  { min: 3,  title: 'Apprentice' },
  { min: 5,  title: 'Warrior' },
  { min: 8,  title: 'Champion' },
  { min: 12, title: 'Legend' },
  { min: 20, title: 'Northstar' },
];
function getLevelTitle(lvl) {
  let t = LEVEL_TITLES[0].title;
  for (const lt of LEVEL_TITLES) { if (lvl >= lt.min) t = lt.title; }
  return t;
}

// ── Daily Quests ───────────────────────────────────────────────────────────
const QUEST_POOL = [
  { id: 'q_all_habits',  icon: '✅', label: 'Complete all habits today',           xp: 60, check: () => habits.length > 0 && habits.every(h => log[h.id]?.completedToday) },
  { id: 'q_any_3',       icon: '⚡', label: 'Complete 3 or more habits',           xp: 30, check: () => habits.filter(h => log[h.id]?.completedToday).length >= 3 },
  { id: 'q_workout',     icon: '💪', label: 'Log a workout today',                 xp: 50, check: () => !!workoutLog[today()]?.exercises?.some(e => e.sets?.some(s => s.completed)) },
  { id: 'q_5_exercises', icon: '🏋', label: 'Complete 5+ exercises in a session',  xp: 60, check: () => (workoutLog[today()]?.exercises || []).filter(e => e.sets?.some(s => s.completed)).length >= 5 },
  { id: 'q_protein',     icon: '🥩', label: 'Hit your protein goal',               xp: 50, check: () => { const dm = getDayMacros(); return dietMeta.dailyGoals.protein > 0 && dm.p >= dietMeta.dailyGoals.protein; } },
  { id: 'q_calories',    icon: '🔥', label: 'Stay within calorie goal',            xp: 40, check: () => { const dm = getDayMacros(); const g = dietMeta.dailyGoals.calories; return g > 0 && dm.cal > 0 && dm.cal <= g * 1.05; } },
  { id: 'q_3_meals',     icon: '🍽', label: 'Log 3 or more meals today',           xp: 40, check: () => (mealLog[today()]?.meals || []).length >= 3 },
  { id: 'q_journal',     icon: '📖', label: 'Write in your journal today',         xp: 40, check: () => { const je = journal[today()] || {}; return Object.values(je).some(Boolean); } },
  { id: 'q_all_pillars', icon: '🏛', label: 'Complete a habit in every pillar',    xp: 75, check: () => PILLARS.every(p => pillarHabits(p.id).some(h => log[h.id]?.completedToday)) },
  { id: 'q_3_sets',      icon: '💥', label: 'Log 3+ sets on any exercise',         xp: 35, check: () => (workoutLog[today()]?.exercises || []).some(e => e.sets?.filter(s => s.completed).length >= 3) },
  { id: 'q_new_pr',      icon: '🏆', label: 'Set a personal record today',         xp: 80, check: () => Object.values(prs).some(p => p.date === today()) },
  { id: 'q_finish',      icon: '🏁', label: 'Finish a workout session',            xp: 45, check: () => workoutMeta.lastWorkoutDate === today() },
];

function getDailyQuests() {
  const t = today();
  let seed = t.split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) & 0x7FFFFFFF, 0);
  const pool = [...QUEST_POOL];
  const picked = [];
  while (picked.length < 3 && pool.length > 0) {
    seed = (seed * 1664525 + 1013904223) & 0x7FFFFFFF;
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function checkDailyQuests() {
  const t = today();
  if (!gamification.questsCompleted) gamification.questsCompleted = {};
  const done = new Set(gamification.questsCompleted[t] || []);
  const quests = getDailyQuests();
  let newlyDone = [];
  quests.forEach(q => {
    try {
      if (!done.has(q.id) && q.check()) {
        done.add(q.id);
        newlyDone.push(q);
      }
    } catch(e) {}
  });
  if (newlyDone.length) {
    gamification.questsCompleted[t] = [...done];
    newlyDone.forEach(q => {
      gamification.xp = (gamification.xp || 0) + q.xp;
    });
    LS.set('hvi_gamification', gamification);
    const first = newlyDone[0];
    showXPToast(`+${first.xp} XP · Quest done!`);
    checkAchievements();
    // Refresh quest UI if on home
    const qEl = document.getElementById('quest-section');
    if (qEl) {
      const _qd2 = new Set((gamification.questsCompleted || {})[today()] || []);
      qEl.innerHTML = getDailyQuests().map(q => {
        const qd = _qd2.has(q.id);
        return `<div class="hm-quest${qd?' hm-quest-done':''}">
          <div class="hm-quest-ico">${q.icon}</div>
          <div class="hm-quest-body"><div class="hm-quest-lbl">${q.label}</div><div class="hm-quest-xp">+${q.xp} XP</div></div>
          <div class="hm-quest-done-row"><div class="hm-quest-cb${qd?' hm-quest-cb-done':''}">${qd?'✓':''}</div></div>
        </div>`;
      }).join('');
    }
  }
}

function buildQuestHTML() {
  const t = today();
  const done = new Set((gamification.questsCompleted || {})[t] || []);
  const quests = getDailyQuests();
  return quests.map(q => {
    const isDone = done.has(q.id);
    return `<div class="g-quest${isDone ? ' g-quest-done' : ''}">
      <div class="g-quest-icon">${q.icon}</div>
      <div class="g-quest-label">${q.label}</div>
      <div class="g-quest-xp">${isDone ? '✓' : '+' + q.xp + ' XP'}</div>
    </div>`;
  }).join('');
}

function getWeekKey() {
  const d = new Date(), jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function getLevel(xp) { return Math.max(1, Math.floor(Math.sqrt((xp || 0) / 100)) + 1); }

function xpToNextLevel(xp) {
  const lvl = getLevel(xp);
  const curThreshold = (lvl - 1) * (lvl - 1) * 100;
  const nextThreshold = lvl * lvl * 100;
  const progress = xp - curThreshold;
  const needed = nextThreshold - curThreshold;
  return { lvl, progress, needed, pct: progress / needed };
}

function getPillarLevel(pid) {
  return Math.max(1, Math.floor(((gamification.pillarXP || {})[pid] || 0) / 100) + 1);
}

let _xpToastTimer = null;
function showXPToast(text) {
  let t = document.getElementById('xp-toast');
  if (!t) { t = document.createElement('div'); t.id = 'xp-toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.className = '';
  void t.offsetWidth;
  t.className = 'xp-toast-show';
  clearTimeout(_xpToastTimer);
  _xpToastTimer = setTimeout(() => { t.className = ''; }, 1500);
}

function showAchievementToast(ach) {
  let t = document.getElementById('ach-toast');
  if (!t) { t = document.createElement('div'); t.id = 'ach-toast'; document.body.appendChild(t); }
  t.innerHTML = `${ach.icon} <strong>${ach.name}</strong> unlocked!`;
  t.className = '';
  void t.offsetWidth;
  t.className = 'ach-toast-show';
  launchConfetti(0.3);
}

function awardXP(amount, pillarId) {
  const prevLvl = getLevel(gamification.xp || 0);
  gamification.xp = (gamification.xp || 0) + amount;
  if (pillarId) {
    if (!gamification.pillarXP) gamification.pillarXP = {};
    gamification.pillarXP[pillarId] = (gamification.pillarXP[pillarId] || 0) + amount;
  }
  LS.set('hvi_gamification', gamification);
  const newLvl = getLevel(gamification.xp || 0);
  if (newLvl > prevLvl && amount > 0) { playSound('levelup'); haptic([30, 20, 30, 20, 60]); }
  showXPToast('+' + amount + ' XP');
  checkAchievements();
}

function checkAchievements() {
  const unlocked = new Set(achievements);
  const maxStreak = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const totalWorkouts = Object.values(workoutLog).filter(wl => wl.exercises.some(e => e.sets.some(s => s.completed))).length;
  const totalPRs = Object.keys(prs).length;
  const totalJournalDays = Object.keys(journal).filter(d => Object.values(journal[d]).some(Boolean)).length;
  const allHabitsDone = habits.length > 0 && habits.every(h => log[h.id]?.completedToday);
  const allPillarsHit = PILLARS.every(p => pillarHabits(p.id).some(h => log[h.id]?.completedToday));
  const mealDays = Object.keys(mealLog).filter(d => (mealLog[d]?.meals || []).length > 0).length;
  const lvl = getLevel(gamification.xp || 0);

  const totalQuests = Object.values(gamification.questsCompleted || {}).reduce((s, arr) => s + arr.length, 0);
  const checks = {
    first_habit:   habits.some(h => log[h.id]?.completedToday || (log[h.id]?.streak || 0) > 0),
    streak_3:      maxStreak >= 3,
    streak_7:      maxStreak >= 7,
    streak_14:     maxStreak >= 14,
    streak_30:     maxStreak >= 30,
    streak_100:    maxStreak >= 100,
    perfect_day:   allHabitsDone || (meta.totalPerfectDays || 0) >= 1,
    perfect_3:     (meta.totalPerfectDays || 0) >= 3,
    perfect_7:     (meta.totalPerfectDays || 0) >= 7,
    first_workout: totalWorkouts >= 1,
    workouts_10:   totalWorkouts >= 10,
    workouts_25:   totalWorkouts >= 25,
    workouts_50:   totalWorkouts >= 50,
    first_pr:      totalPRs >= 1,
    pr_5:          totalPRs >= 5,
    pr_10:         totalPRs >= 10,
    journal_7:     totalJournalDays >= 7,
    nutrition_7:   mealDays >= 7,
    nutrition_30:  mealDays >= 30,
    level_5:       lvl >= 5,
    level_10:      lvl >= 10,
    all_pillars:   allPillarsHit,
    first_quest:   totalQuests >= 1,
    quests_7:      totalQuests >= 7,
    sleep_7:       Object.keys(sleepLog || {}).filter(d => sleepLog[d]?.hours > 0).length >= 7,
    sleep_30:      Object.keys(sleepLog || {}).filter(d => sleepLog[d]?.hours > 0).length >= 30,
    xp_1000:       (gamification.xp || 0) >= 1000,
    xp_5000:       (gamification.xp || 0) >= 5000,
    perfect_14:    (meta.totalPerfectDays || 0) >= 14,
    workouts_100:  totalWorkouts >= 100,
    pr_25:         totalPRs >= 25,
    level_20:      lvl >= 20,
    streak_60:     maxStreak >= 60,
  };

  ACHIEVEMENTS.forEach(ach => {
    if (!unlocked.has(ach.id) && checks[ach.id]) {
      achievements.push(ach.id);
      LS.set('hvi_achievements', achievements);
      showAchievementToast(ach);
    }
  });
}

function computeDailyScore() {
  const { done, total } = totalPct();
  const habitScore = total > 0 ? (done / total) * 40 : 0;
  const workoutScore = !!workoutLog[today()] ? 30 : 0;
  const je = journal[today()] || {};
  const journalScore = Object.values(je).some(Boolean) ? 15 : 0;
  const dm = getDayMacros();
  const calGoal = dietMeta.dailyGoals.calories;
  const nutritionScore = calGoal > 0 && dm.cal > 0 && Math.abs(dm.cal - calGoal) / calGoal <= 0.15 ? 15 : 0;
  return Math.round(habitScore + workoutScore + journalScore + nutritionScore);
}

function ensureWeeklyStats() {
  const wk = getWeekKey();
  if (!gamification.weeklyStats || gamification.weeklyStats.weekKey !== wk) {
    gamification.weeklyStats = { weekKey: wk, workoutDays: [], journalDays: [], proteinDays: [] };
    LS.set('hvi_gamification', gamification);
  }
}

function getWeeklyChallenges() {
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  return [
    { icon: '🏋', label: 'Complete 4 workouts', current: ws.workoutDays.length, goal: 4 },
    { icon: '🥩', label: 'Hit protein goal 5 days', current: ws.proteinDays.length, goal: 5 },
    { icon: '📖', label: 'Journal 5 days', current: ws.journalDays.length, goal: 5 },
  ];
}

function trackWeeklyWorkout() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.workoutDays.includes(t)) {
    gamification.weeklyStats.workoutDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function trackWeeklyJournal() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.journalDays.includes(t)) {
    gamification.weeklyStats.journalDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function trackWeeklyProtein() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.proteinDays.includes(t)) {
    gamification.weeklyStats.proteinDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function injectGamificationStyles() {
  if (document.getElementById('gamification-styles')) return;
  const s = document.createElement('style');
  s.id = 'gamification-styles';
  s.textContent = `
    @keyframes xpPop { 0%{opacity:0;transform:translateY(0) scale(.8)} 15%{opacity:1;transform:translateY(-10px) scale(1.1)} 80%{opacity:1;transform:translateY(-22px) scale(1)} 100%{opacity:0;transform:translateY(-32px)} }
    @keyframes achSlide { 0%{opacity:0;transform:translateX(120%)} 10%{opacity:1;transform:translateX(0)} 80%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(120%)} }
    #xp-toast{position:fixed;bottom:90px;right:20px;background:var(--accent);color:#fff;font-weight:700;font-size:13px;padding:6px 14px;border-radius:20px;opacity:0;pointer-events:none;z-index:999}
    #xp-toast.xp-toast-show{animation:xpPop 1.5s ease forwards}
    #ach-toast{position:fixed;top:20px;right:16px;left:16px;background:var(--surface2);border:1px solid var(--accent);color:var(--text);font-size:13px;padding:12px 16px;border-radius:12px;opacity:0;pointer-events:none;z-index:1000;text-align:center}
    #ach-toast.ach-toast-show{animation:achSlide 3s ease forwards}
    .g-score-ring{text-align:center;cursor:pointer;padding:4px 8px}
    .g-score-val{font-family:var(--serif);font-size:32px;font-weight:700;line-height:1}
    .g-score-lbl{font-size:10px;letter-spacing:.04em;color:var(--accent);font-weight:600;margin-top:2px}
    .g-xp-bar-track{height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;margin:6px 0 2px}
    .g-xp-bar-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .5s ease}
    .g-challenge{background:var(--surface2);border-radius:10px;padding:12px 16px;margin-bottom:8px}
    .g-challenge-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .g-challenge-label{font-size:13px;color:var(--text)}
    .g-challenge-ct{font-size:12px;font-weight:700;color:var(--accent-b)}
    .g-challenge-track{height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden}
    .g-challenge-fill{height:100%;background:var(--accent);border-radius:2px;transition:width .4s}
    .g-ach-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 24px 16px}
    .g-ach-card{background:var(--surface2);border-radius:10px;padding:12px 6px;text-align:center;border:1px solid transparent;transition:all .2s}
    .g-ach-card.unlocked{border-color:var(--accent)}
    .g-ach-card.locked{opacity:0.35}
    .g-ach-icon{font-size:22px;margin-bottom:4px}
    .g-ach-name{font-size:10px;font-weight:700;color:var(--text);line-height:1.2}
    .g-ach-desc{font-size:9px;color:var(--text-dim);margin-top:2px;line-height:1.3}
    .g-pillar-levels{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:0 24px 16px}
    .g-pl-card{background:var(--surface2);border-radius:8px;padding:10px 4px;text-align:center}
    .g-pl-card svg{width:18px;height:18px;display:block;margin:0 auto 4px;fill:none;stroke:var(--text-dim);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .g-pl-name{font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}
    .g-pl-lv{font-size:15px;font-weight:800;font-family:var(--serif);color:var(--accent-b)}
    .g-weekly{padding:0 24px 8px}
    .w-set-del{background:none;border:none;color:var(--text-dim);font-size:14px;padding:4px 6px;cursor:pointer;flex-shrink:0;opacity:0.4;margin-left:auto}
    .w-set-del:active{opacity:1;color:var(--fat)}
    .w-ex-tip{font-size:11.5px;padding:4px 16px 8px;line-height:1.4;border-radius:6px;margin:0 0 4px}
    .w-ex-tip-increase{color:var(--accent-b)}
    .w-ex-tip-maintain{color:var(--carb)}
    .w-ex-tip-first{color:var(--text-dim);font-style:italic}
    /* Calendar */
    .cal-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px}
    .cal-month-label{font-family:var(--serif);font-size:18px;color:var(--text);text-align:center;flex:1}
    .cal-nav-btn{background:none;border:none;color:var(--text);font-size:28px;padding:4px 10px;cursor:pointer;line-height:1;flex-shrink:0}
    .cal-nav-disabled{opacity:0.25;pointer-events:none}
    .cal-view-seg{display:flex;background:var(--surface2);border-radius:20px;padding:3px;gap:2px;margin:0 20px 10px}
    .cal-vbtn{flex:1;border:none;background:none;color:var(--text-dim);font-size:12px;padding:6px 4px;border-radius:16px;cursor:pointer;transition:all .2s;font-weight:600;letter-spacing:.02em}
    .cal-vbtn-active{background:var(--accent);color:#1a1208}
    .cal-legend{display:flex;flex-wrap:wrap;gap:10px;padding:0 20px 10px}
    .cal-leg{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim)}
    .cal-dow-row{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px}
    .cal-dow{text-align:center;font-size:10px;color:var(--text-dim);padding:4px 0;text-transform:uppercase;letter-spacing:.04em}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px;gap:2px}
    .cal-cell{min-height:54px;padding:5px 2px 3px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;transition:background .15s}
    .cal-cell:active{background:rgba(255,255,255,0.06)}
    .cal-empty{pointer-events:none}
    .cal-future{opacity:0.45}
    .cal-today .cal-num{color:var(--accent-b);font-weight:800}
    .cal-selected{background:var(--surface2)!important;outline:1px solid rgba(154,130,86,.3)}
    .cal-num{font-size:13px;color:var(--text);line-height:1.3}
    .cal-dots{display:flex;gap:2px;margin-top:4px;flex-wrap:wrap;justify-content:center;min-height:7px}
    .cal-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .cal-detail{border-top:1px solid var(--border2);margin:10px 0 0;padding:0 20px 80px}
    .cal-detail-hdr{font-size:13px;font-weight:700;color:var(--accent-b);padding:14px 0 8px;letter-spacing:.02em}
    .cal-di{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:var(--text)}
    .cal-di span{flex:1;line-height:1.4}
    .cal-di-sub{font-size:11px;color:var(--text-dim);padding:2px 0 4px 22px;line-height:1.4}
    .cal-di-empty{font-size:12px;color:var(--text-dim);font-style:italic;padding:16px 0}
    /* Weekly strips */
    .cal-week-cols{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px;gap:2px}
    .cal-wcol{padding:8px 2px 6px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;transition:background .15s}
    .cal-wcol:active{background:rgba(255,255,255,0.06)}
    .cal-wcol-sel{background:var(--surface2)!important;outline:1px solid rgba(154,130,86,.3)}
    .cal-wday{font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em}
    .cal-wnum{font-size:16px;color:var(--text);font-weight:600;line-height:1.2}
    .cal-wnum-today{color:var(--accent-b);font-weight:800}
    .cal-wfuture{opacity:0.45}
    /* Daily view */
    .cal-daily-wrap{padding:0 20px 80px}
    .cal-daily-sec{margin-bottom:4px}
    .cal-daily-sec-hdr{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);padding:16px 0 6px;display:flex;align-items:center;justify-content:space-between}
    /* Tasks */
    .cal-task-list{margin-bottom:4px}
    .cal-task-item{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
    .cal-task-cb{width:20px;height:20px;border-radius:50%;border:2px solid var(--accent);background:none;cursor:pointer;flex-shrink:0;padding:0;display:flex;align-items:center;justify-content:center;transition:all .2s;font-size:12px;color:transparent}
    .cal-task-cb-done{background:var(--accent);color:#1a1208}
    .cal-task-text{flex:1;font-size:13px;color:var(--text);line-height:1.4;background:none;border:none;outline:none;padding:0}
    .cal-task-text-done{text-decoration:line-through;color:var(--text-dim)}
    .cal-task-del{background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer;padding:0 2px;line-height:1;opacity:0.5}
    .cal-task-del:active{opacity:1;color:var(--fat)}
    .cal-task-add{display:flex;gap:8px;align-items:center;margin-top:8px}
    .cal-task-input{flex:1;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:9px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit}
    .cal-task-input:focus{border-color:var(--accent)}
    .cal-task-add-btn{background:var(--accent);border:none;color:#1a1208;border-radius:10px;width:36px;height:36px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700}
    /* Unit toggle */
    .unit-toggle{display:flex;background:var(--surface2);border-radius:8px;padding:2px;gap:2px}
    .unit-btn{background:none;border:none;color:var(--text-dim);font-size:13px;font-weight:600;padding:6px 16px;border-radius:6px;cursor:pointer;transition:all .2s}
    .unit-btn-active{background:var(--accent);color:#fff}
    .g-quests{padding:0 24px 16px}
    .g-quest{display:flex;align-items:center;gap:12px;background:var(--surface2);border-radius:10px;padding:12px 14px;margin-bottom:8px;border:1px solid transparent;transition:all .25s}
    .g-quest-done{border-color:var(--accent-b);opacity:0.7}
    .g-quest-icon{font-size:18px;flex-shrink:0}
    .g-quest-label{flex:1;font-size:13px;color:var(--text);line-height:1.3}
    .g-quest-done .g-quest-label{text-decoration:line-through;color:var(--text-dim)}
    .g-quest-xp{font-size:12px;font-weight:700;color:var(--accent-b);white-space:nowrap}
    .g-quest-done .g-quest-xp{color:var(--accent-b)}
    /* Avatar */
    .av-wrap{display:flex;flex-direction:column;align-items:center;padding:28px 24px 12px;text-align:center;position:relative}
    .av-orb{width:170px;height:170px;position:relative;flex-shrink:0}
    .av-stage-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-top:2px;opacity:0.8}
    .av-name{font-family:var(--serif);font-size:24px;color:var(--text);margin-top:10px;line-height:1.2}
    .av-level{font-size:13px;color:var(--text-dim);margin-top:3px;letter-spacing:.02em}
    .av-xp-outer{width:100%;max-width:200px;margin-top:12px}
    .av-xp-track{height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
    .av-xp-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .6s ease}
    .av-xp-lbl{font-size:10px;color:var(--text-dim);margin-top:4px;letter-spacing:.01em}
    .av-edit-btn{position:absolute;top:24px;right:20px;background:none;border:1px solid var(--border2);color:var(--text-dim);font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer}
  `;
  document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════════════════════════
// CONFETTI
// ══════════════════════════════════════════════════════════════════════════
function launchConfetti(originY = 0.35) {
  const existing = document.getElementById('confetti-canvas');
  if (existing) existing.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10000';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLORS = ['#9a8256','#b89d68','#6e9fd4','#6fd48e','#e4dace','#d46f6f'];
  const particles = Array.from({length: 90}, () => ({
    x: canvas.width * (0.3 + Math.random() * 0.4),
    y: canvas.height * originY,
    vx: (Math.random() - 0.5) * 12,
    vy: -(Math.random() * 10 + 4),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    w: Math.random() * 9 + 4,
    h: Math.random() * 5 + 3,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.25,
    life: 1,
  }));
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.vx *= 0.99; p.angle += p.spin; p.life -= 0.007;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive) requestAnimationFrame(draw); else canvas.remove();
  }
  requestAnimationFrame(draw);
}

// ══════════════════════════════════════════════════════════════════════════
// SWIPE-TO-COMPLETE
// ══════════════════════════════════════════════════════════════════════════
function initSwipeGestures() {
  document.querySelectorAll('.hi:not([data-swipe])').forEach(row => {
    row.dataset.swipe = '1';
    let sx = 0, sy = 0, isH = false;
    row.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; isH = false;
    }, { passive: true });
    row.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!isH && Math.abs(dy) > Math.abs(dx)) return;
      if (dx > 5) { isH = true; e.preventDefault(); }
      if (isH && dx > 0) {
        const capped = Math.min(dx, 110);
        row.style.transform = `translateX(${capped}px)`;
        row.style.background = `rgba(110,212,142,${Math.min(dx/100,1)*0.18})`;
      }
    }, { passive: false });
    row.addEventListener('touchend', () => {
      const tx = parseFloat((row.style.transform || '').replace('translateX(','')) || 0;
      row.style.transition = 'transform 0.25s ease,background 0.25s ease';
      row.style.transform = ''; row.style.background = '';
      setTimeout(() => { row.style.transition = ''; }, 260);
      if (tx >= 75 && isH) {
        const m = row.id.match(/^hi([^-]*)-(.+)$/);
        if (m) tapHabit(m[2], m[1]);
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: STATS
// ══════════════════════════════════════════════════════════════════════════
// ── Avatar builder ────────────────────────────────────────────────────────
function buildAvatarSVG(lvl) {
  const gender = (typeof tdeeProfile !== 'undefined' && tdeeProfile?.sex) || 'male';
  const stage = lvl >= 20 ? 6 : lvl >= 12 ? 5 : lvl >= 8 ? 4 : lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
  const uid = `av${stage}_${lvl}_${gender[0]}`;

  // Skin palette
  const sk = '#fbd5b5', skL = '#fce4cc', skS = '#e8a87c', skD = '#d49670';

  // Per-stage colours
  const C = [null,
    { hc:'#2d1b0e', hh:'#5c3a1e', hg:'#3d2814', ec:'#3d2412', em:'#5c3a1e', ep:'#150800', eg:null,     oc:'#374151', om:'#2d3748', oa:'#1f2937', ac:null,     ao:0,    pn:0  },
    { hc:'#7c3a0e', hh:'#c47a3a', hg:'#5c2a06', ec:'#92400e', em:'#c47a3a', ep:'#3d1500', eg:null,     oc:'#78350f', om:'#612d0c', oa:'#451a03', ac:'#b45309', ao:.09,  pn:0  },
    { hc:'#b84c00', hh:'#f97316', hg:'#8c3800', ec:'#d97706', em:'#fbbf24', ep:'#7c2d00', eg:'#fb923c', oc:'#7c2d12', om:'#621f0a', oa:'#450a00', ac:'#f97316', ao:.15,  pn:4  },
    { hc:'#b45309', hh:'#fde68a', hg:'#8a3f06', ec:'#fbbf24', em:'#fef3c7', ep:'#78350f', eg:'#fde68a', oc:'#991b1b', om:'#7f1d1d', oa:'#7c2d12', ac:'#fbbf24', ao:.20,  pn:8  },
    { hc:'#1e3a8a', hh:'#93c5fd', hg:'#142866', ec:'#60a5fa', em:'#bfdbfe', ep:'#1e3a8a', eg:'#bfdbfe', oc:'#1e3a8a', om:'#152468', oa:'#172554', ac:'#60a5fa', ao:.22,  pn:12 },
    { hc:'#d97706', hh:'#fef9c3', hg:'#a35b04', ec:'#e0f2fe', em:'#ffffff', ep:'#1e40af', eg:'#ffffff', oc:'#1e3a8a', om:'#152468', oa:'#d97706', ac:'#fbbf24', ao:.35,  pn:16 },
  ][stage];

  // ── GRADIENT DEFS ───────────────────────────────────────────────────────
  const defs = `
    <filter id="${uid}g" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${C.eg ? `<filter id="${uid}e" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="3.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>` : ''}
    <radialGradient id="${uid}sk" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${skL}"/>
      <stop offset="70%" stop-color="${sk}"/>
      <stop offset="100%" stop-color="${skS}"/>
    </radialGradient>
    <linearGradient id="${uid}hr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.hh}" stop-opacity="0.45"/>
      <stop offset="50%" stop-color="${C.hc}"/>
      <stop offset="100%" stop-color="${C.hg}"/>
    </linearGradient>
    <radialGradient id="${uid}ir" cx="50%" cy="30%" r="60%">
      <stop offset="0%" stop-color="${C.em}"/>
      <stop offset="50%" stop-color="${C.ec}"/>
      <stop offset="100%" stop-color="${C.ep}"/>
    </radialGradient>
    <linearGradient id="${uid}ot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.oc}"/>
      <stop offset="100%" stop-color="${C.om}"/>
    </linearGradient>
    <filter id="${uid}sh" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.8"/>
    </filter>`;

  // ── AURA ─────────────────────────────────────────────────────────────────
  const auraRx = 36 + stage * 5, auraRy = 24 + stage * 4;
  const aura = C.ac ? `<ellipse cx="50" cy="82" rx="${auraRx}" ry="${auraRy}" fill="${C.ac}" opacity="${C.ao}">
    <animate attributeName="ry" values="${auraRy};${auraRy+6};${auraRy}" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="${C.ao};${(C.ao*.45).toFixed(2)};${C.ao}" dur="3s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="50" cy="82" rx="${auraRx+8}" ry="${auraRy+6}" fill="none" stroke="${C.ac}" stroke-width="0.8" opacity="${(C.ao*.6).toFixed(2)}">
    <animate attributeName="opacity" values="${(C.ao*.6).toFixed(2)};0.02;${(C.ao*.6).toFixed(2)}" dur="2.5s" repeatCount="indefinite"/>
  </ellipse>` : '';

  // ── PARTICLES ────────────────────────────────────────────────────────────
  let parts = '';
  for (let i = 0; i < C.pn; i++) {
    const a = (i / C.pn) * Math.PI * 2;
    const r = 38 + (i % 3) * 9;
    const cx = (50 + Math.cos(a) * r).toFixed(1);
    const cy = (82 + Math.sin(a) * r * 0.55).toFixed(1);
    const sz = i % 5 === 0 ? 2.4 : 1.5;
    const dur = (1.4 + (i % 5) * 0.4).toFixed(1);
    parts += `<circle cx="${cx}" cy="${cy}" r="${sz}" fill="${C.ac}" opacity="0.55">
      <animate attributeName="opacity" values="0.55;0.1;0.55" dur="${dur}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="${sz};${(sz*1.6).toFixed(1)};${sz}" dur="${dur}s" repeatCount="indefinite"/>
    </circle>`;
  }

  // ── HAIR ─────────────────────────────────────────────────────────────────
  let hB = '', hF = '';
  const hFill = `url(#${uid}hr)`;  // gradient fill for hair

  if (gender === 'female') {
    if (stage === 1) {
      hB = `<path d="M 23 58 Q 21 22 50 19 Q 79 22 77 58 Q 69 32 50 30 Q 31 32 23 58 Z" fill="${hFill}"/>
        <path d="M 23 58 Q 18 72 19 86 Q 24 89 26 76 Q 24 66 23 58 Z" fill="${hFill}"/>
        <path d="M 77 58 Q 82 72 81 86 Q 76 89 74 76 Q 76 66 77 58 Z" fill="${hFill}"/>
        <path d="M 30 30 Q 38 22 50 22 Q 54 25 46 32 Q 38 28 30 30 Z" fill="${C.hh}" opacity="0.4"/>`;
      hF = `<path d="M 26 47 Q 32 28 50 28 Q 68 28 74 47 Q 64 38 50 37 Q 36 38 26 47 Z" fill="${hFill}"/>
        <path d="M 32 42 Q 38 30 50 30 Q 56 34 52 42 Q 50 38 48 42 Q 44 34 32 42 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 35 36 Q 45 28 55 34" stroke="${C.hh}" stroke-width="1.2" fill="none" opacity="0.45" stroke-linecap="round"/>`;

    } else if (stage === 2) {
      hB = `<path d="M 22 58 Q 21 20 50 17 Q 79 20 78 56 Q 70 30 50 28 Q 30 30 22 58 Z" fill="${hFill}"/>
        <path d="M 47 19 Q 44 5 50 3 Q 56 5 53 19 Z" fill="${C.hc}"/>
        <path d="M 22 58 Q 17 72 14 96 Q 18 100 23 86 Q 24 72 22 58 Z" fill="${hFill}"/>
        <path d="M 78 56 Q 83 68 90 90 Q 87 95 83 80 Q 80 68 78 56 Z" fill="${hFill}"/>
        <path d="M 68 78 Q 78 72 90 90 Q 80 96 72 88 Q 66 84 68 78 Z" fill="${C.hc}"/>
        <path d="M 28 28 Q 40 20 52 22" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.4" stroke-linecap="round"/>`;
      hF = `<path d="M 28 44 Q 34 26 50 27 Q 66 26 72 44 Q 62 36 50 35 Q 38 36 28 44 Z" fill="${hFill}"/>
        <path d="M 34 40 Q 40 28 53 30 Q 58 36 52 43 Q 50 38 46 43 Q 42 36 34 40 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 36 34 Q 46 26 56 32" stroke="${C.hh}" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"/>`;

    } else if (stage === 3) {
      hB = `<path d="M 22 56 Q 21 22 50 19 Q 79 22 78 56 Q 70 31 50 29 Q 30 31 22 56 Z" fill="${hFill}"/>
        <path d="M 50 24 L 47 12 L 53 12 Z" fill="${C.hc}"/>
        <path d="M 22 55 Q 9 65 7 88 Q 11 93 18 80 Q 20 66 22 55 Z" fill="${hFill}"/>
        <path d="M 22 55 Q 11 62 8 78 Q 12 82 18 70 Z" fill="${C.hh}" opacity="0.45"/>
        <path d="M 78 55 Q 91 65 93 88 Q 89 93 82 80 Q 80 66 78 55 Z" fill="${hFill}"/>
        <path d="M 78 55 Q 89 62 92 78 Q 88 82 82 70 Z" fill="${C.hh}" opacity="0.45"/>
        <path d="M 12 72 Q 16 64 20 68" stroke="${C.hh}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M 88 72 Q 84 64 80 68" stroke="${C.hh}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>`;
      hF = `<path d="M 28 44 Q 34 24 50 25 Q 66 24 72 44 Q 62 34 50 33 Q 38 34 28 44 Z" fill="${hFill}"/>
        <path d="M 34 38 Q 42 26 56 29 Q 60 36 54 43 Q 52 37 48 43 Q 44 36 34 38 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 36 32 Q 46 24 56 30" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.55" stroke-linecap="round"/>`;

    } else if (stage === 4) {
      hB = `<path d="M 21 56 Q 20 20 50 17 Q 80 20 79 56 Q 71 29 50 27 Q 29 29 21 56 Z" fill="${hFill}"/>
        <path d="M 47 19 Q 44 7 50 5 Q 56 7 53 19 Z" fill="${C.hc}"/>
        <path d="M 21 56 Q 6 70 4 100 Q 8 106 16 92 Q 18 74 21 56 Z" fill="${hFill}"/>
        <path d="M 21 56 Q 8 68 6 90 Q 10 93 16 80 Z" fill="${C.hh}" opacity="0.4"/>
        <path d="M 79 56 Q 94 70 96 100 Q 92 106 84 92 Q 82 74 79 56 Z" fill="${hFill}"/>
        <path d="M 79 56 Q 92 68 94 90 Q 90 93 84 80 Z" fill="${C.hh}" opacity="0.4"/>
        <ellipse cx="21" cy="54" rx="6" ry="4" fill="${C.hh}" opacity="0.85" transform="rotate(-20 21 54)"/>
        <ellipse cx="79" cy="54" rx="6" ry="4" fill="${C.hh}" opacity="0.85" transform="rotate(20 79 54)"/>
        <path d="M 8 78 Q 12 68 16 74" stroke="${C.hh}" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M 92 78 Q 88 68 84 74" stroke="${C.hh}" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"/>`;
      hF = `<path d="M 27 43 Q 34 22 50 23 Q 66 22 73 43 Q 63 32 50 31 Q 37 32 27 43 Z" fill="${hFill}"/>
        <path d="M 33 37 Q 42 23 56 27 Q 61 35 55 42 Q 52 36 48 42 Q 43 35 33 37 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 35 30 Q 48 20 60 28" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round"/>`;

    } else if (stage === 5) {
      hB = `<path d="M 21 56 Q 19 22 50 18 Q 81 22 79 56 Q 71 28 50 26 Q 29 28 21 56 Z" fill="${hFill}"/>
        <path d="M 47 20 Q 44 6 50 4 Q 56 6 53 20 Z" fill="${C.hc}"/>
        <path d="M 21 56 Q 8 80 5 116 Q 9 122 17 106 Q 19 82 21 56 Z" fill="${hFill}"/>
        <path d="M 21 56 Q 10 76 8 106 Q 12 108 18 94 Z" fill="${C.hh}" opacity="0.5"/>
        <path d="M 79 56 Q 92 80 95 116 Q 91 122 83 106 Q 81 82 79 56 Z" fill="${hFill}"/>
        <path d="M 79 56 Q 90 76 92 106 Q 88 108 82 94 Z" fill="${C.hh}" opacity="0.5"/>
        <path d="M 12 86 Q 16 74 20 80" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M 88 86 Q 84 74 80 80" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round"/>`;
      hF = `<path d="M 27 43 Q 33 22 50 22 Q 67 22 73 43 Q 63 31 50 30 Q 37 31 27 43 Z" fill="${hFill}"/>
        <path d="M 33 36 Q 42 22 56 26 Q 61 34 55 41 Q 52 35 48 41 Q 43 34 33 36 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 35 28 Q 48 18 60 26" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>`;
      if (C.eg) hF += `<ellipse cx="50" cy="40" rx="28" ry="10" fill="${C.eg}" opacity="0.07" filter="url(#${uid}e)"/>`;

    } else {
      hB = `<path d="M 50 -6 L 38 26 L 62 26 Z" fill="${C.hh}"/>
        <path d="M 50 -6 L 38 26 L 62 26 Z" fill="${C.eg}" opacity="0.45" filter="url(#${uid}e)">
          <animate attributeName="opacity" values="0.45;0.75;0.45" dur="1.6s" repeatCount="indefinite"/>
        </path>
        <path d="M 20 56 Q 18 30 50 22 Q 82 30 80 56 Z" fill="${hFill}"/>
        <path d="M 20 56 Q 5 82 3 118 Q 7 124 15 108 Q 17 84 20 56 Z" fill="${hFill}"/>
        <path d="M 20 56 Q 7 80 5 112 Q 9 114 15 100 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 5 112 Q 8 126 14 120 Q 10 116 5 112 Z" fill="${C.hh}" opacity="0.4"/>
        <path d="M 80 56 Q 95 82 97 118 Q 93 124 85 108 Q 83 84 80 56 Z" fill="${hFill}"/>
        <path d="M 80 56 Q 93 80 95 112 Q 91 114 85 100 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 95 112 Q 92 126 86 120 Q 90 116 95 112 Z" fill="${C.hh}" opacity="0.4"/>
        <path d="M 10 92 Q 14 82 18 88" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M 90 92 Q 86 82 82 88" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round"/>`;
      hF = `<path d="M 27 43 Q 33 20 50 21 Q 67 20 73 43 Q 63 30 50 29 Q 37 30 27 43 Z" fill="${hFill}"/>
        <path d="M 33 35 Q 42 20 56 25 Q 61 33 55 40 Q 52 34 48 40 Q 43 33 33 35 Z" fill="${C.hh}" opacity="0.7"/>
        <path d="M 33 35 Q 42 20 56 25 Q 61 33 55 40 Q 52 34 48 40 Q 43 33 33 35 Z" fill="${C.eg}" opacity="0.45" filter="url(#${uid}e)"/>
        <path d="M 36 26 Q 48 16 58 24" stroke="${C.hh}" stroke-width="1.8" fill="none" opacity="0.6" stroke-linecap="round"/>`;
    }

  } else {
    // ── MALE HAIR ──────────────────────────────────────────────────────────
    if (stage === 1) {
      hB = `<path d="M 23 58 Q 22 22 50 19 Q 78 22 77 58 Q 69 34 50 32 Q 31 34 23 58 Z" fill="${hFill}"/>
        <ellipse cx="23" cy="62" rx="4.5" ry="6.5" fill="${C.hc}"/>
        <ellipse cx="77" cy="62" rx="4.5" ry="6.5" fill="${C.hc}"/>
        <path d="M 35 28 Q 45 20 55 26" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.4" stroke-linecap="round"/>`;
      hF = `<path d="M 30 45 Q 33 30 44 35 Q 41 47 35 49 Z" fill="${hFill}"/>
        <path d="M 70 45 Q 67 30 56 35 Q 59 47 65 49 Z" fill="${hFill}"/>
        <path d="M 40 31 Q 50 25 60 31 Q 55 37 50 34 Q 45 37 40 31 Z" fill="${C.hc}"/>
        <path d="M 42 30 Q 50 26 58 30" stroke="${C.hh}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>`;

    } else if (stage === 2) {
      hB = `<path d="M 22 58 Q 21 20 50 17 Q 79 20 78 58 Q 70 32 50 29 Q 30 32 22 58 Z" fill="${hFill}"/>
        <path d="M 46 19 Q 43 3 50 1 Q 57 3 54 19 Z" fill="${C.hc}"/>
        <path d="M 22 58 Q 17 70 19 82 Q 23 84 25 72 Q 24 65 22 58 Z" fill="${hFill}"/>
        <ellipse cx="78" cy="63" rx="4.5" ry="6" fill="${C.hc}"/>
        <path d="M 32 26 Q 44 18 54 24" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.4" stroke-linecap="round"/>`;
      hF = `<path d="M 28 46 Q 31 27 44 33 Q 41 49 33 51 Z" fill="${C.hh}" opacity="0.9"/>
        <path d="M 72 46 Q 69 30 58 34 Q 61 48 67 50 Z" fill="${hFill}"/>
        <path d="M 40 29 Q 50 22 60 29 Q 55 36 50 31 Q 45 36 40 29 Z" fill="${C.hc}"/>
        <path d="M 42 28 Q 50 22 58 28" stroke="${C.hh}" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"/>`;

    } else if (stage === 3) {
      hB = `<path d="M 50 7 L 42 32 L 58 32 Z" fill="${hFill}"/>
        <path d="M 36 11 L 29 36 L 48 36 Z" fill="${hFill}"/>
        <path d="M 64 11 L 71 36 L 52 36 Z" fill="${hFill}"/>
        <path d="M 22 28 L 17 52 L 34 47 Z" fill="${C.hc}"/>
        <path d="M 78 28 L 83 52 L 66 47 Z" fill="${C.hc}"/>
        <path d="M 22 58 Q 22 38 38 35 Q 50 31 62 35 Q 78 38 78 58 Z" fill="${hFill}"/>
        <path d="M 22 58 Q 16 71 18 83 Q 22 85 24 73 Q 23 65 22 58 Z" fill="${C.hc}"/>
        <path d="M 78 58 Q 84 71 82 83 Q 78 85 76 73 Q 77 65 78 58 Z" fill="${C.hc}"/>
        <path d="M 46 14 L 50 7 L 54 14" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>`;
      hF = `<path d="M 29 46 Q 32 28 44 34 Q 40 50 33 52 Z" fill="${C.hh}" opacity="0.85"/>
        <path d="M 71 46 Q 68 28 56 34 Q 60 50 67 52 Z" fill="${C.hh}" opacity="0.85"/>
        <path d="M 40 32 Q 50 24 60 32 Q 55 39 50 35 Q 45 39 40 32 Z" fill="${C.hh}" opacity="0.9"/>
        <path d="M 42 30 Q 50 24 58 30" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.6" stroke-linecap="round"/>`;

    } else if (stage === 4) {
      hB = `<path d="M 50 3 L 40 30 L 60 30 Z" fill="${hFill}"/>
        <path d="M 34 7 L 25 34 L 48 33 Z" fill="${hFill}"/>
        <path d="M 66 7 L 75 34 L 52 33 Z" fill="${hFill}"/>
        <path d="M 18 21 L 11 50 L 32 45 Z" fill="${C.hc}"/>
        <path d="M 82 21 L 89 50 L 68 45 Z" fill="${C.hc}"/>
        <path d="M 7 34 L 2 62 L 22 56 Z" fill="${C.hc}"/>
        <path d="M 93 34 L 98 62 L 78 56 Z" fill="${C.hc}"/>
        <path d="M 20 58 Q 20 36 40 31 Q 50 27 60 31 Q 80 36 80 58 Z" fill="${hFill}"/>
        <path d="M 20 58 Q 12 74 14 88 Q 18 90 22 78 Q 21 68 20 58 Z" fill="${C.hc}"/>
        <path d="M 80 58 Q 88 74 86 88 Q 82 90 78 78 Q 79 68 80 58 Z" fill="${C.hc}"/>
        <path d="M 44 10 L 50 3 L 56 10" stroke="${C.hh}" stroke-width="1.8" fill="none" opacity="0.6" stroke-linecap="round"/>
        <path d="M 29 14 L 34 7 L 39 14" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M 61 14 L 66 7 L 71 14" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round"/>`;
      hF = `<path d="M 44 28 Q 50 17 56 28 Q 52 35 50 30 Q 48 35 44 28 Z" fill="${C.hh}" opacity="0.9"/>
        <path d="M 26 47 Q 28 25 43 32 Q 38 52 30 54 Z" fill="${C.hh}" opacity="0.85"/>
        <path d="M 74 47 Q 72 25 57 32 Q 62 52 70 54 Z" fill="${C.hh}" opacity="0.85"/>
        <path d="M 30 38 Q 40 26 50 30" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>`;

    } else if (stage === 5) {
      hB = `<path d="M 22 58 Q 20 26 38 21 Q 50 17 62 21 Q 80 26 78 58 Z" fill="${hFill}"/>
        <path d="M 47 19 Q 44 5 50 3 Q 56 5 53 19 Z" fill="${C.hc}"/>
        <path d="M 22 58 Q 13 78 11 106 Q 15 110 19 96 Q 21 82 22 68 Q 22 63 22 58 Z" fill="${hFill}"/>
        <path d="M 78 58 Q 87 78 89 106 Q 85 110 81 96 Q 79 82 78 68 Q 78 63 78 58 Z" fill="${hFill}"/>
        <path d="M 18 72 Q 20 64 22 68" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M 82 72 Q 80 64 78 68" stroke="${C.hh}" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round"/>`;
      hF = `<path d="M 28 46 Q 30 25 45 32 Q 40 51 32 53 Z" fill="${C.hh}" opacity="0.85"/>
        <path d="M 72 46 Q 70 25 55 32 Q 60 51 68 53 Z" fill="${C.hh}" opacity="0.85"/>
        <path d="M 40 29 Q 50 21 60 29 Q 55 36 50 32 Q 45 36 40 29 Z" fill="${C.hh}" opacity="0.9"/>
        <path d="M 34 36 Q 46 24 58 32" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>`;
      if (C.eg) hF += `<ellipse cx="50" cy="40" rx="28" ry="10" fill="${C.eg}" opacity="0.07" filter="url(#${uid}e)"/>`;

    } else {
      hB = `<path d="M 50 -6 L 38 26 L 62 26 Z" fill="${C.hh}"/>
        <path d="M 32 -2 L 21 28 L 50 26 Z" fill="${C.hh}" opacity="0.9"/>
        <path d="M 68 -2 L 79 28 L 50 26 Z" fill="${C.hh}" opacity="0.9"/>
        <path d="M 14 14 L 5 46 L 32 41 Z" fill="${hFill}"/>
        <path d="M 86 14 L 95 46 L 68 41 Z" fill="${hFill}"/>
        <path d="M 4 30 L -3 60 L 20 55 Z" fill="${C.hc}"/>
        <path d="M 96 30 L 103 60 L 80 55 Z" fill="${C.hc}"/>
        <path d="M 18 58 Q 18 33 40 26 Q 50 22 60 26 Q 82 33 82 58 Z" fill="${hFill}"/>
        <path d="M 18 58 Q 9 78 7 106 Q 11 110 15 96 Q 17 82 18 68 Z" fill="${C.hc}"/>
        <path d="M 82 58 Q 91 78 93 106 Q 89 110 85 96 Q 83 82 82 68 Z" fill="${C.hc}"/>`;
      hB += `<path d="M 50 -6 L 38 26 L 62 26 Z" fill="${C.eg}" opacity="0.55" filter="url(#${uid}e)">
        <animate attributeName="opacity" values="0.55;0.85;0.55" dur="1.6s" repeatCount="indefinite"/>
      </path>
      <path d="M 32 -2 L 21 28 L 50 26 Z" fill="${C.eg}" opacity="0.35" filter="url(#${uid}e)"/>
      <path d="M 68 -2 L 79 28 L 50 26 Z" fill="${C.eg}" opacity="0.35" filter="url(#${uid}e)"/>`;
      hF = `<path d="M 40 24 Q 50 11 60 24 Q 54 31 50 27 Q 46 31 40 24 Z" fill="${C.hh}" opacity="0.95"/>
        <path d="M 40 24 Q 50 11 60 24 Q 54 31 50 27 Q 46 31 40 24 Z" fill="${C.eg}" opacity="0.55" filter="url(#${uid}e)"/>
        <path d="M 44 18 Q 50 11 56 18" stroke="${C.hh}" stroke-width="1.8" fill="none" opacity="0.65" stroke-linecap="round"/>`;
    }
  }

  // ── EYE GLOW ─────────────────────────────────────────────────────────────
  const eyeGlow = C.eg ? `
    <ellipse cx="39" cy="55" rx="10" ry="9" fill="${C.eg}" opacity="0.25" filter="url(#${uid}e)"/>
    <ellipse cx="61" cy="55" rx="10" ry="9" fill="${C.eg}" opacity="0.25" filter="url(#${uid}e)"/>` : '';

  // ── BODY ─────────────────────────────────────────────────────────────────
  const neckShadow = `<ellipse cx="50" cy="84" rx="12" ry="4" fill="${skD}" opacity="0.35" filter="url(#${uid}sh)"/>`;
  const neck = `<path d="M 44 82 L 44 91 Q 50 93 56 91 L 56 82 Z" fill="url(#${uid}sk)"/>`;
  const torso = `<path d="M 19 95 Q 14 102 13 130 L 87 130 Q 86 102 81 95 Q 65 85 50 85 Q 35 85 19 95 Z" fill="url(#${uid}ot)"/>`;

  // Collar / shoulder highlights
  const shoulderHL = `<path d="M 22 96 Q 35 88 50 87 Q 65 88 78 96" stroke="${C.oc}" stroke-width="1.5" fill="none" opacity="0.3" stroke-linecap="round"/>`;

  let outfitDetail = '';
  if (gender === 'female') {
    if (stage <= 2) {
      outfitDetail = `<path d="M 40 91 Q 50 100 60 91 Q 56 96 50 94 Q 44 96 40 91 Z" fill="${C.oa}"/>
        <path d="M 46 89 Q 50 86 54 89 Q 52 92 50 90 Q 48 92 46 89 Z" fill="${C.hh}" opacity="0.5"/>`;
    } else if (stage === 3) {
      outfitDetail = `<path d="M 38 91 Q 50 102 62 91" stroke="${C.oa}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M 46 89 Q 50 86 54 89 Q 52 93 50 91 Q 48 93 46 89 Z" fill="${C.hh}" opacity="0.65"/>
        <line x1="50" y1="91" x2="50" y2="114" stroke="${C.oa}" stroke-width="1.5" opacity="0.55"/>`;
    } else {
      outfitDetail = `<path d="M 27 100 Q 50 105 73 100 Q 71 113 50 116 Q 29 113 27 100 Z" fill="${C.oa}" opacity="0.88"/>
        <path d="M 44 91 Q 50 97 56 91 Q 54 97 50 95 Q 46 97 44 91 Z" fill="${C.oa}"/>
        <path d="M 46 89 Q 50 86 54 89 Q 52 92 50 90 Q 48 92 46 89 Z" fill="${C.hh}" opacity="0.5"/>`;
      if (stage >= 5) outfitDetail += `<ellipse cx="21" cy="97" rx="10" ry="6.5" fill="${C.oa}" transform="rotate(-18 21 97)"/>
        <ellipse cx="79" cy="97" rx="10" ry="6.5" fill="${C.oa}" transform="rotate(18 79 97)"/>`;
      if (stage === 6) outfitDetail += `<path d="M 27 100 Q 50 105 73 100" stroke="#fbbf24" stroke-width="1.3" fill="none"/>
        <ellipse cx="21" cy="97" rx="10" ry="6.5" fill="none" stroke="#fbbf24" stroke-width="1" transform="rotate(-18 21 97)"/>
        <ellipse cx="79" cy="97" rx="10" ry="6.5" fill="none" stroke="#fbbf24" stroke-width="1" transform="rotate(18 79 97)"/>`;
    }
  } else {
    if (stage <= 2) {
      outfitDetail = `<path d="M 40 91 Q 50 100 60 91 Q 56 95 50 93 Q 44 95 40 91 Z" fill="${C.oa}"/>`;
    } else if (stage === 3) {
      outfitDetail = `<path d="M 38 91 Q 50 102 62 91" stroke="${C.oa}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <line x1="50" y1="91" x2="50" y2="114" stroke="${C.oa}" stroke-width="1.5" opacity="0.55"/>
        <line x1="32" y1="100" x2="68" y2="100" stroke="${C.oa}" stroke-width="1" opacity="0.4"/>`;
    } else {
      outfitDetail = `<path d="M 27 100 Q 50 105 73 100 Q 71 113 50 116 Q 29 113 27 100 Z" fill="${C.oa}" opacity="0.88"/>
        <path d="M 44 91 Q 50 97 56 91 Q 54 97 50 95 Q 46 97 44 91 Z" fill="${C.oa}"/>`;
      if (stage >= 5) outfitDetail += `<ellipse cx="21" cy="97" rx="10" ry="6.5" fill="${C.oa}" transform="rotate(-18 21 97)"/>
        <ellipse cx="79" cy="97" rx="10" ry="6.5" fill="${C.oa}" transform="rotate(18 79 97)"/>`;
      if (stage === 6) outfitDetail += `<path d="M 27 100 Q 50 105 73 100" stroke="#fbbf24" stroke-width="1.3" fill="none"/>
        <ellipse cx="21" cy="97" rx="10" ry="6.5" fill="none" stroke="#fbbf24" stroke-width="1" transform="rotate(-18 21 97)"/>
        <ellipse cx="79" cy="97" rx="10" ry="6.5" fill="none" stroke="#fbbf24" stroke-width="1" transform="rotate(18 79 97)"/>`;
    }
  }

  // ── FACE ─────────────────────────────────────────────────────────────────
  const eyeRx = gender === 'female' ? 9 : 8.5;
  const eyeRy = gender === 'female' ? 8.5 : 8;
  const irisR = gender === 'female' ? 7 : 6.5;

  // Anime lashes (female gets outer lash flicks)
  const lashes = gender === 'female' ? `
    <path d="M 29.5 52 Q 32 48 35 50" stroke="#1a1008" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M 43 49.5 Q 46 47 48.5 48.5" stroke="#1a1008" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M 51.5 48.5 Q 54 47 57 49.5" stroke="#1a1008" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M 65 50 Q 68 48 70.5 52" stroke="#1a1008" stroke-width="1.5" fill="none" stroke-linecap="round"/>` : '';

  const browW = gender === 'female' ? 1.7 : 2.2;

  const face = `
    <!-- Face base with gradient -->
    <circle cx="50" cy="58" r="27" fill="url(#${uid}sk)"/>
    <!-- Chin highlight -->
    <ellipse cx="50" cy="76" rx="10" ry="4" fill="${skL}" opacity="0.15"/>
    <!-- Ears -->
    <ellipse cx="23" cy="60" rx="4" ry="5.5" fill="url(#${uid}sk)"/>
    <ellipse cx="77" cy="60" rx="4" ry="5.5" fill="url(#${uid}sk)"/>
    <ellipse cx="23" cy="61" rx="2.5" ry="3.2" fill="${skS}" opacity="0.6"/>
    <ellipse cx="77" cy="61" rx="2.5" ry="3.2" fill="${skS}" opacity="0.6"/>
    <!-- Eye glow (higher stages) -->
    ${eyeGlow}
    <!-- Eye whites -->
    <ellipse cx="39" cy="56" rx="${eyeRx}" ry="${eyeRy}" fill="white"/>
    <ellipse cx="61" cy="56" rx="${eyeRx}" ry="${eyeRy}" fill="white"/>
    <!-- Upper eyelid shadow -->
    <ellipse cx="39" cy="52" rx="${eyeRx-1}" ry="3" fill="#00000008"/>
    <ellipse cx="61" cy="52" rx="${eyeRx-1}" ry="3" fill="#00000008"/>
    <!-- Iris (gradient) -->
    <ellipse cx="39" cy="57" rx="${irisR}" ry="${irisR}" fill="url(#${uid}ir)"/>
    <ellipse cx="61" cy="57" rx="${irisR}" ry="${irisR}" fill="url(#${uid}ir)"/>
    <!-- Pupil -->
    <circle cx="39" cy="58" r="3.2" fill="${C.ep}"/>
    <circle cx="61" cy="58" r="3.2" fill="${C.ep}"/>
    <!-- Bottom iris reflection -->
    <ellipse cx="39" cy="61" rx="4" ry="2" fill="${C.em}" opacity="0.18"/>
    <ellipse cx="61" cy="61" rx="4" ry="2" fill="${C.em}" opacity="0.18"/>
    <!-- Primary catchlight -->
    <circle cx="35.5" cy="53" r="2.5" fill="white"/>
    <circle cx="57.5" cy="53" r="2.5" fill="white"/>
    <!-- Secondary catchlight -->
    <circle cx="42" cy="59.5" r="1.3" fill="white" opacity="0.7"/>
    <circle cx="64" cy="59.5" r="1.3" fill="white" opacity="0.7"/>
    <!-- Tiny sparkle -->
    <circle cx="36.5" cy="56" r="0.7" fill="white" opacity="0.6"/>
    <circle cx="58.5" cy="56" r="0.7" fill="white" opacity="0.6"/>
    <!-- Upper eyelid line -->
    <path d="M ${30.5} ${53} Q 39 ${48.5} ${47.5} ${53}" stroke="#1a1008" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M ${52.5} ${53} Q 61 ${48.5} ${69.5} ${53}" stroke="#1a1008" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- Lower eyelid hint -->
    <path d="M 33 60.5 Q 39 63 45 60.5" stroke="${skS}" stroke-width="0.8" fill="none" opacity="0.4" stroke-linecap="round"/>
    <path d="M 55 60.5 Q 61 63 67 60.5" stroke="${skS}" stroke-width="0.8" fill="none" opacity="0.4" stroke-linecap="round"/>
    <!-- Lashes -->
    ${lashes}
    <!-- Eyebrows -->
    <path d="M 31 47 Q 39 43 47 45.5" stroke="${C.hc}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
    <path d="M 53 45.5 Q 61 43 69 47" stroke="${C.hc}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
    <!-- Nose -->
    <path d="M 47 65 Q 50 68 53 65" stroke="${skS}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="48" cy="66" r="0.6" fill="${skS}" opacity="0.4"/>
    <!-- Mouth -->
    <path d="M 44 73 Q 50 78 56 73" stroke="#d4826a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M 46 73.5 Q 50 75 54 73.5" fill="#e89880" opacity="0.25"/>
    <!-- Blush -->
    <ellipse cx="31" cy="66" rx="6.5" ry="3.5" fill="#ffaabb" opacity="0.22"/>
    <ellipse cx="69" cy="66" rx="6.5" ry="3.5" fill="#ffaabb" opacity="0.22"/>`;

  return `<svg viewBox="5 -10 90 140" xmlns="http://www.w3.org/2000/svg"
      style="width:100%;height:100%" aria-hidden="true">
    <defs>${defs}</defs>
    ${aura}${parts}
    ${hB}
    ${neckShadow}${neck}${torso}${shoulderHL}${outfitDetail}
    ${face}
    ${hF}
  </svg>`;
}

function setCalView_stats(v) { calView = v; window._statsSubView = 'calendar'; renderStats(); }

// ── WEEK-OVER-WEEK TREND HELPERS ─────────────────────────────────────────
function _lastWeekDates() {
  const dates = [];
  for (let i = 7; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() - i); dates.push(d.toLocaleDateString('en-CA')); }
  return dates;
}
function _lastWeekWorkouts() {
  return _lastWeekDates().filter(d => workoutLog[d] && workoutLog[d].exercises.some(e => e.sets.some(s => s.completed))).length;
}
function _lastWeekHabitDays() {
  let ct = 0;
  _lastWeekDates().forEach(d => { if (habits.some(h => log[h.id]?.lastCompletedDate === d)) ct++; });
  return ct;
}
function _lastWeekJournalDays() {
  return _lastWeekDates().filter(d => journal[d] && Object.values(journal[d]).some(Boolean)).length;
}
function _trendBadge(cur, prev) {
  if (prev === 0 && cur === 0) return '';
  const diff = cur - prev;
  if (diff === 0) return '<div class="trend-badge trend-flat">—</div>';
  const arrow = diff > 0 ? '↑' : '↓';
  const cls = diff > 0 ? 'trend-up' : 'trend-down';
  return `<div class="trend-badge ${cls}">${arrow}${Math.abs(diff)}</div>`;
}

function renderStats() {
  const {done,total} = totalPct();
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const q = QUOTES[meta.quoteIndex % QUOTES.length];
  const psRows = PILLARS.map(p => { const {pct} = pillarPct(p.id); return `<div class="ps-row"><div class="ps-name">${p.name}</div><div class="ps-track"><div class="ps-fill" style="width:${(pct*100).toFixed(0)}%"></div></div><div class="ps-val">${Math.round(pct*10)}/10</div></div>`; }).join('');

  const { lvl, progress, needed } = xpToNextLevel(gamification.xp || 0);
  const xpBarPct = needed > 0 ? progress / needed : 1;
  const unlockedSet = new Set(achievements);
  const achHTML = ACHIEVEMENTS.map(a => `
    <div class="g-ach-card ${unlockedSet.has(a.id) ? 'unlocked' : 'locked'}">
      <div class="g-ach-icon">${a.icon}</div>
      <div class="g-ach-name">${a.name}</div>
      <div class="g-ach-desc">${a.desc}</div>
    </div>`).join('');
  const pillarLevels = PILLARS.map(p => `
    <div class="g-pl-card">
      ${p.icon}
      <div class="g-pl-name">${p.name}</div>
      <div class="g-pl-lv">Lv ${getPillarLevel(p.id)}</div>
    </div>`).join('');

  // Weekly summary stats
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const weekAvgCal = computeWeeklyAvgCalories(mealLog);
  const weekHabits7 = (() => {
    let daysWithAny = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      if (habits.some(h => log[h.id]?.lastCompletedDate === key)) daysWithAny++;
    }
    return daysWithAny;
  })();

  // Sub-view toggle: Profile | Calendar
  const _statsSubView = window._statsSubView || 'profile';
  if (_statsSubView === 'calendar') {
    document.getElementById('view').innerHTML = `
      <div class="sh ani" style="display:flex;align-items:flex-start;justify-content:space-between">
        <div><div class="sh-title">Profile</div><div class="sh-sub">Become your greatest self.</div></div>
      </div>
      <div class="cal-view-seg ani" style="margin:0 24px 12px">
        <button class="cal-vbtn" onclick="window._statsSubView='profile';renderStats()">Profile</button>
        <button class="cal-vbtn cal-vbtn-active" onclick="window._statsSubView='calendar';renderStats()">Calendar</button>
      </div>
      <div id="stats-calendar-area"></div>`;
    // Render calendar content into the area
    const calArea = document.getElementById('stats-calendar-area');
    if (calArea) {
      // Temporarily replace the view rendering
      const origView = document.getElementById('view');
      const tempDiv = document.createElement('div');
      tempDiv.id = 'view';
      origView.appendChild(tempDiv);
      // Build calendar HTML directly
      if (!calSelectedDate) calSelectedDate = today();
      let calHTML = '';
      if (calView === 'weekly') {
        // Inline weekly calendar
        const sel = new Date(calSelectedDate + 'T00:00:00');
        const dow = sel.getDay();
        const monday = new Date(sel);
        monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
        const t = today();
        const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        let cols = '';
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday); d.setDate(monday.getDate() + i);
          const date = d.toLocaleDateString('en-CA');
          const isFuture = date > t;
          const isToday = date === t;
          const isSel = date === calSelectedDate;
          cols += `<div class="cal-wcol${isSel?' cal-wcol-sel':''}${isFuture?' cal-wfuture':''}" data-date="${date}" onclick="calSelectDate('${date}');window._statsSubView='calendar';renderStats()">
            <div class="cal-wday">${dayNames[i]}</div>
            <div class="cal-wnum${isToday?' cal-wnum-today':''}">${d.getDate()}</div>
            <div class="cal-dots" style="margin-top:4px">${_calDots(date)}</div>
          </div>`;
        }
        const startLabel = new Date(monday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endDay = new Date(monday); endDay.setDate(monday.getDate() + 6);
        const endLabel = endDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        calHTML = `<div class="cal-hdr ani">
          <button class="cal-nav-btn" onclick="calPrev();window._statsSubView='calendar';renderStats()">‹</button>
          <div class="cal-month-label">${startLabel} – ${endLabel}</div>
          <button class="cal-nav-btn" onclick="calNext();window._statsSubView='calendar';renderStats()">›</button>
        </div>
        ${_calViewToggle().replace(/setCalView\(/g, "setCalView_stats(")}
        ${_calLegend()}
        <div class="cal-week-cols ani">${cols}</div>
        <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
      } else if (calView === 'daily') {
        const d = new Date(calSelectedDate + 'T00:00:00');
        const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        calHTML = `<div class="cal-hdr ani">
          <button class="cal-nav-btn" onclick="calPrev();window._statsSubView='calendar';renderStats()">‹</button>
          <div class="cal-month-label" style="font-size:15px">${label}</div>
          <button class="cal-nav-btn" onclick="calNext();window._statsSubView='calendar';renderStats()">›</button>
        </div>
        ${_calViewToggle().replace(/setCalView\(/g, "setCalView_stats(")}
        <div class="cal-daily-wrap ani">${_buildDailyBody(calSelectedDate)}</div>`;
      } else {
        // Monthly (default)
        if (!calSelectedDate) calSelectedDate = today();
        const firstDay = new Date(calYear, calMonth, 1);
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const startDow = firstDay.getDay();
        const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const t = today();
        const now = new Date();
        const isCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth();
        let cells = Array.from({length: startDow}, () => `<div class="cal-cell cal-empty"></div>`).join('');
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(calYear, calMonth, day).toLocaleDateString('en-CA');
          const isFuture = date > t;
          const isToday = date === t;
          const isSel = date === calSelectedDate;
          cells += `<div class="cal-cell${isToday?' cal-today':''}${isSel?' cal-selected':''}${isFuture?' cal-future':''}" data-date="${date}" onclick="calSelectDate('${date}');window._statsSubView='calendar';renderStats()">
            <div class="cal-num">${day}</div>
            <div class="cal-dots">${_calDots(date)}</div>
          </div>`;
        }
        calHTML = `<div class="cal-hdr ani">
          <button class="cal-nav-btn" onclick="calPrev();window._statsSubView='calendar';renderStats()">‹</button>
          <div class="cal-month-label">${monthLabel}</div>
          <button class="cal-nav-btn${isCurrentMonth?' cal-nav-disabled':''}" onclick="calNext();window._statsSubView='calendar';renderStats()">›</button>
        </div>
        ${_calViewToggle().replace(/setCalView\(/g, "setCalView_stats(")}
        ${_calLegend()}
        <div class="cal-dow-row">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div>
        <div class="cal-grid ani">${cells}</div>
        <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
      }
      calArea.innerHTML = calHTML;
      tempDiv.remove();
    }
    qTimer = setInterval(() => rotQ(1), 30000);
    return;
  }

  document.getElementById('view').innerHTML = `
    <div class="sh ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="sh-title">Profile</div><div class="sh-sub">Become your greatest self.</div></div>
      <button class="w-action-btn" style="margin:0;padding:10px 16px;font-size:13px;width:auto" onclick="openEditName()">Edit Name</button>
    </div>
    <div class="cal-view-seg ani" style="margin:0 24px 12px">
      <button class="cal-vbtn cal-vbtn-active" onclick="window._statsSubView='profile';renderStats()">Profile</button>
      <button class="cal-vbtn" onclick="window._statsSubView='calendar';renderStats()">Calendar</button>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Name</div>
      <div style="font-family:var(--serif);font-size:22px;color:var(--text)" id="profile-name-display">${userName() || '—'}</div>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-size:13px;color:var(--text-dim)">Level <span style="font-family:var(--serif);font-size:26px;color:var(--accent-b);font-weight:700">${lvl}</span> <span style="font-size:12px;color:var(--accent);font-weight:600;letter-spacing:.04em">${getLevelTitle(lvl)}</span></div>
        <div style="font-size:11px;color:var(--text-dim)">${(gamification.xp||0).toLocaleString()} XP</div>
      </div>
      <div class="g-xp-bar-track"><div class="g-xp-bar-fill" style="width:${(xpBarPct*100).toFixed(1)}%"></div></div>
      <div style="font-size:10px;color:var(--text-dim);text-align:right;margin-top:2px">${(needed-progress).toLocaleString()} XP to Level ${lvl+1}</div>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Settings</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Units</div>
        <div class="unit-toggle">
          <button class="unit-btn${!isImperial()?' unit-btn-active':''}" onclick="setUnits('metric');renderStats()">kg</button>
          <button class="unit-btn${isImperial()?' unit-btn-active':''}" onclick="setUnits('imperial');renderStats()">lbs</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Theme</div>
        <div class="unit-toggle">
          <button class="unit-btn${(settings.theme||'dark')==='dark'?' unit-btn-active':''}" onclick="settings.theme='dark';LS.set('hvi_settings',settings);applyTheme();renderStats()">Dark</button>
          <button class="unit-btn${settings.theme==='light'?' unit-btn-active':''}" onclick="settings.theme='light';LS.set('hvi_settings',settings);applyTheme();renderStats()">Light</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Avatar</div>
        <div class="unit-toggle">
          <button class="unit-btn${(tdeeProfile?.sex||'male')==='male'?' unit-btn-active':''}" onclick="setGender('male')">Male</button>
          <button class="unit-btn${(tdeeProfile?.sex||'male')==='female'?' unit-btn-active':''}" onclick="setGender('female')">Female</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Sounds</div>
        <div class="unit-toggle">
          <button class="unit-btn${settings.sounds!==false?' unit-btn-active':''}" onclick="settings.sounds=true;LS.set('hvi_settings',settings);renderStats()">On</button>
          <button class="unit-btn${settings.sounds===false?' unit-btn-active':''}" onclick="settings.sounds=false;LS.set('hvi_settings',settings);renderStats()">Off</button>
        </div>
      </div>
      ${'Notification' in window ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Reminders</div>
        <div class="unit-toggle">
          ${Notification.permission === 'granted'
            ? `<button class="unit-btn unit-btn-active">On</button><button class="unit-btn" onclick="settings.notifications=false;LS.set('hvi_settings',settings);renderStats()">Off</button>`
            : `<button class="unit-btn" onclick="requestNotifications()">Enable</button>`}
        </div>
      </div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">App version</div>
        <button class="unit-btn" style="padding:6px 14px;background:var(--surface);border:1px solid var(--border2)" onclick="if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister())).then(()=>window.location.reload(true))}else{window.location.reload(true)}">Refresh</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:14px;color:var(--text)">Backup</div>
        <div style="display:flex;gap:6px">
          <button class="unit-btn" style="padding:6px 14px;background:var(--surface);border:1px solid var(--border2)" onclick="exportAllData()">Export</button>
          <label class="unit-btn" style="padding:6px 14px;background:var(--surface);border:1px solid var(--border2);cursor:pointer">Import<input type="file" accept=".json" style="display:none" onchange="importData(this)"></label>
        </div>
      </div>
    </div>
    <div class="s-grid ani">
      <div class="s-card"><div class="s-val">${done}</div><div class="s-lbl">Today</div></div>
      <div class="s-card"><div class="s-val">${best}</div><div class="s-lbl">Best Streak</div></div>
      <div class="s-card"><div class="s-val">${meta.totalPerfectDays||0}</div><div class="s-lbl">Perfect Days</div></div>
      <div class="s-card"><div class="s-val">${total}</div><div class="s-lbl">Total Habits</div></div>
    </div>
    <div class="da-section ani" style="margin:0 24px 8px">
      <div class="sec-lbl" style="padding:0 0 10px">THIS WEEK vs LAST WEEK</div>
      <div class="s-grid" style="margin:0">
        <div class="s-card"><div class="s-val" style="font-size:22px">${ws.workoutDays.length}</div><div class="s-lbl">Workouts</div>${_trendBadge(ws.workoutDays.length, _lastWeekWorkouts())}</div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${weekHabits7}</div><div class="s-lbl">Habit Days</div>${_trendBadge(weekHabits7, _lastWeekHabitDays())}</div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${ws.journalDays.length}</div><div class="s-lbl">Journaled</div>${_trendBadge(ws.journalDays.length, _lastWeekJournalDays())}</div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${weekAvgCal !== null ? weekAvgCal.toLocaleString() : '—'}</div><div class="s-lbl">Avg Cal</div></div>
      </div>
    </div>
    <div class="sec-lbl" style="padding-left:24px">Pillar Scores</div>
    <div class="ps ani">${psRows}</div>
    <div class="sec-lbl" style="padding-left:24px">Pillar Levels</div>
    <div class="g-pillar-levels ani">${pillarLevels}</div>
    <div class="sec-lbl" style="padding-left:24px">Achievements Â· ${achievements.length}/${ACHIEVEMENTS.length}</div>
    <div class="g-ach-grid ani">${achHTML}</div>
    <div class="sec-lbl" style="padding-left:24px">Today's Wisdom</div>
    <div class="q-block ani">
      <div class="q-mark">\u201C</div>
      <div class="q-text" id="qt">${esc(q.text)}</div>
      <div class="q-auth" id="qa">\u2014 ${esc(q.author)}</div>
      <div class="q-nav"><button class="q-btn" onclick="rotQ(-1)">\u2190</button><button class="q-btn" onclick="rotQ(1)">\u2192</button></div>
    </div>
    <button class="w-action-btn" style="margin:16px 24px 8px" onclick="go('progressPhotos')">📸 Progress Photos</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="shareRecap()">📤 Share Weekly Recap</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="shareInvite()">🔗 Invite a Friend</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="forceSync()" id="force-sync-btn">🔄 Force Sync Now</button>
    <div id="sync-log" style="margin:0 24px 8px;font-size:11px;color:var(--text-dim);max-height:120px;overflow:auto;font-family:monospace;white-space:pre-wrap"></div>
    <button class="w-action-btn" style="margin:0 24px 32px;color:var(--fat);border-color:var(--fat)" onclick="if(confirm('Sign out?'))authSignOut()">Sign Out</button>`;
  qTimer = setInterval(() => rotQ(1), 30000);
}

function openEditName() {
  let modal = document.getElementById('edit-name-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'edit-name-modal'; document.body.appendChild(modal); }
  const current = userName();
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closeEditName()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Your Name</div>
      <input class="d-input" id="edit-name-input" type="text" value="${esc(current)}" placeholder="First name" style="margin-bottom:20px">
      <div style="display:flex;gap:10px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeEditName()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="saveEditName()">Save</button>
      </div>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('edit-name-input')?.focus(), 100);
}

function closeEditName() {
  const m = document.getElementById('edit-name-modal');
  if (m) m.style.display = 'none';
}

function saveEditName() {
  const name = document.getElementById('edit-name-input')?.value?.trim();
  if (!name) return;
  localStorage.setItem('hvi_user_name', name);
  closeEditName();
  const el = document.getElementById('profile-name-display');
  if (el) el.textContent = name;
}

function setGender(g) {
  if (!tdeeProfile) tdeeProfile = {};
  tdeeProfile.sex = g;
  LS.set('hvi_tdee_profile', tdeeProfile);
  renderStats();
}

function rotQ(dir) {
  meta.quoteIndex = (meta.quoteIndex + dir + QUOTES.length) % QUOTES.length;
  LS.set('hvi_meta', meta);
  const q = QUOTES[meta.quoteIndex];
  const qt = document.getElementById('qt'), qa = document.getElementById('qa');
  if (!qt) return;
  qt.style.opacity = '0';
  setTimeout(() => { if (qt) { qt.textContent = q.text; qt.style.opacity = '1'; } if (qa) qa.textContent = '\u2014 ' + q.author; }, 200);
}

// ══════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════════════════════
let _obGoalType = 'maintain';
let _obCalories = 2500;
let _obProtein = 180;
let _obName = '', _obGender = 'male';

function injectOnboardingStyles() {
  if (document.getElementById('ob-styles')) return;
  const s = document.createElement('style');
  s.id = 'ob-styles';
  s.textContent = `
    #ob-overlay{position:fixed;inset:0;background:var(--bg);z-index:2000;overflow-y:auto;display:flex;flex-direction:column}
    .ob-wrap{flex:1;display:flex;flex-direction:column;padding:0 28px 48px;max-width:480px;margin:0 auto;width:100%}
    .ob-step-dots{display:flex;gap:6px;justify-content:center;padding:20px 0 4px}
    .ob-dot{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,0.15);transition:all .3s}
    .ob-dot.active{width:20px;background:var(--accent)}
    .ob-eyebrow{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;margin-top:32px}
    .ob-title{font-family:var(--serif);font-size:34px;color:var(--text);line-height:1.2;margin-bottom:8px}
    .ob-sub{font-size:14px;color:var(--text-dim);line-height:1.6;margin-bottom:28px}
    .ob-input{width:100%;background:var(--surface);border:1.5px solid var(--border2);border-radius:14px;color:var(--text);font-size:18px;padding:18px 20px;outline:none;font-family:var(--serif);margin-bottom:24px;box-sizing:border-box}
    .ob-input:focus{border-color:var(--accent)}
    .ob-input::placeholder{color:var(--text-muted)}
    .ob-goal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px}
    .ob-goal-card{background:var(--surface);border:1.5px solid var(--border2);border-radius:14px;padding:18px 14px;cursor:pointer;transition:all .2s;text-align:center}
    .ob-goal-card.active{border-color:var(--accent);background:rgba(154,130,86,0.1)}
    .ob-goal-card.full{grid-column:1/-1}
    .ob-goal-emoji{font-size:26px;margin-bottom:8px}
    .ob-goal-name{font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px}
    .ob-goal-desc{font-size:11px;color:var(--text-dim)}
    .ob-nut-btns{display:flex;gap:8px;margin-bottom:20px}
    .ob-nut-btn{flex:1;padding:14px 8px;border:1.5px solid var(--border2);border-radius:12px;background:transparent;color:var(--text-dim);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s;text-align:center}
    .ob-nut-btn.active{border-color:var(--accent);color:var(--accent-b);background:rgba(154,130,86,0.08)}
    .ob-macro-row{display:flex;gap:10px;margin-bottom:20px}
    .ob-macro-card{flex:1;background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:14px 10px;text-align:center}
    .ob-macro-label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .ob-macro-input{width:100%;background:transparent;border:none;color:var(--accent-b);font-family:var(--serif);font-size:22px;font-weight:700;text-align:center;outline:none}
    .ob-btn{display:block;width:100%;padding:18px;border:none;border-radius:14px;background:var(--accent);color:#0a0908;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;margin-top:auto;transition:transform .15s}
    .ob-btn:active{transform:scale(0.98)}
    .ob-welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 32px 60px}
    .ob-welcome-star{font-size:48px;color:var(--accent);margin-bottom:20px;line-height:1}
    .ob-welcome-title{font-family:var(--serif);font-size:44px;color:var(--text);margin-bottom:14px;letter-spacing:-0.5px}
    .ob-welcome-sub{font-size:15px;color:var(--text-dim);line-height:1.7;margin-bottom:48px;max-width:300px}
    .ob-welcome-btn{padding:18px 48px;border:none;border-radius:14px;background:var(--accent);color:#0a0908;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer}
  `;
  document.head.appendChild(s);
}

function renderOnboarding(step) {
  let overlay = document.getElementById('ob-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ob-overlay';
    document.body.appendChild(overlay);
  }

  // Step 0: welcome splash
  if (step === 0) {
    overlay.innerHTML = `
      <div class="ob-welcome">
        <div class="ob-welcome-star">\u2726</div>
        <div class="ob-welcome-title">Northstar</div>
        <div class="ob-welcome-sub">Your guiding star for habits, fitness, nutrition, and growth.</div>
        <button class="ob-welcome-btn" onclick="renderOnboarding(1)">GET STARTED \u2192</button>
      </div>`;
    return;
  }

  const dots = [1,2,3,4].map(i => `<div class="ob-dot${i===step?' active':''}" ></div>`).join('');
  let content = '';

  if (step === 1) {
    content = `
      <div class="ob-eyebrow">Step 1 of 4</div>
      <div class="ob-title">What\'s your name?</div>
      <div class="ob-sub">We\'ll personalise your experience and your AI coach will know what to call you.</div>
      <input class="ob-input" type="text" id="ob-name-input" placeholder="Your first name" maxlength="30" value="${esc(_obName)}" oninput="_obName=this.value.trim()">`;

  } else if (step === 2) {
    content = `
      <div class="ob-eyebrow">Step 2 of 4</div>
      <div class="ob-title">Choose your avatar</div>
      <div class="ob-sub">This shapes your character's appearance. You can always change it later.</div>
      <div class="ob-gender-row">
        <div class="ob-gender-card${_obGender==='male'?' active':''}" onclick="_obGender='male';renderOnboarding(2)">
          <div style="width:60px;height:94px;margin:0 auto 8px">${buildAvatarSVG(1)}</div>
          <div style="font-size:13px;color:var(--text)">Male</div>
        </div>
        <div class="ob-gender-card${_obGender==='female'?' active':''}" onclick="_obGender='female';renderOnboarding(2)">
          <div style="width:60px;height:94px;margin:0 auto 8px">${(()=>{const _tmp=tdeeProfile;tdeeProfile={sex:'female'};const s=buildAvatarSVG(1);tdeeProfile=_tmp;return s;})()}</div>
          <div style="font-size:13px;color:var(--text)">Female</div>
        </div>
      </div>`;

  } else if (step === 3) {
    const goals = [
      {k:'habits', emoji:'\u{1F525}', name:'Build habits', desc:'Daily routines & discipline'},
      {k:'fitness', emoji:'\u{1F4AA}', name:'Get stronger', desc:'Workouts & performance'},
      {k:'nutrition', emoji:'\u{1F957}', name:'Eat better', desc:'Macros & meal tracking'},
      {k:'all', emoji:'\u2726', name:'All of the above', desc:'The full Northstar system', full:true},
    ];
    const cards = goals.map(g => `
      <div class="ob-goal-card${_obGoalType===g.k?' active':''} ${g.full?'full':''}" onclick="_obGoalType='${g.k}';renderOnboarding(2)">
        <div class="ob-goal-emoji">${g.emoji}</div>
        <div class="ob-goal-name">${g.name}</div>
        <div class="ob-goal-desc">${g.desc}</div>
      </div>`).join('');
    content = `
      <div class="ob-eyebrow">Step 3 of 4</div>
      <div class="ob-title">What brings you here?</div>
      <div class="ob-sub">Pick your main focus. You can use everything, but this helps us highlight what matters most.</div>
      <div class="ob-goal-grid">${cards}</div>`;

  } else if (step === 4) {
    const nuts = [['cut','Cut','Lose fat'],['maintain','Maintain','Stay lean'],['bulk','Bulk','Build muscle']];
    const nutBtns = nuts.map(([k,l,s]) =>
      `<button class="ob-nut-btn${_obGoalType===k?' active':''}" onclick="_obGoalType='${k}';_obCalories=${k==='cut'?2000:k==='bulk'?3000:2500};_obProtein=${k==='cut'?160:k==='bulk'?200:180};renderOnboarding(3)">${l}<br><span style="font-weight:400;font-size:10px;text-transform:none">${s}</span></button>`
    ).join('');
    content = `
      <div class="ob-eyebrow">Step 4 of 4</div>
      <div class="ob-title">Set your daily targets.</div>
      <div class="ob-sub">These feed into your macro rings. You can update them anytime in Diet \u2192 Goals.</div>
      <div class="ob-nut-btns">${nutBtns}</div>
      <div class="ob-macro-row">
        <div class="ob-macro-card"><div class="ob-macro-label">Calories</div><input class="ob-macro-input" type="number" id="ob-cal" value="${_obCalories}" onchange="_obCalories=+this.value"></div>
        <div class="ob-macro-card"><div class="ob-macro-label">Protein (g)</div><input class="ob-macro-input" type="number" id="ob-pro" value="${_obProtein}" onchange="_obProtein=+this.value"></div>
      </div>`;
  }

  const isLast = step === 4;
  overlay.innerHTML = `
    <div class="ob-wrap">
      <div class="ob-step-dots">${dots}</div>
      ${content}
      <button class="ob-btn" onclick="obNext(${step})">${isLast ? 'START MY JOURNEY \u2192' : 'CONTINUE \u2192'}</button>
    </div>`;
}

function obNext(step) {
  if (step === 1) {
    // Save name
    const n = _obName || (document.getElementById('ob-name-input')?.value?.trim() || '');
    if (n) { _obName = n; localStorage.setItem('hvi_user_name', n); }
  }
  if (step === 2) {
    // Save gender to tdee profile
    if (!tdeeProfile) tdeeProfile = {};
    tdeeProfile.sex = _obGender;
    LS.set('hvi_tdee_profile', tdeeProfile);
  }
  if (step < 4) { renderOnboarding(step + 1); return; }
  obFinish();
}

function obFinish() {
  // Save name
  if (_obName) localStorage.setItem('hvi_user_name', _obName);

  // Save nutrition goals (only for cut/maintain/bulk selections)
  const nutritionGoalType = ['cut','maintain','bulk'].includes(_obGoalType) ? _obGoalType : 'maintain';
  const cal = _obCalories;
  const pro = _obProtein;
  const carbs = Math.round((cal - pro * 4 - 70 * 9) / 4);
  dietMeta.dailyGoals = { calories: cal, protein: pro, carbs: Math.max(50, carbs), fat: 70 };
  dietMeta.goalType = nutritionGoalType;
  LS.set('hvi_diet_meta', dietMeta);

  // Mark onboarded
  LS.set('hvi_onboarded', true);

  // Remove overlay
  const overlay = document.getElementById('ob-overlay');
  if (overlay) {
    overlay.style.transition = 'opacity .4s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }

  launchConfetti(0.4);
  go('home', {}, false);
}

function obSkip() {
  LS.set('hvi_onboarded', true);
  const overlay = document.getElementById('ob-overlay');
  if (overlay) overlay.remove();
  go('home', {}, false);
}

// WEEKLY RECAP CARD
// ══════════════════════════════════════════════════════════════════════════
function generateRecapCard() {
  const W = 390, H = 680;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2; // retina
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const grad = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.75);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, 'rgba(60,20,5,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Gold accent line top
  ctx.fillStyle = '#9a8256';
  ctx.fillRect(28, 52, 40, 2);

  // Week range
  const now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  ctx.fillStyle = 'rgba(228,218,206,0.45)';
  ctx.font = '11px -apple-system,sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(`${fmt(mon).toUpperCase()} – ${fmt(sun).toUpperCase()}`, 28, 44);

  // Title
  ctx.fillStyle = '#e4dace';
  ctx.font = 'italic 600 52px "Georgia",serif';
  ctx.fillText('Weekly', 28, 110);
  ctx.fillStyle = '#b89d68';
  ctx.fillText('Recap.', 28, 165);

  // Stats
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const { done, total } = totalPct();
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const lvl = getLevel(gamification.xp || 0);

  const stats = [
    { label: 'WORKOUTS', value: ws.workoutDays.length + '/7' },
    { label: 'JOURNALED', value: ws.journalDays.length + '/7' },
    { label: 'BEST STREAK', value: best + 'd' },
    { label: 'LEVEL', value: 'LVL ' + lvl },
  ];

  const cardW = 156, cardH = 90, cardGap = 14;
  const startX = 28, startY = 210;

  stats.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = startX + col * (cardW + cardGap);
    const y = startY + row * (cardH + cardGap);
    // Card bg
    ctx.fillStyle = '#141210';
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.stroke();
    // Value
    ctx.fillStyle = '#b89d68';
    ctx.font = '700 28px "Georgia",serif';
    ctx.fillText(st.value, x + 14, y + 40);
    // Label
    ctx.fillStyle = 'rgba(228,218,206,0.4)';
    ctx.font = '500 10px -apple-system,sans-serif';
    ctx.fillText(st.label, x + 14, y + 62);
  });

  // Habit progress bar
  const barY = 440, barX = 28, barW2 = W - 56;
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '500 10px -apple-system,sans-serif';
  ctx.fillText('HABITS COMPLETED TODAY', barX, barY - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, barX, barY, barW2, 6, 3);
  ctx.fill();
  if (total > 0) {
    ctx.fillStyle = '#9a8256';
    roundRect(ctx, barX, barY, (done/total) * barW2, 6, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(228,218,206,0.5)';
  ctx.font = '500 12px -apple-system,sans-serif';
  ctx.fillText(`${done} / ${total}`, barX, barY + 22);

  // XP
  const xp = gamification.xp || 0;
  ctx.fillStyle = '#9a8256';
  ctx.font = '700 14px -apple-system,sans-serif';
  ctx.fillText(`+${xp.toLocaleString()} XP EARNED`, barX, barY + 50);

  // Quote
  const q = QUOTES[(meta.quoteIndex || 0) % QUOTES.length];
  ctx.fillStyle = 'rgba(184,157,104,0.6)';
  ctx.font = 'italic 700 28px "Georgia",serif';
  ctx.fillText('“', barX, barY + 100);
  ctx.fillStyle = 'rgba(228,218,206,0.75)';
  ctx.font = 'italic 13px "Georgia",serif';
  wrapText(ctx, q.text.slice(0, 80) + (q.text.length > 80 ? '…' : ''), barX + 20, barY + 115, barW2 - 20, 18);
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '11px -apple-system,sans-serif';
  ctx.fillText('— ' + q.author, barX + 20, barY + 165);

  // Branding + watermark
  ctx.fillStyle = 'rgba(228,218,206,0.2)';
  ctx.font = '700 11px -apple-system,sans-serif';
  ctx.fillText('HIGH VALUE INDIVIDUAL', barX, H - 28);
  ctx.fillStyle = 'rgba(184,157,104,0.35)';
  ctx.font = '600 10px -apple-system,sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('northstarapp.me', W - 28, H - 28);
  ctx.textAlign = 'left';

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineH;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x, y);
}

function checkWeeklyRecap() {
  const dow = new Date().getDay(); // 0=Sun, 1=Mon
  const hour = new Date().getHours();
  // Show on Monday, or Sunday after 4pm
  if (dow !== 1 && !(dow === 0 && hour >= 16)) return;
  const recapKey = 'hvi_last_recap_week';
  const weekId = getWeekKey();
  if (LS.get(recapKey, '') === weekId) return; // already shown this week
  LS.set(recapKey, weekId);
  showWeeklyRecap();
}

function showWeeklyRecap() {
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const lvl = getLevel(gamification.xp || 0);
  const weekAvgCal = computeWeeklyAvgCalories(mealLog);
  const xp = gamification.xp || 0;

  const modal = document.createElement('div');
  modal.id = 'weekly-recap-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:4000;display:flex;align-items:center;justify-content:center;padding:24px" onclick="this.remove()">
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:24px;padding:32px 24px;max-width:360px;width:100%;text-align:center" onclick="event.stopPropagation()">
        <div style="font-size:11px;color:var(--accent);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Weekly Recap</div>
        <div style="font-family:var(--serif);font-size:28px;color:var(--text);margin-bottom:4px">Great week!</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:24px">Here's how you showed up.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
          <div style="background:var(--surface);border-radius:14px;padding:14px">
            <div style="font-family:var(--serif);font-size:26px;color:var(--accent-b)">${ws.workoutDays.length}</div>
            <div style="font-size:10px;color:var(--text-muted);letter-spacing:1px">WORKOUTS</div>
          </div>
          <div style="background:var(--surface);border-radius:14px;padding:14px">
            <div style="font-family:var(--serif);font-size:26px;color:var(--accent-b)">${best}d</div>
            <div style="font-size:10px;color:var(--text-muted);letter-spacing:1px">BEST STREAK</div>
          </div>
          <div style="background:var(--surface);border-radius:14px;padding:14px">
            <div style="font-family:var(--serif);font-size:26px;color:var(--accent-b)">${ws.journalDays.length}</div>
            <div style="font-size:10px;color:var(--text-muted);letter-spacing:1px">JOURNALED</div>
          </div>
          <div style="background:var(--surface);border-radius:14px;padding:14px">
            <div style="font-family:var(--serif);font-size:26px;color:var(--accent-b)">${weekAvgCal !== null ? weekAvgCal.toLocaleString() : '—'}</div>
            <div style="font-size:10px;color:var(--text-muted);letter-spacing:1px">AVG CAL</div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--accent);font-weight:600;margin-bottom:20px">Level ${lvl} · ${xp.toLocaleString()} XP</div>
        <div style="display:flex;gap:10px">
          <button class="w-action-btn" style="flex:1;margin:0" onclick="this.closest('#weekly-recap-modal').remove()">Dismiss</button>
          <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="this.closest('#weekly-recap-modal').remove();shareRecap()">Share</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function generateDailyCard() {
  const W = 390, H = 500;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, H*0.7);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, 'rgba(60,20,5,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Date
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '600 10px -apple-system,sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(dateStr, 28, 44);

  // Gold line
  ctx.fillStyle = '#9a8256';
  ctx.fillRect(28, 52, 40, 2);

  // Title
  ctx.fillStyle = '#e4dace';
  ctx.font = 'italic 600 44px "Georgia",serif';
  ctx.fillText("Today's", 28, 100);
  ctx.fillStyle = '#b89d68';
  ctx.fillText('Progress.', 28, 148);

  // Stats
  const {done, total} = totalPct();
  const pct = total > 0 ? Math.round((done/total)*100) : 0;
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const todayMacros = getDayMacros();
  const todayWorkout = workoutLog[today()];
  const lvl = getLevel(gamification.xp || 0);

  const stats = [
    { label: 'HABITS', value: `${done}/${total}` },
    { label: 'COMPLETION', value: `${pct}%` },
    { label: 'BEST STREAK', value: `${best}d` },
    { label: 'CALORIES', value: todayMacros.cal.toLocaleString() },
  ];

  const cardW = 156, cardH = 80, cardGap = 14;
  stats.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 28 + col * (cardW + cardGap);
    const y = 190 + row * (cardH + cardGap);
    ctx.fillStyle = '#141210';
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.stroke();
    ctx.fillStyle = '#b89d68';
    ctx.font = '700 26px "Georgia",serif';
    ctx.fillText(st.value, x + 14, y + 36);
    ctx.fillStyle = 'rgba(228,218,206,0.4)';
    ctx.font = '500 10px -apple-system,sans-serif';
    ctx.fillText(st.label, x + 14, y + 56);
  });

  // Workout status
  const workoutText = todayWorkout ? '✓ Workout completed' : '— No workout today';
  ctx.fillStyle = todayWorkout ? '#9a8256' : 'rgba(228,218,206,0.35)';
  ctx.font = '600 13px -apple-system,sans-serif';
  ctx.fillText(workoutText, 28, 400);

  // Level
  ctx.fillStyle = '#b89d68';
  ctx.font = '700 13px -apple-system,sans-serif';
  ctx.fillText(`Level ${lvl} · ${getLevelTitle(lvl)}`, 28, 425);

  // Branding
  ctx.fillStyle = 'rgba(228,218,206,0.2)';
  ctx.font = '700 11px -apple-system,sans-serif';
  ctx.fillText('NORTHSTAR', 28, H - 28);

  return canvas;
}

function shareDailyCard() {
  const canvas = generateDailyCard();
  canvas.toBlob(async blob => {
    const file = new File([blob], 'northstar-today.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Today's Northstar Progress" }); return; } catch {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'northstar-today.png';
    a.click();
  }, 'image/png');
}

function shareRecap() {
  const canvas = generateRecapCard();
  canvas.toBlob(async blob => {
    const file = new File([blob], 'hvi-recap.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'My Northstar Weekly Recap' }); return; } catch {}
    }
    // Fallback: download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hvi-recap.png';
    a.click();
  }, 'image/png');
}


// ══════════════════════════════════════════════════════════════════════════
// HABIT HEATMAP
// ══════════════════════════════════════════════════════════════════════════
function buildHeatmapHTML() {
  const days = 91; // ~13 weeks
  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toLocaleDateString('en-CA');
    const count = habits.filter(h => log[h.id]?.lastCompletedDate === k || (k === today() && log[h.id]?.completedToday)).length;
    const total = habits.length || 1;
    const pct = count / total;
    const lvl = pct === 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4;
    cells.push(`<div class="hm-heatcell hm-heat-${lvl}" title="${k}: ${count}/${habits.length}"></div>`);
  }
  return `<div class="hm-heatmap">
    <div class="hm-heat-label">Less</div>
    <div class="hm-heat-grid">${cells.join('')}</div>
    <div class="hm-heat-label">More</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// STREAK SHIELDS
// ══════════════════════════════════════════════════════════════════════════
function getStreakShields() {
  return gamification.streakShields || 0;
}
function useStreakShield(habitId) {
  if (getStreakShields() <= 0) return;
  gamification.streakShields = (gamification.streakShields || 0) - 1;
  // Restore the streak by re-setting lastCompletedDate to yesterday
  if (log[habitId]) {
    log[habitId].lastCompletedDate = yesterday();
    // Don't increment streak, just preserve it
  }
  LS.set('hvi_gamification', gamification);
  LS.set('hvi_log', log);
}
// Award a streak shield each Sunday (checked in checkReset)
function maybeAwardStreakShield() {
  const dow = new Date().getDay(); // 0 = Sunday
  if (dow === 0 && gamification._lastShieldWeek !== getWeekKey()) {
    gamification.streakShields = Math.min((gamification.streakShields || 0) + 1, 3); // Max 3
    gamification._lastShieldWeek = getWeekKey();
    LS.set('hvi_gamification', gamification);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// EXPORT DATA
// ══════════════════════════════════════════════════════════════════════════
function exportAllData() {
  const data = {};
  const keys = ['hvi_habits','hvi_log','hvi_journal3','hvi_meta','hvi_workout_log','hvi_workout_meta',
    'hvi_meal_log','hvi_diet_meta','hvi_weight_log','hvi_prs','hvi_gamification','hvi_achievements',
    'hvi_tdee_profile','hvi_custom_programs','hvi_sleep_log','hvi_cal_tasks','hvi_settings'];
  keys.forEach(k => { try { data[k] = JSON.parse(localStorage.getItem(k)); } catch {} });
  data.hvi_user_name = localStorage.getItem('hvi_user_name');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `northstar-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      Object.keys(data).forEach(k => {
        if (k === 'hvi_user_name') localStorage.setItem(k, data[k] || '');
        else localStorage.setItem(k, JSON.stringify(data[k]));
      });
      alert('Data imported! Reloading...');
      window.location.reload();
    } catch (err) { alert('Invalid backup file.'); }
  };
  reader.readAsText(file);
}

// ══════════════════════════════════════════════════════════════════════════
// DARK/LIGHT THEME
// ══════════════════════════════════════════════════════════════════════════
function toggleTheme() {
  const cur = settings.theme || 'dark';
  settings.theme = cur === 'dark' ? 'light' : 'dark';
  LS.set('hvi_settings', settings);
  applyTheme();
}
function applyTheme() {
  const theme = (settings || {}).theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

// ══════════════════════════════════════════════════════════════════════════
// PROGRESS PHOTOS
// ══════════════════════════════════════════════════════════════════════════

function getProgressPhotos() { return LS.get('hvi_progress_photos', []); }

function renderProgressPhotos() {
  const photos = getProgressPhotos();
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('stats')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Progress Photos</div><div class="page-sub">Track your visual transformation over time.</div></div>
    <div style="padding:0 24px">
      <label class="w-action-btn" style="display:block;text-align:center;cursor:pointer;margin-bottom:20px">
        📸 Take / Upload Photo
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="handleProgressPhoto(this)">
      </label>
      ${photos.length === 0 ? `<div class="empty-state"><div class="empty-icon">📷</div><div class="empty-txt">No progress photos yet.<br>Take your first photo to start tracking your transformation.</div></div>` : ''}
      ${photos.length >= 2 ? `<button class="w-action-btn" style="margin-bottom:16px;width:100%" onclick="showPhotoCompare()">↔ Compare Photos</button>` : ''}
      <div class="progress-photo-grid">
        ${photos.map((p, i) => `
          <div class="progress-photo-card" onclick="viewProgressPhoto(${i})">
            <img src="${p.thumb}" class="progress-photo-img">
            <div class="progress-photo-date">${new Date(p.date).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div>
            ${p.note ? `<div class="progress-photo-note">${esc(p.note)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

function handleProgressPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    // Resize to thumbnail (max 600px wide) to save localStorage space
    const img = new Image();
    img.onload = function() {
      const maxW = 600, maxH = 800;
      let w = img.width, h = img.height;
      if (w > maxW) { h = h * maxW / w; w = maxW; }
      if (h > maxH) { w = w * maxH / h; h = maxH; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const thumb = canvas.toDataURL('image/jpeg', 0.7);
      // Ask for optional note
      const note = prompt('Add a note (optional):', '') || '';
      const photos = getProgressPhotos();
      photos.unshift({ date: new Date().toISOString(), thumb, note });
      // Keep max 30 photos to avoid localStorage overflow
      if (photos.length > 30) photos.pop();
      LS.set('hvi_progress_photos', photos);
      renderProgressPhotos();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function viewProgressPhoto(i) {
  const photos = getProgressPhotos();
  const p = photos[i];
  if (!p) return;
  let modal = document.getElementById('photo-view-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'photo-view-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:5000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px" onclick="this.parentElement.style.display='none'">
      <img src="${p.thumb}" style="max-width:90%;max-height:70vh;border-radius:12px;object-fit:contain">
      <div style="color:#fff;margin-top:12px;font-size:14px">${new Date(p.date).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'})}</div>
      ${p.note ? `<div style="color:var(--text-dim);margin-top:4px;font-size:13px">${esc(p.note)}</div>` : ''}
      <button style="margin-top:16px;background:var(--fat);color:#fff;border:none;padding:8px 20px;border-radius:8px;font-size:12px;cursor:pointer" onclick="event.stopPropagation();deleteProgressPhoto(${i})">Delete Photo</button>
    </div>`;
  modal.style.display = 'block';
}

function deleteProgressPhoto(i) {
  if (!confirm('Delete this progress photo?')) return;
  const photos = getProgressPhotos();
  photos.splice(i, 1);
  LS.set('hvi_progress_photos', photos);
  document.getElementById('photo-view-modal').style.display = 'none';
  renderProgressPhotos();
}

function showPhotoCompare() {
  const photos = getProgressPhotos();
  if (photos.length < 2) return;
  const first = photos[photos.length - 1]; // oldest
  const last = photos[0]; // newest
  let modal = document.getElementById('photo-compare-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'photo-compare-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:5000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px" onclick="this.parentElement.style.display='none'">
      <div style="color:var(--text);font-size:16px;font-weight:600;margin-bottom:16px">Your Transformation</div>
      <div style="display:flex;gap:12px;max-width:100%;overflow:hidden">
        <div style="flex:1;text-align:center">
          <img src="${first.thumb}" style="max-width:100%;max-height:50vh;border-radius:10px;object-fit:contain">
          <div style="color:var(--text-dim);font-size:11px;margin-top:6px">${new Date(first.date).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</div>
        </div>
        <div style="flex:1;text-align:center">
          <img src="${last.thumb}" style="max-width:100%;max-height:50vh;border-radius:10px;object-fit:contain">
          <div style="color:var(--text-dim);font-size:11px;margin-top:6px">${new Date(last.date).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</div>
        </div>
      </div>
      <div style="color:var(--text-muted);font-size:12px;margin-top:12px">Tap anywhere to close</div>
    </div>`;
  modal.style.display = 'block';
}
