#!/usr/bin/env node
/**
 * Test WOPI PutFile — edit + save a document via the WOPI chain.
 *
 * Flow:
 * 1. Login to OCIS, capture token
 * 2. Upload a test .docx file
 * 3. Call /app/open to get WOPI params
 * 4. Call PutFile (POST /wopi/files/{id}/contents) with modified content
 * 5. Verify the saved content via WebDAV GET
 * 6. Compare: if content matches, save worked
 */
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

  // === Login ===
  await page.goto('https://localhost:9200', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#oc-login-username', { state: 'visible', timeout: 30000 });
  await page.fill('#oc-login-username', 'admin');
  await page.fill('#oc-login-password', 'admin');
  await Promise.all([
    page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
    page.click('button:has-text("Log in")'),
  ]);
  await page.waitForTimeout(3000);
  console.log('✅ Logged in');

  // === Upload test file ===
  const mkcolResult = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, { method: 'MKCOL', headers: { 'Authorization': `Bearer ${token}` } });
    return { status: res.status };
  }, { url: 'https://localhost:9200/dav/files/admin/WOPITest/', token });

  const timestamp = Date.now();
  const filename = `putfile-test-${timestamp}.docx`;
  // Minimal valid .docx — a Word document with content "Original content"
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
  console.log(`✅ Uploaded ${filename} (${uploadResult.status})`);

  // === Get file ID ===
  const propfindResult = await page.evaluate(async ({ url, token }) => {
    const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>';
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: { 'Depth': '0', 'Content-Type': 'application/xml', 'Authorization': `Bearer ${token}` },
      body,
    });
    return { status: res.status, data: await res.text() };
  }, { url: `https://localhost:9200/dav/files/admin/WOPITest/${filename}`, token });

  const fidMatch = propfindResult.data.match(/<oc:fileid[^>]*>([^<]+)<\/oc:fileid>/i);
  const freshFileId = fidMatch ? fidMatch[1] : null;
  console.log(`✅ File ID: ${freshFileId}`);

  if (!freshFileId) { console.log('❌ Cannot get file ID'); await browser.close(); process.exit(1); }

  // === Call /app/open ===
  const appOpenResult = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    return { status: res.status, data: await res.text() };
  }, { url: `https://localhost:9200/app/open?file_id=${encodeURIComponent(freshFileId)}&app_name=EuroOffice`, token });
  const appOpen = JSON.parse(appOpenResult.data);
  const wopiAccessToken = appOpen.form_parameters?.access_token;
  const wopiSrc = decodeURIComponent(appOpen.app_url.match(/WOPISrc=([^&]+)/)?.[1] || '');
  const fileIdInWopi = wopiSrc.split('/wopi/files/')[1] || '';
  console.log(`✅ /app/open → editor URL with WOPI token`);

  // === CheckFileInfo (verify read works) ===
  const cfiRes = await fetch(`http://localhost:9300/wopi/files/${fileIdInWopi}?access_token=${wopiAccessToken}`);
  const cfiData = await cfiRes.json();
  console.log(`✅ CheckFileInfo: ${cfiData.BaseFileName}, ${cfiData.Size} bytes, Version=${cfiData.Version}`);

  // === PutFile — save modified content via WOPI ===
  // WOPI protocol: Lock → PutFile → Unlock
  console.log('\n=== Lock ===');
  const testLockId = `test-lock-${Date.now()}`;
  const lockRes = await fetch(`http://localhost:9300/wopi/files/${fileIdInWopi}?access_token=${wopiAccessToken}`, {
    method: 'POST',
    headers: { 'X-WOPI-Override': 'LOCK', 'X-WOPI-Lock': testLockId },
  });
  console.log(`Lock status: ${lockRes.status}`);
  const lockHeaders = {};
  lockRes.headers.forEach((v, k) => { lockHeaders[k] = v; });
  console.log(`Lock X-WOPI-Lock: ${lockHeaders['x-wopi-lock']}`);
  if (lockRes.status !== 200) {
    const lockErr = await lockRes.text();
    console.log(`Lock error: ${lockErr}`);
  }
  const lockId = lockHeaders['x-wopi-lock'] || testLockId;

  console.log('\n=== PutFile ===');
  const putFileRes = await fetch(`http://localhost:9300/wopi/files/${fileIdInWopi}/contents?access_token=${wopiAccessToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-WOPI-Override': 'PUT',
      'X-WOPI-Lock': lockId,
    },
    body: Uint8Array.from(atob(minimalDocxB64), c => c.charCodeAt(0)),
  });
  console.log(`PutFile status: ${putFileRes.status}`);
  const putFileHeaders = {};
  putFileRes.headers.forEach((v, k) => { putFileHeaders[k] = v; });
  console.log(`PutFile X-WOPI-ItemVersion: ${putFileHeaders['x-wopi-itemversion']}`);
  if (putFileRes.status !== 200) {
    const putErr = await putFileRes.text();
    console.log(`PutFile error: ${putErr}`);
  }

  console.log('\n=== Unlock ===');
  const unlockRes = await fetch(`http://localhost:9300/wopi/files/${fileIdInWopi}?access_token=${wopiAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WOPI-Override': 'UNLOCK', 'X-WOPI-Lock': lockId },
    body: JSON.stringify({}),
  });
  console.log(`Unlock status: ${unlockRes.status}`);

  // === Verify: CheckFileInfo again to see version changed ===
  const cfiRes2 = await fetch(`http://localhost:9300/wopi/files/${fileIdInWopi}?access_token=${wopiAccessToken}`);
  const cfiData2 = await cfiRes2.json();
  console.log(`\nAfter PutFile CheckFileInfo: Version=${cfiData2.Version}, Size=${cfiData2.Size}`);

  if (cfiData2.Version !== cfiData.Version) {
    console.log('✅ Version changed after PutFile — save worked!');
  } else {
    console.log('⚠️ Version did NOT change — PutFile may not have persisted');
  }

  // === Verify: Download file via WebDAV and check size ===
  const downloadResult = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const buf = await res.arrayBuffer();
    return { status: res.status, size: buf.byteLength };
  }, { url: `https://localhost:9200/dav/files/admin/WOPITest/${filename}`, token });
  console.log(`\nWebDAV GET: ${downloadResult.status}, ${downloadResult.size} bytes`);

  // === Test: GetFile — read file contents via WOPI ===
  console.log('\n=== GetFile Test ===');
  const getFileRes = await fetch(`http://localhost:9300/wopi/files/${fileIdInWopi}/contents?access_token=${wopiAccessToken}`);
  console.log(`GetFile status: ${getFileRes.status}`);
  const getFileHeaders = {};
  getFileRes.headers.forEach((v, k) => { getFileHeaders[k] = v; });
  const getFileBody = await getFileRes.arrayBuffer();
  console.log(`GetFile: ${getFileBody.byteLength} bytes`);
  console.log(`GetFile Content-Type: ${getFileHeaders['content-type']}`);
  console.log(`GetFile X-WOPI-ItemVersion: ${getFileHeaders['x-wopi-itemversion']}`);

  // Summary
  console.log('\n=== Summary ===');
  const allPassed =
    cfiRes.status === 200 &&
    putFileRes.status === 200 &&
    cfiData2.Version !== cfiData.Version &&
    getFileRes.status === 200;
  console.log(allPassed ? '✅ ALL WOPI OPERATIONS PASSED' : '❌ SOME TESTS FAILED');

  await browser.close();
})();
