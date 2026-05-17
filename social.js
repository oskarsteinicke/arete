// ══════════════════════════════════════════════════════════════════════════
// Arete — Social Module (Library, Sleep, Calendar)
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// RENDER: LIBRARY (Books + Journal)
// ══════════════════════════════════════════════════════════════════════════
function renderLibrary() {
  const tabs = `<div class="lib-tabs"><button class="lib-tab${libTab==='books'?' active':''}" onclick="libTab='books';renderLibrary()">Books</button><button class="lib-tab${libTab==='journal'?' active':''}" onclick="libTab='journal';renderLibrary()">Journal</button></div>`;

  if (libTab === 'journal') {
    renderLibraryJournal(tabs);
  } else {
    renderLibraryBooks(tabs);
  }
}

function renderLibraryBooks(tabs) {
  const groups = PILLARS.map(p => {
    const pBooks = BOOKS.filter(b => b.pillar === p.id);
    if (!pBooks.length) return '';
    return `<div class="sec-lbl" style="padding-top:16px">${p.name}</div>` +
      pBooks.map(b => `<div class="book-card${b.url?' book-card-link':''}" ${b.url?`onclick="window.open('${b.url}','_blank')"`:''}>
        <div class="book-title"><span class="book-pillar-dot"></span>${esc(b.title)}</div>
        <div class="book-author">${esc(b.author)}</div>
        <div class="book-desc">${esc(b.desc)}</div>
        ${b.url ? '<div class="book-link-hint">View on Goodreads →</div>' : ''}
      </div>`).join('');
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Library</div><div class="page-sub">Curated reading for growth.</div></div>
    ${tabs}<div class="ani">${groups}</div>`;
}

let _journalSearch = '';
let _journalEditing = false;

const _DEFAULT_JOURNAL_QS = [
  { key: 'wins', label: 'Wins Today', placeholder: 'What went well?' },
  { key: 'lessons', label: 'Lessons Learned', placeholder: 'What did you learn?' },
  { key: 'intentions', label: 'Intentions for Tomorrow', placeholder: 'What will you focus on?' },
];

function _getJournalQs() { return settings.journalQuestions || _DEFAULT_JOURNAL_QS; }

function renderLibraryJournal(tabs) {
  const t = today();
  const e = journal[t] || {};
  const qs = _getJournalQs();

  const fieldsHTML = qs.map(q =>
    `<div class="j-lbl">${esc(q.label)}</div><textarea class="j-ta" id="j-${q.key}" placeholder="${esc(q.placeholder)}" rows="3">${esc(e[q.key]||'')}</textarea>`
  ).join('');

  let pastDates = Object.keys(journal).filter(d => d !== t && Object.values(journal[d]).some(Boolean)).sort().reverse();
  if (_journalSearch) {
    const sq = _journalSearch.toLowerCase();
    pastDates = pastDates.filter(d => Object.values(journal[d]).join(' ').toLowerCase().includes(sq));
  }
  pastDates = pastDates.slice(0, 30);
  const pastHTML = pastDates.length ? pastDates.map(d => {
    const je = journal[d]; let parts = '';
    qs.forEach(q => { if (je[q.key]) parts += `<div class="jp-field">${esc(q.label)}</div><div class="jp-text">${esc(je[q.key])}</div>`; });
    Object.keys(je).forEach(k => { if (!qs.find(q => q.key === k) && je[k]) parts += `<div class="jp-field">${esc(k)}</div><div class="jp-text">${esc(je[k])}</div>`; });
    return `<div class="jp-item"><div class="jp-date">${fmtDate(d)}</div>${parts}</div>`;
  }).join('') : '<div class="empty-state" style="padding:16px 0"><div class="empty-state-icon">📝</div><div class="empty-state-title">No past entries</div><div class="empty-state-sub">Write your first journal entry above to start reflecting.</div></div>';

  document.getElementById('view').innerHTML = `
    <div class="jh ani"><div class="jh-title">Library</div><div class="jh-sub">Reflect on your day. Recalibrate for tomorrow.</div></div>
    ${tabs}
    <div class="j-body ani">
      <div style="display:flex;justify-content:flex-end;margin-bottom:4px">
        <button class="j-edit-btn" onclick="_journalEditing=!_journalEditing;renderLibrary()" title="Edit questions">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span style="margin-left:4px">${_journalEditing ? 'Done' : 'Edit questions'}</span>
        </button>
      </div>
      ${_journalEditing ? _renderJournalEditor(qs) : fieldsHTML}
      ${_journalEditing ? '' : '<div class="j-status" id="j-status">Auto-saving</div>'}
      <button class="j-tog" onclick="togglePast()">Past Entries</button>
      <div class="j-past" id="j-past">
        <input class="search-input" type="text" placeholder="Search entries…" value="${esc(_journalSearch)}" oninput="_journalSearch=this.value;renderLibrary()" style="margin-bottom:12px">
        ${pastHTML}
      </div>
    </div>`;

  if (!_journalEditing) {
    qs.forEach(q => {
      const el = document.getElementById('j-' + q.key);
      if (el) el.addEventListener('input', () => {
        clearTimeout(jDebounce);
        const s = document.getElementById('j-status');
        if (s) { s.textContent = 'Saving…'; s.classList.remove('saved'); }
        jDebounce = setTimeout(saveJournal, 800);
      });
    });
  }
}

function _renderJournalEditor(qs) {
  const rows = qs.map((q, i) => `
    <div class="jq-edit-row">
      <div class="jq-edit-fields">
        <input class="jq-edit-input" placeholder="Label (e.g. Gratitude)" value="${esc(q.label)}" data-field="label" data-idx="${i}">
        <input class="jq-edit-input jq-edit-ph" placeholder="Placeholder text" value="${esc(q.placeholder)}" data-field="placeholder" data-idx="${i}">
      </div>
      <button class="jq-edit-del" onclick="_removeJournalQ(${i})" title="Remove">×</button>
    </div>
  `).join('');

  return `
    <div class="jq-editor">
      <div class="jq-edit-list">${rows}</div>
      <button class="jq-add-btn" onclick="_addJournalQ()">+ Add question</button>
      <button class="jq-reset-btn" onclick="_resetJournalQs()">Reset to defaults</button>
    </div>
  `;
}

function _addJournalQ() {
  const qs = _getJournalQs().slice();
  qs.push({ key: 'q' + Date.now(), label: 'New Question', placeholder: 'Your answer...' });
  settings.journalQuestions = qs;
  LS.set('hvi_settings', settings);
  renderLibrary();
}

function _removeJournalQ(idx) {
  const qs = _getJournalQs().slice();
  if (qs.length <= 1) return;
  qs.splice(idx, 1);
  settings.journalQuestions = qs;
  LS.set('hvi_settings', settings);
  renderLibrary();
}

function _resetJournalQs() {
  delete settings.journalQuestions;
  LS.set('hvi_settings', settings);
  _journalEditing = false;
  renderLibrary();
}

function _saveJournalQEdits() {
  const rows = document.querySelectorAll('.jq-edit-row');
  if (!rows.length) return;
  const qs = _getJournalQs().slice();
  rows.forEach((row, i) => {
    if (!qs[i]) return;
    const labelEl = row.querySelector('[data-field="label"]');
    const phEl = row.querySelector('[data-field="placeholder"]');
    if (labelEl) qs[i].label = labelEl.value.trim() || qs[i].label;
    if (phEl) qs[i].placeholder = phEl.value.trim() || qs[i].placeholder;
  });
  settings.journalQuestions = qs;
  LS.set('hvi_settings', settings);
}

document.addEventListener('input', e => {
  if (e.target.classList.contains('jq-edit-input')) {
    clearTimeout(jDebounce);
    jDebounce = setTimeout(_saveJournalQEdits, 500);
  }
});


function saveJournal() {
  const t = today();
  const qs = _getJournalQs();
  const entry = {};
  qs.forEach(q => { entry[q.key] = (document.getElementById('j-' + q.key)?.value || '').trim(); });
  // Preserve any fields from other question sets
  if (journal[t]) Object.keys(journal[t]).forEach(k => { if (!(k in entry)) entry[k] = journal[t][k]; });
  journal[t] = entry;
  LS.set('hvi_journal3', journal);
  if (gamification.journalXPDate !== t && Object.values(journal[t] || {}).some(Boolean)) {
    gamification.journalXPDate = t;
    LS.set('hvi_gamification', gamification);
    awardXP(20, 'mind');
    trackWeeklyJournal();
    checkDailyQuests();
  }
  const s = document.getElementById('j-status');
  if (s) { s.textContent = 'Saved \u2713'; s.classList.add('saved'); setTimeout(() => { if (s) { s.textContent = 'Auto-saving'; s.classList.remove('saved'); } }, 2000); }
}

function togglePast() {
  const el = document.getElementById('j-past'), btn = document.querySelector('.j-tog');
  if (!el) return;
  el.classList.toggle('open');
  if (btn) btn.textContent = el.classList.contains('open') ? 'Hide Past Entries' : 'Past Entries';
}

// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// SLEEP TRACKING
// ══════════════════════════════════════════════════════════════════════════
function renderSleep() {
  const t = today();
  const entry = sleepLog[t] || {};
  const last7 = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toLocaleDateString('en-CA');
    const e = sleepLog[k];
    if (e && e.hours) last7.push(e);
  }
  const avg = last7.length ? (last7.reduce((s,e) => s + e.hours, 0) / last7.length).toFixed(1) : '—';
  const avgQ = last7.length ? (last7.reduce((s,e) => s + (e.quality || 3), 0) / last7.length).toFixed(1) : '—';

  const barHTML = (() => {
    const bars = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toLocaleDateString('en-CA');
      const e = sleepLog[k];
      const h = e?.hours || 0;
      const pct = Math.min(1, h / 10) * 100;
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,2);
      const col = h >= 7 ? 'var(--accent-b)' : h >= 5 ? 'var(--carb)' : 'var(--fat)';
      bars.push(`<div class="sl-bar-col">
        <div class="sl-bar-val">${h || ''}</div>
        <div class="sl-bar-track"><div class="sl-bar-fill" style="height:${pct}%;background:${col}"></div></div>
        <div class="sl-bar-day">${dayLabel}</div>
      </div>`);
    }
    return bars.join('');
  })();

  const qualOpts = [1,2,3,4,5].map(q =>
    `<button class="sl-q-btn${(entry.quality||0)===q?' active':''}" onclick="setSleepQuality(${q})">${q}</button>`
  ).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Sleep</div><div class="page-sub">Recovery is where growth happens.</div></div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:20px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px">Last Night's Sleep</div>
      <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:16px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Hours slept</div>
          <input class="d-input" type="number" min="0" max="16" step="0.5" value="${entry.hours||''}" placeholder="e.g. 7.5" style="margin:0" oninput="saveSleepHours(this.value)">
        </div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Bedtime</div>
          <input class="d-input" type="time" value="${entry.bedtime||''}" style="margin:0" oninput="saveSleepField('bedtime',this.value)">
        </div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Wake time</div>
          <input class="d-input" type="time" value="${entry.wake||''}" style="margin:0" oninput="saveSleepField('wake',this.value)">
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Sleep quality</div>
      <div class="sl-q-row">${qualOpts}</div>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:20px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px">This Week</div>
      <div class="s-grid" style="margin:0 0 16px">
        <div class="s-card"><div class="s-val" style="font-size:22px">${avg}</div><div class="s-lbl">Avg Hours</div></div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${avgQ}</div><div class="s-lbl">Avg Quality</div></div>
      </div>
      <div class="sl-bars">${barHTML}</div>
    </div>`;
}

function saveSleepHours(val) {
  const t = today();
  if (!sleepLog[t]) sleepLog[t] = {};
  sleepLog[t].hours = parseFloat(val) || 0;
  LS.set('hvi_sleep_log', sleepLog);
}
function setSleepQuality(q) {
  const t = today();
  if (!sleepLog[t]) sleepLog[t] = {};
  sleepLog[t].quality = q;
  LS.set('hvi_sleep_log', sleepLog);
  renderSleep();
}
function saveSleepField(field, val) {
  const t = today();
  if (!sleepLog[t]) sleepLog[t] = {};
  sleepLog[t][field] = val;
  LS.set('hvi_sleep_log', sleepLog);
}

// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// RENDER: CALENDAR
// ══════════════════════════════════════════════════════════════════════════
// ── Calendar task helpers ─────────────────────────────────────────────────
function addCalTask(date, text) {
  text = (text || '').trim();
  if (!text) return;
  if (!calTasks[date]) calTasks[date] = [];
  calTasks[date].push({ id: 't_' + Date.now(), text, done: false });
  LS.set('hvi_cal_tasks', calTasks);
}
function toggleCalTask(date, id) {
  const t = (calTasks[date] || []).find(t => t.id === id);
  if (t) { t.done = !t.done; LS.set('hvi_cal_tasks', calTasks); }
}
function deleteCalTask(date, id) {
  if (!calTasks[date]) return;
  calTasks[date] = calTasks[date].filter(t => t.id !== id);
  LS.set('hvi_cal_tasks', calTasks);
}
function submitCalTask(date) {
  const inp = document.getElementById('cal-task-inp-' + date);
  if (!inp) return;
  addCalTask(date, inp.value);
  inp.value = '';
  _refreshCalTasks(date);
}
function _onCalTaskKey(e, date) {
  if (e.key === 'Enter') { e.preventDefault(); submitCalTask(date); }
}
function _refreshCalTasks(date) {
  const el = document.getElementById('cal-tasks-' + date);
  if (el) el.innerHTML = _buildTaskListHTML(date);
}
function _toggleCalTaskUI(date, id) {
  toggleCalTask(date, id);
  _refreshCalTasks(date);
  // also refresh dots in monthly/weekly
  const dot = document.getElementById('cal-task-dot-' + date);
  if (dot) { const tasks = calTasks[date] || []; dot.style.display = tasks.length ? '' : 'none'; }
}
function _deleteCalTaskUI(date, id) {
  deleteCalTask(date, id);
  _refreshCalTasks(date);
}

function _buildTaskListHTML(date) {
  const tasks = calTasks[date] || [];
  const rows = tasks.map(t => `
    <div class="cal-task-item">
      <button class="cal-task-cb${t.done ? ' cal-task-cb-done' : ''}"
        onclick="_toggleCalTaskUI('${date}','${t.id}')">✓</button>
      <span class="cal-task-text${t.done ? ' cal-task-text-done' : ''}">${esc(t.text)}</span>
      <button class="cal-task-del" onclick="_deleteCalTaskUI('${date}','${t.id}')">×</button>
    </div>`).join('');
  return rows;
}

function _buildTasksSection(date) {
  return `
    <div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">📋 Tasks</div>
      <div class="cal-task-list" id="cal-tasks-${date}">${_buildTaskListHTML(date)}</div>
      <div class="cal-task-add">
        <input class="cal-task-input" id="cal-task-inp-${date}" placeholder="Add a task…"
          onkeydown="_onCalTaskKey(event,'${date}')">
        <button class="cal-task-add-btn" onclick="submitCalTask('${date}')">+</button>
      </div>
    </div>`;
}

// ── Calendar navigation ───────────────────────────────────────────────────
function setCalView(v) { calView = v; renderCalendar(); }

function calPrev() {
  const d = new Date(calSelectedDate + 'T00:00:00');
  if (calView === 'daily')        { d.setDate(d.getDate() - 1); }
  else if (calView === 'weekly')  { d.setDate(d.getDate() - 7); }
  else { if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--; renderCalendar(); return; }
  calSelectedDate = d.toLocaleDateString('en-CA');
  calYear = d.getFullYear(); calMonth = d.getMonth();
  renderCalendar();
}
function calNext() {
  const d = new Date(calSelectedDate + 'T00:00:00');
  if (calView === 'daily')        { d.setDate(d.getDate() + 1); }
  else if (calView === 'weekly')  { d.setDate(d.getDate() + 7); }
  else {
    const now = new Date();
    if (calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth())) return;
    if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
    renderCalendar(); return;
  }
  calSelectedDate = d.toLocaleDateString('en-CA');
  calYear = d.getFullYear(); calMonth = d.getMonth();
  renderCalendar();
}
// Legacy aliases kept for any inline calls
function calPrevMonth() { calPrev(); }
function calNextMonth() { calNext(); }

function calSelectDate(date) {
  calSelectedDate = date;
  if (calView === 'monthly') {
    const el = document.getElementById('cal-detail');
    if (el) {
      el.innerHTML = buildCalDayDetail(date);
      document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('cal-selected'));
      const sel = document.querySelector(`.cal-cell[data-date="${date}"]`);
      if (sel) sel.classList.add('cal-selected');
    }
  } else if (calView === 'weekly') {
    const el = document.getElementById('cal-detail');
    if (el) {
      el.innerHTML = buildCalDayDetail(date);
      document.querySelectorAll('.cal-wcol').forEach(c => c.classList.remove('cal-wcol-sel'));
      const sel = document.querySelector(`.cal-wcol[data-date="${date}"]`);
      if (sel) sel.classList.add('cal-wcol-sel');
    }
  }
}

function buildCalDayDetail(date) {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const isToday = date === today();
  const isFuture = date > today();

  // ── Tasks ──
  const tasksHTML = _buildTasksSection(date);

  if (isFuture) {
    return `<div class="cal-detail-hdr">${label}</div>${tasksHTML}`;
  }

  // ── Habits ──
  const doneHabits = isToday
    ? habits.filter(h => log[h.id]?.completedToday)
    : habits.filter(h => log[h.id]?.lastCompletedDate === date);
  const totalHabits = habits.length;
  let habitHTML = '';
  if (totalHabits) {
    const pct = Math.round(doneHabits.length / totalHabits * 100);
    const rows = doneHabits.map(h => `<div class="cal-di">✓ <span>${esc(h.name)}</span></div>`).join('');
    const missed = habits.filter(h => !doneHabits.includes(h));
    const missedRows = missed.map(h => `<div class="cal-di" style="opacity:.4">○ <span>${esc(h.name)}</span></div>`).join('');
    habitHTML = `<div class="cal-daily-sec-hdr">✅ Habits <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${doneHabits.length}/${totalHabits} · ${pct}%</span></div>${rows}${missedRows}`;
  }

  // ── Workout ──
  const wl = workoutLog[date];
  const workoutDone = wl?.exercises?.some(e => e.sets?.some(s => s.completed));
  let workoutHTML = '';
  if (workoutDone) {
    const prog = findProgram(wl.programId);
    const day = prog?.days[wl.dayIndex % prog.days.length];
    const exDone = wl.exercises.filter(e => e.sets.some(s => s.completed));
    const exRows = exDone.map(e => {
      const ex = lookupExercise(e.exerciseId);
      const sets = e.sets.filter(s => s.completed);
      const best = sets.length ? Math.max(...sets.map(s => s.weight)) : 0;
      return `<div class="cal-di-sub">${esc(ex?.name || 'Exercise')} — ${sets.length} sets${best ? ' · best ' + best + wtUnit() : ''}</div>`;
    }).join('');
    workoutHTML = `<div class="cal-daily-sec-hdr">💪 Workout</div>
      <div class="cal-di">🏋️ <span>${day ? day.name + ' · ' + prog.name : 'Workout logged'}</span></div>${exRows}`;
  }

  // ── Meals ──
  const meals = mealLog[date]?.meals || [];
  let mealsHTML = '';
  if (meals.length) {
    const totalCal = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.calories || 0), 0), 0);
    const totalP   = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.protein  || 0), 0), 0);
    const rows = meals.map(m => {
      const cal = m.items.reduce((s, i) => s + (i.calories || 0), 0);
      const p   = m.items.reduce((s, i) => s + (i.protein  || 0), 0);
      return `<div class="cal-di">🍽 <span>${esc(m.name)} — ${cal} cal · ${p}g P</span></div>`;
    }).join('');
    mealsHTML = `<div class="cal-daily-sec-hdr">🍽 Meals <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${totalCal} cal · ${totalP}g P</span></div>${rows}`;
  }

  // ── Weight ──
  const w = weightLog[date];
  const weightHTML = w ? `<div class="cal-daily-sec-hdr">⚖️ Weight</div><div class="cal-di">⚖️ <span>${w} ${wtUnit()}</span></div>` : '';

  // ── Journal ──
  const je = journal[date] || {};
  const hasJournal = Object.values(je).some(Boolean);
  let journalHTML = '';
  if (hasJournal) {
    const parts = [
      je.wins    && `<div class="cal-di-sub">Wins: ${esc(je.wins.slice(0,100))}${je.wins.length>100?'…':''}</div>`,
      je.lessons && `<div class="cal-di-sub">Lessons: ${esc(je.lessons.slice(0,100))}${je.lessons.length>100?'…':''}</div>`
    ].filter(Boolean).join('');
    journalHTML = `<div class="cal-daily-sec-hdr">📖 Journal</div><div class="cal-di">📖 <span>Entry</span></div>${parts}`;
  }

  const nothingLogged = !doneHabits.length && !workoutDone && !meals.length && !w && !hasJournal;
  const nothingMsg = nothingLogged ? '<div class="cal-di-empty">Nothing logged this day.</div>' : '';

  return `<div class="cal-detail-hdr">${label}</div>
    ${tasksHTML}${nothingMsg}${habitHTML}${workoutHTML}${mealsHTML}${weightHTML}${journalHTML}`;
}

// ── Dot builder (shared) ─────────────────────────────────────────────────
function _calDots(date) {
  const t = today();
  const isFuture = date > t;
  const isToday = date === t;
  const hasTasks = (calTasks[date] || []).length > 0;
  if (isFuture) return hasTasks ? `<span class="cal-dot" style="background:#f472b6"></span>` : '';
  const hasWorkout = workoutLog[date]?.exercises?.some(e => e.sets?.some(s => s.completed));
  const hasMeal    = (mealLog[date]?.meals || []).length > 0;
  const hasJournal = Object.values(journal[date] || {}).some(Boolean);
  const hasWeight  = !!weightLog[date];
  const habitsDone = isToday
    ? habits.filter(h => log[h.id]?.completedToday).length
    : habits.filter(h => log[h.id]?.lastCompletedDate === date).length;
  const habitPct = habits.length ? habitsDone / habits.length : 0;
  return [
    hasTasks    ? `<span class="cal-dot" style="background:#f472b6"></span>` : '',
    habitsDone > 0 ? `<span class="cal-dot" style="background:${habitPct >= 1 ? 'var(--accent-b)' : 'var(--accent)'}"></span>` : '',
    hasWorkout  ? `<span class="cal-dot" style="background:#5b9cf6"></span>` : '',
    hasMeal     ? `<span class="cal-dot" style="background:#4ade80"></span>` : '',
    hasJournal  ? `<span class="cal-dot" style="background:#a78bfa"></span>` : '',
    hasWeight   ? `<span class="cal-dot" style="background:#fb923c"></span>` : '',
  ].filter(Boolean).join('');
}

function _calViewToggle() {
  return `<div class="cal-view-seg ani">
    <button class="cal-vbtn${calView==='monthly'?' cal-vbtn-active':''}" onclick="setCalView('monthly')">Month</button>
    <button class="cal-vbtn${calView==='weekly'?' cal-vbtn-active':''}" onclick="setCalView('weekly')">Week</button>
    <button class="cal-vbtn${calView==='daily'?' cal-vbtn-active':''}" onclick="setCalView('daily')">Day</button>
  </div>`;
}

function _calLegend() {
  return `<div class="cal-legend ani">
    <span class="cal-leg"><span class="cal-dot" style="background:#f472b6"></span> Tasks</span>
    <span class="cal-leg"><span class="cal-dot" style="background:var(--accent)"></span> Habits</span>
    <span class="cal-leg"><span class="cal-dot" style="background:#5b9cf6"></span> Workout</span>
    <span class="cal-leg"><span class="cal-dot" style="background:#4ade80"></span> Meals</span>
    <span class="cal-leg"><span class="cal-dot" style="background:#a78bfa"></span> Journal</span>
  </div>`;
}

function renderCalMonthly() {
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
    const isToday  = date === t;
    const isSel    = date === calSelectedDate;
    cells += `<div class="cal-cell${isToday?' cal-today':''}${isSel?' cal-selected':''}${isFuture?' cal-future':''}" data-date="${date}" onclick="calSelectDate('${date}')">
      <div class="cal-num">${day}</div>
      <div class="cal-dots">${_calDots(date)}</div>
    </div>`;
  }

  document.getElementById('view').innerHTML = `
    <div class="cal-hdr ani">
      <button class="cal-nav-btn" onclick="calPrev()">‹</button>
      <div class="cal-month-label">${monthLabel}</div>
      <button class="cal-nav-btn${isCurrentMonth?' cal-nav-disabled':''}" onclick="calNext()">›</button>
    </div>
    ${_calViewToggle()}
    ${_calLegend()}
    <div class="cal-dow-row">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div>
    <div class="cal-grid ani">${cells}</div>
    <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
}

function renderCalWeekly() {
  if (!calSelectedDate) calSelectedDate = today();
  const sel = new Date(calSelectedDate + 'T00:00:00');
  // find Monday of this week
  const dow = sel.getDay(); // 0=Sun
  const monday = new Date(sel);
  monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
  const t = today();
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let cols = '';
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const date = d.toLocaleDateString('en-CA');
    days.push(date);
    const isFuture = date > t;
    const isToday  = date === t;
    const isSel    = date === calSelectedDate;
    cols += `<div class="cal-wcol${isSel?' cal-wcol-sel':''}${isFuture?' cal-wfuture':''}" data-date="${date}" onclick="calSelectDate('${date}')">
      <div class="cal-wday">${dayNames[i]}</div>
      <div class="cal-wnum${isToday?' cal-wnum-today':''}">${d.getDate()}</div>
      <div class="cal-dots" style="margin-top:4px">${_calDots(date)}</div>
    </div>`;
  }
  // week label
  const startLabel = new Date(monday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDay = new Date(monday); endDay.setDate(monday.getDate() + 6);
  const endLabel = endDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  document.getElementById('view').innerHTML = `
    <div class="cal-hdr ani">
      <button class="cal-nav-btn" onclick="calPrev()">‹</button>
      <div class="cal-month-label">${startLabel} – ${endLabel}</div>
      <button class="cal-nav-btn" onclick="calNext()">›</button>
    </div>
    ${_calViewToggle()}
    ${_calLegend()}
    <div class="cal-week-cols ani">${cols}</div>
    <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
}

function renderCalDaily() {
  if (!calSelectedDate) calSelectedDate = today();
  const d = new Date(calSelectedDate + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  document.getElementById('view').innerHTML = `
    <div class="cal-hdr ani">
      <button class="cal-nav-btn" onclick="calPrev()">‹</button>
      <div class="cal-month-label" style="font-size:15px">${label}</div>
      <button class="cal-nav-btn" onclick="calNext()">›</button>
    </div>
    ${_calViewToggle()}
    <div class="cal-daily-wrap ani">${_buildDailyBody(calSelectedDate)}</div>`;
}

function _buildDailyBody(date) {
  const t = today();
  const isToday  = date === t;
  const isFuture = date > t;

  // ── Tasks ──
  const tasksHTML = _buildTasksSection(date);

  if (isFuture) {
    // Future: show planned workout + tasks only
    const prog = findProgram(workoutMeta.activeProgram);
    let plannedHTML = '';
    if (prog) {
      // figure out which day index this date would be
      const dayIndex = workoutMeta.currentDayIndex % prog.days.length;
      const day = prog.days[dayIndex];
      plannedHTML = `<div class="cal-daily-sec-hdr">💪 Planned Workout</div>
        <div class="cal-di">📅 <span>${day.name} · ${prog.name}</span></div>
        ${(day.exercises || []).map(eid => {
          const ex = lookupExercise(eid);
          return ex ? `<div class="cal-di-sub">• ${esc(ex.name)}</div>` : '';
        }).join('')}`;
    }
    return `<div class="cal-daily-sec">${tasksHTML}</div>${plannedHTML ? `<div class="cal-daily-sec">${plannedHTML}</div>` : ''}`;
  }

  // ── Habits ──
  const doneHabits = isToday
    ? habits.filter(h => log[h.id]?.completedToday)
    : habits.filter(h => log[h.id]?.lastCompletedDate === date);
  const totalHabits = habits.length;
  let habitHTML = '';
  if (totalHabits) {
    const pct = Math.round(doneHabits.length / totalHabits * 100);
    const doneRows  = doneHabits.map(h => `<div class="cal-di">✓ <span>${esc(h.name)}</span></div>`).join('');
    const missedRows = habits.filter(h => !doneHabits.includes(h))
      .map(h => `<div class="cal-di" style="opacity:.4">○ <span>${esc(h.name)}</span></div>`).join('');
    habitHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">✅ Habits <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${doneHabits.length}/${totalHabits} · ${pct}%</span></div>
      ${doneRows}${missedRows}
    </div>`;
  }

  // ── Workout ──
  const wl = workoutLog[date];
  const workoutDone = wl?.exercises?.some(e => e.sets?.some(s => s.completed));
  let workoutHTML = '';
  if (workoutDone) {
    const prog = findProgram(wl.programId);
    const day  = prog?.days[wl.dayIndex % prog.days.length];
    const exDone = wl.exercises.filter(e => e.sets.some(s => s.completed));
    const exRows = exDone.map(e => {
      const ex = lookupExercise(e.exerciseId);
      const sets = e.sets.filter(s => s.completed);
      const best = sets.length ? Math.max(...sets.map(s => s.weight)) : 0;
      return `<div class="cal-di-sub">• ${esc(ex?.name || 'Exercise')} — ${sets.length} sets${best ? ' · best ' + best + wtUnit() : ''}</div>`;
    }).join('');
    workoutHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">💪 Workout</div>
      <div class="cal-di">🏋️ <span>${day ? day.name + ' · ' + prog.name : 'Workout logged'}</span></div>${exRows}
    </div>`;
  }

  // ── Meals ──
  const meals = mealLog[date]?.meals || [];
  let mealsHTML = '';
  if (meals.length) {
    const totalCal = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.calories || 0), 0), 0);
    const totalP   = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.protein  || 0), 0), 0);
    const rows = meals.map(m => {
      const cal = m.items.reduce((s, i) => s + (i.calories || 0), 0);
      const p   = m.items.reduce((s, i) => s + (i.protein  || 0), 0);
      return `<div class="cal-di">🍽 <span>${esc(m.name)} — ${cal} cal · ${p}g P</span></div>`;
    }).join('');
    mealsHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">🍽 Meals <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${totalCal} cal · ${totalP}g P</span></div>
      ${rows}
    </div>`;
  }

  // ── Weight ──
  const w = weightLog[date];
  const weightHTML = w ? `<div class="cal-daily-sec">
    <div class="cal-daily-sec-hdr">⚖️ Weight</div>
    <div class="cal-di">⚖️ <span>${w} ${wtUnit()}</span></div>
  </div>` : '';

  // ── Journal ──
  const je = journal[date] || {};
  const hasJournal = Object.values(je).some(Boolean);
  let journalHTML = '';
  if (hasJournal) {
    const parts = [
      je.wins    && `<div class="cal-di-sub">Wins: ${esc(je.wins.slice(0,120))}${je.wins.length>120?'…':''}</div>`,
      je.lessons && `<div class="cal-di-sub">Lessons: ${esc(je.lessons.slice(0,120))}${je.lessons.length>120?'…':''}</div>`
    ].filter(Boolean).join('');
    journalHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">📖 Journal</div>
      <div class="cal-di">📖 <span>Entry</span></div>${parts}
    </div>`;
  }

  const nothingLogged = !totalHabits && !workoutDone && !meals.length && !w && !hasJournal;

  return `<div class="cal-daily-sec">${tasksHTML}</div>
    ${nothingLogged ? '<div class="cal-di-empty" style="padding:20px 0">Nothing logged this day.</div>' : ''}
    ${habitHTML}${workoutHTML}${mealsHTML}${weightHTML}${journalHTML}`;
}

function renderCalendar() {
  if (!calSelectedDate) calSelectedDate = today();
  if (calView === 'weekly') renderCalWeekly();
  else if (calView === 'daily') renderCalDaily();
  else renderCalMonthly();
}
