(function () {
  const site = window.ZcalendarSite;
  site.init();

  const form = document.getElementById('calForm');
  const nameInput = document.getElementById('nameInput');
  const slugInput = document.getElementById('slugInput');
  const tzSelect = document.getElementById('tzSelect');
  const submitBtn = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const formError = document.getElementById('formError');
  const resultPanel = document.getElementById('resultPanel');
  const resultManage = document.getElementById('resultManage');
  const resultIcs = document.getElementById('resultIcs');
  const copyManageBtn = document.getElementById('copyManageBtn');
  const copyIcsBtn = document.getElementById('copyIcsBtn');
  const openManagerBtn = document.getElementById('openManagerBtn');

  function fillTimezones() {
    let zones = [];
    try {
      zones = Intl.supportedValuesOf('timeZone');
    } catch {
      zones = [];
    }
    if (!zones.length) {
      zones = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
    }
    let browserTz = '';
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      browserTz = '';
    }
    const frag = document.createDocumentFragment();
    for (const tz of zones) {
      const option = document.createElement('option');
      option.value = tz;
      option.textContent = tz;
      if (tz === browserTz) option.selected = true;
      frag.appendChild(option);
    }
    tzSelect.appendChild(frag);
    if (browserTz && !zones.includes(browserTz)) {
      const option = document.createElement('option');
      option.value = browserTz;
      option.textContent = browserTz;
      option.selected = true;
      tzSelect.prepend(option);
    }
    if (!tzSelect.value) tzSelect.value = 'UTC';
  }

  function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function hideError() {
    formError.hidden = true;
    formError.textContent = '';
  }

  function apiError(data, fallback) {
    if (data && data.code && site.t(`err_${data.code}`) !== `err_${data.code}`) {
      return site.t(`err_${data.code}`);
    }
    if (data && data.error) return data.error;
    return fallback;
  }

  async function copyText(text, button, originalKey) {
    const label = button.querySelector('span');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand('copy');
      } catch {
        alert(site.t('copyFailed'));
      }
      temp.remove();
    }
    if (label) {
      const original = site.t(originalKey || 'copyLink');
      label.textContent = site.t('copied');
      setTimeout(() => {
        label.textContent = original;
      }, 1600);
    }
  }

  fillTimezones();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const name = nameInput.value.trim();
    if (!name) {
      showError(site.t('err_name_invalid'));
      nameInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = site.t('creating');

    try {
      const response = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          timezone: tzSelect.value || 'UTC',
          slug: slugInput.value.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(apiError(data, site.t('createFailed')));
        return;
      }

      resultManage.value = data.manageUrl;
      resultIcs.value = data.subscriptionUrl;
      resultPanel.hidden = false;
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      form.querySelector('.advanced-options').open = false;
    } catch {
      showError(site.t('requestError'));
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = site.t('createCalendar');
    }
  });

  copyManageBtn.addEventListener('click', () =>
    copyText(resultManage.value, copyManageBtn)
  );
  copyIcsBtn.addEventListener('click', () => copyText(resultIcs.value, copyIcsBtn));
  openManagerBtn.addEventListener('click', () => {
    if (resultManage.value) window.location.href = resultManage.value;
  });

  document.addEventListener('zcalendar:locale', () => {
    if (!formError.hidden && formError.textContent) {
      // keep current error text; codes are re-mapped on next submit
    }
  });
})();
