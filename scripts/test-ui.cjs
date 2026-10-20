const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

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
  const context = await browser.newContext({viewport: {width: 392, height: 460}});
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
    assert.deepEqual(await page.locator('.window-controls > button').evaluateAll(buttons => buttons.map(button => button.id)), ['help-button', 'add-note-button', 'hide-button']);
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
    console.log(`UI checks: ${passed} passed`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
