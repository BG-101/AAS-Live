// ============================================================
// PRUEBAS: authRoutes.ratelimit.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const createApp = require("../app");

let app;

beforeAll(async () => {
  process.env.DISABLE_RATE_LIMIT = "false"; // Fuerza el valor: no confiar en que ninguna suite anterior lo haya dejado en "true" bajo --runInBand
  await connect();
});
beforeEach(() => {
  app = createApp();
  app.set("socketio", { emit: jest.fn() });
});
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Rate limiting en /api/auth/login", () => {
  test("permite hasta 10 intentos y bloquea el 11º con 429", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "x", password: "y" });
      expect(res.status).toBe(400); // Credenciales incorrectas, pero no bloqueado aún
    }

    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ username: "x", password: "y" });
    expect(blocked.status).toBe(429);
  }, 15000);
});
