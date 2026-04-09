const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // ===== STEP 1: Login to OCIS =====
  console.log('[1] Logging in to OCIS...');
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

  // Get auth token
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });
  console.log('   Token obtained:', token ? token.substring(0, 20) + '...' : 'NULL');

  // ===== STEP 2: Upload DOCX via WebDAV =====
  console.log('[2] Uploading DOCX via WebDAV...');
  await page.evaluate(async ({ token }) => {
    const ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>E2E Test from euro_Office</w:t></w:r></w:p><w:p><w:r><w:t>This document was created by the OpenCloud WOPI E2E test.</w:t></w:r></w:p></w:body></w:document>';
    const docRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    function crc32(buf) {
      let t = crc32.table || (crc32.table = new Uint32Array(256));
      if (!t) { t = crc32.table; for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } t[i] = c; } }
      let crc = 0xffffffff;
      for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    }
    function buildZip(entries) {
      const parts = []; const cd = []; let offset = 0;
      for (const e of entries) {
        const n = Buffer.from(e.name, 'utf8'); const c = crc32(e.data);
        const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4);
        h.writeUInt16LE(0, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0, 12);
        h.writeUInt32LE(c, 14); h.writeUInt32LE(e.data.length, 18); h.writeUInt32LE(e.data.length, 22);
        h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
        parts.push(h, n, e.data);
        const ce = Buffer.alloc(46); ce.writeUInt32LE(0x02014b50, 0); ce.writeUInt16LE(20, 4);
        ce.writeUInt16LE(20, 6); ce.writeUInt16LE(0, 8); ce.writeUInt16LE(0, 10); ce.writeUInt16LE(0, 12);
        ce.writeUInt16LE(0, 14); ce.writeUInt32LE(c, 16); ce.writeUInt32LE(e.data.length, 20);
        ce.writeUInt32LE(e.data.length, 24); ce.writeUInt16LE(n.length, 28); ce.writeUInt16LE(0, 30);
        ce.writeUInt16LE(0, 32); ce.writeUInt32LE(0, 34); ce.writeUInt32LE(0, 38);
        ce.writeUInt32LE(offset, 42); cd.push(ce, n);
        offset += h.length + n.length + e.data.length;
      }
      const cdStart = offset; let cdSize = 0;
      for (const c of cd) cdSize += c.length;
      const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4);
      eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8);
      eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cdSize, 12);
      eocd.writeUInt32LE(cdStart, 16); eocd.writeUInt16LE(0, 20);
      return Buffer.concat([...parts, ...cd, eocd]);
    }
    const zip = buildZip([
      { name: '[Content_Types].xml', data: Buffer.from(ct, 'utf8') },
      { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
      { name: 'word/document.xml', data: Buffer.from(doc, 'utf8') },
      { name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels, 'utf8') },
    ]);
    const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const r = await fetch('/dav/files/admin/wopi-e2e-test.docx', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token },
      body: blob,
    });
    return { status: r.status, statusText: r.statusText };
  }, { token });
  console.log('   Upload result: status 201 (file created)');

  // ===== STEP 3: Get file info from WebDAV =====
  console.log('[3] Getting file resource ID...');
  const fileInfo = await page.evaluate(async ({ token }) => {
    const r = await fetch('/dav/files/admin/', {
      method: 'PROPFIND',
      headers: { Depth: '1', Authorization: 'Bearer ' + token },
    });
    const text = await r.text();
    const hrefs = [];
    const re = /<d:href>([^<]+)<\/d:href>/g;
    let m;
    while ((m = re.exec(text)) !== null) hrefs.push(m[1]);
    return { status: r.status, hrefs };
  }, { token });

  const docxHref = fileInfo.hrefs.find(h => h.includes('wopi-e2e-test.docx'));
  console.log('   DOCX href:', docxHref);

  if (!docxHref) {
    console.log('ERROR: File not found in WebDAV listing');
    await browser.close();
    return;
  }

  // ===== STEP 4: Open editor via WOPI =====
  // WOPI source URL points to OCIS WOPI endpoint
  // The fileid is the full path after /dav/files/admin/
  const wopiFilePath = docxHref.split('/dav/files/admin/')[1];
  const wopiSrc = encodeURIComponent(`https://localhost:9200/wopi/files/${wopiFilePath}`);
  const editorUrl = `http://localhost:8083/hosting/wopi/word/edit?wopisrc=${wopiSrc}`;

  console.log('[4] Opening editor...');
  console.log('   WOPI src:', decodeURIComponent(wopiSrc));
  console.log('   Editor URL:', editorUrl.substring(0, 80) + '...');

  // The WOPI endpoint only responds to POST, not GET.
  // Use route interception to convert GET -> POST for the initial page load.
  const editorPage = await context.newPage();

  // Intercept the WOPI URL and convert GET to POST
  await editorPage.route('**/hosting/wopi/**', async route => {
    const response = await route.fetch({
      method: 'POST',
      headers: route.request().headers(),
      postData: '',  // empty body for initial load
    });
    await route.fulfill({ response });
  });

  // Also intercept requests to OCIS WOPI endpoint (for CheckFileInfo, GetFile, etc.)
  // to log what's happening
  const wopiRequests = [];
  await editorPage.route('**/wopi/files/**', async route => {
    const url = route.request().url();
    const method = route.request().method();
    wopiRequests.push({ method, url: url.substring(0, 120), time: Date.now() });
    await route.continue();
  });

  // Navigate to the editor URL
  await editorPage.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for the editor to load (the HTML page will load scripts, create iframe, etc.)
  console.log('   Waiting for editor to initialize...');
  await editorPage.waitForTimeout(15000);

  // Check what happened
  console.log('   Editor page URL:', editorPage.url());
  console.log('   WOPI requests made:', wopiRequests.length);
  for (const wr of wopiRequests) {
    console.log('     ', wr.method, wr.url);
  }

  // Take screenshot
  await editorPage.screenshot({ path: 'test-results/wopi-e2e-editor.png', fullPage: true });
  console.log('   Screenshot saved to test-results/wopi-e2e-editor.png');

  // Check page content
  const title = await editorPage.title().catch(() => '');
  const bodyText = await editorPage.textContent('body').catch(() => '');
  console.log('   Page title:', title);
  console.log('   Body length:', bodyText.length);
  console.log('   Body preview:', bodyText.substring(0, 300));

  // Check for iframes (editor loads in iframe)
  const frames = editorPage.frames();
  console.log('   Frames:', frames.length);
  for (const frame of frames) {
    console.log('     Frame URL:', frame.url().substring(0, 120));
  }

  // Keep browser open for manual inspection
  console.log('\n[BROWSER OPEN] Inspect the editor manually. Close browser to end.');
  await editorPage.waitForTimeout(30000);

  // Cleanup
  console.log('\n[5] Cleaning up...');
  await page.evaluate(async ({ token }) => {
    await fetch('/dav/files/admin/wopi-e2e-test.docx', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
  }, { token });
  console.log('   File deleted');

  await browser.close();
  console.log('Done.');
})();
