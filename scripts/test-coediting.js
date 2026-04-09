#!/usr/bin/env node
/**
 * Test WOPI co-editing — open the same file from two sessions.
 *
 * Verifies that the WOPI infrastructure supports multiple concurrent sessions
 * on the same file, which is required for collaborative editing.
 *
 * Flow:
 * 1. Login to OCIS, capture token
 * 2. Upload a test .docx file
 * 3. Get file ID via PROPFIND
 * 4. Call /app/open TWICE (session 1 and session 2)
 * 5. Verify both return valid, DIFFERENT WOPI access tokens
 * 6. Verify both CheckFileInfo calls succeed
 * 7. Open both editors in separate tabs and verify both load
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
  await page.evaluate(async ({ url, token }) => {
    await fetch(url, { method: 'MKCOL', headers: { 'Authorization': `Bearer ${token}` } });
  }, { url: 'https://localhost:9200/dav/files/admin/WOPITest/', token });

  const timestamp = Date.now();
  const filename = `coedit-test-${timestamp}.docx`;
  const minimalDocxB64 = 'UEsDBBQABgAIAAAAIQD/2X8S0AEAAM8EAAATAAgCW0NvbnRlbnRfVHlwZXMueG1sIIJyZWxzLy5yZWxzCi4uL3dvcmQvZG9jdW1lbnRueG1sCyqwTsMwDIvPSfQjd2FHQ/ZDxJyiYxQaJG2YfaHAWbaSNG1k3dbSNNrpCj6T7v5wTPnJTt3yvun1P9yA6f0aQWCiC3xiR4QLJcOFAzCkVOA7U1BYa3VyDGATp0fJKKBqKAr+AiycMQmK4xzGfVkD6eYQgK3uCUZx8qQiBKFGSnkAUEsHCAVV4W1NAAAAagEAAFBLAwQUAAYACAAAACEApL6x/QEAAAAPAQAACwAIAl9yZWxzLy5yZWxzCjxTZWVyaWFsaXphdGlvbi8+Ci4uL3dvcmQvdGhlbWUvdGhlbWUxLnhtbFD8s8nILy4p1UvOzy/KL0ktLkksqVT8xOLUpV0lFQSoTijIwNdA1N9E3MLI1MdA10dbS0tbRMdC3RtDSxdXfUNDCwAjUEsHCIN1obWfAAAAKQEAAFBLAQIUABQABgAIAAAAIQC72rXBAwAAAEgBAAANAAAAAAAAAAAAAAAAAGwEAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAAB2FgEAAAAA';

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
    return { status: res.status };
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
  if (!freshFileId) { console.log('❌ No file ID'); await browser.close(); process.exit(1); }

  // === Call /app/open TWICE ===
  console.log('\n=== Session 1: /app/open ===');
  const session1 = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    return await res.json();
  }, { url: `https://localhost:9200/app/open?file_id=${encodeURIComponent(freshFileId)}&app_name=EuroOffice`, token });

  console.log(`  App URL: ${session1.app_url.substring(0, 80)}...`);
  console.log(`  Token: ${session1.form_parameters.access_token.substring(0, 40)}...`);

  console.log('\n=== Session 2: /app/open ===');
  const session2 = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    return await res.json();
  }, { url: `https://localhost:9200/app/open?file_id=${encodeURIComponent(freshFileId)}&app_name=EuroOffice`, token });

  console.log(`  App URL: ${session2.app_url.substring(0, 80)}...`);
  console.log(`  Token: ${session2.form_parameters.access_token.substring(0, 40)}...`);

  // === Verify sessions are different ===
  const wopiSrc1 = decodeURIComponent(session1.app_url.match(/WOPISrc=([^&]+)/)?.[1] || '');
  const wopiSrc2 = decodeURIComponent(session2.app_url.match(/WOPISrc=([^&]+)/)?.[1] || '');
  const fileId1 = wopiSrc1.split('/wopi/files/')[1];
  const fileId2 = wopiSrc2.split('/wopi/files/')[1];
  const token1 = session1.form_parameters.access_token;
  const token2 = session2.form_parameters.access_token;

  console.log('\n=== Co-editing Verification ===');
  console.log(`  Same WOPISrc file ID: ${fileId1 === fileId2 ? '✅' : '❌'} (${fileId1 === fileId2 ? 'same' : 'DIFFERENT'})`);
  console.log(`  Different access tokens: ${token1 !== token2 ? '✅' : '❌'} (${token1 !== token2 ? 'different' : 'SAME'})`);

  // Decode JWTs to compare claims
  const decodeJWT = (jwt) => {
    try {
      const parts = jwt.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return payload;
    } catch(e) { return null; }
  };

  const claims1 = decodeJWT(token1);
  const claims2 = decodeJWT(token2);
  if (claims1 && claims2) {
    const sessionId1 = claims1.WopiContext?.UserSessionId || 'N/A';
    const sessionId2 = claims2.WopiContext?.UserSessionId || 'N/A';
    const accessToken1 = claims1.WopiContext?.AccessToken || 'N/A';
    const accessToken2 = claims2.WopiContext?.AccessToken || 'N/A';
    console.log(`  Session IDs differ: ${sessionId1 !== sessionId2 ? '✅' : '❌'} (${sessionId1.substring(0, 8)}... vs ${sessionId2.substring(0, 8)}...)`);
    console.log(`  Access tokens differ: ${accessToken1 !== accessToken2 ? '✅' : '❌'} (same OIDC token, different WOPI token)`);
    console.log(`  ViewMode session1: ${claims1.WopiContext?.ViewMode || 'N/A'} (3=read_write)`);
    console.log(`  ViewMode session2: ${claims2.WopiContext?.ViewMode || 'N/A'} (3=read_write)`);
    console.log(`  Same file reference: ${JSON.stringify(claims1.WopiContext?.FileReference) === JSON.stringify(claims2.WopiContext?.FileReference) ? '✅' : '⚠️'}`);
  }

  // === CheckFileInfo for both sessions ===
  console.log('\n=== CheckFileInfo for both sessions ===');
  const cfi1 = await fetch(`http://localhost:9300/wopi/files/${fileId1}?access_token=${token1}`);
  const cfi2 = await fetch(`http://localhost:9300/wopi/files/${fileId2}?access_token=${token2}`);
  const cfi1Data = await cfi1.json();
  const cfi2Data = await cfi2.json();
  console.log(`  Session 1 CheckFileInfo: ${cfi1.status} — ${cfi1Data.BaseFileName}`);
  console.log(`  Session 2 CheckFileInfo: ${cfi2.status} — ${cfi2Data.BaseFileName}`);
  console.log(`  Both succeeded: ${cfi1.status === 200 && cfi2.status === 200 ? '✅' : '❌'}`);

  // === Open both editors in separate tabs ===
  console.log('\n=== Open both editors in separate tabs ===');

  // Helper: navigate to editor via form POST in a new page
  const openEditor = async (wopiSrc, wopiToken, label) => {
    const editorPage = await ctx.newPage();
    const consoleErrors = [];
    editorPage.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    editorPage.on('pageerror', err => consoleErrors.push(`PAGE_ERROR: ${err.message}`));

    const editorUrl = `http://localhost:8082/hosting/wopi/word/edit?WOPISrc=${encodeURIComponent(wopiSrc)}`;
    const formHtml = `
      <html><body>
        <form id="f" method="POST" action="${editorUrl}">
          <input type="hidden" name="access_token" value="${wopiToken}" />
        </form>
        <script>document.getElementById('f').submit();</script>
      </body></html>
    `;
    await editorPage.setContent(formHtml);
    await editorPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

    // Wait for editor iframe to load
    console.log(`  ${label}: Waiting for editor to initialize...`);
    await editorPage.waitForTimeout(15000);

    // Check frame structure
    const frames = editorPage.frames();
    const editorFrames = frames.filter(f =>
      f.url().includes('documenteditor/main/index.html') ||
      f.url().includes('documenteditor/main/')
    );

    let state = { hasCanvas: false, isError: false, bodyClasses: '', title: editorPage.url() };
    if (editorFrames.length > 0) {
      try {
        state = await editorFrames[0].evaluate(() => ({
          hasCanvas: !!document.querySelector('canvas'),
          isError: !!document.querySelector('.error-page'),
          bodyClasses: document.body.className.substring(0, 100),
          title: document.title,
        }));
      } catch(e) {
        console.log(`  ${label}: Frame evaluate failed — ${e.message.substring(0, 80)}`);
      }
    }

    console.log(`  ${label}: frames=${frames.length}, editorFrames=${editorFrames.length}, canvas=${state.hasCanvas}, error=${state.isError}, title=${state.title.substring(0, 60)}`);

    if (consoleErrors.length > 0) {
      console.log(`  ${label}: ${consoleErrors.length} console errors`);
      consoleErrors.slice(0, 3).forEach((e, i) => console.log(`    [${i}] ${e.substring(0, 120)}`));
    }

    await editorPage.screenshot({ path: `scripts/coedit-${label.toLowerCase()}.png`, fullPage: false });
    console.log(`  ${label}: Screenshot saved: scripts/coedit-${label.toLowerCase()}.png`);

    return { frames: frames.length, editorFrames: editorFrames.length, state, consoleErrors };
  };

  // Open both editors concurrently
  const [result1, result2] = await Promise.all([
    openEditor(wopiSrc1, token1, 'Session1'),
    openEditor(wopiSrc2, token2, 'Session2'),
  ]);

  // Summary
  console.log('\n=== Co-editing Summary ===');
  const bothEditorsLoaded = result1.editorFrames >= 1 && result2.editorFrames >= 1;
  const bothCanvas = result1.state.hasCanvas && result2.state.hasCanvas;
  const allPassed =
    fileId1 === fileId2 &&
    token1 !== token2 &&
    cfi1.status === 200 &&
    cfi2.status === 200 &&
    bothEditorsLoaded &&
    bothCanvas;

  if (allPassed) {
    console.log('✅ CO-EDITING INFRASTRUCTURE VERIFIED');
    console.log('   - Same file opened by two sessions');
    console.log('   - Different WOPI tokens issued');
    console.log('   - Both CheckFileInfo calls succeeded');
    console.log('   - Both editor instances loaded with canvas');
  } else {
    console.log('❌ Co-editing test had issues:');
    if (fileId1 !== fileId2) console.log('   - Different file IDs');
    if (token1 === token2) console.log('   - Same WOPI tokens');
    if (cfi1.status !== 200 || cfi2.status !== 200) console.log('   - CheckFileInfo failed');
    if (!bothEditorsLoaded) console.log('   - Not all editor frames loaded');
    if (!bothCanvas) console.log('   - Not all editors have canvas');
  }

  await browser.close();
})();
