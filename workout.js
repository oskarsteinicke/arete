// ══════════════════════════════════════════════════════════════════════════
// Arete — Workout Module
// ══════════════════════════════════════════════════════════════════════════

// ── WGER EXERCISE BRIDGE ──────────────────────────────────────────────────
function lookupExercise(eid) {
  if (typeof eid === 'string') return EXERCISES[eid];
  if (typeof eid === 'number') return wgerCache[eid] || null;
  return null;
}

function stripHTML(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function normalizeWgerExercise(info) {
  const t = (info.translations || []).find(x => x.language === 2);
  const name = (t && t.name) || info.name || ('Exercise ' + info.id);
  const muscle = (info.category && info.category.name) || 'Unknown';
  const equipment = info.equipment && info.equipment.length ? info.equipment.map(e => e.name).join(', ') : 'Bodyweight';
  const muscles = (info.muscles || []).map(m => m.name_en).filter(Boolean);
  const description = t ? stripHTML(t.description) : '';
  const image = (info.images && info.images[0] && info.images[0].image) || null;
  const obj = { id: info.id, name, muscle, equipment, muscles, description, image, ds: 3, dr: 10 };
  wgerCache[info.id] = obj;
  LS.set('hvi_wger_cache', wgerCache);
  return obj;
}

async function wgerFetchExercise(id) {
  if (wgerCache[id]) return wgerCache[id];
  try {
    const res = await fetch(`https://wger.de/api/v2/exerciseinfo/${id}/?format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeWgerExercise(data);
  } catch { return null; }
}

function wgerSearch(term) {
  if (!term || term.length < 2) return [];
  const q = term.toLowerCase();
  return Object.entries(EXERCISES)
    .filter(([, ex]) => ex.name.toLowerCase().includes(q) || ex.muscle.toLowerCase().includes(q))
    .map(([id, ex]) => ({ id, name: ex.name, muscle: ex.muscle, equipment: '', ds: ex.ds, dr: ex.dr, _local: true }));
}

async function wgerBrowse(catId, eqId, offset = 0) {
  let url = `https://wger.de/api/v2/exerciseinfo/?format=json&language=2&limit=20&offset=${offset}`;
  if (catId) url += `&category=${catId}`;
  if (eqId) url += `&equipment=${eqId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { results: [], next: null };
    return await res.json();
  } catch { return { results: [], next: null }; }
}

async function wgerBrowseByUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { results: [], next: null };
    return await res.json();
  } catch { return { results: [], next: null }; }
}

function injectExerciseBrowserStyles() {
  if (document.getElementById('exercise-browser-styles')) return;
  const s = document.createElement('style');
  s.id = 'exercise-browser-styles';
  s.textContent = `
    @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:.7} }
    .ex-skeleton{background:var(--surface2);border-radius:10px;height:60px;margin-bottom:8px;animation:pulse 1.4s ease infinite}
    .ex-filter-row{display:flex;overflow-x:auto;gap:8px;padding:0 24px 8px;scrollbar-width:none}
    .ex-filter-row::-webkit-scrollbar{display:none}
    .ex-filter-pill{flex-shrink:0;padding:8px 14px;border-radius:20px;border:1px solid rgba(var(--text-rgb), 0.08);background:var(--surface);color:var(--text-dim);font-size:12px;cursor:pointer;white-space:nowrap;transition:all .2s}
    .ex-filter-pill.active{background:var(--surface2);border-color:var(--accent-b);color:var(--accent-b)}
    .ex-card{background:var(--surface);border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;border:1px solid rgba(var(--text-rgb), 0.04);transition:all .2s;position:relative}
    .ex-card:hover{border-color:rgba(var(--text-rgb), 0.1)}
    .ex-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .ex-card-main{flex:1;min-width:0}
    .ex-card-name{font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px}
    .ex-card-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
    .ex-tag{font-size:10px;color:var(--text-dim);background:var(--surface2);padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:0.5px}
    .ex-card-muscles{font-size:11px;color:var(--text-muted)}
    .ex-card-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
    .ex-thumb{width:30px;height:30px;border-radius:4px;object-fit:cover}
    .ex-add-btn{background:var(--surface2);border:1px solid var(--accent);color:var(--accent-b);padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:700;letter-spacing:0.5px}
    .ex-add-btn:active{transform:scale(0.96)}
    .ex-log-btn{background:var(--accent);border:none;color:var(--on-accent);padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:700;letter-spacing:0.5px;text-transform:uppercase}
    .ex-detail{margin-top:10px;padding-top:10px;border-top:1px solid rgba(var(--text-rgb), 0.06);font-size:12px;color:var(--text-dim);line-height:1.5}
    .ex-detail img{max-width:100%;border-radius:8px;margin:8px 0}
    .ex-detail-pr{color:var(--accent-b);font-size:12px;padding:6px 0;font-weight:600}
    .ex-search-status{color:var(--text-dim);font-size:13px;padding:12px 24px;text-align:center}
    .pr-badge{display:inline-block;margin-left:8px;font-size:11px;color:var(--accent-b);animation:pulse 1s ease 3}
    .ex-browse-more{width:calc(100% - 48px);margin:12px 24px;padding:12px;border-radius:10px;border:1px dashed var(--accent);background:transparent;color:var(--accent-b);font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;text-transform:uppercase}
  `;
  document.head.appendChild(s);
}

// ── Progression helpers ────────────────────────────────────────────────────
// The last session that tested the plan. Sessions built lighter on purpose
// (todaysTrainingCall, from sleep and recovery) are passed over: a deload's
// 60% weight would otherwise become the next starting weight, and a lighter
// session's missing reps would hold back an increase already earned. Only
// when nothing else exists is a lighter one used.
function getLastExerciseSession(exerciseId) {
  const t = today();
  const eid = String(exerciseId);
  const dates = Object.keys(workoutLog).filter(d => d !== t).sort().reverse();
  let lighter = null;
  for (const d of dates) {
    const wl = workoutLog[d];
    const ex = (wl.exercises || []).find(e => String(e.exerciseId) === eid);
    if (!ex || !ex.sets?.some(s => s.completed)) continue;
    if (wl.tier === 'trim' || wl.tier === 'deload') { if (!lighter) lighter = { date: d, ex }; continue; }
    return { date: d, ex };
  }
  return lighter;
}

// ── PROGRESSION ──────────────────────────────────────────────────────────
// Every prescribed rep on every set last time earns the next weight today.
// The tip on each exercise and the weight a session starts at both come from
// progressionCall, so they cannot disagree.
const PROGRESS_STALE_DAYS = 21;   // longer away than this and the weight is held

// The smallest jump a gym actually offers: dumbbells come in 2 kg (5 lb)
// steps, a bar takes 1.25 kg plates either side once the load is light.
function weightStep(exerciseId, w) {
  const lb = typeof isImperial === 'function' && isImperial();
  if (typeof EX_DUMBBELL !== 'undefined' && EX_DUMBBELL.includes(exerciseId)) return lb ? 5 : 2;
  return lb ? (w >= 90 ? 5 : 2.5) : (w >= 40 ? 2.5 : 1.25);
}

function progressionCall(exerciseId, day) {
  const last = getLastExerciseSession(exerciseId);
  if (!last) return { kind: 'first' };
  const working = (last.ex.sets || []).filter(s => !s.warmup);
  const done = working.filter(s => s.completed);
  const weighted = done.filter(s => s.weight > 0 && s.reps > 0);
  const daysAgo = Math.max(1, Math.round((new Date(today()) - new Date(last.date)) / 86400000));
  const base = { last, working, done, daysAgo };
  if (!weighted.length) return Object.assign(base, { kind: done.some(s => s.reps > 0) ? 'bodyweight' : 'none' });

  const from = Math.max(...weighted.map(s => s.weight));
  const top = weighted.filter(s => s.weight === from);
  // The target belongs to the program: its own prescription when it has one,
  // otherwise the exercise's. Read from last time, it chased itself.
  const rx = day && typeof programRx === 'function' ? programRx(day, exerciseId) : null;
  const meta = lookupExercise(exerciseId);
  const targetReps = rx ? rx[1] : (meta && meta.dr) || working[0]?.reps || 8;
  const allSets = done.length >= working.length && (!rx || top.length >= rx[0]);
  const allReps = top.every(s => s.reps >= targetReps);
  const to = +(from + weightStep(exerciseId, from)).toFixed(2);
  Object.assign(base, { from, to, top, targetReps });
  if (!allSets) return Object.assign(base, { kind: 'hold', why: 'sets' });
  if (!allReps) return Object.assign(base, { kind: 'hold', why: 'reps' });
  if (daysAgo > PROGRESS_STALE_DAYS) return Object.assign(base, { kind: 'hold', why: 'stale' });
  return Object.assign(base, { kind: 'earned' });
}

// "8 × 3", or "8, 8, 5" when the sets differ. Never an average: 8, 8, 5 is
// not "7".
function _repsLabel(sets) {
  const reps = sets.map(s => s.reps);
  return reps.every(r => r === reps[0]) ? `${reps[0]}${reps.length > 1 ? ` \u00d7 ${reps.length}` : ''}` : reps.join(', ');
}
function _fmtW(w) { return String(+(+w).toFixed(2)); }

// The single best working set: heaviest, and among equal weights the one with
// the most reps. Prefill used to take the heaviest weight from anywhere in the
// session and the reps from whichever set happened to be last, so 100x8, 100x8,
// 80x15 produced 100x15 — a set nobody performed.
function topWorkingSet(sets) {
  let top = null;
  for (const s of (sets || [])) {
    if (!s.completed || s.warmup) continue;
    if (!top || s.weight > top.weight ||
        (s.weight === top.weight && s.reps > top.reps)) top = s;
  }
  return top;
}

function getProgressionTip(exerciseId, day) {
  const c = progressionCall(exerciseId, day);
  if (c.kind === 'first') return { type: 'first', msg: 'First time — focus on form, pick a manageable weight' };
  if (c.kind === 'none') return null;
  const n = c.daysAgo;
  const dLabel = n === 1 ? 'yesterday' : n <= 6 ? `${n}d ago` : `${Math.floor(n / 7)}w ago`;
  if (c.kind === 'bodyweight') {
    const bw = c.done.filter(s => s.reps > 0);
    const maxReps = Math.max(...bw.map(s => s.reps));
    if (c.done.length >= c.working.length) return { type: 'increase', msg: `Last: ${maxReps} reps/set ${dLabel} — try +1 rep per set today` };
    return { type: 'maintain', msg: `${c.done.length}/${c.working.length} sets ${dLabel} — hit all sets before adding reps` };
  }
  const u = wtUnit();
  const label = _repsLabel(c.top);
  if (c.kind === 'earned') return { type: 'increase', msg: `All sets hit (${_fmtW(c.from)} ${u} \u00d7 ${label}) ${dLabel} — try ${_fmtW(c.to)} ${u} today` };
  if (c.why === 'stale') return { type: 'maintain', msg: `Last: ${_fmtW(c.from)} ${u} \u00d7 ${label} ${dLabel} — it has been a while, so the same weight today` };
  if (c.why === 'reps') return { type: 'maintain', msg: `Last: ${_fmtW(c.from)} ${u} \u00d7 ${label} ${dLabel} — hit ${c.targetReps} before going heavier` };
  return { type: 'maintain', msg: `${c.done.length}/${c.working.length} sets at ${_fmtW(c.from)} ${u} ${dLabel} — complete all sets first` };
}

// What the note on an exercise in today's session says. A raised weight says
// why and can be taken back until its sets are done.
function progressionNoteHTML(we, ei, day, wl) {
  const u = wtUnit();
  const open = we.sets.some(s => !s.completed && !s.warmup);
  if (we.raised) {
    const r = we.raised;
    const msg = r.kept
      ? `Kept at ${_fmtW(r.from)} ${u}. You earned ${_fmtW(r.to)} ${u} last time.`
      : `Up to ${_fmtW(r.to)} ${u}. Every rep at ${_fmtW(r.from)} ${u} last time.`;
    const btn = open ? `<button class="w-ex-tip-btn" onclick="event.stopPropagation();setRaise(${ei}, ${r.kept ? 'true' : 'false'})">${r.kept ? `Go up to ${_fmtW(r.to)} ${u}` : `Keep ${_fmtW(r.from)} ${u}`}</button>` : '';
    return `<div class="w-ex-tip w-ex-tip-${r.kept ? 'maintain' : 'up'}"><span>${msg}</span>${btn}</div>`;
  }
  let c = null;
  try { c = progressionCall(we.exerciseId, day); } catch (e) {}
  // Earned, but today was built lighter or the full plan was chosen on a short night.
  if (c && c.kind === 'earned' && wl && (wl.tier === 'trim' || wl.tier === 'deload' || wl.asPlanned)) {
    return `<div class="w-ex-tip w-ex-tip-maintain"><span>You earned ${_fmtW(c.to)} ${u} last time. It waits for a better night.</span></div>`;
  }
  let tip = null;
  try { tip = getProgressionTip(we.exerciseId, day); } catch (e) {}
  return tip ? `<div class="w-ex-tip w-ex-tip-${tip.type}"><span>${tip.msg}</span></div>` : '';
}

// Take a raise back, or put it back. Only sets not yet done are changed, and
// only ones still at the weight the raise set, so a hand-typed weight stays.
function setRaise(ei, on) {
  const wl = workoutLog[today()];
  const we = wl && wl.exercises[ei];
  if (!we || !we.raised) return;
  const want = on ? we.raised.to : we.raised.from;
  const was = on ? we.raised.from : we.raised.to;
  we.sets.forEach(s => { if (!s.completed && !s.warmup && s.weight === was) s.weight = want; });
  we.raised.kept = !on;
  _wSave(wl);
  if (typeof track === 'function') track('progression_choice', { raise: !!on });
  if (curView === 'workoutActive') rerenderWorkoutActive();
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: WORKOUT
// ══════════════════════════════════════════════════════════════════════════
function _workoutStats() {
  // Only days with a completed set. An opened session with nothing logged
  // (or one prepared from the Workout tab) is not a session.
  const dates = Object.keys(workoutLog).filter(d => trainedOnDay(d)).sort().reverse();
  const thisWeek = dates.filter(d => {
    const diff = (new Date(today() + 'T12:00') - new Date(d + 'T12:00')) / 86400000;
    return diff >= 0 && diff < 7;
  }).length;
  const totalSessions = dates.length;
  const totalVolume = dates.reduce((sum, d) => {
    const wl = workoutLog[d];
    if (!wl?.exercises) return sum;
    return sum + wl.exercises.reduce((es, ex) =>
      es + (ex.sets || []).filter(s => s.completed && !s.warmup).reduce((ss, s) => ss + (s.weight || 0) * (s.reps || 0), 0), 0);
  }, 0);
  const prCount = Object.keys(prs).length;
  return { thisWeek, totalSessions, totalVolume, prCount };
}

// What the last finished session changed elsewhere; renderWorkout shows it
// once and clears it. Memory only: a relaunch should not replay it.
let _sessionFed = null;
function renderWorkout() {
  const prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const dayCount = prog.days.length;
  const dayIdx = workoutMeta.currentDayIndex % dayCount;
  const day = prog.days[dayIdx];
  const todayLog = workoutLog[today()];
  const stats = _workoutStats();
  // What today's session is (or will be) built with, so the list matches it.
  const previewTier = _wIsTouched(todayLog) ? (todayLog.tier || 'full')
    : (todayLog && todayLog.asPlanned) ? 'full' : _todaysTier();
  // Lifts that start heavier than last time: from the session once it exists
  // for this day, otherwise from what it will be built with.
  let upCount = 0;
  try {
    if (todayLog && todayLog.programId === prog.id && todayLog.dayIndex === workoutMeta.currentDayIndex && todayLog.exercises) {
      upCount = todayLog.exercises.filter(e => e.raised && !e.raised.kept).length;
    } else if (previewTier === 'full') {
      upCount = day.ex.filter(eid => progressionCall(eid, day).kind === 'earned').length;
    }
  } catch (e) {}

  const exPreviewHTML = day.ex.length ? `
    <div class="w-ex-preview-list">
      ${day.ex.map(eid => {
        const ex = lookupExercise(eid);
        if (!ex) return '';
        let rx = programRx(day, eid);
        if (rx && previewTier !== 'full') { const p = adjustPrescription(rx[0], rx[1], 0, previewTier); rx = [p.sets, p.reps]; }
        return `<div class="w-ex-preview-item">
          <span class="w-ex-preview-name">${esc(ex.name)}</span>
          <span class="w-ex-preview-muscle">${rx ? `${rx[0]} × ${rx[1]}` : esc(ex.muscle)}</span>
        </div>`;
      }).filter(Boolean).join('')}
    </div>` : '';

  // Shown once, on the render straight after finishing a session.
  const fed = _sessionFed;
  _sessionFed = null;
  const fedHTML = (fed && typeof sessionFedHTML === 'function') ? sessionFedHTML(fed) : '';

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Workout</div></div>
    ${fedHTML}

    <div class="w-stats-strip ani w-stats-tap" role="button" tabindex="0" aria-label="View progress"
         onclick="go('workoutProgress')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();go('workoutProgress')}">
      <div class="w-stat-item"><div class="w-stat-val">${stats.thisWeek}</div><div class="w-stat-lbl">This week</div></div>
      <div class="w-stat-item"><div class="w-stat-val">${stats.totalSessions}</div><div class="w-stat-lbl">Sessions</div></div>
      <div class="w-stat-item"><div class="w-stat-val">${stats.totalVolume >= 1000 ? (stats.totalVolume/1000).toFixed(0)+'k' : stats.totalVolume}</div><div class="w-stat-lbl">${wtUnit()} lifted</div></div>
      <div class="w-stat-item"><div class="w-stat-val">${stats.prCount}</div><div class="w-stat-lbl">Records</div></div>
    </div>

    ${typeof trainingAdviceHTML === 'function' ? trainingAdviceHTML() : ''}

    <div class="w-day-nav ani">
      <button class="w-day-arrow" onclick="shiftWorkoutDay(-1)">&#8249;</button>
      <div class="w-day-label"><b>${esc(prog.name)}</b>Day ${dayIdx + 1} of ${dayCount}</div>
      <button class="w-day-arrow" onclick="shiftWorkoutDay(1)">&#8250;</button>
    </div>
    <div class="w-hero-card ani" onclick="go('workoutActive')">
      <div class="w-hero-glow"></div>
      <h2 class="w-hero-day">${esc(day.name)}</h2>
      <div class="w-hero-focus">${esc(day.focus)}</div>
      ${upCount ? `<div class="w-hero-up">Heavier on ${upCount} ${upCount === 1 ? 'lift' : 'lifts'} today</div>` : ''}
      ${exPreviewHTML}
      <div class="w-hero-cta ${workoutDoneToday() ? 'done' : ''}">${workoutDoneToday() ? 'Logged today. Open session' : 'Start workout'}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 24px 8px">
      <button class="w-action-btn w-progress-btn" style="margin:0;width:100%;grid-column:1/-1" onclick="go('workoutProgress')">${typeof icon === 'function' ? icon('trend', 16) : ''} Progress</button>
      <button class="w-action-btn" style="margin:0;width:100%" onclick="go('workoutPicker')">Programs</button>
      <button class="w-action-btn" style="margin:0;width:100%" onclick="go('workoutHistory')">History</button>
      <button class="w-action-btn" style="margin:0;width:100%" onclick="go('workoutAI')">+ Create</button>
      <button class="w-action-btn" style="margin:0;width:100%" onclick="browserContext=null;go('exerciseBrowser')">Exercises</button>
    </div>`;
  if (fedHTML && typeof animateSessionFed === 'function') animateSessionFed();
}

function renderWorkoutPicker() {
  const builtIn = WORKOUT_PROGRAMS.map(p => `
    <div class="w-card ani${p.id===workoutMeta.activeProgram?' active':''}" onclick="selectProgram('${p.id}')">
      <div class="w-card-name">${p.name}</div>
      <div class="w-card-desc">${p.desc}</div>
      <div class="w-card-days">${p.days.length}-day rotation: ${p.days.map(d=>d.name).join(', ')}</div>
    </div>`).join('');

  const custom = LS.get('hvi_custom_programs', []).map(p => `
    <div class="w-card ani${p.id===workoutMeta.activeProgram?' active':''}" style="position:relative" onclick="selectProgram('${p.id}')">
      <div class="w-day-badge" style="margin-bottom:6px">CUSTOM</div>
      <div class="w-card-name">${esc(p.name)}</div>
      <div class="w-card-desc">${esc(p.desc)}</div>
      <div class="w-card-days">${p.days.length}-day rotation: ${p.days.map(d=>esc(d.name)).join(', ')}</div>
      <div style="position:absolute;top:12px;right:12px;display:flex;gap:6px">
        <button class="d-del-btn" style="font-size:14px;padding:4px 8px" onclick="event.stopPropagation();editCustomProgram('${p.id}')">${typeof icon==='function'?icon('edit',14):'✎'}</button>
        <button class="d-del-btn" style="font-size:18px" onclick="event.stopPropagation();deleteCustomProgram('${p.id}')">×</button>
      </div>
    </div>`).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Programs</div></div>
    <div class="w-card w-card-ai ani" onclick="go('workoutAI')" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();go('workoutAI')}">
      <div class="w-card-name">Build one from your goal</div>
      <div class="w-card-desc">Say what you are training for. Arete writes the program.</div>
    </div>
    ${builtIn}${custom}
    <div class="w-card ani" style="text-align:center;border-style:dashed" onclick="initBuilder();go('workoutBuilder')">
      <div style="font-size:24px;color:var(--accent);margin-bottom:4px">+</div>
      <div class="w-card-name">Build it by hand</div>
      <div class="w-card-desc">Pick the days and exercises yourself.</div>
    </div>`;
}

function selectProgram(id) {
  const prog = findProgram(id);
  if (!prog) return;
  workoutMeta.activeProgram = id;
  workoutMeta.currentDayIndex = 0;
  LS.set('hvi_workout_meta', workoutMeta);
  go('workout');
}

// ── LIVE-SESSION SURGICAL UPDATES ───────────────────────────────────────
// Set actions update the DOM in place (no full re-render): no scroll jump,
// no phantom history entries, no keyboard dismissal mid-set.
let _wExInfoOpen = new Set(); // exerciseIds whose info panel is open (per session)

function _setRowHTML(ei, si, s) {
  const isWarmup = s.warmup;
  return `
      <div class="w-set${isWarmup ? ' w-set-warmup' : ''}" id="w-set-${ei}-${si}">
        <span class="w-set-num" id="w-setnum-${ei}-${si}" onclick="toggleWarmup(${ei},${si})" title="${isWarmup ? 'Warmup set — tap to make working' : 'Tap to mark as warmup'}" style="cursor:pointer">${isWarmup ? 'W' : si + 1}</span>
        <input class="w-input" type="number" inputmode="decimal" value="${s.weight || ''}" placeholder="${wtUnit()}" aria-label="Weight set ${si + 1}" onfocus="this.select()" oninput="updateSet(${ei},${si},'weight',this.value)">
        <span class="w-input-label" aria-hidden="true">×</span>
        <input class="w-input" type="number" inputmode="decimal" value="${s.reps || ''}" placeholder="reps" aria-label="Reps set ${si + 1}" onfocus="this.select()" oninput="updateSet(${ei},${si},'reps',this.value)">
        <div class="w-set-check${s.completed ? ' done' : ''}" id="w-check-${ei}-${si}" onclick="toggleSet(${ei},${si})" role="checkbox" aria-checked="${!!s.completed}" aria-label="Complete set ${si + 1}" tabindex="0">✓</div>
      </div>`;
}

// Dim/mark an exercise card once every set in it is complete
function _refreshExDone(ei) {
  const t = today(), wl = workoutLog[t];
  const card = document.getElementById(`w-ex-${ei}`);
  if (!wl || !card || !wl.exercises[ei]) return;
  const sets = wl.exercises[ei].sets;
  card.classList.toggle('w-ex-done', sets.length > 0 && sets.every(s => s.completed));
}

// Full re-render that keeps the scroll position — only for structural changes
// (reorder / swap), never for plain set taps.
function rerenderWorkoutActive() {
  const v = document.getElementById('view');
  const st = v ? v.scrollTop : 0;
  renderWorkoutActive();
  const v2 = document.getElementById('view');
  if (v2) v2.scrollTop = st;
}

// A workout entry is "touched" once the user has logged anything into it.
// Touched entries are never rebuilt automatically — losing a half-finished
// session mid-gym is the worst thing this screen can do.
function _wIsTouched(wl) {
  if (!wl) return false;
  if (wl.touched) return true;
  // Entries written before the touched flag existed
  if (wl.notes) return true;
  return (wl.exercises || []).some(e => (e.sets || []).some(s => s.completed || s.warmup));
}

// Mark today's entry as user-logged, then persist. Every mutation the user
// makes on the active workout screen goes through this.
function _wSave(wl) {
  if (wl) wl.touched = true;
  LS.set('hvi_workout_log', workoutLog);
}

// ── TODAY'S SETS FROM SLEEP AND RECOVERY ─────────────────────────────────
// todaysTrainingCall() (connect.js) reads last night and the last week; this
// is what it does to the sets. A trim drops a set and a couple of reps and
// keeps the weight; a deload keeps the sets and takes the weight to about 60%.
// Nothing here ever adds weight, however good the night was.
function adjustPrescription(sets, reps, weight, tier) {
  if (tier === 'trim') {
    return { sets: sets > 2 ? sets - 1 : sets, reps: reps > 5 ? reps - 2 : reps > 1 ? reps - 1 : reps, weight };
  }
  if (tier === 'deload') {
    const inc = (typeof isImperial === 'function' && isImperial()) ? 5 : 2.5;
    return { sets, reps, weight: weight > inc ? Math.max(inc, Math.round(weight * 0.6 / inc) * inc) : weight };
  }
  return { sets, reps, weight };
}

function _todaysTier() {
  const call = typeof todaysTrainingCall === 'function' ? todaysTrainingCall() : null;
  return call ? call.tier : 'full';
}

// One day of a program as today's session, before anything is logged.
function _buildSession(prog, dayIndex, tier, asPlanned) {
  const day0 = prog.days[dayIndex % prog.days.length];
  const entry = { programId: prog.id, dayIndex, tier: tier || 'full', exercises: day0.ex.map(eid => {
    const ex = lookupExercise(eid);
    // A program may prescribe its own sets and reps (day.rx, written by the
    // AI builder). Without one, the exercise's defaults apply.
    const rx = programRx(day0, eid);
    const ds = rx ? rx[0] : (ex ? ex.ds : 3);
    const dr = rx ? rx[1] : (ex ? ex.dr : 10);
    // Auto-fill weight/reps from last session
    // Prefill from one real set, not a mix of two. This used to take the
    // heaviest weight from anywhere in the session and the reps from
    // whichever set happened to be last, so 100x8, 100x8, 80x15 prefilled
    // 100x15 — a set that was never performed and cannot be.
    const last = getLastExerciseSession(eid);
    const top = topWorkingSet(last?.ex.sets);
    // Every rep last time earns the next weight, on a day built as planned.
    // A lighter day, or the full plan chosen on a short night, waits.
    const call = progressionCall(eid, day0);
    const raise = !!(tier === 'full' && !asPlanned && call.kind === 'earned');
    const lastW = raise ? call.to : (top ? top.weight : 0);
    // A prescribed rep target wins over whatever was done last time: five
    // heavy reps is the point of a strength block, not a suggestion. A new
    // weight starts back at the target, not at last time's extra reps.
    const lastR = rx ? rx[1] : raise ? call.targetReps : (top ? top.reps : dr);
    const p = adjustPrescription(ds, lastR, lastW, tier);
    const entry = { exerciseId: eid, sets: Array.from({length: p.sets}, () => ({weight: p.weight, reps: p.reps, completed: false})) };
    if (raise) entry.raised = { from: call.from, to: call.to };
    return entry;
  })};
  if (asPlanned) entry.asPlanned = true;
  return entry;
}

// "Train as planned" and back. Only before anything is logged: a started
// session is never rebuilt.
function setSessionPlan(asPlanned) {
  const t = today();
  if (_wIsTouched(workoutLog[t])) return;
  const prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  workoutLog[t] = _buildSession(prog, workoutMeta.currentDayIndex, asPlanned ? 'full' : _todaysTier(), asPlanned);
  LS.set('hvi_workout_log', workoutLog);
  if (typeof track === 'function') track('session_plan', { as_planned: !!asPlanned, tier: _todaysTier() });
  if (curView === 'workoutActive') rerenderWorkoutActive();
  else if (curView === 'workout') renderWorkout();
}

function renderWorkoutActive() {
  let prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const t = today();
  const existing = workoutLog[t];

  if (_wIsTouched(existing)) {
    // The program/day pointer can drift underneath an in-progress session
    // (cloud pull from another device, midnight rollover, a custom program
    // that hadn't loaded yet). Follow the session that's already been logged
    // rather than rebuilding it — rebuilding wipes every set tracked so far.
    if (existing.programId !== prog.id || existing.dayIndex !== workoutMeta.currentDayIndex) {
      const own = findProgram(existing.programId);
      if (own) { prog = own; workoutMeta.activeProgram = own.id; }
      if (typeof existing.dayIndex === 'number') workoutMeta.currentDayIndex = existing.dayIndex;
      LS.set('hvi_workout_meta', workoutMeta);
    }
  } else {
    // Nothing logged yet, so it's safe to (re)build for the current day
    // Sleep or a Whoop score can land after the screen was first opened.
    // Nothing has been logged yet, so the sets can still follow it.
    const asPlanned = !!(existing && existing.asPlanned);
    const tier = asPlanned ? 'full' : _todaysTier();
    const needsInit = !existing ||
      existing.programId !== prog.id ||
      existing.dayIndex !== workoutMeta.currentDayIndex ||
      (existing.tier || 'full') !== tier;
    if (needsInit) {
      workoutLog[t] = _buildSession(prog, workoutMeta.currentDayIndex, tier, asPlanned);
      LS.set('hvi_workout_log', workoutLog);
    }
  }

  const day = prog.days[workoutMeta.currentDayIndex % prog.days.length];
  const wl = workoutLog[t];

  // Trigger background fetch for any missing wger exercises. When the data
  // arrives, never yank the screen: if the user is typing, patch the name in
  // place; otherwise re-render with the scroll position preserved.
  wl.exercises.forEach(we => {
    if (typeof we.exerciseId === 'number' && !wgerCache[we.exerciseId]) {
      wgerFetchExercise(we.exerciseId).then(ex => {
        if (!ex || curView !== 'workoutActive') return;
        const ae = document.activeElement;
        const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
        if (!typing) { rerenderWorkoutActive(); return; }
        const cur = (workoutLog[today()] || {}).exercises || [];
        const idx = cur.findIndex(w => w.exerciseId === we.exerciseId);
        if (idx < 0) return;
        const n = document.getElementById(`w-ex-name-${idx}`);
        if (n) n.textContent = ex.name;
        const m = document.getElementById(`w-ex-muscle-${idx}`);
        if (m) m.textContent = ex.muscle || '';
      });
    }
  });

  const exHTML = wl.exercises.map((we, ei) => {
    const ex = lookupExercise(we.exerciseId);
    const name = ex ? ex.name : 'Exercise data loading…';
    const muscle = ex ? ex.muscle : '';
    const tipHTML = progressionNoteHTML(we, ei, day, wl);
    const setsHTML = we.sets.map((s, si) => _setRowHTML(ei, si, s)).join('');
    const canRemove = we.sets.length > 1;
    const muscles = ex && ex.muscles && ex.muscles.length ? ex.muscles.join(', ') : '';
    const desc = ex && ex.description ? ex.description.slice(0, 150) : '';
    const img = ex && ex.image ? `<img src="${ex.image}" style="max-width:100%;border-radius:8px;margin-top:6px">` : '';
    const infoOpen = _wExInfoOpen.has(String(we.exerciseId));
    const infoHTML = (muscles || desc) ? `<div class="w-ex-info" id="w-ex-info-${ei}" style="display:${infoOpen ? 'block' : 'none'}">
      ${muscles ? `<div style="font-size:11px;color:var(--accent-b);margin-bottom:4px">💪 ${esc(muscles)}</div>` : ''}
      ${desc ? `<div style="font-size:11px;color:var(--text-dim);line-height:1.4">${esc(desc)}</div>` : ''}
      ${img}
    </div>` : '';
    const canMoveUp = ei > 0;
    const canMoveDown = ei < wl.exercises.length - 1;
    const allDone = we.sets.length > 0 && we.sets.every(s => s.completed);
    const rest = restFor(we.exerciseId);
    return `<div class="w-ex ani${allDone ? ' w-ex-done' : ''}" id="w-ex-${ei}">
      <div class="w-ex-head" onclick="toggleExInfo(${ei})"><div><div class="w-ex-name" id="w-ex-name-${ei}">${esc(name)}</div><div class="w-ex-muscle" id="w-ex-muscle-${ei}">${esc(muscle)}${muscles || desc ? ' <span style=&quot;font-size:9px;opacity:0.5&quot;>ⓘ</span>' : ''}</div></div>${buildExerciseSparkline(we.exerciseId)}</div>
      <div class="w-ex-actions">
        ${canMoveUp ? `<button class="w-ex-act-btn" onclick="reorderExercise(${ei},-1)" title="Move up">↑</button>` : ''}
        ${canMoveDown ? `<button class="w-ex-act-btn" onclick="reorderExercise(${ei},1)" title="Move down">↓</button>` : ''}
        <button class="w-ex-act-btn" onclick="swapExercise(${ei})" title="Swap exercise">⇄</button>
        <button class="w-ex-act-btn" onclick="removeExercise(${ei})" title="Remove exercise" style="color:var(--fat)">\u00d7</button>
      </div>
      ${infoHTML}
      ${tipHTML}
      <div id="w-sets-${ei}">${setsHTML}</div>
      <div class="w-set-actions">
        <button class="w-add-set" onclick="addSet(${ei})">+ Add Set</button>
        <button class="w-add-set" id="w-rm-${ei}" style="color:var(--fat);opacity:0.5;${canRemove ? '' : 'display:none'}" onclick="removeSet(${ei})">− Remove Set</button>
        <button class="w-rest-chip" id="w-rest-${ei}" onclick="toggleRestPicker(${ei})" aria-expanded="false" aria-controls="w-rest-pick-${ei}" aria-label="${_restAria(rest)}">${icon('timer', 13)}<span>${_fmtRest(rest)}</span></button>
      </div>
      <div class="w-rest-pick" id="w-rest-pick-${ei}" role="group" aria-label="Rest between sets" hidden>${
        REST_CHOICES.map(sec => `<button class="w-rest-opt${sec === rest ? ' on' : ''}" data-sec="${sec}" aria-pressed="${sec === rest}" onclick="pickRest(${ei},${sec})">${_fmtRest(sec)}</button>`).join('')
      }</div></div>`;
  }).join('');

  // Removing every exercise used to leave a blank screen with no route forward:
  // nothing on this view can add one, so the only way out was the nav bar.
  const emptyHTML = wl.exercises.length ? '' : `<div class="w-card ani" style="text-align:center;padding:32px 24px">
    <div style="font-family:var(--serif);font-size:20px;color:var(--text);margin-bottom:6px">Nothing left in today's session</div>
    <div style="font-size:13px;color:var(--text-dim);margin-bottom:18px">Add an exercise to keep going, or pick a different day.</div>
    <button class="w-action-btn" style="margin:0" onclick="go('exerciseBrowser')">Browse exercises</button>
  </div>`;

  document.getElementById('view').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <button class="back" onclick="stopWorkoutTimer();go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
      <div class="workout-elapsed-pill"><span class="workout-elapsed-dot"></span><span id="workout-elapsed">0:00</span></div>
    </div>
    <div class="page-head ani"><div class="w-day-badge">${day.name}</div><div class="page-title">${prog.name}</div><div class="page-sub">${day.focus}</div></div>
    ${typeof trainingAdviceHTML === 'function' ? trainingAdviceHTML('session') : ''}
    ${exHTML}${emptyHTML}
    <div id="rest-timer-bar" class="rt-bar" style="display:none"></div>
    <div class="rt-presets">
      <span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px">Rest</span>
      <button class="rt-preset-btn" onclick="startRestTimer(60)">1:00</button>
      <button class="rt-preset-btn" onclick="startRestTimer(90)">1:30</button>
      <button class="rt-preset-btn" onclick="startRestTimer(120)">2:00</button>
      <button class="rt-preset-btn" onclick="startRestTimer(180)">3:00</button>
      <span class="rt-tools">
        <button class="rt-preset-btn" onclick="showPlateCalc()" style="background:var(--surface2);border:1px solid var(--border2)">Plates</button>
        <button class="rt-preset-btn" onclick="show1RMCalc()" style="background:var(--surface2);border:1px solid var(--border2)">1RM</button>
      </span>
    </div>
    <div class="w-notes-wrap">
      <div class="j-lbl" style="padding:0 0 8px">Workout Notes</div>
      <textarea class="j-ta" id="w-notes" placeholder="How did it feel? Any pain or PRs to note…" rows="2" oninput="_saveWorkoutNotes()">${esc(wl.notes||'')}</textarea>
    </div>
    <button class="w-finish" onclick="finishWorkout()">Finish Workout</button>`;
  startWorkoutTimer();
}

function updateSet(ei, si, field, val) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  let num = field === 'weight' ? parseFloat(val) || 0 : parseInt(val) || 0;
  if (num < 0) num = 0;
  if (field === 'weight' && num > 2000) num = 2000;
  if (field === 'reps' && num > 999) num = 999;
  wl.exercises[ei].sets[si][field] = num;
  _wSave(wl);
}

function toggleExInfo(ei) {
  const el = document.getElementById('w-ex-info-' + ei);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  // Remember by exerciseId (stable across reorders) so re-renders keep it open
  try {
    const eid = String(workoutLog[today()].exercises[ei].exerciseId);
    if (open) _wExInfoOpen.add(eid); else _wExInfoOpen.delete(eid);
  } catch {}
}

function toggleSet(ei, si) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const set = wl.exercises[ei].sets[si];
  set.completed = !set.completed;
  _wSave(wl);
  haptic(set.completed ? 12 : 6);

  // In-place update: flip the checkmark, refresh the card's done state
  const chk = document.getElementById(`w-check-${ei}-${si}`);
  if (chk) {
    chk.classList.toggle('done', set.completed);
    chk.setAttribute('aria-checked', String(!!set.completed));
    chk.classList.remove('w-pop');
    if (set.completed) { void chk.offsetWidth; chk.classList.add('w-pop'); }
  }
  const setRow = document.getElementById(`w-set-${ei}-${si}`);
  if (setRow) {
    setRow.classList.remove('w-set-flash');
    if (set.completed) { void setRow.offsetWidth; setRow.classList.add('w-set-flash'); }
  }
  _refreshExDone(ei);

  if (set.completed) checkDailyQuests();
  if (set.completed && !set.warmup && set.weight > 0 && set.reps > 0) {
    const eid = wl.exercises[ei].exerciseId;
    const ex = lookupExercise(eid);
    const cur = prs[eid];
    const newVol = set.weight * set.reps;
    const curVol = cur ? cur.weight * cur.reps : 0;
    if (!cur || set.weight > cur.weight || newVol > curVol) {
      prs[eid] = { weight: set.weight, reps: set.reps, date: t, name: ex ? ex.name : '' };
      LS.set('hvi_prs', prs);
      awardXP(100, 'body');
      const row = document.getElementById(`w-set-${ei}-${si}`);
      if (row && !row.querySelector('.pr-badge')) {
        row.insertAdjacentHTML('beforeend', '<span class="pr-badge">🏆 New PR!</span>');
        setTimeout(() => { const b = row.querySelector('.pr-badge'); if (b) b.remove(); }, 2500);
      }
    }
  }
  // Rest for this exercise's own time. This used to pass restTimerDur, which
  // is whatever ran last, so a 1:30 tapped once after curls became the rest
  // for squats too. Off arms nothing.
  if (set.completed) {
    const sec = restFor(wl.exercises[ei].exerciseId);
    if (sec > 0) startRestTimer(sec);
  }
}

function addSet(ei) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const ex = lookupExercise(wl.exercises[ei].exerciseId);
  const dr = ex ? ex.dr : 10;
  const sets = wl.exercises[ei].sets;
  const last = sets[sets.length - 1];
  sets.push({ weight: last?.weight || 0, reps: last?.reps || dr, completed: false });
  _wSave(wl);
  // Append the new row in place
  const wrap = document.getElementById(`w-sets-${ei}`);
  if (wrap) wrap.insertAdjacentHTML('beforeend', _setRowHTML(ei, sets.length - 1, sets[sets.length - 1]));
  else { rerenderWorkoutActive(); return; }
  const rm = document.getElementById(`w-rm-${ei}`);
  if (rm) rm.style.display = '';
  _refreshExDone(ei); // a fresh incomplete set un-dims a finished card
}

// Removes the last set of an exercise (keeps at least one)
function removeSet(ei) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const sets = wl.exercises[ei].sets;
  if (sets.length <= 1) return; // keep at least 1 set
  sets.pop();
  _wSave(wl);
  // Remove the last row in place
  const row = document.getElementById(`w-set-${ei}-${sets.length}`);
  if (row) row.remove();
  else { rerenderWorkoutActive(); return; }
  if (sets.length <= 1) {
    const rm = document.getElementById(`w-rm-${ei}`);
    if (rm) rm.style.display = 'none';
  }
  _refreshExDone(ei);
}

// ── WARMUP SET TOGGLE ───────────────────────────────────────────────────
function toggleWarmup(ei, si) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const s = wl.exercises[ei].sets[si];
  s.warmup = !s.warmup;
  _wSave(wl);
  // Update the row in place
  const row = document.getElementById(`w-set-${ei}-${si}`);
  if (row) row.classList.toggle('w-set-warmup', !!s.warmup);
  const num = document.getElementById(`w-setnum-${ei}-${si}`);
  if (num) {
    num.textContent = s.warmup ? 'W' : String(si + 1);
    num.title = s.warmup ? 'Warmup set — tap to make working' : 'Tap to mark as warmup';
  }
}

// ── EXERCISE REORDER ────────────────────────────────────────────────────
function reorderExercise(ei, dir) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const newIdx = ei + dir;
  if (newIdx < 0 || newIdx >= wl.exercises.length) return;
  const tmp = wl.exercises[ei];
  wl.exercises[ei] = wl.exercises[newIdx];
  wl.exercises[newIdx] = tmp;
  _wSave(wl);
  rerenderWorkoutActive();
}

// ── REMOVE EXERCISE ─────────────────────────────────────────────────────
// Sets could be removed one at a time but a whole exercise could not, so
// dropping something you decided not to do meant emptying it set by set and
// leaving a stub behind.
function removeExercise(ei) {
  const t = today(), wl = workoutLog[t];
  if (!wl || !wl.exercises[ei]) return;
  const we = wl.exercises[ei];
  const ex = lookupExercise(we.exerciseId);
  const name = (ex && ex.name) || 'this exercise';
  // Warn only when there is something to lose. Removing an untouched exercise
  // is not destructive, and a confirm on every tap teaches people to dismiss it.
  const logged = (we.sets || []).filter(s => s.completed).length;
  const msg = logged
    ? `Remove ${name}? ${logged} logged set${logged === 1 ? '' : 's'} will be lost.`
    : `Remove ${name} from today's workout?`;
  if (!confirm(msg)) return;
  wl.exercises.splice(ei, 1);
  _wSave(wl);
  if (typeof track === 'function') track('exercise_removed', { logged });
  rerenderWorkoutActive();
}

// ── EXERCISE SWAP ───────────────────────────────────────────────────────
let _swapExIdx = null;
function swapExercise(ei) {
  _swapExIdx = ei;
  browserContext = 'swap';
  go('exerciseBrowser');
}
function confirmSwapExercise(eid) {
  const t = today(), wl = workoutLog[t];
  if (!wl || _swapExIdx === null) return;
  const ex = lookupExercise(eid);
  const old = wl.exercises[_swapExIdx];
  wl.exercises[_swapExIdx] = {
    exerciseId: eid,
    sets: old.sets.map(s => ({ weight: 0, reps: ex ? ex.dr : 10, completed: false }))
  };
  _wSave(wl);
  _swapExIdx = null;
  browserContext = null;
  go('workoutActive'); // navigating back from the exercise browser — real nav
}

// ── WORKOUT NOTES ───────────────────────────────────────────────────────
function _saveWorkoutNotes() {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  wl.notes = (document.getElementById('w-notes')?.value || '').trim();
  _wSave(wl);
}

// ── 1RM CALCULATOR ─────────────────────────────────────────────────────
function show1RMCalc() {
  let modal = document.getElementById('orm-calc-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'orm-calc-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="close1RMCalc()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">1RM Calculator</div>
      <div class="d-goals-row" style="margin-bottom:12px"><div class="d-goals-label">Weight (${wtUnit()})</div><input class="d-input" type="number" id="orm-weight" placeholder="e.g. 100" inputmode="decimal" oninput="calc1RM()"></div>
      <div class="d-goals-row" style="margin-bottom:16px"><div class="d-goals-label">Reps</div><input class="d-input" type="number" id="orm-reps" placeholder="e.g. 5" inputmode="numeric" oninput="calc1RM()"></div>
      <div id="orm-result" style="min-height:40px"></div>
      <button class="w-action-btn" style="margin:16px 0 0;width:100%" onclick="close1RMCalc()">Done</button>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('orm-weight')?.focus(), 100);
}

function close1RMCalc() {
  const m = document.getElementById('orm-calc-modal');
  if (m) m.style.display = 'none';
}

function calc1RM() {
  const w = parseFloat(document.getElementById('orm-weight')?.value) || 0;
  const r = parseInt(document.getElementById('orm-reps')?.value) || 0;
  const out = document.getElementById('orm-result');
  if (!out || !w || !r) { if (out) out.innerHTML = ''; return; }
  // Epley formula
  const orm = r === 1 ? w : Math.round(w * (1 + r / 30));
  const pcts = [100, 95, 90, 85, 80, 75, 70, 65];
  const rows = pcts.map(p => {
    const pw = Math.round(orm * p / 100);
    const approxReps = p === 100 ? 1 : p >= 95 ? 2 : p >= 90 ? 4 : p >= 85 ? 6 : p >= 80 ? 8 : p >= 75 ? 10 : p >= 70 ? 12 : 15;
    return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;${p===100?'color:var(--accent-b);font-weight:700':'color:var(--text-dim)'}">
      <span>${p}%</span><span>${pw} ${wtUnit()}</span><span>~${approxReps} reps</span>
    </div>`;
  }).join('');
  out.innerHTML = `<div style="font-size:13px;color:var(--accent-b);font-weight:600;margin-bottom:8px">Estimated 1RM: ${orm} ${wtUnit()}</div>${rows}`;
}

// ── PLATE CALCULATOR ────────────────────────────────────────────────────
function showPlateCalc() {
  let modal = document.getElementById('plate-calc-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'plate-calc-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closePlateCalc()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Plate Calculator</div>
      <div class="d-goals-row" style="margin-bottom:12px"><div class="d-goals-label">Target (${wtUnit()})</div><input class="d-input" type="number" id="plate-target" placeholder="e.g. 225" inputmode="decimal" oninput="calcPlates()"></div>
      <div class="d-goals-row" style="margin-bottom:16px"><div class="d-goals-label">Bar (${wtUnit()})</div><input class="d-input" type="number" id="plate-bar" value="${isImperial() ? 45 : 20}" inputmode="decimal" oninput="calcPlates()"></div>
      <div id="plate-result" style="min-height:40px"></div>
      <button class="w-action-btn" style="margin:16px 0 0;width:100%" onclick="closePlateCalc()">Done</button>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('plate-target')?.focus(), 100);
}

function closePlateCalc() {
  const m = document.getElementById('plate-calc-modal');
  if (m) m.style.display = 'none';
}

function calcPlates() {
  const target = parseFloat(document.getElementById('plate-target')?.value) || 0;
  const bar = parseFloat(document.getElementById('plate-bar')?.value) || (isImperial() ? 45 : 20);
  const out = document.getElementById('plate-result');
  if (!out) return;
  const perSide = (target - bar) / 2;
  if (perSide <= 0) { out.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Just the bar</div>'; return; }

  const plates = isImperial() ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25];
  let remaining = perSide;
  const needed = [];
  for (const p of plates) {
    while (remaining >= p - 0.01) { needed.push(p); remaining -= p; }
  }
  if (remaining > 0.1) {
    out.innerHTML = `<div style="color:var(--fat);font-size:13px">Can't make exact weight with standard plates</div>`;
    return;
  }
  const counts = {};
  needed.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
  const html = Object.entries(counts).sort((a,b) => b[0]-a[0]).map(([p, c]) =>
    `<span class="plate-chip">${c}× ${p}${wtUnit()}</span>`
  ).join(' ');
  out.innerHTML = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">Each side:</div><div style="display:flex;flex-wrap:wrap;gap:6px">${html}</div>`;
}

// ── ELAPSED WORKOUT TIMER ────────────────────────────────────────────────
let _workoutStartTime = null;
let _workoutElapsedTimer = null;
function startWorkoutTimer() {
  if (!_workoutStartTime) _workoutStartTime = Date.now();
  if (_workoutElapsedTimer) clearInterval(_workoutElapsedTimer);
  _workoutElapsedTimer = setInterval(_updateWorkoutElapsed, 1000);
  _updateWorkoutElapsed();
}
function stopWorkoutTimer() {
  if (_workoutElapsedTimer) { clearInterval(_workoutElapsedTimer); _workoutElapsedTimer = null; }
  _workoutStartTime = null;
}
function _updateWorkoutElapsed() {
  const el = document.getElementById('workout-elapsed');
  if (!el || !_workoutStartTime) return;
  const secs = Math.floor((Date.now() - _workoutStartTime) / 1000);
  const m = Math.floor(secs / 60), s = secs % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

// ── REST TIMER ──────────────────────────────────────────────────────────
// Each exercise keeps its own rest, remembered across sessions, because heavy
// squats want longer than curls. Unset means DEFAULT_REST_SEC; 0 means no
// timer. The preset row under the session starts a one-off timer and changes
// nobody's rest, so the chip on each card always says what will run.
const REST_CHOICES = [45, 60, 90, 120, 150, 180, 240, 300, 0];
function restFor(eid) {
  const v = (LS.get('hvi_rest_by_exercise', {}) || {})[String(eid)];
  return (typeof v === 'number' && v >= 0) ? v : DEFAULT_REST_SEC;
}
function setExerciseRest(eid, sec) {
  const m = LS.get('hvi_rest_by_exercise', {}) || {};
  m[String(eid)] = Math.max(0, Math.round(sec) || 0);
  LS.set('hvi_rest_by_exercise', m);
}
function _fmtRest(sec) {
  return sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : 'Off';
}
function _restAria(sec) {
  return sec > 0 ? `Rest between sets ${_fmtRest(sec)}. Change` : 'No rest timer. Change';
}
function toggleRestPicker(ei) {
  const pick = document.getElementById(`w-rest-pick-${ei}`);
  const chip = document.getElementById(`w-rest-${ei}`);
  if (!pick) return;
  pick.hidden = !pick.hidden;
  if (chip) chip.setAttribute('aria-expanded', String(!pick.hidden));
}
function pickRest(ei, sec) {
  const wl = workoutLog[today()];
  const we = wl && wl.exercises[ei];
  if (!we) return;
  setExerciseRest(we.exerciseId, sec);
  // The same exercise can be in a session twice; every card for it follows.
  wl.exercises.forEach((w, i) => {
    if (String(w.exerciseId) !== String(we.exerciseId)) return;
    const chip = document.getElementById(`w-rest-${i}`);
    if (chip) {
      const label = chip.querySelector('span');
      if (label) label.textContent = _fmtRest(sec);
      chip.setAttribute('aria-label', _restAria(sec));
    }
    const pick = document.getElementById(`w-rest-pick-${i}`);
    if (pick) pick.querySelectorAll('.w-rest-opt').forEach(b => {
      const on = +b.dataset.sec === sec;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
  toggleRestPicker(ei);
  haptic(8);
}
function startRestTimer(dur) {
  const wasResting = !!restTimer;
  restTimerDur = dur || DEFAULT_REST_SEC;
  restTimerEnd = Date.now() + restTimerDur * 1000;
  _updateRestTimer();
  // Rise into place when a rest begins; a restart while resting stays put.
  const bar = document.getElementById('rest-timer-bar');
  if (bar && !wasResting) { bar.classList.remove('rt-in'); void bar.offsetWidth; bar.classList.add('rt-in'); }
  if (restTimer) clearInterval(restTimer);
  restTimer = setInterval(_updateRestTimer, 250);
  haptic(12);
}
function stopRestTimer() {
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  const el = document.getElementById('rest-timer-bar');
  if (el) el.style.display = 'none';
}
function _updateRestTimer() {
  const el = document.getElementById('rest-timer-bar');
  if (!el) return;
  const left = Math.max(0, restTimerEnd - Date.now());
  const secs = Math.ceil(left / 1000);
  const pct = restTimerDur > 0 ? (1 - left / (restTimerDur * 1000)) : 1;
  if (secs <= 0) {
    clearInterval(restTimer); restTimer = null;
    el.innerHTML = '<div class="rt-done">REST COMPLETE</div>';
    haptic([100, 50, 100, 50, 100]);
    playSound('complete');
    setTimeout(() => { if (el) el.style.display = 'none'; }, 2500);
    return;
  }
  el.style.display = 'block';
  const m = Math.floor(secs / 60), s = secs % 60;
  el.innerHTML = `<div class="rt-row">
    <div class="rt-time">${m}:${String(s).padStart(2,'0')}</div>
    <div class="rt-track"><div class="rt-fill" style="width:${(pct*100).toFixed(0)}%"></div></div>
    <button class="rt-skip" onclick="stopRestTimer()">Skip</button>
  </div>`;
}

function finishWorkout() {
  if (typeof track === 'function') track('workout_complete', { program: workoutMeta?.activeProgram || 'custom' });
  // Today's targets as planned, before this session counts and before the day
  // index moves on below — the card on the workout screen compares against it.
  const fedBefore = (typeof _plannedSession === 'function') ? getTodaysMacroTargets(_plannedSession()) : null;
  const t = today();
  const wl = workoutLog[t];
  // Save duration
  if (wl && _workoutStartTime) {
    wl.duration = Math.floor((Date.now() - _workoutStartTime) / 1000);
    LS.set('hvi_workout_log', workoutLog);
  }
  // Check for volume PR
  if (wl) {
    const totalVol = wl.exercises.reduce((sum, we) =>
      sum + we.sets.filter(s => s.completed && !s.warmup).reduce((s2, st) => s2 + (st.weight || 0) * (st.reps || 0), 0), 0);
    const prevBest = LS.get('hvi_volume_pr', 0);
    if (totalVol > prevBest) {
      LS.set('hvi_volume_pr', totalVol);
      wl.volumePR = true;
      LS.set('hvi_workout_log', workoutLog);
    }
  }
  stopWorkoutTimer();
  workoutMeta.lastWorkoutDate = today();
  // Auto-advance to next day
  const prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  workoutMeta.currentDayIndex = (workoutMeta.currentDayIndex + 1) % prog.days.length;
  LS.set('hvi_workout_meta', workoutMeta);
  playSound('complete');
  haptic([40, 30, 40, 30, 80]);
  awardXP(50, 'body');
  trackWeeklyWorkout();
  checkDailyQuests();

  // Workout count milestones
  const wCount = Object.keys(workoutLog).filter(k => workoutLog[k]?.exercises?.length > 0).length;
  const wMilestones = { 1: 'First workout in the books. This is where it starts.', 10: 'Ten sessions deep. You\'re building a real habit.', 25: 'Twenty-five workouts. Consistency is your superpower.', 50: 'Fifty workouts logged. You\'re not the same person who started.', 100: 'One hundred workouts. Elite dedication.', 200: 'Two hundred sessions. Absolute machine.' };
  if (wMilestones[wCount]) {
    setTimeout(() => showMilestone({
      icon: wCount >= 100 ? '🏆' : wCount >= 50 ? '💪' : '🏋️',
      title: `${wCount} Workouts!`,
      message: wMilestones[wCount],
      xp: wCount >= 100 ? 200 : wCount >= 50 ? 100 : 50,
    }), 500);
  }

  // Connected system: fire workout-completed so linked habits auto-complete
  if (window.Arete) window.Arete.emit('workout:completed');

  if (typeof sessionFedSummary === 'function') {
    try {
      _sessionFed = sessionFedSummary(fedBefore,
        typeof _workoutAutoDone !== 'undefined' ? _workoutAutoDone : []);
      // A milestone overlay lands on top half a second from now; the card
      // waits under it rather than playing where nobody can see it.
      if (wMilestones[wCount]) _sessionFed.waitFor = 'milestone';
    } catch (e) { console.warn('[Arete] session summary error:', e); }
  }
  go('workout');
}

function repeatWorkout(date) {
  const src = workoutLog[date];
  if (!src) return;
  const t = today();
  // Clone the workout with all sets unchecked but weights/reps preserved
  workoutLog[t] = {
    programId: src.programId,
    dayIndex: src.dayIndex,
    exercises: src.exercises.map(we => ({
      exerciseId: we.exerciseId,
      sets: we.sets.map(s => ({ weight: s.weight, reps: s.reps, completed: false }))
    }))
  };
  LS.set('hvi_workout_log', workoutLog);
  go('workoutActive');
}

function shiftWorkoutDay(delta) {
  const prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const len = prog.days.length;
  // Switching days discards today's entry — confirm first if it has logged sets
  if (_wIsTouched(workoutLog[today()]) &&
      !confirm("You've already logged sets today. Switching days will discard them. Continue?")) return;
  workoutMeta.currentDayIndex = ((workoutMeta.currentDayIndex + delta) % len + len) % len;
  // Clear today's log so the new day initializes fresh when entering active workout
  delete workoutLog[today()];
  LS.set('hvi_workout_meta', workoutMeta);
  LS.set('hvi_workout_log', workoutLog);
  renderWorkout();
}

function deleteCustomProgram(id) {
  if (!confirm('Delete this custom program? This can\'t be undone.')) return;
  const progs = LS.get('hvi_custom_programs', []).filter(p => p.id !== id);
  LS.set('hvi_custom_programs', progs);
  if (workoutMeta.activeProgram === id) {
    workoutMeta.activeProgram = 'ppl';
    workoutMeta.currentDayIndex = 0;
    LS.set('hvi_workout_meta', workoutMeta);
  }
  go('workoutPicker');
}

function initBuilder() {
  builderProg = { id: genId('cp'), name: '', desc: '', days: [{ name: 'Day 1', focus: '', ex: [] }] };
  builderDayIdx = 0;
  builderSearch = '';
}

function editCustomProgram(id) {
  const progs = LS.get('hvi_custom_programs', []);
  const prog = progs.find(p => p.id === id);
  if (!prog) return;
  builderProg = JSON.parse(JSON.stringify(prog));
  builderDayIdx = 0;
  builderSearch = '';
  go('workoutBuilder');
}

function renderWorkoutBuilder() {
  if (!builderProg) { initBuilder(); }
  const day = builderProg.days[builderDayIdx];

  const dayTabs = builderProg.days.map((d, i) =>
    `<button class="d-type-btn${i===builderDayIdx?' active':''}" onclick="builderDayIdx=${i};go('workoutBuilder')">${esc(d.name) || 'Day '+(i+1)}</button>`
  ).join('') + `<button class="d-type-btn" onclick="builderAddDay()">+ DAY</button>`;

  const addedEx = day.ex.map((eid, i) => {
    const ex = lookupExercise(eid);
    const name = ex ? ex.name : 'Loading…';
    const muscle = ex ? ex.muscle : '';
    if (!ex && typeof eid === 'number') wgerFetchExercise(eid).then(() => { if (curView === 'workoutBuilder') go('workoutBuilder', {}, false); });
    return `<div class="w-ex" style="margin:0 0 6px"><div class="w-ex-head"><div><div class="w-ex-name">${esc(name)}</div><div class="w-ex-muscle">${esc(muscle)}</div></div>
      <button class="d-del-btn" style="font-size:16px" onclick="builderRemoveEx(${i})">×</button></div></div>`;
  }).join('');

  let searchHTML;
  if (builderSearchLoading) {
    searchHTML = '<div class="ex-search-status">Searching…</div>';
  } else if (!builderSearch || builderSearch.length < 2) {
    searchHTML = '<p style="font-size:12px;color:var(--text-muted);padding:4px 0">Type at least 2 characters to search.</p>';
  } else if (!builderSearchResults.length) {
    searchHTML = '<div class="ex-search-status">No results.</div>';
  } else {
    searchHTML = builderSearchResults.slice(0, 15).map(r =>
      `<div class="w-card" style="margin:0 0 6px;padding:12px 16px;cursor:pointer" onclick="addExerciseToDay('${r.base_id}', ${JSON.stringify(r.name).replace(/"/g,'&quot;')}, ${JSON.stringify(r.category||'').replace(/"/g,'&quot;')})">
        <div class="w-ex-name" style="font-size:13px">${esc(r.name)}</div><div class="w-ex-muscle">${esc(r.category || '')}</div></div>`
    ).join('');
  }

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workoutPicker')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">${builderProg.name && LS.get('hvi_custom_programs',[]).some(p=>p.id===builderProg.id) ? 'Edit Program' : 'Build Program'}</div><div class="page-sub">${builderProg.name && LS.get('hvi_custom_programs',[]).some(p=>p.id===builderProg.id) ? 'Edit your training split.' : 'Create your custom training split.'}</div></div>
    <div style="padding:0 24px" class="ani">
      <div class="d-goals-row"><div class="d-goals-label">Name</div><input class="d-input" type="text" id="bp-name" value="${esc(builderProg.name)}" placeholder="e.g. My PPL" style="flex:1" onchange="builderProg.name=this.value"></div>
      <div class="d-goals-row"><div class="d-goals-label">Description</div><input class="d-input" type="text" id="bp-desc" value="${esc(builderProg.desc)}" placeholder="e.g. 4-day upper/lower split" style="flex:1" onchange="builderProg.desc=this.value"></div>

      <div class="sec-lbl" style="padding:20px 0 8px">Days</div>
      <div class="d-type-btns" style="padding:0 0 12px;flex-wrap:wrap">${dayTabs}</div>

      <div class="d-goals-row"><div class="d-goals-label">Day Name</div><input class="d-input" type="text" id="bp-dn" value="${esc(day.name)}" placeholder="e.g. Push A" style="flex:1" onchange="builderProg.days[builderDayIdx].name=this.value"></div>
      <div class="d-goals-row"><div class="d-goals-label">Focus</div><input class="d-input" type="text" id="bp-df" value="${esc(day.focus)}" placeholder="e.g. Chest, Shoulders" style="flex:1" onchange="builderProg.days[builderDayIdx].focus=this.value"></div>
      ${builderProg.days.length > 1 ? `<button class="d-del-btn" style="font-size:12px;color:var(--text-muted);padding:6px 0" onclick="builderRemoveDay(${builderDayIdx})">Remove this day</button>` : ''}

      <div class="sec-lbl" style="padding:16px 0 8px">Exercises (${day.ex.length})</div>
      ${addedEx || '<p style="font-size:12px;color:var(--text-muted);padding:4px 0">No exercises added yet.</p>'}

      <div class="sec-lbl" style="padding:16px 0 8px">Add Exercises</div>
      <input class="d-input" type="text" id="bp-search" placeholder="Search by name or muscle..." value="${esc(builderSearch)}" oninput="builderSearch=this.value;debouncedBuilderSearch()">
      <div style="margin-top:8px" id="bp-exlist">${searchHTML}</div>
      <button class="w-action-btn" style="margin-top:12px;width:100%" onclick="browserContext={dayIndex:builderDayIdx};go('exerciseBrowser')">BROWSE FULL LIBRARY</button>
    </div>
    <button class="w-finish" onclick="saveCustomProgram()">SAVE PROGRAM</button>`;
}

function builderRemoveDay(i) {
  if (builderProg.days.length <= 1) return;
  builderProg.days.splice(i, 1);
  if (builderDayIdx >= builderProg.days.length) builderDayIdx = builderProg.days.length - 1;
  go('workoutBuilder');
}

function builderAddDay() {
  builderProg.days.push({ name: 'Day ' + (builderProg.days.length + 1), focus: '', ex: [] });
  builderDayIdx = builderProg.days.length - 1;
  go('workoutBuilder');
}

function builderAddEx(eid) {
  builderProg.days[builderDayIdx].ex.push(eid);
  go('workoutBuilder');
}

function builderRemoveEx(i) {
  builderProg.days[builderDayIdx].ex.splice(i, 1);
  go('workoutBuilder');
}

function debouncedBuilderSearch() {
  clearTimeout(builderSearchDebounce);
  builderSearchDebounce = setTimeout(() => {
    builderSearchResults = wgerSearch(builderSearch);
    builderSearchLoading = false;
    refreshBuilderSearchUI();
  }, 150);
}

function refreshBuilderSearchUI() {
  const el = document.getElementById('bp-exlist');
  if (!el) return;
  if (builderSearchLoading) { el.innerHTML = '<div class="ex-search-status">Searching…</div>'; return; }
  if (!builderSearch || builderSearch.length < 2) { el.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:4px 0">Type at least 2 characters to search.</p>'; return; }
  if (!builderSearchResults.length) { el.innerHTML = '<div class="ex-search-status">No results.</div>'; return; }
  el.innerHTML = builderSearchResults.slice(0, 15).map(r =>
    `<div class="w-card" style="margin:0 0 6px;padding:12px 16px;cursor:pointer" onclick="addExerciseToDay('${r.base_id}', ${JSON.stringify(r.name).replace(/"/g,'&quot;')}, ${JSON.stringify(r.category||'').replace(/"/g,'&quot;')})">
      <div class="w-ex-name" style="font-size:13px">${esc(r.name)}</div><div class="w-ex-muscle">${esc(r.category || '')}</div></div>`
  ).join('');
}

async function addExerciseToDay(baseId, name, category) {
  // String IDs are local exercises — no wger fetch needed
  if (typeof baseId === 'number' && !wgerCache[baseId]) {
    wgerCache[baseId] = { id: baseId, name, muscle: category || 'Unknown', equipment: 'Bodyweight', muscles: [], description: '', image: null, ds: 3, dr: 10 };
    LS.set('hvi_wger_cache', wgerCache);
    wgerFetchExercise(baseId);
  }
  if (!builderProg) initBuilder();
  const dayIdx = browserContext && typeof browserContext.dayIndex === 'number' ? browserContext.dayIndex : builderDayIdx;
  if (!builderProg.days[dayIdx]) return;
  builderProg.days[dayIdx].ex.push(baseId);
  if (browserContext) { go('workoutBuilder'); } else { refreshBuilderSearchUI(); go('workoutBuilder'); }
}

function saveCustomProgram() {
  // Read latest values from DOM
  builderProg.name = document.getElementById('bp-name')?.value?.trim() || builderProg.name;
  builderProg.desc = document.getElementById('bp-desc')?.value?.trim() || builderProg.desc;
  if (!builderProg.name) { builderProg.name = 'Custom Program'; }

  const valid = builderProg.days.some(d => d.ex.length > 0);
  if (!valid) return;

  const progs = LS.get('hvi_custom_programs', []);
  const idx = progs.findIndex(p => p.id === builderProg.id);
  if (idx >= 0) progs[idx] = builderProg;
  else progs.push(builderProg);
  LS.set('hvi_custom_programs', progs);
  // A draft from the goal builder that was edited and saved here is done with.
  if (_aiProg && _aiProg.draft && _aiProg.draft.id === builderProg.id) _aiProg.draft = null;
  selectProgram(builderProg.id);
  builderProg = null;
}

// ── A PROGRAM FROM A GOAL ───────────────────────────────────────────────
// The person says what they are training for; the AI answers with a program
// built only from exercises this app has. Nothing it returns is trusted: every
// id is checked against the library, every number is clamped, every string is
// cut to length, and a reply that does not survive that is refused rather
// than half-shown. Only the goal and the four choices below are sent, never
// the person's logs.
const AI_PROG = {
  days:      { label: 'Days a week', choices: [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], def: 4 },
  minutes:   { label: 'Minutes a session', choices: [[30, '30'], [45, '45'], [60, '60'], [75, '75']], def: 60 },
  equipment: { label: 'Equipment', choices: [['gym', 'Full gym'], ['dumbbells', 'Dumbbells'], ['bodyweight', 'Bodyweight']], def: 'gym' },
  level:     { label: 'Experience', choices: [['new', 'New to it'], ['some', '1–2 years'], ['experienced', '3+ years']], def: 'some' },
};
const AI_PROG_EQUIPMENT = {
  gym: 'A full commercial gym: barbells, racks, dumbbells, cables and machines.',
  dumbbells: 'Dumbbells and a bench only. No barbell, no cables, no machines. Bodyweight exercises are fine.',
  bodyweight: 'No equipment at all. Bodyweight exercises only (a pull-up bar is available).',
};
const AI_PROG_LEVEL = {
  new: 'New to training. Simple, stable movements; nothing that needs a lot of technique.',
  some: 'One to two years of consistent training.',
  experienced: 'Several years of training. Can handle more volume and harder variations.',
};
// What can be done without a full gym. The library carries no equipment field,
// and left to guess from names the model gave a no-equipment program dumbbell
// curls. So the model is only ever shown exercises that fit, and anything else
// it returns is dropped. Anything not listed here needs a gym.
const EX_BODYWEIGHT = ('pullup chinup hanging_raise muscle_up pushup diamond_pu archer_pu pike_pu hspu nordic_curl copenhagen ' +
  'lunge bulgarian sissy_squat pistol_squat calf_raise plank side_plank russian_twist dragon_flag v_up toe_touch bicycle lsit ' +
  'dead_bug hollow_hold burpee mountain_climb sprint').split(' ');
const EX_DUMBBELL = ('incline_db lateral_raise overhead_ext rear_delt_fly hammer_curl incline_curl arnold_press rear_delt_row ' +
  'db_flat_press db_fly db_row db_ohp front_raise db_shrug spider_curl conc_curl zottman db_curl cross_curl tricep_kick db_tri_ext ' +
  'goblet_squat db_lunge step_up rdl chest_row farmers_walk suitcase_carry').split(' ');
function exercisesFor(equipment) {
  const all = Object.keys(EXERCISES);
  if (equipment === 'bodyweight') return all.filter(id => EX_BODYWEIGHT.includes(id));
  if (equipment === 'dumbbells') return all.filter(id => EX_BODYWEIGHT.includes(id) || EX_DUMBBELL.includes(id));
  return all;
}

let _aiProg = null;

function _aiProgState() {
  if (!_aiProg) {
    const last = LS.get('hvi_ai_program_last', null) || {};
    const pick = k => (AI_PROG[k].choices.some(c => c[0] === last[k]) ? last[k] : AI_PROG[k].def);
    _aiProg = { goal: typeof last.goal === 'string' ? last.goal.slice(0, 400) : '',
                days: pick('days'), minutes: pick('minutes'), equipment: pick('equipment'), level: pick('level'),
                draft: null, busy: false, error: '', tries: 0 };
  }
  return _aiProg;
}

// The sets and reps a program prescribes for one exercise on one day, or null.
function programRx(day, eid) {
  const rx = day && day.rx && day.rx[eid];
  return (Array.isArray(rx) && rx[0] > 0 && rx[1] > 0) ? rx : null;
}

function aiProgramMessages(goal, o) {
  const library = exercisesFor(o.equipment).map(id => `${id}|${EXERCISES[id].name}|${EXERCISES[id].muscle}`).join('\n');
  const perDay = o.minutes <= 30 ? '3 to 4' : o.minutes <= 45 ? '4 to 5' : o.minutes <= 60 ? '5 to 6' : '6 to 7';
  const system = `You design strength and conditioning programs. Reply with JSON only, in exactly this shape:
{"name":"...","desc":"...","days":[{"name":"...","focus":"...","ex":[["exercise_id",sets,reps]]}]}

Rules:
- Use only exercise ids from the list below, spelled exactly. Never invent an id.
- Exactly ${o.days} training days. ${perDay} exercises a day, to fit ${o.minutes} minutes.
- Equipment: ${AI_PROG_EQUIPMENT[o.equipment]} The list below is already limited to what that allows.
- Experience: ${AI_PROG_LEVEL[o.level]}
- sets is 2 to 5. reps is 3 to 20. Big compound lifts first, smaller work after.
- Strength goals: 3 to 6 reps on the compound lifts. Muscle: 6 to 12. Conditioning or endurance: 12 to 20.
- Cover the whole body across the week unless the goal says otherwise, and do not train the same muscle hard two days running.
- If the goal mentions an injury, pain, or something to avoid, leave out exercises that load it.
- "name": at most 4 words. "desc": one plain sentence, at most 18 words, saying who the program is for.
- Day "name": at most 3 words. "focus": at most 5 words.

Exercises (id|name|muscle):
${library}`;
  const user = `Goal: ${String(goal).trim().slice(0, 400)}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// Turns whatever came back into a program this app can run, or null.
// `allowed` is the exercise ids on offer (those that fit the equipment).
function normalizeAIProgram(raw, goal, allowed) {
  const ok = Array.isArray(allowed) ? allowed : Object.keys(EXERCISES);
  let o = raw;
  if (typeof o === 'string') {
    const m = o.match(/\{[\s\S]*\}/);            // models sometimes wrap JSON in prose or a code fence
    try { o = JSON.parse(m ? m[0] : o); } catch { return null; }
  }
  if (!o || typeof o !== 'object' || !Array.isArray(o.days)) return null;
  const text = (v, max, fb) => {
    const t = (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
    return (t || fb).slice(0, max);
  };
  // A number, or a string of one. null and '' are missing, not zero.
  const whole = (v, lo, hi, fb) => {
    const n = (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Math.round(Number(v)) : NaN;
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
  };

  const days = [];
  o.days.slice(0, 7).forEach((d, di) => {
    if (!d || typeof d !== 'object') return;
    const list = Array.isArray(d.ex) ? d.ex : Array.isArray(d.exercises) ? d.exercises : [];
    const ex = [], rx = {};
    list.forEach(item => {
      const id = Array.isArray(item) ? item[0] : item && (item.id || item.exercise_id);
      if (typeof id !== 'string' || !ok.includes(id) || !Object.prototype.hasOwnProperty.call(EXERCISES, id)) return;   // not ours, or not for this equipment
      if (ex.includes(id) || ex.length >= 10) return;
      const def = EXERCISES[id];
      ex.push(id);
      rx[id] = [whole(Array.isArray(item) ? item[1] : item.sets, 1, 6, def.ds),
                whole(Array.isArray(item) ? item[2] : item.reps, 1, 30, def.dr)];
    });
    if (ex.length < 2) return;                    // a day of one exercise is not a day
    days.push({ name: text(d.name, 24, `Day ${di + 1}`), focus: text(d.focus, 44, ''), ex, rx });
  });
  if (!days.length) return null;
  return { id: genId('cp'), name: text(o.name, 40, 'My program'), desc: text(o.desc, 160, ''),
           ai: true, goal: text(goal, 400, ''), days };
}

function setAIProgramChoice(key, value) {
  const st = _aiProgState();
  if (!AI_PROG[key] || !AI_PROG[key].choices.some(c => c[0] === value)) return;
  const ta = document.getElementById('aip-goal');
  if (ta) st.goal = ta.value;
  st[key] = value;
  renderWorkoutAI();
}

async function generateAIProgram(again) {
  const st = _aiProgState();
  const ta = document.getElementById('aip-goal');
  if (ta) st.goal = ta.value;
  st.goal = String(st.goal || '').trim().slice(0, 400);
  if (st.busy) return;
  if (st.goal.length < 8) { st.error = 'Say a little more about what you are training for.'; renderWorkoutAI(); _aiProgSettle(); return; }
  // Ask before anything is sent, and carry on from here on a yes.
  if (typeof aiAllowed === 'function' && !aiAllowed()) { withAIConsent(() => generateAIProgram(again)); return; }

  LS.set('hvi_ai_program_last', { goal: st.goal, days: st.days, minutes: st.minutes, equipment: st.equipment, level: st.level });
  st.busy = true; st.error = '';
  st.tries = again ? st.tries + 1 : 0;
  renderWorkoutAI();
  if (typeof track === 'function') track('ai_program_request', { days: st.days, minutes: st.minutes, equipment: st.equipment, level: st.level, again: !!again });
  try {
    const raw = await _aiFetch(aiProgramMessages(st.goal, st),
      // A second go is allowed to differ from the first.
      { jsonMode: true, maxTokens: 2200, timeout: 45000, temperature: st.tries ? 0.7 : 0.2 });
    const prog = normalizeAIProgram(raw, st.goal, exercisesFor(st.equipment));
    if (!prog) throw new Error('unusable');
    st.draft = prog;
    if (typeof track === 'function') track('ai_program_built', { days: prog.days.length });
  } catch (e) {
    st.draft = st.draft && again ? st.draft : null;
    st.error = (e && e.message === 'offline') ? 'You are offline. Building a program needs a connection.'
      : 'That did not come back as a usable program. Try again, or add a little more detail.';
    if (typeof reportError === 'function' && !(e && /offline|unusable|ai-consent/.test(e.message))) reportError('ai-program', e);
  }
  st.busy = false;
  if (curView === 'workoutAI') { renderWorkoutAI(); _aiProgSettle(); }
}

// The button that was tapped sits at the bottom of the form, so the page is
// scrolled there when the answer lands. A new program is read from the top;
// a failure has to be brought into view or it goes unseen.
function _aiProgSettle() {
  const view = document.getElementById('view');
  const err = _aiProgState().error ? document.querySelector('.aip-error') : null;
  if (err && err.scrollIntoView) err.scrollIntoView({ block: 'center' });
  else if (view) view.scrollTop = 0;
}

function useAIProgram() {
  const st = _aiProgState();
  if (!st.draft) return;
  const progs = LS.get('hvi_custom_programs', []);
  const at = progs.findIndex(p => p.id === st.draft.id);
  if (at >= 0) progs[at] = st.draft; else progs.push(st.draft);
  LS.set('hvi_custom_programs', progs);
  if (typeof track === 'function') track('ai_program_used', { days: st.draft.days.length });
  const id = st.draft.id;
  st.draft = null;
  selectProgram(id);
  if (typeof showToast === 'function') showToast('Program saved. Day 1 is ready.');
}

// Opens the draft in the hand builder, where days and exercises can be changed.
function editAIProgram() {
  const st = _aiProgState();
  if (!st.draft) return;
  builderProg = JSON.parse(JSON.stringify(st.draft));
  builderDayIdx = 0;
  builderSearch = '';
  go('workoutBuilder');
}

function discardAIProgram() {
  const st = _aiProgState();
  st.draft = null; st.error = '';
  renderWorkoutAI();
  _aiProgSettle();
}

function renderWorkoutAI() {
  const st = _aiProgState();
  const back = `<button class="back" onclick="go('workoutPicker')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>`;

  if (st.draft) {
    const p = st.draft;
    const daysHTML = p.days.map((d, i) => `<div class="aip-day">
        <div class="aip-day-head"><h3>${esc(d.name)}</h3><span>${d.focus ? esc(d.focus) : `Day ${i + 1}`}</span></div>
        ${d.ex.map(eid => {
          const ex = lookupExercise(eid), rx = programRx(d, eid);
          return `<div class="aip-ex"><span>${esc(ex ? ex.name : eid)}</span><span>${rx ? `${rx[0]} × ${rx[1]}` : ''}</span></div>`;
        }).join('')}
      </div>`).join('');
    document.getElementById('view').innerHTML = `
      ${back}
      <div class="page-head ani"><div class="page-title">${esc(p.name)}</div>${p.desc ? `<div class="aip-desc">${esc(p.desc)}</div>` : ''}</div>
      <div class="aip-goal ani">Built for: ${esc(p.goal)}</div>
      ${st.error ? `<div class="aip-error ani" role="alert">${esc(st.error)}</div>` : ''}
      <div class="ani">${daysHTML}</div>
      <div class="aip-actions ani">
        <button class="aip-go" onclick="useAIProgram()" ${st.busy ? 'disabled' : ''}>Use this program</button>
        <div class="aip-row">
          <button class="aip-alt" onclick="generateAIProgram(true)" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Building…' : 'Build another'}</button>
          <button class="aip-alt" onclick="editAIProgram()" ${st.busy ? 'disabled' : ''}>Edit it</button>
        </div>
        <button class="aip-link" onclick="discardAIProgram()">Change what I asked for</button>
      </div>`;
    return;
  }

  const chips = key => `<div class="aip-field">
      <div class="aip-label" id="aip-l-${key}">${AI_PROG[key].label}</div>
      <div class="aip-chips" role="group" aria-labelledby="aip-l-${key}">${AI_PROG[key].choices.map(([v, l]) =>
        `<button class="aip-chip${st[key] === v ? ' on' : ''}" aria-pressed="${st[key] === v}" onclick="setAIProgramChoice('${key}', ${typeof v === 'number' ? v : `'${v}'`})">${l}</button>`).join('')}</div>
    </div>`;
  document.getElementById('view').innerHTML = `
    ${back}
    <div class="page-head ani"><div class="page-title">Build a program</div></div>
    <div class="aip-form ani">
      <label class="aip-label" for="aip-goal">What are you training for?</label>
      <textarea class="j-ta aip-goal-input" id="aip-goal" rows="4" maxlength="400" ${st.busy ? 'disabled' : ''}
        placeholder="Stronger and faster for soccer, without adding much size. My left knee does not like deep squats.">${esc(st.goal)}</textarea>
      ${chips('days')}${chips('minutes')}${chips('equipment')}${chips('level')}
      ${st.error ? `<div class="aip-error" role="alert">${esc(st.error)}</div>` : ''}
      <button class="aip-go" onclick="generateAIProgram()" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Building your program…' : 'Build my program'}</button>
      <div class="aip-note">This uses AI. It is sent what you wrote here and these four choices, not your logs.</div>
      <button class="aip-link" onclick="initBuilder();go('workoutBuilder')">Build it by hand instead</button>
    </div>`;
}

let _workoutHistorySearch = '';
function renderWorkoutHistory() {
  const allDates = Object.keys(workoutLog).sort().reverse();
  const dates = (_workoutHistorySearch
    ? allDates.filter(d => {
        const wl = workoutLog[d];
        const prog = findProgram(wl.programId);
        const dayInfo = prog ? prog.days[wl.dayIndex % prog.days.length] : null;
        const txt = `${dayInfo?.name || ''} ${prog?.name || ''} ${fmtDate(d)}`.toLowerCase();
        return txt.includes(_workoutHistorySearch.toLowerCase());
      })
    : allDates
  ).slice(0, 30);
  const items = dates.length ? dates.map(d => {
    const wl = workoutLog[d];
    const prog = findProgram(wl.programId);
    const dayInfo = prog ? prog.days[wl.dayIndex % prog.days.length] : null;
    const totalVol = wl.exercises.reduce((sum, we) => sum + we.sets.reduce((s2, st) => s2 + (st.completed && !st.warmup ? st.weight * st.reps : 0), 0), 0);
    const totalSets = wl.exercises.reduce((sum, we) => sum + we.sets.filter(s => s.completed && !s.warmup).length, 0);
    const durSecs = wl.duration || 0;
    const durStr = durSecs > 0 ? `${Math.floor(durSecs/60)}m` : '';
    const noteSnip = wl.notes ? ` · "${wl.notes.slice(0,40)}${wl.notes.length>40?'…':''}"` : '';
    const volPRBadge = wl.volumePR ? ' <span class="pr-badge" style="animation:none">🏆 Vol PR</span>' : '';
    return `<div class="w-hist-item" style="position:relative"><div class="w-hist-date">${fmtDate(d)}</div>
      <div class="w-hist-prog">${esc(dayInfo ? dayInfo.name : (wl.dayName || 'Workout'))} ${prog ? '· ' + prog.name : ''}${volPRBadge}</div>
      <div class="w-hist-vol">${totalSets} sets · ${totalVol.toLocaleString()} ${wtUnit()} vol${durStr ? ' · ' + durStr : ''}${noteSnip}</div>
      <button class="w-repeat-btn" onclick="event.stopPropagation();repeatWorkout('${d}')" title="Repeat this workout">↻</button></div>`;
  }).join('') : '<div class="empty-state"><div class="empty-state-icon">🏋️</div><div class="empty-state-title">No workouts yet</div><div class="empty-state-sub">Start your first workout to see your history here.</div><button class="empty-state-btn" onclick="go(\'workoutActive\')">Start Workout</button></div>';

  // Volume chart — last 7 days
  const last7 = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toLocaleDateString('en-CA');
    const wl2 = workoutLog[key];
    // Must match the per-workout figure in the list below: working sets only
    const vol = wl2 ? (wl2.exercises || []).reduce((s,e) => s + (e.sets || []).reduce((s2,st) =>
      s2 + (st.completed && !st.warmup ? (st.weight||0) * (st.reps||0) : 0), 0), 0) : 0;
    return { key, vol, day: d.toLocaleDateString('en-US',{weekday:'narrow'}) };
  });
  const maxVol = Math.max(...last7.map(d => d.vol), 1);
  const barW = 36, gap = 8, chartW = (barW + gap) * 7 - gap + 24, chartH = 80;
  const bars = last7.map((d, i) => {
    const bh = Math.max(4, (d.vol / maxVol) * (chartH - 20));
    const x = 12 + i * (barW + gap);
    const y = chartH - 20 - bh;
    const isToday = d.key === today();
    return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${isToday ? 'var(--accent-b)' : 'var(--accent)'}"/>
      <text x="${x + barW/2}" y="${chartH - 4}" fill="var(--text-dim)" font-size="9" text-anchor="middle">${d.day}</text>
      ${d.vol > 0 ? `<text x="${x + barW/2}" y="${y - 3}" fill="var(--text-dim)" font-size="8" text-anchor="middle">${d.vol >= 1000 ? (d.vol/1000).toFixed(1)+'k' : d.vol}</text>` : ''}`;
  }).join('');
  const chartHTML = `<div style="margin:0 24px 16px;background:var(--surface2);border-radius:14px;padding:16px" class="ani">
    <div class="sec-lbl" style="padding:0 0 10px">WEEKLY VOLUME (${wtUnit().toUpperCase()})</div>
    <svg viewBox="0 0 ${chartW} ${chartH}" style="width:100%;display:block">${bars}</svg>
  </div>`;

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">History</div><div class="page-sub">Your training log.</div></div>
    <div style="padding:0 24px 12px" class="ani"><input class="search-input" type="text" placeholder="Search workouts…" value="${esc(_workoutHistorySearch)}" oninput="_workoutHistorySearch=this.value;renderWorkoutHistory()"></div>
    ${chartHTML}
    <button class="w-action-btn" onclick="go('prHistory')">${typeof icon==='function'?icon('award',16):''} Personal Records</button>
    <div class="ani">${items}</div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: PR HISTORY
// ══════════════════════════════════════════════════════════════════════════
function renderPRHistory() {
  const entries = Object.entries(prs).sort((a, b) => b[1].date.localeCompare(a[1].date));
  const rows = entries.length ? entries.map(([eid, pr]) => {
    const ex = lookupExercise(typeof eid === 'number' ? parseInt(eid) : eid);
    const name = ex ? ex.name : (pr.name || eid);
    return `<div class="w-hist-item">
      <div class="w-hist-date">${fmtDate(pr.date)}</div>
      <div class="w-hist-prog">${esc(name)}</div>
      <div class="w-hist-vol" style="color:var(--accent-b)">🏆 ${pr.weight} ${wtUnit()} × ${pr.reps} reps</div>
    </div>`;
  }).join('') : '<p style="padding:24px;font-size:13px;color:var(--text-muted)">No PRs yet. Start lifting heavy!</p>';

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workoutHistory')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Personal Records</div><div class="page-sub">Your all-time bests per exercise.</div></div>
    <div class="ani">${rows}</div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: PROGRESS — strength, volume and consistency over time
// ══════════════════════════════════════════════════════════════════════════
let _wpEx = null; // exercise key selected for the strength chart
let _wpMode = 'volume'; // body map mode: 'volume' (sets trained) | 'strength'

// Epley estimated 1RM. Lets 5×100 compare fairly against 8×85, so the trend
// tracks real strength instead of whatever rep range you happened to use.
function _e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// Exercise ids are strings (built-in) or numbers (wger), keyed as strings here
function _wpLookup(key) {
  return lookupExercise(key) || (/^\d+$/.test(key) ? lookupExercise(parseInt(key, 10)) : null);
}

function _wpName(key) {
  const ex = _wpLookup(key);
  return ex ? ex.name : ((prs[key] && prs[key].name) || 'Exercise');
}

function _wpTrainedDates() {
  return Object.keys(workoutLog).filter(d => trainedOnDay(d)).sort();
}

function _wpDayVolume(d) {
  const wl = workoutLog[d];
  if (!wl || !wl.exercises) return 0;
  return wl.exercises.reduce((sum, e) => sum + (e.sets || [])
    .filter(s => s.completed && !s.warmup)
    .reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0), 0);
}

// Best estimated 1RM per session for one exercise, oldest first
function _wpSeries(key) {
  const out = [];
  _wpTrainedDates().forEach(d => {
    const we = (workoutLog[d].exercises || []).find(e => String(e.exerciseId) === key);
    if (!we) return;
    const sets = (we.sets || []).filter(s => s.completed && !s.warmup && s.reps > 0 && s.weight > 0);
    if (!sets.length) return;
    let best = 0, bw = 0, br = 0;
    sets.forEach(s => {
      const e = _e1rm(s.weight, s.reps);
      if (e > best) { best = e; bw = s.weight; br = s.reps; }
    });
    out.push({ date: d, e1rm: best, weight: bw, reps: br });
  });
  return out;
}

// Exercises worth charting: logged with weight on 2+ days, most frequent first
function _wpTracked() {
  const counts = {};
  _wpTrainedDates().forEach(d => {
    (workoutLog[d].exercises || []).forEach(we => {
      if (!(we.sets || []).some(s => s.completed && !s.warmup && s.reps > 0 && s.weight > 0)) return;
      const k = String(we.exerciseId);
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  return Object.entries(counts).filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
}

// Volume + sessions for each of the last N calendar weeks, oldest first
function _wpWeekly(weeks) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(); end.setDate(end.getDate() - i * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    const sKey = start.toLocaleDateString('en-CA'), eKey = end.toLocaleDateString('en-CA');
    let vol = 0, sessions = 0;
    _wpTrainedDates().forEach(d => {
      if (d < sKey || d > eKey) return;
      sessions++; vol += _wpDayVolume(d);
    });
    out.push({ vol, sessions, label: end.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) });
  }
  return out;
}

// This calendar month vs last, for the headline deltas
function _wpMonths() {
  const now = new Date();
  const key = (y, m) => new Date(y, m, 1).toLocaleDateString('en-CA');
  const thisStart = key(now.getFullYear(), now.getMonth());
  const lastStart = key(now.getFullYear(), now.getMonth() - 1);
  const nextStart = key(now.getFullYear(), now.getMonth() + 1);
  const agg = (from, to) => {
    let sessions = 0, vol = 0;
    _wpTrainedDates().forEach(d => {
      if (d < from || d >= to) return;
      sessions++; vol += _wpDayVolume(d);
    });
    return { sessions, vol };
  };
  const prCount = Object.values(prs).filter(p => p && p.date >= thisStart).length;
  return { cur: agg(thisStart, nextStart), prev: agg(lastStart, thisStart), prCount };
}

function _wpFmtVol(v) {
  return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(Math.round(v));
}

// ── Body map ───────────────────────────────────────────────────────────────
// Exercise muscle labels are free text and often compound ("Quads/Glutes",
// "Chest/Tri"), so each label is split and every token credited to the
// regions it covers.
const _WP_REGION_NAMES = {
  chest:'Chest', shoulders:'Shoulders', biceps:'Biceps', triceps:'Triceps',
  forearms:'Forearms', abs:'Abs', obliques:'Obliques', lats:'Lats', traps:'Traps',
  upperback:'Upper Back', lowerback:'Lower Back', glutes:'Glutes', quads:'Quads',
  hamstrings:'Hamstrings', calves:'Calves', adductors:'Adductors',
};
const _WP_TOKENS = {
  'chest':['chest'], 'upper chest':['chest'], 'lower chest':['chest'], 'inner chest':['chest'],
  'tri':['triceps'], 'triceps':['triceps'],
  'bi':['biceps'], 'biceps':['biceps'], 'brachialis':['biceps'],
  'forearm':['forearms'], 'forearms':['forearms'],
  'shoulders':['shoulders'], 'delts':['shoulders'], 'front delts':['shoulders'],
  'side delts':['shoulders'], 'rear delts':['shoulders'],
  'traps':['traps'],
  'lats':['lats'], 'back':['lats','upperback'], 'upper back':['upperback'],
  'lower back':['lowerback'], 'posterior chain':['lowerback','glutes','hamstrings'],
  'abs':['abs'], 'core':['abs'], 'obliques':['obliques'],
  'quads':['quads'], 'glutes':['glutes'], 'hams':['hamstrings'], 'hamstrings':['hamstrings'],
  'calves':['calves'], 'adductors':['adductors'], 'abductors':['glutes'],
  'legs':['quads','hamstrings','glutes'], 'arms':['biceps','triceps'],
  'full body':['chest','lats','shoulders','abs','quads','glutes'],
  'cardio':[], 'explosive':[], 'balance':[], 'unknown':[], 'other':[],
};

function _wpRegionsFor(label) {
  if (!label) return [];
  const out = new Set();
  String(label).toLowerCase().split(/[\/,&+]|\sand\s/).forEach(raw => {
    const t = raw.trim();
    if (!t) return;
    if (_WP_TOKENS[t]) { _WP_TOKENS[t].forEach(r => out.add(r)); return; }
    // Unseen label (e.g. a wger category) — fall back to substring matching
    Object.keys(_WP_TOKENS).forEach(k => {
      if (k.length > 2 && t.includes(k)) _WP_TOKENS[k].forEach(r => out.add(r));
    });
  });
  return [...out];
}

// Completed working sets per region over the last N days
function _wpRegionSets(days) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cKey = cutoff.toLocaleDateString('en-CA');
  const out = {};
  _wpTrainedDates().filter(d => d >= cKey).forEach(d => {
    (workoutLog[d].exercises || []).forEach(we => {
      const n = (we.sets || []).filter(s => s.completed && !s.warmup).length;
      if (!n) return;
      const ex = _wpLookup(String(we.exerciseId));
      _wpRegionsFor(ex && ex.muscle).forEach(r => { out[r] = (out[r] || 0) + n; });
    });
  });
  return out;
}

// Best estimated 1RM seen for each region, all time
function _wpRegionStrength() {
  const out = {};
  _wpTrainedDates().forEach(d => {
    (workoutLog[d].exercises || []).forEach(we => {
      const sets = (we.sets || []).filter(s => s.completed && !s.warmup && s.weight > 0 && s.reps > 0);
      if (!sets.length) return;
      const ex = _wpLookup(String(we.exerciseId));
      const regions = _wpRegionsFor(ex && ex.muscle);
      if (!regions.length) return;
      let best = 0, bw = 0, br = 0;
      sets.forEach(s => { const e = _e1rm(s.weight, s.reps); if (e > best) { best = e; bw = s.weight; br = s.reps; } });
      regions.forEach(r => {
        if (!out[r] || best > out[r].e1rm) out[r] = { e1rm: best, weight: bw, reps: br, name: ex ? ex.name : '', date: d };
      });
    });
  });
  return out;
}

// ── Relative strength ──────────────────────────────────────────────────────
// Absolute load can't compare muscle groups: a squat will always outweigh a
// curl. So each group's best estimated 1RM is divided by bodyweight and then
// by what an average trained lifter puts up for that group, giving a "% of
// average" that IS comparable across the body.
//
// Ratios are best e1RM / bodyweight for a roughly intermediate lifter, drawn
// from the usual published strength standards. They are rough benchmarks, not
// clinical values — good enough to rank your own groups against each other.
const _WP_STD = {
  male: {
    chest: 1.00, shoulders: 0.60, biceps: 0.35, triceps: 0.50, forearms: 0.30,
    abs: 0.40, obliques: 0.35, lats: 0.90, upperback: 0.90, traps: 1.20,
    lowerback: 1.60, glutes: 1.50, quads: 1.30, hamstrings: 1.20,
    calves: 1.30, adductors: 0.55,
  },
  female: {
    chest: 0.60, shoulders: 0.38, biceps: 0.22, triceps: 0.30, forearms: 0.20,
    abs: 0.28, obliques: 0.25, lats: 0.60, upperback: 0.60, traps: 0.80,
    lowerback: 1.15, glutes: 1.20, quads: 1.00, hamstrings: 0.90,
    calves: 1.00, adductors: 0.45,
  },
};

// Bodyweight in the same unit lift loads use, so the ratio is unit-agnostic.
// weightLog is stored in display units; tdeeProfile.weight_kg is always kg.
function _wpBodyweight() {
  const dates = Object.keys(weightLog || {}).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const v = parseFloat(weightLog[dates[i]]);
    if (v > 0) return v;
  }
  const p = (typeof tdeeProfile !== 'undefined' && tdeeProfile) || null;
  if (p && p.weight_kg > 0) return isImperial() ? p.weight_kg * 2.205 : p.weight_kg;
  return 0;
}

function _wpSex() {
  const p = (typeof tdeeProfile !== 'undefined' && tdeeProfile) || null;
  return (p && p.sex === 'female') ? 'female' : 'male';
}

// region -> { e1rm, weight, reps, name, ratio, pct }
function _wpRelStrength() {
  const bodyWt = _wpBodyweight();
  const abs = _wpRegionStrength();
  const std = _WP_STD[_wpSex()];
  const out = {};
  if (!bodyWt) return out;
  Object.keys(abs).forEach(r => {
    const s = std[r];
    if (!s) return;
    const ratio = abs[r].e1rm / bodyWt;
    out[r] = Object.assign({}, abs[r], { ratio, pct: Math.round((ratio / s) * 100) });
  });
  return out;
}

// Strength tiers. Thresholds are "% of an average lifter", so Intermediate
// straddles 100%. Deliberately named apart from the character LEVEL_TITLES so
// a strength rank is never mistaken for an account level.
// One gold ramp, shared by both map modes. The steps are spaced by luminance
// rather than by opacity: the previous scale varied alpha over a dark ground,
// so the middle tiers landed within a few points of each other and were
// effectively indistinguishable on a phone.
// Gold is the reward colour in Arete, so the strongest end gets full gold and
// weak groups wash out towards a muted sand.
//
// "Pale" here means desaturated, not bright. An earlier version made the weak
// end near-white cream, which on a black ground was louder than the gold — the
// eye went straight to the weakest muscles. Saturation AND brightness now both
// climb with strength, so gold is the most prominent thing on the figure.
// Untrained stays neutral dark so "nothing logged" never competes with
// "trained a little".
const _WP_RAMP = ['var(--surface)', 'var(--text-dim)', 'var(--text-dim)', 'var(--accent)', 'var(--accent)', 'var(--accent)'];

const _WP_TIERS = [
  { min: 0,   name: 'Untrained',    color: _WP_RAMP[0] },
  { min: 1,   name: 'Novice',       color: _WP_RAMP[1] },
  { min: 60,  name: 'Apprentice',   color: _WP_RAMP[2] },
  { min: 85,  name: 'Intermediate', color: _WP_RAMP[3] },
  { min: 110, name: 'Advanced',     color: _WP_RAMP[4] },
  { min: 140, name: 'Elite',        color: _WP_RAMP[5] },
  { min: 175, name: 'Demigod',      color: 'var(--text)' },
];

function _wpTier(pct) {
  let t = _WP_TIERS[0];
  for (const x of _WP_TIERS) { if ((pct || 0) >= x.min) t = x; }
  return t;
}

// Fixed anchors so a colour always means the same tier, rather than shading
// relative to whatever the user happens to train.
function _wpHeatPct(pct) {
  return _wpTier(pct).color;
}

// Relative ramp for the "trained this week" mode. Untrained regions keep the
// lowest step so the figure still reads as a body rather than as holes.
function _wpHeat(v, max) {
  if (!v) return _WP_RAMP[0];
  const t = Math.min(1, v / (max || 1));
  if (t <= 0.2) return _WP_RAMP[1];
  if (t <= 0.45) return _WP_RAMP[2];
  if (t <= 0.7) return _WP_RAMP[3];
  if (t <= 0.9) return _WP_RAMP[4];
  return _WP_RAMP[5];
}

// Stylised front/back figures. `sym` shapes are drawn once and mirrored about
// the figure's centre line; `mid` shapes sit on the centre line.
// A dark silhouette is drawn first so untrained gaps (joints, hips, hands)
// read as body rather than holes; muscle shapes sit on top of it.
// The figure artwork lives in bodymap.js (lazy-loaded) as AR_BODY: real
// anatomical muscle paths on a 1448x1448 canvas, front at x 0-724 and back at
// x 724-1448, so one viewBox renders both views side by side.
// Each AR_BODY.m entry lists the Arete regions it represents; where the artwork
// has no separate shape (lats and upper back share one), the higher value wins.
function _wpBodyMapSVG(vals, max, heatFn) {
  const heat = heatFn || ((v) => _wpHeat(v, max));
  if (typeof AR_BODY === 'undefined') {
    // bodymap.js loads on idle; re-render once it arrives
    setTimeout(() => {
      if (typeof AR_BODY !== 'undefined' && curView === 'workoutProgress') renderWorkoutProgress();
    }, 400);
    return '<div class="wp-card-sub" style="padding:28px 0;text-align:center">Loading body map…</div>';
  }
  const st = 'stroke="rgba(var(--c-ink-rgb), 0.45)" stroke-width="2" stroke-linejoin="round"';
  const statics = AR_BODY.s.map(d =>
    `<path d="${d}" fill="rgba(var(--text-rgb), 0.06)"/>`).join('');
  const muscles = AR_BODY.m.map(g => {
    const v = Math.max.apply(null, g.r.map(r => vals[r] || 0));
    const name = g.r.map(r => _WP_REGION_NAMES[r]).join(' / ');
    const fill = heat(v);
    return `<g><title>${name}: ${v}</title>` +
      g.d.map(d => `<path d="${d}" fill="${fill}" ${st}/>`).join('') + '</g>';
  }).join('');
  return `<svg viewBox="0 0 1448 1520" style="width:100%;display:block" role="img"
    aria-label="Muscle map coloured by training">
    ${statics}${muscles}
    <text x="362" y="1508" fill="var(--text-muted)" font-size="36" text-anchor="middle" letter-spacing="5">FRONT</text>
    <text x="1086" y="1508" fill="var(--text-muted)" font-size="36" text-anchor="middle" letter-spacing="5">BACK</text>
  </svg>`;
}

// Signed delta chip. up=true means higher is better (all metrics here).
function _wpDelta(cur, prev, unit) {
  if (!prev) return cur ? '<span class="wp-delta wp-up">new</span>' : '';
  const diff = cur - prev;
  if (!diff) return '<span class="wp-delta">even</span>';
  const pct = Math.round((diff / prev) * 100);
  const cls = diff > 0 ? 'wp-up' : 'wp-down';
  const sign = diff > 0 ? '+' : '−';
  const val = unit === '%' ? `${Math.abs(pct)}%` : `${sign}${_wpFmtVol(Math.abs(diff))}`;
  return `<span class="wp-delta ${cls}">${diff > 0 ? '▲' : '▼'} ${unit === '%' ? sign + val : val}</span>`;
}

// Line chart of estimated 1RM across sessions
function _wpLineChart(series) {
  const W = 320, H = 132, padL = 30, padR = 12, padT = 14, padB = 22;
  const vals = series.map(s => s.e1rm);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || Math.max(1, max * 0.1);
  const lo = min - span * 0.2, hi = max + span * 0.2;
  const x = i => padL + (series.length === 1 ? (W - padL - padR) / 2 : (i / (series.length - 1)) * (W - padL - padR));
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.e1rm).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const dots = series.map((s, i) => {
    const last = i === series.length - 1;
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(s.e1rm).toFixed(1)}" r="${last ? 4 : 2.5}"
      fill="${last ? 'var(--accent-b)' : 'var(--accent)'}"/>`;
  }).join('');
  const yLbl = [max, min].map(v =>
    `<text x="${padL - 6}" y="${(y(v) + 3).toFixed(1)}" fill="var(--text-muted)" font-size="9" text-anchor="end">${Math.round(v)}</text>`
  ).join('');
  const xLbl = `<text x="${x(0).toFixed(1)}" y="${H - 6}" fill="var(--text-muted)" font-size="9" text-anchor="start">${fmtDate(series[0].date)}</text>
    <text x="${x(series.length - 1).toFixed(1)}" y="${H - 6}" fill="var(--text-muted)" font-size="9" text-anchor="end">${fmtDate(series[series.length - 1].date)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" role="img" aria-label="Estimated 1RM over time">
    <defs><linearGradient id="wpg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent-b)" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="var(--accent-b)" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--border2)" stroke-width="1"/>
    <path d="${area}" fill="url(#wpg)"/>
    <path d="${line}" fill="none" stroke="var(--accent-b)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${yLbl}${xLbl}
  </svg>`;
}

function renderWorkoutProgress() {
  const trained = _wpTrainedDates();

  if (!trained.length) {
    document.getElementById('view').innerHTML = `
      <button class="back" onclick="go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
      <div class="page-head ani"><div class="page-title">Progress</div><div class="page-sub">Your strength over time.</div></div>
      <div class="empty-state" style="padding:32px 24px">
        <div class="empty-state-icon">📈</div>
        <div class="empty-state-title">No training logged yet</div>
        <div class="empty-state-sub">Finish a workout and your strength, volume and consistency will start showing up here.</div>
        <button class="empty-state-btn" onclick="go('workoutActive')">Start Workout</button>
      </div>`;
    return;
  }

  // ── Headline: this month vs last ──
  const m = _wpMonths();
  const summaryHTML = `
    <div class="wp-summary ani">
      <div class="wp-sum-item">
        <div class="wp-sum-val">${m.cur.sessions}</div>
        <div class="wp-sum-lbl">Sessions</div>
        ${_wpDelta(m.cur.sessions, m.prev.sessions)}
      </div>
      <div class="wp-sum-item">
        <div class="wp-sum-val">${_wpFmtVol(m.cur.vol)}</div>
        <div class="wp-sum-lbl">Volume ${wtUnit()}</div>
        ${_wpDelta(m.cur.vol, m.prev.vol, '%')}
      </div>
      <div class="wp-sum-item">
        <div class="wp-sum-val">${m.prCount}</div>
        <div class="wp-sum-lbl">PRs</div>
        <span class="wp-delta">this month</span>
      </div>
    </div>`;

  // ── Strength by exercise ──
  const tracked = _wpTracked();
  let strengthHTML = '';
  if (!tracked.length) {
    strengthHTML = `<div class="wp-hint ani">Log the same exercise on two different days and its strength curve appears here.</div>`;
  } else {
    if (!_wpEx || !tracked.includes(_wpEx)) _wpEx = tracked[0];
    const chips = tracked.map(k =>
      `<button class="wp-chip${k === _wpEx ? ' active' : ''}" onclick="_wpEx='${k.replace(/'/g, "\\'")}';renderWorkoutProgress()">${esc(_wpName(k))}</button>`
    ).join('');
    const series = _wpSeries(_wpEx);
    const first = series[0], last = series[series.length - 1];
    const gain = last.e1rm - first.e1rm;
    const pct = first.e1rm ? Math.round((gain / first.e1rm) * 100) : 0;
    const gainCls = gain > 0 ? 'wp-up' : gain < 0 ? 'wp-down' : '';
    const gainTxt = series.length < 2 ? 'One session so far'
      : `${gain > 0 ? '▲ +' : gain < 0 ? '▼ −' : ''}${gain ? Math.abs(Math.round(gain)) + ' ' + wtUnit() : 'No change'}${gain && pct ? ` (${gain > 0 ? '+' : '−'}${Math.abs(pct)}%)` : ''}`;
    strengthHTML = `
      <div class="sec-lbl ani" style="padding:18px 24px 8px">STRENGTH BY EXERCISE</div>
      <div class="wp-chips ani">${chips}</div>
      <div class="wp-card ani">
        <div class="wp-card-head">
          <div>
            <div class="wp-card-title">${esc(_wpName(_wpEx))}</div>
            <div class="wp-card-sub">${series.length} session${series.length !== 1 ? 's' : ''} · best ${last.weight} ${wtUnit()} × ${last.reps}</div>
          </div>
          <div class="wp-card-metric">
            <div class="wp-card-num">${Math.round(last.e1rm)}</div>
            <div class="wp-card-unit">est. 1RM ${wtUnit()}</div>
          </div>
        </div>
        ${series.length >= 2 ? _wpLineChart(series) : ''}
        <div class="wp-card-foot ${gainCls}">${gainTxt}${series.length >= 2 ? ` since ${fmtDate(first.date)}` : ''}</div>
      </div>`;
  }

  // ── 12-week volume ──
  const weeks = _wpWeekly(12);
  const maxW = Math.max(...weeks.map(w => w.vol), 1);
  const activeWeeks = weeks.filter(w => w.sessions > 0).length;
  const bw = 18, bgap = 6, cW = weeks.length * (bw + bgap) - bgap, cH = 92;
  const wBars = weeks.map((w, i) => {
    const h = w.vol ? Math.max(3, (w.vol / maxW) * (cH - 22)) : 2;
    const x = i * (bw + bgap), y = cH - 16 - h;
    const isLast = i === weeks.length - 1;
    return `<rect x="${x}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="3"
      fill="${w.vol ? (isLast ? 'var(--accent-b)' : 'var(--accent)') : 'var(--border)'}"/>
      ${i % 3 === 0 || isLast ? `<text x="${x + bw / 2}" y="${cH - 3}" fill="var(--text-muted)" font-size="8" text-anchor="middle">${w.label}</text>` : ''}`;
  }).join('');
  const volumeHTML = `
    <div class="sec-lbl ani" style="padding:18px 24px 8px">VOLUME · LAST 12 WEEKS</div>
    <div class="wp-card ani">
      <svg viewBox="0 0 ${cW} ${cH}" style="width:100%;display:block" role="img" aria-label="Weekly training volume">${wBars}</svg>
      <div class="wp-card-foot">Trained in ${activeWeeks} of the last 12 weeks · ${_wpFmtVol(weeks.reduce((s, w) => s + w.vol, 0))} ${wtUnit()} total</div>
    </div>`;

  // ── Body map: what you've trained lately, and where you're strongest ──
  const setsByRegion = _wpRegionSets(7);
  const strByRegion = _wpRegionStrength();
  const relByRegion = _wpRelStrength();
  const bodyWt = _wpBodyweight();
  const isStrength = _wpMode === 'strength';
  const canRank = isStrength && bodyWt > 0 && Object.keys(relByRegion).length > 0;

  // Strength mode scores each group as a percentage of an average lifter, so
  // the colours are comparable across the body. Without a bodyweight there is
  // nothing to normalise by, so it falls back to absolute load.
  const mapVals = {};
  if (canRank) Object.keys(relByRegion).forEach(r => { mapVals[r] = relByRegion[r].pct; });
  else if (isStrength) Object.keys(strByRegion).forEach(r => { mapVals[r] = strByRegion[r].e1rm; });
  else Object.assign(mapVals, setsByRegion);
  const mapMax = Math.max(...Object.values(mapVals), 1);
  const heatFn = canRank ? _wpHeatPct : null;

  const ranked = Object.keys(_WP_REGION_NAMES)
    .map(r => ({
      r, sets: setsByRegion[r] || 0,
      e1rm: strByRegion[r] ? strByRegion[r].e1rm : 0,
      pct: relByRegion[r] ? relByRegion[r].pct : 0,
      best: strByRegion[r] || null,
    }))
    .filter(x => x.sets > 0 || x.e1rm > 0)
    .sort((a, b) => canRank ? (b.pct - a.pct)
      : isStrength ? b.e1rm - a.e1rm
      : (b.sets - a.sets) || (b.e1rm - a.e1rm));

  const rankHTML = ranked.map(x => {
    const v = canRank ? x.pct : isStrength ? x.e1rm : x.sets;
    const pctW = Math.max(2, Math.min(100, Math.round((v / mapMax) * 100)));
    const right = canRank ? (x.pct ? `${x.pct}%` : '—')
      : isStrength ? (x.e1rm ? `${Math.round(x.e1rm)} ${wtUnit()}` : '—')
      : `${x.sets} set${x.sets !== 1 ? 's' : ''}`;
    const sub = canRank
      ? `${x.pct}% · ${Math.round(x.e1rm)} ${wtUnit()} ${esc((x.best && x.best.name) ? '· ' + x.best.name : '')}`
      : isStrength ? (x.best ? esc(x.best.name || '') : '')
      : (x.e1rm ? `best ${Math.round(x.e1rm)} ${wtUnit()}` : '');
    const tierName = canRank
      ? `<span class="wp-tier" style="color:${_wpTier(x.pct).color}">${_wpTier(x.pct).name}</span>`
      : right;
    return `<div class="wp-mrow">
      <div class="wp-mname">${_WP_REGION_NAMES[x.r]}${sub ? `<span class="wp-msub">${sub}</span>` : ''}</div>
      <div class="wp-mbar"><div class="wp-mfill" style="width:${pctW}%"></div></div>
      <div class="wp-mval">${tierName}</div>
    </div>`;
  }).join('');

  // Overall rank: the median group, so one freak lift or one neglected group
  // doesn't decide the whole rating.
  let overallHTML = '';
  if (canRank && ranked.length) {
    const pcts = ranked.map(x => x.pct).filter(p => p > 0).sort((a, b) => a - b);
    const mid = pcts.length ? (pcts.length % 2
      ? pcts[(pcts.length - 1) / 2]
      : Math.round((pcts[pcts.length / 2 - 1] + pcts[pcts.length / 2]) / 2)) : 0;
    const t = _wpTier(mid);
    const top = ranked[0];
    overallHTML = `
      <div class="wp-overall">
        <div>
          <div class="wp-overall-lbl">Overall rank</div>
          <div class="wp-overall-tier" style="color:${t.color}">${t.name}</div>
        </div>
        <div class="wp-overall-side">
          <div class="wp-overall-lbl">Strongest</div>
          <div class="wp-overall-sub">${_WP_REGION_NAMES[top.r]} · ${_wpTier(top.pct).name}</div>
        </div>
      </div>`;
  }

  const strengthSub = canRank
    ? 'Each group ranked against an average lifter of your bodyweight — 100% is average.'
    : 'Best estimated 1RM per muscle group.';
  const strengthFoot = canRank
    ? `Ranks: ${_WP_TIERS.slice(1).map(t => t.name).join(' → ')}. Measured against a ${_wpSex() === 'female' ? 'female' : 'male'} lifter at ${Math.round(bodyWt)} ${wtUnit()}. Benchmarks are approximate, so treat these as a guide to which groups lead and lag.`
    : `<span style="color:var(--accent-b)">Log your bodyweight to get ranked.</span> Until then these are absolute loads, so big compound muscles rank highest.`;

  const muscleHTML = `
    <div class="sec-lbl ani" style="padding:18px 24px 8px">MUSCLE MAP</div>
    <div class="wp-toggle ani">
      <button class="wp-tbtn${!isStrength ? ' active' : ''}" onclick="_wpMode='volume';renderWorkoutProgress()">Trained · 7 days</button>
      <button class="wp-tbtn${isStrength ? ' active' : ''}" onclick="_wpMode='strength';renderWorkoutProgress()">Strength</button>
    </div>
    <div class="wp-card ani">
      <div class="wp-card-sub" style="margin-bottom:6px">${isStrength
        ? strengthSub
        : 'Working sets per muscle group over the last 7 days.'}</div>
      ${overallHTML}
      ${_wpBodyMapSVG(mapVals, mapMax, heatFn)}
      ${canRank ? `<div class="wp-tierbar">
        ${_WP_TIERS.slice(1).map(t => `<div class="wp-tierseg"><i style="background:${t.color}"></i><span>${t.name}</span></div>`).join('')}
      </div>` : `<div class="wp-legend">
        <span>${isStrength ? 'Weaker' : 'Untrained'}</span>
        ${_WP_RAMP.map(c => `<i style="background:${c}"></i>`).join('')}
        <span>${isStrength ? 'Strongest' : 'Most'}</span>
      </div>`}
      ${ranked.length ? `<div class="wp-ranklist">${rankHTML}</div>` : ''}
      <div class="wp-card-foot">${isStrength
        ? strengthFoot
        : ranked.length ? `${ranked.filter(x => x.sets > 0).length} muscle groups trained this week.` : 'No sets logged in the last 7 days.'}</div>
    </div>`;

  // ── Recent PRs ──
  const recentPRs = Object.entries(prs).sort((a, b) => (b[1].date || '').localeCompare(a[1].date || '')).slice(0, 5);
  const prHTML = recentPRs.length ? `
    <div class="sec-lbl ani" style="padding:18px 24px 8px">RECENT PERSONAL RECORDS</div>
    <div class="wp-card ani">
      ${recentPRs.map(([eid, pr]) => `
        <div class="wp-prow">
          <div class="wp-pname">${esc(_wpName(String(eid)))}</div>
          <div class="wp-pval">${pr.weight} ${wtUnit()} × ${pr.reps}</div>
          <div class="wp-pdate">${fmtDate(pr.date)}</div>
        </div>`).join('')}
      <button class="w-action-btn" style="margin:12px 0 0;width:100%" onclick="go('prHistory')">All personal records</button>
    </div>` : '';

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Progress</div><div class="page-sub">Your strength over time.</div></div>
    ${summaryHTML}${strengthHTML}${volumeHTML}${muscleHTML}${prHTML}
    <div style="height:12px"></div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: EXERCISE BROWSER
// ══════════════════════════════════════════════════════════════════════════
const WGER_CATEGORIES = [
  { id: null, name: 'ALL' },
  { id: 11, name: 'Chest' },
  { id: 12, name: 'Back' },
  { id: 8,  name: 'Arms' },
  { id: 13, name: 'Shoulders' },
  { id: 9,  name: 'Legs' },
  { id: 10, name: 'Abs' },
  { id: 14, name: 'Calves' },
  { id: 15, name: 'Cardio' },
];
const WGER_EQUIPMENT = [
  { id: null, name: 'ALL' },
  { id: 1, name: 'Barbell' },
  { id: 3, name: 'Dumbbell' },
  { id: 7, name: 'Bodyweight' },
  { id: 10, name: 'Kettlebell' },
  { id: 11, name: 'Resistance Band' },
];

function renderExerciseBrowser() {
  injectExerciseBrowserStyles();
  const bs = browserState;

  const catPills = WGER_CATEGORIES.map(c =>
    `<button class="ex-filter-pill${bs.category===c.id?' active':''}" onclick="setBrowserCategory(${c.id===null?'null':c.id})">${c.name}</button>`
  ).join('');
  const eqPills = WGER_EQUIPMENT.map(e =>
    `<button class="ex-filter-pill${bs.equipment===e.id?' active':''}" onclick="setBrowserEquipment(${e.id===null?'null':e.id})">${e.name}</button>`
  ).join('');

  const backTarget = browserContext === 'swap' ? 'workoutActive' : browserContext ? 'workoutBuilder' : 'workout';

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('${backTarget}')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Exercise Library</div><div class="page-sub">898+ exercises.</div></div>
    <div class="ex-filter-row ani">${catPills}</div>
    <div class="ex-filter-row ani">${eqPills}</div>
    <div style="padding:0 24px;margin-bottom:12px">
      <input class="d-input" type="text" id="ex-browser-search" placeholder="Search exercises..." value="${esc(bs.search)}" oninput="browserState.search=this.value;debouncedBrowserSearch()">
    </div>
    <div style="padding:0 24px" id="ex-browser-list" class="ani">${renderBrowserList()}</div>`;

  // Auto-load on first view
  if (!bs.results.length && !bs.loading && !bs.search) {
    loadBrowserResults(true);
  }
}

function renderBrowserList() {
  const bs = browserState;
  if (bs.loading && !bs.results.length) {
    return '<div class="ex-skeleton"></div><div class="ex-skeleton"></div><div class="ex-skeleton"></div>';
  }
  if (!bs.results.length) {
    return '<div class="ex-search-status">No exercises found.</div>';
  }
  const cards = bs.results.map(ex => renderBrowserCard(ex)).join('');
  const more = bs.nextUrl ? `<button class="ex-browse-more" onclick="loadBrowserMore()">LOAD MORE</button>` : '';
  return cards + more;
}

function renderBrowserCard(ex) {
  const bs = browserState;
  const name = ex.name;
  const cat = ex.muscle || ex.category || '';
  const eq = ex.equipment || '';
  const musclesText = (ex.muscles && ex.muscles.length) ? ex.muscles.join(', ') : '';
  const thumb = ex.image ? `<img class="ex-thumb" loading="lazy" src="${ex.image.startsWith('http') ? ex.image : 'https://wger.de' + ex.image}" alt="">` : '';
  const isExpanded = bs.expanded === ex.id;
  const pr = prs[ex.id];

  const eid = typeof ex.id === 'number' ? ex.id : `'${ex.id}'`;
  const actionBtn = browserContext === 'swap'
    ? `<button class="ex-add-btn" onclick="event.stopPropagation();confirmSwapExercise(${eid})">SWAP</button>`
    : browserContext
    ? `<button class="ex-add-btn" onclick="event.stopPropagation();addExerciseToDay(${eid}, ${JSON.stringify(name).replace(/"/g,'&quot;')}, ${JSON.stringify(cat).replace(/"/g,'&quot;')})">+ ADD</button>`
    : `<button class="ex-log-btn" onclick="event.stopPropagation();logBrowserExercise(${eid})">LOG</button>`;

  let detailHTML = '';
  if (isExpanded) {
    const img = ex.image ? `<img loading="lazy" src="${ex.image.startsWith('http') ? ex.image : 'https://wger.de' + ex.image}" alt="">` : '';
    const musclesFull = ex.muscles && ex.muscles.length ? `<div><strong>Muscles:</strong> ${esc(ex.muscles.join(', '))}</div>` : '';
    const prLine = pr ? `<div class="ex-detail-pr">Your PR: ${pr.weight} ${wtUnit()} × ${pr.reps} reps (${pr.date})</div>` : '';
    const desc = ex.description ? `<div style="margin:6px 0">${esc(ex.description)}</div>` : '';
    const addToProgBtn = browserContext ? `<button class="ex-add-btn" style="margin-top:8px" onclick="addExerciseToDay(${eid}, ${JSON.stringify(name).replace(/"/g,'&quot;')}, ${JSON.stringify(cat).replace(/"/g,'&quot;')})">+ ADD TO PROGRAM</button>` : '';
    detailHTML = `<div class="ex-detail">${prLine}${desc}${musclesFull}${img}${addToProgBtn}</div>`;
  }

  return `<div class="ex-card" onclick="toggleBrowserExpand(${eid})">
    <div class="ex-card-head">
      <div class="ex-card-main">
        <div class="ex-card-name">${esc(name)}</div>
        <div class="ex-card-tags">${cat ? `<span class="ex-tag">${esc(cat)}</span>` : ''}${eq ? `<span class="ex-tag">${esc(eq)}</span>` : ''}</div>
        ${musclesText ? `<div class="ex-card-muscles">${esc(musclesText)}</div>` : ''}
      </div>
      <div class="ex-card-right">${thumb}${actionBtn}</div>
    </div>
    ${detailHTML}
  </div>`;
}

function setBrowserCategory(id) {
  browserState.category = id;
  browserState.results = [];
  browserState.nextUrl = null;
  browserState.expanded = null;
  loadBrowserResults(true);
  go('exerciseBrowser', {}, false);
}

function setBrowserEquipment(id) {
  browserState.equipment = id;
  browserState.results = [];
  browserState.nextUrl = null;
  browserState.expanded = null;
  loadBrowserResults(true);
  go('exerciseBrowser', {}, false);
}

function debouncedBrowserSearch() {
  clearTimeout(browserSearchDebounce);
  browserSearchDebounce = setTimeout(() => {
    browserState.results = [];
    browserState.nextUrl = null;
    browserState.expanded = null;
    loadBrowserResults(true);
  }, 400);
}

async function loadBrowserResults(showSkeleton) {
  const bs = browserState;
  bs.loading = true;
  if (showSkeleton) {
    const el = document.getElementById('ex-browser-list');
    if (el) el.innerHTML = renderBrowserList();
  }
  let exercises = [];
  let nextUrl = null;

  if (bs.search && bs.search.length >= 2) {
    // Search local exercise database (80+ exercises, instant)
    exercises = wgerSearch(bs.search);
    // Also include any cached wger exercises
    const q = bs.search.toLowerCase();
    const seen = new Set(exercises.map(e => e.name.toLowerCase()));
    Object.values(wgerCache).forEach(ex => {
      if (ex && ex.name && (ex.name.toLowerCase().includes(q) || (ex.muscle||'').toLowerCase().includes(q)) && !seen.has(ex.name.toLowerCase())) {
        exercises.push(ex);
        seen.add(ex.name.toLowerCase());
      }
    });
    nextUrl = null;
  } else {
    const data = await wgerBrowse(bs.category, bs.equipment, 0);
    exercises = (data.results || []).map(normalizeWgerExercise);
    nextUrl = data.next || null;
  }
  bs.results = exercises;
  bs.nextUrl = nextUrl;
  bs.loading = false;
  const el = document.getElementById('ex-browser-list');
  if (el) el.innerHTML = renderBrowserList();
}

async function loadBrowserMore() {
  const bs = browserState;
  if (!bs.nextUrl) return;
  bs.loading = true;
  const data = await wgerBrowseByUrl(bs.nextUrl);
  const newEx = (data.results || []).map(normalizeWgerExercise);
  bs.results = [...bs.results, ...newEx];
  bs.nextUrl = data.next || null;
  bs.loading = false;
  const el = document.getElementById('ex-browser-list');
  if (el) el.innerHTML = renderBrowserList();
}

function toggleBrowserExpand(id) {
  browserState.expanded = browserState.expanded === id ? null : id;
  const el = document.getElementById('ex-browser-list');
  if (el) el.innerHTML = renderBrowserList();
}

function logBrowserExercise(id) {
  pendingExercise = id;
  const t = today();
  if (!workoutLog[t]) {
    workoutLog[t] = { programId: 'adhoc', dayIndex: 0, exercises: [] };
  }
  const ex = lookupExercise(id);
  const ds = ex ? ex.ds : 3;
  const dr = ex ? ex.dr : 10;
  workoutLog[t].exercises.push({ exerciseId: id, sets: Array.from({length: ds}, () => ({weight: 0, reps: dr, completed: false})) });
  LS.set('hvi_workout_log', workoutLog);
  pendingExercise = null;
  go('workoutActive');
}

// ══════════════════════════════════════════════════════════════════════════
// PROGRESSIVE OVERLOAD CHART (mini sparkline per exercise)
// ══════════════════════════════════════════════════════════════════════════
function buildExerciseSparkline(exerciseId) {
  // Get last 10 sessions for this exercise
  const sessions = [];
  const dates = Object.keys(workoutLog).sort().reverse().slice(0, 60);
  for (const d of dates) {
    const wl = workoutLog[d];
    if (!wl?.exercises) continue;
    const ex = wl.exercises.find(e => e.exerciseId === exerciseId);
    if (ex) {
      const best = Math.max(0, ...(ex.sets || [])
        .filter(s => s.completed && !s.warmup)
        .map(s => (s.weight || 0) * (s.reps || 0)));
      if (best > 0) sessions.unshift({ date: d, vol: best });
    }
    if (sessions.length >= 10) break;
  }
  if (sessions.length < 2) return '';
  const maxV = Math.max(...sessions.map(s => s.vol));
  const minV = Math.min(...sessions.map(s => s.vol));
  const range = maxV - minV || 1;
  const w = 80, h = 24;
  const pts = sessions.map((s, i) => {
    const x = (i / (sessions.length - 1)) * w;
    const y = h - ((s.vol - minV) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  // Single calm gold regardless of direction — a down week isn't an error
  const col = 'var(--accent-b)';
  return `<svg viewBox="0 0 ${w} ${h}" class="w-sparkline" style="width:80px;height:24px">
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
