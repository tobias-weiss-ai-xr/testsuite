/**
 * OCIS Health Tests
 * 
 * Tests that verify OCIS (ownCloud Infinite Scale) is running and healthy.
 */

const { describe, test, expect } = require('@jest/globals');
const axios = require('axios');
const config = require('../../setup');

const OCIS_URL = config.ocisUrl;

describe('OCIS Health', () => {
  
  describe('Container Status', () => {
    test('container is running', async () => {
      const { isContainerHealthy } = require('../../helpers/docker');
      const healthy = await isContainerHealthy('test-ocis');
      expect(healthy).toBe(true);
    }, 30000);
  });
  
  describe('HTTP Endpoints', () => {
    test('GET /health returns 200', async () => {
      const response = await axios.get(`${OCIS_URL}/health`);
      expect(response.status).toBe(200);
    }, 10000);
    
    test('GET /health returns JSON with status', async () => {
      const response = await axios.get(`${OCIS_URL}/health`);
      expect(response.data).toHaveProperty('status');
    }, 10000);
    
    test('GET /.well-known/openid-configuration returns 200', async () => {
      const response = await axios.get(`${OCIS_URL}/.well-known/openid-configuration`);
      expect(response.status).toBe(200);
    }, 10000);
    
    test('OIDC discovery returns valid JSON', async () => {
      const response = await axios.get(`${OCIS_URL}/.well-known/openid-configuration`);
      expect(response.data).toHaveProperty('issuer');
      expect(response.data).toHaveProperty('authorization_endpoint');
      expect(response.data).toHaveProperty('token_endpoint');
    }, 10000);
  });
  
  describe('Startup Time', () => {
    test('responds within 5 minutes of stack start', async () => {
      const { waitForService } = require('../../helpers/docker');
      const ready = await waitForService(`${OCIS_URL}/health`, 300000);
      expect(ready).toBe(true);
    }, 330000);
  });
  
});
