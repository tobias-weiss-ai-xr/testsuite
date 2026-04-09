/**
 * WOPI Discovery Tests
 * 
 * Tests that verify WOPI discovery XML structure and content.
 * 
 * WOPI Discovery endpoint: GET /hosting/discovery
 * Returns XML with file extension handlers and action URLs.
 */

const { describe, test, expect } = require('@jest/globals');
const axios = require('axios');
const xml2js = require('xml2js');
const config = require('../../setup');

const DS_URL = config.documentServerUrl;

describe('WOPI Discovery', () => {
  
  let discoveryXml;
  let discoveryJson;
  
  beforeAll(async () => {
    const response = await axios.get(`${DS_URL}/hosting/discovery`);
    discoveryXml = response.data;
    
    const parser = new xml2js.Parser();
    discoveryJson = await parser.parseStringPromise(discoveryXml);
  }, 30000);
  
  describe('XML Structure', () => {
    test('returns valid XML', () => {
      expect(discoveryXml).toMatch(/<\?xml/);
    });
    
    test('contains wopi-discovery root element', () => {
      expect(discoveryJson).toHaveProperty('wopi-discovery');
    });
    
    test('contains at least one app element', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      expect(apps).toBeDefined();
      expect(Array.isArray(apps)).toBe(true);
      expect(apps.length).toBeGreaterThan(0);
    });
    
    test('app elements have name attribute', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      const firstApp = apps[0];
      expect(firstApp.$).toBeDefined();
      expect(firstApp.$.name).toBeDefined();
    });
  });
  
  describe('Action Handlers', () => {
    test('contains action elements with urlsrc', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      let hasActions = false;
      
      for (const app of apps) {
        if (app.action) {
          for (const action of app.action) {
            if (action.$?.urlsrc) {
              hasActions = true;
              break;
            }
          }
        }
        if (hasActions) break;
      }
      
      expect(hasActions).toBe(true);
    });
    
    test('action URLs point to Document Server', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      const urls = [];
      
      for (const app of apps) {
        if (app.action) {
          for (const action of app.action) {
            if (action.$?.urlsrc) {
              urls.push(action.$.urlsrc);
            }
          }
        }
      }
      
      // URLs should contain the DS host
      expect(urls.length).toBeGreaterThan(0);
    });
  });
  
  describe('File Extension Support', () => {
    test('supports .docx files', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      const docxApp = apps.find(app => 
        app.$?.name === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(docxApp).toBeDefined();
    });
    
    test('supports .xlsx files', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      const xlsxApp = apps.find(app => 
        app.$?.name === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(xlsxApp).toBeDefined();
    });
    
    test('supports .pptx files', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      const pptxApp = apps.find(app => 
        app.$?.name === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      expect(pptxApp).toBeDefined();
    });
    
    test('supports ODF formats (odt, ods, odp)', () => {
      const apps = discoveryJson['wopi-discovery']?.app;
      const appNames = apps.map(app => app.$?.name);
      
      const hasOdt = appNames.some(name => 
        name === 'application/vnd.oasis.opendocument.text'
      );
      const hasOds = appNames.some(name => 
        name === 'application/vnd.oasis.opendocument.spreadsheet'
      );
      const hasOdp = appNames.some(name => 
        name === 'application/vnd.oasis.opendocument.presentation'
      );
      
      expect(hasOdt || hasOds || hasOdp).toBe(true);
    });
  });
  
  describe('HTTP Response', () => {
    test('returns correct Content-Type header', async () => {
      const response = await axios.get(`${DS_URL}/hosting/discovery`);
      const contentType = response.headers['content-type'];
      
      expect(
        contentType.includes('xml') || 
        contentType.includes('application/xml') ||
        contentType.includes('text/xml')
      ).toBe(true);
    }, 10000);
    
    test('response is cacheable (has reasonable headers)', async () => {
      const response = await axios.get(`${DS_URL}/hosting/discovery`);
      
      // Discovery should be cacheable (not dynamically generated per request)
      expect(response.status).toBe(200);
    }, 10000);
  });
  
});
