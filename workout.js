// ══════════════════════════════════════════════════════════════════════════
// Northstar — Workout Module
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
    .map(([id, ex]) => ({ base_id: id, name: ex.name, category: ex.muscle }));
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
    .ex-filter-pill{flex-shrink:0;padding:8px 14px;border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:var(--surface);color:var(--text-dim);font-size:12px;cursor:pointer;white-space:nowrap;transition:all .2s}
    .ex-filter-pill.active{background:var(--surface2);border-color:var(--accent-b);color:var(--accent-b)}
    .ex-card{background:var(--surface);border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.04);transition:all .2s;position:relative}
    .ex-card:hover{border-color:rgba(255,255,255,0.1)}
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
    .ex-log-btn{background:var(--accent);border:none;color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:700;letter-spacing:0.5px;text-transform:uppercase}
    .ex-detail{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;color:var(--text-dim);line-height:1.5}
    .ex-detail img{max-width:100%;border-radius:8px;margin:8px 0}
    .ex-detail-pr{color:var(--accent-b);font-size:12px;padding:6px 0;font-weight:600}
    .ex-search-status{color:var(--text-dim);font-size:13px;padding:12px 24px;text-align:center}
    .pr-badge{display:inline-block;margin-left:8px;font-size:11px;color:var(--accent-b);animation:pulse 1s ease 3}
    .ex-browse-more{width:calc(100% - 48px);margin:12px 24px;padding:12px;border-radius:10px;border:1px dashed var(--accent);background:transparent;color:var(--accent-b);font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;text-transform:uppercase}
  `;
  document.head.appendChild(s);
}

// ── Progression helpers ────────────────────────────────────────────────────
function getLastExerciseSession(exerciseId) {
  const t = today();
  const eid = String(exerciseId);
  const dates = Object.keys(workoutLog).filter(d => d !== t).sort().reverse();
  for (const d of dates) {
    const ex = (workoutLog[d].exercises || []).find(e => String(e.exerciseId) === eid);
    if (ex && ex.sets?.some(s => s.completed)) return { date: d, ex };
  }
  return null;
}

function getProgressionTip(exerciseId) {
  const last = getLastExerciseSession(exerciseId);
  if (!last) return { type: 'first', msg: '🆕 First time — focus on form, pick a manageable weight' };

  const { date, ex } = last;
  const allSets = ex.sets || [];
  const completedSets = allSets.filter(s => s.completed);
  const weightedSets = completedSets.filter(s => s.weight > 0 && s.reps > 0);
  const bwSets = completedSets.filter(s => s.weight === 0 && s.reps > 0);

  // Days ago label
  const t = today();
  const msAgo = new Date(t) - new Date(date);
  const daysAgo = Math.max(1, Math.round(msAgo / 86400000));
  const dLabel = daysAgo === 1 ? 'yesterday' : daysAgo <= 6 ? `${daysAgo}d ago` : `${Math.floor(daysAgo / 7)}w ago`;

  // Bodyweight exercise
  if (!weightedSets.length && bwSets.length) {
    const maxReps = Math.max(...bwSets.map(s => s.reps));
    const allDone = completedSets.length >= allSets.length;
    if (allDone) return { type: 'increase', msg: `📈 Last: ${maxReps} reps/set ${dLabel} — try +1 rep per set today` };
    return { type: 'maintain', msg: `🎯 ${completedSets.length}/${allSets.length} sets ${dLabel} — hit all sets before adding reps` };
  }

  if (!weightedSets.length) return null;

  const maxW = Math.max(...weightedSets.map(s => s.weight));
  const topSets = weightedSets.filter(s => s.weight === maxW);
  const avgReps = Math.round(topSets.reduce((s, x) => s + x.reps, 0) / topSets.length);
  const targetReps = allSets[0]?.reps || 8;
  const allSetsComplete = completedSets.length >= allSets.length;
  const allRepsHit = topSets.every(s => s.reps >= targetReps);

  if (allSetsComplete && allRepsHit) {
    const inc = maxW >= 80 ? 2.5 : maxW >= 40 ? 2.5 : 1.25;
    const next = +(maxW + inc).toFixed(2).replace(/\.?0+$/, '');
    return { type: 'increase', msg: `📈 All sets hit (${maxW} × ${avgReps}) ${dLabel} — try ${next} today` };
  }
  if (allSetsComplete && !allRepsHit) {
    return { type: 'maintain', msg: `🎯 Last: ${maxW} × avg ${avgReps} reps ${dLabel} — hit ${targetReps} reps before going heavier` };
  }
  return { type: 'maintain', msg: `🎯 ${completedSets.length}/${allSets.length} sets at ${maxW} ${dLabel} — complete all sets first` };
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: WORKOUT
// ══════════════════════════════════════════════════════════════════════════
function renderWorkout() {
  const prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const dayCount = prog.days.length;
  const dayIdx = workoutMeta.currentDayIndex % dayCount;
  const day = prog.days[dayIdx];
  const todayLog = workoutLog[today()];

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Workout</div><div class="page-sub">Train with purpose. Build discipline.</div></div>
    <div class="w-day-nav ani">
      <button class="w-day-arrow" onclick="shiftWorkoutDay(-1)">&#8249;</button>
      <div class="w-day-label">Day ${dayIdx + 1} of ${dayCount}</div>
      <button class="w-day-arrow" onclick="shiftWorkoutDay(1)">&#8250;</button>
    </div>
    <div class="w-card ani" onclick="go('workoutActive')">
      <div class="w-day-badge">${day.name}</div>
      <div class="w-card-name">${prog.name}</div>
      <div class="w-card-desc">${day.focus}</div>
      <div class="w-card-days" style="margin-top:12px;color:var(--accent)">${todayLog ? '✓ Workout logged today' : '→ Start todays workout'}</div>
    </div>
    <div style="display:flex;gap:8px;padding:0 24px 16px">
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('workoutPicker')">Programs</button>
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('workoutHistory')">History</button>
    </div>
    <div style="display:flex;gap:8px;padding:0 24px 16px">
      <button class="w-action-btn" style="margin:0;flex:1" onclick="initBuilder();go('workoutBuilder')">+ Create Program</button>
      <button class="w-action-btn" style="margin:0;flex:1" onclick="browserContext=null;go('exerciseBrowser')">Browse Exercises</button>
    </div>`;
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
      <button class="d-del-btn" style="position:absolute;top:12px;right:12px;font-size:18px" onclick="event.stopPropagation();deleteCustomProgram('${p.id}')">×</button>
    </div>`).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Programs</div><div class="page-sub">Choose your training split.</div></div>
    ${builtIn}${custom}
    <div class="w-card ani" style="text-align:center;border-style:dashed" onclick="initBuilder();go('workoutBuilder')">
      <div style="font-size:24px;color:var(--accent);margin-bottom:4px">+</div>
      <div class="w-card-name">Create Program</div>
      <div class="w-card-desc">Build your own custom split.</div>
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

function renderWorkoutActive() {
  const prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const day = prog.days[workoutMeta.currentDayIndex % prog.days.length];
  const t = today();

  // Initialize today's workout if not exists, or if program/day changed
  const needsInit = !workoutLog[t] ||
    workoutLog[t].programId !== prog.id ||
    workoutLog[t].dayIndex !== workoutMeta.currentDayIndex;
  if (needsInit) {
    workoutLog[t] = { programId: prog.id, dayIndex: workoutMeta.currentDayIndex, exercises: day.ex.map(eid => {
      const ex = lookupExercise(eid);
      const ds = ex ? ex.ds : 3;
      const dr = ex ? ex.dr : 10;
      // Auto-fill weight/reps from last session
      const last = getLastExerciseSession(eid);
      const lastSets = (last?.ex.sets || []).filter(s => s.completed);
      const lastW = lastSets.length ? Math.max(...lastSets.map(s => s.weight)) : 0;
      const lastR = lastSets.length ? (lastSets[lastSets.length - 1]?.reps || dr) : dr;
      return { exerciseId: eid, sets: Array.from({length: ds}, () => ({weight: lastW, reps: lastR, completed: false})) };
    })};
    LS.set('hvi_workout_log', workoutLog);
  }

  const wl = workoutLog[t];

  // Trigger background fetch for any missing wger exercises
  wl.exercises.forEach(we => {
    if (typeof we.exerciseId === 'number' && !wgerCache[we.exerciseId]) {
      wgerFetchExercise(we.exerciseId).then(ex => {
        if (ex && curView === 'workoutActive') renderWorkoutActive();
      });
    }
  });

  const exHTML = wl.exercises.map((we, ei) => {
    const ex = lookupExercise(we.exerciseId);
    const name = ex ? ex.name : 'Exercise data loading…';
    const muscle = ex ? ex.muscle : '';
    let tip = null;
    try { tip = getProgressionTip(we.exerciseId); } catch(e) {}
    const tipHTML = tip ? `<div class="w-ex-tip w-ex-tip-${tip.type}">${tip.msg}</div>` : '';
    const setsHTML = we.sets.map((s, si) => {
      const showPR = window._prJustSet && window._prJustSet.ei === ei && window._prJustSet.si === si;
      return `
      <div class="w-set">
        <span class="w-set-num">${si+1}</span>
        <input class="w-input" type="number" inputmode="decimal" value="${s.weight||''}" placeholder="${wtUnit()}" onfocus="this.select()" oninput="updateSet(${ei},${si},'weight',this.value)">
        <span class="w-input-label">×</span>
        <input class="w-input" type="number" inputmode="decimal" value="${s.reps||''}" placeholder="reps" onfocus="this.select()" oninput="updateSet(${ei},${si},'reps',this.value)">
        <div class="w-set-check${s.completed?' done':''}" onclick="toggleSet(${ei},${si})">✓</div>
        ${showPR ? '<span class="pr-badge">🏆 New PR!</span>' : ''}
      </div>`;
    }).join('');
    const canRemove = we.sets.length > 1;
    return `<div class="w-ex ani">
      <div class="w-ex-head"><div><div class="w-ex-name">${esc(name)}</div><div class="w-ex-muscle">${esc(muscle)}</div></div>${buildExerciseSparkline(we.exerciseId)}</div>
      ${tipHTML}
      ${setsHTML}
      <div class="w-set-actions">
        <button class="w-add-set" onclick="addSet(${ei})">+ Add Set</button>
        ${canRemove ? `<button class="w-add-set" style="color:var(--fat);opacity:0.7" onclick="removeSet(${ei},${we.sets.length-1})">− Remove Set</button>` : ''}
      </div></div>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="w-day-badge">${day.name}</div><div class="page-title">${prog.name}</div><div class="page-sub">${day.focus}</div></div>
    ${exHTML}
    <div id="rest-timer-bar" class="rt-bar" style="display:none"></div>
    <div class="rt-presets">
      <span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px">Rest</span>
      <button class="rt-preset-btn" onclick="startRestTimer(60)">1:00</button>
      <button class="rt-preset-btn" onclick="startRestTimer(90)">1:30</button>
      <button class="rt-preset-btn" onclick="startRestTimer(120)">2:00</button>
      <button class="rt-preset-btn" onclick="startRestTimer(180)">3:00</button>
    </div>
    <button class="w-finish" onclick="finishWorkout()">Finish Workout</button>`;
}

function updateSet(ei, si, field, val) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  wl.exercises[ei].sets[si][field] = field === 'weight' ? parseFloat(val) || 0 : parseInt(val) || 0;
  LS.set('hvi_workout_log', workoutLog);
}

function toggleSet(ei, si) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const set = wl.exercises[ei].sets[si];
  set.completed = !set.completed;
  LS.set('hvi_workout_log', workoutLog);
  navigator.vibrate && navigator.vibrate(set.completed ? 12 : 6);

  if (set.completed) checkDailyQuests();
  if (set.completed && set.weight > 0 && set.reps > 0) {
    const eid = wl.exercises[ei].exerciseId;
    const ex = lookupExercise(eid);
    const cur = prs[eid];
    const newVol = set.weight * set.reps;
    const curVol = cur ? cur.weight * cur.reps : 0;
    if (!cur || set.weight > cur.weight || newVol > curVol) {
      prs[eid] = { weight: set.weight, reps: set.reps, date: t, name: ex ? ex.name : '' };
      LS.set('hvi_prs', prs);
      awardXP(100, 'body');
      window._prJustSet = { ei, si };
      setTimeout(() => {
        if (window._prJustSet && window._prJustSet.ei === ei && window._prJustSet.si === si) {
          window._prJustSet = null;
          if (curView === 'workoutActive') {
            document.querySelectorAll('.pr-badge').forEach(el => el.remove());
          }
        }
      }, 2500);
    }
  }
  // Auto-start rest timer when completing a set
  if (set.completed) startRestTimer(restTimerDur);
  go('workoutActive');
}

function addSet(ei) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const ex = lookupExercise(wl.exercises[ei].exerciseId);
  const dr = ex ? ex.dr : 10;
  const sets = wl.exercises[ei].sets;
  const last = sets[sets.length - 1];
  sets.push({ weight: last?.weight || 0, reps: last?.reps || dr, completed: false });
  LS.set('hvi_workout_log', workoutLog);
  go('workoutActive');
}

function removeSet(ei, si) {
  const t = today(), wl = workoutLog[t];
  if (!wl) return;
  const sets = wl.exercises[ei].sets;
  if (sets.length <= 1) return; // keep at least 1 set
  sets.splice(si, 1);
  LS.set('hvi_workout_log', workoutLog);
  go('workoutActive');
}

// ── REST TIMER ──────────────────────────────────────────────────────────
function startRestTimer(dur) {
  restTimerDur = dur || 90;
  restTimerEnd = Date.now() + restTimerDur * 1000;
  _updateRestTimer();
  if (restTimer) clearInterval(restTimer);
  restTimer = setInterval(_updateRestTimer, 250);
  navigator.vibrate && navigator.vibrate(12);
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
    navigator.vibrate && navigator.vibrate([100, 50, 100]);
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
  workoutMeta.lastWorkoutDate = today();
  LS.set('hvi_workout_meta', workoutMeta);
  playSound('complete');
  awardXP(50, 'body');
  trackWeeklyWorkout();
  checkDailyQuests();
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
  workoutMeta.currentDayIndex = ((workoutMeta.currentDayIndex + delta) % len + len) % len;
  // Clear today's log so the new day initializes fresh when entering active workout
  delete workoutLog[today()];
  LS.set('hvi_workout_meta', workoutMeta);
  LS.set('hvi_workout_log', workoutLog);
  renderWorkout();
}

function deleteCustomProgram(id) {
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
  builderProg = { id: 'cp_' + Date.now(), name: '', desc: '', days: [{ name: 'Day 1', focus: '', ex: [] }] };
  builderDayIdx = 0;
  builderSearch = '';
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
    <div class="page-head ani"><div class="page-title">Build Program</div><div class="page-sub">Create your custom training split.</div></div>
    <div style="padding:0 24px" class="ani">
      <div class="d-goals-row"><div class="d-goals-label">Name</div><input class="d-input" type="text" id="bp-name" value="${esc(builderProg.name)}" placeholder="e.g. My PPL" style="flex:1" onchange="builderProg.name=this.value"></div>
      <div class="d-goals-row"><div class="d-goals-label">Description</div><input class="d-input" type="text" id="bp-desc" value="${esc(builderProg.desc)}" placeholder="e.g. 4-day upper/lower split" style="flex:1" onchange="builderProg.desc=this.value"></div>

      <div class="sec-lbl" style="padding:20px 0 8px">Days</div>
      <div class="d-type-btns" style="padding:0 0 12px;flex-wrap:wrap">${dayTabs}</div>

      <div class="d-goals-row"><div class="d-goals-label">Day Name</div><input class="d-input" type="text" id="bp-dn" value="${esc(day.name)}" placeholder="e.g. Push A" style="flex:1" onchange="builderProg.days[builderDayIdx].name=this.value"></div>
      <div class="d-goals-row"><div class="d-goals-label">Focus</div><input class="d-input" type="text" id="bp-df" value="${esc(day.focus)}" placeholder="e.g. Chest, Shoulders" style="flex:1" onchange="builderProg.days[builderDayIdx].focus=this.value"></div>

      <div class="sec-lbl" style="padding:16px 0 8px">Exercises (${day.ex.length})</div>
      ${addedEx || '<p style="font-size:12px;color:var(--text-muted);padding:4px 0">No exercises added yet.</p>'}

      <div class="sec-lbl" style="padding:16px 0 8px">Add Exercises</div>
      <input class="d-input" type="text" id="bp-search" placeholder="Search by name or muscle..." value="${esc(builderSearch)}" oninput="builderSearch=this.value;debouncedBuilderSearch()">
      <div style="margin-top:8px" id="bp-exlist">${searchHTML}</div>
      <button class="w-action-btn" style="margin-top:12px;width:100%" onclick="browserContext={dayIndex:builderDayIdx};go('exerciseBrowser')">BROWSE FULL LIBRARY</button>
    </div>
    <button class="w-finish" onclick="saveCustomProgram()">SAVE PROGRAM</button>`;
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
  progs.push(builderProg);
  LS.set('hvi_custom_programs', progs);
  selectProgram(builderProg.id);
  builderProg = null;
}

function renderWorkoutHistory() {
  const dates = Object.keys(workoutLog).sort().reverse().slice(0, 14);
  const items = dates.length ? dates.map(d => {
    const wl = workoutLog[d];
    const prog = findProgram(wl.programId);
    const dayInfo = prog ? prog.days[wl.dayIndex % prog.days.length] : null;
    const totalVol = wl.exercises.reduce((sum, we) => sum + we.sets.reduce((s2, st) => s2 + (st.completed ? st.weight * st.reps : 0), 0), 0);
    const totalSets = wl.exercises.reduce((sum, we) => sum + we.sets.filter(s => s.completed).length, 0);
    return `<div class="w-hist-item" style="position:relative"><div class="w-hist-date">${fmtDate(d)}</div>
      <div class="w-hist-prog">${dayInfo ? dayInfo.name : 'Workout'} ${prog ? '· ' + prog.name : ''}</div>
      <div class="w-hist-vol">${totalSets} sets · ${totalVol.toLocaleString()} ${wtUnit()} volume</div>
      <button class="w-repeat-btn" onclick="event.stopPropagation();repeatWorkout('${d}')" title="Repeat this workout">↻</button></div>`;
  }).join('') : '<div class="empty-state"><div class="empty-state-icon">🏋️</div><div class="empty-state-title">No workouts yet</div><div class="empty-state-sub">Start your first workout to see your history here.</div><button class="empty-state-btn" onclick="go(\'workoutActive\')">Start Workout</button></div>';

  // Volume chart — last 7 days
  const last7 = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toLocaleDateString('en-CA');
    const wl2 = workoutLog[key];
    const vol = wl2 ? wl2.exercises.reduce((s,e) => s + e.sets.reduce((s2,st) => s2 + (st.completed ? st.weight*st.reps : 0), 0), 0) : 0;
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
    <div class="page-head ani"><div class="page-title">History</div><div class="page-sub">Your last 14 days of training.</div></div>
    ${chartHTML}
    <button class="w-action-btn" onclick="go('prHistory')">🏆 Personal Records</button>
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

  const backTarget = browserContext ? 'workoutBuilder' : 'workout';

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

  const actionBtn = browserContext
    ? `<button class="ex-add-btn" onclick="event.stopPropagation();addExerciseToDay(${ex.id}, ${JSON.stringify(name).replace(/"/g,'&quot;')}, ${JSON.stringify(cat).replace(/"/g,'&quot;')})">+ ADD</button>`
    : `<button class="ex-log-btn" onclick="event.stopPropagation();logBrowserExercise(${ex.id})">LOG</button>`;

  let detailHTML = '';
  if (isExpanded) {
    const img = ex.image ? `<img loading="lazy" src="${ex.image.startsWith('http') ? ex.image : 'https://wger.de' + ex.image}" alt="">` : '';
    const musclesFull = ex.muscles && ex.muscles.length ? `<div><strong>Muscles:</strong> ${esc(ex.muscles.join(', '))}</div>` : '';
    const prLine = pr ? `<div class="ex-detail-pr">Your PR: ${pr.weight} ${wtUnit()} × ${pr.reps} reps (${pr.date})</div>` : '';
    const desc = ex.description ? `<div style="margin:6px 0">${esc(ex.description)}</div>` : '';
    const addToProgBtn = browserContext ? `<button class="ex-add-btn" style="margin-top:8px" onclick="addExerciseToDay(${ex.id}, ${JSON.stringify(name).replace(/"/g,'&quot;')}, ${JSON.stringify(cat).replace(/"/g,'&quot;')})">+ ADD TO PROGRAM</button>` : '';
    detailHTML = `<div class="ex-detail">${prLine}${desc}${musclesFull}${img}${addToProgBtn}</div>`;
  }

  return `<div class="ex-card" onclick="toggleBrowserExpand(${ex.id})">
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
    const sugg = await wgerSearch(bs.search);
    // Need to fetch full info for each result — but that's expensive. Fetch in parallel, limit to 20.
    const top = sugg.slice(0, 20);
    const infos = await Promise.all(top.map(s => wgerFetchExercise(s.base_id)));
    exercises = infos.filter(Boolean);
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
  const ex = wgerCache[id];
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
      const best = Math.max(0, ...ex.sets.filter(s=>s.completed).map(s => s.weight * s.reps));
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
  const trend = sessions[sessions.length-1].vol >= sessions[0].vol;
  const col = trend ? 'var(--accent-b)' : 'var(--fat)';
  return `<svg viewBox="0 0 ${w} ${h}" class="w-sparkline" style="width:80px;height:24px">
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
