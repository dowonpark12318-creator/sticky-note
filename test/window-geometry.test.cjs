'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clampBounds, cornerBounds, fitSize, selectDisplay } = require('../electron/window-geometry.cjs');

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
