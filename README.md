# circadianphase

A local-first web app that estimates your circadian phase from proxy signals and shows how far
your biological night is from the wake time your schedule imposes.

**Not a medical device.** Every number is an estimate from population-average relationships, shown
with its confidence and the assumption behind it. Delayed sleep phase disorder is diagnosed by a
clinician.

## What it does

- **Daily log** (manual, works standalone): sleep onset, wake time, alarm vs. natural wake,
  grogginess 1–5, light notes, optional melatonin time.
- **MSFsc** from the Munich ChronoType Questionnaire method: mid-sleep on alarm-free nights,
  corrected for sleep debt accumulated on alarm nights.
- **DLMO ≈ MSFsc − 7 h**, flagged as a population-average approximation with ±2 h scatter.
- **CBTmin** ≈ 2.5 h before natural wake, or the overnight heart-rate nadir if a series is imported.
- **Primary view**: 24 h timeline with the estimated melatonin window (with uncertainty halo),
  your free-day and alarm-day sleep windows, CBTmin and required wake, plus the headline gap in hours
  and a sleep-inertia prediction (pre-nadir, near-nadir, deep-sleep, melatonin-still-elevated).
- **Phase-shifting windows** from the light and melatonin phase response curves: morning bright
  light, evening light avoidance, and the melatonin PRC zone (timing only, no dosing).
- **Export**: CSV of the log, a printable one-page summary, JSON backup/restore.
- **WHOOP** (optional): OAuth 2.0 against WHOOP API v2 to pull sleep, cycle and recovery data,
  import sleep windows into the log, and show stage distribution per night.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm test           # MSFsc, phase, PRC and marker maths
npm run build      # static site in dist/
```

Deploy `dist/` to any static host. A GitHub Pages workflow is included (`.github/workflows/deploy.yml`).

## WHOOP

Checked against developer.whoop.com and the published OpenAPI spec (`openapi.json`) in October 2026:

- Current API is **v2** (`https://api.prod.whoop.com/developer/v2/...`); v1 IDs were sunset 09/2025.
- OAuth 2.0 authorization-code grant; `state` must be 8 characters; `offline` scope for refresh
  tokens; access tokens last ~1 h; refreshing invalidates the previous tokens.
- The client secret must stay server-side and PKCE is not documented, so a tiny relay is required.
  See [`relay/README.md`](relay/README.md). It runs as a Cloudflare Worker or `npm run relay` locally.
- **Limitation:** the public API exposes per-sleep summaries (start/end, stage totals, sleep need,
  one RHR and HRV value per recovery). It does not expose an intra-night heart-rate or HRV time
  series, so heart-rate-nadir and HRV-peak timing cannot be derived from WHOOP's API. The app accepts
  a `timestamp,bpm` CSV from any device export for that marker instead.

## Method and references

See the **Method** tab in the app. Core sources: Roenneberg et al. 2003/2015 (MCTQ); Kantermann,
Sung & Burgess 2015 (MCTQ vs DLMO); Khalsa et al. 2003 and Minors et al. 1991 (light PRC);
Lewy et al. 1998 and Burgess et al. 2008/2010 (melatonin PRC).

## Layout

```
src/lib/        pure maths, fully tested: time, msfsc, phase, prc, markers, export
src/db/         Dexie (IndexedDB) schema
src/whoop/      WHOOP v2 types + OAuth/REST client (talks to the relay)
src/components  UI
relay/          token relay (Cloudflare Worker + local Node runner)
openapi.json    WHOOP OpenAPI spec snapshot
```
