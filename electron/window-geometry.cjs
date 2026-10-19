'use strict';

const CORNERS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const EDGES = Object.freeze(['left', 'right', 'top', 'bottom']);
const DEFAULT_SIZE = Object.freeze({ width: 392, height: 460 });
const MIN_SIZE = Object.freeze({ width: 300, height: 300 });
const FOLDED_SIZE = Object.freeze({ width: 88, height: 88 });
const EDGE_INSET = 12;

const finite = (value, fallback) => Number.isFinite(value) ? Math.round(value) : fallback;
const limit = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

function validCorner(corner) {
  return CORNERS.includes(corner);
}

function normalizeWorkArea(workArea) {
  return {
    x: finite(workArea?.x, 0),
    y: finite(workArea?.y, 0),
    width: Math.max(1, finite(workArea?.width, 1920)),
    height: Math.max(1, finite(workArea?.height, 1080)),
  };
}

function fitSize(size, workArea, minimum = MIN_SIZE) {
  const area = normalizeWorkArea(workArea);
  return {
    width: limit(finite(size?.width, DEFAULT_SIZE.width), Math.min(minimum.width, area.width), area.width),
    height: limit(finite(size?.height, DEFAULT_SIZE.height), Math.min(minimum.height, area.height), area.height),
  };
}

function clampBounds(bounds, workArea, minimum = MIN_SIZE) {
  const area = normalizeWorkArea(workArea);
  const size = fitSize(bounds, area, minimum);
  return {
    x: limit(finite(bounds?.x, area.x + EDGE_INSET), area.x, area.x + area.width - size.width),
    y: limit(finite(bounds?.y, area.y + EDGE_INSET), area.y, area.y + area.height - size.height),
    ...size,
  };
}

function cornerBounds(workArea, corner, requestedSize = FOLDED_SIZE, inset = EDGE_INSET) {
  const area = normalizeWorkArea(workArea);
  const size = fitSize(requestedSize, area, { width: 1, height: 1 });
  const safeCorner = validCorner(corner) ? corner : 'top-right';
  return clampBounds({
    x: safeCorner.endsWith('right') ? area.x + area.width - size.width - inset : area.x + inset,
    y: safeCorner.startsWith('bottom') ? area.y + area.height - size.height - inset : area.y + inset,
    ...size,
  }, area, { width: 1, height: 1 });
}

// Keep the physical folded corner under the same point when the note opens.
// This also works after the user has moved the folded note away from a screen edge.
function unfoldBounds(foldedBounds, corner, requestedSize, workArea) {
  const size = fitSize(requestedSize, workArea);
  const folded = clampBounds(foldedBounds, workArea, { width: 1, height: 1 });
  return clampBounds({
    x: corner.endsWith('right') ? folded.x + folded.width - size.width : folded.x,
    y: corner.startsWith('bottom') ? folded.y + folded.height - size.height : folded.y,
    ...size,
  }, workArea);
}

function moveBounds(bounds, deltaX, deltaY, workArea) {
  return clampBounds({
    ...bounds,
    x: finite(bounds.x, 0) + finite(deltaX, 0),
    y: finite(bounds.y, 0) + finite(deltaY, 0),
  }, workArea, { width: 1, height: 1 });
}

// Resize one side from a gesture snapshot. The opposite side stays fixed even
// when the pointer travels past the minimum size or outside the work area.
function resizeBounds(bounds, edge, delta, workArea) {
  if (!EDGES.includes(edge)) throw new TypeError('Unknown resize edge.');
  const area = normalizeWorkArea(workArea);
  const initial = clampBounds(bounds, area);
  const right = initial.x + initial.width;
  const bottom = initial.y + initial.height;
  const minimumWidth = Math.min(MIN_SIZE.width, area.width);
  const minimumHeight = Math.min(MIN_SIZE.height, area.height);
  const result = { ...initial };
  const distance = finite(delta, 0);
  if (edge === 'left') {
    result.x = limit(initial.x + distance, area.x, right - minimumWidth);
    result.width = right - result.x;
  } else if (edge === 'right') {
    result.width = limit(right + distance, initial.x + minimumWidth, area.x + area.width) - initial.x;
  } else if (edge === 'top') {
    result.y = limit(initial.y + distance, area.y, bottom - minimumHeight);
    result.height = bottom - result.y;
  } else {
    result.height = limit(bottom + distance, initial.y + minimumHeight, area.y + area.height) - initial.y;
  }
  return result;
}

function selectDisplay(displays, bounds, preferredId) {
  if (!Array.isArray(displays) || !displays.length) throw new Error('No displays are available.');
  const preferred = displays.find(display => String(display.id) === String(preferredId));
  if (preferred) return preferred;
  const target = {
    x: finite(bounds?.x, 0), y: finite(bounds?.y, 0),
    width: Math.max(1, finite(bounds?.width, DEFAULT_SIZE.width)),
    height: Math.max(1, finite(bounds?.height, DEFAULT_SIZE.height)),
  };
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;
  const ranked = displays.map(display => {
    const area = normalizeWorkArea(display.workArea || display.bounds);
    const overlap = Math.max(0, Math.min(target.x + target.width, area.x + area.width) - Math.max(target.x, area.x))
      * Math.max(0, Math.min(target.y + target.height, area.y + area.height) - Math.max(target.y, area.y));
    const dx = centerX - limit(centerX, area.x, area.x + area.width);
    const dy = centerY - limit(centerY, area.y, area.y + area.height);
    return { display, overlap, distance: dx * dx + dy * dy };
  });
  ranked.sort((a, b) => b.overlap - a.overlap || a.distance - b.distance);
  return ranked[0].display;
}

module.exports = {
  CORNERS, EDGES, DEFAULT_SIZE, MIN_SIZE, FOLDED_SIZE, EDGE_INSET,
  validCorner, normalizeWorkArea, fitSize, clampBounds, cornerBounds, unfoldBounds, moveBounds, resizeBounds, selectDisplay,
};
