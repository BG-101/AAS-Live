// ============================================================
// PRUEBAS: resultRoutes.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const { createUser, loginAs } = require("./helpers");
const createApp = require("../app");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const Result = require("../models/Result");
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

const makeCompetitionWithRound = async (roundOverrides = {}) =>
  Competition.create({
    wcaId: `TestComp${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: new Date(),
    endDate: new Date(),
    location: "Test",
    events: ["3x3"],
    rounds: [
      {
        event: "3x3",
        roundNumber: 1,
        format: "a",
        status: "In Progress",
        ...roundOverrides,
      },
    ],
  });

const makeCompetitor = async (compId, events = ["3x3"]) =>
  Competitor.create({
    competitorNumber: 1,
    name: "Ana",
    competition: compId,
    events,
  });

describe("POST /api/results - autenticación", () => {
  test("sin cookie -> 401", async () => {
    const res = await request(app).post("/api/results").send({});
    expect(res.status).toBe(401);
  });

  test("rol Espectador -> 403", async () => {
    await createUser("proyector1", "clave12345", "Espectador");
    const cookie = await loginAs(app, "proyector1", "clave12345");
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/results - validaciones", () => {
  let cookie, comp, competitor;

  beforeEach(async () => {
    await createUser("delegado1", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado1", "clave12345");
    comp = await makeCompetitionWithRound();
    competitor = await makeCompetitor(comp._id);
  });

  test("times no es array -> 400", async () => {
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: "no-array",
      });
    expect(res.status).toBe(400);
  });

  test("valor de tiempo < -2 -> 400", async () => {
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: [1000, -5, 1100, 1200, 1300],
      });
    expect(res.status).toBe(400);
  });

  test("ObjectId inválido -> 400", async () => {
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: "no-es-un-id",
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100, 1200, 1300, 1400],
      });
    expect(res.status).toBe(400);
  });

  test("competición inexistente -> 404", async () => {
    const fakeId = "64b000000000000000000000";
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: fakeId,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100, 1200, 1300, 1400],
      });
    expect(res.status).toBe(404);
  });

  test("competidor no pertenece a la competición -> 404", async () => {
    const otherComp = await makeCompetitionWithRound();
    const foreignCompetitor = await makeCompetitor(otherComp._id);
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: foreignCompetitor._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100, 1200, 1300, 1400],
      });
    expect(res.status).toBe(404);
  });

  test("competidor no inscrito en el evento -> 400", async () => {
    const notRegistered = await Competitor.create({
      competitorNumber: 2,
      name: "Bea",
      competition: comp._id,
      events: ["2x2"],
    });
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: notRegistered._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100, 1200, 1300, 1400],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no está inscrito/);
  });

  test("ronda inexistente -> 404", async () => {
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 99,
        times: [1000, 1100, 1200, 1300, 1400],
      });
    expect(res.status).toBe(404);
  });

  test("longitud de times incorrecta para el formato Ao5 -> 400", async () => {
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100, 1200],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Ao5 requiere exactamente 5/);
  });

  test("longitud de times incorrecta para el formato Mo3 -> 400", async () => {
    const mo3Comp = await makeCompetitionWithRound({ format: "m" });
    const mo3Competitor = await makeCompetitor(mo3Comp._id);
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: mo3Comp._id,
        competitorId: mo3Competitor._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Mo3 requiere exactamente 3/);
  });

  test("invalida SOR aunque falle el payload del socket", async () => {
    const { invalidateSORCache } = require("../utils/wcaLogic");
    const invalidateSpy = jest.spyOn(
      require("../utils/wcaLogic"),
      "invalidateSORCache",
    );

    // La 1ª llamada a Competition.findById la consume editWindowGuard
    // (resuelve la competición para comprobar la ventana de edición).
    // Solo la 2ª (compForSocket, dentro del bloque de payload de socket)
    // debe fallar, para forzar el catch sin romper el resto del flujo.
    const originalFindById = Competition.findById.bind(Competition);
    let callCount = 0;
    const findByIdSpy = jest
      .spyOn(Competition, "findById")
      .mockImplementation((...args) => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error("boom"));
        return originalFindById(...args);
      });

    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100, 1200, 1300, 1400],
      });

    expect(res.status).toBe(200); // La respuesta HTTP no depende del bloque de socket
    expect(invalidateSpy).toHaveBeenCalledWith(comp._id.toString());
    findByIdSpy.mockRestore();
    invalidateSpy.mockRestore();
  });
});

describe("POST /api/results - guardado correcto", () => {
  let cookie, comp, competitor;

  beforeEach(async () => {
    await createUser("delegado2", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado2", "clave12345");
    comp = await makeCompetitionWithRound();
    competitor = await makeCompetitor(comp._id);
  });

  test("primer guardado: calcula best/average correctamente y crea AuditLog NUEVO", async () => {
    const times = [1200, 1100, 1300, 1000, 1400];
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times,
      });

    expect(res.status).toBe(200);
    expect(res.body.best).toBe(1000);
    expect(res.body.average).toBe(1200);

    const logs = await AuditLog.find({ competition: comp._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("NUEVO");
    expect(logs[0].oldTimes).toEqual([]);
    expect(logs[0].newTimes).toEqual(times);
    expect(logs[0].user).toBe("delegado2");
  });

  test("segundo guardado sobre el mismo competidor/ronda: actualiza (no duplica) y AuditLog MODIFICADO", async () => {
    const firstTimes = [1200, 1100, 1300, 1000, 1400];
    const secondTimes = [900, 950, 1000, 1050, 1100];

    await request(app).post("/api/results").set("Cookie", cookie).send({
      competitionId: comp._id,
      competitorId: competitor._id,
      event: "3x3",
      round: 1,
      times: firstTimes,
    });

    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: secondTimes,
      });

    expect(res.status).toBe(200);

    const allResults = await Result.find({
      competitor: competitor._id,
      event: "3x3",
      round: 1,
    });
    expect(allResults).toHaveLength(1); // No duplica, actualiza
    expect(allResults[0].times).toEqual(secondTimes);

    const logs = await AuditLog.find({ competition: comp._id }).sort({
      timestamp: 1,
    });
    expect(logs).toHaveLength(2);
    expect(logs[1].action).toBe("MODIFICADO");
    expect(logs[1].oldTimes).toEqual(firstTimes);
    expect(logs[1].newTimes).toEqual(secondTimes);
  });

  test("emite 'resultado_actualizado' por socket con el payload procesado", async () => {
    await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: [1200, 1100, 1300, 1000, 1400],
      });

    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "resultado_actualizado",
      expect.objectContaining({
        competitionId: comp._id.toString(),
        event: "3x3",
        round: 1,
        results: expect.any(Array),
      }),
    );
  });

  test("Bo3: average siempre 0, solo importa best", async () => {
    const bo3Comp = await makeCompetitionWithRound({ format: "b" });
    const bo3Competitor = await makeCompetitor(bo3Comp._id);
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: bo3Comp._id,
        competitorId: bo3Competitor._id,
        event: "3x3",
        round: 1,
        times: [1500, -1, 1200],
      });

    expect(res.status).toBe(200);
    expect(res.body.best).toBe(1200);
    expect(res.body.average).toBe(0);
  });

  test("ronda Finished rechaza nuevos tiempos", async () => {
    const comp = await makeCompetitionWithRound({ status: "Finished" });
    const competitor = await makeCompetitor(comp._id);
    const res = await request(app)
      .post("/api/results")
      .set("Cookie", cookie)
      .send({
        competitionId: comp._id,
        competitorId: competitor._id,
        event: "3x3",
        round: 1,
        times: [1000, 1100, 1200, 1300, 1400],
      });
    expect(res.status).toBe(403);
  });
});
