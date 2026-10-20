'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { resizeIconPng } = require('./package-msix.cjs');

const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['en-US', 'ko-KR', 'ja-JP', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt', 'it'];
const SCENARIOS = ['01-writing', '02-overlapping-notes', '03-folding-guide', '04-ai-settings'];
const SUPPORT_EMAIL = 'dowonpark12318@gmail.com';
const REPOSITORY = 'dowonpark12318-creator/sticky-note';
const PUBLIC_BASE = `https://github.com/${REPOSITORY}/blob/codex/windows-test-build/store/listing`;
const REQUIRED_FILES = [
  'README.ko.md', 'listings.json', 'submission-guide.ko.md',
  'certification-notes.en.md', 'certification-notes.ko.md', 'declarations.json', 'readiness.md',
  'privacy/privacy-policy.en.md', 'privacy/privacy-policy.ko.md',
  'support.en.md', 'support.ko.md', 'ai-report-template.en.md', 'ai-report-template.ko.md',
  'assets/StoreLogo-300.png',
  ...LOCALES.flatMap(locale => [`locales/${locale}.json`, `locales/${locale}.md`]),
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}

function text(value, maximum, label, { empty = false } = {}) {
  requireValue(typeof value === 'string' && (empty || value.trim().length > 0), `${label} must be text.`);
  // UTF-16 length is conservative for supplementary characters in Store fields.
  requireValue(value.length <= maximum, `${label} exceeds ${maximum} characters.`);
  requireValue(!/\0/.test(value), `${label} contains a NUL character.`);
}

function validateListing(listing, locale) {
  const prefix = `Listing ${locale}`;
  requireValue(listing.locale === locale, `${prefix}: locale mismatch.`);
  text(listing.suggestedProductName, 256, `${prefix} suggested product name`);
  text(listing.productNameInstruction, 1000, `${prefix} reserved-name instruction`);
  text(listing.shortDescription, 270, `${prefix} short description`);
  text(listing.description, 10000, `${prefix} description`);
  requireValue(listing.description.includes('OpenAI') && listing.description.includes(SUPPORT_EMAIL), `${prefix}: the description must disclose the AI provider and reporting contact.`);
  requireValue(Array.isArray(listing.features) && listing.features.length > 0 && listing.features.length <= 20, `${prefix}: expected 1–20 features.`);
  listing.features.forEach((feature, index) => {
    text(feature, 200, `${prefix} feature ${index + 1}`);
    requireValue(!/^\s*(?:[-*•]|\d+[.)])\s/.test(feature), `${prefix}: features must not include a bullet prefix.`);
  });
  requireValue(Array.isArray(listing.searchTerms) && listing.searchTerms.length <= 7, `${prefix}: at most seven keywords are permitted.`);
  let words = 0;
  for (const keyword of listing.searchTerms) {
    text(keyword, 40, `${prefix} keyword`);
    words += keyword.trim().split(/\s+/u).length;
  }
  requireValue(words <= 21, `${prefix}: keywords contain more than 21 words.`);
  requireValue(listing.screenshotCaptions && typeof listing.screenshotCaptions === 'object'
    && Object.keys(listing.screenshotCaptions).sort().join('|') === [...SCENARIOS].sort().join('|'), `${prefix}: screenshot caption names do not match the four captured scenarios.`);
  for (const scenario of SCENARIOS) text(listing.screenshotCaptions[scenario], 200, `${prefix} ${scenario} caption`);
  requireValue(listing.price === 'Free' && listing.supportEmail === SUPPORT_EMAIL, `${prefix}: price or support email mismatch.`);
  requireValue(listing.publisherDisplayName === 'Dowon Park' && listing.packageIdentityName === 'DowonPark.CornerNote', `${prefix}: publisher identity mismatch.`);
  requireValue(listing.recommendedCategory === 'Productivity' && listing.generativeAI === true, `${prefix}: category or generative AI declaration mismatch.`);
  requireValue(listing.firstSubmissionWhatsNew === '', `${prefix}: leave What's new empty for the first Store submission.`);
  text(listing.releaseNotesForFuture, 1500, `${prefix} optional future release notes`, { empty: true });
  requireValue(Array.isArray(listing.additionalSystemRequirements) && listing.additionalSystemRequirements.length <= 11, `${prefix}: invalid additional system requirements.`);
  listing.additionalSystemRequirements.forEach(requirement => text(requirement, 200, `${prefix} system requirement`));
  const disclosure = listing.commercialDisclosure;
  requireValue(disclosure?.appPrice === 'free' && disclosure.ownOpenAiApiKeyRequired === true
    && disclosure.apiUsageBilledSeparately === true && disclosure.chatGptSubscriptionDoesNotIncludeApiUsage === true,
  `${prefix}: free-app, personal-key and separate-API-charge disclosures must all be explicit.`);
}

function pngInfo(bytes, label) {
  requireValue(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND', `${label}: invalid or incomplete PNG.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

async function walk(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    requireValue(!entry.isSymbolicLink(), `Symbolic links are not allowed in the materials: ${relative}`);
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unexpected filesystem entry in materials: ${relative}`);
  }
  return result.sort();
}

async function ensureLogo(root) {
  const filename = path.join(root, 'store', 'listing', 'assets', 'StoreLogo-300.png');
  const logo = resizeIconPng(await fs.readFile(path.join(root, 'assets', 'icon.png')), 300);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, logo);
  const info = pngInfo(logo, 'Store tile icon');
  requireValue(info.width === 300 && info.height === 300, 'The Store tile icon must be exactly 300×300.');
}

async function validateText(root = ROOT) {
  const source = path.join(root, 'store', 'listing');
  await ensureLogo(root);
  for (const relative of REQUIRED_FILES) {
    const stat = await fs.stat(path.join(source, relative)).catch(() => null);
    requireValue(stat?.isFile() && stat.size > 0, `Required registration material is missing or empty: ${relative}`);
  }
  const packageVersion = (await readJson(path.join(root, 'package.json'))).version;
  const listings = [];
  for (const locale of LOCALES) {
    const listing = await readJson(path.join(source, 'locales', `${locale}.json`));
    validateListing(listing, locale);
    listings.push(listing);
  }
  const aggregate = await readJson(path.join(source, 'listings.json'));
  requireValue(aggregate.appVersion === packageVersion && aggregate.listingCount === LOCALES.length
    && Array.isArray(aggregate.listings) && aggregate.listings.length === LOCALES.length, 'The aggregate listing version or count is inconsistent.');
  for (const listing of listings) {
    const copied = aggregate.listings.find(candidate => candidate.locale === listing.locale);
    requireValue(JSON.stringify(copied) === JSON.stringify(listing), `Aggregate listing differs from locales/${listing.locale}.json.`);
  }
  for (const relative of ['privacy/privacy-policy.en.md', 'privacy/privacy-policy.ko.md', 'support.en.md', 'support.ko.md']) {
    requireValue((await fs.readFile(path.join(source, relative), 'utf8')).includes(SUPPORT_EMAIL), `${relative} does not include the confirmed support email.`);
  }
  const files = await walk(source);
  for (const relative of files) {
    requireValue(/\.(?:md|json|png)$/i.test(relative) && !relative.startsWith('assets/screenshots/'), `Unexpected static material file: ${relative}`);
    requireValue(!/(?:^|\/)(?:node_modules|\.git|test-results)(?:\/|$)/.test(relative), `Private/generated directory is not allowed: ${relative}`);
  }
  console.log(`Text materials verified: ${LOCALES.length} language listings, field limits, reserved-name instructions, free-app/API disclosures, privacy/support documents and 300×300 icon.`);
  return { source, files, listings, packageVersion };
}

function sourceCommit(root, environment = process.env) {
  const commit = environment.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  requireValue(/^[a-f0-9]{40,64}$/i.test(commit), 'A valid source commit is required for screenshot provenance.');
  return commit;
}

async function validateScreenshots(staging, commit) {
  const provenancePath = path.join(staging, 'assets', 'screenshots', 'provenance.json');
  const provenance = await readJson(provenancePath);
  requireValue(provenance.schemaVersion === 1 && provenance.captureOS?.platform === 'win32', 'Screenshots must be captured on Windows with schema version 1 provenance.');
  requireValue(provenance.sourceCommit === commit, 'Screenshot source commit does not match the material build. Capture the current revision again.');
  requireValue(provenance.mockProvider === false && provenance.externalAiRequests === 0, 'Screenshots must use the actual app without mock AI results or live API requests.');
  requireValue(typeof provenance.captureMethod === 'string' && provenance.captureMethod.includes('CopyFromScreen')
    && provenance.captureMethod.includes('no compositing or scaling'), 'Screenshots must capture actual Windows desktop pixels without compositing or scaling.');
  requireValue(Array.isArray(provenance.screenshots) && provenance.screenshots.length === LOCALES.length * SCENARIOS.length, 'Expected forty Windows screenshots, four for every listing language.');
  const filenames = new Set();
  for (const locale of LOCALES) {
    for (const scenario of SCENARIOS) {
      const relative = `assets/screenshots/${locale}/${scenario}.png`;
      const candidates = provenance.screenshots.filter(item => item.locale === locale && item.scenario === scenario && item.file === relative);
      requireValue(candidates.length === 1, `Missing or duplicate screenshot provenance: ${relative}`);
      const entry = candidates[0];
      const bytes = await fs.readFile(path.join(staging, relative));
      const info = pngInfo(bytes, relative);
      requireValue(info.width >= 1366 && info.height >= 768 && info.bytes <= 50 * 1024 * 1024, `${relative}: Desktop screenshots must be at least 1366×768 and at most 50 MB.`);
      requireValue(entry.width === info.width && entry.height === info.height && entry.bytes === info.bytes && entry.sha256 === sha256(bytes), `${relative}: screenshot bytes do not match captured provenance.`);
      requireValue(typeof entry.method === 'string' && entry.method.includes('CopyFromScreen'), `${relative}: missing actual desktop capture method.`);
      requireValue(typeof entry.uiLocale === 'string' && entry.uiLocale.length > 0 && Array.isArray(entry.windows)
        && entry.windows.length >= (scenario === '02-overlapping-notes' ? 3 : 1), `${relative}: actual app window and UI-language evidence is missing.`);
      filenames.add(relative);
    }
  }
  requireValue(filenames.size === 40, 'Screenshot filenames are not unique.');
  return { provenance, files: [...filenames, 'assets/screenshots/provenance.json'].sort() };
}

async function packageMaterials({ root = ROOT, environment = process.env } = {}) {
  const material = await validateText(root);
  const commit = sourceCommit(root, environment);
  const staging = path.join(root, 'dist', 'store-listing-materials');
  const captured = await validateScreenshots(staging, commit);
  requireValue(captured.provenance.sourceVersion === material.packageVersion, 'Screenshot app version differs from listing materials.');
  for (const relative of material.files) {
    const destination = path.join(staging, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(material.source, relative), destination);
  }
  const identity = await readJson(path.join(root, 'msix', 'identity.json'));
  requireValue(identity.name === 'DowonPark.CornerNote' && identity.publisherDisplayName === 'Dowon Park'
    && identity.publisher === 'CN=B3FCB264-7CC2-48BC-8B90-21070B7AFBD4', 'The Store package identity differs from the user-provided product.');
  const releaseTag = environment.GITHUB_RUN_NUMBER && environment.GITHUB_RUN_ATTEMPT
    ? `windows-test-${environment.GITHUB_RUN_NUMBER}-${environment.GITHUB_RUN_ATTEMPT}` : null;
  const packageFile = path.join(root, 'dist', 'CornerNote-Store-x64.msix');
  let storePackage = null;
  try {
    const metadataFile = `${packageFile}.json`;
    const metadata = await readJson(metadataFile);
    const bytes = await fs.readFile(packageFile);
    requireValue(metadata.mode === 'store' && metadata.name === identity.name && metadata.publisher === identity.publisher
      && metadata.publisherDisplayName === identity.publisherDisplayName && metadata.sourceVersion === material.packageVersion
      && metadata.signed === false && metadata.sha256 === sha256(bytes), 'Store MSIX metadata or checksum differs from the actual submission package.');
    storePackage = {
      filename: path.basename(packageFile), version: metadata.version, bytes: bytes.length, sha256: metadata.sha256,
      metadataSha256: sha256(await fs.readFile(metadataFile)), signed: false, purpose: 'Partner Center submission; Microsoft signs approved packages',
      downloadUrl: releaseTag ? `https://github.com/${REPOSITORY}/releases/download/${releaseTag}/${path.basename(packageFile)}` : null,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    requireValue(!environment.GITHUB_ACTIONS, 'The CI materials bundle requires the newly generated Store MSIX and metadata.');
  }
  const allowed = new Set([...material.files, ...captured.files, 'PACKAGE-MANIFEST.json']);
  for (const relative of await walk(staging)) requireValue(allowed.has(relative), `Unexpected file in the download bundle: ${relative}`);
  const files = [];
  for (const relative of [...allowed].filter(name => name !== 'PACKAGE-MANIFEST.json').sort()) {
    const bytes = await fs.readFile(path.join(staging, relative));
    files.push({ file: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const manifest = {
    schemaVersion: 1, appVersion: material.packageVersion, sourceCommit: commit, product: identity,
    price: 'Free', supportEmail: SUPPORT_EMAIL, listingLanguages: LOCALES,
    screenshots: { count: 40, perLanguage: 4, minimumWidth: 1366, minimumHeight: 768, actualWindowsDesktop: true, mockProvider: false },
    privacyPolicyUrls: { en: `${PUBLIC_BASE}/privacy/privacy-policy.en.md`, ko: `${PUBLIC_BASE}/privacy/privacy-policy.ko.md` },
    supportUrl: `${PUBLIC_BASE}/support.en.md`, storePackage,
    submissionStatus: 'Materials prepared; not submitted to or certified by Microsoft Store',
    remainingPublisherActions: ['Select the exact reserved Store display name', 'Complete IARC questionnaire and any legal/trader requirements', 'Run and review Windows App Certification Kit results', 'Verify the live OpenAI feature and arrange any private certification access', 'Review public privacy and support statements before submitting'],
    files,
  };
  await fs.writeFile(path.join(staging, 'PACKAGE-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const output = path.join(root, 'dist', 'CornerNote-Store-Materials.zip');
  await fs.rm(output, { force: true });
  let result;
  if (process.platform === 'win32') {
    const literal = value => `'${value.replace(/'/g, "''")}'`;
    const script = `Compress-Archive -LiteralPath ${literal(staging)} -DestinationPath ${literal(output)} -Force -ErrorAction Stop`;
    result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: 'inherit' });
  } else {
    result = spawnSync('zip', ['-q', '-r', output, path.basename(staging)], { cwd: path.dirname(staging), stdio: 'inherit' });
  }
  if (result.error) throw result.error;
  requireValue(result.status === 0, 'The Store materials ZIP command failed.');
  const hash = sha256(await fs.readFile(output));
  await fs.writeFile(`${output}.sha256`, `${hash}  ${path.basename(output)}\n`);
  console.log(`Store materials verified and packaged: ${output}\n40 actual Windows screenshots; ten listings; privacy/support/reviewer files.\nSHA-256: ${hash}`);
  return { output, manifest };
}

async function main(args = process.argv.slice(2)) {
  requireValue(args.length === 0 || (args.length === 1 && args[0] === '--check-text'), 'Usage: node scripts/package-store-materials.cjs [--check-text]');
  if (args[0] === '--check-text') {
    await validateText();
    console.log('Text-only verification completed; screenshots and the downloadable ZIP have not been validated or created by this command.');
  } else await packageMaterials();
}

module.exports = { LOCALES, SCENARIOS, validateListing, validateText, validateScreenshots, packageMaterials, pngInfo };
if (require.main === module) main().catch(error => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = String(error?.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Store materials validation failed::${message}`);
  }
  console.error(error);
  process.exitCode = 1;
});
