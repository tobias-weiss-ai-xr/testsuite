// Quick test: check if app-provider route works and "Open" button appears
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Listen for API responses
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('app-provider') || url.includes('app-registry')) {
      try {
        const body = await response.text();
        apiResponses.push({ url, status: response.status(), body: body.substring(0, 500) });
        console.log(`[API] ${response.status()} ${url}`);
        console.log(`  Body: ${body.substring(0, 200)}`);
      } catch (e) {}
    }
  });

  try {
    // Step 1: Login
    console.log('=== Logging in to OCIS ===');
    await page.goto('https://localhost:9200');
    await page.waitForURL('**/login**', { timeout: 10000 });
    
    await page.fill('#oc-login-username', 'admin');
    await page.fill('#oc-login-password', 'admin');
    await page.click('button:has-text("Log in")');
    
    // Wait for redirect to files app
    await page.waitForURL('**/files/**', { timeout: 15000 });
    console.log('✓ Logged in successfully');
    
    // Step 2: Upload a test DOCX file
    console.log('\n=== Uploading test document ===');
    const fs = require('fs');
    
    // Create minimal DOCX
    function crc32(buf) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    
    function buildZip(files) {
      const entries = [];
      let offset = 0;
      for (const [name, content] of Object.entries(files)) {
        const nameBytes = Buffer.from(name, 'utf8');
        const crc = crc32(content);
        entries.push({ nameBytes, content, crc, offset });
        offset += 30 + nameBytes.length + content.length;
      }
      const centralDirOffset = offset;
      let centralDirSize = 0;
      const centralEntries = [];
      for (const e of entries) {
        const ce = Buffer.alloc(46 + e.nameBytes.length);
        ce.writeUInt32LE(0x02014b50, 0); // central header
        ce.writeUInt16LE(20, 4); ce.writeUInt16LE(0, 6);
        ce.writeUInt16LE(0, 8); ce.writeUInt16LE(0, 10);
        ce.writeUInt32LE(e.crc, 16);
        ce.writeUInt32LE(e.content.length, 20);
        ce.writeUInt32LE(e.content.length, 24);
        ce.writeUInt16LE(e.nameBytes.length, 28);
        ce.writeUInt16LE(0, 30); ce.writeUInt16LE(0, 32);
        ce.writeUInt16LE(0, 34); ce.writeUInt16LE(0, 36);
        ce.writeUInt32LE(0, 38); ce.writeUInt32LE(0x20, 42);
        e.nameBytes.copy(ce, 46);
        centralEntries.push(ce);
        centralDirSize += ce.length;
      }
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
      eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
      eocd.writeUInt32LE(centralDirSize, 12);
      eocd.writeUInt32LE(centralDirOffset, 16); eocd.writeUInt16LE(0, 20);
      
      const parts = [];
      for (const e of entries) {
        const lh = Buffer.alloc(30 + e.nameBytes.length);
        lh.writeUInt32LE(0x04034b50, 0); // local header
        lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10);
        lh.writeUInt32LE(e.crc, 14);
        lh.writeUInt32LE(e.content.length, 18);
        lh.writeUInt32LE(e.content.length, 22);
        lh.writeUInt16LE(e.nameBytes.length, 26);
        lh.writeUInt16LE(0, 28);
        e.nameBytes.copy(lh, 30);
        parts.push(lh, e.content);
      }
      parts.push(...centralEntries, eocd);
      return Buffer.concat(parts);
    }
    
    const [Content_Types] = ['[Content_Types].xml'];
    const docx = buildZip({
      '[Content_Types].xml': Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      '_rels/.rels': Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      'word/document.xml': Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from euro_Office E2E test!</w:t></w:r></w:p></w:body></w:document>')
    });
    
    const docxPath = '/tmp/test-euro-office.docx';
    fs.writeFileSync(docxPath, docx);
    console.log(`Created test DOCX: ${docxPath.length} bytes`);
    
    // Upload via WebDAV
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('oc_oAuth.user:'));
      return key ? JSON.parse(localStorage.getItem(key)).access_token : null;
    });
    console.log(`Got access token: ${token ? token.substring(0, 20) + '...' : 'null'}`);
    
    if (token) {
      // Upload file
      const https = require('https');
      const uploadResult = await new Promise((resolve, reject) => {
        const req = https.request('https://localhost:9200/dav/files/admin/test-euro-office.docx', {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Length': docx.length
          },
          rejectUnauthorized: false
        }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(docx);
        req.end();
      });
      console.log(`Upload result: ${uploadResult.status}`);
    }
    
    // Reload the page to see the uploaded file
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Step 3: Look for the file and try to open it
    console.log('\n=== Looking for test document ===');
    
    // Try to find the file in the file list
    const fileRows = await page.locator('resource-table-row, [data-test-resource-name], tr').all();
    console.log(`Found ${fileRows.length} rows in file list`);
    
    // Look for "test-euro-office.docx" text
    const fileElement = page.locator('text=test-euro-office.docx');
    const fileVisible = await fileElement.isVisible().catch(() => false);
    console.log(`File visible: ${fileVisible}`);
    
    if (fileVisible) {
      // Right-click on the file to open context menu
      console.log('\n=== Right-clicking on file ===');
      await fileElement.click({ button: 'right' });
      await page.waitForTimeout(1000);
      
      // Check for "Open" button in context menu
      const openButton = page.locator('text=Open');
      const openVisible = await openButton.isVisible().catch(() => false);
      console.log(`"Open" button visible in context menu: ${openVisible}`);
      
      // Screenshot the context menu
      await page.screenshot({ path: 'test-context-menu.png' });
      console.log('Screenshot saved to test-context-menu.png');
      
      if (openVisible) {
        console.log('\n=== Clicking "Open" ===');
        await openButton.click();
        await page.waitForTimeout(3000);
        
        // Check if a new page/tab opened with the editor
        const pages = context.pages();
        console.log(`Number of pages: ${pages.length}`);
        
        if (pages.length > 1) {
          const editorPage = pages[1];
          console.log(`Editor page URL: ${editorPage.url()}`);
          await editorPage.screenshot({ path: 'test-editor.png' });
          console.log('Editor screenshot saved to test-editor.png');
        }
        
        await page.screenshot({ path: 'test-after-open.png' });
      }
    } else {
      // List all visible files
      const allText = await page.locator('body').innerText();
      const fileLines = allText.split('\n').filter(l => l.includes('.docx') || l.includes('.xlsx') || l.includes('test'));
      console.log('File-related text on page:', fileLines);
      await page.screenshot({ path: 'test-files-list.png' });
      console.log('Screenshot saved to test-files-list.png');
    }
    
    // Print all API responses
    console.log('\n=== API Responses ===');
    for (const r of apiResponses) {
      console.log(`${r.status} ${r.url}`);
      console.log(`  ${r.body.substring(0, 200)}`);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: 'test-error.png' });
  } finally {
    await browser.close();
  }
})();
