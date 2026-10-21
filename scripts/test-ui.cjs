const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

function installDelayedFoldedBridge() {
  const copy = value => JSON.parse(JSON.stringify(value));
  const listeners = new Set();
  const anchor = {x: 12, y: 12, width: 88, height: 88};
  let state = {
    text: '접힌 메모의 내용은 그대로예요.', color: 'butter', folded: true,
    corner: 'top-left', alwaysOnTop: true, bounds: {x: 180, y: 160, width: 88, height: 88},
    settings: {translationLanguages: [], tutorialCompleted: true}, savedAt: null,
  };
  let interaction;
  let sequence = 0;
  let releaseEnd;
  const endGate = new Promise(resolve => { releaseEnd = resolve; });
  const calls = {end: 0, returned: 0, staleEnds: 0};
  window.cornerNote = {
    async getState() { return copy(state); },
    async getTranslationSettings() { return {configured: false, canRememberKey: false}; },
    async saveNote() { return {savedAt: new Date().toISOString()}; },
    async beginInteraction() { interaction = `delayed-${++sequence}`; return interaction; },
    async updateInteraction({id}) {
      if (id !== interaction) throw new Error('진행 중인 창 동작이 아닙니다.');
      return copy(state.bounds);
    },
    async endInteraction({id}) {
      calls.end += 1;
      await endGate;
      if (id !== interaction) { calls.staleEnds += 1; throw new Error('진행 중인 창 동작이 아닙니다.'); }
      interaction = null;
      return copy(state);
    },
    async returnFoldedNote() {
      calls.returned += 1;
      interaction = null;
      state.bounds = copy(anchor);
      for (const listener of listeners) listener(copy(state));
      return copy(state);
    },
    onState(callback) { listeners.add(callback); return () => listeners.delete(callback); },
  };
  window.__delayedFoldedFixture = {calls, releaseEnd, state: () => copy(state), anchor};
}

function installDeleteBridge() {
  const state = {
    noteId: 'delete-fixture', noteCount: 1, text: '삭제 확인 전에는 이 메모를 보존해요.',
    color: 'butter', folded: false, corner: 'top-left', alwaysOnTop: true,
    bounds: {x: 0, y: 0, width: 392, height: 460},
    settings: {translationLanguages: [], tutorialCompleted: true}, savedAt: null,
  };
  let fail = true;
  let release;
  const calls = {deletes: 0};
  window.cornerNote = {
    async getState() { return structuredClone(state); },
    async getTranslationSettings() { return {configured: false, canRememberKey: false}; },
    async saveNote(value) { Object.assign(state, value); return {savedAt: new Date().toISOString()}; },
    async activateNote() {},
    async deleteNote() {
      calls.deletes += 1;
      if (fail) throw new Error('fixture: disk write failed');
      return new Promise(resolve => { release = () => resolve({deleted: true}); });
    },
    onState() { return () => {}; },
  };
  window.__deleteFixture = {calls, succeed: () => { fail = false; }, release: () => release()};
}

async function main() {
  const renderer = path.resolve(__dirname, '..', 'renderer');
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const filename = path.resolve(renderer, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(`${renderer}${path.sep}`) || !fs.existsSync(filename)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript'}[path.extname(filename)] || 'application/octet-stream');
    fs.createReadStream(filename).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({headless: true, executablePath});
  const context = await browser.newContext({viewport: {width: 392, height: 460}, locale: 'ko-KR'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const byId = id => page.getByTestId(id);
  let passed = 0;
  const pass = label => console.log(`ok ${++passed} - ${label}`);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await byId('tutorial-skip').waitFor({state: 'visible'});
    await byId('tutorial-skip').click();
    await byId('note-editor').waitFor({state: 'visible'});
    assert.deepEqual(await page.locator('.window-controls > button').evaluateAll(buttons => buttons.map(button => button.id)), ['help-button', 'add-note-button', 'hide-button', 'delete-note-button']);
    assert.equal(await byId('add-note-button').count(), 1);
    const plusPlacement = await byId('add-note-button').evaluate(button => {
      const bounds = button.getBoundingClientRect();
      const help = document.querySelector('#help-button').getBoundingClientRect();
      const hide = document.querySelector('#hide-button').getBoundingClientRect();
      const top = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return {between: help.right <= bounds.left && bounds.right <= hide.left, uncovered: button === top || button.contains(top), enabled: !button.disabled};
    });
    assert.deepEqual(plusPlacement, {between: true, uncovered: true, enabled: true});
    pass('one visible and enabled plus button sits between help and hide controls');
    const text = '오늘의 작은 메모 🌿\n한글과 English, 줄바꿈을 기억해요.\n<script>window.injected = true</script>';
    await byId('note-editor').fill(text);
    await page.waitForFunction(value => Object.values(localStorage).some(raw => raw.includes(value)), '오늘의 작은 메모');
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    assert.equal(await byId('note-editor').inputValue(), text);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    pass('Korean, emoji, newlines and literal HTML survive autosave and reload');

    const customTitle = '나의 메모 📝 <b>할 일</b>';
    await page.locator('#note-title').click();
    const titleInput = page.locator('#note-title-input');
    assert.equal(await titleInput.evaluate(input => input === document.activeElement), true);
    assert.equal(await titleInput.evaluate(input => input.maxLength), 120);
    await titleInput.fill(customTitle);
    await page.keyboard.press('Enter');
    await titleInput.waitFor({state: 'hidden'});
    assert.equal(await page.locator('#note-title').textContent(), customTitle);
    assert.equal(await page.locator('#note-title b').count(), 0, 'custom titles are literal text');
    assert.equal(await byId('note-editor').inputValue(), text);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    assert.equal(await page.locator('#note-title').textContent(), customTitle);
    await page.locator('#note-title').click();
    await titleInput.fill('취소할 제목');
    await page.keyboard.press('Escape');
    await titleInput.waitFor({state: 'hidden'});
    assert.equal(await page.locator('#note-title').textContent(), customTitle);
    await page.locator('#note-title').click();
    await titleInput.fill('');
    await page.keyboard.press('Enter');
    await titleInput.waitFor({state: 'hidden'});
    assert.equal(await page.locator('#note-title').textContent(), '모서리 메모');
    await page.locator('#note-title').click();
    await titleInput.fill(customTitle);
    await byId('note-editor').click();
    await titleInput.waitFor({state: 'hidden'});
    assert.equal(await page.locator('#note-title').textContent(), customTitle);
    await page.locator('#note-title').click();
    await titleInput.fill('한글 조합 중인 제목');
    await titleInput.dispatchEvent('compositionstart');
    await page.keyboard.press('Enter');
    assert.equal(await titleInput.isVisible(), true, 'IME confirmation must not submit the title while composing');
    await titleInput.dispatchEvent('compositionend');
    await page.keyboard.press('Enter');
    await titleInput.waitFor({state: 'hidden'});
    assert.equal(await page.locator('#note-title').textContent(), '한글 조합 중인 제목');
    assert.equal(await byId('note-editor').inputValue(), text);
    pass('title click supports literal custom text, persistence, Enter, Escape, blank fallback, blur and Korean IME without changing note content');

    await byId('color-sky').click();
    await page.waitForFunction(() => Object.values(localStorage).some(raw => raw.includes('sky')));
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    assert.equal(await byId('color-sky').getAttribute('aria-pressed'), 'true');
    pass('selected paper color persists across reload');

    assert.equal(await byId('always-on-top-button').getAttribute('aria-pressed'), 'true');
    await byId('always-on-top-button').click();
    assert.equal(await byId('always-on-top-button').getAttribute('aria-pressed'), 'false');
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    assert.equal(await byId('always-on-top-button').getAttribute('aria-pressed'), 'false');
    assert.equal(await byId('note-editor').inputValue(), text);
    await byId('always-on-top-button').click();
    pass('pin button toggles and persists without changing note content');

    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const opposite = {'top-left': 'bottom-right', 'top-right': 'bottom-left', 'bottom-left': 'top-right', 'bottom-right': 'top-left'};
    async function dragCorner(corner, fraction = .95, cancel = false) {
      const start = await byId(`fold-handle-${corner}`).boundingBox();
      const end = await byId(`fold-handle-${opposite[corner]}`).boundingBox();
      assert.ok(start && end, 'all corner handles are visible');
      const from = {x: start.x + start.width / 2, y: start.y + start.height / 2};
      const to = {x: end.x + end.width / 2, y: end.y + end.height / 2};
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, {steps: 12});
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    }
    await dragCorner('top-left', .95, true);
    assert.equal(await byId('note-editor').isVisible(), true);
    pass('Escape cancels a fold even beyond the completion threshold');

    for (const corner of corners) {
      await dragCorner(corner, .32);
      assert.equal(await byId('note-editor').isVisible(), true, `${corner}: less than one third must stay unfolded`);
      await dragCorner(corner, .36);
      await byId('folded-note').waitFor({state: 'visible'});
      assert.equal(await page.locator('#app').getAttribute('data-corner'), opposite[corner]);
      const box = await byId('unfold-handle').boundingBox();
      const destination = opposite[corner];
      const grab = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await page.mouse.move(grab.x + (destination.endsWith('right') ? -90 : 90), grab.y + (destination.startsWith('bottom') ? -90 : 90), {steps: 10});
      await page.mouse.up();
      await byId('note-editor').waitFor({state: 'visible'});
      assert.equal(await byId('note-editor').inputValue(), text);
      pass(`${corner} cancels below one third, folds just above one third and reverses with an inward drag`);
    }

    await dragCorner('bottom-right');
    await byId('folded-note').waitFor({state: 'visible'});
    await byId('folded-note').focus();
    await page.keyboard.press('Enter');
    await byId('note-editor').waitFor({state: 'visible'});
    pass('folded note unfolds with keyboard Enter');

    const sample = '작은 생각을\n잊지 않도록.\n\n이번 주에 하고 싶은 일\n\n  산책하며 떠오른 아이디어 적기\n  책상 위에 작은 식물 두기\n  나에게 필요한 여백 남기기';
    await byId('note-editor').fill(sample);
    await byId('color-butter').click();
    await page.waitForTimeout(450);
    fs.mkdirSync(path.resolve(__dirname, '..', 'test-results'), {recursive: true});
    await page.screenshot({path: path.resolve(__dirname, '..', 'test-results', 'note-expanded.png')});
    await dragCorner('top-left');
    await byId('folded-note').waitFor({state: 'visible'});
    await page.screenshot({path: path.resolve(__dirname, '..', 'test-results', 'note-folded.png')});
    assert.deepEqual(errors, [], 'renderer has no uncaught errors');
    pass('expanded and folded screenshots captured without renderer errors');

    await byId('folded-note').focus();
    await page.keyboard.press('Enter');
    await page.setViewportSize({width: 1280, height: 900});
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    const appBox = () => page.locator('#app').boundingBox();
    const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} vs ${expected}`);
    async function dragControl(control, dx, dy, cancel = false) {
      const box = await control.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, {steps: 8});
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
      await page.waitForTimeout(80);
    }
    async function dragTitlebar(dx, dy, cancel = false) {
      const header = await page.locator('.titlebar').boundingBox();
      const point = {x: header.x + 12, y: header.y + header.height - 8};
      assert.equal(await page.evaluate(({x, y}) => {
        const target = document.elementFromPoint(x, y);
        return Boolean(target?.closest('.titlebar') && !target.closest('button, input'));
      }, point), true, 'grab a visible, noninteractive part of the titlebar');
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + dx, point.y + dy, {steps: 8});
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
      await page.waitForTimeout(80);
    }
    const longText = Array.from({length: 100}, (_, index) => `긴 메모 ${index + 1} · 스크롤 중에도 옮길 수 있어요.`).join('\n');
    await byId('note-editor').fill(longText);
    const editorScroll = await byId('note-editor').evaluate(editor => {
      editor.scrollTop = editor.scrollHeight;
      return editor.scrollTop;
    });
    assert.ok(editorScroll > 0, 'regression editor is actually scrolled down');
    const beforeScrolledDrag = await appBox();
    await dragTitlebar(54, 36);
    let movedExpanded = await appBox();
    closeTo(movedExpanded.x, beforeScrolledDrag.x + 54, 'scrolled note moves horizontally');
    closeTo(movedExpanded.y, beforeScrolledDrag.y + 36, 'scrolled note moves vertically');
    closeTo(movedExpanded.width, beforeScrolledDrag.width, 'expanded movement preserves width');
    closeTo(movedExpanded.height, beforeScrolledDrag.height, 'expanded movement preserves height');
    assert.equal(await byId('note-editor').evaluate(editor => editor.scrollTop), editorScroll, 'movement preserves the editor scroll position');
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0);
    assert.equal(await byId('note-editor').inputValue(), longText);
    await dragTitlebar(24, 20, true);
    const cancelledMove = await appBox();
    closeTo(cancelledMove.x, movedExpanded.x, 'Escape restores expanded x');
    closeTo(cancelledMove.y, movedExpanded.y, 'Escape restores expanded y');
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    const restoredMove = await appBox();
    closeTo(restoredMove.x, movedExpanded.x, 'expanded x survives reload');
    closeTo(restoredMove.y, movedExpanded.y, 'expanded y survives reload');
    assert.equal(await byId('note-editor').inputValue(), longText);
    await byId('note-editor').fill(sample);
    pass('expanded titlebar drag works with a long scrolled editor, preserves content and scroll, supports Escape and persists position');
    const beforeResize = await appBox();
    for (const edge of ['left', 'right']) {
      await byId(`resize-${edge}`).hover();
      assert.equal(await byId(`resize-${edge}`).evaluate(el => getComputedStyle(el).cursor), 'ew-resize');
    }
    for (const edge of ['top', 'bottom']) {
      await byId(`resize-${edge}`).hover();
      assert.equal(await byId(`resize-${edge}`).evaluate(el => getComputedStyle(el).cursor), 'ns-resize');
    }
    await dragControl(byId('resize-right'), 96, 0);
    let box = await appBox();
    closeTo(box.width, beforeResize.width + 96, 'right edge grows width');
    closeTo(box.x, beforeResize.x, 'right resize keeps left edge');
    await dragControl(byId('resize-left'), 20, 0);
    let next = await appBox();
    closeTo(next.x + next.width, box.x + box.width, 'left resize keeps right edge');
    closeTo(next.width, box.width - 20, 'left edge shrinks width');
    await dragControl(byId('resize-top'), 0, 30);
    box = await appBox();
    closeTo(box.y + box.height, next.y + next.height, 'top resize keeps bottom edge');
    await dragControl(byId('resize-bottom'), 0, 70);
    next = await appBox();
    closeTo(next.height, box.height + 70, 'bottom edge grows height');
    await dragControl(byId('resize-right'), 50, 0, true);
    box = await appBox();
    closeTo(box.width, next.width, 'Escape restores pre-resize size');
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    box = await appBox();
    closeTo(box.width, next.width, 'resized width survives reload');
    closeTo(box.height, next.height, 'resized height survives reload');
    pass('four side strips resize with fixed opposite edges, Escape cancels, dimensions persist');

    const expandedSize = {width: box.width, height: box.height};
    await dragCorner('top-left');
    await byId('folded-note').waitFor({state: 'visible'});
    const snapped = await appBox();
    closeTo(snapped.x, 1280 - 88 - 12, 'fresh fold snaps to right screen corner');
    closeTo(snapped.y, 900 - 88 - 12, 'fresh fold snaps to bottom screen corner');
    const body = await byId('folded-note').boundingBox();
    await page.mouse.move(body.x + body.width * .87, body.y + body.height * .87);
    await page.mouse.down();
    await page.mouse.move(body.x + body.width * .87 - 170, body.y + body.height * .87 - 140, {steps: 12});
    await page.mouse.up();
    await page.waitForTimeout(80);
    assert.equal(await byId('folded-note').isVisible(), true);
    let moved = await appBox();
    closeTo(moved.x, snapped.x - 170, 'folded body moves horizontally');
    closeTo(moved.y, snapped.y - 140, 'folded body moves vertically');
    await page.reload();
    await byId('folded-note').waitFor({state: 'visible'});
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
    box = await appBox();
    closeTo(box.x, moved.x, 'moved folded x survives reload');
    closeTo(box.y, moved.y, 'moved folded y survives reload');
    await byId('folded-note').dblclick({position: {x: body.width * .87, y: body.height * .87}});
    await page.waitForFunction(({x, y}) => {
      const box = document.querySelector('#app').getBoundingClientRect();
      return document.querySelector('#app').classList.contains('is-folded') && Math.abs(box.x - x) <= 1 && Math.abs(box.y - y) <= 1;
    }, snapped);
    assert.equal(await byId('folded-note').isVisible(), true);
    assert.equal(await byId('note-editor').isVisible(), false);
    assert.equal(await page.locator('#toast').evaluate(element => element.hidden), true, 'returning a folded note must not leave an error notification');
    box = await appBox();
    closeTo(box.x, snapped.x, 'double-click restores the first folded x');
    closeTo(box.y, snapped.y, 'double-click restores the first folded y');
    assert.equal(await byId('note-editor').inputValue(), sample);
    assert.equal(await byId('color-butter').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await byId('folded-note').waitFor({state: 'visible'});
    box = await appBox();
    closeTo(box.x, snapped.x, 'returned anchor x persists after reload');
    closeTo(box.y, snapped.y, 'returned anchor y persists after reload');
    await byId('folded-note').focus();
    await page.keyboard.press('Enter');
    await byId('note-editor').waitFor({state: 'visible'});
    box = await appBox();
    closeTo(box.width, expandedSize.width, 'unfold preserves resized width');
    closeTo(box.height, expandedSize.height, 'unfold preserves resized height');
    closeTo(box.x + box.width, snapped.x + snapped.width, 'unfold anchors restored right edge');
    closeTo(box.y + box.height, snapped.y + snapped.height, 'unfold anchors restored bottom edge');
    assert.deepEqual(errors, [], 'new interactions do not throw renderer errors');
    pass('moved folded note survives reload, double-click returns to its first anchor without unfolding or changing content, and Enter unfolds');

    const delayedContext = await browser.newContext({viewport: {width: 88, height: 88}, locale: 'ko-KR'});
    await delayedContext.addInitScript(installDelayedFoldedBridge);
    const delayed = await delayedContext.newPage();
    delayed.on('pageerror', error => errors.push(error.message));
    try {
      await delayed.goto(`http://127.0.0.1:${server.address().port}/`);
      await delayed.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
      await delayed.getByTestId('folded-note').dblclick({position: {x: 14, y: 14}});
      await delayed.waitForFunction(() => window.__delayedFoldedFixture.calls.end === 1);
      await delayed.waitForTimeout(80);
      assert.equal(await delayed.evaluate(() => window.__delayedFoldedFixture.calls.returned), 0, 'double-click must wait until the native move has finished before returning the note');
      await delayed.getByTestId('folded-note').dblclick({position: {x: 14, y: 14}});
      assert.deepEqual(await delayed.evaluate(() => ({end: window.__delayedFoldedFixture.calls.end, returned: window.__delayedFoldedFixture.calls.returned})), {end: 1, returned: 0}, 'rapid repeat clicks must not start a second move or bypass the pending completion');
      await delayed.evaluate(() => window.__delayedFoldedFixture.releaseEnd());
      await delayed.waitForFunction(() => window.__delayedFoldedFixture.calls.returned === 1);
      // Let the rejected/successful delayed IPC completion reach its UI handler.
      await delayed.waitForTimeout(80);
      const outcome = await delayed.evaluate(() => ({
        state: window.__delayedFoldedFixture.state(),
        anchor: window.__delayedFoldedFixture.anchor,
        toastHidden: document.querySelector('#toast').hidden,
        toastVisible: Boolean(document.querySelector('#toast').getClientRects().length),
      }));
      assert.equal(outcome.state.folded, true);
      assert.deepEqual(outcome.state.bounds, outcome.anchor);
      assert.equal(outcome.state.text, '접힌 메모의 내용은 그대로예요.');
      assert.equal(outcome.toastHidden, true, 'a delayed folded-move completion must not leave a clipped error box after double-click');
      assert.equal(outcome.toastVisible, false);
      assert.equal(await delayed.evaluate(() => window.__delayedFoldedFixture.calls.staleEnds), 0, 'returning must not invalidate a pending movement token');
      assert.deepEqual(errors, [], 'delayed gesture completion does not throw renderer errors');
      pass('double-click waits for a delayed folded movement to finish and returns without a clipped notification');
    } finally { await delayedContext.close(); }
    const deleteContext = await browser.newContext({viewport: {width: 392, height: 460}, locale: 'ko-KR'});
    await deleteContext.addInitScript(installDeleteBridge);
    const deleting = await deleteContext.newPage();
    deleting.on('pageerror', error => errors.push(error.message));
    try {
      await deleting.goto(`http://127.0.0.1:${server.address().port}/`);
      await deleting.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'));
      const control = id => deleting.getByTestId(id);
      const originalText = await control('note-editor').inputValue();
      const placement = await control('delete-note-button').evaluate(button => {
        const bounds = button.getBoundingClientRect();
        const hide = document.querySelector('#hide-button').getBoundingClientRect();
        const top = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return {rightOfHide: hide.right <= bounds.left, uncovered: button === top || button.contains(top), enabled: !button.disabled};
      });
      assert.deepEqual(placement, {rightOfHide: true, uncovered: true, enabled: true});
      await control('delete-note-button').click();
      await control('delete-note-dialog').waitFor({state: 'visible'});
      assert.equal(await deleting.locator('#delete-note-title').textContent(), '정말 메모를 삭제할까요?');
      assert.equal(await deleting.evaluate(() => document.activeElement.id), 'delete-note-cancel');
      fs.mkdirSync(path.resolve(__dirname, '..', 'test-results'), {recursive: true});
      await deleting.screenshot({path: path.resolve(__dirname, '..', 'test-results', 'delete-note-dialog.png')});
      await control('delete-note-cancel').click();
      await control('delete-note-dialog').waitFor({state: 'hidden'});
      await control('delete-note-button').click();
      await control('delete-note-dialog').waitFor({state: 'visible'});
      await deleting.keyboard.press('Escape');
      await control('delete-note-dialog').waitFor({state: 'hidden'});
      await control('delete-note-button').click();
      await control('delete-note-dialog').waitFor({state: 'visible'});
      await deleting.mouse.click(10, 10);
      await control('delete-note-dialog').waitFor({state: 'hidden'});
      assert.equal(await deleting.evaluate(() => window.__deleteFixture.calls.deletes), 0);
      assert.equal(await control('note-editor').inputValue(), originalText);
      pass('delete button sits after hide, asks the exact question, and No, Escape or backdrop preserve the memo');

      await control('delete-note-button').click();
      await control('delete-note-confirm').click();
      await control('delete-note-error').waitFor({state: 'visible'});
      assert.equal(await control('delete-note-dialog').isVisible(), true);
      assert.equal(await control('note-editor').inputValue(), originalText);
      assert.equal(await deleting.evaluate(() => window.__deleteFixture.calls.deletes), 1);
      await deleting.evaluate(() => window.__deleteFixture.succeed());
      await control('delete-note-confirm').click();
      await deleting.waitForFunction(() => window.__deleteFixture.calls.deletes === 2);
      assert.equal(await control('delete-note-confirm').isDisabled(), true);
      assert.equal(await control('delete-note-cancel').isDisabled(), true);
      await control('delete-note-confirm').dispatchEvent('click');
      assert.equal(await deleting.evaluate(() => window.__deleteFixture.calls.deletes), 2);
      await deleting.evaluate(() => window.__deleteFixture.release());
      await deleting.waitForFunction(() => document.querySelector('#app').hidden);
      assert.deepEqual(errors, [], 'delete confirmation and retry do not throw renderer errors');
      pass('failed deletion keeps the memo and offers retry; pending confirmation cannot delete twice, and success hides the window content');
    } finally { await deleteContext.close(); }
    console.log(`UI checks: ${passed} passed`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
