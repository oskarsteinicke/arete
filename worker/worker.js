// Cloudflare Worker — Arete API Proxy (Gemini + OAuth + Health)
// Deploy: npx wrangler deploy
// Secrets needed:
//   GEMINI_KEY          — Google Gemini API key
//   GROQ_KEY            — Groq API key (free tier, fallback for diet AI)
//   HEALTH_TOKEN        — Bearer token for Apple Health Shortcut
//   GOOGLE_CLIENT_ID    — Google OAuth client ID
//   GOOGLE_SECRET       — Google OAuth client secret
//   STRAVA_CLIENT_ID    — Strava OAuth client ID
//   STRAVA_SECRET       — Strava OAuth client secret
//   FITBIT_CLIENT_ID    — Fitbit OAuth client ID
//   FITBIT_SECRET       — Fitbit OAuth client secret
//   WHOOP_CLIENT_ID     — Whoop OAuth client ID
//   WHOOP_SECRET        — Whoop OAuth client secret
// KV binding needed:
//   HEALTH_KV           — KV namespace for Apple Health data

const ALLOWED_ORIGINS = [
  'https://get-arete.com',
  'https://www.get-arete.com',
  'https://oskarsteinicke.github.io',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5500'
];

const MODEL = 'gemini-2.5-flash';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function cors(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) }
  });
}

// OAuth service configs
function getOAuthConfig(service, env) {
  const configs = {
    googlefit: {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_SECRET
    },
    strava: {
      tokenUrl: 'https://www.strava.com/oauth/token',
      clientId: env.STRAVA_CLIENT_ID,
      clientSecret: env.STRAVA_SECRET
    },
    fitbit: {
      tokenUrl: 'https://api.fitbit.com/oauth2/token',
      clientId: env.FITBIT_CLIENT_ID,
      clientSecret: env.FITBIT_SECRET
    },
    whoop: {
      tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
      clientId: env.WHOOP_CLIENT_ID,
      clientSecret: env.WHOOP_SECRET
    }
  };
  return configs[service] || null;
}

async function handleOAuthExchange(body, env, origin) {
  const { service, code, redirect_uri } = body;
  const cfg = getOAuthConfig(service, env);
  if (!cfg) return jsonResponse({ error: 'Unknown service' }, 400, origin);
  if (!cfg.clientId || !cfg.clientSecret) return jsonResponse({ error: `${service} not configured` }, 400, origin);

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  // Fitbit requires Basic auth header
  if (service === 'fitbit') {
    headers['Authorization'] = 'Basic ' + btoa(cfg.clientId + ':' + cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body: params.toString() });
  const data = await res.json();

  if (!res.ok) return jsonResponse({ error: data.error_description || data.error || 'Token exchange failed' }, res.status, origin);

  // Normalize response
  const result = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    token_type: data.token_type || 'Bearer'
  };

  // Strava includes athlete info
  if (data.athlete) result.athlete = { id: data.athlete.id, firstname: data.athlete.firstname };

  return jsonResponse(result, 200, origin);
}

async function handleOAuthRefresh(body, env, origin) {
  const { service, refresh_token } = body;
  const cfg = getOAuthConfig(service, env);
  if (!cfg) return jsonResponse({ error: 'Unknown service' }, 400, origin);
  if (!cfg.clientId || !cfg.clientSecret) return jsonResponse({ error: `${service} not configured` }, 400, origin);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (service === 'fitbit') {
    headers['Authorization'] = 'Basic ' + btoa(cfg.clientId + ':' + cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body: params.toString() });
  const data = await res.json();

  if (!res.ok) return jsonResponse({ error: data.error_description || data.error || 'Refresh failed' }, res.status, origin);

  return jsonResponse({
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000
  }, 200, origin);
}

async function handleHealth(request, env, origin) {
  if (!env.HEALTH_TOKEN) return jsonResponse({ error: 'Health not configured' }, 500, origin);
  if (!env.HEALTH_KV) return jsonResponse({ error: 'KV not bound' }, 500, origin);

  const auth = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  if (auth !== env.HEALTH_TOKEN) return jsonResponse({ error: 'Unauthorized' }, 401, origin);

  if (request.method === 'POST') {
    const body = await request.json();
    const date = body.date;
    if (!date) return jsonResponse({ error: 'Missing date' }, 400, origin);
    await env.HEALTH_KV.put(`health:${date}`, JSON.stringify(body), { expirationTtl: 30 * 86400 });
    return jsonResponse({ ok: true, date }, 200, origin);
  }

  if (request.method === 'GET') {
    const days = parseInt(new URL(request.url).searchParams.get('days') || '7');
    const results = {};
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const val = await env.HEALTH_KV.get(`health:${key}`);
      if (val) results[key] = JSON.parse(val);
    }
    return jsonResponse(results, 200, origin);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors(origin), 'Access-Control-Max-Age': '86400' } });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health endpoints accept GET and POST
    if (path === '/health') {
      return handleHealth(request, env, origin);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // OAuth token exchange
      if (path === '/oauth/exchange') {
        const body = await request.json();
        return handleOAuthExchange(body, env, origin);
      }

      // OAuth token refresh
      if (path === '/oauth/refresh') {
        const body = await request.json();
        return handleOAuthRefresh(body, env, origin);
      }

      // Groq proxy
      if (path === '/groq') {
        if (!env.GROQ_KEY) return jsonResponse({ error: 'Groq not configured' }, 500, origin);
        const body = await request.text();
        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_KEY}`
          },
          body
        });
        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...cors(origin) }
        });
      }

      // Default: Gemini proxy (root path)
      const body = await request.text();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );

      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...cors(origin) }
      });

    } catch (e) {
      return jsonResponse({ error: e.message }, 500, origin);
    }
  }
};
