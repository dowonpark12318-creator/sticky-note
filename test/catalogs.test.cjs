'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const languages = ['ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt', 'it'];
const i18n = require('../renderer/i18n.js');

function browserMessages(filename, exposure) {
  const source = fs.readFileSync(path.join(root, 'renderer', filename), 'utf8');
  const context = {window: {}};
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `${exposure}\n})();`), context, {filename});
  return context.window;
}
const app = browserMessages('app-messages.js', '').CornerAppMessages.en;
const translation = browserMessages('translation.js', 'window.testMessages = MESSAGES;').testMessages.en;
const tutorial = browserMessages('tutorial.js', 'window.testMessages = MESSAGES;').testMessages.en;
const native = require('../electron/native-messages.cjs').en;
const english = {app, translation, tutorial, native};
const tokens = text => [...new Set(text.match(/\{[a-zA-Z0-9_]+\}/g) || [])].sort();

for (const language of languages) {
  test(`${language} has complete app, translation, tutorial and native catalogs with matching interpolation parameters`, () => {
    const catalog = require(`../renderer/locales/${language}.js`);
    for (const [namespace, base] of Object.entries(english)) {
      assert.deepEqual(Object.keys(catalog[namespace]).sort(), Object.keys(base).sort(), `${language}/${namespace} keys`);
      for (const [key, value] of Object.entries(catalog[namespace])) {
        assert.equal(typeof value, 'string', `${language}/${namespace}/${key} is text`);
        assert.ok(value.trim(), `${language}/${namespace}/${key} is non-empty`);
        assert.deepEqual(tokens(value), tokens(base[key]), `${language}/${namespace}/${key} interpolation`);
      }
    }
    assert.deepEqual(Object.keys(catalog.manual).sort(), ['content', 'title']);
    assert.ok(catalog.manual.title.trim() && catalog.manual.content.trim());
    assert.notEqual(catalog.app.deleteQuestion, app.deleteQuestion, 'delete confirmation must not silently fall back to English');
    for (let step = 0; step < 5; step += 1) {
      assert.notEqual(catalog.tutorial[`step.${step}.title`], tutorial[`step.${step}.title`], 'each tutorial step is translated');
    }
  });
}

test('OS language-region and Chinese script variants select their registered display catalogs', () => {
  for (const language of languages) i18n.registerLocale(language, require(`../renderer/locales/${language}.js`));
  const cases = [
    ['ja-JP', 'ja'], ['es-MX', 'es'], ['fr-CA', 'fr'], ['de-DE', 'de'],
    ['pt-BR', 'pt'], ['pt-PT', 'pt'], ['it-IT', 'it'],
    ['zh-CN', 'zh-Hans'], ['zh-SG', 'zh-Hans'], ['zh-Hans', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-Hant-TW', 'zh-Hant'],
  ];
  for (const [locale, language] of cases) {
    assert.deepEqual(i18n.resolveLocale(locale), {language, locale}, locale);
    const localized = i18n.createI18n(locale, {en: app}, 'app');
    assert.equal(localized.language, language);
    assert.equal(localized.t('deleteQuestion'), require(`../renderer/locales/${language}.js`).app.deleteQuestion);
  }
  assert.deepEqual(i18n.resolveLocale(['nl-NL', 'fr-CA', 'en-US']), {language: 'fr', locale: 'fr-CA'});
});

test('registered locale catalogs use the same dictionary in browser scripts and native CommonJS', () => {
  const browser = {CornerI18n: i18n};
  for (const language of languages) {
    let registered;
    browser.CornerI18n = {registerLocale(code, catalog) { registered = {code, catalog}; }};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'renderer', 'locales', `${language}.js`), 'utf8'), browser);
    assert.equal(registered.code, language);
    assert.equal(JSON.stringify(registered.catalog), JSON.stringify(require(`../renderer/locales/${language}.js`)));
  }
});
