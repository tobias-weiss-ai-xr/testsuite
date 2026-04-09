const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // Collect all console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.length < 500) console.log(`[CONSOLE ${msg.type()}] ${text}`);
  });
  // Collect all network requests to OCIS
  page.on('request', req => {
    const url = req.url();
    if (url.includes('localhost:9200') || url.includes('localhost:8083')) {
      console.log(`[REQ ${req.method()}] ${url.substring(0, 150)}`);
    }
  });
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('wopi') || url.includes('hosting')) {
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
  await page.waitForTimeout(2000);

  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('oc_oAuth.user:https://localhost:9200:web');
    return raw ? JSON.parse(raw).access_token : null;
  });

  // Upload DOCX
  console.log('[2] Upload DOCX...');
  await page.evaluate(async ({ token }) => {
    const ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>WOPI Test</w:t></w:r></w:p></w:body></w:document>';
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
    await fetch('/dav/files/admin/wopi-debug.docx',{method:'PUT',headers:{'Authorization':'Bearer '+token},body:blob});
  }, { token });

  // Get the file's OCIS resource ID via WebDAV PROPFIND with allprops
  console.log('[3] Get file metadata...');
  const meta = await page.evaluate(async ({ token }) => {
    // Use allprop to get all WebDAV properties including oc-fileid
    const r = await fetch('/dav/files/admin/', {
      method: 'PROPFIND',
      headers: { Depth: '1', Authorization: 'Bearer ' + token },
    });
    const text = await r.text();
    // Find the entry for our file
    const fileEntry = text.match(/<d:response>[\s\S]*?wopi-debug\.docx[\s\S]*?<\/d:response>/);
    if (fileEntry) {
      return fileEntry[0].substring(0, 2000);
    }
    // Just return the raw text snippet around our file
    const idx = text.indexOf('wopi-debug.docx');
    if (idx >= 0) {
      return text.substring(Math.max(0, idx - 500), idx + 500);
    }
    return text.substring(0, 2000);
  }, { token });
  console.log('   File metadata:', meta);

  // Try to get the file ID via OCIS graph API
  console.log('[4] Try OCIS graph API...');
  const graphMeta = await page.evaluate(async ({ token }) => {
    try {
      const r = await fetch('/graph/v1.0/me/drive/root/children', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await r.json();
      const file = data.value && data.value.find(f => f.name === 'wopi-debug.docx');
      return file || { status: r.status, data: JSON.stringify(data).substring(0, 500) };
    } catch (e) {
      return { error: e.message };
    }
  }, { token });
  console.log('   Graph API result:', JSON.stringify(graphMeta));

  // Now try the WOPI endpoint with different file ID formats
  console.log('[5] Test WOPI CheckFileInfo with different file IDs...');

  const fileId = graphMeta.id || graphMeta.fileId || 'unknown';
  console.log('   File ID:', fileId);

  // Test CheckFileInfo
  const wopiTests = await page.evaluate(async ({ token, fileId }) => {
    const results = [];
    const ids = [fileId];
    
    // Also try with storage_id/resource_id format from WebDAV
    const webdavMatch = fileId.match(/^([a-f0-9-]+)~([a-f0-9-]+)$/);
    if (webdavMatch) {
      ids.push(webdavMatch[1] + webdavMatch[2]);
    }
    // Also try the path-based ID
    ids.push('wopi-debug.docx');
    ids.push('/wopi-debug.docx');

    for (const id of ids) {
      const url = `https://localhost:9200/wopi/files/${id}`;
      try {
        const r = await fetch(url, {
          headers: { Authorization: 'Bearer ' + token },
        });
        const text = await r.text();
        results.push({ id: id.substring(0, 60), status: r.status, body: text.substring(0, 200) });
      } catch (e) {
        results.push({ id: id.substring(0, 60), error: e.message });
      }
    }
    return results;
  }, { token, fileId });
  for (const t of wopiTests) {
    console.log(`   ID "${t.id}" -> ${t.status || t.error}: ${t.body || ''}`);
  }

  // Cleanup
  await page.evaluate(async ({ token }) => {
    await fetch('/dav/files/admin/wopi-debug.docx', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
  }, { token });

  await browser.close();
  console.log('Done.');
})();
