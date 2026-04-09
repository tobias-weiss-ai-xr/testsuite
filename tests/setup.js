/**
 * Jest Global Setup
 * 
 * Loads environment variables from .env.test and exports shared configuration.
 * This file runs before each test file.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load test environment
const envPath = path.resolve(__dirname, '../.env.test');
dotenv.config({ path: envPath });

// Shared configuration object
const config = {
  // Service URLs
  documentServerUrl: process.env.DOCUMENT_SERVER_URL || 'http://localhost:8080',
  ocisUrl: process.env.OCIS_URL || 'http://localhost:9200',
  companionUrl: process.env.COMPANION_URL || 'http://localhost:3000',
  
  // Internal URLs (for container-to-container communication)
  documentServerInternalUrl: process.env.DOCUMENT_SERVER_INTERNAL_URL || 'http://documentserver:80',
  ocisInternalUrl: process.env.OCIS_INTERNAL_URL || 'http://ocis:9200',
  companionInternalUrl: process.env.COMPANION_INTERNAL_URL || 'http://companion:3000',
  
  // JWT Secrets
  ocisJwtSecret: process.env.OCIS_JWT_SECRET || 'test_ocis_jwt_secret_placeholder',
  documentServerJwtSecret: process.env.DOCUMENT_SERVER_JWT_SECRET || 'test_ds_jwt_secret_placeholder',
  
  // Timeouts (in milliseconds)
  healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 120000,
  globalTimeout: parseInt(process.env.GLOBAL_TIMEOUT) || 600000,
  healthCheckRetries: parseInt(process.env.HEALTH_CHECK_RETRIES) || 30,
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 10000,
  
  // Test credentials
  testUser: process.env.TEST_USER || 'admin',
  testPassword: process.env.TEST_PASSWORD || 'admin',
  
  // Docker
  dockerComposeFile: process.env.DOCKER_COMPOSE_FILE || 'docker-compose.test.yml'
};

// Make config globally available
global.testConfig = config;

// Export for direct imports
module.exports = config;
