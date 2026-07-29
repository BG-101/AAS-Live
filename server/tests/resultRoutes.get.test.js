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
    wcaId: `ResGet${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3"],
    rounds: [],
    ...overrides,
  });

const makeCompetitor = (compId, competitorNumber, name, extra = {}) =>
  Competitor.create({
    competitorNumber,
    name,
    competition: compId,
    events: ["3x3"],
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

describe("GET /api/results/:compId/:event/:round", () => {
  test("acceso público sin cookie -> 200", async () => {
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
    const res = await request(app).get(`/api/results/${comp._id}/3x3/1`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("devuelve resultados ordenados WCA y con 'advances' calculado", async () => {
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
    const [a, b] = await Promise.all([
      makeCompetitor(comp._id, 1, "Lento"),
      makeCompetitor(comp._id, 2, "Rapido"),
    ]);
    await Promise.all([
      makeResult(comp._id, a._id, "3x3", 1, 1500, 1550),
      makeResult(comp._id, b._id, "3x3", 1, 900, 950),
    ]);

    const res = await request(app).get(`/api/results/${comp._id}/3x3/1`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].competitor.name).toBe("Rapido");
    expect(res.body[0].advances).toBe(true); // Top 1 de advancementValue:1
    expect(res.body[1].advances).toBe(false);
  });

  test("excluye resultados de competidores borrados (soft delete)", async () => {
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
    const deleted = await makeCompetitor(comp._id, 1, "Borrado", {
      isDeleted: true,
    });
    await makeResult(comp._id, deleted._id, "3x3", 1, 900, 950);

    const res = await request(app).get(`/api/results/${comp._id}/3x3/1`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("ronda sin configuración en la competición -> 200 con advances=false para todos", async () => {
    const comp = await makeCompetition({ rounds: [] });
    const a = await makeCompetitor(comp._id, 1, "Sola");
    await makeResult(comp._id, a._id, "3x3", 1, 900, 950);

    const res = await request(app).get(`/api/results/${comp._id}/3x3/1`);
    expect(res.status).toBe(200);
    expect(res.body[0].advances).toBe(false);
  });

  test("compId válido pero inexistente -> 404", async () => {
    const res = await request(app).get(
      "/api/results/507f1f77bcf86cd799439011/3x3/1",
    );
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Competición no encontrada.");
  });

  test("compId con formato inválido -> 400", async () => {
    const res = await request(app).get("/api/results/no-es-un-id/3x3/1");
    expect(res.status).toBe(400);
  });
});
