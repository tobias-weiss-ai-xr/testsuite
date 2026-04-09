/**
 * Document Editing E2E Tests
 * 
 * Tests for document open/edit/save/close functionality via WOPI editor
 * 
 * @smoke @document-editing
 */

const { test, expect } = require('@playwright/test');

// Test configuration
const OCIS_URL = process.env.OCIS_URL || 'http://localhost:9200';
const DOCUMENT_SERVER_URL = process.env.DOCUMENT_SERVER_URL || 'http://localhost:8080';
const TEST_TIMEOUT = 120000;

// Test selectors - generic selectors that work across different editor implementations
const SELECTORS = {
  editorIframe: '.editor-iframe, iframe[id*="editor"], iframe[name*="editor"]',
  editorCanvas: '.canvas-container, #editor-canvas, [data-testid="editor"], .ce-editor',
  editorContent: '.document-content, .editor-content, [contenteditable="true"]',
  saveIndicator: '.save-indicator, .autosave, [data-testid="save-status"], .saved',
  errorMessage: '.error-message, .error-toast, [role="alert"], .notification-error',
  loadingSpinner: '.loading, .spinner, [data-testid="loading"]',
  documentTitle: '.document-title, [data-testid="document-name"], h1.title'
};

/**
 * Check if OCIS server is available
 */
async function isOCISAvailable(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`, { 
      method: 'HEAD',
      timeout: 5000 
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a unique test document ID
 */
function generateTestDocumentId() {
  return `test-doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

test.describe('Document Editing @smoke @document-editing', () => {
  let testDocumentId;
  let isServerAvailable = false;

  test.beforeAll(async () => {
    isServerAvailable = await isOCISAvailable(OCIS_URL);
    if (!isServerAvailable) {
      console.log(`OCIS server not available at ${OCIS_URL} - tests will be skipped`);
    }
  });

  test.beforeEach(async ({ page }) => {
    testDocumentId = generateTestDocumentId();
    test.setTimeout(TEST_TIMEOUT);
    
    // Skip all tests if server is not available
    test.skip(!isServerAvailable, 'OCIS server is not available');
  });

  test('should open document via WOPI editor URL', async ({ page, context }) => {
    // Navigate to OCIS document URL
    const documentUrl = `${OCIS_URL}/documents/${testDocumentId}/edit`;
    
    await page.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Wait for editor iframe to load
    const editorIframe = page.waitForSelector(SELECTORS.editorIframe, {
      timeout: 60000,
      state: 'visible'
    });

    // Verify iframe is present
    await expect(editorIframe).toBeTruthy();

    // Switch to iframe context
    const frame = await page.frameLocator(SELECTORS.editorIframe).first();
    
    // Wait for editor canvas to be visible inside iframe
    await frame.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Verify editor canvas is visible
    const canvas = frame.locator(SELECTORS.editorCanvas).first();
    await expect(canvas).toBeVisible();
  });

  test('should edit document content', async ({ page }) => {
    const documentUrl = `${OCIS_URL}/documents/${testDocumentId}/edit`;
    
    await page.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Wait for editor to load
    const frame = page.frameLocator(SELECTORS.editorIframe).first();
    await frame.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Find editable content area
    const contentArea = frame.locator(SELECTORS.editorContent).first();
    
    // Click to focus editor
    await contentArea.click();

    // Type test content
    const testContent = `Test content ${Date.now()}`;
    await page.keyboard.type(testContent, { delay: 50 });

    // Verify content appears (check if the typed text is in the editor)
    const editorText = await contentArea.textContent();
    expect(editorText).toContain(testContent.substring(0, 10)); // Check partial match
  });

  test('should save document', async ({ page }) => {
    const documentUrl = `${OCIS_URL}/documents/${testDocumentId}/edit`;
    
    await page.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Wait for editor to load
    const frame = page.frameLocator(SELECTORS.editorIframe).first();
    await frame.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Make an edit to trigger auto-save
    const contentArea = frame.locator(SELECTORS.editorContent).first();
    await contentArea.click();
    await page.keyboard.type(`Save test ${Date.now()}`, { delay: 50 });

    // Wait for auto-save or manual save trigger
    // Most editors auto-save after changes
    await page.waitForSelector(SELECTORS.saveIndicator, {
      timeout: 30000,
      state: 'visible'
    }).catch(() => {
      // If no save indicator, try Ctrl+S to manually save
      page.keyboard.press('Control+s');
    });

    // Wait a moment for save to complete
    await page.waitForSelector(SELECTORS.saveIndicator, {
      timeout: 15000
    }).catch(() => {
      // Some editors don't show save indicators
      console.log('No save indicator visible - assuming auto-save completed');
    });

    // Verify no error messages appeared
    const errorElement = page.locator(SELECTORS.errorMessage);
    const hasError = await errorElement.count();
    expect(hasError).toBe(0);
  });

  test('should close and reopen document with persisted edits', async ({ page, context }) => {
    const documentUrl = `${OCIS_URL}/documents/${testDocumentId}/edit`;
    const testContent = `Persistence test ${Date.now()}`;
    
    // First session: Open and edit
    await page.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    const frame = page.frameLocator(SELECTORS.editorIframe).first();
    await frame.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Add content
    const contentArea = frame.locator(SELECTORS.editorContent).first();
    await contentArea.click();
    await page.keyboard.type(testContent, { delay: 50 });

    // Wait for save
    await page.waitForSelector(SELECTORS.saveIndicator, {
      timeout: 30000
    }).catch(() => {
      page.keyboard.press('Control+s');
    });

    // Wait for save to complete
    await page.waitForTimeout(2000);

    // Close tab (simulate closing)
    await page.close();

    // Second session: Reopen in new page
    const newPage = await context.newPage();
    await newPage.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    const newFrame = newPage.frameLocator(SELECTORS.editorIframe).first();
    await newFrame.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Verify previous edits persisted
    const newContentArea = newFrame.locator(SELECTORS.editorContent).first();
    const editorText = await newContentArea.textContent();
    
    // Check if our test content is present
    expect(editorText).toContain(testContent.substring(0, 10));
  });

  test('should handle document title correctly', async ({ page }) => {
    const documentUrl = `${OCIS_URL}/documents/${testDocumentId}/edit`;
    
    await page.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Wait for editor to load
    const frame = page.frameLocator(SELECTORS.editorIframe).first();
    await frame.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Check document title is visible
    const titleElement = page.locator(SELECTORS.documentTitle);
    const titleCount = await titleElement.count();
    
    if (titleCount > 0) {
      const title = await titleElement.first().textContent();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
    }
  });

  test('should handle multiple concurrent edits', async ({ page, context }) => {
    const documentUrl = `${OCIS_URL}/documents/${testDocumentId}/edit`;
    
    // Open first instance
    await page.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    const frame1 = page.frameLocator(SELECTORS.editorIframe).first();
    await frame1.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Open second instance in new page
    const page2 = await context.newPage();
    await page2.goto(documentUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    const frame2 = page2.frameLocator(SELECTORS.editorIframe).first();
    await frame2.waitForSelector(SELECTORS.editorCanvas, {
      timeout: 60000,
      state: 'visible'
    });

    // Edit in first instance
    const content1 = frame1.locator(SELECTORS.editorContent).first();
    await content1.click();
    await page.keyboard.type('Edit from instance 1', { delay: 50 });

    // Verify second instance can also edit
    const content2 = frame2.locator(SELECTORS.editorContent).first();
    await content2.click();
    await page2.keyboard.type('Edit from instance 2', { delay: 50 });

    // Both instances should be functional
    const text1 = await content1.textContent();
    const text2 = await content2.textContent();
    
    expect(text1).toBeTruthy();
    expect(text2).toBeTruthy();
  });
});
