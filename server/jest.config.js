// ============================================================
// M?DULO: jest.config
// Agrupa la l?gica principal de este archivo.
// ============================================================

module.exports = {
  testEnvironment: "node",
  testTimeout: 40000, // Replica sets tardan más bajo carga secuencial en CI
  maxWorkers: 1, // redundante con --runInBand per blindado si alguien lo lanza sin el flag
  setupFiles: ["<rootDir>/tests/env.js"],
};
