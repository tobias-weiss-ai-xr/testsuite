const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

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

  console.log('Logged in, URL:', page.url());
  const hasWarning = await page.locator('text="Your browser is not supported"').isVisible().catch(() => false);
  console.log('Browser warning visible:', hasWarning);

  // Upload file
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  await page.evaluate(async ({ token }) => {
    // Create a minimal valid DOCX file in the browser
    const ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>';
    const docRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    // Build a minimal ZIP file (STORE method, no compression)
    function buildZip(entries) {
      const parts = []; const cd = []; let offset = 0;
      function crc32(buf) { let t=crc32.table||(crc32.table=new Uint32Array(256)); if(!t){t=crc32.table;for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++){c=c&1?0xedb88320^(c>>>1):c>>>1}t[i]=c}}let crc=0xffffffff;for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0}
      for(const e of entries){const n=Buffer.from(e.name,'utf8');const c=crc32(e.data);const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0,6);h.writeUInt16LE(0,8);h.writeUInt16LE(0,10);h.writeUInt16LE(0,12);h.writeUInt32LE(c,14);h.writeUInt32LE(e.data.length,18);h.writeUInt32LE(e.data.length,22);h.writeUInt16LE(n.length,26);h.writeUInt16LE(0,28);parts.push(h,n,e.data);const ce=Buffer.alloc(46);ce.writeUInt32LE(0x02014b50,0);ce.writeUInt16LE(20,4);ce.writeUInt16LE(20,6);ce.writeUInt16LE(0,8);ce.writeUInt16LE(0,10);ce.writeUInt16LE(0,12);ce.writeUInt16LE(0,14);ce.writeUInt32LE(c,16);ce.writeUInt32LE(e.data.length,20);ce.writeUInt32LE(e.data.length,24);ce.writeUInt16LE(n.length,28);ce.writeUInt16LE(0,30);ce.writeUInt16LE(0,32);ce.writeUInt32LE(0,34);ce.writeUInt32LE(0,38);ce.writeUInt32LE(offset,42);cd.push(ce,n);offset+=h.length+n.length+e.data.length}
      const cdStart=offset;let cdSize=0;for(const c of cd)cdSize+=c.length;const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);eocd.writeUInt32LE(cdSize,12);eocd.writeUInt32LE(cdStart,16);eocd.writeUInt16LE(0,20);return Buffer.concat([...parts,...cd,eocd]);
    }
    const zip = buildZip([
      {name: '[Content_Types].xml', data: Buffer.from(ct, 'utf8')},
      {name: '_rels/.rels', data: Buffer.from(rels, 'utf8')},
      {name: 'word/document.xml', data: Buffer.from(doc, 'utf8')},
      {name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels, 'utf8')},
    ]);
    const blob = new Blob([zip], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    await fetch('/dav/files/admin/wopi-click-test.docx', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token },
      body: blob,
    });
  }, { token });

  // Navigate to files
  await page.goto(page.url().includes('files') ? page.url() : 'https://localhost:9200/files/spaces/personal/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  try { await page.waitForSelector('table tbody tr td', { timeout: 15000 }); } catch {}

  // Monitor network requests
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('wopi') || url.includes('hosting') || url.includes('8083') || url.includes('app-provider') || url.includes('app.provider') || url.includes('open') || url.includes('registry') || url.includes('mimetype')) {
      console.log('>> REQUEST:', req.method(), url.substring(0, 200));
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('wopi') || url.includes('hosting') || url.includes('8083') || url.includes('app-provider') || url.includes('app.provider') || url.includes('open') || url.includes('registry') || url.includes('mimetype')) {
      console.log('<< RESPONSE:', res.status(), url.substring(0, 200));
    }
  });

  // Listen for new pages
  context.on('page', (p) => {
    console.log('NEW PAGE:', p.url());
  });

  // Click the file
  const fileEl = page.locator('text="wopi-click-test"').first();
  const visible = await fileEl.isVisible().catch(() => false);
  console.log('File visible:', visible);

  if (visible) {
    // Try single click
    await fileEl.click();
    console.log('Single clicked');
    await page.waitForTimeout(3000);

    let urlAfter = page.url();
    let pages = context.pages();
    console.log('After single click - URL:', urlAfter);
    console.log('After single click - Pages:', pages.length);
    let frames = page.frames();
    console.log('After single click - Frames:', frames.length);

    // Try double click
    if (pages.length === 1) {
      console.log('Trying double click...');
      await fileEl.dblclick();
      await page.waitForTimeout(5000);

      urlAfter = page.url();
      pages = context.pages();
      frames = page.frames();
      console.log('After double click - URL:', urlAfter);
      console.log('After double click - Pages:', pages.length);
      console.log('After double click - Frames:', frames.length);
      for (const f of frames) {
        console.log('  Frame URL:', f.url().substring(0, 150));
      }
    }

    // Try right-click context menu
    if (pages.length === 1) {
      console.log('Trying right-click context menu...');
      await fileEl.click({ button: 'right' });
      await page.waitForTimeout(2000);

      // Check for context menu items
      const menuItems = await page.locator('.oc-context-menu, [role="menu"], .context-menu').allTextContents();
      console.log('Context menu items:', menuItems);

      // Look for "Open" or "Edit" options
      const openOption = page.locator('text=Open').first();
      const editOption = page.locator('text=Edit').first();
      const openInApp = page.locator('text="Open in"').first();

      for (const [name, loc] of [['Open', openOption], ['Edit', editOption], ['Open in', openInApp]]) {
        const vis = await loc.isVisible().catch(() => false);
        if (vis) {
          console.log(`Found "${name}" option, clicking...`);
          await loc.click();
          await page.waitForTimeout(5000);
          pages = context.pages();
          frames = page.frames();
          console.log('After context click - Pages:', pages.length, 'Frames:', frames.length);
          for (const f of frames) {
            console.log('  Frame URL:', f.url().substring(0, 150));
          }
          break;
        }
      }
    }

    await page.screenshot({ path: 'test-results/debug-click-ua.png', fullPage: true });
  }

  // Cleanup
  await page.evaluate(async ({ token }) => {
    await fetch('/dav/files/admin/wopi-click-test.docx', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
  }, { token });

  await browser.close();
})();
