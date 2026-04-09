/**
 * Companion Health Tests
 * 
 * Tests that verify the eurooffice-opencloud companion is running and healthy.
 */

const { describe, test, expect } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const COMPANION_URL = config.companionUrl;

describe('Companion Health', () => {
  
  describe('Container Status', () => {
    test('container is running', async () => {
      const { isContainerHealthy } = require('../../helpers/docker');
      const healthy = await isContainerHealthy('test-companion');
      expect(healthy).toBe(true);
    }, 30000);
  });
  
  describe('HTTP Endpoints', () => {
    test('GET /api/health returns 200', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      expect(response.status).toBe(200);
    }, 10000);
    
    test('GET /api/health returns JSON with overall status', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      expect(response.data).toHaveProperty('overall');
      expect(['healthy', 'degraded', 'down']).toContain(response.data.overall);
    }, 10000);
    
    test('health response is not "down"', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      expect(response.data.overall).not.toBe('down');
    }, 10000);
    
    test('health response lists all expected services', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      expect(response.data).toHaveProperty('services');
      expect(response.data.services).toHaveProperty('documentserver');
      expect(response.data.services).toHaveProperty('ocis');
    }, 10000);
    
    test('health response has timestamp', async () => {
      const response = await axios.get(`${COMPANION_URL}/api/health`);
      expect(response.data).toHaveProperty('timestamp');
    }, 10000);
  });
  
  describe('Startup Time', () => {
    test('responds within 2 minutes of OCIS being healthy', async () => {
      const { waitForService } = require('../../helpers/docker');
      const ready = await waitForService(`${COMPANION_URL}/api/health`, 120000);
      expect(ready).toBe(true);
    }, 150000);
  });
  
});
