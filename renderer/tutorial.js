(() => {
  'use strict';

  const ILLUSTRATIONS = {
    move: `<svg viewBox="0 0 260 130" fill="none" aria-hidden="true"><rect x="27" y="18" width="177" height="102" rx="10" class="ct-art-window"/><path d="M40 34h35m-35 13h60m-60 14h47" class="ct-art-muted"/><rect x="65" y="11" width="157" height="105" rx="10" class="ct-art-paper"/><path d="M75 33h137" class="ct-art-rule"/><rect x="75" y="19" width="137" height="13" rx="4" class="ct-art-highlight"/><path d="M85 25h43M83 49h84m-84 12h108m-108 12h70" class="ct-art-ink"/><path d="m166 25 8-8m-8 8-8-8m8 8v-14m0 14 8 8m-8-8-8 8m8-8v14m0-14h14m-14 0h-14" class="ct-art-accent"/><path d="m206 80 8 22 4-9 10-3-22-10Z" class="ct-art-cursor"/></svg>`,
    resize: `<svg viewBox="0 0 260 130" fill="none" aria-hidden="true"><rect x="59" y="11" width="143" height="106" rx="10" class="ct-art-paper"/><path d="M70 34h121" class="ct-art-rule"/><path d="M78 24h40m-40 27h82M78 65h101m-101 14h66" class="ct-art-ink"/><path d="M61 37v53m139-53v53M86 13h89M86 115h89" class="ct-art-resize"/><path d="M34 64h48m-48 0 8-7m-8 7 8 7m40-7-8-7m8 7-8 7M178 64h48m-48 0 8-7m-8 7 8 7m40-7-8-7m8 7-8 7" class="ct-art-accent"/><path d="m205 93 7 21 4-8 9-4-20-9Z" class="ct-art-cursor"/></svg>`,
    fold: `<svg viewBox="0 0 260 130" fill="none" aria-hidden="true"><rect x="26" y="15" width="96" height="99" rx="8" class="ct-art-paper"/><path d="M39 39h69M39 28h29m-29 25h55m-55 14h64m-64 14h43" class="ct-art-ink"/><path d="M32 35V21h14" class="ct-art-accent"/><path d="m44 32 61 63m0 0-2-15m2 15-15-3" class="ct-art-dashed"/><path d="M142 57h25m-7-7 7 7-7 7" class="ct-art-accent"/><path d="M181 41h53v58l-53-58Z" class="ct-art-fold"/><path d="M224 49v35l-31-35" class="ct-art-fold-shine"/><path d="m192 105 21-22m-21 22 2-12m-2 12 13-2" class="ct-art-accent"/><path d="m203 72 9-9m-4 15 10-10" class="ct-art-grip"/></svg>`,
    foldedMove: `<svg viewBox="0 0 260 130" fill="none" aria-hidden="true"><rect x="30" y="12" width="200" height="108" rx="9" class="ct-art-window"/><path d="M39 20h43m-43 9h24" class="ct-art-muted"/><path d="M194 20h28v30l-28-30Z" class="ct-art-ghost"/><path d="M185 42c-9 27-23 26-35 39" class="ct-art-dashed"/><path d="m150 81 3-12m-3 12 12-3" class="ct-art-accent"/><path d="M102 43h58v62l-58-62Z" class="ct-art-fold"/><path d="M151 51v37l-34-37" class="ct-art-fold-shine"/><path d="m127 61 7 21 4-8 9-4-20-9Z" class="ct-art-cursor"/><path d="M83 72H65m0 0 6-6m-6 6 6 6M177 72h18m0 0-6-6m6 6-6 6" class="ct-art-accent"/></svg>`,
    translate: `<svg viewBox="0 0 260 130" fill="none" aria-hidden="true"><rect x="35" y="12" width="147" height="105" rx="9" class="ct-art-paper"/><rect x="48" y="31" width="99" height="18" rx="3" class="ct-art-highlight"/><text x="55" y="44" class="ct-art-text">오늘도 좋은 하루</text><path d="M49 62h84m-84 12h107" class="ct-art-ink"/><rect x="111" y="83" width="55" height="24" rx="7" class="ct-art-button"/><text x="122" y="99" class="ct-art-button-text">✦ 번역</text><rect x="167" y="33" width="70" height="73" rx="8" class="ct-art-menu"/><text x="179" y="51" class="ct-art-menu-text">한국어</text><path d="M176 59h51" class="ct-art-rule"/><text x="179" y="74" class="ct-art-menu-text">English</text><text x="179" y="96" class="ct-art-menu-add">＋ 추가</text></svg>`,
  };

  const STEPS = [
    {
      label: '나만의 자리', title: '메모를 원하는 곳으로', art: 'move',
      body: '펼쳐진 메모는 위쪽 제목 표시줄의 빈 곳을 잡고 끌어 옮겨요.',
      detail: '‘항상 위’를 켜면 다른 창 위에 고정돼요. 끄면 일반 창처럼 Alt + Tab으로 다시 찾을 수 있어요.',
    },
    {
      label: '딱 맞는 크기', title: '변을 당겨 크기 조절', art: 'resize',
      body: '메모의 위·아래·왼쪽·오른쪽 테두리에 마우스를 올리면 크기 조절 커서가 나타나요.',
      detail: '원하는 방향으로 끌어 넓히거나 줄여 보세요. 모서리는 접기 손잡이예요.',
    },
    {
      label: '작게 접어 두기', title: '대각선으로 접고 펴기', art: 'fold',
      body: '메모의 모서리를 대각선 반대편 모서리까지 끌면 접히면서 그쪽 화면 구석에 붙어요.',
      detail: '접힌 메모의 대각선 손잡이를 화면 안쪽으로 끌면 펼쳐져요. 두 번 클릭하거나 Enter를 눌러도 돼요.',
    },
    {
      label: '접어도 자유롭게', title: '접힌 메모도 옮겨요', art: 'foldedMove',
      body: '처음 접을 때는 화면 구석에 붙어요. 그다음에는 접힌 메모의 몸체를 잡고 원하는 곳으로 끌어 보세요.',
      detail: '몸체를 잡으면 이동, 대각선 손잡이를 잡으면 펼치기예요. 이동한 자리와 메모 내용은 자동 저장돼요.',
    },
    {
      label: '생각을 다른 언어로', title: '선택한 글을 AI로 번역', art: 'translate',
      body: '글을 쓰면 아래 가운데에 ‘번역’ 버튼이 나타나요. 번역할 글을 드래그해 선택한 뒤 버튼과 언어를 차례로 눌러요.',
      detail: '컴퓨터 기본 언어·영어 외에도 ‘추가’로 언어를 넣을 수 있어요. 처음에는 내 OpenAI API 키를 설정해 주세요. 선택한 글만 전송되며 API 이용료가 발생할 수 있어요.',
    },
  ];

  function init({ bridge, textarea, note, showToast = () => {}, initialState = {} }) {
    const app = document.querySelector('#app');
    if (!app || !note || !bridge) return { open() {}, close() {} };
    const existing = app.querySelector('.corner-tutorial-shell');
    if (existing) return existing._cornerTutorial;

    const helpPanel = document.querySelector('#help-panel');
    const helpButton = document.querySelector('#help-button');
    const shell = document.createElement('section');
    shell.className = 'corner-tutorial-shell';
    shell.hidden = true;
    shell.innerHTML = `
      <section class="corner-tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="corner-tutorial-title" aria-describedby="corner-tutorial-body corner-tutorial-detail" data-testid="tutorial-dialog">
        <header class="corner-tutorial-header">
          <span class="corner-tutorial-brand"><span aria-hidden="true">✦</span> 모서리 메모 시작하기</span>
          <button class="corner-tutorial-skip" type="button" data-testid="tutorial-skip" title="안내를 마치고 메모로 돌아가기">건너뛰기</button>
        </header>
        <div class="corner-tutorial-content">
          <div class="corner-tutorial-illustration"></div>
          <p class="corner-tutorial-eyebrow"></p>
          <h1 id="corner-tutorial-title" class="corner-tutorial-title" tabindex="-1" data-testid="tutorial-step-title"></h1>
          <p id="corner-tutorial-body" class="corner-tutorial-body"></p>
          <p id="corner-tutorial-detail" class="corner-tutorial-detail"></p>
        </div>
        <footer class="corner-tutorial-footer">
          <div class="corner-tutorial-progress" role="group" aria-label="튜토리얼 진행 상황"></div>
          <span class="corner-tutorial-step-count" role="status" aria-live="polite" aria-atomic="true"></span>
          <div class="corner-tutorial-actions">
            <button class="corner-tutorial-back" type="button" data-testid="tutorial-back">이전</button>
            <button class="corner-tutorial-next" type="button" data-testid="tutorial-next">다음 <span aria-hidden="true">→</span></button>
            <button class="corner-tutorial-finish" type="button" data-testid="tutorial-finish" hidden>메모 시작하기 <span aria-hidden="true">✓</span></button>
          </div>
        </footer>
      </section>`;
    app.append(shell);

    const dialog = shell.querySelector('.corner-tutorial-dialog');
    const title = shell.querySelector('.corner-tutorial-title');
    const content = shell.querySelector('.corner-tutorial-content');
    const nextButton = shell.querySelector('[data-testid="tutorial-next"]');
    const backButton = shell.querySelector('[data-testid="tutorial-back"]');
    const finishButton = shell.querySelector('[data-testid="tutorial-finish"]');
    const progress = shell.querySelector('.corner-tutorial-progress');
    const dots = STEPS.map((_, index) => {
      const dot = document.createElement('span');
      dot.className = 'corner-tutorial-dot';
      dot.setAttribute('aria-label', `${index + 1}단계`);
      progress.append(dot);
      return dot;
    });
    let currentState = initialState;
    let stepIndex = 0;
    let opened = false;
    let pendingFirstRun = initialState.settings?.tutorialCompleted !== true;
    let finishing = false;
    const inertStates = new Map();

    function folded() {
      return currentState.folded === true || note.hidden || app.classList.contains('is-folded');
    }

    function setBackgroundInert(active) {
      if (active) {
        for (const child of app.children) {
          if (child === shell || inertStates.has(child)) continue;
          inertStates.set(child, child.inert);
          child.inert = true;
        }
      } else {
        for (const [child, value] of inertStates) child.inert = value;
        inertStates.clear();
      }
    }

    function render(focusTitle = true) {
      const step = STEPS[stepIndex];
      shell.dataset.step = String(stepIndex + 1);
      shell.querySelector('.corner-tutorial-illustration').innerHTML = ILLUSTRATIONS[step.art];
      shell.querySelector('.corner-tutorial-eyebrow').textContent = step.label;
      title.textContent = step.title;
      shell.querySelector('.corner-tutorial-body').textContent = step.body;
      shell.querySelector('.corner-tutorial-detail').textContent = step.detail;
      shell.querySelector('.corner-tutorial-step-count').textContent = `${stepIndex + 1} / ${STEPS.length}`;
      backButton.disabled = stepIndex === 0;
      nextButton.hidden = stepIndex === STEPS.length - 1;
      finishButton.hidden = stepIndex !== STEPS.length - 1;
      dots.forEach((dot, index) => {
        dot.classList.toggle('is-current', index === stepIndex);
        if (index === stepIndex) dot.setAttribute('aria-current', 'step');
        else dot.removeAttribute('aria-current');
      });
      content.scrollTop = 0;
      if (focusTitle && !shell.hidden) title.focus({ preventScroll: true });
    }

    function syncVisibility() {
      const visible = opened && !folded();
      const wasVisible = !shell.hidden;
      shell.hidden = !visible;
      setBackgroundInert(visible);
      app.classList.toggle('has-corner-tutorial', visible);
      if (visible && !wasVisible) title.focus({ preventScroll: true });
    }

    function open() {
      if (finishing) return;
      if (helpPanel) helpPanel.hidden = true;
      helpButton?.setAttribute('aria-expanded', 'false');
      stepIndex = 0;
      opened = true;
      pendingFirstRun = false;
      render(false);
      syncVisibility();
    }

    function close({ restoreFocus = true } = {}) {
      opened = false;
      shell.hidden = true;
      setBackgroundInert(false);
      app.classList.remove('has-corner-tutorial');
      if (restoreFocus && !folded()) (helpButton || textarea)?.focus({ preventScroll: true });
    }

    async function complete() {
      if (finishing || !opened) return;
      finishing = true;
      pendingFirstRun = false;
      close();
      try {
        const result = await bridge.updatePreferences({ tutorialCompleted: true });
        if (result && typeof result === 'object') currentState = result;
      } catch {
        showToast('안내 설정을 저장하지 못했어요. 다음 실행 때 다시 표시될 수 있어요.');
      } finally { finishing = false; }
    }

    nextButton.addEventListener('click', () => {
      if (stepIndex < STEPS.length - 1) { stepIndex += 1; render(); }
    });
    backButton.addEventListener('click', () => {
      if (stepIndex > 0) { stepIndex -= 1; render(); }
    });
    shell.querySelector('[data-testid="tutorial-skip"]').addEventListener('click', complete);
    finishButton.addEventListener('click', complete);

    function onKeyDown(event) {
      if (!opened || shell.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        complete();
      } else if (event.key === 'Tab') {
        event.stopImmediatePropagation();
        const buttons = [...dialog.querySelectorAll('button:not(:disabled):not([hidden])')];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === title || !dialog.contains(active))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', (event) => {
      if (opened && !shell.hidden && !dialog.contains(event.target)) title.focus({ preventScroll: true });
    }, true);

    const reopenButton = document.createElement('button');
    reopenButton.type = 'button';
    reopenButton.className = 'corner-tutorial-reopen';
    reopenButton.dataset.testid = 'tutorial-reopen';
    reopenButton.innerHTML = '<span aria-hidden="true">✦</span> 기능 둘러보기 다시 보기 <span aria-hidden="true">→</span>';
    reopenButton.addEventListener('click', open);
    if (helpPanel) {
      const footer = helpPanel.querySelector('.help-footer');
      if (footer) footer.before(reopenButton);
      else helpPanel.append(reopenButton);
    }

    if (typeof bridge.onState === 'function') bridge.onState((next) => {
      currentState = next;
      if (pendingFirstRun && next.settings?.tutorialCompleted === true) pendingFirstRun = false;
      if (pendingFirstRun && !folded()) open();
      else syncVisibility();
    });
    const observer = new MutationObserver(() => {
      if (pendingFirstRun && !folded()) open();
      else syncVisibility();
    });
    observer.observe(note, { attributes: true, attributeFilter: ['hidden'] });
    observer.observe(app, { attributes: true, attributeFilter: ['class'] });

    const api = { open, close };
    shell._cornerTutorial = api;
    if (pendingFirstRun && !folded()) open();
    return api;
  }

  window.CornerTutorial = Object.freeze({ init });
})();
