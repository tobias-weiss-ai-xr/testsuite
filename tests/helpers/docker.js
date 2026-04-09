/**
 * Docker Helper Utilities for E2E Tests
 * 
 * Provides utility functions for:
 * - Waiting for services to become healthy
 * - Checking container health status
 * - Running Docker Compose commands
 */

const axios = require('axios');
const Docker = require('dockerode');

// Initialize Docker client
const docker = new Docker();

/**
 * Wait for a service to respond with HTTP 200
 * 
 * @param {string} url - URL to poll
 * @param {number} timeout - Maximum wait time in ms (default: 2 minutes)
 * @param {number} interval - Polling interval in ms (default: 5 seconds)
 * @returns {Promise<boolean>} - true if service is healthy, false if timeout
 */
async function waitForService(url, timeout = 120000, interval = 5000) {
  const startTime = Date.now();
  const timeoutTime = startTime + timeout;
  
  console.log(`Waiting for service: ${url}`);
  
  while (Date.now() < timeoutTime) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });
      
      if (response.status === 200) {
        const elapsed = Date.now() - startTime;
        console.log(`✓ Service ready: ${url} (${elapsed}ms)`);
        return true;
      }
    } catch (error) {
      // Service not ready yet, continue polling
    }
    
    // Wait before next poll
    await sleep(interval);
  }
  
  console.error(`✗ Service timeout: ${url}`);
  return false;
}

/**
 * Get health status of a Docker container
 * 
 * @param {string} containerName - Name of the container
 * @returns {Promise<object>} - Container health info
 */
async function getContainerHealth(containerName) {
  try {
    const container = docker.getContainer(containerName);
    const inspect = await container.inspect();
    
    return {
      name: containerName,
      running: inspect.State.Running,
      status: inspect.State.Status,
      health: inspect.State.Health?.Status || 'unknown',
      healthChecks: inspect.State.Health?.Log || []
    };
  } catch (error) {
    return {
      name: containerName,
      error: error.message,
      running: false,
      status: 'not_found'
    };
  }
}

/**
 * Check if a container is running and healthy
 * 
 * @param {string} containerName - Name of the container
 * @returns {Promise<boolean>}
 */
async function isContainerHealthy(containerName) {
  const health = await getContainerHealth(containerName);
  return health.running && health.health === 'healthy';
}

/**
 * Run a Docker Compose command
 * 
 * @param {string} command - Command to run (e.g., 'up -d', 'down')
 * @param {string} composeFile - Path to docker-compose file
 * @returns {Promise<object>} - Command result
 */
async function runDockerCompose(command, composeFile = 'docker-compose.test.yml') {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  const fullCommand = `docker compose -f ${composeFile} ${command}`;
  
  console.log(`Running: ${fullCommand}`);
  
  try {
    const { stdout, stderr } = await execPromise(fullCommand);
    return {
      success: true,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
}

/**
 * Check if all services in the test stack are ready
 * 
 * @param {string[]} serviceNames - Array of service names to check
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<object>} - Status of all services
 */
async function waitForAllServices(serviceNames, timeout = 300000) {
  const startTime = Date.now();
  const timeoutTime = startTime + timeout;
  const status = {};
  
  // Initialize status
  for (const name of serviceNames) {
    status[name] = { ready: false, container: null };
  }
  
  console.log(`Waiting for all services: ${serviceNames.join(', ')}`);
  
  while (Date.now() < timeoutTime) {
    let allReady = true;
    
    for (const name of serviceNames) {
      if (!status[name].ready) {
        const health = await getContainerHealth(`test-${name}`);
        status[name].container = health;
        
        if (health.running && health.health === 'healthy') {
          status[name].ready = true;
          console.log(`✓ ${name} is healthy`);
        } else {
          allReady = false;
        }
      }
    }
    
    if (allReady) {
      console.log('✓ All services are ready');
      return { success: true, status, elapsed: Date.now() - startTime };
    }
    
    await sleep(5000);
  }
  
  console.error('✗ Timeout waiting for services');
  return { success: false, status, elapsed: Date.now() - startTime };
}

/**
 * Helper: Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  waitForService,
  getContainerHealth,
  isContainerHealthy,
  runDockerCompose,
  waitForAllServices,
  sleep
};
