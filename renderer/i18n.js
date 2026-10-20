(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CornerI18n = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function resolveLocale(preferences, supported = ['ko', 'en']) {
    const choices = Array.isArray(preferences) ? preferences : [preferences];
    for (const value of choices) {
      if (typeof value !== 'string' || value.length > 100) continue;
      try {
        const parsed = new Intl.Locale(value.replaceAll('_', '-'));
        const language = supported.includes(parsed.baseName) ? parsed.baseName : parsed.language;
        if (!supported.includes(language)) continue;
        const locale = parsed.baseName === 'ko' ? 'ko-KR' : parsed.baseName === 'en' ? 'en-US' : parsed.baseName;
        return { language, locale };
      } catch { /* Ignore an invalid OS or browser preference. */ }
    }
    return { language: 'en', locale: 'en-US' };
  }

  function createI18n(preferences, messages = {}) {
    const supported = Object.keys(messages).length ? Object.keys(messages) : ['ko', 'en'];
    const resolved = resolveLocale(preferences, supported);
    const t = (key, parameters = {}) => {
      const value = messages[resolved.language]?.[key] ?? messages.en?.[key] ?? key;
      return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name) =>
        Object.hasOwn(parameters, name) ? String(parameters[name]) : token);
    };
    return Object.freeze({ ...resolved, t });
  }

  return Object.freeze({ resolveLocale, createI18n });
});
