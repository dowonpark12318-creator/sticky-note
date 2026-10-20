const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {_electron: electron} = require('playwright');
const execFileAsync = promisify(execFile);

async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'corner-note-desktop-'));
  const statePath = path.join(directory, 'note-state.json');
  let application;
  let passed = 0;
  const pass = label => console.log(`ok ${++passed} - ${label}`);
  const readSaved = async () => JSON.parse(await fs.readFile(statePath, 'utf8'));
  async function eventually(check, label, timeout = 10000) {
    const deadline = Date.now() + timeout;
    let last;
    do {
      try { last = await check(); if (last) return last; }
      catch (error) { if (!['ENOENT', 'SyntaxError'].includes(error.code || error.name)) throw error; }
      await new Promise(resolve => setTimeout(resolve, 40));
    } while (Date.now() < deadline);
    assert.fail(`Timed out: ${label} (last result ${JSON.stringify(last)})`);
  }
  async function readyWindow(page) {
    await page.waitForFunction(() => typeof window.cornerNote?.getState === 'function');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    return page;
  }
  async function launch(locale = 'ko-KR') {
    application = await electron.launch({
      executablePath: require('electron'),
      chromiumSandbox: process.env.ELECTRON_TEST_NO_SANDBOX !== '1',
      args: [root, `--user-data-dir=${directory}`, '--disable-gpu', `--test-system-language=${locale}`,
        ...(process.env.ELECTRON_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])],
      env: {...process.env, CORNER_NOTE_E2E: '1', XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(directory, 'cache')},
      timeout: 30000
    });
    const page = await application.firstWindow();
    await readyWindow(page);
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
  const stateFor = page => page.evaluate(() => window.cornerNote.getState());
  async function nativeFor(page, action, argument) {
    const window = await application.browserWindow(page);
    return window.evaluate((window, {action, argument}) => {
      if (action === 'setBounds') { window.setBounds(argument); return window.getBounds(); }
      if (action === 'blur') { window.emit('blur'); return; }
      return {bounds: window.getBounds(), focused: window.isFocused(), visible: window.isVisible(), topmost: window.isAlwaysOnTop(), webContentsId: window.webContents.id};
    }, {action, argument});
  }
  async function windowsNativeState() {
    if (process.platform !== 'win32') return null;
    const notes = await application.evaluate(async ({BrowserWindow}) => Promise.all(BrowserWindow.getAllWindows().map(async window => {
      const note = await window.webContents.executeJavaScript('window.cornerNote.getState()');
      const bytes = window.getNativeWindowHandle();
      return {noteId: note.noteId, handle: (bytes.length === 8 ? bytes.readBigUInt64LE() : BigInt(bytes.readUInt32LE())).toString()};
    })));
    assert.ok(notes.every(note => /^\d+$/.test(note.handle)));
    // Read the real Windows desktop stacking list and extended window styles.
    // This observes User32, rather than checking calls to Electron.moveTop().
    const script = `
      Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CornerNoteNativeTest { [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr parent); [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command); [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr window, int index); }';
      $ids = @(${notes.map(note => `'${note.handle}'`).join(',')});
      $order = New-Object 'System.Collections.Generic.List[string]';
      $styles = @{};
      $current = [CornerNoteNativeTest]::GetTopWindow([IntPtr]::Zero);
      while ($current -ne [IntPtr]::Zero) {
        $id = $current.ToInt64().ToString();
        if ($ids -contains $id) { $order.Add($id); }
        $current = [CornerNoteNativeTest]::GetWindow($current, 2);
      }
      foreach ($id in $ids) {
        $handle = [IntPtr]::new([Int64]::Parse($id));
        $style = [CornerNoteNativeTest]::GetWindowLongPtr($handle, -20).ToInt64();
        $styles[$id] = @{ toolWindow = (($style -band 128) -ne 0); topmost = (($style -band 8) -ne 0); owner = [CornerNoteNativeTest]::GetWindow($handle, 4).ToInt64().ToString() };
      }
      ConvertTo-Json -Depth 4 -Compress -InputObject @{ order = @($order.ToArray()); styles = $styles };
    `;
    const {stdout} = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {timeout: 15000, windowsHide: true});
    const observed = JSON.parse(stdout.trim());
    const byHandle = new Map(notes.map(note => [note.handle, note.noteId]));
    return {
      order: observed.order.map(handle => byHandle.get(handle)),
      styles: Object.fromEntries(notes.map(note => [note.noteId, observed.styles[note.handle]])),
    };
  }
  async function clickExposedNote(note) {
    if (process.platform !== 'win32') {
      await note.getByTestId('note-editor').click({position: {x: 20, y: 20}});
      return;
    }
    const window = await application.browserWindow(note);
    const nativeHandle = await window.evaluate(window => {
      const bytes = window.getNativeWindowHandle();
      return (bytes.length === 8 ? bytes.readBigUInt64LE() : BigInt(bytes.readUInt32LE())).toString();
    });
    assert.match(nativeHandle, /^\d+$/);
    // CDP dispatches events directly into a renderer even when its native window
    // is covered. Use a real exposed desktop point so Windows grants focus in
    // exactly the way an actual user click does; never force window.focus().
    const script = `
      $ErrorActionPreference = 'Stop';
      Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CornerNoteRealMouse { [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; public Point(int x, int y) { X = x; Y = y; } } [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left; public int Top; public int Right; public int Bottom; } [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rectangle); [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point); [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra); }';
      $target = [IntPtr]::new([Int64]::Parse('${nativeHandle}'));
      $rectangle = New-Object CornerNoteRealMouse+Rect;
      if (-not [CornerNoteRealMouse]::GetWindowRect($target, [ref]$rectangle)) { throw 'Cannot inspect target note rectangle.'; }
      $width = $rectangle.Right - $rectangle.Left;
      $height = $rectangle.Bottom - $rectangle.Top;
      $xs = @(18, 24, ($width - 18), ($width - 24), [int]($width / 2), 48, ($width - 48));
      $ys = @([int]($height / 2), 96, 48, 18, 24, ($height - 18), ($height - 24), ($height - 48));
      $point = $null;
      foreach ($x in $xs) {
        foreach ($y in $ys) {
          if ($x -lt 0 -or $x -ge $width -or $y -lt 0 -or $y -ge $height) { continue; }
          if (($x -lt 40 -or $x -gt ($width - 40)) -and ($y -lt 40 -or $y -gt ($height - 40))) { continue; }
          $candidate = [CornerNoteRealMouse+Point]::new($rectangle.Left + $x, $rectangle.Top + $y);
          $root = [CornerNoteRealMouse]::GetAncestor([CornerNoteRealMouse]::WindowFromPoint($candidate), 2);
          if ($root -eq $target) { $point = $candidate; break; }
        }
        if ($null -ne $point) { break; }
      }
      if ($null -eq $point) { throw 'Target note has no exposed desktop point; cannot test an actual user click.'; }
      if (-not [CornerNoteRealMouse]::SetCursorPos($point.X, $point.Y)) { throw 'Cannot move desktop pointer.'; }
      $clickedRoot = [CornerNoteRealMouse]::GetAncestor([CornerNoteRealMouse]::WindowFromPoint($point), 2);
      if ($clickedRoot -ne $target) { throw 'Another native window covers the intended click point.'; }
      [CornerNoteRealMouse]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero);
      Start-Sleep -Milliseconds 35;
      [CornerNoteRealMouse]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero);
      ConvertTo-Json -Compress -InputObject @{ root = $clickedRoot.ToInt64().ToString(); x = $point.X; y = $point.Y };
    `;
    const {stdout} = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {timeout: 15000, windowsHide: true});
    assert.equal(JSON.parse(stdout.trim()).root, nativeHandle, 'the actual mouse click reaches the intended native note');
  }
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

    assert.deepEqual(await page.locator('.window-controls > button').evaluateAll(buttons => buttons.map(button => button.id)), ['help-button', 'add-note-button', 'hide-button', 'delete-note-button']);
    assert.equal(await page.getByTestId('add-note-button').count(), 1);
    assert.equal(await page.getByTestId('add-note-button').isVisible(), true);
    assert.equal(await page.getByTestId('add-note-button').isEnabled(), true);
    pass('exactly one plus control is visible between the help and hide buttons');

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
    assert.equal(saved.version, 2);
    assert.equal(saved.notes.length, 1);
    assert.equal(saved.notes[0].text, first);
    assert.equal(saved.notes[0].color, 'mint');
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
    assert.equal(saved.notes[0].text, first);
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
    await page.waitForFunction(() => document.querySelector('[data-testid="always-on-top-button"]').getAttribute('aria-pressed') === 'false');
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

    const oppositeCorners = {'top-left': 'bottom-right', 'top-right': 'bottom-left', 'bottom-left': 'top-right', 'bottom-right': 'top-left'};
    async function dragFoldCorner(corner, fraction) {
      const from = await page.getByTestId(`fold-handle-${corner}`).boundingBox();
      const to = await page.getByTestId(`fold-handle-${oppositeCorners[corner]}`).boundingBox();
      assert.ok(from && to);
      const start = {x: from.x + from.width / 2, y: from.y + from.height / 2};
      const end = {x: to.x + to.width / 2, y: to.y + to.height / 2};
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + (end.x - start.x) * fraction, start.y + (end.y - start.y) * fraction, {steps: 8});
      await page.mouse.up();
    }
    for (const corner of Object.keys(oppositeCorners)) {
      await centerWindow();
      await dragFoldCorner(corner, .32);
      assert.equal((await stateFor(page)).folded, false, `${corner}: below one third stays unfolded`);
      await dragFoldCorner(corner, .36);
      await page.getByTestId('folded-note').waitFor({state: 'visible'});
      assert.equal((await stateFor(page)).corner, oppositeCorners[corner]);
      assert.equal((await nativeBounds()).width, 88);
      await page.getByTestId('folded-note').focus();
      await page.keyboard.press('Enter');
      await page.getByTestId('note-editor').waitFor({state: 'visible'});
      assert.equal(await page.getByTestId('note-editor').inputValue(), first);
    }
    pass('all four native corner gestures cancel below one third and fold just above one third');

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
    assert.deepEqual(saved.notes[0].window.foldedBounds, moved.bounds);
    assert.deepEqual(saved.notes[0].window.foldedAnchorBounds, folded);
    assert.equal(saved.alwaysOnTop, false);
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

    const returnedBody = await page.getByTestId('folded-note').boundingBox();
    await page.getByTestId('folded-note').dblclick({position: {x: returnedBody.width * .87, y: returnedBody.height * .87}});
    await page.waitForFunction(async expected => {
      const state = await window.cornerNote.getState();
      return state.folded && state.bounds.x === expected.x && state.bounds.y === expected.y;
    }, folded);
    assert.deepEqual(await nativeBounds(), folded);
    assert.equal((await stateFor(page)).text, first);
    assert.equal((await stateFor(page)).color, 'mint');
    assert.equal(await page.getByTestId('note-editor').isVisible(), false);
    assert.equal(await page.locator('#toast').evaluate(element => element.hidden), true, 'returning a moved folded note must not show a clipped error box');
    await quit(page);
    saved = await readSaved();
    assert.deepEqual(saved.notes[0].window.foldedBounds, folded);
    assert.deepEqual(saved.notes[0].window.foldedAnchorBounds, folded);
    page = await launch();
    assert.equal((await stateFor(page)).folded, true);
    assert.deepEqual(await nativeBounds(), folded);
    assert.equal((await stateFor(page)).text, first);
    assert.equal((await stateFor(page)).color, 'mint');
    pass('double-click returns a moved folded note to its original persisted anchor without unfolding or changing its contents');

    // Moving after returning remains free, and unfolding still follows the
    // current physical corner rather than changing the remembered fold anchor.
    await interact(page, {kind: 'move-folded'}, {x: moved.bounds.x - folded.x, y: moved.bounds.y - folded.y});

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
    // The body's double-click returns to the original top-left folded anchor;
    // the separate diagonal grip continues to unfold it.
    const movedBody = await page.getByTestId('folded-note').boundingBox();
    await page.getByTestId('folded-note').dblclick({position: {x: movedBody.width * .2, y: movedBody.height * .2}});
    await page.waitForFunction(async expected => {
      const state = await window.cornerNote.getState();
      return state.folded && state.bounds.x === expected.x && state.bounds.y === expected.y;
    }, beforeBodyDrag);
    assert.deepEqual(await nativeBounds(), beforeBodyDrag);
    assert.equal(await page.locator('#toast').evaluate(element => element.hidden), true, 'body double-click leaves the folded note free of popup notifications');
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

    // Exercise multiple real native windows in the same Windows CI test gate.
    page = await launch();
    const noteOne = page;
    const idOne = (await stateFor(noteOne)).noteId;
    assert.equal(typeof idOne, 'string');
    async function addNote(source) {
      const appeared = application.waitForEvent('window');
      await source.getByTestId('add-note-button').click();
      const created = await readyWindow(await appeared);
      assert.equal(await created.getByTestId('note-editor').inputValue(), '');
      return created;
    }
    const noteTwo = await addNote(noteOne);
    const idTwo = (await stateFor(noteTwo)).noteId;
    await noteTwo.getByTestId('note-editor').fill('두 번째 메모 · 독립적인 내용');
    await noteTwo.getByTestId('color-rose').click();
    const noteThree = await addNote(noteTwo);
    const idThree = (await stateFor(noteThree)).noteId;
    assert.equal(new Set([idOne, idTwo, idThree]).size, 3);
    for (const note of [noteOne, noteTwo, noteThree]) {
      await note.waitForFunction(async () => (await window.cornerNote.getState()).noteCount === 3);
    }
    assert.equal(await noteOne.getByTestId('note-editor').inputValue(), first);
    assert.equal((await stateFor(noteTwo)).text, '두 번째 메모 · 독립적인 내용');
    assert.equal((await stateFor(noteTwo)).color, 'rose');
    assert.equal((await stateFor(noteThree)).color, 'butter');
    pass('clicking + creates three distinct native notes and retains the source note draft and color');

    await noteThree.getByTestId('note-editor').fill('세 번째 메모 · another independent note');
    await noteThree.getByTestId('color-sky').click();
    const area = await application.evaluate(({screen}) => screen.getPrimaryDisplay().workArea);
    const desiredBounds = (offset, size) => ({
      x: area.x + Math.min(offset, Math.max(0, area.width - size)),
      y: area.y + Math.min(offset, Math.max(0, area.height - size)),
      width: Math.min(size, area.width), height: Math.min(size, area.height),
    });
    const oneBounds = await nativeFor(noteOne, 'setBounds', desiredBounds(40, 340));
    const twoBounds = await nativeFor(noteTwo, 'setBounds', desiredBounds(70, 360));
    const threeBounds = await nativeFor(noteThree, 'setBounds', desiredBounds(100, 380));
    await noteTwo.evaluate(() => window.cornerNote.fold({corner: 'top-right'}));
    const secondFolded = await nativeFor(noteTwo);
    const secondMoved = await interact(noteTwo, {kind: 'move-folded'}, {x: -130, y: 140});
    assert.equal(secondMoved.state.folded, true);
    assert.equal(secondMoved.state.corner, 'top-right');
    assert.notDeepEqual(secondMoved.bounds, secondFolded.bounds);
    assert.deepEqual((await nativeFor(noteOne)).bounds, oneBounds);
    assert.deepEqual((await nativeFor(noteThree)).bounds, threeBounds);
    assert.equal((await stateFor(noteOne)).folded, false);
    assert.equal((await stateFor(noteThree)).folded, false);
    assert.equal((await stateFor(noteOne)).color, 'mint');
    assert.equal((await stateFor(noteTwo)).color, 'rose');
    assert.equal((await stateFor(noteThree)).color, 'sky');
    const crossWindowInteraction = await noteOne.evaluate(() => window.cornerNote.beginInteraction({kind: 'resize', edge: 'right', screenX: 0, screenY: 0}));
    await assert.rejects(noteThree.evaluate(id => window.cornerNote.updateInteraction({id, screenX: 70, screenY: 0}), crossWindowInteraction));
    await assert.rejects(noteThree.evaluate(id => window.cornerNote.endInteraction({id}), crossWindowInteraction));
    await noteOne.evaluate(id => window.cornerNote.endInteraction({id, cancel: true}), crossWindowInteraction);
    assert.deepEqual((await nativeFor(noteThree)).bounds, threeBounds);
    pass('each note keeps independent text, color, size, folded position and interaction tokens');

    const overlap = desiredBounds(80, 350);
    await nativeFor(noteOne, 'setBounds', overlap);
    await nativeFor(noteThree, 'setBounds', overlap);
    assert.deepEqual((await nativeFor(noteOne)).bounds, overlap);
    assert.deepEqual((await nativeFor(noteThree)).bounds, overlap);
    // First prove exact overlap is allowed. Then expose a strip of each note so
    // either can actually be clicked on the desktop without forcing OS focus.
    const overlapThree = desiredBounds(108, 350);
    await nativeFor(noteThree, 'setBounds', overlapThree);
    async function assertActive(note, id) {
      await note.waitForFunction(async expected => (await window.cornerNote.getState()).activeNoteId === expected, id);
      // The Linux CI smoke display intentionally has no window manager, so it
      // cannot grant native focus. Windows is the supported desktop target and
      // must additionally pass real native focus and User32 stacking checks.
      if (process.platform === 'win32') await eventually(async () => (await nativeFor(note)).focused, `native focus on ${id}`);
      assert.equal((await nativeFor(note)).visible, true);
      await eventually(async () => {
        const data = await readSaved();
        return data.activeNoteId === id && data.noteOrder.at(-1) === id;
      }, `persisted active note order for ${id}`);
      const native = await windowsNativeState();
      if (native) assert.equal(native.order[0], id, 'last activated note is actually highest in Windows User32 stacking order');
    }
    await clickExposedNote(noteOne);
    await noteOne.getByTestId('note-editor').fill(`${first}\n겹친 상태에서 첫 메모 편집`);
    await assertActive(noteOne, idOne);
    await clickExposedNote(noteThree);
    await assertActive(noteThree, idThree);
    // A delayed sibling blur used to raise older always-on-top windows again.
    // Re-delivering that native event must leave focus AND real Windows order.
    await nativeFor(noteOne, 'blur');
    await nativeFor(noteTwo, 'blur');
    await assertActive(noteThree, idThree);
    assert.deepEqual((await nativeFor(noteOne)).bounds, overlap);
    assert.deepEqual((await nativeFor(noteThree)).bounds, overlapThree);
    pass(`overlapping notes are allowed; clicking or editing activates the latest note and sibling blur preserves it${process.platform === 'win32' ? ' with actual Windows focus and stacking order' : ' (Linux smoke display; native focus/stacking are checked on Windows)'}`);

    await clickExposedNote(noteOne);
    await noteOne.getByTestId('always-on-top-button').click();
    for (const note of [noteOne, noteTwo, noteThree]) {
      await note.waitForFunction(async () => (await window.cornerNote.getState()).alwaysOnTop === false);
      assert.equal((await nativeFor(note)).topmost, false);
    }
    let nativeWindows = await windowsNativeState();
    if (nativeWindows) {
      for (const id of [idOne, idTwo, idThree]) {
        assert.equal(nativeWindows.styles[id].toolWindow, false, 'pin-off notes must remain normal Alt-Tab windows');
        assert.equal(nativeWindows.styles[id].topmost, false, 'pin-off notes must leave the native Windows topmost band');
        assert.equal(nativeWindows.styles[id].owner, '0', 'independent notes must not be owned tool windows');
      }
    }
    await clickExposedNote(noteThree);
    await assertActive(noteThree, idThree);
    await noteThree.getByTestId('always-on-top-button').click();
    for (const note of [noteOne, noteTwo, noteThree]) {
      await note.waitForFunction(async () => (await window.cornerNote.getState()).alwaysOnTop === true);
      assert.equal((await nativeFor(note)).topmost, true);
    }
    nativeWindows = await windowsNativeState();
    if (nativeWindows) {
      assert.equal(nativeWindows.order[0], idThree);
      for (const id of [idOne, idTwo, idThree]) assert.equal(nativeWindows.styles[id].topmost, true, 'pinned notes use the native Windows topmost band');
    }
    pass('the pin setting updates every native note together and pin-off notes retain normal Windows Alt-Tab styles');

    const concurrentOne = `${first}\n다른 창 설정 중에도 첫 번째 초안 보존`;
    const concurrentThree = '세 번째의 새 초안 · shared settings must preserve this';
    await Promise.all([
      noteOne.getByTestId('note-editor').fill(concurrentOne),
      noteTwo.evaluate(() => window.cornerNote.updatePreferences({translationLanguages: ['fr', 'ja'], tutorialCompleted: true})),
      noteThree.getByTestId('note-editor').fill(concurrentThree),
    ]);
    for (const [note, expected] of [[noteOne, concurrentOne], [noteTwo, '두 번째 메모 · 독립적인 내용'], [noteThree, concurrentThree]]) {
      await note.waitForFunction(async expected => (await window.cornerNote.getState()).text === expected, expected);
      assert.equal((await stateFor(note)).text, expected);
      assert.deepEqual((await stateFor(note)).settings, {translationLanguages: ['fr', 'ja'], tutorialCompleted: true});
    }
    assert.equal(await noteOne.getByTestId('note-editor').inputValue(), concurrentOne);
    assert.equal(await noteThree.getByTestId('note-editor').inputValue(), concurrentThree);
    await noteOne.evaluate(apiKey => window.cornerNote.setTranslationKey({apiKey, remember: false}), fakeKey);
    assert.equal((await noteTwo.evaluate(() => window.cornerNote.getTranslationSettings())).configured, true);
    assert.equal((await noteThree.evaluate(() => window.cornerNote.getTranslationSettings())).configured, true);
    await noteThree.evaluate(() => window.cornerNote.clearTranslationKey());
    assert.equal((await noteOne.evaluate(() => window.cornerNote.getTranslationSettings())).configured, false);
    assert.equal((await noteTwo.evaluate(() => window.cornerNote.getTranslationSettings())).configured, false);
    pass('shared language/tutorial preferences and key connection preserve concurrent drafts in every note without a real AI request');

    await noteTwo.evaluate(() => window.cornerNote.hide());
    assert.equal((await nativeFor(noteTwo)).visible, false);
    assert.equal((await nativeFor(noteOne)).visible, true);
    assert.equal((await nativeFor(noteThree)).visible, true);
    await application.evaluate(({app}) => app.emit('activate'));
    await eventually(async () => (await nativeFor(noteTwo)).visible, 'recover hidden note through the app activation action');
    assert.equal((await stateFor(noteTwo)).folded, true);
    assert.equal((await stateFor(noteTwo)).text, '두 번째 메모 · 독립적인 내용');
    assert.deepEqual((await nativeFor(noteTwo)).bounds, secondMoved.bounds);
    pass('hiding one note leaves its siblings visible and app activation recovers it with its folded position intact');

    await clickExposedNote(noteThree);
    await assertActive(noteThree, idThree);
    const beforeRestart = new Map(await Promise.all([noteOne, noteTwo, noteThree].map(async note => {
      const state = await stateFor(note);
      return [state.noteId, state];
    })));
    await quit(noteThree);
    saved = await readSaved();
    assert.equal(saved.version, 2);
    assert.equal(saved.notes.length, 3);
    assert.deepEqual(new Set(saved.notes.map(note => note.id)), new Set([idOne, idTwo, idThree]));
    assert.equal(saved.activeNoteId, idThree);
    assert.equal(saved.noteOrder.at(-1), idThree);
    assert.deepEqual(saved.notes.find(note => note.id === idTwo).window.expandedBounds, twoBounds);
    assert.deepEqual(saved.settings, {translationLanguages: ['fr', 'ja'], tutorialCompleted: true});
    assert.equal((await fs.readFile(statePath, 'utf8')).includes(fakeKey), false);
    page = await launch();
    await eventually(() => application.windows().length === 3, 'restore three native windows');
    const reopened = await Promise.all(application.windows().map(readyWindow));
    for (const note of reopened) {
      const restoredNote = await stateFor(note);
      const expected = beforeRestart.get(restoredNote.noteId);
      assert.ok(expected, 'restore the same note IDs');
      for (const key of ['text', 'color', 'folded', 'corner', 'alwaysOnTop', 'bounds', 'settings']) assert.deepEqual(restoredNote[key], expected[key], `${restoredNote.noteId}: restore ${key}`);
      assert.equal(restoredNote.noteCount, 3);
      assert.equal((await nativeFor(note)).visible, true);
      assert.equal((await nativeFor(note)).topmost, true);
      if (!restoredNote.folded) assert.equal(await note.getByTestId('note-editor').inputValue(), expected.text);
    }
    const restoredThree = reopened.find(note => note === page) || reopened[0];
    await quit(restoredThree);
    pass('quit and restart restore all three independent notes, shared settings, exact overlapping bounds and the last active layer');

    page = await launch();
    await eventually(() => application.windows().length === 3, 'restore notes for deletion');
    const deletionWindows = await Promise.all(application.windows().map(readyWindow));
    const deletionById = new Map(await Promise.all(deletionWindows.map(async note => [(await stateFor(note)).noteId, note])));
    const deletionTarget = deletionById.get(idThree);
    await deletionTarget.getByTestId('delete-note-button').click();
    await deletionTarget.getByTestId('delete-note-dialog').waitFor({state: 'visible'});
    assert.equal(await deletionTarget.locator('#delete-note-title').textContent(), '정말 메모를 삭제할까요?');
    await deletionTarget.getByTestId('delete-note-cancel').click();
    await deletionTarget.getByTestId('delete-note-dialog').waitFor({state: 'hidden'});
    assert.equal(application.windows().length, 3);
    assert.equal(await deletionTarget.getByTestId('note-editor').inputValue(), concurrentThree);
    assert.equal((await readSaved()).notes.some(note => note.id === idThree), true);
    async function deleteThroughConfirmation(note) {
      if ((await stateFor(note)).folded) await note.evaluate(() => window.cornerNote.unfold());
      await note.getByTestId('delete-note-button').click();
      await note.getByTestId('delete-note-dialog').waitFor({state: 'visible'});
      await Promise.all([note.waitForEvent('close'), note.getByTestId('delete-note-confirm').click()]);
    }
    await deleteThroughConfirmation(deletionTarget);
    await eventually(async () => {
      const data = await readSaved();
      return data.notes.length === 2 && !data.notes.some(note => note.id === idThree) && !data.noteOrder.includes(idThree);
    }, 'persist removal of exactly the confirmed memo');
    assert.equal(application.windows().length, 2);
    for (const id of [idOne, idTwo]) {
      const current = await stateFor(deletionById.get(id));
      const expected = beforeRestart.get(id);
      for (const key of ['text', 'color', 'folded', 'corner', 'alwaysOnTop', 'bounds', 'settings']) assert.deepEqual(current[key], expected[key], `${id}: deletion preserves sibling ${key}`);
      assert.equal(current.noteCount, 2);
    }
    await quit(deletionById.get(idOne));
    page = await launch();
    await eventually(() => application.windows().length === 2, 'restart after deleting one memo');
    const survivors = await Promise.all(application.windows().map(readyWindow));
    const survivorIds = [];
    for (const note of survivors) {
      const current = await stateFor(note);
      survivorIds.push(current.noteId);
      assert.ok([idOne, idTwo].includes(current.noteId));
      assert.equal(current.text, beforeRestart.get(current.noteId).text);
      assert.equal(current.color, beforeRestart.get(current.noteId).color);
    }
    assert.deepEqual(new Set(survivorIds), new Set([idOne, idTwo]));
    pass('No preserves the memo; Yes removes only its window and saved identity while sibling content and positions survive restart');

    for (const note of survivors) await deleteThroughConfirmation(note);
    await eventually(() => application.windows().length === 0, 'close the final deleted memo while retaining the tray process');
    saved = await readSaved();
    assert.deepEqual(saved.notes, []);
    assert.equal(saved.activeNoteId, null);
    assert.deepEqual(saved.noteOrder, []);
    assert.deepEqual(saved.settings, {translationLanguages: ['fr', 'ja'], tutorialCompleted: true});
    const recoveredWindow = application.waitForEvent('window');
    await application.evaluate(({app}) => {
      for (let index = 0; index < 6; index += 1) app.emit('activate');
    });
    const recovered = await readyWindow(await recoveredWindow);
    const recoveredState = await stateFor(recovered);
    assert.equal(recoveredState.noteCount, 1);
    assert.equal(recoveredState.text, '');
    assert.equal([idOne, idTwo, idThree].includes(recoveredState.noteId), false);
    await eventually(async () => (await readSaved()).notes.length === 1, 'persist one recovered blank memo after repeated activation');
    assert.equal(application.windows().length, 1);
    assert.deepEqual((await readSaved()).notes.map(note => note.id), [recoveredState.noteId]);
    assert.deepEqual(recoveredState.settings, saved.settings);
    await deleteThroughConfirmation(recovered);
    await eventually(() => application.windows().length === 0, 'delete the single recovery memo');
    saved = await readSaved();
    assert.deepEqual(saved.notes, []);
    assert.equal(saved.activeNoteId, null);
    assert.deepEqual(saved.noteOrder, []);
    pass('repeated app activation after deleting every memo creates exactly one blank window and one saved note');
    await Promise.all([application.waitForEvent('close'), application.evaluate(({app}) => app.quit()).catch(() => {})]);
    application = null;
    page = await launch();
    const fresh = await stateFor(page);
    assert.equal(fresh.noteCount, 1);
    assert.equal(fresh.text, '');
    assert.equal([idOne, idTwo, idThree, recoveredState.noteId].includes(fresh.noteId), false);
    assert.deepEqual(fresh.settings, saved.settings);
    assert.equal(await page.getByTestId('note-editor').inputValue(), '');
    await quit(page);
    assert.equal((await readSaved()).notes.length, 1);
    pass('deleting the last memo persists an empty save; restart opens a new blank memo without resurrecting deleted text or identities');

    const legacy = {
      version: 1, text: '기존 버전의 메모와 설정', color: 'sky', savedAt: '2026-10-19T12:00:00.000Z',
      settings: {translationLanguages: ['de', 'ja'], tutorialCompleted: true},
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
    assert.deepEqual(upgraded.settings, legacy.settings);
    assert.deepEqual(await nativeBounds(), {x: original.area.x + 12, y: original.area.y + 12, width: 88, height: 88});
    await page.evaluate(() => window.cornerNote.unfold());
    assert.equal(await page.getByTestId('note-editor').inputValue(), legacy.text);
    assert.equal(await page.getByTestId('color-sky').getAttribute('aria-pressed'), 'true');
    assert.equal((await nativeBounds()).width, original.bounds.width);
    assert.equal((await nativeBounds()).height, original.bounds.height);
    await quit(page);
    saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.equal(saved.version, 2);
    assert.equal(saved.notes.length, 1);
    assert.equal(saved.notes[0].text, legacy.text);
    assert.equal(saved.notes[0].color, legacy.color);
    assert.equal(saved.alwaysOnTop, true);
    assert.deepEqual(saved.settings, legacy.settings);
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
    assert.equal(saved.notes[0].text, '복구한 새 메모');
    pass('damaged save is preserved for recovery and the app can save again');
    page = await launch('en-US');
    const englishState = await stateFor(page);
    assert.equal(englishState.systemLanguage, 'en-US');
    assert.match(englishState.uiLocale, /^en(?:-|$)/);
    assert.match(await page.locator('html').getAttribute('lang'), /^en(?:-|$)/);
    assert.equal(await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getTitle()), 'Corner Note');
    assert.equal(await page.getByTestId('note-editor').inputValue(), '복구한 새 메모');
    await page.getByTestId('help-button').click();
    assert.equal(await page.locator('#help-title').textContent(), 'A little note, right where you need it.');
    await page.locator('#close-help').click();
    await page.getByTestId('delete-note-button').click();
    await page.getByTestId('delete-note-dialog').waitFor({state: 'visible'});
    assert.equal(await page.locator('#delete-note-title').textContent(), 'Delete this note?');
    assert.equal(await page.getByTestId('delete-note-cancel').textContent(), 'No');
    await page.getByTestId('delete-note-cancel').click();
    await quit(page);
    assert.equal((await readSaved()).notes[0].text, '복구한 새 메모');
    pass('the Windows system-language preference localizes native title, menu/help and deletion UI without translating stored memo content');
    console.log(`Desktop checks: ${passed} passed`);
  } finally {
    if (application) await application.close().catch(() => {});
    await fs.rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
}
main().catch(error => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = String(error?.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Windows desktop test failed::${message}`);
  }
  console.error(error);
  process.exitCode = 1;
});
