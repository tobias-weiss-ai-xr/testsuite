// Comprehensive test: capture ALL network requests during OCIS file interaction
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Capture ALL API requests
  const allRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('localhost:9200') && !url.includes('.js') && !url.includes('.css') && !url.includes('.mjs') && !url.includes('.svg') && !url.includes('.png') && !url.includes('manifest.json')) {
      allRequests.push({ method: req.method(), url: url.replace('https://localhost:9200', ''), type: req.resourceType() });
    }
  });

  // Capture ALL API responses
  const allResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('localhost:9200') && !url.includes('.js') && !url.includes('.css') && !url.includes('.mjs') && !url.includes('.svg') && !url.includes('.png')) {
      try {
        const body = await response.text();
        allResponses.push({ 
          status: response.status(), 
          url: url.replace('https://localhost:9200', ''),
          bodySnippet: body.substring(0, 150).replace(/\n/g, ' ')
        });
      } catch (e) {}
    }
  });

  try {
    // Step 1: Login
    console.log('=== LOGIN ===');
    await page.goto('https://localhost:9200');
    await page.waitForURL('**/login**', { timeout: 10000 });
    await page.fill('#oc-login-username', 'admin');
    await page.fill('#oc-login-password', 'admin');
    await page.click('button:has-text("Log in")');
    await page.waitForURL('**/files/**', { timeout: 15000 });
    await page.waitForTimeout(3000); // Wait for initial API calls to complete
    console.log('Logged in');

    // Print initial API calls
    console.log('\n=== INITIAL API CALLS ===');
    const initialReqs = allRequests.length;
    const initialResps = allResponses.length;
    for (const r of allRequests.slice(0, initialReqs)) {
      console.log(`  REQ ${r.method} ${r.url}`);
    }
    for (const r of allResponses.slice(0, initialResps)) {
      console.log(`  RES ${r.status} ${r.url} -> ${r.bodySnippet}`);
    }

    // Step 2: Right-click on the DOCX file
    console.log('\n=== RIGHT-CLICK ON FILE ===');
    const fileElement = page.locator('text=test-euro-office.docx');
    const fileVisible = await fileElement.isVisible().catch(() => false);
    console.log('File visible:', fileVisible);

    if (fileVisible) {
      // Clear previous requests
      allRequests.length = 0;
      allResponses.length = 0;

      // Right-click
      const box = await fileElement.boundingBox();
      console.log('File bounding box:', box);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await page.waitForTimeout(2000); // Wait for context menu and any API calls

      // Print context menu API calls
      console.log('\nContext menu API calls:');
      for (const r of allRequests) {
        console.log(`  REQ ${r.method} ${r.url}`);
      }
      for (const r of allResponses) {
        console.log(`  RES ${r.status} ${r.url} -> ${r.bodySnippet}`);
      }

      // Check what's visible in the context menu
      const menuItems = await page.locator('.v-menu, .oc-context-menu, [role="menu"], .context-menu').allTextContents().catch(() => []);
      console.log('\nContext menu items:', menuItems);

      // Check for action menu items
      const actionItems = await page.locator('[data-testid], [class*="action"], [class*="menu"]').allTextContents().catch(() => []);
      console.log('Action items:', actionItems.slice(0, 20));

      await page.screenshot({ path: 'test-context-menu-2.png' });

      // Also try: hover over file to see if action buttons appear
      console.log('\n=== HOVER OVER FILE ===');
      allRequests.length = 0;
      allResponses.length = 0;
      await fileElement.hover();
      await page.waitForTimeout(1500);
      console.log('Hover API calls:');
      for (const r of allRequests) {
        console.log(`  REQ ${r.method} ${r.url}`);
      }
      for (const r of allResponses) {
        console.log(`  RES ${r.status} ${r.url} -> ${r.bodySnippet}`);
      }
      await page.screenshot({ path: 'test-hover.png' });

      // Try clicking the file (single click)
      console.log('\n=== SINGLE CLICK ON FILE ===');
      allRequests.length = 0;
      allResponses.length = 0;
      await fileElement.click();
      await page.waitForTimeout(1500);
      console.log('Click API calls:');
      for (const r of allRequests) {
        console.log(`  REQ ${r.method} ${r.url}`);
      }
      for (const r of allResponses) {
        console.log(`  RES ${r.status} ${r.url} -> ${r.bodySnippet}`);
      }
      await page.screenshot({ path: 'test-click.png' });

      // Try double-click
      console.log('\n=== DOUBLE-CLICK ON FILE ===');
      allRequests.length = 0;
      allResponses.length = 0;
      await fileElement.dblclick();
      await page.waitForTimeout(3000);
      console.log('Double-click API calls:');
      for (const r of allRequests) {
        console.log(`  REQ ${r.method} ${r.url}`);
      }
      for (const r of allResponses) {
        console.log(`  RES ${r.status} ${r.url} -> ${r.bodySnippet}`);
      }
      
      // Check if new page opened
      const pages = context.pages();
      if (pages.length > 1) {
        console.log(`\nNew page opened: ${pages[1].url()}`);
        await pages[1].screenshot({ path: 'test-editor-page.png' });
      }
      await page.screenshot({ path: 'test-dblclick.png' });
    }

  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: 'test-error-2.png' });
  } finally {
    await browser.close();
  }
})();
