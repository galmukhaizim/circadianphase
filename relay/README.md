# WHOOP token relay

WHOOP's OAuth 2.0 flow is the authorization-code grant with a client secret.
Their docs state the secret must only be used server-side and do not document
PKCE, so a purely static site cannot finish the flow by itself. This relay is
the smallest possible server piece: it exchanges and refreshes tokens with the
secret, and forwards API calls so the browser never talks to `api.prod.whoop.com`
directly. It keeps no state.

The manual path of the app does not need this at all.

## Setup

1. Create an app at https://developer-dashboard.whoop.com/. Scopes: `read:sleep`,
   `read:cycles`, `read:recovery`, `read:profile`, `offline`. Redirect URL: the exact
   URL the app is served from (for local dev `http://localhost:5173/`).
2. Run the relay:
   - Locally: `WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... npm run relay` (listens on :8787,
     allows origin `http://localhost:5173`).
   - Cloudflare Workers: `cd relay && npx wrangler deploy`, then
     `npx wrangler secret put WHOOP_CLIENT_ID` and `... WHOOP_CLIENT_SECRET`; set `ALLOWED_ORIGIN`
     in `wrangler.toml` to the static site's origin.
3. In the app's WHOOP tab enter the client ID and the relay URL, then click Connect.

## Endpoints

| Method | Path        | Body                                                        |
| ------ | ----------- | ----------------------------------------------------------- |
| POST   | `/token`    | `{ grant_type: "authorization_code", code, redirect_uri }`  |
| POST   | `/refresh`  | `{ grant_type: "refresh_token", refresh_token }`            |
| any    | `/whoop/*`  | proxied to `https://api.prod.whoop.com/developer/*`         |

Rate-limit headers (`x-ratelimit-*`) are passed through.
