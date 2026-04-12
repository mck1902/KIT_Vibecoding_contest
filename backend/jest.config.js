module.exports = {
  testEnvironment: 'node',
  setupFilesAfterSetup: ['./src/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
};
