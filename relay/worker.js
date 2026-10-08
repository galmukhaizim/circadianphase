/**
 * WHOOP token relay.
 *
 * WHOOP's OAuth 2.0 flow needs the client secret on the token endpoint and the
 * docs say it must never ship to a browser, so this tiny relay holds it. It
 * does three things and nothing else:
 *
 *   POST /token    { grant_type: "authorization_code", code, redirect_uri }
 *   POST /refresh  { grant_type: "refresh_token", refresh_token }
 *   ANY  /whoop/*  -> https://api.prod.whoop.com/developer/* (Authorization header passed through)
 *
 * Runs unchanged as a Cloudflare Worker (export default { fetch }) or under
 * Node via relay/local.mjs. Configure with environment variables:
 *
 *   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET   from the WHOOP developer dashboard
 *   ALLOWED_ORIGIN                          the origin the static app is served from, e.g. https://you.github.io
 *
 * It stores nothing. Tokens live only in the user's browser.
 */

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API = 'https://api.prod.whoop.com/developer';

/**
 * ALLOWED_ORIGIN is a comma-separated list of origins. "*" allows any origin;
 * an entry ending in ":*" allows any port on that host, e.g. "http://localhost:*".
 */
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function originMatches(origin, pattern) {
  if (pattern === '*') return true;
  if (pattern.endsWith(':*')) return origin === pattern.slice(0, -2) || origin.startsWith(pattern.slice(0, -1));
  return origin === pattern;
}

function cors(env, extra = {}, req) {
  const origin = req?.headers.get('origin') || '';
  const list = allowedOrigins(env);
  const allow = list.includes('*') ? '*' : list.some((p) => originMatches(origin, p)) ? origin : list[0];
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    ...extra,
  };
}

function json(env, body, status = 200, req) {
  return new Response(JSON.stringify(body), { status, headers: cors(env, { 'content-type': 'application/json' }, req) });
}

function originAllowed(req, env) {
  const o = req.headers.get('origin') || '';
  return allowedOrigins(env).some((p) => originMatches(o, p));
}

async function exchange(env, form, req) {
  const body = new URLSearchParams({ ...form, client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET });
  const r = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: cors(env, { 'content-type': 'application/json' }, req) });
}

export async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, {}, req) });
  if (!originAllowed(req, env)) return json(env, { error: `origin not allowed: ${req.headers.get('origin')}` }, 403, req);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    return json(env, { ok: true, configured: Boolean(env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET), allowedOrigins: allowedOrigins(env) }, 200, req);
  }
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) return json(env, { error: 'relay not configured' }, 500, req);

  if (req.method === 'POST' && url.pathname === '/token') {
    const b = await req.json().catch(() => ({}));
    if (!b.code || !b.redirect_uri) return json(env, { error: 'code and redirect_uri required' }, 400, req);
    return exchange(env, { grant_type: 'authorization_code', code: b.code, redirect_uri: b.redirect_uri }, req);
  }
  if (req.method === 'POST' && url.pathname === '/refresh') {
    const b = await req.json().catch(() => ({}));
    if (!b.refresh_token) return json(env, { error: 'refresh_token required' }, 400, req);
    // Per WHOOP docs the refresh request carries scope=offline.
    return exchange(env, { grant_type: 'refresh_token', refresh_token: b.refresh_token, scope: 'offline' }, req);
  }
  if (url.pathname.startsWith('/whoop/')) {
    const auth = req.headers.get('authorization');
    if (!auth) return json(env, { error: 'authorization header required' }, 401, req);
    const target = WHOOP_API + url.pathname.slice('/whoop'.length) + url.search;
    const r = await fetch(target, { method: req.method, headers: { authorization: auth, accept: 'application/json' } });
    const headers = cors(env, { 'content-type': r.headers.get('content-type') || 'application/json' }, req);
    for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
      const v = r.headers.get(h);
      if (v) headers[h] = v;
    }
    return new Response(r.body, { status: r.status, headers });
  }
  return json(env, { error: 'not found' }, 404, req);
}

export default { fetch: handle };
