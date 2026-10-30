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

  // Sleep score 0..1 (hours weighted 60%, quality 40%); neutral if unlogged.
  //
  // Only score on what was actually recorded. Treating an unrecorded quality as
  // zero capped the score at 0.6 for any night without one — which is every
  // night synced from Apple Health or Google Fit, since those report duration
  // and no rating. That read as poor recovery when nothing was wrong.
  let sleepScore = 0.6;
  {
    const h = slp.hours ? _cnClamp01(slp.hours / 8) : null;
    const q = slp.quality ? _cnClamp01(slp.quality / 5) : null;
    if (h !== null && q !== null) sleepScore = h * 0.6 + q * 0.4;
    else if (h !== null) sleepScore = h;
    else if (q !== null) sleepScore = q;
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

// ── SLEEP AND RECOVERY -> TODAY'S SETS ──────────────────────────────────────
// Readiness only ever became a sentence on the workout screen. The session
// itself came out the same after four hours of sleep as after eight. This
// decides what today's session should be, and workout.js builds the sets
// from it (_buildSession).
//
// Only what the body brings counts: last night's sleep, a Whoop recovery
// score when there is one, and how hard the last week was. Habits and meals
// stay out. They belong in the day's score on Home, but an unticked reading
// habit is no reason to do fewer squats.
//
// "Last night" is today's entry. Yesterday's is the night before, and a
// session is not cut on a stale reading.
const TRAIN_TIERS = ['full', 'trim', 'deload'];
function todaysTrainingCall() {
  const sl = (typeof sleepLog !== 'undefined' && sleepLog && sleepLog[today()]) || {};
  const whoop = typeof sl.whoopRecovery === 'number' ? Math.round(sl.whoopRecovery) : null;
  const hours = sl.hours > 0 ? sl.hours : null;
  const quality = sl.quality > 0 ? sl.quality : null;
  let load = null;
  try { if (typeof getRecoveryStatus === 'function') load = getRecoveryStatus(); } catch {}
  const fatigued = !!(load && load.status === 'fatigued');

  let level = 0, value = '';
  const why = [];
  if (whoop !== null) {
    // Whoop's own bands: red is under 34, and the low end of yellow trims.
    // Its score already counts the night and the strain, so nothing is added.
    level = whoop < 34 ? 2 : whoop < 50 ? 1 : 0;
    why.push(`Whoop recovery ${whoop}%.`);
    value = `${whoop}%`;
  } else {
    if (hours === null && quality === null && !fatigued) return null;
    const short = hours === null ? 0 : hours < 4.5 ? 2 : hours < 6 ? 1 : 0;
    const poor = quality !== null && quality <= 2 ? 1 : 0;
    level = Math.max(short, poor);
    if (hours !== null) why.push(`${typeof formatSleep === 'function' ? formatSleep(hours) : hours + 'h'} of sleep.`);
    if (poor && !short) why.push(`You rated the night ${quality} of 5.`);
    if (fatigued) {
      // A hard week on top of a short night is a deload; on its own, a trim.
      level = level ? 2 : 1;
      why.push(load.consecutive >= 4 ? `${load.consecutive} days of training in a row.`
        : load.days >= 6 ? `${load.days} sessions in the last week.`
        : load.why ? load.why.charAt(0).toUpperCase() + load.why.slice(1) + '.' : `${load.days} sessions in the last week.`);
    }
    value = hours !== null ? `${Math.round(hours * 10) / 10}h` : quality !== null ? `${quality}/5` : `${load.days}/7`;
  }
  return { tier: TRAIN_TIERS[level], level, why: why.join(' '), value };
}

const TRAIN_LIGHTER = {
  trim: 'Each lift loses a set and a couple of reps. The weights stay the same.',
  deload: 'Same exercises and sets at about 60% of the weight.',
};

// Someone who logs sleep but has not yet today is asked, since it now
// changes the session. Someone who never logs it is not nagged.
function _loggedSleepLately() {
  const sl = (typeof sleepLog !== 'undefined' && sleepLog) ? sleepLog : {};
  for (let i = 1; i <= 14; i++) { const e = sl[_cnDateKey(i)]; if (e && (e.hours || e.quality)) return true; }
  return false;
}

// What the readiness card on the workout screens says. Once anything has been
// logged the session is what it is, so the card describes it and offers no
// switch; before that it says what today's sets were built for and lets the
// person train the full plan instead.
function trainingAdvice() {
  const call = todaysTrainingCall();
  const wl = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog[today()] : null;
  const touched = !!(wl && typeof _wIsTouched === 'function' && _wIsTouched(wl));
  if (!call) {
    const done = typeof workoutDoneToday === 'function' && workoutDoneToday();
    if (!touched && !done && _loggedSleepLately()) {
      return { kind: 'ask', value: '?', color: 'var(--text-dim)', headline: 'How did you sleep?',
        detail: 'Log last night and today’s sets will match it.', action: { label: 'Log sleep', fn: 'showSleepPrompt()' } };
    }
    return null;
  }
  const color = 'var(--text)';
  const base = { kind: call.tier, tier: call.tier, value: call.value, color };
  // A started session keeps what it was built with.
  const built = touched ? (wl.tier || 'full') : (wl && wl.asPlanned ? 'full' : call.tier);
  if (built !== 'full') {
    return Object.assign(base, { headline: built === 'deload' ? 'Deload today' : 'Lighter session today',
      detail: `${call.why} ${TRAIN_LIGHTER[built]}`,
      action: touched ? null : { label: 'Train as planned', fn: 'setSessionPlan(true)' } });
  }
  if (call.level === 0) return Object.assign(base, { headline: 'Recovered. Train as planned.', detail: call.why, action: null });
  return Object.assign(base, { headline: 'Training as planned', detail: touched ? call.why : `${call.why} A lighter session is ready if you want it.`,
    action: touched ? null : { label: 'Use the lighter session', fn: 'setSessionPlan(false)' } });
}

function trainingAdviceHTML(where) {
  const a = trainingAdvice();
  if (!a) return '';
  // Inside the session there is nothing to say on a normal day.
  if (where === 'session' && (a.kind === 'full' || a.kind === 'ask')) return '';
  return `<div class="w-advice ani" role="status">
      <div class="w-advice-score" style="color:${a.color};border-color:${a.color}">${esc(a.value)}</div>
      <div class="w-advice-text">
        <div class="w-advice-head">${esc(a.headline)}</div>
        <div class="w-advice-detail">${esc(a.detail)}</div>
        ${a.action ? `<button class="w-advice-btn" onclick="event.stopPropagation();${a.action.fn}">${esc(a.action.label)}</button>` : ''}
      </div>
    </div>`;
}

// Readiness is progress, and progress is orange whatever the score: the
// number says how good the day is, not a traffic light.
function readinessColor(score) {
  return 'var(--orange)';
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

// ── HOW HARD, AND WHAT IT BURNED (WHOOP) ─────────────────────────────────────
// Whoop's strain runs 0 to 21; 14 and up is strenuous. A Whoop activity is
// judged by its strain, not its name, so a 15-strain match is a hard day and a
// 6-strain kickabout is not. A session logged here is hard if its name says so
// or Whoop measured it at 14+ (Whoop under-reads lifting, so the name stays).
const HARD_STRAIN = 14;
function _sessionStrain(wl) {
  if (!wl) return null;
  const s = wl.source === 'whoop' ? wl.strain : (wl.whoop && wl.whoop.strain);
  return typeof s === 'number' ? s : null;
}
function _intensityOf(wl) {
  const strain = _sessionStrain(wl);
  if (strain !== null && strain >= HARD_STRAIN) return 'hard';
  if (wl && wl.source === 'whoop') return 'moderate';
  return _intensityFromDayName(wl && wl.dayName);
}

// What a day's training burned, from Whoop (integrations.js keeps the log).
function _burnLog() { try { return LS.get('hvi_burn_log', {}) || {}; } catch { return {}; } }
function burnOn(day) { const b = _burnLog()[day]; return b && b.kcal > 0 ? b : null; }

// A usual day's burn: the average over the last four weeks of the days Whoop
// was worn (a night on record, or an activity), a day with no session counting
// as zero. Null until there are seven such days.
function typicalBurn() {
  const log = _burnLog(), sl = (typeof sleepLog !== 'undefined' && sleepLog) || {};
  let days = 0, total = 0;
  for (let i = 1; i <= 28; i++) {
    const d = _cnDateKey(i), n = sl[d], b = log[d];
    const worn = (n && (n.source === 'whoop' || typeof n.whoopRecovery === 'number')) || (b && b.kcal > 0);
    if (!worn) continue;
    days++;
    total += (b && b.kcal) || 0;
  }
  return days >= 7 ? Math.round(total / days) : null;
}

// Training load as Whoop measured it: the last three days' burn against three
// usual days, and how hard yesterday was. Counting sessions alone made a
// match and a short session the same load.
function whoopLoad() {
  const usual = typicalBurn();
  let recent = 0;
  for (let i = 1; i <= 3; i++) { const b = burnOn(_cnDateKey(i)); recent += b ? b.kcal : 0; }
  const ratio = usual > 0 ? recent / (3 * usual) : null;
  const y = burnOn(_cnDateKey(1)), ys = y ? y.strain || 0 : 0;
  const level = (ratio !== null && ratio >= 1.6) || ys >= 18 ? 2
    : (ratio !== null && ratio >= 1.25) || ys >= HARD_STRAIN ? 1 : 0;
  if (!level) return { level: 0, ratio };
  const heavyDays = ratio !== null && ratio >= (level === 2 ? 1.6 : 1.25);
  const why = heavyDays ? `${Math.round(ratio * 10) / 10}× your usual training over the last three days`
    : `strain ${ys} yesterday`;
  return { level, ratio, strain: ys, why };
}

// Classify today: 'hard' | 'moderate' | 'rest'. A logged workout always counts
// as a training day; otherwise the weekly schedule decides training vs rest.
function classifyTodaySession() {
  const t = today();
  const wl = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog[t] : null;
  // Only a session with actual completed work counts as trained — opening the
  // workout screen auto-creates an empty entry, which must not flip macros.
  const trained = (typeof workoutDoneToday === 'function') ? workoutDoneToday()
    : !!(wl && (wl.source || (wl.exercises || []).some(e => (e.sets || []).some(s => s.completed))));
  if (wl && trained) {
    return { type: _intensityOf(wl), dayName: wl.dayName || null, source: 'logged', strain: _sessionStrain(wl) };
  }
  return _plannedSession();
}

// What the schedule and the program say about today, ignoring anything logged.
// It is also what the targets were before a session counted, which is how the
// finished-workout card can show what the session itself changed.
function _plannedSession() {
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
function getTodaysMacroTargets(sess) {
  const base = (typeof dietMeta !== 'undefined' && dietMeta) ? (dietMeta.dailyGoals || {}) : {};
  let { calories, protein, carbs, fat } = base;
  if (!calories) return { calories, protein, carbs, fat, adjusted: false, type: null, dayName: null };
  protein = protein || 0;
  fat = (fat != null) ? fat : Math.round(calories * 0.25 / 9);
  carbs = (carbs != null) ? carbs : Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  sess = sess || classifyTodaySession();
  // hard day: carbs +20% / protein +10%; normal training day: carbs +8%; rest: carbs -25%
  const carbMult = sess.type === 'hard' ? 1.20 : sess.type === 'rest' ? 0.75 : 1.08;
  const protMult = sess.type === 'hard' ? 1.10 : 1.0;
  let adjCarbs = Math.round(carbs * carbMult);
  const adjProtein = Math.round(protein * protMult);

  // Measured beats guessed. When Whoop has today's training, the carbs follow
  // what it burned instead of the day type's percentage. The goal already
  // assumes a usual amount of exercise (the activity level it was set with, or
  // the intake and weight trend it was worked out from), so adding a whole
  // session would count it twice: the day earns what it burned beyond a usual
  // day, up to 1,000 cal, as carbs. A quiet day never loses calories for it.
  //
  // On a cut only half comes back, up to 500. Wearables tend to overcount what
  // a session burned, and eating all of it back could quietly close the
  // deficit; this way a hard day widens the deficit instead, even if Whoop
  // read high.
  let burn = null;
  if (sess.source === 'logged' && sess.type !== 'rest') {
    const b = burnOn(today()), usual = b ? typicalBurn() : null;
    if (b && usual !== null) {
      const over = Math.max(0, b.kcal - usual);
      const cutting = typeof dietMeta !== 'undefined' && dietMeta && dietMeta.goalType === 'cut';
      const extra = Math.min(cutting ? 500 : 1000, Math.round(over * (cutting ? 0.5 : 1) / 10) * 10);
      burn = { kcal: b.kcal, usual, over: Math.round(over / 10) * 10, extra, cutting };
      adjCarbs = carbs + Math.round(extra / 4);
    }
  }
  // Calories = the user's set goal plus only the delta from the adjustment, so
  // a normal day shows their exact numbers (macros need not sum to calories).
  const adjCalories = Math.round(calories + (adjCarbs - carbs) * 4 + (adjProtein - protein) * 4);

  return {
    calories: adjCalories, protein: adjProtein, carbs: adjCarbs, fat,
    baseCalories: calories, baseCarbs: carbs, baseProtein: protein,
    adjusted: adjCarbs !== carbs || adjProtein !== protein,
    type: sess.type, dayName: sess.dayName, source: sess.source, burn,
  };
}

// Short human label for the current adjustment, used by home/diet/coach.
function macroAdjustReason() {
  const t = getTodaysMacroTargets();
  if (!t.adjusted) return '';
  if (t.burn) {
    const n = v => Math.round(v).toLocaleString('en-US');
    const what = t.dayName || 'Today\'s training';
    const prot = t.type === 'hard' ? 'protein +10%' : '';
    if (!t.burn.extra) return `${what} burned ${n(t.burn.kcal)} cal, about a usual day${prot ? ' · ' + prot : ''}`;
    // On a cut, half comes back, so the deficit stays (getTodaysMacroTargets).
    if (t.burn.cutting) return `${what} burned ${n(t.burn.kcal)} cal, ${n(t.burn.over)} more than a usual day · +${n(t.burn.extra)} cal as carbs, half of it so you stay in a deficit${prot ? ' · ' + prot : ''}`;
    return `${what} burned ${n(t.burn.kcal)} cal, ${n(t.burn.over)} more than a usual day · +${n(t.burn.extra)} cal as carbs${prot ? ', ' + prot : ''}`;
  }
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
    const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
    const glyph = isRest ? ic('moon', 15) : isHard ? ic('flame', 15) : ic('activity', 15);
    // Neutral: the left rule marks it, not a colour.
    return `<div class="d-adjust-badge" style="border-left-color:var(--text-muted)">
      <span class="d-adjust-main">${glyph} ${macroAdjustReason()}</span>
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

// ── A FINISHED SESSION, SHOWN FEEDING THE REST OF THE DAY ─────────────────
// Training moves nutrition, ticks linked habits and adds to tomorrow's load,
// all silently. The workout screen shows it once, straight after finishing.
// `before` is the targets as planned, taken before the session counted.
function sessionFedSummary(before, autoDone) {
  const after = getTodaysMacroTargets();
  const rec = (typeof getRecoveryStatus === 'function') ? getRecoveryStatus() : null;
  let nutrition = null;
  if (after.calories) {
    const changed = !!before && (before.carbs !== after.carbs || before.protein !== after.protein);
    nutrition = {
      changed,
      fromRest: changed && before.type === 'rest',
      carbsFrom: changed ? before.carbs : after.baseCarbs, carbs: after.carbs,
      proteinFrom: changed ? before.protein : after.baseProtein, protein: after.protein,
      reason: macroAdjustReason(),
    };
  }
  return {
    date: today(), dayName: after.dayName || 'Session', type: after.type, nutrition,
    habits: (autoDone || []).slice(0, 3),
    load: rec ? { days: rec.days, label: rec.label } : null,
  };
}

function sessionFedHTML(s) {
  if (!s || s.date !== today()) return '';
  const ic = (n, z) => (typeof icon === 'function' ? icon(n, z) : '');
  const num = (from, to, unit) => from !== to
    ? `<s>${from}</s> → <b data-count-from="${from}" data-count-to="${to}">${to}</b>${unit}`
    : `<b>${to}</b>${unit}`;
  const rows = [];
  const n = s.nutrition;
  if (n) {
    const note = n.fromRest ? 'Up from a rest-day plan. You trained, so carbs come back up.'
      : n.changed ? `Raised just now: ${esc(s.dayName)} counts as a ${s.type === 'hard' ? 'heavy' : 'training'} day.`
      : `${esc(n.reason || 'Training day')}. Already in today's targets.`;
    rows.push(`<div class="sf-row" role="button" tabindex="0" onclick="go('diet')" onkeydown="if(event.key==='Enter'){go('diet')}">
        <div class="sf-ico">${ic('utensils', 16)}</div>
        <div class="sf-main"><div class="sf-lbl">Nutrition</div>
          <div class="sf-val">Carbs ${num(n.carbsFrom, n.carbs, 'g')} · Protein ${num(n.proteinFrom, n.protein, 'g')}</div>
          <div class="sf-note">${note}</div></div>
      </div>`);
  }
  if (s.habits.length) {
    rows.push(`<div class="sf-row">
        <div class="sf-ico">${ic('check', 16)}</div>
        <div class="sf-main"><div class="sf-lbl">Habits</div>
          <div class="sf-val">Ticked for you: <b>${s.habits.map(esc).join(', ')}</b></div></div>
      </div>`);
  }
  if (s.load) {
    rows.push(`<div class="sf-row">
        <div class="sf-ico">${ic('battery', 16)}</div>
        <div class="sf-main"><div class="sf-lbl">Readiness</div>
          <div class="sf-val"><b>${s.load.days}</b> session${s.load.days === 1 ? '' : 's'} in 7 days · ${esc(s.load.label.toLowerCase())}</div>
          <div class="sf-note">Tomorrow's score weighs this load.</div></div>
      </div>`);
  }
  if (!rows.length) return '';
  return `<div class="sf-card${s.waitFor ? ' sf-wait' : ''}" role="status">
      <button class="sf-x" onclick="this.closest('.sf-card').remove()" aria-label="Dismiss">&times;</button>
      <div class="sf-head"><span class="sf-dot"></span><div>
        <div class="sf-eyebrow">Session logged</div>
        <div class="sf-title">${esc(s.dayName)} fed the rest of your day</div></div></div>
      <div class="sf-rows">${rows.map((r, i) => r.replace('class="sf-row"', `class="sf-row" style="--i:${i}"`)).join('')}</div>
    </div>`;
}

// Numbers in the card tick from the old target to the new one as their row
// lands. A card held under a milestone overlay starts once that is dismissed.
function animateSessionFed() {
  const card = document.querySelector('.sf-card');
  if (!card) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    card.classList.remove('sf-wait');
    if (typeof countUp !== 'function') return;
    card.querySelectorAll('[data-count-to]').forEach(el => {
      const row = el.closest('.sf-row');
      const i = row ? +(row.style.getPropertyValue('--i') || 0) : 0;
      countUp(el, +el.dataset.countTo, 900, 450 + i * 350, +el.dataset.countFrom);
    });
  };
  if (!card.classList.contains('sf-wait') || typeof MutationObserver !== 'function') return start();
  let seen = false;
  const mo = new MutationObserver(() => {
    if (document.querySelector('.milestone-overlay')) seen = true;
    else if (seen) { mo.disconnect(); start(); }
  });
  mo.observe(document.body, { childList: true });
  // The overlay dismisses itself after 8s; never leave the card hidden for good.
  setTimeout(() => { mo.disconnect(); start(); }, 10000);
}

// The ordinary toast. This used to borrow .streak-toast, the centred
// celebration box, and add bottom:100px on top of its top:50%, which stretched
// it into a tall panel from mid-screen down to the nav bar.
function _connectToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
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
    // After a workout the session card on the workout screen names them, and a
    // toast on top of it would say the same thing twice.
    if (trigger !== 'workout') _connectToast('✓ Auto-completed: ' + done.join(', '));
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

// Sleep and journal are tracked but nothing could react to them, so a
// "Sleep 7h+" or "Reflect daily" habit still had to be ticked by hand even
// though the app already knew it had happened.
function checkSleepTriggers() {
  try {
    const sl = (typeof sleepLog !== 'undefined' && sleepLog) ? sleepLog[today()] : null;
    if (sl && (sl.hours || 0) >= 7) _autoCompleteLinkedHabits('sleep');
  } catch (e) { console.warn('[Arete] sleep triggers error:', e); }
}

function checkJournalTriggers() {
  try {
    const je = (typeof journal !== 'undefined' && journal) ? journal[today()] : null;
    if (je && Object.values(je).some(Boolean)) _autoCompleteLinkedHabits('journal');
  } catch (e) { console.warn('[Arete] journal triggers error:', e); }
}

// Everything that can complete a linked habit now goes through the bus, so a
// new integration only has to listen rather than find every write site.
// Kept so the finished-workout card can name what the session ticked off.
let _workoutAutoDone = [];
window.Arete.on('workout:completed', () => { _workoutAutoDone = _autoCompleteLinkedHabits('workout'); });
window.Arete.on('sleep:logged', checkSleepTriggers);
window.Arete.on('journal:saved', checkJournalTriggers);
window.Arete.on('meal:logged', () => { if (typeof checkNutritionTriggers === 'function') checkNutritionTriggers(); });

// ── PHASE 4: PROACTIVE COACH (rule-based local nudges) ───────────────────────
// Deterministic flags computed on-device from the signals the connected layer
// already produces. The single highest-priority flag surfaces as a coach card
// on the home screen — unprompted, free, instant. The AI coach (when opened)
// remains the deeper, conversational layer.
function _lastJournal() {
  const j = (typeof journal !== 'undefined' && journal) ? journal : {};
  const keys = Object.keys(j).sort().reverse();
  return keys.length ? j[keys[0]] : null;
}

function getCoachNudge() {
  try {
    // Don't nag brand-new users with no signal at all
    if (!hasReadinessSignal() && !(Array.isArray(habits) && habits.length)) return null;

    const flags = [];
    const r = getReadiness();
    const rec = (typeof getRecoveryStatus === 'function') ? getRecoveryStatus() : { status: 'fresh', days: 0 };
    const mt = getTodaysMacroTargets();
    const m = (typeof getDayMacros === 'function') ? getDayMacros() : { cal: 0, p: 0 };
    const hourNow = new Date().getHours();
    const nutAdh = getNutritionAdherence3d();
    const habitAdh = getHabitAdherence7d();

    // 1) Hard training day, afternoon, well under protein
    if (mt && mt.type === 'hard' && mt.protein && hourNow >= 14 && (m.p / mt.protein) < 0.5) {
      flags.push({ id: 'hardfuel', icon: 'meat', sev: 3,
        text: `Heavy day today and you're at ${m.p}g of ${mt.protein}g protein. Muscle doesn't rebuild on an empty tank. Get a protein-heavy meal in.` });
    }
    // 2) Training load vs nutrition mismatch over recent days
    if ((rec.status === 'fatigued' || rec.status === 'moderate') && nutAdh < 0.4) {
      flags.push({ id: 'mismatch', icon: 'scale', sev: 2,
        text: `You've trained ${rec.days}x this week but nutrition's been short. Hard training plus underfueling is how you stall and get hurt. Lock in your meals today.` });
    }
    // 3) Low readiness — ease off
    if (r.score < 35) {
      flags.push({ id: 'lowready', icon: 'battery', sev: 2,
        text: `Readiness is ${r.score} today. Pushing hard now just digs the hole deeper. Make today lighter and prioritize sleep and food.` });
    }
    // 4) Habits slipping while the journal shows a struggle
    const lastJ = _lastJournal();
    if (habitAdh < 0.5 && lastJ && lastJ.struggle && String(lastJ.struggle).trim()) {
      flags.push({ id: 'slip', icon: 'compass', sev: 1,
        text: `Your habits have slipped this week and your last journal named a struggle. This is the moment that decides who you become. One small win today turns it around.` });
    }
    // 5) Everything aligned — push (only when nothing's wrong)
    if (!flags.length && r.score >= 75 && habitAdh >= 0.8 && nutAdh >= 0.6) {
      flags.push({ id: 'aligned', icon: 'zap', sev: 0,
        text: `Readiness ${r.score}, habits on track, nutrition dialed in. Everything's aligned. This is the day to push.` });
    }

    if (!flags.length) return null;
    flags.sort((a, b) => b.sev - a.sev);
    return flags[0];
  } catch (e) { console.warn('[Arete] nudge error:', e); return null; }
}

// ── PREMIUM: COACH'S DAILY FOCUS ─────────────────────────────────────────────
// One AI-generated, personalized focus per day, built from this account's
// actual data. Premium-only (it costs API calls); free users see a locked
// teaser that opens the paywall. Cached per day in hvi_coach_insight.
const _INSIGHT_PROXY = 'https://arete-ai.oskarsteinicke.workers.dev';

function _coachInsightContext() {
  const parts = [];
  try {
    const r = getReadiness();
    parts.push(`Readiness ${r.score}/100 (${r.label}); load ${Math.round(r.factors.load * 100)}%, sleep ${Math.round(r.factors.sleep * 100)}%, habits ${Math.round(r.factors.habits * 100)}%, nutrition ${Math.round(r.factors.nutrition * 100)}%${r.factors.whoop != null ? ', Whoop ' + Math.round(r.factors.whoop) : ''}`);
  } catch {}
  try {
    const mt = getTodaysMacroTargets();
    const m = getDayMacros();
    parts.push(`Day type: ${mt.type || 'training'}${mt.dayName ? ' (' + mt.dayName + ')' : ''}. Eaten ${m.cal}/${mt.calories || '?'} kcal, protein ${m.p}/${mt.protein || '?'}g`);
  } catch {}
  try {
    const done = habits.filter(h => log[h.id]?.completedToday).length;
    parts.push(`Habits today: ${done}/${habits.length}`);
    const risk = habits.filter(h => (log[h.id]?.streak || 0) >= 3 && !log[h.id]?.completedToday).slice(0, 3).map(h => `${h.name} (${log[h.id].streak}d streak)`);
    if (risk.length) parts.push('Streaks at risk: ' + risk.join(', '));
  } catch {}
  try {
    const rec = getRecoveryStatus();
    parts.push(`Training: ${rec.days} sessions last 7 days, ${rec.consecutive} consecutive`);
  } catch {}
  try {
    const sl = sleepLog[today()] || sleepLog[yesterday()];
    if (sl && sl.hours) parts.push(`Last sleep: ${formatSleepShort(sl.hours)}${sl.quality ? ', quality ' + sl.quality + '/5' : ''}`);
  } catch {}
  try {
    const jk = Object.keys(journal || {}).sort().reverse()[0];
    const j = jk ? journal[jk] : null;
    if (j && j.struggle) parts.push(`Recent journal struggle: "${String(j.struggle).slice(0, 100)}"`);
  } catch {}
  try {
    const ps = typeof patternLinesForCoach === 'function' ? patternLinesForCoach(1) : [];
    if (ps.length) parts.push(`A pattern in their own logs (went together, not a cause): ${ps[0]}`);
  } catch {}
  try {
    const why = LS.get('hvi_why', '');
    if (why) parts.push(`Their why: "${String(why).slice(0, 80)}"`);
  } catch {}
  try {
    const goals = (LS.get('hvi_goals', []) || []).filter(g => !g.done).slice(0, 3).map(g => g.text);
    if (goals.length) parts.push('Active goals: ' + goals.join('; '));
  } catch {}
  return parts.join('\n');
}

async function fetchCoachInsight(force) {
  // This one runs by itself when home is drawn, so it never asks: no
  // permission, no request.
  if (typeof aiAllowed === 'function' && !aiAllowed()) throw new Error('ai-consent');
  const t = today();
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('hvi_coach_insight') || 'null'); } catch {}
  if (!force && cached && cached.date === t && cached.text) return cached.text;
  const prompt = `You are Arete Coach, a direct, warm performance coach blending Stoic philosophy and sports science. Based ONLY on this user's data from today, give ONE specific focus or tip for the rest of their day.

DATA:
${_coachInsightContext()}

Rules: 2-3 sentences, maximum 55 words. Speak directly ("you"). Reference at least one of their actual numbers. Be concrete about what to do today. No greetings, no emojis, no markdown, no em dashes, no preamble.`;
  const res = await fetch(_INSIGHT_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 120 } }),
  });
  if (!res.ok) throw new Error('insight fetch failed: ' + res.status);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (!text) throw new Error('empty insight');
  try { localStorage.setItem('hvi_coach_insight', JSON.stringify({ date: t, text })); } catch {}
  return text;
}

function coachInsightCardHTML() {
  try {
    const premium = (typeof isPremium === 'function') ? isPremium() : false;
    if (!premium) {
      return `<div class="ci-card ci-locked ani" onclick="if(typeof showUpgradeModal==='function')showUpgradeModal('coach')" role="button" tabindex="0" aria-label="Coach's Focus, a Premium feature">
        <div class="ci-head"><span class="ci-label">Coach's focus</span><span class="ci-lock">Premium</span></div>
        <div class="ci-text ci-teaser">A daily, personal focus from your AI coach, built from your readiness, training, nutrition and habits.</div>
      </div>`;
    }
    // Not yet asked: offer it, and send nothing. Turned off: stay out of the way.
    const consent = (typeof aiConsent === 'function') ? aiConsent() : 'yes';
    if (consent === 'no') return '';
    if (consent !== 'yes') {
      return `<div class="ci-card ani" onclick="withAIConsent()" role="button" tabindex="0" aria-label="Turn on the coach's daily focus"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();withAIConsent()}">
        <div class="ci-head"><span class="ci-label">Coach's focus</span><span class="ci-lock">Turn on</span></div>
        <div class="ci-text ci-teaser">One line each morning on what to do today. It uses AI, so it asks first.</div>
      </div>`;
    }
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('hvi_coach_insight') || 'null'); } catch {}
    const fresh = cached && cached.date === today() && cached.text;
    if (!fresh) setTimeout(() => _fillCoachInsight(false), 400);
    return `<div class="ci-card ani">
      <div class="ci-head"><span class="ci-label">Coach's focus</span>
        <button class="ci-refresh" onclick="_fillCoachInsight(true)" aria-label="Get a new insight" title="New insight">${(typeof icon === 'function') ? icon('refresh', 13) : '↻'}</button>
      </div>
      <div class="ci-text" id="ci-text">${fresh ? esc(cached.text) : 'Reading your day…'}</div>
    </div>`;
  } catch { return ''; }
}

async function _fillCoachInsight(force) {
  const el = document.getElementById('ci-text');
  if (!el) return;
  if (force) el.textContent = 'Reading your day…';
  try {
    const text = await fetchCoachInsight(force);
    const el2 = document.getElementById('ci-text');
    if (el2) el2.textContent = text;
  } catch {
    const el2 = document.getElementById('ci-text');
    if (el2) el2.textContent = "Couldn't reach your coach right now. Tap ↻ to retry.";
  }
}

// ── PHASE 5: UNIFIED "TODAY" BRIEFING ────────────────────────────────────────
// One daily command-center card at the top of home that composes every module:
// readiness, today's training, the adjusted nutrition target, habit status, a
// journaling prompt, and one coach line. Folds in the standalone readiness card
// and coach nudge so home reads as a single connected briefing.
function dismissBriefCoach() {
  try { localStorage.setItem('hvi_nudge_dismissed', today()); } catch {}
  if (typeof go === 'function' && typeof curView !== 'undefined' && curView === 'home') {
    try { go('home', {}, false); } catch {}
  }
}

// Breakdown modal: shows the factors that make up the readiness score.
// The bars fill in turn once the sheet is up (--w, .rd-visible in style.css),
// and the factor holding the score back is marked so the sheet says what to fix.
function _rdFactorRow(glyph, label, val, weight, limiter = false) {
  const v = Math.round(val);
  const c = 'var(--text)';
  return `<div class="rd-factor${limiter ? ' rd-factor--limiter' : ''}">
    <div class="rd-factor-top">
      <span class="rd-factor-name">${glyph} ${label}</span>
      <span class="rd-factor-val">${v}<span class="rd-factor-unit">/100</span></span>
    </div>
    <div class="rd-bar"><div class="rd-bar-fill" style="--w:${Math.max(3, v)}%;background:${c}"></div></div>
    <div class="rd-factor-weight">${weight}${limiter ? ' · <span class="rd-limiter">holding today back</span>' : ''}</div>
  </div>`;
}

function showReadinessBreakdown() {
  try {
    const existing = document.getElementById('rd-modal');
    if (existing) existing.remove();
    const r = getReadiness();
    const f = r.factors;
    const color = readinessColor(r.score);
    const usingWhoop = f.whoop != null;
    const pct = v => Math.round(v * 100);

    const interp = r.score >= 75 ? 'Primed. Green light to push hard today.'
      : r.score >= 50 ? 'Steady. Train as planned, just don\'t force PRs.'
      : r.score >= 30 ? 'Run down. Dial back intensity and prioritize recovery.'
      : 'Depleted. Make today a recovery day. Sleep and food come first.';

    const ic = (n) => (typeof icon === 'function' ? icon(n, 16) : '');
    // The weakest thing you can act on, and only
    // when it is actually low. Whoop is a reading, so it is never the limiter.
    const acts = usingWhoop ? ['sleep', 'load'] : ['load', 'sleep', 'habits', 'nutrition'];
    let limiter = null, worst = 0.65;
    acts.forEach(k => { if (typeof f[k] === 'number' && f[k] < worst) { worst = f[k]; limiter = k; } });

    const rows = [];
    if (usingWhoop) {
      rows.push(_rdFactorRow(ic('flame'), 'Whoop recovery', f.whoop, 'Leads the score'));
      rows.push(_rdFactorRow(ic('moon'), 'Sleep', pct(f.sleep), 'Fine-tunes', limiter === 'sleep'));
      rows.push(_rdFactorRow(ic('activity'), 'Training load', pct(f.load), 'Fine-tunes', limiter === 'load'));
    } else {
      rows.push(_rdFactorRow(ic('activity'), 'Training load', pct(f.load), '40% of score', limiter === 'load'));
      rows.push(_rdFactorRow(ic('moon'), 'Sleep', pct(f.sleep), '30% of score', limiter === 'sleep'));
      rows.push(_rdFactorRow(ic('check'), 'Habit consistency', pct(f.habits), '15% of score', limiter === 'habits'));
      rows.push(_rdFactorRow(ic('target'), 'Nutrition', pct(f.nutrition), '15% of score', limiter === 'nutrition'));
    }

    const slp = getRecentSleep();
    const slpLogged = !!(slp.hours || slp.quality || typeof slp.whoopRecovery === 'number');

    // Today's biometrics (moved here from the home screen — they explain the score)
    const _t = today();
    const _slToday = (typeof sleepLog !== 'undefined' && sleepLog && sleepLog[_t]) ? sleepLog[_t] : {};
    const _steps = (LS.get('hvi_steps_log', {})[_t]) || 0;
    const _energy = (LS.get('hvi_energy_log', {})[_t]) || 0;
    const _vit = [];
    if (_slToday.hours) _vit.push([ic('moon'), formatSleepShort(_slToday.hours), 'Sleep']);
    if (_steps) _vit.push([ic('footprints'), _steps.toLocaleString(), 'Steps']);
    if (_energy) _vit.push([ic('flame'), _energy, 'kcal active']);
    if (_slToday.restingHR) _vit.push([ic('heart'), _slToday.restingHR, 'Resting HR']);
    if (_slToday.hrv) _vit.push([ic('activity'), _slToday.hrv + ' ms', 'HRV']);
    const vitalsHTML = _vit.length
      ? `<div class="rd-vitals">${_vit.map(v => `<div class="rd-vital"><div class="rd-vital-ic">${v[0]}</div><div class="rd-vital-val">${v[1]}</div><div class="rd-vital-lbl">${v[2]}</div></div>`).join('')}</div>`
      : '';

    const foot = usingWhoop
      ? 'Your Whoop recovery score leads today; sleep and training load adjust it.'
      : 'Each factor contributes the weight shown. Log sleep and meals to sharpen it.';

    const html = `<div id="rd-modal" class="rd-overlay" role="dialog" aria-modal="true" aria-label="Readiness breakdown">
      <div class="rd-sheet">
        <button class="rd-close" onclick="closeReadinessBreakdown()" aria-label="Close">&times;</button>
        <div class="rd-score-wrap">
          <div class="rd-score-ring">${(typeof ring === 'function') ? ring(34, r.score / 100, 4, color) : ''}<div class="rd-score-num" style="color:${color}">${r.score}</div></div>
          <div class="rd-score-meta">
            <div class="rd-score-lbl" style="color:${color}">${r.label}</div>
            <div class="rd-score-cap">Daily readiness</div>
          </div>
        </div>
        <div class="rd-intro">${interp}</div>
        <div class="rd-factors">${rows.join('')}</div>
        ${vitalsHTML}
        ${slpLogged ? '' : `<div class="rd-hint">${ic('moon')} You haven't logged sleep today. Add it to sharpen your score.</div>`}
        <div class="rd-actions">
          <button class="rd-action-btn" onclick="closeReadinessBreakdown();if(typeof go==='function')go('sleep')">${ic('moon')} Log sleep</button>
        </div>
        <div class="rd-foot">${foot}</div>
      </div>
    </div>`;

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    document.body.appendChild(node);
    node.addEventListener('click', e => { if (e.target === node) closeReadinessBreakdown(); });
    // Style has to be computed once in the hidden state, or the sheet, the fade
    // and the bars all appear at their end values with nothing to transition from.
    void node.offsetWidth;
    requestAnimationFrame(() => node.classList.add('rd-visible'));
    if (typeof countUp === 'function') countUp(node.querySelector('.rd-score-num'), r.score, 1000, 100);
    if (typeof track === 'function') track('readiness_breakdown_open', { score: r.score });
  } catch (e) { console.warn('[Arete] readiness breakdown error:', e); }
}

function closeReadinessBreakdown() {
  const m = document.getElementById('rd-modal');
  if (!m) return;
  m.classList.remove('rd-visible');
  setTimeout(() => m.remove(), 250);
}

let _readyRevealUntil = 0;
function todayBriefingHTML() {
  try {
    const t = today();
    const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
    const r = hasReadinessSignal() ? getReadiness() : null;
    const rColor = r ? readinessColor(r.score) : '';
    const mt = getTodaysMacroTargets();
    const m = (typeof getDayMacros === 'function') ? getDayMacros() : { cal: 0, p: 0 };
    const sess = classifyTodaySession();

    const wEntry = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog[t] : null;
    const wLogged = (typeof workoutDoneToday === 'function') ? workoutDoneToday()
      : !!(wEntry && (wEntry.source || (wEntry.exercises || []).some(e => (e.sets || []).some(s => s.completed))));
    const trainVal = wLogged ? 'Done' : (sess.type === 'rest' ? 'Rest' : (sess.dayName || 'Train'));
    const trainLbl = wLogged ? 'Workout' : (sess.type === 'rest' ? 'Recovery' : (sess.type === 'hard' ? 'Heavy day' : 'Training'));

    const calTarget = (mt && mt.calories) ? mt.calories
      : ((typeof dietMeta !== 'undefined' && dietMeta.dailyGoals && dietMeta.dailyGoals.calories) || 0);

    const doneH = Array.isArray(habits) ? habits.filter(h => log[h.id] && log[h.id].completedToday).length : 0;
    const totalH = Array.isArray(habits) ? habits.length : 0;

    const dismissed = (function () { try { return localStorage.getItem('hvi_nudge_dismissed') === t; } catch { return false; } })();
    const nudge = dismissed ? null : getCoachNudge();

    // The first home of the day fills the ring and counts the score up; every
    // later render just shows it. Home is drawn several times in the first few
    // milliseconds of a launch, so renders inside the ring's opening delay keep
    // the reveal — replacing it then is invisible, where dropping it is not.
    let reveal = false;
    if (r && typeof motionOK === 'function' && motionOK() && typeof countUp === 'function') {
      const now = Date.now();
      if (LS.get('hvi_ready_revealed', '') !== t) {
        LS.set('hvi_ready_revealed', t);
        _readyRevealUntil = now + 250;
        setTimeout(() => { try { countUp(document.querySelector('.tb-ready--reveal .tb-ready-num'), r.score, 1200); } catch {} }, 250);
      }
      reveal = now < _readyRevealUntil;
    }
    const readyHTML = r ? `<div class="tb-ready${reveal ? ' tb-ready--reveal' : ''}" onclick="showReadinessBreakdown()" role="button" tabindex="0" aria-label="Readiness ${r.score}, ${r.label}. Tap for breakdown.">
        <div class="tb-ready-ring">${(typeof ring === 'function') ? ring(19, r.score / 100, 3, rColor) : ''}<span class="tb-ready-num" style="color:${rColor}">${reveal ? 0 : r.score}</span></div>
        <div class="tb-ready-lbl">${r.label}</div>
      </div>` : '';

    const coachHTML = nudge ? `<div class="tb-coach">
        <span class="tb-coach-ico">${ic(nudge.icon, 18)}</span>
        <div class="tb-coach-main">
          <div class="tb-coach-text">${esc(nudge.text)}</div>
          <div class="tb-coach-actions">
            <button class="tb-coach-btn" onclick="if(typeof openCoach==='function')openCoach()">Talk to coach</button>
            <button class="tb-coach-x" onclick="dismissBriefCoach()">Dismiss</button>
          </div>
        </div>
      </div>` : '';

    // Four tiles, one glance. Sleep used to be a line of small text with a
    // button under three tiles, and a journal prompt in italics under that.
    const slp = (typeof sleepLog !== 'undefined' && sleepLog) ? (sleepLog[t] || null) : null;
    const slpLogged = !!(slp && (slp.hours || slp.quality));
    const slpVal = slpLogged ? (slp.hours ? formatSleepShort(slp.hours) : `${slp.quality}/5`) : 'Log';
    const of = n => `<span class="tb-cell-sub"> / ${n}</span>`;
    const cell = (view, icoName, val, lbl) => `<div class="tb-cell" onclick="go('${view}')" role="button" tabindex="0"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();go('${view}')}">
        <div class="tb-cell-ico">${ic(icoName, 20)}</div>
        <div class="tb-cell-main"><div class="tb-cell-val">${val}</div><div class="tb-cell-lbl">${lbl}</div></div>
      </div>`;
    return `<div class="today-brief ani">
      <div class="tb-head"><h2 class="tb-title">Today</h2>${readyHTML}</div>
      <div class="tb-grid">
        ${cell('workout', 'activity', esc(String(trainVal)), trainLbl)}
        ${cell('diet', 'target', m.cal.toLocaleString(), calTarget ? `of ${calTarget.toLocaleString()} cal` : 'Calories')}
        ${cell('habits', 'check', doneH + of(totalH), 'Habits')}
        ${cell('sleep', 'moon', slpVal, 'Sleep')}
      </div>
      ${coachHTML}
    </div>`;
  } catch (e) { console.warn('[Arete] briefing error:', e); return ''; }
}
