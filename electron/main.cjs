'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, dialog, session } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {
  DEFAULT_SIZE, MIN_SIZE, FOLDED_SIZE, validCorner, fitSize, clampBounds, cornerBounds, selectDisplay,
} = require('./window-geometry.cjs');

const COLORS = new Set(['butter', 'rose', 'mint', 'sky']);
const MAX_TEXT_LENGTH = 2_000_000;
app.setName('Corner Note');
const dataDirectoryArgument = process.argv.find(argument => argument.startsWith('--user-data-dir='));
if (dataDirectoryArgument) {
  const directory = path.resolve(dataDirectoryArgument.slice('--user-data-dir='.length));
  fs.mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}

const statePath = path.join(app.getPath('userData'), 'note-state.json');
const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
let mainWindow;
let tray;
let quitReady = false;
let quitPending = false;
let persistTimer;
let pendingSaves = [];
let writeQueue = Promise.resolve();
let writeBlocker;
let applyingBounds = false;
let state = {
  version: 1, text: '', color: 'butter', savedAt: null,
  window: { folded: false, corner: 'top-right', expandedBounds: { ...DEFAULT_SIZE }, displayId: null },
};

function publicState() {
  return {
    text: state.text, color: state.color,
    folded: state.window.folded, corner: state.window.corner, savedAt: state.savedAt,
  };
}

function reportError(error) {
  console.error('[Corner Note]', error instanceof Error ? error.message : String(error));
}

async function loadState() {
  let raw;
  try {
    raw = await fsp.readFile(statePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      writeBlocker = new Error('저장 파일을 읽을 수 없습니다. 파일 권한을 확인해 주세요.');
      reportError(error);
    }
    return;
  }
  try {
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || typeof saved.text !== 'string'
      || saved.text.length > MAX_TEXT_LENGTH || !COLORS.has(saved.color)) {
      throw new Error('Unsupported or damaged note data.');
    }
    const windowState = saved.window && typeof saved.window === 'object' ? saved.window : {};
    state = {
      version: 1, text: saved.text, color: saved.color,
      savedAt: typeof saved.savedAt === 'string' && !Number.isNaN(Date.parse(saved.savedAt)) ? saved.savedAt : null,
      window: {
        folded: windowState.folded === true,
        corner: validCorner(windowState.corner) ? windowState.corner : 'top-right',
        expandedBounds: windowState.expandedBounds && typeof windowState.expandedBounds === 'object'
          ? windowState.expandedBounds : { ...DEFAULT_SIZE },
        displayId: typeof windowState.displayId === 'number' || typeof windowState.displayId === 'string'
          ? windowState.displayId : null,
      },
    };
  } catch (error) {
    const backupPath = `${statePath}.corrupt-${Date.now()}-${process.pid}`;
    try {
      await fsp.rename(statePath, backupPath);
      console.warn('[Corner Note] Damaged save file preserved at', backupPath);
    } catch (backupError) {
      writeBlocker = new Error('손상된 저장 파일의 백업을 만들 수 없어 저장을 중단했습니다.');
      reportError(backupError);
    }
    reportError(error);
  }
}

async function atomicWrite(serialized) {
  if (writeBlocker) throw writeBlocker;
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp-${process.pid}`;
  let handle;
  try {
    handle = await fsp.open(temporaryPath, 'w', 0o600);
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fsp.rename(temporaryPath, statePath);
  } finally {
    if (handle) await handle.close().catch(reportError);
    await fsp.unlink(temporaryPath).catch(error => {
      if (error.code !== 'ENOENT') reportError(error);
    });
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  const result = new Promise((resolve, reject) => pendingSaves.push({ resolve, reject }));
  persistTimer = setTimeout(() => { void flushPersist().catch(reportError); }, 250);
  return result;
}

async function flushPersist() {
  clearTimeout(persistTimer);
  persistTimer = null;
  if (!pendingSaves.length) return writeQueue;
  const waiters = pendingSaves.splice(0);
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  const operation = writeQueue.then(() => atomicWrite(serialized));
  writeQueue = operation.catch(() => {});
  operation.then(
    () => waiters.forEach(waiter => waiter.resolve()),
    error => waiters.forEach(waiter => waiter.reject(error)),
  );
  return operation;
}

function persistWindow() {
  void schedulePersist().catch(reportError);
}

function emitState() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('corner-note:state', publicState());
  }
}

function activeDisplay() {
  return selectDisplay(screen.getAllDisplays(), state.window.expandedBounds, state.window.displayId);
}

function keepOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // moveTop changes z-order without activating the note or stealing Alt-Tab focus.
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  if (mainWindow.isVisible()) mainWindow.moveTop();
}

function setWindowBounds(bounds, folded) {
  applyingBounds = true;
  try {
    mainWindow.setMinimumSize(1, 1);
    mainWindow.setResizable(!folded);
    mainWindow.setBounds(bounds);
    if (!folded) {
      const minimum = fitSize(MIN_SIZE, activeDisplay().workArea, { width: 1, height: 1 });
      mainWindow.setMinimumSize(minimum.width, minimum.height);
    }
  } finally {
    applyingBounds = false;
  }
  keepOnTop();
}

function captureWindowBounds() {
  if (applyingBounds || !mainWindow || mainWindow.isDestroyed() || state.window.folded) return;
  state.window.expandedBounds = mainWindow.getBounds();
  state.window.displayId = screen.getDisplayMatching(state.window.expandedBounds).id;
  persistWindow();
}

function foldWindow(corner) {
  if (!validCorner(corner)) throw new TypeError('올바른 모서리를 선택해 주세요.');
  if (!state.window.folded) {
    state.window.expandedBounds = mainWindow.getBounds();
    state.window.displayId = screen.getDisplayMatching(state.window.expandedBounds).id;
  }
  state.window.corner = corner;
  state.window.folded = true;
  setWindowBounds(cornerBounds(activeDisplay().workArea, corner, FOLDED_SIZE), true);
  persistWindow();
  emitState();
  return publicState();
}

function unfoldWindow() {
  if (state.window.folded) {
    const display = activeDisplay();
    const size = fitSize(state.window.expandedBounds, display.workArea);
    const bounds = cornerBounds(display.workArea, state.window.corner, size);
    state.window.folded = false;
    state.window.displayId = display.id;
    state.window.expandedBounds = bounds;
    setWindowBounds(bounds, false);
    persistWindow();
    emitState();
  }
  return publicState();
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  unfoldWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  keepOnTop();
  mainWindow.focus();
}

function reconcileDisplays() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = activeDisplay();
  state.window.displayId = display.id;
  if (state.window.folded) {
    setWindowBounds(cornerBounds(display.workArea, state.window.corner), true);
  } else {
    const bounds = clampBounds(mainWindow.getBounds(), display.workArea);
    state.window.expandedBounds = bounds;
    setWindowBounds(bounds, false);
  }
  persistWindow();
}

async function finishQuit() {
  if (quitPending || quitReady) return;
  quitPending = true;
  try {
    captureWindowBounds();
    const finalSave = schedulePersist();
    await Promise.all([flushPersist(), finalSave]);
    quitReady = true;
    app.quit();
  } catch (error) {
    quitPending = false;
    throw error;
  }
}

function quitFromMenu() {
  void finishQuit().catch(error => {
    reportError(error);
    dialog.showErrorBox('메모를 저장할 수 없습니다', '메모가 아직 저장되지 않아 앱을 열어 두었습니다. 저장 폴더의 권한과 여유 공간을 확인해 주세요.');
  });
}

function registerIpc() {
  const handle = (channel, callback) => ipcMain.handle(`corner-note:${channel}`, (event, argument) => {
    if (!mainWindow || event.sender !== mainWindow.webContents
      || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('허용되지 않은 요청입니다.');
    }
    return callback(argument);
  });
  handle('get-state', publicState);
  handle('save-note', async note => {
    if (!note || typeof note.text !== 'string' || note.text.length > MAX_TEXT_LENGTH || !COLORS.has(note.color)) {
      throw new TypeError('저장할 메모나 색상이 올바르지 않습니다.');
    }
    state.text = note.text;
    state.color = note.color;
    state.savedAt = new Date().toISOString();
    const savedAt = state.savedAt;
    await schedulePersist();
    return { savedAt };
  });
  handle('fold', options => foldWindow(options?.corner));
  handle('unfold', unfoldWindow);
  handle('hide', () => { mainWindow.hide(); });
  handle('quit', finishQuit);
}

async function createWindow() {
  const display = activeDisplay();
  state.window.displayId = display.id;
  const expanded = state.window.expandedBounds;
  state.window.expandedBounds = Number.isFinite(expanded.x) && Number.isFinite(expanded.y)
    ? clampBounds(expanded, display.workArea)
    : cornerBounds(display.workArea, state.window.corner, fitSize(expanded, display.workArea));
  const bounds = state.window.folded
    ? cornerBounds(display.workArea, state.window.corner)
    : state.window.expandedBounds;
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: state.window.folded ? 1 : Math.min(MIN_SIZE.width, display.workArea.width),
    minHeight: state.window.folded ? 1 : Math.min(MIN_SIZE.height, display.workArea.height),
    title: '모서리 메모', icon: iconPath,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: true, show: false, alwaysOnTop: true, skipTaskbar: true,
    resizable: !state.window.folded, maximizable: false, fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform !== 'win32') mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-redirect', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.on('close', event => {
    if (!quitReady) {
      event.preventDefault();
      captureWindowBounds();
      mainWindow.hide();
      void flushPersist().catch(reportError);
    }
  });
  mainWindow.on('move', captureWindowBounds);
  mainWindow.on('resize', captureWindowBounds);
  mainWindow.on('blur', () => setImmediate(keepOnTop));
  mainWindow.on('show', keepOnTop);
  mainWindow.on('restore', keepOnTop);
  mainWindow.once('ready-to-show', () => { mainWindow.show(); keepOnTop(); });
  registerIpc();
  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip('모서리 메모 — 항상 화면 위에');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '메모 펼치기', click: showWindow },
    { label: '메모 숨기기', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: '종료', click: quitFromMenu },
  ]));
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

async function smokeTest() {
  const assert = require('node:assert/strict');
  assert.equal(mainWindow.isAlwaysOnTop(), true);
  assert.equal(mainWindow.webContents.getLastWebPreferences().sandbox, true);
  const originalSize = { width: mainWindow.getBounds().width, height: mainWindow.getBounds().height };
  foldWindow('bottom-right');
  assert.equal(state.window.folded, true);
  assert.deepEqual(mainWindow.getBounds(), cornerBounds(activeDisplay().workArea, 'bottom-right'));
  unfoldWindow();
  assert.equal(state.window.folded, false);
  assert.equal(mainWindow.getBounds().width, originalSize.width);
  assert.equal(mainWindow.getBounds().height, originalSize.height);
  const bridgeAvailable = await mainWindow.webContents.executeJavaScript('typeof window.cornerNote?.getState === "function"');
  assert.equal(bridgeAvailable, true);
  console.log(JSON.stringify({
    smokeTest: 'passed', alwaysOnTop: true, sandboxConfigured: true,
    runtimeSandboxDisabled: app.commandLine.hasSwitch('no-sandbox'), foldAndUnfold: true,
  }));
  await finishQuit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', event => {
    if (!quitReady) {
      event.preventDefault();
      quitFromMenu();
    }
  });
  app.on('will-quit', () => {
    clearTimeout(persistTimer);
    if (tray) tray.destroy();
  });
  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.cornernote.app');
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    await loadState();
    await createWindow();
    createTray();
    screen.on('display-added', reconcileDisplays);
    screen.on('display-removed', reconcileDisplays);
    screen.on('display-metrics-changed', reconcileDisplays);
    if (process.argv.includes('--smoke-test')) await smokeTest();
  }).catch(error => {
    reportError(error);
    quitReady = true;
    app.exit(1);
  });
}
