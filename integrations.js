// ══════════════════════════════════════════════════════════════════════════
// Arete — Device Integrations (Google Fit, Strava, Fitbit, Whoop)
// ══════════════════════════════════════════════════════════════════════════

const INTEGRATIONS = {
  googlefit: {
    name: 'Google Fit',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2L6.5 7.5 12 13l5.5-5.5L12 2z" fill="#4285F4"/><path d="M6.5 7.5L2 12l4.5 4.5L12 13 6.5 7.5z" fill="#EA4335"/><path d="M12 13l5.5 5.5L22 14l-4.5-4.5L12 13z" fill="#34A853"/><path d="M12 13l-5.5 5.5L12 24l5.5-5.5L12 13z" fill="#FBBC05"/></svg>',
    scopes: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.body.read',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    provides: ['sleep', 'workouts', 'heart_rate', 'steps']
  },
  strava: {
    name: 'Strava',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" fill="#FC4C02"/><path d="M7.778 13.828h3.065L5.23 2 0 13.828h3.065L5.23 9.576l2.548 4.252z" fill="#FC4C02"/></svg>',
    scopes: 'activity:read_all',
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    provides: ['workouts', 'heart_rate']
  },
  fitbit: {
    name: 'Fitbit',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><g fill="#00B0B9"><circle cx="12" cy="4" r="2"/><circle cx="12" cy="9" r="2.2"/><circle cx="12" cy="14.5" r="2"/><circle cx="12" cy="19.5" r="1.5"/><circle cx="7" cy="6.5" r="1.8"/><circle cx="7" cy="11.5" r="1.5"/><circle cx="7" cy="16" r="1.2"/><circle cx="17" cy="6.5" r="1.8"/><circle cx="17" cy="11.5" r="1.5"/><circle cx="17" cy="16" r="1.2"/></g></svg>',
    scopes: 'activity heartrate sleep weight',
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    provides: ['sleep', 'workouts', 'heart_rate', 'weight']
  },
  whoop: {
    name: 'Whoop',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2.2 1.8 4 4 4s4-1.8 4-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M4 14c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2.2 1.8 4 4 4s4-1.8 4-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    // offline is what makes Whoop hand back a refresh token. Without it the
    // connection dies when the first access token does, an hour in.
    // body_measurement brings weight and height across when they change there.
    scopes: 'read:recovery read:sleep read:workout read:body_measurement offline',
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    provides: ['sleep', 'workouts', 'recovery', 'weight']
  }
};

const _OAUTH_PROXY = 'https://arete-ai.oskarsteinicke.workers.dev';

// ── APPLE HEALTH (via iOS Shortcut → Worker KV) ────────────────────────
const APPLE_HEALTH_CFG = {
  name: 'Apple Health',
  icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M16.5 3C14.76 3 13.09 3.81 12 5.09 10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z" fill="#FF2D55"/></svg>',
  provides: ['steps', 'sleep', 'heart_rate', 'workouts', 'active_energy']
};

function _getHealthToken() {
  return localStorage.getItem('hvi_health_token') || '';
}

async function syncAppleHealth() {
  const token = _getHealthToken();
  if (!token) return;
  try {
    const res = await fetch(_OAUTH_PROXY + '/health?days=7', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    Object.entries(data).forEach(([dk, d]) => {
      if (d.sleep && (!sleepLog[dk] || !sleepLog[dk].hours)) {
        sleepLog[dk] = {
          ...sleepLog[dk],
          hours: parseFloat(d.sleep),
          source: 'applehealth'
        };
      }
      if (d.sleepQuality && !sleepLog[dk]?.quality) {
        sleepLog[dk] = { ...sleepLog[dk], quality: d.sleepQuality };
      }
      // A Whoop night keeps Whoop's resting heart rate.
      if (d.restingHR && !whoopHasNight(dk)) {
        sleepLog[dk] = { ...sleepLog[dk], restingHR: d.restingHR };
      }
      if (d.steps) {
        const existing = JSON.parse(localStorage.getItem('hvi_steps_log') || '{}');
        existing[dk] = d.steps;
        localStorage.setItem('hvi_steps_log', JSON.stringify(existing));
      }
      if (d.activeEnergy) {
        const existing = JSON.parse(localStorage.getItem('hvi_energy_log') || '{}');
        existing[dk] = d.activeEnergy;
        localStorage.setItem('hvi_energy_log', JSON.stringify(existing));
      }
      if (d.weight) {
        if (!weightLog[dk]) {
          weightLog[dk] = d.weight;
        }
      }
      if (d.workouts && Array.isArray(d.workouts)) {
        d.workouts.forEach(w => {
          if (!workoutLog[dk]) {
            workoutLog[dk] = {
              dayName: w.type || 'Apple Health Activity',
              duration: w.duration || 0,
              exercises: [],
              source: 'applehealth',
              distance: w.distance ? w.distance.toFixed(1) + ' km' : null,
              avgHr: w.avgHR || null,
              calories: w.calories || null
            };
          }
        });
      }
    });

    LS.set('hvi_sleep_log', sleepLog);
    LS.set('hvi_workout_log', workoutLog);
    LS.set('hvi_weight_log', weightLog);

    const int = _getIntegrations();
    int.applehealth = { ...(int.applehealth || {}), lastSync: Date.now(), connectedAt: int.applehealth?.connectedAt || Date.now() };
    _saveIntegrations(int);
  } catch (err) {
    console.error('[integrations] Apple Health sync failed:', err);
  }
  _redrawIntegrations();
}

// ── TOKEN STORAGE ────────────────────────────────────────────────────────
function _getIntegrations() { return LS.get('hvi_integrations', {}); }
function _saveIntegrations(data) { LS.set('hvi_integrations', data); }

function _getToken(service) {
  const int = _getIntegrations();
  return int[service] || null;
}
function _saveToken(service, tokenData) {
  const int = _getIntegrations();
  int[service] = { ...tokenData, connectedAt: Date.now() };
  _saveIntegrations(int);
}
function _removeToken(service) {
  const int = _getIntegrations();
  delete int[service];
  _saveIntegrations(int);
}

// ── OAUTH FLOW ───────────────────────────────────────────────────────────
function connectIntegration(service) {
  const cfg = INTEGRATIONS[service];
  if (!cfg) return;
  const clientId = _getClientId(service);
  if (!clientId) { alert('Integration not configured. Set up client ID in settings.'); return; }

  const state = service + '_' + Math.random().toString(36).slice(2);
  _rememberOAuth(state, service);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: _oauthRedirectUri(),
    response_type: 'code',
    scope: cfg.scopes,
    state: state
  });

  // Each provider has its own way of asking for a refresh token.
  if (service === 'googlefit') { params.set('access_type', 'offline'); params.set('prompt', 'consent'); }
  if (service === 'strava') params.set('approval_prompt', 'force');
  // Fitbit needs response_type=code and code_challenge for PKCE (optional, use basic for now)
  if (service === 'fitbit') {
    params.set('response_type', 'code');
  }

  if (_isNativeApp()) return _connectNative(service, cfg, params);
  window.location.href = cfg.authUrl + '?' + params.toString();
}

// ── SIGN-IN FROM THE IPHONE AND ANDROID APPS ─────────────────────────────
// The app cannot be the return address: providers only send people back to
// https://get-arete.com/. So the sign-in opens in a browser sheet, comes back
// to that site (oauth-return.html), which hands the code to the Worker, and
// the app collects the login from the Worker when the person returns.
// Only this app can collect it: the state ends in the SHA-256 of a secret
// made here, and the Worker hands the login over for that secret alone.
function _isNativeApp() {
  try { return !!(window.Capacitor && (typeof window.Capacitor.isNativePlatform !== 'function' || window.Capacitor.isNativePlatform())); } catch { return false; }
}
const _NATIVE_RETURN = 'https://get-arete.com/';

async function _sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _connectNative(service, cfg, params) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const state = `n_${service}_${await _sha256hex(verifier)}`;
  try { localStorage.setItem('hvi_oauth_native', JSON.stringify({ service, state, verifier, at: Date.now() })); } catch {}
  params.set('state', state);
  params.set('redirect_uri', _NATIVE_RETURN);
  const url = cfg.authUrl + '?' + params.toString();
  const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (B) await B.open({ url, presentationStyle: 'popover' });
  else window.open(url, '_blank');
}

// Collects a finished sign-in from the Worker. Runs when the app is reopened
// from the browser sheet, when the sheet is closed, and when the app comes
// back on screen, so any of the three finishes it. The Worker may take a
// moment to have it, so a "not yet" is asked again a few times.
let _claiming = null;
function _claimNative(tries) {
  if (_claiming && !tries) return _claiming;
  const run = (async () => {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('hvi_oauth_native') || 'null'); } catch {}
    if (!p || !p.state || !p.verifier) return false;
    if (Date.now() - (p.at || 0) > 15 * 60000) { localStorage.removeItem('hvi_oauth_native'); return false; }
    let res;
    try {
      res = await fetch(_OAUTH_PROXY + '/oauth/native-claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: p.state, verifier: p.verifier })
      });
    } catch { return false; }   // offline: tried again when the app comes back
    if (res.status === 404) {
      if ((tries || 0) < 4) { await new Promise(r => setTimeout(r, 1500)); return _claimNative((tries || 0) + 1); }
      return false;             // not signed in yet, or the sheet was closed early
    }
    localStorage.removeItem('hvi_oauth_native');
    const name = (INTEGRATIONS[p.service] || {}).name || 'It';
    if (!res.ok) { if (typeof showToast === 'function') showToast(`${name} was not connected. Tap Connect to try again.`); return false; }
    const d = await res.json();
    if (!d || !d.token || !d.token.access_token || !INTEGRATIONS[d.service]) return false;
    _saveToken(d.service, d.token);
    if (typeof showToast === 'function') showToast(`${name} is connected`);
    _redrawIntegrations();
    syncIntegration(d.service);
    return true;
  })();
  if (!tries) { _claiming = run; run.finally(() => { _claiming = null; }); }
  return run;
}

function _listenForNativeSignIn() {
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (!P) return;
  try {
    if (P.App) P.App.addListener('appUrlOpen', ev => {
      if (String(ev && ev.url).indexOf('com.getarete.app://oauth') !== 0) return;
      // Rejects when the sheet is already gone (closed by hand); that is fine.
      try { if (P.Browser) Promise.resolve(P.Browser.close()).catch(() => {}); } catch {}
      _claimNative();
    });
    if (P.Browser) P.Browser.addListener('browserFinished', () => _claimNative());
  } catch (e) { console.warn('[integrations] sign-in listeners', e); }
  // The app may have been closed while the person signed in.
  _claimNative();
}

// The address the provider sends people back to. It has to match what is
// registered with the provider character for character, so it is the site
// root and never whatever path the app happened to be opened on.
function _oauthRedirectUri() { return _isNativeApp() ? _NATIVE_RETURN : window.location.origin + '/'; }

// The state travels out to the provider and back. sessionStorage is the right
// home for it, but an installed web app can come back in a fresh session, so
// a copy is kept in localStorage for fifteen minutes as well.
function _rememberOAuth(state, service) {
  try { sessionStorage.setItem('oauth_state', state); sessionStorage.setItem('oauth_service', service); } catch {}
  try { localStorage.setItem('hvi_oauth_pending', JSON.stringify({ state, service, at: Date.now() })); } catch {}
}
function _recallOAuth() {
  let state = null, service = null;
  try { state = sessionStorage.getItem('oauth_state'); service = sessionStorage.getItem('oauth_service'); } catch {}
  if (!state || !service) {
    try {
      const p = JSON.parse(localStorage.getItem('hvi_oauth_pending') || 'null');
      if (p && Date.now() - p.at < 15 * 60000) { state = p.state; service = p.service; }
    } catch {}
  }
  return { state, service };
}
function _forgetOAuth() {
  try { sessionStorage.removeItem('oauth_state'); sessionStorage.removeItem('oauth_service'); } catch {}
  try { localStorage.removeItem('hvi_oauth_pending'); } catch {}
}

// Whoop asks that access be revoked when someone disconnects, not just
// forgotten on this side.
function _revokeWhoop() {
  try { _authedFetch('whoop', _whoopUrl('/user/access'), { method: 'DELETE' }).catch(() => {}); } catch {}
}

function disconnectIntegration(service) {
  if (service === 'whoop') _revokeWhoop();   // sent with the token before it is dropped
  _removeToken(service);
  renderStats();
}

// Handle OAuth callback on page load
function _handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code || !state) return;
  // Started in the iPhone or Android app: oauth-return.html finishes those.
  if (state.indexOf('n_') === 0) return;

  const { state: savedState, service } = _recallOAuth();

  if (state !== savedState || !service) {
    // This used to fail silently: the person was sent back with nothing
    // connected and no word why.
    console.warn('[integrations] OAuth state mismatch');
    _forgetOAuth();
    _clearUrlParams();
    setTimeout(() => { if (typeof showToast === 'function') showToast('That connection could not be finished here. Open Profile and tap Connect again.'); }, 1200);
    return;
  }

  _forgetOAuth();
  _clearUrlParams();

  // Exchange code for token via worker proxy
  _exchangeCode(service, code);
}

function _clearUrlParams() {
  const url = new URL(window.location);
  url.search = '';
  history.replaceState({}, '', url.pathname + url.hash);
}

async function _exchangeCode(service, code) {
  const redirectUri = _oauthRedirectUri();
  try {
    const res = await fetch(_OAUTH_PROXY + '/oauth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, code, redirect_uri: redirectUri })
    });
    if (!res.ok) throw new Error(await res.text());
    const tokenData = await res.json();
    _saveToken(service, tokenData);
    // Immediately sync
    syncIntegration(service);
    if (typeof renderStats === 'function') renderStats();
  } catch (err) {
    console.error('[integrations] Token exchange failed:', err);
    alert('Connection failed: ' + err.message);
  }
}

async function _refreshToken(service) {
  const token = _getToken(service);
  if (!token || !token.refresh_token) return null;
  let res;
  try {
    res = await fetch(_OAUTH_PROXY + '/oauth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, refresh_token: token.refresh_token })
    });
  } catch (err) {
    // Offline, or the Worker out of reach. This used to drop the connection,
    // so opening the app without signal could disconnect Whoop. Try next time.
    console.warn('[integrations] Token refresh could not be sent:', err);
    return null;
  }
  if (res.ok) {
    try {
      const newToken = await res.json();
      _saveToken(service, { ...token, ...newToken });
      return newToken.access_token;
    } catch { return null; }
  }
  // Another tab, or an overlapping sync, refreshed first. Whoop's refresh token
  // works once, so this one was refused, but the stored token is newer and good.
  const now = _getToken(service);
  if (now && now.refresh_token && now.refresh_token !== token.refresh_token) return now.access_token;
  // Refused outright (access revoked in Whoop, or the token expired): the
  // connection is over. A server hiccup (5xx, rate limit) keeps it.
  if (res.status === 400 || res.status === 401) {
    console.error('[integrations] Token refresh refused:', res.status);
    _removeToken(service);
  }
  return null;
}

async function _authedFetch(service, url, opts = {}) {
  let token = _getToken(service);
  if (!token) return null;

  // Check if token is expired
  if (token.expires_at && Date.now() > token.expires_at) {
    const newAccess = await _refreshToken(service);
    if (!newAccess) return null;
    token = _getToken(service);
  }

  const res = await fetch(url, {
    ...opts,
    headers: { ...opts.headers, 'Authorization': 'Bearer ' + token.access_token }
  });

  if (res.status === 401) {
    const newAccess = await _refreshToken(service);
    if (!newAccess) return null;
    return fetch(url, { ...opts, headers: { ...opts.headers, 'Authorization': 'Bearer ' + newAccess } });
  }
  return res;
}

// ── CLIENT IDS ───────────────────────────────────────────────────────────
const _CLIENT_IDS = {
  strava: '246559',
  googlefit: '681305896160-s020jd287h1kdj7lh79k3m3keeis9q4p.apps.googleusercontent.com',
  fitbit: '',
  whoop: '71b54adc-a980-46a6-ba51-b6024c243e43'
};
function _getClientId(service) {
  return _CLIENT_IDS[service] || (settings.integrationClientIds || {})[service] || null;
}

// ── SYNC FUNCTIONS ───────────────────────────────────────────────────────
// One sync per service at a time. Whoop's refresh token works once, so two
// overlapping syncs (↻ tapped while the app-open sync runs) could both try to
// refresh. A second call while one runs gets the running one.
const _syncRuns = {};
function syncIntegration(service) {
  if (_syncRuns[service]) return _syncRuns[service];
  const run = _runSync(service).finally(() => { delete _syncRuns[service]; });
  _syncRuns[service] = run;
  return run;
}

async function _runSync(service) {
  const token = _getToken(service);
  if (!token) return;

  try {
    switch (service) {
      case 'googlefit': await _syncGoogleFit(); break;
      case 'strava': await _syncStrava(); break;
      case 'fitbit': await _syncFitbit(); break;
      case 'whoop': await _syncWhoop(); break;
    }
    // Update last sync time
    const int = _getIntegrations();
    if (int[service]) { int[service].lastSync = Date.now(); delete int[service].lastError; _saveIntegrations(int); }
  } catch (err) {
    // This used to go to the console only, so a sync that never worked just
    // read "synced never". The row now says it failed.
    console.error(`[integrations] ${service} sync failed:`, err);
    const int = _getIntegrations();
    if (int[service]) { int[service].lastError = Date.now(); _saveIntegrations(int); }
  }
  _redrawIntegrations();
}

// Redraws just the Connected Devices list, if it is on screen, so the row
// shows the new sync time or the failure instead of staying on "Syncing…".
function _redrawIntegrations() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('intg-section');
  if (el) el.outerHTML = renderIntegrationsSection(true);
}

function syncAllIntegrations() {
  const int = _getIntegrations();
  Object.keys(int).forEach(service => syncIntegration(service));
}

// ── GOOGLE FIT ───────────────────────────────────────────────────────────
async function _syncGoogleFit() {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;

  // Sleep sessions
  const sleepRes = await _authedFetch('googlefit',
    'https://www.googleapis.com/fitness/v1/users/me/sessions?' + new URLSearchParams({
      startTime: new Date(weekAgo).toISOString(),
      endTime: new Date(now).toISOString(),
      activityType: '72' // sleep
    })
  );
  if (sleepRes?.ok) {
    const data = await sleepRes.json();
    (data.session || []).forEach(s => {
      const start = new Date(parseInt(s.startTimeMillis));
      const end = new Date(parseInt(s.endTimeMillis));
      const hours = ((end - start) / 3600000).toFixed(1);
      const dayKey = dateKey(start);
      if (!sleepLog[dayKey] || !sleepLog[dayKey].hours) {
        sleepLog[dayKey] = { ...sleepLog[dayKey], hours: parseFloat(hours), source: 'googlefit' };
      }
    });
    LS.set('hvi_sleep_log', sleepLog);
  }

  // Activity sessions (workouts)
  const actRes = await _authedFetch('googlefit',
    'https://www.googleapis.com/fitness/v1/users/me/sessions?' + new URLSearchParams({
      startTime: new Date(weekAgo).toISOString(),
      endTime: new Date(now).toISOString()
    })
  );
  if (actRes?.ok) {
    const data = await actRes.json();
    (data.session || []).forEach(s => {
      if (s.activityType === 72) return; // skip sleep
      const start = new Date(parseInt(s.startTimeMillis));
      const dayKey = dateKey(start);
      const duration = Math.round((parseInt(s.endTimeMillis) - parseInt(s.startTimeMillis)) / 60000);
      // Only add if no workout logged that day already
      if (!workoutLog[dayKey]) {
        workoutLog[dayKey] = {
          dayName: s.name || 'External Activity',
          duration: duration,
          exercises: [],
          source: 'googlefit',
          activityType: s.activityType
        };
      }
    });
    LS.set('hvi_workout_log', workoutLog);
  }

  // Weight (body measurements)
  const weightRes = await _authedFetch('googlefit',
    'https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/' + weekAgo + '000000-' + now + '000000'
  );
  if (weightRes?.ok) {
    const data = await weightRes.json();
    (data.point || []).forEach(p => {
      const dayKey = dateKey(new Date(parseInt(p.startTimeNanos) / 1e6));
      const kg = p.value?.[0]?.fpVal;
      const w = _kgToDisplayWeight(kg);
      if (w && !weightLog[dayKey]) {
        weightLog[dayKey] = w;
        LS.set('hvi_weight_log', weightLog);
      }
    });
  }
}

// ── STRAVA ───────────────────────────────────────────────────────────────
async function _syncStrava() {
  const weekAgo = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const res = await _authedFetch('strava',
    'https://www.strava.com/api/v3/athlete/activities?after=' + weekAgo + '&per_page=30'
  );
  if (!res?.ok) return;
  const activities = await res.json();

  activities.forEach(a => {
    const dateKey = a.start_date_local?.slice(0, 10) || a.start_date?.slice(0, 10);
    if (!dateKey) return;
    const duration = Math.round((a.elapsed_time || a.moving_time || 0) / 60);

    // Map to workout log if no existing entry
    if (!workoutLog[dateKey]) {
      workoutLog[dateKey] = {
        dayName: a.name || a.sport_type || 'Strava Activity',
        duration: duration,
        exercises: [],
        source: 'strava',
        distance: a.distance ? (a.distance / 1000).toFixed(1) + ' km' : null,
        avgHr: a.average_heartrate || null,
        calories: a.calories || null
      };
    }
  });
  LS.set('hvi_workout_log', workoutLog);
}

// weightLog is stored in whatever unit the user sees, but Google Fit and Fitbit
// both report kilograms (Fitbit defaults to metric when no Accept-Language unit
// system is requested, which is the case here). Importing the raw number showed
// an 80 kg bodyweight as "80 lbs" for imperial users — and that figure feeds the
// relative-strength scoring, so it skewed those percentages too.
function _kgToDisplayWeight(kg) {
  const n = parseFloat(kg);
  if (!isFinite(n)) return null;
  const v = (typeof isImperial === 'function' && isImperial()) ? n * 2.20462 : n;
  return parseFloat(v.toFixed(1));
}

// ── FITBIT ───────────────────────────────────────────────────────────────
async function _syncFitbit() {
  const t = today();
  const weekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return dateKey(d); })();

  // Sleep
  const sleepRes = await _authedFetch('fitbit',
    `https://api.fitbit.com/1.2/user/-/sleep/date/${weekAgo}/${t}.json`
  );
  if (sleepRes?.ok) {
    const data = await sleepRes.json();
    (data.sleep || []).forEach(s => {
      const dateKey = s.dateOfSleep;
      const hours = (s.duration / 3600000).toFixed(1);
      const efficiency = s.efficiency; // 0-100
      if (!sleepLog[dateKey] || !sleepLog[dateKey].hours) {
        sleepLog[dateKey] = {
          ...sleepLog[dateKey],
          hours: parseFloat(hours),
          quality: Math.round(efficiency / 20), // map 0-100 to 1-5
          source: 'fitbit'
        };
      }
    });
    LS.set('hvi_sleep_log', sleepLog);
  }

  // Activities
  const actRes = await _authedFetch('fitbit',
    `https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${weekAgo}&sort=asc&limit=20&offset=0`
  );
  if (actRes?.ok) {
    const data = await actRes.json();
    (data.activities || []).forEach(a => {
      const dateKey = a.startDate || a.originalStartTime?.slice(0, 10);
      if (!dateKey || workoutLog[dateKey]) return;
      workoutLog[dateKey] = {
        dayName: a.activityName || 'Fitbit Activity',
        duration: a.duration ? Math.round(a.duration / 60000) : 0,
        exercises: [],
        source: 'fitbit',
        calories: a.calories || null,
        avgHr: a.averageHeartRate || null
      };
    });
    LS.set('hvi_workout_log', workoutLog);
  }

  // Weight
  const wtRes = await _authedFetch('fitbit',
    `https://api.fitbit.com/1/user/-/body/log/weight/date/${weekAgo}/${t}.json`
  );
  if (wtRes?.ok) {
    const data = await wtRes.json();
    (data.weight || []).forEach(w => {
      const val = _kgToDisplayWeight(w.weight);
      if (val && !weightLog[w.date]) {
        weightLog[w.date] = val;
      }
    });
    LS.set('hvi_weight_log', weightLog);
  }
}

// ── WHOOP (API v2) ───────────────────────────────────────────────────────
// Recovery, sleep and workouts. Whoop retired v1 of its API; this was written
// against v1 and had never connected to anything, so it also had three quiet
// faults: nights were filed under the day they began rather than the day you
// woke, hours were read from a field that does not exist, and a recovery of
// 60 was written into the sleep-quality rating as a 3.
const WHOOP_API = 'https://api.prod.whoop.com/developer/v2';
// Whoop's API sends no CORS headers, so a browser cannot call it. Every call
// goes through Arete's Worker, which forwards the person's own token to
// WHOOP_API unchanged and stores nothing.
function _whoopUrl(path, params) {
  const qs = new URLSearchParams(Object.assign({ path }, params || {}));
  return `${_OAUTH_PROXY}/whoop/api?${qs}`;
}
// Whoop logs the walk to class and the commute as workouts too. Below this
// strain a Whoop-only activity is not counted as a training day in Arete.
const WHOOP_MIN_STRAIN = 4;

// The calendar day a Whoop timestamp fell on, where it was recorded. Whoop
// sends UTC plus the offset in force at the time.
function _whoopLocal(iso, offset) {
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset || '');
  const mins = m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
  return new Date(t + mins * 60000).toISOString();
}
function _whoopDay(iso, offset) { const l = _whoopLocal(iso, offset); return l && l.slice(0, 10); }
// The clock time, as HH:MM, in the same local time.
function _whoopClock(iso, offset) { const l = _whoopLocal(iso, offset); return l && l.slice(11, 16); }

// With Whoop connected, Whoop's night is the record. The screens that take
// sleep by hand use these to step aside for a night Whoop has sent.
function whoopConnected() { try { return !!_getIntegrations().whoop; } catch { return false; } }
function whoopHasNight(day) {
  const e = typeof sleepLog !== 'undefined' && sleepLog ? sleepLog[day] : null;
  return !!(e && e.source === 'whoop' && e.hours > 0);
}

function _whoopSport(name) {
  const n = String(name || '').replace(/[_-]+/g, ' ').trim();
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Whoop activity';
}

// Whoop's sleep performance (0-100) on Arete's 1-5 rating.
function _whoopQuality(perf) {
  return perf >= 90 ? 5 : perf >= 80 ? 4 : perf >= 70 ? 3 : perf >= 55 ? 2 : 1;
}

// Folds one sync's worth of Whoop records into the sleep and workout logs it
// is handed, and reports what it took. The rules:
//  - a night belongs to the day you woke up on
//  - Whoop's night replaces any other record of it: hours, bed and wake times
//    and the rating, whether typed in or synced from another device. With
//    Whoop connected, its sleep is the one Arete uses.
//  - two main sleeps ending on one day (awake at 3, back to sleep) are one night
//  - Whoop's own readings (recovery, HRV, resting heart rate) always update
//  - a session logged in Arete keeps its sets and gains Whoop's strain reading
//  - naps, and anything Whoop has not finished scoring, are left alone
function applyWhoopData(data, sleeps, workouts, burns) {
  const took = { nights: 0, recoveries: 0, workouts: 0 };
  const dayOfSleep = {};
  let lastOffset = null;

  const nights = {};
  (data.sleeps || []).forEach(s => {
    if (!s || s.nap || s.score_state !== 'SCORED' || !s.score) return;
    const day = _whoopDay(s.end, s.timezone_offset);
    if (!day) return;
    dayOfSleep[s.id] = day;
    lastOffset = s.timezone_offset;
    const st = s.score.stage_summary || {};
    const asleep = Math.max(0, (st.total_in_bed_time_milli || 0) - (st.total_awake_time_milli || 0));
    const n = nights[day] || (nights[day] = { asleep: 0, start: null, end: null, perf: null, longest: -1 });
    n.asleep += asleep;
    if (!n.start || Date.parse(s.start) < Date.parse(n.start.iso)) n.start = { iso: s.start, off: s.timezone_offset };
    if (!n.end || Date.parse(s.end) > Date.parse(n.end.iso)) n.end = { iso: s.end, off: s.timezone_offset };
    // The rating follows the main sleep of the night.
    const perf = s.score.sleep_performance_percentage;
    if (typeof perf === 'number' && asleep > n.longest) { n.longest = asleep; n.perf = perf; }
  });

  Object.keys(nights).forEach(day => {
    const n = nights[day];
    if (!(n.asleep > 0)) return;
    const next = { ...(sleeps[day] || {}) };
    next.hours = Math.round(n.asleep / 360000) / 10;
    next.bedtime = _whoopClock(n.start.iso, n.start.off);
    next.wake = _whoopClock(n.end.iso, n.end.off);
    next.source = 'whoop';
    if (n.perf !== null) {
      next.sleepPerf = Math.round(n.perf);
      next.quality = _whoopQuality(n.perf);
      next.qualityFrom = 'whoop';
    }
    sleeps[day] = next;
    took.nights++;
  });

  (data.recoveries || []).forEach(r => {
    if (!r || r.score_state !== 'SCORED' || !r.score || typeof r.score.recovery_score !== 'number') return;
    // A recovery has no time of its own; it hangs off the night it scored.
    const day = dayOfSleep[r.sleep_id] || _whoopDay(r.created_at, lastOffset);
    if (!day) return;
    const cur = sleeps[day] || {};
    const next = { ...cur, whoopRecovery: Math.round(r.score.recovery_score) };
    if (typeof r.score.resting_heart_rate === 'number') next.restingHR = Math.round(r.score.resting_heart_rate);
    if (typeof r.score.hrv_rmssd_milli === 'number') next.hrv = Math.round(r.score.hrv_rmssd_milli);
    sleeps[day] = next;
    took.recoveries++;
  });

  const dayBurn = {};
  (data.workouts || []).forEach(w => {
    if (!w || w.score_state !== 'SCORED' || !w.score) return;
    const day = _whoopDay(w.start, w.timezone_offset);
    if (!day) return;
    const strain = Math.round((w.score.strain || 0) * 10) / 10;
    const minutes = Math.max(0, Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000));
    const reading = {
      id: w.id, sport: _whoopSport(w.sport_name), strain, minutes,
      avgHr: w.score.average_heart_rate || null, maxHr: w.score.max_heart_rate || null,
      calories: w.score.kilojoule ? Math.round(w.score.kilojoule / 4.184) : null,
    };
    // Every activity counts toward what the day burned, the walk to class
    // included, even though only the hardest becomes the day's session.
    const db = dayBurn[day] || (dayBurn[day] = { kcal: 0, strain: 0, n: 0 });
    db.kcal += reading.calories || 0;
    db.strain = Math.max(db.strain, strain);
    db.n++;
    const cur = workouts[day];
    if (cur && cur.source !== 'whoop') {
      // Logged here: the sets are the record. Whoop adds what it measured.
      if (!cur.whoop || reading.strain >= (cur.whoop.strain || 0)) cur.whoop = reading;
      took.workouts++;
      return;
    }
    if (strain < WHOOP_MIN_STRAIN) return;
    // Two Whoop activities on one day: the harder one stands for the day.
    if (cur && cur.whoopId !== w.id && (cur.strain || 0) >= strain) return;
    workouts[day] = {
      dayName: reading.sport, duration: minutes, exercises: [], source: 'whoop', whoopId: w.id,
      strain, avgHr: reading.avgHr, calories: reading.calories,
      distance: w.score.distance_meter ? (w.score.distance_meter / 1000).toFixed(1) + ' km' : null,
    };
    took.workouts++;
  });

  // What each day's training burned, for the calorie target and the training
  // load (connect.js). The first day of a sync starts part way through, so it
  // only fills a day not on record yet rather than shrinking one that is.
  if (burns) {
    const partial = data.since ? _whoopDay(data.since, lastOffset) : null;
    Object.keys(dayBurn).forEach(day => {
      if (partial && day <= partial && burns[day]) return;
      const db = dayBurn[day];
      burns[day] = { kcal: Math.round(db.kcal), strain: db.strain, n: db.n };
    });
    took.burnDays = Object.keys(dayBurn).length;
  }

  return took;
}

// Whoop pages at 25 records. Ten days of workouts can run past that for
// someone whose band logs every walk, so follow the pages (up to 100, or more
// for the first sync's 60 days).
async function _whoopGet(path, startISO, maxPages) {
  const records = [];
  let next = null;
  for (let page = 0; page < (maxPages || 4); page++) {
    const params = { limit: 25, start: startISO };
    if (next) params.nextToken = next;
    const res = await _authedFetch('whoop', _whoopUrl(path, params));
    if (!res || !res.ok) throw new Error(`Whoop ${path} ${res ? res.status : 'no token'}`);
    const data = await res.json();
    records.push(...(data.records || []));
    next = data.next_token;
    if (!next) break;
  }
  return records;
}

// Weight and height as Whoop has them. They are written only when Whoop's own
// value changes, so an unchanged Whoop number never overwrites a weigh-in typed
// into Arete. The very first sync fills today's weight only if none is logged.
// Weight goes into the weight log, where the bodyweight-drift check already
// offers new targets; height goes into the profile the targets are built from.
function applyWhoopBody(b) {
  const prev = LS.get('hvi_whoop_body', null);
  const out = Object.assign({}, prev || {}, { at: Date.now() });
  const took = {};
  const kg = Number(b && b.weight_kilogram), m = Number(b && b.height_meter), mhr = Number(b && b.max_heart_rate);
  if (kg >= 20 && kg <= 300 && (!prev || Math.abs(kg - (prev.kg || 0)) >= 0.05)) {
    const t = today();
    if (prev || weightLog[t] == null) {
      const val = Math.round(_kgToDisplayWeight(kg) * 10) / 10;
      weightLog[t] = val;
      LS.set('hvi_weight_log', weightLog);
      if (window.Arete) window.Arete.emit('weight:logged', { value: val, source: 'whoop' });
      took.weight = val;
    }
    out.kg = Math.round(kg * 100) / 100;
  }
  if (m >= 1 && m <= 2.6 && (!prev || Math.abs(m - (prev.m || 0)) >= 0.005)) {
    const cm = Math.round(m * 100);
    const p = LS.get('hvi_tdee_profile', null);
    if (p && p.height_cm !== cm) { p.height_cm = cm; LS.set('hvi_tdee_profile', p); if (typeof tdeeProfile !== 'undefined') tdeeProfile = p; took.height = cm; }
    out.m = m;
  }
  if (mhr >= 100 && mhr <= 230) out.maxHr = Math.round(mhr);
  LS.set('hvi_whoop_body', out);
  return took;
}

async function _syncWhoop() {
  // Ten days back: enough to fill a week and to pick up a night Whoop was
  // still scoring the last time this ran. The first sync on a device goes back
  // 60 days instead, so Your patterns and a usual day's burn have weeks to work
  // from straight away rather than a month later.
  const first = !(_getIntegrations().whoop || {}).backfilled;
  const since = new Date(Date.now() - (first ? 60 : 10) * 86400000).toISOString();
  const pages = first ? 12 : 4;
  // One after another, not together: the first call may refresh the token, and
  // Whoop cancels a refresh token the moment it is used.
  const sleeps = await _whoopGet('/activity/sleep', since, pages);
  const recoveries = await _whoopGet('/recovery', since, pages);
  const workouts = await _whoopGet('/activity/workout', since, pages);

  const burns = LS.get('hvi_burn_log', {}) || {};
  const took = applyWhoopData({ sleeps, recoveries, workouts, since }, sleepLog, workoutLog, burns);
  // Eight weeks is plenty for a usual day (connect.js looks back four).
  const keepFrom = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);
  Object.keys(burns).forEach(d => { if (d < keepFrom) delete burns[d]; });
  LS.set('hvi_burn_log', burns);
  LS.set('hvi_sleep_log', sleepLog);
  LS.set('hvi_workout_log', workoutLog);
  // Connections made before body measurements were asked for get a 401 here;
  // the rest of the sync still stands.
  try {
    const res = await _authedFetch('whoop', _whoopUrl('/user/measurement/body'));
    if (res && res.ok) Object.assign(took, applyWhoopBody(await res.json()));
  } catch {}
  if (first) { const i = _getIntegrations(); if (i.whoop) { i.whoop.backfilled = true; _saveIntegrations(i); } }
  // The score on home, the Sleep screen, today's session and today's calorie
  // target are built from this; show them without a relaunch. Not mid-workout.
  if ((took.nights || took.recoveries || took.workouts) && typeof go === 'function' && typeof curView !== 'undefined' && ['home', 'sleep', 'workout', 'diet'].includes(curView)) {
    try { go(curView, {}, false); } catch {}
  }
  return took;
}

// ── UI RENDERING ─────────────────────────────────────────────────────────
function connectAppleHealth() {
  const token = prompt('Enter your Health sync token.\n\nThis is the HEALTH_TOKEN secret you set in your Cloudflare Worker. The same token goes in your Apple Shortcut.');
  if (!token || !token.trim()) return;
  localStorage.setItem('hvi_health_token', token.trim());
  const int = _getIntegrations();
  int.applehealth = { connectedAt: Date.now() };
  _saveIntegrations(int);
  syncAppleHealth();
  if (typeof renderStats === 'function') renderStats();
}

function disconnectAppleHealth() {
  localStorage.removeItem('hvi_health_token');
  const int = _getIntegrations();
  delete int.applehealth;
  _saveIntegrations(int);
  if (typeof renderStats === 'function') renderStats();
}

function renderIntegrationsSection(still) {
  // In the iPhone and Android apps, Connect signs in through a browser sheet
  // (see _connectNative). Apple Health stays on the website: it is set up
  // through a Shortcut, and in the app it should be HealthKit instead.
  const native = typeof window !== 'undefined' && _isNativeApp();
  const int = _getIntegrations();

  // Apple Health row
  const ahConnected = !!int.applehealth && !!_getHealthToken();
  const ahSync = int.applehealth?.lastSync;
  const ahAge = ahSync ? _timeAgo(ahSync) : null;
  const appleRow = `<div class="intg-row">
    <div class="intg-icon">${APPLE_HEALTH_CFG.icon}</div>
    <div class="intg-info">
      <div class="intg-name">${APPLE_HEALTH_CFG.name}</div>
      <div class="intg-status">${ahConnected ? `Connected · synced ${ahAge || 'never'}` : 'steps, sleep, heart rate, workouts'}</div>
    </div>
    <div class="intg-action">
      ${ahConnected
        ? `<button class="intg-btn intg-btn-sync" onclick="syncAppleHealth();this.textContent='Syncing…'" title="Sync now">↻</button>
           <button class="intg-btn intg-btn-disc" onclick="disconnectAppleHealth()" title="Disconnect">×</button>`
        : `<button class="intg-btn intg-btn-conn" onclick="connectAppleHealth()">Connect</button>`}
    </div>
  </div>`;

  // Other integrations
  const rows = Object.entries(INTEGRATIONS).filter(([key]) => (_CLIENT_IDS[key] && _CLIENT_IDS[key] !== '') || int[key]).map(([key, cfg]) => {
    const connected = !!int[key];
    const lastSync = int[key]?.lastSync;
    const syncAge = lastSync ? _timeAgo(lastSync) : null;
    const failed = connected && int[key].lastError && int[key].lastError > (lastSync || 0);
    const status = !connected ? cfg.provides.join(', ')
      : failed ? 'Sync failed. Tap ↻ to try again.'
      : `Connected · synced ${syncAge || 'never'}`;
    return `<div class="intg-row">
      <div class="intg-icon">${cfg.icon}</div>
      <div class="intg-info">
        <div class="intg-name">${cfg.name}</div>
        <div class="intg-status${failed ? ' intg-failed' : ''}">${status}</div>
      </div>
      <div class="intg-action">
        ${connected
          ? `<button class="intg-btn intg-btn-sync" onclick="syncIntegration('${key}');this.textContent='Syncing…'" title="Sync now">↻</button>
             <button class="intg-btn intg-btn-disc" onclick="disconnectIntegration('${key}')" title="Disconnect">×</button>`
          : `<button class="intg-btn intg-btn-conn" onclick="connectIntegration('${key}')">Connect</button>`}
      </div>
    </div>`;
  }).join('');

  const allConnected = Object.keys(int).length > 0;
  return `
    <div class="da-section${still ? '' : ' ani'}" id="intg-section" style="margin:0 24px 16px;padding:16px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Connected Devices</div>
      <div class="intg-list">${native ? '' : appleRow}${rows}</div>
      ${allConnected ? `<button class="intg-sync-all" onclick="syncAllIntegrations();syncAppleHealth();this.textContent='Syncing all…'">Sync All Now</button>` : ''}
    </div>`;
}

function _timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ── AUTO-SYNC ────────────────────────────────────────────────────────────
// Runs when Arete opens and whenever it comes back on screen. A phone often
// resumes the app rather than reloading it, and the sync used to run on a
// reload only, so last night could stay missing until the next restart.
//
// Due every 2 hours, Whoop every 20 minutes. Whoop is checked every 10 minutes
// in the morning until last night arrives: it scores the night a little after
// you wake, so an early look often finds nothing yet. A failed sync waits 10
// minutes too.
function _syncDue(service, now) {
  const i = _getIntegrations()[service];
  if (!i) return false;
  const last = Math.max(i.lastSync || 0, i.lastError || 0);
  const morning = new Date(now).getHours() < 14;
  const waiting = service === 'whoop' && morning && !whoopHasNight(today());
  const failed = (i.lastError || 0) > (i.lastSync || 0);
  // Whoop's sessions move today's calorie target (connect.js), so it is asked
  // every 20 minutes rather than every 2 hours: opening the app an hour after
  // a match should show the match.
  const every = waiting || failed ? 10 * 60000 : service === 'whoop' ? 20 * 60000 : 2 * 3600000;
  return now - last > every;
}

function _autoSync() {
  const int = _getIntegrations(), now = Date.now();
  if (int.applehealth && _getHealthToken() && now - (int.applehealth.lastSync || 0) > 2 * 3600000) syncAppleHealth();
  Object.keys(int).forEach(service => {
    if (service !== 'applehealth' && _syncDue(service, now)) syncIntegration(service);
  });
}

function _initIntegrations() {
  _handleOAuthCallback();
  if (_isNativeApp()) _listenForNativeSignIn();
  setTimeout(_autoSync, 3000);
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (_isNativeApp()) _claimNative();
      setTimeout(_autoSync, 800);
    });
  }
}

_initIntegrations();
