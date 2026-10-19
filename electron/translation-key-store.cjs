'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { MODEL } = require('./translation.cjs');

function validKey(value) {
  return typeof value === 'string' && /^sk-[a-z0-9_-]{16,1000}$/i.test(value);
}

function createTranslationKeyStore({ safeStorage, filePath }) {
  let apiKey = '';
  let mutationQueue = Promise.resolve();

  function canRememberKey() {
    try {
      return safeStorage.isEncryptionAvailable()
        && (typeof safeStorage.getSelectedStorageBackend !== 'function'
          || safeStorage.getSelectedStorageBackend() !== 'basic_text');
    } catch {
      return false;
    }
  }

  function status() {
    return { configured: Boolean(apiKey), canRememberKey: canRememberKey(), provider: 'openai', model: MODEL };
  }

  async function removeFile() {
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('저장된 API 키를 지울 수 없습니다. 저장 폴더의 권한을 확인해 주세요.');
    }
  }

  async function atomicWrite(ciphertext) {
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    let handle;
    try {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      handle = await fsp.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ version: 1, encryptedKey: ciphertext.toString('base64') })}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fsp.rename(temporaryPath, filePath);
    } catch {
      throw new Error('API 키를 안전하게 저장하지 못했습니다. 이번 실행에서만 사용하거나 폴더 권한을 확인해 주세요.');
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fsp.unlink(temporaryPath).catch(() => {});
    }
  }

  function serialize(operation) {
    const pending = mutationQueue.then(operation);
    mutationQueue = pending.catch(() => {});
    return pending;
  }

  return {
    status,
    getKey: () => apiKey,
    load: () => serialize(async () => {
      if (!canRememberKey()) return status();
      let raw;
      try {
        raw = await fsp.readFile(filePath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return status();
        throw new Error('저장된 API 키를 읽을 수 없습니다. AI 설정에서 키를 다시 입력해 주세요.');
      }
      try {
        const stored = JSON.parse(raw);
        if (stored?.version !== 1 || typeof stored.encryptedKey !== 'string'
          || stored.encryptedKey.length > 16_384 || !/^[a-z0-9+/]+={0,2}$/i.test(stored.encryptedKey)) throw new Error();
        const decrypted = safeStorage.decryptString(Buffer.from(stored.encryptedKey, 'base64'));
        if (!validKey(decrypted)) throw new Error();
        apiKey = decrypted;
        return status();
      } catch {
        throw new Error('저장된 API 키를 복호화할 수 없습니다. AI 설정에서 키를 다시 입력해 주세요.');
      }
    }),
    setKey: options => serialize(async () => {
      const candidate = typeof options?.apiKey === 'string' ? options.apiKey.trim() : '';
      if (!validKey(candidate)) throw new Error('OpenAI API 키 형식을 확인해 주세요.');
      if (typeof options?.remember !== 'boolean') throw new Error('API 키 저장 여부를 선택해 주세요.');
      if (options.remember) {
        if (!canRememberKey()) {
          throw new Error('이 컴퓨터에서 API 키의 안전한 저장을 사용할 수 없습니다. 이번 실행에서만 사용해 주세요.');
        }
        let encrypted;
        try {
          encrypted = safeStorage.encryptString(candidate);
          if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw new Error();
        } catch {
          throw new Error('API 키를 암호화할 수 없습니다. 이번 실행에서만 사용해 주세요.');
        }
        await atomicWrite(encrypted);
      } else {
        // Switching to session-only also removes a previously remembered key.
        await removeFile();
      }
      apiKey = candidate;
      return status();
    }),
    clear: () => serialize(async () => {
      await removeFile();
      apiKey = '';
      return status();
    }),
  };
}

module.exports = { createTranslationKeyStore };
