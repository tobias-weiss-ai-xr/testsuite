// Check if "Open" button appears in context menu after adding "external" to apps array
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Network capture
  const requests = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('localhost:9200') && !url.match(/\.(js|css|mjs|svg|png|woff|woff2|ico)/)) {
      try {
        const body = await res.text();
        const short = url.replace('https://localhost:9200', '');
        console.log(`[${res.status()}] ${short} => ${body.substring(0, 200)}`);
        requests.push({ status: res.status(), url: short, body: body.substring(0, 500) });
      } catch(e) {}
    }
  });

  console.log('=== Step 1: Login ===');
  await page.goto('https://localhost:9200');
  await page.fill('#oc-login-username', 'admin');
  await page.fill('#oc-login-password', 'admin');
  await page.click('button:has-text("Log in")');
  await page.waitForURL('**/files/**', { timeout: 30000 });
  console.log('Logged in successfully');

  // Wait for files to load
  await page.waitForTimeout(3000);

  // Find any .docx file or any file at all
  console.log('\n=== Step 2: Looking for files ===');
  const fileRows = await page.locator('tbody tr').all();
  console.log(`Found ${fileRows.length} file rows`);

  for (let i = 0; i < fileRows.length; i++) {
    const name = await fileRows[i].locator('td').first().textContent().catch(() => 'unknown');
    console.log(`  Row ${i}: ${name.trim()}`);
  }

  if (fileRows.length === 0) {
    console.log('No files found. Creating a test document...');
    // Try to find an upload or new button
    const newBtn = page.locator('#new-file-menu-btn, button:has-text("New"), button:has-text("+")');
    if (await newBtn.count() > 0) {
      console.log('Found new file button');
    }
  }

  // Right-click on the first file
  if (fileRows.length > 0) {
    console.log('\n=== Step 3: Right-click on first file ===');
    await fileRows[0].click({ button: 'right' });
    await page.waitForTimeout(2000);

    // Get all context menu items
    const menuItems = await page.locator('.oc-context-menu li, .v-popper__inner li, [role="menuitem"], .oc-context-actions li').allTextContents();
    console.log(`Context menu items (${menuItems.length}):`);
    menuItems.forEach((item, i) => console.log(`  ${i}: ${item.trim()}`));

    // Check for "Open" specifically
    const hasOpen = menuItems.some(item => item.toLowerCase().includes('open'));
    console.log(`\n"Open" button present: ${hasOpen ? 'YES!' : 'NO'}`);

    // Also check the app/list response
    console.log('\n=== Step 4: Check app/list responses ===');
    const appListResponses = requests.filter(r => r.url.includes('/app/list'));
    if (appListResponses.length > 0) {
      console.log(`Found ${appListResponses.length} /app/list responses`);
      appListResponses.forEach((r, i) => {
        console.log(`  Response ${i}: status=${r.status}, body=${r.body.substring(0, 300)}`);
      });
    } else {
      console.log('No /app/list responses captured. Checking directly...');
      const appListRes = await page.evaluate(async () => {
        const res = await fetch('/app/list');
        const data = await res.json();
        return { status: res.status, data: JSON.stringify(data).substring(0, 500) };
      });
      console.log(`Direct /app/list: status=${appListRes.status}, body=${appListRes.data}`);
    }

    // Check for any "Open with" or app-provider related menu items
    console.log('\n=== Step 5: Check for external app integration ===');
    const allText = await page.locator('body').innerText().catch(() => '');
    const hasOpenWith = allText.includes('Open with') || allText.includes('Open in') || allText.includes('euro_Office');
    console.log(`Has "Open with/Open in/euro_Office" text: ${hasOpenWith}`);

    // Look for any buttons/links with "open" in them
    const openElements = await page.locator('[class*="open" i], [data-test*="open" i], button:has-text("Open")').allTextContents();
    console.log(`Elements with "open": ${JSON.stringify(openElements)}`);

    // Press Escape to close context menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  console.log('\n=== Done ===');
  console.log('Browser will stay open for 60 seconds for manual inspection...');
  await page.waitForTimeout(60000);
  await browser.close();
})();
