'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { appxVersion, resolveIdentity, createManifest, RESOURCE_STRINGS, createResw, resizeIconPng, readRgbaPng, toolFailureDetails } = require('../scripts/package-msix.cjs');

test('Store build requires real identity and never silently uses development values', () => {
  assert.deepEqual(resolveIdentity('development'), { name: 'CornerNote.Development', publisher: 'CN=CornerNoteDevelopment', publisherDisplayName: 'Corner Note' });
  assert.throws(() => resolveIdentity('store', {}, {}), /exact Name/);
  for (const invalid of [
    { name: 'CornerNote.Development', publisher: 'CN=RealPublisher', publisherDisplayName: 'Real Publisher' },
    { name: 'Real.Package', publisher: 'CN=CornerNoteDevelopment', publisherDisplayName: 'Real Publisher' },
    { name: 'REPLACE-ME', publisher: 'CN=REPLACE-ME', publisherDisplayName: 'REPLACE-ME' },
  ]) assert.throws(() => resolveIdentity('store', invalid, {}), /Development\/example/);
  const real = { name: '12345.PublishedNote', publisher: 'CN=01234567-89ab-cdef-0123-456789abcdef', publisherDisplayName: 'Publisher & Friends' };
  assert.deepEqual(resolveIdentity('store', real, {}), real);
  const supplied = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'msix', 'identity.json'), 'utf8'));
  assert.deepEqual(resolveIdentity('store', supplied, {}), {
    name: 'DowonPark.CornerNote', publisher: 'CN=B3FCB264-7CC2-48BC-8B90-21070B7AFBD4', publisherDisplayName: 'Dowon Park',
  });
});

test('MSIX uses full-trust desktop launch, exact escaped identity and supported language resources', () => {
  const manifest = createManifest({ name: 'Publisher.Note', publisher: 'CN=Publisher & Friends', publisherDisplayName: 'Publisher <Studio>' }, '1.5.0');
  assert.match(manifest, /Publisher="CN=Publisher &amp; Friends"/);
  assert.match(manifest, /<PublisherDisplayName>Publisher &lt;Studio&gt;<\/PublisherDisplayName>/);
  assert.match(manifest, /Version="1\.5\.0\.0" ProcessorArchitecture="x64"/);
  assert.match(manifest, /Id="App" Executable="app\\CornerNote\.exe" EntryPoint="Windows\.FullTrustApplication"/);
  assert.match(manifest, /Capability Name="runFullTrust"/);
  assert.equal(Object.keys(RESOURCE_STRINGS).length, 10);
  for (const locale of Object.keys(RESOURCE_STRINGS)) {
    assert.ok(manifest.includes(`<Resource Language="${locale}" />`));
    const resources = createResw(RESOURCE_STRINGS[locale]);
    assert.ok(resources.includes('name="AppDisplayName"'));
    assert.ok(resources.includes('name="AppDescription"'));
  }
});

test('Windows SDK failure details retain validation errors without burying them in file-list output', () => {
  const fileList = Array.from({ length: 80 }, (_, index) => `Adding app/file${index}.pak`).join('\n');
  assert.equal(toolFailureDetails(`${fileList}\nMakeAppx : error: 0x80080204 - The package manifest is invalid.\n${fileList}`), 'MakeAppx : error: 0x80080204 - The package manifest is invalid.');
  assert.match(toolFailureDetails('no specific error code\noperation stopped'), /no specific error code/);
});

test('package versions reserve their final component for Store use and reject invalid components', () => {
  assert.equal(appxVersion('1.5.2'), '1.5.2.0');
  for (const invalid of ['0.1.0', '1.2.3-beta', '1.2.3.4', '65536.1.1', '1.65536.1', 'not a version']) assert.throws(() => appxVersion(invalid), /MSIX requires/);
});

test('Store logo files are valid RGBA PNGs at the manifest-required dimensions', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'icon.png'));
  for (const size of [44, 50, 150]) {
    const png = resizeIconPng(source, size);
    const decoded = readRgbaPng(png);
    assert.equal(decoded.width, size);
    assert.equal(decoded.height, size);
    assert.ok(decoded.pixels.some(byte => byte !== 0));
    assert.ok(decoded.pixels.some((byte, index) => index % 4 === 3 && byte === 0));
  }
});
