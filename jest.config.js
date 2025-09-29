module.exports = {
  // Test environment
  testEnvironment: "node",
  
  // Test file patterns
  testMatch: [
    "**/rules/**/*.test.js",
    "**/tests/**/*.test.js"
  ],
  
  // Coverage collection
  collectCoverageFrom: [
    "rules/**/*.js",
    "!rules/tests/**",
    "!rules/demo_*.js",
    "!**/node_modules/**"
  ],
  
  // Coverage thresholds for quality assurance
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  
  // Coverage reporting
  coverageReporters: [
    "text",
    "lcov",
    "html"
  ],
  
  // Test timeout for async operations
  testTimeout: 10000,
  
  // Setup files (if needed for global test setup)
  setupFilesAfterEnv: [],
  
  // Verbose output for detailed test results
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Collect coverage for untested files
  collectCoverage: false // Set to true when you want coverage reports
};
