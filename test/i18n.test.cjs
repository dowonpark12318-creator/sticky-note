'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {resolveLocale, createI18n} = require('../renderer/i18n.js');

test('computer languages select Korean or English and retain English regional formatting', () => {
  assert.deepEqual(resolveLocale('ko'), {language: 'ko', locale: 'ko-KR'});
  assert.deepEqual(resolveLocale('ko-KR'), {language: 'ko', locale: 'ko-KR'});
  assert.deepEqual(resolveLocale('en'), {language: 'en', locale: 'en-US'});
  assert.deepEqual(resolveLocale('en-GB'), {language: 'en', locale: 'en-GB'});
  assert.deepEqual(resolveLocale('en_US'), {language: 'en', locale: 'en-US'});
});

test('ordered OS preferences use the first supported language', () => {
  assert.deepEqual(resolveLocale(['fr-FR', 'ko-KR', 'en-US']), {language: 'ko', locale: 'ko-KR'});
  assert.deepEqual(resolveLocale(['en-CA', 'ko-KR']), {language: 'en', locale: 'en-CA'});
});

test('unknown, malformed or absent system languages fall back to usable English', () => {
  for (const value of ['zz-ZZ', 'not a locale', '', undefined, null, 42, [], ['en-'.repeat(100)]]) {
    assert.deepEqual(resolveLocale(value), {language: 'en', locale: 'en-US'});
  }
});

test('catalog selection, English message fallback and interpolation preserve user text literally', () => {
  const messages = {
    ko: {count: '{count}자'},
    en: {count: '{count} characters', message: 'Saved {text}'},
  };
  const korean = createI18n('ko-KR', messages);
  const english = createI18n('en-GB', messages);
  assert.equal(korean.t('count', {count: 12}), '12자');
  assert.equal(english.t('count', {count: 12}), '12 characters');
  assert.equal(korean.t('message', {text: '<script>한글</script>'}), 'Saved <script>한글</script>');
  assert.equal(english.t('missing'), 'missing');
  assert.equal(english.t('count'), '{count} characters');
});
