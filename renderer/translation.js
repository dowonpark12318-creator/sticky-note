(() => {
  'use strict';

  const ENGLISH_MESSAGES = {
  "번역": "Translate",
  "번역할 언어": "Translation languages",
  "번역 창 닫기": "Close translation panel",
  "닫기": "Close",
  "선택한 글을 어떤 언어로 바꿀까요?": "Choose a language for the selected text.",
  "번역 언어": "Translation languages",
  "추가": "Add",
  "AI 연결 설정": "AI translation settings",
  "언어 이름 또는 코드로 검색": "Search by language name or code",
  "예: 일본어, French, fr": "e.g. Japanese, French, fr",
  "추가할 언어": "Languages to add",
  "찾는 언어의 이름이나 언어 코드를 입력해 주세요.": "Enter a language name or language code.",
  "← 번역 언어로 돌아가기": "← Back to translation languages",
  "내 OpenAI API 키를 연결하면 선택한 글을 번역할 수 있어요.": "Connect your OpenAI API key to translate selected text.",
  "선택한 글만 OpenAI로 전송돼요.": "Only the selected text is sent to OpenAI.",
  "API 사용료는 본인 계정에 청구됩니다.": "API usage is billed to your OpenAI account.",
  "OpenAI API 키": "OpenAI API key",
  "API 키 입력": "Enter API key",
  "이 컴퓨터에서 키 기억하기": "Remember key on this computer",
  "이 컴퓨터에서는 앱을 종료하면 키가 지워져요.": "On this computer, the key is cleared when you exit the app.",
  "연결하기": "Connect",
  "연결 해제": "Disconnect",
  "선택한 글을": "Translating the selected text into",
  "로 번역하고 있어요.": ".",
  "다른 글을 수정해도 괜찮아요.": "You can keep editing your note.",
  "완료된 번역은 직접 확인하고 적용할 수 있어요.": "Review the finished translation before applying it.",
  "번역 취소": "Cancel translation",
  "번역 결과": "Translation result",
  "메모가 바뀌었어요. 번역을 복사해서 원하는 곳에 붙여 넣어 주세요.": "The note has changed. Copy the translation and paste it where you want.",
  "선택 부분 바꾸기": "Replace selection",
  "복사": "Copy",
  "번역 중…": "Translating…",
  "선택한 글 번역하기": "Translate selected text",
  "번역할 글을 먼저 드래그해 선택해 주세요": "Drag to select the text you want to translate first",
  "선택한 글 번역": "Translate selection",
  "번역할 글을 먼저 선택해 주세요": "Select some text to translate first",
  "{language}를 번역 언어에 추가했어요.": "Added {language} to translation languages.",
  "언어를 저장하지 못했어요. 다시 시도해 주세요.": "Could not save the language. Please try again.",
  "AI 연결 확인 중…": "Checking AI connection…",
  "API 키 등록됨 · gpt-4.1-mini": "API key connected · gpt-4.1-mini",
  "아직 연결된 API 키가 없어요.": "No API key is connected yet.",
  "연결 중…": "Connecting…",
  "키 변경하기": "Change key",
  "연결하고 번역하기": "Connect and translate",
  "번역이 끝난 뒤 AI 연결을 변경해 주세요.": "Wait for the translation to finish before changing the AI connection.",
  "AI 번역 연결": "AI translation connection",
  "OpenAI API 키를 입력해 주세요.": "Enter your OpenAI API key.",
  "API 키를 연결하지 못했어요. 키를 확인해 주세요.": "Could not connect the API key. Check your key and try again.",
  "AI 번역을 연결했어요.": "AI translation is connected.",
  "AI 연결을 해제했어요.": "AI translation is disconnected.",
  "연결을 해제하지 못했어요. 다시 시도해 주세요.": "Could not disconnect. Please try again.",
  "번역을 취소했어요.": "Translation cancelled.",
  "번역 시간이 오래 걸려 중단했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.": "Translation took too long and was stopped. Check your internet connection and try again.",
  "번역 결과가 비어 있어요. 다시 시도해 주세요.": "The translation result was empty. Please try again.",
  "번역하지 못했어요. API 키와 사용 한도, 네트워크 연결을 확인해 주세요.": "Could not translate. Check your API key, usage limit and internet connection.",
  "선택한 부분을 번역으로 바꿨어요.": "Replaced the selected text with the translation.",
  "번역을 복사했어요.": "Translation copied.",
  "복사하지 못했어요. 번역 결과를 직접 선택해 복사해 주세요.": "Could not copy. Select the translation result and copy it manually.",
  "번역 언어 추가": "Add translation language",
  "번역 결과 접미사": " translation"
};
  const MESSAGES = { ko: { ...Object.fromEntries(Object.keys(ENGLISH_MESSAGES).map(key => [key, key])), "번역 결과 접미사": " 번역" }, en: ENGLISH_MESSAGES };

  const COMMON_LANGUAGES = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'ru', 'ar', 'hi', 'vi', 'th', 'id', 'ms', 'tr', 'uk', 'pl', 'nl', 'sv', 'da', 'fi', 'nb', 'el', 'cs', 'ro', 'hu', 'he', 'fa', 'bn', 'ur', 'ta', 'te', 'fil', 'sw', 'af', 'am', 'az', 'bg', 'ca', 'et', 'eu', 'gl', 'hr', 'is', 'ka', 'km', 'lo', 'lt', 'lv', 'mk', 'mn', 'my', 'ne', 'si', 'sk', 'sl', 'sr', 'tl', 'uz', 'zu'];
  const englishNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

  function canonicalLanguage(value) {
    if (typeof value !== 'string' || value.length > 48 || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.trim())) return null;
    try {
      const locale = new Intl.Locale(value.trim());
      if (!englishNames.of(locale.language)) return null;
      return locale.toString();
    } catch { return null; }
  }

  function init({ bridge, textarea, note, showToast = () => {}, initialState = {} }) {
    const i18n = window.CornerI18n.createI18n(initialState.uiLocale || initialState.systemLanguage || navigator.languages, MESSAGES, 'translation');
    const { t } = i18n;
    const displayNames = new Intl.DisplayNames([i18n.locale], { type: 'language', fallback: 'none' });
    function languageLabel(code) {
      try { return displayNames.of(code) || code; }
      catch { return code; }
    }
    // Only the freshly created static panel is walked; note text and AI output are never translated.
    function localizeStatic(container) {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const key = node.textContent.trim();
        if (Object.hasOwn(ENGLISH_MESSAGES, key)) node.textContent = node.textContent.replace(key, t(key));
      }
      for (const element of container.querySelectorAll('[aria-label], [title], [placeholder]')) {
        for (const attribute of ['aria-label', 'title', 'placeholder']) {
          const key = element.getAttribute(attribute);
          if (key && Object.hasOwn(ENGLISH_MESSAGES, key)) element.setAttribute(attribute, t(key));
        }
      }
    }
    const tools = note.querySelector('.note-tools');
    if (!tools || !textarea || tools.querySelector('[data-testid="translate-button"]')) return null;
    let snapshot = null;
    let savedLanguages = [];
    let systemLanguage = initialState.systemLanguage || navigator.languages?.[0] || navigator.language || 'en';
    let view = null;
    let pendingTranslation = null;
    let activeRequest = null;
    let result = null;
    let requestSequence = 0;
    let destroyed = false;
    let settings = { configured: false, canRememberKey: false };
    let settingsReady = false;
    let settingsBusy = false;
    let pickerBusy = false;
    let settingsRefreshVersion = 0;
    let previousFocus = null;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ct-translate';
    button.dataset.testid = 'translate-button';
    button.innerHTML = '<span class="ct-translate-icon" aria-hidden="true">文</span><span class="ct-button-label">번역</span><span class="ct-spinner" aria-hidden="true" hidden></span>';
    localizeStatic(button);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'ct-panel');
    tools.insertBefore(button, tools.querySelector('.fold-tip'));
    tools.classList.add('ct-tools');
    const buttonLabel = button.querySelector('.ct-button-label');
    const spinner = button.querySelector('.ct-spinner');

    const panel = document.createElement('section');
    panel.id = 'ct-panel';
    panel.className = 'ct-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'ct-title');
    panel.hidden = true;
    panel.innerHTML = `
      <div class="ct-heading"><h2 id="ct-title">번역할 언어</h2><button class="ct-close" type="button" aria-label="번역 창 닫기" title="닫기">×</button></div>
      <div class="ct-scroll">
        <section class="ct-view ct-languages" data-testid="translation-language-menu" hidden>
          <p class="ct-description">선택한 글을 어떤 언어로 바꿀까요?</p>
          <div class="ct-language-list" role="group" aria-label="번역 언어"></div>
          <button class="ct-add-language ct-row" data-testid="add-language-button" type="button"><span aria-hidden="true">＋</span> 추가</button>
          <button class="ct-settings-link" type="button">AI 연결 설정</button>
        </section>
        <section class="ct-view ct-picker" hidden>
          <label class="ct-field-label" for="ct-language-search">언어 이름 또는 코드로 검색</label>
          <input id="ct-language-search" data-testid="language-search" class="ct-input" type="search" placeholder="예: 일본어, French, fr" autocomplete="off" spellcheck="false">
          <div class="ct-language-choices" role="group" aria-label="추가할 언어"></div>
          <p class="ct-empty" hidden>찾는 언어의 이름이나 언어 코드를 입력해 주세요.</p>
          <button class="ct-back ct-text-button" type="button">← 번역 언어로 돌아가기</button>
        </section>
        <section class="ct-view ct-settings" data-testid="translation-settings" hidden>
          <p class="ct-description">내 OpenAI API 키를 연결하면 선택한 글을 번역할 수 있어요.</p>
          <p class="ct-privacy">선택한 글만 OpenAI로 전송돼요.<br>API 사용료는 본인 계정에 청구됩니다.</p>
          <p class="ct-connection-status" role="status"></p>
          <form class="ct-key-form">
            <label class="ct-field-label" for="ct-api-key">OpenAI API 키</label>
            <input id="ct-api-key" data-testid="translation-api-key" class="ct-input" type="password" placeholder="API 키 입력" autocomplete="off" spellcheck="false" autocapitalize="off" required>
            <label class="ct-remember" hidden><input data-testid="translation-remember-key" type="checkbox"><span>이 컴퓨터에서 키 기억하기</span></label>
            <p class="ct-session-only" hidden>이 컴퓨터에서는 앱을 종료하면 키가 지워져요.</p>
            <div class="ct-actions"><button class="ct-primary ct-save-key" data-testid="translation-save-key" type="submit">연결하기</button><button class="ct-text-button ct-clear-key" data-testid="translation-clear-key" type="button" hidden>연결 해제</button></div>
          </form>
        </section>
        <section class="ct-view ct-progress" hidden>
          <p class="ct-description">선택한 글을 <strong class="ct-target-label"></strong>로 번역하고 있어요.</p>
          <div class="ct-progress-visual" aria-hidden="true"><span class="ct-spinner"></span></div>
          <p class="ct-privacy">다른 글을 수정해도 괜찮아요.<br>완료된 번역은 직접 확인하고 적용할 수 있어요.</p>
          <button class="ct-text-button ct-cancel" data-testid="translation-cancel" type="button">번역 취소</button>
        </section>
        <section class="ct-view ct-result" data-testid="translation-result" hidden>
          <p class="ct-description"><strong class="ct-result-language"></strong><span class="ct-result-suffix"></span></p>
          <div class="ct-result-text" data-testid="translation-result-text" tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label="번역 결과"></div>
          <p class="ct-stale-hint" hidden>메모가 바뀌었어요. 번역을 복사해서 원하는 곳에 붙여 넣어 주세요.</p>
          <div class="ct-actions"><button class="ct-primary ct-apply" data-testid="translation-apply" type="button">선택 부분 바꾸기</button><button class="ct-secondary ct-copy" data-testid="translation-copy" type="button">복사</button></div>
        </section>
        <p class="ct-error" data-testid="translation-error" role="alert" hidden></p>
      </div>`;
    localizeStatic(panel);
    note.append(panel);
    const element = (selector) => panel.querySelector(selector);
    element('.ct-result-suffix').textContent = t('번역 결과 접미사');
    const errorElement = element('.ct-error');
    const keyInput = element('#ct-api-key');
    const rememberInput = element('[data-testid="translation-remember-key"]');
    const languageSearch = element('#ct-language-search');
    const cleanups = [];
    function listen(target, type, callback, options) {
      target.addEventListener(type, callback, options);
      cleanups.push(() => target.removeEventListener(type, callback, options));
    }

    function readPreferences(value) {
      if (value?.systemLanguage) {
        try { systemLanguage = new Intl.Locale(value.systemLanguage).baseName; }
        catch { systemLanguage = 'en'; }
      }
      if (Array.isArray(value?.settings?.translationLanguages)) {
        savedLanguages = [...new Set(value.settings.translationLanguages.map(canonicalLanguage).filter(Boolean))];
      }
      if (value?.folded === true) closePanel(false);
      if (view === 'languages') renderLanguages();
    }
    readPreferences(initialState);

    function captureSelection() {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      snapshot = end > start && textarea.value.slice(start, end).trim() ? { value: textarea.value, start, end, text: textarea.value.slice(start, end) } : null;
      updateButton();
    }

    function hasSelection() { return Boolean(snapshot && snapshot.value === textarea.value && snapshot.end > snapshot.start); }
    function updateButton() {
      const busy = Boolean(activeRequest);
      button.hidden = !textarea.value.trim();
      button.disabled = busy || !hasSelection();
      button.setAttribute('aria-busy', String(busy));
      button.title = busy ? t("번역 중…") : hasSelection() ? t("선택한 글 번역하기") : t("번역할 글을 먼저 드래그해 선택해 주세요");
      button.setAttribute('aria-label', busy ? t("번역 중…") : hasSelection() ? t("선택한 글 번역") : t("번역할 글을 먼저 선택해 주세요"));
      buttonLabel.textContent = busy ? t("번역 중…") : t("번역");
      spinner.hidden = !busy;
      button.querySelector('.ct-translate-icon').hidden = busy;
    }

    function showError(message) {
      errorElement.textContent = message;
      errorElement.hidden = !message;
    }

    function messageForError(error, fallback) {
      const message = typeof error?.message === 'string' ? error.message : '';
      // Never echo an entered credential, even if a bridge implementation includes it in an error.
      if (/sk-|Bearer\s|api[_ -]?key\s*[:=]/i.test(message)) return fallback;
      return /\p{L}/u.test(message) ? message.slice(0, 240) : fallback;
    }

    function positionPanel() {
      const noteBounds = note.getBoundingClientRect();
      const toolsBounds = tools.getBoundingClientRect();
      if (!noteBounds.height || !toolsBounds.height) return;
      // Keep the paper controls visible while the dialog's content scrolls.
      const bottom = Math.max(0, Math.ceil(noteBounds.bottom - toolsBounds.top + 6));
      panel.style.setProperty('--ct-panel-bottom', `${bottom}px`);
    }

    function switchView(nextView, title, focusTarget) {
      if (panel.hidden) previousFocus = document.activeElement;
      view = nextView;
      panel.hidden = false;
      panel.dataset.view = nextView;
      element('#ct-title').textContent = title;
      panel.querySelectorAll('.ct-view').forEach((item) => { item.hidden = !item.classList.contains(`ct-${nextView}`); });
      positionPanel();
      button.setAttribute('aria-expanded', 'true');
      showError('');
      if (focusTarget) requestAnimationFrame(() => { if (!destroyed && view === nextView) focusTarget.focus({ preventScroll: true }); });
    }

    function closePanel(restoreFocus = true) {
      if (activeRequest) cancelActiveTranslation(false);
      keyInput.value = '';
      pendingTranslation = null;
      view = null;
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      showError('');
      if (restoreFocus && previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus({ preventScroll: true });
    }

    function targetLanguages() {
      const englishDefault = new Intl.Locale(systemLanguage).language === 'en' ? [] : ['en'];
      return [...new Set([systemLanguage, ...englishDefault, ...savedLanguages].map(canonicalLanguage).filter(Boolean))];
    }
    function makeLanguageButton(code, testPrefix, handler) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ct-language ct-row';
      item.dataset.testid = `${testPrefix}-${code}`;
      const label = document.createElement('span');
      label.textContent = languageLabel(code);
      const caption = document.createElement('span');
      caption.className = 'ct-language-code';
      caption.textContent = code;
      item.append(label, caption);
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => handler(code));
      return item;
    }

    function renderLanguages() {
      const list = element('.ct-language-list');
      list.replaceChildren(...targetLanguages().map((code) => makeLanguageButton(code, 'language', chooseLanguage)));
    }

    function openLanguageMenu() {
      if (!hasSelection() || activeRequest) return;
      pendingTranslation = null;
      renderLanguages();
      switchView('languages', t("번역할 언어"));
    }

    function renderLanguageChoices() {
      const query = languageSearch.value.trim().toLocaleLowerCase(i18n.locale);
      const existing = new Set(targetLanguages());
      const typed = canonicalLanguage(query);
      const codes = [...new Set([...(typed ? [typed] : []), ...COMMON_LANGUAGES])];
      const matches = codes.filter((code) => !existing.has(code) && (!query || `${languageLabel(code)} ${englishNames.of(code) || ''} ${code}`.toLocaleLowerCase(i18n.locale).includes(query)));
      const list = element('.ct-language-choices');
      list.replaceChildren(...matches.map((code) => {
        const item = makeLanguageButton(code, 'language-choice', addLanguage);
        item.disabled = pickerBusy;
        return item;
      }));
      element('.ct-empty').hidden = matches.length > 0;
    }

    async function addLanguage(code) {
      if (pickerBusy) return;
      pickerBusy = true;
      renderLanguageChoices();
      showError('');
      try {
        const next = [...new Set([...savedLanguages, code])];
        const saved = await bridge.updatePreferences({ translationLanguages: next });
        savedLanguages = next;
        readPreferences(saved);
        if (view === 'picker' && !destroyed) {
          renderLanguages();
          switchView('languages', t("번역할 언어"));
          showToast(t('{language}를 번역 언어에 추가했어요.', {language: languageLabel(code)}));
        }
      } catch (error) {
        showError(messageForError(error, t("언어를 저장하지 못했어요. 다시 시도해 주세요.")));
      } finally { pickerBusy = false; if (view === 'picker') renderLanguageChoices(); }
    }

    function renderSettings() {
      element('.ct-connection-status').textContent = !settingsReady ? t("AI 연결 확인 중…") : settings.configured ? t("API 키 등록됨 · gpt-4.1-mini") : t("아직 연결된 API 키가 없어요.");
      element('.ct-remember').hidden = !settings.canRememberKey;
      element('.ct-session-only').hidden = !settingsReady || settings.canRememberKey;
      element('.ct-clear-key').hidden = !settings.configured;
      element('.ct-save-key').textContent = settingsBusy ? t("연결 중…") : settings.configured ? t("키 변경하기") : pendingTranslation ? t("연결하고 번역하기") : t("연결하기");
      keyInput.disabled = settingsBusy;
      rememberInput.disabled = settingsBusy;
      element('.ct-save-key').disabled = settingsBusy || !settingsReady;
      element('.ct-clear-key').disabled = settingsBusy || !settingsReady;
    }

    async function loadSettings() {
      const version = ++settingsRefreshVersion;
      settingsReady = false;
      renderSettings();
      let next;
      try {
        const status = await bridge.getTranslationSettings();
        next = { configured: status?.configured === true, canRememberKey: status?.canRememberKey === true };
      } catch { next = { configured: false, canRememberKey: false }; }
      if (!destroyed && version === settingsRefreshVersion) {
        settings = next;
        settingsReady = true;
        renderSettings();
      }
      return next;
    }

    async function openSettings(options = {}) {
      if (activeRequest) { showToast(t("번역이 끝난 뒤 AI 연결을 변경해 주세요.")); return; }
      if (settingsBusy) return;
      if (!options.keepPending) pendingTranslation = null;
      keyInput.value = '';
      rememberInput.checked = false;
      const refresh = loadSettings();
      switchView('settings', t("AI 번역 연결"), keyInput);
      await refresh;
      if (view === 'settings') renderSettings();
    }

    async function chooseLanguage(code) {
      if (activeRequest) return;
      if (!hasSelection()) { closePanel(false); return; }
      const job = { targetLanguage: code, snapshot: { ...snapshot } };
      pendingTranslation = job;
      const currentSettings = await loadSettings();
      if (pendingTranslation !== job || destroyed) return;
      if (!currentSettings.configured) { openSettings({ keepPending: true }); return; }
      pendingTranslation = null;
      runTranslation(job);
    }

    async function saveKey(event) {
      event.preventDefault();
      if (settingsBusy || !settingsReady) return;
      let apiKey = keyInput.value.trim();
      if (!apiKey) { showError(t("OpenAI API 키를 입력해 주세요.")); keyInput.focus(); return; }
      const remember = settings.canRememberKey && rememberInput.checked;
      keyInput.value = '';
      settingsBusy = true;
      settingsRefreshVersion += 1;
      renderSettings();
      showError('');
      try {
        const status = await bridge.setTranslationKey({ apiKey, remember });
        settings = { configured: status?.configured === true, canRememberKey: status?.canRememberKey === true };
        if (!settings.configured) throw new Error(t("API 키를 연결하지 못했어요. 키를 확인해 주세요."));
        const job = pendingTranslation;
        pendingTranslation = null;
        if (job && !panel.hidden) runTranslation(job);
        else { showToast(t("AI 번역을 연결했어요.")); if (!panel.hidden) closePanel(false); }
      } catch (error) { showError(messageForError(error, t("API 키를 연결하지 못했어요. 키를 확인해 주세요."))); }
      finally { apiKey = ''; settingsBusy = false; keyInput.value = ''; renderSettings(); }
    }

    async function clearKey() {
      if (settingsBusy || !settingsReady) return;
      settingsBusy = true;
      settingsRefreshVersion += 1;
      pendingTranslation = null;
      keyInput.value = '';
      renderSettings();
      try {
        const status = await bridge.clearTranslationKey();
        settings = { configured: status?.configured === true, canRememberKey: status?.canRememberKey === true };
        showToast(t("AI 연결을 해제했어요."));
        showError('');
      } catch (error) { showError(messageForError(error, t("연결을 해제하지 못했어요. 다시 시도해 주세요."))); }
      finally { settingsBusy = false; renderSettings(); }
    }

    function cancelActiveTranslation(notify = true) {
      const request = activeRequest;
      if (!request) return;
      activeRequest = null;
      clearTimeout(request.timer);
      Promise.resolve().then(() => bridge.cancelTranslation(request.id)).catch(() => {});
      updateButton();
      if (notify) {
        renderLanguages();
        switchView('languages', t("번역할 언어"));
        showToast(t("번역을 취소했어요."));
      }
    }

    async function runTranslation(job) {
      if (activeRequest || destroyed) return;
      const request = { id: `translation-${Date.now()}-${++requestSequence}`, job, timer: null };
      activeRequest = request;
      updateButton();
      switchView('progress', t("번역 중…"));
      element('.ct-target-label').textContent = languageLabel(job.targetLanguage);
      request.timer = setTimeout(() => {
        if (activeRequest !== request) return;
        cancelActiveTranslation(false);
        renderLanguages();
        switchView('languages', t("번역할 언어"));
        showError(t("번역 시간이 오래 걸려 중단했어요. 네트워크 연결을 확인하고 다시 시도해 주세요."));
      }, 55000);
      try {
        const response = await bridge.translate({ text: job.snapshot.text, targetLanguage: job.targetLanguage, requestId: request.id });
        if (activeRequest !== request || destroyed) return;
        if (!response || typeof response.text !== 'string' || !response.text.trim()) throw new Error(t("번역 결과가 비어 있어요. 다시 시도해 주세요."));
        result = { text: response.text, targetLanguage: job.targetLanguage, snapshot: job.snapshot };
        element('.ct-result-text').textContent = response.text;
        element('.ct-result-language').textContent = languageLabel(job.targetLanguage);
        switchView('result', t("번역 결과"));
        updateApplyState();
      } catch (error) {
        if (activeRequest !== request || destroyed) return;
        renderLanguages();
        switchView('languages', t("번역할 언어"));
        showError(messageForError(error, t("번역하지 못했어요. API 키와 사용 한도, 네트워크 연결을 확인해 주세요.")));
      } finally {
        clearTimeout(request.timer);
        if (activeRequest === request) { activeRequest = null; updateButton(); }
      }
    }

    function updateApplyState() {
      const current = Boolean(result && textarea.value === result.snapshot.value);
      element('.ct-apply').disabled = !current;
      element('.ct-stale-hint').hidden = current;
    }

    function applyTranslation() {
      if (!result || textarea.value !== result.snapshot.value) { updateApplyState(); return; }
      const { start, end } = result.snapshot;
      textarea.focus({ preventScroll: true });
      textarea.setRangeText(result.text, start, end, 'select');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      captureSelection();
      closePanel(false);
      showToast(t("선택한 부분을 번역으로 바꿨어요."));
    }

    async function copyTranslation() {
      if (!result) return;
      try {
        if (typeof bridge.copyText === 'function') await bridge.copyText(result.text);
        else await navigator.clipboard.writeText(result.text);
        showToast(t("번역을 복사했어요."));
      } catch { showError(t("복사하지 못했어요. 번역 결과를 직접 선택해 복사해 주세요.")); }
    }

    listen(textarea, 'select', captureSelection);
    listen(textarea, 'keyup', captureSelection);
    listen(textarea, 'pointerup', captureSelection);
    listen(textarea, 'input', () => { captureSelection(); updateApplyState(); });
    listen(document, 'selectionchange', () => { if (document.activeElement === textarea) captureSelection(); });
    listen(button, 'mousedown', (event) => { captureSelection(); event.preventDefault(); });
    listen(button, 'click', () => { if (view === 'languages') closePanel(false); else openLanguageMenu(); });
    listen(element('.ct-close'), 'click', () => closePanel());
    listen(element('.ct-settings-link'), 'click', () => openSettings());
    listen(element('.ct-add-language'), 'click', () => {
      languageSearch.value = '';
      renderLanguageChoices();
      switchView('picker', t("번역 언어 추가"), languageSearch);
    });
    listen(element('.ct-back'), 'click', () => { renderLanguages(); switchView('languages', t("번역할 언어")); });
    listen(languageSearch, 'input', renderLanguageChoices);
    listen(element('.ct-key-form'), 'submit', saveKey);
    listen(element('.ct-clear-key'), 'click', clearKey);
    listen(element('.ct-cancel'), 'click', () => cancelActiveTranslation());
    listen(element('.ct-apply'), 'click', applyTranslation);
    listen(element('.ct-copy'), 'click', copyTranslation);
    listen(document, 'pointerdown', (event) => {
      if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target) && (view === 'languages' || view === 'picker')) closePanel(false);
    });
    listen(document, 'keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); closePanel(); }
      // Keep Tab navigation within this compact dialog while it is open.
      if (event.key === 'Tab' && !panel.hidden && panel.contains(document.activeElement)) {
        const focusable = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((item) => item.getClientRects().length);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    listen(window, 'resize', positionPanel);
    if (typeof ResizeObserver === 'function') {
      const layoutObserver = new ResizeObserver(positionPanel);
      layoutObserver.observe(note);
      layoutObserver.observe(tools);
      cleanups.push(() => layoutObserver.disconnect());
    }
    if (typeof bridge.onState === 'function') {
      const unsubscribe = bridge.onState((value) => { readPreferences(value); updateButton(); updateApplyState(); });
      if (typeof unsubscribe === 'function') cleanups.push(unsubscribe);
    }
    loadSettings();
    captureSelection();
    positionPanel();
    return {
      openSettings,
      close: () => closePanel(false),
      destroy() {
        destroyed = true;
        cancelActiveTranslation(false);
        keyInput.value = '';
        cleanups.forEach((cleanup) => cleanup());
        panel.remove();
        button.remove();
        tools.classList.remove('ct-tools');
      },
    };
  }

  window.CornerTranslation = Object.freeze({ init });
})();
