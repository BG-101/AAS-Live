// ============================================================
// PRUEBAS: competitionRoutes.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const { createUser, loginAs } = require("./helpers");
const createApp = require("../app");
const Competition = require("../models/Competition");
const Result = require("../models/Result");

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

const basePayload = (overrides = {}) => ({
  wcaId: `PayloadComp${Date.now()}${Math.random()}`,
  name: "Nueva Competición",
  location: "Almería",
  startDate: new Date(),
  endDate: new Date(),
  competitorLimit: 50,
  events: ["3x3"],
  rounds: [
    {
      event: "3x3",
      roundNumber: 1,
      status: "In Progress",
      advancementType: "ranking",
      advancementValue: 0,
      format: "a",
      cutoff: 0,
    },
  ],
  ...overrides,
});

const makeCompetition = (overrides = {}) =>
  Competition.create({
    wcaId: `Comp${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: new Date(),
    endDate: new Date(),
    location: "Test",
    events: ["3x3"],
    rounds: [
      {
        event: "3x3",
        roundNumber: 1,
        status: "In Progress",
        advancementType: "ranking",
        advancementValue: 16,
        format: "a",
        cutoff: 0,
      },
    ],
    ...overrides,
  });

describe("POST /api/competitions - autenticación", () => {
  test("sin cookie -> 401", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .send(basePayload());
    expect(res.status).toBe(401);
  });

  test("rol Delegado (no SuperAdmin) -> 403", async () => {
    await createUser("delegado1", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado1", "clave12345");
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(basePayload());
    expect(res.status).toBe(403);
  });
});

describe("POST /api/competitions - validaciones", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("admin1", "clave12345", "SuperAdmin");
    cookie = await loginAs(app, "admin1", "clave12345");
  });

  test("sin events -> 400", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(basePayload({ events: [] }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/al menos 1 evento/);
  });

  test("sin rounds -> 400", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(basePayload({ rounds: [] }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/al menos 1 ronda/);
  });

  test("competitorLimit negativo -> 400", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(basePayload({ competitorLimit: -5 }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/número positivo/);
  });

  test("competitorLimit no numérico -> 400", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(basePayload({ competitorLimit: "abc" }));
    expect(res.status).toBe(400);
  });

  test("startDate posterior a endDate -> 400", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(basePayload({ startDate: "2026-06-10", endDate: "2026-06-01" }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/startDate no puede ser posterior/);
  });

  test("wcaId duplicado -> 400", async () => {
    const payload = basePayload();
    await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(payload);
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(payload);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/competitions - creación correcta", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("admin2", "clave12345", "SuperAdmin");
    cookie = await loginAs(app, "admin2", "clave12345");
  });

  test("201 y aplica valores por defecto (sorEnabled, scoringSystem, ageGroupsEnabled)", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(basePayload());
    expect(res.status).toBe(201);
    expect(res.body.sorEnabled).toBe(false);
    expect(res.body.scoringSystem).toBe("sor");
    expect(res.body.ageGroupsEnabled).toBe(false);
    expect(res.body.ageGroups).toEqual([]);
  });

  test("respeta valores explícitos de sorEnabled/scoringSystem/ageGroups", async () => {
    const res = await request(app)
      .post("/api/competitions")
      .set("Cookie", cookie)
      .send(
        basePayload({
          sorEnabled: true,
          scoringSystem: "f1",
          ageGroupsEnabled: true,
          ageGroups: [{ label: "Sub18", maxAge: 18 }],
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.sorEnabled).toBe(true);
    expect(res.body.scoringSystem).toBe("f1");
    expect(res.body.ageGroups).toHaveLength(1);
  });
});

describe("GET /api/competitions", () => {
  test("excluye las competiciones borradas (isDeleted)", async () => {
    const visible = await makeCompetition();
    const deleted = await makeCompetition({ isDeleted: true });

    const res = await request(app).get("/api/competitions");
    const ids = res.body.map((c) => c._id);
    expect(ids).toContain(visible._id.toString());
    expect(ids).not.toContain(deleted._id.toString());
  });

  test("no expone webhookSecret en respuestas públicas", async () => {
    const comp = await makeCompetition({ webhookSecret: "supersecret" });

    const res = await request(app).get(`/api/competitions/${comp._id}`);
    expect(res.status).toBe(200);
    expect(res.body.webhookSecret).toBeUndefined();
  });
});

describe("GET /api/competitions/by-wca/:wcaId", () => {
  test("resuelve por wcaId e incluye competitorCount", async () => {
    const comp = await makeCompetition();
    const res = await request(app).get(
      `/api/competitions/by-wca/${comp.wcaId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(comp._id.toString());
    expect(res.body.competitorCount).toBe(0);
  });

  test("fallback a _id de Mongo si no coincide wcaId", async () => {
    const comp = await makeCompetition();
    const res = await request(app).get(`/api/competitions/by-wca/${comp._id}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(comp._id.toString());
  });

  test("no encontrada -> 404", async () => {
    const res = await request(app).get("/api/competitions/by-wca/NoExiste2026");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/competitions/:id", () => {
  test("id inválido -> 400", async () => {
    const res = await request(app).get("/api/competitions/no-es-un-id");
    expect(res.status).toBe(400);
  });

  test("competición borrada -> 404", async () => {
    const comp = await makeCompetition({ isDeleted: true });
    const res = await request(app).get(`/api/competitions/${comp._id}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/competitions/:id/next-round", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado2", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado2", "clave12345");
  });

  test("ronda actual no Finished -> 400", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .post(`/api/competitions/${comp._id}/next-round`)
      .set("Cookie", cookie)
      .send({ event: "3x3", currentRoundNumber: 1 });
    expect(res.status).toBe(400);
  });

  test("ronda actual no existe -> 404", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .post(`/api/competitions/${comp._id}/next-round`)
      .set("Cookie", cookie)
      .send({ event: "2x2", currentRoundNumber: 1 });
    expect(res.status).toBe(404);
  });

  test("crea la siguiente ronda heredando formato, con percent/75 por defecto", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          status: "Finished",
          advancementType: "ranking",
          advancementValue: 16,
          format: "m",
          cutoff: 0,
        },
      ],
    });
    const res = await request(app)
      .post(`/api/competitions/${comp._id}/next-round`)
      .set("Cookie", cookie)
      .send({ event: "3x3", currentRoundNumber: 1 });

    expect(res.status).toBe(200);
    const newRound = res.body.rounds.find((r) => r.roundNumber === 2);
    expect(newRound.format).toBe("m");
    expect(newRound.advancementType).toBe("percent");
    expect(newRound.advancementValue).toBe(75);
    expect(newRound.status).toBe("In Progress");
  });

  test("ronda siguiente ya existe -> 400", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          status: "Finished",
          advancementType: "ranking",
          advancementValue: 16,
          format: "a",
          cutoff: 0,
        },
        {
          event: "3x3",
          roundNumber: 2,
          status: "In Progress",
          advancementType: "ranking",
          advancementValue: 0,
          format: "a",
          cutoff: 0,
        },
      ],
    });
    const res = await request(app)
      .post(`/api/competitions/${comp._id}/next-round`)
      .set("Cookie", cookie)
      .send({ event: "3x3", currentRoundNumber: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ya existe/);
  });

  test("emite 'competicion_actualizada' por socket", async () => {
    const comp = await makeCompetition({
      rounds: [
        {
          event: "3x3",
          roundNumber: 1,
          status: "Finished",
          advancementType: "ranking",
          advancementValue: 16,
          format: "a",
          cutoff: 0,
        },
      ],
    });
    await request(app)
      .post(`/api/competitions/${comp._id}/next-round`)
      .set("Cookie", cookie)
      .send({ event: "3x3", currentRoundNumber: 1 });

    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "competicion_actualizada",
      comp._id.toString(),
    );
  });
});

describe("PUT /api/competitions/:id/round-settings", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado3", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado3", "clave12345");
  });

  test("actualiza formato, cutoff y avance correctamente", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .put(`/api/competitions/${comp._id}/round-settings`)
      .set("Cookie", cookie)
      .send({
        event: "3x3",
        roundNumber: 1,
        advancementType: "percent",
        advancementValue: 50,
        format: "b",
        cutoff: 1000,
      });

    expect(res.status).toBe(200);
    const round = res.body.rounds.find((r) => r.roundNumber === 1);
    expect(round.advancementType).toBe("percent");
    expect(round.advancementValue).toBe(50);
    expect(round.format).toBe("b");
    expect(round.cutoff).toBe(1000);
  });

  test("ronda inexistente -> 404", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .put(`/api/competitions/${comp._id}/round-settings`)
      .set("Cookie", cookie)
      .send({
        event: "3x3",
        roundNumber: 99,
        advancementType: "percent",
        advancementValue: 50,
        format: "a",
      });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/competitions/:id/round-status", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado4", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado4", "clave12345");
  });

  test("cambia de In Progress a Finished", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .put(`/api/competitions/${comp._id}/round-status`)
      .set("Cookie", cookie)
      .send({ event: "3x3", roundNumber: 1, status: "Finished" });

    expect(res.status).toBe(200);
    expect(res.body.rounds.find((r) => r.roundNumber === 1).status).toBe(
      "Finished",
    );
  });

  test("ronda inexistente -> 404", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .put(`/api/competitions/${comp._id}/round-status`)
      .set("Cookie", cookie)
      .send({ event: "2x2", roundNumber: 1, status: "Finished" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/competitions/:id", () => {
  test("solo SuperAdmin -> Delegado recibe 403", async () => {
    await createUser("delegado5", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado5", "clave12345");
    const comp = await makeCompetition();
    const res = await request(app)
      .delete(`/api/competitions/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  test("SuperAdmin: soft delete correcto, deja de ser visible", async () => {
    await createUser("admin3", "clave12345", "SuperAdmin");
    const cookie = await loginAs(app, "admin3", "clave12345");
    const comp = await makeCompetition();

    const res = await request(app)
      .delete(`/api/competitions/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/competitions/${comp._id}`);
    expect(check.status).toBe(404);
  });
});

describe("DELETE /api/competitions/:id/round-results-after", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado6", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado6", "clave12345");
  });

  test("elimina solo resultados de rondas posteriores a fromRound", async () => {
    const comp = await makeCompetition();
    const Competitor = require("../models/Competitor");
    const competitor = await Competitor.create({
      competitorNumber: 1,
      name: "Ana",
      competition: comp._id,
      events: ["3x3"],
    });

    await Result.create([
      {
        competition: comp._id,
        competitor: competitor._id,
        event: "3x3",
        round: 1,
        times: [900],
        best: 900,
        average: 950,
      },
      {
        competition: comp._id,
        competitor: competitor._id,
        event: "3x3",
        round: 2,
        times: [900],
        best: 900,
        average: 950,
      },
      {
        competition: comp._id,
        competitor: competitor._id,
        event: "3x3",
        round: 3,
        times: [900],
        best: 900,
        average: 950,
      },
    ]);

    const res = await request(app)
      .delete(`/api/competitions/${comp._id}/round-results-after`)
      .set("Cookie", cookie)
      .send({ event: "3x3", fromRound: 1 });

    expect(res.status).toBe(200);
    const remaining = await Result.find({ competition: comp._id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].round).toBe(1);
  });

  test("competición no encontrada -> 404", async () => {
    const fakeId = "64b000000000000000000000";
    const res = await request(app)
      .delete(`/api/competitions/${fakeId}/round-results-after`)
      .set("Cookie", cookie)
      .send({ event: "3x3", fromRound: 1 });
    expect(res.status).toBe(404);
  });
});
