'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { _electron: electron } = require('playwright');

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['en-US', 'ko-KR', 'ja-JP', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt', 'it'];
const SCENARIOS = ['01-writing', '02-overlapping-notes', '03-folding-guide', '04-ai-settings'];
const CAPTURE_METHOD = 'Windows primary desktop via System.Drawing.Graphics.CopyFromScreen';

// These are fictional note contents written through the real app. They are not
// marketing overlays, translated AI results, or data from an existing profile.
const EXAMPLES = {
  'en-US': [
    "A little plan for the week\n\nMonday\n• Read a chapter\n• Take a walk\n• Write down one new idea\n\nA thought to keep\nOne small step is enough for today.\n\nSample note",
    "Ideas for a quiet afternoon\n\nA book, a cup of tea,\nand a few thoughts to remember.\n\nSample note",
    "Things to make\n\n• A reading list\n• A sketch of the garden\n• A playlist for the weekend\n\nSample note",
  ],
  'ko-KR': [
    '이번 주의 작은 계획\n\n월요일\n• 책 한 장 읽기\n• 산책하기\n• 새로운 생각 하나 적기\n\n기억하고 싶은 생각\n오늘은 작은 한 걸음이면 충분해요.\n\n예시 메모',
    '조용한 오후의 아이디어\n\n책 한 권, 차 한 잔,\n그리고 기억하고 싶은 생각들.\n\n예시 메모',
    '만들고 싶은 것들\n\n• 읽고 싶은 책 목록\n• 정원 스케치\n• 주말에 들을 노래 목록\n\n예시 메모',
  ],
  'ja-JP': [
    '今週の小さな予定\n\n月曜日\n• 本を一章読む\n• 散歩する\n• 新しいアイデアを一つ書く\n\n覚えておきたいこと\n今日は小さな一歩で十分。\n\nサンプルメモ',
    '静かな午後のアイデア\n\n一冊の本と一杯のお茶、\nそして覚えておきたい思い。\n\nサンプルメモ',
    '作ってみたいもの\n\n• 読書リスト\n• 庭のスケッチ\n• 週末のプレイリスト\n\nサンプルメモ',
  ],
  'zh-Hans': [
    '本周的小计划\n\n星期一\n• 读一章书\n• 出门散步\n• 写下一个新想法\n\n想记住的一句话\n今天，向前一小步就足够了。\n\n示例便笺',
    '安静午后的灵感\n\n一本书、一杯茶，\n还有想记住的点滴想法。\n\n示例便笺',
    '想做的事\n\n• 整理阅读书单\n• 画一张花园草图\n• 制作周末歌单\n\n示例便笺',
  ],
  'zh-Hant': [
    '本週的小計畫\n\n星期一\n• 讀一章書\n• 出門散步\n• 寫下一個新想法\n\n想記住的一句話\n今天，向前一小步就足夠了。\n\n範例便箋',
    '安靜午後的靈感\n\n一本書、一杯茶，\n還有想記住的點滴想法。\n\n範例便箋',
    '想做的事\n\n• 整理閱讀書單\n• 畫一張花園草圖\n• 製作週末歌單\n\n範例便箋',
  ],
  es: [
    'Un pequeño plan para la semana\n\nLunes\n• Leer un capítulo\n• Dar un paseo\n• Anotar una idea nueva\n\nUn pensamiento para recordar\nHoy basta con un pequeño paso.\n\nNota de ejemplo',
    'Ideas para una tarde tranquila\n\nUn libro, una taza de té\ny algunos pensamientos para guardar.\n\nNota de ejemplo',
    'Cosas que quiero hacer\n\n• Una lista de lecturas\n• Un boceto del jardín\n• Una lista de música para el fin de semana\n\nNota de ejemplo',
  ],
  fr: [
    'Un petit programme pour la semaine\n\nLundi\n• Lire un chapitre\n• Faire une promenade\n• Noter une nouvelle idée\n\nUne pensée à garder\nUn petit pas suffit pour aujourd’hui.\n\nExemple de note',
    'Idées pour un après-midi calme\n\nUn livre, une tasse de thé\net quelques pensées à garder.\n\nExemple de note',
    'Des choses à créer\n\n• Une liste de lectures\n• Un croquis du jardin\n• Une sélection musicale pour le week-end\n\nExemple de note',
  ],
  de: [
    'Ein kleiner Plan für die Woche\n\nMontag\n• Ein Kapitel lesen\n• Spazieren gehen\n• Eine neue Idee notieren\n\nEin Gedanke zum Behalten\nEin kleiner Schritt reicht für heute.\n\nBeispielnotiz',
    'Ideen für einen ruhigen Nachmittag\n\nEin Buch, eine Tasse Tee\nund ein paar Gedanken zum Behalten.\n\nBeispielnotiz',
    'Dinge, die ich gestalten möchte\n\n• Eine Leseliste\n• Eine Gartenskizze\n• Eine Musikliste fürs Wochenende\n\nBeispielnotiz',
  ],
  pt: [
    'Um pequeno plano para a semana\n\nSegunda-feira\n• Ler um capítulo\n• Fazer uma caminhada\n• Anotar uma ideia nova\n\nUm pensamento para guardar\nUm pequeno passo basta por hoje.\n\nNota de exemplo',
    'Ideias para uma tarde tranquila\n\nUm livro, uma xícara de chá\ne alguns pensamentos para guardar.\n\nNota de exemplo',
    'Coisas que quero criar\n\n• Uma lista de leitura\n• Um desenho do jardim\n• Uma seleção de músicas para o fim de semana\n\nNota de exemplo',
  ],
  it: [
    'Un piccolo programma per la settimana\n\nLunedì\n• Leggere un capitolo\n• Fare una passeggiata\n• Annotare una nuova idea\n\nUn pensiero da conservare\nPer oggi basta un piccolo passo.\n\nNota di esempio',
    'Idee per un pomeriggio tranquillo\n\nUn libro, una tazza di tè\ne qualche pensiero da conservare.\n\nNota di esempio',
    'Cose che vorrei creare\n\n• Una lista di letture\n• Uno schizzo del giardino\n• Una playlist per il fine settimana\n\nNota di esempio',
  ],
};

function pngDimensions(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'A real PNG capture is required.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function parseOptions(args) {
  const outputArgument = args.find(value => value.startsWith('--output='));
  const localesArgument = args.find(value => value.startsWith('--locales='));
  const checkUi = args.includes('--check-ui');
  const unknown = args.filter(value => value !== outputArgument && value !== localesArgument && value !== '--check-ui');
  if (unknown.length) throw new Error(`Unknown screenshot arguments: ${unknown.join(', ')}`);
  const locales = localesArgument ? localesArgument.slice('--locales='.length).split(',') : [...LOCALES];
  if (!locales.length || locales.some(locale => !LOCALES.includes(locale)) || new Set(locales).size !== locales.length) {
    throw new Error('Choose distinct supported locales for screenshot capture.');
  }
  return { output: path.resolve(outputArgument ? outputArgument.slice('--output='.length) : path.join(ROOT, 'dist', 'store-listing-materials')), locales, checkUi };
}

async function runDisplay(action, statePath, outputPath) {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'set-store-capture-display.ps1'), '-Action', action, '-StatePath', statePath];
  if (outputPath) args.push('-OutputPath', outputPath);
  const { stdout } = await execFileAsync('powershell.exe', args, { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 });
  try { return JSON.parse(stdout.trim().replace(/^\uFEFF/, '')); }
  catch { throw new Error(`The Windows ${action} capture helper did not return JSON: ${stdout.slice(0, 1000)}`); }
}

async function ready(page) {
  page.setDefaultTimeout(15000);
  await page.waitForFunction(() => typeof window.cornerNote?.getState === 'function' && !document.querySelector('#app').classList.contains('is-loading'));
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function showAt(application, page, bounds) {
  const window = await application.browserWindow(page);
  await window.evaluate((window, bounds) => { window.setBounds(bounds); window.show(); window.moveTop(); window.focus(); }, bounds);
  await page.waitForFunction(({width, height}) => innerWidth === width && innerHeight === height, {width: bounds.width, height: bounds.height});
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  // Desktop composition and native shadows update after renderer frames.
  await new Promise(resolve => setTimeout(resolve, 250));
}

async function main(args = process.argv.slice(2)) {
  const { output, locales, checkUi } = parseOptions(args);
  if (process.platform !== 'win32' && !checkUi) throw new Error('Publication screenshots must be captured on the actual Windows desktop. Use --check-ui only for non-publishing local UI checks.');
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corner-note-store-capture-'));
  const displayStatePath = path.join(temporaryRoot, 'display-state.json');
  const screenshotRoot = path.join(output, 'assets', 'screenshots');
  let displayPrepared = false;
  let application;
  let activePage;
  let externalAiRequests = 0;
  const errors = [];
  const screenshots = [];
  const sourceVersion = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
  const sourceCommit = process.env.GITHUB_SHA || (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim();

  async function closeApplication() {
    if (!application) return;
    const current = application;
    application = null;
    try {
      const closed = current.waitForEvent('close', { timeout: 15000 });
      await activePage.evaluate(() => window.cornerNote.quit()).catch(() => {});
      await closed;
    } catch {
      await current.close().catch(() => {});
      throw new Error('The screenshot app did not close cleanly.');
    }
  }

  async function record(locale, scenario, page) {
    await settle(page);
    const state = await page.evaluate(() => window.cornerNote.getState());
    const windows = await application.evaluate(async ({BrowserWindow}) => Promise.all(BrowserWindow.getAllWindows().filter(window => window.isVisible()).map(async window => {
      const state = await window.webContents.executeJavaScript('window.cornerNote.getState()');
      return { bounds: window.getBounds(), folded: state.folded, color: state.color, text: state.text };
    })));
    if (checkUi) {
      console.log(`UI capture sequence verified: ${locale}/${scenario} (${windows.length} actual note window(s)); no publication image produced.`);
      return;
    }
    const filename = path.posix.join('assets', 'screenshots', locale, `${scenario}.png`);
    const destination = path.join(output, ...filename.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const captured = await runDisplay('Capture', displayStatePath, destination);
    const bytes = await fs.readFile(destination);
    const {width, height} = pngDimensions(bytes);
    assert.ok(width >= 1366 && height >= 768 && width <= 3840 && height <= 2160, 'Actual desktop capture must meet Store screenshot dimensions.');
    assert.ok(bytes.length < 50 * 1024 * 1024, 'Store screenshot exceeds 50 MB.');
    assert.equal(captured.width, width);
    assert.equal(captured.height, height);
    screenshots.push({locale, file: filename, width, height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), method: CAPTURE_METHOD, scenario, uiLocale: state.uiLocale, windows});
    console.log(`Captured real Windows desktop: ${filename} (${width}x${height}).`);
  }

  try {
    if (!checkUi) {
      // The helper saves the original mode before attempting any change, so
      // Restore also runs if a Prepare operation fails after changing the mode.
      displayPrepared = true;
      await runDisplay('Prepare', displayStatePath);
      await fs.rm(screenshotRoot, { recursive: true, force: true });
      await fs.mkdir(screenshotRoot, { recursive: true });
    }
    for (const locale of locales) {
      const profile = path.join(temporaryRoot, `profile-${locale}`);
      await fs.mkdir(profile, { recursive: true });
      const state = {
        version: 2, notes: [{id: 'store-example-primary', text: EXAMPLES[locale][0], color: 'butter', savedAt: null, window: {folded: false, corner: 'top-right', expandedBounds: {x: 100, y: 70, width: 520, height: 580}}}],
        settings: {translationLanguages: [], tutorialCompleted: true}, alwaysOnTop: true, activeNoteId: 'store-example-primary', noteOrder: ['store-example-primary'],
      };
      await fs.writeFile(path.join(profile, 'note-state.json'), `${JSON.stringify(state, null, 2)}\n`);
      application = await electron.launch({
        executablePath: require('electron'),
        chromiumSandbox: process.env.ELECTRON_TEST_NO_SANDBOX !== '1',
        args: [ROOT, `--user-data-dir=${profile}`, `--test-system-language=${locale}`, '--disable-gpu', ...(process.env.ELECTRON_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])],
        env: {...process.env, CORNER_NOTE_E2E: '1'}, timeout: 30000,
      });
      application.on('window', page => page.on('pageerror', error => errors.push({locale, message: error.message})));
      activePage = await ready(await application.firstWindow());
      activePage.on('pageerror', error => errors.push({locale, message: error.message}));
      // Prevent any live provider request. No key is supplied or substituted.
      await application.evaluate(({session, app}) => {
        app._storeCaptureRequests = [];
        session.defaultSession.webRequest.onBeforeRequest({urls: ['http://*/*', 'https://*/*']}, (details, callback) => {
          app._storeCaptureRequests.push(new URL(details.url).hostname);
          callback({cancel: true});
        });
      });
      const area = await application.evaluate(({screen}) => screen.getPrimaryDisplay().workArea);
      const width = Math.max(360, Math.min(600, Math.floor(area.width * .43)));
      const height = Math.max(460, Math.min(660, Math.floor(area.height * .64)));
      const primaryBounds = {x: area.x + Math.floor((area.width - width) / 2), y: area.y + Math.floor(area.height * .04), width, height};
      await showAt(application, activePage, primaryBounds);
      assert.equal(await activePage.getByTestId('note-editor').inputValue(), EXAMPLES[locale][0]);
      assert.equal((await activePage.evaluate(() => window.cornerNote.getTranslationSettings())).configured, false);
      await record(locale, '01-writing', activePage);

      const siblings = [];
      for (let index = 1; index <= 2; index += 1) {
        const opened = application.waitForEvent('window');
        await activePage.getByTestId('add-note-button').click();
        const sibling = await ready(await opened);
        siblings.push(sibling);
        await sibling.getByTestId('note-editor').fill(EXAMPLES[locale][index]);
        await sibling.getByTestId(`color-${index === 1 ? 'rose' : 'sky'}`).click();
        await sibling.waitForFunction(() => document.querySelector('#save-status').dataset.status === 'saved');
      }
      const notes = [activePage, ...siblings];
      const overlapWidth = Math.max(330, Math.min(520, Math.floor(area.width * .31)));
      const overlapHeight = Math.max(420, Math.min(560, Math.floor(area.height * .50)));
      for (let index = 0; index < notes.length; index += 1) {
        await showAt(application, notes[index], {x: area.x + Math.floor(area.width * (.18 + index * .17)), y: area.y + Math.floor(area.height * (.06 + index * .04)), width: overlapWidth, height: overlapHeight});
      }
      await record(locale, '02-overlapping-notes', siblings[1]);
      for (const sibling of siblings) await sibling.evaluate(() => window.cornerNote.hide());

      await showAt(application, activePage, primaryBounds);
      await activePage.getByTestId('help-button').click();
      await activePage.getByTestId('tutorial-reopen').click();
      await activePage.getByTestId('tutorial-next').click();
      await activePage.getByTestId('tutorial-next').click();
      await activePage.waitForFunction(() => document.querySelector('.corner-tutorial-shell').dataset.step === '3');
      await record(locale, '03-folding-guide', activePage);
      await activePage.getByTestId('tutorial-skip').click();

      await activePage.getByTestId('note-editor').evaluate(editor => {
        editor.focus();
        editor.setSelectionRange(0, editor.value.indexOf('\n'));
        editor.dispatchEvent(new Event('select', {bubbles: true}));
      });
      await activePage.getByTestId('translate-button').click();
      await activePage.getByTestId('translation-language-menu').waitFor({state: 'visible'});
      await activePage.locator('.ct-settings-link').click();
      await activePage.getByTestId('translation-settings').waitFor({state: 'visible'});
      assert.equal(await activePage.getByTestId('translation-api-key').inputValue(), '');
      assert.equal((await activePage.evaluate(() => window.cornerNote.getTranslationSettings())).configured, false);
      await record(locale, '04-ai-settings', activePage);
      const blockedHosts = await application.evaluate(({app}) => app._storeCaptureRequests);
      const aiRequests = blockedHosts.filter(host => host === 'api.openai.com').length;
      externalAiRequests += aiRequests;
      assert.equal(aiRequests, 0, 'AI screenshots must not request a provider or consume credits.');
      await closeApplication();
    }
    assert.deepEqual(errors, [], 'Screenshot capture must not hide renderer errors.');
    if (!checkUi) {
      assert.equal(screenshots.length, locales.length * SCENARIOS.length);
      const provenance = {
        schemaVersion: 1, sourceVersion, sourceCommit,
        captureOS: {platform: process.platform, release: os.release(), type: os.type()},
        mockProvider: false, externalAiRequests,
        networkPolicy: 'HTTP/HTTPS blocked during capture; no API key configured',
        captureMethod: `${CAPTURE_METHOD}; native pixels; no compositing or scaling`,
        screenshots, fixtures: Object.fromEntries(locales.map(locale => [locale, EXAMPLES[locale]])),
      };
      await fs.writeFile(path.join(screenshotRoot, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
      console.log(`Windows Store captures complete: ${screenshots.length} PNG files with authentic desktop provenance.`);
    } else {
      console.log(`Local UI checks complete for ${locales.length} language(s). No publication screenshots or provenance were created.`);
    }
  } finally {
    try {
      if (application) await closeApplication();
    } finally {
      try {
        if (displayPrepared) await runDisplay('Restore', displayStatePath);
      } finally {
        await fs.rm(temporaryRoot, {recursive: true, force: true});
      }
    }
  }
}

module.exports = {LOCALES, SCENARIOS, EXAMPLES, pngDimensions, parseOptions};
if (require.main === module) main().catch(error => {
  const message = String(error?.stack || error);
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error title=Store screenshot capture failed::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  console.error(error);
  process.exitCode = 1;
});
