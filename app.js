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
const USDA_KEY = 'DEMO_KEY'; // replace with your free key from https://fdc.nal.usda.gov/api-guide.html

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
  { id: 'level_5',       icon: '⬆️', name: 'Leveling Up', desc: 'Reach Level 5' },
  { id: 'level_10',      icon: '👑', name: 'Elite',      desc: 'Reach Level 10' },
  { id: 'all_pillars',   icon: '🏛', name: 'Five Pillars', desc: 'Complete a habit in every pillar' },
];

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

  const checks = {
    first_habit:   habits.some(h => log[h.id]?.completedToday || (log[h.id]?.streak || 0) > 0),
    streak_3:      maxStreak >= 3,
    streak_7:      maxStreak >= 7,
    streak_30:     maxStreak >= 30,
    perfect_day:   allHabitsDone || (meta.totalPerfectDays || 0) >= 1,
    perfect_3:     (meta.totalPerfectDays || 0) >= 3,
    first_workout: totalWorkouts >= 1,
    workouts_10:   totalWorkouts >= 10,
    workouts_50:   totalWorkouts >= 50,
    first_pr:      totalPRs >= 1,
    pr_5:          totalPRs >= 5,
    journal_7:     totalJournalDays >= 7,
    nutrition_7:   mealDays >= 7,
    level_5:       lvl >= 5,
    level_10:      lvl >= 10,
    all_pillars:   allPillarsHit,
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
    .g-score-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-top:2px}
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
    renderOnboarding(1);
  } else {
    (() => {
      const validViews = ['home','pillar','habits','habitCreate','stats','workout','workoutPicker','workoutActive','workoutHistory','workoutBuilder','exerciseBrowser','diet','dietAddMeal','dietRecipes','dietRecipeDetail','dietGoals','dietTrend','dietTDEE','library'];
      const path = location.pathname.replace(/^\//, '');
      const params = Object.fromEntries(new URLSearchParams(location.search));
      const view = validViews.includes(path) ? path : 'home';
      go(view, params, false);
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
    history.pushState({ view, params }, '', '/' + (view === 'home' ? '' : view) + qs);
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
    awardXP(10, pillarId || undefined);
    if (wasFirst) launchConfetti(0.5);
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
  const {done,total,pct} = totalPct();
  const cards = PILLARS.map(p => {
    const pr = pillarPct(p.id);
    const ms = Math.max(0, ...pillarHabits(p.id).map(h => log[h.id]?.streak || 0));
    return `<div class="pc ani" onclick="go('pillar',{pillar:'${p.id}'})">
      <div class="pc-ring">${ring(30,pr.pct,3)}<div class="pc-icon">${p.icon}</div></div>
      <div class="pc-name">${p.name}</div>
      <div class="pc-meta">${pr.done}/${pr.total} today${ms>0?` \u00B7 ${ms}d streak`:''}</div></div>`;
  }).join('');

  // Workout summary
  const wProg = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const wDay = wProg.days[workoutMeta.currentDayIndex % wProg.days.length];
  const wLogged = !!workoutLog[today()];

  // Diet summary
  const dm = getDayMacros();
  const dGoal = dietMeta.dailyGoals.calories;
  const dPct = dGoal ? Math.min(dm.cal / dGoal, 1) : 0;

  const score = computeDailyScore();
  const scoreColor = score >= 80 ? 'var(--accent-b)' : score >= 50 ? 'var(--carb)' : 'var(--fat)';
  const challenges = getWeeklyChallenges();
  const challengeHTML = challenges.map(c => {
    const cDone = c.current >= c.goal;
    const cPct = Math.min(1, c.current / c.goal);
    return `<div class="g-challenge">
      <div class="g-challenge-head">
        <span class="g-challenge-label">${c.icon} ${c.label}</span>
        <span class="g-challenge-ct" style="${cDone ? 'color:var(--accent-b)' : ''}">${c.current}/${c.goal}${cDone ? ' ✓' : ''}</span>
      </div>
      <div class="g-challenge-track"><div class="g-challenge-fill" style="width:${(cPct*100).toFixed(0)}%;${cDone ? 'background:var(--accent-b)' : ''}"></div></div>
    </div>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="h-head ani">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div class="h-eyebrow">${greeting()}${userName() ? ', ' + userName() : ''}.</div><div class="h-day">${dayName()}.</div></div>
        <div class="g-score-ring" onclick="go('stats')">
          <div class="g-score-val" style="color:${scoreColor}">${score}</div>
          <div class="g-score-lbl">Score</div>
        </div>
      </div>
      <div class="h-prog"><div class="h-prog-track"><div class="h-prog-fill" style="width:${(pct*100).toFixed(0)}%"></div></div><div class="h-prog-ct">${done}/${total}</div></div>
    </div>
    <div class="pillars">${cards}</div>
    <div class="h-summary ani">
      <div class="h-sum-card" onclick="go('workoutActive')">
        <div class="h-sum-label">Today's Workout</div>
        <div class="h-sum-title">${wDay.name} · ${wProg.name}</div>
        <div class="h-sum-status">${wLogged ? '✓ Workout logged' : '→ Start workout'}</div>
      </div>
      <div class="h-sum-card" onclick="go('diet')">
        <div class="h-sum-label">Nutrition</div>
        <div class="h-sum-title">${dm.cal.toLocaleString()} / ${dGoal.toLocaleString()} cal</div>
        <div class="h-prog" style="margin-top:8px"><div class="h-prog-track"><div class="h-prog-fill" style="width:${(dPct*100).toFixed(0)}%;background:var(--cal)"></div></div><div class="h-prog-ct">${dm.p}g P · ${dm.c}g C · ${dm.f}g F</div></div>
      </div>
    </div>
    <div class="g-weekly ani">
      <div class="sec-lbl" style="padding:0 0 8px">Weekly Challenges</div>
      ${challengeHTML}
    </div>`;
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
      return { exerciseId: eid, sets: Array.from({length: ds}, () => ({weight: 0, reps: dr, completed: false})) };
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
    const setsHTML = we.sets.map((s, si) => {
      const showPR = window._prJustSet && window._prJustSet.ei === ei && window._prJustSet.si === si;
      return `
      <div class="w-set">
        <span class="w-set-num">${si+1}</span>
        <input class="w-input" type="number" inputmode="decimal" value="${s.weight||''}" placeholder="lbs" onchange="updateSet(${ei},${si},'weight',this.value)">
        <span class="w-input-label">\u00D7</span>
        <input class="w-input" type="number" inputmode="decimal" value="${s.reps||''}" placeholder="reps" onchange="updateSet(${ei},${si},'reps',this.value)">
        <div class="w-set-check${s.completed?' done':''}" onclick="toggleSet(${ei},${si})">\u2713</div>
        ${showPR ? '<span class="pr-badge">\uD83C\uDFC6 New PR!</span>' : ''}
      </div>`;
    }).join('');
    return `<div class="w-ex ani">
      <div class="w-ex-head"><div><div class="w-ex-name">${esc(name)}</div><div class="w-ex-muscle">${esc(muscle)}</div></div></div>
      ${setsHTML}
      <button class="w-add-set" onclick="addSet(${ei})">+ Add Set</button></div>`;
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
  wl.exercises[ei].sets.push({ weight: 0, reps: dr, completed: false });
  LS.set('hvi_workout_log', workoutLog);
  go('workoutActive');
}

function finishWorkout() {
  workoutMeta.lastWorkoutDate = today();
  LS.set('hvi_workout_meta', workoutMeta);
  awardXP(50, 'body');
  trackWeeklyWorkout();
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
      <div class="w-hist-vol">${totalSets} sets \u00B7 ${totalVol.toLocaleString()} lbs volume</div></div>`;
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
    <div class="sec-lbl" style="padding:0 0 10px">WEEKLY VOLUME (lbs)</div>
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
      <div class="w-hist-vol" style="color:var(--accent-b)">🏆 ${pr.weight} lbs × ${pr.reps} reps</div>
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
    const prLine = pr ? `<div class="ex-detail-pr">Your PR: ${pr.weight}kg \u00D7 ${pr.reps} reps (${pr.date})</div>` : '';
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
    `<div class="dw-history-item"><span>${fmtDate(d)}</span><span>${w} kg</span></div>`
  ).join('') : '<div style="font-size:12px;color:var(--text-dim)">No weights logged yet.</div>';

  const weightHTML = `<div class="dw-section ani">
    <div class="sec-lbl" style="padding:0 0 10px">Weight</div>
    ${todayWeight ? `<div class="dw-logged">Today: <strong>${todayWeight} kg</strong></div>` : ''}
    <div class="dw-input-row">
      <input class="dw-input" type="number" step="0.1" min="20" max="300" id="wt-input" placeholder="Weight (kg)" ${todayWeight ? `value="${todayWeight}"` : ''}>
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

function parseMealDescription(text) {
  const chunks = text.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 1);
  const matched = [], unmatched = [];
  for (const c of chunks) {
    const r = _parseChunk(c);
    if (r) matched.push(r);
    else unmatched.push(c);
  }
  return { matched, unmatched };
}

function calculateMealDescription() {
  const ta = document.getElementById('describe-textarea');
  const out = document.getElementById('describe-output');
  if (!ta || !out) return;
  const text = ta.value.trim();
  if (!text) { out.innerHTML = '<p class="dm-hint">Type something above first.</p>'; return; }

  const { matched, unmatched } = parseMealDescription(text);
  _parsedMealItems = matched;

  if (!matched.length) {
    out.innerHTML = `<p class="dm-hint">Couldn't recognise any foods. Try being more specific, e.g. "200g chicken breast, 1 cup rice, 2 eggs".</p>`;
    return;
  }

  const rows = matched.map((it, i) => `
    <div class="dm-row">
      <div class="dm-row-name">${esc(it.name)}</div>
      <div class="dm-row-macros">${it.calories} cal &middot; ${it.protein}P &middot; ${it.carbs}C &middot; ${it.fat}F</div>
      <button class="dm-remove" onclick="_parsedMealItems.splice(${i},1);calculateMealDescription();">&times;</button>
    </div>`).join('');

  const warn = unmatched.length
    ? `<p class="dm-hint dm-warn">Not recognised: ${unmatched.map(esc).join(', ')}</p>` : '';

  const totalCal = matched.reduce((s,i) => s + i.calories, 0);
  out.innerHTML = `${rows}${warn}
    <div class="dm-total">${totalCal} cal total</div>
    <button class="w-action-btn" style="width:100%;margin-top:10px" onclick="addAllDescribed()">ADD ALL ITEMS</button>`;
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
        <textarea class="dm-textarea" id="describe-textarea" rows="3" placeholder="e.g. 200g chicken breast, 1 cup rice, 2 eggs, 1 tbsp olive oil"></textarea>
        <button class="w-action-btn" style="width:100%;margin:8px 0 0" onclick="calculateMealDescription()">CALCULATE MACROS</button>
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
    <div class="da-section ani" style="margin:0 24px 16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-size:13px;color:var(--text-dim)">Level <span style="font-family:var(--serif);font-size:26px;color:var(--accent-b);font-weight:700">${lvl}</span></div>
        <div style="font-size:11px;color:var(--text-dim)">${(gamification.xp||0).toLocaleString()} XP &middot; ${(needed-progress).toLocaleString()} to next</div>
      </div>
      <div class="g-xp-bar-track"><div class="g-xp-bar-fill" style="width:${(xpBarPct*100).toFixed(1)}%"></div></div>
      <div style="font-size:10px;color:var(--text-dim);text-align:right;margin-top:2px">${Math.round(xpBarPct*100)}% to Level ${lvl+1}</div>
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
let _obProgram = 'ppl';
let _obGoalType = 'maintain';
let _obCalories = 2500;
let _obProtein = 180;

function injectOnboardingStyles() {
  if (document.getElementById('ob-styles')) return;
  const s = document.createElement('style');
  s.id = 'ob-styles';
  s.textContent = `
    #ob-overlay{position:fixed;inset:0;background:var(--bg);z-index:2000;overflow-y:auto;display:flex;flex-direction:column}
    .ob-wrap{flex:1;display:flex;flex-direction:column;padding:0 28px 40px;max-width:480px;margin:0 auto;width:100%}
    .ob-step-dots{display:flex;gap:6px;justify-content:center;padding:24px 0 8px}
    .ob-dot{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,0.15);transition:all .3s}
    .ob-dot.active{width:20px;background:var(--accent)}
    .ob-eyebrow{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;margin-top:40px}
    .ob-title{font-family:var(--serif);font-size:36px;color:var(--text);line-height:1.15;margin-bottom:8px}
    .ob-sub{font-size:14px;color:var(--text-dim);line-height:1.6;margin-bottom:32px}
    .ob-prog-grid{display:flex;flex-direction:column;gap:10px;margin-bottom:24px}
    .ob-prog-card{background:var(--surface);border:1.5px solid var(--border2);border-radius:14px;padding:16px 18px;cursor:pointer;transition:all .2s}
    .ob-prog-card.active{border-color:var(--accent);background:rgba(154,130,86,0.08)}
    .ob-prog-name{font-size:15px;font-weight:600;color:var(--text);margin-bottom:3px}
    .ob-prog-meta{font-size:12px;color:var(--text-dim)}
    .ob-goal-btns{display:flex;gap:8px;margin-bottom:20px}
    .ob-goal-btn{flex:1;padding:14px 8px;border:1.5px solid var(--border2);border-radius:12px;background:transparent;color:var(--text-dim);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s;text-align:center}
    .ob-goal-btn.active{border-color:var(--accent);color:var(--accent-b);background:rgba(154,130,86,0.08)}
    .ob-macro-row{display:flex;gap:10px;margin-bottom:20px}
    .ob-macro-card{flex:1;background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:14px 10px;text-align:center}
    .ob-macro-label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .ob-macro-input{width:100%;background:transparent;border:none;color:var(--accent-b);font-family:var(--serif);font-size:22px;font-weight:700;text-align:center;outline:none}
    .ob-pillar-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px}
    .ob-pillar-card{background:var(--surface);border:1.5px solid var(--border2);border-radius:12px;padding:14px 12px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:10px}
    .ob-pillar-card.active{border-color:var(--accent);background:rgba(154,130,86,0.08)}
    .ob-pillar-icon{font-size:20px}
    .ob-pillar-name{font-size:13px;font-weight:600;color:var(--text)}
    .ob-btn{display:block;width:100%;padding:18px;border:none;border-radius:14px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;margin-top:auto;transition:transform .15s}
    .ob-btn:active{transform:scale(0.98)}
    .ob-skip{display:block;text-align:center;margin-top:16px;font-size:12px;color:var(--text-muted);cursor:pointer;text-decoration:underline}
  `;
  document.head.appendChild(s);
}

const _obFocusPillars = new Set(['mind','body','mastery','social','wealth']);

function renderOnboarding(step) {
  let overlay = document.getElementById('ob-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ob-overlay';
    document.body.appendChild(overlay);
  }
  const dots = [1,2,3].map(i => `<div class="ob-dot${i===step?' active':''}"></div>`).join('');

  let content = '';

  if (step === 1) {
    const progCards = WORKOUT_PROGRAMS.slice(0,5).map(p => `
      <div class="ob-prog-card${_obProgram===p.id?' active':''}" onclick="_obProgram='${p.id}';renderOnboarding(1)">
        <div class="ob-prog-name">${p.name}</div>
        <div class="ob-prog-meta">${p.days.length}-day · ${p.desc}</div>
      </div>`).join('');
    content = `
      <div class="ob-eyebrow">Step 1 of 3</div>
      <div class="ob-title">Choose your training split.</div>
      <div class="ob-sub">Pick the program that fits your schedule. You can switch anytime.</div>
      <div class="ob-prog-grid">${progCards}</div>`;

  } else if (step === 2) {
    const goals = [['cut','Cut','Lose fat'],['maintain','Maintain','Stay lean'],['bulk','Bulk','Build muscle']];
    const goalBtns = goals.map(([k,l,s]) =>
      `<button class="ob-goal-btn${_obGoalType===k?' active':''}" onclick="_obGoalType='${k}';_obCalories=${k==='cut'?2000:k==='bulk'?3000:2500};_obProtein=${k==='cut'?160:k==='bulk'?200:180};renderOnboarding(2)">${l}<br><span style="font-weight:400;font-size:10px;text-transform:none">${s}</span></button>`
    ).join('');
    content = `
      <div class="ob-eyebrow">Step 2 of 3</div>
      <div class="ob-title">Set your nutrition goal.</div>
      <div class="ob-sub">Adjust your daily targets. These feed directly into your macro rings.</div>
      <div class="ob-goal-btns">${goalBtns}</div>
      <div class="ob-macro-row">
        <div class="ob-macro-card"><div class="ob-macro-label">Calories</div><input class="ob-macro-input" type="number" id="ob-cal" value="${_obCalories}" onchange="_obCalories=+this.value"></div>
        <div class="ob-macro-card"><div class="ob-macro-label">Protein (g)</div><input class="ob-macro-input" type="number" id="ob-pro" value="${_obProtein}" onchange="_obProtein=+this.value"></div>
      </div>`;

  } else if (step === 3) {
    const pillarCards = PILLARS.map(p => `
      <div class="ob-pillar-card${_obFocusPillars.has(p.id)?' active':''}" onclick="(()=>{if(_obFocusPillars.has('${p.id}'))_obFocusPillars.delete('${p.id}');else _obFocusPillars.add('${p.id}');renderOnboarding(3)})()">
        <span class="ob-pillar-icon">${p.icon}</span><span class="ob-pillar-name">${p.name}</span>
      </div>`).join('');
    content = `
      <div class="ob-eyebrow">Step 3 of 3</div>
      <div class="ob-title">Pick your pillars.</div>
      <div class="ob-sub">All 5 are selected by default. Tap to deselect pillars you want to skip for now.</div>
      <div class="ob-pillar-grid">${pillarCards}</div>`;
  }

  const isLast = step === 3;
  overlay.innerHTML = `
    <div class="ob-wrap">
      <div class="ob-step-dots">${dots}</div>
      ${content}
      <button class="ob-btn" onclick="obNext(${step})">${isLast ? 'START MY JOURNEY' : 'NEXT →'}</button>
      <span class="ob-skip" onclick="obSkip()">Skip setup</span>
    </div>`;
}

function obNext(step) {
  if (step < 3) { renderOnboarding(step + 1); return; }
  obFinish();
}

function obFinish() {
  // Save program
  workoutMeta.activeProgram = _obProgram;
  workoutMeta.currentDayIndex = 0;
  LS.set('hvi_workout_meta', workoutMeta);

  // Save nutrition goals
  const carbs = Math.round((_obCalories - _obProtein * 4 - 70 * 9) / 4);
  dietMeta.dailyGoals = { calories: _obCalories, protein: _obProtein, carbs: Math.max(50, carbs), fat: 70 };
  dietMeta.goalType = _obGoalType;
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

// ══════════════════════════════════════════════════════════════════════════
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
    ? (PROGRAMS.find(p => p.id === workoutMeta.activeProgram)?.name || workoutMeta.activeProgram)
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

COACHING STYLE:
- Direct, specific, and actionable — zero filler
- Reference their actual numbers to make advice feel personal
- Be honest about gaps (missed habits, protein short, etc.) but solution-focused
- Keep replies under 200 words unless more detail is explicitly requested
- Use bullet points or short paragraphs for clarity
- Occasionally ask a follow-up question to dig deeper`;
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
    _coachHistory.push({ role: 'assistant', content: `Connection error: ${err.message}. Make sure the app is deployed on Netlify.` });
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
