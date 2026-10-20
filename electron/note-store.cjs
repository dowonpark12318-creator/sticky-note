'use strict';

const { randomUUID } = require('node:crypto');
const { DEFAULT_SIZE, FOLDED_SIZE, validCorner, selectDisplay, cornerBounds, clampBounds } = require('./window-geometry.cjs');
const { canonicalLanguage } = require('./translation.cjs');

const COLORS = new Set(['butter', 'rose', 'mint', 'sky']);
const MAX_TEXT_LENGTH = 2_000_000;
const MAX_NOTES = 500;

function validId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128
    && !/[^A-Za-z0-9_-]/.test(value);
}

function damagedData() {
  return new TypeError('Unsupported or damaged note data.');
}

function normalizeWindow(saved) {
  const windowState = saved && typeof saved === 'object' ? saved : {};
  const validBounds = bounds => bounds && typeof bounds === 'object'
    && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key]))
    && bounds.width > 0 && bounds.height > 0;
  return {
    folded: windowState.folded === true,
    corner: validCorner(windowState.corner) ? windowState.corner : 'top-right',
    // Individual expanded dimensions are fitted to a real display at startup.
    // Preserve the legacy loader's handling of partial expanded bounds here.
    expandedBounds: windowState.expandedBounds && typeof windowState.expandedBounds === 'object'
      ? { ...windowState.expandedBounds } : { ...DEFAULT_SIZE },
    foldedBounds: validBounds(windowState.foldedBounds)
      ? { ...windowState.foldedBounds } : null,
    foldedAnchorBounds: validBounds(windowState.foldedAnchorBounds)
      ? { ...windowState.foldedAnchorBounds } : null,
    foldedAnchorDisplayId: typeof windowState.foldedAnchorDisplayId === 'number'
      || typeof windowState.foldedAnchorDisplayId === 'string' ? windowState.foldedAnchorDisplayId : null,
    displayId: typeof windowState.displayId === 'number' || typeof windowState.displayId === 'string'
      ? windowState.displayId : null,
  };
}

// Keep a moved note's return point independent from its current display/position.
// An old save has no recorded point, so its matching screen corner is the anchor.
function resolveFoldedAnchor(windowState, displays) {
  const anchor = windowState.foldedAnchorBounds;
  const preferredId = windowState.foldedAnchorDisplayId ?? windowState.displayId;
  const display = selectDisplay(displays, anchor || windowState.foldedBounds || windowState.expandedBounds, preferredId);
  const originalDisplayExists = displays.some(item => String(item.id) === String(windowState.foldedAnchorDisplayId));
  const bounds = anchor && (windowState.foldedAnchorDisplayId === null || originalDisplayExists)
    ? clampBounds(anchor, display.workArea, { width: 1, height: 1 })
    : cornerBounds(display.workArea, windowState.corner, FOLDED_SIZE);
  return { bounds, displayId: display.id };
}

function normalizeSettings(saved) {
  const settings = saved && typeof saved === 'object' ? saved : {};
  const translationLanguages = [];
  if (Array.isArray(settings.translationLanguages)) {
    for (const language of settings.translationLanguages.slice(0, 30)) {
      try {
        const canonical = canonicalLanguage(language);
        if (!translationLanguages.includes(canonical)) translationLanguages.push(canonical);
      } catch { /* Invalid preferences must not prevent loading the notes. */ }
    }
  }
  return { translationLanguages, tutorialCompleted: settings.tutorialCompleted === true };
}

function normalizeNote(saved, id = saved?.id) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !validId(id)
    || typeof saved.text !== 'string' || saved.text.length > MAX_TEXT_LENGTH || !COLORS.has(saved.color)) {
    throw damagedData();
  }
  return {
    id, text: saved.text, color: saved.color,
    savedAt: typeof saved.savedAt === 'string' && !Number.isNaN(Date.parse(saved.savedAt)) ? saved.savedAt : null,
    window: normalizeWindow(saved.window),
  };
}

function createEmptyNote({ id = randomUUID(), expandedBounds, color = 'butter' } = {}) {
  return normalizeNote({ id, text: '', color, savedAt: null, window: { expandedBounds } });
}

function createDefaultState() {
  const note = createEmptyNote();
  return {
    version: 2,
    notes: [note],
    settings: normalizeSettings(),
    alwaysOnTop: true,
    activeNoteId: note.id,
    noteOrder: [note.id],
  };
}

function normalizedOrder(notes, savedOrder) {
  const remaining = new Set(notes.map(note => note.id));
  const order = [];
  if (Array.isArray(savedOrder)) {
    for (const id of savedOrder) {
      if (remaining.delete(id)) order.push(id);
    }
  }
  for (const id of remaining) order.push(id);
  return order;
}

function normalizeState(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw damagedData();
  if (saved.version === 1) {
    const note = normalizeNote(saved, randomUUID());
    return {
      version: 2,
      notes: [note],
      settings: normalizeSettings(saved.settings),
      alwaysOnTop: saved.window?.alwaysOnTop !== false,
      activeNoteId: note.id,
      noteOrder: [note.id],
    };
  }
  if (saved.version !== 2 || !Array.isArray(saved.notes)
    || saved.notes.length > MAX_NOTES) throw damagedData();
  const notes = saved.notes.map(note => normalizeNote(note));
  if (new Set(notes.map(note => note.id)).size !== notes.length) throw damagedData();
  if (!notes.length) return {
    version: 2, notes: [], settings: normalizeSettings(saved.settings),
    alwaysOnTop: saved.alwaysOnTop !== false, activeNoteId: null, noteOrder: [],
  };
  const noteOrder = normalizedOrder(notes, saved.noteOrder);
  const activeNoteId = noteOrder.includes(saved.activeNoteId) ? saved.activeNoteId : noteOrder.at(-1);
  // The active note is also the frontmost member of the saved stack.
  const activeIndex = noteOrder.indexOf(activeNoteId);
  noteOrder.splice(activeIndex, 1);
  noteOrder.push(activeNoteId);
  return {
    version: 2, notes,
    settings: normalizeSettings(saved.settings),
    alwaysOnTop: saved.alwaysOnTop !== false,
    activeNoteId, noteOrder,
  };
}

// Mutates only activity metadata; callers can persist when the return value is true.
function markNoteActive(state, noteId) {
  if (!state.notes.some(note => note.id === noteId)) return false;
  const order = normalizedOrder(state.notes, state.noteOrder).filter(id => id !== noteId);
  order.push(noteId);
  const changed = state.activeNoteId !== noteId || !Array.isArray(state.noteOrder)
    || state.noteOrder.length !== order.length || order.some((id, index) => state.noteOrder[index] !== id);
  if (changed) {
    state.activeNoteId = noteId;
    state.noteOrder = order;
  }
  return changed;
}

function orderedNotes(state) {
  const byId = new Map(state.notes.map(note => [note.id, note]));
  return normalizedOrder(state.notes, state.noteOrder).map(id => byId.get(id));
}

module.exports = {
  COLORS, MAX_TEXT_LENGTH, MAX_NOTES,
  createEmptyNote, createDefaultState, normalizeState, markNoteActive, orderedNotes,
  resolveFoldedAnchor,
};
