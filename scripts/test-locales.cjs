'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

// This fixture only supplies local note state and controlled mock responses.
// No real AI provider, credential, or non-loopback connection is used.
function installLocaleBridge(options) {
  let state = {
    noteId: 'locale-fixture', noteCount: 1, text: '', color: 'butter',
    folded: false, corner: 'top-right', alwaysOnTop: true, savedAt: null,
    systemLanguage: options.systemLanguage,
    ...(options.uiLocale ? {uiLocale: options.uiLocale} : {}),
    bounds: {x: 0, y: 0, width: 392, height: 460},
    settings: {translationLanguages: [], tutorialCompleted: options.completed !== false},
  };
  const listeners = new Set();
  const calls = {translations: [], deletes: 0};
  let pending;
  const copy = value => structuredClone(value);
  const update = value => {
    state = {...state, ...value};
    for (const listener of listeners) listener(copy(state));
    return copy(state);
  };
  window.cornerNote = {
    async getState() { return copy(state); },
    async saveNote(value) { update({...value, savedAt: new Date().toISOString()}); return {savedAt: state.savedAt}; },
    async activateNote() {},
    async updatePreferences(preferences) { return update({settings: {...state.settings, ...preferences}}); },
    async getTranslationSettings() { return {configured: true, canRememberKey: true}; },
    async setAlwaysOnTop(alwaysOnTop) { return update({alwaysOnTop}); },
    async createNote() { throw new Error('Mock: not requested'); },
    async deleteNote() { calls.deletes += 1; return {deleted: true}; },
    translate(request) {
      calls.translations.push(copy(request));
      return new Promise((resolve, reject) => { pending = {resolve, reject}; });
    },
    async cancelTranslation() { pending?.reject(new Error('Translation cancelled.')); pending = null; return true; },
    async copyText() { return true; },
    async hide() {},
    async quit() {},
    onState(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  window.__localeFixture = {
    calls,
    state: () => copy(state),
    resolve(text) { pending.resolve({text, targetLanguage: calls.translations.at(-1).targetLanguage}); pending = null; },
    reject(message) { pending.reject(new Error(message)); pending = null; },
  };
}

async function main() {
  const renderer = path.resolve(__dirname, '..', 'renderer');
  const manuals = path.resolve(__dirname, '..', 'docs');
  const output = path.resolve(__dirname, '..', 'test-results');
  fs.mkdirSync(output, {recursive: true});
  const server = http.createServer((request, response) => {
    let filename;
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/manual/')) {
        const item = pathname.slice('/manual/'.length);
        if (['', 'manual.html', 'manual.js', 'manual.css'].includes(item)) filename = path.join(manuals, item || 'manual.html');
        else if (item === 'i18n.js' || /^locales\/[a-zA-Z-]+\.js$/.test(item)) filename = path.resolve(renderer, item);
      } else filename = path.resolve(renderer, `.${pathname === '/' ? '/index.html' : pathname}`);
    } catch { response.writeHead(400).end(); return; }
    if (!filename || ![renderer, manuals].some(directory => filename.startsWith(`${directory}${path.sep}`)) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      response.writeHead(404).end(); return;
    }
    response.setHeader('Content-Type', {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream');
    fs.createReadStream(filename).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  let browser;
  let passed = 0;
  const pass = label => console.log(`ok ${++passed} - ${label}`);
  const errors = [];
  const externalRequests = [];
  const contexts = [];
  async function open(options = {}) {
    const context = await browser.newContext({locale: options.browserLocale || 'en-US', viewport: options.viewport || {width: 392, height: 460}});
    contexts.push(context);
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      externalRequests.push(route.request().url().split('?')[0]);
      return route.abort();
    });
    if (options.native !== false) await context.addInitScript(installLocaleBridge, {systemLanguage: 'en-US', ...options});
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    return page;
  }
  async function select(page, text, selected = text) {
    await page.getByTestId('note-editor').fill(text);
    await page.getByTestId('note-editor').evaluate((editor, part) => {
      const start = editor.value.indexOf(part);
      if (start < 0) throw new Error('Missing mock selection');
      editor.focus();
      editor.setSelectionRange(start, start + part.length);
      editor.dispatchEvent(new Event('select', {bubbles: true}));
    }, selected);
    await page.waitForFunction(() => !document.querySelector('[data-testid="translate-button"]').disabled);
  }
  function inside(box, viewport, label) {
    assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label} fits the note viewport`);
  }
  try {
    browser = await chromium.launch({headless: true, executablePath});
    const english = await open({browserLocale: 'ko-KR', systemLanguage: 'en-US', completed: false});
    assert.match(await english.locator('html').getAttribute('lang'), /^en(?:-|$)/);
    assert.equal(await english.title(), 'Corner Note');
    const titles = ['Put notes where you need them', 'Drag an edge to resize', 'Fold and unfold diagonally', 'Move a folded note', 'Translate selected text with AI'];
    for (let index = 0; index < titles.length; index += 1) {
      assert.equal(await english.getByTestId('tutorial-step-title').textContent(), titles[index]);
      assert.doesNotMatch(await english.getByTestId('tutorial-dialog').innerText(), /[가-힣]/, 'English tutorial chrome, body, details and illustration text are localized');
      if (index < titles.length - 1) await english.getByTestId('tutorial-next').click();
    }
    await english.getByTestId('tutorial-finish').click();
    await english.getByTestId('tutorial-dialog').waitFor({state: 'hidden'});
    await english.waitForFunction(() => window.__localeFixture.state().settings.tutorialCompleted === true);
    pass('the native computer language overrides a different browser language and localizes all five tutorial steps and artwork');

    await english.getByTestId('help-button').click();
    assert.equal(await english.locator('#help-title').textContent(), 'A little note, right where you need it.');
    assert.doesNotMatch(await english.locator('#help-panel').innerText(), /[가-힣]/);
    assert.equal(await english.getByRole('button', {name: 'Show the feature tour again', exact: true}).count(), 1);
    await english.locator('#close-help').click();
    await english.getByTestId('delete-note-button').click();
    assert.equal(await english.locator('#delete-note-title').textContent(), 'Delete this note?');
    assert.equal(await english.getByTestId('delete-note-cancel').textContent(), 'No');
    assert.equal(await english.getByTestId('delete-note-confirm').textContent(), 'Yes');
    await english.getByTestId('delete-note-cancel').click();
    assert.equal(await english.evaluate(() => window.__localeFixture.calls.deletes), 0);
    pass('help, replay menu and deletion confirmation use English while cancelling deletion leaves the note intact');

    const original = '오늘의 메모 🌿 <script>keep me</script>\n日本語';
    await select(english, original, '오늘의 메모');
    const expectedCount = `${Array.from(original).length.toLocaleString('en-US')} characters`;
    assert.equal(await english.locator('#character-count').textContent(), expectedCount);
    const expectedDate = await english.evaluate(() => new Intl.DateTimeFormat('en-US', {month: 'long', day: 'numeric', weekday: 'long'}).format(new Date()));
    assert.equal(await english.locator('#today').textContent(), expectedDate);
    await english.waitForFunction(() => document.querySelector('#save-label').textContent === 'Saved automatically');
    assert.equal(await english.getByTestId('note-editor').inputValue(), original);
    assert.equal(await english.evaluate(() => window.injected), undefined);
    pass('English date, character count and save status are localized without translating or interpreting memo contents');

    await english.getByTestId('translate-button').click();
    assert.equal(await english.locator('#ct-title').textContent(), 'Translation languages');
    assert.deepEqual(await english.locator('.ct-language-list > button').evaluateAll(items => items.map(item => item.dataset.testid)), ['language-en-US']);
    assert.equal(await english.getByTestId('language-en-US').locator('span').first().textContent(), 'American English');
    await english.getByTestId('add-language-button').click();
    await english.getByTestId('language-search').fill('Japanese');
    assert.equal(await english.getByTestId('language-choice-ja').locator('span').first().textContent(), 'Japanese');
    await english.getByTestId('language-choice-ja').click();
    await english.getByTestId('language-ja').waitFor({state: 'visible'});
    assert.deepEqual(await english.evaluate(() => window.__localeFixture.state().settings.translationLanguages), ['ja']);
    await english.getByRole('button', {name: 'AI translation settings', exact: true}).click();
    assert.equal(await english.locator('#ct-title').textContent(), 'AI translation connection');
    assert.equal(await english.locator('label[for="ct-api-key"]').textContent(), 'OpenAI API key');
    assert.equal(await english.getByTestId('translation-api-key').getAttribute('placeholder'), 'Enter API key');
    assert.doesNotMatch(await english.getByTestId('translation-settings').innerText(), /[가-힣]/);
    await english.getByRole('button', {name: 'Close translation panel', exact: true}).click();
    await english.getByTestId('translate-button').click();
    await english.getByTestId('language-ja').click();
    await english.waitForFunction(() => window.__localeFixture.calls.translations.length === 1);
    assert.equal(await english.locator('.ct-button-label').textContent(), 'Translating…');
    assert.equal(await english.evaluate(() => window.__localeFixture.calls.translations[0].text), '오늘의 메모');
    await english.evaluate(() => window.__localeFixture.resolve('今日のメモ'));
    await english.getByTestId('translation-result').waitFor({state: 'visible'});
    assert.equal(await english.getByTestId('translation-result-text').textContent(), '今日のメモ');
    assert.equal(await english.getByTestId('translation-apply').textContent(), 'Replace selection');
    assert.equal(await english.getByTestId('note-editor').inputValue(), original);
    pass('translation menus, language-name search, settings, loading and result actions are English while the mock request still sends only the original selection');

    const korean = await open({browserLocale: 'en-US', systemLanguage: 'ko-KR'});
    assert.match(await korean.locator('html').getAttribute('lang'), /^ko(?:-|$)/);
    assert.equal(await korean.title(), '모서리 메모');
    await korean.getByTestId('delete-note-button').click();
    assert.equal(await korean.locator('#delete-note-title').textContent(), '정말 메모를 삭제할까요?');
    await korean.getByTestId('delete-note-cancel').click();
    await select(korean, '한국어 표시 테스트');
    await korean.getByTestId('translate-button').click();
    assert.equal(await korean.locator('#ct-title').textContent(), '번역할 언어');
    assert.deepEqual(await korean.locator('.ct-language-list > button').evaluateAll(items => items.map(item => item.dataset.testid)), ['language-ko-KR', 'language-en']);
    assert.equal(await korean.getByTestId('language-en').locator('span').first().textContent(), '영어');
    pass('Korean remains available from the computer setting even when the browser locale is English');

    const unsupported = await open({browserLocale: 'ko-KR', systemLanguage: 'zz-ZZ'});
    assert.match(await unsupported.locator('html').getAttribute('lang'), /^en(?:-|$)/);
    assert.equal(await unsupported.title(), 'Corner Note');
    const override = await open({browserLocale: 'ko-KR', systemLanguage: 'zh-Hant-TW', uiLocale: 'en-US'});
    await select(override, '保持我的文字');
    await override.getByTestId('translate-button').click();
    assert.deepEqual(await override.locator('.ct-language-list > button').evaluateAll(items => items.map(item => item.dataset.testid)), ['language-zh-Hant-TW', 'language-en']);
    assert.match(await override.getByTestId('language-zh-Hant-TW').innerText(), /Chinese/);
    pass('unsupported display languages fall back to English and the original computer locale remains the first translation target');

    const viewport = {width: 300, height: 300};
    const small = await open({systemLanguage: 'en-GB', completed: false, viewport});
    for (let index = 0; index < titles.length; index += 1) {
      inside(await small.getByTestId('tutorial-dialog').boundingBox(), viewport, `English tutorial step ${index + 1}`);
      inside(await small.getByTestId(index === 4 ? 'tutorial-finish' : 'tutorial-next').boundingBox(), viewport, 'English tutorial action');
      if (index < 4) await small.getByTestId('tutorial-next').click();
    }
    await small.getByTestId('tutorial-finish').click();
    await select(small, 'Short note');
    await small.getByTestId('translate-button').click();
    inside(await small.locator('#ct-panel').boundingBox(), viewport, 'English translation panel');
    await small.getByRole('button', {name: 'Close translation panel', exact: true}).click();
    await small.getByTestId('delete-note-button').click();
    inside(await small.getByTestId('delete-note-dialog').boundingBox(), viewport, 'English delete dialog');
    await small.screenshot({path: path.join(output, 'locale-english-small.png')});
    pass('English tutorial, translation and delete controls remain usable at the minimum 300 by 300 note size');

    const majorLocales = [
      ['ja', 'ja-JP'], ['zh-Hans', 'zh-CN'], ['zh-Hant', 'zh-TW'], ['es', 'es-MX'],
      ['fr', 'fr-CA'], ['de', 'de-DE'], ['pt', 'pt-PT'], ['it', 'it-IT'],
    ];
    for (const [language, systemLanguage] of majorLocales) {
      const catalog = require(`../renderer/locales/${language}.js`);
      const localized = await open({browserLocale: 'en-US', systemLanguage, completed: false, viewport});
      assert.equal(await localized.title(), catalog.app.appTitle);
      assert.equal(await localized.locator('html').getAttribute('lang'), systemLanguage);
      assert.equal(await localized.getByTestId('help-button').getAttribute('aria-label'), catalog.app.helpMenu);
      for (let step = 0; step < 5; step += 1) {
        assert.equal(await localized.getByTestId('tutorial-step-title').textContent(), catalog.tutorial[`step.${step}.title`]);
        assert.equal(await localized.locator('#corner-tutorial-body').textContent(), catalog.tutorial[`step.${step}.body`]);
        assert.equal(await localized.locator('#corner-tutorial-detail').textContent(), catalog.tutorial[`step.${step}.detail`]);
        inside(await localized.getByTestId('tutorial-dialog').boundingBox(), viewport, `${systemLanguage} tutorial ${step + 1}`);
        inside(await localized.getByTestId(step === 4 ? 'tutorial-finish' : 'tutorial-next').boundingBox(), viewport, `${systemLanguage} tutorial action`);
        if (step === 4) {
          const art = await localized.locator('.corner-tutorial-illustration text').allTextContents();
          assert.deepEqual(art, ['sample', 'translate', 'language', 'english', 'add'].map(key => catalog.tutorial[key]));
        } else await localized.getByTestId('tutorial-next').click();
      }
      await localized.getByTestId('tutorial-finish').click();
      await localized.getByTestId('tutorial-dialog').waitFor({state: 'hidden'});
      await localized.getByTestId('help-button').click();
      assert.equal(await localized.locator('#help-title').textContent(), catalog.app.helpTitle);
      assert.equal(await localized.getByRole('button', {name: catalog.tutorial.reopen, exact: true}).count(), 1);
      await localized.locator('#close-help').click();
      await localized.getByTestId('delete-note-button').click();
      assert.equal(await localized.locator('#delete-note-title').textContent(), catalog.app.deleteQuestion);
      assert.equal(await localized.getByTestId('delete-note-cancel').textContent(), catalog.app.no);
      assert.equal(await localized.getByTestId('delete-note-confirm').textContent(), catalog.app.yes);
      inside(await localized.getByTestId('delete-note-dialog').boundingBox(), viewport, `${systemLanguage} delete confirmation`);
      await localized.getByTestId('delete-note-cancel').click();
      const written = 'Localized note 🌿';
      await select(localized, written);
      const count = new Intl.NumberFormat(systemLanguage).format(Array.from(written).length);
      assert.equal(await localized.locator('#character-count').textContent(), catalog.app.characterCount.replace('{count}', count));
      const date = await localized.evaluate(locale => new Intl.DateTimeFormat(locale, {month: 'long', day: 'numeric', weekday: 'long'}).format(new Date()), systemLanguage);
      assert.equal(await localized.locator('#today').textContent(), date);
      await localized.getByTestId('translate-button').click();
      assert.equal(await localized.locator('#ct-title').textContent(), catalog.translation['번역할 언어']);
      assert.equal(await localized.getByTestId(`language-${systemLanguage}`).locator('span').first().textContent(), new Intl.DisplayNames([systemLanguage], {type: 'language'}).of(systemLanguage));
      inside(await localized.locator('#ct-panel').boundingBox(), viewport, `${systemLanguage} translation panel`);
      await localized.getByRole('button', {name: catalog.translation['AI 연결 설정'], exact: true}).click();
      assert.equal(await localized.locator('#ct-title').textContent(), catalog.translation['AI 번역 연결']);
      assert.equal(await localized.locator('label[for="ct-api-key"]').textContent(), catalog.translation['OpenAI API 키']);
      await localized.getByRole('button', {name: catalog.translation['번역 창 닫기'], exact: true}).click();
      assert.equal(await localized.getByTestId('note-editor').inputValue(), written);
      await localized.screenshot({path: path.join(output, `locale-${language}-small.png`)});
      pass(`${systemLanguage} uses its complete catalog for help, all five tutorial steps, artwork, deletion and AI settings, with regional formatting and usable minimum-size controls`);
    }

    for (const [browserLocale, expected] of [['en-GB', 'Corner Note'], ['ko-KR', '모서리 메모']]) {
      const fallback = await open({native: false, browserLocale});
      await fallback.getByTestId('tutorial-skip').click();
      assert.equal(await fallback.title(), expected);
    }
    const manualLocales = [['en', 'en-US'], ['ko', 'ko-KR'], ...majorLocales];
    for (const [language, locale] of manualLocales) {
      const context = await browser.newContext({locale, viewport: {width: 700, height: 600}});
      contexts.push(context);
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        externalRequests.push(route.request().url().split('?')[0]);
        return route.abort();
      });
      const manual = await context.newPage();
      manual.on('pageerror', error => errors.push(error.message));
      await manual.goto(`${origin}/manual/`);
      await manual.waitForFunction(expected => document.documentElement.lang === expected, locale);
      const visible = manual.locator('section:not([hidden])');
      assert.equal(await visible.count(), 1, `${locale} shows only one localized manual`);
      if (['en', 'ko'].includes(language)) {
        assert.equal(await manual.title(), language === 'en' ? 'Corner Note · User guide' : '모서리 메모 · 사용 안내');
        assert.match(await visible.locator('pre').textContent(), language === 'en' ? /TRANSLATING SELECTED TEXT/ : /선택한 글 AI 번역/);
      } else {
        const expected = require(`../renderer/locales/${language}.js`).manual;
        assert.equal(await manual.title(), expected.title);
        assert.equal(await visible.locator('h1').textContent(), expected.title);
        assert.equal(await visible.locator('pre').textContent(), expected.content);
      }
    }
    pass('the offline user guide automatically displays its complete localized instructions for all ten supported computer languages');
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    pass('browser-only previews follow navigator language and all locale checks stay offline without uncaught renderer errors');
    console.log(`Locale checks: ${passed} passed (mock provider only)`);
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = String(error?.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Localization checks failed::${message}`);
  }
  console.error(error);
  process.exitCode = 1;
});
