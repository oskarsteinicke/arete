// ── YOUR PATTERNS ──────────────────────────────────────────────────────────
// How the parts of someone's life move together, read from their own last 60
// days of logs. Each pattern compares two groups of days on one measure: days
// after 7+ hours of sleep against days after under 6, training days against
// rest days, and so on.
//
// These are observations, never causes. The wording says what went together
// ("after 7+ hours of sleep you finish 82% of your habits"), not that one thing
// makes the other happen. A pattern needs at least PATTERN_MIN_DAYS days on
// each side and a gap big enough to matter, so a handful of lucky days never
// turns into a claim. Today is left out of anything measured over a whole day,
// because today is not over.
//
// Everything is worked out on the device from what is already stored. No AI,
// no network.

const PATTERN_WINDOW = 60;
const PATTERN_MIN_DAYS = 5;

const _pKey = d => d.toLocaleDateString('en-CA');
function _pShift(key, n) { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return _pKey(d); }
// Yesterday back PATTERN_WINDOW days, oldest first.
function _pDays() { const out = []; for (let i = PATTERN_WINDOW; i >= 1; i--) out.push(_pShift(today(), -i)); return out; }

// Share of the day's habits that were done. Only daily habits and habits set
// for that weekday count; weekly targets have no "due today". A habit counts
// from its first completion on, so one added last week is not "missed" for the
// seven weeks before it existed.
function _pHabitRate(key, hist) {
  const dow = new Date(key + 'T12:00:00').getDay();
  let due = 0, done = 0;
  for (const h of (habits || [])) {
    const sched = h.schedule || 'daily';
    if (sched === 'weekly') continue;
    if (sched === 'specific' && !(h.days || [0, 1, 2, 3, 4, 5, 6]).includes(dow)) continue;
    const list = hist[h.id] || [];
    if (!list.length || list[0] > key) continue;
    due++;
    if (list.includes(key)) done++;
  }
  return due ? done / due : null;
}
const _pSleep = key => { const s = (sleepLog || {})[key]; return s && s.hours > 0 ? +s.hours : null; };
// Bedtime as minutes after 18:00, so 23:30 is 330 and 00:30 is 390.
const _pBed = key => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(((sleepLog || {})[key] || {}).bedtime || ''));
  if (!m) return null;
  return (((+m[1] * 60 + +m[2]) - 18 * 60) + 1440) % 1440;
};
const _pTrained = key => (typeof trainedOnDay === 'function' ? trainedOnDay(key) : false);
// Whoop's recovery for the morning of `key`. It belongs to the night that
// ended then, so what was done the day before lines up with it.
const _pRec = key => { const s = (sleepLog || {})[key]; return s && typeof s.whoopRecovery === 'number' ? s.whoopRecovery : null; };
// A hard day: strain 14+ on Whoop, or a session the app counts as hard.
function _pHard(key) {
  const b = typeof burnOn === 'function' ? burnOn(key) : null;
  if (b && b.strain >= 14) return true;
  const w = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog[key] : null;
  return !!(w && _pTrained(key) && typeof _intensityOf === 'function' && _intensityOf(w) === 'hard');
}
function _pProtein(key) {
  const meals = (((mealLog || {})[key]) || {}).meals || [];
  if (!meals.length) return null;
  let p = 0; meals.forEach(m => (m.items || []).forEach(it => { p += it.protein || 0; }));
  return p;
}
const _pJournaled = key => { const j = (journal || {})[key]; return !!(j && Object.values(j).some(v => typeof v === 'string' && v.trim())); };

const _pMean = a => a.reduce((s, x) => s + x, 0) / a.length;
// Effect size: the gap between the groups in units of their spread.
function _pEffect(a, b) {
  const ma = _pMean(a), mb = _pMean(b);
  const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / Math.max(1, a.length - 1);
  const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / Math.max(1, b.length - 1);
  const sd = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / Math.max(1, a.length + b.length - 2));
  return sd > 0 ? (ma - mb) / sd : (ma === mb ? 0 : 3 * Math.sign(ma - mb));
}
const _pPct = x => Math.round(x * 100) + '%';
const _pHm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };

// Compare two groups. `min` is the smallest gap worth mentioning, in the
// measure's own units. Returns null when there is too little to go on.
function _pCompare(a, b, min) {
  if (a.length < PATTERN_MIN_DAYS || b.length < PATTERN_MIN_DAYS) return null;
  const ma = _pMean(a), mb = _pMean(b);
  if (Math.abs(ma - mb) < min) return null;
  const e = _pEffect(a, b);
  if (Math.abs(e) < 0.4) return null;
  return { ma, mb, na: a.length, nb: b.length, score: Math.min(3, Math.abs(e)) * Math.sqrt(Math.min(a.length, b.length)) };
}

// Short nights: under 6 hours, or under 6.5 if there are too few under 6.
function _pShort(days) {
  const n6 = days.filter(d => _pSleep(d) !== null && _pSleep(d) < 6).length;
  return n6 >= PATTERN_MIN_DAYS ? { lim: 6, label: 'Under 6 hours' } : { lim: 6.5, label: 'Under 6.5 hours' };
}

function findPatterns() {
  try {
    const days = _pDays();
    const hist = LS.get('hvi_habit_history', {}) || {};
    const rate = {}; days.forEach(d => { rate[d] = _pHabitRate(d, hist); });
    const short = _pShort(days);
    const goodSleep = d => _pSleep(d) !== null && _pSleep(d) >= 7;
    const shortSleep = d => _pSleep(d) !== null && _pSleep(d) < short.lim;
    const shortWord = `${short.lim} hours`;
    const out = [];
    const add = (id, cmp, p) => { if (cmp) out.push(Object.assign({ id, score: cmp.score, na: cmp.na, nb: cmp.nb }, p(cmp))); };

    // Sleep and the habits done that day
    {
      const a = days.filter(d => goodSleep(d) && rate[d] !== null).map(d => rate[d]);
      const b = days.filter(d => shortSleep(d) && rate[d] !== null).map(d => rate[d]);
      add('sleep-habits', _pCompare(a, b, 0.15), c => ({
        text: `After 7+ hours of sleep you finish ${_pPct(c.ma)} of your habits. After under ${shortWord}, ${_pPct(c.mb)}.`,
        a: { label: '7+ hours of sleep', value: c.ma, show: _pPct(c.ma) }, b: { label: short.label, value: c.mb, show: _pPct(c.mb) }, max: 1,
      }));
    }
    // Sleep and whether they trained that day
    if (days.filter(_pTrained).length >= 4) {
      const a = days.filter(goodSleep).map(d => _pTrained(d) ? 1 : 0);
      const b = days.filter(shortSleep).map(d => _pTrained(d) ? 1 : 0);
      add('sleep-training', _pCompare(a, b, 0.2), c => ({
        text: `You train on ${_pPct(c.ma)} of days after 7+ hours of sleep. After under ${shortWord}, ${_pPct(c.mb)}.`,
        a: { label: '7+ hours of sleep', value: c.ma, show: _pPct(c.ma) }, b: { label: short.label, value: c.mb, show: _pPct(c.mb) }, max: 1,
      }));
    }
    // Training and the sleep that night (logged the next morning)
    {
      const nights = days.map(d => [d, _pSleep(_pShift(d, 1))]).filter(([, s]) => s !== null);
      const a = nights.filter(([d]) => _pTrained(d)).map(([, s]) => s);
      const b = nights.filter(([d]) => !_pTrained(d)).map(([, s]) => s);
      add('training-sleep', _pCompare(a, b, 1 / 3), c => ({
        text: `After training days you sleep ${_pHm(c.ma)}. After rest days, ${_pHm(c.mb)}.`,
        a: { label: 'After training days', value: c.ma, show: _pHm(c.ma) }, b: { label: 'After rest days', value: c.mb, show: _pHm(c.mb) }, max: 10,
      }));
    }
    // Training and the protein target
    {
      const target = +(((typeof dietMeta !== 'undefined' && dietMeta) || {}).dailyGoals || {}).protein || 0;
      if (target > 0) {
        const logged = days.filter(d => _pProtein(d) !== null);
        const hit = d => (_pProtein(d) >= target * 0.9 ? 1 : 0);
        const a = logged.filter(_pTrained).map(hit), b = logged.filter(d => !_pTrained(d)).map(hit);
        add('training-protein', _pCompare(a, b, 0.2), c => ({
          text: `On training days you hit your protein target ${_pPct(c.ma)} of the time. On rest days, ${_pPct(c.mb)}.`,
          a: { label: 'Training days', value: c.ma, show: _pPct(c.ma) }, b: { label: 'Rest days', value: c.mb, show: _pPct(c.mb) }, max: 1,
        }));
      }
    }
    // The journal and the habits done the next day
    {
      const pairs = days.map(d => [d, _pShift(d, 1)]).filter(([, n]) => n < today() && rate[n] !== null && rate[n] !== undefined);
      const a = pairs.filter(([d]) => _pJournaled(d)).map(([, n]) => rate[n]);
      const b = pairs.filter(([d]) => !_pJournaled(d)).map(([, n]) => rate[n]);
      add('journal-habits', _pCompare(a, b, 0.15), c => ({
        text: `The day after you journal, you finish ${_pPct(c.ma)} of your habits. After nights you skip it, ${_pPct(c.mb)}.`,
        a: { label: 'After journaling', value: c.ma, show: _pPct(c.ma) }, b: { label: 'After skipping it', value: c.mb, show: _pPct(c.mb) }, max: 1,
      }));
    }
    // Sleep and mood
    {
      const moods = LS.get('hvi_mood_log', {}) || {};
      const mood = d => (moods[d] && moods[d].mood > 0 ? +moods[d].mood : null);
      const a = days.filter(d => goodSleep(d) && mood(d) !== null).map(mood);
      const b = days.filter(d => shortSleep(d) && mood(d) !== null).map(mood);
      add('sleep-mood', _pCompare(a, b, 0.5), c => ({
        text: `After 7+ hours of sleep your mood averages ${c.ma.toFixed(1)} out of 5. After under ${shortWord}, ${c.mb.toFixed(1)}.`,
        a: { label: '7+ hours of sleep', value: c.ma, show: c.ma.toFixed(1) }, b: { label: short.label, value: c.mb, show: c.mb.toFixed(1) }, max: 5,
      }));
    }
    // Bedtime and the habits done the next day (bedtime is logged that morning)
    {
      const a = days.filter(d => _pBed(d) !== null && _pBed(d) <= 300 && rate[d] !== null).map(d => rate[d]);
      const b = days.filter(d => _pBed(d) !== null && _pBed(d) >= 360 && rate[d] !== null).map(d => rate[d]);
      add('bedtime-habits', _pCompare(a, b, 0.15), c => ({
        text: `When you are in bed by 11, you finish ${_pPct(c.ma)} of your habits the next day. After midnight, ${_pPct(c.mb)}.`,
        a: { label: 'In bed by 11', value: c.ma, show: _pPct(c.ma) }, b: { label: 'After midnight', value: c.mb, show: _pPct(c.mb) }, max: 1,
      }));
    }
    // ── With Whoop: what goes with how recovered you wake up ──
    // Recovery is 0 to 100, Whoop's green from 67. A gap of 8 points is the
    // smallest worth mentioning. Hours of sleep against recovery is left out:
    // Whoop builds recovery from the night, so that one is true by definition.
    const recPct = v => `${Math.round(v)}%`;
    const nextRec = days.map(d => [d, _pRec(_pShift(d, 1))]).filter(([, r]) => r !== null);
    // The journal and recovery the next morning
    {
      const a = nextRec.filter(([d]) => _pJournaled(d)).map(([, r]) => r);
      const b = nextRec.filter(([d]) => !_pJournaled(d)).map(([, r]) => r);
      add('journal-recovery', _pCompare(a, b, 8), c => ({
        text: `The morning after you journal, your recovery averages ${recPct(c.ma)}. After days you skip it, ${recPct(c.mb)}.`,
        a: { label: 'After journaling', value: c.ma, show: recPct(c.ma) }, b: { label: 'After skipping it', value: c.mb, show: recPct(c.mb) }, max: 100,
      }));
    }
    // Bedtime and recovery (both belong to the same night)
    {
      const a = days.concat([today()]).filter(d => _pBed(d) !== null && _pBed(d) <= 300 && _pRec(d) !== null).map(_pRec);
      const b = days.concat([today()]).filter(d => _pBed(d) !== null && _pBed(d) >= 360 && _pRec(d) !== null).map(_pRec);
      add('bedtime-recovery', _pCompare(a, b, 8), c => ({
        text: `When you are in bed by 11, your recovery averages ${recPct(c.ma)}. After midnight, ${recPct(c.mb)}.`,
        a: { label: 'In bed by 11', value: c.ma, show: recPct(c.ma) }, b: { label: 'After midnight', value: c.mb, show: recPct(c.mb) }, max: 100,
      }));
    }
    // Hard days and recovery the next morning
    {
      const a = nextRec.filter(([d]) => _pHard(d)).map(([, r]) => r);
      const b = nextRec.filter(([d]) => !_pTrained(d) && !_pHard(d)).map(([, r]) => r);
      add('hard-recovery', _pCompare(a, b, 8), c => ({
        text: `After hard training days your recovery averages ${recPct(c.ma)}. After rest days, ${recPct(c.mb)}.`,
        a: { label: 'After hard days', value: c.ma, show: recPct(c.ma) }, b: { label: 'After rest days', value: c.mb, show: recPct(c.mb) }, max: 100,
      }));
    }
    // Recovery and the habits done that day
    {
      const a = days.filter(d => _pRec(d) !== null && _pRec(d) >= 67 && rate[d] !== null).map(d => rate[d]);
      const b = days.filter(d => _pRec(d) !== null && _pRec(d) < 50 && rate[d] !== null).map(d => rate[d]);
      add('recovery-habits', _pCompare(a, b, 0.15), c => ({
        text: `On mornings your recovery is green (67%+), you finish ${_pPct(c.ma)} of your habits. Under 50%, ${_pPct(c.mb)}.`,
        a: { label: 'Green recovery', value: c.ma, show: _pPct(c.ma) }, b: { label: 'Under 50%', value: c.mb, show: _pPct(c.mb) }, max: 1,
      }));
    }
    return out.sort((x, y) => y.score - x.score);
  } catch (e) {
    console.warn('[Arete] patterns:', e && e.message);
    return [];
  }
}

// The one shown on home: the strongest, taking turns day by day among the top
// three so the card does not say the same thing every morning.
function patternOfTheDay(list) {
  const ps = list || findPatterns();
  if (!ps.length) return null;
  const top = ps.slice(0, 3);
  const day = Math.floor(new Date(today() + 'T12:00:00').getTime() / 86400000);
  return top[day % top.length];
}

function _patternBarsHTML(p) {
  const w = v => Math.max(4, Math.min(100, (v / p.max) * 100)).toFixed(1);
  const hi = p.a.value >= p.b.value ? 'a' : 'b';
  return ['a', 'b'].map(k => `
      <div class="pt-row"><span class="pt-lbl">${esc(p[k].label)}</span><span class="pt-val">${esc(p[k].show)}</span></div>
      <div class="pt-bar${k === hi ? ' pt-hi' : ''}"><span style="width:${w(p[k].value)}%"></span></div>`).join('');
}

function patternCardHTML() {
  try {
    const ps = findPatterns();
    const p = patternOfTheDay(ps);
    if (!p) return '';
    return `<div class="pt-card ani" role="button" tabindex="0" onclick="showPatterns()"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showPatterns()}"
        aria-label="Your pattern. ${esc(p.text)} ${ps.length > 1 ? 'Shows all ' + ps.length + ' patterns.' : ''}">
      <div class="ci-head"><span class="ci-label">Your pattern</span>${ps.length > 1 ? `<span class="pt-more">${ps.length} found</span>` : ''}</div>
      <div class="pt-text">${esc(p.text)}</div>
      <div class="pt-bars" aria-hidden="true">${_patternBarsHTML(p)}</div>
    </div>`;
  } catch { return ''; }
}

function showPatterns() {
  try {
    if (document.getElementById('pt-modal')) return;
    const ps = findPatterns();
    if (!ps.length) return;
    const html = `<div id="pt-modal" class="rd-overlay" role="dialog" aria-modal="true" aria-label="Your patterns">
      <div class="rd-sheet">
        <button class="rd-close" onclick="closePatterns()" aria-label="Close">&times;</button>
        <div class="pt-sheet-title">Your patterns</div>
        <div class="rd-intro">How the parts of your days move together, from your last ${PATTERN_WINDOW} days.</div>
        ${ps.map(p => `<div class="pt-item"><div class="pt-text">${esc(p.text)}</div><div class="pt-bars">${_patternBarsHTML(p)}</div>
          <div class="pt-n">${p.na} days against ${p.nb}</div></div>`).join('')}
        <div class="rd-foot">These are patterns in your own logs, not proof that one thing causes the other. A pattern shows once each side has at least ${PATTERN_MIN_DAYS} days.</div>
      </div>
    </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    document.body.appendChild(node);
    node.addEventListener('click', e => { if (e.target === node) closePatterns(); });
    void node.offsetWidth;
    requestAnimationFrame(() => node.classList.add('rd-visible'));
    if (typeof track === 'function') track('patterns_open', { count: ps.length });
  } catch (e) { console.warn('[Arete] patterns sheet:', e); }
}

function closePatterns() {
  const m = document.getElementById('pt-modal');
  if (!m) return;
  m.classList.remove('rd-visible');
  setTimeout(() => m.remove(), 250);
}

// For the coach: the strongest few, as plain lines.
function patternLinesForCoach(n = 3) {
  return findPatterns().slice(0, n).map(p => p.text);
}
