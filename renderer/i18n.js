(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CornerI18n = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const catalogs = Object.create(null);
  const defaultRegions = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', it: 'it-IT' };

  function registerLocale(language, catalog) {
    if (typeof language !== 'string' || !catalog || typeof catalog !== 'object') throw new TypeError('A locale catalog is required.');
    catalogs[language] = catalog;
  }

  function resolveLocale(preferences, supported = ['ko', 'en', ...Object.keys(catalogs)]) {
    const choices = Array.isArray(preferences) ? preferences : [preferences];
    for (const value of choices) {
      if (typeof value !== 'string' || value.length > 100) continue;
      try {
        const parsed = new Intl.Locale(value.replaceAll('_', '-'));
        const script = parsed.language === 'zh' ? `zh-${parsed.maximize().script}` : parsed.language;
        const language = supported.includes(parsed.baseName) ? parsed.baseName : supported.includes(script) ? script : parsed.language;
        if (!supported.includes(language)) continue;
        const locale = parsed.baseName === parsed.language ? defaultRegions[language] || language : parsed.baseName;
        return { language, locale };
      } catch { /* Ignore an invalid OS or browser preference. */ }
    }
    return { language: 'en', locale: 'en-US' };
  }

  function createI18n(preferences, messages = {}, namespace) {
    const supported = [...new Set([
      ...(Object.keys(messages).length ? Object.keys(messages) : ['ko', 'en']),
      ...Object.keys(catalogs).filter(language => namespace && catalogs[language][namespace]),
    ])];
    const resolved = resolveLocale(preferences, supported);
    const t = (key, parameters = {}) => {
      const value = catalogs[resolved.language]?.[namespace]?.[key] ?? messages[resolved.language]?.[key] ?? messages.en?.[key] ?? key;
      return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name) =>
        Object.hasOwn(parameters, name) ? String(parameters[name]) : token);
    };
    return Object.freeze({ ...resolved, t });
  }

  return Object.freeze({ resolveLocale, createI18n, registerLocale });
});
