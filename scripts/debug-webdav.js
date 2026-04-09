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

  // Check for access token in storage
  const tokens = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      result['localStorage_' + key] = localStorage.getItem(key).substring(0, 100);
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      result['sessionStorage_' + key] = sessionStorage.getItem(key).substring(0, 100);
    }
    return result;
  });
  console.log('Storage keys:', JSON.stringify(tokens, null, 2));

  // Check all cookies
  const cookies = await page.context().cookies();
  console.log('All cookies:', cookies.map(c => `${c.name}=${c.value.substring(0, 40)}... (${c.domain})`).join('\n'));

  // Try WebDAV with fetch (uses cookies automatically)
  const dav1 = await page.evaluate(async () => {
    const res = await fetch('/dav/files/admin/', { method: 'PROPFIND', headers: { Depth: '1' } });
    return { status: res.status };
  });
  console.log('WebDAV /dav/ :', dav1);

  const dav2 = await page.evaluate(async () => {
    const res = await fetch('/remote.php/dav/files/admin/', { method: 'PROPFIND', headers: { Depth: '1' } });
    return { status: res.status };
  });
  console.log('WebDAV /remote.php/dav/ :', dav2);

  // Try PUT to create a file
  const putResult = await page.evaluate(async () => {
    const content = new Blob(['test content'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await fetch('/dav/files/admin/test-upload.txt', { method: 'PUT', body: content });
    return { status: res.status, ok: res.ok };
  });
  console.log('PUT /dav/ :', putResult);

  const putResult2 = await page.evaluate(async () => {
    const content = new Blob(['test content'], { type: 'text/plain' });
    const res = await fetch('/remote.php/dav/files/admin/test-upload.txt', { method: 'PUT', body: content });
    return { status: res.status, ok: res.ok };
  });
  console.log('PUT /remote.php/dav/ :', putResult2);

  await browser.close();
})();
