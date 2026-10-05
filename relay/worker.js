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

function cors(env, extra = {}) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    ...extra,
  };
}

function json(env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(env, { 'content-type': 'application/json' }) });
}

function originAllowed(req, env) {
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*') return true;
  const o = req.headers.get('origin');
  return o === env.ALLOWED_ORIGIN;
}

async function exchange(env, form) {
  const body = new URLSearchParams({ ...form, client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET });
  const r = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: cors(env, { 'content-type': 'application/json' }) });
}

export async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
  if (!originAllowed(req, env)) return json(env, { error: 'origin not allowed' }, 403);
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) return json(env, { error: 'relay not configured' }, 500);

  if (req.method === 'POST' && url.pathname === '/token') {
    const b = await req.json().catch(() => ({}));
    if (!b.code || !b.redirect_uri) return json(env, { error: 'code and redirect_uri required' }, 400);
    return exchange(env, { grant_type: 'authorization_code', code: b.code, redirect_uri: b.redirect_uri });
  }
  if (req.method === 'POST' && url.pathname === '/refresh') {
    const b = await req.json().catch(() => ({}));
    if (!b.refresh_token) return json(env, { error: 'refresh_token required' }, 400);
    // Per WHOOP docs the refresh request carries scope=offline.
    return exchange(env, { grant_type: 'refresh_token', refresh_token: b.refresh_token, scope: 'offline' });
  }
  if (url.pathname.startsWith('/whoop/')) {
    const auth = req.headers.get('authorization');
    if (!auth) return json(env, { error: 'authorization header required' }, 401);
    const target = WHOOP_API + url.pathname.slice('/whoop'.length) + url.search;
    const r = await fetch(target, { method: req.method, headers: { authorization: auth, accept: 'application/json' } });
    const headers = cors(env, { 'content-type': r.headers.get('content-type') || 'application/json' });
    for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
      const v = r.headers.get(h);
      if (v) headers[h] = v;
    }
    return new Response(r.body, { status: r.status, headers });
  }
  return json(env, { error: 'not found' }, 404);
}

export default { fetch: handle };
