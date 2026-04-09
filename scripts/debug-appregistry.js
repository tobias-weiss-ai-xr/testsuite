const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

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
  await page.waitForTimeout(3000);

  // Get token
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  // Check various OCIS API endpoints for editor/app config
  const endpoints = [
    '/app-registry/v1/',
    '/app-provider/v1/open',
    '/app-provider/v1/external',
    '/settings/apps',
    '/ocs/v2.php/apps/provisioning/api/v1/owncloud/open-cloud/editors',
    '/graph/v1.0/me/drives',
    '/app-provider/v1/internal',
    '/app-provider/v1/apps',
  ];

  for (const ep of endpoints) {
    const result = await page.evaluate(async ({ token, ep }) => {
      try {
        const res = await fetch(ep, {
          headers: { Authorization: 'Bearer ' + token },
        });
        const text = await res.text();
        return { status: res.status, body: text.substring(0, 300) };
      } catch (err) {
        return { status: 0, error: err.message };
      }
    }, { token, ep });
    console.log(`${ep}: ${result.status}`);
    if (result.body && result.body.length > 5) {
      console.log(`  ${result.body.substring(0, 200)}`);
    }
  }

  await browser.close();
})();
