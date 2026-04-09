/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  
  // Docker startup is slow - allow 5 minutes per test
  testTimeout: 300000,
  
  // Global setup for environment loading
  setupFilesAfterEnv: ['./tests/setup.js'],
  
  // Test file patterns
  testMatch: ['**/tests/**/*.test.js'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'tests/**/*.js',
    '!tests/setup.js'
  ],
  coverageDirectory: 'coverage',
  
  // Verbose output for debugging
  verbose: true,
  
  // Force exit after tests complete (Docker connections may keep process alive)
  forceExit: true,
  
  // Detect open handles that prevent exit
  detectOpenHandles: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Module path aliases
  moduleNameMapper: {
    '^@helpers/(.*)$': '<rootDir>/tests/helpers/$1'
  }
};
