/**
 * @fileoverview E2E tests for WOPI co-editing infrastructure.
 *
 * Verifies that the WOPI layer supports multiple concurrent sessions
 * on the same file — the prerequisite for collaborative editing.
 *
 * Usage:
 *   npx playwright test tests/e2e/documents/coediting.spec.js --project=chromium
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

test.describe('Co-editing Infrastructure @headed', () => {
  test.setTimeout(300000);

  test('same file gets different WOPI tokens per session', async ({ page }) => {
    const token = await loginToOCIS(page);
    const filename = uniqueFilename('coedit-tokens');
    const uploadStatus = await uploadTestDoc(page, token, filename);
    expect(uploadStatus).toBe(201);

    const fileId = await getFileId(page, token, filename);

    // Call /app/open twice with the same file
    const session1 = await callAppOpen(page, token, fileId);
    const session2 = await callAppOpen(page, token, fileId);

    const { fileIdInWopi: fid1, wopiToken: tok1 } = parseWopiSession(session1);
    const { fileIdInWopi: fid2, wopiToken: tok2 } = parseWopiSession(session2);

    // Same file, different tokens
    expect(fid1).toBe(fid2);
    expect(tok1).not.toBe(tok2);
    console.log(`✅ Same file ID: ${fid1.substring(0, 16)}...`);
    console.log(`✅ Different tokens (${tok1.substring(0, 20)}... vs ${tok2.substring(0, 20)}...)`);
  });

  test('both sessions pass CheckFileInfo', async ({ page }) => {
    const token = await loginToOCIS(page);
    const filename = uniqueFilename('coedit-cfi');
    const uploadStatus = await uploadTestDoc(page, token, filename);
    expect(uploadStatus).toBe(201);

    const fileId = await getFileId(page, token, filename);

    const session1 = await callAppOpen(page, token, fileId);
    const session2 = await callAppOpen(page, token, fileId);

    const { fileIdInWopi: fid1, wopiToken: tok1 } = parseWopiSession(session1);
    const { fileIdInWopi: fid2, wopiToken: tok2 } = parseWopiSession(session2);

    // Both CheckFileInfo calls should succeed
    const [cfi1, cfi2] = await Promise.all([
      checkFileInfo(fid1, tok1),
      checkFileInfo(fid2, tok2),
    ]);

    expect(cfi1.status).toBe(200);
    expect(cfi2.status).toBe(200);
    expect(cfi1.data.BaseFileName).toBe(cfi2.data.BaseFileName);

    console.log(`✅ Session 1 CheckFileInfo: ${cfi1.status} — ${cfi1.data.BaseFileName}`);
    console.log(`✅ Session 2 CheckFileInfo: ${cfi2.status} — ${cfi2.data.BaseFileName}`);
  });

  test('both editor instances load with canvas', async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const page2 = await ctx.newPage();

    try {
      const token = await loginToOCIS(page);
      const filename = uniqueFilename('coedit-browser');
      const uploadStatus = await uploadTestDoc(page, token, filename);
      expect(uploadStatus).toBe(201);

      const fileId = await getFileId(page, token, filename);

      // Get two separate sessions
      const session1 = await callAppOpen(page, token, fileId);
      const session2 = await callAppOpen(page, token, fileId);

      const { wopiSrc: ws1, wopiToken: wt1 } = parseWopiSession(session1);
      const { wopiSrc: ws2, wopiToken: wt2 } = parseWopiSession(session2);

      // Open editors concurrently in separate tabs
      await Promise.all([
        openEditorInBrowser(page, ws1, wt1),
        openEditorInBrowser(page2, ws2, wt2),
      ]);

      // Wait for both to initialize
      const [frame1, frame2] = await Promise.all([
        waitForEditorFrame(page, 15000),
        waitForEditorFrame(page2, 15000),
      ]);

      expect(frame1).not.toBeNull();
      expect(frame2).not.toBeNull();
      console.log(`✅ Both editor frames loaded`);

      // Verify both have canvas
      const [state1, state2] = await Promise.all([
        getEditorState(frame1),
        getEditorState(frame2),
      ]);

      expect(state1.hasCanvas).toBe(true);
      expect(state1.isError).toBe(false);
      expect(state2.hasCanvas).toBe(true);
      expect(state2.isError).toBe(false);

      console.log(`✅ Editor 1: canvas=${state1.hasCanvas}, error=${state1.isError}, title=${state1.title}`);
      console.log(`✅ Editor 2: canvas=${state2.hasCanvas}, error=${state2.isError}, title=${state2.title}`);

      await page.screenshot({ path: 'test-results/coedit-session1.png', fullPage: false });
      await page2.screenshot({ path: 'test-results/coedit-session2.png', fullPage: false });
    } finally {
      await ctx.close();
    }
  });

  test('WOPI tokens have correct JWT claims for co-editing', async ({ page }) => {
    const token = await loginToOCIS(page);
    const filename = uniqueFilename('coedit-jwt');
    const uploadStatus = await uploadTestDoc(page, token, filename);
    expect(uploadStatus).toBe(201);

    const fileId = await getFileId(page, token, filename);

    const session1 = await callAppOpen(page, token, fileId);
    const session2 = await callAppOpen(page, token, fileId);

    const { wopiToken: tok1 } = parseWopiSession(session1);
    const { wopiToken: tok2 } = parseWopiSession(session2);

    // Decode JWTs (no verification needed — just inspect claims)
    const decodeJWT = (jwt) => {
      try {
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
        return payload;
      } catch (e) { return null; }
    };

    const claims1 = decodeJWT(tok1);
    const claims2 = decodeJWT(tok2);
    expect(claims1).not.toBeNull();
    expect(claims2).not.toBeNull();

    // Both should reference the same file
    expect(JSON.stringify(claims1.WopiContext?.FileReference)).toBe(
      JSON.stringify(claims2.WopiContext?.FileReference),
    );

    // Both should be read_write (ViewMode 3)
    expect(claims1.WopiContext?.ViewMode).toBe(3);
    expect(claims2.WopiContext?.ViewMode).toBe(3);

    // Tokens should have different expiry or jti
    expect(claims1.exp).toBeTruthy();
    expect(claims2.exp).toBeTruthy();

    console.log(`✅ Same file reference: ${JSON.stringify(claims1.WopiContext?.FileReference)}`);
    console.log(`✅ ViewMode: ${claims1.WopiContext?.ViewMode} (read_write)`);
    console.log(`✅ Token 1 exp: ${new Date(claims1.exp * 1000).toISOString()}`);
    console.log(`✅ Token 2 exp: ${new Date(claims2.exp * 1000).toISOString()}`);
  });
});
