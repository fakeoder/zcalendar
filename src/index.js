const SESSION_COOKIE = 'zc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EVENTS = 5000;

const CALENDARS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS calendars (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;
const CALENDARS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_calendars_slug ON calendars(slug)
`;
const EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    rrule TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
    UNIQUE (calendar_id, uid)
  )
`;
const EVENTS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id)
`;
const EVENTS_START_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_events_calendar_start ON events(calendar_id, start_at)
`;
const MANAGEMENT_TOKENS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS management_tokens (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at INTEGER,
    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
  )
`;
const MANAGEMENT_TOKENS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_management_tokens_calendar ON management_tokens(calendar_id)
`;
const SUBSCRIPTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_access_at INTEGER,
    revoked_at INTEGER,
    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
  )
`;
const SUBSCRIPTIONS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_subscriptions_calendar ON subscriptions(calendar_id)
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function simplePage(status, kind, request) {
  const acceptsZh = String(request?.headers?.get('accept-language') || '')
    .toLowerCase()
    .startsWith('zh');
  const copies = {
    notFound: acceptsZh
      ? { title: '未找到', message: '页面不存在。' }
      : { title: 'Not Found', message: 'This page does not exist.' },
    invalidLink: acceptsZh
      ? { title: '链接无效', message: '管理链接无效或已被重置。' }
      : { title: 'Invalid Link', message: 'This management link is invalid or was reset.' },
    needManage: acceptsZh
      ? { title: '需要管理链接', message: '请打开创建日历时保存的管理链接。' }
      : { title: 'Management Required', message: 'Open the management link you saved when creating the calendar.' },
  };
  const copy = copies[kind] || copies.notFound;
  return new Response(
    `<!doctype html><html lang="${acceptsZh ? 'zh-CN' : 'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${copy.title} · Zcalendar</title><body style="font-family:system-ui,sans-serif;background:#f4f3ef;color:#1f242a;margin:0;display:grid;place-items:center;min-height:100vh"><div style="text-align:center"><h1 style="font-size:28px">${copy.title}</h1><p style="color:#6a737c">${copy.message}</p><a href="/" style="color:#0e766d">${acceptsZh ? '返回首页' : 'Back to home'}</a></div><style>@media (prefers-color-scheme: dark){body{background:#111417;color:#e7eaed}p{color:#9aa4ad}a{color:#42c6b4}}</style></body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    }
  );
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function randomToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function randomId(prefix) {
  return prefix ? `${prefix}_${crypto.randomUUID()}` : crypto.randomUUID();
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSign(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function hmacVerify(keyBytes, message, signature) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  try {
    return await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(message)
    );
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function buildSessionValue(calendarId, tokenHash) {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${calendarId}.${exp}.${nonce}`;
  const signature = await hmacSign(hexToBytes(tokenHash), payload);
  return `${payload}.${signature}`;
}

function sessionCookie(value, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}${secure}`;
}

async function verifySession(request, env) {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [calendarId, expRaw, nonce, signature] = parts;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  if (!calendarId || !nonce || !signature) return null;
  const rows = await env.DB.prepare(
    'SELECT token_hash FROM management_tokens WHERE calendar_id = ? AND revoked_at IS NULL'
  )
    .bind(calendarId)
    .all();
  const message = `${calendarId}.${expRaw}.${nonce}`;
  for (const row of rows.results || []) {
    if (await hmacVerify(hexToBytes(row.token_hash), message, signature)) {
      return { calendarId, nonce, exp };
    }
  }
  return null;
}

async function requireSession(request, env, { mutate = false } = {}) {
  const session = await verifySession(request, env);
  if (!session) {
    return { error: json({ error: 'Unauthorized', code: 'unauthorized' }, 401) };
  }
  if (mutate) {
    const csrf = request.headers.get('x-zc-csrf') || '';
    if (!csrf || csrf !== session.nonce) {
      return { error: json({ error: 'CSRF token mismatch', code: 'csrf' }, 403) };
    }
  }
  return { session };
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: json({ error: 'Invalid body', code: 'invalid_json' }, 400) };
    }
    return { body };
  } catch {
    return { error: json({ error: 'Invalid JSON', code: 'invalid_json' }, 400) };
  }
}

function cleanString(value, max, label, { required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') return { error: `${label} format is invalid` };
  const clean = value.trim();
  if (!clean) {
    if (required) return { error: `${label} is required` };
    return { value: '' };
  }
  if (clean.length > max) return { error: `${label} cannot exceed ${max} characters` };
  return { value: clean };
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function normalizeSlug(raw) {
  if (raw === undefined || raw === null || raw === '') return { slug: '' };
  if (typeof raw !== 'string') return { error: 'Slug format is invalid' };
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { error: 'Slug can only use lowercase letters, numbers and -' };
  }
  return { slug };
}

let schemaPromise = null;
function ensureSchema(env) {
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(CALENDARS_TABLE_SQL),
      env.DB.prepare(CALENDARS_INDEX_SQL),
      env.DB.prepare(EVENTS_TABLE_SQL),
      env.DB.prepare(EVENTS_INDEX_SQL),
      env.DB.prepare(EVENTS_START_INDEX_SQL),
      env.DB.prepare(MANAGEMENT_TOKENS_TABLE_SQL),
      env.DB.prepare(MANAGEMENT_TOKENS_INDEX_SQL),
      env.DB.prepare(SUBSCRIPTIONS_TABLE_SQL),
      env.DB.prepare(SUBSCRIPTIONS_INDEX_SQL),
    ])
      .then(() => true)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  return schemaPromise;
}

function publicCalendar(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    timezone: row.timezone,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicEvent(row) {
  return {
    id: row.id,
    uid: row.uid,
    title: row.title,
    description: row.description || '',
    location: row.location || '',
    start_at: row.start_at,
    end_at: row.end_at,
    all_day: row.all_day === 1,
    rrule: row.rrule || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicSubscription(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.revoked_at ? 'revoked' : 'active',
    created_at: row.created_at,
    last_access_at: row.last_access_at,
    revoked_at: row.revoked_at,
  };
}

async function getCalendarBySlug(env, slug) {
  return env.DB.prepare('SELECT * FROM calendars WHERE slug = ?').bind(slug).first();
}

async function getCalendarById(env, id) {
  return env.DB.prepare('SELECT * FROM calendars WHERE id = ?').bind(id).first();
}

function originOf(request) {
  return new URL(request.url).origin;
}

async function handleCreateCalendar(request, env) {
  const { body, error } = await readJson(request);
  if (error) return error;

  const nameResult = cleanString(body.name, 80, 'Name', { required: true });
  if (nameResult.error) return json({ error: nameResult.error, code: 'name_invalid' }, 400);
  const name = nameResult.value;

  let timezone = body.timezone === undefined || body.timezone === null || body.timezone === ''
    ? 'UTC'
    : body.timezone;
  if (typeof timezone !== 'string' || timezone.length > 64 || !validTimezone(timezone)) {
    return json({ error: 'Invalid timezone', code: 'timezone_invalid' }, 400);
  }

  const slugResult = normalizeSlug(body.slug);
  if (slugResult.error) return json({ error: slugResult.error, code: 'slug_invalid' }, 400);
  const baseSlug = slugResult.slug || slugify(name) || 'cal';

  await ensureSchema(env);

  const now = Date.now();
  const calendarId = randomId('cal');
  let slug = baseSlug;
  let created = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await env.DB.prepare(
        'INSERT INTO calendars (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
        .bind(calendarId, slug, name, timezone, now, now)
        .run();
      created = await getCalendarById(env, calendarId);
      break;
    } catch (err) {
      if (String(err.message).includes('UNIQUE') && attempt < 5) {
        if (slugResult.slug) {
          return json({ error: 'Slug is already taken', code: 'slug_taken' }, 409);
        }
        slug = `${baseSlug}-${attempt + 2}`;
        continue;
      }
      if (String(err.message).includes('UNIQUE')) {
        return json({ error: 'Slug is already taken', code: 'slug_taken' }, 409);
      }
      throw err;
    }
  }
  if (!created) {
    return json({ error: 'Could not create calendar', code: 'create_failed' }, 500);
  }

  const manageToken = randomToken();
  const manageHash = await sha256Hex(manageToken);
  await env.DB.prepare(
    'INSERT INTO management_tokens (id, calendar_id, token_hash, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(randomId('mt'), calendarId, manageHash, now)
    .run();

  const subToken = randomToken();
  const subHash = await sha256Hex(subToken);
  await env.DB.prepare(
    'INSERT INTO subscriptions (id, calendar_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(randomId('sub'), calendarId, 'Default', subHash, now)
    .run();

  const origin = originOf(request);
  return json(
    {
      ok: true,
      calendar: publicCalendar(created),
      manageUrl: `${origin}/c/${slug}/manage?token=${manageToken}`,
      subscriptionUrl: `${origin}/c/${slug}.ics?token=${subToken}`,
      subscription: { name: 'Default' },
    },
    201
  );
}

async function handleGetCalendarBySlug(request, env, slug) {
  if (!SLUG_RE.test(slug)) return json({ error: 'Not found', code: 'not_found' }, 404);
  const auth = await requireSession(request, env);
  if (auth.error) return auth.error;

  const calendar = await getCalendarBySlug(env, slug);
  if (!calendar) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (calendar.id !== auth.session.calendarId) {
    return json({ error: 'Forbidden', code: 'forbidden' }, 403);
  }

  const events = await env.DB.prepare(
    'SELECT * FROM events WHERE calendar_id = ? ORDER BY start_at ASC LIMIT ?'
  )
    .bind(calendar.id, MAX_EVENTS)
    .all();
  const subs = await env.DB.prepare(
    'SELECT * FROM subscriptions WHERE calendar_id = ? ORDER BY created_at ASC'
  )
    .bind(calendar.id)
    .all();

  return json({
    nonce: auth.session.nonce,
    calendar: publicCalendar(calendar),
    events: (events.results || []).map(publicEvent),
    subscriptions: (subs.results || []).map(publicSubscription),
  });
}

async function handleSlugCheck(request, env) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('slug') || '';
  await ensureSchema(env);

  if (raw === '') {
    return json({ available: true, slug: '', generated: true }, 200);
  }
  const slugResult = normalizeSlug(raw);
  if (slugResult.error) {
    return json(
      { available: false, error: slugResult.error, code: 'slug_invalid', slug: raw },
      200
    );
  }
  const row = await env.DB.prepare('SELECT 1 FROM calendars WHERE slug = ?')
    .bind(slugResult.slug)
    .first();
  return json({ available: !row, slug: slugResult.slug }, 200);
}

async function handleDeleteCalendar(request, env, calendarId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;

  const calendar = await getCalendarById(env, calendarId);
  if (!calendar) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (calendar.id !== auth.session.calendarId) {
    return json({ error: 'Forbidden', code: 'forbidden' }, 403);
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM subscriptions WHERE calendar_id = ?').bind(calendarId),
    env.DB.prepare('DELETE FROM management_tokens WHERE calendar_id = ?').bind(calendarId),
    env.DB.prepare('DELETE FROM events WHERE calendar_id = ?').bind(calendarId),
    env.DB.prepare('DELETE FROM calendars WHERE id = ?').bind(calendarId),
  ]);
  return json({ ok: true });
}

async function handlePatchCalendar(request, env, calendarId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;
  const { body, error } = await readJson(request);
  if (error) return error;

  const calendar = await getCalendarById(env, calendarId);
  if (!calendar) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (calendar.id !== auth.session.calendarId) {
    return json({ error: 'Forbidden', code: 'forbidden' }, 403);
  }

  const patch = [];
  const params = [];
  if (body.name !== undefined) {
    const nameResult = cleanString(body.name, 80, 'Name', { required: true });
    if (nameResult.error) return json({ error: nameResult.error, code: 'name_invalid' }, 400);
    patch.push('name = ?');
    params.push(nameResult.value);
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !validTimezone(body.timezone)) {
      return json({ error: 'Invalid timezone', code: 'timezone_invalid' }, 400);
    }
    patch.push('timezone = ?');
    params.push(body.timezone);
  }
  if (!patch.length) {
    return json({ error: 'Nothing to update', code: 'empty_patch' }, 400);
  }
  patch.push('updated_at = ?');
  params.push(Date.now());

  await env.DB.prepare(`UPDATE calendars SET ${patch.join(', ')} WHERE id = ?`)
    .bind(...params, calendarId)
    .run();
  const updated = await getCalendarById(env, calendarId);
  return json({ ok: true, calendar: publicCalendar(updated) });
}

function parseEventTimes(body) {
  const allDay = body.all_day === true || body.all_day === 1;
  const startRaw = typeof body.start_at === 'string' ? body.start_at.trim() : '';
  const endRaw = typeof body.end_at === 'string' ? body.end_at.trim() : '';
  if (!startRaw || !endRaw) return { error: 'start_at and end_at are required' };

  if (allDay) {
    if (!DATE_RE.test(startRaw) || !DATE_RE.test(endRaw)) {
      return { error: 'All-day events need YYYY-MM-DD dates' };
    }
    const start = new Date(`${startRaw}T00:00:00Z`);
    const end = new Date(`${endRaw}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { error: 'Invalid date' };
    }
    if (end.getTime() <= start.getTime()) return { error: 'end_at must be after start_at' };
    return { allDay: true, startAt: startRaw, endAt: endRaw };
  }

  const startMs = Date.parse(startRaw);
  const endMs = Date.parse(endRaw);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return { error: 'Invalid datetime' };
  if (endMs <= startMs) return { error: 'end_at must be after start_at' };
  return {
    allDay: false,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
  };
}

function validateRrule(rrule) {
  if (rrule === undefined || rrule === null || rrule === '') return { value: '' };
  if (typeof rrule !== 'string') return { error: 'rrule format is invalid' };
  const clean = rrule.trim();
  if (!clean) return { value: '' };
  if (clean.length > 500) return { error: 'rrule cannot exceed 500 characters' };
  if (!/^FREQ=/i.test(clean)) return { error: 'rrule must start with FREQ=' };
  if (/[\r\n]/.test(clean)) return { error: 'rrule format is invalid' };
  return { value: clean };
}

async function handleCreateEvent(request, env, calendarId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;
  const { body, error } = await readJson(request);
  if (error) return error;

  const calendar = await getCalendarById(env, calendarId);
  if (!calendar) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (calendar.id !== auth.session.calendarId) {
    return json({ error: 'Forbidden', code: 'forbidden' }, 403);
  }

  const titleResult = cleanString(body.title, 200, 'Title', { required: true });
  if (titleResult.error) return json({ error: titleResult.error, code: 'title_invalid' }, 400);
  const descResult = cleanString(body.description, 2000, 'Description');
  if (descResult.error) return json({ error: descResult.error, code: 'description_invalid' }, 400);
  const locResult = cleanString(body.location, 500, 'Location');
  if (locResult.error) return json({ error: locResult.error, code: 'location_invalid' }, 400);
  const rruleResult = validateRrule(body.rrule);
  if (rruleResult.error) return json({ error: rruleResult.error, code: 'rrule_invalid' }, 400);
  const times = parseEventTimes(body);
  if (times.error) return json({ error: times.error, code: 'times_invalid' }, 400);

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM events WHERE calendar_id = ?'
  )
    .bind(calendarId)
    .first();
  if (countRow && Number(countRow.count) >= MAX_EVENTS) {
    return json({ error: 'Event limit reached', code: 'event_limit' }, 409);
  }

  const now = Date.now();
  const id = randomId('evt');
  const host = new URL(request.url).host;
  const uid = `${id}@${host}`;
  await env.DB.prepare(
    `INSERT INTO events
      (id, calendar_id, uid, title, description, location, start_at, end_at, all_day, rrule, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      calendarId,
      uid,
      titleResult.value,
      descResult.value,
      locResult.value,
      times.startAt,
      times.endAt,
      times.allDay ? 1 : 0,
      rruleResult.value,
      now,
      now
    )
    .run();

  const row = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  return json({ ok: true, event: publicEvent(row) }, 201);
}

async function getOwnedEvent(env, eventId, calendarId) {
  const row = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!row) return { error: json({ error: 'Not found', code: 'not_found' }, 404) };
  if (row.calendar_id !== calendarId) {
    return { error: json({ error: 'Forbidden', code: 'forbidden' }, 403) };
  }
  return { row };
}

async function handlePatchEvent(request, env, eventId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;
  const owned = await getOwnedEvent(env, eventId, auth.session.calendarId);
  if (owned.error) return owned.error;
  const { body, error } = await readJson(request);
  if (error) return error;

  const patch = [];
  const params = [];

  if (body.title !== undefined) {
    const titleResult = cleanString(body.title, 200, 'Title', { required: true });
    if (titleResult.error) return json({ error: titleResult.error, code: 'title_invalid' }, 400);
    patch.push('title = ?');
    params.push(titleResult.value);
  }
  if (body.description !== undefined) {
    const descResult = cleanString(body.description, 2000, 'Description');
    if (descResult.error) return json({ error: descResult.error, code: 'description_invalid' }, 400);
    patch.push('description = ?');
    params.push(descResult.value);
  }
  if (body.location !== undefined) {
    const locResult = cleanString(body.location, 500, 'Location');
    if (locResult.error) return json({ error: locResult.error, code: 'location_invalid' }, 400);
    patch.push('location = ?');
    params.push(locResult.value);
  }
  if (body.rrule !== undefined) {
    const rruleResult = validateRrule(body.rrule);
    if (rruleResult.error) return json({ error: rruleResult.error, code: 'rrule_invalid' }, 400);
    patch.push('rrule = ?');
    params.push(rruleResult.value);
  }

  const touchesTimes =
    body.start_at !== undefined || body.end_at !== undefined || body.all_day !== undefined;
  if (touchesTimes) {
    const allDay =
      body.all_day !== undefined
        ? body.all_day === true || body.all_day === 1
        : owned.row.all_day === 1;
    const times = parseEventTimes({
      all_day: allDay,
      start_at: body.start_at !== undefined ? body.start_at : owned.row.start_at,
      end_at: body.end_at !== undefined ? body.end_at : owned.row.end_at,
    });
    if (times.error) return json({ error: times.error, code: 'times_invalid' }, 400);
    patch.push('all_day = ?', 'start_at = ?', 'end_at = ?');
    params.push(times.allDay ? 1 : 0, times.startAt, times.endAt);
  }

  if (!patch.length) return json({ error: 'Nothing to update', code: 'empty_patch' }, 400);
  patch.push('updated_at = ?');
  params.push(Date.now());

  await env.DB.prepare(`UPDATE events SET ${patch.join(', ')} WHERE id = ?`)
    .bind(...params, eventId)
    .run();
  const row = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  return json({ ok: true, event: publicEvent(row) });
}

async function handleDeleteEvent(request, env, eventId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;
  const owned = await getOwnedEvent(env, eventId, auth.session.calendarId);
  if (owned.error) return owned.error;
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eventId).run();
  return json({ ok: true });
}

async function handleCreateSubscription(request, env, calendarId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;
  const { body, error } = await readJson(request);
  if (error) return error;

  const calendar = await getCalendarById(env, calendarId);
  if (!calendar) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (calendar.id !== auth.session.calendarId) {
    return json({ error: 'Forbidden', code: 'forbidden' }, 403);
  }

  const nameResult = cleanString(body.name, 60, 'Name', { required: true });
  if (nameResult.error) return json({ error: nameResult.error, code: 'name_invalid' }, 400);

  const token = randomToken();
  const hash = await sha256Hex(token);
  const id = randomId('sub');
  await env.DB.prepare(
    'INSERT INTO subscriptions (id, calendar_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, calendarId, nameResult.value, hash, Date.now())
    .run();

  const origin = originOf(request);
  return json(
    {
      ok: true,
      subscription: { id, name: nameResult.value, status: 'active' },
      url: `${origin}/c/${calendar.slug}.ics?token=${token}`,
    },
    201
  );
}

async function getOwnedSubscription(env, subscriptionId, calendarId) {
  const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?')
    .bind(subscriptionId)
    .first();
  if (!row) return { error: json({ error: 'Not found', code: 'not_found' }, 404) };
  if (row.calendar_id !== calendarId) {
    return { error: json({ error: 'Forbidden', code: 'forbidden' }, 403) };
  }
  return { row };
}

async function handleRegenerateSubscription(request, env, subscriptionId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;
  const owned = await getOwnedSubscription(env, subscriptionId, auth.session.calendarId);
  if (owned.error) return owned.error;

  const calendar = await getCalendarById(env, owned.row.calendar_id);
  const token = randomToken();
  const hash = await sha256Hex(token);
  await env.DB.prepare(
    'UPDATE subscriptions SET token_hash = ?, revoked_at = NULL, created_at = ? WHERE id = ?'
  )
    .bind(hash, Date.now(), subscriptionId)
    .run();

  const origin = originOf(request);
  return json({
    ok: true,
    subscription: { id: subscriptionId, name: owned.row.name, status: 'active' },
    url: `${origin}/c/${calendar.slug}.ics?token=${token}`,
  });
}

async function handleRevokeSubscription(request, env, subscriptionId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;
  const owned = await getOwnedSubscription(env, subscriptionId, auth.session.calendarId);
  if (owned.error) return owned.error;
  await env.DB.prepare('UPDATE subscriptions SET revoked_at = ? WHERE id = ?')
    .bind(Date.now(), subscriptionId)
    .run();
  return json({ ok: true });
}

async function handleRegenerateManageToken(request, env, calendarId) {
  const auth = await requireSession(request, env, { mutate: true });
  if (auth.error) return auth.error;

  const calendar = await getCalendarById(env, calendarId);
  if (!calendar) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (calendar.id !== auth.session.calendarId) {
    return json({ error: 'Forbidden', code: 'forbidden' }, 403);
  }

  const now = Date.now();
  await env.DB.prepare(
    'UPDATE management_tokens SET revoked_at = ? WHERE calendar_id = ? AND revoked_at IS NULL'
  )
    .bind(now, calendarId)
    .run();

  const token = randomToken();
  const hash = await sha256Hex(token);
  await env.DB.prepare(
    'INSERT INTO management_tokens (id, calendar_id, token_hash, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(randomId('mt'), calendarId, hash, now)
    .run();

  const origin = originOf(request);
  const manageUrl = `${origin}/c/${calendar.slug}/manage?token=${token}`;
  const sessionValue = await buildSessionValue(calendarId, hash);
  const response = json({ ok: true, manageUrl });
  response.headers.append('set-cookie', sessionCookie(sessionValue, request));
  return response;
}

const PRODID = '-//zcalendar//zcalendar v1//EN';

function icsEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let current = '';
  let first = true;
  for (const char of line) {
    const candidate = current + char;
    const limit = first ? 75 : 74;
    if (encoder.encode(candidate).length > limit) {
      out.push(first ? current : ` ${current}`);
      first = false;
      current = char;
    } else {
      current = candidate;
    }
  }
  out.push(first ? current : ` ${current}`);
  return out.join('\r\n');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function icsUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(
    d.getUTCHours()
  )}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function icsDateOnly(dateStr) {
  return dateStr.replace(/-/g, '');
}

function addOneDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildIcs(calendar, events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendar.name)}`,
    `X-WR-TIMEZONE:${icsEscape(calendar.timezone)}`,
  ];
  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${icsUtc(event.updated_at)}`);
    if (event.all_day === 1) {
      const end =
        event.end_at && DATE_RE.test(event.end_at)
          ? event.end_at
          : addOneDay(event.start_at);
      lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(event.start_at)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDateOnly(end)}`);
    } else {
      const startMs = Date.parse(event.start_at);
      const endMs = Date.parse(event.end_at);
      lines.push(`DTSTART:${icsUtc(startMs)}`);
      lines.push(`DTEND:${icsUtc(endMs)}`);
    }
    lines.push(`SUMMARY:${icsEscape(event.title)}`);
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    if (event.rrule) lines.push(`RRULE:${event.rrule}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

function icsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-cache',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

async function handleIcs(request, env, slug) {
  if (!SLUG_RE.test(slug)) return icsResponse('Not found\r\n', 404);
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!token || token.length > 200) {
    return icsResponse('Unauthorized\r\n', 401);
  }

  await ensureSchema(env);
  const hash = await sha256Hex(token);
  const sub = await env.DB.prepare(
    'SELECT * FROM subscriptions WHERE token_hash = ?'
  )
    .bind(hash)
    .first();
  if (!sub || sub.revoked_at) return icsResponse('Unauthorized\r\n', 401);

  const calendar = await getCalendarById(env, sub.calendar_id);
  if (!calendar || calendar.slug !== slug) {
    return icsResponse('Unauthorized\r\n', 401);
  }

  const events = await env.DB.prepare(
    'SELECT * FROM events WHERE calendar_id = ? ORDER BY start_at ASC LIMIT ?'
  )
    .bind(calendar.id, MAX_EVENTS)
    .all();

  await env.DB.prepare('UPDATE subscriptions SET last_access_at = ? WHERE id = ?')
    .bind(Date.now(), sub.id)
    .run();

  return icsResponse(buildIcs(calendar, events.results || []));
}

let manageTemplatePromise = null;
function getManageTemplate(env) {
  if (!manageTemplatePromise) {
    manageTemplatePromise = (async () => {
      const response = await env.ASSETS.fetch(
        new Request(new URL('/manage.html', 'http://assets.local'))
      );
      if (!response.ok) throw new Error('manage template missing');
      return response.text();
    })().catch((error) => {
      manageTemplatePromise = null;
      throw error;
    });
  }
  return manageTemplatePromise;
}

async function handleManagePage(request, env, slug) {
  if (!SLUG_RE.test(slug)) return simplePage(404, 'notFound', request);
  await ensureSchema(env);
  const calendar = await getCalendarBySlug(env, slug);
  if (!calendar) return simplePage(404, 'notFound', request);

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (token) {
    const hash = await sha256Hex(token);
    const row = await env.DB.prepare(
      'SELECT id FROM management_tokens WHERE token_hash = ? AND calendar_id = ? AND revoked_at IS NULL'
    )
      .bind(hash, calendar.id)
      .first();
    if (!row) return simplePage(403, 'invalidLink', request);
    await env.DB.prepare('UPDATE management_tokens SET last_used_at = ? WHERE id = ?')
      .bind(Date.now(), row.id)
      .run();
    const value = await buildSessionValue(calendar.id, hash);
    return new Response('', {
      status: 302,
      headers: {
        location: `/c/${slug}/manage`,
        'set-cookie': sessionCookie(value, request),
        'cache-control': 'no-store',
      },
    });
  }

  const session = await verifySession(request, env);
  if (!session || session.calendarId !== calendar.id) {
    return simplePage(403, 'needManage', request);
  }

  let html;
  try {
    html = await getManageTemplate(env);
  } catch {
    return new Response('manage template missing', { status: 500 });
  }
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

async function handleCreatePage(env, request) {
  const response = await env.ASSETS.fetch(
    new Request(new URL('/index.html', request.url), { method: 'GET' })
  );
  return response;
}

async function routeApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/calendars' && method === 'POST') {
    return handleCreateCalendar(request, env);
  }

  if (pathname === '/api/slug-check' && method === 'GET') {
    return handleSlugCheck(request, env);
  }

  if (pathname.startsWith('/api/calendars/')) {
    const segs = pathname.slice('/api/calendars/'.length).split('/').filter(Boolean);
    if (segs.length === 1 && method === 'GET') {
      return handleGetCalendarBySlug(request, env, segs[0]);
    }
    if (segs.length === 1 && method === 'PATCH') {
      return handlePatchCalendar(request, env, segs[0]);
    }
    if (segs.length === 1 && method === 'DELETE') {
      return handleDeleteCalendar(request, env, segs[0]);
    }
    if (segs.length === 2 && segs[1] === 'events' && method === 'POST') {
      return handleCreateEvent(request, env, segs[0]);
    }
    if (segs.length === 2 && segs[1] === 'subscriptions' && method === 'POST') {
      return handleCreateSubscription(request, env, segs[0]);
    }
    if (
      segs.length === 3 &&
      segs[1] === 'manage-token' &&
      segs[2] === 'regenerate' &&
      method === 'POST'
    ) {
      return handleRegenerateManageToken(request, env, segs[0]);
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }

  if (pathname.startsWith('/api/events/')) {
    const segs = pathname.slice('/api/events/'.length).split('/').filter(Boolean);
    if (segs.length === 1 && method === 'PATCH') {
      return handlePatchEvent(request, env, segs[0]);
    }
    if (segs.length === 1 && method === 'DELETE') {
      return handleDeleteEvent(request, env, segs[0]);
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }

  if (pathname.startsWith('/api/subscriptions/')) {
    const segs = pathname.slice('/api/subscriptions/'.length).split('/').filter(Boolean);
    if (segs.length === 2 && segs[1] === 'regenerate' && method === 'POST') {
      return handleRegenerateSubscription(request, env, segs[0]);
    }
    if (segs.length === 2 && segs[1] === 'revoke' && method === 'POST') {
      return handleRevokeSubscription(request, env, segs[0]);
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }

  return json({ error: 'Not found', code: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith('/api/')) {
      await ensureSchema(env);
      return routeApi(request, env, url);
    }

    const icsMatch = pathname.match(/^\/c\/([^/]+)\.ics$/);
    if (icsMatch) {
      if (request.method !== 'GET') return icsResponse('Method Not Allowed\r\n', 405);
      return handleIcs(request, env, icsMatch[1]);
    }

    const manageMatch = pathname.match(/^\/c\/([^/]+)\/manage$/);
    if (manageMatch && request.method === 'GET') {
      return handleManagePage(request, env, manageMatch[1]);
    }

    const settingsMatch = pathname.match(/^\/c\/([^/]+)\/settings$/);
    if (settingsMatch && request.method === 'GET') {
      return handleManagePage(request, env, settingsMatch[1]);
    }

    const eventMatch = pathname.match(/^\/c\/([^/]+)\/events\/([^/]+)$/);
    if (eventMatch && request.method === 'GET') {
      return handleManagePage(request, env, eventMatch[1]);
    }

    const calendarMatch = pathname.match(/^\/c\/([^/]+)$/);
    if (calendarMatch && request.method === 'GET') {
      if (!SLUG_RE.test(calendarMatch[1])) return simplePage(404, 'notFound', request);
      return new Response('', {
        status: 302,
        headers: { location: `/c/${calendarMatch[1]}/manage` },
      });
    }

    if (pathname === '/create' && request.method === 'GET') {
      return handleCreatePage(env, request);
    }

    return env.ASSETS.fetch(request);
  },
};
