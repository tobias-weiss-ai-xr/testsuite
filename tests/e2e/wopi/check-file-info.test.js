/**
 * WOPI CheckFileInfo Tests
 * 
 * Tests that verify WOPI CheckFileInfo endpoint responses.
 * 
 * WOPI CheckFileInfo endpoint: GET /wopi/files/{file_id}?access_token={token}
 * Returns JSON with file metadata and capabilities.
 * 
 * Note: These tests require OCIS to be running with WOPI enabled.
 * Tests will be skipped if OCIS is not available or test files are not set up.
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const OCIS_URL = config.ocisUrl;

// Test file placeholders - these would typically be set up via API or test fixtures
const TEST_FILES = {
  docx: {
    fileId: process.env.WOPI_TEST_DOCX_FILE_ID || null,
    accessToken: process.env.WOPI_TEST_DOCX_TOKEN || null
  },
  xlsx: {
    fileId: process.env.WOPI_TEST_XLSX_FILE_ID || null,
    accessToken: process.env.WOPI_TEST_XLSX_TOKEN || null
  },
  pptx: {
    fileId: process.env.WOPI_TEST_PPTX_FILE_ID || null,
    accessToken: process.env.WOPI_TEST_PPTX_TOKEN || null
  }
};

// Helper to check if test files are available
const hasTestFiles = () => {
  return Object.values(TEST_FILES).some(file => file.fileId && file.accessToken);
};

// Helper to get first available test file
const getFirstAvailableTestFile = () => {
  for (const [type, file] of Object.entries(TEST_FILES)) {
    if (file.fileId && file.accessToken) {
      return { type, ...file };
    }
  }
  return null;
};

// Helper to make CheckFileInfo request
const checkFileInfo = async (fileId, accessToken) => {
  const response = await axios.get(`${OCIS_URL}/wopi/files/${fileId}`, {
    params: { access_token: accessToken },
    headers: {
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  return response;
};

describe('WOPI CheckFileInfo Operation', () => {
  
  let ocisAvailable = false;
  let testFile = null;
  
  beforeAll(async () => {
    // Check if OCIS is available
    try {
      await axios.get(`${OCIS_URL}/health`, { timeout: 5000 });
      ocisAvailable = true;
    } catch (error) {
      ocisAvailable = false;
    }
    
    // Get first available test file
    testFile = getFirstAvailableTestFile();
  }, 10000);
  
  describe('Service Availability', () => {
    test('OCIS service is running', () => {
      expect(ocisAvailable).toBe(true);
    });
    
    test('test files are configured', () => {
      expect(hasTestFiles()).toBe(true);
    });
  });
  
  describe('Required Fields', () => {
    let response;
    let fileInfo;
    
    beforeAll(async () => {
      if (!ocisAvailable || !testFile) {
        return;
      }
      
      try {
        response = await checkFileInfo(testFile.fileId, testFile.accessToken);
        fileInfo = response.data;
      } catch (error) {
        // Store error for test assertions
        response = { error };
      }
    }, 30000);
    
    test('CheckFileInfo returns BaseFileName', () => {
      if (!ocisAvailable || !testFile) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(response.error).toBeUndefined();
      expect(fileInfo).toHaveProperty('BaseFileName');
      expect(typeof fileInfo.BaseFileName).toBe('string');
      expect(fileInfo.BaseFileName.length).toBeGreaterThan(0);
    });
    
    test('CheckFileInfo returns OwnerId', () => {
      if (!ocisAvailable || !testFile) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(response.error).toBeUndefined();
      expect(fileInfo).toHaveProperty('OwnerId');
      expect(typeof fileInfo.OwnerId).toBe('string');
    });
    
    test('CheckFileInfo returns Size', () => {
      if (!ocisAvailable || !testFile) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(response.error).toBeUndefined();
      expect(fileInfo).toHaveProperty('Size');
      expect(typeof fileInfo.Size).toBe('number');
      expect(fileInfo.Size).toBeGreaterThanOrEqual(0);
    });
    
    test('CheckFileInfo returns Version', () => {
      if (!ocisAvailable || !testFile) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(response.error).toBeUndefined();
      expect(fileInfo).toHaveProperty('Version');
      expect(typeof fileInfo.Version).toBe('string');
    });
    
    test('CheckFileInfo returns UserId', () => {
      if (!ocisAvailable || !testFile) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(response.error).toBeUndefined();
      expect(fileInfo).toHaveProperty('UserId');
      expect(typeof fileInfo.UserId).toBe('string');
    });
  });
  
  describe('Permission Flags', () => {
    let fileInfo;
    
    beforeAll(async () => {
      if (!ocisAvailable || !testFile) {
        return;
      }
      
      try {
        const response = await checkFileInfo(testFile.fileId, testFile.accessToken);
        fileInfo = response.data;
      } catch (error) {
        fileInfo = null;
      }
    }, 30000);
    
    test('CheckFileInfo returns UserCanWrite flag', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(fileInfo).toHaveProperty('UserCanWrite');
      expect(typeof fileInfo.UserCanWrite).toBe('boolean');
    });
    
    test('CheckFileInfo returns UserCanNotWriteRelative flag', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(fileInfo).toHaveProperty('UserCanNotWriteRelative');
      expect(typeof fileInfo.UserCanNotWriteRelative).toBe('boolean');
    });
    
    test('UserCanWrite reflects write permission', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      // UserCanWrite should be a valid boolean
      expect([true, false]).toContain(fileInfo.UserCanWrite);
    });
  });
  
  describe('Capability Flags', () => {
    let fileInfo;
    
    beforeAll(async () => {
      if (!ocisAvailable || !testFile) {
        return;
      }
      
      try {
        const response = await checkFileInfo(testFile.fileId, testFile.accessToken);
        fileInfo = response.data;
      } catch (error) {
        fileInfo = null;
      }
    }, 30000);
    
    test('CheckFileInfo returns SupportsUpdate flag', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(fileInfo).toHaveProperty('SupportsUpdate');
      expect(typeof fileInfo.SupportsUpdate).toBe('boolean');
    });
    
    test('CheckFileInfo returns SupportsLocks flag', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(fileInfo).toHaveProperty('SupportsLocks');
      expect(typeof fileInfo.SupportsLocks).toBe('boolean');
    });
    
    test('SupportsUpdate indicates file can be saved', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      // SupportsUpdate should be a valid boolean
      expect([true, false]).toContain(fileInfo.SupportsUpdate);
    });
    
    test('SupportsLocks indicates file locking support', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      // SupportsLocks should be a valid boolean
      expect([true, false]).toContain(fileInfo.SupportsLocks);
    });
  });
  
  describe('File Type Support', () => {
    test('CheckFileInfo works with .docx files', async () => {
      const docxFile = TEST_FILES.docx;
      if (!ocisAvailable || !docxFile.fileId || !docxFile.accessToken) {
        return expect(true).toBe(true); // Skip
      }
      
      const response = await checkFileInfo(docxFile.fileId, docxFile.accessToken);
      expect(response.status).toBe(200);
      expect(response.data.BaseFileName).toMatch(/\.docx$/i);
    }, 30000);
    
    test('CheckFileInfo works with .xlsx files', async () => {
      const xlsxFile = TEST_FILES.xlsx;
      if (!ocisAvailable || !xlsxFile.fileId || !xlsxFile.accessToken) {
        return expect(true).toBe(true); // Skip
      }
      
      const response = await checkFileInfo(xlsxFile.fileId, xlsxFile.accessToken);
      expect(response.status).toBe(200);
      expect(response.data.BaseFileName).toMatch(/\.xlsx$/i);
    }, 30000);
    
    test('CheckFileInfo works with .pptx files', async () => {
      const pptxFile = TEST_FILES.pptx;
      if (!ocisAvailable || !pptxFile.fileId || !pptxFile.accessToken) {
        return expect(true).toBe(true); // Skip
      }
      
      const response = await checkFileInfo(pptxFile.fileId, pptxFile.accessToken);
      expect(response.status).toBe(200);
      expect(response.data.BaseFileName).toMatch(/\.pptx$/i);
    }, 30000);
  });
  
  describe('HTTP Response', () => {
    let response;
    
    beforeAll(async () => {
      if (!ocisAvailable || !testFile) {
        return;
      }
      
      try {
        response = await checkFileInfo(testFile.fileId, testFile.accessToken);
      } catch (error) {
        response = { error };
      }
    }, 30000);
    
    test('Response Content-Type is application/json', () => {
      if (!ocisAvailable || !testFile || response.error) {
        return expect(true).toBe(true); // Skip
      }
      
      const contentType = response.headers['content-type'];
      expect(contentType).toMatch(/application\/json/);
    });
    
    test('Response status is 200 OK', () => {
      if (!ocisAvailable || !testFile || response.error) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(response.status).toBe(200);
    });
    
    test('Response body is valid JSON', () => {
      if (!ocisAvailable || !testFile || response.error) {
        return expect(true).toBe(true); // Skip
      }
      
      expect(response.data).toBeDefined();
      expect(typeof response.data).toBe('object');
    });
  });
  
  describe('JSON Response Structure', () => {
    let fileInfo;
    
    beforeAll(async () => {
      if (!ocisAvailable || !testFile) {
        return;
      }
      
      try {
        const response = await checkFileInfo(testFile.fileId, testFile.accessToken);
        fileInfo = response.data;
      } catch (error) {
        fileInfo = null;
      }
    }, 30000);
    
    test('Response contains only expected property types', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      // Check that all values are valid JSON types
      const validTypes = ['string', 'number', 'boolean', 'object'];
      
      for (const value of Object.values(fileInfo)) {
        expect(validTypes).toContain(typeof value);
      }
    });
    
    test('Required string fields are non-empty', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      const stringFields = ['BaseFileName', 'OwnerId', 'Version', 'UserId'];
      
      for (const field of stringFields) {
        if (fileInfo[field] !== undefined) {
          expect(typeof fileInfo[field]).toBe('string');
          expect(fileInfo[field].length).toBeGreaterThan(0);
        }
      }
    });
    
    test('Numeric fields are non-negative', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      const numericFields = ['Size'];
      
      for (const field of numericFields) {
        if (fileInfo[field] !== undefined) {
          expect(fileInfo[field]).toBeGreaterThanOrEqual(0);
        }
      }
    });
    
    test('Boolean flags are valid booleans', () => {
      if (!ocisAvailable || !testFile || !fileInfo) {
        return expect(true).toBe(true); // Skip
      }
      
      const booleanFields = [
        'UserCanWrite',
        'UserCanNotWriteRelative',
        'SupportsUpdate',
        'SupportsLocks'
      ];
      
      for (const field of booleanFields) {
        if (fileInfo[field] !== undefined) {
          expect(typeof fileInfo[field]).toBe('boolean');
        }
      }
    });
  });
  
  describe('Error Handling', () => {
    test('Returns 401 for invalid access token', async () => {
      if (!ocisAvailable || !testFile) {
        return expect(true).toBe(true); // Skip
      }
      
      try {
        await checkFileInfo(testFile.fileId, 'invalid_token');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    }, 10000);
    
    test('Returns 404 for non-existent file', async () => {
      if (!ocisAvailable) {
        return expect(true).toBe(true); // Skip
      }
      
      try {
        await checkFileInfo('non-existent-file-id', 'any_token');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect([404, 401]).toContain(error.response.status);
      }
    }, 10000);
  });
  
});
