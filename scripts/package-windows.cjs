const path = require('node:path');
const fs = require('node:fs/promises');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');

async function main() {
  const {packager} = await import('@electron/packager');
  const root = path.resolve(__dirname, '..');
  require('./generate-icons.cjs');
  const output = await packager({
    dir: root,
    name: 'CornerNote',
    executableName: 'CornerNote',
    platform: 'win32',
    arch: 'x64',
    out: path.join(root, 'dist'),
    overwrite: true,
    asar: true,
    prune: true,
    icon: path.join(root, 'assets', 'icon.ico'),
    win32metadata: {CompanyName: 'Corner Note', FileDescription: 'Corner Note - 모서리 메모', ProductName: 'Corner Note'},
    ignore: [/^\/\.git(?:\/|$)/, /^\/\.gitignore$/, /^\/node_modules(?:\/|$)/, /^\/dist(?:\/|$)/, /^\/test(?:\/|$)/, /^\/test-results(?:\/|$)/, /^\/scripts(?:\/|$)/, /^\/\.cache(?:\/|$)/],
    download: {cacheRoot: process.env.ELECTRON_CACHE || path.join(root, '.cache', 'electron')}
  });
  const appPath = output[0];
  await fs.copyFile(path.join(root, 'WINDOWS-사용방법.txt'), path.join(appPath, '먼저 읽어주세요.txt'));
  const zipPath = path.join(root, 'dist', 'CornerNote-Windows-x64.zip');
  await fs.rm(zipPath, {force: true});
  if (process.platform === 'win32') {
    const literal = value => `'${value.replace(/'/g, "''")}'`;
    const script = `Compress-Archive -LiteralPath ${literal(appPath)} -DestinationPath ${literal(zipPath)} -Force -ErrorAction Stop`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {stdio: 'inherit'});
    if (result.status !== 0) throw new Error('Windows zip creation failed');
  } else {
    const result = spawnSync('zip', ['-q', '-r', zipPath, path.basename(appPath)], {cwd: path.dirname(appPath), stdio: 'inherit'});
    if (result.status !== 0) throw new Error('zip creation failed; install zip and retry');
  }
  const hash = createHash('sha256').update(await fs.readFile(zipPath)).digest('hex');
  await fs.writeFile(`${zipPath}.sha256`, `${hash}  ${path.basename(zipPath)}\n`);
  console.log(`Windows portable app: ${zipPath}\nSHA-256: ${hash}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
