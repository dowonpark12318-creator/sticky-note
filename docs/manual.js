(() => {
  'use strict';
  const {language, locale} = window.CornerI18n.resolveLocale(navigator.languages || [navigator.language]);
  document.documentElement.lang = locale;
  document.title = language === 'ko' ? '모서리 메모 — 사용 안내' : 'Corner Note — User guide';
  for (const section of document.querySelectorAll('[data-language]')) section.hidden = section.dataset.language !== language;
})();
