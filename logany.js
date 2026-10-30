// ── LOG ANYTHING ───────────────────────────────────────────────────────────
// One box for the whole day: "Two eggs and toast, half a litre of water, did
// my meditation, slept about 6 hours". Typed, spoken through the keyboard's
// microphone (that works everywhere, the native apps included), or through the
// browser's own speech recognition where it exists.
//
// The words go through the same AI route as the meal estimator, and whatever
// comes back is checked here before it is shown: only habits that exist, only
// sensible numbers. Nothing is logged until they tap, and one Undo takes it all
// back. Without AI (offline, or turned off) a plain reader below still picks up
// water, sleep, weight, habits and common foods.
//
// Everything is logged through the app's own functions (_commitMeal, tapHabit,
// setTodayMood, the sleep and weight logs and their events), so XP, linked
// habits, quests and patterns all see it exactly as if it had been logged on
// its own screen.

let _laEntries = [], _laBusy = false, _laRec = null, _laNote = '';
const LA_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
// Not inside the native apps: there the microphone would need permission text
// in the app's settings (iOS ends an app that uses it without), and the
// keyboard's own microphone already works with none.
const _laSR = () => (typeof window !== 'undefined' && !window.Capacitor && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

// ── reading the words ──────────────────────────────────────────────────────
function _laPrompt() {
  const now = new Date();
  const hl = (habits || []).map(h => `  [${h.id}] ${h.name}`).join('\n') || '  (none)';
  return 'You turn one message about someone\'s day into log entries for the Arete app. Output ONLY a JSON object: {"entries":[...]}.\n\n' +
    'Entry types, and nothing else:\n' +
    '- {"type":"meal","meal":"Breakfast|Lunch|Dinner|Snack","items":[{"name":"Eggs (2 large)","calories":156,"protein":13,"carbs":1,"fat":11}]}: one entry per meal. Integer macros for the amounts said, typical portions when no amount is said. A quantity is one item ("2 eggs" is one item). If they do not say which meal, use "' + (typeof mealTypeNow === 'function' ? mealTypeNow() : 'Snack') + '".\n' +
    '- {"type":"water","ml":500}\n' +
    '- {"type":"sleep","hours":6.5}, or with times {"type":"sleep","bedtime":"23:30","wake":"07:00"} in 24-hour time. Only last night\'s sleep.\n' +
    '- {"type":"habit","id":"<id>"}: only habits from the list below that they say they did today. Copy the id exactly.\n' +
    '- {"type":"weight","value":80.4,"unit":"kg"} (unit "kg" or "lb", as they said it)\n' +
    '- {"type":"mood","mood":4}: 1 to 5, only if they say how they feel.\n\n' +
    'Rules: only what they say happened today or last night, never plans. Never invent anything they did not say. If nothing fits, {"entries":[]}.\n\n' +
    `Habits:\n${hl}\n\nNow: ${now.toLocaleDateString('en-GB', { weekday: 'long' })} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}.`;
}

const _laNum = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const _laTime = v => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v || '').trim()) ? String(v).trim().padStart(5, '0') : null);

// Everything that comes back is checked: types, ids, ranges. Anything odd is
// dropped rather than guessed at.
function _laSanitize(raw) {
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.entries) ? raw.entries : []);
  const ids = new Set((habits || []).map(h => h.id));
  const out = [], seen = new Set();
  for (const e of list.slice(0, 16)) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'meal') {
      const items = (Array.isArray(e.items) ? e.items : []).slice(0, 12).map(it => ({
        name: String((it && it.name) || '').trim().slice(0, 60),
        calories: Math.round(_laNum(it && it.calories, 0, 3000) ?? 0),
        protein: Math.round(_laNum(it && it.protein, 0, 300) ?? 0),
        carbs: Math.round(_laNum(it && it.carbs, 0, 500) ?? 0),
        fat: Math.round(_laNum(it && it.fat, 0, 300) ?? 0),
      })).filter(it => it.name && it.calories > 0);
      if (!items.length) continue;
      const meal = LA_MEALS.includes(e.meal) ? e.meal : (typeof mealTypeNow === 'function' ? mealTypeNow() : 'Snack');
      out.push({ type: 'meal', meal, items });
    } else if (e.type === 'water') {
      const ml = _laNum(e.ml, 50, 5000);
      if (ml !== null && !seen.has('water')) { seen.add('water'); out.push({ type: 'water', ml: Math.round(ml / 10) * 10 }); }
    } else if (e.type === 'sleep' && !seen.has('sleep')) {
      const bed = _laTime(e.bedtime), wake = _laTime(e.wake);
      let hours = _laNum(e.hours, 1, 16);
      if (bed && wake && typeof sleepDuration === 'function') hours = sleepDuration(bed, wake);
      if (hours && hours >= 1 && hours <= 16) { seen.add('sleep'); out.push(Object.assign({ type: 'sleep', hours: Math.round(hours * 10) / 10 }, bed && wake ? { bedtime: bed, wake } : {})); }
    } else if (e.type === 'habit') {
      const id = String(e.id || '');
      if (ids.has(id) && !seen.has('h:' + id)) { seen.add('h:' + id); out.push({ type: 'habit', id }); }
    } else if (e.type === 'weight' && !seen.has('weight')) {
      const lb = /^(lb|lbs|pound|pounds)$/i.test(String(e.unit || ''));
      const kg = lb ? _laNum(e.value, 44, 660) / 2.20462 : _laNum(e.value, 20, 300);
      if (kg && kg >= 20 && kg <= 300) {
        seen.add('weight');
        const imperial = typeof isImperial === 'function' && isImperial();
        out.push({ type: 'weight', value: Math.round((imperial ? kg * 2.20462 : kg) * 10) / 10 });
      }
    } else if (e.type === 'mood' && !seen.has('mood')) {
      const m = _laNum(e.mood, 1, 5);
      if (m !== null) { seen.add('mood'); out.push({ type: 'mood', mood: Math.round(m) }); }
    }
  }
  return out;
}

// The plain reader, for when there is no AI. It only catches the obvious.
const _LA_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5 };
const _laQty = w => (w == null ? 1 : _LA_WORDS[String(w).toLowerCase()] ?? parseFloat(String(w).replace(',', '.')));
function _laLocal(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  const out = [];
  // water
  let ml = 0;
  const vol = /(\d+(?:[.,]\d+)?|half|a|one|two|three)\s*(?:a\s+)?(ml|millilit(?:re|er)s?|l\b|lit(?:re|er)s?)\s*(?:of\s+)?water/g;
  for (const m of t.matchAll(vol)) ml += _laQty(m[1]) * (m[2].startsWith('m') ? 1 : 1000);
  const gl = /(\d+|a|one|two|three|four|five|six)\s+glass(?:es)?\s+of\s+water/g;
  for (const m of t.matchAll(gl)) ml += _laQty(m[1]) * 250;
  if (ml >= 50) out.push({ type: 'water', ml: Math.round(ml) });
  // sleep
  const sl = /slept\s+(?:about\s+|around\s+|for\s+|like\s+)?(\d+(?:[.,]\d+)?)\s*(?:h\b|hrs?\b|hours?)(?:\s*(?:and\s+)?(\d+)\s*(?:m\b|min(?:ute)?s?))?/.exec(t);
  if (sl) out.push({ type: 'sleep', hours: parseFloat(sl[1].replace(',', '.')) + (sl[2] ? +sl[2] / 60 : 0) });
  // weight
  const wt = /(?:weigh(?:ed|s|t)?|weight(?:\s+(?:is|was))?)\s+(?:in\s+at\s+)?(\d{2,3}(?:[.,]\d)?)\s*(kg|kilos?|lbs?|pounds)?/.exec(t);
  if (wt) out.push({ type: 'weight', value: parseFloat(wt[1].replace(',', '.')), unit: wt[2] && /^l|^p/.test(wt[2]) ? 'lb' : 'kg' });
  // habits: a distinctive word of the name, not just after "didn't", "skipped" or "no"
  // Words that name other kinds of entry ("water", "sleep") never tick a habit
  // here: "half a litre of water" is water, not the "Drink 3L water" habit.
  const STOP = new Set(['minutes', 'minute', 'daily', 'with', 'from', 'your', 'the', 'and', 'for', 'into', 'than', 'more', 'every',
    'morning', 'night', 'water', 'drink', 'glass', 'sleep', 'slept', 'weight', 'meal', 'food']);
  for (const h of (habits || [])) {
    const words = String(h.name || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));
    let hit = false;
    for (const w of words) {
      // the whole word, or its first six letters ("medita" for meditation), at the start of a word
      const stem = w.length <= 6 ? w : w.slice(0, 6);
      for (const m of t.matchAll(new RegExp('\\b' + stem, 'g'))) {
        if (/(?:didn'?t|did not|skipped|no|not|missed|without)\s+(?:\w+\s+){0,2}$/.test(t.slice(Math.max(0, m.index - 24), m.index))) continue;
        hit = true; break;
      }
      if (hit) break;
    }
    if (hit) out.push({ type: 'habit', id: h.id });
  }
  // common foods, from the meal estimator's own small table
  try {
    const items = typeof _localFoodLookup === 'function' ? _localFoodLookup(text) : null;
    if (items && items.length) out.push({ type: 'meal', items });
  } catch {}
  return _laSanitize(out);
}

async function _laRead(text) {
  _laNote = '';
  const consent = typeof aiConsent === 'function' ? aiConsent() : 'yes';
  if (consent === 'yes' && typeof _aiFetch === 'function') {
    try {
      const raw = await _aiFetch([{ role: 'system', content: _laPrompt() }, { role: 'user', content: String(text).slice(0, 1200) }], { jsonMode: true, maxTokens: 900 });
      const s = String(raw || '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
      const a = s.indexOf('{'), b = s.lastIndexOf('}'), c = s.indexOf('[');
      const parsed = a >= 0 && (c < 0 || a < c) ? JSON.parse(s.slice(a, b + 1)) : JSON.parse(s.slice(c, s.lastIndexOf(']') + 1));
      return _laSanitize(parsed);
    } catch (e) {
      _laNote = 'Read on this phone, so only the basics. Check it before logging.';
      return _laLocal(text);
    }
  }
  _laNote = consent === 'no' ? 'Read on this phone without AI, so only the basics.' : '';
  return _laLocal(text);
}

// ── what each entry looks like in the list ────────────────────────────────
function _laDescribe(e) {
  if (e.type === 'meal') {
    const cal = e.items.reduce((s, it) => s + it.calories, 0), p = e.items.reduce((s, it) => s + it.protein, 0);
    return { kind: e.meal || 'Meal', main: `${cal.toLocaleString()} cal, ${p} g protein`, sub: e.items.map(it => it.name).join(', ') };
  }
  if (e.type === 'water') return { kind: 'Water', main: e.ml >= 1000 ? `+${(e.ml / 1000).toFixed(1)} L` : `+${e.ml} ml` };
  if (e.type === 'sleep') {
    // With Whoop connected, Whoop's night is the record.
    const fromWhoop = typeof whoopHasNight === 'function' && whoopHasNight(today());
    return { kind: 'Sleep', main: `Last night, ${typeof formatSleep === 'function' ? formatSleep(e.hours) : e.hours + 'h'}`,
      sub: fromWhoop ? 'Whoop already has last night' : e.bedtime ? `${e.bedtime} to ${e.wake}` : '', already: fromWhoop };
  }
  if (e.type === 'habit') {
    const h = (habits || []).find(x => x.id === e.id);
    const done = !!(typeof log !== 'undefined' && log && log[e.id] && log[e.id].completedToday);
    return { kind: 'Habit', main: h ? h.name : e.id, sub: done ? 'Already done today' : '', already: done };
  }
  if (e.type === 'weight') return { kind: 'Weight', main: `${e.value} ${typeof wtUnit === 'function' ? wtUnit() : 'kg'}` };
  if (e.type === 'mood') return { kind: 'Mood', main: `${e.mood} out of 5` };
  return { kind: '', main: '' };
}

// ── the sheet ──────────────────────────────────────────────────────────────
const _LA_TICK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const _LA_MIC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';

function openLogAnything(prefill) {
  try {
    if (document.getElementById('la-modal')) return;
    _laEntries = []; _laNote = '';
    const sr = !!_laSR();
    const html = `<div id="la-modal" class="rd-overlay" role="dialog" aria-modal="true" aria-label="Log anything">
      <div class="rd-sheet la-sheet">
        <button class="rd-close" onclick="closeLogAnything()" aria-label="Close">&times;</button>
        <div class="pt-sheet-title">Log anything</div>
        <div class="rd-intro">Say what you ate, drank, slept and did. Arete sorts it into the right places.</div>
        <div class="la-field">
          <textarea id="la-text" class="la-ta" rows="3" oninput="_laEdited()" placeholder="Two eggs and toast, half a litre of water, did my meditation, slept about 6 hours"></textarea>
          ${sr ? `<button class="la-mic" id="la-mic" onclick="toggleLaMic()" aria-label="Speak instead of typing">${_LA_MIC}</button>` : ''}
        </div>
        <div class="la-hint">${sr ? 'Tap the mic and talk, or type.' : 'Type it, or tap the microphone on your keyboard and say it.'}</div>
        <div id="la-out" aria-live="polite"></div>
        <button class="milestone-btn la-go" id="la-go" onclick="readLogAnything()">Read it</button>
      </div>
    </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    document.body.appendChild(node);
    node.addEventListener('click', e => { if (e.target === node) closeLogAnything(); });
    const ta = document.getElementById('la-text');
    if (ta && prefill) ta.value = String(prefill);
    void node.offsetWidth;
    requestAnimationFrame(() => { node.classList.add('rd-visible'); if (ta && !prefill) ta.focus(); });
    if (typeof track === 'function') track('log_anything_open', {});
  } catch (e) { console.warn('[Arete] log anything:', e); }
}

function closeLogAnything() {
  try { if (_laRec) _laRec.stop(); } catch {}
  const m = document.getElementById('la-modal');
  if (!m) return;
  m.classList.remove('rd-visible');
  setTimeout(() => m.remove(), 250);
}

// Changing the words after reading them means reading them again.
function _laEdited() {
  if (!_laEntries.length && !_laNote) return;
  _laEntries = []; _laNote = '';
  const out = document.getElementById('la-out'); if (out) out.innerHTML = '';
  const go_ = document.getElementById('la-go'); if (go_) { go_.textContent = 'Read it'; go_.setAttribute('onclick', 'readLogAnything()'); go_.disabled = false; }
}

async function readLogAnything() {
  const ta = document.getElementById('la-text'), out = document.getElementById('la-out'), btn = document.getElementById('la-go');
  const text = ((ta && ta.value) || '').trim();
  if (!text) { if (out) out.innerHTML = '<div class="la-empty">Write or say something first.</div>'; return; }
  // Not asked about AI yet: ask, then come back here.
  if (typeof aiConsent === 'function' && !aiConsent() && typeof withAIConsent === 'function') { withAIConsent(readLogAnything); return; }
  if (_laBusy) return;
  _laBusy = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
  try {
    _laEntries = (await _laRead(text)).map(e => Object.assign(e, { on: !_laDescribe(e).already }));
  } finally { _laBusy = false; }
  _laRender();
  if (typeof track === 'function') track('log_anything_read', { count: _laEntries.length, types: _laEntries.map(e => e.type).join(',') });
}

function _laRender() {
  const out = document.getElementById('la-out'), btn = document.getElementById('la-go');
  if (!out) return;
  if (!_laEntries.length) {
    out.innerHTML = `<div class="la-empty">Nothing to log in that. Try naming the food, the drink, your sleep or a habit.</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Read it'; btn.setAttribute('onclick', 'readLogAnything()'); }
    return;
  }
  out.innerHTML = `<div class="la-list">${_laEntries.map((e, i) => {
    const d = _laDescribe(e);
    return `<button class="la-item${e.on ? '' : ' off'}" onclick="toggleLaEntry(${i})" role="checkbox" aria-checked="${e.on}"${d.already ? ' disabled' : ''}>
      <span class="la-check" aria-hidden="true">${e.on ? _LA_TICK : ''}</span>
      <span class="la-body"><span class="la-kind">${esc(d.kind)}</span><span class="la-main">${esc(d.main)}</span>${d.sub ? `<span class="la-sub">${esc(d.sub)}</span>` : ''}</span>
    </button>`;
  }).join('')}</div>${_laNote ? `<div class="la-note">${esc(_laNote)}</div>` : ''}`;
  _laButton();
}

function _laButton() {
  const btn = document.getElementById('la-go');
  if (!btn) return;
  const n = _laEntries.filter(e => e.on).length;
  btn.disabled = n === 0;
  btn.textContent = n ? `Log ${n} ${n === 1 ? 'thing' : 'things'}` : 'Nothing selected';
  btn.setAttribute('onclick', 'applyLogAnything()');
}

function toggleLaEntry(i) {
  const e = _laEntries[i];
  if (!e || _laDescribe(e).already) return;
  e.on = !e.on;
  _laRender();
}

function toggleLaMic() {
  const SR = _laSR();
  const mic = document.getElementById('la-mic'), ta = document.getElementById('la-text');
  if (!SR || !ta) return;
  if (_laRec) { try { _laRec.stop(); } catch {} return; }
  try {
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const base = ta.value.trim() ? ta.value.trim() + ' ' : '';
    rec.onresult = ev => { let s = ''; for (const r of ev.results) s += r[0].transcript; ta.value = base + s; _laEdited(); };
    rec.onend = () => { _laRec = null; if (mic) mic.classList.remove('on'); };
    rec.onerror = () => { _laRec = null; if (mic) mic.classList.remove('on'); };
    _laRec = rec;
    rec.start();
    if (mic) mic.classList.add('on');
  } catch { _laRec = null; }
}

// ── logging it ─────────────────────────────────────────────────────────────
function _laAddWater(ml) {
  const t = today();
  const w = LS.get('hvi_water_log', {}) || {};
  const next = Math.max(0, (w[t] || 0) + ml);
  if (next === 0) delete w[t]; else w[t] = next;
  LS.set('hvi_water_log', w);
}

// Applies the chosen entries. Returns a function that undoes them all.
function _laApply(entries) {
  const t = today(), undo = [];
  for (const e of entries) {
    try {
      if (e.type === 'meal' && typeof _commitMeal === 'function') {
        const id = _commitMeal(e.meal || mealTypeNow(), e.items, 'anything');
        undo.push(() => { if (typeof undoMeal === 'function') undoMeal(id); });
      } else if (e.type === 'water') {
        _laAddWater(e.ml);
        undo.push(() => _laAddWater(-e.ml));
      } else if (e.type === 'sleep') {
        if (typeof whoopHasNight === 'function' && whoopHasNight(t)) continue;
        const prev = sleepLog[t] ? JSON.parse(JSON.stringify(sleepLog[t])) : null;
        const cur = Object.assign({}, sleepLog[t] || {});
        if (e.bedtime && e.wake) { cur.bedtime = e.bedtime; cur.wake = e.wake; cur.hours = e.hours; }
        else { delete cur.bedtime; delete cur.wake; cur.hours = e.hours; }
        sleepLog[t] = cur;
        LS.set('hvi_sleep_log', sleepLog);
        if (window.Arete) window.Arete.emit('sleep:logged', { hours: cur.hours });
        undo.push(() => { if (prev) sleepLog[t] = prev; else delete sleepLog[t]; LS.set('hvi_sleep_log', sleepLog); });
      } else if (e.type === 'habit') {
        if (!log[e.id]) log[e.id] = { streak: 0, completedToday: false };
        if (!log[e.id].completedToday && typeof tapHabit === 'function') {
          // The undo is registered first: if the tap's XP or celebration step
          // fails after the habit is ticked, Undo still unticks it.
          undo.push(() => { if (log[e.id] && log[e.id].completedToday) tapHabit(e.id, ''); });
          tapHabit(e.id, '');
        }
      } else if (e.type === 'weight') {
        const prev = weightLog[t];
        weightLog[t] = e.value;
        LS.set('hvi_weight_log', weightLog);
        if (window.Arete) window.Arete.emit('weight:logged', { value: e.value });
        undo.push(() => { if (prev == null) delete weightLog[t]; else weightLog[t] = prev; LS.set('hvi_weight_log', weightLog); });
      } else if (e.type === 'mood' && typeof setTodayMood === 'function') {
        const prev = (LS.get('hvi_mood_log', {}) || {})[t];
        undo.push(() => { const all = LS.get('hvi_mood_log', {}) || {}; if (prev) all[t] = prev; else delete all[t]; LS.set('hvi_mood_log', all); });
        setTodayMood(e.mood);
      }
    } catch (err) { console.warn('[Arete] log anything, ' + e.type + ':', err && err.message); }
  }
  return () => { undo.reverse().forEach(f => { try { f(); } catch {} }); };
}

function applyLogAnything() {
  const chosen = _laEntries.filter(e => e.on && !_laDescribe(e).already);
  if (!chosen.length) return;
  const undoAll = _laApply(chosen);
  if (typeof track === 'function') track('log_anything_logged', { count: chosen.length, types: chosen.map(e => e.type).join(',') });
  closeLogAnything();
  _laEntries = [];
  const redraw = () => { try { if (typeof go === 'function' && typeof curView !== 'undefined' && curView) go(curView, {}, false); } catch {} };
  redraw();
  const n = chosen.length, msg = `Logged ${n} ${n === 1 ? 'thing' : 'things'}`;
  if (typeof showActionToast === 'function') showActionToast(msg, 'Undo', () => { undoAll(); redraw(); if (typeof showToast === 'function') showToast('Undone'); });
  else if (typeof showToast === 'function') showToast(msg);
}
