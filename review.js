// ══════════════════════════════════════════════════════════════════════════
// WEEKLY REVIEW
// ══════════════════════════════════════════════════════════════════════════
// Once a week, on Sunday evening or Monday, the coach looks back over the week
// and names one thing to focus on next. It replaces a recap that was a grid of
// numbers under "Great week!" whatever the week had been, and that on a Monday
// counted only Monday.
//
// The facts are worked out here, from the person's own logs. The coach writes
// the read and the focus from them; without AI (switched off, offline, or the
// service down) a plainer review is written here from the same facts. The
// focus then carries into the week: the coach is told it, and next week's
// review says whether it happened.

const REVIEW_KEY = 'hvi_week_review';

function _rvShift(key, n) { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return dateKey(d); }

// The Monday-to-Sunday week a review covers: the one ending today on a Sunday,
// otherwise the one that ended last Sunday. Its id is that Sunday.
function reviewWeek(now) {
  const d = now ? new Date(now) : new Date();
  const end = new Date(d);
  end.setDate(d.getDate() - d.getDay());
  const id = dateKey(end);
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(_rvShift(id, -i));
  return { id, start: days[0], end: id, days };
}

function _rvSessionName(w) {
  if (w && w.dayName) return w.dayName;
  try {
    const prog = typeof findProgram === 'function' ? findProgram(w.programId) : null;
    const day = prog && prog.days && prog.days[(w.dayIndex || 0) % prog.days.length];
    if (day && day.name) return day.name;
  } catch {}
  return 'Workout';
}

// The same rule Your patterns uses: daily habits and those set for that
// weekday, each counted from its first completion on.
function _rvDue(h, key) {
  const sched = h.schedule || 'daily';
  if (sched === 'weekly') return false;
  if (sched === 'specific' && !(h.days || [0, 1, 2, 3, 4, 5, 6]).includes(new Date(key + 'T12:00:00').getDay())) return false;
  return true;
}

function weekReviewFacts(week) {
  const t = today();
  const days = week.days.filter(d => d <= t);
  const goals = (typeof dietMeta !== 'undefined' && dietMeta && dietMeta.dailyGoals) || {};
  const wlog = (typeof workoutLog !== 'undefined' && workoutLog) || {};

  // Training: sessions, how many were hard, and what Whoop says they burned.
  const sessions = days.filter(d => typeof trainedOnDay === 'function' && trainedOnDay(d)).map(d => {
    const w = wlog[d];
    return {
      day: d, name: _rvSessionName(w),
      hard: typeof _intensityOf === 'function' ? _intensityOf(w) === 'hard' : false,
      strain: typeof _sessionStrain === 'function' ? _sessionStrain(w) : null,
    };
  });
  let burned = 0;
  days.forEach(d => { const b = typeof burnOn === 'function' ? burnOn(d) : null; if (b) burned += b.kcal; });
  let planned = null;
  try { planned = typeof getTrainingDays === 'function' ? getTrainingDays().length : null; } catch {}

  // Food, on the days something was logged.
  const ml = LS.get('hvi_meal_log', null) || (typeof mealLog !== 'undefined' ? mealLog : {}) || {};
  const fed = days.map(d => {
    const meals = ((ml[d] || {}).meals) || [];
    if (!meals.length) return null;
    let cal = 0, p = 0;
    meals.forEach(m => (m.items || []).forEach(it => { cal += it.calories || 0; p += it.protein || 0; }));
    return { day: d, cal, p };
  }).filter(Boolean);
  const avg = (a, k) => a.length ? Math.round(a.reduce((s, x) => s + x[k], 0) / a.length) : null;
  const proteinGoal = goals.protein || null, calorieGoal = goals.calories || null;

  // Sleep and recovery.
  const sl = (typeof sleepLog !== 'undefined' && sleepLog) || {};
  const nights = days.map(d => sl[d]).filter(n => n && n.hours > 0);
  const recov = days.map(d => sl[d] && sl[d].whoopRecovery).filter(v => typeof v === 'number');

  // Habits: share of due habits done, and the one missed most.
  const hist = LS.get('hvi_habit_history', {}) || {};
  let due = 0, done = 0, missed = null;
  (typeof habits !== 'undefined' && habits ? habits : []).forEach(h => {
    const list = hist[h.id] || [];
    if (!list.length) return;
    let hd = 0, hn = 0;
    days.forEach(d => { if (list[0] > d || !_rvDue(h, d)) return; hd++; if (list.includes(d)) hn++; });
    due += hd; done += hn;
    if (hd >= 3 && hn / hd < 0.7 && (!missed || hn / hd < missed.done / missed.due)) missed = { name: h.name, done: hn, due: hd };
  });

  // Journal and weight.
  const jr = (typeof journal !== 'undefined' && journal) || {};
  const journaled = days.filter(d => { const j = jr[d]; return !!(j && Object.values(j).some(v => typeof v === 'string' && v.trim())); }).length;
  const wtl = LS.get('hvi_weight_log', null) || (typeof weightLog !== 'undefined' ? weightLog : {}) || {};
  const weighed = days.filter(d => typeof wtl[d] === 'number');
  const weight = weighed.length >= 2 ? { from: wtl[weighed[0]], to: wtl[weighed[weighed.length - 1]] } : null;

  return {
    week: { id: week.id, start: week.start, end: week.end, days: days.length },
    training: { sessions: sessions.length, hard: sessions.filter(s => s.hard).length, planned, burned, list: sessions },
    food: { logged: fed.length, cal: avg(fed, 'cal'), protein: avg(fed, 'p'), calorieGoal, proteinGoal,
      proteinDays: proteinGoal ? fed.filter(x => x.p >= proteinGoal * 0.9).length : null,
      overDays: calorieGoal ? fed.filter(x => x.cal > calorieGoal * 1.05).length : null },
    sleep: { nights: nights.length, avg: nights.length ? Math.round(nights.reduce((s, n) => s + n.hours, 0) / nights.length * 10) / 10 : null,
      short: nights.filter(n => n.hours < 6).length, good: nights.filter(n => n.hours >= 7).length,
      recovery: recov.length ? Math.round(recov.reduce((s, v) => s + v, 0) / recov.length) : null },
    habits: { rate: due ? done / due : null, missed },
    journaled, weight,
    goal: (typeof dietMeta !== 'undefined' && dietMeta && dietMeta.goalType) || 'maintain',
  };
}

// ── the facts in words ──────────────────────────────────────────────────────
const _rvN = n => Math.round(n).toLocaleString('en-US');
function _rvHm(h) { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; }
function _rvUnit() { return typeof wtUnit === 'function' ? wtUnit() : 'kg'; }

function weekReviewLines(f) {
  const tr = f.training, fd = f.food, sp = f.sleep, hb = f.habits;
  const training = !tr.sessions ? 'No sessions'
    : [`${tr.sessions}${tr.planned ? ' of ' + tr.planned : ''} session${tr.sessions === 1 ? '' : 's'}`,
       tr.hard ? `${tr.hard} hard` : '', tr.burned ? `${_rvN(tr.burned)} cal burned` : ''].filter(Boolean).join(', ');
  const food = !fd.logged ? 'Nothing logged'
    : [`${_rvN(fd.cal)} cal a day${fd.calorieGoal ? ` (target ${_rvN(fd.calorieGoal)})` : ''}`,
       fd.proteinGoal ? `protein on ${fd.proteinDays} of ${fd.logged} days` : `${fd.protein} g protein`,
       fd.logged < f.week.days ? `logged ${fd.logged} of ${f.week.days} days` : ''].filter(Boolean).join(', ');
  const sleep = !sp.nights ? 'Nothing logged'
    : [`${_rvHm(sp.avg)} a night`, sp.short ? `${sp.short} under 6h` : '', sp.recovery !== null ? `recovery ${sp.recovery}%` : ''].filter(Boolean).join(', ');
  const habits = hb.rate === null ? 'Nothing logged'
    : `${Math.round(hb.rate * 100)}% done${hb.missed ? `, ${hb.missed.name} on ${hb.missed.done} of ${hb.missed.due}` : ''}`;
  const out = { training, food, sleep, habits };
  if (f.weight) {
    const ch = Math.round((f.weight.to - f.weight.from) * 10) / 10;
    out.weight = `${f.weight.from} to ${f.weight.to} ${_rvUnit()} (${ch > 0 ? '+' : ''}${ch})`;
  }
  return out;
}

// ── a review written here, from the facts ───────────────────────────────────
// Used without AI. The focus is the gap that matters most, with a number to
// hit, kept so next week's review can say whether it happened.
function _rvLocal(f, last) {
  const tr = f.training, fd = f.food, sp = f.sleep, hb = f.habits;
  const gaps = [];
  if (fd.logged < 4) gaps.push({ sev: 3, kind: 'log', target: 5, focus: 'Log your meals on at least 5 days',
    why: `meals were logged on ${fd.logged} of ${f.week.days} days, so the targets had little to go on` });
  if (fd.proteinGoal && fd.logged >= 3 && fd.proteinDays < Math.ceil(fd.logged * 0.6)) gaps.push({ sev: 2.4, kind: 'protein', target: 5,
    focus: `Hit ${fd.proteinGoal} g of protein on 5 days`, why: `protein reached the target on ${fd.proteinDays} of ${fd.logged} logged days` });
  if (sp.avg !== null && sp.avg < 7) gaps.push({ sev: 1.5 + (7 - sp.avg) * 2, kind: 'sleep', target: 5,
    focus: 'Sleep 7 hours or more on 5 nights', why: `sleep averaged ${_rvHm(sp.avg)}${sp.short ? `, with ${sp.short} nights under 6 hours` : ''}` });
  if (tr.planned && tr.sessions < tr.planned) gaps.push({ sev: (tr.planned - tr.sessions) * 0.9, kind: 'sessions', target: tr.planned,
    focus: `Get all ${tr.planned} sessions in`, why: `${tr.sessions} of ${tr.planned} planned sessions happened` });
  if (hb.rate !== null && hb.rate < 0.6) gaps.push({ sev: (0.6 - hb.rate) * 6, kind: 'habit', target: 5, habit: hb.missed ? hb.missed.name : null,
    focus: hb.missed ? `Do ${hb.missed.name} on 5 days` : 'Do your daily habits on 5 days', why: `${Math.round(hb.rate * 100)}% of due habits got done` });
  if (f.goal === 'cut' && fd.calorieGoal && fd.logged >= 3 && fd.overDays > fd.logged / 2) gaps.push({ sev: 2.2, kind: 'calories', target: 5,
    focus: `Stay under ${_rvN(fd.calorieGoal)} cal on 5 days`, why: `${fd.overDays} of ${fd.logged} logged days went over the target` });
  gaps.sort((a, b) => b.sev - a.sev);
  const gap = gaps[0] || null;

  // What went well, never from the same part of the week as the gap.
  const wins = [];
  if (tr.planned && tr.sessions >= tr.planned) wins.push({ kind: 'sessions', text: `all ${tr.planned} planned sessions done${tr.hard ? `, ${tr.hard} of them hard` : ''}` });
  else if (!tr.planned && tr.sessions >= 3) wins.push({ kind: 'sessions', text: `${tr.sessions} sessions done` });
  if (fd.proteinGoal && fd.logged >= 4 && fd.proteinDays >= fd.logged * 0.7) wins.push({ kind: 'protein', text: `protein hit on ${fd.proteinDays} of ${fd.logged} days` });
  if (sp.avg !== null && sp.avg >= 7.25) wins.push({ kind: 'sleep', text: `${_rvHm(sp.avg)} of sleep a night` });
  if (hb.rate !== null && hb.rate >= 0.8) wins.push({ kind: 'habit', text: `${Math.round(hb.rate * 100)}% of habits done` });
  if (tr.hard >= 2 && !(tr.planned && tr.sessions >= tr.planned)) wins.push({ kind: 'hard', text: `${tr.hard} hard sessions${tr.burned ? `, ${_rvN(tr.burned)} cal burned` : ''}` });
  if (f.weight && f.goal === 'cut' && f.weight.to < f.weight.from) wins.push({ kind: 'calories', text: `weight down ${Math.round((f.weight.from - f.weight.to) * 10) / 10} ${_rvUnit()}` });
  const good = wins.filter(w => !gap || w.kind !== gap.kind).map(w => w.text);

  const lines = [];
  const check = _rvCheckFocus(last, f);
  if (check) lines.push(check);
  if (good.length) lines.push(`The best of it: ${good.slice(0, 2).join(', and ')}.`);
  if (gap) lines.push(`What held it back: ${gap.why}.`);
  if (!good.length && !gap) lines.push('A steady week with nothing far off.');
  return {
    read: lines.join(' '),
    focus: gap ? gap.focus : 'Repeat this week: same sessions, same sleep, same protein',
    kind: gap ? gap.kind : 'repeat', target: gap ? gap.target : null, habit: gap ? gap.habit || null : null,
  };
}

// Whether last week's focus happened, for the ones a number can settle.
function _rvCheckFocus(last, f) {
  if (!last || !last.focus) return '';
  const n = { log: f.food.logged, protein: f.food.proteinDays, sleep: f.sleep.good, sessions: f.training.sessions,
    calories: f.food.calorieGoal ? f.food.logged - (f.food.overDays || 0) : null }[last.kind];
  if (last.kind === 'habit' && last.habit && f.habits.missed && f.habits.missed.name === last.habit)
    return `Last week's focus was ${last.habit}: ${f.habits.missed.done} of ${f.habits.missed.due} days.`;
  if (n === undefined || n === null || !last.target) return '';
  return n >= last.target ? `Last week's focus, done: ${last.focus.charAt(0).toLowerCase() + last.focus.slice(1)}.`
    : `Last week's focus was to ${last.focus.charAt(0).toLowerCase() + last.focus.slice(1)}: ${n} of ${last.target}.`;
}

// ── the coach's review ──────────────────────────────────────────────────────
// Long and short dashes become commas (the brand uses neither); built from
// char codes so this file holds no dash of its own.
const _RV_DASH = new RegExp('\\s*[' + String.fromCharCode(8212, 8211) + ']\\s*', 'g');
function _rvClean(s, max) {
  return String(s || '').replace(_RV_DASH, ', ').replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function _rvPrompt(f, last) {
  const L = weekReviewLines(f);
  const tr = f.training;
  const list = tr.list.map(s => `${new Date(s.day + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short' })} ${s.name}${s.strain !== null ? ` (strain ${s.strain})` : ''}${s.hard ? ' hard' : ''}`).join(', ');
  return `THEIR WEEK (${f.week.start} to ${f.week.end}), all from their own logs:
TRAINING: ${L.training}${list ? `. Sessions: ${list}` : ''}
FOOD: ${L.food}. Goal: ${f.goal}.
SLEEP: ${L.sleep}
HABITS: ${L.habits}
JOURNAL: ${f.journaled} day${f.journaled === 1 ? '' : 's'}${L.weight ? `\nWEIGHT: ${L.weight}` : ''}${last && last.focus ? `\nLAST WEEK'S FOCUS: ${last.focus}` : ''}${(() => { try { const ps = typeof patternLinesForCoach === 'function' ? patternLinesForCoach(1) : []; return ps.length ? `\nA PATTERN IN THEIR LOGS (went together, not proof of cause): ${ps[0]}` : ''; } catch { return ''; } })()}`;
}

const _RV_SYSTEM = `You are Arete Coach, a direct, warm performance coach. Write this person's weekly review from the facts given, and nothing else.
Answer with JSON only: {"read": "...", "focus": "..."}
read: 2 or 3 short sentences, at most 60 words. Say what went well, with one of their numbers. Say what held them back, with a number. Link two parts of the week (sleep and training, food and weight, and so on) only if the facts show it. If LAST WEEK'S FOCUS is given, say first whether they did it.
focus: ONE action for next week that would help most, at most 14 words, starting with a verb, with a number to hit (for example "Sleep 7 hours on 5 nights").
Speak to them as "you". Never invent numbers or events. No greeting, no emojis, no markdown, no em dashes.`;

async function _rvCoach(f, last) {
  const raw = await _aiFetch([{ role: 'system', content: _RV_SYSTEM }, { role: 'user', content: _rvPrompt(f, last) }],
    { jsonMode: true, maxTokens: 300, temperature: 0.4 });
  const s = String(raw || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  const j = JSON.parse(s.slice(a, b + 1));
  const read = _rvClean(j.read, 420), focus = _rvClean(j.focus, 110).replace(/\.$/, '');
  if (read.length < 20 || focus.length < 6) throw new Error('thin review');
  return { read, focus, kind: 'coach' };
}

function _rvAll() { return LS.get(REVIEW_KEY, {}) || {}; }
function _rvLast(week) { return _rvAll()[_rvShift(week.id, -7)] || null; }

// Writes (or returns the kept) review for a week. A review written here
// without AI is rewritten by the coach the next time AI is available.
async function buildWeekReview(week, opts) {
  const force = !!(opts && opts.force);
  const all = _rvAll();
  const kept = all[week.id];
  const aiReady = typeof aiAllowed === 'function' && aiAllowed() && typeof navigator !== 'undefined' && navigator.onLine && typeof _aiFetch === 'function';
  if (!force && kept && kept.read && (kept.by === 'coach' || !aiReady)) return kept;
  const f = weekReviewFacts(week), last = _rvLast(week);
  let out = null, by = 'local';
  if (aiReady) {
    try { out = await _rvCoach(f, last); by = 'coach'; } catch (e) { out = null; }
  }
  if (!out) out = _rvLocal(f, last);
  // The coach's focus has no number this code can check; the facts it was
  // written from go with it so next week's coach can judge it.
  const rec = { id: week.id, start: week.start, end: week.end, read: out.read, focus: out.focus,
    kind: out.kind, target: out.target || null, habit: out.habit || null, by, at: Date.now() };
  const next = _rvAll();
  next[week.id] = rec;
  Object.keys(next).sort().slice(0, -8).forEach(k => delete next[k]);
  LS.set(REVIEW_KEY, next);
  return rec;
}

// This week's focus: the one from the latest review, for the seven days after
// the week it covered.
function weekFocus() {
  const all = _rvAll();
  const id = Object.keys(all).sort().pop();
  if (!id || !all[id].focus || _rvShift(id, 7) < today()) return null;
  return all[id].focus;
}

// ── the sheet ───────────────────────────────────────────────────────────────
function _rvRange(week) {
  const f = d => new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(week.start)} to ${f(week.end)}`;
}

async function showWeekReview(opts) {
  const week = (opts && opts.week) || reviewWeek();
  const old = document.getElementById('weekly-recap-modal');
  if (old) old.remove();
  const L = weekReviewLines(weekReviewFacts(week));
  const row = (k, label) => L[k] ? `<div class="wr-row"><div class="wr-k">${label}</div><div class="wr-v">${esc(L[k])}</div></div>` : '';
  const el = document.createElement('div');
  el.id = 'weekly-recap-modal';     // the sleep prompt waits while this is open
  el.innerHTML = `
    <div class="pop-backdrop wr-back" onclick="closeWeekReview()">
      <div class="pop-card wr-card" role="dialog" aria-modal="true" aria-labelledby="wr-title" onclick="event.stopPropagation()">
        <div class="wr-range">${esc(_rvRange(week))}</div>
        <h2 class="wr-title" id="wr-title">Your week</h2>
        <div class="wr-read" id="wr-read"><span class="wr-wait">Your coach is reading your week…</span></div>
        <div class="wr-focus" id="wr-focus" hidden><div class="wr-focus-k">Next week</div><div class="wr-focus-v" id="wr-focus-v"></div></div>
        <div class="wr-rows">${row('training', 'Training')}${row('food', 'Food')}${row('sleep', 'Sleep')}${row('habits', 'Habits')}${row('weight', 'Weight')}</div>
        <div class="wr-actions">
          <button class="w-action-btn wr-btn" onclick="closeWeekReview()">Done</button>
          <button class="w-action-btn wr-btn wr-btn-main" id="wr-ask" onclick="askCoachAboutWeek()">Plan it with the coach</button>
        </div>
        <button class="wr-share" onclick="closeWeekReview();if(typeof shareRecap==='function')shareRecap()">Share your week</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  if (typeof track === 'function') track('week_review_open');
  let rec = null;
  try { rec = await buildWeekReview(week); } catch (e) { console.warn('[review]', e); }
  if (!document.body.contains(el)) return rec;
  const readEl = document.getElementById('wr-read'), focusEl = document.getElementById('wr-focus');
  if (rec) {
    readEl.textContent = rec.read;
    document.getElementById('wr-focus-v').textContent = rec.focus;
    focusEl.hidden = false;
  } else {
    readEl.textContent = 'The review could not be written just now. Your numbers are below.';
  }
  return rec;
}

function closeWeekReview() {
  const el = document.getElementById('weekly-recap-modal');
  if (el) el.remove();
}

function askCoachAboutWeek() {
  const focus = weekFocus();
  closeWeekReview();
  if (typeof openCoach !== 'function') return;
  openCoach();
  setTimeout(() => {
    const input = document.getElementById('coach-input');
    if (input && !input.value) {
      input.value = focus ? `Help me plan next week around this: ${focus}` : 'Help me plan next week.';
      input.dispatchEvent(new Event('input'));
    }
  }, 260);
}
