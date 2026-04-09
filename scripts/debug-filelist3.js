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

  console.log('URL:', page.url());

  // Wait for the React file list to actually render
  // OCIS uses a virtual table - wait for it
  try {
    await page.waitForSelector('[data-testid="resource-table"], table.oc-table, .files-table', { timeout: 15000 });
    console.log('File table found');
  } catch {
    console.log('File table NOT found');
  }

  // Get what's VISIBLE (not hidden elements)
  const visibleEls = await page.evaluate(() => {
    const all = document.querySelectorAll('body *');
    const result = [];
    for (const el of all) {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && el.textContent.trim()) {
        result.push(el.textContent.trim().substring(0, 100));
      }
      if (result.length > 50) break;
    }
    return result;
  });
  console.log('Visible elements:', visibleEls);

  // Get token and upload file
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  if (token) {
    // Create minimal docx in the browser
    const docxBase64 = await page.evaluate(() => {
      // Minimal DOCX as base64 (pre-encoded for simplicity)
      return 'UEsDBBQAAAAIALW0zE6SkpyDQEAAJYDAAATAAAAALmRlYy9fcmVscy9kb2N1bWVudC54bWwucmVscwIAAAAA';
    });

    // Upload via WebDAV using a proper minimal docx
    const status = await page.evaluate(async ({ token }) => {
      const parts = [];
      // [Content_Types].xml
      parts.push(Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>').toString('base64'));
      // We can't create a proper ZIP in the browser easily. Use a different approach:
      // Download from eo-docs and re-upload? No.
      // Instead, just use fetch to create an empty file first, then check if it shows up.
      const r = await fetch('/dav/files/admin/probe-visible.docx', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // Just a ZIP header
      });
      return r.status;
    }, { token });
    console.log('Upload status:', status);

    // Refresh and wait for file list
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    // Check if file is visible now
    const pageText = await page.textContent('body');
    console.log('probe-visible in page text:', pageText.includes('probe-visible'));

    // Try all possible selectors
    const selectors = [
      'text=probe-visible',
      'text=probe-visible.docx',
      '[data-testid]',
      'table tbody tr td',
      '.file-row',
      '.resource-row',
      'tr',
    ];
    for (const sel of selectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          const text = await page.locator(sel).first().textContent();
          console.log(`Selector "${sel}": ${count} items, first: "${text.trim().substring(0, 80)}"`);
        }
      } catch {}
    }

    // Screenshot
    await page.screenshot({ path: 'test-results/debug-files-page.png', fullPage: true });
    console.log('Screenshot saved to test-results/debug-files-page.png');

    // Cleanup
    await page.evaluate(async ({ token }) => {
      await fetch('/dav/files/admin/probe-visible.docx', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token },
      });
    }, { token });
  }

  await browser.close();
})();
