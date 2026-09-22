(function () {
  const site = window.ZcalendarSite;
  site.init();
  const t = site.t;

  const parts = location.pathname.split('/').filter(Boolean);
  const slug = parts[1] || '';
  let initialTab = 'events';
  if (parts[2] === 'settings') initialTab = 'settings';

  const els = {
    accessDenied: document.getElementById('accessDenied'),
    manageApp: document.getElementById('manageApp'),
    calName: document.getElementById('calName'),
    calMeta: document.getElementById('calMeta'),
    pageError: document.getElementById('pageError'),
    eventList: document.getElementById('eventList'),
    noEvents: document.getElementById('noEvents'),
    subList: document.getElementById('subList'),
    noSubs: document.getElementById('noSubs'),
    subForm: document.getElementById('subForm'),
    subNameInput: document.getElementById('subNameInput'),
    addEventBtn: document.getElementById('addEventBtn'),
    settingsForm: document.getElementById('settingsForm'),
    settingsName: document.getElementById('settingsName'),
    settingsTz: document.getElementById('settingsTz'),
    resetManageBtn: document.getElementById('resetManageBtn'),
    eventModal: document.getElementById('eventModal'),
    eventModalTitle: document.getElementById('eventModalTitle'),
    eventForm: document.getElementById('eventForm'),
    eventTitle: document.getElementById('eventTitle'),
    eventAllDay: document.getElementById('eventAllDay'),
    eventStart: document.getElementById('eventStart'),
    eventEnd: document.getElementById('eventEnd'),
    endHint: document.getElementById('endHint'),
    eventLocation: document.getElementById('eventLocation'),
    eventDesc: document.getElementById('eventDesc'),
    eventRrule: document.getElementById('eventRrule'),
    rruleEditor: document.getElementById('rruleEditor'),
    rruleFreq: document.getElementById('rruleFreq'),
    rruleIntervalWrap: document.getElementById('rruleIntervalWrap'),
    rruleInterval: document.getElementById('rruleInterval'),
    rruleIntervalUnit: document.getElementById('rruleIntervalUnit'),
    rruleDays: document.getElementById('rruleDays'),
    rruleEnds: document.getElementById('rruleEnds'),
    rruleCount: document.getElementById('rruleCount'),
    rruleUntil: document.getElementById('rruleUntil'),
    rruleRawDetails: document.getElementById('rruleRawDetails'),
    rruleRawError: document.getElementById('rruleRawError'),
    eventError: document.getElementById('eventError'),
    deleteEventBtn: document.getElementById('deleteEventBtn'),
    closeEventModal: document.getElementById('closeEventModal'),
    cancelEventBtn: document.getElementById('cancelEventBtn'),
    saveEventLabel: document.getElementById('saveEventLabel'),
    saveEventBtn: document.getElementById('saveEventBtn'),
    deleteCalendarBtn: document.getElementById('deleteCalendarBtn'),
    deleteCalModal: document.getElementById('deleteCalModal'),
    deleteCalForm: document.getElementById('deleteCalForm'),
    deleteCalConfirm: document.getElementById('deleteCalConfirm'),
    deleteCalError: document.getElementById('deleteCalError'),
    confirmDeleteCalBtn: document.getElementById('confirmDeleteCalBtn'),
    confirmDeleteCalLabel: document.getElementById('confirmDeleteCalLabel'),
    cancelDeleteCalBtn: document.getElementById('cancelDeleteCalBtn'),
    closeDeleteCalModal: document.getElementById('closeDeleteCalModal'),
    secretModal: document.getElementById('secretModal'),
    secretTitle: document.getElementById('secretTitle'),
    secretLabel: document.getElementById('secretLabel'),
    secretWarning: document.getElementById('secretWarning'),
    secretValue: document.getElementById('secretValue'),
    copySecretBtn: document.getElementById('copySecretBtn'),
    copySecretLabel: document.getElementById('copySecretLabel'),
    closeSecretModal: document.getElementById('closeSecretModal'),
    doneSecretBtn: document.getElementById('doneSecretBtn'),
    tabs: Array.from(document.querySelectorAll('[data-tab]')),
    panels: Array.from(document.querySelectorAll('[data-panel]')),
  };

  let nonce = '';
  let calendar = null;
  let events = [];
  let subscriptions = [];
  let editingId = null;
  let currentTab = initialTab;

  function locale() {
    return site.getLang() === 'zh' ? 'zh-CN' : 'en-US';
  }

  function apiError(data, fallback) {
    if (data && data.code && t(`err_${data.code}`) !== `err_${data.code}`) {
      return t(`err_${data.code}`);
    }
    if (data && data.error) return data.error;
    return fallback;
  }

  function showPageError(message) {
    els.pageError.textContent = message;
    els.pageError.hidden = false;
  }

  function hidePageError() {
    els.pageError.hidden = true;
    els.pageError.textContent = '';
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers['x-zc-csrf'] = nonce;
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(apiError(data, t('requestError')));
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function zoneOffsetMs(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const map = {};
    for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
    const hour = map.hour === '24' ? '00' : map.hour;
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(hour),
      Number(map.minute),
      Number(map.second)
    );
    const steady = Math.floor(date.getTime() / 1000) * 1000;
    return asUtc - steady;
  }

  function localToUtcIso(local, timeZone) {
    const base = Date.parse(
      local.length === 16 ? `${local}:00Z` : local.endsWith('Z') ? local : `${local}Z`
    );
    if (Number.isNaN(base)) return null;
    let ms = base - zoneOffsetMs(new Date(base), timeZone);
    ms = base - zoneOffsetMs(new Date(ms), timeZone);
    return new Date(ms).toISOString();
  }

  function utcToZoneInput(iso, timeZone) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const map = {};
    for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
    const hour = map.hour === '24' ? '00' : map.hour;
    return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
  }

  function dayLabel(dateStr) {
    const date = new Date(`${dateStr}T12:00:00Z`);
    return new Intl.DateTimeFormat(locale(), {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  function timeLabel(iso, timeZone) {
    const date = new Date(iso);
    return new Intl.DateTimeFormat(locale(), {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  function formatWhen(ms) {
    if (!ms) return t('never');
    return new Intl.DateTimeFormat(locale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function addOneDay(dateStr) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function iconEdit() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>`;
  }

  function iconTrash() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>`;
  }

  function setTab(tab) {
    currentTab = tab;
    els.tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    els.panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
    const path =
      tab === 'settings' ? `/c/${slug}/settings` : `/c/${slug}/manage`;
    if (location.pathname !== path) history.replaceState(null, '', path);
  }

  function renderMeta() {
    els.calName.textContent = calendar.name;
    document.title = `${calendar.name} · Zcalendar`;
    els.calMeta.textContent = t('calendarMeta', {
      count: events.length,
      tz: calendar.timezone,
    });
    els.settingsName.value = calendar.name;
    if (!els.settingsTz.options.length || els.settingsTz.dataset.filledTz !== calendar.timezone) {
      fillTimezones(els.settingsTz, calendar.timezone);
      els.settingsTz.dataset.filledTz = calendar.timezone;
    } else {
      els.settingsTz.value = calendar.timezone;
    }
  }

  function fillTimezones(select, selected) {
    let zones = [];
    try {
      zones = Intl.supportedValuesOf('timeZone');
    } catch {
      zones = [];
    }
    if (!zones.length) {
      zones = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York'];
    }
    if (selected && !zones.includes(selected)) zones = [selected, ...zones];
    select.innerHTML = '';
    for (const tz of zones) {
      const option = document.createElement('option');
      option.value = tz;
      option.textContent = tz;
      if (tz === selected) option.selected = true;
      select.appendChild(option);
    }
    if (selected) select.value = selected;
  }

  function renderEvents() {
    const tz = calendar.timezone;
    const decorated = events.map((event) => {
      let dayKey;
      let sortTime;
      let timeText;
      if (event.all_day) {
        dayKey = event.start_at.slice(0, 10);
        sortTime = '00:00';
        timeText = t('allDay');
      } else {
        const local = utcToZoneInput(event.start_at, tz);
        dayKey = local.slice(0, 10);
        sortTime = local.slice(11, 16);
        timeText = timeLabel(event.start_at, tz);
      }
      return { event, dayKey, sortTime, timeText };
    });
    decorated.sort((a, b) =>
      a.dayKey === b.dayKey
        ? a.sortTime.localeCompare(b.sortTime)
        : a.dayKey.localeCompare(b.dayKey)
    );

    els.noEvents.hidden = events.length > 0;
    els.eventList.innerHTML = '';

    let currentDay = null;
    let group = null;
    for (const item of decorated) {
      if (item.dayKey !== currentDay) {
        currentDay = item.dayKey;
        group = document.createElement('div');
        group.className = 'day-group';
        const label = document.createElement('div');
        label.className = 'day-label';
        label.textContent = dayLabel(item.dayKey);
        group.appendChild(label);
        els.eventList.appendChild(group);
      }
      const row = document.createElement('div');
      row.className = 'event-row';
      row.innerHTML = `
        <span class="event-time">${escapeHtml(item.timeText)}</span>
        <div class="event-body">
          <div class="event-title">${escapeHtml(item.event.title)}</div>
          ${
            item.event.location || item.event.rrule
              ? `<div class="event-meta">${escapeHtml(
                  [item.event.location, item.event.rrule].filter(Boolean).join(' · ')
                )}</div>`
              : ''
          }
        </div>
        <div class="event-actions">
          <button type="button" class="icon-btn small" data-action="edit" title="${escapeHtml(
            t('editEvent')
          )}">${iconEdit()}</button>
          <button type="button" class="icon-btn small" data-action="delete" title="${escapeHtml(
            t('delete')
          )}">${iconTrash()}</button>
        </div>`;
      row.querySelector('[data-action="edit"]').addEventListener('click', () =>
        openEventModal(item.event)
      );
      row
        .querySelector('[data-action="delete"]')
        .addEventListener('click', () => deleteEvent(item.event));
      group.appendChild(row);
    }
  }

  function renderSubscriptions() {
    els.noSubs.hidden = subscriptions.length > 0;
    els.subList.innerHTML = '';
    for (const sub of subscriptions) {
      const row = document.createElement('div');
      row.className = 'sub-row';
      const active = sub.status === 'active';
      row.innerHTML = `
        <div class="sub-info">
          <div class="sub-name">${escapeHtml(sub.name)}</div>
          <div class="sub-meta muted">
            <span class="status ${active ? 'active' : 'revoked'}">● ${
              active ? escapeHtml(t('active')) : escapeHtml(t('revoked'))
            }</span>
            <span>${escapeHtml(t('createdAt', { when: formatWhen(sub.created_at) }))}</span>
            <span>${escapeHtml(
              t('lastAccess', { when: formatWhen(sub.last_access_at) })
            )}</span>
          </div>
        </div>
        <div class="sub-actions">
          <button type="button" class="btn ghost small" data-action="regenerate">${escapeHtml(
            t('regenerate')
          )}</button>
          ${
            active
              ? `<button type="button" class="btn ghost small" data-action="revoke">${escapeHtml(
                  t('revoke')
                )}</button>`
              : ''
          }
        </div>`;
      const regenBtn = row.querySelector('[data-action="regenerate"]');
      regenBtn.addEventListener('click', () => regenerateSubscription(sub, regenBtn));
      const revokeBtn = row.querySelector('[data-action="revoke"]');
      if (revokeBtn) {
        revokeBtn.addEventListener('click', () => revokeSubscription(sub, revokeBtn));
      }
      els.subList.appendChild(row);
    }
  }

  function renderAll() {
    renderMeta();
    renderEvents();
    renderSubscriptions();
    hidePageError();
  }

  async function load() {
    try {
      const data = await api(`/api/calendars/${encodeURIComponent(slug)}`);
      nonce = data.nonce;
      calendar = data.calendar;
      events = data.events || [];
      subscriptions = data.subscriptions || [];
      els.accessDenied.hidden = true;
      els.manageApp.hidden = false;
      renderAll();
      setTab(currentTab);
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        els.accessDenied.hidden = false;
        els.manageApp.hidden = true;
        return;
      }
      els.manageApp.hidden = false;
      showPageError(error.message || t('requestError'));
    }
  }

  function showSecret({ title, label, value, warning }) {
    els.secretTitle.textContent = title;
    els.secretLabel.textContent = label;
    els.secretValue.value = value;
    els.secretWarning.hidden = !warning;
    els.secretWarning.textContent = warning || '';
    els.copySecretLabel.textContent = t('copyLink');
    els.secretModal.hidden = false;
    els.secretValue.focus();
    els.secretValue.select();
  }

  function hideSecret() {
    els.secretModal.hidden = true;
  }

  async function copySecret() {
    const text = els.secretValue.value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      els.secretValue.select();
      document.execCommand('copy');
    }
    els.copySecretLabel.textContent = t('copied');
    setTimeout(() => {
      els.copySecretLabel.textContent = t('copyLink');
    }, 1600);
  }

  function applyAllDayInputs() {
    const allDay = els.eventAllDay.checked;
    els.eventStart.type = allDay ? 'date' : 'datetime-local';
    els.eventEnd.type = allDay ? 'date' : 'datetime-local';
    els.endHint.hidden = !allDay;
  }

  const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const FREQ_UNITS = {
    DAILY: 'rruleDays',
    WEEKLY: 'rruleWeeks',
    MONTHLY: 'rruleMonths',
    YEARLY: 'rruleYears',
  };
  let selectedDays = new Set();

  function parseRrule(raw) {
    const text = String(raw || '').trim();
    if (!text) {
      return { freq: '', interval: 1, byday: [], endMode: 'never', count: 10, until: '' };
    }
    if (!/^FREQ=/i.test(text)) return null;
    const state = {
      freq: '',
      interval: 1,
      byday: [],
      endMode: 'never',
      count: 10,
      until: '',
    };
    for (const part of text.split(';')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      if (eq < 1) return null;
      const key = part.slice(0, eq).toUpperCase();
      const value = part.slice(eq + 1);
      if (key === 'FREQ') {
        const freq = value.toUpperCase();
        if (!FREQ_UNITS[freq]) return null;
        state.freq = freq;
      } else if (key === 'INTERVAL') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 999) return null;
        state.interval = n;
      } else if (key === 'BYDAY') {
        const days = value.split(',').map((d) => d.trim().toUpperCase());
        for (const day of days) {
          const m = day.match(/^(-?\d{1,2})?([A-Z]{2})$/);
          if (!m || !WEEKDAYS.includes(m[2])) return null;
        }
        state.byday = days.map((d) => d.replace(/^-?\d{1,2}/, '')).filter((d, i, arr) => arr.indexOf(d) === i);
      } else if (key === 'COUNT') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 9999) return null;
        state.endMode = 'count';
        state.count = n;
      } else if (key === 'UNTIL') {
        if (!/^\d{8}$/.test(value)) return null;
        state.endMode = 'until';
        state.until = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
      }
    }
    if (!state.freq) return null;
    return state;
  }

  function buildRrule(state) {
    if (!state.freq) return '';
    const parts = [`FREQ=${state.freq}`];
    if (state.interval > 1) parts.push(`INTERVAL=${state.interval}`);
    if (state.freq === 'WEEKLY' && state.byday.length) {
      const days = WEEKDAYS.filter((d) => state.byday.includes(d));
      if (days.length) parts.push(`BYDAY=${days.join(',')}`);
    }
    if (state.endMode === 'count' && state.count >= 1) {
      parts.push(`COUNT=${state.count}`);
    } else if (state.endMode === 'until' && state.until) {
      parts.push(`UNTIL=${state.until.replace(/-/g, '')}`);
    }
    return parts.join(';');
  }

  function currentRruleState() {
    const freq = els.rruleFreq.value;
    const endMode = (
      els.rruleEnds.querySelector('input[name="rruleEndMode"]:checked') || { value: 'never' }
    ).value;
    const interval = Math.max(1, Math.min(999, Number(els.rruleInterval.value) || 1));
    const count = Math.max(1, Math.min(999, Number(els.rruleCount.value) || 1));
    return {
      freq,
      interval,
      byday: WEEKDAYS.filter((d) => selectedDays.has(d)),
      endMode,
      count,
      until: els.rruleUntil.value || '',
    };
  }

  function setRruleRawFromState() {
    const state = currentRruleState();
    const raw = buildRrule(state);
    els.eventRrule.value = raw;
    els.rruleRawError.hidden = true;
  }

  function syncRruleControls() {
    const freq = els.rruleFreq.value;
    const hasFreq = Boolean(freq);
    els.rruleIntervalWrap.hidden = !hasFreq;
    els.rruleEnds.hidden = !hasFreq;
    els.rruleDays.hidden = freq !== 'WEEKLY';
    const unitKey = FREQ_UNITS[freq] || 'rruleWeeks';
    els.rruleIntervalUnit.setAttribute('data-i18n', unitKey);
    els.rruleIntervalUnit.textContent = t(unitKey);
    site.translate(els.rruleIntervalWrap);
    site.translate(els.rruleDays);

    const endMode = (
      els.rruleEnds.querySelector('input[name="rruleEndMode"]:checked') || { value: 'never' }
    ).value;
    els.rruleCount.disabled = endMode !== 'count';
    els.rruleUntil.disabled = endMode !== 'until';
  }

  function applyRruleToControls(raw) {
    const state = parseRrule(raw);
    if (!state) {
      els.rruleRawError.hidden = false;
      return false;
    }
    els.rruleRawError.hidden = true;
    els.rruleFreq.value = state.freq;
    els.rruleInterval.value = String(state.interval);
    selectedDays = new Set(state.byday);
    els.rruleDays.querySelectorAll('[data-day]').forEach((btn) => {
      btn.classList.toggle('active', selectedDays.has(btn.dataset.day));
    });
    const endRadio = els.rruleEnds.querySelector(
      `input[name="rruleEndMode"][value="${state.endMode}"]`
    );
    if (endRadio) endRadio.checked = true;
    els.rruleCount.value = String(state.count || 10);
    els.rruleUntil.value = state.until || '';
    syncRruleControls();
    return true;
  }

  function resetRruleEditor(raw) {
    selectedDays = new Set();
    els.rruleRawDetails.open = false;
    els.rruleRawError.hidden = true;
    els.eventRrule.value = raw || '';
    if (!applyRruleToControls(raw)) {
      els.rruleFreq.value = '';
      els.rruleInterval.value = '1';
      els.rruleCount.value = '10';
      els.rruleUntil.value = '';
      const never = els.rruleEnds.querySelector('input[value="never"]');
      if (never) never.checked = true;
      syncRruleControls();
      if (raw) els.rruleRawDetails.open = true;
    }
  }

  function collectRruleForSave() {
    if (els.rruleRawDetails.open) {
      const raw = els.eventRrule.value.trim();
      if (raw && !parseRrule(raw)) {
        els.rruleRawError.hidden = false;
        return null;
      }
      return raw;
    }
    const raw = buildRrule(currentRruleState());
    els.eventRrule.value = raw;
    return raw;
  }

  function openEventModal(event) {
    editingId = event ? event.id : null;
    els.eventModalTitle.textContent = event ? t('editEvent') : t('newEvent');
    els.eventError.hidden = true;
    els.eventError.textContent = '';

    if (event) {
      els.eventTitle.value = event.title;
      els.eventAllDay.checked = event.all_day;
      applyAllDayInputs();
      if (event.all_day) {
        els.eventStart.value = event.start_at.slice(0, 10);
        els.eventEnd.value = event.end_at.slice(0, 10);
      } else {
        els.eventStart.value = utcToZoneInput(event.start_at, calendar.timezone);
        els.eventEnd.value = utcToZoneInput(event.end_at, calendar.timezone);
      }
      els.eventLocation.value = event.location || '';
      els.eventDesc.value = event.description || '';
      resetRruleEditor(event.rrule || '');
      els.deleteEventBtn.hidden = false;
    } else {
      els.eventTitle.value = '';
      els.eventAllDay.checked = false;
      applyAllDayInputs();
      const today = utcToZoneInput(new Date().toISOString(), calendar.timezone);
      els.eventStart.value = today.slice(0, 10);
      els.eventEnd.value = addOneDay(today.slice(0, 10));
      els.eventLocation.value = '';
      els.eventDesc.value = '';
      resetRruleEditor('');
      els.deleteEventBtn.hidden = true;
    }
    els.eventModal.hidden = false;
    els.eventTitle.focus();
  }

  function closeEventModal() {
    els.eventModal.hidden = true;
    editingId = null;
  }

  function showEventError(message) {
    els.eventError.textContent = message;
    els.eventError.hidden = false;
  }

  async function saveEvent(event) {
    event.preventDefault();
    els.eventError.hidden = true;

    const title = els.eventTitle.value.trim();
    if (!title) {
      showEventError(t('err_title_invalid'));
      return;
    }

    const allDay = els.eventAllDay.checked;
    let startAt;
    let endAt;
    if (allDay) {
      startAt = els.eventStart.value;
      endAt = els.eventEnd.value;
      if (!startAt || !endAt) {
        showEventError(t('timesInvalid'));
        return;
      }
      if (endAt <= startAt) {
        showEventError(t('timesInvalid'));
        return;
      }
    } else {
      startAt = localToUtcIso(els.eventStart.value, calendar.timezone);
      endAt = localToUtcIso(els.eventEnd.value, calendar.timezone);
      if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) {
        showEventError(t('timesInvalid'));
        return;
      }
    }

    const rrule = collectRruleForSave();
    if (rrule === null) {
      showEventError(t('rruleInvalid'));
      return;
    }

    const payload = {
      title,
      all_day: allDay,
      start_at: startAt,
      end_at: endAt,
      location: els.eventLocation.value.trim(),
      description: els.eventDesc.value.trim(),
      rrule,
    };

    const saveLabel = els.saveEventLabel;
    const originalLabel = saveLabel.textContent;
    saveLabel.textContent = t('saving');
    els.saveEventBtn.disabled = true;
    try {
      if (editingId) {
        await api(`/api/events/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          body: payload,
        });
      } else {
        await api(`/api/calendars/${encodeURIComponent(calendar.id)}/events`, {
          method: 'POST',
          body: payload,
        });
      }
      closeEventModal();
      await load();
    } catch (error) {
      showEventError(error.message || t('requestError'));
    } finally {
      els.saveEventBtn.disabled = false;
      saveLabel.textContent = originalLabel;
    }
  }

  async function deleteEvent(event) {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await api(`/api/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' });
      if (editingId === event.id) closeEventModal();
      await load();
    } catch (error) {
      showPageError(error.message || t('requestError'));
    }
  }

  async function addSubscription(event) {
    event.preventDefault();
    const name = els.subNameInput.value.trim();
    if (!name) return;
    const btn = els.subForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const data = await api(`/api/calendars/${encodeURIComponent(calendar.id)}/subscriptions`, {
        method: 'POST',
        body: { name },
      });
      els.subNameInput.value = '';
      showSecret({
        title: t('subscriptionReady'),
        label: t('subscriptionUrl'),
        value: data.url,
        warning: t('subscriptionHint'),
      });
      await load();
    } catch (error) {
      showPageError(error.message || t('requestError'));
    } finally {
      btn.disabled = false;
    }
  }

  async function regenerateSubscription(sub, button) {
    if (!confirm(`${t('confirmRegenerate')}`)) return;
    button.disabled = true;
    try {
      const data = await api(
        `/api/subscriptions/${encodeURIComponent(sub.id)}/regenerate`,
        { method: 'POST' }
      );
      showSecret({
        title: t('subscriptionReady'),
        label: `${sub.name} · ${t('subscriptionUrl')}`,
        value: data.url,
        warning: t('subscriptionHint'),
      });
      await load();
    } catch (error) {
      showPageError(error.message || t('requestError'));
    } finally {
      button.disabled = false;
    }
  }

  async function revokeSubscription(sub, button) {
    if (!confirm(t('confirmRevoke'))) return;
    button.disabled = true;
    try {
      await api(`/api/subscriptions/${encodeURIComponent(sub.id)}/revoke`, {
        method: 'POST',
      });
      await load();
    } catch (error) {
      showPageError(error.message || t('requestError'));
    } finally {
      button.disabled = false;
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    try {
      await api(`/api/calendars/${encodeURIComponent(calendar.id)}`, {
        method: 'PATCH',
        body: {
          name: els.settingsName.value.trim(),
          timezone: els.settingsTz.value,
        },
      });
      await load();
      showPageError('');
      hidePageError();
      els.pageError.textContent = t('settingsSaved');
      els.pageError.classList.add('success-note');
      els.pageError.hidden = false;
      setTimeout(() => {
        els.pageError.classList.remove('success-note');
        hidePageError();
      }, 2000);
    } catch (error) {
      showPageError(error.message || t('requestError'));
    } finally {
      btn.disabled = false;
    }
  }

  async function resetManageLink() {
    if (!confirm(t('confirmResetManage'))) return;
    els.resetManageBtn.disabled = true;
    try {
      const data = await api(
        `/api/calendars/${encodeURIComponent(calendar.id)}/manage-token/regenerate`,
        { method: 'POST' }
      );
      showSecret({
        title: t('newManageLink'),
        label: t('manageLink'),
        value: data.manageUrl,
        warning: t('manageWarning'),
      });
    } catch (error) {
      showPageError(error.message || t('requestError'));
    } finally {
      els.resetManageBtn.disabled = false;
    }
  }

  function openDeleteCalendarModal() {
    els.deleteCalConfirm.value = '';
    els.deleteCalError.hidden = true;
    els.deleteCalError.textContent = '';
    els.confirmDeleteCalBtn.disabled = true;
    els.deleteCalModal.hidden = false;
    els.deleteCalConfirm.focus();
  }

  function closeDeleteCalendarModal() {
    els.deleteCalModal.hidden = true;
    els.deleteCalConfirm.value = '';
    els.confirmDeleteCalBtn.disabled = true;
  }

  function syncDeleteConfirmState() {
    const ok = calendar && els.deleteCalConfirm.value.trim() === calendar.name;
    els.confirmDeleteCalBtn.disabled = !ok;
  }

  async function deleteCalendar(event) {
    event.preventDefault();
    if (!calendar) return;
    if (els.deleteCalConfirm.value.trim() !== calendar.name) {
      els.deleteCalError.textContent = t('deleteCalendarMismatch');
      els.deleteCalError.hidden = false;
      return;
    }
    const label = els.confirmDeleteCalLabel;
    const original = label.textContent;
    label.textContent = t('deleting');
    els.confirmDeleteCalBtn.disabled = true;
    els.cancelDeleteCalBtn.disabled = true;
    try {
      await api(`/api/calendars/${encodeURIComponent(calendar.id)}`, { method: 'DELETE' });
      window.location.href = '/?deleted=1';
    } catch (error) {
      els.deleteCalError.textContent = error.message || t('requestError');
      els.deleteCalError.hidden = false;
      label.textContent = original;
      els.confirmDeleteCalBtn.disabled = false;
      els.cancelDeleteCalBtn.disabled = false;
    }
  }

  els.tabs.forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });
  els.addEventBtn.addEventListener('click', () => openEventModal(null));
  els.eventForm.addEventListener('submit', saveEvent);
  els.deleteEventBtn.addEventListener('click', async () => {
    if (!editingId) return;
    const event = events.find((item) => item.id === editingId);
    if (event) await deleteEvent(event);
  });
  els.closeEventModal.addEventListener('click', closeEventModal);
  els.cancelEventBtn.addEventListener('click', closeEventModal);
  els.eventAllDay.addEventListener('change', () => {
    const allDay = els.eventAllDay.checked;
    applyAllDayInputs();
    if (allDay && els.eventStart.value && els.eventStart.value.includes('T')) {
      const date = els.eventStart.value.slice(0, 10);
      els.eventStart.value = date;
      els.eventEnd.value = addOneDay(date);
    }
  });
  els.eventModal.addEventListener('click', (event) => {
    if (event.target === els.eventModal) closeEventModal();
  });
  els.subForm.addEventListener('submit', addSubscription);
  els.settingsForm.addEventListener('submit', saveSettings);
  els.resetManageBtn.addEventListener('click', resetManageLink);
  els.deleteCalendarBtn.addEventListener('click', openDeleteCalendarModal);
  els.cancelDeleteCalBtn.addEventListener('click', closeDeleteCalendarModal);
  els.closeDeleteCalModal.addEventListener('click', closeDeleteCalendarModal);
  els.deleteCalForm.addEventListener('submit', deleteCalendar);
  els.deleteCalConfirm.addEventListener('input', syncDeleteConfirmState);
  els.deleteCalModal.addEventListener('click', (event) => {
    if (event.target === els.deleteCalModal) closeDeleteCalendarModal();
  });
  els.rruleFreq.addEventListener('change', () => {
    syncRruleControls();
    setRruleRawFromState();
  });
  els.rruleInterval.addEventListener('input', setRruleRawFromState);
  els.rruleCount.addEventListener('input', setRruleRawFromState);
  els.rruleUntil.addEventListener('input', setRruleRawFromState);
  els.rruleEnds.addEventListener('change', () => {
    syncRruleControls();
    setRruleRawFromState();
  });
  els.rruleDays.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-day]');
    if (!btn) return;
    const day = btn.dataset.day;
    if (selectedDays.has(day)) selectedDays.delete(day);
    else selectedDays.add(day);
    btn.classList.toggle('active', selectedDays.has(day));
    setRruleRawFromState();
  });
  els.eventRrule.addEventListener('input', () => {
    const raw = els.eventRrule.value.trim();
    if (!raw) {
      els.rruleRawError.hidden = true;
      return;
    }
    applyRruleToControls(raw);
  });
  els.copySecretBtn.addEventListener('click', copySecret);
  els.doneSecretBtn.addEventListener('click', hideSecret);
  els.closeSecretModal.addEventListener('click', hideSecret);
  els.secretModal.addEventListener('click', (event) => {
    if (event.target === els.secretModal) hideSecret();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!els.deleteCalModal.hidden) closeDeleteCalendarModal();
    else if (!els.secretModal.hidden) hideSecret();
    else if (!els.eventModal.hidden) closeEventModal();
  });
  document.addEventListener('zcalendar:locale', () => {
    if (calendar) renderAll();
    syncRruleControls();
    site.translate(els.rruleEditor);
  });

  load();
})();
