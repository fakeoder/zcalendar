# Zcalendar

A lightweight cross-platform calendar bridge built on Cloudflare Workers and D1.

Create a calendar in the browser, manage events, then subscribe to a read-only ICS URL from Apple Calendar, Google Calendar, Outlook, or any calendar app that supports ICS subscription.

## Features

- Create calendars with a name, timezone, and optional custom `/c/<slug>` link.
- Realtime custom-link availability check while typing (`GET /api/slug-check`).
- Creating a calendar returns the management link exactly once, with a strong save reminder, open-in-new-tab, and a downloadable QR code of the link. Subscription URLs are generated later from the manager.
- Management link exchanges itself for an `HttpOnly` session cookie, so the token does not stay in the URL.
- Stateless signed sessions: `HMAC-SHA256` keyed by the management token hash. Regenerating the management link invalidates every old session with no server-side session store.
- Per-device subscription tokens (iPhone, Wife, iPad, …) with independent regenerate and revoke actions.
- Read-only `GET /c/<slug>.ics?token=…` endpoint with `text/calendar`, `Cache-Control: no-cache`, and `X-Robots-Tag: noindex, nofollow`.
- RFC 5545 output: stable UIDs, UTC `DTSTART`/`DTEND`, `VALUE=DATE` all-day events, `RRULE` passthrough (never expanded server-side), text escaping, CRLF line endings, and 75-octet line folding.
- Event CRUD with optional location, description, and recurrence rule; friendly structured RRULE editor (frequency, interval, weekdays, ends) with raw RFC 5545 toggle; calendar rename and timezone change.
- Delete a calendar from settings after typing its name to confirm (`DELETE /api/calendars/<id>`).
- CSRF protection via a per-session nonce header on every `POST`/`PATCH`/`DELETE`.
- Responsive layout, light/dark theme, and Chinese/English UI.
- No accounts, no third-party analytics, no event content logging, no token logging.

## Project Layout

```text
src/index.js              Worker routes, auth, API, ICS generation
public/                   Landing page, manager page, styles, i18n, vendored QR
public/vendor/qrcode.js   Vendored node-qrcode + dijkstrajs (MIT), generated once
scripts/vendor-qrcode.mjs Re-generates public/vendor/qrcode.js
migrations/               D1 migration
scripts/smoke-test.mjs    Local smoke test (full management + ICS round trip)
wrangler.toml             Worker / D1 / static assets configuration
```

## Local Development

```bash
npm install
npm run db:local
npm run dev
```

The local server runs at `http://127.0.0.1:8787`.

Run the smoke test in a second terminal while `npm run dev` is running:

```bash
npm run smoke
```

The smoke test covers slug availability check, calendar creation, session exchange, CSRF rejection, event create/edit/delete, ICS output (UID stability, RRULE, all-day `VALUE=DATE`, escaping, headers), subscription regenerate/revoke, management-token rotation, and calendar delete.

Check syntax:

```bash
node --check src/index.js
node --check public/site.js
node --check public/app.js
node --check public/manage.js
```

## Database

The D1 binding is defined in `wrangler.toml`. Do not publish credentials or database identifiers in public documentation.

Zcalendar shares the same D1 database as Zenshare (`zkraft`). The migration only creates zcalendar-specific tables (`calendars`, `events`, `management_tokens`, `subscriptions`) with `IF NOT EXISTS`, so it does not touch existing Zenshare tables. No new database needs to be created.

Apply the schema to the local or remote database:

```bash
npm run db:local
npm run db:remote
```

The Worker also runs idempotent `CREATE TABLE IF NOT EXISTS` statements on first access, so a missing migration will not break the service.

## Deploy

```bash
npm run deploy
```

The Worker name, routes, and static asset directory are defined in `wrangler.toml`.

## URLs

```text
GET  /                              Landing page + create form
GET  /create                        Same create form
GET  /c/<slug>                      Redirect to the manager
GET  /c/<slug>/manage?token=…       Exchange management link for a session
GET  /c/<slug>/settings             Manager, settings tab
GET  /c/<slug>/events/<id>          Manager, events tab
GET  /c/<slug>.ics?token=…          ICS subscription feed
```

## API

All `/api/*` routes return JSON with `Cache-Control: no-store`. Mutating requests require the session cookie plus `X-CSRF-Token`-style header `X-ZC-CSRF` (nonce returned by `GET /api/calendars/<slug>`).

### Create Calendar

```http
POST /api/calendars
Content-Type: application/json
```

```json
{
  "name": "Family",
  "timezone": "Asia/Shanghai",
  "slug": "family"
}
```

`slug` is optional; an empty or omitted value is derived from the name. `timezone` must be an IANA zone name. The response returns `manageUrl` once; the token cannot be read back later. Subscription URLs are created from the manager.

### Check Slug Availability

```http
GET /api/slug-check?slug=family
```

```json
{ "available": true, "slug": "family" }
```

An empty `slug` query returns `{ "available": true, "slug": "", "generated": true }` (auto-generate). Invalid format returns `available: false` with `code: "slug_invalid"`.

### Read Calendar

```http
GET /api/calendars/<slug>
Cookie: zc_session=…
```

Returns the calendar, all events ordered by `start_at`, subscription metadata (never tokens), and the CSRF `nonce`.

### Update Calendar

```http
PATCH /api/calendars/<id>
Content-Type: application/json
X-ZC-CSRF: <nonce>
```

```json
{ "name": "Family", "timezone": "UTC" }
```

### Delete Calendar

```http
DELETE /api/calendars/<id>
X-ZC-CSRF: <nonce>
```

Deletes the calendar and all of its events, subscriptions, and management tokens in one batch. The UI requires typing the calendar name before enabling the confirm button.

### Events

```http
POST   /api/calendars/<id>/events
PATCH  /api/events/<id>
DELETE /api/events/<id>
```

```json
{
  "title": "Doctor",
  "description": "Annual checkup",
  "location": "Hospital",
  "start_at": "2026-09-23T10:00:00.000Z",
  "end_at": "2026-09-23T11:00:00.000Z",
  "all_day": false,
  "rrule": "FREQ=WEEKLY;BYDAY=WE"
}
```

Timed events use ISO UTC datetimes. All-day events use `YYYY-MM-DD` with an exclusive `end_at`. The event `uid` never changes across edits so calendar apps update in place.

### Subscriptions

```http
GET    /api/calendars/<id>           (subscriptions included in read response)
POST   /api/calendars/<id>/subscriptions
POST   /api/subscriptions/<id>/regenerate
POST   /api/subscriptions/<id>/revoke
```

```json
{ "name": "My iPhone" }
```

Create and regenerate return the raw URL once. Listing only returns `name`, `status`, and timestamps.

### Rotate Management Link

```http
POST /api/calendars/<id>/manage-token/regenerate
```

Revokes every active management token, issues a new one, sets a fresh session cookie, and returns the new `manageUrl`.

### ICS Feed

```http
GET /c/<slug>.ics?token=<subscription token>
```

```http
Content-Type: text/calendar; charset=utf-8
Cache-Control: no-cache
X-Robots-Tag: noindex, nofollow
```

Invalid, missing, or revoked tokens return `401`.

## Security Notes

- Management and subscription tokens are 32 random bytes; the database stores only SHA-256 hashes.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, and carry no raw token.
- ICS authorization is token-only and never depends on cookies, because calendar apps do not run your session.
- Tokens are never written to logs; only subscription ids and redacted metadata belong in logs.
- Losing the management link means losing access until a new link is generated from an active session; this is expected for passwordless secret-based products.
- Calendar contents are private by default: no third-party analytics, no advertising, no event content logging.

## Out of Scope (v1)

CalDAV, OAuth, Google/Apple/Outlook APIs, native apps, push/email notifications, accounts, RBAC, rate limiting, and object storage.

## License

MIT. See [LICENSE](LICENSE).

## Open Source

[github.com/fakeoder/zcalendar](https://github.com/fakeoder/zcalendar)
