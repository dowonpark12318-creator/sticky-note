const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {_electron: electron} = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'corner-note-desktop-'));
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
    return page;
  }
  async function quit(page) {
    await Promise.all([application.waitForEvent('close'), page.evaluate(() => window.cornerNote.quit()).catch(() => {})]);
    application = null;
  }
  try {
    let page = await launch();
    const preferences = await application.evaluate(({BrowserWindow}) => {
      const window = BrowserWindow.getAllWindows()[0];
      const prefs = window.webContents.getLastWebPreferences();
      return {topmost: window.isAlwaysOnTop(), sandbox: prefs.sandbox, isolation: prefs.contextIsolation, node: prefs.nodeIntegration};
    });
    assert.deepEqual(preferences, {topmost: true, sandbox: true, isolation: true, node: false});
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    pass('actual Electron window is topmost with isolated renderer and sandbox preferences');

    assert.equal(await page.evaluate(async () => {
      try {await window.cornerNote.fold({corner: 'invalid'}); return false;} catch {return true;}
    }), true);
    pass('native IPC rejects an invalid screen corner');

    const first = '데스크톱 자동 저장 📝\n다시 열어도 남아 있어요.';
    await page.getByTestId('note-editor').fill(first);
    await page.getByTestId('color-mint').click();
    await page.waitForFunction(async expected => (await window.cornerNote.getState()).text === expected, first);
    // Quit immediately, without waiting for the disk debounce.
    await quit(page);
    let saved = JSON.parse(await fs.readFile(path.join(directory, 'note-state.json'), 'utf8'));
    assert.equal(saved.text, first);
    assert.equal(saved.color, 'mint');
    page = await launch();
    assert.equal(await page.getByTestId('note-editor').inputValue(), first);
    pass('immediate quit flushes text and color, and relaunch restores both');

    const original = await application.evaluate(({BrowserWindow, screen}) => ({bounds: BrowserWindow.getAllWindows()[0].getBounds(), area: screen.getPrimaryDisplay().workArea}));
    await page.evaluate(() => window.cornerNote.fold({corner: 'bottom-right'}));
    await page.getByTestId('folded-note').waitFor({state: 'visible'});
    const folded = await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getBounds());
    assert.deepEqual(folded, {x: original.area.x + original.area.width - 100, y: original.area.y + original.area.height - 100, width: 88, height: 88});
    await quit(page);
    page = await launch();
    assert.equal((await page.evaluate(() => window.cornerNote.getState())).folded, true);
    await page.evaluate(() => window.cornerNote.unfold());
    await page.getByTestId('note-editor').waitFor({state: 'visible'});
    const unfolded = await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getBounds());
    assert.equal(unfolded.width, original.bounds.width);
    assert.equal(unfolded.height, original.bounds.height);
    pass('native fold snaps above taskbar, restores folded state after relaunch and preserves expanded size');

    const start = await page.getByTestId('fold-handle-bottom-right').boundingBox();
    const end = await page.getByTestId('fold-handle-top-left').boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {steps: 14});
    await page.mouse.up();
    await page.getByTestId('folded-note').waitFor({state: 'visible'});
    const tiny = await page.getByTestId('folded-note').boundingBox();
    await page.mouse.move(tiny.x + 15, tiny.y + 15);
    await page.mouse.down();
    await page.mouse.move(tiny.x + 77, tiny.y + 77, {steps: 12});
    await page.mouse.up();
    await page.getByTestId('note-editor').waitFor({state: 'visible'});
    assert.equal(await page.getByTestId('note-editor').inputValue(), first);
    pass('actual Electron pointer gestures fold and unfold inside the small native window');

    await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].emit('blur'));
    assert.equal(await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true);
    await page.evaluate(() => window.cornerNote.hide());
    assert.equal(await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await quit(page);
    pass('blur keeps topmost state; hide removes the note without losing its process');

    await fs.writeFile(path.join(directory, 'note-state.json'), '{damaged json');
    page = await launch();
    assert.equal(await page.getByTestId('note-editor').inputValue(), '');
    const backups = (await fs.readdir(directory)).filter(name => name.startsWith('note-state.json.corrupt-'));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(directory, backups[0]), 'utf8'), '{damaged json');
    await page.getByTestId('note-editor').fill('복구한 새 메모');
    await page.waitForFunction(async () => (await window.cornerNote.getState()).text === '복구한 새 메모');
    await quit(page);
    saved = JSON.parse(await fs.readFile(path.join(directory, 'note-state.json'), 'utf8'));
    assert.equal(saved.text, '복구한 새 메모');
    pass('damaged save is preserved for recovery and the app can save again');
    console.log(`Desktop checks: ${passed} passed`);
  } finally {
    if (application) await application.close().catch(() => {});
    await fs.rm(directory, {recursive: true, force: true});
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
