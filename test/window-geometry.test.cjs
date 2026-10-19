'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clampBounds, cornerBounds, fitSize, moveBounds, resizeBounds, unfoldBounds, selectDisplay } = require('../electron/window-geometry.cjs');

test('folded windows sit inside all four work-area corners, above a taskbar', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(cornerBounds(workArea, 'top-left'), { x: 12, y: 12, width: 88, height: 88 });
  assert.deepEqual(cornerBounds(workArea, 'top-right'), { x: 1820, y: 12, width: 88, height: 88 });
  assert.deepEqual(cornerBounds(workArea, 'bottom-left'), { x: 12, y: 940, width: 88, height: 88 });
  assert.deepEqual(cornerBounds(workArea, 'bottom-right'), { x: 1820, y: 940, width: 88, height: 88 });
});

test('unfolding preserves size and aligns the corresponding corner on a negative-coordinate monitor', () => {
  const workArea = { x: -1600, y: -200, width: 1600, height: 900 };
  assert.deepEqual(cornerBounds(workArea, 'bottom-right', { width: 392, height: 460 }), {
    x: -404, y: 228, width: 392, height: 460,
  });
});

test('disconnected-monitor positions return fully inside a remaining display', () => {
  assert.deepEqual(clampBounds({ x: 2500, y: -700, width: 500, height: 600 }, {
    x: 0, y: 0, width: 1366, height: 728,
  }), { x: 866, y: 0, width: 500, height: 600 });
});

test('small work areas and damaged dimensions never produce off-screen bounds', () => {
  assert.deepEqual(clampBounds({ x: -10, y: -10, width: 900, height: 900 }, {
    x: 0, y: 0, width: 240, height: 200,
  }), { x: 0, y: 0, width: 240, height: 200 });
  assert.deepEqual(fitSize({ width: NaN, height: -1 }, { width: 1000, height: 800 }), {
    width: 392, height: 300,
  });
  assert.deepEqual(cornerBounds({ x: 0, y: 0, width: 60, height: 50 }, 'bottom-right'), {
    x: 0, y: 0, width: 60, height: 50,
  });
});

test('restore honors existing display identity and chooses nearest surviving display', () => {
  const left = { id: 1, workArea: { x: -1920, y: 0, width: 1920, height: 1040 } };
  const right = { id: 2, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  assert.equal(selectDisplay([left, right], { x: 100, y: 100, width: 392, height: 460 }, 1), left);
  assert.equal(selectDisplay([left, right], { x: 2500, y: 100, width: 392, height: 460 }, 99), right);
  assert.equal(selectDisplay([left, right], { x: -1400, y: 100, width: 392, height: 460 }), left);
  assert.throws(() => selectDisplay([], {}), /No displays/);
});

test('side resizing stops at the minimum size while preserving the opposite edge', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const bounds = { x: 500, y: 200, width: 400, height: 500 };
  assert.deepEqual(resizeBounds(bounds, 'left', 1000, area), { x: 600, y: 200, width: 300, height: 500 });
  assert.deepEqual(resizeBounds(bounds, 'right', -1000, area), { x: 500, y: 200, width: 300, height: 500 });
  assert.deepEqual(resizeBounds(bounds, 'top', 1000, area), { x: 500, y: 400, width: 400, height: 300 });
  assert.deepEqual(resizeBounds(bounds, 'bottom', -1000, area), { x: 500, y: 200, width: 400, height: 300 });
});

test('side resizing reaches work-area boundaries on negative-coordinate displays', () => {
  const area = { x: -1600, y: -200, width: 1600, height: 900 };
  const bounds = { x: -1000, y: 0, width: 400, height: 400 };
  assert.deepEqual(resizeBounds(bounds, 'left', -2000, area), { x: -1600, y: 0, width: 1000, height: 400 });
  assert.deepEqual(resizeBounds(bounds, 'right', 2000, area), { x: -1000, y: 0, width: 1000, height: 400 });
  assert.deepEqual(resizeBounds(bounds, 'top', -2000, area), { x: -1000, y: -200, width: 400, height: 600 });
  assert.deepEqual(resizeBounds(bounds, 'bottom', 2000, area), { x: -1000, y: 0, width: 400, height: 700 });
  assert.throws(() => resizeBounds(bounds, 'bottom-right', 100, area), /Unknown resize edge/);
});

test('tiny displays allow edge resizing without minimum-size overflow', () => {
  const area = { x: 0, y: 0, width: 240, height: 200 };
  assert.deepEqual(resizeBounds({ x: 0, y: 0, width: 240, height: 200 }, 'left', 50, area), area);
  assert.deepEqual(resizeBounds({ x: 0, y: 0, width: 240, height: 200 }, 'bottom', 1000, area), area);
});

test('folded movement stays where dragged, clamps at edges, and uses gesture snapshot deltas', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const initial = cornerBounds(area, 'top-right');
  assert.deepEqual(moveBounds(initial, -700, 330, area), { x: 1120, y: 342, width: 88, height: 88 });
  assert.deepEqual(moveBounds(initial, -800, 300, area), { x: 1020, y: 312, width: 88, height: 88 });
  assert.deepEqual(moveBounds(initial, 1000, -1000, area), { x: 1832, y: 0, width: 88, height: 88 });
  const otherArea = { x: -1600, y: -200, width: 1600, height: 900 };
  assert.deepEqual(moveBounds(initial, -2500, 0, otherArea), { x: -680, y: 12, width: 88, height: 88 });
});

test('unfolding a moved note anchors each matching physical corner', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const folded = { x: 800, y: 600, width: 88, height: 88 };
  const size = { width: 400, height: 400 };
  assert.deepEqual(unfoldBounds(folded, 'top-left', size, area), { x: 800, y: 600, ...size });
  assert.deepEqual(unfoldBounds(folded, 'top-right', size, area), { x: 488, y: 600, ...size });
  assert.deepEqual(unfoldBounds(folded, 'bottom-left', size, area), { x: 800, y: 288, ...size });
  assert.deepEqual(unfoldBounds(folded, 'bottom-right', size, area), { x: 488, y: 288, ...size });
});

test('unfolding near an edge keeps the entire expanded note visible', () => {
  assert.deepEqual(unfoldBounds({ x: 12, y: 12, width: 88, height: 88 }, 'bottom-right',
    { width: 400, height: 400 }, { x: 0, y: 0, width: 1920, height: 1040 }), {
    x: 0, y: 0, width: 400, height: 400,
  });
});
