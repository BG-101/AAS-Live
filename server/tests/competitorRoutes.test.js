// ============================================================
// PRUEBAS: competitorRoutes.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const { createUser, loginAs } = require("./helpers");
const createApp = require("../app");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");

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

const makeCompetition = (overrides = {}) =>
  Competition.create({
    wcaId: `Comp${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3"],
    competitorLimit: 50,
    rounds: [
      { event: "3x3", roundNumber: 1, format: "a", status: "In Progress" },
    ],
    ...overrides,
  });

describe("GET /api/competitors/:compId - respuestas públicas", () => {
  test("no expone birthDate en la lista pública", async () => {
    const comp = await makeCompetition();
    await Competitor.create({
      competitorNumber: 1,
      name: "Ana",
      competition: comp._id,
      events: ["3x3"],
      birthDate: "2010-01-01",
    });

    const res = await request(app).get(`/api/competitors/${comp._id}`);
    expect(res.status).toBe(200);
    expect(res.body[0].birthDate).toBeUndefined();
  });
});

describe("POST /api/competitors - autenticación", () => {
  test("sin cookie -> 401", async () => {
    const res = await request(app).post("/api/competitors").send({});
    expect(res.status).toBe(401);
  });

  test("rol Espectador -> 403", async () => {
    await createUser("espectador1", "clave12345", "Espectador");
    const cookie = await loginAs(app, "espectador1", "clave12345");
    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/competitors - validaciones", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado1", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado1", "clave12345");
  });

  test("competición inexistente -> 404", async () => {
    const fakeId = "64b000000000000000000000";
    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: fakeId, name: "Ana", events: ["3x3"] });
    expect(res.status).toBe(404);
  });

  test("si falla la asignación de número no emite socket de refresco", async () => {
    const comp = await makeCompetition();
    const existing = await Competitor.create({
      competitorNumber: 1,
      name: "Ana",
      competition: comp._id,
      events: ["3x3"],
    });

    const saveSpy = jest.spyOn(Competitor.prototype, "save").mockRejectedValue(
      Object.assign(new Error("dup"), {
        code: 11000,
        keyPattern: { competitorNumber: 1 },
      }),
    );

    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: comp._id, name: "Otra", events: ["3x3"] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Conflicto de número/);

    const socket = app.get("socketio");
    const emitted = socket.emit.mock.calls.filter(
      ([eventName]) => eventName === "competidor_actualizado",
    );
    expect(emitted).toHaveLength(0);

    saveSpy.mockRestore();
  });

  test("aforo completo -> 400", async () => {
    const comp = await makeCompetition({ competitorLimit: 1 });
    await Competitor.create({
      competitorNumber: 1,
      name: "Ya Inscrito",
      competition: comp._id,
      events: ["3x3"],
    });

    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: comp._id, name: "Nuevo", events: ["3x3"] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Aforo completo/);
  });

  test("nombre duplicado en la misma competición -> 400", async () => {
    const comp = await makeCompetition();
    await Competitor.create({
      competitorNumber: 1,
      name: "Ana",
      competition: comp._id,
      events: ["3x3"],
    });

    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: comp._id, name: "Ana", events: ["3x3"] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/competitors - creación correcta", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado2", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado2", "clave12345");
  });

  test("asigna competitorNumber secuencial empezando en 1", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: comp._id, name: "Primero", events: ["3x3"] });
    expect(res.status).toBe(201);
    expect(res.body.competitorNumber).toBe(1);
  });

  test("segundo competidor recibe el número siguiente al último existente", async () => {
    const comp = await makeCompetition();
    await Competitor.create({
      competitorNumber: 5,
      name: "Existente",
      competition: comp._id,
      events: ["3x3"],
    });

    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: comp._id, name: "Nuevo", events: ["3x3"] });
    expect(res.status).toBe(201);
    expect(res.body.competitorNumber).toBe(6);
  });

  test("emite 'competidor_actualizado' por socket", async () => {
    const comp = await makeCompetition();
    await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: comp._id, name: "Ana", events: ["3x3"] });

    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "competidor_actualizado",
      expect.objectContaining({ competitionId: comp._id.toString() }),
    );
  });
});

describe("POST /api/competitors - auto-inscripción en serie", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado3", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado3", "clave12345");
  });

  test("inscribe automáticamente en las demás competiciones de la misma serie", async () => {
    const compA = await makeCompetition({ series: "Liga Sur 2026" });
    const compB = await makeCompetition({ series: "Liga Sur 2026" });

    await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: compA._id, name: "Carlos", events: ["3x3"] });

    const mirrored = await Competitor.findOne({
      competition: compB._id,
      name: "Carlos",
    });
    expect(mirrored).not.toBeNull();
    expect(mirrored.events).toEqual(["3x3"]);
  });

  test("no duplica en destino si ya existe un competidor activo con ese nombre", async () => {
    const compA = await makeCompetition({ series: "Liga Sur 2026" });
    const compB = await makeCompetition({ series: "Liga Sur 2026" });
    await Competitor.create({
      competitorNumber: 1,
      name: "Carlos",
      competition: compB._id,
      events: ["3x3"],
    });

    await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: compA._id, name: "Carlos", events: ["3x3"] });

    const count = await Competitor.countDocuments({
      competition: compB._id,
      name: "Carlos",
    });
    expect(count).toBe(1); // No se duplicó
  });

  test("omite auto-inscripción si el destino tiene el aforo completo, pero la inscripción principal sí se completa", async () => {
    const compA = await makeCompetition({ series: "Liga Sur 2026" });
    const compB = await makeCompetition({
      series: "Liga Sur 2026",
      competitorLimit: 1,
    });
    await Competitor.create({
      competitorNumber: 1,
      name: "YaLleno",
      competition: compB._id,
      events: ["3x3"],
    });

    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: compA._id, name: "Carlos", events: ["3x3"] });

    expect(res.status).toBe(201); // La inscripción principal no se ve afectada
    const inA = await Competitor.findOne({
      competition: compA._id,
      name: "Carlos",
    });
    expect(inA).not.toBeNull();
    const inB = await Competitor.findOne({
      competition: compB._id,
      name: "Carlos",
    });
    expect(inB).toBeNull(); // Omitido silenciosamente por aforo
  });

  test("competición sin serie no afecta a otras competiciones", async () => {
    const compA = await makeCompetition({ series: "" });
    const compB = await makeCompetition({ series: "" });

    await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: compA._id, name: "Solitario", events: ["3x3"] });

    const inB = await Competitor.findOne({
      competition: compB._id,
      name: "Solitario",
    });
    expect(inB).toBeNull();
  });
});
