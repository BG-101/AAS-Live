// ============================================================
// PRUEBAS: authRoutes.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const request = require("supertest");
const bcrypt = require("bcryptjs");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const createApp = require("../app");
const User = require("../models/User");

let app;

beforeAll(async () => {
  process.env.DISABLE_RATE_LIMIT = "true";
  await connect();
});
beforeEach(() => {
  app = createApp();
  app.set("socketio", { emit: jest.fn() });
});
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

const createUser = async (username, password, role = "Delegado") => {
  const hashed = await bcrypt.hash(password, 10);
  return User.create({ username, password: hashed, role });
};

describe("POST /api/auth/login", () => {
  test("credenciales correctas -> 200, cookie httpOnly y datos de usuario", async () => {
    await createUser("marco", "supersecreta123", "SuperAdmin");

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "marco", password: "supersecreta123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: "SuperAdmin", username: "marco" });
    expect(res.headers["set-cookie"][0]).toMatch(/jwtToken=/);
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
  });

  test("usuario inexistente -> 400 con mensaje genérico", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "nadie", password: "loquesea123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Usuario o contraseña incorrectos.");
  });

  test("contraseña incorrecta -> mismo mensaje genérico (no filtra cuál falló)", async () => {
    await createUser("marco", "supersecreta123");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "marco", password: "incorrecta" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Usuario o contraseña incorrectos.");
  });

  test("payload de inyección NoSQL (objeto en vez de string) -> 400, no 500", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test("username/password vacíos tras trim -> 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "   ", password: "" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  test("sin cookie -> 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("con cookie válida -> 200 con payload del token", async () => {
    await createUser("delegado1", "clavesegura1", "Delegado");
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "delegado1", password: "clavesegura1" });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", loginRes.headers["set-cookie"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: "Delegado", username: "delegado1" });
  });

  test("token manipulado/corrupto -> 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["jwtToken=token.invalido.aqui"]);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  test("limpia la cookie jwtToken", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toMatch(/jwtToken=;/);
  });
});

describe("POST /api/auth/register", () => {
  test("sin sesión -> 401", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "nuevo", password: "password123", role: "Delegado" });
    expect(res.status).toBe(401);
  });

  test("sesión Delegado (no SuperAdmin) -> 403", async () => {
    await createUser("delegado2", "clavesegura1", "Delegado");
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "delegado2", password: "clavesegura1" });

    const res = await request(app)
      .post("/api/auth/register")
      .set("Cookie", loginRes.headers["set-cookie"])
      .send({ username: "otro", password: "password123", role: "Delegado" });
    expect(res.status).toBe(403);
  });

  test("SuperAdmin crea usuario -> 201 y queda hasheado en BD", async () => {
    await createUser("admin1", "adminpass1", "SuperAdmin");
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin1", password: "adminpass1" });

    const res = await request(app)
      .post("/api/auth/register")
      .set("Cookie", loginRes.headers["set-cookie"])
      .send({
        username: "nuevoDelegado",
        password: "password123",
        role: "Delegado",
      });
    expect(res.status).toBe(201);

    const created = await User.findOne({ username: "nuevoDelegado" });
    expect(created.role).toBe("Delegado");
    expect(created.password).not.toBe("password123"); // debe estar hasheado
  });

  test("username duplicado -> 400", async () => {
    await createUser("admin2", "adminpass1", "SuperAdmin");
    await createUser("existente", "password123", "Delegado");
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin2", password: "adminpass1" });

    const res = await request(app)
      .post("/api/auth/register")
      .set("Cookie", loginRes.headers["set-cookie"])
      .send({
        username: "existente",
        password: "password123",
        role: "Delegado",
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("El usuario ya existe.");
  });

  test("password < 8 caracteres -> 400", async () => {
    await createUser("admin3", "adminpass1", "SuperAdmin");
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin3", password: "adminpass1" });

    const res = await request(app)
      .post("/api/auth/register")
      .set("Cookie", loginRes.headers["set-cookie"])
      .send({ username: "corto", password: "123", role: "Delegado" });
    expect(res.status).toBe(400);
  });

  test("rol fuera de enum -> 400", async () => {
    await createUser("admin4", "adminpass1", "SuperAdmin");
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin4", password: "adminpass1" });

    const res = await request(app)
      .post("/api/auth/register")
      .set("Cookie", loginRes.headers["set-cookie"])
      .send({ username: "roto", password: "password123", role: "Hacker" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/setup", () => {
  const ORIGINAL_ALLOW_SETUP = process.env.ALLOW_SETUP;
  const ORIGINAL_BOOTSTRAP_TOKEN = process.env.SETUP_BOOTSTRAP_TOKEN;
  const ORIGINAL_DEFAULT_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;
  const ORIGINAL_DEFAULT_USERNAME = process.env.DEFAULT_ADMIN_USERNAME;
  const VALID_TOKEN = ORIGINAL_BOOTSTRAP_TOKEN;

  // process.env.KEY = undefined deja la string "undefined"; hay que borrar la key
  // si el valor original no existía, para no filtrar config falsa a otros tests.
  const restoreEnv = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    restoreEnv("ALLOW_SETUP", ORIGINAL_ALLOW_SETUP);
    restoreEnv("SETUP_BOOTSTRAP_TOKEN", ORIGINAL_BOOTSTRAP_TOKEN);
    restoreEnv("DEFAULT_ADMIN_PASSWORD", ORIGINAL_DEFAULT_PASSWORD);
    restoreEnv("DEFAULT_ADMIN_USERNAME", ORIGINAL_DEFAULT_USERNAME);
  });

  test("ALLOW_SETUP != 'true' -> 403", async () => {
    process.env.ALLOW_SETUP = "false";
    const res = await request(app).post("/api/auth/setup");
    expect(res.status).toBe(403);
  });

  test("SETUP_BOOTSTRAP_TOKEN no configurado -> 500", async () => {
    process.env.ALLOW_SETUP = "true";
    delete process.env.SETUP_BOOTSTRAP_TOKEN;
    const res = await request(app).post("/api/auth/setup");
    expect(res.status).toBe(500);
  });

  test("token de setup incorrecto -> 401", async () => {
    process.env.ALLOW_SETUP = "true";
    const res = await request(app)
      .post("/api/auth/setup")
      .set("X-Setup-Token", "token-incorrecto-que-no-coincide");
    expect(res.status).toBe(401);
  });

  test("DEFAULT_ADMIN_PASSWORD = 'admin123' -> 500", async () => {
    process.env.ALLOW_SETUP = "true";
    process.env.DEFAULT_ADMIN_PASSWORD = "admin123";
    const res = request(app)
      .post("/api/auth/setup")
      .set("X-Setup-Token", VALID_TOKEN);
    expect(res.status).toBe(500);
  });

  test("DEFAULT_ADMIN_PASSWORD corta genérica (< 12 chars) -> 500", async () => {
    process.env.ALLOW_SETUP = "true";
    process.env.DEFAULT_ADMIN_PASSWORD = "shorpass";
    const res = await request(app)
      .post("/api/auth/setup")
      .set("X-Setup-Token", VALID_TOKEN);
    expect(res.status).toBe(500);
  });

  test("ALLOW_SETUP=true, token válido y sin SuperAdmin previo -> crea admin, no expone password", async () => {
    process.env.ALLOW_SETUP = "true";
    process.env.DEFAULT_ADMIN_USERNAME = "admin"; // Fijado explícitamente, no asumido
    const res = await request(app)
      .post("/api/auth/setup")
      .set("X-Setup-Token", VALID_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.message).not.toMatch(/TestStrongPass1234/);

    const admin = await User.findOne({ username: "admin" });
    expect(admin.role).toBe("SuperAdmin");
  });

  test("ALLOW_SETUP=true, token válido pero ya existe SuperAdmin -> 400", async () => {
    process.env.ALLOW_SETUP = "true";
    await createUser("yaExiste", "password123", "SuperAdmin");
    const res = await request(app)
      .post("/api/auth/setup")
      .set("X-Setup-Token", VALID_TOKEN);
    expect(res.status).toBe(400);
  });
});
