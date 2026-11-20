import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 4173;
const url = `http://${host}:${port}`;
const server = spawn('npm', ['run', 'preview', '--', '--host', host, '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});
let browser;

const waitForServer = async () => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview server did not start within 20 seconds.');
};

const checkPage = async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!response?.ok()) throw new Error(`App returned HTTP ${response?.status() || 'no response'}.`);

  await page.waitForFunction(() => {
    const root = document.getElementById('root');
    return Boolean(root?.firstElementChild);
  }, { timeout: 20000 });

  await page.waitForTimeout(700);
  const result = await page.evaluate(() => {
    const root = document.getElementById('root');
    const view = root?.firstElementChild;
    const rect = view?.getBoundingClientRect();
    return {
      hasRootChild: Boolean(view),
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      text: (root?.innerText || '').trim().slice(0, 300),
      crashFallback: Boolean(root?.querySelector('.app-crash-fallback')),
      bootRecovery: Boolean(root?.querySelector('#chatter-boot-recovery')),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });

  if (!result.hasRootChild || !result.visible || !result.text) {
    throw new Error(`App rendered a blank or invisible root: ${JSON.stringify(result)}`);
  }
  if (result.crashFallback || result.bootRecovery) {
    throw new Error(`App displayed a startup recovery screen: ${JSON.stringify(result)}`);
  }
  if (errors.length) throw new Error(`Browser runtime error(s): ${errors.join(' | ')}`);
  if (result.horizontalOverflow) throw new Error('App shell has horizontal page overflow at this viewport.');
};

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await checkPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('#root > *')), { timeout: 20000 });
  await page.waitForTimeout(500);
  const mobile = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('#root > *')?.getBoundingClientRect().width),
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
  }));
  if (!mobile.visible || mobile.overflow) throw new Error(`Mobile startup/layout check failed: ${JSON.stringify(mobile)}`);
  console.log('BROWSER SMOKE CHECK PASSED: desktop and mobile boot without a blank screen or uncaught runtime errors.');
} catch (error) {
  console.error('BROWSER SMOKE CHECK FAILED:', error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server.kill('SIGTERM');
}
