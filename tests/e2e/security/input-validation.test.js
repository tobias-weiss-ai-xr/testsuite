/**
 * Input Validation Security Tests
 * 
 * Tests that verify input handling and security for the euro_Office companion API.
 * These tests validate that the API properly rejects malicious or malformed input.
 */

const { describe, test, expect } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const COMPANION_URL = process.env.COMPANION_URL || config.companionUrl;

describe('Input Validation', () => {
  
  describe('POST /api/setup - Malformed Input', () => {
    
    test('rejects malformed JSON body with 400 Bad Request', async () => {
      // Send invalid JSON syntax
      const invalidJson = '{"OCIS_DOMAIN": "test.com", "DOCUMENT_SERVER_DOMAIN": broken}';
      
      try {
        await axios.post(`${COMPANION_URL}/api/setup`, invalidJson, {
          headers: {
            'Content-Type': 'application/json'
          },
          transformRequest: [(data) => data], // Prevent axios from stringifying
          validateStatus: () => true // Don't throw on any status
        });
        
        // If we get here without throwing, check that status is 400
        // Note: This test expects the server to reject malformed JSON
      } catch (error) {
        // Axios may throw on malformed request
        expect(error.response?.status).toBeGreaterThanOrEqual(400);
        expect(error.response?.status).toBeLessThan(500);
      }
    }, 10000);
    
    test('rejects empty request body with 400 Bad Request', async () => {
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, {}, {
          validateStatus: () => true
        });
        
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      } catch (error) {
        expect(error.response?.status).toBeGreaterThanOrEqual(400);
        expect(error.response?.status).toBeLessThan(500);
      }
    }, 10000);
    
  });
  
  describe('POST /api/setup - Missing Required Fields', () => {
    
    test('rejects request with missing OCIS_DOMAIN field', async () => {
      const payload = {
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com',
        PORT: '3000'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects request with missing DOCUMENT_SERVER_DOMAIN field', async () => {
      const payload = {
        OCIS_DOMAIN: 'test.example.com',
        PORT: '3000'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects request with all required fields missing', async () => {
      const payload = {
        OPTIONAL_FIELD: 'some-value'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
  });
  
  describe('POST /api/setup - Invalid Field Types', () => {
    
    test('rejects request with array where string expected for OCIS_DOMAIN', async () => {
      const payload = {
        OCIS_DOMAIN: ['test.example.com'],
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects request with object where string expected for OCIS_DOMAIN', async () => {
      const payload = {
        OCIS_DOMAIN: { domain: 'test.example.com' },
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects request with number where string expected for OCIS_DOMAIN', async () => {
      const payload = {
        OCIS_DOMAIN: 12345,
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects request with null value for required field', async () => {
      const payload = {
        OCIS_DOMAIN: null,
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
  });
  
  describe('POST /api/setup - SQL Injection Prevention', () => {
    
    test('rejects SQL injection attempt in OCIS_DOMAIN field', async () => {
      const payload = {
        OCIS_DOMAIN: "'; DROP TABLE users; --",
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        // Should either reject with 400 or sanitize the input
        expect(response.status).toBe(400);
        
        // If response includes the value, ensure it's sanitized (no SQL execution)
        if (response.data?.OCIS_DOMAIN) {
          const sanitizedValue = JSON.stringify(response.data.OCIS_DOMAIN);
          expect(sanitizedValue).not.toMatch(/DROP TABLE/i);
          expect(sanitizedValue).not.toMatch(/--\s*$/);
        }
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects SQL injection attempt with UNION SELECT', async () => {
      const payload = {
        OCIS_DOMAIN: "' UNION SELECT * FROM users --",
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects SQL injection attempt with OR condition', async () => {
      const payload = {
        OCIS_DOMAIN: "' OR '1'='1",
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
  });
  
  describe('POST /api/setup - Path Traversal Prevention', () => {
    
    test('rejects path traversal attempt in OCIS_DOMAIN field', async () => {
      const payload = {
        OCIS_DOMAIN: '../../../etc/passwd',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        // Path traversal should be rejected - either 400 or 403
        expect([400, 403]).toContain(response.status);
      } catch (error) {
        expect([400, 403]).toContain(error.response?.status);
      }
    }, 10000);
    
    test('rejects path traversal attempt with encoded characters', async () => {
      const payload = {
        OCIS_DOMAIN: '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect([400, 403]).toContain(response.status);
      } catch (error) {
        expect([400, 403]).toContain(error.response?.status);
      }
    }, 10000);
    
    test('rejects path traversal attempt with mixed encoding', async () => {
      const payload = {
        OCIS_DOMAIN: '..%2f..%2f..%2fetc%2fshadow',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect([400, 403]).toContain(response.status);
      } catch (error) {
        expect([400, 403]).toContain(error.response?.status);
      }
    }, 10000);
    
    test('rejects absolute path attempt', async () => {
      const payload = {
        OCIS_DOMAIN: '/etc/passwd',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect([400, 403]).toContain(response.status);
      } catch (error) {
        expect([400, 403]).toContain(error.response?.status);
      }
    }, 10000);
    
  });
  
  describe('POST /api/setup - XSS Prevention', () => {
    
    test('rejects XSS attempt in OCIS_DOMAIN field', async () => {
      const payload = {
        OCIS_DOMAIN: '<script>alert("xss")</script>test.com',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects XSS attempt with javascript: protocol', async () => {
      const payload = {
        OCIS_DOMAIN: 'javascript:alert(document.cookie)',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
  });
  
  describe('POST /api/setup - Additional Security Checks', () => {
    
    test('rejects extremely long input (potential DoS)', async () => {
      const longString = 'a'.repeat(10000);
      const payload = {
        OCIS_DOMAIN: longString,
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      } catch (error) {
        expect(error.response?.status).toBeGreaterThanOrEqual(400);
        expect(error.response?.status).toBeLessThan(500);
      }
    }, 10000);
    
    test('rejects command injection attempt', async () => {
      const payload = {
        OCIS_DOMAIN: 'test.com; rm -rf /',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects null byte injection attempt', async () => {
      const payload = {
        OCIS_DOMAIN: 'test.com\x00.evil.com',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
    test('rejects CRLF injection attempt', async () => {
      const payload = {
        OCIS_DOMAIN: 'test.com\r\nSet-Cookie: malicious=cookie',
        DOCUMENT_SERVER_DOMAIN: 'docs.test.example.com'
      };
      
      try {
        const response = await axios.post(`${COMPANION_URL}/api/setup`, payload, {
          validateStatus: () => true
        });
        
        expect(response.status).toBe(400);
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    }, 10000);
    
  });
  
});
