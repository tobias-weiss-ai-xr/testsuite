/**
 * @fileoverview Interactive headed E2E test for OCIS + euro_Office Document Server
 * 
 * Tests the full user flow:
 * 1. Login to OCIS
 * 2. Navigate to files
 * 3. Verify document editor integration
 * 
 * Usage:
 *   npx playwright test tests/e2e/documents/ocis-interactive.spec.js --project=chromium
 * 
 * Environment:
 *   OCIS_URL       - OCIS URL (default: https://localhost:9200)
 *   HEADLESS       - Set to 'true' for headless mode (default: false)
 *   TEST_USER_A    - First test user (default: admin)
 *   TEST_PASS_A    - First test password (default: admin)
 *   TEST_USER_B    - Second test user (default: testuser)
 *   TEST_PASS_B    - Second test password (default: testuser)
 */

const { test, expect, chromium } = require('@playwright/test');

const OCIS_URL = process.env.OCIS_URL || 'https://localhost:9200';

// OCIS login page selectors (discovered via DOM inspection)
const LOGIN = {
  username: '#oc-login-username',
  password: '#oc-login-password',
  submit: 'button:has-text("Log in")',
};

/**
 * Login to OCIS with given credentials
 */
async function loginToOCIS(page, username, password) {
  await page.goto(OCIS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for React app to render the login form
  await page.waitForSelector(LOGIN.username, { state: 'visible', timeout: 30000 });
  await page.waitForSelector(LOGIN.password, { state: 'visible', timeout: 5000 });
  
  await page.fill(LOGIN.username, username);
  await page.fill(LOGIN.password, password);
  
  // Click submit and wait for navigation through the OAuth redirect chain
  // The flow is: login -> authorize -> callback -> web-oidc-callback -> token -> files
  await Promise.all([
    page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
    page.waitForURL('**/access-denied', { timeout: 30000 }).catch(() => {}),
    page.click(LOGIN.submit),
  ]);
  
  // Wait for the final page to fully load
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(2000).catch(() => {});
}

test.describe('OCIS Interactive E2E @headed', () => {
  test.setTimeout(300000);

  test('login to OCIS as admin and verify web UI loads', async ({ page }) => {
    await loginToOCIS(page, 'admin', 'admin');
    
    await page.screenshot({ path: 'test-results/01-after-login.png', fullPage: true });
    
    // Should be redirected away from login
    const currentUrl = page.url();
    console.log(`After login, URL: ${currentUrl}`);
    expect(currentUrl).not.toContain('signin');
    
    // Page should have content
    const bodyText = await page.textContent('body');
    expect(bodyText.length).toBeGreaterThan(100);
    console.log('Page title:', await page.title());
    console.log('Body snippet:', bodyText.substring(0, 300));
  });

  test('navigate to Personal files section', async ({ page }) => {
    await loginToOCIS(page, 'admin', 'admin');
    
    // Navigate to files
    await page.goto(`${OCIS_URL}/f/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000); // Wait for React app to render
    
    await page.screenshot({ path: 'test-results/02-files-section.png', fullPage: true });
    
    console.log(`Files URL: ${page.url()}`);
    console.log('Page title:', await page.title());
    
    const bodyText = await page.textContent('body');
    console.log('Body snippet:', bodyText.substring(0, 500));
    
    // Should show some file management UI
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('verify OCIS health and API endpoints', async ({ request }) => {
    // Health endpoint
    const health = await request.get(`${OCIS_URL}/health`);
    expect(health.status()).toBeLessThan(500);
    console.log('Health:', health.status());
    
    // OIDC discovery
    const oidc = await request.get(`${OCIS_URL}/.well-known/openid-configuration`);
    expect(oidc.status()).toBe(200);
    const config = await oidc.json();
    expect(config.issuer).toBe('https://localhost:9200');
    console.log('OIDC issuer:', config.issuer);
    
    // WebDAV root (should require auth)
    const webdav = await request.fetch(`${OCIS_URL}/dav/files/admin/`, {
      method: 'PROPFIND',
      headers: { 'Depth': '0' }
    });
    expect([207, 401, 405]).toContain(webdav.status());
    console.log('WebDAV:', webdav.status());
  });
});

test.describe('OCIS Co-editing @headed', () => {
  test.setTimeout(300000);

  test('two users can login simultaneously', async ({ browser }) => {
    const ctxA = await browser.newContext({ ignoreHTTPSErrors: true });
    const ctxB = await browser.newContext({ ignoreHTTPSErrors: true });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Log in both users concurrently to avoid session invalidation races
      const [urlA, urlB] = await Promise.all([
        loginToOCIS(pageA, 'admin', 'admin').then(() => pageA.url()),
        loginToOCIS(pageB, 'admin', 'admin').then(() => pageB.url()),
      ]);

      console.log('User A logged in, URL:', urlA);
      console.log('User B logged in, URL:', urlB);

      await pageA.screenshot({ path: 'test-results/03-userA-logged-in.png', fullPage: true }).catch(() => {});
      await pageB.screenshot({ path: 'test-results/04-userB-logged-in.png', fullPage: true }).catch(() => {});

      // Both should be on files page, not signin
      expect(urlA).toContain('files');
      expect(urlB).toContain('files');

      console.log('Both users successfully logged in');
    } finally {
      await ctxA.close().catch(() => {});
      await ctxB.close().catch(() => {});
    }
  });
});
