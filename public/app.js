(function () {
  const site = window.ZcalendarSite;
  site.init();

  const form = document.getElementById('calForm');
  const nameInput = document.getElementById('nameInput');
  const slugInput = document.getElementById('slugInput');
  const slugStatus = document.getElementById('slugStatus');
  const tzSelect = document.getElementById('tzSelect');
  const submitBtn = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const formError = document.getElementById('formError');
  const resultPanel = document.getElementById('resultPanel');
  const resultManage = document.getElementById('resultManage');
  const copyManageBtn = document.getElementById('copyManageBtn');
  const openManagerBtn = document.getElementById('openManagerBtn');
  const openManagerTabBtn = document.getElementById('openManagerTabBtn');
  const downloadQrBtn = document.getElementById('downloadQrBtn');

  const SLUG_RE = /^[a-z0-9-]{1,40}$/;
  let slugTimer = null;
  let slugCheckSeq = 0;
  let slugBlocked = false;

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

  function setSlugStatus(state, text) {
    if (!state) {
      slugStatus.hidden = true;
      slugStatus.textContent = '';
      slugStatus.className = 'alias-status';
      return;
    }
    slugStatus.hidden = false;
    slugStatus.className = `alias-status ${state}`;
    slugStatus.textContent = text;
  }

  function clearSlugCheck() {
    slugBlocked = false;
    setSlugStatus(null);
  }

  async function checkSlug(value) {
    const seq = ++slugCheckSeq;
    const slug = value.trim();
    if (!slug) {
      slugBlocked = false;
      setSlugStatus(null);
      return;
    }
    if (!SLUG_RE.test(slug)) {
      slugBlocked = true;
      setSlugStatus('invalid', site.t('slugInvalid'));
      return;
    }
    setSlugStatus('', site.t('slugChecking'));
    try {
      const response = await fetch(`/api/slug-check?slug=${encodeURIComponent(slug)}`);
      const data = await response.json().catch(() => ({}));
      if (seq !== slugCheckSeq) return;
      if (!response.ok) {
        slugBlocked = false;
        setSlugStatus('', site.t('slugCheckFailed'));
        return;
      }
      if (data.available) {
        slugBlocked = false;
        setSlugStatus('ok', site.t('slugAvailable'));
      } else {
        slugBlocked = true;
        setSlugStatus(
          data.code === 'slug_invalid' ? 'invalid' : 'taken',
          data.code === 'slug_invalid' ? site.t('slugInvalid') : site.t('slugTaken')
        );
      }
    } catch {
      if (seq !== slugCheckSeq) return;
      slugBlocked = false;
      setSlugStatus('', site.t('slugCheckFailed'));
    }
  }

  function scheduleSlugCheck() {
    clearTimeout(slugTimer);
    const value = slugInput.value;
    if (!value.trim()) {
      clearSlugCheck();
      return;
    }
    setSlugStatus('', site.t('slugChecking'));
    slugTimer = setTimeout(() => checkSlug(value), 350);
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

  function downloadQr() {
    const url = resultManage.value;
    if (!url || !window.QRCode) return;
    window.QRCode.toString(
      url,
      { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } },
      (error, svg) => {
        if (error || !svg) {
          alert(site.t('qrFailed'));
          return;
        }
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'zcalendar-manage-qr.svg';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      }
    );
  }

  fillTimezones();

  slugInput.addEventListener('input', scheduleSlugCheck);
  slugInput.addEventListener('blur', () => {
    clearTimeout(slugTimer);
    if (slugInput.value.trim()) checkSlug(slugInput.value);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const name = nameInput.value.trim();
    if (!name) {
      showError(site.t('err_name_invalid'));
      nameInput.focus();
      return;
    }

    const slug = slugInput.value.trim();
    if (slug && !SLUG_RE.test(slug)) {
      slugBlocked = true;
      setSlugStatus('invalid', site.t('slugInvalid'));
      showError(site.t('err_slug_invalid'));
      slugInput.focus();
      return;
    }
    if (slug && slugBlocked) {
      showError(site.t('slugTaken'));
      slugInput.focus();
      return;
    }
    if (slug) {
      await checkSlug(slug);
      if (slugBlocked) {
        showError(slugStatus.classList.contains('invalid') ? site.t('err_slug_invalid') : site.t('slugTaken'));
        slugInput.focus();
        return;
      }
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
          slug,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(apiError(data, site.t('createFailed')));
        if (data.code === 'slug_taken') {
          slugBlocked = true;
          setSlugStatus('taken', site.t('slugTaken'));
        }
        return;
      }

      resultManage.value = data.manageUrl;
      resultPanel.hidden = false;
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      form.querySelector('.advanced-options').open = false;
      clearSlugCheck();
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
  openManagerBtn.addEventListener('click', () => {
    if (resultManage.value) window.location.href = resultManage.value;
  });
  openManagerTabBtn.addEventListener('click', () => {
    if (resultManage.value) window.open(resultManage.value, '_blank', 'noopener');
  });
  downloadQrBtn.addEventListener('click', downloadQr);

  document.addEventListener('zcalendar:locale', () => {
    if (slugStatus.hidden) return;
    if (slugStatus.classList.contains('checking') || slugStatus.textContent === site.t('slugChecking')) {
      return;
    }
    if (slugStatus.classList.contains('ok')) setSlugStatus('ok', site.t('slugAvailable'));
    else if (slugStatus.classList.contains('taken')) setSlugStatus('taken', site.t('slugTaken'));
    else if (slugStatus.classList.contains('invalid')) setSlugStatus('invalid', site.t('slugInvalid'));
  });
})();
