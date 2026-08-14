// ============================================================
// PRUEBAS: env
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

process.env.JWT_SECRET = "test_secret_key_for_jest_only";
process.env.NODE_ENV = "test";
process.env.DEFAULT_ADMIN_PASSWORD = "TestStrongPass1234";
process.env.SETUP_BOOTSTRAP_TOKEN = "test_bootstrap_token_1234567890abcdef";
process.env.TZ = "America/Los_Angeles";
