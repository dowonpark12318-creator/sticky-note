(() => {
  'use strict';

  const COLORS = ['butter', 'rose', 'mint', 'sky'];
  const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const OPPOSITE = { 'top-left': 'bottom-right', 'top-right': 'bottom-left', 'bottom-left': 'top-right', 'bottom-right': 'top-left' };
  const CORNER_LABELS = { 'top-left': '왼쪽 위', 'top-right': '오른쪽 위', 'bottom-left': '왼쪽 아래', 'bottom-right': '오른쪽 아래' };
  const STORAGE_KEY = 'corner-note-v1';
  const app = document.querySelector('#app');
  const note = document.querySelector('#note');
  const textarea = document.querySelector('#note-text');
  const foldedNote = document.querySelector('#folded-note');
  const helpPanel = document.querySelector('#help-panel');
  const helpButton = document.querySelector('#help-button');
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
  let actionBusy = false;

  function normalizeState(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      text: typeof source.text === 'string' ? source.text : '',
      color: COLORS.includes(source.color) ? source.color : 'butter',
      corner: CORNERS.includes(source.corner) ? source.corner : 'top-right',
      folded: source.folded === true,
      savedAt: source.savedAt || null,
    };
  }

  function createBrowserBridge() {
    let browserState;
    const listeners = new Set();
    try { browserState = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
    catch { browserState = normalizeState({}); }
    const emit = () => listeners.forEach((listener) => listener({ ...browserState }));
    const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(browserState));
    return {
      async getState() { return { ...browserState }; },
      async saveNote(value) {
        const next = { ...browserState, text: value.text, color: value.color, savedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        browserState = next;
        emit();
        return { savedAt: browserState.savedAt };
      },
      async fold({ corner }) { browserState = { ...browserState, corner, folded: true }; persist(); emit(); return { ...browserState }; },
      async unfold() { browserState = { ...browserState, folded: false }; persist(); emit(); return { ...browserState }; },
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
    if (next.savedAt && (!state.savedAt || new Date(next.savedAt).getTime() >= new Date(state.savedAt).getTime())) state.savedAt = next.savedAt;
    app.classList.toggle('is-folded', next.folded);
    app.dataset.corner = next.corner;
    note.hidden = next.folded;
    foldedNote.hidden = !next.folded;
    foldedNote.dataset.corner = next.corner;
    foldedNote.setAttribute('aria-label', `${CORNER_LABELS[next.corner]}에 접힌 메모: 화면 안쪽으로 당기거나 두 번 클릭하여 펼치기`);
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
    if (!ready || actionBusy || activeGesture || event.button !== 0) return;
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
    gestureProgress.style.width = `${Math.min(progress / 0.68, 1) * 100}%`;
    gestureLabel.textContent = progress >= 0.68 ? `놓으면 ${CORNER_LABELS[OPPOSITE[corner]]}에 접혀요` : '반대쪽 모서리까지 당겨 주세요';
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
    if (gesture.kind === 'fold' && gesture.progress >= 0.68) performAction('fold', { corner: OPPOSITE[gesture.corner] });
    if (gesture.kind === 'unfold' && gesture.progress >= 1) performAction('unfold');
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
  helpButton.addEventListener('click', () => setHelp(helpPanel.hidden));
  document.querySelector('#close-help').addEventListener('click', () => setHelp(false));
  document.querySelector('#hide-button').addEventListener('click', () => performAction('hide'));
  document.querySelector('#quit-button').addEventListener('click', () => performAction('quit'));
  document.querySelectorAll('[data-fold-to]').forEach((button) => button.addEventListener('click', () => performAction('fold', { corner: button.dataset.foldTo })));

  document.querySelectorAll('.corner-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => startGesture(event, 'fold', handle.dataset.corner));
    handle.addEventListener('click', (event) => { if (event.detail === 0) performAction('fold', { corner: OPPOSITE[handle.dataset.corner] }); });
  });
  foldedNote.addEventListener('pointerdown', (event) => startGesture(event, 'unfold', state.corner));
  foldedNote.addEventListener('dblclick', () => performAction('unfold'));
  foldedNote.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); performAction('unfold'); }
  });
  window.addEventListener('pointermove', moveGesture);
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', () => resetGesture());
  document.addEventListener('lostpointercapture', (event) => { if (activeGesture && activeGesture.pointerId === event.pointerId) resetGesture(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (activeGesture) { event.preventDefault(); resetGesture(); }
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
  window.addEventListener('blur', () => { if (activeGesture) resetGesture(); if (ready) persistNow(); });
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
    textarea.disabled = false;
    app.classList.remove('is-loading');
    setStatus('saved', state.savedAt);
    if (state.folded) foldedNote.focus({ preventScroll: true });
  }).catch(() => {
    app.classList.remove('is-loading');
    setStatus('error');
    showToast('메모를 불러오지 못했어요. 앱을 다시 열어 주세요.');
  });
})();
