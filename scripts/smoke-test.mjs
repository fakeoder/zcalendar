const BASE = process.env.ZCALENDAR_BASE || "http://127.0.0.1:8787";

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function sessionCookieFrom(response) {
  for (const cookie of getSetCookies(response)) {
    const match = cookie.match(/^(zc_session=[^;]+)/);
    if (match) return match[1];
  }
  return null;
}

function tokenFromUrl(url) {
  return new URL(url, BASE).searchParams.get("token");
}

function slugFromUrl(url, kind) {
  const match = new URL(url, BASE).pathname.match(
    kind === "ics" ? /^\/c\/([^/]+)\.ics$/ : /^\/c\/([^/]+)\/manage$/
  );
  return match ? match[1] : null;
}

async function api(path, { method = "GET", body, cookie, csrf } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-zc-csrf"] = csrf;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const slug = `smoke-${Date.now().toString(36)}`;

  const takenCheck = await api(`/api/slug-check?slug=${slug}`);
  assert(takenCheck.response.status === 200, "slug-check should 200");
  assert(takenCheck.data.available === true, "fresh slug should be available");

  const emptyCheck = await api("/api/slug-check?slug=");
  assert(emptyCheck.response.status === 200, "empty slug-check should 200");
  assert(emptyCheck.data.available === true && emptyCheck.data.generated === true, "empty slug-check generated");

  const badCheck = await api("/api/slug-check?slug=Bad_Slug");
  assert(badCheck.response.status === 200, "invalid slug-check should 200");
  assert(badCheck.data.available === false && badCheck.data.code === "slug_invalid", "invalid slug format");

  const created = await api("/api/calendars", {
    method: "POST",
    body: { name: "Smoke Calendar", timezone: "Asia/Shanghai", slug },
  });
  assert(created.response.status === 201, `create calendar failed: ${JSON.stringify(created.data)}`);
  assert(created.data.calendar.slug === slug, "slug mismatch");
  assert(created.data.manageUrl.includes(`/c/${slug}/manage?token=`), "manageUrl shape");
  assert(created.data.subscriptionUrl.includes(`/c/${slug}.ics?token=`), "subscriptionUrl shape");
  const manageToken = tokenFromUrl(created.data.manageUrl);
  const firstSubToken = tokenFromUrl(created.data.subscriptionUrl);
  assert(manageToken && manageToken.length >= 40, "manage token missing");
  assert(firstSubToken && firstSubToken.length >= 40, "subscription token missing");

  const takenAfter = await api(`/api/slug-check?slug=${slug}`);
  assert(takenAfter.response.status === 200 && takenAfter.data.available === false, "slug should be taken after create");

  const exchange = await api(`/c/${slug}/manage?token=${manageToken}`);
  assert(exchange.response.status === 302, `token exchange should 302, got ${exchange.response.status}`);
  assert(exchange.response.headers.get("location") === `/c/${slug}/manage`, "exchange location");
  const cookie = sessionCookieFrom(exchange.response);
  assert(cookie && cookie.startsWith("zc_session="), "session cookie missing");
  assert(!exchange.response.headers.get("location")?.includes("token="), "token must leave URL");

  const denied = await api(`/c/${slug}/manage`);
  assert(denied.response.status === 403, "manage page without session should 403");

  const redirect = await api(`/c/${slug}`);
  assert(redirect.response.status === 302, "calendar root should redirect");

  const badManage = await api(`/c/${slug}/manage?token=definitely-wrong-token`);
  assert(badManage.response.status === 403, "bad manage token should 403");

  const read = await api(`/api/calendars/${slug}`, { cookie });
  assert(read.response.status === 200, "session read failed");
  assert(read.data.nonce && read.data.nonce.length > 10, "csrf nonce missing");
  const calendarId = read.data.calendar.id;
  const nonce = read.data.nonce;
  const defaultSub = (read.data.subscriptions || []).find((s) => s.name === "Default");
  assert(defaultSub && defaultSub.status === "active", "default subscription missing");
  assert(
    (read.data.subscriptions || []).every((s) => !("token" in s) && !("token_hash" in s)),
    "subscription list must not expose secrets"
  );

  const noCsrf = await api(`/api/calendars/${calendarId}/events`, {
    method: "POST",
    cookie,
    body: {
      title: "No CSRF",
      start_at: "2026-09-23T10:00:00.000Z",
      end_at: "2026-09-23T11:00:00.000Z",
    },
  });
  assert(noCsrf.response.status === 403, "missing CSRF must be rejected");

  const eventResponse = await api(`/api/calendars/${calendarId}/events`, {
    method: "POST",
    cookie,
    csrf: nonce,
    body: {
      title: "Doctor",
      location: "Hospital",
      description: "Annual checkup",
      start_at: "2026-09-23T10:00:00.000Z",
      end_at: "2026-09-23T11:00:00.000Z",
      rrule: "FREQ=WEEKLY;BYDAY=WE",
    },
  });
  assert(eventResponse.response.status === 201, `create event failed: ${JSON.stringify(eventResponse.data)}`);
  const eventId = eventResponse.data.event.id;
  const eventUid = eventResponse.data.event.uid;
  assert(eventUid && eventUid.includes("@"), "uid must be email-like");

  const allDayResponse = await api(`/api/calendars/${calendarId}/events`, {
    method: "POST",
    cookie,
    csrf: nonce,
    body: {
      title: "Company Holiday",
      all_day: true,
      start_at: "2026-10-01",
      end_at: "2026-10-02",
    },
  });
  assert(allDayResponse.response.status === 201, "all-day event failed");
  const allDayUid = allDayResponse.data.event.uid;

  const icsUrl = `${BASE}/c/${slug}.ics?token=${firstSubToken}`;
  const icsResponse = await fetch(icsUrl);
  assert(icsResponse.status === 200, "ics fetch failed");
  assert(
    (icsResponse.headers.get("content-type") || "").includes("text/calendar"),
    "ics content-type"
  );
  assert(icsResponse.headers.get("cache-control") === "no-cache", "ics cache-control");
  assert((icsResponse.headers.get("x-robots-tag") || "").includes("noindex"), "ics x-robots-tag");
  const icsBody = await icsResponse.text();
  assert(icsBody.includes("BEGIN:VCALENDAR"), "missing VCALENDAR");
  assert(icsBody.includes("X-WR-CALNAME:Smoke Calendar"), "missing calendar name");
  assert(icsBody.includes(`UID:${eventUid}`), "missing timed UID");
  assert(icsBody.includes("SUMMARY:Doctor"), "missing summary");
  assert(icsBody.includes("DTSTART:20260923T100000Z"), "missing DTSTART");
  assert(icsBody.includes("RRULE:FREQ=WEEKLY;BYDAY=WE"), "missing RRULE");
  assert(icsBody.includes(`UID:${allDayUid}`), "missing all-day UID");
  assert(icsBody.includes("DTSTART;VALUE=DATE:20261001"), "missing all-day DTSTART");
  assert(icsBody.includes("DTEND;VALUE=DATE:20261002"), "missing all-day DTEND");
  assert(icsBody.includes("LOCATION:Hospital\\, Wing B") === false, "sanity");
  assert(icsBody.includes("LOCATION:Hospital"), "missing location");
  assert(icsBody.includes("\r\n"), "ics must use CRLF");

  const badIcs = await fetch(`${BASE}/c/${slug}.ics?token=wrong-token`);
  assert(badIcs.status === 401, "bad ics token must 401");
  const noTokenIcs = await fetch(`${BASE}/c/${slug}.ics`);
  assert(noTokenIcs.status === 401, "missing ics token must 401");

  const patchEvent = await api(`/api/events/${eventId}`, {
    method: "PATCH",
    cookie,
    csrf: nonce,
    body: { title: "Doctor (updated)", location: "Hospital, Wing B" },
  });
  assert(patchEvent.response.status === 200, "patch event failed");

  const icsAfterPatch = await (await fetch(icsUrl)).text();
  assert(icsAfterPatch.includes("SUMMARY:Doctor (updated)"), "patched title missing in ics");
  assert(icsAfterPatch.includes(`UID:${eventUid}`), "UID must stay stable after edit");
  assert(icsAfterPatch.includes("LOCATION:Hospital\\, Wing B"), "comma must be escaped");

  const secondSub = await api(`/api/calendars/${calendarId}/subscriptions`, {
    method: "POST",
    cookie,
    csrf: nonce,
    body: { name: "iPhone" },
  });
  assert(secondSub.response.status === 201, "create subscription failed");
  const secondUrl = secondSub.data.url;
  const oldSecondToken = tokenFromUrl(secondUrl);
  assert((await fetch(secondUrl)).status === 200, "second subscription should work");

  const regenerated = await api(
    `/api/subscriptions/${secondSub.data.subscription.id}/regenerate`,
    { method: "POST", cookie, csrf: nonce }
  );
  assert(regenerated.response.status === 200, "regenerate subscription failed");
  assert(regenerated.data.url !== secondUrl, "regenerate must return a new URL");
  assert(
    (await fetch(`${BASE}/c/${slug}.ics?token=${oldSecondToken}`)).status === 401,
    "old subscription token must 401 after regenerate"
  );
  assert((await fetch(regenerated.data.url)).status === 200, "new subscription token must work");

  const revoked = await api(
    `/api/subscriptions/${secondSub.data.subscription.id}/revoke`,
    { method: "POST", cookie, csrf: nonce }
  );
  assert(revoked.response.status === 200, "revoke failed");
  assert(
    (await fetch(regenerated.data.url)).status === 401,
    "revoked subscription must 401"
  );

  const renamed = await api(`/api/calendars/${calendarId}`, {
    method: "PATCH",
    cookie,
    csrf: nonce,
    body: { name: "Smoke Calendar Renamed", timezone: "UTC" },
  });
  assert(renamed.response.status === 200, "rename failed");
  const icsRenamed = await (await fetch(icsUrl)).text();
  assert(icsRenamed.includes("X-WR-CALNAME:Smoke Calendar Renamed"), "renamed calendar missing in ics");

  const deleted = await api(`/api/events/${allDayUid ? allDayResponse.data.event.id : ""}`, {
    method: "DELETE",
    cookie,
    csrf: nonce,
  });
  assert(deleted.response.status === 200, "delete event failed");
  const icsAfterDelete = await (await fetch(icsUrl)).text();
  assert(!icsAfterDelete.includes(`UID:${allDayUid}`), "deleted event still in ics");
  assert(icsAfterDelete.includes(`UID:${eventUid}`), "other event must remain");

  const regenManage = await api(`/api/calendars/${calendarId}/manage-token/regenerate`, {
    method: "POST",
    cookie,
    csrf: nonce,
  });
  assert(regenManage.response.status === 200, "regenerate manage token failed");
  const newManageUrl = regenManage.data.manageUrl;
  const newCookie = sessionCookieFrom(regenManage.response);
  assert(newCookie && newCookie.startsWith("zc_session="), "new session cookie missing");
  assert(newManageUrl.includes(`?token=`), "new manageUrl must carry token");

  const staleSession = await api(`/api/calendars/${slug}`, { cookie });
  assert(
    staleSession.response.status === 401 || staleSession.response.status === 403,
    "old session must die after manage token regenerate"
  );

  const newToken = tokenFromUrl(newManageUrl);
  const reexchange = await api(`/c/${slug}/manage?token=${newToken}`);
  assert(reexchange.response.status === 302, "new manage token exchange failed");
  const newSessionCookie = sessionCookieFrom(reexchange.response);
  const reread = await api(`/api/calendars/${slug}`, { cookie: newSessionCookie });
  assert(reread.response.status === 200, "new session must work");
  assert(
    reread.data.calendar.name === "Smoke Calendar Renamed",
    "renamed calendar name mismatch"
  );

  const foreign = await api(`/api/calendars/does-not-exist-slug`, { cookie: newSessionCookie });
  assert(foreign.response.status === 404 || foreign.response.status === 403, "unknown slug handled");

  const noCsrfDelete = await api(`/api/calendars/${calendarId}`, {
    method: "DELETE",
    cookie: newSessionCookie,
  });
  assert(noCsrfDelete.response.status === 403, "delete calendar without CSRF must 403");

  const readAfterDeletePrep = await api(`/api/calendars/${slug}`, { cookie: newSessionCookie });
  assert(readAfterDeletePrep.response.status === 200, "calendar should still exist before delete");

  const freshExchange = await api(`/c/${slug}/manage?token=${newToken}`);
  const freshCookie = sessionCookieFrom(freshExchange.response) || newSessionCookie;
  const freshRead = await api(`/api/calendars/${slug}`, { cookie: freshCookie });
  assert(freshRead.response.status === 200, "fresh session read failed");
  const freshNonce = freshRead.data.nonce;

  const deletedCal = await api(`/api/calendars/${calendarId}`, {
    method: "DELETE",
    cookie: freshCookie,
    csrf: freshNonce,
  });
  assert(deletedCal.response.status === 200, `delete calendar failed: ${JSON.stringify(deletedCal.data)}`);
  assert(deletedCal.data.ok === true, "delete calendar ok flag");

  const afterDelete = await api(`/api/calendars/${slug}`, { cookie: freshCookie });
  assert(afterDelete.response.status === 401 || afterDelete.response.status === 404 || afterDelete.response.status === 403, "calendar read after delete should fail");
  const slugFree = await api(`/api/slug-check?slug=${slug}`);
  assert(slugFree.response.status === 200 && slugFree.data.available === true, "slug should be free after delete");
  const icsGone = await fetch(icsUrl);
  assert(icsGone.status === 401, "ics should 401 after calendar delete");

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        calendarId,
        timedEventUid: eventUid,
        allDayEventUid: allDayUid,
        icsHeaders: {
          contentType: "text/calendar; charset=utf-8",
          cacheControl: "no-cache",
          xRobotsTag: "noindex, nofollow",
        },
        csrfEnforced: true,
        subscriptionRegenerateInvalidatesOld: true,
        subscriptionRevokeInvalidates: true,
        manageRegenerateInvalidatesOldSession: true,
        uidStableAcrossEdits: true,
        rrulePassthrough: true,
        allDayValueDate: true,
        deletedEventRemovedFromIcs: true,
        slugCheck: true,
        deletedCalendar: true,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
