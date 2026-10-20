(() => {
  'use strict';

  const COLORS = ['butter', 'rose', 'mint', 'sky'];
  const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const FOLD_THRESHOLD = 1 / 3;
  const OPPOSITE = { 'top-left': 'bottom-right', 'top-right': 'bottom-left', 'bottom-left': 'top-right', 'bottom-right': 'top-left' };
  const CORNER_LABELS = { 'top-left': '왼쪽 위', 'top-right': '오른쪽 위', 'bottom-left': '왼쪽 아래', 'bottom-right': '오른쪽 아래' };
  const STORAGE_KEY = 'corner-note-v1';
  const app = document.querySelector('#app');
  const note = document.querySelector('#note');
  const textarea = document.querySelector('#note-text');
  const foldedNote = document.querySelector('#folded-note');
  const helpPanel = document.querySelector('#help-panel');
  const helpButton = document.querySelector('#help-button');
  const addNoteButton = document.querySelector('#add-note-button');
  const pinButton = document.querySelector('#always-on-top-button');
  const pinLabel = document.querySelector('#pin-label');
  const unfoldHandle = document.querySelector('#unfold-handle');
  const saveStatus = document.querySelector('#save-status');
  const saveLabel = document.querySelector('#save-label');
  const characterCount = document.querySelector('#character-count');
  const gestureHint = document.querySelector('#gesture-hint');
  const gestureLabel = document.querySelector('#gesture-label');
  const gestureProgress = document.querySelector('#gesture-progress');
  const foldPreview = document.querySelector('#fold-preview');
  const toast = document.querySelector('#toast');
  let state = normalizeState({});
  let ready = false;
  let composing = false;
  let editVersion = 0;
  let persistedVersion = 0;
  let queuedVersion = -1;
  let toastTimer;
  let saveQueue = Promise.resolve(true);
  let activeGesture = null;
  let activeInteraction = null;
  let actionBusy = false;
  let pinBusy = false;
  let creatingNote = false;

  function normalizeState(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      text: typeof source.text === 'string' ? source.text : '',
      color: COLORS.includes(source.color) ? source.color : 'butter',
      corner: CORNERS.includes(source.corner) ? source.corner : 'top-right',
      folded: source.folded === true,
      alwaysOnTop: source.alwaysOnTop !== false,
      settings: {
        translationLanguages: Array.isArray(source.settings?.translationLanguages)
          ? source.settings.translationLanguages.filter((code) => typeof code === 'string') : [],
        tutorialCompleted: source.settings?.tutorialCompleted === true,
      },
      systemLanguage: typeof source.systemLanguage === 'string' ? source.systemLanguage : navigator.language || 'en',
      bounds: source.bounds && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(source.bounds[key])) ? { ...source.bounds } : null,
      savedAt: source.savedAt || null,
      noteId: typeof source.noteId === 'string' ? source.noteId : '',
      noteCount: Number.isInteger(source.noteCount) && source.noteCount > 0 ? source.noteCount : 1,
    };
  }

  function createBrowserBridge() {
    let browserState;
    let stored;
    let interaction = null;
    let nextInteractionId = 0;
    const listeners = new Set();
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { stored = {}; }
    browserState = normalizeState(stored);
    const limit = (value, min, max) => Math.min(Math.max(value, min), max);
    function clamp(bounds, folded = browserState.folded) {
      const width = limit(bounds.width, Math.min(folded ? 1 : 300, innerWidth), innerWidth);
      const height = limit(bounds.height, Math.min(folded ? 1 : 300, innerHeight), innerHeight);
      return { x: limit(bounds.x, 0, innerWidth - width), y: limit(bounds.y, 0, innerHeight - height), width, height };
    }
    let expandedBounds = clamp(stored?.expandedBounds || { x: 0, y: 0, width: 392, height: 460 }, false);
    browserState.bounds = clamp(browserState.bounds || (browserState.folded ? foldedBounds(browserState.corner) : expandedBounds));
    let foldedAnchorBounds = stored?.foldedAnchorBounds
      && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(stored.foldedAnchorBounds[key]))
      ? clamp(stored.foldedAnchorBounds, true) : browserState.folded ? foldedBounds(browserState.corner) : null;
    function foldedBounds(corner) {
      return clamp({ x: corner.endsWith('right') ? innerWidth - 100 : 12, y: corner.startsWith('bottom') ? innerHeight - 100 : 12, width: 88, height: 88 }, true);
    }
    const emit = () => listeners.forEach((listener) => listener({ ...browserState }));
    const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...browserState, expandedBounds, foldedAnchorBounds }));
    function requireInteraction(id) {
      if (!interaction || interaction.id !== id) throw new Error('The interaction has ended.');
      return interaction;
    }
    return {
      async getState() { return { ...browserState }; },
      async createNote() { throw new Error('새 메모는 Windows 앱에서 만들 수 있어요.'); },
      async activateNote() { return { ...browserState }; },
      async saveNote(value) {
        const next = { ...browserState, text: value.text, color: value.color, savedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, expandedBounds, foldedAnchorBounds }));
        browserState = next;
        emit();
        return { savedAt: browserState.savedAt };
      },
      async fold({ corner }) {
        if (!browserState.folded) expandedBounds = { ...browserState.bounds };
        foldedAnchorBounds = foldedBounds(corner);
        browserState = { ...browserState, corner, folded: true, bounds: { ...foldedAnchorBounds } };
        persist(); emit(); return { ...browserState };
      },
      async returnFoldedNote() {
        if (!browserState.folded) return { ...browserState };
        foldedAnchorBounds = clamp(foldedAnchorBounds || foldedBounds(browserState.corner), true);
        browserState = { ...browserState, bounds: { ...foldedAnchorBounds } };
        persist(); emit(); return { ...browserState };
      },
      async unfold() {
        const folded = browserState.bounds;
        const bounds = clamp({
          ...expandedBounds,
          x: browserState.corner.endsWith('right') ? folded.x + folded.width - expandedBounds.width : folded.x,
          y: browserState.corner.startsWith('bottom') ? folded.y + folded.height - expandedBounds.height : folded.y,
        }, false);
        browserState = { ...browserState, folded: false, bounds };
        persist(); emit(); return { ...browserState };
      },
      async setAlwaysOnTop(value) { browserState = { ...browserState, alwaysOnTop: value === true }; persist(); emit(); return { ...browserState }; },
      async updatePreferences(patch) {
        browserState.settings = {
          ...browserState.settings,
          ...(Array.isArray(patch.translationLanguages) ? { translationLanguages: [...new Set(patch.translationLanguages)] } : {}),
          ...(typeof patch.tutorialCompleted === 'boolean' ? { tutorialCompleted: patch.tutorialCompleted } : {}),
        };
        persist(); emit(); return { ...browserState };
      },
      async getTranslationSettings() { return { configured: false, canRememberKey: false, provider: 'openai', model: 'gpt-4.1-mini' }; },
      async setTranslationKey() { throw new Error('AI 연결은 Windows 앱에서 설정해 주세요.'); },
      async clearTranslationKey() { return { configured: false, canRememberKey: false, provider: 'openai', model: 'gpt-4.1-mini' }; },
      async translate() { throw new Error('AI 번역은 Windows 앱에서 API 키를 연결한 뒤 사용할 수 있어요.'); },
      async cancelTranslation() { return false; },
      async beginInteraction(value) {
        if (interaction) throw new Error('An interaction is already active.');
        interaction = { ...value, id: `browser-${++nextInteractionId}`, bounds: { ...browserState.bounds } };
        return interaction.id;
      },
      async updateInteraction({ id, screenX, screenY }) {
        const current = requireInteraction(id);
        const dx = Math.round(screenX - current.screenX);
        const dy = Math.round(screenY - current.screenY);
        const initial = current.bounds;
        let bounds = { ...initial };
        if (current.kind === 'move-folded') {
          bounds = clamp({ ...initial, x: initial.x + dx, y: initial.y + dy }, true);
        } else if (current.edge === 'left') {
          bounds.x = limit(initial.x + dx, 0, initial.x + initial.width - Math.min(300, innerWidth));
          bounds.width = initial.x + initial.width - bounds.x;
        } else if (current.edge === 'right') {
          bounds.width = limit(initial.width + dx, Math.min(300, innerWidth), innerWidth - initial.x);
        } else if (current.edge === 'top') {
          bounds.y = limit(initial.y + dy, 0, initial.y + initial.height - Math.min(300, innerHeight));
          bounds.height = initial.y + initial.height - bounds.y;
        } else if (current.edge === 'bottom') {
          bounds.height = limit(initial.height + dy, Math.min(300, innerHeight), innerHeight - initial.y);
        }
        browserState.bounds = bounds;
        emit();
        return bounds;
      },
      async endInteraction({ id, cancel = false }) {
        const current = requireInteraction(id);
        if (cancel) browserState.bounds = current.bounds;
        if (!browserState.folded) expandedBounds = { ...browserState.bounds };
        interaction = null;
        persist(); emit(); return { ...browserState };
      },
      async hide() { showToast('Windows 앱에서는 트레이로 숨겨져요.'); },
      async quit() { showToast('브라우저 미리보기에서는 탭을 닫아 주세요.'); },
      onState(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    };
  }

  const bridge = window.cornerNote || createBrowserBridge();
  app.classList.toggle('browser-preview', !window.cornerNote);

  function setStatus(kind, savedAt) {
    saveStatus.dataset.status = kind;
    saveLabel.textContent = { saved: '자동 저장됨', saving: '저장 중…', pending: '수정 중…', error: '저장 실패 · 다시 시도해 주세요' }[kind] || '';
    if (kind === 'saved' && savedAt && Number.isFinite(new Date(savedAt).getTime())) {
      saveStatus.title = `${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(savedAt))}에 저장됨`;
    } else {
      saveStatus.removeAttribute('title');
    }
  }

  function updateCount() {
    characterCount.textContent = `${Array.from(textarea.value).length.toLocaleString('ko-KR')}자`;
  }

  function applyTheme(color) {
    document.body.dataset.color = color;
    document.querySelectorAll('.color-swatch').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.color === color)));
  }

  function applyState(value, initial = false) {
    const next = normalizeState(value);
    const snapshotIsCurrent = !state.savedAt || (next.savedAt && new Date(next.savedAt).getTime() >= new Date(state.savedAt).getTime());
    const canApplyText = initial || (snapshotIsCurrent && editVersion === persistedVersion && !composing && document.activeElement !== textarea);
    const previousFolded = state.folded;
    if (canApplyText) {
      textarea.value = next.text;
      state.text = next.text;
      state.color = next.color;
      applyTheme(next.color);
      updateCount();
    }
    state.folded = next.folded;
    state.corner = next.corner;
    state.alwaysOnTop = next.alwaysOnTop;
    state.settings = next.settings;
    state.systemLanguage = next.systemLanguage;
    state.bounds = next.bounds;
    state.noteId = next.noteId;
    state.noteCount = next.noteCount;
    app.dataset.noteId = next.noteId;
    addNoteButton.title = `새 메모 만들기 · 현재 ${next.noteCount}개`;
    pinButton.setAttribute('aria-pressed', String(next.alwaysOnTop));
    pinLabel.textContent = next.alwaysOnTop ? '항상 위' : '항상 위 꺼짐';
    pinButton.title = next.alwaysOnTop ? '모든 메모의 항상 위 표시 끄기' : '모든 메모의 항상 위 표시 켜기';
    pinButton.setAttribute('aria-label', pinButton.title);
    if (app.classList.contains('browser-preview') && next.bounds) {
      Object.assign(app.style, { left: `${next.bounds.x}px`, top: `${next.bounds.y}px`, width: `${next.bounds.width}px`, height: `${next.bounds.height}px` });
    }
    if (next.savedAt && (!state.savedAt || new Date(next.savedAt).getTime() >= new Date(state.savedAt).getTime())) state.savedAt = next.savedAt;
    app.classList.toggle('is-folded', next.folded);
    app.dataset.corner = next.corner;
    note.hidden = next.folded;
    foldedNote.hidden = !next.folded;
    foldedNote.dataset.corner = next.corner;
    foldedNote.setAttribute('aria-label', `${CORNER_LABELS[next.corner]} 모양으로 접힌 메모: 끌어서 이동, 두 번 클릭하여 처음 접힌 위치로 복귀, Enter로 펼치기`);
    unfoldHandle.setAttribute('aria-label', `${CORNER_LABELS[next.corner]} 모양의 메모 펼치기: 대각선 손잡이를 안쪽으로 끌거나 Enter`);
    if (next.folded) setHelp(false, false);
    if (!initial && previousFolded !== next.folded) {
      if (next.folded) foldedNote.focus({ preventScroll: true });
      else textarea.focus({ preventScroll: true });
    }
    if (editVersion === persistedVersion) setStatus('saved', state.savedAt);
  }

  function markEdited() {
    editVersion += 1;
    state.text = textarea.value;
    updateCount();
    setStatus('pending');
    // Deliver every draft immediately, including IME preedit text. The desktop
    // process batches disk writes, and can safely save its latest draft on Quit.
    persistNow();
  }

  function persistNow() {
    if (!ready || editVersion === persistedVersion) return Promise.resolve(ready);
    if (queuedVersion === editVersion) return saveQueue;
    const version = editVersion;
    const draft = { text: textarea.value, color: state.color };
    queuedVersion = version;
    setStatus('saving');
    let request;
    try { request = bridge.saveNote(draft); }
    catch (error) { request = Promise.reject(error); }
    // Do not serialize IPC delivery behind older disk writes: native tray Quit
    // must already know the latest keystroke while a previous save is in flight.
    saveQueue = Promise.resolve(request).then((result) => {
      if (version >= persistedVersion && result && result.savedAt) state.savedAt = result.savedAt;
      persistedVersion = Math.max(persistedVersion, version);
      if (editVersion === version) setStatus('saved', state.savedAt);
      return true;
    }).catch(() => {
      if (queuedVersion === version) queuedVersion = -1;
      if (editVersion === version) {
        setStatus('error');
        showToast('메모를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      return false;
    });
    return saveQueue;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  }

  async function performAction(method, args) {
    if (!ready || actionBusy) return;
    actionBusy = true;
    try {
      const saved = await persistNow();
      if (!saved) return;
      const result = await bridge[method](args);
      if (result && typeof result.folded === 'boolean') applyState(result);
    } catch {
      showToast('동작을 완료하지 못했어요. 다시 시도해 주세요.');
    } finally { actionBusy = false; }
  }

  function setHelp(open, restoreFocus = true) {
    helpPanel.hidden = !open;
    helpButton.setAttribute('aria-expanded', String(open));
    if (open) document.querySelector('#close-help').focus({ preventScroll: true });
    else if (restoreFocus) helpButton.focus({ preventScroll: true });
  }

  function signsForCorner(corner) {
    return { x: corner.endsWith('left') ? 1 : -1, y: corner.startsWith('top') ? 1 : -1 };
  }

  function startGesture(event, kind, corner) {
    if (!ready || actionBusy || activeGesture || activeInteraction || event.button !== 0) return;
    event.preventDefault();
    if (kind === 'fold') setHelp(false, false);
    const bounds = note.getBoundingClientRect();
    activeGesture = {
      kind, corner, pointerId: event.pointerId, target: event.currentTarget,
      startX: event.screenX, startY: event.screenY, progress: 0,
      width: Math.max(bounds.width - 26, 1), height: Math.max(bounds.height - 26, 1),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (kind === 'fold') {
      app.classList.add('is-folding');
      gestureHint.hidden = false;
      updateFoldPreview(0, corner);
    }
  }

  function updateFoldPreview(progress, corner) {
    const extent = Math.min(progress * 190, 190);
    const polygons = {
      'top-left': `polygon(0 0, ${extent}% 0, 0 ${extent}%)`,
      'top-right': `polygon(100% 0, ${100 - extent}% 0, 100% ${extent}%)`,
      'bottom-left': `polygon(0 100%, 0 ${100 - extent}%, ${extent}% 100%)`,
      'bottom-right': `polygon(100% 100%, ${100 - extent}% 100%, 100% ${100 - extent}%)`,
    };
    foldPreview.style.clipPath = polygons[corner];
    gestureProgress.style.width = `${Math.min(progress / FOLD_THRESHOLD, 1) * 100}%`;
    gestureLabel.textContent = progress >= FOLD_THRESHOLD ? `놓으면 ${CORNER_LABELS[OPPOSITE[corner]]}에 접혀요` : '대각선 거리의 1/3만 당겨 주세요';
  }

  function moveGesture(event) {
    const gesture = activeGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const signs = signsForCorner(gesture.corner);
    const dx = (event.screenX - gesture.startX) * signs.x;
    const dy = (event.screenY - gesture.startY) * signs.y;
    if (gesture.kind === 'fold') {
      gesture.progress = Math.max(0, Math.min(dx / gesture.width, dy / gesture.height, 1));
      updateFoldPreview(gesture.progress, gesture.corner);
    } else {
      gesture.progress = Math.max(0, Math.min(dx, dy) / 55);
      foldedNote.classList.toggle('is-unfolding', gesture.progress > 0.15);
      foldedNote.style.opacity = String(1 - Math.min(gesture.progress, 1) * 0.15);
    }
  }

  function resetGesture() {
    const gesture = activeGesture;
    activeGesture = null;
    app.classList.remove('is-folding');
    foldedNote.classList.remove('is-unfolding');
    foldedNote.style.removeProperty('opacity');
    gestureHint.hidden = true;
    if (gesture && gesture.target.hasPointerCapture(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId);
    return gesture;
  }

  function endGesture(event) {
    if (!activeGesture || activeGesture.pointerId !== event.pointerId) return;
    moveGesture(event);
    const gesture = resetGesture();
    if (gesture.kind === 'fold' && gesture.progress >= FOLD_THRESHOLD) performAction('fold', { corner: OPPOSITE[gesture.corner] });
    if (gesture.kind === 'unfold' && gesture.progress >= 1) performAction('unfold');
  }

  function interactionError(interaction) {
    interaction.failed = true;
    if (activeInteraction === interaction && !interaction.ending) finishInteraction(true);
    showToast('창의 크기나 위치를 변경하지 못했어요. 다시 시도해 주세요.');
  }

  function startInteraction(event, kind, edge) {
    if (!ready || actionBusy || activeGesture || activeInteraction || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const interaction = { pointerId: event.pointerId, target: event.currentTarget, kind, id: null, failed: false, ending: false };
    activeInteraction = interaction;
    interaction.target.setPointerCapture(event.pointerId);
    interaction.target.classList.add('is-active');
    app.classList.add('is-interacting');
    if (kind === 'move-folded') foldedNote.classList.add('is-moving');
    interaction.chain = Promise.resolve().then(() => bridge.beginInteraction({ kind, edge, screenX: event.screenX, screenY: event.screenY }))
      .then((id) => { interaction.id = id; }).catch(() => interactionError(interaction));
  }

  function moveInteraction(event) {
    const interaction = activeInteraction;
    if (!interaction || interaction.ending || interaction.failed || interaction.pointerId !== event.pointerId) return;
    const position = { screenX: event.screenX, screenY: event.screenY };
    interaction.chain = interaction.chain.then(() => {
      if (interaction.failed) return;
      return bridge.updateInteraction({ id: interaction.id, ...position });
    }).catch(() => interactionError(interaction));
  }

  function finishInteraction(cancel = false, event) {
    const interaction = activeInteraction;
    if (!interaction || interaction.ending || (event && interaction.pointerId !== event.pointerId)) return;
    if (!cancel && event) moveInteraction(event);
    interaction.ending = true;
    interaction.target.classList.remove('is-active');
    app.classList.remove('is-interacting');
    foldedNote.classList.remove('is-moving');
    if (interaction.target.hasPointerCapture(interaction.pointerId)) interaction.target.releasePointerCapture(interaction.pointerId);
    interaction.chain.then(async () => {
      if (!interaction.id) return;
      const result = await bridge.endInteraction({ id: interaction.id, cancel: cancel || interaction.failed });
      if (result && typeof result.folded === 'boolean') applyState(result);
    }).catch(() => showToast('창 변경을 완료하지 못했어요. 다시 시도해 주세요.')).finally(() => {
      if (activeInteraction === interaction) activeInteraction = null;
    });
  }

  async function keyboardInteraction(kind, edge, dx, dy) {
    if (!ready || activeInteraction || activeGesture || actionBusy) return;
    const interaction = { ending: true };
    activeInteraction = interaction;
    let id;
    try {
      id = await bridge.beginInteraction({ kind, edge, screenX: 0, screenY: 0 });
      await bridge.updateInteraction({ id, screenX: dx, screenY: dy });
      const result = await bridge.endInteraction({ id });
      if (result && typeof result.folded === 'boolean') applyState(result);
    } catch {
      if (id) bridge.endInteraction({ id, cancel: true }).catch(() => {});
      showToast('창의 크기나 위치를 변경하지 못했어요. 다시 시도해 주세요.');
    } finally { if (activeInteraction === interaction) activeInteraction = null; }
  }

  textarea.addEventListener('input', markEdited);
  textarea.addEventListener('compositionstart', () => { composing = true; });
  textarea.addEventListener('compositionend', () => { composing = false; markEdited(); });
  textarea.addEventListener('blur', () => { if (ready) persistNow(); });

  document.querySelectorAll('.color-swatch').forEach((button) => {
    button.addEventListener('click', () => {
      if (!ready || state.color === button.dataset.color) return;
      state.color = button.dataset.color;
      applyTheme(state.color);
      markEdited();
    });
  });
  pinButton.addEventListener('click', async () => {
    if (!ready || pinBusy) return;
    pinBusy = true;
    pinButton.disabled = true;
    try {
      const result = await bridge.setAlwaysOnTop(!state.alwaysOnTop);
      applyState(result);
    } catch { showToast('항상 위 설정을 변경하지 못했어요. 다시 시도해 주세요.'); }
    finally { pinBusy = false; pinButton.disabled = false; }
  });
  helpButton.addEventListener('click', () => setHelp(helpPanel.hidden));
  addNoteButton.addEventListener('click', async () => {
    if (!ready || creatingNote) return;
    creatingNote = true;
    addNoteButton.disabled = true;
    try {
      if (!await persistNow()) return;
      // The returned state belongs to the new window, never to this editor.
      await bridge.createNote();
    } catch {
      showToast(window.cornerNote ? '새 메모를 만들지 못했어요. 다시 시도해 주세요.' : '새 메모는 Windows 앱에서 만들 수 있어요.');
    } finally {
      creatingNote = false;
      addNoteButton.disabled = false;
    }
  });
  document.querySelector('#close-help').addEventListener('click', () => setHelp(false));
  document.querySelector('#hide-button').addEventListener('click', () => performAction('hide'));
  document.querySelector('#quit-button').addEventListener('click', () => performAction('quit'));
  document.querySelectorAll('[data-fold-to]').forEach((button) => button.addEventListener('click', () => performAction('fold', { corner: button.dataset.foldTo })));

  function activateCurrentNote() {
    if (ready && typeof bridge.activateNote === 'function') {
      // Native focus handles title-bar clicks; content clicks and typing also
      // identify the most recently used note without sending editor contents.
      void Promise.resolve(bridge.activateNote()).catch(() => {});
    }
  }
  document.addEventListener('pointerdown', activateCurrentNote, true);
  document.addEventListener('input', activateCurrentNote, true);

  document.querySelectorAll('.corner-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => startGesture(event, 'fold', handle.dataset.corner));
    handle.addEventListener('click', (event) => { if (event.detail === 0) performAction('fold', { corner: OPPOSITE[handle.dataset.corner] }); });
  });
  document.querySelectorAll('.resize-edge').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => startInteraction(event, 'resize', handle.dataset.edge));
    handle.addEventListener('keydown', (event) => {
      const horizontal = ['left', 'right'].includes(handle.dataset.edge);
      if (!(horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']).includes(event.key)) return;
      event.preventDefault();
      const distance = (event.shiftKey ? 40 : 10) * (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
      keyboardInteraction('resize', handle.dataset.edge, horizontal ? distance : 0, horizontal ? 0 : distance);
    });
  });
  foldedNote.addEventListener('pointerdown', (event) => {
    if (!unfoldHandle.contains(event.target)) startInteraction(event, 'move-folded');
  });
  unfoldHandle.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    startGesture(event, 'unfold', state.corner);
  });
  unfoldHandle.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); performAction('unfold'); }
  });
  foldedNote.addEventListener('dblclick', () => performAction('returnFoldedNote'));
  foldedNote.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); performAction('unfold'); }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction && event.target === foldedNote) {
      event.preventDefault();
      const distance = event.shiftKey ? 40 : 10;
      keyboardInteraction('move-folded', undefined, direction[0] * distance, direction[1] * distance);
    }
  });
  window.addEventListener('pointermove', moveGesture);
  window.addEventListener('pointermove', moveInteraction);
  window.addEventListener('pointerup', (event) => { endGesture(event); finishInteraction(false, event); });
  window.addEventListener('pointercancel', (event) => { resetGesture(); finishInteraction(true, event); });
  document.addEventListener('lostpointercapture', (event) => {
    if (activeGesture && activeGesture.pointerId === event.pointerId) resetGesture();
    if (activeInteraction && activeInteraction.pointerId === event.pointerId) finishInteraction(true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (activeInteraction) { event.preventDefault(); finishInteraction(true); }
      else if (activeGesture) { event.preventDefault(); resetGesture(); }
      else if (!helpPanel.hidden) { event.preventDefault(); setHelp(false); }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); persistNow(); }
    if (!helpPanel.hidden && event.key === 'Tab') {
      const focusable = [...helpPanel.querySelectorAll('button:not(:disabled)')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('blur', () => { if (activeGesture) resetGesture(); if (activeInteraction) finishInteraction(true); if (ready) persistNow(); });
  window.addEventListener('beforeunload', () => {
    // Every input has already reached the desktop process. This is a last
    // best-effort flush; explicit controls await their final save before acting.
    if (ready && editVersion !== persistedVersion) persistNow();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && ready) persistNow(); });

  const today = new Date();
  const todayElement = document.querySelector('#today');
  todayElement.dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  todayElement.textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(today);

  if (typeof bridge.onState === 'function') bridge.onState((next) => { if (ready) applyState(next); });
  bridge.getState().then((initial) => {
    applyState(initial, true);
    ready = true;
    addNoteButton.disabled = false;
    textarea.disabled = false;
    pinButton.disabled = false;
    app.classList.remove('is-loading');
    setStatus('saved', state.savedAt);
    if (state.folded) foldedNote.focus({ preventScroll: true });
    window.CornerTranslation?.init({ bridge, textarea, note, showToast, initialState: initial });
    window.CornerTutorial?.init({ bridge, textarea, note, showToast, initialState: initial });
  }).catch(() => {
    app.classList.remove('is-loading');
    setStatus('error');
    showToast('메모를 불러오지 못했어요. 앱을 다시 열어 주세요.');
  });
})();
