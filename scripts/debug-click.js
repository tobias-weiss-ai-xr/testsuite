const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  await page.addInitScript(() => {
    localStorage.setItem(
      'forceAllowOldBrowser',
      JSON.stringify({ expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 })
    );
  });

  // Login
  await page.goto('https://localhost:9200', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oc-login-username', { state: 'visible', timeout: 15000 });
  await page.fill('#oc-login-username', 'admin');
  await page.fill('#oc-login-password', 'admin');
  await Promise.all([
    page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
    page.click('button:has-text("Log in")'),
  ]);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  // Upload a test file
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  await page.evaluate(async ({ token }) => {
    await fetch('/dav/files/admin/click-test.docx', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    });
  }, { token });

  // Navigate to files
  await page.goto(page.url().includes('files') ? page.url() : 'https://localhost:9200/files/spaces/personal/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  try { await page.locator('button:has-text("I want to continue anyway")').click({ timeout: 3000 }); await page.waitForTimeout(2000); } catch {}
  try { await page.waitForSelector('table tbody tr td', { timeout: 15000 }); } catch {}

  // Listen for all events
  const allPages = new Set();
  browser.on('newpage', (p) => {
    allPages.add(p);
    console.log('NEW PAGE OPENED:', p.url());
  });

  // Also listen for responses
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('wopi') || url.includes('editor') || url.includes('hosting') || url.includes('8083')) {
      console.log('Response:', res.status(), url.substring(0, 150));
    }
  });

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('wopi') || url.includes('editor') || url.includes('hosting') || url.includes('8083') || url.includes('app-provider')) {
      console.log('Request:', req.method(), url.substring(0, 150));
    }
  });

  const urlBefore = page.url();
  console.log('URL before click:', urlBefore);

  // Click the file
  const fileEl = page.locator('text="click-test"').first();
  const visible = await fileEl.isVisible().catch(() => false);
  console.log('File visible:', visible);

  if (visible) {
    await fileEl.click();
    console.log('Clicked file');

    // Wait and check what happened
    await page.waitForTimeout(5000);

    const urlAfter = page.url();
    console.log('URL after click:', urlAfter);
    console.log('URL changed:', urlBefore !== urlAfter);

    // Check for iframes
    const frames = page.frames();
    console.log('Frames:', frames.length);
    for (const f of frames) {
      console.log('  Frame:', f.url().substring(0, 100));
    }

    // Check for new tabs
    const pages = browser.contexts()[0].pages();
    console.log('Total pages:', pages.length);
    for (const p of pages) {
      console.log('  Page:', p.url().substring(0, 100));
    }

    // Check body text
    const text = await page.textContent('body');
    console.log('Body after click (first 500):', text.substring(0, 500));

    await page.screenshot({ path: 'test-results/debug-after-click.png', fullPage: true });
    console.log('Screenshot saved');
  }

  // Cleanup
  await page.evaluate(async ({ token }) => {
    await fetch('/dav/files/admin/click-test.docx', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
  }, { token });

  await browser.close();
})();
