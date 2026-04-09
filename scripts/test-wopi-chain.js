#!/usr/bin/env node
/**
 * WOPI Integration Test
 * Tests the full WOPI chain: login → upload → app-provider → editor URL → CheckFileInfo
 *
 * Uses Playwright headless for OIDC login (OCIS requires interactive auth),
 * then switches to API calls for the WOPI chain.
 *
 * Usage: node scripts/test-wopi-chain.js
 */

const { chromium } = require('@playwright/test');
const http = require('http');

const OCIS_URL = process.env.OCIS_URL || 'https://localhost:9200';
const COLLAB_URL = process.env.COLLAB_URL || 'http://localhost:9300';
const EODOCS_URL = process.env.EODOCS_URL || 'http://localhost:8083';

// Minimal valid .docx (Office Open XML ZIP)
const MINIMAL_DOCX_B64 =
  'UEsDBBQABgAIAAAAIQD/2X8S0AEAAM8EAAATAAgCW0NvbnRlbnRfVHlwZXMu' +
  'eG1sIIJyZWxzLy5yZWxzCi4uL3dvcmQvZG9jdW1lbnQueG1sCqSwTsMwDIvP' +
  'SfQjd2FHQ/ZDxJyiYxQaJG2YfaHAWbaSNG1k3dbSNNrpCj6T7v5wTPnJTt3y' +
  'vun1P9yA6f0aQWCiC3xiR4QLJcOFAzCkVOA7U1BYa3VyDGATp0fJKKBqKAr+A' +
  'iycMQmK4xzGfVkD6eYQgK3uCUZx8qQiBKFGSnkAUEsHCAVV4W1NAAAAagEA' +
  'AFBLAwQUAAYACAAAACEApL6x/QEAAAAPAQAACwAIAl9yZWxzLy5yZWxzCjxS' +
  'eWVyZW5jaWVzLz52YXIvRU9IL1Jvb3RNYW5pZmVzdC54bWwKPC9SdWxlcz4K' +
  'Ci88cm9vdE1hbmlmZXN0IHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1s' +
  'Zm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L21ldGFkYXRhL2NvcmUtcHJvcGVy' +
  'dGllcyI+CiAgPERlZmF1bHRTdHJldGNoIFBhcnRDb25maWd1cmF0aW9ucz0i' +
  'ZXh0cmFjdC8yMDEyIiAvPgo8L3Jvb3RNYW5pZmVzdD4KUEsHCAB2+sS0AQAA' +
  'FwEAAFBLAwQUAAYACAAAACEAu5Wq1wMAAABIAQAADQAIAl3b3JkL2RvY3Vt' +
  'ZW50LnhtbCiVwU4DQAwCG1+n9FS2sbscudDqHRAZKNrRjXRHEM1smcBNTk3G' +
  'LkFKdQmYtVOCvlV1olUVWt2UBXILIS5Wp1cBZmAApFKc0DsIpYCnRUVVZJV' +
  'sUT6KUWjKpZt1WpCwVdMFU0AFBLBwiVoapnAAAAUQEAAFBLAQIUABQABgAI' +
  'AAAACEA/9l/EtABAAAPBAAAEAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9U' +
  'eXBlc10ueG1sUEsBAhQAFAAGAAgAAAAhAKS+s/0BAAAADwEAAAkAAAAAAAA' +
  'AAAAAAAAAPwEAABfcmVscy8ucmVsc1BLAQIUABQABgAIAAAAIQC72rXBAwAA' +
  'AEgBAAANAAAAAAAAAAAAAAAAAGwEAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYA' +
  'AAAAAgACAIAAAAB2FgEAAAAA';

function log(step, msg) {
  console.log(`  [${step}] ${msg}`);
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? require('https') : http;
    const req = mod.get(url, { timeout: timeoutMs, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpRequest(url, opts = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? require('https') : http;
    const parsed = new URL(url);
    const req = mod.request(url, {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => {
      let data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        data: Buffer.concat(data).toString('utf-8'),
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// === STEP 1: Login via Playwright ===
async function step1_Login() {
  log('LOGIN', `Launching headless browser for OIDC login to ${OCIS_URL}`);

  const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  let accessToken = null;
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/konnect/v1/token')) {
      try {
        const body = await response.json();
        if (body.access_token) {
          accessToken = body.access_token;
          log('LOGIN', `Captured access_token (${accessToken.length} chars)`);
        }
      } catch (e) {}
    }
  });

  try {
    await page.goto(OCIS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#oc-login-username', { state: 'visible', timeout: 30000 });
    await page.waitForSelector('#oc-login-password', { state: 'visible', timeout: 5000 });
    await page.fill('#oc-login-username', 'admin');
    await page.fill('#oc-login-password', 'admin');

    await Promise.all([
      page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
      page.click('button:has-text("Log in")'),
    ]);

    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    log('LOGIN', `After login: ${currentUrl.includes('signin') ? 'STILL ON SIGNIN' : 'OK'}`);

    const cookies = await context.cookies();
    log('LOGIN', `${cookies.length} cookies, token: ${accessToken ? accessToken.substring(0, 30) + '...' : 'NONE'}`);

    return { accessToken, cookies, browser, context, page };
  } catch (e) {
    log('LOGIN', `Error: ${e.message}`);
    await browser.close();
    return null;
  }
}

// === STEP 2: GET /app/list ===
async function step2_AppList(page, accessToken) {
  log('APPLIST', 'Fetching /app/list...');
  try {
    const result = await page.evaluate(async ({ url, token }) => {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return { status: res.status, data: await res.text() };
    }, { url: `${OCIS_URL}/app/list`, token: accessToken });

    if (result.status !== 200) {
      log('APPLIST', `Failed: ${result.status} - ${result.data.substring(0, 200)}`);
      return null;
    }

    const parsed = JSON.parse(result.data);
    const mimetypes = parsed['mime-types'] || parsed.mimetypes || parsed.data || [];
    const withDefault = mimetypes.filter(m => m.default_application);
    log('APPLIST', `${mimetypes.length} mime-types, ${withDefault.length} with default_application`);
    if (withDefault.length > 0) {
      log('APPLIST', `  e.g. ${withDefault[0].mime_type} -> ${withDefault[0].default_application}`);
    }
    return parsed;
  } catch (e) {
    log('APPLIST', `Error: ${e.message}`);
    return null;
  }
}

// === STEP 3: Upload .docx via WebDAV ===
async function step3_Upload(page, accessToken) {
  log('UPLOAD', 'Uploading test .docx via WebDAV...');
  try {
    const timestamp = Date.now();
    const filename = `wopi-test-${timestamp}.docx`;

    // Try both WebDAV paths
    const davPaths = [
      `/dav/files/admin/WOPITest/`,
      `/remote.php/dav/files/admin/WOPITest/`,
    ];

    let davPath = davPaths[0];
    for (const p of davPaths) {
      const r = await page.evaluate(async ({ url, token }) => {
        const res = await fetch(url, {
          method: 'MKCOL',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return res.status;
      }, { url: `${OCIS_URL}${p}`, token: accessToken });
      log('UPLOAD', `MKCOL ${p}: ${r}`);
      if (r === 201 || r === 405) { davPath = p; break; }
    }

    // Upload file
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
    }, { url: `${OCIS_URL}${davPath}${filename}`, docxBase64: MINIMAL_DOCX_B64, token: accessToken });

    log('UPLOAD', `PUT ${filename}: ${uploadResult.status} (etag: ${uploadResult.etag || 'none'})`);

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      // PROPFIND to get file ID
      const propfind = await page.evaluate(async ({ url, token }) => {
        const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:getetag/><oc:fileid/><d:resourcetype/></d:prop></d:propfind>';
        const res = await fetch(url, {
          method: 'PROPFIND',
          headers: { 'Depth': '0', 'Content-Type': 'application/xml', 'Authorization': `Bearer ${token}` },
          body,
        });
        return { status: res.status, data: await res.text() };
      }, { url: `${OCIS_URL}${davPath}${filename}`, token: accessToken });

      let fileId = null;
      if (propfind.status === 207) {
        const fidMatch = propfind.data.match(/<oc:fileid[^>]*>([^<]+)<\/oc:fileid>/i);
        if (fidMatch) fileId = fidMatch[1];
        // Also try fileid without namespace prefix
        if (!fileId) {
          const fidMatch2 = propfind.data.match(/<[^>]*fileid[^>]*>([^<]+)<\/[^>]*>/i);
          if (fidMatch2) fileId = fidMatch2[1];
        }
      }

      log('UPLOAD', `File ID: ${fileId || 'not found in PROPFIND'}`);
      log('UPLOAD', `PROPFIND status: ${propfind.status}`);
      if (propfind.status !== 207) {
        log('UPLOAD', `PROPFIND response: ${propfind.data.substring(0, 300)}`);
      }

      return { filename, path: `WOPITest/${filename}`, fileId };
    }

    log('UPLOAD', `Upload failed. Response preview: ${JSON.stringify(uploadResult).substring(0, 200)}`);
    return null;
  } catch (e) {
    log('UPLOAD', `Error: ${e.message}`);
    return null;
  }
}

// === STEP 4: Test app-provider endpoints ===
async function step4_AppProvider(page, fileInfo, accessToken) {
  log('APPPROV', 'Testing app-provider endpoints...');
  log('APPPROV', `  File info: ${JSON.stringify(fileInfo)}`);

  const tests = [
    {
      desc: 'POST /app-provider/v1/open',
      fn: () => page.evaluate(async ({ url, fileId, filename, filePath, mimeType, token }) => {
        try {
          const res = await fetch(`${url}/app-provider/v1/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ file_id: fileId, filename, path: filePath, mime_type: mimeType }),
          });
          const data = await res.text();
          return { status: res.status, data };
        } catch (e) { return { status: 0, error: e.message, data: '' }; }
      }, { url: OCIS_URL, fileId: fileInfo.fileId, filename: fileInfo.filename, filePath: fileInfo.path, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', token: accessToken }),
    },
    {
      desc: 'POST /app-provider/open',
      fn: () => page.evaluate(async ({ url, fileId, filename, token }) => {
        try {
          const res = await fetch(`${url}/app-provider/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ file_id: fileId, filename }),
          });
          const data = await res.text();
          return { status: res.status, data };
        } catch (e) { return { status: 0, error: e.message, data: '' }; }
      }, { url: OCIS_URL, fileId: fileInfo.fileId, filename: fileInfo.filename, token: accessToken }),
    },
    {
      desc: 'GET /app-provider/v1/open',
      fn: () => page.evaluate(async ({ url, fileId, filename, token }) => {
        try {
          const res = await fetch(`${url}/app-provider/v1/open?file_id=${encodeURIComponent(fileId)}&mime_type=application/vnd.openxmlformats-officedocument.wordprocessingml.document&filename=${encodeURIComponent(filename)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await res.text();
          return { status: res.status, data };
        } catch (e) { return { status: 0, error: e.message, data: '' }; }
      }, { url: OCIS_URL, fileId: fileInfo.fileId, filename: fileInfo.filename, token: accessToken }),
    },
  ];

  for (const t of tests) {
    log('APPPROV', `Trying: ${t.desc}`);
    try {
      const result = await t.fn();
      log('APPPROV', `  Status: ${result.status}`);
      if (result.error) {
        log('APPPROV', `  Error: ${result.error}`);
      } else {
        log('APPPROV', `  Response: ${result.data.substring(0, 500)}`);
      }

      if (result.status === 200 || result.status === 201) {
        try {
          const json = JSON.parse(result.data);
          const editorUrl = json.editor_url || json.url || json.redirect_url;
          if (editorUrl) {
            log('APPPROV', `  EDITOR URL FOUND: ${editorUrl}`);
            return { editorUrl, method: json.method || 'POST' };
          }
        } catch (e) {}
      }
    } catch (e) {
      log('APPPROV', `  Error: ${e.message}`);
    }
  }

  log('APPPROV', 'No editor URL from app-provider');
  return null;
}

// === STEP 5: Test collaboration service directly ===
async function step5_CollabService(fileId) {
  log('COLLAB', `Testing collaboration service at ${COLLAB_URL}...`);

  const tests = [
    { desc: 'GET /wopi/files/{id}', url: `${COLLAB_URL}/wopi/files/${fileId}` },
    { desc: 'GET /wopi/files/{id}?access_token=X', url: `${COLLAB_URL}/wopi/files/${fileId}?access_token=test-token` },
    { desc: 'GET /wopi', url: `${COLLAB_URL}/wopi` },
    { desc: 'GET /', url: `${COLLAB_URL}/` },
    { desc: 'GET /health', url: `${COLLAB_URL}/health` },
    { desc: 'GET /wopi/files/', url: `${COLLAB_URL}/wopi/files/` },
  ];

  for (const t of tests) {
    log('COLLAB', `${t.desc}`);
    try {
      const r = await httpGet(t.url);
      log('COLLAB', `  Status: ${r.status}`);
      log('COLLAB', `  Body: ${r.data.substring(0, 200)}`);
    } catch (e) {
      log('COLLAB', `  Error: ${e.message}`);
    }
  }
}

// === STEP 6: Test eo-docs WOPI endpoints ===
async function step6_Eodocs() {
  log('EODOCS', `Testing eo-docs at ${EODOCS_URL}...`);

  const tests = [
    { desc: 'WOPI discovery', url: `${EODOCS_URL}/hosting/discovery` },
    { desc: 'POST /hosting/wopi/word/edit', url: `${EODOCS_URL}/hosting/wopi/word/edit`, method: 'POST' },
    { desc: 'GET /', url: `${EODOCS_URL}/` },
  ];

  for (const t of tests) {
    log('EODOCS', `${t.desc}: ${t.method || 'GET'} ${t.url}`);
    try {
      const r = await httpRequest(t.url, { method: t.method || 'GET' });
      log('EODOCS', `  Status: ${r.status}`);
      log('EODOCS', `  CT: ${r.headers['content-type'] || 'none'}`);
      log('EODOCS', `  Body: ${r.data.substring(0, 300)}`);
    } catch (e) {
      log('EODOCS', `  Error: ${e.message}`);
    }
  }
}

// === MAIN ===
async function main() {
  console.log('==========================================');
  console.log(' WOPI Integration Test');
  console.log('==========================================\n');

  // Step 1
  console.log('=== Step 1: Login ===');
  const auth = await step1_Login();
  if (!auth) {
    console.log('\nBLOCKED: Cannot login');
    process.exit(1);
  }

  // Step 2
  console.log('\n=== Step 2: /app/list ===');
  const appList = await step2_AppList(auth.page, auth.accessToken);

  // Step 3
  console.log('\n=== Step 3: Upload .docx ===');
  const fileInfo = await step3_Upload(auth.page, auth.accessToken);
  const defaultFileInfo = { filename: 'test.docx', fileId: 'unknown', path: 'test.docx' };

  // Step 4
  console.log('\n=== Step 4: App-provider ===');
  const editorResult = await step4_AppProvider(auth.page, fileInfo || defaultFileInfo, auth.accessToken);

  // Step 5
  console.log('\n=== Step 5: Collaboration service ===');
  await step5_CollabService(fileInfo?.fileId || 'test-id');

  // Step 6
  console.log('\n=== Step 6: eo-docs WOPI ===');
  await step6_Eodocs();

  // Summary
  console.log('\n==========================================');
  console.log(' Summary');
  console.log('==========================================');
  console.log(`  Login:        ${auth.accessToken ? 'OK (token captured)' : 'NO TOKEN'}`);
  console.log(`  /app/list:    ${appList ? 'OK' : 'FAILED'}`);
  console.log(`  Upload:       ${fileInfo ? `OK (${fileInfo.filename}, id=${fileInfo.fileId})` : 'FAILED'}`);
  console.log(`  App-provider: ${editorResult ? `OK (${editorResult.editorUrl.substring(0, 80)})` : 'NO EDITOR URL'}`);
  console.log('==========================================');

  await auth.browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
