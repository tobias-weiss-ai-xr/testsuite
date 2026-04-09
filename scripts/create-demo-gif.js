#!/usr/bin/env node
/**
 * Record a GIF showing the OCIS → euro_Office editor workflow.
 *
 * Steps captured:
 * 1. OCIS login page
 * 2. Filling credentials
 * 3. File manager after login
 * 4. Uploading a document
 * 5. Document visible in file list
 * 6. Opening document in euro_Office editor
 * 7. Editor with document loaded
 *
 * Uses sequential screenshots assembled into an animated GIF.
 */
const { chromium } = require('@playwright/test');
const { default: GIFEncoder, quantize, applyPalette } = require('gifenc');
const PNG = require('png-js');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'gif-frames');
const OUTPUT_GIF = path.join(__dirname, '..', 'coediting-demo.gif');

// Clean up previous frames
if (fs.existsSync(SCREENSHOT_DIR)) {
  fs.rmSync(SCREENSHOT_DIR, { recursive: true });
}
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Viewport for recording
const WIDTH = 1280;
const HEIGHT = 800;

const frames = []; // { path, duration_ms, label }

async function captureFrame(page, label, durationMs = 1500) {
  const idx = frames.length;
  const framePath = path.join(SCREENSHOT_DIR, `frame-${String(idx).padStart(3, '0')}.png`);
  await page.screenshot({ path: framePath, fullPage: false });
  frames.push({ path: framePath, durationMs, label });
  console.log(`  📸 Frame ${idx}: ${label} (${durationMs}ms)`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function readPNGPixels(pngPath) {
  const png = new PNG(fs.readFileSync(pngPath));
  const width = png.width;
  const height = png.height;

  return new Promise((resolve) => {
    png.decode((pixels) => {
      // pixels is flat RGBA array
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height * 4; i++) {
        rgba[i] = pixels[i];
        // Ensure alpha is opaque
        if (i % 4 === 3) rgba[i] = 255;
      }
      resolve({ rgba, width, height });
    });
  });
}

async function createGif() {
  console.log('\n=== Creating GIF ===');

  // Read first frame to get dimensions
  const first = await readPNGPixels(frames[0].path);
  const w = first.width;
  const h = first.height;

  const gif = GIFEncoder(w, h);

  for (const entry of frames) {
    const { rgba } = await readPNGPixels(entry.path);

    // Add label overlay (dark bar at bottom)
    const barY = h - 40;
    for (let y = barY; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = Math.round(rgba[i] * 0.3);
        rgba[i + 1] = Math.round(rgba[i + 1] * 0.3);
        rgba[i + 2] = Math.round(rgba[i + 2] * 0.3);
      }
    }

    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    const delay = Math.round(entry.durationMs / 10);
    gif.writeFrame(index, w, h, { palette, delay, transparent: null, disposal: 2 });

    const repeatCount = Math.floor(entry.durationMs / 100) - 1;
    for (let i = 0; i < repeatCount; i++) {
      gif.writeFrame(index, w, h, { palette, delay: 10, transparent: null, disposal: 2 });
    }
  }

  gif.finish();

  fs.writeFileSync(OUTPUT_GIF, gif.bytes());
  const stats = fs.statSync(OUTPUT_GIF);
  console.log(`  ✅ GIF saved: ${OUTPUT_GIF} (${(stats.size / 1024).toFixed(0)} KB, ${w}x${h})`);
}

(async () => {
  console.log('🎬 Recording OCIS → euro_Office editor workflow...\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', `--window-size=${WIDTH},${HEIGHT}`],
  });
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: WIDTH, height: HEIGHT },
  });
  const page = await ctx.newPage();

  let token = null;
  page.on('response', async r => {
    if (r.url().includes('/konnect/v1/token')) {
      try { const b = await r.json(); if (b.access_token) token = b.access_token; } catch(e){}
    }
  });

  // === Step 1: Login page ===
  console.log('Step 1: Navigate to OCIS login');
  await page.goto('https://localhost:9200', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#oc-login-username', { state: 'visible', timeout: 30000 });
  await captureFrame(page, '1. OpenCloud (OCIS) Login', 2000);

  // === Step 2: Fill credentials ===
  console.log('Step 2: Fill credentials');
  await page.fill('#oc-login-username', 'admin');
  await page.fill('#oc-login-password', 'admin');
  await captureFrame(page, '2. Enter credentials (admin/admin)', 1000);

  // === Step 3: Click login, wait for file manager ===
  console.log('Step 3: Login');
  await Promise.all([
    page.waitForURL('**/files/**', { timeout: 30000 }).catch(() => {}),
    page.click('button:has-text("Log in")'),
  ]);
  await page.waitForTimeout(3000);
  await captureFrame(page, '3. OpenCloud File Manager', 2000);

  // === Step 4: Create test folder ===
  console.log('Step 4: Create test folder');
  await page.evaluate(async ({ url, token }) => {
    await fetch(url, { method: 'MKCOL', headers: { 'Authorization': `Bearer ${token}` } });
  }, { url: 'https://localhost:9200/dav/files/admin/WOPITest/', token });
  await sleep(500);

  // === Step 5: Upload a test document ===
  console.log('Step 5: Upload test document');
  const filename = `demo-document-${Date.now()}.docx`;
  const minimalDocx = 'UEsDBBQABgAIAAAAIQD/2X8S0AEAAM8EAAATAAgCW0NvbnRlbnRfVHlwZXMueG1sIIJyZWxzLy5yZWxzCi4uL3dvcmQvZG9jdW1lbnRueG1sCyqwTsMwDIvPSfQjd2FHQ/ZDxJyiYxQaJG2YfaHAWbaSNG1k3dbSNNrpCj6T7v5wTPnJTt3yvun1P9yA6f0aQWCiC3xiR4QLJcOFAzCkVOA7U1BYa3VyDGATp0fJKKBqKAr+AiycMQmK4xzGfVkD6eYQgK3uCUZx8qQiBKFGSnkAUEsHCAVV4W1NAAAAagEAAFBLAwQUAAYACAAAACEApL6x/QEAAAAPAQAACwAIAl9yZWxzLy5yZWxzCjxTZWVyaWFsaXphdGlvbi8+Ci4uL3dvcmQvdGhlbWUvdGhlbWUxLnhtbFD8s8nILy4p1UvOzy/KL0ktLkksqVT8xOLUpV0lFQSoTijIwNdA1N9E3MLI1MdA10dbS0tbRMdC3RtDSxdXfUNDCwAjUEsHCIN1obWfAAAAKQEAAFBLAQIUABQABgAIAAAAIQC72rXBAwAAAEgBAAANAAAAAAAAAAAAAAAAAGwEAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAAB2FgEAAAAA';

  await page.evaluate(async ({ url, docxBase64, token }) => {
    const binary = Uint8Array.from(atob(docxBase64), c => c.charCodeAt(0));
    await fetch(url, { method: 'PUT', headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Authorization': `Bearer ${token}`,
    }, body: binary });
  }, { url: `https://localhost:9200/dav/files/admin/WOPITest/${filename}`, docxBase64: minimalDocx, token });
  console.log(`  Uploaded ${filename}`);

  // Navigate to the test folder to show the file
  await page.goto('https://localhost:9200/files/app/files/WOPITest', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await captureFrame(page, '4. Document uploaded to OpenCloud', 2000);

  // === Step 6: Get file ID and open via WOPI ===
  console.log('Step 6: Get file ID and open in editor');
  const propfindResult = await page.evaluate(async ({ url, token }) => {
    const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>';
    const res = await fetch(url, { method: 'PROPFIND', headers: { 'Depth': '0', 'Content-Type': 'application/xml', 'Authorization': `Bearer ${token}` }, body });
    return await res.text();
  }, { url: `https://localhost:9200/dav/files/admin/WOPITest/${filename}`, token });

  const fileId = propfindResult.match(/<oc:fileid[^>]*>([^<]+)<\/oc:fileid>/i)[1];
  console.log(`  File ID: ${fileId}`);

  // Get editor session
  const session = await page.evaluate(async ({ url, token }) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    return await res.json();
  }, { url: `https://localhost:9200/app/open?file_id=${encodeURIComponent(fileId)}&app_name=EuroOffice`, token });

  const wopiSrc = decodeURIComponent(session.app_url.match(/WOPISrc=([^&]+)/)[1]);
  const wopiToken = session.form_parameters.access_token;

  await captureFrame(page, '5. Opening document via WOPI...', 1500);

  // === Step 7: Navigate to euro_Office editor ===
  console.log('Step 7: Open in euro_Office editor');
  const editorUrl = `http://localhost:8082/hosting/wopi/word/edit?WOPISrc=${encodeURIComponent(wopiSrc)}`;
  const formHtml = `
    <html><body>
      <form id="f" method="POST" action="${editorUrl}">
        <input type="hidden" name="access_token" value="${wopiToken}" />
      </form>
      <script>document.getElementById('f').submit();</script>
    </body></html>
  `;
  await page.setContent(formHtml);
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

  // Wait for editor to load
  console.log('  Waiting for editor to initialize...');
  await page.waitForTimeout(5000);
  await captureFrame(page, '6. euro_Office editor loading...', 1500);

  await page.waitForTimeout(10000);

  // === Step 8: Editor with document ===
  console.log('Step 8: Editor ready');
  const editorFrames = page.frames().filter(f =>
    f.url().includes('documenteditor/main/index.html')
  );

  let editorState = { hasCanvas: false, title: 'unknown' };
  if (editorFrames.length > 0) {
    try {
      editorState = await editorFrames[0].evaluate(() => ({
        hasCanvas: !!document.querySelector('canvas'),
        title: document.title,
      }));
    } catch(e) {}
  }
  await captureFrame(page, `7. Document open in euro_Office editor`, 3000);

  console.log(`  Canvas: ${editorState.hasCanvas}, Title: ${editorState.title}`);

  // === Step 9: Show co-editing - open second session ===
  console.log('Step 9: Open second session for co-editing');
  // Use Node.js native http (not page.evaluate) — page is on HTTP so mixed-content blocks HTTPS
  const http = require('http');
  const https = require('https');
  const session2Json = await new Promise((resolve, reject) => {
    const url = new URL(`/app/open?file_id=${encodeURIComponent(fileId)}&app_name=EuroOffice`, 'https://localhost:9200');
    const postData = '';
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      rejectUnauthorized: false,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end(postData);
  });
  const session2 = session2Json;

  const wopiSrc2 = decodeURIComponent(session2.app_url.match(/WOPISrc=([^&]+)/)[1]);
  const wopiToken2 = session2.form_parameters.access_token;

  // Open second editor in a new page
  const page2 = await ctx.newPage();
  const editorUrl2 = `http://localhost:8082/hosting/wopi/word/edit?WOPISrc=${encodeURIComponent(wopiSrc2)}`;
  const formHtml2 = `
    <html><body>
      <form id="f" method="POST" action="${editorUrl2}">
        <input type="hidden" name="access_token" value="${wopiToken2}" />
      </form>
      <script>document.getElementById('f').submit();</script>
    </body></html>
  `;
  await page2.setContent(formHtml2);
  await page2.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page2.waitForTimeout(15000);
  await captureFrame(page2, '8. Second editor session (co-editing)', 3000);

  await browser.close();

  // === Create GIF ===
  await createGif();

  // Clean up frames
  fs.rmSync(SCREENSHOT_DIR, { recursive: true });
  console.log('  🧹 Cleaned up temporary frames');

  console.log('\n✅ Done! GIF saved to: coediting-demo.gif');
})();
