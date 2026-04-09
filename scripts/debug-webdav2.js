const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Login
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

  // Extract the full OAuth token
  const oauthData = await page.evaluate(() => {
    const key = 'oc_oAuth.user:https://localhost:9200:web';
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  });
  console.log('OAuth data keys:', oauthData ? Object.keys(oauthData) : 'null');
  if (oauthData) {
    console.log('access_token:', oauthData.access_token ? oauthData.access_token.substring(0, 80) + '...' : 'NOT FOUND');
    console.log('id_token:', oauthData.id_token ? oauthData.id_token.substring(0, 80) + '...' : 'NOT FOUND');
    console.log('token_type:', oauthData.token_type);
    console.log('scope:', oauthData.scope);
  }

  // Try using access_token as Bearer for WebDAV
  if (oauthData && oauthData.access_token) {
    const token = oauthData.access_token;
    const putResult = await page.evaluate(async ({ token }) => {
      const res = await fetch('/dav/files/admin/test-webdav-upload.txt', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: 'Hello WebDAV!',
      });
      return { status: res.status, ok: res.ok };
    }, { token });
    console.log('PUT with Bearer:', putResult);

    if (putResult.ok) {
      const listResult = await page.evaluate(async ({ token }) => {
        const res = await fetch('/dav/files/admin/', {
          method: 'PROPFIND',
          headers: { 'Depth': '1', 'Authorization': `Bearer ${token}` }
        });
        const text = await res.text();
        const filenames = [];
        const regex = /<d:displayname>([^<]+)<\/d:displayname>/g;
        let match;
        while ((match = regex.exec(text)) !== null) filenames.push(match[1]);
        return { status: res.status, files: filenames };
      }, { token });
      console.log('Files after upload:', JSON.stringify(listResult.files));

      await page.evaluate(async ({ token }) => {
        await fetch('/dav/files/admin/test-webdav-upload.txt', {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }, { token });
    }
  } else {
    console.log('No access_token found, checking cookies...');
    const cookies = await page.context().cookies();
    for (const c of cookies) {
      if (c.name.includes('KK') || c.name.includes('oc') || c.name.includes('token')) {
        console.log(`Cookie ${c.name}: ${c.value.substring(0, 60)}...`);
      }
    }
  }

  await browser.close();
})();
