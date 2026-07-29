const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const { createUser, loginAs } = require("./helpers");
const createApp = require("../app");
const Competition = require("../models/Competition");
const AuditLog = require("../models/AuditLog");

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

const makeCompetition = () =>
  Competition.create({
    wcaId: `Audit${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3"],
    rounds: [],
  });

describe("GET /api/audit/:compId", () => {
  test("sin cookie -> 401", async () => {
    const comp = await makeCompetition();
    const res = await request(app).get(`/api/audit/${comp._id}`);
    expect(res.status).toBe(401);
  });

  test("rol Espectador -> 403", async () => {
    await createUser("espectador1", "clave12345", "Espectador");
    const cookie = await loginAs(app, "espectador1", "clave12345");
    const comp = await makeCompetition();
    const res = await request(app)
      .get(`/api/audit/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  test("Delegado: devuelve logs ordenados del más reciente al más antiguo", async () => {
    await createUser("delegado1", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado1", "clave12345");
    const comp = await makeCompetition();

    await AuditLog.create({
      competition: comp._id,
      competitorName: "Ana",
      event: "3x3",
      round: 1,
      action: "NUEVO",
      oldTimes: [],
      newTimes: [900],
      user: "x",
      timestamp: new Date("2026-06-01T10:00:00Z"),
    });
    await AuditLog.create({
      competition: comp._id,
      competitorName: "Bea",
      event: "3x3",
      round: 1,
      action: "NUEVO",
      oldTimes: [],
      newTimes: [800],
      user: "x",
      timestamp: new Date("2026-06-01T12:00:00Z"),
    });

    const res = await request(app)
      .get(`/api/audit/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].competitorName).toBe("Bea"); // Más reciente primero
  });

  test("competición sin logs -> array vacío", async () => {
    await createUser("delegado2", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado2", "clave12345");
    const comp = await makeCompetition();

    const res = await request(app)
      .get(`/api/audit/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
