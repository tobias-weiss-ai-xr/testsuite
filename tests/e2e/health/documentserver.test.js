/**
 * Document Server Health Tests
 * 
 * Tests that verify Document Server is running and healthy.
 */

const { describe, test, expect, beforeAll } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const DS_URL = config.documentServerUrl;

describe('Document Server Health', () => {
  
  describe('Container Status', () => {
    test('container is running', async () => {
      const { isContainerHealthy } = require('../../helpers/docker');
      const healthy = await isContainerHealthy('test-documentserver');
      expect(healthy).toBe(true);
    }, 30000);
  });
  
  describe('HTTP Endpoints', () => {
    test('GET /hosting/discovery returns 200', async () => {
      const response = await axios.get(`${DS_URL}/hosting/discovery`);
      expect(response.status).toBe(200);
    }, 10000);
    
    test('GET /hosting/discovery returns XML', async () => {
      const response = await axios.get(`${DS_URL}/hosting/discovery`);
      expect(response.headers['content-type']).toMatch(/xml/);
    }, 10000);
    
    test('GET /hosting/discovery returns valid WOPI XML', async () => {
      const response = await axios.get(`${DS_URL}/hosting/discovery`);
      expect(response.data).toContain('<wopi-discovery>');
    }, 10000);
    
    test('GET /healthcheck returns 200', async () => {
      const response = await axios.get(`${DS_URL}/healthcheck`);
      expect(response.status).toBe(200);
    }, 10000);
  });
  
  describe('Startup Time', () => {
    test('responds within 5 minutes of stack start', async () => {
      // This test assumes the stack was just started
      const { waitForService } = require('../../helpers/docker');
      const ready = await waitForService(`${DS_URL}/hosting/discovery`, 300000);
      expect(ready).toBe(true);
    }, 330000);
  });
  
});
