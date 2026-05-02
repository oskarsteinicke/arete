// ══════════════════════════════════════════════════════════════════════════
// Northstar — Application Logic
// ══════════════════════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────────────────────
let habits, log, journal, meta;
let workoutLog, workoutMeta, mealLog, dietMeta;
let curView = 'home', curPillar = null, qTimer = null, jDebounce = null;
let curMealItems = [], curMealType = 'Breakfast';
let curRecipeId = null, libTab = 'books';
let curHabitCat = 'mindset';
let builderProg = null, builderDayIdx = 0, builderSearch = '';
let weightLog;
let foodSearchCache = {};
let selectedFood100g = null;
let tdeeProfile;
let wgerCache = {};
let wgerSearchCache = {};
let prs;
let browserContext = null;
let pendingExercise = null;
let browserState = { category: null, equipment: null, search: '', results: [], nextUrl: null, loading: false, expanded: null };
let _habitEditMode = false;
let _parsedMealItems = [];   // staging area for describe-meal results
let browserSearchDebounce = null;
let builderSearchDebounce = null;
let builderSearchResults = [];
let builderSearchLoading = false;
let gamification, achievements;
let settings;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = '';
let calView = 'monthly'; // 'monthly' | 'weekly' | 'daily'
let calTasks = {};
let sleepLog;
let restTimer = null, restTimerEnd = 0, restTimerDur = 90;
const USDA_KEY = 'DEMO_KEY'; // Rate-limited (30 req/hr). Get a free key at https://fdc.nal.usda.gov/api-key-signup.html

// ── Unit helpers ──────────────────────────────────────────────────────────
function isImperial() { return (settings || {}).units === 'imperial'; }
function wtUnit() { return isImperial() ? 'lbs' : 'kg'; }
function setUnits(u) {
  settings.units = u;
  LS.set('hvi_settings', settings);
}

// ── SUPABASE AUTH + CLOUD SYNC ────────────────────────────────────────────
const SUPABASE_URL = 'https://socflncohsenjptgkkax.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J2qJ8iTfCESrML5Hm6NGbQ_mz9uPeug';
const SYNC_KEYS = ['hvi_habits','hvi_log','hvi_journal3','hvi_meta','hvi_workout_log','hvi_workout_meta','hvi_meal_log','hvi_diet_meta','hvi_weight_log','hvi_prs','hvi_gamification','hvi_achievements','hvi_tdee_profile','hvi_custom_programs','hvi_onboarded','hvi_sleep_log','hvi_settings'];

// ── AUTH HELPERS ──────────────────────────────────────────────────────────
async function authResetPassword(email) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email })
    });
    return r.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}

function getSession() {
  try { return JSON.parse(localStorage.getItem('hvi_session')); } catch { return null; }
}
function getAccessToken() {
  return getSession()?.access_token || null;
}
function getCurrentUserId() {
  return getSession()?.user?.id || null;
}

async function authSignUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return await res.json();
}

async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('hvi_session', JSON.stringify(data));
    return { ok: true, data };
  }
  return { ok: false, error: data.error_description || data.msg || 'Sign in failed' };
}

async function authRefresh() {
  const session = getSession();
  if (!session?.refresh_token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const data = await res.json();
    if (data.access_token) { localStorage.setItem('hvi_session', JSON.stringify(data)); return true; }
  } catch {}
  return false;
}

async function authSignOut() {
  const token = getAccessToken();
  if (token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
    } catch {}
  }
  localStorage.removeItem('hvi_session');
  SYNC_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ── SYNC HELPERS ──────────────────────────────────────────────────────────
let _syncDebounce = null;

function setSyncStatus(state) {
  let el = document.getElementById('sync-dot');
  if (!el) { el = document.createElement('div'); el.id = 'sync-dot'; el.title = 'Cloud sync'; document.body.appendChild(el); }
  el.className = 'sync-' + state;
}

function authHeaders(extra = {}) {
  const token = getAccessToken();
  return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function cloudPush() {
  const uid = getCurrentUserId();
  if (!uid) return;
  const data = {};
  SYNC_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) { try { data[k] = JSON.parse(v); } catch {} } });
  setSyncStatus('pending');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data`, {
      method: 'POST',
      headers: authHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ user_id: uid, data, updated_at: new Date().toISOString() })
    });
    if (res.status === 401) { await authRefresh(); }
    setSyncStatus(res.ok || res.status === 401 ? 'ok' : 'offline');
  } catch { setSyncStatus('offline'); }
}

async function cloudPull() {
  const uid = getCurrentUserId();
  if (!uid) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data?user_id=eq.${uid}&select=data`, {
      headers: authHeaders()
    });
    if (!res.ok) return false;
    const rows = await res.json();
    if (!rows.length) return false;
    const cloud = rows[0].data || {};
    SYNC_KEYS.forEach(k => { if (cloud[k] !== undefined) localStorage.setItem(k, JSON.stringify(cloud[k])); });
    return true;
  } catch { return false; }
}

function schedulePush() {
  clearTimeout(_syncDebounce);
  _syncDebounce = setTimeout(cloudPush, 2500);
}

// ── AUTH UI ───────────────────────────────────────────────────────────────
let _authMode = 'signin'; // 'signin' | 'signup'

function injectAuthStyles() {
  if (document.getElementById('auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'auth-styles';
  s.textContent = `
    #auth-overlay{position:fixed;inset:0;background:var(--bg);z-index:3000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 28px}
    .auth-logo{margin-bottom:40px;text-align:center;display:flex;flex-direction:column;align-items:center}
    .auth-title{font-family:var(--serif);font-size:36px;color:var(--text);text-align:center;margin-bottom:8px;line-height:1.2}
    .auth-sub{font-size:13px;color:var(--text-dim);text-align:center;margin-bottom:36px;line-height:1.6}
    .auth-input{width:100%;padding:16px 18px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:var(--surface);color:var(--text);font-size:15px;margin-bottom:12px;outline:none;transition:border .2s;box-sizing:border-box}
    .auth-input:focus{border-color:var(--accent)}
    .auth-btn{width:100%;padding:18px;border:none;border-radius:14px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;margin-top:8px;transition:transform .15s,opacity .15s}
    .auth-btn:active{transform:scale(0.98)}
    .auth-btn:disabled{opacity:0.5;cursor:not-allowed}
    .auth-switch{margin-top:24px;font-size:13px;color:var(--text-dim);text-align:center}
    .auth-switch span{color:var(--accent-b);cursor:pointer;font-weight:600}
    .auth-error{color:#d46f6f;font-size:13px;text-align:center;margin-top:8px;min-height:20px}
    .auth-divider{display:flex;align-items:center;gap:12px;margin:20px 0;width:100%}
    .auth-divider-line{flex:1;height:1px;background:rgba(255,255,255,0.08)}
    .auth-divider-text{font-size:11px;color:var(--text-muted);letter-spacing:1px}
  `;
  document.head.appendChild(s);
}

function renderAuth() {
  injectAuthStyles();
  let overlay = document.getElementById('auth-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'auth-overlay'; document.body.appendChild(overlay); }

  const isSignIn = _authMode === 'signin';
  overlay.innerHTML = `
    <div class="auth-logo">
      <svg viewBox="0 0 120 120" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
        <path d="M60 4 C62 30 90 58 116 60 C90 62 62 90 60 116 C58 90 30 62 4 60 C30 58 58 30 60 4 Z" fill="#9a8256"/>
        <path d="M60 28 C61 44 76 59 92 60 C76 61 61 76 60 92 C59 76 44 61 28 60 C44 59 59 44 60 28 Z" fill="#b89d68" opacity="0.6"/>
        <circle cx="60" cy="60" r="4" fill="#e4dace"/>
      </svg>
      <div style="font-size:13px;letter-spacing:.25em;color:var(--accent-b);margin-top:8px;font-weight:600">NORTHSTAR</div>
    </div>
    <div class="auth-title">${isSignIn ? 'Welcome back.' : 'Start your journey.'}</div>
    <div class="auth-sub">${isSignIn ? 'Sign in to access your data on any device.' : 'Create your account to get started.'}</div>
    <div style="width:100%;max-width:360px">
      ${!isSignIn ? `<input class="auth-input" type="text" id="auth-name" placeholder="First name" autocomplete="given-name" onkeydown="if(event.key==='Enter')submitAuth()">` : ''}
      <input class="auth-input" type="email" id="auth-email" placeholder="Email address" autocomplete="email">
      <input class="auth-input" type="password" id="auth-password" placeholder="Password" autocomplete="${isSignIn ? 'current-password' : 'new-password'}" onkeydown="if(event.key==='Enter')submitAuth()">
      ${!isSignIn ? `<input class="auth-input" type="password" id="auth-confirm" placeholder="Confirm password" onkeydown="if(event.key==='Enter')submitAuth()">` : ''}
      <div class="auth-error" id="auth-error"></div>
      <button class="auth-btn" id="auth-btn" onclick="submitAuth()">${isSignIn ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
      <div class="auth-switch">
        ${isSignIn ? `Don't have an account? <span onclick="_authMode='signup';renderAuth()">Sign up</span>` : `Already have an account? <span onclick="_authMode='signin';renderAuth()">Sign in</span>`}
      </div>
      ${isSignIn ? `<div class="auth-switch" style="margin-top:10px"><span onclick="handleForgotPassword()" style="color:var(--text-dim);font-weight:400">Forgot password?</span></div>` : ''}
    </div>`;
}

async function submitAuth() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const confirm = document.getElementById('auth-confirm')?.value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-btn');

  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  if (_authMode === 'signup' && password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  btn.disabled = true; btn.textContent = _authMode === 'signin' ? 'SIGNING IN...' : 'CREATING ACCOUNT...';
  errEl.textContent = '';

  if (_authMode === 'signup') {
    const firstName = document.getElementById('auth-name')?.value?.trim();
    if (!firstName) { errEl.textContent = 'Please enter your first name.'; btn.disabled = false; btn.textContent = 'CREATE ACCOUNT'; return; }
    const res = await authSignUp(email, password);
    if (res.error) { errEl.textContent = res.error.message || 'Sign up failed.'; btn.disabled = false; btn.textContent = 'CREATE ACCOUNT'; return; }
    localStorage.setItem('hvi_user_name', firstName);
    // Auto sign in after signup
    _authMode = 'signin';
  }

  const result = await authSignIn(email, password);
  if (!result.ok) {
    const msg = result.error || '';
    if (msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('not confirmed')) {
      errEl.style.color = '#6fd48e';
      errEl.textContent = 'Account created! Check your inbox to confirm your email, then sign in.';
    } else {
      errEl.textContent = msg || 'Sign in failed.';
    }
    btn.disabled = false; btn.textContent = 'SIGN IN'; return;
  }

  // Signed in — remove overlay and boot app normally
  document.getElementById('auth-overlay')?.remove();
  init();
}

async function handleForgotPassword() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const errEl = document.getElementById('auth-error');
  if (!email) { errEl.style.color = 'var(--fat)'; errEl.textContent = 'Enter your email above first.'; return; }
  errEl.style.color = 'var(--text-dim)'; errEl.textContent = 'Sending…';
  const res = await authResetPassword(email);
  if (res.ok) { errEl.style.color = '#6fd48e'; errEl.textContent = 'Check your inbox for a reset link.'; }
  else { errEl.style.color = 'var(--fat)'; errEl.textContent = 'Could not send reset email. Try again.'; }
}

// ── STORAGE ───────────────────────────────────────────────────────────────
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); schedulePush(); } catch {} },
};

// ── DATE ──────────────────────────────────────────────────────────────────
const today = () => new Date().toLocaleDateString('en-CA');
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); };
const dayName = () => new Date().toLocaleDateString('en-US', { weekday: 'long' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const userName = () => localStorage.getItem('hvi_user_name') || '';
const fmtDate = s => { const [y,m,d] = s.split('-'); return new Date(+y,+m-1,+d).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }); };

// ── UTILS ─────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function ring(r, pct, sw = 3, color = 'var(--accent)') {
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(Math.max(pct, 0), 1));
  const sz = (r + sw) * 2;
  const cx = r + sw;
  return `<svg viewBox="0 0 ${sz} ${sz}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" stroke-linecap="round"/>
  </svg>`;
}

// ── ALL PROGRAMS (built-in + custom) ──────────────────────────────────────
function allPrograms() { return [...WORKOUT_PROGRAMS, ...LS.get('hvi_custom_programs', [])]; }
function findProgram(id) { return allPrograms().find(p => p.id === id); }

// ── NAV PARENT MAP ────────────────────────────────────────────────────────
const NAV_PARENT = {
  pillar: 'home',
  habitCreate: 'habits',
  workoutPicker: 'workout', workoutActive: 'workout', workoutHistory: 'workout', workoutBuilder: 'workout', exerciseBrowser: 'workout', prHistory: 'workout',
  dietAddMeal: 'diet', dietRecipes: 'diet', dietRecipeDetail: 'diet', dietGoals: 'diet', dietTrend: 'diet', dietTDEE: 'diet',
  calendar: 'stats',
};

// ── INIT ──────────────────────────────────────────────────────────────────
async function init() {
  injectAuthStyles();
  // If not signed in, show auth screen
  if (!getAccessToken()) {
    renderAuth();
    return;
  }
  setSyncStatus('pending');
  await cloudPull();
  const stored = LS.get('hvi_habits', null);
  habits = stored || DEFAULT_HABITS;
  if (!stored) LS.set('hvi_habits', habits);

  log = LS.get('hvi_log', {});
  habits.forEach(h => { if (!log[h.id]) log[h.id] = { streak: 0, lastCompletedDate: '', completedToday: false }; });

  journal = LS.get('hvi_journal3', {});
  meta = LS.get('hvi_meta', { lastOpenedDate: '', quoteIndex: 0, totalPerfectDays: 0 });
  workoutLog = LS.get('hvi_workout_log', {});
  workoutMeta = LS.get('hvi_workout_meta', { activeProgram: 'ppl', currentDayIndex: 0, lastWorkoutDate: '' });
  mealLog = LS.get('hvi_meal_log', {});
  dietMeta = LS.get('hvi_diet_meta', { dailyGoals: { calories: 2500, protein: 180, carbs: 280, fat: 80 } });
  weightLog = LS.get('hvi_weight_log', {});
  if (!dietMeta.goalType) dietMeta.goalType = 'maintain';
  tdeeProfile = LS.get('hvi_tdee_profile', null);
  prs = LS.get('hvi_prs', {});
  wgerCache = LS.get('hvi_wger_cache', {});
  gamification = LS.get('hvi_gamification', { xp: 0, pillarXP: {}, journalXPDate: '', weeklyStats: { weekKey: '', workoutDays: [], journalDays: [], proteinDays: [] } });
  achievements = LS.get('hvi_achievements', []);
  settings = LS.get('hvi_settings', { units: 'metric' });
  calTasks = LS.get('hvi_cal_tasks', {});
  sleepLog = LS.get('hvi_sleep_log', {});

  applyTheme();
  injectAdaptiveStyles();
  injectExerciseBrowserStyles();
  injectGamificationStyles();
  injectOnboardingStyles();
  checkReset();
  // Initial sync status
  setSyncStatus('ok');
  // Push once on load so new devices register themselves
  cloudPush();

  if (!LS.get('hvi_onboarded', false)) {
    renderOnboarding(0);
  } else {
    (() => {
      const validViews = ['home','pillar','habits','habitCreate','stats','workout','workoutPicker','workoutActive','workoutHistory','workoutBuilder','exerciseBrowser','diet','dietAddMeal','dietRecipes','dietRecipeDetail','dietGoals','dietTrend','dietTDEE','library','calendar','sleep'];
      const hash = location.hash.replace(/^#/, '');
      const view = validViews.includes(hash) ? hash : 'home';
      go(view, {}, false);
    })();
  }
}

function checkReset() {
  const t = today();
  if (meta.lastOpenedDate === t) return;
  const allDone = habits.every(h => log[h.id]?.completedToday);
  if (allDone && meta.lastOpenedDate) meta.totalPerfectDays = (meta.totalPerfectDays || 0) + 1;
  habits.forEach(h => {
    const e = log[h.id];
    if (e) {
      e.completedToday = false;
      if (e.streak > 0 && e.lastCompletedDate !== yesterday()) {
        e.streak = 0;
      }
    }
  });

  // Advance workout day only if a workout was completed yesterday
  if (workoutMeta.lastWorkoutDate === yesterday()) {
    const prog = findProgram(workoutMeta.activeProgram);
    if (prog) workoutMeta.currentDayIndex = (workoutMeta.currentDayIndex + 1) % prog.days.length;
    LS.set('hvi_workout_meta', workoutMeta);
  }

  meta.lastOpenedDate = t;
  LS.set('hvi_log', log);
  LS.set('hvi_meta', meta);
  maybeAwardStreakShield();
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
function go(view, params = {}, pushState = true) {
  clearInterval(qTimer);
  curView = view;
  curPillar = params.pillar || null;
  curRecipeId = params.recipeId || null;

  if (pushState) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    history.pushState({ view, params }, '', '#' + (view === 'home' ? '' : view));
  }

  const navKey = NAV_PARENT[view] || view;
  document.querySelectorAll('.ni').forEach(el => el.classList.toggle('active', el.dataset.n === navKey));
  const viewEl = document.getElementById('view');
  viewEl.scrollTop = 0;
  viewEl.classList.remove('view-slide-in');
  void viewEl.offsetWidth;
  viewEl.classList.add('view-slide-in');

  const renders = {
    home: renderHome, pillar: renderPillar, habits: renderHabits, habitCreate: renderHabitCreate, stats: renderStats,
    workout: renderWorkout, workoutPicker: renderWorkoutPicker, workoutActive: renderWorkoutActive, workoutHistory: renderWorkoutHistory, workoutBuilder: renderWorkoutBuilder, exerciseBrowser: renderExerciseBrowser, prHistory: renderPRHistory,
    diet: renderDiet, dietAddMeal: renderDietAddMeal, dietRecipes: renderDietRecipes, dietRecipeDetail: renderDietRecipeDetail, dietGoals: renderDietGoals, dietTrend: renderDietTrend, dietTDEE: renderDietTDEE,
    library: renderLibrary,
    sleep: renderSleep,
    calendar: () => { window._statsSubView = 'calendar'; renderStats(); },
  };
  (renders[view] || renderHome)();
}

window.addEventListener('popstate', e => {
  if (e.state && e.state.view) go(e.state.view, e.state.params || {}, false);
});

// ── HABIT HELPERS ─────────────────────────────────────────────────────────
function pillarHabits(pid) { const p = PILLARS.find(x => x.id === pid); return habits.filter(h => p.cats.includes(h.category)); }
function pillarPct(pid) { const ph = pillarHabits(pid); if (!ph.length) return {done:0,total:0,pct:0}; const d = ph.filter(h => log[h.id]?.completedToday).length; return {done:d,total:ph.length,pct:d/ph.length}; }
function totalPct() { const d = habits.filter(h => log[h.id]?.completedToday).length; return {done:d,total:habits.length,pct:habits.length?d/habits.length:0}; }

function habitRowHTML(h, suffix = '', editMode = false) {
  const e = log[h.id] || {}, s = e.streak || 0;
  const streakTxt = s > 0 ? `${s >= 3 ? '\uD83D\uDD25 ' : ''}${s} day streak` : 'Start your streak';
  if (editMode) {
    return `<div class="hi" id="hi${suffix}-${h.id}" style="opacity:0.85">
      <div class="hi-info"><div class="hi-name">${esc(h.name)}</div><div class="hi-streak" id="hs${suffix}-${h.id}">${streakTxt}</div></div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="habit-edit-btn" onclick="event.stopPropagation();openEditHabit('${h.id}')">✎</button>
        <button class="habit-del-btn" onclick="event.stopPropagation();deleteHabit('${h.id}')">&times;</button>
      </div></div>`;
  }
  return `<div class="hi${e.completedToday?' done':''}" id="hi${suffix}-${h.id}" onclick="tapHabit('${h.id}','${suffix}')">
    <div class="hi-info"><div class="hi-name">${esc(h.name)}</div><div class="hi-streak${s>=3?' hot':''}" id="hs${suffix}-${h.id}">${streakTxt}</div></div>
    <div class="hi-check" id="hc${suffix}-${h.id}">\u2713</div></div>`;
}

function tapHabit(id, suffix) {
  const e = log[id], t = today(), y = yesterday();
  const wasFirst = !habits.some(h => h.id !== id && log[h.id]?.completedToday);
  if (!e.completedToday) { e.streak = e.lastCompletedDate === y ? e.streak + 1 : 1; e.lastCompletedDate = t; e.completedToday = true; }
  else { e.completedToday = false; }
  LS.set('hvi_log', log);
  const habit = habits.find(h => h.id === id);
  const pillarId = habit ? PILLARS.find(p => p.cats.includes(habit.category))?.id : null;
  if (e.completedToday) {
    navigator.vibrate && navigator.vibrate(10);
    const s = e.streak || 0;
    const bonus = s >= 30 ? 10 : s >= 14 ? 7 : s >= 7 ? 5 : 0;
    awardXP(10 + bonus, pillarId || undefined);
    if (wasFirst) launchConfetti(0.5);
    checkDailyQuests();
  } else {
    // Deduct XP when unchecking — prevents farming
    awardXP(-10, pillarId || undefined);
  }
  const row = document.getElementById(`hi${suffix}-${id}`), chk = document.getElementById(`hc${suffix}-${id}`), stk = document.getElementById(`hs${suffix}-${id}`);
  if (!row) return;
  const s = e.streak || 0;
  row.classList.toggle('done', !!e.completedToday);
  if (stk) { stk.textContent = s > 0 ? `${s>=3?'\uD83D\uDD25 ':''}${s} day streak` : 'Start your streak'; stk.className = `hi-streak${s>=3?' hot':''}`; }
  if (chk) { chk.classList.remove('pop'); void chk.offsetWidth; chk.classList.add('pop'); }
  if (curView === 'pillar') refreshPillarRing();
}

function refreshPillarRing() {
  const {done,total,pct} = pillarPct(curPillar);
  const r = document.querySelector('.pd-ring');
  if (r) r.innerHTML = ring(32,pct,3.5) + `<div class="pd-pct">${Math.round(pct*100)}%</div>`;
  const l = document.querySelector('.pd-lbl');
  if (l) l.textContent = `Habits \u00B7 ${done}/${total}`;
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: HOME
// ══════════════════════════════════════════════════════════════════════════
function renderHome() {
  const {done, total, pct} = totalPct();
  const homeLvl = getLevel(gamification.xp || 0);
  const { lvl, progress, needed } = xpToNextLevel(gamification.xp || 0);
  const xpPct = needed > 0 ? (progress / needed * 100).toFixed(1) : 100;
  const score = computeDailyScore();
  const scoreColor = score >= 80 ? 'var(--accent-b)' : score >= 50 ? 'var(--carb)' : 'var(--fat)';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Pillar strip
  const pillarStrip = PILLARS.map(p => {
    const pr = pillarPct(p.id);
    const ms = Math.max(0, ...pillarHabits(p.id).map(h => log[h.id]?.streak || 0));
    const active = pr.done > 0 ? ' hm-pc-active' : '';
    return `<div class="hm-pc${active}" onclick="go('pillar',{pillar:'${p.id}'})">
      <div class="hm-pc-ring">${ring(23, pr.pct, 2.5)}<div class="hm-pc-icon">${p.icon}</div></div>
      <div class="hm-pc-name">${p.name}</div>
      ${ms > 0 ? `<div class="hm-pc-streak">${ms}d</div>` : ''}
    </div>`;
  }).join('');

  // Workout card
  const wProg = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const wDay = wProg.days[workoutMeta.currentDayIndex % wProg.days.length];
  const wLogged = !!workoutLog[today()];

  // Sleep data
  const slp = sleepLog[today()] || {};
  const slpHours = slp.hours || 0;
  const slpQuality = slp.quality || 0;

  // Time since last workout
  const _lastWD = workoutMeta.lastWorkoutDate;
  const _daysSince = _lastWD ? Math.floor((new Date(today() + 'T12:00') - new Date(_lastWD + 'T12:00')) / 86400000) : null;
  const _sinceText = _daysSince === null ? '' : _daysSince === 0 ? 'Today' : _daysSince === 1 ? 'Yesterday' : _daysSince + 'd ago';

  // Streak shields
  const _shields = getStreakShields();

  // Nutrition card
  const dm = getDayMacros();
  const dGoal = dietMeta.dailyGoals.calories;
  const dPct = dGoal ? Math.min(dm.cal / dGoal, 1) : 0;

  // Quests
  const _questDone = new Set((gamification.questsCompleted || {})[today()] || []);
  const quests = getDailyQuests();
  const questHTML = quests.map(q => {
    const qDone = _questDone.has(q.id);
    return `<div class="hm-quest${qDone ? ' hm-quest-done' : ''}">
      <div class="hm-quest-ico">${q.icon}</div>
      <div class="hm-quest-body">
        <div class="hm-quest-lbl">${q.label}</div>
        <div class="hm-quest-xp">+${q.xp} XP</div>
      </div>
      <div class="hm-quest-done-row">
        <div class="hm-quest-cb${qDone ? ' hm-quest-cb-done' : ''}">${qDone ? '✓' : ''}</div>
      </div>
    </div>`;
  }).join('');

  // Challenges
  const challenges = getWeeklyChallenges();
  const chalHTML = challenges.map(c => {
    const cDone = c.current >= c.goal;
    const cPct = Math.min(1, c.current / c.goal);
    return `<div class="hm-chal">
      <div class="hm-chal-head">
        <span class="hm-chal-lbl">${c.icon} ${c.label}</span>
        <span class="hm-chal-ct" style="${cDone ? 'color:var(--accent-b)' : ''}">${c.current}/${c.goal}${cDone ? ' ✓' : ''}</span>
      </div>
      <div class="hm-chal-track"><div class="hm-chal-fill" style="width:${(cPct*100).toFixed(0)}%;${cDone ? 'background:var(--accent-b)' : ''}"></div></div>
    </div>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="hm-hero ani">
      <div class="hm-hero-card" onclick="go('stats')">
        <div class="hm-hero-glow"></div>
        <div class="hm-hero-row">
          <div style="width:64px;height:100px;flex-shrink:0">${buildAvatarSVG(homeLvl)}</div>
          <div class="hm-hero-info">
            <div class="hm-hero-date">${dateStr}</div>
            <div class="hm-hero-name">${greeting()}${userName() ? ', ' + userName() : ''}.</div>
            <div class="hm-hero-greet">${dayName()}</div>
            <div class="hm-hero-lvl">Lv.${homeLvl} · ${getLevelTitle(homeLvl)}</div>
            <div class="hm-xp-row">
              <div class="hm-xp-track"><div class="hm-xp-fill" style="width:${xpPct}%"></div></div>
              <div class="hm-xp-lbl">${progress}/${needed} XP</div>
            </div>
            <div class="hm-score-row">
              <div class="hm-score-badge" style="border-color:${scoreColor}">
                <span class="hm-score-num" style="color:${scoreColor}">${score}</span>
                <span class="hm-score-lbl">score</span>
              </div>
              <div style="flex:1">
                <div class="hm-habits-bar-hdr"><span>Habits</span><span>${done}/${total}</span></div>
                <div class="hm-habits-track"><div class="hm-habits-fill" style="width:${(pct*100).toFixed(0)}%"></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="hm-pillars ani">${pillarStrip}</div>

    <div class="hm-sec ani">
      <div class="hm-sec-title">Today</div>
    </div>
    <div class="hm-cards ani">
      <div class="hm-card${wLogged ? ' hm-card-done' : ''}" onclick="go('workoutActive')">
        ${wLogged ? '<div class="hm-card-glow"></div>' : ''}
        <div class="hm-card-icon">🏋️</div>
        <div class="hm-card-lbl">Workout</div>
        <div class="hm-card-val">${wDay.name}</div>
        <div class="hm-card-sub">${wProg.name}</div>
        <div class="hm-card-status" style="${wLogged ? 'color:var(--accent-b)' : 'color:var(--fg3)'}">${wLogged ? '✓ Done' : '→ Start'}</div>
        ${!wLogged && _sinceText ? `<div style="font-size:9px;color:var(--text-muted);margin-top:4px">Last: ${_sinceText}</div>` : ''}
      </div>
      <div class="hm-card" onclick="go('diet')">
        <div class="hm-card-icon">🥗</div>
        <div class="hm-card-lbl">Nutrition</div>
        <div class="hm-card-val">${dm.cal.toLocaleString()} cal</div>
        <div class="hm-card-sub">${dGoal.toLocaleString()} goal</div>
        <div class="hm-card-bar"><div class="hm-card-fill" style="width:${(dPct*100).toFixed(0)}%;background:var(--cal)"></div></div>
        <div class="hm-card-status" style="color:var(--fg3)">${dm.p}p · ${dm.c}c · ${dm.f}f</div>
      </div>
      <div class="hm-card" onclick="go('sleep')" style="grid-column:1/-1">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="hm-card-icon" style="margin:0">😴</div>
          <div style="flex:1">
            <div class="hm-card-lbl">Sleep</div>
            <div style="font-size:14px;color:var(--text)">${slpHours ? slpHours + 'h' : 'Not logged'}${slpQuality ? ' · Quality ' + slpQuality + '/5' : ''}</div>
          </div>
          ${_shields > 0 ? `<div style="font-size:10px;color:var(--accent);background:rgba(154,130,86,.12);padding:4px 8px;border-radius:100px;border:1px solid rgba(154,130,86,.2)">🛡️ ${_shields} shield${_shields>1?'s':''}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="hm-sec ani">
      <div class="hm-sec-title">⚡ Daily Quests</div>
    </div>
    <div class="hm-quest-list ani" id="quest-section">${questHTML}</div>

    <div class="hm-sec ani">
      <div class="hm-sec-title">🏆 Weekly Challenges</div>
    </div>
    <div class="hm-chal-list ani">${chalHTML}</div>

    <!-- Daily quote -->
    <div class="hm-sec ani"><div class="hm-sec-title">💡 Today's Wisdom</div></div>
    <div class="hm-quote ani">
      <div class="hm-quote-text">"${esc(QUOTES[meta.quoteIndex % QUOTES.length].text)}"</div>
      <div class="hm-quote-auth">— ${esc(QUOTES[meta.quoteIndex % QUOTES.length].author)}</div>
    </div>
  `;
}


// ══════════════════════════════════════════════════════════════════════════
// RENDER: PILLAR
// ══════════════════════════════════════════════════════════════════════════
function renderPillar() {
  const p = PILLARS.find(x => x.id === curPillar), ph = pillarHabits(curPillar);
  const {done,total,pct} = pillarPct(curPillar);
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="pd-head ani"><div class="pd-ring">${ring(32,pct,3.5)}<div class="pd-pct">${Math.round(pct*100)}%</div></div>
      <div class="pd-info"><div class="pd-name">${p.name}</div><div class="pd-sep"></div><div class="pd-desc">${p.desc}</div></div></div>
    <div class="sec-lbl pd-lbl">Habits \u00B7 ${done}/${total}</div>
    <div class="ani">${ph.map(h => habitRowHTML(h,'p')).join('')}</div>`;
  requestAnimationFrame(initSwipeGestures);
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: ALL HABITS
// ══════════════════════════════════════════════════════════════════════════
function renderHabits() {
  const groups = PILLARS.map(p => {
    const ph = pillarHabits(p.id);
    if (!ph.length) return '';
    const rows = ph.map(h => habitRowHTML(h, 'a', _habitEditMode)).join('');
    return `<div class="sec-lbl" style="padding-top:20px">${p.name}</div>${rows}`;
  }).join('');
  document.getElementById('view').innerHTML = `
    <div class="ah-head ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="ah-title">All Habits</div><div class="ah-sub">Reflect on your day. Recalibrate for tomorrow.</div></div>
      <div style="display:flex;gap:8px">
        ${!_habitEditMode ? `<button class="w-action-btn" style="margin:0;padding:10px 16px;font-size:13px;width:auto" onclick="_habitEditMode=true;renderHabits()">Edit</button>` : `<button class="w-action-btn" style="margin:0;padding:10px 16px;font-size:13px;width:auto;background:var(--accent)" onclick="_habitEditMode=false;renderHabits()">Done</button>`}
        ${!_habitEditMode ? `<button class="w-action-btn" style="margin:0;padding:10px 16px;font-size:18px;width:auto;line-height:1" onclick="go('habitCreate')">+</button>` : ''}
      </div>
    </div>
    <div class="ani">${groups}</div>
    <div class="sec-lbl" style="padding-top:20px">90-Day Activity</div>
    ${buildHeatmapHTML()}`;
  if (!_habitEditMode) requestAnimationFrame(initSwipeGestures);
}

function deleteHabit(id) {
  habits = habits.filter(h => h.id !== id);
  delete log[id];
  LS.set('hvi_habits', habits);
  LS.set('hvi_log', log);
  go('habits');
}

function openEditHabit(id) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  const cats = ['mindset','discipline','fitness','health','learning','social','financial'];
  const catBtns = cats.map(c => `<button class="d-type-btn${c===h.category?' active':''}" onclick="document.querySelectorAll('#edit-habit-modal .d-type-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.dataset.val='${c}'" data-val="${c}">${c}</button>`).join('');
  let modal = document.getElementById('edit-habit-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'edit-habit-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closeEditHabit()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Edit Habit</div>
      <input class="d-input" id="edit-habit-name" type="text" value="${esc(h.name)}" placeholder="Habit name" style="margin-bottom:16px">
      <div class="sec-lbl" style="padding:0 0 8px">Category</div>
      <div class="d-type-row" style="flex-wrap:wrap;gap:6px">${catBtns}</div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeEditHabit()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="saveEditHabit('${id}')">Save</button>
      </div>
    </div>`;
  modal.style.display = 'block';
}

function closeEditHabit() {
  const m = document.getElementById('edit-habit-modal');
  if (m) m.style.display = 'none';
}

function saveEditHabit(id) {
  const name = document.getElementById('edit-habit-name')?.value?.trim();
  const catBtn = document.querySelector('#edit-habit-modal .d-type-btn.active');
  const category = catBtn?.dataset?.val || catBtn?.textContent;
  if (!name) return;
  const h = habits.find(x => x.id === id);
  if (!h) return;
  h.name = name;
  if (category) h.category = category;
  LS.set('hvi_habits', habits);
  closeEditHabit();
  renderHabits();
}

function renderHabitCreate() {
  const cats = ['mindset','discipline','fitness','health','learning','social','financial'];
  const catBtns = cats.map(c => `<button class="d-type-btn${c===curHabitCat?' active':''}" onclick="curHabitCat='${c}';go('habitCreate')">${c}</button>`).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('habits')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">New Habit</div><div class="page-sub">Build your own daily practice.</div></div>
    <div style="padding:0 24px" class="ani">
      <div class="d-goals-row"><div class="d-goals-label">Name</div><input class="d-input" type="text" id="hc-name" placeholder="e.g. Cold plunge 5 min" style="flex:1"></div>
      <div class="sec-lbl" style="padding:16px 0 8px">Category</div>
      <div class="d-type-btns" style="padding:0 0 16px">${catBtns}</div>
      <div style="display:flex;gap:8px">
        <button class="w-finish" style="flex:1" onclick="saveHabit()">SAVE</button>
        <button class="w-action-btn" style="flex:1;margin:16px 0 24px" onclick="go('habits')">CANCEL</button>
      </div>
    </div>`;
}

function saveHabit() {
  const name = document.getElementById('hc-name')?.value?.trim();
  if (!name) return;
  const id = 'cu_' + Date.now();
  habits.push({ id, name, category: curHabitCat });
  log[id] = { streak: 0, lastCompletedDate: '', completedToday: false };
  LS.set('hvi_habits', habits);
  LS.set('hvi_log', log);
  go('habits');
}

// ── START ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
