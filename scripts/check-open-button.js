const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // Monitor ALL requests
  page.on('request', req => {
    const url = req.url();
    if (url.includes('app-provider') || url.includes('collaboration') || url.includes('open-with')) {
      console.log(`[REQ ${req.method()}] ${url.substring(0, 150)}`);
    }
  });
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('app-provider') || url.includes('collaboration') || url.includes('open-with')) {
      console.log(`[RESP ${resp.status()}] ${url.substring(0, 150)}`);
    }
  });

  // Login
  console.log('[1] Login...');
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

  // Upload a DOCX
  console.log('[2] Upload DOCX...');
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  await page.evaluate(async ({ token }) => {
    const ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Open with euro_Office!</w:t></w:r></w:p></w:body></w:document>';
    const docRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    function crc32(buf){let t=crc32.table||(crc32.table=new Uint32Array(256));if(!t){t=crc32.table;for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++){c=c&1?0xedb88320^(c>>>1):c>>>1}t[i]=c}}let crc=0xffffffff;for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0}
    function buildZip(entries){const parts=[];const cd=[];let offset=0;for(const e of entries){const n=Buffer.from(e.name,'utf8');const c=crc32(e.data);const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0,6);h.writeUInt16LE(0,8);h.writeUInt16LE(0,10);h.writeUInt16LE(0,12);h.writeUInt32LE(c,14);h.writeUInt32LE(e.data.length,18);h.writeUInt32LE(e.data.length,22);h.writeUInt16LE(n.length,26);h.writeUInt16LE(0,28);parts.push(h,n,e.data);const ce=Buffer.alloc(46);ce.writeUInt32LE(0x02014b50,0);ce.writeUInt16LE(20,4);ce.writeUInt16LE(20,6);ce.writeUInt16LE(0,8);ce.writeUInt16LE(0,10);ce.writeUInt16LE(0,12);ce.writeUInt16LE(0,14);ce.writeUInt32LE(c,16);ce.writeUInt32LE(e.data.length,20);ce.writeUInt32LE(e.data.length,24);ce.writeUInt16LE(n.length,28);ce.writeUInt16LE(0,30);ce.writeUInt16LE(0,32);ce.writeUInt32LE(0,34);ce.writeUInt32LE(0,38);ce.writeUInt32LE(offset,42);cd.push(ce,n);offset+=h.length+n.length+e.data.length}
    const cdStart=offset;let cdSize=0;for(const c of cd)cdSize+=c.length;const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);eocd.writeUInt32LE(cdSize,12);eocd.writeUInt32LE(cdStart,16);eocd.writeUInt16LE(0,20);return Buffer.concat([...parts,...cd,eocd])}
    const zip = buildZip([
      {name:'[Content_Types].xml',data:Buffer.from(ct,'utf8')},
      {name:'_rels/.rels',data:Buffer.from(rels,'utf8')},
      {name:'word/document.xml',data:Buffer.from(doc,'utf8')},
      {name:'word/_rels/document.xml.rels',data:Buffer.from(docRels,'utf8')},
    ]);
    const blob = new Blob([zip],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    await fetch('/dav/files/admin/open-test.docx',{method:'PUT',headers:{'Authorization':'Bearer '+token},body:blob});
  }, { token });
  console.log('   Uploaded');

  // Wait for file to appear in the list
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Right-click on the file to check context menu
  console.log('[3] Looking for Open button...');
  const fileItem = await page.locator('text=open-test.docx').first();
  if (await fileItem.isVisible().catch(() => false)) {
    console.log('   File found in list. Right-clicking...');
    
    // Try right-click to open context menu
    await fileItem.click({ button: 'right' });
    await page.waitForTimeout(2000);

    // Check context menu for "Open" option
    const menuItems = await page.locator('.oc-context-menu, [role="menu"], .v-menu__content, .action-menu').all().catch(() => []);
    console.log('   Context menu items:', menuItems.length);
    for (const item of menuItems) {
      const text = await item.textContent().catch(() => '');
      console.log('     -', text.trim());
    }

    // Take screenshot of context menu
    await page.screenshot({ path: 'C:/Users/Tobias/git/euro_Office/test-results/context-menu.png' });
    console.log('   Screenshot: test-results/context-menu.png');
  } else {
    console.log('   File not visible in list');
    // Take screenshot of current state
    await page.screenshot({ path: 'C:/Users/Tobias/git/euro_Office/test-results/files-list.png' });
  }

  // Also check via the OCIS app-provider API
  console.log('[4] Check app-provider API...');
  const appProviderResult = await page.evaluate(async ({ token }) => {
    try {
      const r = await fetch('/app-provider/v1/open', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: 'open-test.docx' }),
      });
      const data = await r.text();
      return { status: r.status, body: data.substring(0, 500) };
    } catch (e) {
      return { error: e.message };
    }
  }, { token });
  console.log('   App-provider /open:', JSON.stringify(appProviderResult));

  // Try the graph API for open-with
  const graphResult = await page.evaluate(async ({ token }) => {
    try {
      const r = await fetch('/graph/v1.0/me/drive/root/children', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await r.json();
      const file = data.value && data.value.find(f => f.name === 'open-test.docx');
      if (file && file.webUrl) {
        // Try the webUrl or open-with endpoint
        const r2 = await fetch(file.webUrl.replace('download', 'open'), {
          headers: { Authorization: 'Bearer ' + token },
        });
        return { status: r2.status, url: file.webUrl, body: (await r2.text()).substring(0, 300) };
      }
      return { file: file ? { id: file.id, webUrl: file.webUrl } : null };
    } catch (e) {
      return { error: e.message };
    }
  }, { token });
  console.log('   Graph file:', JSON.stringify(graphResult));

  // Keep browser open
  console.log('\n[BROWSER OPEN - inspect manually. Close to exit.]');
  await page.waitForTimeout(60000);

  // Cleanup
  await page.evaluate(async ({ token }) => {
    await fetch('/dav/files/admin/open-test.docx', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
  }, { token });
  await browser.close();
  console.log('Done.');
})();
