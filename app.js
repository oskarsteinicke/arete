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
const USDA_KEY = 'DEMO_KEY';

// ── Unit helpers ──────────────────────────────────────────────────────────
function isImperial() { return (settings || {}).units === 'imperial'; }
function wtUnit() { return isImperial() ? 'lbs' : 'kg'; }
function setUnits(u) {
  settings.units = u;
  LS.set('hvi_settings', settings);
} // replace with your free key from https://fdc.nal.usda.gov/api-guide.html

// ── SUPABASE AUTH + CLOUD SYNC ────────────────────────────────────────────
const SUPABASE_URL = 'https://socflncohsenjptgkkax.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J2qJ8iTfCESrML5Hm6NGbQ_mz9uPeug';
const SYNC_KEYS = ['hvi_habits','hvi_log','hvi_journal3','hvi_meta','hvi_workout_log','hvi_workout_meta','hvi_meal_log','hvi_diet_meta','hvi_weight_log','hvi_prs','hvi_gamification','hvi_achievements','hvi_tdee_profile','hvi_custom_programs','hvi_onboarded','hvi_wger_cache'];

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

// ── ADAPTIVE NUTRITION HELPERS ────────────────────────────────────────────
function computeTrend(wl) {
  const entries = Object.entries(wl).sort((a,b) => a[0].localeCompare(b[0]));
  if (!entries.length) return [];
  let ema = entries[0][1];
  return entries.map(([date, raw]) => {
    ema = 0.1 * raw + 0.9 * ema;
    return { date, raw, ema };
  });
}

function computeWeeklyAvgCalories(ml) {
  const dates = Object.keys(ml).filter(d => {
    const meals = (ml[d] || {}).meals || [];
    return meals.length > 0;
  }).sort().reverse().slice(0, 7);
  if (dates.length < 3) return null;
  const total = dates.reduce((sum, d) => {
    const meals = (ml[d] || {}).meals || [];
    return sum + meals.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.calories || 0), 0), 0);
  }, 0);
  return Math.round(total / dates.length);
}

function computeTDEE(wl, ml) {
  const trend = computeTrend(wl);
  if (trend.length < 7) return null;
  const avgCal = computeWeeklyAvgCalories(ml);
  if (avgCal === null) return null;
  const last7 = trend.slice(-7);
  const weightChange = last7[last7.length - 1].ema - last7[0].ema;
  const weightChangeCalsPerDay = (weightChange * 7700) / 7;
  return Math.round(Math.min(6000, Math.max(1200, avgCal - weightChangeCalsPerDay)));
}

function computeAdaptiveTarget(tdee, goalType, wl) {
  if (tdee === null) return null;
  const offsets = { cut: -400, maintain: 0, bulk: 300 };
  const calories = Math.round(tdee + (offsets[goalType] || 0));
  const entries = Object.entries(wl).sort((a,b) => b[0].localeCompare(a[0]));
  const bw = entries.length ? entries[0][1] : 80;
  return { calories, protein: Math.round(bw * 2.2) };
}

function injectAdaptiveStyles() {
  if (document.getElementById('diet-adaptive-styles')) return;
  const s = document.createElement('style');
  s.id = 'diet-adaptive-styles';
  s.textContent = `
    .da-section{background:var(--surface2);border-radius:14px;padding:16px;margin:16px 24px}
    .da-stat{text-align:center}
    .da-stat-val{font-size:20px;font-weight:700;color:var(--accent-b);font-family:var(--serif)}
    .da-stat-lbl{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
    .da-goal-btns{display:flex;gap:6px;margin:12px 0 8px}
    .da-goal-btn{flex:1;padding:10px 0;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:transparent;color:var(--text-dim);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s}
    .da-goal-btn.active{background:rgba(154,130,86,0.15);border-color:var(--accent);color:var(--accent-b)}
    .da-apply{display:inline-block;margin-top:8px;padding:8px 20px;border:1px solid var(--accent);border-radius:10px;background:rgba(154,130,86,0.1);color:var(--accent-b);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s}
    .da-apply:active{transform:scale(0.97)}
    .da-rec{display:flex;gap:16px;justify-content:center;margin-top:10px}
    .da-rec-item{text-align:center}
    .da-rec-val{font-size:16px;font-weight:700;font-family:var(--serif)}
    .da-rec-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px}
    .dw-section{background:var(--surface2);border-radius:14px;padding:16px;margin:16px 24px}
    .dw-logged{font-size:14px;color:var(--text);margin-bottom:10px}
    .dw-input-row{display:flex;gap:8px;align-items:center}
    .dw-input{flex:1;padding:10px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:var(--surface);color:var(--text);font-size:14px}
    .dw-log-btn{padding:10px 18px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
    .dw-log-btn:active{transform:scale(0.97)}
    .dw-history{margin-top:10px;font-size:12px;color:var(--text-dim)}
    .dw-history-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
    .dw-trend-link{display:block;margin-top:10px;font-size:12px;color:var(--accent-b);cursor:pointer;text-align:right}
    .dt-chart{margin:16px 24px;background:var(--surface2);border-radius:14px;padding:16px;overflow:hidden}
    .dt-placeholder{padding:32px 24px;text-align:center;font-size:13px;color:var(--text-dim)}
    .fs-row{background:var(--surface2);border-radius:8px;padding:10px 14px;margin-bottom:4px;cursor:pointer;border:1px solid transparent;transition:all .2s}
    .fs-row:hover{background:var(--surface);border-color:rgba(255,255,255,0.08)}
    .fs-row.selected{border-color:var(--accent)}
    .fs-row-name{font-size:13px;color:var(--text);margin-bottom:2px}
    .fs-row-macros{font-size:11px;color:var(--text-dim)}
    .fs-status{color:var(--text-dim);font-size:13px;padding:12px 0}
    .fs-input-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
    .fs-search-btn{padding:10px 18px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;white-space:nowrap}
    .fs-search-btn:active{transform:scale(0.97)}
    .fs-grams-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
    .fs-grams-label{font-size:12px;color:var(--text-dim);white-space:nowrap}
  `;
  document.head.appendChild(s);
}

// ── USDA FOOD SEARCH ─────────────────────────────────────────────────────
async function searchFoods(query) {
  if (!query || query.length < 2) return [];
  const key = query.toLowerCase();
  if (foodSearchCache[key]) return foodSearchCache[key];
  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=8&dataType=Foundation,SR%20Legacy&api_key=${USDA_KEY}`);
    if (!res.ok) return [];
    const data = await res.json();
    const nutr = (f, id) => { const n = (f.foodNutrients || []).find(x => x.nutrientId === id); return n ? n.value : 0; };
    const results = (data.foods || []).map(f => ({
      fdcId: f.fdcId,
      name: f.description,
      cal100g: nutr(f, 1008),
      protein100g: nutr(f, 1003),
      carbs100g: nutr(f, 1005),
      fat100g: nutr(f, 1004),
    })).filter(r => r.cal100g > 0).slice(0, 8);
    foodSearchCache[key] = results;
    return results;
  } catch { return []; }
}

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

// ══════════════════════════════════════════════════════════════════════════
// GAMIFICATION
// ══════════════════════════════════════════════════════════════════════════

const ACHIEVEMENTS = [
  { id: 'first_habit',   icon: '⚡', name: 'First Step',       desc: 'Complete your first habit' },
  { id: 'streak_3',      icon: '🔥', name: 'On Fire',    desc: '3-day streak on any habit' },
  { id: 'streak_7',      icon: '🔥', name: 'Locked In',  desc: '7-day streak on any habit' },
  { id: 'streak_30',     icon: '💎', name: 'Iron Will',  desc: '30-day streak on any habit' },
  { id: 'perfect_day',   icon: '⭐', name: 'Full Send',        desc: 'Complete all habits in one day' },
  { id: 'perfect_3',     icon: '🌟', name: 'Consistent', desc: '3 perfect habit days' },
  { id: 'first_workout', icon: '💪', name: 'First Rep',  desc: 'Log your first workout' },
  { id: 'workouts_10',   icon: '🏋', name: 'Iron Regular', desc: 'Log 10 workouts' },
  { id: 'workouts_50',   icon: '🏆', name: 'Gym Rat',    desc: 'Log 50 workouts' },
  { id: 'first_pr',      icon: '🏆', name: 'Personal Best', desc: 'Set your first PR' },
  { id: 'pr_5',          icon: '💥', name: 'Getting Stronger', desc: 'Set 5 PRs' },
  { id: 'journal_7',     icon: '📖', name: 'Self Aware', desc: 'Journal for 7 days' },
  { id: 'nutrition_7',   icon: '🥗', name: 'Dialed In',  desc: 'Log meals 7 days' },
  { id: 'level_5',       icon: '⬆️', name: 'Leveling Up',     desc: 'Reach Level 5' },
  { id: 'level_10',      icon: '👑', name: 'Elite',           desc: 'Reach Level 10' },
  { id: 'all_pillars',   icon: '🏛', name: 'Five Pillars',    desc: 'Complete a habit in every pillar' },
  { id: 'streak_14',     icon: '🔥', name: 'Two Weeks',       desc: '14-day streak on any habit' },
  { id: 'streak_100',    icon: '💎', name: 'Unbreakable',     desc: '100-day streak on any habit' },
  { id: 'perfect_7',     icon: '🌟', name: 'Perfect Week',    desc: '7 perfect habit days in total' },
  { id: 'workouts_25',   icon: '💪', name: 'Regular',         desc: 'Log 25 workouts' },
  { id: 'first_quest',   icon: '⚡', name: 'On a Mission',    desc: 'Complete your first daily quest' },
  { id: 'quests_7',      icon: '🎯', name: 'Quest Master',    desc: 'Complete 7 daily quests total' },
  { id: 'pr_10',         icon: '💥', name: 'Record Breaker',  desc: 'Set 10 personal records' },
  { id: 'nutrition_30',  icon: '🥗', name: 'Dialled In',      desc: 'Log meals on 30 different days' },
];

// ── Level Titles ──────────────────────────────────────────────────────────
const LEVEL_TITLES = [
  { min: 1,  title: 'Seeker' },
  { min: 3,  title: 'Apprentice' },
  { min: 5,  title: 'Warrior' },
  { min: 8,  title: 'Champion' },
  { min: 12, title: 'Legend' },
  { min: 20, title: 'Northstar' },
];
function getLevelTitle(lvl) {
  let t = LEVEL_TITLES[0].title;
  for (const lt of LEVEL_TITLES) { if (lvl >= lt.min) t = lt.title; }
  return t;
}

// ── Daily Quests ───────────────────────────────────────────────────────────
const QUEST_POOL = [
  { id: 'q_all_habits',  icon: '✅', label: 'Complete all habits today',           xp: 60, check: () => habits.length > 0 && habits.every(h => log[h.id]?.completedToday) },
  { id: 'q_any_3',       icon: '⚡', label: 'Complete 3 or more habits',           xp: 30, check: () => habits.filter(h => log[h.id]?.completedToday).length >= 3 },
  { id: 'q_workout',     icon: '💪', label: 'Log a workout today',                 xp: 50, check: () => !!workoutLog[today()]?.exercises?.some(e => e.sets?.some(s => s.completed)) },
  { id: 'q_5_exercises', icon: '🏋', label: 'Complete 5+ exercises in a session',  xp: 60, check: () => (workoutLog[today()]?.exercises || []).filter(e => e.sets?.some(s => s.completed)).length >= 5 },
  { id: 'q_protein',     icon: '🥩', label: 'Hit your protein goal',               xp: 50, check: () => { const dm = getDayMacros(); return dietMeta.dailyGoals.protein > 0 && dm.p >= dietMeta.dailyGoals.protein; } },
  { id: 'q_calories',    icon: '🔥', label: 'Stay within calorie goal',            xp: 40, check: () => { const dm = getDayMacros(); const g = dietMeta.dailyGoals.calories; return g > 0 && dm.cal > 0 && dm.cal <= g * 1.05; } },
  { id: 'q_3_meals',     icon: '🍽', label: 'Log 3 or more meals today',           xp: 40, check: () => (mealLog[today()]?.meals || []).length >= 3 },
  { id: 'q_journal',     icon: '📖', label: 'Write in your journal today',         xp: 40, check: () => { const je = journal[today()] || {}; return Object.values(je).some(Boolean); } },
  { id: 'q_all_pillars', icon: '🏛', label: 'Complete a habit in every pillar',    xp: 75, check: () => PILLARS.every(p => pillarHabits(p.id).some(h => log[h.id]?.completedToday)) },
  { id: 'q_3_sets',      icon: '💥', label: 'Log 3+ sets on any exercise',         xp: 35, check: () => (workoutLog[today()]?.exercises || []).some(e => e.sets?.filter(s => s.completed).length >= 3) },
  { id: 'q_new_pr',      icon: '🏆', label: 'Set a personal record today',         xp: 80, check: () => Object.values(prs).some(p => p.date === today()) },
  { id: 'q_finish',      icon: '🏁', label: 'Finish a workout session',            xp: 45, check: () => workoutMeta.lastWorkoutDate === today() },
];

function getDailyQuests() {
  const t = today();
  let seed = t.split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) & 0x7FFFFFFF, 0);
  const pool = [...QUEST_POOL];
  const picked = [];
  while (picked.length < 3 && pool.length > 0) {
    seed = (seed * 1664525 + 1013904223) & 0x7FFFFFFF;
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function checkDailyQuests() {
  const t = today();
  if (!gamification.questsCompleted) gamification.questsCompleted = {};
  const done = new Set(gamification.questsCompleted[t] || []);
  const quests = getDailyQuests();
  let newlyDone = [];
  quests.forEach(q => {
    try {
      if (!done.has(q.id) && q.check()) {
        done.add(q.id);
        newlyDone.push(q);
      }
    } catch(e) {}
  });
  if (newlyDone.length) {
    gamification.questsCompleted[t] = [...done];
    newlyDone.forEach(q => {
      gamification.xp = (gamification.xp || 0) + q.xp;
    });
    LS.set('hvi_gamification', gamification);
    const first = newlyDone[0];
    showXPToast(`+${first.xp} XP · Quest done!`);
    checkAchievements();
    // Refresh quest UI if on home
    const qEl = document.getElementById('quest-section');
    if (qEl) {
      const _qd2 = new Set((gamification.questsCompleted || {})[today()] || []);
      qEl.innerHTML = getDailyQuests().map(q => {
        const qd = _qd2.has(q.id);
        return `<div class="hm-quest${qd?' hm-quest-done':''}">
          <div class="hm-quest-ico">${q.icon}</div>
          <div class="hm-quest-body"><div class="hm-quest-lbl">${q.label}</div><div class="hm-quest-xp">+${q.xp} XP</div></div>
          <div class="hm-quest-done-row"><div class="hm-quest-cb${qd?' hm-quest-cb-done':''}">${qd?'✓':''}</div></div>
        </div>`;
      }).join('');
    }
  }
}

function buildQuestHTML() {
  const t = today();
  const done = new Set((gamification.questsCompleted || {})[t] || []);
  const quests = getDailyQuests();
  return quests.map(q => {
    const isDone = done.has(q.id);
    return `<div class="g-quest${isDone ? ' g-quest-done' : ''}">
      <div class="g-quest-icon">${q.icon}</div>
      <div class="g-quest-label">${q.label}</div>
      <div class="g-quest-xp">${isDone ? '✓' : '+' + q.xp + ' XP'}</div>
    </div>`;
  }).join('');
}

function getWeekKey() {
  const d = new Date(), jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function getLevel(xp) { return Math.max(1, Math.floor(Math.sqrt((xp || 0) / 100)) + 1); }

function xpToNextLevel(xp) {
  const lvl = getLevel(xp);
  const curThreshold = (lvl - 1) * (lvl - 1) * 100;
  const nextThreshold = lvl * lvl * 100;
  const progress = xp - curThreshold;
  const needed = nextThreshold - curThreshold;
  return { lvl, progress, needed, pct: progress / needed };
}

function getPillarLevel(pid) {
  return Math.max(1, Math.floor(((gamification.pillarXP || {})[pid] || 0) / 100) + 1);
}

let _xpToastTimer = null;
function showXPToast(text) {
  let t = document.getElementById('xp-toast');
  if (!t) { t = document.createElement('div'); t.id = 'xp-toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.className = '';
  void t.offsetWidth;
  t.className = 'xp-toast-show';
  clearTimeout(_xpToastTimer);
  _xpToastTimer = setTimeout(() => { t.className = ''; }, 1500);
}

function showAchievementToast(ach) {
  let t = document.getElementById('ach-toast');
  if (!t) { t = document.createElement('div'); t.id = 'ach-toast'; document.body.appendChild(t); }
  t.innerHTML = `${ach.icon} <strong>${ach.name}</strong> unlocked!`;
  t.className = '';
  void t.offsetWidth;
  t.className = 'ach-toast-show';
  launchConfetti(0.3);
}

function awardXP(amount, pillarId) {
  gamification.xp = (gamification.xp || 0) + amount;
  if (pillarId) {
    if (!gamification.pillarXP) gamification.pillarXP = {};
    gamification.pillarXP[pillarId] = (gamification.pillarXP[pillarId] || 0) + amount;
  }
  LS.set('hvi_gamification', gamification);
  showXPToast('+' + amount + ' XP');
  checkAchievements();
}

function checkAchievements() {
  const unlocked = new Set(achievements);
  const maxStreak = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const totalWorkouts = Object.values(workoutLog).filter(wl => wl.exercises.some(e => e.sets.some(s => s.completed))).length;
  const totalPRs = Object.keys(prs).length;
  const totalJournalDays = Object.keys(journal).filter(d => Object.values(journal[d]).some(Boolean)).length;
  const allHabitsDone = habits.length > 0 && habits.every(h => log[h.id]?.completedToday);
  const allPillarsHit = PILLARS.every(p => pillarHabits(p.id).some(h => log[h.id]?.completedToday));
  const mealDays = Object.keys(mealLog).filter(d => (mealLog[d]?.meals || []).length > 0).length;
  const lvl = getLevel(gamification.xp || 0);

  const totalQuests = Object.values(gamification.questsCompleted || {}).reduce((s, arr) => s + arr.length, 0);
  const checks = {
    first_habit:   habits.some(h => log[h.id]?.completedToday || (log[h.id]?.streak || 0) > 0),
    streak_3:      maxStreak >= 3,
    streak_7:      maxStreak >= 7,
    streak_14:     maxStreak >= 14,
    streak_30:     maxStreak >= 30,
    streak_100:    maxStreak >= 100,
    perfect_day:   allHabitsDone || (meta.totalPerfectDays || 0) >= 1,
    perfect_3:     (meta.totalPerfectDays || 0) >= 3,
    perfect_7:     (meta.totalPerfectDays || 0) >= 7,
    first_workout: totalWorkouts >= 1,
    workouts_10:   totalWorkouts >= 10,
    workouts_25:   totalWorkouts >= 25,
    workouts_50:   totalWorkouts >= 50,
    first_pr:      totalPRs >= 1,
    pr_5:          totalPRs >= 5,
    pr_10:         totalPRs >= 10,
    journal_7:     totalJournalDays >= 7,
    nutrition_7:   mealDays >= 7,
    nutrition_30:  mealDays >= 30,
    level_5:       lvl >= 5,
    level_10:      lvl >= 10,
    all_pillars:   allPillarsHit,
    first_quest:   totalQuests >= 1,
    quests_7:      totalQuests >= 7,
  };

  ACHIEVEMENTS.forEach(ach => {
    if (!unlocked.has(ach.id) && checks[ach.id]) {
      achievements.push(ach.id);
      LS.set('hvi_achievements', achievements);
      showAchievementToast(ach);
    }
  });
}

function computeDailyScore() {
  const { done, total } = totalPct();
  const habitScore = total > 0 ? (done / total) * 40 : 0;
  const workoutScore = !!workoutLog[today()] ? 30 : 0;
  const je = journal[today()] || {};
  const journalScore = Object.values(je).some(Boolean) ? 15 : 0;
  const dm = getDayMacros();
  const calGoal = dietMeta.dailyGoals.calories;
  const nutritionScore = calGoal > 0 && dm.cal > 0 && Math.abs(dm.cal - calGoal) / calGoal <= 0.15 ? 15 : 0;
  return Math.round(habitScore + workoutScore + journalScore + nutritionScore);
}

function ensureWeeklyStats() {
  const wk = getWeekKey();
  if (!gamification.weeklyStats || gamification.weeklyStats.weekKey !== wk) {
    gamification.weeklyStats = { weekKey: wk, workoutDays: [], journalDays: [], proteinDays: [] };
    LS.set('hvi_gamification', gamification);
  }
}

function getWeeklyChallenges() {
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  return [
    { icon: '🏋', label: 'Complete 4 workouts', current: ws.workoutDays.length, goal: 4 },
    { icon: '🥩', label: 'Hit protein goal 5 days', current: ws.proteinDays.length, goal: 5 },
    { icon: '📖', label: 'Journal 5 days', current: ws.journalDays.length, goal: 5 },
  ];
}

function trackWeeklyWorkout() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.workoutDays.includes(t)) {
    gamification.weeklyStats.workoutDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function trackWeeklyJournal() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.journalDays.includes(t)) {
    gamification.weeklyStats.journalDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function trackWeeklyProtein() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.proteinDays.includes(t)) {
    gamification.weeklyStats.proteinDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function injectGamificationStyles() {
  if (document.getElementById('gamification-styles')) return;
  const s = document.createElement('style');
  s.id = 'gamification-styles';
  s.textContent = `
    @keyframes xpPop { 0%{opacity:0;transform:translateY(0) scale(.8)} 15%{opacity:1;transform:translateY(-10px) scale(1.1)} 80%{opacity:1;transform:translateY(-22px) scale(1)} 100%{opacity:0;transform:translateY(-32px)} }
    @keyframes achSlide { 0%{opacity:0;transform:translateX(120%)} 10%{opacity:1;transform:translateX(0)} 80%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(120%)} }
    #xp-toast{position:fixed;bottom:90px;right:20px;background:var(--accent);color:#fff;font-weight:700;font-size:13px;padding:6px 14px;border-radius:20px;opacity:0;pointer-events:none;z-index:999}
    #xp-toast.xp-toast-show{animation:xpPop 1.5s ease forwards}
    #ach-toast{position:fixed;top:20px;right:16px;left:16px;background:var(--surface2);border:1px solid var(--accent);color:var(--text);font-size:13px;padding:12px 16px;border-radius:12px;opacity:0;pointer-events:none;z-index:1000;text-align:center}
    #ach-toast.ach-toast-show{animation:achSlide 3s ease forwards}
    .g-score-ring{text-align:center;cursor:pointer;padding:4px 8px}
    .g-score-val{font-family:var(--serif);font-size:32px;font-weight:700;line-height:1}
    .g-score-lbl{font-size:10px;letter-spacing:.04em;color:var(--accent);font-weight:600;margin-top:2px}
    .g-xp-bar-track{height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;margin:6px 0 2px}
    .g-xp-bar-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .5s ease}
    .g-challenge{background:var(--surface2);border-radius:10px;padding:12px 16px;margin-bottom:8px}
    .g-challenge-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .g-challenge-label{font-size:13px;color:var(--text)}
    .g-challenge-ct{font-size:12px;font-weight:700;color:var(--accent-b)}
    .g-challenge-track{height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden}
    .g-challenge-fill{height:100%;background:var(--accent);border-radius:2px;transition:width .4s}
    .g-ach-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 24px 16px}
    .g-ach-card{background:var(--surface2);border-radius:10px;padding:12px 6px;text-align:center;border:1px solid transparent;transition:all .2s}
    .g-ach-card.unlocked{border-color:var(--accent)}
    .g-ach-card.locked{opacity:0.35}
    .g-ach-icon{font-size:22px;margin-bottom:4px}
    .g-ach-name{font-size:10px;font-weight:700;color:var(--text);line-height:1.2}
    .g-ach-desc{font-size:9px;color:var(--text-dim);margin-top:2px;line-height:1.3}
    .g-pillar-levels{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:0 24px 16px}
    .g-pl-card{background:var(--surface2);border-radius:8px;padding:10px 4px;text-align:center}
    .g-pl-card svg{width:18px;height:18px;display:block;margin:0 auto 4px;fill:none;stroke:var(--text-dim);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .g-pl-name{font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}
    .g-pl-lv{font-size:15px;font-weight:800;font-family:var(--serif);color:var(--accent-b)}
    .g-weekly{padding:0 24px 8px}
    .w-set-del{background:none;border:none;color:var(--text-dim);font-size:14px;padding:4px 6px;cursor:pointer;flex-shrink:0;opacity:0.4;margin-left:auto}
    .w-set-del:active{opacity:1;color:var(--fat)}
    .w-ex-tip{font-size:11.5px;padding:4px 16px 8px;line-height:1.4;border-radius:6px;margin:0 0 4px}
    .w-ex-tip-increase{color:var(--accent-b)}
    .w-ex-tip-maintain{color:var(--carb)}
    .w-ex-tip-first{color:var(--text-dim);font-style:italic}
    /* Calendar */
    .cal-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px}
    .cal-month-label{font-family:var(--serif);font-size:18px;color:var(--text);text-align:center;flex:1}
    .cal-nav-btn{background:none;border:none;color:var(--text);font-size:28px;padding:4px 10px;cursor:pointer;line-height:1;flex-shrink:0}
    .cal-nav-disabled{opacity:0.25;pointer-events:none}
    .cal-view-seg{display:flex;background:var(--surface2);border-radius:20px;padding:3px;gap:2px;margin:0 20px 10px}
    .cal-vbtn{flex:1;border:none;background:none;color:var(--text-dim);font-size:12px;padding:6px 4px;border-radius:16px;cursor:pointer;transition:all .2s;font-weight:600;letter-spacing:.02em}
    .cal-vbtn-active{background:var(--accent);color:#1a1208}
    .cal-legend{display:flex;flex-wrap:wrap;gap:10px;padding:0 20px 10px}
    .cal-leg{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim)}
    .cal-dow-row{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px}
    .cal-dow{text-align:center;font-size:10px;color:var(--text-dim);padding:4px 0;text-transform:uppercase;letter-spacing:.04em}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px;gap:2px}
    .cal-cell{min-height:54px;padding:5px 2px 3px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;transition:background .15s}
    .cal-cell:active{background:rgba(255,255,255,0.06)}
    .cal-empty{pointer-events:none}
    .cal-future{opacity:0.45}
    .cal-today .cal-num{color:var(--accent-b);font-weight:800}
    .cal-selected{background:var(--surface2)!important;outline:1px solid rgba(154,130,86,.3)}
    .cal-num{font-size:13px;color:var(--text);line-height:1.3}
    .cal-dots{display:flex;gap:2px;margin-top:4px;flex-wrap:wrap;justify-content:center;min-height:7px}
    .cal-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .cal-detail{border-top:1px solid var(--border2);margin:10px 0 0;padding:0 20px 80px}
    .cal-detail-hdr{font-size:13px;font-weight:700;color:var(--accent-b);padding:14px 0 8px;letter-spacing:.02em}
    .cal-di{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:var(--text)}
    .cal-di span{flex:1;line-height:1.4}
    .cal-di-sub{font-size:11px;color:var(--text-dim);padding:2px 0 4px 22px;line-height:1.4}
    .cal-di-empty{font-size:12px;color:var(--text-dim);font-style:italic;padding:16px 0}
    /* Weekly strips */
    .cal-week-cols{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px;gap:2px}
    .cal-wcol{padding:8px 2px 6px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;transition:background .15s}
    .cal-wcol:active{background:rgba(255,255,255,0.06)}
    .cal-wcol-sel{background:var(--surface2)!important;outline:1px solid rgba(154,130,86,.3)}
    .cal-wday{font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em}
    .cal-wnum{font-size:16px;color:var(--text);font-weight:600;line-height:1.2}
    .cal-wnum-today{color:var(--accent-b);font-weight:800}
    .cal-wfuture{opacity:0.45}
    /* Daily view */
    .cal-daily-wrap{padding:0 20px 80px}
    .cal-daily-sec{margin-bottom:4px}
    .cal-daily-sec-hdr{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);padding:16px 0 6px;display:flex;align-items:center;justify-content:space-between}
    /* Tasks */
    .cal-task-list{margin-bottom:4px}
    .cal-task-item{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
    .cal-task-cb{width:20px;height:20px;border-radius:50%;border:2px solid var(--accent);background:none;cursor:pointer;flex-shrink:0;padding:0;display:flex;align-items:center;justify-content:center;transition:all .2s;font-size:12px;color:transparent}
    .cal-task-cb-done{background:var(--accent);color:#1a1208}
    .cal-task-text{flex:1;font-size:13px;color:var(--text);line-height:1.4;background:none;border:none;outline:none;padding:0}
    .cal-task-text-done{text-decoration:line-through;color:var(--text-dim)}
    .cal-task-del{background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer;padding:0 2px;line-height:1;opacity:0.5}
    .cal-task-del:active{opacity:1;color:var(--fat)}
    .cal-task-add{display:flex;gap:8px;align-items:center;margin-top:8px}
    .cal-task-input{flex:1;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:9px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit}
    .cal-task-input:focus{border-color:var(--accent)}
    .cal-task-add-btn{background:var(--accent);border:none;color:#1a1208;border-radius:10px;width:36px;height:36px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700}
    /* Unit toggle */
    .unit-toggle{display:flex;background:var(--surface2);border-radius:8px;padding:2px;gap:2px}
    .unit-btn{background:none;border:none;color:var(--text-dim);font-size:13px;font-weight:600;padding:6px 16px;border-radius:6px;cursor:pointer;transition:all .2s}
    .unit-btn-active{background:var(--accent);color:#fff}
    .g-quests{padding:0 24px 16px}
    .g-quest{display:flex;align-items:center;gap:12px;background:var(--surface2);border-radius:10px;padding:12px 14px;margin-bottom:8px;border:1px solid transparent;transition:all .25s}
    .g-quest-done{border-color:var(--accent-b);opacity:0.7}
    .g-quest-icon{font-size:18px;flex-shrink:0}
    .g-quest-label{flex:1;font-size:13px;color:var(--text);line-height:1.3}
    .g-quest-done .g-quest-label{text-decoration:line-through;color:var(--text-dim)}
    .g-quest-xp{font-size:12px;font-weight:700;color:var(--accent-b);white-space:nowrap}
    .g-quest-done .g-quest-xp{color:var(--accent-b)}
    /* Avatar */
    .av-wrap{display:flex;flex-direction:column;align-items:center;padding:28px 24px 12px;text-align:center;position:relative}
    .av-orb{width:170px;height:170px;position:relative;flex-shrink:0}
    .av-stage-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-top:2px;opacity:0.8}
    .av-name{font-family:var(--serif);font-size:24px;color:var(--text);margin-top:10px;line-height:1.2}
    .av-level{font-size:13px;color:var(--text-dim);margin-top:3px;letter-spacing:.02em}
    .av-xp-outer{width:100%;max-width:200px;margin-top:12px}
    .av-xp-track{height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
    .av-xp-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .6s ease}
    .av-xp-lbl{font-size:10px;color:var(--text-dim);margin-top:4px;letter-spacing:.01em}
    .av-edit-btn{position:absolute;top:24px;right:20px;background:none;border:1px solid var(--border2);color:var(--text-dim);font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer}
  `;
  document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════════════════════════
// CONFETTI
// ══════════════════════════════════════════════════════════════════════════
function launchConfetti(originY = 0.35) {
  const existing = document.getElementById('confetti-canvas');
  if (existing) existing.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10000';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLORS = ['#9a8256','#b89d68','#6e9fd4','#6fd48e','#e4dace','#d46f6f'];
  const particles = Array.from({length: 90}, () => ({
    x: canvas.width * (0.3 + Math.random() * 0.4),
    y: canvas.height * originY,
    vx: (Math.random() - 0.5) * 12,
    vy: -(Math.random() * 10 + 4),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    w: Math.random() * 9 + 4,
    h: Math.random() * 5 + 3,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.25,
    life: 1,
  }));
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.vx *= 0.99; p.angle += p.spin; p.life -= 0.007;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive) requestAnimationFrame(draw); else canvas.remove();
  }
  requestAnimationFrame(draw);
}

// ══════════════════════════════════════════════════════════════════════════
// SWIPE-TO-COMPLETE
// ══════════════════════════════════════════════════════════════════════════
function initSwipeGestures() {
  document.querySelectorAll('.hi:not([data-swipe])').forEach(row => {
    row.dataset.swipe = '1';
    let sx = 0, sy = 0, isH = false;
    row.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; isH = false;
    }, { passive: true });
    row.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!isH && Math.abs(dy) > Math.abs(dx)) return;
      if (dx > 5) { isH = true; e.preventDefault(); }
      if (isH && dx > 0) {
        const capped = Math.min(dx, 110);
        row.style.transform = `translateX(${capped}px)`;
        row.style.background = `rgba(110,212,142,${Math.min(dx/100,1)*0.18})`;
      }
    }, { passive: false });
    row.addEventListener('touchend', () => {
      const tx = parseFloat((row.style.transform || '').replace('translateX(','')) || 0;
      row.style.transition = 'transform 0.25s ease,background 0.25s ease';
      row.style.transform = ''; row.style.background = '';
      setTimeout(() => { row.style.transition = ''; }, 260);
      if (tx >= 75 && isH) {
        const m = row.id.match(/^hi([^-]*)-(.+)$/);
        if (m) tapHabit(m[2], m[1]);
      }
    });
  });
}

// ── NAV PARENT MAP ────────────────────────────────────────────────────────
const NAV_PARENT = {
  pillar: 'home',
  habitCreate: 'habits',
  workoutPicker: 'workout', workoutActive: 'workout', workoutHistory: 'workout', workoutBuilder: 'workout', exerciseBrowser: 'workout', prHistory: 'workout',
  dietAddMeal: 'diet', dietRecipes: 'diet', dietRecipeDetail: 'diet', dietGoals: 'diet', dietTrend: 'diet', dietTDEE: 'diet',
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
      const validViews = ['home','pillar','habits','habitCreate','stats','workout','workoutPicker','workoutActive','workoutHistory','workoutBuilder','exerciseBrowser','diet','dietAddMeal','dietRecipes','dietRecipeDetail','dietGoals','dietTrend','dietTDEE','library'];
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

  // Advance workout day if last workout was completed
  if (workoutMeta.lastWorkoutDate && workoutMeta.lastWorkoutDate !== t) {
    const prog = findProgram(workoutMeta.activeProgram);
    if (prog) workoutMeta.currentDayIndex = (workoutMeta.currentDayIndex + 1) % prog.days.length;
    LS.set('hvi_workout_meta', workoutMeta);
  }

  meta.lastOpenedDate = t;
  LS.set('hvi_log', log);
  LS.set('hvi_meta', meta);
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
    calendar: renderCalendar,
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
      <div class="hm-sec-title">⚡ Daily Quests</div>
    </div>
    <div class="hm-quest-list ani" id="quest-section">${questHTML}</div>

    <div class="hm-sec ani">
      <div class="hm-sec-title">🏆 Weekly Challenges</div>
    </div>
    <div class="hm-chal-list ani">${chalHTML}</div>
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
    <div class="ani">${groups}</div>`;
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

// ══════════════════════════════════════════════════════════════════════════
// RENDER: WORKOUT
// ══════════════════════════════════════════════════════════════════════════
function renderWorkout() {
  const prog = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const day = prog.days[workoutMeta.currentDayIndex % prog.days.length];
  const todayLog = workoutLog[today()];

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Workout</div><div class="page-sub">Train with purpose. Build discipline.</div></div>
    <div class="w-card ani" onclick="go('workoutActive')">
      <div class="w-day-badge">${day.name}</div>
      <div class="w-card-name">${prog.name}</div>
      <div class="w-card-desc">${day.focus}</div>
      <div class="w-card-days" style="margin-top:12px;color:var(--accent)">${todayLog ? '\u2713 Workout logged today' : '\u2192 Start today\u2019s workout'}</div>
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
      <button class="d-del-btn" style="position:absolute;top:12px;right:12px;font-size:18px" onclick="event.stopPropagation();deleteCustomProgram('${p.id}')">\u00D7</button>
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
    const name = ex ? ex.name : 'Exercise data loading\u2026';
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
        <span class="w-input-label">\u00D7</span>
        <input class="w-input" type="number" inputmode="decimal" value="${s.reps||''}" placeholder="reps" onfocus="this.select()" oninput="updateSet(${ei},${si},'reps',this.value)">
        <div class="w-set-check${s.completed?' done':''}" onclick="toggleSet(${ei},${si})">\u2713</div>
        ${showPR ? '<span class="pr-badge">\uD83C\uDFC6 New PR!</span>' : ''}
      </div>`;
    }).join('');
    const canRemove = we.sets.length > 1;
    return `<div class="w-ex ani">
      <div class="w-ex-head"><div><div class="w-ex-name">${esc(name)}</div><div class="w-ex-muscle">${esc(muscle)}</div></div></div>
      ${tipHTML}
      ${setsHTML}
      <div class="w-set-actions">
        <button class="w-add-set" onclick="addSet(${ei})">+ Add Set</button>
        ${canRemove ? `<button class="w-add-set" style="color:var(--fat);opacity:0.7" onclick="removeSet(${ei},${we.sets.length-1})">\u2212 Remove Set</button>` : ''}
      </div></div>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('workout')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="w-day-badge">${day.name}</div><div class="page-title">${prog.name}</div><div class="page-sub">${day.focus}</div></div>
    ${exHTML}
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

function finishWorkout() {
  workoutMeta.lastWorkoutDate = today();
  LS.set('hvi_workout_meta', workoutMeta);
  awardXP(50, 'body');
  trackWeeklyWorkout();
  checkDailyQuests();
  go('workout');
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
    const name = ex ? ex.name : 'Loading\u2026';
    const muscle = ex ? ex.muscle : '';
    if (!ex && typeof eid === 'number') wgerFetchExercise(eid).then(() => { if (curView === 'workoutBuilder') go('workoutBuilder', {}, false); });
    return `<div class="w-ex" style="margin:0 0 6px"><div class="w-ex-head"><div><div class="w-ex-name">${esc(name)}</div><div class="w-ex-muscle">${esc(muscle)}</div></div>
      <button class="d-del-btn" style="font-size:16px" onclick="builderRemoveEx(${i})">\u00D7</button></div></div>`;
  }).join('');

  let searchHTML;
  if (builderSearchLoading) {
    searchHTML = '<div class="ex-search-status">Searching\u2026</div>';
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
  if (builderSearchLoading) { el.innerHTML = '<div class="ex-search-status">Searching\u2026</div>'; return; }
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
    return `<div class="w-hist-item"><div class="w-hist-date">${fmtDate(d)}</div>
      <div class="w-hist-prog">${dayInfo ? dayInfo.name : 'Workout'} ${prog ? '\u00B7 ' + prog.name : ''}</div>
      <div class="w-hist-vol">${totalSets} sets \u00B7 ${totalVol.toLocaleString()} ${wtUnit()} volume</div></div>`;
  }).join('') : '<p style="padding:24px;font-size:13px;color:var(--text-muted)">No workouts logged yet.</p>';

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
    const prLine = pr ? `<div class="ex-detail-pr">Your PR: ${pr.weight} ${wtUnit()} \u00D7 ${pr.reps} reps (${pr.date})</div>` : '';
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
  // Not wired to direct log flow (would need workout in progress); redirect to workoutActive
  // as requested — user can add it to today's session manually after implementing a full flow.
  // For now: append to today's workout log if one exists.
  const t = today();
  if (!workoutLog[t]) {
    // Initialize a free-form session
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
// RENDER: DIET
// ══════════════════════════════════════════════════════════════════════════
function getDayMacros() {
  const freshLog = LS.get('hvi_meal_log', {});
  const t = today(), meals = (freshLog[t] || {}).meals || [];
  return meals.reduce((acc, m) => {
    m.items.forEach(it => { acc.cal += it.calories||0; acc.p += it.protein||0; acc.c += it.carbs||0; acc.f += it.fat||0; });
    return acc;
  }, { cal:0, p:0, c:0, f:0 });
}

function renderDiet() {
  mealLog = LS.get('hvi_meal_log', {});
  weightLog = LS.get('hvi_weight_log', {});
  const goals = dietMeta.dailyGoals;
  const m = getDayMacros();
  const meals = (mealLog[today()] || {}).meals || [];

  const rings = [
    { label:'Calories', val:m.cal, goal:goals.calories, color:'var(--cal)', unit:'' },
    { label:'Protein', val:m.p, goal:goals.protein, color:'var(--pro)', unit:'g' },
    { label:'Carbs', val:m.c, goal:goals.carbs, color:'var(--carb)', unit:'g' },
    { label:'Fat', val:m.f, goal:goals.fat, color:'var(--fat)', unit:'g' },
  ].map(r => `<div class="d-ring-item"><div class="d-ring-wrap">${ring(26,r.goal?r.val/r.goal:0,3,r.color)}<div class="d-ring-val">${r.val}</div></div><div class="d-ring-label">${r.label}</div></div>`).join('');

  // Expenditure section
  const tdee = computeTDEE(weightLog, mealLog);
  const avgCal = computeWeeklyAvgCalories(mealLog);
  const goalType = dietMeta.goalType || 'maintain';
  const adaptive = computeAdaptiveTarget(tdee, goalType, weightLog);

  const goalBtns = ['cut','maintain','bulk'].map(g =>
    `<button class="da-goal-btn${g===goalType?' active':''}" onclick="setGoalType('${g}')">${g.toUpperCase()}</button>`
  ).join('');

  let adaptiveRec = '';
  if (adaptive) {
    adaptiveRec = `<div class="da-rec">
      <div class="da-rec-item"><div class="da-rec-val" style="color:var(--cal)">${adaptive.calories}</div><div class="da-rec-lbl">Cal Target</div></div>
      <div class="da-rec-item"><div class="da-rec-val" style="color:var(--pro)">${adaptive.protein}g</div><div class="da-rec-lbl">Protein</div></div>
    </div>
    <div style="text-align:center"><button class="da-apply" onclick="applyAdaptiveTarget()">APPLY</button></div>`;
  }

  const expenditureHTML = `<div class="da-section ani">
    <div class="sec-lbl" style="padding:0 0 10px">Expenditure</div>
    <div class="s-grid" style="margin:0">
      <div class="s-card da-stat"><div class="da-stat-val">${tdee !== null ? tdee.toLocaleString() : '—'}</div><div class="da-stat-lbl">${tdee !== null ? 'Est. TDEE' : 'Log 7+ days to unlock'}</div></div>
      <div class="s-card da-stat"><div class="da-stat-val">${avgCal !== null ? avgCal.toLocaleString() : '—'}</div><div class="da-stat-lbl">Avg Cal (7d)</div></div>
    </div>
    <div class="da-goal-btns">${goalBtns}</div>
    ${adaptiveRec}
  </div>`;

  // Weight section
  const t = today();
  const todayWeight = weightLog[t];
  const recentWeights = Object.entries(weightLog).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 7);
  const recentHTML = recentWeights.length ? recentWeights.map(([d, w]) =>
    `<div class="dw-history-item"><span>${fmtDate(d)}</span><span>${w} ${wtUnit()}</span></div>`
  ).join('') : '<div style="font-size:12px;color:var(--text-dim)">No weights logged yet.</div>';

  const weightHTML = `<div class="dw-section ani">
    <div class="sec-lbl" style="padding:0 0 10px">Weight</div>
    ${todayWeight ? `<div class="dw-logged">Today: <strong>${todayWeight} ${wtUnit()}</strong></div>` : ''}
    <div class="dw-input-row">
      <input class="dw-input" type="number" step="0.1" min="20" max="600" id="wt-input" placeholder="Weight (${wtUnit()})" ${todayWeight ? `value="${todayWeight}"` : ''}>
      <button class="dw-log-btn" onclick="logWeight()">LOG WEIGHT</button>
    </div>
    <div class="dw-history">${recentHTML}</div>
    ${Object.keys(weightLog).length >= 3 ? `<div class="dw-trend-link" onclick="go('dietTrend')">VIEW TREND \u2192</div>` : ''}
  </div>`;

  const mealsHTML = meals.length ? meals.map((ml, mi) => {
    const mCal = ml.items.reduce((s,i) => s + (i.calories||0), 0);
    const mP = ml.items.reduce((s,i) => s + (i.protein||0), 0);
    const itemsHTML = ml.items.map(it => `<div class="d-meal-item">${esc(it.name)} \u2014 ${it.calories}cal, ${it.protein}P, ${it.carbs}C, ${it.fat}F</div>`).join('');
    return `<div class="d-meal"><div class="d-meal-head"><div class="d-meal-name">${esc(ml.name)}</div><div style="display:flex;align-items:center;gap:8px"><div class="d-meal-cal">${mCal} cal</div><button class="d-del-btn" onclick="deleteMeal(${mi})">\u00D7</button></div></div>
      <div class="d-meal-macros">${mP}P</div>${itemsHTML}</div>`;
  }).join('') : '<p style="padding:0 24px;font-size:13px;color:var(--text-muted)">No meals logged today.</p>';

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Nutrition</div><div class="page-sub">Fuel your body with intention.</div></div>
    <div class="d-rings ani">${rings}</div>
    ${expenditureHTML}
    <div class="sec-lbl">Today's Meals</div>
    <div class="ani">${mealsHTML}</div>
    <div style="display:flex;gap:8px;padding:16px 24px 8px">
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('dietAddMeal')">+ Add Meal</button>
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('dietRecipes')">Recipes</button>
    </div>
    <button class="w-action-btn" onclick="go('dietGoals')">Edit Daily Goals</button>
    ${weightHTML}`;
}

function deleteMeal(mi) {
  const t = today();
  if (!mealLog[t]) return;
  mealLog[t].meals.splice(mi, 1);
  LS.set('hvi_meal_log', mealLog);
  go('diet');
}

// ── NATURAL-LANGUAGE MEAL PARSER ──────────────────────────────────────────
const WORD_NUMS = { a:1, an:1, one:1, half:0.5, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
const UNIT_G = { g:1, gr:1, gram:1, grams:1, ml:1, mls:1, milliliter:1, millilitre:1 };
const UNIT_CUP = { cup:240, cups:240 };
const UNIT_TBSP = { tbsp:15, tablespoon:15, tablespoons:15 };
const UNIT_TSP = { tsp:5, teaspoon:5, teaspoons:5 };
const UNIT_OZ = { oz:28.35, ounce:28.35, ounces:28.35 };
const UNIT_LB = { lb:453.6, lbs:453.6, pound:453.6, pounds:453.6 };
const UNIT_EACH = { piece:1, pieces:1, slice:1, slices:1, scoop:1, scoops:1, whole:1, each:1, x:1 };

function _toGrams(qty, unitRaw, food) {
  const u = (unitRaw || '').toLowerCase().replace(/[^a-z]/g,'');
  if (UNIT_G[u])    return qty * UNIT_G[u];
  if (UNIT_CUP[u])  return qty * UNIT_CUP[u];
  if (UNIT_TBSP[u]) return qty * UNIT_TBSP[u];
  if (UNIT_TSP[u])  return qty * UNIT_TSP[u];
  if (UNIT_OZ[u])   return qty * UNIT_OZ[u];
  if (UNIT_LB[u])   return qty * UNIT_LB[u];
  if (UNIT_EACH[u]) return qty * (food.each || 100);
  // no unit → treat as count if food has "each", else grams
  return qty * (food.each ? food.each : 100);
}

function _findFood(text) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  let best = null, bestScore = 0;
  for (const f of FOOD_DB) {
    for (const n of f.names) {
      if (t === n) return f;
      const tHasN = t.includes(n), nHasT = n.includes(t);
      if (tHasN || nHasT) {
        const score = n.length / Math.max(t.length, n.length);
        if (score > bestScore) { bestScore = score; best = f; }
      }
    }
  }
  return bestScore >= 0.35 ? best : null;
}

function _parseChunk(chunk) {
  let s = chunk.toLowerCase().trim();
  // Remove leading "a", "an", filler words
  s = s.replace(/^(some|about|approx\.?|approximately)\s+/i, '');

  // Match: <qty> <unit> <food> OR <qty> <food>
  const re = /^([0-9]+(?:[.,][0-9]+)?|[a-z]+)\s+([a-z]+)?\s*(?:of\s+)?(.+)$/;
  const m = s.match(re);
  let qty = 1, unit = '', foodText = s;

  if (m) {
    const rawQty = m[1];
    const tok2   = (m[2] || '').toLowerCase();
    const rest   = (m[3] || '').toLowerCase().trim();

    // Is rawQty a number or word-number?
    const numVal = parseFloat(rawQty.replace(',','.'));
    const wordVal = WORD_NUMS[rawQty.toLowerCase()];
    if (!isNaN(numVal)) {
      qty = numVal;
      // Is tok2 a unit?
      const unitCheck = tok2.replace(/[^a-z]/g,'');
      const allUnits = {...UNIT_G,...UNIT_CUP,...UNIT_TBSP,...UNIT_TSP,...UNIT_OZ,...UNIT_LB,...UNIT_EACH};
      if (allUnits[unitCheck]) { unit = unitCheck; foodText = rest; }
      else { foodText = (tok2 + ' ' + rest).trim(); }
    } else if (wordVal !== undefined) {
      qty = wordVal;
      const unitCheck = tok2.replace(/[^a-z]/g,'');
      const allUnits = {...UNIT_G,...UNIT_CUP,...UNIT_TBSP,...UNIT_TSP,...UNIT_OZ,...UNIT_LB,...UNIT_EACH};
      if (allUnits[unitCheck]) { unit = unitCheck; foodText = rest; }
      else { foodText = (tok2 + ' ' + rest).trim(); }
    }
  }

  const food = _findFood(foodText);
  if (!food) return null;

  const grams = _toGrams(qty, unit, food);
  const scale = grams / 100;
  const label = chunk.trim().replace(/\s+/g,' ');
  return {
    name: label.charAt(0).toUpperCase() + label.slice(1),
    calories: Math.round(food.cal * scale),
    protein:  Math.round(food.pro * scale * 10) / 10,
    carbs:    Math.round(food.carb * scale * 10) / 10,
    fat:      Math.round(food.fat * scale * 10) / 10,
  };
}

// Robustly extract the first complete JSON array using bracket depth matching
function _extractJsonArray(str) {
  const start = str.indexOf('[');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc2 = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (esc2)          { esc2 = false; continue; }
    if (c === '\\' && inStr) { esc2 = true; continue; }
    if (c === '"')     { inStr = !inStr; continue; }
    if (inStr)         continue;
    if (c === '[')     depth++;
    if (c === ']') { depth--; if (depth === 0) return str.slice(start, i + 1); }
  }
  return null;
}

async function calculateMealDescription() {
  const ta = document.getElementById('describe-textarea');
  const out = document.getElementById('describe-output');
  const btn = document.getElementById('calc-macros-btn');
  if (!ta || !out) return;
  const text = ta.value.trim();
  if (!text) { out.innerHTML = '<p class="dm-hint">Describe what you ate above.</p>'; return; }

  out.innerHTML = '<p class="dm-hint" style="text-align:center">✦ Calculating macros…</p>';
  if (btn) { btn.disabled = true; btn.textContent = 'Calculating…'; }

  try {
    const sysPrompt =
      'You are a precise nutrition calculator. ' +
      'The user will describe any food or meal in any format — vague, detailed, slang, restaurant items, branded foods, anything. ' +
      'Your job: estimate the macros for everything described and return ONLY a JSON array. No prose, no markdown, no explanations. ' +
      'Format: [{"name":"<food>","calories":<kcal>,"protein":<g>,"carbs":<g>,"fat":<g>},...] ' +
      'Rules: calories and all macros must be integers. Use typical serving sizes if not specified. ' +
      'If the user mentions a quantity (e.g. "2 eggs", "large pizza"), scale accordingly — list it as one item with total macros. ' +
      'If something is truly unidentifiable, make your best estimate. Never refuse or add text outside the JSON array. ' +
      'Example input: "bowl of oats with banana and honey" ' +
      'Example output: [{"name":"Oats (80g)","calories":300,"protein":10,"carbs":54,"fat":6},{"name":"Banana","calories":89,"protein":1,"carbs":23,"fat":0},{"name":"Honey (1 tbsp)","calories":64,"protein":0,"carbs":17,"fat":0}]';

    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: text }
        ],
        model: 'openai',
        seed: 42,
        private: true
      })
    });

    const raw = await res.text();
    // Strip any markdown fences, then use bracket-depth extraction
    const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonStr = _extractJsonArray(clean);
    if (!jsonStr) {
      out.innerHTML = `<p class="dm-hint dm-warn">Could not find JSON in response. Raw: ${esc(raw.slice(0,300))}</p>`;
      return;
    }
    let items;
    try { items = JSON.parse(jsonStr); } catch(pe) {
      out.innerHTML = `<p class="dm-hint dm-warn">Parse error: ${esc(String(pe))}. Raw: ${esc(raw.slice(0,300))}</p>`;
      return;
    }
    if (!Array.isArray(items) || !items.length) throw new Error('Empty result');

    _parsedMealItems = items.map(it => ({
      name:     String(it.name || 'Food'),
      calories: Math.round(Number(it.calories) || 0),
      protein:  Math.round(Number(it.protein)  || 0),
      carbs:    Math.round(Number(it.carbs)     || 0),
      fat:      Math.round(Number(it.fat)       || 0),
    }));
    _renderParsedItems(out);
  } catch(e) {
    out.innerHTML = `<p class="dm-hint dm-warn">Error: ${esc(String(e))}. Check connection and try again.</p>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'CALCULATE MACROS'; }
  }
}

function _renderParsedItems(out) {
  if (!out) out = document.getElementById('describe-output');
  if (!out) return;
  if (!_parsedMealItems.length) { out.innerHTML = ''; return; }
  const rows = _parsedMealItems.map((it, i) => `
    <div class="dm-row">
      <div class="dm-row-name">${esc(it.name)}</div>
      <div class="dm-row-macros">${it.calories} cal · ${it.protein}P · ${it.carbs}C · ${it.fat}F</div>
      <button class="dm-remove" onclick="_parsedMealItems.splice(${i},1);_renderParsedItems()">×</button>
    </div>`).join('');
  const total = _parsedMealItems.reduce((s,i) => s + i.calories, 0);
  out.innerHTML = `${rows}
    <div class="dm-total">${total} cal total</div>
    <button class="w-action-btn" style="width:100%;margin-top:10px" onclick="addAllDescribed()">ADD ALL TO MEAL</button>`;
}

function addAllDescribed() {
  if (!_parsedMealItems.length) return;
  curMealItems.push(..._parsedMealItems);
  _parsedMealItems = [];
  go('dietAddMeal');
}

function renderDietAddMeal() {
  const types = ['Breakfast','Lunch','Dinner','Snack'];
  const typeBtns = types.map(t => `<button class="d-type-btn${t===curMealType?' active':''}" onclick="setMealType('${t}')">${t}</button>`).join('');

  const itemsList = curMealItems.length ? curMealItems.map((it, i) =>
    `<div class="d-fi"><span>${esc(it.name)}</span><div style="display:flex;align-items:center;gap:8px"><span class="d-fi-macros">${it.calories}cal ${it.protein}P ${it.carbs}C ${it.fat}F</span><button class="d-del-btn" onclick="removeFoodItem(${i})">\u00D7</button></div></div>`
  ).join('') : '<p style="font-size:12px;color:var(--text-muted);padding:8px 0">No items added yet.</p>';

  const totalCal = curMealItems.reduce((s,i) => s + i.calories, 0);

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="curMealItems=[];selectedFood100g=null;go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Add Meal</div><div class="page-sub">Log what you ate.</div></div>
    <div class="d-type-btns">${typeBtns}</div>
    <div style="padding:0 24px">
      <div class="sec-lbl" style="padding:0 0 8px">Items${curMealItems.length ? ` \u00B7 ${totalCal} cal total` : ''}</div>
      <div class="d-items-list">${itemsList}</div>

      <div class="dm-section">
        <div class="dm-header">
          <span class="dm-icon">✦</span>
          <span class="dm-header-text">Describe your meal</span>
          <span class="dm-header-sub">Instant macro calc</span>
        </div>
        <textarea class="dm-textarea" id="describe-textarea" rows="3" placeholder="e.g. Big Mac and large fries, a bowl of pasta with chicken, 2 eggs and toast with butter…"></textarea>
        <button class="w-action-btn" id="calc-macros-btn" style="width:100%;margin:8px 0 0" onclick="calculateMealDescription()">CALCULATE MACROS</button>
        <div id="describe-output" class="dm-output"></div>
      </div>

      <div class="sec-lbl" style="padding:12px 0 8px">Or Search Foods</div>
      <div class="fs-input-row">
        <input class="d-input" type="text" id="food-search-input" placeholder="Search foods... e.g. chicken breast" style="flex:1;margin:0" onkeydown="if(event.key==='Enter')doFoodSearch()">
        <button class="fs-search-btn" id="food-search-btn" onclick="doFoodSearch()">SEARCH</button>
      </div>
      <div class="ani" id="food-search-results"></div>

      <div class="j-lbl">Add Item</div>
      <div id="food-grams-wrap" style="display:${selectedFood100g ? 'flex' : 'none'}" class="fs-grams-row">
        <span class="fs-grams-label">Amount (g)</span>
        <input class="d-input" type="number" id="food-grams" value="100" min="1" max="2000" step="1" style="flex:1;margin:0" oninput="scaleFoodMacros()">
      </div>
      <input class="d-input" type="text" id="fi-name" placeholder="Food name (e.g. Chicken breast 200g)">
      <div class="d-input-row">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-cal" placeholder="Cal">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-p" placeholder="Protein">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-c" placeholder="Carbs">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-f" placeholder="Fat">
      </div>
      <button class="w-action-btn" style="width:100%;margin:12px 0" onclick="addFoodItem()">ADD ITEM</button>
      <button class="w-action-btn" style="width:100%;margin:0 0 12px;background:rgba(110,159,212,0.1);border-color:var(--pro);color:var(--pro)" onclick="go('dietRecipes')">QUICK ADD FROM RECIPES \u2192</button>
    </div>
    <button class="w-finish" onclick="saveMeal()"${curMealItems.length?'':' style="opacity:0.4;pointer-events:none"'}>SAVE MEAL</button>`;
}

function setMealType(t) { curMealType = t; go('dietAddMeal'); }

async function doFoodSearch() {
  const input = document.getElementById('food-search-input');
  const container = document.getElementById('food-search-results');
  if (!input || !container) return;
  const q = input.value.trim();
  if (q.length < 2) { container.innerHTML = '<div class="fs-status">Type at least 2 characters.</div>'; return; }
  container.innerHTML = '<div class="fs-status">Searching\u2026</div>';
  const results = await searchFoods(q);
  if (!results.length) {
    container.innerHTML = '<div class="fs-status">No results found. Enter manually below.</div>';
    return;
  }
  container.innerHTML = results.map((r, i) =>
    `<div class="fs-row" id="fs-row-${i}" onclick="selectFoodResult(${i})">
      <div class="fs-row-name">${esc(r.name)}</div>
      <div class="fs-row-macros">${Math.round(r.cal100g)} kcal \u00B7 ${Math.round(r.protein100g)}g P \u00B7 ${Math.round(r.carbs100g)}g C \u00B7 ${Math.round(r.fat100g)}g F  (per 100g)</div>
    </div>`
  ).join('');
  container._results = results;
}

function selectFoodResult(idx) {
  const container = document.getElementById('food-search-results');
  if (!container || !container._results) return;
  const r = container._results[idx];
  if (!r) return;
  selectedFood100g = { cal: r.cal100g, protein: r.protein100g, carbs: r.carbs100g, fat: r.fat100g };
  container.querySelectorAll('.fs-row').forEach((el, i) => el.classList.toggle('selected', i === idx));
  const nameEl = document.getElementById('fi-name');
  if (nameEl) nameEl.value = r.name;
  const gramsWrap = document.getElementById('food-grams-wrap');
  if (gramsWrap) gramsWrap.style.display = 'flex';
  const gramsEl = document.getElementById('food-grams');
  if (gramsEl) gramsEl.value = '100';
  scaleFoodMacros();
  const nameField = document.getElementById('fi-name');
  if (nameField) nameField.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function scaleFoodMacros() {
  if (!selectedFood100g) return;
  const grams = parseFloat(document.getElementById('food-grams')?.value) || 100;
  const scale = grams / 100;
  const calEl = document.getElementById('fi-cal'), pEl = document.getElementById('fi-p'), cEl = document.getElementById('fi-c'), fEl = document.getElementById('fi-f');
  if (calEl) calEl.value = Math.round(selectedFood100g.cal * scale * 10) / 10;
  if (pEl) pEl.value = Math.round(selectedFood100g.protein * scale * 10) / 10;
  if (cEl) cEl.value = Math.round(selectedFood100g.carbs * scale * 10) / 10;
  if (fEl) fEl.value = Math.round(selectedFood100g.fat * scale * 10) / 10;
}

function addFoodItem() {
  const name = document.getElementById('fi-name')?.value?.trim();
  if (!name) return;
  curMealItems.push({
    name,
    calories: parseFloat(document.getElementById('fi-cal')?.value) || 0,
    protein: parseFloat(document.getElementById('fi-p')?.value) || 0,
    carbs: parseFloat(document.getElementById('fi-c')?.value) || 0,
    fat: parseFloat(document.getElementById('fi-f')?.value) || 0,
  });
  selectedFood100g = null;
  go('dietAddMeal');
}

function removeFoodItem(i) { curMealItems.splice(i, 1); go('dietAddMeal'); }

function saveMeal() {
  if (!curMealItems.length) return;
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({ id: 'm_' + Date.now(), name: curMealType, items: [...curMealItems] });
  LS.set('hvi_meal_log', mealLog);
  awardXP(15, 'body');
  const _dm = getDayMacros();
  if (dietMeta.dailyGoals.protein > 0 && _dm.p >= dietMeta.dailyGoals.protein * 0.9) trackWeeklyProtein();
  checkDailyQuests();
  curMealItems = [];
  selectedFood100g = null;
  go('diet');
}

function renderDietRecipes() {
  const cats = ['Breakfast','Lunch','Dinner','Snack'];
  const groups = cats.map(cat => {
    const recs = RECIPES.filter(r => r.cat === cat);
    if (!recs.length) return '';
    return `<div class="sec-lbl" style="padding-top:16px">${cat}</div>` + recs.map(r => `
      <div class="d-recipe-card" onclick="go('dietRecipeDetail',{recipeId:'${r.id}'})">
        <div class="d-recipe-name">${r.name}</div>
        <div class="d-recipe-macros-row">${r.cal} cal \u00B7 ${r.p}P \u00B7 ${r.c}C \u00B7 ${r.f}F</div>
      </div>`).join('');
  }).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Recipes</div><div class="page-sub">Quick meal ideas with macros.</div></div>
    <div class="d-recipe-grid ani">${groups}</div>`;
}

function renderDietRecipeDetail() {
  const r = RECIPES.find(x => x.id === curRecipeId);
  if (!r) { go('dietRecipes'); return; }
  const ingHTML = r.ing.map(i => `\u2022 ${esc(i)}`).join('<br>');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('dietRecipes')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">${esc(r.name)}</div>
      <div class="page-sub">${r.cal} cal \u00B7 ${r.p}g protein \u00B7 ${r.c}g carbs \u00B7 ${r.f}g fat</div></div>
    <div class="d-recipe-detail ani">
      <div class="sec-lbl" style="padding:0 0 8px">Ingredients</div>
      <div class="d-recipe-ing">${ingHTML}</div>
      <div class="sec-lbl" style="padding:16px 0 8px">Instructions</div>
      <div class="d-recipe-steps">${esc(r.steps)}</div>
    </div>
    <button class="w-finish" onclick="logRecipe('${r.id}')">Add to Today's Meals</button>`;
}

function logRecipe(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({
    id: 'm_' + Date.now(),
    name: r.cat,
    items: [{ name: r.name, calories: r.cal, protein: r.p, carbs: r.c, fat: r.f }]
  });
  LS.set('hvi_meal_log', mealLog);
  go('diet');
}

function renderDietGoals() {
  const g = dietMeta.dailyGoals;
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Daily Goals</div><div class="page-sub">Set your daily macro targets.</div></div>
    <div class="d-goals-form ani">
      <div class="d-goals-row"><div class="d-goals-label">Calories</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-cal" value="${g.calories}"></div>
      <div class="d-goals-row"><div class="d-goals-label">Protein</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-p" value="${g.protein}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
      <div class="d-goals-row"><div class="d-goals-label">Carbs</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-c" value="${g.carbs}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
      <div class="d-goals-row"><div class="d-goals-label">Fat</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-f" value="${g.fat}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
    </div>
    <button class="w-action-btn" style="margin-bottom:0" onclick="go('dietTDEE')">TDEE CALCULATOR</button>
    <button class="w-finish" onclick="saveDietGoals()">SAVE GOALS</button>`;
}

function saveDietGoals() {
  dietMeta.dailyGoals = {
    calories: parseInt(document.getElementById('dg-cal')?.value) || 2500,
    protein: parseInt(document.getElementById('dg-p')?.value) || 180,
    carbs: parseInt(document.getElementById('dg-c')?.value) || 280,
    fat: parseInt(document.getElementById('dg-f')?.value) || 80,
  };
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

// ── TDEE CALCULATOR ──────────────────────────────────────────────────────
function injectTDEEStyles() {
  if (document.getElementById('tdee-styles')) return;
  const s = document.createElement('style');
  s.id = 'tdee-styles';
  s.textContent = `
    .tp-pill{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:var(--surface);color:var(--text);cursor:pointer;width:100%;text-align:left;margin-bottom:6px;font-size:13px;letter-spacing:0.05em;transition:all .2s}
    .tp-pill.active{background:var(--surface2);border-color:var(--accent-b)}
    .tp-pill-sub{font-size:11px;color:var(--text-dim);text-align:right;max-width:55%}
    .tp-sex-row{display:flex;gap:8px;margin-bottom:8px}
    .tp-sex-btn{flex:1;padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:var(--surface);color:var(--text);cursor:pointer;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:center;transition:all .2s}
    .tp-sex-btn.active{border-color:var(--accent);color:var(--accent-b)}
    .tp-input-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .tp-input-card{background:var(--surface2);border-radius:10px;padding:12px}
    .tp-input-label{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .tp-input{width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:var(--surface);color:var(--text);font-size:15px;box-sizing:border-box}
    .tp-result-box{background:var(--surface2);border-radius:14px;padding:20px;margin-top:16px;text-align:center}
    .tp-tdee-label{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px}
    .tp-tdee-num{font-family:var(--serif);font-size:48px;color:var(--accent-b);margin:8px 0}
    .tp-tdee-unit{font-size:12px;color:var(--text-dim)}
    .tp-macro-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .tp-macro-card{background:var(--surface);border-radius:10px;padding:12px;text-align:center}
    .tp-macro-val{font-size:20px;font-weight:700;font-family:var(--serif)}
    .tp-macro-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
    .tp-error{color:var(--fat);font-size:13px;padding:8px 0;text-align:center}
    .tp-confirm{color:var(--carb);font-size:13px;padding:8px 0;text-align:center}
  `;
  document.head.appendChild(s);
}

let _tdeeSex = 'male', _tdeeActivity = 'moderate', _tdeeGoal = 'maintain';

function renderDietTDEE() {
  injectTDEEStyles();
  if (tdeeProfile) {
    _tdeeSex = tdeeProfile.sex || 'male';
    _tdeeActivity = tdeeProfile.activity || 'moderate';
    _tdeeGoal = tdeeProfile.goal || 'maintain';
  }

  const activities = [
    ['sedentary', 'SEDENTARY', 'Desk job, little or no exercise'],
    ['light', 'LIGHTLY ACTIVE', 'Light exercise 1\u20133 days/week'],
    ['moderate', 'MODERATELY ACTIVE', 'Moderate exercise 3\u20135 days/week'],
    ['active', 'VERY ACTIVE', 'Hard exercise 6\u20137 days/week'],
    ['very_active', 'EXTREMELY ACTIVE', 'Physical job + hard training'],
  ];
  const goals = [
    ['cut', 'AGGRESSIVE CUT', '\u2212500 cal deficit'],
    ['cut_mild', 'MILD CUT', '\u2212250 cal deficit'],
    ['maintain', 'MAINTAIN', 'Eat at TDEE'],
    ['bulk_lean', 'LEAN BULK', '+250 cal surplus'],
    ['bulk', 'BULK', '+500 cal surplus'],
  ];

  const actHTML = activities.map(([k, lbl, sub]) =>
    `<button class="tp-pill tp-act${_tdeeActivity===k?' active':''}" onclick="_tdeeActivity='${k}';document.querySelectorAll('.tp-act').forEach(e=>e.classList.remove('active'));this.classList.add('active')">
      <span>${lbl}</span><span class="tp-pill-sub">${sub}</span></button>`
  ).join('');

  const goalHTML = goals.map(([k, lbl, sub]) =>
    `<button class="tp-pill tp-goal${_tdeeGoal===k?' active':''}" onclick="_tdeeGoal='${k}';document.querySelectorAll('.tp-goal').forEach(e=>e.classList.remove('active'));this.classList.add('active')">
      <span>${lbl}</span><span class="tp-pill-sub">${sub}</span></button>`
  ).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('dietGoals')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">TDEE Calculator</div><div class="page-sub">Find your daily energy target.</div></div>

    <div style="padding:0 24px">
      <div class="sec-lbl ani" style="padding-top:8px">Your Stats</div>
      <div class="tp-sex-row ani">
        <button class="tp-sex-btn${_tdeeSex==='male'?' active':''}" id="tdee-male" onclick="_tdeeSex='male';document.getElementById('tdee-male').classList.add('active');document.getElementById('tdee-female').classList.remove('active')">MALE</button>
        <button class="tp-sex-btn${_tdeeSex==='female'?' active':''}" id="tdee-female" onclick="_tdeeSex='female';document.getElementById('tdee-female').classList.add('active');document.getElementById('tdee-male').classList.remove('active')">FEMALE</button>
      </div>
      <div class="tp-input-grid ani">
        <div class="tp-input-card"><div class="tp-input-label">Age (years)</div><input class="tp-input" type="number" id="tdee-age" min="10" max="100" value="${tdeeProfile?.age||''}"></div>
        <div class="tp-input-card"><div class="tp-input-label">Weight (kg)</div><input class="tp-input" type="number" id="tdee-weight" min="20" max="300" step="0.1" value="${tdeeProfile?.weight_kg||''}"></div>
        <div class="tp-input-card"><div class="tp-input-label">Height (cm)</div><input class="tp-input" type="number" id="tdee-height" min="100" max="250" value="${tdeeProfile?.height_cm||''}"></div>
      </div>

      <div class="sec-lbl ani" style="padding-top:20px">Activity Level</div>
      <div class="ani">${actHTML}</div>

      <div class="sec-lbl ani" style="padding-top:20px">Your Goal</div>
      <div class="ani">${goalHTML}</div>
    </div>

    <button class="w-finish" onclick="calculateTDEE()">CALCULATE</button>
    <div id="tdee-error"></div>
    <div id="tdee-results"></div>`;
}

function calculateTDEE() {
  const age = parseFloat(document.getElementById('tdee-age')?.value);
  const weight = parseFloat(document.getElementById('tdee-weight')?.value);
  const height = parseFloat(document.getElementById('tdee-height')?.value);
  const errEl = document.getElementById('tdee-error');
  const resEl = document.getElementById('tdee-results');

  if (!age || !weight || !height || age < 10 || weight < 20 || height < 100) {
    if (errEl) errEl.innerHTML = '<div class="tp-error">Please fill in all fields before calculating.</div>';
    if (resEl) resEl.innerHTML = '';
    return;
  }
  if (errEl) errEl.innerHTML = '';

  // Mifflin-St Jeor
  const bmr = (10 * weight) + (6.25 * height) - (5 * age) + (_tdeeSex === 'male' ? 5 : -161);
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee = Math.round(bmr * (multipliers[_tdeeActivity] || 1.55));
  const offsets = { cut: -500, cut_mild: -250, maintain: 0, bulk_lean: 250, bulk: 500 };
  const target = tdee + (offsets[_tdeeGoal] || 0);
  const splits = {
    cut:       { p: 0.35, c: 0.35, f: 0.30 },
    cut_mild:  { p: 0.35, c: 0.35, f: 0.30 },
    maintain:  { p: 0.30, c: 0.40, f: 0.30 },
    bulk_lean: { p: 0.30, c: 0.45, f: 0.25 },
    bulk:      { p: 0.25, c: 0.50, f: 0.25 },
  };
  const sp = splits[_tdeeGoal] || splits.maintain;
  const protein_g = Math.round((target * sp.p) / 4);
  const carbs_g = Math.round((target * sp.c) / 4);
  const fat_g = Math.round((target * sp.f) / 9);

  // Save profile
  tdeeProfile = { age, sex: _tdeeSex, weight_kg: weight, height_cm: height, activity: _tdeeActivity, goal: _tdeeGoal };
  LS.set('hvi_tdee_profile', tdeeProfile);

  resEl.innerHTML = `
    <div class="tp-result-box ani">
      <div class="tp-tdee-label">YOUR TDEE</div>
      <div class="tp-tdee-num">${tdee.toLocaleString()}</div>
      <div class="tp-tdee-unit">calories / day</div>

      <div class="s-grid" style="margin:16px 0 0">
        <div class="s-card"><div class="s-val">${Math.round(bmr).toLocaleString()}</div><div class="s-lbl">BMR</div></div>
        <div class="s-card"><div class="s-val">${tdee.toLocaleString()}</div><div class="s-lbl">TDEE</div></div>
        <div class="s-card"><div class="s-val">${target.toLocaleString()}</div><div class="s-lbl">Target</div></div>
      </div>

      <div class="sec-lbl" style="padding:20px 0 8px;text-align:left">Recommended Macros</div>
      <div class="tp-macro-grid">
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--cal)">${target.toLocaleString()}</div><div class="tp-macro-lbl">Calories</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--pro)">${protein_g}g</div><div class="tp-macro-lbl">Protein</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--carb)">${carbs_g}g</div><div class="tp-macro-lbl">Carbs</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--fat)">${fat_g}g</div><div class="tp-macro-lbl">Fat</div></div>
      </div>
    </div>
    <button class="w-finish" onclick="applyTDEEGoals(${target},${protein_g},${carbs_g},${fat_g})">APPLY TO GOALS</button>
    <div id="tdee-confirm"></div>`;

  resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyTDEEGoals(cal, p, c, f) {
  dietMeta.dailyGoals = { calories: cal, protein: p, carbs: c, fat: f };
  LS.set('hvi_diet_meta', dietMeta);
  const el = document.getElementById('tdee-confirm');
  if (el) {
    el.innerHTML = '<div class="tp-confirm">\u2713 Goals updated</div>';
    setTimeout(() => { if (el) el.innerHTML = ''; }, 2000);
  }
}

// ── ADAPTIVE NUTRITION ACTIONS ────────────────────────────────────────────
function logWeight() {
  const val = parseFloat(document.getElementById('wt-input')?.value);
  if (!val || val < 20 || val > 300) return;
  weightLog[today()] = val;
  LS.set('hvi_weight_log', weightLog);
  go('diet');
}

function setGoalType(type) {
  dietMeta.goalType = type;
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

function applyAdaptiveTarget() {
  const tdee = computeTDEE(weightLog, mealLog);
  const adaptive = computeAdaptiveTarget(tdee, dietMeta.goalType || 'maintain', weightLog);
  if (!adaptive) return;
  dietMeta.dailyGoals.calories = adaptive.calories;
  dietMeta.dailyGoals.protein = adaptive.protein;
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

function renderDietTrend() {
  weightLog = LS.get('hvi_weight_log', {});
  const trend = computeTrend(weightLog);

  let chartHTML = '';
  if (trend.length < 3) {
    chartHTML = '<div class="dt-placeholder">Log your weight daily to see your trend.</div>';
  } else {
    const W = 320, H = 160, ML = 30, MB = 20;
    const cW = W - ML, cH = H - MB;
    const rawVals = trend.map(t => t.raw);
    const minW = Math.min(...rawVals) - 2, maxW = Math.max(...rawVals) + 2;
    const range = maxW - minW || 1;

    const x = i => ML + (i / (trend.length - 1)) * cW;
    const y = v => cH - ((v - minW) / range) * cH;

    const dots = trend.map((t, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(t.raw).toFixed(1)}" r="3" fill="var(--text-dim)" opacity="0.4"/>`).join('');
    const linePts = trend.map((t, i) => `${x(i).toFixed(1)},${y(t.ema).toFixed(1)}`).join(' ');
    const firstDate = trend[0].date.slice(5);
    const lastDate = trend[trend.length - 1].date.slice(5);

    chartHTML = `<div class="dt-chart ani">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
        <line x1="${ML}" y1="${cH}" x2="${W}" y2="${cH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <line x1="${ML}" y1="0" x2="${ML}" y2="${cH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <text x="${ML}" y="${H - 4}" fill="var(--text-dim)" font-size="9">${firstDate}</text>
        <text x="${W}" y="${H - 4}" fill="var(--text-dim)" font-size="9" text-anchor="end">${lastDate}</text>
        <text x="${ML - 4}" y="12" fill="var(--text-dim)" font-size="9" text-anchor="end">${maxW.toFixed(1)}</text>
        <text x="${ML - 4}" y="${cH}" fill="var(--text-dim)" font-size="9" text-anchor="end">${minW.toFixed(1)}</text>
        ${dots}
        <polyline points="${linePts}" fill="none" stroke="var(--accent-b)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    </div>`;
  }

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Weight Trend</div><div class="page-sub">Raw weights &amp; smoothed EMA trend.</div></div>
    ${chartHTML}`;
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

function renderLibraryJournal(tabs) {
  const t = today();
  const e = journal[t] || { wins:'', lessons:'', intentions:'' };
  const pastDates = Object.keys(journal).filter(d => d !== t && Object.values(journal[d]).some(Boolean)).sort().reverse().slice(0, 20);
  const pastHTML = pastDates.length ? pastDates.map(d => {
    const je = journal[d]; let parts = '';
    if (je.wins) parts += `<div class="jp-field">Wins</div><div class="jp-text">${esc(je.wins)}</div>`;
    if (je.lessons) parts += `<div class="jp-field">Lessons</div><div class="jp-text">${esc(je.lessons)}</div>`;
    if (je.intentions) parts += `<div class="jp-field">Intentions</div><div class="jp-text">${esc(je.intentions)}</div>`;
    return `<div class="jp-item"><div class="jp-date">${fmtDate(d)}</div>${parts}</div>`;
  }).join('') : '<p style="font-size:13px;color:var(--text-muted);padding:8px 0">No past entries yet.</p>';

  document.getElementById('view').innerHTML = `
    <div class="jh ani"><div class="jh-title">Library</div><div class="jh-sub">Reflect on your day. Recalibrate for tomorrow.</div></div>
    ${tabs}
    <div class="j-body ani">
      <div class="j-lbl">Wins Today</div><textarea class="j-ta" id="j-wins" placeholder="What went well?" rows="3">${esc(e.wins||'')}</textarea>
      <div class="j-lbl">Lessons Learned</div><textarea class="j-ta" id="j-lessons" placeholder="What did you learn?" rows="3">${esc(e.lessons||'')}</textarea>
      <div class="j-lbl">Intentions for Tomorrow</div><textarea class="j-ta" id="j-intentions" placeholder="What will you focus on?" rows="3">${esc(e.intentions||'')}</textarea>
      <div class="j-status" id="j-status">Auto-saving</div>
      <button class="j-tog" onclick="togglePast()">Past Entries</button>
      <div class="j-past" id="j-past">${pastHTML}</div>
    </div>`;

  ['wins','lessons','intentions'].forEach(f => {
    const el = document.getElementById(`j-${f}`);
    if (el) el.addEventListener('input', () => {
      clearTimeout(jDebounce);
      const s = document.getElementById('j-status');
      if (s) { s.textContent = 'Saving\u2026'; s.classList.remove('saved'); }
      jDebounce = setTimeout(saveJournal, 800);
    });
  });
}

function saveJournal() {
  const t = today();
  journal[t] = {
    wins: (document.getElementById('j-wins')?.value || '').trim(),
    lessons: (document.getElementById('j-lessons')?.value || '').trim(),
    intentions: (document.getElementById('j-intentions')?.value || '').trim(),
  };
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
// RENDER: STATS
// ══════════════════════════════════════════════════════════════════════════
// ── Avatar builder ────────────────────────────────────────────────────────
function buildAvatarSVG(lvl) {
  const stage = lvl >= 20 ? 6 : lvl >= 12 ? 5 : lvl >= 8 ? 4 : lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
  const uid = `av${stage}_${lvl}`;
  const sk = '#fbd5b5', skS = '#e8a87c'; // skin, skin shadow

  // Per-stage: hair color/highlight, eye iris/pupil/glow, outfit main/accent, aura color/opacity, particle count
  const C = [null,
    { hc:'#2d1b0e', hh:'#5c3a1e', ec:'#3d2412', ep:'#150800', eg:null,    oc:'#374151', oa:'#1f2937', ac:null,    ao:0,   pn:0 },
    { hc:'#7c3a0e', hh:'#c47a3a', ec:'#92400e', ep:'#3d1500', eg:null,    oc:'#78350f', oa:'#451a03', ac:'#b45309', ao:.09, pn:0 },
    { hc:'#b84c00', hh:'#f97316', ec:'#d97706', ep:'#7c2d00', eg:'#fb923c', oc:'#7c2d12', oa:'#450a00', ac:'#f97316', ao:.15, pn:4 },
    { hc:'#b45309', hh:'#fde68a', ec:'#fbbf24', ep:'#78350f', eg:'#fde68a', oc:'#991b1b', oa:'#7c2d12', ac:'#fbbf24', ao:.20, pn:8 },
    { hc:'#1e3a8a', hh:'#93c5fd', ec:'#60a5fa', ep:'#1e3a8a', eg:'#bfdbfe', oc:'#1e3a8a', oa:'#172554', ac:'#60a5fa', ao:.22, pn:12 },
    { hc:'#d97706', hh:'#fef9c3', ec:'#e0f2fe', ep:'#1e40af', eg:'#ffffff', oc:'#1e3a8a', oa:'#d97706', ac:'#fbbf24', ao:.35, pn:16 },
  ][stage];

  // SVG filters
  const glowFilter = `<filter id="${uid}g" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="2.5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
  const eyeFilter = C.eg ? `<filter id="${uid}e" x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur stdDeviation="3.5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>` : '';

  // Aura behind character
  const auraRx = 36 + stage * 5, auraRy = 24 + stage * 4;
  const aura = C.ac ? `<ellipse cx="50" cy="82" rx="${auraRx}" ry="${auraRy}" fill="${C.ac}" opacity="${C.ao}">
    <animate attributeName="ry" values="${auraRy};${auraRy+6};${auraRy}" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="${C.ao};${(C.ao*.45).toFixed(2)};${C.ao}" dur="3s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="50" cy="82" rx="${auraRx+8}" ry="${auraRy+6}" fill="none" stroke="${C.ac}" stroke-width="0.8" opacity="${(C.ao*.6).toFixed(2)}">
    <animate attributeName="opacity" values="${(C.ao*.6).toFixed(2)};0.02;${(C.ao*.6).toFixed(2)}" dur="2.5s" repeatCount="indefinite"/>
  </ellipse>` : '';

  // Floating particles (higher stages)
  let parts = '';
  for (let i = 0; i < C.pn; i++) {
    const a = (i / C.pn) * Math.PI * 2;
    const r = 38 + (i % 3) * 9;
    const cx = (50 + Math.cos(a) * r).toFixed(1);
    const cy = (82 + Math.sin(a) * r * 0.55).toFixed(1);
    const sz = i % 5 === 0 ? 2.4 : 1.5;
    const dur = (1.4 + (i % 5) * 0.4).toFixed(1);
    parts += `<circle cx="${cx}" cy="${cy}" r="${sz}" fill="${C.ac}" opacity="0.55">
      <animate attributeName="opacity" values="0.55;0.1;0.55" dur="${dur}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="${sz};${(sz*1.6).toFixed(1)};${sz}" dur="${dur}s" repeatCount="indefinite"/>
    </circle>`;
  }

  // ── HAIR (back layer, drawn behind head) ─────────────────────────────
  let hB = '', hF = ''; // hair back, hair front (bangs)

  if (stage === 1) {
    // Short, tidy dark hair
    hB = `<path d="M 23 58 Q 22 22 50 19 Q 78 22 77 58 Q 69 34 50 32 Q 31 34 23 58 Z" fill="${C.hc}"/>
      <ellipse cx="23" cy="62" rx="4.5" ry="6.5" fill="${C.hc}"/>
      <ellipse cx="77" cy="62" rx="4.5" ry="6.5" fill="${C.hc}"/>`;
    hF = `<path d="M 30 45 Q 33 30 44 35 Q 41 47 35 49 Z" fill="${C.hc}"/>
      <path d="M 70 45 Q 67 30 56 35 Q 59 47 65 49 Z" fill="${C.hc}"/>
      <path d="M 40 31 Q 50 25 60 31 Q 55 37 50 34 Q 45 37 40 31 Z" fill="${C.hc}"/>`;

  } else if (stage === 2) {
    // Medium with swept bang + ahoge spike
    hB = `<path d="M 22 58 Q 21 20 50 17 Q 79 20 78 58 Q 70 32 50 29 Q 30 32 22 58 Z" fill="${C.hc}"/>
      <path d="M 46 19 Q 43 3 50 1 Q 57 3 54 19 Z" fill="${C.hc}"/>
      <path d="M 22 58 Q 17 70 19 82 Q 23 84 25 72 Q 24 65 22 58 Z" fill="${C.hc}"/>
      <ellipse cx="78" cy="63" rx="4.5" ry="6" fill="${C.hc}"/>`;
    hF = `<path d="M 28 46 Q 31 27 44 33 Q 41 49 33 51 Z" fill="${C.hh}"/>
      <path d="M 72 46 Q 69 30 58 34 Q 61 48 67 50 Z" fill="${C.hc}"/>
      <path d="M 40 29 Q 50 22 60 29 Q 55 36 50 31 Q 45 36 40 29 Z" fill="${C.hc}"/>`;

  } else if (stage === 3) {
    // Spiky orange warrior hair
    hB = `<path d="M 50 7 L 42 32 L 58 32 Z" fill="${C.hc}"/>
      <path d="M 36 11 L 29 36 L 48 36 Z" fill="${C.hc}"/>
      <path d="M 64 11 L 71 36 L 52 36 Z" fill="${C.hc}"/>
      <path d="M 22 28 L 17 52 L 34 47 Z" fill="${C.hc}"/>
      <path d="M 78 28 L 83 52 L 66 47 Z" fill="${C.hc}"/>
      <path d="M 22 58 Q 22 38 38 35 Q 50 31 62 35 Q 78 38 78 58 Z" fill="${C.hc}"/>
      <path d="M 22 58 Q 16 71 18 83 Q 22 85 24 73 Q 23 65 22 58 Z" fill="${C.hc}"/>
      <path d="M 78 58 Q 84 71 82 83 Q 78 85 76 73 Q 77 65 78 58 Z" fill="${C.hc}"/>`;
    hF = `<path d="M 29 46 Q 32 28 44 34 Q 40 50 33 52 Z" fill="${C.hh}"/>
      <path d="M 71 46 Q 68 28 56 34 Q 60 50 67 52 Z" fill="${C.hh}"/>
      <path d="M 40 32 Q 50 24 60 32 Q 55 39 50 35 Q 45 39 40 32 Z" fill="${C.hh}"/>`;

  } else if (stage === 4) {
    // Wild gold Champion spikes — bigger, more dramatic
    hB = `<path d="M 50 3 L 40 30 L 60 30 Z" fill="${C.hc}"/>
      <path d="M 34 7 L 25 34 L 48 33 Z" fill="${C.hc}"/>
      <path d="M 66 7 L 75 34 L 52 33 Z" fill="${C.hc}"/>
      <path d="M 18 21 L 11 50 L 32 45 Z" fill="${C.hc}"/>
      <path d="M 82 21 L 89 50 L 68 45 Z" fill="${C.hc}"/>
      <path d="M 7 34 L 2 62 L 22 56 Z" fill="${C.hc}"/>
      <path d="M 93 34 L 98 62 L 78 56 Z" fill="${C.hc}"/>
      <path d="M 20 58 Q 20 36 40 31 Q 50 27 60 31 Q 80 36 80 58 Z" fill="${C.hc}"/>
      <path d="M 20 58 Q 12 74 14 88 Q 18 90 22 78 Q 21 68 20 58 Z" fill="${C.hc}"/>
      <path d="M 80 58 Q 88 74 86 88 Q 82 90 78 78 Q 79 68 80 58 Z" fill="${C.hc}"/>`;
    hF = `<path d="M 44 28 Q 50 17 56 28 Q 52 35 50 30 Q 48 35 44 28 Z" fill="${C.hh}"/>
      <path d="M 26 47 Q 28 25 43 32 Q 38 52 30 54 Z" fill="${C.hh}"/>
      <path d="M 74 47 Q 72 25 57 32 Q 62 52 70 54 Z" fill="${C.hh}"/>`;

  } else if (stage === 5) {
    // Long flowing silver-blue Legend hair
    hB = `<path d="M 22 58 Q 20 26 38 21 Q 50 17 62 21 Q 80 26 78 58 Z" fill="${C.hc}"/>
      <path d="M 47 19 Q 44 5 50 3 Q 56 5 53 19 Z" fill="${C.hc}"/>
      <path d="M 22 58 Q 13 78 11 106 Q 15 110 19 96 Q 21 82 22 68 Q 22 63 22 58 Z" fill="${C.hc}"/>
      <path d="M 78 58 Q 87 78 89 106 Q 85 110 81 96 Q 79 82 78 68 Q 78 63 78 58 Z" fill="${C.hc}"/>`;
    hF = `<path d="M 28 46 Q 30 25 45 32 Q 40 51 32 53 Z" fill="${C.hh}"/>
      <path d="M 72 46 Q 70 25 55 32 Q 60 51 68 53 Z" fill="${C.hh}"/>
      <path d="M 40 29 Q 50 21 60 29 Q 55 36 50 32 Q 45 36 40 29 Z" fill="${C.hh}"/>`;
    if (C.eg) hF += `<ellipse cx="50" cy="40" rx="28" ry="10" fill="${C.eg}" opacity="0.07" filter="url(#${uid}e)"/>`;

  } else {
    // Stage 6 Northstar — blazing golden-white SSJ hair
    hB = `<path d="M 50 -6 L 38 26 L 62 26 Z" fill="${C.hh}"/>
      <path d="M 32 -2 L 21 28 L 50 26 Z" fill="${C.hh}" opacity="0.9"/>
      <path d="M 68 -2 L 79 28 L 50 26 Z" fill="${C.hh}" opacity="0.9"/>
      <path d="M 14 14 L 5 46 L 32 41 Z" fill="${C.hc}"/>
      <path d="M 86 14 L 95 46 L 68 41 Z" fill="${C.hc}"/>
      <path d="M 4 30 L -3 60 L 20 55 Z" fill="${C.hc}"/>
      <path d="M 96 30 L 103 60 L 80 55 Z" fill="${C.hc}"/>
      <path d="M 18 58 Q 18 33 40 26 Q 50 22 60 26 Q 82 33 82 58 Z" fill="${C.hc}"/>
      <path d="M 18 58 Q 9 78 7 106 Q 11 110 15 96 Q 17 82 18 68 Q 18 63 18 58 Z" fill="${C.hc}"/>
      <path d="M 82 58 Q 91 78 93 106 Q 89 110 85 96 Q 83 82 82 68 Q 82 63 82 58 Z" fill="${C.hc}"/>`;
    // Glow layer on spikes
    hB += `<path d="M 50 -6 L 38 26 L 62 26 Z" fill="${C.eg}" opacity="0.55" filter="url(#${uid}e)">
      <animate attributeName="opacity" values="0.55;0.85;0.55" dur="1.6s" repeatCount="indefinite"/>
    </path>
    <path d="M 32 -2 L 21 28 L 50 26 Z" fill="${C.eg}" opacity="0.35" filter="url(#${uid}e)"/>
    <path d="M 68 -2 L 79 28 L 50 26 Z" fill="${C.eg}" opacity="0.35" filter="url(#${uid}e)"/>`;
    hF = `<path d="M 40 24 Q 50 11 60 24 Q 54 31 50 27 Q 46 31 40 24 Z" fill="${C.hh}" opacity="0.95"/>
      <path d="M 40 24 Q 50 11 60 24 Q 54 31 50 27 Q 46 31 40 24 Z" fill="${C.eg}" opacity="0.55" filter="url(#${uid}e)"/>`;
  }

  // ── EYE GLOW (drawn behind eyes) ─────────────────────────────────────
  const eyeGlow = C.eg ? `
    <ellipse cx="39" cy="55" rx="10" ry="9" fill="${C.eg}" opacity="0.30" filter="url(#${uid}e)"/>
    <ellipse cx="61" cy="55" rx="10" ry="9" fill="${C.eg}" opacity="0.30" filter="url(#${uid}e)"/>` : '';

  // ── BODY / OUTFIT ─────────────────────────────────────────────────────
  const neck = `<path d="M 44 82 L 44 91 Q 50 93 56 91 L 56 82 Z" fill="${sk}"/>`;
  const torso = `<path d="M 19 95 Q 14 102 13 130 L 87 130 Q 86 102 81 95 Q 65 85 50 85 Q 35 85 19 95 Z" fill="${C.oc}"/>`;

  let outfitDetail = '';
  if (stage <= 2) {
    outfitDetail = `<path d="M 40 91 Q 50 100 60 91 Q 56 95 50 93 Q 44 95 40 91 Z" fill="${C.oa}"/>`;
  } else if (stage === 3) {
    outfitDetail = `<path d="M 38 91 Q 50 102 62 91" stroke="${C.oa}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <line x1="50" y1="91" x2="50" y2="114" stroke="${C.oa}" stroke-width="1.5" opacity="0.55"/>
      <line x1="32" y1="100" x2="68" y2="100" stroke="${C.oa}" stroke-width="1" opacity="0.4"/>`;
  } else {
    outfitDetail = `<path d="M 27 100 Q 50 105 73 100 Q 71 113 50 116 Q 29 113 27 100 Z" fill="${C.oa}" opacity="0.88"/>
      <path d="M 44 91 Q 50 97 56 91 Q 54 97 50 95 Q 46 97 44 91 Z" fill="${C.oa}"/>`;
    if (stage >= 5) {
      outfitDetail += `<ellipse cx="21" cy="97" rx="10" ry="6.5" fill="${C.oa}" transform="rotate(-18 21 97)"/>
        <ellipse cx="79" cy="97" rx="10" ry="6.5" fill="${C.oa}" transform="rotate(18 79 97)"/>`;
    }
    if (stage === 6) {
      outfitDetail += `<path d="M 27 100 Q 50 105 73 100" stroke="#fbbf24" stroke-width="1.3" fill="none"/>
        <ellipse cx="21" cy="97" rx="10" ry="6.5" fill="none" stroke="#fbbf24" stroke-width="1" transform="rotate(-18 21 97)"/>
        <ellipse cx="79" cy="97" rx="10" ry="6.5" fill="none" stroke="#fbbf24" stroke-width="1" transform="rotate(18 79 97)"/>`;
    }
  }

  // ── FACE ─────────────────────────────────────────────────────────────
  const face = `
    <circle cx="50" cy="58" r="27" fill="${sk}"/>
    <ellipse cx="23" cy="60" rx="4" ry="5.5" fill="${sk}"/>
    <ellipse cx="77" cy="60" rx="4" ry="5.5" fill="${sk}"/>
    <ellipse cx="23" cy="61" rx="2.5" ry="3.2" fill="${skS}"/>
    <ellipse cx="77" cy="61" rx="2.5" ry="3.2" fill="${skS}"/>
    ${eyeGlow}
    <ellipse cx="39" cy="56" rx="8.5" ry="8" fill="white"/>
    <ellipse cx="61" cy="56" rx="8.5" ry="8" fill="white"/>
    <ellipse cx="39" cy="57" rx="6.5" ry="6.5" fill="${C.ec}"/>
    <ellipse cx="61" cy="57" rx="6.5" ry="6.5" fill="${C.ec}"/>
    <circle cx="39" cy="58" r="3.5" fill="${C.ep}"/>
    <circle cx="61" cy="58" r="3.5" fill="${C.ep}"/>
    <circle cx="35.5" cy="53" r="2.2" fill="white"/>
    <circle cx="57.5" cy="53" r="2.2" fill="white"/>
    <circle cx="41.5" cy="59" r="1.1" fill="white" opacity="0.75"/>
    <circle cx="63.5" cy="59" r="1.1" fill="white" opacity="0.75"/>
    <path d="M 30.5 53 Q 39 48.5 47.5 53" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M 52.5 53 Q 61 48.5 69.5 53" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M 31 47 Q 39 43 47 45" stroke="${C.hc}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    <path d="M 53 45 Q 61 43 69 47" stroke="${C.hc}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    <path d="M 47 65 Q 50 68 53 65" stroke="${skS}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M 43 73 Q 50 78 57 73" stroke="#d4826a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="32" cy="65" rx="6" ry="3.5" fill="#ffaabb" opacity="0.30"/>
    <ellipse cx="68" cy="65" rx="6" ry="3.5" fill="#ffaabb" opacity="0.30"/>`;

  return `<svg viewBox="5 -10 90 140" xmlns="http://www.w3.org/2000/svg"
      style="width:100%;height:100%" aria-hidden="true">
    <defs>${glowFilter}${eyeFilter}</defs>
    ${aura}${parts}
    ${hB}
    ${neck}${torso}${outfitDetail}
    ${face}
    ${hF}
  </svg>`;
}

function renderStats() {
  const {done,total} = totalPct();
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const q = QUOTES[meta.quoteIndex % QUOTES.length];
  const psRows = PILLARS.map(p => { const {pct} = pillarPct(p.id); return `<div class="ps-row"><div class="ps-name">${p.name}</div><div class="ps-track"><div class="ps-fill" style="width:${(pct*100).toFixed(0)}%"></div></div><div class="ps-val">${Math.round(pct*10)}/10</div></div>`; }).join('');

  const { lvl, progress, needed } = xpToNextLevel(gamification.xp || 0);
  const xpBarPct = needed > 0 ? progress / needed : 1;
  const unlockedSet = new Set(achievements);
  const achHTML = ACHIEVEMENTS.map(a => `
    <div class="g-ach-card ${unlockedSet.has(a.id) ? 'unlocked' : 'locked'}">
      <div class="g-ach-icon">${a.icon}</div>
      <div class="g-ach-name">${a.name}</div>
      <div class="g-ach-desc">${a.desc}</div>
    </div>`).join('');
  const pillarLevels = PILLARS.map(p => `
    <div class="g-pl-card">
      ${p.icon}
      <div class="g-pl-name">${p.name}</div>
      <div class="g-pl-lv">Lv ${getPillarLevel(p.id)}</div>
    </div>`).join('');

  // Weekly summary stats
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const weekAvgCal = computeWeeklyAvgCalories(mealLog);
  const weekHabits7 = (() => {
    let daysWithAny = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      if (habits.some(h => log[h.id]?.lastCompletedDate === key)) daysWithAny++;
    }
    return daysWithAny;
  })();

  document.getElementById('view').innerHTML = `
    <div class="sh ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="sh-title">Profile</div><div class="sh-sub">Become your greatest self.</div></div>
      <button class="w-action-btn" style="margin:0;padding:10px 16px;font-size:13px;width:auto" onclick="openEditName()">Edit Name</button>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Name</div>
      <div style="font-family:var(--serif);font-size:22px;color:var(--text)" id="profile-name-display">${userName() || '—'}</div>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-size:13px;color:var(--text-dim)">Level <span style="font-family:var(--serif);font-size:26px;color:var(--accent-b);font-weight:700">${lvl}</span> <span style="font-size:12px;color:var(--accent);font-weight:600;letter-spacing:.04em">${getLevelTitle(lvl)}</span></div>
        <div style="font-size:11px;color:var(--text-dim)">${(gamification.xp||0).toLocaleString()} XP</div>
      </div>
      <div class="g-xp-bar-track"><div class="g-xp-bar-fill" style="width:${(xpBarPct*100).toFixed(1)}%"></div></div>
      <div style="font-size:10px;color:var(--text-dim);text-align:right;margin-top:2px">${(needed-progress).toLocaleString()} XP to Level ${lvl+1}</div>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Settings</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Units</div>
        <div class="unit-toggle">
          <button class="unit-btn${!isImperial()?' unit-btn-active':''}" onclick="setUnits('metric');renderStats()">kg</button>
          <button class="unit-btn${isImperial()?' unit-btn-active':''}" onclick="setUnits('imperial');renderStats()">lbs</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:14px;color:var(--text)">App version</div>
        <button class="unit-btn" style="padding:6px 14px;background:var(--surface);border:1px solid var(--border2)" onclick="if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister())).then(()=>window.location.reload(true))}else{window.location.reload(true)}">Refresh</button>
      </div>
    </div>
    <div class="s-grid ani">
      <div class="s-card"><div class="s-val">${done}</div><div class="s-lbl">Today</div></div>
      <div class="s-card"><div class="s-val">${best}</div><div class="s-lbl">Best Streak</div></div>
      <div class="s-card"><div class="s-val">${meta.totalPerfectDays||0}</div><div class="s-lbl">Perfect Days</div></div>
      <div class="s-card"><div class="s-val">${total}</div><div class="s-lbl">Total Habits</div></div>
    </div>
    <div class="da-section ani" style="margin:0 24px 8px">
      <div class="sec-lbl" style="padding:0 0 10px">THIS WEEK</div>
      <div class="s-grid" style="margin:0">
        <div class="s-card"><div class="s-val" style="font-size:22px">${ws.workoutDays.length}</div><div class="s-lbl">Workouts</div></div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${weekHabits7}</div><div class="s-lbl">Habit Days</div></div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${ws.journalDays.length}</div><div class="s-lbl">Journaled</div></div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${weekAvgCal !== null ? weekAvgCal.toLocaleString() : '—'}</div><div class="s-lbl">Avg Cal</div></div>
      </div>
    </div>
    <div class="sec-lbl" style="padding-left:24px">Pillar Scores</div>
    <div class="ps ani">${psRows}</div>
    <div class="sec-lbl" style="padding-left:24px">Pillar Levels</div>
    <div class="g-pillar-levels ani">${pillarLevels}</div>
    <div class="sec-lbl" style="padding-left:24px">Achievements Â· ${achievements.length}/${ACHIEVEMENTS.length}</div>
    <div class="g-ach-grid ani">${achHTML}</div>
    <div class="sec-lbl" style="padding-left:24px">Today's Wisdom</div>
    <div class="q-block ani">
      <div class="q-mark">\u201C</div>
      <div class="q-text" id="qt">${esc(q.text)}</div>
      <div class="q-auth" id="qa">\u2014 ${esc(q.author)}</div>
      <div class="q-nav"><button class="q-btn" onclick="rotQ(-1)">\u2190</button><button class="q-btn" onclick="rotQ(1)">\u2192</button></div>
    </div>
    <button class="w-action-btn" style="margin:16px 24px 8px" onclick="shareRecap()">📤 Share Weekly Recap</button>
    <button class="w-action-btn" style="margin:0 24px 32px;color:var(--fat);border-color:var(--fat)" onclick="if(confirm('Sign out?'))authSignOut()">Sign Out</button>`;
  qTimer = setInterval(() => rotQ(1), 30000);
}

function openEditName() {
  let modal = document.getElementById('edit-name-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'edit-name-modal'; document.body.appendChild(modal); }
  const current = userName();
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closeEditName()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Your Name</div>
      <input class="d-input" id="edit-name-input" type="text" value="${esc(current)}" placeholder="First name" style="margin-bottom:20px">
      <div style="display:flex;gap:10px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeEditName()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="saveEditName()">Save</button>
      </div>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('edit-name-input')?.focus(), 100);
}

function closeEditName() {
  const m = document.getElementById('edit-name-modal');
  if (m) m.style.display = 'none';
}

function saveEditName() {
  const name = document.getElementById('edit-name-input')?.value?.trim();
  if (!name) return;
  localStorage.setItem('hvi_user_name', name);
  closeEditName();
  const el = document.getElementById('profile-name-display');
  if (el) el.textContent = name;
}

function rotQ(dir) {
  meta.quoteIndex = (meta.quoteIndex + dir + QUOTES.length) % QUOTES.length;
  LS.set('hvi_meta', meta);
  const q = QUOTES[meta.quoteIndex];
  const qt = document.getElementById('qt'), qa = document.getElementById('qa');
  if (!qt) return;
  qt.style.opacity = '0';
  setTimeout(() => { if (qt) { qt.textContent = q.text; qt.style.opacity = '1'; } if (qa) qa.textContent = '\u2014 ' + q.author; }, 200);
}


// ══════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════════════════════
let _obGoalType = 'maintain';
let _obCalories = 2500;
let _obProtein = 180;
let _obName = '';

function injectOnboardingStyles() {
  if (document.getElementById('ob-styles')) return;
  const s = document.createElement('style');
  s.id = 'ob-styles';
  s.textContent = `
    #ob-overlay{position:fixed;inset:0;background:var(--bg);z-index:2000;overflow-y:auto;display:flex;flex-direction:column}
    .ob-wrap{flex:1;display:flex;flex-direction:column;padding:0 28px 48px;max-width:480px;margin:0 auto;width:100%}
    .ob-step-dots{display:flex;gap:6px;justify-content:center;padding:20px 0 4px}
    .ob-dot{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,0.15);transition:all .3s}
    .ob-dot.active{width:20px;background:var(--accent)}
    .ob-eyebrow{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;margin-top:32px}
    .ob-title{font-family:var(--serif);font-size:34px;color:var(--text);line-height:1.2;margin-bottom:8px}
    .ob-sub{font-size:14px;color:var(--text-dim);line-height:1.6;margin-bottom:28px}
    .ob-input{width:100%;background:var(--surface);border:1.5px solid var(--border2);border-radius:14px;color:var(--text);font-size:18px;padding:18px 20px;outline:none;font-family:var(--serif);margin-bottom:24px;box-sizing:border-box}
    .ob-input:focus{border-color:var(--accent)}
    .ob-input::placeholder{color:var(--text-muted)}
    .ob-goal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px}
    .ob-goal-card{background:var(--surface);border:1.5px solid var(--border2);border-radius:14px;padding:18px 14px;cursor:pointer;transition:all .2s;text-align:center}
    .ob-goal-card.active{border-color:var(--accent);background:rgba(154,130,86,0.1)}
    .ob-goal-card.full{grid-column:1/-1}
    .ob-goal-emoji{font-size:26px;margin-bottom:8px}
    .ob-goal-name{font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px}
    .ob-goal-desc{font-size:11px;color:var(--text-dim)}
    .ob-nut-btns{display:flex;gap:8px;margin-bottom:20px}
    .ob-nut-btn{flex:1;padding:14px 8px;border:1.5px solid var(--border2);border-radius:12px;background:transparent;color:var(--text-dim);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s;text-align:center}
    .ob-nut-btn.active{border-color:var(--accent);color:var(--accent-b);background:rgba(154,130,86,0.08)}
    .ob-macro-row{display:flex;gap:10px;margin-bottom:20px}
    .ob-macro-card{flex:1;background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:14px 10px;text-align:center}
    .ob-macro-label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .ob-macro-input{width:100%;background:transparent;border:none;color:var(--accent-b);font-family:var(--serif);font-size:22px;font-weight:700;text-align:center;outline:none}
    .ob-btn{display:block;width:100%;padding:18px;border:none;border-radius:14px;background:var(--accent);color:#0a0908;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;margin-top:auto;transition:transform .15s}
    .ob-btn:active{transform:scale(0.98)}
    .ob-welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 32px 60px}
    .ob-welcome-star{font-size:48px;color:var(--accent);margin-bottom:20px;line-height:1}
    .ob-welcome-title{font-family:var(--serif);font-size:44px;color:var(--text);margin-bottom:14px;letter-spacing:-0.5px}
    .ob-welcome-sub{font-size:15px;color:var(--text-dim);line-height:1.7;margin-bottom:48px;max-width:300px}
    .ob-welcome-btn{padding:18px 48px;border:none;border-radius:14px;background:var(--accent);color:#0a0908;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer}
  `;
  document.head.appendChild(s);
}

function renderOnboarding(step) {
  let overlay = document.getElementById('ob-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ob-overlay';
    document.body.appendChild(overlay);
  }

  // Step 0: welcome splash
  if (step === 0) {
    overlay.innerHTML = `
      <div class="ob-welcome">
        <div class="ob-welcome-star">\u2726</div>
        <div class="ob-welcome-title">Northstar</div>
        <div class="ob-welcome-sub">Your guiding star for habits, fitness, nutrition, and growth.</div>
        <button class="ob-welcome-btn" onclick="renderOnboarding(1)">GET STARTED \u2192</button>
      </div>`;
    return;
  }

  const dots = [1,2,3].map(i => `<div class="ob-dot${i===step?' active':''}" ></div>`).join('');
  let content = '';

  if (step === 1) {
    content = `
      <div class="ob-eyebrow">Step 1 of 3</div>
      <div class="ob-title">What\'s your name?</div>
      <div class="ob-sub">We\'ll personalise your experience and your AI coach will know what to call you.</div>
      <input class="ob-input" type="text" id="ob-name-input" placeholder="Your first name" maxlength="30" value="${esc(_obName)}" oninput="_obName=this.value.trim()">`;

  } else if (step === 2) {
    const goals = [
      {k:'habits', emoji:'\u{1F525}', name:'Build habits', desc:'Daily routines & discipline'},
      {k:'fitness', emoji:'\u{1F4AA}', name:'Get stronger', desc:'Workouts & performance'},
      {k:'nutrition', emoji:'\u{1F957}', name:'Eat better', desc:'Macros & meal tracking'},
      {k:'all', emoji:'\u2726', name:'All of the above', desc:'The full Northstar system', full:true},
    ];
    const cards = goals.map(g => `
      <div class="ob-goal-card${_obGoalType===g.k?' active':''} ${g.full?'full':''}" onclick="_obGoalType='${g.k}';renderOnboarding(2)">
        <div class="ob-goal-emoji">${g.emoji}</div>
        <div class="ob-goal-name">${g.name}</div>
        <div class="ob-goal-desc">${g.desc}</div>
      </div>`).join('');
    content = `
      <div class="ob-eyebrow">Step 2 of 3</div>
      <div class="ob-title">What brings you here?</div>
      <div class="ob-sub">Pick your main focus. You can use everything, but this helps us highlight what matters most.</div>
      <div class="ob-goal-grid">${cards}</div>`;

  } else if (step === 3) {
    const nuts = [['cut','Cut','Lose fat'],['maintain','Maintain','Stay lean'],['bulk','Bulk','Build muscle']];
    const nutBtns = nuts.map(([k,l,s]) =>
      `<button class="ob-nut-btn${_obGoalType===k?' active':''}" onclick="_obGoalType='${k}';_obCalories=${k==='cut'?2000:k==='bulk'?3000:2500};_obProtein=${k==='cut'?160:k==='bulk'?200:180};renderOnboarding(3)">${l}<br><span style="font-weight:400;font-size:10px;text-transform:none">${s}</span></button>`
    ).join('');
    content = `
      <div class="ob-eyebrow">Step 3 of 3</div>
      <div class="ob-title">Set your daily targets.</div>
      <div class="ob-sub">These feed into your macro rings. You can update them anytime in Diet \u2192 Goals.</div>
      <div class="ob-nut-btns">${nutBtns}</div>
      <div class="ob-macro-row">
        <div class="ob-macro-card"><div class="ob-macro-label">Calories</div><input class="ob-macro-input" type="number" id="ob-cal" value="${_obCalories}" onchange="_obCalories=+this.value"></div>
        <div class="ob-macro-card"><div class="ob-macro-label">Protein (g)</div><input class="ob-macro-input" type="number" id="ob-pro" value="${_obProtein}" onchange="_obProtein=+this.value"></div>
      </div>`;
  }

  const isLast = step === 3;
  overlay.innerHTML = `
    <div class="ob-wrap">
      <div class="ob-step-dots">${dots}</div>
      ${content}
      <button class="ob-btn" onclick="obNext(${step})">${isLast ? 'START MY JOURNEY \u2192' : 'CONTINUE \u2192'}</button>
    </div>`;
}

function obNext(step) {
  if (step === 1) {
    // Save name
    const n = _obName || (document.getElementById('ob-name-input')?.value?.trim() || '');
    if (n) { _obName = n; localStorage.setItem('hvi_user_name', n); }
  }
  if (step < 3) { renderOnboarding(step + 1); return; }
  obFinish();
}

function obFinish() {
  // Save name
  if (_obName) localStorage.setItem('hvi_user_name', _obName);

  // Save nutrition goals (only for cut/maintain/bulk selections)
  const nutritionGoalType = ['cut','maintain','bulk'].includes(_obGoalType) ? _obGoalType : 'maintain';
  const cal = _obCalories;
  const pro = _obProtein;
  const carbs = Math.round((cal - pro * 4 - 70 * 9) / 4);
  dietMeta.dailyGoals = { calories: cal, protein: pro, carbs: Math.max(50, carbs), fat: 70 };
  dietMeta.goalType = nutritionGoalType;
  LS.set('hvi_diet_meta', dietMeta);

  // Mark onboarded
  LS.set('hvi_onboarded', true);

  // Remove overlay
  const overlay = document.getElementById('ob-overlay');
  if (overlay) {
    overlay.style.transition = 'opacity .4s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }

  launchConfetti(0.4);
  go('home', {}, false);
}

function obSkip() {
  LS.set('hvi_onboarded', true);
  const overlay = document.getElementById('ob-overlay');
  if (overlay) overlay.remove();
  go('home', {}, false);
}

// WEEKLY RECAP CARD
// ══════════════════════════════════════════════════════════════════════════
function generateRecapCard() {
  const W = 390, H = 680;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2; // retina
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const grad = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.75);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, 'rgba(60,20,5,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Gold accent line top
  ctx.fillStyle = '#9a8256';
  ctx.fillRect(28, 52, 40, 2);

  // Week range
  const now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  ctx.fillStyle = 'rgba(228,218,206,0.45)';
  ctx.font = '11px -apple-system,sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(`${fmt(mon).toUpperCase()} – ${fmt(sun).toUpperCase()}`, 28, 44);

  // Title
  ctx.fillStyle = '#e4dace';
  ctx.font = 'italic 600 52px "Georgia",serif';
  ctx.fillText('Weekly', 28, 110);
  ctx.fillStyle = '#b89d68';
  ctx.fillText('Recap.', 28, 165);

  // Stats
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const { done, total } = totalPct();
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const lvl = getLevel(gamification.xp || 0);

  const stats = [
    { label: 'WORKOUTS', value: ws.workoutDays.length + '/7' },
    { label: 'JOURNALED', value: ws.journalDays.length + '/7' },
    { label: 'BEST STREAK', value: best + 'd' },
    { label: 'LEVEL', value: 'LVL ' + lvl },
  ];

  const cardW = 156, cardH = 90, cardGap = 14;
  const startX = 28, startY = 210;

  stats.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = startX + col * (cardW + cardGap);
    const y = startY + row * (cardH + cardGap);
    // Card bg
    ctx.fillStyle = '#141210';
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.stroke();
    // Value
    ctx.fillStyle = '#b89d68';
    ctx.font = '700 28px "Georgia",serif';
    ctx.fillText(st.value, x + 14, y + 40);
    // Label
    ctx.fillStyle = 'rgba(228,218,206,0.4)';
    ctx.font = '500 10px -apple-system,sans-serif';
    ctx.fillText(st.label, x + 14, y + 62);
  });

  // Habit progress bar
  const barY = 440, barX = 28, barW2 = W - 56;
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '500 10px -apple-system,sans-serif';
  ctx.fillText('HABITS COMPLETED TODAY', barX, barY - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, barX, barY, barW2, 6, 3);
  ctx.fill();
  if (total > 0) {
    ctx.fillStyle = '#9a8256';
    roundRect(ctx, barX, barY, (done/total) * barW2, 6, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(228,218,206,0.5)';
  ctx.font = '500 12px -apple-system,sans-serif';
  ctx.fillText(`${done} / ${total}`, barX, barY + 22);

  // XP
  const xp = gamification.xp || 0;
  ctx.fillStyle = '#9a8256';
  ctx.font = '700 14px -apple-system,sans-serif';
  ctx.fillText(`+${xp.toLocaleString()} XP EARNED`, barX, barY + 50);

  // Quote
  const q = QUOTES[(meta.quoteIndex || 0) % QUOTES.length];
  ctx.fillStyle = 'rgba(184,157,104,0.6)';
  ctx.font = 'italic 700 28px "Georgia",serif';
  ctx.fillText('“', barX, barY + 100);
  ctx.fillStyle = 'rgba(228,218,206,0.75)';
  ctx.font = 'italic 13px "Georgia",serif';
  wrapText(ctx, q.text.slice(0, 80) + (q.text.length > 80 ? '…' : ''), barX + 20, barY + 115, barW2 - 20, 18);
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '11px -apple-system,sans-serif';
  ctx.fillText('— ' + q.author, barX + 20, barY + 165);

  // Branding
  ctx.fillStyle = 'rgba(228,218,206,0.2)';
  ctx.font = '700 11px -apple-system,sans-serif';
  ctx.fillText('HIGH VALUE INDIVIDUAL', barX, H - 28);

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineH;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x, y);
}

function shareRecap() {
  const canvas = generateRecapCard();
  canvas.toBlob(async blob => {
    const file = new File([blob], 'hvi-recap.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'My Northstar Weekly Recap' }); return; } catch {}
    }
    // Fallback: download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hvi-recap.png';
    a.click();
  }, 'image/png');
}

// ══════════════════════════════════════════════════════════════════════════
// AI COACH
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

  return `You are Northstar Coach — a sharp, warm, and deeply personalised life coach inside the Northstar lifestyle app. Your job is to help ${name} build elite habits, perform at their peak, eat well, and grow continuously.

TODAY: ${d}

USER PROFILE:
Name: ${name}
Level ${g.level || 1} | ${g.xp || 0} XP | ${streak}-day streak

HABITS TODAY: ${todayDone}/${totalH} completed (${pct}%) | 7-day avg: ${weekAvg}%

WORKOUT: Program — ${progName} | Today — ${todayWorkout}

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
- Ask a follow-up question when you need more context before giving advice`;
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
        <div class="coach-welcome-star">✦</div>
        <h3>Hey${name ? ', ' + name : ''}.</h3>
        <p>I'm your Northstar Coach. Ask me anything about your habits, workouts, nutrition, or mindset — I can see your real data.</p>
      </div>`;
    return;
  }

  el.innerHTML = _coachHistory.map(m => _coachBubbleHTML(m.role === 'user' ? 'user' : 'coach', m.content)).join('');
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
  _coachHistory = [];
  localStorage.removeItem('hvi_coach_history');
  _renderCoachMsgs();
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
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: buildCoachSystemPrompt() },
          ..._coachHistory,
        ],
        model: 'openai',
        private: true,
      }),
    });

    typing.remove();

    if (!res.ok) {
      _coachHistory.push({ role: 'assistant', content: 'Something went wrong. Please try again in a moment.' });
    } else {
      const text = await res.text();
      _coachHistory.push({ role: 'assistant', content: text });
    }

    _saveCoachHistory();
    _renderCoachMsgs();
  } catch (err) {
    typing.remove();
    _coachHistory.push({ role: 'assistant', content: `Connection error: ${err.message}. Please try again.` });
    _renderCoachMsgs();
  } finally {
    _coachBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    const inp = document.getElementById('coach-input');
    if (inp) inp.focus();
  }
}

// ── START ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
