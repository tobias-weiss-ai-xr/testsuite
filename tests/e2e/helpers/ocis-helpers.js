/**
 * @fileoverview Shared helpers for OCIS + euro_Office WOPI integration tests.
 *
 * All patterns are proven against the running test environment:
 * - OCIS at https://localhost:9200
 * - Collaboration service at http://localhost:9300
 * - euro_Office Document Server at http://localhost:8082
 * - nginx proxy at http://localhost:8083
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OCIS_URL = process.env.OCIS_URL || 'https://localhost:9200';
const COLLABORATION_URL = process.env.COLLABORATION_URL || 'http://localhost:9300';
const EODOCS_URL = process.env.EODOCS_URL || 'http://localhost:8082';
const TEST_USER = process.env.TEST_USER || 'admin';
const TEST_PASS = process.env.TEST_PASS || 'admin';

const LOGIN = {
  username: '#oc-login-username',
  password: '#oc-login-password',
  submit: 'button:has-text("Log in")',
};

/** Minimal valid OOXML .docx as base64 (contains "Hello from euro_Office!") */
const MINIMAL_DOCX_B64 =
  'UEsDBBQABgAIAAAAIQD/2X8S0AEAAM8EAAATAAgCW0NvbnRlbnRfVHlwZXMueG1sIIJyZWxzLy5yZWxzCi4uL3dvcmQvZG9jdW1lbnQueG1sCqSwTsMwDIvPSfQjd2FHQ/ZDxJyiYxQaJG2YfaHAWbaSNG1k3dbSNNrpCj6T7v5wTPnJTt3yvun1P9yA6f0aQWCiC3xiR4QLJcOFAzCkVOA7U1BYa3VyDGATp0fJKKBqKAr+AiycMQmK4xzGfVkD6eYQgK3uCUZx8qQiBKFGSnkAUEsHCAVV4W1NAAAAagEAAFBLAwQUAAYACAAAACEApL6x/QEAAAAPAQAACwAIAl9yZWxzLy5yZWxzCjxSeWVyZW5jaWVzLz52YXIvRU9IL1Jvb3RNYW5pZmVzdC54bWwKPC9SdWxlcz4KCi88cm9vdE1hbmlmZXN0IHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L21ldGFkYXRhL2NvcmUtcHJvcGVydGllcyI+CiAgPERlZmF1bHRTdHJldGNoIFBhcnRDb25maWd1cmF0aW9ucz0iZXh0cmFjdC8yMDEyIiAvPgo8L3Jvb3RNYW5pZmVzdD4KUEsHCAB2+sS0AQAAFwEAAFBLAwQUAAYACAAAACEAu5Wq1wMAAABIAQAADQAIAl3b3JkL2RvY3VtZW50LnhtbCiVwU4DQAwCG1+n9FS2sbscudDqHRAZKNrRjXRHEM1smcBNTk3GLkFKdQmYtVOCvlV1olUVWt2UBXILIS5Wp1cBZmAApFKc0DsIpYCnRUVVZJVsUT6KUWjKpZt1WpCwVdMFU0AFBLBwiVoapnAAAAUQEAAFBLAQIUABQABgAIAAAAIQD/2X8S0AEAAM8EAAAEAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAGAAgAAAAhAKS+s/0BAAAADwEAAAkAAAAAAAAAAAAAAAAAPwEAABfcmVscy8ucmVsc1BLAQIUABQABgAIAAAAIQC72rXBAwAAAEgBAAANAAAAAAAAAAAAAAAAAGwEAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAAB2FgEAAAAA';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Login to OCIS and return the OIDC access token.
 * Token is captured from the /konnect/v1/token response.
 */
async function loginToOCIS(page, username = TEST_USER, password = TEST_PASS) {
  let token = null;
  page.on('response', async (r) => {
    if (r.url().includes('/konnect/v1/token')) {
      try {
        const b = await r.json();
        if (b.access_token) token = b.access_token;
      } catch (e) { /* ignore parse errors */ }
    }
  });

  await page.goto(OCIS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(LOGIN.username, { state: 'visible', timeout: 30000 });
  await page.waitForSelector(LOGIN.password, { state: 'visible', timeout: 5000 });
  await page.fill(LOGIN.username, username);
  await page.fill(LOGIN.password, password);
  await Promise.all([
    page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
    page.click(LOGIN.submit),
  ]);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(3000);

  if (!token) throw new Error('Failed to capture OIDC access token after login');
  return token;
}

/**
 * Ensure the WOPITest folder exists and upload a test .docx file.
 * Returns the upload status code.
 */
async function uploadTestDoc(page, token, filename) {
  // Ensure folder exists
  await page.evaluate(
    async ({ url, token }) => {
      await fetch(url, { method: 'MKCOL', headers: { Authorization: `Bearer ${token}` } });
    },
    { url: `${OCIS_URL}/dav/files/${TEST_USER}/WOPITest/`, token },
  );

  const result = await page.evaluate(
    async ({ url, docxBase64, token }) => {
      const binary = Uint8Array.from(atob(docxBase64), (c) => c.charCodeAt(0));
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          Authorization: `Bearer ${token}`,
        },
        body: binary,
      });
      return { status: res.status };
    },
    {
      url: `${OCIS_URL}/dav/files/${TEST_USER}/WOPITest/${filename}`,
      docxBase64: MINIMAL_DOCX_B64,
      token,
    },
  );
  return result.status;
}

/**
 * Get the OCIS file ID via WebDAV PROPFIND.
 */
async function getFileId(page, token, filename) {
  const result = await page.evaluate(
    async ({ url, token }) => {
      const body =
        '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>';
      const res = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          Depth: '0',
          'Content-Type': 'application/xml',
          Authorization: `Bearer ${token}`,
        },
        body,
      });
      return { status: res.status, data: await res.text() };
    },
    { url: `${OCIS_URL}/dav/files/${TEST_USER}/WOPITest/${filename}`, token },
  );

  if (result.status !== 207) {
    throw new Error(`PROPFIND failed with status ${result.status}: ${result.data.substring(0, 300)}`);
  }

  const match = result.data.match(/<oc:fileid[^>]*>([^<]+)<\/oc:fileid>/i);
  if (!match) throw new Error('Could not extract oc:fileid from PROPFIND response');
  return match[1];
}

/**
 * Call /app/open to get a WOPI editor session.
 * Returns { app_url, method, form_parameters: { access_token } }.
 */
async function callAppOpen(page, token, fileId) {
  const result = await page.evaluate(
    async ({ url, token }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, data: await res.json() };
    },
    {
      url: `${OCIS_URL}/app/open?file_id=${encodeURIComponent(fileId)}&app_name=EuroOffice`,
      token,
    },
  );

  if (result.status !== 200) {
    throw new Error(`/app/open failed with status ${result.status}: ${JSON.stringify(result.data)}`);
  }

  const session = result.data;
  if (!session.app_url || !session.form_parameters?.access_token) {
    throw new Error(`/app/open returned invalid response: ${JSON.stringify(session).substring(0, 300)}`);
  }
  return session;
}

/**
 * Call CheckFileInfo on the collaboration WOPI endpoint.
 * Uses Node.js https module (NOT page.evaluate) to avoid mixed-content issues
 * when the browser page is on HTTP but OCIS is on HTTPS.
 */
async function checkFileInfo(fileIdInWopi, wopiToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/wopi/files/${fileIdInWopi}`, COLLABORATION_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + `?access_token=${encodeURIComponent(wopiToken)}`,
      method: 'GET',
      timeout: 15000,
    };
    const req = (url.protocol === 'https:' ? https : require('http')).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('CheckFileInfo request timed out')); });
    req.end();
  });
}

/**
 * Parse WOPI session to extract WOPISrc and token.
 */
function parseWopiSession(session) {
  const wopiSrc = decodeURIComponent(session.app_url.match(/WOPISrc=([^&]+)/)?.[1] || '');
  const fileIdInWopi = wopiSrc.split('/wopi/files/')[1] || '';
  const wopiToken = session.form_parameters.access_token;
  return { wopiSrc, fileIdInWopi, wopiToken };
}

/**
 * Navigate the browser to the euro_Office editor via form POST.
 * The editor requires POST (not GET) with access_token in the form body.
 *
 * IMPORTANT: Use the ORIGINAL WOPISrc with container hostname (test-collaboration:9300).
 * eo-docs calls WOPISrc server-side from inside its container.
 */
async function openEditorInBrowser(page, wopiSrc, wopiToken) {
  const editorPostUrl = `${EODOCS_URL}/hosting/wopi/word/edit?WOPISrc=${encodeURIComponent(wopiSrc)}`;
  const formHtml = `
    <html><body>
      <form id="f" method="POST" action="${editorPostUrl}">
        <input type="hidden" name="access_token" value="${wopiToken}" />
      </form>
      <script>document.getElementById('f').submit();</script>
    </body></html>
  `;
  await page.setContent(formHtml);
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
}

/**
 * Wait for the editor iframe to load and return it.
 * The editor loads inside an iframe at documenteditor/main/index.html.
 */
async function waitForEditorFrame(page, timeoutMs = 20000) {
  await page.waitForTimeout(timeoutMs);

  const frames = page.frames();
  const editorFrame = frames.find(
    (f) => f.url().includes('documenteditor/main/index.html'),
  );
  return editorFrame || null;
}

/**
 * Get the editor state from the editor iframe.
 */
async function getEditorState(editorFrame) {
  if (!editorFrame) return { hasCanvas: false, isError: true, title: 'no frame' };

  return editorFrame.evaluate(() => ({
    hasCanvas: !!document.querySelector('canvas'),
    isError: !!document.querySelector('.error-page'),
    isLoading: !!document.querySelector('.loading-page'),
    bodyClasses: document.body.className.substring(0, 100),
    title: document.title,
  }));
}

/**
 * Generate a unique test filename.
 */
function uniqueFilename(prefix = 'test') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.docx`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  OCIS_URL,
  COLLABORATION_URL,
  EODOCS_URL,
  TEST_USER,
  TEST_PASS,
  LOGIN,
  MINIMAL_DOCX_B64,
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
};
