const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  await page.goto('https://localhost:9200', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oc-login-username', { state: 'visible', timeout: 30000 });
  await page.fill('#oc-login-username', 'admin');
  await page.fill('#oc-login-password', 'admin');
  await Promise.all([
    page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
    page.click('button:has-text("Log in")'),
  ]);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  // Get access token
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  // Upload a file via WebDAV
  const res = await page.evaluate(
    async ({ token }) => {
      const r = await fetch('/dav/files/admin/probe-test.txt', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
        body: 'test',
      });
      return r.status;
    },
    { token }
  );
  console.log('Upload:', res);

  // List files via WebDAV
  const files = await page.evaluate(
    async ({ token }) => {
      const r = await fetch('/dav/files/admin/', {
        method: 'PROPFIND',
        headers: { Depth: '1', Authorization: 'Bearer ' + token },
      });
      const text = await r.text();
      const names = [];
      const re = /<d:displayname>([^<]+)<\/d:displayname>/g;
      let m;
      while ((m = re.exec(text)) !== null) names.push(m[1]);
      return names;
    },
    { token }
  );
  console.log('Files via WebDAV:', files);

  // Navigate to files page
  await page.goto('https://localhost:9200/f/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  // Check page text for file name
  const text = await page.textContent('body');
  console.log('probe-test.txt visible in UI:', text.includes('probe-test'));

  // Check for ResourceList items
  const listItems = await page.locator('[data-testid="resource-table"] tr, [data-testid="file-row"], .resource-row, table tbody tr').count();
  console.log('File list items found:', listItems);

  // Dump first 1500 chars of body text
  console.log('Body text:', text.substring(0, 1500));

  // Check what elements contain the file name
  const allTexts = await page.locator('text=probe-test').count();
  console.log('Elements with "probe-test":', allTexts);

  // Cleanup
  await page.evaluate(
    async ({ token }) => {
      await fetch('/dav/files/admin/probe-test.txt', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      });
    },
    { token }
  );

  await browser.close();
})();
