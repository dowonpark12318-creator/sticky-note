'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

// The bridge below is deliberately a mock provider. These checks never call an
// AI endpoint, consume credits, or require a real credential.
function installMockBridge(options) {
  const storageKey = '__cornerNoteFeatureFixture';
  const statusKey = '__cornerNoteMockConfigured';
  const listeners = new Set();
  const pending = new Map();
  const copy = value => JSON.parse(JSON.stringify(value));
  let stored;
  try { stored = JSON.parse(localStorage.getItem(storageKey) || 'null'); }
  catch { stored = null; }
  let state = stored || {
    text: '', title: '', color: 'butter', folded: false, corner: 'top-right',
    alwaysOnTop: true, bounds: { x: 0, y: 0, width: 392, height: 460 },
    settings: { translationLanguages: [], tutorialCompleted: false },
    systemLanguage: 'ko-KR', uiLocale: 'ko-KR', savedAt: null, ...options.initialState,
  };
  if (sessionStorage.getItem(statusKey) === null) {
    sessionStorage.setItem(statusKey, String(options.configured !== false));
  }
  let configured = sessionStorage.getItem(statusKey) === 'true';
  let interaction;
  let nextInteraction = 0;
  const calls = { translations: [], saves: [], preferences: [], cancellations: [], copies: [], settingsChecks: 0, keySaves: 0, keyClears: 0, lastRemember: null };
  const status = () => ({ configured, canRememberKey: true, provider: 'openai', model: 'gpt-4.1-mini' });
  function persist() { localStorage.setItem(storageKey, JSON.stringify(state)); }
  function emit() { for (const listener of listeners) listener(copy(state)); }
  function update(value) { state = { ...state, ...copy(value) }; persist(); emit(); return copy(state); }
  persist();
  window.cornerNote = {
    async getState() { return copy(state); },
    async renameNote(title) { return update({title}); },
    async saveNote(value) {
      calls.saves.push(copy(value));
      update({ text: value.text, color: value.color, savedAt: new Date().toISOString() });
      return { savedAt: state.savedAt };
    },
    async updatePreferences(value) {
      calls.preferences.push(copy(value));
      return update({ settings: { ...state.settings, ...copy(value) } });
    },
    async getTranslationSettings() { calls.settingsChecks += 1; return status(); },
    async setTranslationKey(value) {
      // Retain status only. Even this intentionally fake key is never persisted,
      // printed, or copied into fixture call history.
      if (typeof value?.apiKey !== 'string' || !value.apiKey.startsWith('sk-')) throw new Error('API 키 형식을 확인해 주세요.');
      calls.keySaves += 1;
      calls.lastRemember = value.remember;
      configured = true;
      sessionStorage.setItem(statusKey, 'true');
      return status();
    },
    async clearTranslationKey() {
      calls.keyClears += 1;
      configured = false;
      sessionStorage.setItem(statusKey, 'false');
      return status();
    },
    translate(value) {
      calls.translations.push(copy(value));
      return new Promise((resolve, reject) => pending.set(value.requestId, { resolve, reject, value: copy(value) }));
    },
    async cancelTranslation(requestId) {
      calls.cancellations.push(requestId);
      const request = pending.get(requestId);
      if (!request) return false;
      pending.delete(requestId);
      request.reject(new Error('번역을 취소했습니다.'));
      return true;
    },
    async copyText(text) { calls.copies.push(text); return true; },
    async setAlwaysOnTop(value) { return update({ alwaysOnTop: value === true }); },
    async fold({ corner }) { return update({ folded: true, corner }); },
    async unfold() { return update({ folded: false }); },
    async beginInteraction(value) {
      interaction = { ...value, id: `fixture-${++nextInteraction}`, bounds: copy(state.bounds) };
      return interaction.id;
    },
    async updateInteraction(value) {
      if (interaction?.id !== value.id) throw new Error('Interaction ended');
      const dx = value.screenX - interaction.screenX;
      const dy = value.screenY - interaction.screenY;
      return update({ bounds: { ...interaction.bounds, x: interaction.bounds.x + dx, y: interaction.bounds.y + dy } }).bounds;
    },
    async endInteraction({ cancel }) {
      if (cancel && interaction) update({ bounds: interaction.bounds });
      interaction = null;
      return copy(state);
    },
    async hide() {},
    async quit() {},
    onState(callback) { listeners.add(callback); return () => listeners.delete(callback); },
  };
  window.__featureFixture = {
    calls,
    state: () => copy(state),
    pending: () => pending.size,
    setConfigured(value) { configured = value; sessionStorage.setItem(statusKey, String(value)); },
    update,
    resolve(text, index = calls.translations.length - 1) {
      const call = calls.translations[index];
      const request = call && pending.get(call.requestId);
      if (!request) throw new Error('No mock provider request is pending');
      pending.delete(call.requestId);
      request.resolve({ text, targetLanguage: call.targetLanguage });
    },
    reject(message = '인터넷 연결을 확인하고 다시 시도해 주세요.', index = calls.translations.length - 1) {
      const call = calls.translations[index];
      const request = call && pending.get(call.requestId);
      if (!request) throw new Error('No mock provider request is pending');
      pending.delete(call.requestId);
      request.reject(new Error(message));
    },
  };
}

async function main() {
  console.log('Feature integration checks use a mock provider; no real AI requests or credentials.');
  const renderer = path.resolve(__dirname, '..', 'renderer');
  const output = path.resolve(__dirname, '..', 'test-results');
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    let filename;
    try { filename = path.resolve(renderer, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`); }
    catch { response.writeHead(400).end(); return; }
    if (!filename.startsWith(`${renderer}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      response.writeHead(404).end(); return;
    }
    response.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[path.extname(filename)] || 'application/octet-stream');
    fs.createReadStream(filename).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  let browser;
  let passed = 0;
  const errors = [];
  const blockedNetwork = [];
  const pass = label => console.log(`ok ${++passed} - ${label}`);
  async function openFixture(options = {}) {
    const context = await browser.newContext({ viewport: { width: 392, height: 460 }, locale: 'ko-KR' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blockedNetwork.push(route.request().url().split('?')[0]);
      return route.abort();
    });
    await context.addInitScript(installMockBridge, options);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    return { context, page };
  }
  async function selectText(page, text, part) {
    const editor = page.getByTestId('note-editor');
    await editor.fill(text);
    await editor.evaluate((element, selected) => {
      const start = element.value.indexOf(selected);
      if (start < 0) throw new Error('Selected text is missing');
      element.focus();
      element.setSelectionRange(start, start + selected.length);
      element.dispatchEvent(new Event('select', { bubbles: true }));
    }, part);
    await page.waitForFunction(() => !document.querySelector('[data-testid="translate-button"]').disabled);
    return editor;
  }
  async function closeTranslation(page) {
    const close = page.getByRole('button', { name: '번역 창 닫기', exact: true });
    if (await close.isVisible()) await close.click();
  }
  async function startTranslation(page, language = 'en') {
    await page.getByTestId('translate-button').click();
    await page.getByTestId(`language-${language}`).click();
  }
  async function waitCalls(page, count) {
    await page.waitForFunction(expected => window.__featureFixture.calls.translations.length === expected, count);
  }
  async function assertTranslationButtonUncovered(page, label) {
    for (const selector of ['[data-testid="translate-button"]', '[data-testid="translate-button"] .ct-button-label', '[data-testid="translate-button"] .ct-spinner']) {
      const observation = await page.locator(selector).evaluate(element => {
        const box = element.getBoundingClientRect();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const top = document.elementFromPoint(x, y);
        const button = element.closest('[data-testid="translate-button"]');
        return {
          visible: box.width > 0 && box.height > 0 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
          uncovered: Boolean(top && button && (top === button || button.contains(top))),
          coveringElement: top ? `${top.tagName.toLowerCase()}.${top.className}` : null,
        };
      });
      assert.equal(observation.visible, true, `${label}: ${selector} is inside the viewport`);
      assert.equal(observation.uncovered, true, `${label}: ${selector} is covered by ${observation.coveringElement}`);
    }
  }

  try {
    browser = await chromium.launch({ headless: true, executablePath });
    const first = await openFixture();
    const page = first.page;
    const byId = id => page.getByTestId(id);
    const titles = ['메모를 원하는 곳으로', '변을 당겨 크기 조절', '대각선으로 접고 펴기', '접힌 메모도 옮겨요', '선택한 글을 AI로 번역'];
    await byId('tutorial-dialog').waitFor({ state: 'visible' });
    assert.equal(await byId('tutorial-step-title').textContent(), titles[0]);
    assert.equal(await byId('tutorial-back').isDisabled(), true);
    assert.equal(await byId('note-editor').evaluate(element => element.closest('[inert]') !== null), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await byId('tutorial-next').evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await byId('tutorial-skip').evaluate(element => element === document.activeElement), true);
    await page.screenshot({ path: path.join(output, 'tutorial-first-run.png') });
    await byId('tutorial-next').click();
    assert.equal(await byId('tutorial-step-title').textContent(), titles[1]);
    await byId('tutorial-back').click();
    assert.equal(await byId('tutorial-step-title').textContent(), titles[0]);
    await byId('tutorial-skip').click();
    await byId('tutorial-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.__featureFixture.state().settings.tutorialCompleted === true);
    assert.equal(await byId('note-editor').evaluate(element => element.closest('[inert]') !== null), false);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    assert.equal(await byId('tutorial-dialog').isVisible(), false);
    pass('first-run tutorial traps focus, supports Back/Next/Skip and remembers completion after reload');

    await byId('help-button').click();
    await byId('tutorial-reopen').click();
    for (let index = 0; index < titles.length; index += 1) {
      assert.equal(await byId('tutorial-step-title').textContent(), titles[index]);
      if (index < titles.length - 1) await byId('tutorial-next').click();
    }
    assert.equal(await byId('tutorial-next').isVisible(), false);
    await page.screenshot({ path: path.join(output, 'tutorial-translation.png') });
    await byId('tutorial-finish').click();
    await byId('tutorial-dialog').waitFor({ state: 'hidden' });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    assert.equal(await byId('tutorial-dialog').isVisible(), false);
    pass('help menu reopens all five tutorial topics and Finish persists completion');

    const siblingText = '두 번째 메모의 내용은 안내와 관계없이 유지돼요. 📝';
    const siblingTour = await openFixture({ initialState: { text: siblingText, offerTutorial: false } });
    const siblingPage = siblingTour.page;
    const siblingId = id => siblingPage.getByTestId(id);
    await siblingId('tutorial-dialog').waitFor({ state: 'hidden' });
    assert.equal(await siblingId('note-editor').inputValue(), siblingText);
    assert.equal(await siblingId('note-editor').evaluate(element => element.closest('[inert]') !== null), false);
    await siblingPage.evaluate(() => window.__featureFixture.update({
      settings: { translationLanguages: ['ja'], tutorialCompleted: false },
    }));
    assert.equal(await siblingId('tutorial-dialog').isVisible(), false, 'shared preferences do not start a second automatic tour');
    await siblingId('help-button').click();
    await siblingId('tutorial-reopen').click();
    await siblingId('tutorial-dialog').waitFor({ state: 'visible' });
    await siblingId('tutorial-next').click();
    await siblingPage.evaluate(() => window.__featureFixture.update({
      settings: { translationLanguages: ['ja'], tutorialCompleted: true },
    }));
    assert.equal(await siblingId('tutorial-dialog').isVisible(), true, 'another note completing the first-run tour does not close an explicit replay');
    assert.equal(await siblingId('tutorial-step-title').textContent(), titles[1]);
    assert.equal(await siblingId('note-editor').inputValue(), siblingText);
    assert.equal(await siblingId('note-editor').evaluate(element => element.closest('[inert]') !== null), true);
    assert.deepEqual(await siblingPage.evaluate(() => window.__featureFixture.calls.saves), []);
    await siblingId('tutorial-skip').click();
    await siblingId('tutorial-dialog').waitFor({ state: 'hidden' });
    await siblingTour.context.close();
    pass('a sibling note does not open another first-run tour but can replay it explicitly without another note closing it or changing its text');

    const automaticText = '안내를 다른 메모에서 마쳐도 이 메모의 글은 그대로예요.';
    const automaticTour = await openFixture({ initialState: { text: automaticText, offerTutorial: true } });
    const automaticPage = automaticTour.page;
    const automaticId = id => automaticPage.getByTestId(id);
    await automaticId('tutorial-dialog').waitFor({ state: 'visible' });
    assert.equal(await automaticId('note-editor').evaluate(element => element.closest('[inert]') !== null), true);
    await automaticPage.evaluate(() => window.__featureFixture.update({
      settings: { translationLanguages: [], tutorialCompleted: true },
    }));
    await automaticId('tutorial-dialog').waitFor({ state: 'hidden' });
    assert.equal(await automaticId('note-editor').evaluate(element => element.closest('[inert]') !== null), false);
    assert.equal(await automaticId('note-editor').inputValue(), automaticText);
    assert.deepEqual(await automaticPage.evaluate(() => window.__featureFixture.calls.saves), []);
    assert.deepEqual(await automaticPage.evaluate(() => window.__featureFixture.calls.preferences), [], 'an external completion does not submit another preference write');
    await automaticTour.context.close();
    pass('shared completion closes an automatic first-run tour, restores editor access and preserves the note without a duplicate save');

    assert.equal(await byId('translate-button').isVisible(), false);
    const source = '앞부분은 보존해요. Hello, friend! 끝부분도 그대로 둬요.';
    const selected = 'Hello, friend!';
    const editor = await selectText(page, source, selected);
    await byId('translate-button').focus();
    await byId('translate-button').click();
    await byId('translation-language-menu').waitFor({ state: 'visible' });
    assert.deepEqual(await page.locator('.ct-language-list > button').evaluateAll(elements => elements.map(element => element.dataset.testid)), ['language-ko-KR', 'language-en']);
    assert.equal(await byId('add-language-button').textContent().then(value => value.trim()), '＋ 추가');
    const lastLanguage = await byId('language-en').boundingBox();
    const addButton = await byId('add-language-button').boundingBox();
    assert.ok(addButton.y >= lastLanguage.y + lastLanguage.height, 'Add follows the default language list');
    await byId('add-language-button').click();
    await byId('language-search').fill('일본어');
    await byId('language-choice-ja').click();
    await byId('language-ja').waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.__featureFixture.state().settings.translationLanguages), ['ja']);
    await closeTranslation(page);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    await selectText(page, source, selected);
    await byId('translate-button').click();
    await byId('language-ja').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'translation-languages.png') });
    pass('translation appears for text, preserves selection through button focus, defaults to system language/English and persists added languages');

    await byId('language-en').click();
    await waitCalls(page, 1);
    const firstCall = await page.evaluate(() => window.__featureFixture.calls.translations[0]);
    assert.equal(firstCall.text, selected);
    assert.equal(firstCall.targetLanguage, 'en');
    assert.match(firstCall.requestId, /^[a-z0-9_-]+$/i);
    assert.equal(await byId('translate-button').getAttribute('aria-busy'), 'true');
    assert.equal(await byId('translate-button').isDisabled(), true);
    assert.match(await byId('translate-button').textContent(), /번역 중/);
    assert.equal(await byId('translate-button').locator('.ct-spinner').isVisible(), true);
    const spinnerAnimation = await byId('translate-button').locator('.ct-spinner').evaluate(element => getComputedStyle(element).animationName);
    assert.notEqual(spinnerAnimation, 'none');
    await assertTranslationButtonUncovered(page, 'pending translation at the normal note size');
    await byId('translate-button').evaluate(element => { element.click(); element.click(); });
    assert.equal(await page.evaluate(() => window.__featureFixture.calls.translations.length), 1);
    await page.screenshot({ path: path.join(output, 'translation-busy.png') });
    await page.evaluate(() => window.__featureFixture.resolve('안녕, 친구!'));
    await byId('translation-result').waitFor({ state: 'visible' });
    assert.equal(await byId('translation-result-text').textContent(), '안녕, 친구!');
    assert.equal(await editor.inputValue(), source);
    assert.equal(await byId('translate-button').getAttribute('aria-busy'), 'false');
    await byId('translation-copy').click();
    assert.deepEqual(await page.evaluate(() => window.__featureFixture.calls.copies), ['안녕, 친구!']);
    assert.equal(await editor.inputValue(), source);
    await page.screenshot({ path: path.join(output, 'translation-result.png') });
    await byId('translation-apply').click();
    const applied = source.replace(selected, '안녕, 친구!');
    assert.equal(await editor.inputValue(), applied);
    await page.waitForFunction(expected => window.__featureFixture.state().text === expected, applied);
    assert.equal(await page.evaluate(() => window.__featureFixture.calls.saves.at(-1).text), applied);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    assert.equal(await editor.inputValue(), applied);
    pass('mock provider receives only selected text, shows animated busy state once, previews and copies without editing, then explicitly replaces and saves only the selected range');

    await selectText(page, source, selected);
    await startTranslation(page);
    await waitCalls(page, 1);
    const editedWhilePending = `${source}\n추가한 내용을 보호해야 해요.`;
    await editor.fill(editedWhilePending);
    await page.evaluate(() => window.__featureFixture.resolve('변경 전 번역'));
    await byId('translation-result').waitFor({ state: 'visible' });
    assert.equal(await byId('translation-apply').isDisabled(), true);
    await byId('translation-apply').evaluate(element => element.click());
    assert.equal(await editor.inputValue(), editedWhilePending);
    assert.equal(await page.locator('.ct-stale-hint').isVisible(), true);
    await closeTranslation(page);
    pass('editing the note during a translation disables replacement and protects newer content');

    await selectText(page, source, selected);
    await startTranslation(page);
    await waitCalls(page, 2);
    await page.evaluate(() => window.__featureFixture.reject('인터넷 연결을 확인하고 다시 시도해 주세요.'));
    await byId('translation-error').waitFor({ state: 'visible' });
    assert.match(await byId('translation-error').textContent(), /인터넷 연결/);
    assert.equal(await byId('translate-button').getAttribute('aria-busy'), 'false');
    assert.equal(await byId('translate-button').locator('.ct-spinner').isVisible(), false);
    assert.equal(await byId('translate-button').isDisabled(), false);
    await byId('language-en').click();
    await waitCalls(page, 3);
    const literalResult = '재시도 성공 <script>window.translationInjected = true</script>';
    await page.evaluate(text => window.__featureFixture.resolve(text), literalResult);
    await byId('translation-result').waitFor({ state: 'visible' });
    assert.equal(await byId('translation-result-text').textContent(), literalResult);
    assert.equal(await byId('translation-result-text').locator('script').count(), 0);
    assert.equal(await page.evaluate(() => window.translationInjected), undefined);
    await closeTranslation(page);
    pass('mock provider errors reset loading state, explain the failure and allow a retry that renders returned markup as literal text');

    await selectText(page, source, selected);
    await startTranslation(page);
    await waitCalls(page, 4);
    await byId('translation-cancel').click();
    await page.waitForFunction(() => window.__featureFixture.calls.cancellations.length === 1 && window.__featureFixture.pending() === 0);
    assert.equal(await byId('translate-button').getAttribute('aria-busy'), 'false');
    assert.equal(await byId('translation-result').isVisible(), false);
    await closeTranslation(page);
    pass('cancelling tells the mock provider to stop and restores the language picker without a stale result');

    await page.evaluate(() => window.__featureFixture.setConfigured(false));
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    await selectText(page, source, selected);
    await startTranslation(page);
    await byId('translation-settings').waitFor({ state: 'visible' });
    assert.equal(await byId('translation-api-key').getAttribute('type'), 'password');
    assert.equal(await page.evaluate(() => window.__featureFixture.calls.translations.length), 0);
    const fakeKey = 'sk-feature-fixture-fake-key-never-use';
    await byId('translation-api-key').fill(fakeKey);
    await byId('translation-remember-key').check();
    await byId('translation-save-key').click();
    await waitCalls(page, 1);
    assert.equal(await byId('translation-api-key').inputValue(), '');
    assert.deepEqual(await page.evaluate(() => ({ saves: window.__featureFixture.calls.keySaves, remember: window.__featureFixture.calls.lastRemember })), { saves: 1, remember: true });
    assert.equal(await page.evaluate(() => window.__featureFixture.calls.translations[0].text), selected);
    const rendererStorage = await page.evaluate(() => ({ local: Object.values(localStorage), session: Object.values(sessionStorage) }));
    assert.equal(JSON.stringify(rendererStorage).includes(fakeKey), false, 'renderer storage contains no key');
    await page.evaluate(() => window.__featureFixture.resolve('연결 후 번역'));
    await byId('translation-result').waitFor({ state: 'visible' });
    await closeTranslation(page);
    await selectText(page, source, selected);
    await byId('translate-button').click();
    await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
    await byId('translation-clear-key').waitFor({ state: 'visible' });
    await byId('translation-clear-key').click();
    await page.waitForFunction(() => window.__featureFixture.calls.keyClears === 1);
    assert.equal(await byId('translation-clear-key').isVisible(), false);
    assert.match(await page.locator('.ct-connection-status').textContent(), /연결된 API 키가 없/);
    assert.equal(await byId('translation-api-key').inputValue(), '');
    await closeTranslation(page);
    pass('missing key opens password settings, clears the submitted input, resumes the selected-range request and supports disconnect without renderer key storage');

    await page.setViewportSize({ width: 300, height: 300 });
    await byId('help-button').click();
    await byId('tutorial-reopen').click();
    const smallTutorial = await byId('tutorial-dialog').boundingBox();
    const smallNext = await byId('tutorial-next').boundingBox();
    assert.ok(smallTutorial.x >= 0 && smallTutorial.x + smallTutorial.width <= 300, 'tutorial fits the minimum note width');
    assert.ok(smallNext.y >= 0 && smallNext.y + smallNext.height <= 300, 'tutorial navigation remains inside the minimum note height');
    await page.screenshot({ path: path.join(output, 'tutorial-small-note.png') });
    await byId('tutorial-skip').click();
    await selectText(page, source, selected);
    await byId('translate-button').click();
    const smallLanguages = await byId('translation-language-menu').boundingBox();
    assert.ok(smallLanguages.x >= 0 && smallLanguages.x + smallLanguages.width <= 300, 'translation menu fits the minimum note width');
    await page.screenshot({ path: path.join(output, 'translation-small-note.png') });
    await closeTranslation(page);
    await page.evaluate(() => window.__featureFixture.setConfigured(true));
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    await selectText(page, source, selected);
    await startTranslation(page);
    await waitCalls(page, 1);
    await assertTranslationButtonUncovered(page, 'pending translation at the minimum note size');
    await page.screenshot({ path: path.join(output, 'translation-busy-small-note.png') });
    await byId('translation-cancel').click();
    await closeTranslation(page);
    pass('tutorial navigation, language menu and uncovered animated translation button remain usable at the minimum 300 by 300 note size');

    const folded = await openFixture({ initialState: { folded: true } });
    await folded.page.getByTestId('folded-note').waitFor({ state: 'visible' });
    assert.equal(await folded.page.getByTestId('tutorial-dialog').isVisible(), false);
    await folded.page.getByTestId('folded-note').focus();
    await folded.page.keyboard.press('Enter');
    await folded.page.getByTestId('tutorial-dialog').waitFor({ state: 'visible' });
    assert.equal(await folded.page.getByTestId('tutorial-step-title').textContent(), titles[0]);
    await folded.page.keyboard.press('Escape');
    await folded.page.getByTestId('tutorial-dialog').waitFor({ state: 'hidden' });
    await folded.page.waitForFunction(() => window.__featureFixture.state().settings.tutorialCompleted === true);
    pass('a first run that starts folded defers the tutorial until unfolding and supports Escape to finish');

    for (const [systemLanguage, expected] of [['zh-Hant-TW', ['language-zh-Hant-TW', 'language-en']], ['en-US', ['language-en-US']]]) {
      const localized = await openFixture({ initialState: { systemLanguage, settings: { translationLanguages: [], tutorialCompleted: true } } });
      await selectText(localized.page, source, selected);
      await localized.page.getByTestId('translate-button').click();
      assert.deepEqual(await localized.page.locator('.ct-language-list > button').evaluateAll(elements => elements.map(element => element.dataset.testid)), expected);
      await localized.context.close();
    }
    pass('default targets preserve the computer language locale and script while avoiding a duplicate English target');

    const sharedKey = await openFixture({ configured: false, initialState: { settings: { translationLanguages: [], tutorialCompleted: true } } });
    const sharedPage = sharedKey.page;
    const sharedId = id => sharedPage.getByTestId(id);
    await selectText(sharedPage, source, selected);
    await sharedId('translate-button').click();
    await sharedPage.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
    await sharedPage.waitForFunction(() => document.querySelector('.ct-connection-status').textContent.includes('연결된 API 키가 없'));
    await closeTranslation(sharedPage);

    // Simulate a different note changing the main process's shared key status.
    // This existing renderer stays open; no reload or key re-entry can refresh it.
    await sharedPage.evaluate(() => window.__featureFixture.setConfigured(true));
    await selectText(sharedPage, source, selected);
    await startTranslation(sharedPage);
    await waitCalls(sharedPage, 1);
    assert.equal(await sharedId('translation-settings').isVisible(), false);
    assert.deepEqual(await sharedPage.evaluate(() => ({ keySaves: window.__featureFixture.calls.keySaves, text: window.__featureFixture.calls.translations[0].text })), { keySaves: 0, text: selected });
    await sharedPage.evaluate(() => window.__featureFixture.resolve('다른 메모에서 등록한 키로 번역'));
    await sharedId('translation-result').waitFor({ state: 'visible' });
    await closeTranslation(sharedPage);

    await sharedPage.evaluate(() => window.__featureFixture.setConfigured(false));
    await selectText(sharedPage, source, selected);
    await startTranslation(sharedPage);
    await sharedId('translation-settings').waitFor({ state: 'visible' });
    await sharedPage.waitForFunction(() => document.querySelector('.ct-connection-status').textContent.includes('연결된 API 키가 없'));
    assert.equal(await sharedPage.evaluate(() => window.__featureFixture.calls.translations.length), 1, 'clearing the shared key in another note prevents another outbound translation');
    assert.equal(await sharedId('translation-clear-key').isVisible(), false);
    await closeTranslation(sharedPage);

    for (const configured of [true, false]) {
      await sharedPage.evaluate(value => window.__featureFixture.setConfigured(value), configured);
      await selectText(sharedPage, source, selected);
      await sharedId('translate-button').click();
      await sharedPage.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
      await sharedPage.waitForFunction(expected => {
        const text = document.querySelector('.ct-connection-status').textContent;
        return expected ? text.includes('API 키 등록됨') : text.includes('연결된 API 키가 없');
      }, configured);
      assert.equal(await sharedId('translation-clear-key').isVisible(), configured);
      assert.equal(await sharedId('translation-api-key').inputValue(), '');
      assert.equal(await sharedPage.evaluate(() => window.__featureFixture.calls.translations.length), 1, 'opening settings only reads the shared status');
      await closeTranslation(sharedPage);
    }
    assert.equal(await sharedPage.evaluate(() => window.__featureFixture.calls.keySaves), 0, 'observing another note never asks this renderer to resubmit a key');
    pass('an already-open note observes another note registering or clearing the shared API key in settings and before translation without key re-entry or an unauthorized request');

    await sharedPage.evaluate(() => {
      window.__featureFixture.setConfigured(true);
      const readStatus = window.cornerNote.getTranslationSettings;
      window.__deferredSettingsReads = [];
      window.cornerNote.getTranslationSettings = () => new Promise(resolve => {
        window.__deferredSettingsReads.push(async () => resolve(await readStatus()));
      });
    });
    await selectText(sharedPage, source, selected);
    await sharedId('translate-button').click();
    await sharedId('language-en').evaluate(button => { button.click(); button.click(); });
    await sharedPage.waitForFunction(() => window.__deferredSettingsReads.length === 2);
    assert.equal(await sharedPage.evaluate(() => window.__featureFixture.calls.translations.length), 1);
    await sharedPage.evaluate(async () => { await Promise.all(window.__deferredSettingsReads.splice(0).map(release => release())); });
    await waitCalls(sharedPage, 2);
    assert.equal(await sharedPage.evaluate(() => window.__featureFixture.pending()), 1, 'two selections awaiting fresh key status start only one translation');
    await sharedPage.evaluate(() => window.__featureFixture.resolve('한 번만 번역'));
    await sharedId('translation-result').waitFor({ state: 'visible' });
    await closeTranslation(sharedPage);

    await selectText(sharedPage, source, selected);
    await startTranslation(sharedPage);
    await sharedPage.waitForFunction(() => window.__deferredSettingsReads.length === 1);
    await closeTranslation(sharedPage);
    await sharedPage.evaluate(async () => {
      await Promise.all(window.__deferredSettingsReads.splice(0).map(release => release()));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(await sharedPage.evaluate(() => window.__featureFixture.calls.translations.length), 2, 'closing while fresh status is pending cancels the unstarted translation');
    assert.equal(await sharedId('translation-settings').isVisible(), false);
    assert.equal(await sharedId('translation-result').isVisible(), false);
    await sharedKey.context.close();
    pass('asynchronous shared-key status refresh keeps selection jobs guarded against duplicate requests and closing before translation starts');

    assert.deepEqual(blockedNetwork, [], 'feature checks do not attempt an external network call');
    assert.deepEqual(errors, [], 'all feature interactions have no uncaught renderer errors');
    pass('all checks used the mock provider, stayed on loopback and produced no uncaught renderer errors');
    console.log(`Feature checks: ${passed} passed (mock provider only)`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
