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
