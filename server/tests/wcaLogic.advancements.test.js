// ============================================================
// PRUEBAS: wcaLogic.advancements.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const { connect, closeDatabase, clearDatabase } = require("./testDb");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const {
  processAdvancements,
  isWithdrawnFromNextRound,
} = require("../utils/wcaLogic");

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

const makeCompetition = (overrides = {}) =>
  Competition.create({
    wcaId: "TestComp2026",
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3"],
    rounds: [
      {
        event: "3x3",
        roundNumber: 1,
        advancementType: "ranking",
        advancementValue: 2,
        format: "a",
        status: "In Progress",
      },
    ],
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

const asResult = (competitorDoc, best, average) => ({
  competitor: {
    _id: competitorDoc._id,
    name: competitorDoc.name,
    withdrawals: competitorDoc.withdrawals || [],
  },
  best,
  average,
});

describe("processAdvancements sin grupos de edad", () => {
  test("ranking: solo avanzan los top N con tiempo válido", async () => {
    const comp = await makeCompetition();
    const [c1, c2, c3, c4] = await Promise.all([
      makeCompetitor(comp._id, 1, "Ana"),
      makeCompetitor(comp._id, 2, "Bea"),
      makeCompetitor(comp._id, 3, "Carlos"),
      makeCompetitor(comp._id, 4, "Dani"),
    ]);
    const results = [
      asResult(c1, 1000, 1100),
      asResult(c2, 900, 950),
      asResult(c3, 1200, 1300),
      asResult(c4, -1, -1),
    ];

    const processed = await processAdvancements(
      results,
      comp._id.toString(),
      "3x3",
      comp.rounds[0],
      1,
      false,
    );
    const advancing = processed
      .filter((r) => r.advances)
      .map((r) => r.competitor.name);
    expect(advancing.sort()).toEqual(["Ana", "Bea"]);
    expect(processed.find((r) => r.competitor.name === "Dani").advances).toBe(
      false,
    );
  });

  test("percent: redondea hacia abajo sobre el total de inscritos", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          advancementType: "percent",
          advancementValue: 75,
          format: "a",
          status: "In Progress",
        },
      ],
    });
    const [c1, c2, c3, c4] = await Promise.all([
      makeCompetitor(comp._id, 1, "A"),
      makeCompetitor(comp._id, 2, "B"),
      makeCompetitor(comp._id, 3, "C"),
      makeCompetitor(comp._id, 4, "D"),
    ]);
    const results = [
      asResult(c1, 900, 950),
      asResult(c2, 1000, 1050),
      asResult(c3, 1100, 1150),
      asResult(c4, 1200, 1250),
    ];

    const processed = await processAdvancements(
      results,
      comp._id.toString(),
      "3x3",
      comp.rounds[0],
      1,
      false,
    );
    expect(processed.filter((r) => r.advances)).toHaveLength(3);
    expect(processed.find((r) => r.competitor.name === "D").advances).toBe(
      false,
    );
  });

  test("ronda final (advancementValue 0): nadie avanza", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          advancementType: "ranking",
          advancementValue: 0,
          format: "a",
          status: "In Progress",
        },
      ],
    });
    const c1 = await makeCompetitor(comp._id, 1, "A");
    const processed = await processAdvancements(
      [asResult(c1, 900, 950)],
      comp._id.toString(),
      "3x3",
      comp.rounds[0],
      1,
      false,
    );
    expect(processed[0].advances).toBe(false);
  });

  test("competidor retirado de la siguiente ronda no avanza aunque tenga el mejor tiempo", async () => {
    const comp = await makeCompetition();
    const [c1, c2, c3] = await Promise.all([
      makeCompetitor(comp._id, 1, "Top1", {
        withdrawals: [{ event: "3x3", fromRound: 2 }],
      }),
      makeCompetitor(comp._id, 2, "Top2"),
      makeCompetitor(comp._id, 3, "Top3"),
    ]);
    const results = [
      asResult(c1, 500, 550),
      asResult(c2, 900, 950),
      asResult(c3, 1200, 1250),
    ];

    const processed = await processAdvancements(
      results,
      comp._id.toString(),
      "3x3",
      comp.rounds[0],
      1,
      false,
    );
    expect(processed.find((r) => r.competitor.name === "Top1").advances).toBe(
      false,
    );
    expect(processed.find((r) => r.competitor.name === "Top2").advances).toBe(
      true,
    );
  });

  test("DNF/DNS nunca avanza aunque queden slots libres", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          advancementType: "ranking",
          advancementValue: 3,
          format: "a",
          status: "In Progress",
        },
      ],
    });
    const [c1, c2] = await Promise.all([
      makeCompetitor(comp._id, 1, "Valido"),
      makeCompetitor(comp._id, 2, "DNF"),
    ]);
    const results = [asResult(c1, 900, 950), asResult(c2, -1, -1)];

    const processed = await processAdvancements(
      results,
      comp._id.toString(),
      "3x3",
      comp.rounds[0],
      1,
      false,
    );
    expect(processed.find((r) => r.competitor.name === "DNF").advances).toBe(
      false,
    );
  });

  test("processAdvancements reutiliza el memo entre grupos de edad", async () => {
    const comp = await makeCompetition({
      ageGroupsEnabled: true,
      ageGroups: [
        { label: "G1", maxAge: 18 },
        { label: "G2", maxAge: 30 },
        { label: "G3", minAge: 30 },
      ],
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          advancementType: "ranking",
          advancementValue: 10,
          format: "a",
          status: "Finished",
        },
        {
          event: "3x3",
          roundNumber: 2,
          advancementType: "ranking",
          advancementValue: 5, // No cero: obliga a calcular avances reales
          format: "a",
          status: "In Progress",
        },
      ],
    });

    const [c1, c2, c3] = await Promise.all([
      makeCompetitor(comp._id, 1, "Joven", { birthDate: "2015-01-01" }), // G1 (11 años)
      makeCompetitor(comp._id, 2, "Adulto", { birthDate: "2000-01-01" }), // G2 (26 años)
      makeCompetitor(comp._id, 3, "Mayor", { birthDate: "1980-01-01" }), // G3 (46 años)
    ]);

    const Result = require("../models/Result");
    await Promise.all([
      Result.create({
        competition: comp._id,
        competitor: c1._id,
        event: "3x3",
        round: 1,
        times: [1000],
        best: 1000,
        average: 1050,
      }),
      Result.create({
        competition: comp._id,
        competitor: c2._id,
        event: "3x3",
        round: 1,
        times: [1100],
        best: 1100,
        average: 1150,
      }),
      Result.create({
        competition: comp._id,
        competitor: c3._id,
        event: "3x3",
        round: 1,
        times: [1200],
        best: 1200,
        average: 1250,
      }),
    ]);

    const asResultWithAge = (competitorDoc, best, average) => ({
      competitor: {
        _id: competitorDoc._id,
        name: competitorDoc.name,
        withdrawals: competitorDoc.withdrawals || [],
        birthDate: competitorDoc.birthDate,
      },
      best,
      average,
    });

    const results = [
      asResultWithAge(c1, 1000, 1100),
      asResultWithAge(c2, 1100, 1200),
      asResultWithAge(c3, 1200, 1300),
    ];
    const spy = jest.spyOn(Competition, "findById");

    const processed = await processAdvancements(
      results,
      comp._id.toString(),
      "3x3",
      comp.rounds[1],
      2,
      true,
    );

    // Cada competidor es el único de su grupo de edad; con advancementValue=5
    // (mayor que el tamaño de cada grupo) todos deben avanzar.
    expect(processed.every((r) => r.advances)).toBe(true);

    // findById se llama una vez en processAdvancements para resolver ageGroups
    // y una vez por cada grupo dentro de getEligibleCountByAgeGroup (3 grupos).
    // Si el memo se rompiera y cada grupo recalculara recursivamente el avance
    // de rondas anteriores, este número crecería sin límite.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(4); // 1 + ageGroups.length
    spy.mockRestore();
  });

  test("getEligibleCountByAgeGroup: ronda anterior sin configurar -> 0, no lanza", async () => {
    const { getEligibleCountByAgeGroup } = require("../utils/wcaLogic");
    const comp = await makeCompetition({
      ageGroupsEnabled: true,
      rounds: [], // Ronda 1 no configurada
    });

    const result = await getEligibleCountByAgeGroup(
      comp._id.toString(),
      "3x3",
      2, // Pide ronda 2, la ronda 1 (anterior) no existe en `rounds`
      "alevin",
    );
    expect(result).toBe(0);
  });
});

describe("isWithdrawnFromNextRound", () => {
  test("detecta retirada exacta de evento+ronda siguiente", () => {
    const competitor = { withdrawals: [{ event: "3x3", fromRound: 2 }] };
    expect(isWithdrawnFromNextRound(competitor, "3x3", 1)).toBe(true);
    expect(isWithdrawnFromNextRound(competitor, "3x3", 2)).toBe(false);
    expect(isWithdrawnFromNextRound(competitor, "2x2", 1)).toBe(false);
  });

  test("sin withrdawals -> false", () => {
    expect(isWithdrawnFromNextRound({}, "3x3", 1)).toBe(false);
    expect(isWithdrawnFromNextRound(null, "3x3", 1)).toBe(false);
  });
});
