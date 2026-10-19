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
    await byId('note-editor').waitFor({state: 'visible'});
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
    await dragCorner('top-left', .2);
    assert.equal(await byId('note-editor').isVisible(), true);
    await dragCorner('top-left', .95, true);
    assert.equal(await byId('note-editor').isVisible(), true);
    pass('short drags and Escape cancel a fold');

    for (const corner of corners) {
      await dragCorner(corner);
      await byId('folded-note').waitFor({state: 'visible'});
      const box = await byId('folded-note').boundingBox();
      const destination = opposite[corner];
      const grab = {x: box.x + box.width * (destination.endsWith('right') ? .75 : .25), y: box.y + box.height * (destination.startsWith('bottom') ? .75 : .25)};
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await page.mouse.move(grab.x + (destination.endsWith('right') ? -90 : 90), grab.y + (destination.startsWith('bottom') ? -90 : 90), {steps: 10});
      await page.mouse.up();
      await byId('note-editor').waitFor({state: 'visible'});
      assert.equal(await byId('note-editor').inputValue(), text);
      pass(`${corner} folds diagonally and reverses with an inward drag`);
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
    console.log(`UI checks: ${passed} passed`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
