const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Set bypass BEFORE any navigation
  await page.addInitScript(() => {
    localStorage.setItem(
      'forceAllowOldBrowser',
      JSON.stringify({ expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 })
    );
  });

  // Login
  await page.goto('https://localhost:9200', { waitUntil: 'domcontentloaded' });
  
  // Check if browser warning is showing
  const warningVisible = await page.locator('text="Your browser is not supported"').isVisible().catch(() => false);
  console.log('Browser warning visible:', warningVisible);
  
  if (warningVisible) {
    const btn = page.locator('button:has-text("I want to continue anyway")');
    const btnVisible = await btn.isVisible().catch(() => false);
    console.log('Continue button visible:', btnVisible);
    if (btnVisible) {
      await btn.click();
      console.log('Clicked continue button');
      await page.waitForTimeout(2000);
    }
  }

  await page.waitForSelector('#oc-login-username', { state: 'visible', timeout: 15000 }).catch(() => {
    console.log('Login form not found - checking page state');
  });

  const loginVisible = await page.locator('#oc-login-username').isVisible().catch(() => false);
  console.log('Login form visible:', loginVisible);

  if (loginVisible) {
    await page.fill('#oc-login-username', 'admin');
    await page.fill('#oc-login-password', 'admin');
    await Promise.all([
      page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
      page.click('button:has-text("Log in")'),
    ]);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
  }

  const url = page.url();
  console.log('After login URL:', url);
  console.log('URL contains "files":', url.includes('files'));

  // Check if React app loaded
  const hasContent = await page.locator('#owncloud').isVisible().catch(() => false);
  console.log('React app loaded (#owncloud):', hasContent);

  const bodyText = await page.textContent('body');
  console.log('Body text (first 500):', bodyText.substring(0, 500));

  // Get token
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  if (token) {
    // Upload docx
    console.log('Token found, uploading...');
    // Create minimal docx
    const zlib = require('zlib');
    const doc = Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>E2E Test Document</w:t></w:r></w:p></w:body></w:document>');
    
    const uploadRes = await page.evaluate(async ({ token }) => {
      // Simple approach: create a minimal docx using fetch to a known working file
      const r = await fetch('/dav/files/admin/e2e-probe.docx', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        body: new Blob([doc]),
      });
      return r.status;
    }, { token });
    console.log('Upload status:', uploadRes);

    // List files
    const files = await page.evaluate(async ({ token }) => {
      const r = await fetch('/dav/files/admin/', {
        method: 'PROPFIND',
        headers: { Depth: '1', Authorization: 'Bearer ' + token },
      });
      const text = await r.text();
      // Extract all hrefs
      const hrefs = [];
      const re = /<d:href>([^<]+)<\/d:href>/g;
      let m;
      while ((m = re.exec(text)) !== null) hrefs.push(m[1]);
      return hrefs;
    }, { token });
    console.log('File paths:', files);

    // Find the docx file path
    const docxPath = files.find(f => f.includes('e2e-probe.docx'));
    console.log('DOCX path:', docxPath);

    // Try clicking the file in the UI
    await page.goto('https://localhost:9200/files/spaces/personal/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Check what's rendered
    const uiText = await page.textContent('body');
    console.log('Files page text (first 500):', uiText.substring(0, 500));

    // Look for the file
    const fileInUI = uiText.includes('e2e-probe');
    console.log('File visible in UI:', fileInUI);

    // Try to find the resource table
    const tableRows = await page.locator('table tbody tr, [data-testid="resource-table"] tr').count();
    console.log('Table rows:', tableRows);

    // Get all visible file names
    const allLinks = await page.locator('a').allTextContents();
    console.log('All links:', allLinks.filter(t => t.trim()));

    // Cleanup
    await page.evaluate(async ({ token }) => {
      await fetch('/dav/files/admin/e2e-probe.docx', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token },
      });
    }, { token });
  }

  await browser.close();
})();
