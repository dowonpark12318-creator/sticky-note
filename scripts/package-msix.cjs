'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEVELOPMENT_IDENTITY = Object.freeze({
  name: 'CornerNote.Development',
  publisher: 'CN=CornerNoteDevelopment',
  publisherDisplayName: 'Corner Note',
});
const APP_ID = 'App';
const APP_EXECUTABLE = 'app\\CornerNote.exe';
const RESOURCE_STRINGS = Object.freeze({
  'en-US': {
    AppDisplayName: 'Corner Note',
    AppDescription: 'Sticky notes that fold into a corner, with optional AI translation.',
  },
  'ko-KR': {
    AppDisplayName: '모서리 메모',
    AppDescription: '화면 구석에 접어 두는 스티커 메모와 선택형 AI 번역.',
  },
  'ja-JP': {
    AppDisplayName: 'コーナーノート',
    AppDescription: '画面の隅に折りたためる付箋メモ。AI翻訳も利用できます。',
  },
  'zh-Hans': {
    AppDisplayName: '角落便笺',
    AppDescription: '可折叠到屏幕角落的便笺，并可按需使用 AI 翻译。',
  },
  'zh-Hant': {
    AppDisplayName: '角落便箋',
    AppDescription: '可摺疊至螢幕角落的便箋，並可選擇使用 AI 翻譯。',
  },
  es: {
    AppDisplayName: 'Nota de esquina',
    AppDescription: 'Notas adhesivas que se pliegan en una esquina, con traducción por IA opcional.',
  },
  fr: {
    AppDisplayName: 'Note de coin',
    AppDescription: 'Des pense-bêtes qui se replient dans un coin, avec traduction par IA facultative.',
  },
  de: {
    AppDisplayName: 'Ecknotiz',
    AppDescription: 'Haftnotizen, die sich in eine Ecke falten lassen, mit optionaler KI-Übersetzung.',
  },
  pt: {
    AppDisplayName: 'Nota de canto',
    AppDescription: 'Notas adesivas que se dobram em um canto, com tradução por IA opcional.',
  },
  it: {
    AppDisplayName: 'Nota d’angolo',
    AppDescription: 'Note adesive che si ripiegano in un angolo, con traduzione IA facoltativa.',
  },
});

function xml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

function appxVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!match || match.slice(1).some((part, index) => Number(part) > 65535 || (index === 0 && Number(part) === 0))) {
    throw new Error('MSIX requires a release version major.minor.patch with components from 0 to 65535 and a nonzero major version.');
  }
  return `${match.slice(1).map(Number).join('.')}.0`;
}

function resolveIdentity(mode, configuration = {}, environment = process.env) {
  if (!['development', 'store'].includes(mode)) throw new Error('Choose exactly one MSIX build mode: --development or --store.');
  if (mode === 'development') return { ...DEVELOPMENT_IDENTITY };
  const identity = {
    name: environment.CORNER_NOTE_STORE_IDENTITY_NAME || configuration.name,
    publisher: environment.CORNER_NOTE_STORE_IDENTITY_PUBLISHER || configuration.publisher,
    publisherDisplayName: environment.CORNER_NOTE_STORE_PUBLISHER_DISPLAY_NAME || configuration.publisherDisplayName,
  };
  if (Object.values(identity).some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Store builds require the exact Name, Publisher and PublisherDisplayName from Partner Center. See store/MSIX.md.');
  }
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identity.name)) throw new Error('The Store package identity Name must contain 3–50 letters, digits, periods or hyphens.');
  if (!/^CN=.+/i.test(identity.publisher) || /[\r\n\0]/.test(identity.publisher)) throw new Error('The Store Publisher must be the exact CN=... identity from Partner Center.');
  if (identity.name.toLowerCase() === DEVELOPMENT_IDENTITY.name.toLowerCase()
    || identity.publisher.toLowerCase() === DEVELOPMENT_IDENTITY.publisher.toLowerCase()
    || Object.values(identity).some(value => /(?:replace[ _-]?me|your[ _-]?(?:package|publisher)|<[^>]+>)/i.test(value))) {
    throw new Error('Development/example identities cannot be used for a Store build. Copy your real Partner Center identity.');
  }
  return identity;
}

function createManifest(identity, version) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${xml(appxVersion(version))}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>ms-resource:AppDisplayName</DisplayName>
    <PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
${Object.keys(RESOURCE_STRINGS).map(locale => `    <Resource Language="${xml(locale)}" />`).join('\n')}
  </Resources>
  <Applications>
    <Application Id="${APP_ID}" Executable="${APP_EXECUTABLE}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="ms-resource:AppDisplayName" Description="ms-resource:AppDescription"
        BackgroundColor="transparent" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" />
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
`;
}

function createResw(strings) {
  return `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype"><value>text/microsoft-resx</value></resheader>
  <resheader name="version"><value>2.0</value></resheader>
  <resheader name="reader"><value>System.Resources.ResXResourceReader, System.Windows.Forms</value></resheader>
  <resheader name="writer"><value>System.Resources.ResXResourceWriter, System.Windows.Forms</value></resheader>
${Object.entries(strings).map(([key, value]) => `  <data name="${xml(key)}" xml:space="preserve"><value>${xml(value)}</value></data>`).join('\n')}
</root>
`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, bytes) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([length, name, bytes, checksum]);
}

// The repository's reproducible icon generator emits noninterlaced RGBA PNGs.
// Decode all standard row filters so a regenerated source icon stays supported.
function readRgbaPng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid source icon PNG.');
  const compressed = [];
  let width, height;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (data.length !== size || offset + size + 12 > bytes.length) throw new Error('Truncated source icon PNG.');
    if (type === 'IHDR') {
      if (size !== 13 || data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error('The source icon must be an 8-bit, noninterlaced RGBA PNG.');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    } else if (type === 'IDAT') compressed.push(data);
    offset += size + 12;
  }
  if (!width || !height || width > 4096 || height > 4096) throw new Error('Unsupported source icon dimensions.');
  const rows = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  if (rows.length !== (stride + 1) * height) throw new Error('Invalid source icon pixel data.');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)];
    if (filter > 4) throw new Error('Unsupported PNG row filter.');
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      pixels[y * stride + x] = (rows[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

function resizeIconPng(source, size) {
  const { width, height, pixels } = readRgbaPng(source);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (Math.min(height - 1, Math.floor((y + 0.5) * height / size)) * width
        + Math.min(width - 1, Math.floor((x + 0.5) * width / size))) * 4;
      pixels.copy(rows, y * (size * 4 + 1) + 1 + x * 4, from, from + 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([source.subarray(0, 8), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))]);
}

function findSdkTool(tool, environment = process.env) {
  const override = environment[`CORNER_NOTE_${tool.toUpperCase()}_PATH`];
  if (override) {
    const absolute = path.resolve(override);
    if (!fs.existsSync(absolute)) throw new Error(`${tool} override does not exist: ${absolute}`);
    return absolute;
  }
  const roots = [...new Set([
    environment.WindowsSdkDir,
    environment['ProgramFiles(x86)'] && path.join(environment['ProgramFiles(x86)'], 'Windows Kits', '10'),
    environment.ProgramFiles && path.join(environment.ProgramFiles, 'Windows Kits', '10'),
  ].filter(Boolean))];
  const candidates = [];
  for (const root of roots) {
    const bin = path.join(root, 'bin');
    if (!fs.existsSync(bin)) continue;
    const versions = fs.readdirSync(bin, { withFileTypes: true }).filter(item => item.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(item.name))
      .map(item => item.name).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
    for (const version of versions) candidates.push(path.join(bin, version, 'x64', `${tool}.exe`));
    candidates.push(path.join(bin, 'x64', `${tool}.exe`));
  }
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error(`${tool}.exe was not found. Install Windows 10/11 SDK or set CORNER_NOTE_${tool.toUpperCase()}_PATH.`);
  return found;
}

function toolFailureDetails(output) {
  const lines = String(output || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const errors = lines.filter(line => /\b(?:error|failed|failure|invalid|cannot|unable)\b|\bPRI\d+\b|\b0x[89a-f][0-9a-f]{7}\b/i.test(line));
  return (errors.length ? errors : lines.slice(-12)).slice(-20).map(line => line.slice(0, 800)).join('\n');
}

function runTool(filename, args, logPath) {
  const result = spawnSync(filename, args, {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (logPath) fs.writeFileSync(logPath, output, 'utf8');
  if (result.error || result.status !== 0) {
    const details = toolFailureDetails(output);
    throw new Error(`${path.basename(filename)} failed${result.error ? `: ${result.error.message}` : ` with exit code ${result.status}`}.${details ? `\n${details}` : ''}${logPath ? `\nFull tool log: ${logPath}` : ''}`);
  }
  console.log(`${path.basename(filename)} ${args[0]} completed.${logPath ? ` Full log: ${logPath}` : ''}`);
}

async function buildMsix({ mode, configuration, root = ROOT, environment = process.env } = {}) {
  const identityConfiguration = configuration ?? (mode === 'store'
    ? JSON.parse(await fsp.readFile(path.join(root, 'msix', 'identity.json'), 'utf8')) : {});
  const identity = resolveIdentity(mode, identityConfiguration, environment);
  const packageVersion = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const version = appxVersion(packageVersion);
  if (process.platform !== 'win32') throw new Error('MSIX packaging requires Windows with the Windows SDK. The Windows GitHub Actions workflow builds this artifact.');
  const makeappx = findSdkTool('makeappx', environment);
  const makepri = findSdkTool('makepri', environment);
  const portable = path.join(root, 'dist', 'CornerNote-win32-x64');
  await fsp.access(path.join(portable, 'CornerNote.exe')).catch(() => { throw new Error('Build the portable app first: npm run pack:win'); });
  const directory = path.join(root, 'dist', 'msix-work', mode);
  const staging = path.join(directory, 'package');
  const resources = path.join(directory, 'resources');
  await fsp.rm(directory, { recursive: true, force: true });
  await fsp.mkdir(staging, { recursive: true });
  await fsp.mkdir(resources, { recursive: true });
  await fsp.cp(portable, path.join(staging, 'app'), {
    recursive: true,
    // The localized manuals use ASCII filenames inside a Store package.
    filter: source => path.basename(source) !== '먼저 읽어주세요.txt',
  });
  const icon = await fsp.readFile(path.join(root, 'assets', 'icon.png'));
  await fsp.mkdir(path.join(resources, 'Assets'), { recursive: true });
  for (const [name, size] of [['StoreLogo', 50], ['Square44x44Logo', 44], ['Square150x150Logo', 150]]) {
    await fsp.writeFile(path.join(resources, 'Assets', `${name}.png`), resizeIconPng(icon, size));
  }
  for (const [locale, strings] of Object.entries(RESOURCE_STRINGS)) {
    const localeDirectory = path.join(resources, 'Strings', locale);
    await fsp.mkdir(localeDirectory, { recursive: true });
    await fsp.writeFile(path.join(localeDirectory, 'Resources.resw'), createResw(strings));
  }
  await fsp.cp(resources, staging, { recursive: true });
  const manifest = path.join(staging, 'AppxManifest.xml');
  await fsp.writeFile(manifest, createManifest(identity, packageVersion));
  const configurationPath = path.join(directory, 'priconfig.xml');
  runTool(makepri, ['createconfig', '/cf', configurationPath, '/dq', 'en-US', '/o'], path.join(directory, 'makepri-createconfig.log'));
  // This is one language-complete MSIX, not a bundle of split resource packs.
  // SDK-generated configs can request language/scale auto-packaging by default.
  const priConfiguration = await fsp.readFile(configurationPath, 'utf8');
  await fsp.writeFile(configurationPath, priConfiguration.replace(/<packaging\b[^>]*>[\s\S]*?<\/packaging>/g, ''));
  // Index only package resources, not Electron's independent Chromium locale files.
  runTool(makepri, ['new', '/pr', resources, '/cf', configurationPath, '/mn', manifest, '/of', path.join(staging, 'resources.pri'), '/o'], path.join(directory, 'makepri-new.log'));
  await fsp.access(path.join(staging, 'resources.pri'));
  const filename = `CornerNote-${mode === 'store' ? 'Store' : 'Development'}-x64.msix`;
  const output = path.join(root, 'dist', filename);
  runTool(makeappx, ['pack', '/d', staging, '/p', output, '/o'], path.join(directory, 'makeappx-pack.log'));
  const sha256 = createHash('sha256').update(await fsp.readFile(output)).digest('hex');
  await fsp.writeFile(`${output}.sha256`, `${sha256}  ${filename}\n`);
  const metadata = {
    mode, ...identity, version, appId: APP_ID, executable: APP_EXECUTABLE,
    architecture: 'x64', languages: Object.keys(RESOURCE_STRINGS), signed: false,
    sourceVersion: packageVersion, filename, sha256,
    note: mode === 'store'
      ? 'Unsigned package for Partner Center submission. Microsoft Store signs approved packages.'
      : 'Development identity only. Not a Store submission and not installable by double-click without a trusted test signature.',
  };
  await fsp.writeFile(`${output}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`MSIX ${mode} package: ${output}\nSHA-256: ${sha256}\n${metadata.note}`);
  return { output, metadata };
}

async function main(args = process.argv.slice(2)) {
  const modeFlags = args.filter(argument => ['--development', '--store'].includes(argument));
  const configurationFlag = args.find(argument => argument.startsWith('--config='));
  const unknown = args.filter(argument => !modeFlags.includes(argument) && argument !== configurationFlag);
  if (modeFlags.length !== 1 || unknown.length) throw new Error('Usage: node scripts/package-msix.cjs (--development | --store) [--config=msix/identity.local.json]');
  const configuration = configurationFlag
    ? JSON.parse(await fsp.readFile(path.resolve(configurationFlag.slice('--config='.length)), 'utf8'))
    : undefined;
  await buildMsix({ mode: modeFlags[0].slice(2), configuration });
}

module.exports = { DEVELOPMENT_IDENTITY, APP_ID, APP_EXECUTABLE, RESOURCE_STRINGS, appxVersion, resolveIdentity, createManifest, createResw, readRgbaPng, resizeIconPng, findSdkTool, toolFailureDetails, buildMsix };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
