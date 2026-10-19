const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {_electron: electron} = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'corner-note-desktop-'));
  const statePath = path.join(directory, 'note-state.json');
  let application;
  let passed = 0;
  const pass = label => console.log(`ok ${++passed} - ${label}`);
  async function launch() {
    application = await electron.launch({
      executablePath: require('electron'),
      chromiumSandbox: process.env.ELECTRON_TEST_NO_SANDBOX !== '1',
      args: [root, `--user-data-dir=${directory}`, '--disable-gpu',
        ...(process.env.ELECTRON_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])],
      env: {...process.env, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(directory, 'cache')},
      timeout: 30000
    });
    const page = await application.firstWindow();
    await page.waitForFunction(() => typeof window.cornerNote?.getState === 'function');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    const initialState = await page.evaluate(() => window.cornerNote.getState());
    if (!initialState.folded && !initialState.settings?.tutorialCompleted) {
      await page.getByTestId('tutorial-skip').waitFor({state: 'visible'});
      await page.getByTestId('tutorial-skip').click();
      await page.waitForFunction(async () => (await window.cornerNote.getState()).settings.tutorialCompleted === true);
    }
    return page;
  }
  async function quit(page) {
    await Promise.all([application.waitForEvent('close'), page.evaluate(() => window.cornerNote.quit()).catch(() => {})]);
    application = null;
  }
  const nativeBounds = () => application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getBounds());
  const nativeTopmost = () => application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop());
  const blur = () => application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].emit('blur'));
  const centerWindow = () => application.evaluate(({BrowserWindow, screen}) => {
    const area = screen.getPrimaryDisplay().workArea;
    const width = Math.min(392, area.width);
    const height = Math.min(460, area.height);
    BrowserWindow.getAllWindows()[0].setBounds({
      x: area.x + Math.floor((area.width - width) / 2),
      y: area.y + Math.floor((area.height - height) / 2), width, height,
    });
    return {bounds: BrowserWindow.getAllWindows()[0].getBounds(), area};
  });
  const interact = (page, options, delta, cancel = false) => page.evaluate(async ({options, delta, cancel}) => {
    const id = await window.cornerNote.beginInteraction({...options, screenX: 0, screenY: 0});
    const bounds = await window.cornerNote.updateInteraction({id, screenX: delta.x, screenY: delta.y});
    const state = await window.cornerNote.endInteraction({id, cancel});
    return {id, bounds, state};
  }, {options, delta, cancel});
  try {
    let page = await launch();
    const preferences = await application.evaluate(({BrowserWindow}) => {
      const window = BrowserWindow.getAllWindows()[0];
      const prefs = window.webContents.getLastWebPreferences();
      return {topmost: window.isAlwaysOnTop(), resizable: window.isResizable(), sandbox: prefs.sandbox, isolation: prefs.contextIsolation, node: prefs.nodeIntegration};
    });
    assert.deepEqual(preferences, {topmost: true, resizable: false, sandbox: true, isolation: true, node: false});
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    pass('actual Electron window is topmost with isolated renderer, sandbox and custom resize borders');

    await assert.rejects(page.evaluate(() => window.cornerNote.fold({corner: 'invalid'})));
    await assert.rejects(page.evaluate(() => window.cornerNote.setAlwaysOnTop('false')));
    await assert.rejects(page.evaluate(() => window.cornerNote.beginInteraction({kind: 'resize', edge: 'diagonal', screenX: 0, screenY: 0})));
    await assert.rejects(page.evaluate(() => window.cornerNote.beginInteraction({kind: 'move-folded', screenX: 0, screenY: 0})));
    pass('native IPC rejects invalid corners, pin settings, resize edges and moving an expanded note');

    const first = '데스크톱 자동 저장 📝\n다시 열어도 남아 있어요.';
    await page.getByTestId('note-editor').fill(first);
    await page.getByTestId('color-mint').click();
    await page.waitForFunction(async expected => (await window.cornerNote.getState()).text === expected, first);
    // Quit immediately, without waiting for the disk debounce.
    await quit(page);
    let saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.equal(saved.text, first);
    assert.equal(saved.color, 'mint');
    page = await launch();
    assert.equal(await page.getByTestId('note-editor').inputValue(), first);
    assert.equal(await page.getByTestId('color-mint').getAttribute('aria-pressed'), 'true');
    pass('immediate quit flushes text and color, and relaunch restores both');

    const preferenceUpdate = await page.evaluate(() => window.cornerNote.updatePreferences({
      translationLanguages: ['pt-br', 'pt-BR', 'ja', 'zh-hant'], tutorialCompleted: false,
    }));
    assert.deepEqual(preferenceUpdate.settings, {translationLanguages: ['pt-BR', 'ja', 'zh-Hant'], tutorialCompleted: false});
    assert.equal(preferenceUpdate.text, first);
    assert.equal(preferenceUpdate.color, 'mint');
    saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.deepEqual(saved.settings, preferenceUpdate.settings);
    assert.equal(saved.text, first);
    await assert.rejects(page.evaluate(() => window.cornerNote.updatePreferences({translationLanguages: ['not a language']})));
    await assert.rejects(page.evaluate(() => window.cornerNote.updatePreferences({tutorialCompleted: 'yes'})));
    await page.evaluate(() => window.cornerNote.updatePreferences({tutorialCompleted: true}));
    await quit(page);
    page = await launch();
    const restoredPreferences = await page.evaluate(() => window.cornerNote.getState());
    assert.deepEqual(restoredPreferences.settings, {translationLanguages: ['pt-BR', 'ja', 'zh-Hant'], tutorialCompleted: true});
    assert.equal(restoredPreferences.text, first);
    assert.equal(restoredPreferences.color, 'mint');
    assert.ok(Intl.getCanonicalLocales(restoredPreferences.systemLanguage).length);
    pass('native preferences normalize languages, reject invalid values and persist tutorial state without changing the note');

    const clipboardText = '복사한 번역 결과\nA copied translation. 📝';
    await page.evaluate(text => window.cornerNote.copyText(text), clipboardText);
    assert.equal(await application.evaluate(({clipboard}) => clipboard.readText()), clipboardText);
    await assert.rejects(page.evaluate(() => window.cornerNote.copyText('a'.repeat(65_537))));
    assert.equal(await application.evaluate(({clipboard}) => clipboard.readText()), clipboardText);
    pass('native copy bridge writes Unicode translation text to the actual clipboard and rejects oversized input');

    const initialTranslationSettings = await page.evaluate(() => window.cornerNote.getTranslationSettings());
    assert.equal(initialTranslationSettings.configured, false);
    assert.equal(typeof initialTranslationSettings.canRememberKey, 'boolean');
    if (process.platform === 'win32') {
      assert.equal(initialTranslationSettings.canRememberKey, true, 'Windows account encryption must support remembered API keys');
    }
    assert.equal(initialTranslationSettings.provider, 'openai');
    assert.equal(initialTranslationSettings.model, 'gpt-4.1-mini');
    const remember = initialTranslationSettings.canRememberKey;
    // This intentionally fake key exercises local storage only. Never translate
    // or send a network request using it.
    const fakeKey = `sk-${'desktop-test-only-'.repeat(4)}`;
    const keyPath = path.join(directory, 'translation-key.json');
    if (!remember) {
      await assert.rejects(page.evaluate(apiKey => window.cornerNote.setTranslationKey({apiKey, remember: true}), fakeKey));
      assert.equal((await page.evaluate(() => window.cornerNote.getTranslationSettings())).configured, false);
    }
    const configuredStatus = await page.evaluate(({apiKey, remember}) => window.cornerNote.setTranslationKey({apiKey, remember}), {apiKey: fakeKey, remember});
    assert.equal(configuredStatus.configured, true);
    assert.deepEqual(Object.keys(configuredStatus).sort(), ['canRememberKey', 'configured', 'model', 'provider']);
    assert.equal(JSON.stringify(configuredStatus).includes(fakeKey), false);
    assert.equal(JSON.stringify(await page.evaluate(() => window.cornerNote.getState())).includes(fakeKey), false);
    assert.equal((await fs.readFile(statePath, 'utf8')).includes(fakeKey), false);
    if (remember) {
      const encryptedFile = await fs.readFile(keyPath, 'utf8');
      assert.equal(encryptedFile.includes(fakeKey), false);
      const encrypted = JSON.parse(encryptedFile);
      assert.equal(encrypted.version, 1);
      assert.equal(typeof encrypted.encryptedKey, 'string');
      assert.equal(Buffer.from(encrypted.encryptedKey, 'base64').includes(Buffer.from(fakeKey)), false);
    } else {
      await assert.rejects(fs.stat(keyPath), {code: 'ENOENT'});
    }
    await quit(page);
    page = await launch();
    assert.equal((await page.evaluate(() => window.cornerNote.getTranslationSettings())).configured, remember);
    assert.equal((await page.evaluate(() => window.cornerNote.getState())).text, first);
    pass(`native API key storage uses ${remember ? 'OS encryption and restores the key' : 'session memory when secure persistence is unavailable'} without exposing it in note state`);

    const clearedStatus = await page.evaluate(() => window.cornerNote.clearTranslationKey());
    assert.equal(clearedStatus.configured, false);
    await assert.rejects(fs.stat(keyPath), {code: 'ENOENT'});
    await page.evaluate(apiKey => window.cornerNote.setTranslationKey({apiKey, remember: false}), fakeKey);
    assert.equal((await page.evaluate(() => window.cornerNote.getTranslationSettings())).configured, true);
    await assert.rejects(fs.stat(keyPath), {code: 'ENOENT'});
    await quit(page);
    page = await launch();
    assert.equal((await page.evaluate(() => window.cornerNote.getTranslationSettings())).configured, false);
    assert.equal((await page.evaluate(() => window.cornerNote.getState())).text, first);
    assert.equal((await fs.readFile(statePath, 'utf8')).includes(fakeKey), false);
    pass('disconnect deletes saved credentials and a session-only key is lost on relaunch without changing the note');

    await page.getByTestId('always-on-top-button').click();
    await page.waitForFunction(async () => (await window.cornerNote.getState()).alwaysOnTop === false);
    assert.equal(await nativeTopmost(), false);
    assert.equal(await page.getByTestId('always-on-top-button').getAttribute('aria-pressed'), 'false');
    await blur();
    assert.equal(await nativeTopmost(), false);
    pass('clicking the pin disables native topmost and blur respects that choice');

    for (const edge of ['left', 'right', 'top', 'bottom']) {
      const {bounds: before} = await centerWindow();
      const horizontal = edge === 'left' || edge === 'right';
      const amount = edge === 'left' || edge === 'top' ? -24 : 24;
      const {bounds, state} = await interact(page, {kind: 'resize', edge}, {x: horizontal ? amount : 0, y: horizontal ? 0 : amount});
      assert.deepEqual(bounds, await nativeBounds());
      assert.deepEqual(state.bounds, bounds);
      if (horizontal) {
        assert.equal(bounds.width, before.width + 24, edge);
        assert.equal(bounds.height, before.height, edge);
        assert.equal(bounds.y, before.y, edge);
        assert.equal(edge === 'left' ? bounds.x + bounds.width : bounds.x,
          edge === 'left' ? before.x + before.width : before.x, edge);
      } else {
        assert.equal(bounds.height, before.height + 24, edge);
        assert.equal(bounds.width, before.width, edge);
        assert.equal(bounds.x, before.x, edge);
        assert.equal(edge === 'top' ? bounds.y + bounds.height : bounds.y,
          edge === 'top' ? before.y + before.height : before.y, edge);
      }
    }
    pass('native resize transactions resize each side while keeping its opposite edge fixed');

    for (const edge of ['left', 'right', 'top', 'bottom']) {
      const {bounds: before, area} = await centerWindow();
      const horizontal = edge === 'left' || edge === 'right';
      const shrink = edge === 'left' || edge === 'top' ? 100000 : -100000;
      const minimum = await interact(page, {kind: 'resize', edge}, {x: horizontal ? shrink : 0, y: horizontal ? 0 : shrink});
      assert.equal(horizontal ? minimum.bounds.width : minimum.bounds.height, Math.min(300, horizontal ? area.width : area.height), edge);
      const minimumAnchor = horizontal
        ? edge === 'left' ? minimum.bounds.x + minimum.bounds.width : minimum.bounds.x
        : edge === 'top' ? minimum.bounds.y + minimum.bounds.height : minimum.bounds.y;
      const originalAnchor = horizontal
        ? edge === 'left' ? before.x + before.width : before.x
        : edge === 'top' ? before.y + before.height : before.y;
      assert.equal(minimumAnchor, originalAnchor, edge);
      await centerWindow();
      const maximum = await interact(page, {kind: 'resize', edge}, {x: horizontal ? -shrink : 0, y: horizontal ? 0 : -shrink});
      const maximumEdge = edge === 'left' ? maximum.bounds.x : edge === 'right' ? maximum.bounds.x + maximum.bounds.width
        : edge === 'top' ? maximum.bounds.y : maximum.bounds.y + maximum.bounds.height;
      const displayEdge = edge === 'left' ? area.x : edge === 'right' ? area.x + area.width : edge === 'top' ? area.y : area.y + area.height;
      assert.equal(maximumEdge, displayEdge, edge);
    }
    pass('native side resizing enforces minimum size and the display work area');

    const {bounds: beforeCancel} = await centerWindow();
    const cancelled = await interact(page, {kind: 'resize', edge: 'left'}, {x: -37, y: 0}, true);
    assert.notDeepEqual(cancelled.bounds, beforeCancel);
    assert.deepEqual(cancelled.state.bounds, beforeCancel);
    assert.deepEqual(await nativeBounds(), beforeCancel);
    await assert.rejects(page.evaluate(id => window.cornerNote.updateInteraction({id, screenX: 100, screenY: 0}), cancelled.id));
    const currentId = await page.evaluate(() => window.cornerNote.beginInteraction({kind: 'resize', edge: 'bottom', screenX: 0, screenY: 0}));
    assert.notEqual(currentId, cancelled.id);
    await assert.rejects(page.evaluate(id => window.cornerNote.endInteraction({id}), cancelled.id));
    await assert.rejects(page.evaluate(() => window.cornerNote.beginInteraction({kind: 'resize', edge: 'right', screenX: 0, screenY: 0})));
    await page.evaluate(id => window.cornerNote.endInteraction({id, cancel: true}), currentId);
    pass('cancel restores native bounds and stale or overlapping interaction tokens are rejected');

    const {bounds: beforePointer} = await centerWindow();
    const resizeHandle = await page.getByTestId('resize-right').boundingBox();
    assert.ok(resizeHandle);
    const resizeX = resizeHandle.x + resizeHandle.width / 2;
    const resizeY = resizeHandle.y + resizeHandle.height / 2;
    await page.mouse.move(resizeX, resizeY);
    await page.mouse.down();
    await page.mouse.move(resizeX + 30, resizeY, {steps: 5});
    await page.mouse.up();
    await page.waitForFunction(async width => (await window.cornerNote.getState()).bounds.width > width, beforePointer.width);
    const afterPointer = await nativeBounds();
    assert.equal(afterPointer.x, beforePointer.x);
    assert.equal(afterPointer.y, beforePointer.y);
    assert.equal(afterPointer.height, beforePointer.height);
    assert.equal((await page.evaluate(() => window.cornerNote.getState())).folded, false);
    pass('an actual pointer drag on a side strip resizes the native window without folding');

    const original = await application.evaluate(({BrowserWindow, screen}) => ({bounds: BrowserWindow.getAllWindows()[0].getBounds(), area: screen.getPrimaryDisplay().workArea}));
    await page.evaluate(() => window.cornerNote.fold({corner: 'bottom-right'}));
    await page.getByTestId('folded-note').waitFor({state: 'visible'});
    const folded = await nativeBounds();
    assert.deepEqual(folded, {x: original.area.x + original.area.width - 100, y: original.area.y + original.area.height - 100, width: 88, height: 88});
    assert.equal(await nativeTopmost(), false);
    pass('fold first snaps the matching triangular corner above the taskbar and keeps pin off');

    const destination = {x: original.area.x + Math.floor(original.area.width / 2), y: original.area.y + Math.floor(original.area.height / 2)};
    const moved = await interact(page, {kind: 'move-folded'}, {x: destination.x - folded.x, y: destination.y - folded.y});
    assert.deepEqual(moved.bounds, {...destination, width: 88, height: 88});
    assert.equal(moved.state.folded, true);
    assert.equal(moved.state.corner, 'bottom-right');
    assert.equal(moved.state.text, first);
    assert.equal(moved.state.color, 'mint');
    const cancelledMove = await interact(page, {kind: 'move-folded'}, {x: 21, y: -19}, true);
    assert.deepEqual(cancelledMove.state.bounds, moved.bounds);
    await assert.rejects(page.evaluate(() => window.cornerNote.beginInteraction({kind: 'resize', edge: 'left', screenX: 0, screenY: 0})));
    await quit(page);
    saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.deepEqual(saved.window.foldedBounds, moved.bounds);
    assert.equal(saved.window.alwaysOnTop, false);
    page = await launch();
    const restored = await page.evaluate(() => window.cornerNote.getState());
    assert.equal(restored.folded, true);
    assert.equal(restored.corner, 'bottom-right');
    assert.equal(restored.alwaysOnTop, false);
    assert.deepEqual(await nativeBounds(), moved.bounds);
    assert.equal(await nativeTopmost(), false);
    await blur();
    assert.equal(await nativeTopmost(), false);
    pass('folded movement and cancellation preserve shape, text, color and exact moved position through relaunch');

    await page.evaluate(() => window.cornerNote.unfold());
    await page.getByTestId('note-editor').waitFor({state: 'visible'});
    const unfolded = await nativeBounds();
    assert.equal(unfolded.width, original.bounds.width);
    assert.equal(unfolded.height, original.bounds.height);
    assert.equal(unfolded.x, Math.max(original.area.x, Math.min(moved.bounds.x + moved.bounds.width - unfolded.width, original.area.x + original.area.width - unfolded.width)));
    assert.equal(unfolded.y, Math.max(original.area.y, Math.min(moved.bounds.y + moved.bounds.height - unfolded.height, original.area.y + original.area.height - unfolded.height)));
    assert.equal(await page.getByTestId('note-editor').inputValue(), first);
    assert.equal(await page.getByTestId('color-mint').getAttribute('aria-pressed'), 'true');
    await page.getByTestId('always-on-top-button').click();
    await page.waitForFunction(async () => (await window.cornerNote.getState()).alwaysOnTop === true);
    assert.equal(await nativeTopmost(), true);
    pass('unfolding anchors the same physical corner, preserves expanded size and restores the pin on request');

    const start = await page.getByTestId('fold-handle-bottom-right').boundingBox();
    const end = await page.getByTestId('fold-handle-top-left').boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {steps: 14});
    await page.mouse.up();
    await page.getByTestId('folded-note').waitFor({state: 'visible'});
    const beforeBodyDrag = await nativeBounds();
    const tiny = await page.getByTestId('folded-note').boundingBox();
    await page.mouse.move(tiny.x + 15, tiny.y + 15);
    await page.mouse.down();
    await page.mouse.move(tiny.x + 40, tiny.y + 34);
    await page.mouse.up();
    await page.waitForFunction(async before => {
      const state = await window.cornerNote.getState();
      return state.folded && (state.bounds.x !== before.x || state.bounds.y !== before.y);
    }, beforeBodyDrag);
    assert.equal((await page.evaluate(() => window.cornerNote.getState())).corner, 'top-left');
    // Resnap before unfolding so the physical screen has room for the full drag.
    await page.evaluate(() => window.cornerNote.fold({corner: 'top-left'}));
    const grip = await page.getByTestId('unfold-handle').boundingBox();
    assert.ok(grip);
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 62, grip.y + grip.height / 2 + 62, {steps: 12});
    await page.mouse.up();
    await page.getByTestId('note-editor').waitFor({state: 'visible'});
    assert.equal(await page.getByTestId('note-editor').inputValue(), first);
    pass('actual Electron gestures fold, drag the folded body and unfold only from its diagonal grip');

    await blur();
    assert.equal(await nativeTopmost(), true);
    await page.evaluate(() => window.cornerNote.hide());
    assert.equal(await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await quit(page);
    pass('blur keeps enabled topmost state; hide removes the note without losing its process');

    const legacy = {
      version: 1, text: '기존 버전의 메모와 설정', color: 'sky', savedAt: '2026-10-19T12:00:00.000Z',
      window: {folded: true, corner: 'top-left', expandedBounds: original.bounds, displayId: null},
    };
    await fs.writeFile(statePath, JSON.stringify(legacy));
    page = await launch();
    const upgraded = await page.evaluate(() => window.cornerNote.getState());
    assert.equal(upgraded.text, legacy.text);
    assert.equal(upgraded.color, legacy.color);
    assert.equal(upgraded.savedAt, legacy.savedAt);
    assert.equal(upgraded.alwaysOnTop, true);
    assert.equal(upgraded.folded, true);
    assert.equal(upgraded.corner, 'top-left');
    assert.deepEqual(await nativeBounds(), {x: original.area.x + 12, y: original.area.y + 12, width: 88, height: 88});
    await page.evaluate(() => window.cornerNote.unfold());
    assert.equal(await page.getByTestId('note-editor').inputValue(), legacy.text);
    assert.equal(await page.getByTestId('color-sky').getAttribute('aria-pressed'), 'true');
    assert.equal((await nativeBounds()).width, original.bounds.width);
    assert.equal((await nativeBounds()).height, original.bounds.height);
    await quit(page);
    saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.equal(saved.text, legacy.text);
    assert.equal(saved.color, legacy.color);
    assert.equal(saved.window.alwaysOnTop, true);
    pass('legacy version 1 saves keep note settings and gain default pin and folded positioning');

    await fs.writeFile(statePath, '{damaged json');
    page = await launch();
    assert.equal(await page.getByTestId('note-editor').inputValue(), '');
    const backups = (await fs.readdir(directory)).filter(name => name.startsWith('note-state.json.corrupt-'));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(directory, backups[0]), 'utf8'), '{damaged json');
    await page.getByTestId('note-editor').fill('복구한 새 메모');
    await page.waitForFunction(async () => (await window.cornerNote.getState()).text === '복구한 새 메모');
    await quit(page);
    saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.equal(saved.text, '복구한 새 메모');
    pass('damaged save is preserved for recovery and the app can save again');
    console.log(`Desktop checks: ${passed} passed`);
  } finally {
    if (application) await application.close().catch(() => {});
    await fs.rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
