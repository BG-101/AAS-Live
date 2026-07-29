// ============================================================
// PRUEBAS: wcaLogic.sor.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const { connect, closeDatabase, clearDatabase } = require("./testDb");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const Result = require("../models/Result");
const { calculateSOR } = require("../utils/wcaLogic");

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

const makeCompetition = (overrides = {}) =>
  Competition.create({
    wcaId: `SorComp${Date.now()}${Math.random()}`,
    name: "Test SOR Comp",
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

describe("calculateSOR - sin ronda jugada", () => {
  test("evento sin rondas -> penalización = nCompetidores+1 para todos (SOR clásico)", async () => {
    const comp = await makeCompetition();
    await Promise.all([
      makeCompetitor(comp._id, 1, "A"),
      makeCompetitor(comp._id, 2, "B"),
      makeCompetitor(comp._id, 3, "C"),
    ]);

    const data = await calculateSOR(comp._id.toString());
    expect(data.rankings).toHaveLength(3);
    data.rankings.forEach((r) => {
      expect(r.eventRanks["3x3"]).toBe(4); // 3 competidores + 1
      expect(r.totalScore).toBe(4);
    });
    expect(data.absentPenalty).toBe(4); // Se suma UNA vez por evento, no por competidor
  });

  test("evento sin rondas -> F1 no penaliza (0 puntos)", async () => {
    const comp = await makeCompetition({ scoringSystem: "f1" });
    await makeCompetitor(comp._id, 1, "A");

    const data = await calculateSOR(comp._id.toString());
    expect(data.rankings[0].eventRanks["3x3"]).toBe(0);
    expect(data.absentPenalty).toBe(0);
  });
});

describe("calculateSOR - ronda Finished con resultados válidos y ausentes", () => {
  test("rangos 1,2,3 para válidos; ausente recibe maxAssignedScore+1", async () => {
    const comp = await makeCompetition({
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });
    const [a, b, c, d] = await Promise.all([
      makeCompetitor(comp._id, 1, "A"),
      makeCompetitor(comp._id, 2, "B"),
      makeCompetitor(comp._id, 3, "C"),
      makeCompetitor(comp._id, 4, "D"), // Sin resultado -> ausente
    ]);
    await Promise.all([
      makeResult(comp._id, a._id, "3x3", 1, 1000, 1050),
      makeResult(comp._id, b._id, "3x3", 1, 900, 950),
      makeResult(comp._id, c._id, "3x3", 1, 1100, 1150),
    ]);

    const data = await calculateSOR(comp._id.toString());
    const byName = Object.fromEntries(data.rankings.map((r) => [r.name, r]));

    expect(byName["B"].eventRanks["3x3"]).toBe(1); // Mejor average
    expect(byName["A"].eventRanks["3x3"]).toBe(2);
    expect(byName["C"].eventRanks["3x3"]).toBe(3);
    expect(byName["D"].eventRanks["3x3"]).toBe(4); // maxAssignedScore(3) + 1
    expect(data.absentPenalty).toBe(4);
  });

  test("DNF (con resultado) puntúa peor que válidos pero mejor que ausente real", async () => {
    const comp = await makeCompetition({
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });
    const [a, b, c] = await Promise.all([
      makeCompetitor(comp._id, 1, "Valido"),
      makeCompetitor(comp._id, 2, "DNF"),
      makeCompetitor(comp._id, 3, "Ausente"),
    ]);
    await Promise.all([
      makeResult(comp._id, a._id, "3x3", 1, 1000, 1050),
      makeResult(comp._id, b._id, "3x3", 1, -1, -1),
    ]);

    const data = await calculateSOR(comp._id.toString());
    const byName = Object.fromEntries(data.rankings.map((r) => [r.name, r]));

    expect(byName["Valido"].eventRanks["3x3"]).toBe(1);
    expect(byName["DNF"].eventRanks["3x3"]).toBe(2); // validCount(1) + 1
    expect(byName["Ausente"].eventRanks["3x3"]).toBe(3); // maxAssignedScore(2) + 1
  });

  test("competidor no inscrito en el evento igual recibe penalización de ausente", async () => {
    // Documenta comportamiento actual: allCompetitors no filtra por `events`
    const comp = await makeCompetition({
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });
    const [a, noInscrito] = await Promise.all([
      makeCompetitor(comp._id, 1, "A"),
      makeCompetitor(comp._id, 2, "NoInscrito", { events: ["2x2"] }),
    ]);
    await makeResult(comp._id, a._id, "3x3", 1, 1000, 1050);

    const data = await calculateSOR(comp._id.toString());
    const byName = Object.fromEntries(data.rankings.map((r) => [r.name, r]));
    expect(byName["NoInscrito"].eventRanks["3x3"]).toBe(2); // maxAssignedScore(1)+1
  });
});

describe("calculateSOR - sistema F1", () => {
  test("puntos F1 por posición, DNF y ausente puntúan 0", async () => {
    const comp = await makeCompetition({
      scoringSystem: "f1",
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
    });
    const [a, b, c, d] = await Promise.all([
      makeCompetitor(comp._id, 1, "Primero"),
      makeCompetitor(comp._id, 2, "Segundo"),
      makeCompetitor(comp._id, 3, "DNF"),
      makeCompetitor(comp._id, 4, "Ausente"),
    ]);
    await Promise.all([
      makeResult(comp._id, a._id, "3x3", 1, 900, 950), // Mejor -> 1er puesto
      makeResult(comp._id, b._id, "3x3", 1, 1000, 1050), // 2do puesto
      makeResult(comp._id, c._id, "3x3", 1, -1, -1),
    ]);

    const data = await calculateSOR(comp._id.toString());
    const byName = Object.fromEntries(data.rankings.map((r) => [r.name, r]));

    expect(byName["Primero"].eventRanks["3x3"]).toBe(25);
    expect(byName["Segundo"].eventRanks["3x3"]).toBe(18);
    expect(byName["DNF"].eventRanks["3x3"]).toBe(0);
    expect(byName["Ausente"].eventRanks["3x3"]).toBe(0);
    expect(data.absentPenalty).toBe(0);

    // F1: mayor puntuación = mejor -> ranking descendente
    expect(data.rankings[0].name).toBe("Primero");
  });
});

describe("calculateSOR - filtrado por grupo de edad", () => {
  test("solo incluye en el ranking a competidores del grupo, ignorando a los demás por completo", async () => {
    const comp = await makeCompetition({
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ],
      ageGroupsEnabled: true,
    });
    const [peque, adulto] = await Promise.all([
      makeCompetitor(comp._id, 1, "Peque", { birthDate: "2018-01-01" }), // 8 años
      makeCompetitor(comp._id, 2, "Adulto", { birthDate: "2000-01-01" }), // 26 años
    ]);
    await Promise.all([
      makeResult(comp._id, peque._id, "3x3", 1, 2000, 2100),
      makeResult(comp._id, adulto._id, "3x3", 1, 900, 950),
    ]);

    const data = await calculateSOR(comp._id.toString(), "alevin"); // <=10 años por defecto
    expect(data.rankings).toHaveLength(1);
    expect(data.rankings[0].name).toBe("Peque");
    expect(data.rankings[0].eventRanks["3x3"]).toBe(1); // Único en su grupo -> rank 1
  });

  test("sin competidores en el grupo -> rankings vacío", async () => {
    const comp = await makeCompetition({ ageGroupsEnabled: true });
    await makeCompetitor(comp._id, 1, "Adulto", { birthDate: "2000-01-01" });

    const data = await calculateSOR(comp._id.toString(), "alevin");
    expect(data.rankings).toEqual([]);
  });
});

describe("calculateSOR - múltiples eventos y rondas", () => {
  test("usa la ronda Finished de mayor número si hay varias", async () => {
    const comp = await makeCompetition({
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
        { event: "3x3", roundNumber: 2, format: "a", status: "Finished" },
      ],
    });
    const [a, b] = await Promise.all([
      makeCompetitor(comp._id, 1, "A"),
      makeCompetitor(comp._id, 2, "B"),
    ]);
    // Ronda 1: A gana. Ronda 2 (la que debe usarse): B gana.
    await Promise.all([
      makeResult(comp._id, a._id, "3x3", 1, 900, 950),
      makeResult(comp._id, b._id, "3x3", 1, 1000, 1050),
      makeResult(comp._id, a._id, "3x3", 2, 1000, 1050),
      makeResult(comp._id, b._id, "3x3", 2, 900, 950),
    ]);

    const data = await calculateSOR(comp._id.toString());
    const byName = Object.fromEntries(data.rankings.map((r) => [r.name, r]));
    expect(byName["B"].eventRanks["3x3"]).toBe(1); // Ganó en R2, la más avanzada
    expect(byName["A"].eventRanks["3x3"]).toBe(2);
  });

  test("usa la ronda In Progress de mayor número si ninguna está Finished", async () => {
    const comp = await makeCompetition({
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "In Progress" },
      ],
    });
    const a = await makeCompetitor(comp._id, 1, "A");
    await makeResult(comp._id, a._id, "3x3", 1, 1000, 1050);

    const data = await calculateSOR(comp._id.toString());
    expect(data.rankings[0].eventRanks["3x3"]).toBe(1);
  });

  test("absentPenalty suma la penalización de cada evento por separado", async () => {
    const comp = await makeCompetition({
      events: ["3x3", "2x2"],
      rounds: [
        { event: "3x3", roundNumber: 1, format: "a", status: "Finished" },
      ], // 2x2 sin ronda
    });
    const [a, b] = await Promise.all([
      makeCompetitor(comp._id, 1, "A"),
      makeCompetitor(comp._id, 2, "B"),
    ]);
    await makeResult(comp._id, a._id, "3x3", 1, 1000, 1050); // B ausente en 3x3

    const data = await calculateSOR(comp._id.toString());
    // 3x3: B ausente -> maxAssignedScore(1)+1 = 2
    // 2x2: sin ronda -> penalty = nCompetidores+1 = 3 (una sola vez, no por competidor)
    expect(data.absentPenalty).toBe(2 + 3);
  });
});
