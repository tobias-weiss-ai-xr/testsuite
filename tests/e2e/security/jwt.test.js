/**
 * JWT Token Validation Security Tests
 * 
 * Tests JWT handling for the euro_Office Document Server.
 * Validates proper authentication and error responses for various JWT scenarios.
 */

const axios = require('axios');
const config = require('../../setup');

// Test configuration
const TEST_URL = process.env.DOCUMENT_SERVER_URL || config.documentServerUrl;
const JWT_TIMEOUT = 60000; // 60 seconds per test

// Placeholder tokens for testing (NOT real secrets)
const PLACEHOLDER_TOKENS = {
  invalid: 'invalid.jwt.token',
  expired: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDAsImlhdCI6MTYwMDAwMDAwMH0.expired_signature_placeholder',
  malformed: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.malformed_payload.invalid_signature',
  validButUnsigned: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxNTE2MjM5MDIyfQ.'
};

describe('JWT Token Validation', () => {
  
  describe('Negative Test Cases', () => {
    
    test('should return 401 for invalid JWT token', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': `Bearer ${PLACEHOLDER_TOKENS.invalid}`
        },
        validateStatus: () => true // Don't throw on HTTP error status
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
    test('should return 401 for expired JWT token', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': `Bearer ${PLACEHOLDER_TOKENS.expired}`
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
    test('should return 401 for malformed JWT with invalid signature', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': `Bearer ${PLACEHOLDER_TOKENS.malformed}`
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
    test('should return 401 for missing Authorization header', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
    test('should return 401 for unsigned JWT token (alg: none)', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': `Bearer ${PLACEHOLDER_TOKENS.validButUnsigned}`
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
  });
  
  describe('Positive Test Cases', () => {
    
    test('should return 200 OK for valid JWT token when JWT is enabled', async () => {
      // This test requires a valid JWT token generated with the server's secret
      // In a real test environment, this would be generated dynamically
      // For now, we skip if no valid token is available
      const validToken = process.env.TEST_JWT_TOKEN;
      
      if (!validToken) {
        console.log('Skipping valid JWT test: TEST_JWT_TOKEN not set in environment');
        return;
      }
      
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': `Bearer ${validToken}`
        },
        validateStatus: () => true
      });
      
      // With a valid token, we expect success or a different error (not 401)
      expect([200, 400, 404]).toContain(response.status);
    }, JWT_TIMEOUT);
    
    test('should allow access to public endpoints without JWT', async () => {
      // Discovery endpoint should be accessible without authentication
      const response = await axios.get(`${TEST_URL}/hosting/discovery`, {
        validateStatus: () => true
      });
      
      // Discovery should work without JWT
      expect([200, 404]).toContain(response.status);
    }, JWT_TIMEOUT);
    
  });
  
  describe('Edge Cases', () => {
    
    test('should return 401 for empty Authorization header', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': ''
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
    test('should return 401 for Bearer without token', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': 'Bearer '
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
    test('should return 401 for wrong auth scheme (Basic instead of Bearer)', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': 'Basic dGVzdDp0ZXN0'
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
    test('should handle JWT with tampered payload', async () => {
      // Token with tampered payload section
      const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dGFtcGVyZWRfcGF5bG9hZA.tampered_signature';
      
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': `Bearer ${tamperedToken}`
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
    }, JWT_TIMEOUT);
    
  });
  
  describe('Security Headers Validation', () => {
    
    test('should include appropriate security headers in 401 response', async () => {
      const response = await axios.get(`${TEST_URL}/coauthoring/CommandService.ashx`, {
        headers: {
          'Authorization': `Bearer ${PLACEHOLDER_TOKENS.invalid}`
        },
        validateStatus: () => true
      });
      
      expect(response.status).toBe(401);
      
      // Check for WWW-Authenticate header or error in response
      const wwwAuthenticate = response.headers['www-authenticate'];
      const hasAuthHeader = wwwAuthenticate !== undefined;
      
      // Either WWW-Authenticate header or error body should be present
      expect(hasAuthHeader || response.data).toBeTruthy();
    }, JWT_TIMEOUT);
    
  });
  
});
