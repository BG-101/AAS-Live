// ============================================================
// PRUEBAS: competitorRoutes.eligible.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const createApp = require("../app");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const Result = require("../models/Result");

let app;

beforeAll(async () => await connect());
beforeEach(() => {
  app = createApp();
  app.set("socketio", { emit: jest.fn() });
});
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

const makeCompetition = (overrides = {}) =>
  Competition.create({
    wcaId: `Elig${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3", "2x2"],
    rounds: [],
    ...overrides,
  });

const makeCompetitor = (
  compId,
  competitorNumber,
  name,
  events = ["3x3"],
  extra = {},
) =>
  Competitor.create({
    competitorNumber,
    name,
    competition: compId,
    events,
    ...extra,
  });

const makeResult = (compId, competitorId, event, round, best, average) =>
  Result.create({
    competition: compId,
    competitor: competitorId,
    event,
    round,
    times: [best],
    best,
    average,
  });

describe("GET /api/competitors/:compId/eligible/:event/:round - Ronda 1", () => {
  test("devuelve todos los inscritos en el evento, ignora otros eventos", async () => {
    const comp = await makeCompetition();
    await Promise.all([
      makeCompetitor(comp._id, 1, "En3x3", ["3x3"]),
      makeCompetitor(comp._id, 2, "En2x2", ["2x2"]),
    ]);

    const res = await request(app).get(
      `/api/competitors/${comp._id}/eligible/3x3/1`,
    );
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.name)).toEqual(["En3x3"]);
  });

  test("excluye competidores borrados", async () => {
    const comp = await makeCompetition();
    await makeCompetitor(comp._id, 1, "Borrado", ["3x3"], { isDeleted: true });

    const res = await request(app).get(
      `/api/competitors/${comp._id}/eligible/3x3/1`,
    );
    expect(res.body).toEqual([]);
  });

  test("clasifica correctamente por grupo de edad cuando birthDate solo está en BD (select:false)", async () => {
    const comp = await Competition.create({
      wcaId: `AgeSelect${Date.now()}`,
      name: "Test",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      location: "Test",
      events: ["3x3"],
      ageGroupsEnabled: true,
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          format: "a",
          status: "Finished",
          advancementType: "ranking",
          advancementValue: 1,
        },
      ],
    });
    const peque = await Competitor.create({
      competitorNumber: 1,
      name: "Peque",
      competition: comp._id,
      events: ["3x3"],
      birthDate: "2018-01-01",
    });
    await Result.create({
      competition: comp._id,
      competitor: peque._id,
      event: "3x3",
      round: 1,
      times: [900],
      best: 900,
      average: 950,
    });

    const res = await request(app).get(`/api/results/${comp._id}/3x3/1`);
    expect(res.body[0].competitor.age).toBe(8); // Resuelto, no birthDate crudo
    expect(res.body[0].competitor.birthDate).toBeUndefined();
  });
});

describe("GET /api/competitors/:compId/eligible/:event/:round - Ronda > 1", () => {
  test("ronda anterior no existe -> array vacío", async () => {
    const comp = await makeCompetition();
    await makeCompetitor(comp._id, 1, "A", ["3x3"]);

    const res = await request(app).get(
      `/api/competitors/${comp._id}/eligible/3x3/2`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("ronda anterior existe pero no está Finished -> array vacío", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          advancementType: "ranking",
          advancementValue: 1,
          format: "a",
          status: "In Progress",
        },
      ],
    });
    const a = await makeCompetitor(comp._id, 1, "A", ["3x3"]);
    await makeResult(comp._id, a._id, "3x3", 1, 900, 950);

    const res = await request(app).get(
      `/api/competitors/${comp._id}/eligible/3x3/2`,
    );
    expect(res.body).toEqual([]);
  });

  test("ronda anterior Finished -> solo devuelve quienes avanzaron", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          advancementType: "ranking",
          advancementValue: 1,
          format: "a",
          status: "Finished",
        },
      ],
    });
    const [a, b] = await Promise.all([
      makeCompetitor(comp._id, 1, "Rapido", ["3x3"]),
      makeCompetitor(comp._id, 2, "Lento", ["3x3"]),
    ]);
    await Promise.all([
      makeResult(comp._id, a._id, "3x3", 1, 900, 950),
      makeResult(comp._id, b._id, "3x3", 1, 1500, 1550),
    ]);

    const res = await request(app).get(
      `/api/competitors/${comp._id}/eligible/3x3/2`,
    );
    expect(res.body.map((c) => c.name)).toEqual(["Rapido"]);
  });

  test("competidor que avanzó pero fue borrado después ya no aparece como elegible", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          advancementType: "ranking",
          advancementValue: 2,
          format: "a",
          status: "Finished",
        },
      ],
    });
    const a = await makeCompetitor(comp._id, 1, "Avanzo", ["3x3"]);
    await makeResult(comp._id, a._id, "3x3", 1, 900, 950);
    await Competitor.findByIdAndUpdate(a._id, { isDeleted: true });

    const res = await request(app).get(
      `/api/competitors/${comp._id}/eligible/3x3/2`,
    );
    expect(res.body).toEqual([]);
  });

  test("compId con formato inválido -> 400", async () => {
    const res = await request(app).get(
      "/api/competitors/no-es-un-id/eligible/3x3/1",
    );
    expect(res.status).toBe(400);
  });
});
