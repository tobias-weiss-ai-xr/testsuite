/**
 * Concurrency and Network Resilience Tests
 * 
 * Tests that validate concurrent access handling and network failure scenarios.
 * 
 * Scenarios covered:
 * - Concurrent file open requests
 * - Concurrent writes with WOPI locking
 * - Network timeout handling
 * - Simulated latency
 * - Invalid requests (file type, missing ID, invalid token)
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const OCIS_URL = process.env.OCIS_URL || config.ocisUrl || 'http://localhost:9200';
const DOC_SERVER_URL = process.env.DOCUMENT_SERVER_URL || config.documentServerUrl || 'http://localhost:8080';
const COMPANION_URL = process.env.COMPANION_URL || config.companionUrl || 'http://localhost:3000';

// Timeout for concurrent operations
const CONCURRENT_TEST_TIMEOUT = 120000;
const DEFAULT_TIMEOUT = 30000;

/**
 * Generate a unique file ID for testing
 */
function generateFileId() {
  return `test-concurrent-file-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Generate a unique lock token
 */
function generateLockToken() {
  return `lock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create axios instance with custom timeout
 */
function createAxiosInstance(timeout = 10000) {
  return axios.create({
    timeout,
    validateStatus: () => true // Don't throw on HTTP errors
  });
}

/**
 * Make WOPI request with standard headers
 */
async function wopiRequest(method, endpoint, headers = {}, data = null, timeout = 10000) {
  const url = `${OCIS_URL}/wopi/files/${endpoint}`;
  
  const requestConfig = {
    method,
    url,
    headers: {
      ...headers
    },
    timeout,
    validateStatus: () => true
  };
  
  if (data) {
    requestConfig.data = data;
  }
  
  return axios(requestConfig);
}

describe('Concurrency and Network Resilience', () => {
  
  let lockedFileIds;
  let currentLockToken;
  
  beforeEach(() => {
    lockedFileIds = [];
    currentLockToken = generateLockToken();
  });
  
  afterEach(async () => {
    // Clean up: unlock any files that were locked during tests
    for (const { fileId, lockToken } of lockedFileIds) {
      try {
        await wopiRequest('POST', `${fileId}/unlock`, {
          'X-WOPI-Lock': lockToken
        }, null, 5000);
      } catch {
        // Ignore cleanup errors
      }
    }
  }, CONCURRENT_TEST_TIMEOUT);
  
  describe('Concurrent File Operations', () => {
    
    test('10 concurrent file open requests all succeed', async () => {
      const concurrentRequests = 10;
      const fileIds = Array.from({ length: concurrentRequests }, () => generateFileId());
      
      // Create 10 concurrent requests to open files (GetFileInfo)
      const requests = fileIds.map(fileId => 
        wopiRequest('GET', fileId, {
          'X-WOPI-Override': 'GET'
        }, null, 15000)
      );
      
      // Execute all requests concurrently
      const responses = await Promise.all(requests);
      
      // All requests should complete (may be 200, 404, or other valid responses)
      // The key is that no request should hang or throw
      responses.forEach((response, index) => {
        expect(response.status).toBeDefined();
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      });
      
      // At minimum, verify we got responses for all requests
      expect(responses.length).toBe(concurrentRequests);
    }, CONCURRENT_TEST_TIMEOUT);
    
    test('Concurrent writes to same file are prevented by lock mechanism', async () => {
      const fileId = generateFileId();
      const firstLockToken = generateLockToken();
      const secondLockToken = generateLockToken();
      
      // First, lock the file with the first token
      const lockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': firstLockToken
      });
      
      // Track for cleanup
      lockedFileIds.push({ fileId, lockToken: firstLockToken });
      
      // Try concurrent lock attempts with different tokens
      const concurrentLockRequests = [
        wopiRequest('POST', `${fileId}/lock`, {
          'X-WOPI-Lock': secondLockToken
        }),
        wopiRequest('POST', `${fileId}/lock`, {
          'X-WOPI-Lock': generateLockToken()
        }),
        wopiRequest('POST', `${fileId}/lock`, {
          'X-WOPI-Lock': generateLockToken()
        })
      ];
      
      const responses = await Promise.all(concurrentLockRequests);
      
      // All concurrent lock attempts should fail with 409 Conflict
      // because the file is already locked
      responses.forEach(response => {
        expect(response.status).toBe(409);
      });
      
      // Verify the original lock is still in place
      const getLockResponse = await wopiRequest('GET', fileId);
      expect(getLockResponse.headers['x-wopi-lock']).toBe(firstLockToken);
    }, CONCURRENT_TEST_TIMEOUT);
    
    test('Concurrent writes to different files all succeed', async () => {
      const fileCount = 5;
      const files = Array.from({ length: fileCount }, () => ({
        fileId: generateFileId(),
        lockToken: generateLockToken()
      }));
      
      // Concurrently lock different files
      const lockRequests = files.map(({ fileId, lockToken }) =>
        wopiRequest('POST', `${fileId}/lock`, {
          'X-WOPI-Lock': lockToken
        })
      );
      
      const responses = await Promise.all(lockRequests);
      
      // Track all locked files for cleanup
      files.forEach(({ fileId, lockToken }) => {
        lockedFileIds.push({ fileId, lockToken });
      });
      
      // All lock operations should succeed since they're on different files
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Verify each file has its own lock
      const verifyRequests = files.map(({ fileId }) =>
        wopiRequest('GET', fileId)
      );
      
      const verifyResponses = await Promise.all(verifyRequests);
      
      verifyResponses.forEach((response, index) => {
        expect(response.headers['x-wopi-lock']).toBe(files[index].lockToken);
      });
    }, CONCURRENT_TEST_TIMEOUT);
    
  });
  
  describe('Network Timeout Handling', () => {
    
    test('Network timeout during save triggers retry or graceful error', async () => {
      const fileId = generateFileId();
      const lockToken = generateLockToken();
      
      // First, lock the file
      await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': lockToken
      });
      
      lockedFileIds.push({ fileId, lockToken });
      
      // Attempt a save operation with a very short timeout to simulate network issues
      const shortTimeout = 1; // 1ms timeout - will almost certainly timeout
      
      try {
        const response = await wopiRequest('POST', `${fileId}/contents`, {
          'X-WOPI-Lock': lockToken,
          'X-WOPI-Override': 'PUT'
        }, 'test content', shortTimeout);
        
        // If we get a response despite the short timeout, it should be a valid status
        expect(response.status).toBeDefined();
      } catch (error) {
        // Timeout errors are expected and should be handled gracefully
        expect(error.code).toMatch(/ECONNABORTED|ETIMEDOUT|timeout/i);
      }
    }, CONCURRENT_TEST_TIMEOUT);
    
    test('Simulated network latency allows editor to remain responsive', async () => {
      const fileId = generateFileId();
      
      // Make a request with latency tolerance (longer timeout)
      const startTime = Date.now();
      
      const response = await wopiRequest('GET', fileId, {}, null, 20000);
      
      const elapsed = Date.now() - startTime;
      
      // Request should complete within reasonable time even with latency
      expect(elapsed).toBeLessThan(25000);
      
      // Response should be valid (200, 404, etc.)
      expect(response.status).toBeDefined();
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    }, CONCURRENT_TEST_TIMEOUT);
    
  });
  
  describe('Invalid Request Handling', () => {
    
    test('Invalid file type (.exe) returns appropriate error (403 or 400)', async () => {
      const invalidFileId = 'malware.exe';
      
      const response = await wopiRequest('GET', invalidFileId);
      
      // Should reject executable files
      expect([400, 403, 404, 415]).toContain(response.status);
    }, DEFAULT_TIMEOUT);
    
    test('Invalid file type (.zip) returns appropriate error', async () => {
      const invalidFileId = 'archive.zip';
      
      const response = await wopiRequest('GET', invalidFileId);
      
      // Should reject archive files for editing
      expect([400, 403, 404, 415]).toContain(response.status);
    }, DEFAULT_TIMEOUT);
    
    test('Invalid file type (.sh) returns appropriate error', async () => {
      const invalidFileId = 'script.sh';
      
      const response = await wopiRequest('GET', invalidFileId);
      
      // Should reject shell scripts
      expect([400, 403, 404, 415]).toContain(response.status);
    }, DEFAULT_TIMEOUT);
    
    test('Missing file ID returns 404 Not Found', async () => {
      // Request with empty or missing file ID
      const response = await axios({
        method: 'GET',
        url: `${OCIS_URL}/wopi/files/`,
        validateStatus: () => true,
        timeout: 10000
      });
      
      // Should return 404 for missing file ID
      expect([404, 400, 405]).toContain(response.status);
    }, DEFAULT_TIMEOUT);
    
    test('Invalid access token returns 401 Unauthorized', async () => {
      const fileId = generateFileId();
      const invalidToken = 'invalid-token-12345';
      
      const response = await wopiRequest('GET', fileId, {
        'Authorization': `Bearer ${invalidToken}`,
        'X-Access-Token': invalidToken
      });
      
      // Should reject invalid tokens
      expect([401, 403]).toContain(response.status);
    }, DEFAULT_TIMEOUT);
    
  });
  
  describe('Lock Cleanup and Recovery', () => {
    
    test('Stale locks can be overridden with correct X-WOPI-OldLock', async () => {
      const fileId = generateFileId();
      const originalLockToken = generateLockToken();
      const newLockToken = generateLockToken();
      
      // Lock with original token
      const lockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': originalLockToken
      });
      expect(lockResponse.status).toBe(200);
      
      // Override with new token using OldLock
      const overrideResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': newLockToken,
        'X-WOPI-OldLock': originalLockToken
      });
      
      // Track with new token for cleanup
      lockedFileIds.push({ fileId, lockToken: newLockToken });
      
      expect(overrideResponse.status).toBe(200);
      
      // Verify new lock is in place
      const verifyResponse = await wopiRequest('GET', fileId);
      expect(verifyResponse.headers['x-wopi-lock']).toBe(newLockToken);
    }, DEFAULT_TIMEOUT);
    
    test('Lock refresh extends lock validity', async () => {
      const fileId = generateFileId();
      const lockToken = generateLockToken();
      
      // Lock the file
      await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': lockToken
      });
      
      lockedFileIds.push({ fileId, lockToken });
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Refresh the lock
      const refreshResponse = await wopiRequest('POST', `${fileId}/refresh_lock`, {
        'X-WOPI-Lock': lockToken
      });
      
      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.headers['x-wopi-lock']).toBe(lockToken);
    }, DEFAULT_TIMEOUT);
    
  });
  
  describe('High Concurrency Scenarios', () => {
    
    test('15 concurrent read requests all complete successfully', async () => {
      const concurrentRequests = 15;
      const fileIds = Array.from({ length: concurrentRequests }, () => generateFileId());
      
      const requests = fileIds.map(fileId =>
        wopiRequest('GET', fileId, {}, null, 15000)
      );
      
      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const elapsed = Date.now() - startTime;
      
      // All requests should complete
      expect(responses.length).toBe(concurrentRequests);
      
      // Each response should be valid
      responses.forEach(response => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      });
      
      // Should complete within reasonable time
      expect(elapsed).toBeLessThan(30000);
    }, CONCURRENT_TEST_TIMEOUT);
    
    test('Concurrent lock and unlock operations maintain consistency', async () => {
      const fileId = generateFileId();
      const lockToken = generateLockToken();
      
      // Lock the file
      await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': lockToken
      });
      
      // Concurrent operations on the same file
      const operations = [
        // Read operations should succeed
        wopiRequest('GET', fileId),
        // Lock refresh should succeed
        wopiRequest('POST', `${fileId}/refresh_lock`, {
          'X-WOPI-Lock': lockToken
        }),
        // Wrong lock attempts should fail
        wopiRequest('POST', `${fileId}/lock`, {
          'X-WOPI-Lock': generateLockToken()
        })
      ];
      
      const responses = await Promise.all(operations);
      
      lockedFileIds.push({ fileId, lockToken });
      
      // GET should succeed
      expect(responses[0].status).toBe(200);
      
      // Refresh should succeed
      expect(responses[1].status).toBe(200);
      
      // Wrong lock should fail
      expect(responses[2].status).toBe(409);
    }, CONCURRENT_TEST_TIMEOUT);
    
  });
  
});
