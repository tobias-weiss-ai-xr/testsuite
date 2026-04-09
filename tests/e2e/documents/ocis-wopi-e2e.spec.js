/**
 * @fileoverview E2E tests for OCIS + euro_Office WOPI integration.
 *
 * Tests the full WOPI chain:
 *   Login → Upload → PROPFIND → /app/open → CheckFileInfo → Editor loads
 *
 * Usage:
 *   npx playwright test tests/e2e/documents/ocis-wopi-e2e.spec.js --project=chromium
 *
 * Environment:
 *   OCIS_URL           - OCIS URL (default: https://localhost:9200)
 *   COLLABORATION_URL  - Collaboration WOPI endpoint (default: http://localhost:9300)
 *   EODOCS_URL         - Document Server URL (default: http://localhost:8082)
 *   TEST_USER          - Test username (default: admin)
 *   TEST_PASS          - Test password (default: admin)
 */

const { test, expect } = require('@playwright/test');
const {
  loginToOCIS,
  uploadTestDoc,
  getFileId,
  callAppOpen,
  checkFileInfo,
  parseWopiSession,
  openEditorInBrowser,
  waitForEditorFrame,
  getEditorState,
  uniqueFilename,
} = require('../helpers/ocis-helpers');

test.describe('WOPI Integration @headed', () => {
  test.setTimeout(300000);

  test('full WOPI chain: upload → app/open → CheckFileInfo → editor loads', async ({ page }) => {
    // Step 1: Login
    const token = await loginToOCIS(page);
    console.log(`✅ Logged in, token: ${token.substring(0, 30)}...`);

    // Step 2: Upload test document
    const filename = uniqueFilename('wopi-chain');
    const uploadStatus = await uploadTestDoc(page, token, filename);
    expect(uploadStatus).toBe(201);
    console.log(`✅ Uploaded ${filename} (${uploadStatus})`);

    // Step 3: Get file ID via PROPFIND
    const fileId = await getFileId(page, token, filename);
    expect(fileId).toBeTruthy();
    console.log(`✅ File ID: ${fileId}`);

    // Step 4: Call /app/open
    const session = await callAppOpen(page, token, fileId);
    console.log(`✅ /app/open returned editor URL`);

    // Step 5: Parse WOPI params
    const { wopiSrc, fileIdInWopi, wopiToken } = parseWopiSession(session);
    expect(fileIdInWopi).toBeTruthy();
    expect(wopiToken).toBeTruthy();
    console.log(`✅ WOPI params parsed (file=${fileIdInWopi.substring(0, 16)}..., token=${wopiToken.substring(0, 20)}...)`);

    // Step 6: CheckFileInfo
    const cfi = await checkFileInfo(fileIdInWopi, wopiToken);
    expect(cfi.status).toBe(200);
    expect(cfi.data.BaseFileName).toBeTruthy();
    console.log(`✅ CheckFileInfo: ${cfi.status} — ${cfi.data.BaseFileName}`);

    // Step 7: Navigate to editor
    await openEditorInBrowser(page, wopiSrc, wopiToken);
    console.log(`✅ Navigated to editor`);

    // Step 8: Wait for editor iframe and verify
    const editorFrame = await waitForEditorFrame(page, 15000);
    expect(editorFrame).not.toBeNull();
    console.log(`✅ Editor iframe loaded`);

    const state = await getEditorState(editorFrame);
    expect(state.hasCanvas).toBe(true);
    expect(state.isError).toBe(false);
    console.log(`✅ Editor rendering (canvas=${state.hasCanvas}, error=${state.isError}, title=${state.title})`);

    await page.screenshot({ path: 'test-results/wopi-full-chain.png', fullPage: false });
  });

  test('CheckFileInfo returns valid file metadata', async ({ page }) => {
    const token = await loginToOCIS(page);
    const filename = uniqueFilename('cfi-meta');
    const uploadStatus = await uploadTestDoc(page, token, filename);
    expect(uploadStatus).toBe(201);

    const fileId = await getFileId(page, token, filename);
    const session = await callAppOpen(page, token, fileId);
    const { fileIdInWopi, wopiToken } = parseWopiSession(session);

    const cfi = await checkFileInfo(fileIdInWopi, wopiToken);
    expect(cfi.status).toBe(200);

    // Verify expected metadata fields
    expect(cfi.data.BaseFileName).toContain(filename.replace('.docx', ''));
    expect(cfi.data.Version).toBeTruthy();
    expect(typeof cfi.data.Size).toBe('number');
    expect(cfi.data.Size).toBeGreaterThan(0);
    expect(cfi.data.SupportsUpdate).toBe(true);
    expect(cfi.data.UserCanWrite).toBe(true);
    expect(cfi.data.SupportsLocks).toBe(true);
    expect(cfi.data.SupportsCoauth).toBe(true);

    console.log('CheckFileInfo metadata:', JSON.stringify(cfi.data, null, 2));
  });

  test('editor renders document with canvas element', async ({ page }) => {
    const token = await loginToOCIS(page);
    const filename = uniqueFilename('editor-canvas');
    const uploadStatus = await uploadTestDoc(page, token, filename);
    expect(uploadStatus).toBe(201);

    const fileId = await getFileId(page, token, filename);
    const session = await callAppOpen(page, token, fileId);
    const { wopiSrc, wopiToken } = parseWopiSession(session);

    await openEditorInBrowser(page, wopiSrc, wopiToken);
    const editorFrame = await waitForEditorFrame(page, 20000);
    expect(editorFrame).not.toBeNull();

    const state = await getEditorState(editorFrame);
    expect(state.hasCanvas).toBe(true);
    expect(state.isError).toBe(false);
    expect(state.isLoading).toBe(false);

    // Verify page title contains the filename
    expect(state.title).toContain(filename.replace('.docx', ''));

    // Verify the main page title is ONLYOFFICE
    const mainTitle = await page.title();
    expect(mainTitle).toContain('ONLYOFFICE');

    await page.screenshot({ path: 'test-results/wopi-editor-canvas.png', fullPage: false });
  });

  test('/app/open returns POST method with form parameters', async ({ page }) => {
    const token = await loginToOCIS(page);
    const filename = uniqueFilename('app-open-verify');
    const uploadStatus = await uploadTestDoc(page, token, filename);
    expect(uploadStatus).toBe(201);

    const fileId = await getFileId(page, token, filename);
    const session = await callAppOpen(page, token, fileId);

    // Verify /app/open response structure
    expect(session.method).toBe('POST');
    expect(session.app_url).toContain('/hosting/wopi/word/edit');
    expect(session.app_url).toContain('WOPISrc=');
    expect(session.form_parameters).toBeTruthy();
    expect(session.form_parameters.access_token).toBeTruthy();

    // Verify the app_url points to the Document Server
    const appUrl = new URL(session.app_url);
    expect(['localhost:8082', 'localhost:8083']).toContain(appUrl.host);

    console.log(`App URL host: ${appUrl.host}`);
    console.log(`Method: ${session.method}`);
    console.log(`Token length: ${session.form_parameters.access_token.length}`);
  });
});
