// The daily spine.
//
// Home opens on eleven things at once: level, XP, a daily score, an overall
// streak, five pillars, a workout card, sleep, steps, nutrition, three random
// quests and a briefing. All of it is real, and none of it answers the only
// question someone has when they open the app in the morning: what am I doing
// today. This puts that first, in one tap each.
//
// The other half is the number underneath. A streak is a single integer that
// one missed day sets to zero, so the app's headline metric punishes the exact
// moment a person most needs to come back. Consistency over a rolling window
// degrades instead: miss a day out of seven and you are at six, which is what
// six out of seven actually deserves.

const CONSISTENCY_DAYS = 7;
const MAX_PRIORITIES = 3;
const MOOD_FACES = ['\u{1F62B}', '\u{1F615}', '\u{1F610}', '\u{1F642}', '\u{1F604}'];

function _tdKey(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  // Local date key. toISOString() is UTC and rolls over early for anyone west
  // of Greenwich, which silently shifts the whole window by a day.
  return d.toLocaleDateString('en-CA');
}

function _tdDidOn(habitId, key) {
  if (key === today()) return !!(log[habitId] && log[habitId].completedToday);
  const hist = LS.get('hvi_habit_history', {}) || {};
  return Array.isArray(hist[habitId]) && hist[habitId].includes(key);
}

// How often a habit was kept across the last seven days, counted only against
// the days it was actually due. A Monday/Wednesday/Friday habit kept three
// times out of three is at 100%, not at 43%.
function consistency7(habitId) {
  const h = (typeof habits !== 'undefined' && Array.isArray(habits))
    ? habits.find(x => x && x.id === habitId) : null;
  if (!h) return { done: 0, due: 0, pct: 0 };

  const weekly = h.schedule === 'weekly';
  let done = 0, due = 0;
  for (let i = 0; i < CONSISTENCY_DAYS; i++) {
    const key = _tdKey(i);
    // A weekly habit has no particular due day, so every day counts as a
    // chance to do it and the target comes from perWeek below.
    if (!weekly && typeof _wasDueOn === 'function' && !_wasDueOn(h, key)) continue;
    if (!weekly) due++;
    if (_tdDidOn(h.id, key)) done++;
  }
  if (weekly) due = Math.min(h.perWeek || 7, CONSISTENCY_DAYS);

  // Whether there is any history to summarise at all. Without this a habit
  // added this morning reads "0 of last 7", which is both untrue and the exact
  // discouragement this replaced the streak to avoid.
  const hist = LS.get('hvi_habit_history', {}) || {};
  const ever = !!(log[h.id] && log[h.id].lastCompletedDate) ||
    (Array.isArray(hist[h.id]) && hist[h.id].length > 0);

  return { done: Math.min(done, due), due, ever, pct: due > 0 ? Math.min(1, done / due) : 0 };
}

function overallConsistency7() {
  const list = (typeof habits !== 'undefined' && Array.isArray(habits))
    ? habits.map(h => consistency7(h.id)) : [];
  const done = list.reduce((s, c) => s + c.done, 0);
  const due = list.reduce((s, c) => s + c.due, 0);
  return { done, due, pct: due > 0 ? done / due : 0 };
}

// What the habit row says where the streak count used to be. Never scolds: a
// bad week reads as a fact, and a new habit is not a failing one.
function consistencyText(c) {
  if (!c || c.due === 0) return 'New';
  if (!c.ever) return 'Not started yet';
  if (c.done === c.due) return `${c.done} of ${c.due} · all of them`;
  return `${c.done} of last ${c.due}`;
}

// The reason a priority is on the list, shown under it. This is the whole
// argument for the ordering being visible rather than magic.
function _tdWhy(c) {
  if (!c || c.due === 0) return 'Just started';
  if (!c.ever) return 'Not started yet';
  if (c.pct >= 1) return 'Kept every time this week';
  if (c.pct < 0.4) return `Slipping — ${c.done} of last ${c.due}`;
  return `${c.done} of last ${c.due}`;
}

// One to three things, chosen so the list is explainable.
//
// The habit that is slipping outranks the one already going well, because the
// one going well does not need the prompt. One slot is kept for an open goal
// when there is one, so the day is attached to something the person said they
// wanted rather than only to the checkboxes they happen to have.
function todayPriorities(max = MAX_PRIORITIES) {
  const out = [];
  const all = (typeof habits !== 'undefined' && Array.isArray(habits)) ? habits : [];
  const due = all.filter(h => typeof isHabitDueToday !== 'function' || isHabitDueToday(h));
  const undone = due.filter(h => !(log[h.id] && log[h.id].completedToday));

  const ranked = undone
    .map(h => ({ h, c: consistency7(h.id) }))
    .sort((a, b) => (a.c.pct - b.c.pct) || (all.indexOf(a.h) - all.indexOf(b.h)));

  const goals = (LS.get('hvi_goals', []) || []).filter(g => g && !g.done && g.text);
  const goalSlot = goals.length ? 1 : 0;

  for (const { h, c } of ranked) {
    if (out.length >= max - goalSlot) break;
    out.push({ kind: 'habit', id: h.id, label: h.name, why: _tdWhy(c), pct: c.pct, slip: c.ever && c.pct < 0.4 });
  }

  if (goalSlot && out.length < max) {
    const g = goals[0];
    out.push({ kind: 'goal', id: g.id, label: g.text, why: g.target ? `Goal · ${g.target}` : 'Your goal' });
  }

  // Everything due is done. Offer the one thing that is never "due" and always
  // worth doing, rather than an empty panel that reads as a dead end.
  if (!out.length) {
    const jToday = (typeof journal !== 'undefined' && journal[today()]) || {};
    const reflected = Object.values(jToday).some(v => v && String(v).trim());
    out.push({
      kind: 'reflect',
      id: 'reflect',
      label: reflected ? 'Today is done' : 'Close the day with a reflection',
      why: reflected ? 'Everything due is complete' : 'Everything due is complete',
      done: reflected,
    });
  }

  return out.slice(0, max);
}

// ── MOOD / ENERGY ─────────────────────────────────────────────────────────
// One tap, optional, and never in the way. It exists so the day has a felt
// record next to the counted one — and so the coach has something to notice.
function todayMood() {
  const m = (LS.get('hvi_mood_log', {}) || {})[today()];
  return (m && typeof m.mood === 'number') ? m : null;
}

function setTodayMood(v) {
  const n = Math.max(1, Math.min(5, Math.round(Number(v) || 0)));
  if (!n) return null;
  const all = LS.get('hvi_mood_log', {}) || {};
  all[today()] = { mood: n, at: new Date().toISOString() };
  LS.set('hvi_mood_log', all);
  if (typeof track === 'function') track('mood_logged', { mood: n });
  if (typeof haptic === 'function') haptic(10);
  if (typeof curView !== 'undefined' && curView === 'home' && typeof renderHome === 'function') renderHome();
  return all[today()];
}

// ── RENDER ────────────────────────────────────────────────────────────────
function injectTodayStyles() {
  if (typeof document === 'undefined' || document.getElementById('td-styles')) return;
  const s = document.createElement('style');
  s.id = 'td-styles';
  s.textContent = `
    .td-spine{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px 16px 14px;margin:0 0 14px}
    .td-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:2px}
    .td-title{font-size:19px;font-weight:700;letter-spacing:-0.2px}
    .td-date{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-muted)}
    .td-why{font-size:12px;color:var(--text-dim);font-style:italic;margin:4px 0 12px;line-height:1.45}
    .td-why-set{background:none;border:none;color:var(--accent);font:inherit;font-style:normal;cursor:pointer;padding:0;text-decoration:underline}
    .td-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--border);cursor:pointer}
    .td-row:first-of-type{border-top:none}
    .td-row.td-done .td-label,.td-row.done .td-label{opacity:.45;text-decoration:line-through}
    .td-box{width:22px;height:22px;flex-shrink:0;border-radius:7px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;color:transparent}
    .td-row.td-done .td-box,.td-row.done .td-box{background:var(--accent);border-color:var(--accent);color:var(--bg)}
    .td-main{min-width:0;flex:1}
    .td-label{font-size:14.5px;font-weight:600;line-height:1.3}
    .td-sub{font-size:11px;color:var(--text-muted);margin-top:2px}
    .td-sub.td-slip{color:var(--accent-b)}
    .td-foot{display:flex;align-items:center;justify-content:space-between;gap:10px 14px;flex-wrap:wrap;margin-top:12px;padding-top:11px;border-top:1px solid var(--border)}
    .td-cons{font-size:11.5px;color:var(--text-dim)}
    .td-cons b{color:var(--text);font-weight:700}
    .td-bar{height:4px;border-radius:2px;background:var(--border);overflow:hidden;margin-top:6px;width:104px}
    .td-bar span{display:block;height:100%;background:var(--accent);border-radius:2px}
    .td-mood{display:flex;align-items:center;gap:6px}
    .td-mood-btn{background:none;border:none;font-size:18px;line-height:1;cursor:pointer;padding:2px 1px;opacity:.38;transition:opacity .15s,transform .15s}
    .td-mood-btn:hover{opacity:.8;transform:scale(1.12)}
    .td-mood-btn.on{opacity:1;transform:scale(1.15)}
    .td-mood-lbl{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-muted);margin-right:2px;white-space:nowrap}
    @media (max-width:400px){.td-mood-lbl{display:none}.td-mood-btn{font-size:17px;padding:2px 0}}
  `;
  document.head.appendChild(s);
}

function _tdRowHTML(p) {
  const done = p.kind === 'reflect' ? !!p.done : false;
  const tap = p.kind === 'habit' ? `tapHabit('${p.id}','td')`
    : p.kind === 'goal' ? `toggleGoal('${p.id}');if(typeof renderHome==='function')renderHome()`
    : `libTab='journal';go('library')`;
  const slip = !!p.slip;
  return `<div class="td-row${done ? ' td-done' : ''}" id="hitd-${p.id}" onclick="${tap}" role="button" tabindex="0"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${tap}}">
      <div class="td-box" id="hctd-${p.id}" aria-hidden="true">✓</div>
      <div class="td-main">
        <div class="td-label">${esc(p.label)}</div>
        <div class="td-sub${slip ? ' td-slip' : ''}" id="hstd-${p.id}">${esc(p.why || '')}</div>
      </div>
    </div>`;
}

function todaySpineHTML() {
  try {
    injectTodayStyles();
    const priorities = todayPriorities();
    const c = overallConsistency7();
    const why = LS.get('hvi_why', '');
    const mood = todayMood();
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    // The identity line is the frame for everything under it. Offering to set
    // one costs a row; nagging for one would cost the screen.
    const whyHTML = why
      ? `<div class="td-why">${esc(why)}</div>`
      : `<div class="td-why"><button class="td-why-set" onclick="go('goals')">Say who you’re becoming</button> — it shapes what shows up here.</div>`;

    const moodHTML = MOOD_FACES.map((f, i) =>
      `<button class="td-mood-btn${mood && mood.mood === i + 1 ? ' on' : ''}" onclick="event.stopPropagation();setTodayMood(${i + 1})"
         aria-label="Mood ${i + 1} of 5" title="${i + 1} of 5">${f}</button>`).join('');

    const consHTML = c.due > 0
      ? `<div><div class="td-cons"><b>${c.done} of ${c.due}</b> kept this week</div>
           <div class="td-bar"><span style="width:${Math.round(c.pct * 100)}%"></span></div></div>`
      : `<div class="td-cons">Your first days build the picture</div>`;

    return `<div class="td-spine ani">
      <div class="td-head"><div class="td-title">Today</div><div class="td-date">${dateStr}</div></div>
      ${whyHTML}
      ${priorities.map(_tdRowHTML).join('')}
      <div class="td-foot">
        ${consHTML}
        <div class="td-mood">${mood ? '' : '<span class="td-mood-lbl">How are you?</span>'}${moodHTML}</div>
      </div>
    </div>`;
  } catch (e) {
    if (typeof reportError === 'function') reportError(e, 'todaySpine');
    return '';
  }
}
