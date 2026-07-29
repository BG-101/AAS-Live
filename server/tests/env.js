// ============================================================
// PRUEBAS: env
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

process.env.JWT_SECRET = "test_secret_key_for_jest_only";
process.env.NODE_ENV = "test";
