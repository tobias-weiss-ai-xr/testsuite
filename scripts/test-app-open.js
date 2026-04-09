#!/usr/bin/env node
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  let token = null;
  page.on('response', async r => {
    if (r.url().includes('/konnect/v1/token')) {
      try { const b = await r.json(); if (b.access_token) token = b.access_token; } catch(e){}
    }
  });

  await page.goto('https://localhost:9200', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#oc-login-username', { state: 'visible', timeout: 30000 });
  await page.waitForSelector('#oc-login-password', { state: 'visible', timeout: 5000 });
  await page.fill('#oc-login-username', 'admin');
  await page.fill('#oc-login-password', 'admin');
  await Promise.all([
    page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
    page.click('button:has-text("Log in")'),
  ]);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(3000);

  if (!token) { console.log('No token captured'); await browser.close(); process.exit(1); }
  console.log('Token:', token.substring(0, 30) + '...');

  // The reva app-provider HTTP handler reads file_id from query params, NOT body!
  // POST /app/open?file_id=<resource_id>&view_mode=read_write&app_name=<app_name>
  const fileId = '27a0af90-399b-4075-9f24-8f5e31a79bb0$802e8371-3e52-43bb-a6aa-bd87e13423ea!5ae667ab-63e9-4a45-883d-ff7c5e0b5daa';

  // First, upload a fresh test file and get its file ID
  console.log('\n=== Ensure WOPITest folder exists ===');
  const mkcolResult = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, { method: 'MKCOL', headers: { 'Authorization': `Bearer ${token}` } });
    return { status: res.status };
  }, { url: 'https://localhost:9200/dav/files/admin/WOPITest/', token });
  console.log(`MKCOL WOPITest: ${mkcolResult.status} (${mkcolResult.status === 201 ? 'created' : mkcolResult.status === 405 ? 'exists' : 'error'})`);

  // First, upload a fresh test file and get its file ID
  console.log('\n=== Upload fresh test file ===');
  const timestamp = Date.now() + Math.floor(Math.random() * 10000);
  const filename = `wopi-test-${timestamp}.docx`;
  const minimalDocxB64 = 'UEsDBBQABgAIAAAAIQD/2X8S0AEAAM8EAAATAAgCW0NvbnRlbnRfVHlwZXMueG1sIIJyZWxzLy5yZWxzCi4uL3dvcmQvZG9jdW1lbnQueG1sCqSwTsMwDIvPSfQjd2FHQ/ZDxJyiYxQaJG2YfaHAWbaSNG1k3dbSNNrpCj6T7v5wTPnJTt3yvun1P9yA6f0aQWCiC3xiR4QLJcOFAzCkVOA7U1BYa3VyDGATp0fJKKBqKAr+AiycMQmK4xzGfVkD6eYQgK3uCUZx8qQiBKFGSnkAUEsHCAVV4W1NAAAAagEAAFBLAwQUAAYACAAAACEApL6x/QEAAAAPAQAACwAIAl9yZWxzLy5yZWxzCjxSeWVyZW5jaWVzLz52YXIvRU9IL1Jvb3RNYW5pZmVzdC54bWwKPC9SdWxlcz4KCi88cm9vdE1hbmlmZXN0IHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L21ldGFkYXRhL2NvcmUtcHJvcGVydGllcyI+CiAgPERlZmF1bHRTdHJldGNoIFBhcnRDb25maWd1cmF0aW9ucz0iZXh0cmFjdC8yMDEyIiAvPgo8L3Jvb3RNYW5pZmVzdD4KUEsHCAB2+sS0AQAAFwEAAFBLAwQUAAYACAAAACEAu5Wq1wMAAABIAQAADQAIAl3b3JkL2RvY3VtZW50LnhtbCiVwU4DQAwCG1+n9FS2sbscudDqHRAZKNrRjXRHEM1smcBNTk3GLkFKdQmYtVOCvlV1olUVWt2UBXILIS5Wp1cBZmAApFKc0DsIpYCnRUVVZJVsUT6KUWjKpZt1WpCwVdMFU0AFBLBwiVoapnAAAAUQEAAFBLAQIUABQABgAIAAAAIQD/2X8S0AEAAM8EAAAEAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAGAAgAAAAhAKS+s/0BAAAADwEAAAkAAAAAAAAAAAAAAAAAPwEAABfcmVscy8ucmVsc1BLAQIUABQABgAIAAAAIQC72rXBAwAAAEgBAAANAAAAAAAAAAAAAAAAAGwEAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAAB2FgEAAAAA';

  const uploadResult = await page.evaluate(async ({ url, docxBase64, token }) => {
    const binary = Uint8Array.from(atob(docxBase64), c => c.charCodeAt(0));
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Authorization': `Bearer ${token}`,
      },
      body: binary,
    });
    return { status: res.status, etag: res.headers.get('etag') };
  }, { url: `https://localhost:9200/dav/files/admin/WOPITest/${filename}`, docxBase64: minimalDocxB64, token });
  console.log(`Upload: ${uploadResult.status} (etag: ${uploadResult.etag})`);

  // Get file ID via PROPFIND
  const propfindResult = await page.evaluate(async ({ url, token }) => {
    const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:getetag/><oc:fileid/><d:resourcetype/></d:prop></d:propfind>';
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: { 'Depth': '0', 'Content-Type': 'application/xml', 'Authorization': `Bearer ${token}` },
      body,
    });
    return { status: res.status, data: await res.text() };
  }, { url: `https://localhost:9200/dav/files/admin/WOPITest/${filename}`, token });

  let freshFileId = null;
  if (propfindResult.status === 207) {
    const fidMatch = propfindResult.data.match(/<oc:fileid[^>]*>([^<]+)<\/oc:fileid>/i);
    if (fidMatch) freshFileId = fidMatch[1];
  }
  console.log(`File ID: ${freshFileId || 'not found'}`);
  console.log(`PROPFIND status: ${propfindResult.status}`);
  if (!freshFileId) {
    console.log(`PROPFIND response: ${propfindResult.data.substring(0, 500)}`);
  }

  if (!freshFileId) {
    console.log('Cannot get file ID, aborting');
    await browser.close();
    process.exit(1);
  }

  // Call /app/open and parse the response
  console.log('\n=== /app/open ===');
  const appOpenResult = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.text();
    return { status: res.status, data };
  }, { url: `https://localhost:9200/app/open?file_id=${encodeURIComponent(freshFileId)}&app_name=EuroOffice`, token });

  console.log(`Status: ${appOpenResult.status}`);
  console.log(`Response: ${appOpenResult.data.substring(0, 300)}`);

  let appOpenJson = null;
  try { appOpenJson = JSON.parse(appOpenResult.data); } catch(e) {
    console.log('Failed to parse /app/open response as JSON');
    await browser.close();
    process.exit(1);
  }

  const wopiSrc = decodeURIComponent(appOpenJson.app_url.match(/WOPISrc=([^&]+)/)?.[1] || '');
  const wopiAccessToken = appOpenJson.form_parameters?.access_token || '';
  const fileIdInWopi = wopiSrc.split('/wopi/files/')[1] || '';

  console.log(`\n=== Parsed WOPI params ===`);
  console.log(`WOPISrc: ${wopiSrc}`);
  console.log(`File ID in WOPI: ${fileIdInWopi}`);
  console.log(`Access token: ${wopiAccessToken.substring(0, 40)}...`);

  // Use Node.js native fetch for HTTP calls (avoids mixed-content block in browser context)
  // === TEST: CheckFileInfo ===
  // Collaboration service WOPI endpoint: GET /wopi/files/{id}?access_token={jwt}
  console.log('\n=== CheckFileInfo (collaboration WOPI endpoint) ===');
  try {
    const cfiRes = await fetch(`http://localhost:9300/wopi/files/${fileIdInWopi}?access_token=${wopiAccessToken}`);
    const cfiData = await cfiRes.text();
    console.log(`Status: ${cfiRes.status}`);
    console.log(`Response: ${cfiData.substring(0, 500)}`);
    if (cfiRes.status !== 200) {
      console.log('CheckFileInfo FAILED — checking collaboration logs...');
    }
  } catch(e) {
    console.log(`CheckFileInfo fetch error: ${e.message}`);
  }

  // === TEST: Editor URL via nginx proxy (fetch only — no browser needed) ===
  const localWopiSrc = wopiSrc.replace('test-collaboration:9300', 'localhost:9300');
  const editorUrl = `http://localhost:8083/hosting/wopi/word/edit?WOPISrc=${encodeURIComponent(localWopiSrc)}`;
  console.log('\n=== Editor URL (eo-docs fetch) ===');
  console.log(`URL: ${editorUrl.substring(0, 120)}...`);
  try {
    const edRes = await fetch(editorUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `access_token=${encodeURIComponent(wopiAccessToken)}`, redirect: 'manual' });
    const edContentType = edRes.headers.get('content-type') || '';
    const edText = await edRes.text();
    console.log(`Status: ${edRes.status}`);
    console.log(`Content-Type: ${edContentType}`);
    console.log(`Response length: ${edText.length} bytes`);
    console.log(`Preview: ${edText.substring(0, 300)}`);
    const isHtml = edContentType.includes('text/html');
    const hasEditor = edText.includes('editor') || edText.includes('iframe') || edText.includes('script');
    console.log(`Is HTML: ${isHtml}, Contains editor references: ${hasEditor}`);
  } catch(e) {
    console.log(`Editor fetch error: ${e.message}`);
  }

  // === TEST: Navigate to editor in browser ===
  // eo-docs requires POST to the editor URL (method: "POST" from /app/open response).
  // IMPORTANT: Use the ORIGINAL WOPISrc (with container hostname) — eo-docs calls WOPISrc
  // server-side from inside the container, so it needs the container hostname.
  // The browser never calls WOPISrc directly — eo-docs does.
  console.log('\n=== Navigate to editor in browser (POST) ===');
  const consoleErrors = [];
  const consoleLogs = [];
  const failedRequests = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    else consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE_ERROR: ${err.message}`));
  page.on('requestfailed', req => {
    failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on('response', async res => {
    if (res.status() >= 400) {
      failedRequests.push(`HTTP ${res.status()}: ${res.url()}`);
    }
  });

  try {
    // Create a self-submitting form page that POSTs to the editor URL
    // Use direct eo-docs URL (bypass nginx proxy) to rule out proxy issues
    const editorPostUrl = `http://localhost:8082/hosting/wopi/word/edit?WOPISrc=${encodeURIComponent(wopiSrc)}`;
    const formHtml = `
      <html><body>
        <form id="f" method="POST" action="${editorPostUrl.replace(/"/g, '&quot;')}">
          <input type="hidden" name="access_token" value="${wopiAccessToken}" />
        </form>
        <script>document.getElementById('f').submit();</script>
      </body></html>
    `;
    await page.setContent(formHtml);
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(15000);

    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`Page title: ${pageTitle}`);
    console.log(`Page URL: ${pageUrl.substring(0, 150)}`);
    await page.screenshot({ path: 'scripts/editor-screenshot.png', fullPage: false });
    console.log('Screenshot saved: scripts/editor-screenshot.png');

    // Check page body for error details
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'empty');
    console.log(`\nBody text: ${bodyText}`);

    if (consoleErrors.length > 0) {
      console.log(`\n=== Console Errors (${consoleErrors.length}) ===`);
      consoleErrors.forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 200)}`));
    }
    if (failedRequests.length > 0) {
      console.log(`\n=== Failed Requests (${failedRequests.length}) ===`);
      failedRequests.forEach((r, i) => console.log(`  [${i}] ${r.substring(0, 200)}`));
    }

    // Check if the editor iframe loaded
    const iframes = await page.frames();
    console.log(`\nFrames: ${iframes.length}`);
    for (const f of iframes) {
      console.log(`  Frame: ${f.url().substring(0, 150)}`);
    }

    // Check editor frame for canvas/content elements
    const editorFrame = iframes.length > 1 ? iframes[1] : page;
    const editorState = await editorFrame.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const iframe = document.querySelector('iframe');
      const editorEl = document.getElementById('editor');
      const loadingEl = document.querySelector('.loading-page');
      const errorEl = document.querySelector('.error-page');
      return {
        hasCanvas: !!canvas,
        hasIframe: !!iframe,
        hasEditor: !!editorEl,
        isLoading: !!loadingEl,
        isError: !!errorEl,
        editorStyle: editorEl ? editorEl.style.cssText.substring(0, 200) : 'N/A',
        loadingText: loadingEl ? loadingEl.innerText.substring(0, 200) : 'N/A',
        errorText: errorEl ? errorEl.innerText.substring(0, 200) : 'N/A',
        bodyClasses: document.body.className.substring(0, 200),
        childCount: document.body.children.length,
      };
    });
    console.log(`\n=== Editor State ===`);
    console.log(JSON.stringify(editorState, null, 2));

    // Check docservice logs for file operations
    console.log(`\n=== DocService WOPI Activity ===`);
    console.log('Check: docker exec eo-docs tail -20 /var/log/onlyoffice/documentserver/docservice/out.log');
  } catch(e) {
    console.log(`Navigation error: ${e.message}`);
    if (consoleErrors.length > 0) {
      console.log(`\n=== Console Errors (${consoleErrors.length}) ===`);
      consoleErrors.forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 200)}`));
    }
  }

  await browser.close();
})();
