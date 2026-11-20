import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(mainSource, /onContextMenu=\{event => \{ event\.preventDefault\(\);[\s\S]*?openContextMenu\(event\.clientX, event\.clientY\); \}\}/, 'Right-click must open the message action menu.');
assert.match(mainSource, /className="message-react-open"/, 'A visible click-to-react button must be present.');
assert.match(mainSource, /createPortal\([\s\S]*?className="message-context-menu"/, 'The action menu must be rendered through the portal.');

const portalCssStart = cssSource.lastIndexOf('\n.message-context-menu {');
assert.notEqual(portalCssStart, -1, 'A global message menu rule must exist for the body portal.');
const portalCss = cssSource.slice(portalCssStart);
assert.match(portalCss, /position:\s*fixed\s*!important;[\s\S]{0,180}z-index:\s*100000\s*!important;/, 'The body portal must be fixed-positioned above the app.');

console.log('MESSAGE MENU TESTS PASSED: viewport edges, stable positioning, right-click, click-to-react, portal rendering and global portal styling.');
