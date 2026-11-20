import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = message => {
  console.error(`BOOT CHECK FAILED: ${message}`);
  process.exit(1);
};

const mainSource = await readFile(path.join(root, 'src/main.jsx'), 'utf8');
if (!/import\s*\{\s*createRoot\s*\}\s*from\s*['"]react-dom\/client['"]\s*;/.test(mainSource)) {
  fail("createRoot must be imported from 'react-dom/client'.");
}
if (!/import\s*\{\s*createPortal\s*\}\s*from\s*['"]react-dom['"]\s*;/.test(mainSource)) {
  fail("createPortal must be imported from 'react-dom'.");
}
if (/import\s*\{[^}]*createRoot[^}]*\}\s*from\s*['"]react-dom['"]/.test(mainSource)) {
  fail("createRoot was imported from the wrong React package.");
}

const dist = path.join(root, 'dist');
const htmlPath = path.join(dist, 'index.html');
let html;
try {
  html = await readFile(htmlPath, 'utf8');
} catch {
  fail('dist/index.html is missing. Run the production build first.');
}
if (!/<div[^>]+id=["']root["']/.test(html)) fail('Production HTML has no React root element.');

const scriptMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["'][^>]*>/g)];
if (!scriptMatches.length) fail('Production HTML does not reference a JavaScript entry bundle.');
const jsFiles = (await readdir(path.join(dist, 'assets'))).filter(name => name.endsWith('.js'));
if (!jsFiles.length) fail('No JavaScript bundles were generated.');

for (const match of scriptMatches) {
  const assetPath = path.join(dist, match[1].replace(/^\//, ''));
  try {
    const info = await stat(assetPath);
    if (!info.isFile() || info.size < 1000) fail(`JavaScript entry bundle is missing or unexpectedly small: ${match[1]}`);
  } catch {
    fail(`JavaScript entry bundle does not exist: ${match[1]}`);
  }
}

for (const name of jsFiles) {
  const file = path.join(dist, 'assets', name);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`JavaScript syntax check failed for ${name}: ${result.stderr || result.stdout}`);
}

console.log(`BOOT CHECK PASSED: React entry imports, root element, ${jsFiles.length} JavaScript bundle(s), and bundle syntax are valid.`);
