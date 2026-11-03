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
//
// Training too: "bench 3x8 at 80, squats 5x5 at 100" becomes finished sets in
// today's workout log, PRs and all, and a new session is finished the way the
// workout screen's Finish button finishes one (see _laLogWorkout).

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
    '- {"type":"mood","mood":4}: 1 to 5, only if they say how they feel.\n' +
    '- {"type":"workout","exercises":[{"id":"bench_press","sets":3,"reps":8,"weight":80,"unit":"kg"}]}: strength training they did today, one entry for the whole session. When the sets differ, list them: "sets":[{"reps":8,"weight":80},{"reps":6,"weight":85}]. weight 0 for bodyweight. unit "kg" or "lb" as they said it, "' + (typeof isImperial === 'function' && isImperial() ? 'lb' : 'kg') + '" if they did not say. Only ids from the exercise list below.\n\n' +
    'Rules: only what they say happened today or last night, never plans. Never invent anything they did not say. If nothing fits, {"entries":[]}.\n\n' +
    `Habits:\n${hl}\n\nExercises:\n${_laExerciseList()}\n\nNow: ${now.toLocaleDateString('en-GB', { weekday: 'long' })} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}.`;
}

const _laNum = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const _laTime = v => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v || '').trim()) ? String(v).trim().padStart(5, '0') : null);

// ── workouts ───────────────────────────────────────────────────────────────
// The built-in exercises (data.js) are the ones a sentence can name: they have
// ids the AI can be held to, and names a phone can match.
const _laExName = id => (typeof EXERCISES !== 'undefined' && Object.prototype.hasOwnProperty.call(EXERCISES, id) ? EXERCISES[id].name : null);
const _laExerciseList = () => (typeof EXERCISES !== 'undefined' ? Object.keys(EXERCISES).map(id => `  [${id}] ${EXERCISES[id].name}`).join('\n') : '  (none)');
const _laUnit = () => (typeof wtUnit === 'function' ? wtUnit() : 'kg');
const _laLb = u => /^(lb|lbs|pound|pounds)$/i.test(String(u || ''));

// What people call them, besides their names.
const _LA_EX_ALIAS = {
  bench: 'bench_press', 'flat bench': 'bench_press', squat: 'squat', squats: 'squat', 'back squat': 'squat', 'back squats': 'squat',
  deadlift: 'deadlift', deadlifts: 'deadlift', ohp: 'ohp', 'shoulder press': 'ohp', 'military press': 'ohp',
  'pull up': 'pullup', 'pull ups': 'pullup', pullups: 'pullup', 'chin up': 'chinup', 'chin ups': 'chinup', chinups: 'chinup',
  'push up': 'pushup', 'push ups': 'pushup', pushups: 'pushup', rows: 'barbell_row', 'bent over row': 'barbell_row', 'bent over rows': 'barbell_row',
  curls: 'barbell_curl', 'bicep curls': 'barbell_curl', 'biceps curls': 'barbell_curl', rdl: 'rdl', rdls: 'rdl', lunges: 'lunge',
  pulldowns: 'lat_pulldown', 'lat pulldowns': 'lat_pulldown', pushdowns: 'tricep_pushdown', 'tricep pushdown': 'tricep_pushdown',
  'leg extensions': 'leg_ext', 'leg extension': 'leg_ext', 'calf raise': 'calf_raise', 'lateral raise': 'lateral_raise', laterals: 'lateral_raise',
  'face pull': 'face_pull', 'hammer curl': 'hammer_curl', 'incline bench': 'incline_bench', 'hip thrusts': 'hip_thrust', 'leg curls': 'leg_curl',
  'incline db': 'incline_db', 'db press': 'db_flat_press', 'db bench': 'db_flat_press', 'db row': 'db_row', 'db rows': 'db_row', 'db fly': 'db_fly', 'db flyes': 'db_fly',
};
// "Dumbbell" and "DB" are one word here, as the exercise names use both.
const _laNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/\bdumbbells?\b/g, 'db').replace(/\s+/g, ' ').trim();
let _laAliasList = null;
function _laAliases() {
  if (_laAliasList) return _laAliasList;
  const m = new Map();
  if (typeof EXERCISES !== 'undefined') Object.keys(EXERCISES).forEach(id => {
    const n = _laNorm(EXERCISES[id].name);
    m.set(n, id);
    m.set(n.endsWith('s') ? n.slice(0, -1) : n + 's', id);
  });
  Object.keys(_LA_EX_ALIAS).forEach(k => { if (!m.has(_laNorm(k))) m.set(_laNorm(k), _LA_EX_ALIAS[k]); });
  // Longest first, so "front squat" wins over "squat".
  _laAliasList = [...m.entries()].filter(([, id]) => _laExName(id)).sort((a, b) => b[0].length - a[0].length);
  return _laAliasList;
}

// The plain reader's part: "bench 3x8 at 80", "3 sets of 10 pull-ups",
// "squats 5x5 100kg". A clause needs sets and reps to count, so "2 eggs" is
// never a workout.
function _laLocalWorkout(text) {
  const exercises = [];
  for (const part of String(text || '').replace(/×/g, 'x').replace(/@/g, ' at ').split(/[,;]|\band\b|\bthen\b|\bplus\b/i)) {
    const c = ' ' + _laNorm(part) + ' ';
    const sr = /\b(\d{1,2})\s*x\s*(\d{1,3})\b/.exec(c) || /\b(\d{1,2})\s*sets?\s*(?:of\s*)?(\d{1,3})\b/.exec(c);
    if (!sr) continue;
    const hit = _laAliases().find(([name]) => c.includes(' ' + name + ' '));
    if (!hit) continue;
    const wm = /\b(?:at|with)\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|lbs?|pounds?)?\b/.exec(c) || /\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|lbs?|pounds?)\b/.exec(c);
    exercises.push(Object.assign({ id: hit[1], sets: +sr[1], reps: +sr[2], weight: wm ? parseFloat(wm[1]) : 0 },
      wm && wm[2] ? { unit: /^(lb|pound)/.test(wm[2]) ? 'lb' : 'kg' } : {}));
  }
  return exercises.length ? { type: 'workout', exercises } : null;
}

// One exercise's sets from what came back: a list, or a count with one reps
// and weight. Weights end up in the person's own unit, as every set is stored.
function _laSets(x, unit) {
  const raw = Array.isArray(x.sets) ? x.sets
    : Array.from({ length: Math.round(_laNum(x.sets, 1, 20) || 0) }, () => ({ reps: x.reps, weight: x.weight }));
  const lb = _laLb(unit), imperial = typeof isImperial === 'function' && isImperial();
  const inLb = unit ? lb : imperial;
  return raw.slice(0, 20).map(st => {
    const reps = _laNum(st && st.reps, 1, 100);
    const w = _laNum(st && st.weight != null && st.weight !== '' ? st.weight : 0, 0, inLb ? 1100 : 500);
    if (!reps || w === null) return null;
    const kg = unit ? (lb ? w / 2.20462 : w) : null;
    const mine = kg === null ? w : imperial ? kg * 2.20462 : kg;
    return { reps: Math.round(reps), weight: Math.round(mine * 10) / 10 };
  }).filter(Boolean);
}

// "3×8 at 80 kg", or set by set when they differ: "80×8, 85×6 kg".
function _laSetsText(sets) {
  const u = _laUnit(), same = sets.every(s => s.reps === sets[0].reps && s.weight === sets[0].weight);
  if (same) return `${sets.length}×${sets[0].reps}${sets[0].weight > 0 ? ` at ${sets[0].weight} ${u}` : ''}`;
  const heavy = sets.some(s => s.weight > 0);
  return sets.map(s => (heavy ? `${s.weight}×${s.reps}` : `${s.reps}`)).join(', ') + (heavy ? ` ${u}` : ' reps');
}

// The set that ends up as the exercise's record, by the workout screen's own
// rule (heavier, or more weight times reps), or null when nothing beats it.
function _laPRSet(x) {
  let best = (typeof prs !== 'undefined' && prs && prs[x.id]) || null, beat = false;
  for (const s of x.sets) {
    if (!(s.weight > 0 && s.reps > 0)) continue;
    if (!best || s.weight > best.weight || s.weight * s.reps > best.weight * best.reps) { best = s; beat = true; }
  }
  return beat ? best : null;
}

// The same test the workout screen uses for a session someone has started.
const _laTouched = wl => (typeof _wIsTouched === 'function' ? _wIsTouched(wl)
  : !!(wl && (wl.touched || wl.notes || (wl.exercises || []).some(x => (x.sets || []).some(s => s.completed || s.warmup)))));

// Today's planned program day, when the sets are mostly from it: then the
// session counts as that day and the program moves on, as Finish does.
function _laPlanned(e) {
  try {
    const meta = (typeof workoutMeta !== 'undefined' && workoutMeta) || {};
    const prog = (typeof findProgram === 'function' && findProgram(meta.activeProgram)) || (typeof WORKOUT_PROGRAMS !== 'undefined' ? WORKOUT_PROGRAMS[0] : null);
    if (!prog || !Array.isArray(prog.days) || !prog.days.length) return null;
    const dayIndex = (meta.currentDayIndex || 0) % prog.days.length, day = prog.days[dayIndex];
    const planned = new Set((day && day.ex) || []);
    const hits = e.exercises.filter(x => planned.has(x.id)).length;
    return hits && hits * 2 >= e.exercises.length ? { prog, dayIndex, day } : null;
  } catch { return null; }
}

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
    } else if (e.type === 'workout') {
      // Only exercises the app knows, only sets that make sense. An exercise
      // named twice is one exercise; two workout entries are one session.
      const exercises = [];
      for (const x of (Array.isArray(e.exercises) ? e.exercises : []).slice(0, 12)) {
        const id = String((x && x.id) || '');
        if (!_laExName(id)) continue;
        const sets = _laSets(x, x.unit || e.unit);
        if (!sets.length) continue;
        const same = exercises.find(y => y.id === id);
        if (same) same.sets = same.sets.concat(sets).slice(0, 20); else exercises.push({ id, sets });
      }
      if (!exercises.length) continue;
      const prior = out.find(y => y.type === 'workout');
      if (!prior) out.push({ type: 'workout', exercises });
      else exercises.forEach(x => { const same = prior.exercises.find(y => y.id === x.id); if (same) same.sets = same.sets.concat(x.sets).slice(0, 20); else prior.exercises.push(x); });
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
  // sets and reps
  const wo = _laLocalWorkout(text);
  if (wo) out.push(wo);
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
  if (e.type === 'workout') {
    const lines = e.exercises.map(x => `${_laExName(x.id)} ${_laSetsText(x.sets)}`);
    const sets = e.exercises.reduce((n, x) => n + x.sets.length, 0);
    const pr = e.exercises.filter(x => _laPRSet(x)).map(x => _laExName(x.id));
    const wl = typeof workoutLog !== 'undefined' && workoutLog ? workoutLog[today()] : null;
    const adding = !!(wl && wl.source !== 'whoop' && _laTouched(wl));
    const plan = adding ? null : _laPlanned(e);
    const sub = [e.exercises.length > 1 ? lines.join(', ') : '', pr.length ? `New PR: ${pr.join(', ')}` : '',
      adding ? "Added to today's session" : plan ? `Counts as ${plan.day.name}` : ''].filter(Boolean).join('. ');
    return { kind: 'Workout', main: e.exercises.length === 1 ? lines[0] : `${e.exercises.length} exercises, ${sets} sets`, sub };
  }
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
          <textarea id="la-text" class="la-ta" rows="3" oninput="_laEdited()" placeholder="Two eggs and toast, half a litre of water, bench 3x8 at 80, slept about 6 hours"></textarea>
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

// A workout entry into today's log. With a session already started today the
// sets are added to it and it is left for its own Finish button. Otherwise it
// is a new session, finished as Finish would finish it: the records, XP, the
// week's count, today's quests, the program's next day when it was today's
// planned day, and the habits linked to working out. Whoop's reading of a day
// it alone had logged moves under the sets, as a sync would put it. Returns
// the undo, which puts every one of those back.
function _laLogWorkout(e) {
  const t = today(), copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const g = (typeof gamification !== 'undefined' && gamification) || {};
  if (typeof ensureWeeklyStats === 'function') { try { ensureWeeklyStats(); } catch {} }
  const before = {
    wl: copy(workoutLog[t]), prs: copy(prs || {}), meta: copy(workoutMeta || {}), vol: LS.get('hvi_volume_pr', 0),
    xp: g.xp || 0, pxp: copy(g.pillarXP || {}), week: !!(g.weeklyStats && (g.weeklyStats.workoutDays || []).includes(t)),
  };
  const cur = workoutLog[t];
  const whoopOnly = !!(cur && cur.source === 'whoop');
  const ongoing = !!(cur && !whoopOnly && _laTouched(cur));
  const done = x => x.sets.map(s => ({ weight: s.weight, reps: s.reps, completed: true }));
  if (ongoing) {
    cur.exercises = cur.exercises || [];
    e.exercises.forEach(x => {
      const same = cur.exercises.find(we => we.exerciseId === x.id);
      if (same) same.sets = (same.sets || []).concat(done(x)); else cur.exercises.push({ exerciseId: x.id, sets: done(x) });
    });
    cur.touched = true;
  } else {
    const plan = _laPlanned(e);
    const s = { exercises: e.exercises.map(x => ({ exerciseId: x.id, sets: done(x) })), touched: true, via: 'anything' };
    if (plan) Object.assign(s, { programId: plan.prog.id, dayIndex: plan.dayIndex, dayName: plan.day.name });
    if (whoopOnly) s.whoop = { id: cur.whoopId, sport: cur.dayName, strain: cur.strain, minutes: cur.duration, avgHr: cur.avgHr || null, calories: cur.calories || null };
    workoutLog[t] = s;
  }
  LS.set('hvi_workout_log', workoutLog);

  const xp = (n) => { if (typeof awardXP === 'function') awardXP(n, 'body'); };
  let records = 0;
  e.exercises.forEach(x => {
    const best = _laPRSet(x);
    if (!best) return;
    prs[x.id] = { weight: best.weight, reps: best.reps, date: t, name: _laExName(x.id) || '' };
    records++;
    xp(100);
  });
  if (records) LS.set('hvi_prs', prs);

  let linked = [];
  if (!ongoing) {
    const session = workoutLog[t];
    if (session.programId) {
      const prog = typeof findProgram === 'function' ? findProgram(session.programId) : null;
      if (prog && prog.days && prog.days.length) workoutMeta.currentDayIndex = (session.dayIndex + 1) % prog.days.length;
    }
    workoutMeta.lastWorkoutDate = t;
    LS.set('hvi_workout_meta', workoutMeta);
    const vol = session.exercises.reduce((n, we) => n + (we.sets || []).filter(s => s.completed && !s.warmup).reduce((m, s) => m + (s.weight || 0) * (s.reps || 0), 0), 0);
    if (vol > (before.vol || 0)) { LS.set('hvi_volume_pr', vol); session.volumePR = true; LS.set('hvi_workout_log', workoutLog); }
    xp(50);
    if (typeof trackWeeklyWorkout === 'function') trackWeeklyWorkout();
    if (typeof checkDailyQuests === 'function') { try { checkDailyQuests(); } catch {} }
  }
  // What this added, before the linked habits (their own untick takes theirs back).
  const gained = (g.xp || 0) - before.xp, pgained = {};
  Object.keys(g.pillarXP || {}).forEach(k => { const d = (g.pillarXP[k] || 0) - (before.pxp[k] || 0); if (d) pgained[k] = d; });
  if (!ongoing && window.Arete) {
    const was = new Set((habits || []).filter(h => log[h.id] && log[h.id].completedToday).map(h => h.id));
    window.Arete.emit('workout:completed');
    linked = (habits || []).filter(h => !was.has(h.id) && log[h.id] && log[h.id].completedToday).map(h => h.id);
  }

  return () => {
    linked.forEach(id => { if (log[id] && log[id].completedToday && typeof tapHabit === 'function') tapHabit(id, ''); });
    if (before.wl) workoutLog[t] = before.wl; else delete workoutLog[t];
    LS.set('hvi_workout_log', workoutLog);
    Object.keys(prs).forEach(k => { delete prs[k]; }); Object.assign(prs, before.prs); LS.set('hvi_prs', prs);
    Object.keys(workoutMeta).forEach(k => { delete workoutMeta[k]; }); Object.assign(workoutMeta, before.meta); LS.set('hvi_workout_meta', workoutMeta);
    LS.set('hvi_volume_pr', before.vol);
    if (gained || Object.keys(pgained).length) {
      g.xp = Math.max(0, (g.xp || 0) - gained);
      Object.keys(pgained).forEach(k => { g.pillarXP[k] = Math.max(0, (g.pillarXP[k] || 0) - pgained[k]); });
    }
    if (!before.week && g.weeklyStats && Array.isArray(g.weeklyStats.workoutDays)) g.weeklyStats.workoutDays = g.weeklyStats.workoutDays.filter(d => d !== t);
    LS.set('hvi_gamification', g);
    if (typeof refreshHeroXP === 'function') { try { refreshHeroXP(); } catch {} }
  };
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
      } else if (e.type === 'workout') {
        undo.push(_laLogWorkout(e));
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
  // Counted before logging: once logged, the new sets are the records.
  const records = chosen.filter(e => e.type === 'workout').reduce((n, e) => n + e.exercises.filter(x => _laPRSet(x)).length, 0);
  const undoAll = _laApply(chosen);
  if (typeof track === 'function') track('log_anything_logged', { count: chosen.length, types: chosen.map(e => e.type).join(',') });
  closeLogAnything();
  _laEntries = [];
  const redraw = () => { try { if (typeof go === 'function' && typeof curView !== 'undefined' && curView) go(curView, {}, false); } catch {} };
  redraw();
  const n = chosen.length, msg = `Logged ${n} ${n === 1 ? 'thing' : 'things'}${records ? `, ${records} new PR${records === 1 ? '' : 's'}` : ''}`;
  if (typeof showActionToast === 'function') showActionToast(msg, 'Undo', () => { undoAll(); redraw(); if (typeof showToast === 'function') showToast('Undone'); });
  else if (typeof showToast === 'function') showToast(msg);
}
