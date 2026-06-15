// ══════════════════════════════════════════════════════════════════════════
// Arete — Connected System Layer
// ──────────────────────────────────────────────────────────────────────────
// Phase 0: a tiny event bus + shared derived-state selectors so the five
// modules can react to each other without being hard-wired together.
//
// This file READS the global state vars declared in app.js (habits, log,
// workoutLog, mealLog, dietMeta, sleepLog, journal, gamification ...) the same
// way coach.js already does. It adds no new storage and changes no behavior on
// its own — it only computes connected signals on demand.
// ══════════════════════════════════════════════════════════════════════════

// ── EVENT BUS ───────────────────────────────────────────────────────────────
// Modules emit on key writes (e.g. Arete.emit('workout:logged', {...})) and
// "connectors" subscribe to react. New cross-module links = new subscribers.
window.Arete = window.Arete || (function () {
  const subs = {};
  return {
    on(evt, fn) { (subs[evt] = subs[evt] || []).push(fn); return () => window.Arete.off(evt, fn); },
    off(evt, fn) { if (subs[evt]) subs[evt] = subs[evt].filter(f => f !== fn); },
    emit(evt, payload) {
      (subs[evt] || []).forEach(fn => { try { fn(payload); } catch (e) { console.warn('[Arete] handler error:', evt, e); } });
    },
    _subs: subs,
  };
})();

// ── SMALL HELPERS (namespaced to avoid global collisions) ────────────────────
function _cnClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function _cnClamp01(v) { return _cnClamp(v, 0, 1); }
function _cnDateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - (offsetDays || 0));
  return d.toLocaleDateString('en-CA');
}

// ── DERIVED SIGNAL: habit adherence over last 7 days (0..1) ──────────────────
function getHabitAdherence7d() {
  try {
    if (!Array.isArray(habits) || !habits.length) return 0.6; // neutral when nothing to measure
    const hist = LS.get('hvi_habit_history', {});
    const t = today();
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const key = _cnDateKey(i);
      const doneThatDay = key === t
        ? habits.filter(h => log[h.id]?.completedToday).length
        : Object.values(hist).filter(arr => Array.isArray(arr) && arr.includes(key)).length;
      total += doneThatDay;
    }
    return _cnClamp01(total / (7 * habits.length));
  } catch { return 0.6; }
}

// ── DERIVED SIGNAL: nutrition adherence over last 3 logged days (0..1) ────────
// Skips days with no meals logged so "didn't log" is not treated as "didn't eat well".
function getNutritionAdherence3d() {
  try {
    const goals = (typeof dietMeta !== 'undefined' && dietMeta) ? dietMeta.dailyGoals || {} : {};
    if (!goals.calories) return 0.6; // neutral when no target set
    let hit = 0, days = 0;
    for (let i = 0; i < 3; i++) {
      const key = _cnDateKey(i);
      const meals = ((mealLog || {})[key] || {}).meals || [];
      if (!meals.length) continue;
      days++;
      let cal = 0, p = 0;
      meals.forEach(m => (m.items || []).forEach(it => { cal += it.calories || 0; p += it.protein || 0; }));
      const proteinOK = goals.protein ? p >= goals.protein * 0.9 : true;
      const calOK = cal >= goals.calories * 0.8 && cal <= goals.calories * 1.15;
      if (proteinOK && calOK) hit++;
    }
    return days ? hit / days : 0.6;
  } catch { return 0.6; }
}

// ── DERIVED SIGNAL: most recent sleep entry (today or yesterday) ──────────────
function getRecentSleep() {
  const sl = (typeof sleepLog !== 'undefined' && sleepLog) ? sleepLog : {};
  return sl[today()] || sl[_cnDateKey(1)] || {};
}

// ── PHASE 1: DAILY READINESS ─────────────────────────────────────────────────
// One fused morning signal (0..100). Blends training load, sleep, habit
// consistency and nutrition adherence. If a Whoop recovery score exists for the
// day it is weighted heavily (the user chose: prefer Whoop when present).
function getReadiness() {
  const slp = getRecentSleep();
  const whoop = (typeof slp.whoopRecovery === 'number') ? slp.whoopRecovery : null;

  // Sleep score 0..1 (hours weighted 60%, quality 40%); neutral if unlogged
  let sleepScore = 0.6;
  if (slp.hours || slp.quality) {
    sleepScore = _cnClamp01((slp.hours || 0) / 8) * 0.6 + _cnClamp01((slp.quality || 0) / 5) * 0.4;
  }

  // Training-load score 0..1 (inverse of fatigue) from existing recovery logic
  let loadScore = 1.0;
  try {
    if (typeof getRecoveryStatus === 'function') {
      const rec = getRecoveryStatus();
      loadScore = rec.status === 'fatigued' ? 0.4 : rec.status === 'moderate' ? 0.7 : 1.0;
    }
  } catch {}

  const habitScore = getHabitAdherence7d();
  const nutScore = getNutritionAdherence3d();

  let score;
  if (whoop !== null) {
    // Prefer Whoop; nudge with sleep + load so a bad night still moves it
    score = 0.7 * whoop + 0.3 * 100 * ((sleepScore + loadScore) / 2);
  } else {
    score = 100 * (0.40 * loadScore + 0.30 * sleepScore + 0.15 * habitScore + 0.15 * nutScore);
  }
  score = Math.round(_cnClamp(score, 0, 100));

  const label = score >= 75 ? 'Primed' : score >= 50 ? 'Steady' : score >= 30 ? 'Run down' : 'Depleted';
  return {
    score,
    label,
    factors: { whoop, sleep: sleepScore, load: loadScore, habits: habitScore, nutrition: nutScore },
  };
}

function readinessColor(score) {
  return score >= 75 ? 'var(--accent-b)' : score >= 50 ? 'var(--carb)' : score >= 30 ? '#e0a866' : 'var(--fat)';
}

// Only meaningful once we have at least one real input. Avoids showing a
// confident score to a brand-new user with no data.
function hasReadinessSignal() {
  const slp = getRecentSleep();
  if (slp.hours || slp.quality || typeof slp.whoopRecovery === 'number') return true;
  try {
    const wl = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog : {};
    for (let i = 0; i < 7; i++) { if (wl[_cnDateKey(i)]) return true; }
  } catch {}
  return false;
}

// Home-screen indicator. Rendered just under the hero in renderHome().
function readinessCardHTML() {
  try {
    if (!hasReadinessSignal()) return '';
    const r = getReadiness();
    const color = readinessColor(r.score);
    const ringSvg = (typeof ring === 'function') ? ring(22, r.score / 100, 3, color) : '';
    const f = r.factors;
    const bits = [];
    if (f.whoop != null) bits.push('Whoop ' + Math.round(f.whoop));
    bits.push('Sleep ' + Math.round(f.sleep * 100) + '%');
    bits.push('Load ' + (f.load >= 1 ? 'fresh' : f.load >= 0.7 ? 'moderate' : 'high'));
    return `<div class="hm-readiness ani" onclick="go('stats')" role="button" tabindex="0" aria-label="Daily readiness ${r.score} out of 100, ${r.label}">
      <div class="hm-rd-ring">${ringSvg}<div class="hm-rd-score" style="color:${color}">${r.score}</div></div>
      <div class="hm-rd-body">
        <div class="hm-rd-title">Readiness · <span style="color:${color}">${r.label}</span></div>
        <div class="hm-rd-sub">${bits.join(' · ')}</div>
      </div>
      <div class="hm-rd-chev">›</div>
    </div>`;
  } catch (e) {
    console.warn('[Arete] readiness card error:', e);
    return '';
  }
}

// ── PHASE 2: TRAINING DRIVES NUTRITION ───────────────────────────────────────
// Weekly training schedule (0=Sun..6=Sat). Defaults from the active program's
// day count; persisted to hvi_settings once the user edits it.
function _defaultTrainingDays() {
  let n = 5;
  try {
    const prog = (typeof findProgram === 'function') ? findProgram(workoutMeta && workoutMeta.activeProgram) : null;
    if (prog && prog.days) n = prog.days.length;
  } catch {}
  const map = { 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
  return map[n] || [1, 2, 3, 4, 5];
}
function getTrainingDays() {
  try {
    const s = (typeof settings !== 'undefined' && settings) ? settings : {};
    if (Array.isArray(s.trainingDays)) return s.trainingDays;
  } catch {}
  return _defaultTrainingDays();
}
function setTrainingDays(arr) {
  try {
    if (typeof settings === 'undefined' || !settings) return;
    settings.trainingDays = arr.slice().sort((a, b) => a - b);
    LS.set('hvi_settings', settings);
    window.Arete.emit('trainingDays:changed', settings.trainingDays);
  } catch {}
}

function _intensityFromDayName(name) {
  if (!name) return 'moderate';
  const n = String(name).toLowerCase();
  if (/leg|lower|squat|deadlift|power|full ?body|posterior|hinge/.test(n)) return 'hard';
  return 'moderate';
}

// Classify today: 'hard' | 'moderate' | 'rest'. A logged workout always counts
// as a training day; otherwise the weekly schedule decides training vs rest.
function classifyTodaySession() {
  const t = today();
  const wl = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog[t] : null;
  if (wl && wl.exercises && wl.exercises.length) {
    return { type: _intensityFromDayName(wl.dayName), dayName: wl.dayName || null, source: 'logged' };
  }
  const dow = new Date().getDay();
  if (!getTrainingDays().includes(dow)) return { type: 'rest', dayName: 'Rest', source: 'schedule' };
  let dayName = null;
  try {
    const prog = (typeof findProgram === 'function' ? findProgram(workoutMeta && workoutMeta.activeProgram) : null)
      || (typeof WORKOUT_PROGRAMS !== 'undefined' ? WORKOUT_PROGRAMS[0] : null);
    if (prog && prog.days && prog.days.length) {
      const day = prog.days[((workoutMeta && workoutMeta.currentDayIndex) || 0) % prog.days.length];
      dayName = (day && day.name) || null;
    }
  } catch {}
  return { type: _intensityFromDayName(dayName), dayName, source: 'planned' };
}

// Today's macro targets = base goals + carb-cycling modifier (non-destructive;
// base dietMeta.dailyGoals is never mutated). Hard days: carbs +20%, protein
// +10%. Rest days: carbs -25%. Normal training day = your set goal unchanged.
function getTodaysMacroTargets() {
  const base = (typeof dietMeta !== 'undefined' && dietMeta) ? (dietMeta.dailyGoals || {}) : {};
  let { calories, protein, carbs, fat } = base;
  if (!calories) return { calories, protein, carbs, fat, adjusted: false, type: null, dayName: null };
  protein = protein || 0;
  fat = (fat != null) ? fat : Math.round(calories * 0.25 / 9);
  carbs = (carbs != null) ? carbs : Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  const sess = classifyTodaySession();
  // hard day: carbs +20% / protein +10%; normal training day: carbs +8%; rest: carbs -25%
  const carbMult = sess.type === 'hard' ? 1.20 : sess.type === 'rest' ? 0.75 : 1.08;
  const protMult = sess.type === 'hard' ? 1.10 : 1.0;
  const adjCarbs = Math.round(carbs * carbMult);
  const adjProtein = Math.round(protein * protMult);
  // Calories = the user's set goal plus only the delta from the adjustment, so
  // a normal day shows their exact numbers (macros need not sum to calories).
  const adjCalories = Math.round(calories + (adjCarbs - carbs) * 4 + (adjProtein - protein) * 4);

  return {
    calories: adjCalories, protein: adjProtein, carbs: adjCarbs, fat,
    baseCalories: calories, baseCarbs: carbs, baseProtein: protein,
    adjusted: carbMult !== 1.0 || protMult !== 1.0,
    type: sess.type, dayName: sess.dayName, source: sess.source,
  };
}

// Short human label for the current adjustment, used by home/diet/coach.
function macroAdjustReason() {
  const t = getTodaysMacroTargets();
  if (!t.adjusted) return '';
  if (t.type === 'hard') return `${t.dayName || 'Heavy day'} · carbs +20%, protein +10%`;
  if (t.type === 'rest') return 'Rest day · carbs -25%';
  return `${t.dayName || 'Training day'} · carbs +8%`;
}

function macroAdjustBadgeHTML() {
  try {
    const t = getTodaysMacroTargets();
    if (!t.adjusted) return '';
    const isHard = t.type === 'hard';
    const isRest = t.type === 'rest';
    const icon = isRest ? '🌙' : isHard ? '🔥' : '💪';
    const color = isRest ? 'var(--text-dim)' : 'var(--carb)';
    return `<div class="d-adjust-badge" style="border-color:${color}">
      <span class="d-adjust-main">${icon} ${macroAdjustReason()}</span>
      <span class="d-adjust-base">${t.baseCalories.toLocaleString()} → ${t.calories.toLocaleString()} cal</span>
    </div>`;
  } catch { return ''; }
}

// ── PHASE 3: CROSS-MODULE HABIT COMPLETION ───────────────────────────────────
// Habits can be linked to a trigger ('workout' | 'protein' | 'calories') in the
// habit editor. When that action happens the linked habit auto-completes through
// the event bus, so the user never logs the same thing twice.
const TRIGGER_LABELS = { workout: '🏋️ Workout', protein: '🥩 Protein target', calories: '🔥 Calorie target' };

function getHabitLink(id) { return (LS.get('hvi_habit_links', {}) || {})[id] || ''; }

// Complete a habit if (and only if) it is not already done today. Reuses
// tapHabit so streaks, XP, quests and milestones behave exactly like a manual
// tap. tapHabit toggles, so we guard on completedToday; the unmatched suffix
// makes tapHabit skip its DOM updates when the habit row isn't on screen.
function autoCompleteHabit(id) {
  try {
    if (!log[id] || log[id].completedToday) return false;
    if (typeof tapHabit !== 'function') return false;
    tapHabit(id, '__auto');
    return true;
  } catch (e) { console.warn('[Arete] autoCompleteHabit error:', e); return false; }
}

function _connectToast(msg) {
  try {
    const el = document.createElement('div');
    el.className = 'streak-toast';
    el.style.cssText = 'bottom:100px;animation-duration:4s';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  } catch {}
}

function _autoCompleteLinkedHabits(trigger) {
  const links = LS.get('hvi_habit_links', {}) || {};
  const done = [];
  Object.keys(links).forEach(hid => {
    if (links[hid] === trigger && autoCompleteHabit(hid)) {
      const h = (Array.isArray(habits) ? habits.find(x => x.id === hid) : null);
      if (h) done.push(h.name);
    }
  });
  if (done.length) {
    _connectToast('✓ Auto-completed: ' + done.join(', '));
    // Refresh a habit-showing view so the tick appears immediately
    if (typeof go === 'function' && (curView === 'home' || curView === 'habits')) {
      try { go(curView, {}, false); } catch {}
    }
  }
  return done;
}

// Called after the diet view renders (covers every meal-add path) and is
// idempotent — a habit only completes the first time its target is crossed.
function checkNutritionTriggers() {
  try {
    const goals = getTodaysMacroTargets();
    if (!goals || !goals.calories) return;
    const m = (typeof getDayMacros === 'function') ? getDayMacros() : null;
    if (!m) return;
    if (goals.protein && m.p >= goals.protein) _autoCompleteLinkedHabits('protein');
    if (goals.calories && m.cal >= goals.calories) _autoCompleteLinkedHabits('calories');
  } catch (e) { console.warn('[Arete] nutrition triggers error:', e); }
}

// Workout completion comes through the bus (emitted by finishWorkout).
window.Arete.on('workout:completed', () => _autoCompleteLinkedHabits('workout'));
