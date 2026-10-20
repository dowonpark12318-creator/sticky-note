(() => {
  'use strict';
  const sections = [...document.querySelectorAll('[data-language]')];
  const messages = Object.fromEntries(sections.map(section => [section.dataset.language, {
    title: section.querySelector('h1').textContent, content: section.querySelector('pre').textContent,
  }]));
  const i18n = window.CornerI18n.createI18n(navigator.languages || [navigator.language], messages, 'manual');
  document.documentElement.lang = i18n.locale;
  document.title = i18n.t('title');
  const current = sections.find(section => section.dataset.language === i18n.language) || sections[0];
  for (const section of sections) section.hidden = section !== current;
  current.dataset.language = i18n.language;
  current.querySelector('h1').textContent = i18n.t('title');
  current.querySelector('pre').textContent = i18n.t('content');
})();
