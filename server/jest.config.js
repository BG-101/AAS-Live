// ============================================================
// M?DULO: jest.config
// Agrupa la l?gica principal de este archivo.
// ============================================================

module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/env.js"],
  testTimeout: 30000,
};
