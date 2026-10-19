'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, dialog, session } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  EDGES, DEFAULT_SIZE, MIN_SIZE, FOLDED_SIZE, validCorner, fitSize, clampBounds, cornerBounds,
  unfoldBounds, moveBounds, resizeBounds, selectDisplay,
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
let interaction;
let state = {
  version: 1, text: '', color: 'butter', savedAt: null,
  window: {
    folded: false, corner: 'top-right', expandedBounds: { ...DEFAULT_SIZE },
    foldedBounds: null, displayId: null, alwaysOnTop: true,
  },
};

function publicState() {
  return {
    text: state.text, color: state.color,
    folded: state.window.folded, corner: state.window.corner, savedAt: state.savedAt,
    alwaysOnTop: state.window.alwaysOnTop,
    bounds: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null,
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
        foldedBounds: windowState.foldedBounds && typeof windowState.foldedBounds === 'object'
          && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(windowState.foldedBounds[key]))
          && windowState.foldedBounds.width > 0 && windowState.foldedBounds.height > 0
          ? windowState.foldedBounds : null,
        alwaysOnTop: windowState.alwaysOnTop !== false,
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
  const bounds = state.window.folded ? state.window.foldedBounds || state.window.expandedBounds : state.window.expandedBounds;
  return selectDisplay(screen.getAllDisplays(), bounds, state.window.displayId);
}

function keepOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // moveTop changes z-order without activating the note or stealing Alt-Tab focus.
  mainWindow.setAlwaysOnTop(state.window.alwaysOnTop, state.window.alwaysOnTop ? 'screen-saver' : 'normal');
  if (state.window.alwaysOnTop && mainWindow.isVisible()) mainWindow.moveTop();
}

function setWindowBounds(bounds, folded) {
  applyingBounds = true;
  try {
    mainWindow.setMinimumSize(1, 1);
    // Native resize borders steal the diagonal fold gestures on Windows.
    // The renderer exposes only side strips and validates resizing through IPC.
    mainWindow.setResizable(false);
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
  if (applyingBounds || !mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  if (state.window.folded) state.window.foldedBounds = bounds;
  else state.window.expandedBounds = bounds;
  state.window.displayId = screen.getDisplayMatching(bounds).id;
  persistWindow();
}

function foldWindow(corner) {
  if (!validCorner(corner)) throw new TypeError('올바른 모서리를 선택해 주세요.');
  interaction = null;
  if (!state.window.folded) {
    state.window.expandedBounds = mainWindow.getBounds();
    state.window.displayId = screen.getDisplayMatching(state.window.expandedBounds).id;
  }
  state.window.corner = corner;
  state.window.folded = true;
  state.window.foldedBounds = cornerBounds(activeDisplay().workArea, corner, FOLDED_SIZE);
  setWindowBounds(state.window.foldedBounds, true);
  persistWindow();
  emitState();
  return publicState();
}

function unfoldWindow() {
  if (state.window.folded) {
    interaction = null;
    const display = activeDisplay();
    const bounds = unfoldBounds(mainWindow.getBounds(), state.window.corner, state.window.expandedBounds, display.workArea);
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
  interaction = null;
  const display = activeDisplay();
  state.window.displayId = display.id;
  if (state.window.folded) {
    state.window.foldedBounds = clampBounds(mainWindow.getBounds(), display.workArea, { width: 1, height: 1 });
    setWindowBounds(state.window.foldedBounds, true);
  } else {
    const bounds = clampBounds(mainWindow.getBounds(), display.workArea);
    state.window.expandedBounds = bounds;
    setWindowBounds(bounds, false);
  }
  persistWindow();
  emitState();
}

function validatePointer(options) {
  if (!options || !Number.isFinite(options.screenX) || !Number.isFinite(options.screenY)
    || Math.abs(options.screenX) > 1_000_000 || Math.abs(options.screenY) > 1_000_000) {
    throw new TypeError('올바른 마우스 좌표가 필요합니다.');
  }
}

function beginInteraction(options) {
  validatePointer(options);
  if (interaction) throw new Error('진행 중인 창 이동을 먼저 끝내 주세요.');
  if (options.kind !== 'resize' && options.kind !== 'move-folded') throw new TypeError('올바른 창 동작이 필요합니다.');
  if (options.kind === 'resize' && (state.window.folded || !EDGES.includes(options.edge))) {
    throw new TypeError('펼친 메모의 변을 선택해 주세요.');
  }
  if (options.kind === 'move-folded' && !state.window.folded) throw new TypeError('접힌 메모만 이 방식으로 옮길 수 있습니다.');
  interaction = {
    id: randomUUID(), kind: options.kind, edge: options.edge,
    screenX: options.screenX, screenY: options.screenY,
    bounds: mainWindow.getBounds(), displayId: state.window.displayId,
    workArea: { ...activeDisplay().workArea },
  };
  return interaction.id;
}

function requireInteraction(options) {
  if (!interaction || typeof options?.id !== 'string' || options.id !== interaction.id) {
    throw new Error('진행 중인 창 동작이 아닙니다.');
  }
  return interaction;
}

function updateInteraction(options) {
  const current = requireInteraction(options);
  validatePointer(options);
  const deltaX = options.screenX - current.screenX;
  const deltaY = options.screenY - current.screenY;
  let bounds;
  let display;
  if (current.kind === 'resize') {
    bounds = resizeBounds(current.bounds, current.edge,
      current.edge === 'left' || current.edge === 'right' ? deltaX : deltaY, current.workArea);
    display = screen.getDisplayMatching(bounds);
  } else {
    const proposed = { ...current.bounds, x: current.bounds.x + deltaX, y: current.bounds.y + deltaY };
    display = selectDisplay(screen.getAllDisplays(), proposed);
    bounds = moveBounds(current.bounds, deltaX, deltaY, display.workArea);
  }
  if (state.window.folded) state.window.foldedBounds = bounds;
  else state.window.expandedBounds = bounds;
  state.window.displayId = display.id;
  setWindowBounds(bounds, state.window.folded);
  persistWindow();
  return mainWindow.getBounds();
}

function endInteraction(options) {
  const current = requireInteraction(options);
  if (options.cancel !== undefined && typeof options.cancel !== 'boolean') throw new TypeError('취소 여부가 올바르지 않습니다.');
  interaction = null;
  if (options.cancel === true) {
    state.window.displayId = current.displayId;
    if (state.window.folded) state.window.foldedBounds = current.bounds;
    else state.window.expandedBounds = current.bounds;
    setWindowBounds(current.bounds, state.window.folded);
  }
  captureWindowBounds();
  emitState();
  return publicState();
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
  handle('begin-interaction', beginInteraction);
  handle('update-interaction', updateInteraction);
  handle('end-interaction', endInteraction);
  handle('set-always-on-top', async enabled => {
    if (typeof enabled !== 'boolean') throw new TypeError('항상 위 표시 여부가 올바르지 않습니다.');
    state.window.alwaysOnTop = enabled;
    keepOnTop();
    emitState();
    await schedulePersist();
    return publicState();
  });
  handle('hide', () => { interaction = null; mainWindow.hide(); });
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
    ? (state.window.foldedBounds
      ? clampBounds(state.window.foldedBounds, display.workArea, { width: 1, height: 1 })
      : cornerBounds(display.workArea, state.window.corner))
    : state.window.expandedBounds;
  if (state.window.folded) state.window.foldedBounds = bounds;
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: state.window.folded ? 1 : Math.min(MIN_SIZE.width, display.workArea.width),
    minHeight: state.window.folded ? 1 : Math.min(MIN_SIZE.height, display.workArea.height),
    title: '모서리 메모', icon: iconPath,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: true, show: false, alwaysOnTop: state.window.alwaysOnTop, skipTaskbar: true,
    resizable: false, maximizable: false, fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
    },
  });
  mainWindow.setMenu(null);
  keepOnTop();
  if (process.platform !== 'win32') mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-redirect', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.on('close', event => {
    if (!quitReady) {
      event.preventDefault();
      interaction = null;
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
  tray.setToolTip('모서리 메모');
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
