/**
 * WOPI Lock/Unlock Tests
 * 
 * Tests that verify WOPI file locking mechanism.
 * 
 * WOPI Lock endpoints:
 * - POST /wopi/files/{file_id}/lock - Lock a file
 * - POST /wopi/files/{file_id}/unlock - Unlock a file
 * - POST /wopi/files/{file_id}/refresh_lock - Refresh/extend a lock
 * - GET /wopi/files/{file_id} - Get lock status (GetLock)
 * 
 * Headers:
 * - X-WOPI-Lock: Lock identifier
 * - X-WOPI-OldLock: Previous lock identifier (for lock refresh)
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const OCIS_URL = process.env.OCIS_URL || config.ocisUrl || 'http://localhost:9200';

// Test file ID - using a consistent test identifier
const TEST_FILE_ID = 'test-wopi-lock-file-' + Date.now();
const LOCK_TIMEOUT = 60000;

/**
 * Generate a unique lock token
 */
function generateLockToken() {
  return `lock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Make WOPI request with standard headers
 */
async function wopiRequest(method, endpoint, headers = {}, data = null) {
  const url = `${OCIS_URL}/wopi/files/${endpoint}`;
  
  const requestConfig = {
    method,
    url,
    headers: {
      'X-WOPI-Override': method === 'POST' ? undefined : method,
      ...headers
    },
    validateStatus: () => true // Don't throw on HTTP errors
  };
  
  if (data) {
    requestConfig.data = data;
  }
  
  return axios(requestConfig);
}

describe('WOPI Lock/Unlock Operations', () => {
  
  let currentLockToken;
  let lockedFileIds;
  
  beforeEach(() => {
    currentLockToken = generateLockToken();
    lockedFileIds = [];
  });
  
  afterEach(async () => {
    // Clean up: unlock any files that were locked during tests
    for (const fileId of lockedFileIds) {
      try {
        await wopiRequest('POST', `${fileId}/unlock`, {
          'X-WOPI-Lock': currentLockToken
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  }, LOCK_TIMEOUT);
  
  describe('Lock Operation', () => {
    
    test('Lock operation with X-WOPI-Lock header returns 200 OK and lock returned', async () => {
      const fileId = TEST_FILE_ID + '-lock-test';
      
      const response = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('x-wopi-lock');
      expect(response.headers['x-wopi-lock']).toBe(currentLockToken);
    }, LOCK_TIMEOUT);
    
    test('Lock operation without X-WOPI-Lock header returns 400 Bad Request', async () => {
      const fileId = TEST_FILE_ID + '-no-lock-header';
      
      const response = await wopiRequest('POST', `${fileId}/lock`, {});
      
      expect(response.status).toBe(400);
    }, LOCK_TIMEOUT);
    
    test('Lock operation with empty X-WOPI-Lock returns 400 Bad Request', async () => {
      const fileId = TEST_FILE_ID + '-empty-lock';
      
      const response = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': ''
      });
      
      expect(response.status).toBe(400);
    }, LOCK_TIMEOUT);
    
  });
  
  describe('Unlock Operation', () => {
    
    test('Unlock operation with correct X-WOPI-Lock returns 200 OK', async () => {
      const fileId = TEST_FILE_ID + '-unlock-test';
      
      // First, lock the file
      const lockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(lockResponse.status).toBe(200);
      
      // Then unlock with the same lock token
      const unlockResponse = await wopiRequest('POST', `${fileId}/unlock`, {
        'X-WOPI-Lock': currentLockToken
      });
      
      expect(unlockResponse.status).toBe(200);
    }, LOCK_TIMEOUT);
    
    test('Unlock with wrong X-WOPI-Lock returns 409 Conflict', async () => {
      const fileId = TEST_FILE_ID + '-wrong-unlock';
      const wrongLockToken = 'wrong-lock-token-' + Date.now();
      
      // First, lock the file
      const lockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(lockResponse.status).toBe(200);
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      // Try to unlock with wrong token
      const unlockResponse = await wopiRequest('POST', `${fileId}/unlock`, {
        'X-WOPI-Lock': wrongLockToken
      });
      
      expect(unlockResponse.status).toBe(409);
    }, LOCK_TIMEOUT);
    
    test('Unlock on unlocked file returns 409 Conflict', async () => {
      const fileId = TEST_FILE_ID + '-unlock-not-locked';
      
      // Try to unlock a file that was never locked
      const unlockResponse = await wopiRequest('POST', `${fileId}/unlock`, {
        'X-WOPI-Lock': currentLockToken
      });
      
      expect(unlockResponse.status).toBe(409);
    }, LOCK_TIMEOUT);
    
  });
  
  describe('RefreshLock Operation', () => {
    
    test('RefreshLock operation extends lock', async () => {
      const fileId = TEST_FILE_ID + '-refresh-test';
      
      // First, lock the file
      const lockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(lockResponse.status).toBe(200);
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      // Refresh the lock
      const refreshResponse = await wopiRequest('POST', `${fileId}/refresh_lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      
      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.headers).toHaveProperty('x-wopi-lock');
    }, LOCK_TIMEOUT);
    
    test('RefreshLock with wrong lock token returns 409 Conflict', async () => {
      const fileId = TEST_FILE_ID + '-refresh-wrong';
      const wrongLockToken = 'wrong-refresh-token-' + Date.now();
      
      // First, lock the file
      const lockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(lockResponse.status).toBe(200);
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      // Try to refresh with wrong token
      const refreshResponse = await wopiRequest('POST', `${fileId}/refresh_lock`, {
        'X-WOPI-Lock': wrongLockToken
      });
      
      expect(refreshResponse.status).toBe(409);
    }, LOCK_TIMEOUT);
    
    test('RefreshLock on unlocked file returns 409 Conflict', async () => {
      const fileId = TEST_FILE_ID + '-refresh-not-locked';
      
      // Try to refresh a file that was never locked
      const refreshResponse = await wopiRequest('POST', `${fileId}/refresh_lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      
      expect(refreshResponse.status).toBe(409);
    }, LOCK_TIMEOUT);
    
  });
  
  describe('GetLock Operation', () => {
    
    test('GetLock operation returns current lock status', async () => {
      const fileId = TEST_FILE_ID + '-getlock-test';
      
      // First, lock the file
      const lockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(lockResponse.status).toBe(200);
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      // Get lock status
      const getLockResponse = await wopiRequest('GET', fileId);
      
      expect(getLockResponse.status).toBe(200);
      expect(getLockResponse.headers).toHaveProperty('x-wopi-lock');
      expect(getLockResponse.headers['x-wopi-lock']).toBe(currentLockToken);
    }, LOCK_TIMEOUT);
    
    test('GetLock on unlocked file returns empty lock', async () => {
      const fileId = TEST_FILE_ID + '-getlock-unlocked';
      
      // Get lock status on unlocked file
      const getLockResponse = await wopiRequest('GET', fileId);
      
      expect(getLockResponse.status).toBe(200);
      // X-WOPI-Lock should be empty string for unlocked files
      const lockHeader = getLockResponse.headers['x-wopi-lock'];
      expect(lockHeader === '' || lockHeader === undefined).toBe(true);
    }, LOCK_TIMEOUT);
    
  });
  
  describe('Concurrent Lock Prevention', () => {
    
    test('Lock prevents concurrent edits (second lock attempt returns 409 Conflict)', async () => {
      const fileId = TEST_FILE_ID + '-concurrent-test';
      const secondLockToken = generateLockToken();
      
      // First, lock the file
      const firstLockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(firstLockResponse.status).toBe(200);
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      // Try to lock again with a different token
      const secondLockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': secondLockToken
      });
      
      expect(secondLockResponse.status).toBe(409);
      
      // Verify the original lock is still in place
      const getLockResponse = await wopiRequest('GET', fileId);
      expect(getLockResponse.headers['x-wopi-lock']).toBe(currentLockToken);
    }, LOCK_TIMEOUT);
    
    test('Lock with X-WOPI-OldLock allows lock transfer', async () => {
      const fileId = TEST_FILE_ID + '-lock-transfer';
      const newLockToken = generateLockToken();
      
      // First, lock the file
      const firstLockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(firstLockResponse.status).toBe(200);
      
      // Track for cleanup (with new token)
      lockedFileIds.push(fileId);
      
      // Transfer lock using X-WOPI-OldLock
      const transferResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': newLockToken,
        'X-WOPI-OldLock': currentLockToken
      });
      
      // Should succeed and transfer the lock
      expect(transferResponse.status).toBe(200);
      
      // Update cleanup to use new token
      currentLockToken = newLockToken;
      
      // Verify the new lock is in place
      const getLockResponse = await wopiRequest('GET', fileId);
      expect(getLockResponse.headers['x-wopi-lock']).toBe(newLockToken);
    }, LOCK_TIMEOUT);
    
    test('Lock with wrong X-WOPI-OldLock returns 409 Conflict', async () => {
      const fileId = TEST_FILE_ID + '-wrong-oldlock';
      const newLockToken = generateLockToken();
      const wrongOldLock = 'wrong-old-lock-' + Date.now();
      
      // First, lock the file
      const firstLockResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      expect(firstLockResponse.status).toBe(200);
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      // Try to transfer with wrong old lock
      const transferResponse = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': newLockToken,
        'X-WOPI-OldLock': wrongOldLock
      });
      
      expect(transferResponse.status).toBe(409);
      
      // Verify original lock is still in place
      const getLockResponse = await wopiRequest('GET', fileId);
      expect(getLockResponse.headers['x-wopi-lock']).toBe(currentLockToken);
    }, LOCK_TIMEOUT);
    
  });
  
  describe('Lock Response Headers', () => {
    
    test('Lock response includes X-WOPI-Lock header', async () => {
      const fileId = TEST_FILE_ID + '-headers-test';
      
      const response = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('x-wopi-lock');
    }, LOCK_TIMEOUT);
    
    test('Lock response includes item version info', async () => {
      const fileId = TEST_FILE_ID + '-version-test';
      
      const response = await wopiRequest('POST', `${fileId}/lock`, {
        'X-WOPI-Lock': currentLockToken
      });
      
      // Track for cleanup
      lockedFileIds.push(fileId);
      
      expect(response.status).toBe(200);
      // WOPI spec recommends returning X-WOPI-ItemVersion
      // This is optional but good to check if present
      if (response.headers['x-wopi-itemversion']) {
        expect(typeof response.headers['x-wopi-itemversion']).toBe('string');
      }
    }, LOCK_TIMEOUT);
    
  });
  
});
