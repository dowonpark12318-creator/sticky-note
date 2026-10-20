'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, dialog, session, safeStorage, net, clipboard } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { canonicalLanguage, createTranslationService } = require('./translation.cjs');
const { createTranslationKeyStore } = require('./translation-key-store.cjs');
const { COLORS, MAX_TEXT_LENGTH, MAX_NOTES, createEmptyNote, createDefaultState, normalizeState, markNoteActive, orderedNotes, resolveFoldedAnchor } = require('./note-store.cjs');
const {
  EDGES, MIN_SIZE, FOLDED_SIZE, validCorner, fitSize, clampBounds, cornerBounds,
  unfoldBounds, moveBounds, resizeBounds, selectDisplay,
} = require('./window-geometry.cjs');

app.setName('Corner Note');
const dataDirectoryArgument = process.argv.find(argument => argument.startsWith('--user-data-dir='));
if (dataDirectoryArgument) {
  const directory = path.resolve(dataDirectoryArgument.slice('--user-data-dir='.length));
  fs.mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}

const statePath = path.join(app.getPath('userData'), 'note-state.json');
const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
const noteWindows = new Map();
const contextsByWebContents = new Map();
let tray;
let quitReady = false;
let quitPending = false;
let restoringWindows = false;
let persistTimer;
let pendingSaves = [];
let writeQueue = Promise.resolve();
let creationQueue = Promise.resolve();
let writeBlocker;
let translationKeyStore;
let pendingKeyMutations = 0;
let systemLanguage = 'en-US';
let state = createDefaultState();
let tutorialNoteId = state.activeNoteId;

function publicState(context) {
  const note = context.note;
  return {
    noteId: note.id, noteCount: state.notes.length, activeNoteId: state.activeNoteId,
    offerTutorial: note.id === tutorialNoteId,
    text: note.text, color: note.color,
    folded: note.window.folded, corner: note.window.corner, savedAt: note.savedAt,
    alwaysOnTop: state.alwaysOnTop,
    settings: { ...state.settings, translationLanguages: [...state.settings.translationLanguages] },
    systemLanguage,
    bounds: !context.window.isDestroyed() ? context.window.getBounds() : null,
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
    state = normalizeState(JSON.parse(raw));
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

function emitState(context) {
  if (!context.window.isDestroyed() && !context.window.webContents.isDestroyed()) {
    context.window.webContents.send('corner-note:state', publicState(context));
  }
}

function emitAllStates() {
  for (const context of noteWindows.values()) emitState(context);
}

function activeDisplay(context) {
  const windowState = context.note.window;
  const bounds = windowState.folded ? windowState.foldedBounds || windowState.expandedBounds : windowState.expandedBounds;
  return selectDisplay(screen.getAllDisplays(), bounds, windowState.displayId);
}

function applyWindowLayer(context) {
  const window = context.window;
  if (window.isDestroyed()) return;
  if (context.lastSkipTaskbar !== state.alwaysOnTop) {
    window.setSkipTaskbar(state.alwaysOnTop);
    context.lastSkipTaskbar = state.alwaysOnTop;
  }
  if (context.lastAlwaysOnTop !== state.alwaysOnTop || window.isAlwaysOnTop() !== state.alwaysOnTop) {
    window.setAlwaysOnTop(state.alwaysOnTop, state.alwaysOnTop ? 'screen-saver' : 'normal');
    context.lastAlwaysOnTop = state.alwaysOnTop;
  }
}

function activateNote(context, { forceRaise = false } = {}) {
  if (!context || context.window.isDestroyed()) return;
  if (restoringWindows) return publicState(context);
  const changed = markNoteActive(state, context.note.id);
  if ((changed || forceRaise) && context.window.isVisible()) {
    // moveTop preserves keyboard focus; only the note being interacted with is raised.
    context.window.moveTop();
  }
  if (changed) {
    persistWindow();
    emitAllStates();
  }
  return publicState(context);
}

function setWindowBounds(context, bounds, folded) {
  const window = context.window;
  context.applyingBounds = true;
  try {
    window.setMinimumSize(1, 1);
    // Native resize borders steal the diagonal fold gestures on Windows.
    window.setResizable(false);
    window.setBounds(bounds);
    if (!folded) {
      const minimum = fitSize(MIN_SIZE, activeDisplay(context).workArea, { width: 1, height: 1 });
      window.setMinimumSize(minimum.width, minimum.height);
    }
  } finally {
    context.applyingBounds = false;
  }
  applyWindowLayer(context);
}

function captureWindowBounds(context) {
  if (context.applyingBounds || context.window.isDestroyed()) return;
  const bounds = context.window.getBounds();
  if (context.note.window.folded) context.note.window.foldedBounds = bounds;
  else context.note.window.expandedBounds = bounds;
  context.note.window.displayId = screen.getDisplayMatching(bounds).id;
  persistWindow();
}

function foldWindow(context, corner) {
  if (!validCorner(corner)) throw new TypeError('올바른 모서리를 선택해 주세요.');
  const note = context.note;
  context.interaction = null;
  if (!note.window.folded) {
    note.window.expandedBounds = context.window.getBounds();
    note.window.displayId = screen.getDisplayMatching(note.window.expandedBounds).id;
  }
  note.window.corner = corner;
  note.window.folded = true;
  const display = activeDisplay(context);
  note.window.foldedBounds = cornerBounds(display.workArea, corner, FOLDED_SIZE);
  note.window.foldedAnchorBounds = { ...note.window.foldedBounds };
  note.window.foldedAnchorDisplayId = display.id;
  setWindowBounds(context, note.window.foldedBounds, true);
  activateNote(context);
  persistWindow();
  emitState(context);
  updateTrayMenu();
  return publicState(context);
}

function returnFoldedNote(context) {
  const note = context.note;
  if (!note.window.folded) return publicState(context);
  context.interaction = null;
  const anchor = resolveFoldedAnchor(note.window, screen.getAllDisplays());
  note.window.foldedAnchorBounds = { ...anchor.bounds };
  note.window.foldedAnchorDisplayId = anchor.displayId;
  note.window.foldedBounds = { ...anchor.bounds };
  note.window.displayId = anchor.displayId;
  setWindowBounds(context, note.window.foldedBounds, true);
  activateNote(context);
  persistWindow();
  emitState(context);
  return publicState(context);
}

function unfoldWindow(context) {
  const note = context.note;
  if (note.window.folded) {
    context.interaction = null;
    const display = activeDisplay(context);
    const bounds = unfoldBounds(context.window.getBounds(), note.window.corner, note.window.expandedBounds, display.workArea);
    note.window.folded = false;
    note.window.displayId = display.id;
    note.window.expandedBounds = bounds;
    setWindowBounds(context, bounds, false);
    activateNote(context);
    persistWindow();
    emitState(context);
    updateTrayMenu();
  }
  return publicState(context);
}

function hideNote(context) {
  context.interaction = null;
  context.translationService.cancelCurrent();
  captureWindowBounds(context);
  context.window.hide();
  updateTrayMenu();
}

async function showNote(note) {
  let context = noteWindows.get(note.id);
  if (!context || context.window.isDestroyed()) context = await createWindow(note);
  unfoldWindow(context);
  if (context.window.isMinimized()) context.window.restore();
  context.window.show();
  applyWindowLayer(context);
  activateNote(context, { forceRaise: true });
  context.window.focus();
  updateTrayMenu();
}

function showAllNotes() {
  // Hidden notes are intentionally shown again on restart or tray activation.
  // Their folded state and the saved order are preserved.
  restoringWindows = true;
  try {
    for (const note of orderedNotes(state)) {
      const context = noteWindows.get(note.id);
      if (!context || context.window.isDestroyed()) continue;
      if (context.window.isMinimized()) context.window.restore();
      context.window.showInactive();
      applyWindowLayer(context);
      context.window.moveTop();
    }
  } finally {
    restoringWindows = false;
  }
  const active = noteWindows.get(state.activeNoteId);
  if (active && !active.window.isDestroyed()) {
    active.window.show();
    activateNote(active, { forceRaise: true });
    active.window.focus();
  }
  updateTrayMenu();
}

function reconcileDisplays() {
  for (const context of noteWindows.values()) {
    if (context.window.isDestroyed()) continue;
    context.interaction = null;
    const note = context.note;
    const display = activeDisplay(context);
    note.window.displayId = display.id;
    if (note.window.folded) {
      note.window.foldedBounds = clampBounds(context.window.getBounds(), display.workArea, { width: 1, height: 1 });
      setWindowBounds(context, note.window.foldedBounds, true);
    } else {
      const bounds = clampBounds(context.window.getBounds(), display.workArea);
      note.window.expandedBounds = bounds;
      setWindowBounds(context, bounds, false);
    }
    persistWindow();
    emitState(context);
  }
}

function validatePointer(options) {
  if (!options || !Number.isFinite(options.screenX) || !Number.isFinite(options.screenY)
    || Math.abs(options.screenX) > 1_000_000 || Math.abs(options.screenY) > 1_000_000) {
    throw new TypeError('올바른 마우스 좌표가 필요합니다.');
  }
}

function beginInteraction(context, options) {
  validatePointer(options);
  if (context.interaction) throw new Error('진행 중인 창 이동을 먼저 끝내 주세요.');
  if (options.kind !== 'resize' && options.kind !== 'move-folded') throw new TypeError('올바른 창 동작이 필요합니다.');
  if (options.kind === 'resize' && (context.note.window.folded || !EDGES.includes(options.edge))) {
    throw new TypeError('펼친 메모의 변을 선택해 주세요.');
  }
  if (options.kind === 'move-folded' && !context.note.window.folded) throw new TypeError('접힌 메모만 이 방식으로 옮길 수 있습니다.');
  activateNote(context);
  context.interaction = {
    id: randomUUID(), kind: options.kind, edge: options.edge,
    screenX: options.screenX, screenY: options.screenY,
    bounds: context.window.getBounds(), displayId: context.note.window.displayId,
    workArea: { ...activeDisplay(context).workArea },
  };
  return context.interaction.id;
}

function requireInteraction(context, options) {
  if (!context.interaction || typeof options?.id !== 'string' || options.id !== context.interaction.id) {
    throw new Error('진행 중인 창 동작이 아닙니다.');
  }
  return context.interaction;
}

function updateInteraction(context, options) {
  const current = requireInteraction(context, options);
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
  if (context.note.window.folded) context.note.window.foldedBounds = bounds;
  else context.note.window.expandedBounds = bounds;
  context.note.window.displayId = display.id;
  setWindowBounds(context, bounds, context.note.window.folded);
  persistWindow();
  return context.window.getBounds();
}

function endInteraction(context, options) {
  const current = requireInteraction(context, options);
  if (options.cancel !== undefined && typeof options.cancel !== 'boolean') throw new TypeError('취소 여부가 올바르지 않습니다.');
  context.interaction = null;
  if (options.cancel === true) {
    context.note.window.displayId = current.displayId;
    if (context.note.window.folded) context.note.window.foldedBounds = current.bounds;
    else context.note.window.expandedBounds = current.bounds;
    setWindowBounds(context, current.bounds, context.note.window.folded);
  }
  captureWindowBounds(context);
  emitState(context);
  return publicState(context);
}

function cancelAllTranslations() {
  for (const context of noteWindows.values()) context.translationService.cancelCurrent();
}

async function mutateTranslationKey(operation) {
  pendingKeyMutations += 1;
  cancelAllTranslations();
  try {
    return await operation();
  } finally {
    // No sibling request may survive a key change or use an old key during it.
    cancelAllTranslations();
    pendingKeyMutations -= 1;
  }
}

async function finishQuit() {
  if (quitPending || quitReady) return;
  quitPending = true;
  cancelAllTranslations();
  try {
    // Wait for an in-progress addition so its record cannot race the final save.
    await creationQueue;
    for (const context of noteWindows.values()) captureWindowBounds(context);
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

function createNote(source) {
  const operation = creationQueue.then(async () => {
    if (quitPending || quitReady) throw new Error('앱을 종료하고 있습니다.');
    if (state.notes.length >= MAX_NOTES) throw new Error('메모를 더 만들 수 없습니다.');
    const origin = source && !source.window.isDestroyed() ? source : noteWindows.get(state.activeNoteId);
    const display = origin ? activeDisplay(origin) : screen.getPrimaryDisplay();
    const sourceBounds = origin?.window.getBounds();
    const size = origin?.note.window.expandedBounds;
    const deltaX = sourceBounds && sourceBounds.x + 28 + size.width > display.workArea.x + display.workArea.width ? -28 : 28;
    const deltaY = sourceBounds && sourceBounds.y + 28 + size.height > display.workArea.y + display.workArea.height ? -28 : 28;
    const bounds = sourceBounds ? clampBounds({
      x: sourceBounds.x + deltaX, y: sourceBounds.y + deltaY, width: size.width, height: size.height,
    }, display.workArea) : undefined;
    const note = createEmptyNote({ expandedBounds: bounds });
    note.window.displayId = display.id;
    state.notes.push(note);
    const priorActiveId = state.activeNoteId;
    markNoteActive(state, note.id);
    let context;
    try {
      context = await createWindow(note);
      const saved = schedulePersist();
      await Promise.all([flushPersist(), saved]);
      context.window.show();
      activateNote(context, { forceRaise: true });
      context.window.focus();
      emitAllStates();
      updateTrayMenu();
      return publicState(context);
    } catch (error) {
      if (context && !context.window.isDestroyed()) context.window.destroy();
      state.notes = state.notes.filter(item => item.id !== note.id);
      state.noteOrder = state.noteOrder.filter(id => id !== note.id);
      if (state.activeNoteId === note.id) {
        state.activeNoteId = state.notes.some(item => item.id === priorActiveId) ? priorActiveId : state.noteOrder.at(-1);
      }
      emitAllStates();
      updateTrayMenu();
      throw error;
    }
  });
  creationQueue = operation.catch(() => {});
  return operation;
}

function registerIpc() {
  const handle = (channel, callback) => ipcMain.handle(`corner-note:${channel}`, (event, argument) => {
    const context = contextsByWebContents.get(event.sender.id);
    if (!context || context.window.isDestroyed() || event.sender !== context.window.webContents
      || event.senderFrame !== context.window.webContents.mainFrame) {
      throw new Error('허용되지 않은 요청입니다.');
    }
    // Window identity comes exclusively from the authenticated sender, never IPC data.
    return callback(context, argument);
  });
  handle('get-state', publicState);
  handle('create-note', createNote);
  handle('activate-note', context => activateNote(context));
  handle('save-note', async (context, note) => {
    if (!note || typeof note.text !== 'string' || note.text.length > MAX_TEXT_LENGTH || !COLORS.has(note.color)) {
      throw new TypeError('저장할 메모나 색상이 올바르지 않습니다.');
    }
    context.note.text = note.text;
    context.note.color = note.color;
    context.note.savedAt = new Date().toISOString();
    const savedAt = context.note.savedAt;
    // Autosave can arrive after another note was clicked. Activation is driven
    // by native focus and the renderer's immediate pointer/input events instead.
    updateTrayMenu();
    await schedulePersist();
    return { savedAt };
  });
  handle('fold', (context, options) => foldWindow(context, options?.corner));
  handle('return-folded-note', returnFoldedNote);
  handle('unfold', unfoldWindow);
  handle('begin-interaction', beginInteraction);
  handle('update-interaction', updateInteraction);
  handle('end-interaction', endInteraction);
  handle('set-always-on-top', async (context, enabled) => {
    if (typeof enabled !== 'boolean') throw new TypeError('항상 위 표시 여부가 올바르지 않습니다.');
    state.alwaysOnTop = enabled;
    activateNote(context);
    for (const note of orderedNotes(state)) {
      const sibling = noteWindows.get(note.id);
      if (sibling) applyWindowLayer(sibling);
    }
    activateNote(context, { forceRaise: true });
    emitAllStates();
    await schedulePersist();
    return publicState(context);
  });
  handle('update-preferences', async (context, preferences) => {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      throw new TypeError('앱 설정이 올바르지 않습니다.');
    }
    const next = { ...state.settings };
    if (preferences.translationLanguages !== undefined) {
      if (!Array.isArray(preferences.translationLanguages) || preferences.translationLanguages.length > 30) {
        throw new TypeError('추가 언어는 최대 30개까지 저장할 수 있습니다.');
      }
      next.translationLanguages = [...new Set(preferences.translationLanguages.map(canonicalLanguage))];
    }
    if (preferences.tutorialCompleted !== undefined) {
      if (typeof preferences.tutorialCompleted !== 'boolean') throw new TypeError('튜토리얼 설정이 올바르지 않습니다.');
      next.tutorialCompleted = preferences.tutorialCompleted;
    }
    state.settings = next;
    emitAllStates();
    await schedulePersist();
    return publicState(context);
  });
  handle('get-translation-settings', () => translationKeyStore.status());
  handle('set-translation-key', (_context, options) => mutateTranslationKey(() => translationKeyStore.setKey(options)));
  handle('clear-translation-key', () => mutateTranslationKey(() => translationKeyStore.clear()));
  handle('translate', (context, options) => {
    if (pendingKeyMutations) throw new Error('API 키 설정을 저장하고 있습니다. 잠시 후 다시 시도해 주세요.');
    return context.translationService.translate(options);
  });
  handle('cancel-translation', (context, requestId) => context.translationService.cancel(requestId));
  handle('copy-text', (_context, text) => {
    if (typeof text !== 'string' || text.length > 65_536) throw new TypeError('복사할 글의 양이 너무 많거나 올바르지 않습니다.');
    clipboard.writeText(text);
  });
  handle('hide', hideNote);
  handle('quit', finishQuit);
}

async function createWindow(note) {
  const context = { note, applyingBounds: false, interaction: null };
  const display = activeDisplay(context);
  note.window.displayId = display.id;
  const expanded = note.window.expandedBounds;
  note.window.expandedBounds = Number.isFinite(expanded.x) && Number.isFinite(expanded.y)
    ? clampBounds(expanded, display.workArea)
    : cornerBounds(display.workArea, note.window.corner, fitSize(expanded, display.workArea));
  const bounds = note.window.folded
    ? (note.window.foldedBounds
      ? clampBounds(note.window.foldedBounds, display.workArea, { width: 1, height: 1 })
      : cornerBounds(display.workArea, note.window.corner))
    : note.window.expandedBounds;
  if (note.window.folded) {
    note.window.foldedBounds = bounds;
    const anchor = resolveFoldedAnchor(note.window, screen.getAllDisplays());
    note.window.foldedAnchorBounds = { ...anchor.bounds };
    note.window.foldedAnchorDisplayId = anchor.displayId;
  }
  const window = new BrowserWindow({
    ...bounds,
    minWidth: note.window.folded ? 1 : Math.min(MIN_SIZE.width, display.workArea.width),
    minHeight: note.window.folded ? 1 : Math.min(MIN_SIZE.height, display.workArea.height),
    title: '모서리 메모', icon: iconPath,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: true, show: false, alwaysOnTop: state.alwaysOnTop, skipTaskbar: state.alwaysOnTop,
    resizable: false, maximizable: false, fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
    },
  });
  context.window = window;
  context.lastSkipTaskbar = state.alwaysOnTop;
  context.translationService = createTranslationService({ fetch: (url, options) => net.fetch(url, options), getKey: translationKeyStore.getKey });
  noteWindows.set(note.id, context);
  contextsByWebContents.set(window.webContents.id, context);
  window.setMenu(null);
  applyWindowLayer(context);
  if (process.platform !== 'win32') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('close', event => {
    if (!quitReady) {
      event.preventDefault();
      hideNote(context);
      void flushPersist().catch(reportError);
    }
  });
  context.webContentsId = window.webContents.id;
  window.on('closed', () => {
    context.translationService.cancelCurrent();
    contextsByWebContents.delete(context.webContentsId);
    if (noteWindows.get(note.id) === context) noteWindows.delete(note.id);
    updateTrayMenu();
  });
  window.on('move', () => captureWindowBounds(context));
  window.on('resize', () => captureWindowBounds(context));
  window.on('focus', () => activateNote(context));
  window.on('blur', () => setImmediate(() => {
    // Reassert only an unexpectedly lost topmost flag. Never raise a blurred sibling.
    if (!window.isDestroyed() && state.alwaysOnTop && !window.isAlwaysOnTop()) applyWindowLayer(context);
  }));
  window.on('show', () => applyWindowLayer(context));
  window.on('restore', () => applyWindowLayer(context));
  try {
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  } catch (error) {
    window.destroy();
    throw error;
  }
  return context;
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const notes = state.notes.map((note, index) => {
    const context = noteWindows.get(note.id);
    const preview = note.text.replace(/\s+/g, ' ').trim().slice(0, 28) || '빈 메모';
    const marker = context && !context.window.isDestroyed() && context.window.isVisible() ? '' : ' · 숨김';
    return { label: `${index + 1}. ${preview}${marker}`, click: () => { void showNote(note).catch(reportError); } };
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '새 메모', click: () => { void createNote(noteWindows.get(state.activeNoteId)).catch(reportError); } },
    { label: '모든 메모 보기', click: showAllNotes },
    { label: '메모 선택', submenu: notes },
    { label: '모든 메모 숨기기', click: () => { for (const context of noteWindows.values()) hideNote(context); } },
    { type: 'separator' },
    { label: '종료', click: quitFromMenu },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip('모서리 메모');
  updateTrayMenu();
  tray.on('click', showAllNotes);
  tray.on('double-click', showAllNotes);
}

async function smokeTest() {
  const assert = require('node:assert/strict');
  const context = noteWindows.get(state.activeNoteId);
  const window = context.window;
  assert.equal(window.isAlwaysOnTop(), true);
  assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
  const originalSize = { width: window.getBounds().width, height: window.getBounds().height };
  foldWindow(context, 'bottom-right');
  assert.equal(context.note.window.folded, true);
  assert.deepEqual(window.getBounds(), cornerBounds(activeDisplay(context).workArea, 'bottom-right'));
  unfoldWindow(context);
  assert.equal(context.note.window.folded, false);
  assert.equal(window.getBounds().width, originalSize.width);
  assert.equal(window.getBounds().height, originalSize.height);
  assert.equal(await window.webContents.executeJavaScript('typeof window.cornerNote?.createNote === "function"'), true);
  console.log(JSON.stringify({
    smokeTest: 'passed', alwaysOnTop: true, sandboxConfigured: true,
    runtimeSandboxDisabled: app.commandLine.hasSwitch('no-sandbox'), foldAndUnfold: true,
  }));
  await finishQuit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showAllNotes);
  app.on('activate', showAllNotes);
  app.on('before-quit', event => {
    if (!quitReady) {
      event.preventDefault();
      quitFromMenu();
    }
  });
  app.on('will-quit', () => {
    clearTimeout(persistTimer);
    cancelAllTranslations();
    if (tray) tray.destroy();
  });
  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.cornernote.app');
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    await loadState();
    tutorialNoteId = state.activeNoteId;
    try {
      systemLanguage = canonicalLanguage(app.getPreferredSystemLanguages()[0] || app.getLocale());
    } catch {
      try { systemLanguage = canonicalLanguage(app.getLocale()); } catch { systemLanguage = 'en-US'; }
    }
    translationKeyStore = createTranslationKeyStore({ safeStorage, filePath: path.join(app.getPath('userData'), 'translation-key.json') });
    await translationKeyStore.load().catch(reportError);
    registerIpc();
    restoringWindows = true;
    for (const note of orderedNotes(state)) await createWindow(note);
    restoringWindows = false;
    createTray();
    showAllNotes();
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
