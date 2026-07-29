// ============================================================
// PRUEBAS: competitorRoutes.crud.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const { createUser, loginAs } = require("./helpers");
const createApp = require("../app");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
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

const makeCompetition = (overrides = {}) =>
  Competition.create({
    wcaId: `CompCrud${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3", "2x2"],
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

describe("PUT /api/competitors/:id", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado1", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado1", "clave12345");
  });

  test("actualiza name, wcaId, birthDate, locality y events", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana");

    const res = await request(app)
      .put(`/api/competitors/${competitor._id}`)
      .set("Cookie", cookie)
      .send({
        name: "Ana María",
        wcaId: "2020AAAA01",
        birthDate: "2010-01-01",
        locality: "Almería",
        events: ["3x3", "2x2"],
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Ana María");
    expect(res.body.wcaId).toBe("2020AAAA01");
    expect(res.body.events).toEqual(["3x3", "2x2"]);
  });

  test("colisión de nombre con otro competidor activo -> 400", async () => {
    const comp = await makeCompetition();
    await makeCompetitor(comp._id, 1, "Bea");
    const competitor = await makeCompetitor(comp._id, 2, "Ana");

    const res = await request(app)
      .put(`/api/competitors/${competitor._id}`)
      .set("Cookie", cookie)
      .send({ name: "Bea", events: ["3x3"] });
    expect(res.status).toBe(400);
  });

  test("no colisiona consigo mismo si el nombre no cambia", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana");

    const res = await request(app)
      .put(`/api/competitors/${competitor._id}`)
      .set("Cookie", cookie)
      .send({ name: "Ana", locality: "Nueva Ciudad", events: ["3x3"] });
    expect(res.status).toBe(200);
    expect(res.body.locality).toBe("Nueva Ciudad");
  });

  test("competidor no encontrado o borrado -> 404", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Borrada", {
      isDeleted: true,
    });

    const res = await request(app)
      .put(`/api/competitors/${competitor._id}`)
      .set("Cookie", cookie)
      .send({ name: "Intento", events: ["3x3"] });
    expect(res.status).toBe(404);
  });

  test("emite 'competidor_actualizado' por socket", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana");

    await request(app)
      .put(`/api/competitors/${competitor._id}`)
      .set("Cookie", cookie)
      .send({ name: "Ana Editada", events: ["3x3"] });

    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "competidor_actualizado",
      expect.objectContaining({ competitionId: comp._id.toString() }),
    );
  });
});

describe("DELETE /api/competitors/:id", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado2", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado2", "clave12345");
  });

  test("soft delete: marca isDeleted y renombra, deja de aparecer en GET público", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana");

    const res = await request(app)
      .delete(`/api/competitors/${competitor._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);

    const listRes = await request(app).get(`/api/competitors/${comp._id}`);
    expect(listRes.body).toEqual([]);

    const raw = await Competitor.findById(competitor._id);
    expect(raw.isDeleted).toBe(true);
    expect(raw.name).toMatch(/Ana \(Borrado \d+\)/);
  });

  test("permite reinscribir a alguien con el mismo nombre tras el borrado", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana");
    await request(app)
      .delete(`/api/competitors/${competitor._id}`)
      .set("Cookie", cookie);

    const res = await request(app)
      .post("/api/competitors")
      .set("Cookie", cookie)
      .send({ competitionId: comp._id, name: "Ana", events: ["3x3"] });
    expect(res.status).toBe(201);
  });

  test("competidor inexistente -> 404", async () => {
    const fakeId = "64b000000000000000000000";
    const res = await request(app)
      .delete(`/api/competitors/${fakeId}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/competitors/empty-trash/:compId", () => {
  test("rol Delegado -> 403 (solo SuperAdmin)", async () => {
    await createUser("delegado3", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado3", "clave12345");
    const comp = await makeCompetition();

    const res = await request(app)
      .delete(`/api/competitors/empty-trash/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  test("SuperAdmin: hard delete de competidores en papelera y sus resultados", async () => {
    await createUser("admin1", "clave12345", "SuperAdmin");
    const cookie = await loginAs(app, "admin1", "clave12345");
    const comp = await makeCompetition();

    const trashed = await makeCompetitor(comp._id, 1, "Borrada", {
      isDeleted: true,
    });
    const active = await makeCompetitor(comp._id, 2, "Activa");
    await Result.create({
      competition: comp._id,
      competitor: trashed._id,
      event: "3x3",
      round: 1,
      times: [900],
      best: 900,
      average: 950,
    });

    const res = await request(app)
      .delete(`/api/competitors/empty-trash/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);

    expect(await Competitor.findById(trashed._id)).toBeNull();
    expect(await Competitor.findById(active._id)).not.toBeNull();
    expect(await Result.find({ competitor: trashed._id })).toEqual([]);
  });

  test("no elimina competidores borrados de otras competiciones", async () => {
    await createUser("admin2", "clave12345", "SuperAdmin");
    const cookie = await loginAs(app, "admin2", "clave12345");
    const comp = await makeCompetition();
    const otherComp = await makeCompetition();
    const otherTrashed = await makeCompetitor(otherComp._id, 1, "OtraBorrada", {
      isDeleted: true,
    });

    await request(app)
      .delete(`/api/competitors/empty-trash/${comp._id}`)
      .set("Cookie", cookie);
    expect(await Competitor.findById(otherTrashed._id)).not.toBeNull();
  });
});

describe("PATCH /api/competitors/:id/withdraw", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado4", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado4", "clave12345");
  });

  test("añade una retirada nueva", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana");

    const res = await request(app)
      .patch(`/api/competitors/${competitor._id}/withdraw`)
      .set("Cookie", cookie)
      .send({ event: "3x3", fromRound: 2, withdrawn: true });

    expect(res.status).toBe(200);
    expect(res.body.withdrawals).toEqual([
      { event: "3x3", fromRound: 2, _id: expect.anything() },
    ]);
  });

  test("no duplica si ya existe la misma retirada", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana", {
      withdrawals: [{ event: "3x3", fromRound: 2 }],
    });

    const res = await request(app)
      .patch(`/api/competitors/${competitor._id}/withdraw`)
      .set("Cookie", cookie)
      .send({ event: "3x3", fromRound: 2, withdrawn: true });

    expect(res.status).toBe(200);
    expect(res.body.withdrawals).toHaveLength(1);
  });

  test("withdrawn:false elimina la retirada existente", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana", {
      withdrawals: [{ event: "3x3", fromRound: 2 }],
    });

    const res = await request(app)
      .patch(`/api/competitors/${competitor._id}/withdraw`)
      .set("Cookie", cookie)
      .send({ event: "3x3", fromRound: 2, withdrawn: false });

    expect(res.status).toBe(200);
    expect(res.body.withdrawals).toEqual([]);
  });

  test("competidor no encontrado o borrado -> 404", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Borrada", {
      isDeleted: true,
    });

    const res = await request(app)
      .patch(`/api/competitors/${competitor._id}/withdraw`)
      .set("Cookie", cookie)
      .send({ event: "3x3", fromRound: 2, withdrawn: true });
    expect(res.status).toBe(404);
  });

  test("emite 'competidor_actualizado' por socket", async () => {
    const comp = await makeCompetition();
    const competitor = await makeCompetitor(comp._id, 1, "Ana");

    await request(app)
      .patch(`/api/competitors/${competitor._id}/withdraw`)
      .set("Cookie", cookie)
      .send({ event: "3x3", fromRound: 2, withdrawn: true });

    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "competidor_actualizado",
      expect.objectContaining({ competitionId: comp._id.toString() }),
    );
  });
});
