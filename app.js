// ══════════════════════════════════════════════════════════════════════════
// Arete — Application Logic
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
let tdeeProfile;
let wgerCache = {};
let wgerSearchCache = {};
let prs;
let browserContext = null;
let pendingExercise = null;
let browserState = { category: null, equipment: null, search: '', results: [], nextUrl: null, loading: false, expanded: null };
let _habitEditMode = false;
let _habitsTab = 'habits';
let _routineEditMode = false;
let _parsedMealItems = [];   // staging area for describe-meal results
let browserSearchDebounce = null;
let builderSearchDebounce = null;
let builderSearchResults = [];
let builderSearchLoading = false;
let gamification, achievements;
let settings;
let routines, routineLog;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = '';
let calView = 'monthly'; // 'monthly' | 'weekly' | 'daily'
let calTasks = {};
let sleepLog;
let restTimer = null, restTimerEnd = 0, restTimerDur = 90;

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
const SYNC_KEYS = ['hvi_habits','hvi_log','hvi_journal3','hvi_meta','hvi_workout_log','hvi_workout_meta','hvi_meal_log','hvi_diet_meta','hvi_weight_log','hvi_prs','hvi_gamification','hvi_achievements','hvi_tdee_profile','hvi_custom_programs','hvi_onboarded','hvi_sleep_log','hvi_settings','hvi_habit_history','hvi_meal_favorites','hvi_progress_photos','hvi_routines','hvi_routine_log'];
// Keys that are date-keyed objects — these get merged instead of overwritten
const MERGE_KEYS = ['hvi_workout_log','hvi_meal_log','hvi_journal3','hvi_weight_log','hvi_sleep_log','hvi_habit_history'];

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
  // Push data to cloud BEFORE signing out so nothing is lost
  if (token) {
    try { await cloudPush(); } catch {}
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
  if (!navigator.onLine && state === 'offline') state = 'away';
  el.className = 'sync-' + state;
  if (state === 'ok') el.title = 'Synced ' + new Date().toLocaleTimeString();
  else if (state === 'away') el.title = 'Offline — changes saved locally';
  else if (state === 'offline') el.title = 'Sync pending — will retry';
  else if (state === 'pending') el.title = 'Syncing…';
}

function _syncToast(msg) {
  // Silent — only log to console for debugging
  console.log('[sync]', msg);
}

function authHeaders(extra = {}) {
  const token = getAccessToken();
  return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

// Proactively refresh token if it expires within 5 minutes
async function _ensureFreshToken() {
  const session = getSession();
  if (!session?.access_token) return;
  try {
    // Decode JWT expiry (payload is base64url, second segment)
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const expiresAt = payload.exp * 1000;
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      console.log('[sync] token expiring soon, refreshing...');
      await authRefresh();
    }
  } catch {}
}

async function cloudPush() {
  const uid = getCurrentUserId();
  if (!uid) return;
  if (!navigator.onLine) { setSyncStatus('away'); return; }
  // Ensure token is fresh before any request
  await _ensureFreshToken();
  // Pull first so we merge before overwriting cloud
  try {
    const pullRes = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data?user_id=eq.${uid}&select=data`, { headers: authHeaders() });
    if (pullRes.ok) {
      const rows = await pullRes.json();
      if (rows.length) {
        const cloud = rows[0].data || {};
        MERGE_KEYS.forEach(k => {
          if (cloud[k]) {
            try {
              const local = JSON.parse(localStorage.getItem(k) || '{}');
              const merged = { ...cloud[k], ...local };
              localStorage.setItem(k, JSON.stringify(merged));
            } catch {}
          }
        });
      }
    }
  } catch {}
  const data = {};
  SYNC_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) { try { data[k] = JSON.parse(v); } catch {} } });
  setSyncStatus('pending');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data`, {
      method: 'POST',
      headers: authHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ user_id: uid, data, updated_at: new Date().toISOString() })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[sync] push failed:', res.status, errText);
      _syncToast('⚠️ Sync failed: ' + res.status);
      if (res.status === 401) { const ok = await authRefresh(); if (ok) return cloudPush(); }
      setSyncStatus('offline');
    } else {
      console.log('[sync] push OK, keys:', Object.keys(data).length);
      _syncToast('✓ Synced to cloud');
      setSyncStatus('ok');
    }
  } catch(e) { console.warn('[sync] push error:', e); setSyncStatus('offline'); _scheduleRetry(); }
}

let _retryTimer = null, _retryDelay = 5000;
function _scheduleRetry() {
  if (_retryTimer) return;
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    if (!navigator.onLine || !getAccessToken()) return;
    await cloudPush();
    if (document.getElementById('sync-dot')?.className === 'sync-ok') _retryDelay = 5000;
    else { _retryDelay = Math.min(_retryDelay * 2, 60000); _scheduleRetry(); }
  }, _retryDelay);
}

async function cloudPull() {
  const uid = getCurrentUserId();
  if (!uid) return false;
  await _ensureFreshToken();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data?user_id=eq.${uid}&select=data`, {
      headers: authHeaders()
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[sync] pull failed:', res.status, errText);
      _syncToast('⚠️ Pull failed: ' + res.status);
      if (res.status === 401) { const ok = await authRefresh(); if (ok) return cloudPull(); }
      return false;
    }
    const rows = await res.json();
    console.log('[sync] pull got', rows.length, 'rows');
    if (!rows.length) { _syncToast('☁️ No cloud data yet'); return false; }
    const cloud = rows[0].data || {};
    console.log('[sync] cloud keys:', Object.keys(cloud).join(', '));
    _syncToast('✓ Pulled ' + Object.keys(cloud).length + ' keys from cloud');
    SYNC_KEYS.forEach(k => {
      if (cloud[k] === undefined) return;
      if (MERGE_KEYS.includes(k)) {
        try {
          const local = JSON.parse(localStorage.getItem(k) || '{}');
          const merged = { ...local, ...cloud[k] };
          localStorage.setItem(k, JSON.stringify(merged));
        } catch { localStorage.setItem(k, JSON.stringify(cloud[k])); }
      } else {
        localStorage.setItem(k, JSON.stringify(cloud[k]));
      }
    });
    return true;
  } catch(e) { console.warn('[sync] pull error:', e); return false; }
}

function schedulePush() {
  clearTimeout(_syncDebounce);
  _syncDebounce = setTimeout(cloudPush, 2500);
}

async function forceSync() {
  const logEl = document.getElementById('sync-log');
  const btn = document.getElementById('force-sync-btn');
  const _log = (msg) => { console.log(msg); if (logEl) logEl.textContent += msg + '\n'; };
  if (btn) btn.disabled = true;
  if (logEl) logEl.textContent = '';
  _log('[sync] Starting force sync...');
  _log('[sync] User ID: ' + (getCurrentUserId() || 'NONE'));
  _log('[sync] Token: ' + (getAccessToken() ? getAccessToken().substring(0, 20) + '...' : 'NONE'));
  await _ensureFreshToken();
  _log('[sync] Token after refresh check: ' + (getAccessToken() ? 'OK' : 'NONE'));
  // Pull
  _log('[sync] Pulling from cloud...');
  const pulled = await cloudPull();
  _log('[sync] Pull result: ' + (pulled ? 'got data' : 'no data / failed'));
  // Push
  _log('[sync] Pushing to cloud...');
  await cloudPush();
  _log('[sync] Push done. Check sync dot color.');
  // Reload in-memory state
  habits = LS.get('hvi_habits', habits);
  log = LS.get('hvi_log', log);
  journal = LS.get('hvi_journal3', journal);
  workoutLog = LS.get('hvi_workout_log', workoutLog);
  workoutMeta = LS.get('hvi_workout_meta', workoutMeta);
  mealLog = LS.get('hvi_meal_log', mealLog);
  dietMeta = LS.get('hvi_diet_meta', dietMeta);
  _log('[sync] Done! Reloading view...');
  if (btn) btn.disabled = false;
  go(curView, {}, false);
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
    .auth-title{font-family:var(--display);font-size:30px;color:var(--text);text-align:center;margin-bottom:8px;line-height:1.2;letter-spacing:0.5px}
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
        <g transform="translate(60,60)" fill="none" stroke="#c4a96c" stroke-width="1.5" stroke-linecap="round">
          <path d="M-4,32 Q-8,16 -7,0 Q-8,-16 -4,-32" stroke-width="1.5" opacity="0.3"/>
          <ellipse cx="-16" cy="24" rx="8" ry="3.5" transform="rotate(-25,-16,24)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="-20" cy="14" rx="9" ry="3.5" transform="rotate(-15,-20,14)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="-22" cy="4" rx="9" ry="3.5" transform="rotate(-5,-22,4)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="-21" cy="-7" rx="9" ry="3.5" transform="rotate(8,-21,-7)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="-18" cy="-17" rx="8" ry="3.5" transform="rotate(18,-18,-17)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="-14" cy="-26" rx="7" ry="3.5" transform="rotate(30,-14,-26)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <path d="M4,32 Q8,16 7,0 Q8,-16 4,-32" stroke-width="1.5" opacity="0.3"/>
          <ellipse cx="16" cy="24" rx="8" ry="3.5" transform="rotate(25,16,24)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="20" cy="14" rx="9" ry="3.5" transform="rotate(15,20,14)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="22" cy="4" rx="9" ry="3.5" transform="rotate(5,22,4)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="21" cy="-7" rx="9" ry="3.5" transform="rotate(-8,21,-7)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="18" cy="-17" rx="8" ry="3.5" transform="rotate(-18,18,-17)" fill="#c4a96c" stroke="none" opacity="0.85"/>
          <ellipse cx="14" cy="-26" rx="7" ry="3.5" transform="rotate(-30,14,-26)" fill="#c4a96c" stroke="none" opacity="0.85"/>
        </g>
        <text x="60" y="68" text-anchor="middle" font-family="Georgia,serif" font-weight="600" font-size="36" fill="#e4dace">A</text>
      </svg>
      <div style="font-size:13px;letter-spacing:.25em;color:var(--accent-b);margin-top:8px;font-weight:600">ARETE</div>
    </div>
    <div class="auth-title">${isSignIn ? 'Welcome back.' : 'Begin the path to excellence.'}</div>
    <div class="auth-sub">${isSignIn ? 'Sign in to continue your pursuit of arete.' : 'Create your account and pursue daily excellence.'}</div>
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
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${sw + 1}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" stroke-linecap="round"
      style="--ring-c:${c.toFixed(2)};--ring-off:${off.toFixed(2)}"/>
  </svg>`;
}

// ── SKELETON LOADING ──────────────────────────────────────────────────────
function showSkeleton(type = 'home') {
  const view = document.getElementById('view');
  if (!view) return;
  const skels = {
    home: `<div class="skel-bar skeleton" style="width:40%;margin-top:48px"></div>
      <div class="skel-bar skeleton" style="width:70%;height:36px;margin-top:4px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:24px 16px">
        <div class="skel-card skeleton"></div><div class="skel-card skeleton"></div>
        <div class="skel-card skeleton"></div><div class="skel-card skeleton"></div>
      </div>`,
    list: Array.from({length:6}, () => `<div class="skel-row skeleton"></div>`).join(''),
  };
  view.innerHTML = skels[type] || skels.home;
}

// ── UNDO TOAST ───────────────────────────────────────────────────────────
let _undoTimer = null;
function showUndo(msg, undoFn) {
  clearTimeout(_undoTimer);
  document.getElementById('undo-toast-el')?.remove();
  const el = document.createElement('div');
  el.id = 'undo-toast-el';
  el.className = 'undo-toast';
  el.innerHTML = `<div class="undo-toast-text">${msg}</div><button class="undo-toast-btn" id="undo-btn">UNDO</button>`;
  document.body.appendChild(el);
  document.getElementById('undo-btn').onclick = () => { undoFn(); el.remove(); clearTimeout(_undoTimer); };
  _undoTimer = setTimeout(() => el.remove(), 5000);
}

// ── QUICK-LOG FAB ────────────────────────────────────────────────────────
let _fabOpen = false;
function toggleQuickLog() {
  _fabOpen = !_fabOpen;
  const fab = document.getElementById('quick-log-fab');
  if (fab) fab.classList.toggle('open', _fabOpen);
  const existing = document.getElementById('quick-log-menu');
  if (existing) { existing.remove(); _fabOpen = false; fab?.classList.remove('open'); return; }
  if (!_fabOpen) return;
  const menu = document.createElement('div');
  menu.id = 'quick-log-menu';
  menu.className = 'quick-log-menu';
  menu.innerHTML = `
    <div class="quick-log-item" onclick="closeQuickLog();go('dietAddMeal')">🍽️ Log Meal</div>
    <div class="quick-log-item" onclick="closeQuickLog();go('workoutActive')">💪 Start Workout</div>
    <div class="quick-log-item" onclick="closeQuickLog();go('library')">📝 Journal</div>
    <div class="quick-log-item" onclick="closeQuickLog();go('sleep')">🌙 Log Sleep</div>`;
  document.body.appendChild(menu);
}
function closeQuickLog() {
  _fabOpen = false;
  document.getElementById('quick-log-menu')?.remove();
  document.getElementById('quick-log-fab')?.classList.remove('open');
}

// ── EVENING REMINDER ─────────────────────────────────────────────────────
function getEveningReminder() {
  const hour = new Date().getHours();
  if (hour < 20 || hour >= 24) return '';
  if (LS.get('hvi_evening_dismissed_' + today(), false)) return '';
  const {done, total} = totalPct();
  const left = total - done;
  if (left <= 0) return '';
  return `<div class="evening-banner ani">
    <div style="font-size:24px">🌙</div>
    <div class="evening-banner-text"><strong>${left} habit${left>1?'s':''} left today</strong> — still time to show up.</div>
    <button class="evening-banner-close" onclick="LS.set('hvi_evening_dismissed_${today()}',true);this.closest('.evening-banner').remove()">✕</button>
  </div>`;
}

// ── PULL TO REFRESH ──────────────────────────────────────────────────────
function initPullToRefresh() {
  const view = document.getElementById('view');
  if (!view) return;
  let startY = 0, pulling = false;
  view.addEventListener('touchstart', e => {
    if (view.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  view.addEventListener('touchmove', e => {
    if (!pulling) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 80 && view.scrollTop <= 0) {
      pulling = false;
      const ind = document.createElement('div');
      ind.className = 'ptr-indicator';
      ind.textContent = 'Syncing…';
      view.prepend(ind);
      cloudPull().then(() => {
        ind.textContent = 'Updated ✓';
        setTimeout(() => { ind.remove(); go(curView, {}, false); }, 800);
      });
    }
  }, { passive: true });
  view.addEventListener('touchend', () => { pulling = false; }, { passive: true });
}

// ── OFFLINE INDICATOR ────────────────────────────────────────────────────
function _updateOnlineStatus() {
  let el = document.getElementById('offline-banner');
  if (!navigator.onLine) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-banner';
      el.className = 'offline-banner';
      el.innerHTML = '📡 You\'re offline — changes will sync when you reconnect.';
      document.body.prepend(el);
    }
  } else if (el) {
    el.textContent = '✓ Back online';
    setTimeout(() => el.remove(), 1500);
  }
}
window.addEventListener('online', () => { _updateOnlineStatus(); if (getAccessToken()) { _retryDelay = 5000; cloudPush(); } });
window.addEventListener('offline', _updateOnlineStatus);

// ── NOTIFICATIONS ───────────────────────────────────────────────────────
function requestNotifications() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(p => {
    settings.notifications = p === 'granted';
    LS.set('hvi_settings', settings);
    renderStats();
  });
}
function _scheduleReminder() {
  if (!settings.notifications || Notification.permission !== 'granted') return;
  const now = new Date();
  const hour = now.getHours();
  // Check at 8pm-9pm if habits remain
  if (hour >= 20 && hour < 21 && !LS.get('hvi_notif_sent_' + today(), false)) {
    const {done, total} = totalPct();
    const left = total - done;
    if (left > 0) {
      new Notification('Arete', { body: `${left} habit${left>1?'s':''} left today — still time to show up.`, icon: '/arete/manifest.json' });
      LS.set('hvi_notif_sent_' + today(), true);
    }
  }
}

// ── SOUND EFFECTS ────────────────────────────────────────────────────────
const _audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;
function playSound(type) {
  if (!_audioCtx || (settings || {}).sounds === false) return;
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  const osc = _audioCtx.createOscillator();
  const gain = _audioCtx.createGain();
  osc.connect(gain); gain.connect(_audioCtx.destination);
  gain.gain.value = 0.08;
  if (type === 'check') {
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.15);
    osc.start(); osc.stop(_audioCtx.currentTime + 0.15);
  } else if (type === 'levelup') {
    osc.frequency.value = 523; osc.type = 'sine';
    osc.frequency.setValueAtTime(523, _audioCtx.currentTime);
    osc.frequency.setValueAtTime(659, _audioCtx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, _audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.1, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.4);
    osc.start(); osc.stop(_audioCtx.currentTime + 0.4);
  } else if (type === 'complete') {
    osc.frequency.value = 660; osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, _audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, _audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.1, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.2);
    osc.start(); osc.stop(_audioCtx.currentTime + 0.2);
  }
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
  calendar: 'stats', progressPhotos: 'stats',
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
  routines = LS.get('hvi_routines', {
    morning: ['Make bed', 'Hydrate (big glass of water)', 'Stretch / mobility (5 min)', 'Cold shower', 'Meditate (10 min)', 'Review today\'s goals'],
    night: ['Screen off 30 min before bed', 'Journal / reflect on the day', 'Prepare tomorrow\'s clothes', 'Gratitude (3 things)', 'Lights out by 22:30']
  });
  routineLog = LS.get('hvi_routine_log', {});

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

  // Re-sync when user returns to the app (tab becomes visible again)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && getAccessToken()) {
      setSyncStatus('pending');
      const pulled = await cloudPull();
      if (pulled) {
        // Reload all in-memory state from localStorage with fresh cloud data
        habits = LS.get('hvi_habits', habits);
        log = LS.get('hvi_log', log);
        habits.forEach(h => { if (!log[h.id]) log[h.id] = { streak: 0, lastCompletedDate: '', completedToday: false }; });
        journal = LS.get('hvi_journal3', journal);
        meta = LS.get('hvi_meta', meta);
        workoutLog = LS.get('hvi_workout_log', workoutLog);
        workoutMeta = LS.get('hvi_workout_meta', workoutMeta);
        mealLog = LS.get('hvi_meal_log', mealLog);
        dietMeta = LS.get('hvi_diet_meta', dietMeta);
        weightLog = LS.get('hvi_weight_log', weightLog);
        sleepLog = LS.get('hvi_sleep_log', sleepLog);
        prs = LS.get('hvi_prs', prs);
        gamification = LS.get('hvi_gamification', gamification);
        achievements = LS.get('hvi_achievements', achievements);
        settings = LS.get('hvi_settings', settings);
        // Push merged state back so cloud has everything from both devices
        cloudPush();
        // Re-render current view
        go(curView, {}, false);
      }
      setSyncStatus('ok');
    }
  });

  // Quick-log FAB removed — actions accessible from nav tabs and home cards
  initPullToRefresh();
  _updateOnlineStatus();
  _scheduleReminder();

  if (!LS.get('hvi_onboarded', false)) {
    renderOnboarding(0);
  } else {
    (() => {
      const validViews = ['home','pillar','habits','habitCreate','stats','progressPhotos','workout','workoutPicker','workoutActive','workoutHistory','workoutBuilder','exerciseBrowser','diet','dietAddMeal','dietRecipes','dietRecipeDetail','dietGoals','dietTrend','dietTDEE','library','calendar','sleep'];
      const hash = location.hash.replace(/^#/, '');
      const view = validViews.includes(hash) ? hash : 'home';
      go(view, {}, false);
      // Show weekly recap on Monday (or Sunday afternoon)
      setTimeout(() => checkWeeklyRecap(), 600);
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
      // Record completion in history for weekly scheduling
      if (e.completedToday && meta.lastOpenedDate) {
        const hist = LS.get('hvi_habit_history') || {};
        if (!hist[h.id]) hist[h.id] = [];
        hist[h.id].push(meta.lastOpenedDate);
        if (hist[h.id].length > 60) hist[h.id] = hist[h.id].slice(-60);
        LS.set('hvi_habit_history', hist);
      }
      e.completedToday = false;
      // Only break streak if habit was due yesterday
      if (e.streak > 0 && e.lastCompletedDate !== yesterday()) {
        const wasDueYesterday = !h.schedule || h.schedule === 'daily' ||
          (h.schedule === 'specific' && (h.days || [0,1,2,3,4,5,6]).includes(new Date(yesterday()).getDay()));
        if (wasDueYesterday) e.streak = 0;
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
  closeQuickLog();
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
    sleep: renderSleep, progressPhotos: renderProgressPhotos,
    calendar: () => { window._statsSubView = 'calendar'; renderStats(); },
  };
  (renders[view] || renderHome)();
}

window.addEventListener('popstate', e => {
  if (e.state && e.state.view) go(e.state.view, e.state.params || {}, false);
});

// ── HABIT HELPERS ─────────────────────────────────────────────────────────
function pillarHabits(pid) { const p = PILLARS.find(x => x.id === pid); return habits.filter(h => p.cats.includes(h.category)); }
function isHabitDueToday(h) {
  if (!h.schedule || h.schedule === 'daily') return true;
  const dow = new Date().getDay(); // 0=Sun
  if (h.schedule === 'specific') return (h.days || [0,1,2,3,4,5,6]).includes(dow);
  if (h.schedule === 'weekly') {
    // Due if completed < perWeek this calendar week
    const perWeek = h.perWeek || 7;
    const now = new Date(), start = new Date(now); start.setDate(now.getDate() - now.getDay());
    let count = 0;
    for (let d = new Date(start); d <= now; d.setDate(d.getDate()+1)) {
      const key = d.toISOString().slice(0,10);
      if (key === today() && log[h.id]?.completedToday) count++;
      else if (key !== today()) { /* check history */ const hist = LS.get('hvi_habit_history') || {}; if (hist[h.id]?.includes(key)) count++; }
    }
    return count < perWeek;
  }
  return true;
}
function pillarPct(pid) { const ph = pillarHabits(pid).filter(isHabitDueToday); if (!ph.length) return {done:0,total:0,pct:0}; const d = ph.filter(h => log[h.id]?.completedToday).length; return {done:d,total:ph.length,pct:d/ph.length}; }
function totalPct() { const d = habits.filter(h => log[h.id]?.completedToday).length; return {done:d,total:habits.length,pct:habits.length?d/habits.length:0}; }

function habitRowHTML(h, suffix = '', editMode = false) {
  const e = log[h.id] || {}, s = e.streak || 0;
  const due = isHabitDueToday(h);
  const streakTxt = s > 0 ? `${s >= 3 ? '\uD83D\uDD25 ' : ''}${s} day streak` : 'Start your streak';
  if (!due && !editMode) {
    return `<div class="hi rest-day" id="hi${suffix}-${h.id}" style="opacity:0.4;pointer-events:none">
      <div class="hi-info"><div class="hi-name">${esc(h.name)}</div><div class="hi-streak">Rest day</div></div>
      <div class="hi-check" aria-hidden="true">\u2014</div></div>`;
  }
  if (editMode) {
    const idx = habits.indexOf(h);
    return `<div class="hi" id="hi${suffix}-${h.id}" style="opacity:0.85">
      <div class="hi-info"><div class="hi-name">${esc(h.name)}</div><div class="hi-streak" id="hs${suffix}-${h.id}">${streakTxt}</div></div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
        <button class="habit-move-btn" onclick="event.stopPropagation();moveHabit('${h.id}',-1)" ${idx===0?'disabled':''}>▲</button>
        <button class="habit-move-btn" onclick="event.stopPropagation();moveHabit('${h.id}',1)" ${idx===habits.length-1?'disabled':''}>▼</button>
        <button class="habit-edit-btn" onclick="event.stopPropagation();openEditHabit('${h.id}')">✎</button>
        <button class="habit-del-btn" onclick="event.stopPropagation();deleteHabit('${h.id}')">&times;</button>
      </div></div>`;
  }
  return `<div class="hi${e.completedToday?' done':''}" id="hi${suffix}-${h.id}" onclick="tapHabit('${h.id}','${suffix}')" role="checkbox" aria-checked="${!!e.completedToday}" aria-label="${esc(h.name)} \u2014 ${streakTxt}" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tapHabit('${h.id}','${suffix}')}">
    <div class="hi-info"><div class="hi-name">${esc(h.name)}</div><div class="hi-streak${s>=3?' hot':''}" id="hs${suffix}-${h.id}">${streakTxt}</div></div>
    <div class="hi-check" id="hc${suffix}-${h.id}" aria-hidden="true">\u2713</div></div>`;
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
    playSound('check');
    const s = e.streak || 0;
    const bonus = s >= 30 ? 10 : s >= 14 ? 7 : s >= 7 ? 5 : 0;
    awardXP(10 + bonus, pillarId || undefined);
    if (wasFirst) launchConfetti(0.5);
    // Streak milestone celebrations
    if ([7, 14, 30, 60, 100].includes(s)) {
      launchConfetti(1.5);
      haptic([50, 30, 50, 30, 80]);
      const el = document.createElement('div');
      el.className = 'streak-toast';
      el.innerHTML = `🔥 ${s}-day streak!`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    } else {
      haptic(10);
    }
    checkDailyQuests();
  } else {
    // Deduct XP when unchecking — prevents farming
    awardXP(-10, pillarId || undefined);
  }
  const row = document.getElementById(`hi${suffix}-${id}`), chk = document.getElementById(`hc${suffix}-${id}`), stk = document.getElementById(`hs${suffix}-${id}`);
  if (!row) return;
  const s = e.streak || 0;
  row.classList.toggle('done', !!e.completedToday);
  row.setAttribute('aria-checked', !!e.completedToday);
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

  // Overall streak — consecutive days with at least 1 habit done
  const _overallStreak = (() => {
    let streak = 0, d = new Date();
    // Check today first
    if (habits.some(h => log[h.id]?.completedToday)) streak++;
    else return 0;
    // Check backwards
    for (let i = 1; i < 365; i++) {
      d.setDate(d.getDate() - 1);
      const key = d.toISOString().slice(0, 10);
      const hist = LS.get('hvi_habit_history', {});
      const anyDone = Object.values(hist).some(arr => arr.includes(key));
      if (anyDone) streak++; else break;
    }
    return streak;
  })();

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
            <div class="hm-hero-lvl">Lv.${homeLvl} · ${getLevelTitle(homeLvl)}</div>
            <div class="hm-score-row" style="margin-top:10px">
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

    ${_overallStreak >= 2 ? `<div class="hm-streak-banner ani">
      <div class="hm-streak-fire">🔥</div>
      <div class="hm-streak-num">${_overallStreak}</div>
      <div class="hm-streak-lbl">day streak</div>
    </div>` : ''}

    <div class="hm-sec ani">
      <div class="hm-sec-title">Today's Labours</div>
    </div>
    <div class="hm-cards ani">
      <div class="hm-card${wLogged ? ' hm-card-done' : ''}" onclick="go('workoutActive')">
        ${wLogged ? '<div class="hm-card-glow"></div>' : ''}
        <div class="hm-card-icon">🏋️</div>
        <div class="hm-card-lbl">Workout</div>
        <div class="hm-card-val">${wDay.name}</div>
        <div class="hm-card-sub">${wProg.name}</div>
        <div class="hm-card-status" style="${wLogged ? 'color:var(--accent-b)' : 'color:var(--fg3)'}">${wLogged ? '✓ Done' : '→ Start'}</div>
      </div>
      <div class="hm-card" onclick="go('diet')">
        <div class="hm-card-icon">🥗</div>
        <div class="hm-card-lbl">Nutrition</div>
        <div class="hm-card-val">${dm.cal.toLocaleString()} cal</div>
        <div class="hm-card-sub">${dGoal.toLocaleString()} goal</div>
        <div class="hm-card-bar"><div class="hm-card-fill" style="width:${(dPct*100).toFixed(0)}%;background:var(--cal)"></div></div>
        <div class="hm-card-status" style="color:var(--fg3)">${dm.p}p · ${dm.c}c · ${dm.f}f</div>
      </div>
    </div>

    <div class="hm-sec ani">
      <div class="hm-sec-title">Daily Quests</div>
    </div>
    <div class="hm-quest-list ani" id="quest-section">${questHTML}</div>
    ${challenges.length ? `<div class="hm-sec ani">
      <div class="hm-sec-title">Weekly Trials</div>
    </div>
    <div class="hm-chal-list ani">${chalHTML}</div>` : ''}

    <!-- Daily quote -->
    <div class="hm-quote ani" style="margin-top:16px">
      <div class="hm-quote-text">"${esc(QUOTES[meta.quoteIndex % QUOTES.length].text)}"</div>
      <div class="hm-quote-auth">— ${esc(QUOTES[meta.quoteIndex % QUOTES.length].author)}</div>
    </div>

    ${getEveningReminder()}
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
  const toggle = `<div class="hab-toggle">
    <button class="hab-toggle-btn${_habitsTab==='habits'?' active':''}" onclick="_habitsTab='habits';renderHabits()">Habits</button>
    <button class="hab-toggle-btn${_habitsTab==='routines'?' active':''}" onclick="_habitsTab='routines';renderHabits()">Routines</button>
  </div>`;

  if (_habitsTab === 'routines') { renderRoutines(toggle); return; }

  const groups = PILLARS.map(p => {
    const ph = pillarHabits(p.id);
    if (!ph.length) return '';
    const rows = ph.map(h => habitRowHTML(h, 'a', _habitEditMode)).join('');
    return `<div class="sec-lbl" style="padding-top:20px">${p.name}</div>${rows}`;
  }).join('');
  document.getElementById('view').innerHTML = `
    ${toggle}
    <div class="ah-head ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="ah-title">All Habits</div><div class="ah-sub">We are what we repeatedly do.</div></div>
      <div style="display:flex;gap:8px;padding-top:8px">
        ${!_habitEditMode ? `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto" onclick="_habitEditMode=true;renderHabits()">Edit</button>` : `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto;background:rgba(154,130,86,0.15);border-color:var(--accent)" onclick="_habitEditMode=false;renderHabits()">Done</button>`}
        ${!_habitEditMode ? `<button class="w-action-btn" style="margin:0;padding:8px 14px;font-size:16px;width:auto;line-height:1" onclick="go('habitCreate')">+</button>` : ''}
      </div>
    </div>
    <div class="ani">${groups}</div>
    <div class="sec-lbl" style="padding-top:20px">90-Day Activity</div>
    ${buildHeatmapHTML()}`;
  if (!_habitEditMode) requestAnimationFrame(initSwipeGestures);
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: ROUTINES
// ══════════════════════════════════════════════════════════════════════════
function getRoutineLogToday() {
  const dk = new Date().toISOString().slice(0, 10);
  if (!routineLog[dk]) routineLog[dk] = {};
  return routineLog[dk];
}

function toggleRoutineItem(period, idx) {
  const today = getRoutineLogToday();
  const key = period + '_' + idx;
  today[key] = !today[key];
  LS.set('hvi_routine_log', routineLog);
  renderHabits();
}

function renderRoutines(toggle) {
  const today = getRoutineLogToday();
  const buildSection = (period, label, icon) => {
    const items = routines[period] || [];
    if (!items.length && !_routineEditMode) return `<div class="sec-lbl" style="padding-top:20px">${icon} ${label}</div><div class="routine-empty">No ${label.toLowerCase()} items yet. Tap Edit to add some.</div>`;
    const rows = items.map((item, i) => {
      const key = period + '_' + i;
      const done = !!today[key];
      return `<div class="habit-row ani">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          ${!_routineEditMode ? `<button class="h-check${done?' checked':''}" onclick="toggleRoutineItem('${period}',${i})">${done ? '✓' : ''}</button>` : ''}
          <span class="h-name" style="${done?'opacity:0.5;text-decoration:line-through':''}">${esc(item)}</span>
        </div>
        ${_routineEditMode ? `<div style="display:flex;gap:4px">
          ${i > 0 ? `<button class="h-edit-btn" onclick="moveRoutineItem('${period}',${i},-1)">↑</button>` : ''}
          ${i < items.length - 1 ? `<button class="h-edit-btn" onclick="moveRoutineItem('${period}',${i},1)">↓</button>` : ''}
          <button class="h-edit-btn" onclick="deleteRoutineItem('${period}',${i})">✕</button>
        </div>` : ''}
      </div>`;
    }).join('');
    return `<div class="sec-lbl" style="padding-top:20px">${icon} ${label}</div>${rows}
      ${_routineEditMode ? `<div style="display:flex;gap:8px;padding:10px 0">
        <input class="d-input" id="add-${period}" placeholder="Add ${label.toLowerCase()} item…" style="flex:1" onkeydown="if(event.key==='Enter')addRoutineItem('${period}')">
        <button class="w-action-btn" style="margin:0;padding:8px 14px;font-size:16px;width:auto;line-height:1" onclick="addRoutineItem('${period}')">+</button>
      </div>` : ''}`;
  };

  const morningItems = routines.morning || [];
  const nightItems = routines.night || [];
  const totalItems = morningItems.length + nightItems.length;
  const doneCount = Object.keys(today).filter(k => today[k]).length;
  const pct = totalItems ? Math.round((doneCount / totalItems) * 100) : 0;

  document.getElementById('view').innerHTML = `
    ${toggle}
    <div class="ah-head ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="ah-title">Routines</div><div class="ah-sub">${totalItems ? `${doneCount}/${totalItems} done today · ${pct}%` : 'Build your daily rituals.'}</div></div>
      <div style="display:flex;gap:8px;padding-top:8px">
        ${!_routineEditMode ? `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto" onclick="_routineEditMode=true;renderHabits()">Edit</button>` : `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto;background:rgba(154,130,86,0.15);border-color:var(--accent)" onclick="_routineEditMode=false;renderHabits()">Done</button>`}
      </div>
    </div>
    <div class="ani">
      ${buildSection('morning', 'Morning Routine', '☀️')}
      ${buildSection('night', 'Night Routine', '🌙')}
    </div>`;
}

function addRoutineItem(period) {
  const input = document.getElementById('add-' + period);
  const name = input?.value?.trim();
  if (!name) return;
  if (!routines[period]) routines[period] = [];
  routines[period].push(name);
  LS.set('hvi_routines', routines);
  renderHabits();
}

function moveRoutineItem(period, idx, dir) {
  const arr = routines[period];
  const ni = idx + dir;
  if (ni < 0 || ni >= arr.length) return;
  [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
  LS.set('hvi_routines', routines);
  renderHabits();
}

function deleteRoutineItem(period, idx) {
  const item = routines[period][idx];
  if (!confirm(`Delete "${item}"?`)) return;
  routines[period].splice(idx, 1);
  LS.set('hvi_routines', routines);
  const dk = new Date().toISOString().slice(0, 10);
  if (routineLog[dk]) {
    const newLog = {};
    Object.keys(routineLog[dk]).forEach(k => {
      const [p, i] = k.split('_');
      if (p === period && parseInt(i) > idx) newLog[p + '_' + (parseInt(i) - 1)] = routineLog[dk][k];
      else if (p !== period || parseInt(i) !== idx) newLog[k] = routineLog[dk][k];
    });
    routineLog[dk] = newLog;
    LS.set('hvi_routine_log', routineLog);
  }
  renderHabits();
}

function moveHabit(id, dir) {
  const idx = habits.findIndex(h => h.id === id);
  if (idx < 0) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= habits.length) return;
  [habits[idx], habits[ni]] = [habits[ni], habits[idx]];
  LS.set('hvi_habits', habits);
  renderHabits();
}

function deleteHabit(id) {
  const h = habits.find(x => x.id === id);
  if (!confirm(`Delete "${h ? h.name : 'this habit'}"? This can't be undone.`)) return;
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
  const catBtns = cats.map(c => `<button class="d-type-btn${c===h.category?' active':''}" onclick="document.querySelectorAll('#edit-habit-modal .cat-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.dataset.val='${c}'" data-val="${c}" class="d-type-btn cat-btn${c===h.category?' active':''}">${c}</button>`).join('');
  const sched = h.schedule || 'daily';
  const dayNames = ['S','M','T','W','T','F','S'];
  const dayBtns = dayNames.map((d,i) => `<button class="sched-day-btn${(!h.days || h.days.includes(i))?' active':''}" data-day="${i}" onclick="this.classList.toggle('active')">${d}</button>`).join('');
  let modal = document.getElementById('edit-habit-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'edit-habit-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closeEditHabit()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Edit Habit</div>
      <input class="d-input" id="edit-habit-name" type="text" value="${esc(h.name)}" placeholder="Habit name" style="margin-bottom:16px">
      <div class="sec-lbl" style="padding:0 0 8px">Category</div>
      <div class="d-type-row" style="flex-wrap:wrap;gap:6px">${catBtns}</div>
      <div class="sec-lbl" style="padding:12px 0 8px">Schedule</div>
      <div class="d-type-row" style="flex-wrap:wrap;gap:6px">
        <button class="d-type-btn sched-btn${sched==='daily'?' active':''}" data-sched="daily" onclick="_setEditSchedMode(this,'daily')">Daily</button>
        <button class="d-type-btn sched-btn${sched==='specific'?' active':''}" data-sched="specific" onclick="_setEditSchedMode(this,'specific')">Specific</button>
        <button class="d-type-btn sched-btn${sched==='weekly'?' active':''}" data-sched="weekly" onclick="_setEditSchedMode(this,'weekly')">× / week</button>
      </div>
      <div id="edit-sched-days" style="display:${sched==='specific'?'block':'none'};padding:8px 0"><div class="sched-day-row">${dayBtns}</div></div>
      <div id="edit-sched-weekly" style="display:${sched==='weekly'?'block':'none'};padding:8px 0">
        <div class="d-goals-row"><div class="d-goals-label">× per week</div><input class="d-input" type="number" id="edit-per-week" value="${h.perWeek||3}" min="1" max="7" style="width:60px;text-align:center"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeEditHabit()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="saveEditHabit('${id}')">Save</button>
      </div>
    </div>`;
  modal.style.display = 'block';
}

function _setEditSchedMode(btn, mode) {
  btn.parentElement.querySelectorAll('.sched-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('edit-sched-days').style.display = mode === 'specific' ? 'block' : 'none';
  document.getElementById('edit-sched-weekly').style.display = mode === 'weekly' ? 'block' : 'none';
}

function closeEditHabit() {
  const m = document.getElementById('edit-habit-modal');
  if (m) m.style.display = 'none';
}

function saveEditHabit(id) {
  const name = document.getElementById('edit-habit-name')?.value?.trim();
  const catBtn = document.querySelector('#edit-habit-modal .cat-btn.active');
  const category = catBtn?.dataset?.val || catBtn?.textContent;
  if (!name) return;
  const h = habits.find(x => x.id === id);
  if (!h) return;
  h.name = name;
  if (category) h.category = category;
  // Save schedule
  const schedBtn = document.querySelector('#edit-habit-modal .sched-btn.active');
  const sched = schedBtn?.dataset?.sched || 'daily';
  h.schedule = sched;
  if (sched === 'specific') {
    h.days = [...document.querySelectorAll('#edit-sched-days .sched-day-btn.active')].map(b => parseInt(b.dataset.day));
  } else { delete h.days; }
  if (sched === 'weekly') {
    h.perWeek = Math.min(7, Math.max(1, parseInt(document.getElementById('edit-per-week')?.value) || 3));
  } else { delete h.perWeek; }
  LS.set('hvi_habits', habits);
  closeEditHabit();
  renderHabits();
}

function renderHabitCreate() {
  const cats = ['mindset','discipline','fitness','health','learning','social','financial'];
  const catBtns = cats.map(c => `<button class="d-type-btn${c===curHabitCat?' active':''}" onclick="curHabitCat='${c}';go('habitCreate')">${c}</button>`).join('');

  const dayNames = ['S','M','T','W','T','F','S'];
  const dayBtns = dayNames.map((d,i) => `<button class="sched-day-btn active" data-day="${i}" onclick="this.classList.toggle('active')">${d}</button>`).join('');
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('habits')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">New Habit</div><div class="page-sub">Build your own daily practice.</div></div>
    <div style="padding:0 24px" class="ani">
      <div class="d-goals-row"><div class="d-goals-label">Name</div><input class="d-input" type="text" id="hc-name" placeholder="e.g. Cold plunge 5 min" style="flex:1"></div>
      <div class="sec-lbl" style="padding:16px 0 8px">Category</div>
      <div class="d-type-btns" style="padding:0 0 16px">${catBtns}</div>
      <div class="sec-lbl" style="padding:0 0 8px">Schedule</div>
      <div class="d-type-btns" style="padding:0 0 8px">
        <button class="d-type-btn active" data-sched="daily" onclick="_setSchedMode(this,'daily')">Daily</button>
        <button class="d-type-btn" data-sched="specific" onclick="_setSchedMode(this,'specific')">Specific Days</button>
        <button class="d-type-btn" data-sched="weekly" onclick="_setSchedMode(this,'weekly')">× per week</button>
      </div>
      <div id="sched-days" style="display:none;padding:0 0 12px"><div class="sched-day-row">${dayBtns}</div></div>
      <div id="sched-weekly" style="display:none;padding:0 0 12px">
        <div class="d-goals-row"><div class="d-goals-label">Times per week</div><input class="d-input" type="number" id="hc-per-week" value="3" min="1" max="7" inputmode="numeric" style="width:60px;text-align:center"></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="w-finish" style="flex:1" onclick="saveHabit()">SAVE</button>
        <button class="w-action-btn" style="flex:1;margin:16px 0 24px" onclick="go('habits')">CANCEL</button>
      </div>
    </div>`;
}

function _setSchedMode(btn, mode) {
  btn.parentElement.querySelectorAll('.d-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sched-days').style.display = mode === 'specific' ? 'block' : 'none';
  document.getElementById('sched-weekly').style.display = mode === 'weekly' ? 'block' : 'none';
}

function _getSchedFromForm() {
  const active = document.querySelector('[data-sched].active');
  const mode = active?.dataset?.sched || 'daily';
  if (mode === 'daily') return { schedule: 'daily' };
  if (mode === 'specific') {
    const days = [...document.querySelectorAll('.sched-day-btn.active')].map(b => parseInt(b.dataset.day));
    return { schedule: 'specific', days };
  }
  if (mode === 'weekly') {
    const pw = Math.min(7, Math.max(1, parseInt(document.getElementById('hc-per-week')?.value) || 3));
    return { schedule: 'weekly', perWeek: pw };
  }
  return { schedule: 'daily' };
}

function saveHabit() {
  const name = document.getElementById('hc-name')?.value?.trim();
  if (!name) return;
  const id = 'cu_' + Date.now();
  const sched = _getSchedFromForm();
  const h = { id, name, category: curHabitCat, ...sched };
  habits.push(h);
  log[id] = { streak: 0, lastCompletedDate: '', completedToday: false };
  LS.set('hvi_habits', habits);
  LS.set('hvi_log', log);
  go('habits');
}

// ── SWIPE NAVIGATION ─────────────────────────────────────────────────────
const _NAV_ORDER = ['home', 'habits', 'workout', 'diet', 'library', 'stats'];
let _swipeX0 = null, _swipeY0 = null, _swiping = false;

function initSwipeNav() {
  const view = document.getElementById('view');
  view.addEventListener('touchstart', e => {
    _swipeX0 = e.touches[0].clientX;
    _swipeY0 = e.touches[0].clientY;
    _swiping = false;
  }, { passive: true });

  view.addEventListener('touchmove', e => {
    if (_swipeX0 === null) return;
    const dx = e.touches[0].clientX - _swipeX0;
    const dy = e.touches[0].clientY - _swipeY0;
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 30) _swiping = true;
  }, { passive: true });

  view.addEventListener('touchend', e => {
    if (!_swiping || _swipeX0 === null) { _swipeX0 = null; return; }
    const dx = e.changedTouches[0].clientX - _swipeX0;
    _swipeX0 = null; _swiping = false;
    if (Math.abs(dx) < 60) return;
    const base = NAV_PARENT[curView] || curView;
    const idx = _NAV_ORDER.indexOf(base);
    if (idx === -1) return;
    const next = dx < 0 ? _NAV_ORDER[idx + 1] : _NAV_ORDER[idx - 1];
    if (next) go(next);
  }, { passive: true });
}

// ── iOS HAPTIC FALLBACK ──────────────────────────────────────────────────
function haptic(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern || 10);
  } else {
    // iOS Safari fallback — play a short silent-ish tick
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain); gain.connect(_audioCtx.destination);
      gain.gain.value = 0.01; // nearly silent
      osc.frequency.value = 200;
      osc.start(); osc.stop(_audioCtx.currentTime + 0.02);
    } catch {}
  }
}

// ── INVITE / REFERRAL ────────────────────────────────────────────────────
function shareInvite() {
  const text = "I've been using Arete to track my habits, workouts, and nutrition all in one app. It's free — check it out!";
  const url = 'https://oskarsteinicke.github.io/arete/';
  if (navigator.share) {
    navigator.share({ title: 'Arete', text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text + '\n' + url).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {});
  }
}

// ── PRO UPGRADE PROMPT ───────────────────────────────────────────────────
function showProPrompt() {
  let el = document.getElementById('pro-overlay');
  if (!el) { el = document.createElement('div'); el.id = 'pro-overlay'; document.body.appendChild(el); }
  el.innerHTML = `
    <div class="pro-overlay" onclick="closeProPrompt()">
      <div class="pro-card" onclick="event.stopPropagation()">
        <div class="pro-star"><svg viewBox="0 0 120 120" width="52" height="52" xmlns="http://www.w3.org/2000/svg"><g fill="#c4a96c"><ellipse cx="35" cy="12" rx="3.5" ry="8" transform="rotate(-65,35,12)"/><ellipse cx="25" cy="22" rx="4" ry="9" transform="rotate(-50,25,22)"/><ellipse cx="17" cy="34" rx="4.5" ry="10" transform="rotate(-38,17,34)"/><ellipse cx="13" cy="48" rx="5" ry="11" transform="rotate(-22,13,48)"/><ellipse cx="13" cy="62" rx="5" ry="11" transform="rotate(-8,13,62)"/><ellipse cx="17" cy="76" rx="5" ry="11" transform="rotate(10,17,76)"/><ellipse cx="25" cy="88" rx="4.5" ry="10" transform="rotate(26,25,88)"/><ellipse cx="36" cy="97" rx="4" ry="9" transform="rotate(40,36,97)"/><ellipse cx="48" cy="102" rx="3.5" ry="8" transform="rotate(55,48,102)"/><ellipse cx="85" cy="12" rx="3.5" ry="8" transform="rotate(65,85,12)"/><ellipse cx="95" cy="22" rx="4" ry="9" transform="rotate(50,95,22)"/><ellipse cx="103" cy="34" rx="4.5" ry="10" transform="rotate(38,103,34)"/><ellipse cx="107" cy="48" rx="5" ry="11" transform="rotate(22,107,48)"/><ellipse cx="107" cy="62" rx="5" ry="11" transform="rotate(8,107,62)"/><ellipse cx="103" cy="76" rx="5" ry="11" transform="rotate(-10,103,76)"/><ellipse cx="95" cy="88" rx="4.5" ry="10" transform="rotate(-26,95,88)"/><ellipse cx="84" cy="97" rx="4" ry="9" transform="rotate(-40,84,97)"/><ellipse cx="72" cy="102" rx="3.5" ry="8" transform="rotate(-55,72,102)"/></g><path d="M52 106 Q56 112 60 114 Q64 112 68 106" fill="none" stroke="#c4a96c" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="pro-title">Arete Pro</div>
        <div class="pro-sub">Unlock the full system to accelerate your progress.</div>
        <div class="pro-features">
          <div class="pro-feat"><span class="pro-feat-icon">🤖</span> Unlimited AI Coach conversations</div>
          <div class="pro-feat"><span class="pro-feat-icon">🔍</span> Food database search (millions of foods)</div>
          <div class="pro-feat"><span class="pro-feat-icon">📸</span> Progress photo timeline & comparison</div>
          <div class="pro-feat"><span class="pro-feat-icon">☁️</span> Cloud sync across all devices</div>
          <div class="pro-feat"><span class="pro-feat-icon">📊</span> Advanced analytics & trends</div>
          <div class="pro-feat"><span class="pro-feat-icon">📤</span> Shareable weekly recaps</div>
        </div>
        <button class="pro-btn" onclick="alert('Coming soon!')">UPGRADE — $4.99/MONTH</button>
        <button class="pro-skip" onclick="closeProPrompt()">Maybe later</button>
      </div>
    </div>`;
}

function closeProPrompt() {
  const el = document.getElementById('pro-overlay');
  if (el) el.remove();
}

// ── SMART SYNC (only changed keys) ───────────────────────────────────────
let _lastSyncHash = {};

function _computeSyncHash() {
  const h = {};
  SYNC_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v) h[k] = v.length; // simple length-based change detection
  });
  return h;
}

function _getChangedKeys() {
  const cur = _computeSyncHash();
  const changed = SYNC_KEYS.filter(k => cur[k] !== _lastSyncHash[k]);
  _lastSyncHash = cur;
  return changed;
}

// ── ERROR BOUNDARY ───────────────────────────────────────────────────────
window.onerror = function(msg, src, line) {
  console.error('[arete] Error:', msg, src, line);
  const view = document.getElementById('view');
  if (view && !document.querySelector('.error-boundary')) {
    const el = document.createElement('div');
    el.className = 'error-boundary';
    el.innerHTML = `
      <h2>Something went wrong</h2>
      <p>An unexpected error occurred. This won't affect your saved data.</p>
      <button onclick="this.closest('.error-boundary').remove();go('home')">Back to Home</button>`;
    document.body.appendChild(el);
  }
};

window.addEventListener('unhandledrejection', e => {
  console.error('[arete] Unhandled rejection:', e.reason);
});

// ── START ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();
  initSwipeNav();
});
