// ══════════════════════════════════════════════════════════════════════════
// Arete — AI Coach Module
// ══════════════════════════════════════════════════════════════════════════

let _coachHistory = [];   // [{role:'user'|'assistant', content:'...'}]
let _coachBusy = false;

function _loadCoachHistory() {
  try { _coachHistory = JSON.parse(localStorage.getItem('hvi_coach_history') || '[]'); } catch { _coachHistory = []; }
}
function _saveCoachHistory() {
  // Keep last 40 messages (20 exchanges)
  if (_coachHistory.length > 40) _coachHistory = _coachHistory.slice(-40);
  localStorage.setItem('hvi_coach_history', JSON.stringify(_coachHistory));
}

function buildCoachSystemPrompt() {
  const name = userName() || 'there';
  const d = today();

  // Habits
  const todayDone = (log[d] || []).length;
  const totalH = habits.length;
  const pct = totalH ? Math.round(todayDone / totalH * 100) : 0;

  // Weekly average
  const weekDays = [...Array(7)].map((_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    return dt.toISOString().slice(0, 10);
  });
  const weekAvg = totalH
    ? Math.round(weekDays.reduce((s, dd) => s + (log[dd] || []).length, 0) / 7 / totalH * 100) : 0;

  // Workout
  const progName = (workoutMeta?.activeProgram
    ? (allPrograms().find(p => p.id === workoutMeta.activeProgram)?.name || workoutMeta.activeProgram)
    : null) || 'None';
  const todayWorkout = workoutLog?.[d] ? 'Logged' : 'Not logged yet';

  // Diet
  const dm = getDayMacros();
  const goals = dietMeta?.dailyGoals || {};

  // Weight
  const wt = weightLog?.length ? weightLog[weightLog.length - 1] : null;

  // Gamification
  const g = gamification || {};
  const streak = meta?.streak || 0;

  // Last journal
  const jKeys = Object.keys(journal || {}).sort().reverse();
  const lastJ = jKeys[0] ? journal[jKeys[0]] : null;

  // Current habits list
  const habitsList = habits.map(h => `  - [${h.id}] "${h.name}" (${h.category})${log[h.id]?.completedToday ? ' ✓' : ''} | streak: ${log[h.id]?.streak || 0}d`).join('\n');

  // Available programs
  const progList = allPrograms().map(p => `  - id="${p.id}" | ${p.name} (${p.days.length}-day)`).join('\n');

  return `You are Arete Coach — a wise, direct, and deeply personalised guide inside the Arete lifestyle app. You draw from the Stoic philosophers — Marcus Aurelius, Epictetus, and Seneca — blending ancient wisdom with modern performance science. Your job is to help ${name} pursue arete (excellence) in mind, body, and spirit. Be like a firm but caring mentor from the Stoa: practical, concise, and grounded in virtue.

TODAY: ${d}

USER PROFILE:
Name: ${name}
Level ${g.level || 1} | ${g.xp || 0} XP | ${streak}-day streak

HABITS TODAY: ${todayDone}/${totalH} completed (${pct}%) | 7-day avg: ${weekAvg}%
${habitsList}

WORKOUT: Program — ${progName} | Today — ${todayWorkout}
Available programs:
${progList}

NUTRITION TODAY:
  Calories  ${dm.cal} / ${goals.calories || '—'} target
  Protein   ${dm.p}g / ${goals.protein || '—'}g target
  Carbs     ${dm.c}g / ${goals.carbs || '—'}g target
  Fat       ${dm.f}g / ${goals.fat || '—'}g target
${wt ? `  Weight: ${wt.kg} kg (${wt.date})` : '  Weight: not logged'}
${lastJ ? `\nLAST JOURNAL (${jKeys[0]}):
  Win: ${lastJ.win || '—'}
  Struggle: ${lastJ.struggle || '—'}
  Focus: ${lastJ.focus || '—'}` : ''}

STRICT RULES:
- NEVER assume any sport, hobby, profession, or lifestyle the user has not explicitly told you
- ONLY reference what is in the data above — do not invent context
- If you don't know something about the user, ask rather than assume
- This app is for everyone — students, athletes, professionals, beginners — treat the user as a blank slate until they tell you more

COACHING STYLE:
- Direct, specific, and actionable — zero filler
- Reference their actual numbers (habits, macros, streak) to make advice feel personal
- Be honest about gaps but solution-focused
- Keep replies under 200 words unless more detail is explicitly requested
- Use bullet points or short paragraphs for clarity
- Ask a follow-up question when you need more context before giving advice

APP ACTIONS:
You can make changes to the user's app by embedding action tags in your response. Place them at the END of your message, after your coaching text. The user will see a confirmation of each change.

Available actions (use exact format, one per line):

1. Set macro targets:
   [[ACTION:set_macros:{"calories":2500,"protein":180,"carbs":280,"fat":80}]]
   - Only include the fields you want to change (e.g. just protein)

2. Add a new habit:
   [[ACTION:add_habit:{"name":"Drink 3L water","category":"health"}]]
   - Valid categories: mindset, discipline, fitness, health, learning, social, financial

3. Remove a habit (use the habit id from the list above):
   [[ACTION:remove_habit:{"id":"h07"}]]

4. Switch workout program (use program id from list above):
   [[ACTION:switch_program:{"id":"ppl"}]]

5. Set workout day index (0-based):
   [[ACTION:set_workout_day:{"dayIndex":2}]]

IMPORTANT action rules:
- ALWAYS explain what you're changing and why BEFORE the action tags
- ONLY use actions when the user explicitly asks you to make a change, or clearly agrees to a suggestion you made
- NEVER silently change things — always tell the user what you're doing
- If unsure, ASK first rather than making the change
- You can use multiple actions in one response`;
}


function _coachBubbleHTML(role, text) {
  // Simple markdown-lite: **bold**, *italic*, bullet lines
  const safe = esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+/gm, '• ')
    .replace(/\n/g, '<br>');
  return `<div class="coach-bubble ${role}">${safe}</div>`;
}

function _renderCoachMsgs() {
  const el = document.getElementById('coach-msgs');
  if (!el) return;

  if (!_coachHistory.length) {
    const name = userName();
    el.innerHTML = `
      <div class="coach-welcome">
        <div class="coach-welcome-star"><svg viewBox="0 0 120 120" width="52" height="52" xmlns="http://www.w3.org/2000/svg"><g fill="#c4a96c"><ellipse cx="35" cy="12" rx="3.5" ry="8" transform="rotate(-65,35,12)"/><ellipse cx="25" cy="22" rx="4" ry="9" transform="rotate(-50,25,22)"/><ellipse cx="17" cy="34" rx="4.5" ry="10" transform="rotate(-38,17,34)"/><ellipse cx="13" cy="48" rx="5" ry="11" transform="rotate(-22,13,48)"/><ellipse cx="13" cy="62" rx="5" ry="11" transform="rotate(-8,13,62)"/><ellipse cx="17" cy="76" rx="5" ry="11" transform="rotate(10,17,76)"/><ellipse cx="25" cy="88" rx="4.5" ry="10" transform="rotate(26,25,88)"/><ellipse cx="36" cy="97" rx="4" ry="9" transform="rotate(40,36,97)"/><ellipse cx="48" cy="102" rx="3.5" ry="8" transform="rotate(55,48,102)"/><ellipse cx="85" cy="12" rx="3.5" ry="8" transform="rotate(65,85,12)"/><ellipse cx="95" cy="22" rx="4" ry="9" transform="rotate(50,95,22)"/><ellipse cx="103" cy="34" rx="4.5" ry="10" transform="rotate(38,103,34)"/><ellipse cx="107" cy="48" rx="5" ry="11" transform="rotate(22,107,48)"/><ellipse cx="107" cy="62" rx="5" ry="11" transform="rotate(8,107,62)"/><ellipse cx="103" cy="76" rx="5" ry="11" transform="rotate(-10,103,76)"/><ellipse cx="95" cy="88" rx="4.5" ry="10" transform="rotate(-26,95,88)"/><ellipse cx="84" cy="97" rx="4" ry="9" transform="rotate(-40,84,97)"/><ellipse cx="72" cy="102" rx="3.5" ry="8" transform="rotate(-55,72,102)"/></g><path d="M52 106 Q56 112 60 114 Q64 112 68 106" fill="none" stroke="#c4a96c" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <h3>Welcome${name ? ', ' + name : ''}.</h3>
        <p>I am your Arete Coach — a guide in the Stoic tradition. Ask me about your habits, training, nutrition, or mindset. I can see your real data and will speak plainly.</p>
      </div>`;
    return;
  }

  el.innerHTML = _coachHistory.map(m => {
      if (m.role === 'system' && m.content.startsWith('[[ACTIONS]]')) {
        try { return _coachActionBubbleHTML(JSON.parse(m.content.slice(11))); } catch { return ''; }
      }
      return _coachBubbleHTML(m.role === 'user' ? 'user' : 'coach', m.content);
    }).join('');
  el.scrollTop = el.scrollHeight;
}

function openCoach() {
  _loadCoachHistory();
  const overlay = document.getElementById('coach-overlay');
  const fab = document.getElementById('coach-fab');
  if (overlay) overlay.classList.remove('coach-hidden');
  if (fab) fab.classList.add('coach-hidden');
  _renderCoachMsgs();
  setTimeout(() => {
    const input = document.getElementById('coach-input');
    if (input) input.focus();
  }, 200);
}

function closeCoach() {
  const overlay = document.getElementById('coach-overlay');
  const fab = document.getElementById('coach-fab');
  if (overlay) overlay.classList.add('coach-hidden');
  if (fab) fab.classList.remove('coach-hidden');
}

function clearCoachHistory() {
  if (_coachHistory.length > 0 && !confirm('Clear conversation history?')) return;
  _coachHistory = [];
  localStorage.removeItem('hvi_coach_history');
  _renderCoachMsgs();
}

// ── Coach Action System ────────────────────────────────────────────────────
function _parseCoachActions(text) {
  const actions = [];
  const re = /\[\[ACTION:(\w+):(.*?)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      actions.push({ type: m[1], payload: JSON.parse(m[2]), raw: m[0] });
    } catch (e) { /* skip malformed */ }
  }
  return actions;
}

function _stripActionTags(text) {
  return text.replace(/\[\[ACTION:\w+:.*?\]\]\s*/g, '').trim();
}

function _executeCoachAction(action) {
  const p = action.payload;
  switch (action.type) {

    case 'set_macros': {
      const g = dietMeta.dailyGoals;
      const changes = [];
      if (p.calories !== undefined) { g.calories = Math.round(p.calories); changes.push(`Calories → ${g.calories}`); }
      if (p.protein !== undefined)  { g.protein  = Math.round(p.protein);  changes.push(`Protein → ${g.protein}g`);  }
      if (p.carbs !== undefined)    { g.carbs    = Math.round(p.carbs);    changes.push(`Carbs → ${g.carbs}g`);    }
      if (p.fat !== undefined)      { g.fat      = Math.round(p.fat);      changes.push(`Fat → ${g.fat}g`);      }
      LS.set('hvi_diet_meta', dietMeta);
      return changes.length ? `Updated macro targets: ${changes.join(', ')}` : null;
    }

    case 'add_habit': {
      if (!p.name) return null;
      const validCats = ['mindset','discipline','fitness','health','learning','social','financial'];
      const cat = validCats.includes(p.category) ? p.category : 'discipline';
      const id = 'cu_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      habits.push({ id, name: p.name, category: cat });
      log[id] = { streak: 0, lastCompletedDate: '', completedToday: false };
      LS.set('hvi_habits', habits);
      LS.set('hvi_log', log);
      return `Added habit: "${p.name}" (${cat})`;
    }

    case 'remove_habit': {
      if (!p.id) return null;
      const h = habits.find(x => x.id === p.id);
      if (!h) return `Habit "${p.id}" not found`;
      habits = habits.filter(x => x.id !== p.id);
      delete log[p.id];
      LS.set('hvi_habits', habits);
      LS.set('hvi_log', log);
      return `Removed habit: "${h.name}"`;
    }

    case 'switch_program': {
      if (!p.id) return null;
      const prog = findProgram(p.id);
      if (!prog) return `Program "${p.id}" not found`;
      workoutMeta.activeProgram = p.id;
      workoutMeta.currentDayIndex = 0;
      LS.set('hvi_workout_meta', workoutMeta);
      return `Switched to program: ${prog.name}`;
    }

    case 'set_workout_day': {
      if (p.dayIndex === undefined) return null;
      const prog = findProgram(workoutMeta.activeProgram);
      if (!prog) return null;
      const idx = Math.max(0, Math.min(p.dayIndex, prog.days.length - 1));
      workoutMeta.currentDayIndex = idx;
      delete workoutLog[today()];
      LS.set('hvi_workout_meta', workoutMeta);
      LS.set('hvi_workout_log', workoutLog);
      return `Set workout to Day ${idx + 1}: ${prog.days[idx].name}`;
    }

    default: return null;
  }
}

function _coachActionBubbleHTML(results) {
  const items = results.map(r => `<div class="coach-action-item">‣ ${esc(r)}</div>`).join('');
  return `<div class="coach-bubble coach-action">${items}</div>`;
}

async function sendCoachMsg() {
  if (_coachBusy) return;
  const input = document.getElementById('coach-input');
  const sendBtn = document.getElementById('coach-send-btn');
  const msgsEl = document.getElementById('coach-msgs');
  if (!input || !msgsEl) return;

  const text = input.value.trim();
  if (!text) return;

  // Add user message
  _coachHistory.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  _renderCoachMsgs();

  // Typing indicator
  _coachBusy = true;
  if (sendBtn) sendBtn.disabled = true;
  const typing = document.createElement('div');
  typing.className = 'coach-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgsEl.appendChild(typing);
  msgsEl.scrollTop = msgsEl.scrollHeight;

  try {
    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 30000);
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: _ac.signal,
      body: JSON.stringify({
        messages: [
          { role: 'system', content: buildCoachSystemPrompt() },
          ..._coachHistory,
        ],
        model: 'openai',
        private: true,
      }),
    });
    clearTimeout(_to);

    typing.remove();

    if (!res.ok) {
      _coachHistory.push({ role: 'assistant', content: 'Something went wrong. Please try again in a moment.' });
    } else {
      const text = await res.text();
      // Parse and execute any action tags
      const actions = _parseCoachActions(text);
      const cleanText = _stripActionTags(text);
      _coachHistory.push({ role: 'assistant', content: cleanText });
      if (actions.length) {
        const results = actions.map(a => _executeCoachAction(a)).filter(Boolean);
        if (results.length) {
          _coachHistory.push({ role: 'system', content: '[[ACTIONS]]' + JSON.stringify(results) });
        }
        // Re-render current view if changes were made
        if (typeof go === 'function' && curView) {
          setTimeout(() => go(curView, {}, false), 300);
        }
      }
    }

    _saveCoachHistory();
    _renderCoachMsgs();
  } catch (err) {
    typing.remove();
    if (err.name === 'AbortError') {
      _coachHistory.push({ role: 'assistant', content: 'AI service timed out. Please try again later.' });
    } else {
      _coachHistory.push({ role: 'assistant', content: 'AI service unavailable, please try again later.' });
    }
    _renderCoachMsgs();
  } finally {
    _coachBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    const inp = document.getElementById('coach-input');
    if (inp) inp.focus();
  }
}
