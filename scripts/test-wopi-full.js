const { chromium } = require('playwright');
const http = require('http');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Direct HTTP fetch (bypasses browser mixed content)
function fetchWOPI(path, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 9300, path, method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
    };
    const req = http.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // Collect network requests
  page.on('request', req => {
    const url = req.url();
    if (url.includes('wopi') || url.includes('hosting')) {
      console.log(`[REQ ${req.method()}] ${url.substring(0, 150)}`);
    }
  });
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('wopi') || url.includes('hosting')) {
      console.log(`[RESP ${resp.status()}] ${url.substring(0, 150)}`);
    }
  });

  // ===== STEP 1: Login =====
  console.log('[1] Login to OCIS...');
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
  console.log('   Token:', token ? token.substring(0, 20) + '...' : 'NULL');

  // ===== STEP 2: Upload DOCX =====
  console.log('[2] Upload DOCX...');
  await page.evaluate(async ({ token }) => {
    const ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from euro_Office WOPI!</w:t></w:r></w:p><w:p><w:r><w:t>This proves the WOPI integration works end-to-end.</w:t></w:r></w:p></w:body></w:document>';
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
    const r = await fetch('/dav/files/admin/wopi-test.docx',{method:'PUT',headers:{'Authorization':'Bearer '+token},body:blob});
    return r.status;
  }, { token });
  console.log('   Uploaded');

  // ===== STEP 3: Get file ID from Graph API =====
  console.log('[3] Get file ID...');
  const fileData = await page.evaluate(async ({ token }) => {
    const r = await fetch('/graph/v1.0/me/drive/root/children', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await r.json();
    return data.value.find(f => f.name === 'wopi-test.docx');
  }, { token });
  const fileId = fileData.id;
  console.log('   File ID:', fileId);

  // ===== STEP 4: Test WOPI CheckFileInfo via Node.js (bypass mixed content) =====
  console.log('[4] Test WOPI CheckFileInfo (direct HTTP)...');
  const checkInfo = await fetchWOPI(`/wopi/files/${fileId}/`, token);
  console.log('   Status:', checkInfo.status);
  console.log('   Body:', checkInfo.body.substring(0, 500));

  // ===== STEP 5: Test WOPI GetFile =====
  console.log('[5] Test WOPI GetFile...');
  const getReq = await fetchWOPI(`/wopi/files/${fileId}/contents/`, token);
  console.log('   Status:', getReq.status);
  console.log('   Content-Length:', getReq.headers['content-length']);
  console.log('   Body (first 100):', getReq.body.substring(0, 100));

  // ===== STEP 5: Open editor in browser =====
  console.log('[5] Open editor...');
  const wopiSrc = encodeURIComponent(`http://localhost:9300/wopi/files/${fileId}`);
  const editorUrl = `http://localhost:8083/hosting/wopi/word/edit?wopisrc=${wopiSrc}`;
  console.log('   Editor URL:', editorUrl.substring(0, 100) + '...');

  const editorPage = await context.newPage();
  
  // Intercept WOPI URL and convert GET→POST
  await editorPage.route('**/hosting/wopi/**', async route => {
    const response = await route.fetch({
      method: 'POST',
      headers: route.request().headers(),
      postData: '',
    });
    await route.fulfill({ response });
  });

  // Track WOPI requests from the editor
  editorPage.on('response', resp => {
    const url = resp.url();
    if (url.includes('localhost:9300/wopi')) {
      console.log(`[EDITOR WOPI ${resp.status()}] ${url.substring(0, 120)}`);
    }
  });

  await editorPage.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('   Waiting for editor...');
  await editorPage.waitForTimeout(20000);

  console.log('   Editor URL:', editorPage.url());
  const title = await editorPage.title().catch(() => '');
  console.log('   Title:', title);
  const frames = editorPage.frames();
  console.log('   Frames:', frames.length);
  for (const f of frames) {
    console.log('     Frame:', f.url().substring(0, 120));
  }

  await editorPage.screenshot({ path: 'C:/Users/Tobias/git/euro_Office/test-results/wopi-editor-final.png', fullPage: true });
  console.log('   Screenshot saved');

  console.log('\n[BROWSER OPEN] Close to exit');
  await editorPage.waitForTimeout(30000);

  // Cleanup
  await page.evaluate(async ({ token }) => {
    await fetch('/dav/files/admin/wopi-test.docx', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
  }, { token });
  await browser.close();
  console.log('Done.');
})();
