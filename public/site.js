(function () {
  const LANG_KEY = 'zcalendar.lang';
  const THEME_KEY = 'zcalendar.theme';
  const LANGS = ['zh', 'en'];

  const DICT = {
    zh: {
      tagline: '跨平台日历订阅',
      toggleTheme: '切换深浅色',
      switchLanguage: '切换语言',
      newCalendar: '新建日历',
      createSubtitle: '创建日历，用订阅链接添加到 Apple、Google、Outlook 或任意日历应用',
      calName: '日历名称',
      namePlaceholder: '例如：家庭日历',
      nameHint: '显示在日历应用中的名称',
      timezone: '时区',
      tzHint: '事件按此时区显示，数据统一存储为 UTC',
      moreOptions: '更多选项',
      moreOptionsMeta: '全部可选 · 自定义链接',
      customSlug: '自定义链接',
      optionalShort: '可选',
      slugPlaceholder: '留空自动生成',
      slugHint: '决定 /c/ 后面的地址，只能包含小写字母、数字和 -',
      slugChecking: '检查中…',
      slugAvailable: '可用',
      slugTaken: '已被占用',
      slugInvalid: '格式无效',
      slugCheckFailed: '检查失败',
      createCalendar: '创建日历',
      creating: '创建中…',
      created: '已创建',
      manageLink: '管理链接',
      manageWarning:
        '请立即保存管理链接。任何拿到它的人都可以管理这个日历；丢失后无法找回。',
      manageWarningStrong:
        '重要：请立即复制并保存管理链接。这是唯一一次显示它的机会；丢失后无法找回，任何拿到它的人都可以管理此日历。',
      manageLinkOnceHint: '管理链接只显示这一次，请先保存再关闭页面。',
      manageIcsLaterHint: '创建完成后，可在管理页的“订阅”标签中生成订阅链接。',
      openManagerTab: '新标签页打开',
      downloadQr: '下载二维码',
      qrFailed: '二维码生成失败',
      subscriptionUrl: '订阅链接',
      subscriptionHint:
        '把这个链接添加到 Apple、Google、Outlook 等日历应用。任何拿到它的人都可以查看此日历。',
      copyLink: '复制链接',
      copied: '已复制',
      openManager: '打开管理页',
      createFailed: '创建失败',
      requestError: '请求失败，请稍后重试',
      events: '日程',
      subscriptions: '订阅',
      settings: '设置',
      addEvent: '添加日程',
      editEvent: '编辑日程',
      newEvent: '新日程',
      eventTitle: '标题',
      titlePlaceholder: '例如：看医生',
      allDay: '全天',
      startsAt: '开始',
      endsAt: '结束',
      endExclusiveHint: '结束日期不含当天',
      location: '地点',
      locationPlaceholder: '例如：医院',
      description: '描述',
      rrule: '重复规则',
      rrulePlaceholder: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      rruleHint: 'RFC 5545 RRULE，直接交给日历客户端展开',
      rruleNever: '不重复',
      rruleDaily: '每天',
      rruleWeekly: '每周',
      rruleMonthly: '每月',
      rruleYearly: '每年',
      rruleEvery: '每',
      rruleDays: '天',
      rruleWeeks: '周',
      rruleMonths: '个月',
      rruleYears: '年',
      rruleEndNever: '永不结束',
      rruleEndAfter: '重复',
      rruleTimes: '次后结束',
      rruleEndOn: '于日期结束',
      rruleAdvanced: '高级：原始 RRULE',
      rruleRawInvalid: 'RRULE 格式无效',
      rruleInvalid: '重复规则无效',
      save: '保存',
      saving: '保存中…',
      cancel: '取消',
      delete: '删除',
      confirmDelete: '确定删除这个日程？',
      noEvents: '还没有日程，点“添加日程”开始。',
      addSubscription: '添加订阅',
      subName: '名称',
      subNamePlaceholder: '例如：iPhone',
      subHint: '每个订阅有独立链接，可单独重置或撤销',
      active: '启用',
      revoked: '已撤销',
      regenerate: '重新生成',
      revoke: '撤销',
      confirmRevoke: '撤销后这个链接将立即失效。',
      confirmRegenerate: '重新生成后旧链接立即失效。',
      subscriptionReady: '订阅链接已生成',
      createdAt: '创建于 {when}',
      lastAccess: '最近访问 {when}',
      never: '从未',
      calNameLabel: '日历名称',
      saveSettings: '保存设置',
      settingsSaved: '已保存',
      manageLinkSection: '管理链接',
      manageLinkHint: '管理链接只在创建和重置时显示一次。',
      resetManageLink: '重置管理链接',
      confirmResetManage: '重置后旧管理链接立即失效，新链接只显示一次。',
      newManageLink: '新的管理链接',
      dangerZone: '危险操作',
      deleteCalendar: '删除日历',
      deleteCalendarHint: '删除后所有日程、订阅与管理链接立即失效，且无法恢复。',
      deleteCalendarWarning:
        '此操作不可撤销：日历、全部日程、订阅链接和管理链接都会被永久删除。',
      deleteCalendarConfirmLabel: '输入日历名称以确认',
      deleteCalendarConfirmPlaceholder: '日历名称',
      deleteCalendarConfirmHint: '必须与当前日历名称完全一致。',
      deleteCalendarMismatch: '名称不匹配，无法删除',
      deleteForever: '永久删除',
      deleting: '删除中…',
      calendarDeleted: '日历已删除',
      close: '关闭',
      needManage: '需要管理链接',
      needManageHint: '请通过创建日历时保存的管理链接打开此页面。',
      backHome: '返回首页',
      calendarMeta: '{count} 个日程 · {tz}',
      copyFailed: '复制失败，请手动复制',
      loginFirst: '请先打开管理链接',
      noSubscriptions: '还没有订阅',
      timesInvalid: '时间无效：结束必须晚于开始',
      err_name_invalid: '名称无效',
      err_slug_invalid: '链接格式无效',
      err_slug_taken: '链接已被占用',
      err_timezone_invalid: '时区无效',
      err_title_invalid: '标题无效',
      err_times_invalid: '时间无效：结束必须晚于开始',
      err_rrule_invalid: '重复规则无效',
      err_unauthorized: '需要管理链接',
      err_forbidden: '没有权限',
      err_not_found: '不存在',
      err_event_limit: '日程数量已达上限',
      err_csrf: '请求校验失败，请刷新页面重试',
    },
    en: {
      tagline: 'Calendar subscriptions for every app',
      toggleTheme: 'Toggle dark mode',
      switchLanguage: 'Switch language',
      newCalendar: 'New calendar',
      createSubtitle:
        'Create a calendar and subscribe from Apple, Google, Outlook, or any calendar app',
      calName: 'Calendar name',
      namePlaceholder: 'e.g. Family',
      nameHint: 'The name shown in your calendar app',
      timezone: 'Timezone',
      tzHint: 'Events display in this timezone; storage is UTC',
      moreOptions: 'More options',
      moreOptionsMeta: 'All optional · custom link',
      customSlug: 'Custom link',
      optionalShort: 'Optional',
      slugPlaceholder: 'Leave empty to auto-generate',
      slugHint: 'Sets the /c/ path; lowercase letters, numbers and - only',
      slugChecking: 'Checking…',
      slugAvailable: 'Available',
      slugTaken: 'Taken',
      slugInvalid: 'Invalid',
      slugCheckFailed: 'Check failed',
      createCalendar: 'Create calendar',
      creating: 'Creating…',
      created: 'Created',
      manageLink: 'Management link',
      manageWarning:
        'Save this management link now. Anyone with it can manage this calendar. If you lose it, it cannot be recovered.',
      manageWarningStrong:
        'Important: copy and save the management link now. This is the only time it will be shown. If you lose it, it cannot be recovered, and anyone with it can manage this calendar.',
      manageLinkOnceHint: 'The management link is shown only once. Save it before closing this page.',
      manageIcsLaterHint:
        'After creating, generate subscription URLs from the Subscriptions tab in the manager.',
      openManagerTab: 'Open in new tab',
      downloadQr: 'Download QR',
      qrFailed: 'Could not generate QR code',
      subscriptionUrl: 'Subscription URL',
      subscriptionHint:
        'Add this URL to Apple, Google, Outlook, or any calendar app. Anyone with it can view this calendar.',
      copyLink: 'Copy link',
      copied: 'Copied',
      openManager: 'Open manager',
      createFailed: 'Failed to create calendar',
      requestError: 'Request failed, please try again',
      events: 'Events',
      subscriptions: 'Subscriptions',
      settings: 'Settings',
      addEvent: 'Add event',
      editEvent: 'Edit event',
      newEvent: 'New event',
      eventTitle: 'Title',
      titlePlaceholder: 'e.g. Doctor',
      allDay: 'All day',
      startsAt: 'Start',
      endsAt: 'End',
      endExclusiveHint: 'End date is exclusive',
      location: 'Location',
      locationPlaceholder: 'e.g. Hospital',
      description: 'Description',
      rrule: 'Recurrence',
      rrulePlaceholder: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      rruleHint: 'RFC 5545 RRULE, expanded by the calendar app',
      rruleNever: 'Does not repeat',
      rruleDaily: 'Daily',
      rruleWeekly: 'Weekly',
      rruleMonthly: 'Monthly',
      rruleYearly: 'Yearly',
      rruleEvery: 'Every',
      rruleDays: 'day(s)',
      rruleWeeks: 'week(s)',
      rruleMonths: 'month(s)',
      rruleYears: 'year(s)',
      rruleEndNever: 'Never ends',
      rruleEndAfter: 'After',
      rruleTimes: 'times',
      rruleEndOn: 'Ends on',
      rruleAdvanced: 'Advanced: raw RRULE',
      rruleRawInvalid: 'Invalid RRULE',
      rruleInvalid: 'Invalid recurrence rule',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      delete: 'Delete',
      confirmDelete: 'Delete this event?',
      noEvents: 'No events yet. Add your first one.',
      addSubscription: 'Add subscription',
      subName: 'Name',
      subNamePlaceholder: 'e.g. iPhone',
      subHint: 'Each subscription has its own URL; reset or revoke it anytime',
      active: 'Active',
      revoked: 'Revoked',
      regenerate: 'Regenerate',
      revoke: 'Revoke',
      confirmRevoke: 'This URL stops working immediately.',
      confirmRegenerate: 'The old URL stops working immediately.',
      subscriptionReady: 'Subscription URL ready',
      createdAt: 'Created {when}',
      lastAccess: 'Last access {when}',
      never: 'Never',
      calNameLabel: 'Calendar name',
      saveSettings: 'Save settings',
      settingsSaved: 'Saved',
      manageLinkSection: 'Management link',
      manageLinkHint: 'The management link is shown only when created or reset.',
      resetManageLink: 'Reset management link',
      confirmResetManage:
        'The old link stops working. The new link is shown once.',
      newManageLink: 'New management link',
      dangerZone: 'Danger zone',
      deleteCalendar: 'Delete calendar',
      deleteCalendarHint:
        'Deleting removes every event, subscription, and management link permanently.',
      deleteCalendarWarning:
        'This cannot be undone. The calendar, all events, subscription URLs, and the management link will be permanently deleted.',
      deleteCalendarConfirmLabel: 'Type the calendar name to confirm',
      deleteCalendarConfirmPlaceholder: 'Calendar name',
      deleteCalendarConfirmHint: 'Must match the current calendar name exactly.',
      deleteCalendarMismatch: 'Name does not match; deletion cancelled',
      deleteForever: 'Delete forever',
      deleting: 'Deleting…',
      calendarDeleted: 'Calendar deleted',
      close: 'Close',
      needManage: 'Management required',
      needManageHint: 'Open this page with the management link you saved.',
      backHome: 'Back to home',
      calendarMeta: '{count} events · {tz}',
      copyFailed: 'Copy failed, select and copy manually',
      loginFirst: 'Open your management link first',
      noSubscriptions: 'No subscriptions yet',
      timesInvalid: 'Invalid times: end must be after start',
      err_name_invalid: 'Name is invalid',
      err_slug_invalid: 'Link format is invalid',
      err_slug_taken: 'Link is already taken',
      err_timezone_invalid: 'Invalid timezone',
      err_title_invalid: 'Title is invalid',
      err_times_invalid: 'Invalid times: end must be after start',
      err_rrule_invalid: 'Invalid recurrence rule',
      err_unauthorized: 'Management link required',
      err_forbidden: 'Forbidden',
      err_not_found: 'Not found',
      err_event_limit: 'Event limit reached',
      err_csrf: 'Request check failed, please refresh and retry',
    },
  };

  let lang = localStorage.getItem(LANG_KEY) || 'en';
  const browserLang = String(navigator.language || '').toLowerCase();
  if (!LANGS.includes(lang)) {
    lang = browserLang.startsWith('zh') ? 'zh' : 'en';
  }

  let theme = localStorage.getItem(THEME_KEY);
  if (theme !== 'light' && theme !== 'dark') {
    theme =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }

  function t(key, vars) {
    let text = DICT[lang][key];
    if (text === undefined) return key;
    if (vars) {
      Object.entries(vars).forEach(([name, value]) => {
        text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
      });
    }
    return text;
  }

  function translate(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (DICT[lang][key] !== undefined) el.textContent = DICT[lang][key];
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (DICT[lang][key] !== undefined) el.placeholder = DICT[lang][key];
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (DICT[lang][key] !== undefined) el.title = DICT[lang][key];
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (DICT[lang][key] !== undefined) el.setAttribute('aria-label', DICT[lang][key]);
    });
  }

  function applyLang() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.lang = lang;
    document.querySelectorAll('[data-set-lang]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-set-lang') === lang);
    });
    translate(document);
    document.dispatchEvent(new CustomEvent('zcalendar:locale', { detail: { lang } }));
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    document
      .querySelectorAll('[data-action="theme"]')
      .forEach((btn) => btn.setAttribute('aria-label', t('toggleTheme')));
  }

  function setLang(next) {
    if (!LANGS.includes(next)) return;
    lang = next;
    localStorage.setItem(LANG_KEY, lang);
    applyLang();
  }

  function setTheme(next) {
    theme = next;
    localStorage.setItem(THEME_KEY, theme);
    applyTheme();
  }

  function init() {
    document
      .querySelectorAll('[data-action="theme"]')
      .forEach((btn) =>
        btn.addEventListener('click', () =>
          setTheme(theme === 'dark' ? 'light' : 'dark')
        )
      );
    document
      .querySelectorAll('[data-action="lang"]')
      .forEach((btn) =>
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-set-lang');
          setLang(target || (lang === 'zh' ? 'en' : 'zh'));
        })
      );
    applyTheme();
    applyLang();
  }

  window.ZcalendarSite = {
    getLang: () => lang,
    setLang,
    getTheme: () => theme,
    setTheme,
    t,
    translate,
    init,
  };
})();
