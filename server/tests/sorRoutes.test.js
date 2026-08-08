// ============================================================
// PRUEBAS: sorRoutes.test
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
    wcaId: `SorRoute${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3"],
    sorEnabled: true,
    scoringSystem: "sor",
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

describe("GET /api/sor/:compId", () => {
  test("acceso público, devuelve estructura con rankings/events/scoringSystem", async () => {
    const comp = await makeCompetition();
    await makeCompetitor(comp._id, 1, "Ana");

    const res = await request(app).get(`/api/sor/${comp._id}`);
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual(["3x3"]);
    expect(res.body.scoringSystem).toBe("sor");
    expect(res.body.rankings).toHaveLength(1);
  });

  test("filtra por ageGroup vía querystring", async () => {
    const comp = await makeCompetition({ ageGroupsEnabled: true });
    await Promise.all([
      makeCompetitor(comp._id, 1, "Peque", { birthDate: "2018-01-01" }),
      makeCompetitor(comp._id, 2, "Adulto", { birthDate: "2000-01-01" }),
    ]);

    const res = await request(app).get(`/api/sor/${comp._id}?ageGroup=alevin`);
    expect(res.status).toBe(200);
    expect(res.body.rankings).toHaveLength(1);
    expect(res.body.rankings[0].name).toBe("Peque");
  });

  test("ID con formato inválido -> 400", async () => {
    const res = await request(app).get("/api/sor/no-es-un-id");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/sor/series/:seriesName", () => {
  test("sin competiciones en la serie -> respuesta vacía", async () => {
    const res = await request(app).get("/api/sor/series/SerieInexistente");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      rankings: [],
      competitions: [],
      ageGroupsEnabled: false,
    });
  });

  test("agrega puntuaciones cruzando competiciones por wcaId y penaliza ausencias", async () => {
    const seriesName = `Liga${Date.now()}`;
    const compA = await makeCompetition({
      series: seriesName,
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });
    const compB = await makeCompetition({
      series: seriesName,
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });

    const [anaA, beaA] = await Promise.all([
      makeCompetitor(compA._id, 1, "Ana", { wcaId: "2020AAAA01" }),
      makeCompetitor(compA._id, 2, "Bea", { wcaId: "2020BBBB01" }),
    ]);
    await Promise.all([
      makeResult(compA._id, anaA._id, "3x3", 1, 900, 950), // Rank 1
      makeResult(compA._id, beaA._id, "3x3", 1, 1000, 1050), // Rank 2
    ]);

    // En compB solo se inscribe Ana (mismo wcaId) y Carlos; Ana no compite (ausente)
    const [anaB, carlosB] = await Promise.all([
      makeCompetitor(compB._id, 1, "Ana", { wcaId: "2020AAAA01" }),
      makeCompetitor(compB._id, 2, "Carlos", { wcaId: "2020CCCC01" }),
    ]);
    await makeResult(compB._id, carlosB._id, "3x3", 1, 950, 1000); // Único con tiempo -> rank 1

    const res = await request(app).get(`/api/sor/series/${seriesName}`);
    expect(res.status).toBe(200);
    expect(res.body.competitions).toHaveLength(2);

    const byName = Object.fromEntries(
      res.body.rankings.map((r) => [r.name, r]),
    );
    expect(byName["Ana"].totalScore).toBe(3); // 1(compA) + 2(ausente compB)
    expect(byName["Bea"].totalScore).toBe(4); // 2(compA) + 2(no inscrita en compB)
    expect(byName["Carlos"].totalScore).toBe(4); // 3(no inscrito en compA) + 1(compB)

    expect(res.body.rankings[0].name).toBe("Ana"); // Menor puntuación = mejor
  });

  test("sistemas de puntuación distintos en la serie (sor vs f1) -> 409", async () => {
    const seriesName = `LigaMix${Date.now()}`;
    await makeCompetition({ series: seriesName, scoringSystem: "sor" });
    await makeCompetition({ series: seriesName, scoringSystem: "f1" });

    const res = await request(app).get(`/api/sor/series/${seriesName}`);
    expect(res.status).toBe(409);
  });

  test("ageGroupsHomogeneus=false si no todas las competiciones de la serie activan grupos de edad", async () => {
    const seriesName = `LigaEdad${Date.now()}`;
    await makeCompetition({ series: seriesName, ageGroupsEnabled: true });
    await makeCompetition({ series: seriesName, ageGroupsEnabled: false });

    const res = await request(app).get(`/api/sor/series/${seriesName}`);
    expect(res.status).toBe(200);
    expect(res.body.ageGroupsEnabled).toBe(true);
    expect(res.body.ageGroupsHomogeneus).toBe(false);
  });

  test("labels de grupo de edad duplicados en la serie: resuelve el grupo local correcto por firma completa", async () => {
    const seriesName = `LigaDup${Date.now()}`;
    const compA = await makeCompetition({
      series: seriesName,
      ageGroupsEnabled: true,
      ageGroups: [
        { label: "Cadete", minAge: 11, maxAge: 14 },
        { label: "Cadete", minAge: 15, maxAge: 17 },
      ],
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });
    const compB = await makeCompetition({
      series: seriesName,
      ageGroupsEnabled: true,
      // Mismos labels, orden de declaración invertido -> misma firma, distinto _id local
      ageGroups: [
        { label: "Cadete", minAge: 15, maxAge: 17 },
        { label: "Cadete", minAge: 11, maxAge: 14 },
      ],
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });

    const jovenA = await makeCompetitor(compA._id, 1, "Joven", {
      birthDate: "2013-01-01",
    }); // ~13
    await makeResult(compA._id, jovenA._id, "3x3", 1, 900, 950);
    const jovenB = await makeCompetitor(compB._id, 1, "Joven", {
      birthDate: "2013-01-01",
    });
    await makeResult(compB._id, jovenB._id, "3x3", 1, 950, 1000);

    const seriesRes = await request(app).get(`/api/sor/series/${seriesName}`);
    const group1114 = seriesRes.body.ageGroups.find((g) => g.minAge === 11);
    expect(group1114).toBeDefined();

    const filtered = await request(app).get(
      `/api/sor/series/${seriesName}?ageGroup=${group1114._id}`,
    );
    expect(filtered.status).toBe(200);
    const entry = filtered.body.rankings.find((r) => r.name === "Joven");
    expect(entry).toBeDefined();
    // Debe aparecer con datos de AMBAS competiciones bajo el grupo 11-14,
    // no filtrado incorrectamente al grupo 15-17 por colisión de label
    expect(entry.perComp[compA._id.toString()]).toBeDefined();
    expect(entry.perComp[compB._id.toString()]).toBeDefined();
  });
});
