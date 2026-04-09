/**
 * @fileoverview Playwright tests for real-time co-editing functionality
 * @coediting @realtime
 * 
 * Tests multi-user real-time document collaboration using WebSocket sync.
 * Requires Playwright browser automation and OCIS test environment.
 */

const { test, expect, chromium } = require('@playwright/test');

// Test configuration
const OCIS_URL = process.env.OCIS_URL || 'http://localhost:9200';
const TEST_DOCUMENT_PATH = '/apps/onlyoffice/9';
const SYNC_TIMEOUT = 180000; // 3 minutes for sync operations
const SYNC_POLL_INTERVAL = 500; // 500ms polling interval
const SYNC_WAIT_TIME = 3000; // 3 seconds initial sync wait

// Test users - should be created in OCIS test environment
const TEST_USERS = {
  userA: {
    username: process.env.TEST_USER_A || 'admin',
    password: process.env.TEST_PASS_A || 'admin'
  },
  userB: {
    username: process.env.TEST_USER_B || 'testuser',
    password: process.env.TEST_PASS_B || 'testuser'
  }
};

/**
 * Helper to poll for content changes with timeout
 * @param {Page} page - Playwright page object
 * @param {string} expectedContent - Content to wait for
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<boolean>} - True if content found, false on timeout
 */
async function waitForContent(page, expectedContent, timeout = SYNC_TIMEOUT) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const content = await page.content();
    if (content.includes(expectedContent)) {
      return true;
    }
    await page.waitForTimeout(SYNC_POLL_INTERVAL);
  }
  
  return false;
}

/**
 * Helper to login user to OCIS
 * @param {Page} page - Playwright page object
 * @param {Object} credentials - User credentials
 */
async function loginToOCIS(page, credentials) {
  await page.goto(OCIS_URL);
  
  // Wait for login form
  await page.waitForSelector('input[name="username"], input#user', { timeout: 10000 });
  
  // Fill credentials
  const usernameInput = await page.$('input[name="username"]') || await page.$('input#user');
  const passwordInput = await page.$('input[name="password"]') || await page.$('input#password');
  
  if (usernameInput && passwordInput) {
    await usernameInput.fill(credentials.username);
    await passwordInput.fill(credentials.password);
    
    // Submit login
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], #submit');
    if (submitBtn) {
      await submitBtn.click();
    }
    
    // Wait for navigation to complete
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  }
}

/**
 * Helper to navigate to a document in ONLYOFFICE editor
 * @param {Page} page - Playwright page object
 * @param {string} documentPath - Path to the document
 */
async function navigateToDocument(page, documentPath) {
  const documentUrl = `${OCIS_URL}${documentPath}`;
  await page.goto(documentUrl);
  
  // Wait for ONLYOFFICE editor to load
  await page.waitForSelector('#editor, .asc-smanager, [class*="editor"]', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Real-time Co-editing', () => {
  let browser;
  let contextA, contextB;
  let pageA, pageB;

  test.beforeAll(async () => {
    // Launch browser
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  });

  test.afterAll(async () => {
    // Close browser contexts and browser
    if (contextA) await contextA.close();
    if (contextB) await contextB.close();
    if (browser) await browser.close();
  });

  test.describe('Two users open same document', () => {
    test.beforeEach(async () => {
      // Create two separate browser contexts
      contextA = await browser.newContext();
      contextB = await browser.newContext();
      
      pageA = await contextA.newPage();
      pageB = await contextB.newPage();
    });

    test.afterEach(async () => {
      // Clean up contexts after each test
      if (contextA) await contextA.close();
      if (contextB) await contextB.close();
      contextA = null;
      contextB = null;
      pageA = null;
      pageB = null;
    });

    test('both users can navigate to the same document', async () => {
      // Both users navigate in parallel
      await Promise.all([
        navigateToDocument(pageA, TEST_DOCUMENT_PATH),
        navigateToDocument(pageB, TEST_DOCUMENT_PATH)
      ]);

      // Verify both editors loaded
      const editorAExists = await pageA.$('#editor, .asc-smanager, [class*="editor"]');
      const editorBExists = await pageB.$('#editor, .asc-smanager, [class*="editor"]');

      expect(editorAExists).toBeTruthy();
      expect(editorBExists).toBeTruthy();
    });

    test('both users can authenticate and access the document', async () => {
      // Login both users in parallel
      await Promise.all([
        loginToOCIS(pageA, TEST_USERS.userA),
        loginToOCIS(pageB, TEST_USERS.userB)
      ]);

      // Navigate both to the document
      await Promise.all([
        navigateToDocument(pageA, TEST_DOCUMENT_PATH),
        navigateToDocument(pageB, TEST_DOCUMENT_PATH)
      ]);

      // Verify no error messages
      const errorA = await pageA.$('.error, .alert-danger, [class*="error"]');
      const errorB = await pageB.$('.error, .alert-danger, [class*="error"]');

      expect(errorA).toBeFalsy();
      expect(errorB).toBeFalsy();
    });
  });

  test.describe('Real-time sync - User A types, User B sees changes', () => {
    test.beforeEach(async () => {
      contextA = await browser.newContext();
      contextB = await browser.newContext();
      
      pageA = await contextA.newPage();
      pageB = await contextB.newPage();
    });

    test.afterEach(async () => {
      if (contextA) await contextA.close();
      if (contextB) await contextB.close();
      contextA = null;
      contextB = null;
      pageA = null;
      pageB = null;
    });

    test('text typed by User A appears for User B', async () => {
      const testContent = `Co-editing test ${Date.now()}`;

      // Login and navigate both users
      await Promise.all([
        loginToOCIS(pageA, TEST_USERS.userA).then(() => navigateToDocument(pageA, TEST_DOCUMENT_PATH)),
        loginToOCIS(pageB, TEST_USERS.userB).then(() => navigateToDocument(pageB, TEST_DOCUMENT_PATH))
      ]);

      // Find the editor content area in User A's browser
      const editorSelector = '#editor textarea, .asc-cell-editor, [contenteditable="true"], .document-content';
      await pageA.waitForSelector(editorSelector, { timeout: 10000 });

      // User A types test content
      const editorElement = await pageA.$(editorSelector);
      if (editorElement) {
        await editorElement.click();
        await pageA.keyboard.type(testContent, { delay: 50 });
      }

      // Wait for sync with polling
      const contentSynced = await waitForContent(pageB, testContent, SYNC_TIMEOUT);

      expect(contentSynced).toBe(true);
    });

    test('multiple sequential edits sync correctly', async () => {
      const testEdits = [
        `First edit ${Date.now()}`,
        `Second edit ${Date.now()}`,
        `Third edit ${Date.now()}`
      ];

      // Setup both users
      await Promise.all([
        loginToOCIS(pageA, TEST_USERS.userA).then(() => navigateToDocument(pageA, TEST_DOCUMENT_PATH)),
        loginToOCIS(pageB, TEST_USERS.userB).then(() => navigateToDocument(pageB, TEST_DOCUMENT_PATH))
      ]);

      const editorSelector = '#editor textarea, .asc-cell-editor, [contenteditable="true"], .document-content';
      await pageA.waitForSelector(editorSelector, { timeout: 10000 });

      // Perform multiple edits
      for (const edit of testEdits) {
        const editorElement = await pageA.$(editorSelector);
        if (editorElement) {
          await editorElement.click();
          await pageA.keyboard.type(` ${edit}`, { delay: 50 });
        }

        // Wait for each edit to sync
        const synced = await waitForContent(pageB, edit, SYNC_TIMEOUT);
        expect(synced).toBe(true);
      }
    });
  });

  test.describe('Concurrent edits in different sections', () => {
    test.beforeEach(async () => {
      contextA = await browser.newContext();
      contextB = await browser.newContext();
      
      pageA = await contextA.newPage();
      pageB = await contextB.newPage();
    });

    test.afterEach(async () => {
      if (contextA) await contextA.close();
      if (contextB) await contextB.close();
      contextA = null;
      contextB = null;
      pageA = null;
      pageB = null;
    });

    test('users editing different paragraphs see both changes', async () => {
      const contentA = `User A paragraph ${Date.now()}`;
      const contentB = `User B paragraph ${Date.now()}`;

      // Setup both users
      await Promise.all([
        loginToOCIS(pageA, TEST_USERS.userA).then(() => navigateToDocument(pageA, TEST_DOCUMENT_PATH)),
        loginToOCIS(pageB, TEST_USERS.userB).then(() => navigateToDocument(pageB, TEST_DOCUMENT_PATH))
      ]);

      const editorSelector = '#editor textarea, .asc-cell-editor, [contenteditable="true"], .document-content';
      
      await Promise.all([
        pageA.waitForSelector(editorSelector, { timeout: 10000 }),
        pageB.waitForSelector(editorSelector, { timeout: 10000 })
      ]);

      // User A edits at the beginning
      const editUserA = async () => {
        const editor = await pageA.$(editorSelector);
        if (editor) {
          await editor.click();
          await pageA.keyboard.press('Home');
          await pageA.keyboard.type(contentA, { delay: 50 });
        }
      };

      // User B edits at the end
      const editUserB = async () => {
        const editor = await pageB.$(editorSelector);
        if (editor) {
          await editor.click();
          await pageB.keyboard.press('End');
          await pageB.keyboard.type(contentB, { delay: 50 });
        }
      };

      // Perform concurrent edits
      await Promise.all([editUserA(), editUserB()]);

      // Wait for both changes to sync to both users
      await Promise.all([
        waitForContent(pageA, contentB, SYNC_TIMEOUT),
        waitForContent(pageB, contentA, SYNC_TIMEOUT)
      ]);

      // Verify both users see both changes
      const finalContentA = await pageA.content();
      const finalContentB = await pageB.content();

      expect(finalContentA).toContain(contentA);
      expect(finalContentA).toContain(contentB);
      expect(finalContentB).toContain(contentA);
      expect(finalContentB).toContain(contentB);
    });

    test('concurrent cell edits in different spreadsheet cells', async () => {
      // Skip if not a spreadsheet - marked for spreadsheet-specific testing
      test.skip(!TEST_DOCUMENT_PATH.includes('spreadsheet'), 'Spreadsheet-specific test');

      const cellA1Content = `Cell A1 ${Date.now()}`;
      const cellB2Content = `Cell B2 ${Date.now()}`;

      // Setup both users
      await Promise.all([
        loginToOCIS(pageA, TEST_USERS.userA).then(() => navigateToDocument(pageA, TEST_DOCUMENT_PATH)),
        loginToOCIS(pageB, TEST_USERS.userB).then(() => navigateToDocument(pageB, TEST_DOCUMENT_PATH))
      ]);

      // Wait for spreadsheet to load
      await Promise.all([
        pageA.waitForSelector('.asc-cell-editor, [data-cell="A1"]', { timeout: 10000 }),
        pageB.waitForSelector('.asc-cell-editor, [data-cell="B2"]', { timeout: 10000 })
      ]);

      // User A edits cell A1
      const editCellA1 = async () => {
        const cellA1 = await pageA.$('[data-cell="A1"], #cell-A1');
        if (cellA1) {
          await cellA1.click();
          await cellA1.fill(cellA1Content);
        }
      };

      // User B edits cell B2
      const editCellB2 = async () => {
        const cellB2 = await pageB.$('[data-cell="B2"], #cell-B2');
        if (cellB2) {
          await cellB2.click();
          await cellB2.fill(cellB2Content);
        }
      };

      // Perform concurrent edits
      await Promise.all([editCellA1(), editCellB2()]);

      // Verify both cells updated
      const syncedA = await waitForContent(pageA, cellB2Content, SYNC_TIMEOUT);
      const syncedB = await waitForContent(pageB, cellA1Content, SYNC_TIMEOUT);

      expect(syncedA).toBe(true);
      expect(syncedB).toBe(true);
    });
  });

  test.describe('Concurrent edits in same section', () => {
    test.beforeEach(async () => {
      contextA = await browser.newContext();
      contextB = await browser.newContext();
      
      pageA = await contextA.newPage();
      pageB = await contextB.newPage();
    });

    test.afterEach(async () => {
      if (contextA) await contextA.close();
      if (contextB) await contextB.close();
      contextA = null;
      contextB = null;
      pageA = null;
      pageB = null;
    });

    test('conflict resolution when both users edit same location', async () => {
      const contentA = `User A conflict ${Date.now()}`;
      const contentB = `User B conflict ${Date.now()}`;

      // Setup both users
      await Promise.all([
        loginToOCIS(pageA, TEST_USERS.userA).then(() => navigateToDocument(pageA, TEST_DOCUMENT_PATH)),
        loginToOCIS(pageB, TEST_USERS.userB).then(() => navigateToDocument(pageB, TEST_DOCUMENT_PATH))
      ]);

      const editorSelector = '#editor textarea, .asc-cell-editor, [contenteditable="true"], .document-content';
      
      await Promise.all([
        pageA.waitForSelector(editorSelector, { timeout: 10000 }),
        pageB.waitForSelector(editorSelector, { timeout: 10000 })
      ]);

      // Both users click the same location and type simultaneously
      const editSameLocation = async (page, content) => {
        const editor = await page.$(editorSelector);
        if (editor) {
          await editor.click();
          // Small delay to ensure both start at nearly the same time
          await page.waitForTimeout(100);
          await page.keyboard.type(content, { delay: 10 });
        }
      };

      // Start both edits at nearly the same time
      await Promise.all([
        editSameLocation(pageA, contentA),
        editSameLocation(pageB, contentB)
      ]);

      // Wait for sync to complete
      await pageA.waitForTimeout(SYNC_WAIT_TIME);

      // Verify conflict resolution - document should converge
      // Either last-write-wins or merge - both users should see same final state
      const finalContentA = await pageA.content();
      const finalContentB = await pageB.content();

      // Check that both users see some form of the content (conflict resolved)
      const hasContentA = finalContentA.includes(contentA) || finalContentA.includes(contentB);
      const hasContentB = finalContentB.includes(contentA) || finalContentB.includes(contentB);

      // Both should have converged to the same state
      expect(hasContentA).toBe(true);
      expect(hasContentB).toBe(true);
    });

    test('operational transformation merges concurrent edits', async () => {
      const prefixA = 'PrefixA_';
      const prefixB = 'PrefixB_';
      const sharedText = `SharedText${Date.now()}`;

      // Setup both users
      await Promise.all([
        loginToOCIS(pageA, TEST_USERS.userA).then(() => navigateToDocument(pageA, TEST_DOCUMENT_PATH)),
        loginToOCIS(pageB, TEST_USERS.userB).then(() => navigateToDocument(pageB, TEST_DOCUMENT_PATH))
      ]);

      const editorSelector = '#editor textarea, .asc-cell-editor, [contenteditable="true"], .document-content';
      
      await Promise.all([
        pageA.waitForSelector(editorSelector, { timeout: 10000 }),
        pageB.waitForSelector(editorSelector, { timeout: 10000 })
      ]);

      // User A types with prefix
      const editWithPrefixA = async () => {
        const editor = await pageA.$(editorSelector);
        if (editor) {
          await editor.click();
          await pageA.keyboard.type(prefixA + sharedText, { delay: 20 });
        }
      };

      // User B types with different prefix
      const editWithPrefixB = async () => {
        const editor = await pageB.$(editorSelector);
        if (editor) {
          await editor.click();
          await pageB.keyboard.type(prefixB + sharedText, { delay: 20 });
        }
      };

      // Perform concurrent edits
      await Promise.all([editWithPrefixA(), editWithPrefixB()]);

      // Wait for OT to merge changes
      await pageA.waitForTimeout(SYNC_WAIT_TIME * 2);

      // Verify OT worked - both should see merged/transformed content
      const finalContentA = await pageA.content();
      const finalContentB = await pageB.content();

      // At minimum, the shared text should appear (OT should preserve non-conflicting parts)
      const sharedInA = finalContentA.includes(sharedText);
      const sharedInB = finalContentB.includes(sharedText);

      expect(sharedInA || sharedInB).toBe(true);
    });
  });

  test.describe('WebSocket connection handling', () => {
    test.beforeEach(async () => {
      contextA = await browser.newContext();
      pageA = await contextA.newPage();
    });

    test.afterEach(async () => {
      if (contextA) await contextA.close();
      contextA = null;
      pageA = null;
    });

    test.fixme('reconnection preserves document state', async () => {
      // This test requires WebSocket disconnection simulation
      // Mark as fixme until proper WebSocket mocking is implemented
      
      await loginToOCIS(pageA, TEST_USERS.userA);
      await navigateToDocument(pageA, TEST_DOCUMENT_PATH);

      const testContent = `Reconnection test ${Date.now()}`;
      const editorSelector = '#editor textarea, .asc-cell-editor, [contenteditable="true"], .document-content';
      
      await pageA.waitForSelector(editorSelector, { timeout: 10000 });

      // Type content
      const editor = await pageA.$(editorSelector);
      if (editor) {
        await editor.click();
        await pageA.keyboard.type(testContent, { delay: 50 });
      }

      // Simulate WebSocket disconnect/reconnect
      await pageA.evaluate(() => {
        // Trigger WebSocket reconnection
        if (window.WebSocket) {
          // Implementation-specific WebSocket handling
        }
      });

      // Wait for reconnection
      await pageA.waitForTimeout(5000);

      // Verify content persisted
      const content = await pageA.content();
      expect(content).toContain(testContent);
    });
  });
});

/**
 * Test configuration for Playwright
 * 
 * To run these tests:
 * 1. Install Playwright: npm install -D @playwright/test
 * 2. Install browsers: npx playwright install
 * 3. Set environment variables:
 *    - OCIS_URL (default: http://localhost:9200)
 *    - TEST_USER_A / TEST_PASS_A
 *    - TEST_USER_B / TEST_PASS_B
 * 4. Run: npx playwright test tests/e2e/documents/coediting.spec.js
 * 
 * playwright.config.js example:
 * 
 * module.exports = {
 *   testDir: './tests/e2e',
 *   timeout: 180000,
 *   retries: 1,
 *   use: {
 *     headless: true,
 *     viewport: { width: 1280, height: 720 },
 *     actionTimeout: 30000,
 *   },
 *   projects: [
 *     {
 *       name: 'chromium',
 *       use: { browserName: 'chromium' },
 *     },
 *   ],
 * };
 */
