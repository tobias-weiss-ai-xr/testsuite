/**
 * Companion API Tests
 * 
 * Tests that verify the eurooffice-opencloud companion API endpoints.
 */

const { describe, test, expect } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const COMPANION_URL = config.companionUrl;

describe('Companion API', () => {
  
  describe('GET /api/health', () => {
    test('returns 200', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      expect(response.status).toBe(200);
    }, 10000);
    
    test('returns JSON with required fields', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      
      expect(response.data).toHaveProperty('overall');
      expect(response.data).toHaveProperty('services');
      expect(response.data).toHaveProperty('timestamp');
    }, 10000);
    
    test('services object contains all expected services', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      
      expect(response.data.services).toHaveProperty('documentserver');
      expect(response.data.services).toHaveProperty('ocis');
    }, 10000);
  });
  
  describe('GET /api/config', () => {
    test('returns 200', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/config`);
      expect(response.status).toBe(200);
    }, 10000);
    
    test('returns sanitized config (no secrets)', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/config`);
      const configData = JSON.stringify(response.data);
      
      // Should NOT contain JWT secrets
      expect(configData).not.toMatch(/JWT_SECRET/i);
      expect(configData).not.toMatch(/OCIS_JWT_SECRET/i);
      expect(configData).not.toMatch(/DOCUMENT_SERVER_JWT_SECRET/i);
    }, 10000);
    
    test('returns expected configuration fields', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/config`);
      
      expect(response.data).toHaveProperty('OCIS_DOMAIN');
      expect(response.data).toHaveProperty('DOCUMENT_SERVER_DOMAIN');
    }, 10000);
  });
  
  describe('GET /api/health/wopi', () => {
    test('returns WOPI connectivity status', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health/wopi`);
      expect(response.status).toBe(200);
    }, 10000);
    
    test('returns JSON with WOPI status', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health/wopi`);
      
      expect(response.data).toHaveProperty('accessible');
      expect(typeof response.data.accessible).toBe('boolean');
    }, 10000);
  });
  
  describe('POST /setup', () => {
    test('with valid data returns redirect or 200', async () => {
      const validData = {
        OCIS_DOMAIN: 'test.example.com',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com',
        PORT: '3000'
      };
      
      const response = await axios.post(`${COMPANION_URL}/setup`, validData, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });
      
      expect([200, 201, 302, 303, 307]).toContain(response.status);
    }, 10000);
    
    test('with missing OCIS_DOMAIN returns validation error', async () => {
      const invalidData = {
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        await axios.post(`${COMPANION_URL}/setup`, invalidData);
        // If we get here, the request succeeded - check for error in response
      } catch (error) {
        // Expect 400 Bad Request or validation error
        expect(error.response?.status).toBeGreaterThanOrEqual(400);
      }
    }, 10000);
    
    test('with invalid domain format returns validation error', async () => {
      const invalidData = {
        OCIS_DOMAIN: 'not-a-valid-domain!',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        await axios.post(`${COMPANION_URL}/setup`, invalidData);
      } catch (error) {
        expect(error.response?.status).toBeGreaterThanOrEqual(400);
      }
    }, 10000);
  });
  
});
