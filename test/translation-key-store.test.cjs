'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { createTranslationKeyStore } = require('../electron/translation-key-store.cjs');

const testKey = `sk-${'test-key-only-'.repeat(4)}`;
const otherKey = `sk-${'other-test-key-'.repeat(4)}`;

function encryptedStorage(overrides) {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'test_os_keyring',
    encryptString: text => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptString: data => {
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
    },
    ...overrides,
  };
}

async function fixture(t, storage = encryptedStorage()) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'corner-note-key-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'translation-key.json');
  return { filePath, storage, store: createTranslationKeyStore({ safeStorage: storage, filePath }) };
}

test('remembered keys use the OS encrypt/decrypt interface and only encrypted bytes reach disk', async t => {
  const { store, storage, filePath } = await fixture(t);
  assert.deepEqual(await store.load(), { configured: false, canRememberKey: true, provider: 'openai', model: 'gpt-4.1-mini' });
  const status = await store.setKey({ apiKey: ` ${testKey} `, remember: true });
  assert.equal(status.configured, true);
  assert.equal(JSON.stringify(status).includes(testKey), false);
  const saved = await fs.readFile(filePath, 'utf8');
  assert.equal(saved.includes(testKey), false);
  assert.deepEqual(Object.keys(JSON.parse(saved)).sort(), ['encryptedKey', 'version']);
  assert.equal(storage.decryptString(Buffer.from(JSON.parse(saved).encryptedKey, 'base64')), testKey);
  const relaunch = createTranslationKeyStore({ safeStorage: storage, filePath });
  assert.equal((await relaunch.load()).configured, true);
  assert.equal(relaunch.getKey(), testKey);
  if (process.platform !== 'win32') assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  assert.deepEqual((await fs.readdir(path.dirname(filePath))).sort(), ['translation-key.json']);
});

test('session-only keys are never written and disappear from a fresh instance', async t => {
  const { store, filePath, storage } = await fixture(t);
  await store.setKey({ apiKey: testKey, remember: false });
  assert.equal(store.getKey(), testKey);
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
  const relaunch = createTranslationKeyStore({ safeStorage: storage, filePath });
  assert.equal((await relaunch.load()).configured, false);
});

test('switching to session-only removes an older persistent key and clear removes both forms', async t => {
  const { store, filePath } = await fixture(t);
  await store.setKey({ apiKey: testKey, remember: true });
  await store.setKey({ apiKey: otherKey, remember: false });
  assert.equal(store.getKey(), otherKey);
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
  assert.equal((await store.clear()).configured, false);
  assert.equal(store.getKey(), '');
  await store.setKey({ apiKey: testKey, remember: true });
  assert.equal((await store.clear()).configured, false);
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
});

test('unavailable secure storage and Linux basic_text refuse persistence but support session-only keys', async t => {
  for (const storage of [encryptedStorage({ isEncryptionAvailable: () => false }), encryptedStorage({ getSelectedStorageBackend: () => 'basic_text' })]) {
    const { store, filePath } = await fixture(t, storage);
    assert.equal(store.status().canRememberKey, false);
    await assert.rejects(store.setKey({ apiKey: testKey, remember: true }), /안전한 저장/);
    assert.equal(store.status().configured, false);
    await store.setKey({ apiKey: testKey, remember: false });
    assert.equal(store.status().configured, true);
    await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
  }
});

test('existing encrypted data is preserved when the current machine cannot decrypt it', async t => {
  const { store, filePath } = await fixture(t);
  await store.setKey({ apiKey: testKey, remember: true });
  const original = await fs.readFile(filePath, 'utf8');
  const unavailable = createTranslationKeyStore({ safeStorage: encryptedStorage({ isEncryptionAvailable: () => false }), filePath });
  assert.equal((await unavailable.load()).configured, false);
  const otherMachine = createTranslationKeyStore({ safeStorage: encryptedStorage(), filePath });
  await assert.rejects(otherMachine.load(), error => /복호화/.test(error.message) && !error.message.includes(testKey));
  assert.equal(otherMachine.getKey(), '');
  assert.equal(await fs.readFile(filePath, 'utf8'), original);
});

test('invalid key input does not replace a working key or reveal input in errors', async t => {
  const { store } = await fixture(t);
  await store.setKey({ apiKey: testKey, remember: false });
  for (const invalid of ['', 'sk-short', `${testKey}\nsecret`, 'not-an-api-key', undefined]) {
    await assert.rejects(store.setKey({ apiKey: invalid, remember: false }), error => /형식/.test(error.message) && !error.message.includes(testKey));
    assert.equal(store.getKey(), testKey);
  }
  await assert.rejects(store.setKey({ apiKey: otherKey }), /저장 여부/);
  assert.equal(store.getKey(), testKey);
});

test('malformed key files fail with sanitized errors and are preserved for recovery', async t => {
  const { store, filePath } = await fixture(t);
  for (const raw of ['{broken', JSON.stringify({ version: 1, encryptedKey: testKey }), JSON.stringify({ version: 2, encryptedKey: 'AAAA' })]) {
    await fs.writeFile(filePath, raw);
    await assert.rejects(store.load(), error => !error.message.includes(testKey) && /복호화/.test(error.message));
    assert.equal(await fs.readFile(filePath, 'utf8'), raw);
    assert.equal(store.status().configured, false);
  }
});

test('failed encryption never writes a plaintext fallback and leaves the current key unchanged', async t => {
  const { store, filePath } = await fixture(t, encryptedStorage({ encryptString: () => { throw new Error(`private ${testKey}`); } }));
  await store.setKey({ apiKey: otherKey, remember: false });
  await assert.rejects(store.setKey({ apiKey: testKey, remember: true }), error => /암호화/.test(error.message) && !error.message.includes(testKey));
  assert.equal(store.getKey(), otherKey);
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
});

test('key mutations are serialized so a later deletion cannot leave an older key on disk', async t => {
  const { store, filePath } = await fixture(t);
  const first = store.setKey({ apiKey: testKey, remember: true });
  const second = store.setKey({ apiKey: otherKey, remember: true });
  const cleared = store.clear();
  await Promise.all([first, second, cleared]);
  assert.equal(store.getKey(), '');
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
});
