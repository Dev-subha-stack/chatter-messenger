import assert from 'node:assert/strict';
import { getMessageContextMenuPosition } from '../src/messageContextMenu.js';

const centered = getMessageContextMenuPosition({
  anchorX: 300, anchorY: 350,
  menuWidth: 220, menuHeight: 180,
  viewportWidth: 1200, viewportHeight: 900,
});
assert.deepEqual(centered, { x: 300, y: 356 }, 'Menu should open next to a center click.');

const bottomRight = getMessageContextMenuPosition({
  anchorX: 990, anchorY: 890,
  menuWidth: 220, menuHeight: 188,
  viewportWidth: 1000, viewportHeight: 900,
});
assert.deepEqual(bottomRight, { x: 772, y: 694 }, 'Menu should move left and above a bottom-right click.');

const topLeft = getMessageContextMenuPosition({
  anchorX: 1, anchorY: 1,
  menuWidth: 218, menuHeight: 150,
  viewportWidth: 800, viewportHeight: 600,
});
assert.deepEqual(topLeft, { x: 8, y: 7 }, 'Menu should remain inside the top-left viewport edge.');

const repeated = getMessageContextMenuPosition({
  anchorX: 500, anchorY: 850,
  menuWidth: 218, menuHeight: 188,
  viewportWidth: 1200, viewportHeight: 900,
});
assert.deepEqual(
  getMessageContextMenuPosition({
    anchorX: 500, anchorY: 850,
    menuWidth: 218, menuHeight: 188,
    viewportWidth: 1200, viewportHeight: 900,
  }),
  repeated,
  'The same pointer anchor must produce the same position; it must never accumulate offsets.',
);

console.log('MESSAGE MENU TESTS PASSED: center, bottom-right, top-left, and stable positioning.');
