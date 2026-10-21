'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COLORS, MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, MAX_NOTES, normalizeTitle,
  createEmptyNote, createDefaultState, normalizeState, markNoteActive, orderedNotes,
  resolveFoldedAnchor,
} = require('../electron/note-store.cjs');
const { DEFAULT_SIZE } = require('../electron/window-geometry.cjs');

function sampleState() {
  return {
    version: 2,
    notes: ['first', 'second', 'third'].map(id => createEmptyNote({ id })),
    settings: { translationLanguages: ['en', 'ko'], tutorialCompleted: true },
    activeNoteId: 'third',
    noteOrder: ['first', 'second', 'third'],
  };
}

test('a new state has one independent blank note, frontmost and active', () => {
  const state = createDefaultState();
  assert.equal(state.version, 2);
  assert.equal(state.notes.length, 1);
  assert.match(state.notes[0].id, /^[a-z0-9-]+$/i);
  assert.equal(state.notes[0].text, '');
  assert.equal(state.notes[0].color, 'butter');
  assert.equal(state.notes[0].savedAt, null);
  assert.equal(state.activeNoteId, state.notes[0].id);
  assert.deepEqual(state.noteOrder, [state.activeNoteId]);
  assert.equal(state.notes[0].alwaysOnTop, true);
  assert.equal(state.notes[0].title, '');
  assert.equal(Object.hasOwn(state, 'alwaysOnTop'), false);
  assert.deepEqual(state.settings, { translationLanguages: [], tutorialCompleted: false });
  assert.deepEqual(state.notes[0].window.expandedBounds, DEFAULT_SIZE);
  assert.notEqual(state.notes[0].id, createDefaultState().notes[0].id);
  state.notes[0].window.expandedBounds.width = 999;
  assert.deepEqual(createEmptyNote().window.expandedBounds, DEFAULT_SIZE);
});

test('new notes accept supported colors and independent requested geometry', () => {
  const bounds = { x: -100, y: 42, width: 500, height: 700 };
  const note = createEmptyNote({ id: 'my_note-2', color: 'sky', expandedBounds: bounds });
  assert.equal(note.id, 'my_note-2');
  assert.equal(note.color, 'sky');
  assert.deepEqual(note.window, {
    folded: false, corner: 'top-right', expandedBounds: bounds, foldedBounds: null,
    foldedAnchorBounds: null, foldedAnchorDisplayId: null, displayId: null,
  });
  note.window.expandedBounds.x = 12;
  assert.equal(bounds.x, -100);
  assert.deepEqual([...COLORS], ['butter', 'rose', 'mint', 'sky']);
});

test('legacy migration preserves note content, preferences, and both window positions', () => {
  const saved = {
    version: 1, text: '기존 메모\nKeep this exactly.', color: 'rose', savedAt: '2026-10-19T00:00:00.000Z',
    settings: { translationLanguages: ['ko-kr', 'EN', 'ko-KR', 'invalid language', null, 'ja'], tutorialCompleted: true },
    window: {
      folded: true, corner: 'bottom-left',
      expandedBounds: { x: -1800, y: 40, width: 650, height: 700 },
      foldedBounds: { x: -1000, y: 500, width: 88, height: 88 },
      displayId: 'display-left', alwaysOnTop: false,
    },
  };
  const original = structuredClone(saved);
  const state = normalizeState(saved);
  const note = state.notes[0];
  assert.equal(state.version, 2);
  assert.equal(note.text, saved.text);
  assert.equal(note.color, saved.color);
  assert.equal(note.savedAt, saved.savedAt);
  const { alwaysOnTop, ...window } = saved.window;
  assert.deepEqual(note.window, { ...window, foldedAnchorBounds: null, foldedAnchorDisplayId: null });
  assert.equal(note.alwaysOnTop, false);
  assert.equal(note.title, '');
  assert.equal(Object.hasOwn(state, 'alwaysOnTop'), false);
  assert.deepEqual(state.settings, { translationLanguages: ['ko-KR', 'en', 'ja'], tutorialCompleted: true });
  assert.deepEqual(state.noteOrder, [note.id]);
  assert.equal(state.activeNoteId, note.id);
  assert.deepEqual(saved, original);
  note.window.foldedBounds.x = 0;
  assert.equal(saved.window.foldedBounds.x, -1000);
});

test('legacy invalid optional preferences and geometry fall back without discarding text', () => {
  const state = normalizeState({
    version: 1, text: 'still readable', color: 'mint', savedAt: 'not a timestamp',
    settings: { translationLanguages: 'en', tutorialCompleted: 1 },
    window: { folded: 'true', corner: 'middle', expandedBounds: null,
      foldedBounds: { x: 0, y: 0, width: -1, height: 88 }, displayId: {}, alwaysOnTop: 0 },
  });
  assert.equal(state.notes[0].text, 'still readable');
  assert.equal(state.notes[0].savedAt, null);
  assert.deepEqual(state.notes[0].window, {
    folded: false, corner: 'top-right', expandedBounds: DEFAULT_SIZE, foldedBounds: null,
    foldedAnchorBounds: null, foldedAnchorDisplayId: null, displayId: null,
  });
  assert.deepEqual(state.settings, { translationLanguages: [], tutorialCompleted: false });
  assert.equal(state.notes[0].alwaysOnTop, true);
});

test('legacy partial expanded geometry remains available for display-aware startup fitting', () => {
  const state = normalizeState({ version: 1, text: '', color: 'butter', window: { expandedBounds: { width: 550 } } });
  assert.deepEqual(state.notes[0].window.expandedBounds, { width: 550 });
});

test('valid multi-note state round trips every note and its independent appearance', () => {
  const saved = sampleState();
  saved.notes[0].text = 'first note';
  saved.notes[0].color = 'rose';
  saved.notes[0].title = '가족 메모 💛';
  saved.notes[0].alwaysOnTop = false;
  saved.notes[1].window.folded = true;
  saved.notes[1].window.corner = 'bottom-right';
  saved.notes[1].window.foldedBounds = { x: 700, y: 600, width: 88, height: 88 };
  saved.notes[2].savedAt = '2026-10-20T01:02:03Z';
  const normalized = normalizeState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(normalized, saved);
  assert.notEqual(normalized.notes[0], saved.notes[0]);
  assert.notEqual(normalized.settings.translationLanguages, saved.settings.translationLanguages);
});

test('older multi-note saves migrate the shared pin setting to each note without changing other data', () => {
  for (const pinned of [false, true]) {
    const saved = sampleState();
    saved.alwaysOnTop = pinned;
    for (const [index, note] of saved.notes.entries()) {
      delete note.alwaysOnTop;
      delete note.title;
      note.text = `original note ${index}\n메모 보존`;
      note.window.expandedBounds = { x: index * 100, y: index * 50, width: 500, height: 550 };
    }
    saved.notes[1].window.folded = true;
    const snapshot = structuredClone(saved);
    const migrated = normalizeState(saved);
    assert.equal(Object.hasOwn(migrated, 'alwaysOnTop'), false);
    assert.deepEqual(migrated.notes.map(note => note.alwaysOnTop), [pinned, pinned, pinned]);
    assert.deepEqual(migrated.notes.map(note => note.title), ['', '', '']);
    assert.deepEqual(migrated.notes.map(note => note.text), saved.notes.map(note => note.text));
    assert.deepEqual(migrated.notes.map(note => note.window), saved.notes.map(note => note.window));
    assert.deepEqual(migrated.noteOrder, saved.noteOrder);
    assert.deepEqual(migrated.settings, saved.settings);
    assert.deepEqual(saved, snapshot);
  }
});

test('independent pin settings and titles survive round trips and ignore an obsolete shared setting', () => {
  const saved = sampleState();
  saved.alwaysOnTop = false;
  saved.notes[0].alwaysOnTop = false;
  saved.notes[0].title = '일정';
  saved.notes[1].title = 'Shopping';
  // A partially migrated note can still inherit the old setting.
  delete saved.notes[2].alwaysOnTop;
  const restored = normalizeState(saved);
  assert.deepEqual(restored.notes.map(note => note.alwaysOnTop), [false, true, false]);
  restored.notes[0].alwaysOnTop = true;
  restored.notes[1].title = 'Work';
  const restarted = normalizeState(JSON.parse(JSON.stringify(restored)));
  assert.deepEqual(restarted.notes.map(note => note.alwaysOnTop), [true, true, false]);
  assert.deepEqual(restarted.notes.map(note => note.title), ['일정', 'Work', '']);
  assert.equal(createEmptyNote().alwaysOnTop, true);
});

test('titles are short single-line text, allow Unicode, and can return to the localized default', () => {
  assert.equal(normalizeTitle('  다음 주 일정 💛  '), '다음 주 일정 💛');
  assert.equal(normalizeTitle('first\nsecond\rthird\titem\u0000end'), 'first second third item end');
  assert.equal(normalizeTitle('first\u2028second\u2029third'), 'first second third');
  assert.equal(normalizeTitle('x'.repeat(MAX_TITLE_LENGTH + 1)), 'x'.repeat(MAX_TITLE_LENGTH));
  assert.equal(normalizeTitle('x'.repeat(MAX_TITLE_LENGTH - 1) + '💛'), 'x'.repeat(MAX_TITLE_LENGTH - 1));
  assert.equal(normalizeTitle('x'.repeat(MAX_TITLE_LENGTH - 2) + '💛'), 'x'.repeat(MAX_TITLE_LENGTH - 2) + '💛');
  for (const blank of ['', '  \n \t', null, undefined, {}, 42]) assert.equal(normalizeTitle(blank), '');
  const saved = sampleState();
  saved.notes[0].title = '<script>alert("memo")</script>';
  saved.notes[1].title = null;
  const normalized = normalizeState(saved);
  assert.equal(normalized.notes[0].title, '<script>alert("memo")</script>');
  assert.equal(normalized.notes[1].title, '');
  assert.equal(normalized.notes[2].title, '');
  normalized.notes[0].title = '';
  assert.equal(normalizeState(JSON.parse(JSON.stringify(normalized))).notes[0].title, '');
});

test('stack repair drops unknown and duplicate IDs, appends missing notes, and keeps active last', () => {
  const saved = sampleState();
  saved.noteOrder = ['third', 'missing', 'third', null, 'first'];
  saved.activeNoteId = 'first';
  const state = normalizeState(saved);
  assert.deepEqual(state.noteOrder, ['third', 'second', 'first']);
  assert.equal(state.activeNoteId, 'first');
  assert.deepEqual(orderedNotes(state).map(note => note.id), state.noteOrder);
  assert.deepEqual(saved.noteOrder, ['third', 'missing', 'third', null, 'first']);
});

test('missing activity and stack metadata choose the last valid note', () => {
  const saved = sampleState();
  delete saved.noteOrder;
  saved.activeNoteId = 'removed';
  assert.deepEqual(normalizeState(saved).noteOrder, ['first', 'second', 'third']);
  assert.equal(normalizeState(saved).activeNoteId, 'third');
  saved.noteOrder = ['second', 'first', 'third'];
  saved.activeNoteId = null;
  assert.equal(normalizeState(saved).activeNoteId, 'third');
});

test('activating a note raises it once and preserves the relative order of other notes', () => {
  const state = sampleState();
  const noteSnapshots = structuredClone(state.notes);
  assert.equal(markNoteActive(state, 'first'), true);
  assert.equal(state.activeNoteId, 'first');
  assert.deepEqual(state.noteOrder, ['second', 'third', 'first']);
  assert.equal(markNoteActive(state, 'first'), false);
  assert.equal(markNoteActive(state, 'missing'), false);
  assert.deepEqual(state.notes, noteSnapshots);
  assert.equal(markNoteActive(state, 'second'), true);
  assert.deepEqual(state.noteOrder, ['third', 'first', 'second']);
});

test('ordering and activation repair stale metadata without losing surviving notes', () => {
  const state = sampleState();
  state.noteOrder = ['third', 'gone', 'third'];
  const order = structuredClone(state.noteOrder);
  assert.deepEqual(orderedNotes(state).map(note => note.id), ['third', 'first', 'second']);
  assert.deepEqual(state.noteOrder, order);
  assert.equal(markNoteActive(state, 'third'), true);
  assert.deepEqual(state.noteOrder, ['first', 'second', 'third']);
});

test('one invalid note rejects the entire save so the caller can preserve the original file', () => {
  for (const invalid of [null, 1, [], {}, { ...createEmptyNote(), text: null },
    { ...createEmptyNote(), text: 'x'.repeat(MAX_TEXT_LENGTH + 1) },
    { ...createEmptyNote(), color: 'purple' }]) {
    const state = sampleState();
    state.notes[1] = invalid;
    assert.throws(() => normalizeState(state), /Unsupported or damaged note data/);
  }
});

test('unsupported versions and excessive note counts are rejected', () => {
  for (const invalid of [null, [], {}, { version: 0 }, { version: 3 },
    { version: 1, text: 5, color: 'butter' },
    { version: 2, notes: Array.from({ length: MAX_NOTES + 1 }, (_, index) => createEmptyNote({ id: `note-${index}` })) }]) {
    assert.throws(() => normalizeState(invalid), /Unsupported or damaged note data/);
  }
});

test('deleting the last note permits an empty save and preserves shared preferences', () => {
  const state = normalizeState({
    version: 2, notes: [], alwaysOnTop: false,
    settings: {translationLanguages: ['ja'], tutorialCompleted: true},
    activeNoteId: 'deleted-note', noteOrder: ['deleted-note'],
  });
  assert.deepEqual(state.notes, []);
  assert.equal(state.activeNoteId, null);
  assert.deepEqual(state.noteOrder, []);
  assert.equal(Object.hasOwn(state, 'alwaysOnTop'), false);
  assert.deepEqual(state.settings, {translationLanguages: ['ja'], tutorialCompleted: true});
  assert.deepEqual(orderedNotes(state), []);
  assert.equal(markNoteActive(state, 'deleted-note'), false);
});

test('invalid or duplicate stable identities reject a save rather than silently replace notes', () => {
  for (const id of ['', 'space id', '../path', 'trailing-newline\n', '한글', 'x'.repeat(129), 42, null]) {
    const state = sampleState();
    state.notes[1].id = id;
    assert.throws(() => normalizeState(state), /Unsupported or damaged note data/);
    assert.throws(() => createEmptyNote({ id }), /Unsupported or damaged note data/);
  }
  const duplicate = sampleState();
  duplicate.notes[1].id = duplicate.notes[0].id;
  assert.throws(() => normalizeState(duplicate), /Unsupported or damaged note data/);
});

test('text and note-count limits accept boundary values', () => {
  const state = sampleState();
  state.notes[0].text = 'x'.repeat(MAX_TEXT_LENGTH);
  assert.equal(normalizeState(state).notes[0].text.length, MAX_TEXT_LENGTH);
  const notes = Array.from({ length: MAX_NOTES }, (_, index) => createEmptyNote({ id: `note-${index}` }));
  assert.equal(normalizeState({ version: 2, notes }).notes.length, MAX_NOTES);
});

test('language preferences inspect only the first 30 entries and do not affect note content', () => {
  const state = sampleState();
  state.settings = { translationLanguages: Array(30).fill('EN').concat('ja'), tutorialCompleted: 'true' };
  const normalized = normalizeState(state);
  assert.deepEqual(normalized.settings, { translationLanguages: ['en'], tutorialCompleted: false });
  assert.deepEqual(normalized.notes, state.notes);
});

test('special but safe IDs are stack values rather than object properties', () => {
  const notes = ['__proto__', 'constructor', 'toString'].map(id => createEmptyNote({ id }));
  const state = normalizeState({ version: 2, notes, activeNoteId: '__proto__' });
  assert.deepEqual(state.noteOrder, ['constructor', 'toString', '__proto__']);
  assert.deepEqual(orderedNotes(state).map(note => note.id), state.noteOrder);
});

const anchorDisplays = [
  { id: 'left', workArea: { x: -1200, y: 0, width: 1200, height: 900 } },
  { id: 'right', workArea: { x: 0, y: 0, width: 1600, height: 1000 } },
];

test('a moved folded note retains its first-fold anchor through save and reload', () => {
  const saved = sampleState();
  saved.notes[0].window = {
    ...saved.notes[0].window, folded: true, corner: 'bottom-left', displayId: 'right',
    foldedBounds: { x: 600, y: 400, width: 88, height: 88 },
    foldedAnchorBounds: { x: -1188, y: 800, width: 88, height: 88 },
    foldedAnchorDisplayId: 'left',
  };
  const restored = normalizeState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.notes[0].window, saved.notes[0].window);
  const anchor = resolveFoldedAnchor(restored.notes[0].window, anchorDisplays);
  assert.deepEqual(anchor, { bounds: { x: -1188, y: 800, width: 88, height: 88 }, displayId: 'left' });
  assert.deepEqual(restored.notes[0].window.foldedBounds, { x: 600, y: 400, width: 88, height: 88 });
  anchor.bounds.x = 0;
  assert.equal(restored.notes[0].window.foldedAnchorBounds.x, -1188);
});

test('older saves without an anchor infer the matching original screen corner without changing the moved position', () => {
  const saved = sampleState();
  saved.notes[1].window.folded = true;
  saved.notes[1].window.corner = 'top-right';
  saved.notes[1].window.displayId = 'left';
  saved.notes[1].window.foldedBounds = { x: -700, y: 400, width: 88, height: 88 };
  delete saved.notes[1].window.foldedAnchorBounds;
  delete saved.notes[1].window.foldedAnchorDisplayId;
  const restored = normalizeState(saved);
  assert.deepEqual(resolveFoldedAnchor(restored.notes[1].window, anchorDisplays), {
    bounds: { x: -100, y: 12, width: 88, height: 88 }, displayId: 'left',
  });
  assert.deepEqual(restored.notes[1].window.foldedBounds, saved.notes[1].window.foldedBounds);
});

test('returning to an anchor uses a surviving screen corner when the original monitor is disconnected', () => {
  const window = {
    folded: true, corner: 'bottom-right', displayId: 'right',
    foldedBounds: { x: 500, y: 500, width: 88, height: 88 },
    foldedAnchorBounds: { x: -100, y: 800, width: 88, height: 88 },
    foldedAnchorDisplayId: 'left',
  };
  assert.deepEqual(resolveFoldedAnchor(window, [anchorDisplays[1]]), {
    bounds: { x: 1500, y: 900, width: 88, height: 88 }, displayId: 'right',
  });
});

test('a smaller work area clamps a remembered anchor safely and malformed anchor data does not lose note text', () => {
  const saved = sampleState();
  saved.notes[0].text = 'keep this memo';
  saved.notes[0].window.foldedAnchorBounds = { x: NaN, y: 20, width: 88, height: 88 };
  saved.notes[0].window.foldedAnchorDisplayId = {};
  const restored = normalizeState(saved);
  assert.equal(restored.notes[0].text, 'keep this memo');
  assert.equal(restored.notes[0].window.foldedAnchorBounds, null);
  assert.equal(restored.notes[0].window.foldedAnchorDisplayId, null);
  const window = {
    ...restored.notes[0].window,
    foldedAnchorBounds: { x: 1500, y: 900, width: 88, height: 88 },
    foldedAnchorDisplayId: 'right',
  };
  assert.deepEqual(resolveFoldedAnchor(window, [{ id: 'right', workArea: { x: 0, y: 0, width: 600, height: 400 } }]), {
    bounds: { x: 512, y: 312, width: 88, height: 88 }, displayId: 'right',
  });
});
