const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./testDb");
const { createUser, loginAs } = require("./helpers");
const createApp = require("../app");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const Registration = require("../models/Registration");

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
    wcaId: `Reg${Date.now()}${Math.random()}`,
    name: "Test Comp",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    location: "Test",
    events: ["3x3"],
    competitorLimit: 50,
    rounds: [],
    webhookSecret: "el-secreto-correcto",
    ...overrides,
  });

describe("GET /api/registrations/:compId", () => {
  test("sin cookie -> 401", async () => {
    const comp = await makeCompetition();
    const res = await request(app).get(`/api/registrations/${comp._id}`);
    expect(res.status).toBe(401);
  });

  test("rol Espectador -> 403", async () => {
    await createUser("espectador1", "clave12345", "Espectador");
    const cookie = await loginAs(app, "espectador1", "clave12345");
    const comp = await makeCompetition();
    const res = await request(app)
      .get(`/api/registrations/${comp._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  test("filtra por status vía querystring", async () => {
    await createUser("delegado1", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado1", "clave12345");
    const comp = await makeCompetition();
    await Registration.create([
      { competition: comp._id, name: "Pendiente", status: "pending" },
      { competition: comp._id, name: "Aprobada", status: "approved" },
    ]);

    const res = await request(app)
      .get(`/api/registrations/${comp._id}?status=pending`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Pendiente");
  });
});

describe("POST /api/registrations/webhook/:compId", () => {
  test("secreto incorrecto -> 401", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .post(`/api/registrations/webhook/${comp._id}`)
      .set("X-Webhook-Secret", "secreto-malo")
      .send({ name: "Ana" });
    expect(res.status).toBe(401);
  });

  test("secreto correcto -> 201, crea registration pending y emite socket", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .post(`/api/registrations/webhook/${comp._id}`)
      .set("X-Webhook-Secret", "el-secreto-correcto")
      .send({
        name: "Ana",
        wcaId: "2020AAAA01",
        events: ["3x3"],
        formResponseId: "resp1",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "nueva_inscripcion",
      expect.objectContaining({ competitionId: comp._id.toString() }),
    );
  });

  test("formResponseId duplicado -> 200 con 'Ya registrado', no crea un segundo registro", async () => {
    const comp = await makeCompetition();
    const payload = {
      name: "Ana",
      events: ["3x3"],
      formResponseId: "resp-dup",
    };

    await request(app)
      .post(`/api/registrations/webhook/${comp._id}`)
      .set("X-Webhook-Secret", "el-secreto-correcto")
      .send(payload);

    const res = await request(app)
      .post(`/api/registrations/webhook/${comp._id}`)
      .set("X-Webhook-Secret", "el-secreto-correcto")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Ya registrado.");
    const count = await Registration.countDocuments({
      competition: comp._id,
      formResponseId: "resp-dup",
    });
    expect(count).toBe(1);
  });
});

describe("POST /api/registrations/manual/:compId", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado2", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado2", "clave12345");
  });

  test("sin nombre -> 400", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .post(`/api/registrations/manual/${comp._id}`)
      .set("Cookie", cookie)
      .send({ events: ["3x3"] });
    expect(res.status).toBe(400);
  });

  test("crea inscripción pending y emite socket", async () => {
    const comp = await makeCompetition();
    const res = await request(app)
      .post(`/api/registrations/manual/${comp._id}`)
      .set("Cookie", cookie)
      .send({ name: "Carlos", events: ["3x3"] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "nueva_inscripcion",
      expect.objectContaining({ competitionId: comp._id.toString() }),
    );
  });

  test("competición borrada -> 404 y no crea inscripción", async () => {
    const comp = await makeCompetition();
    await Competition.findByIdAndUpdate(comp._id, { isDeleted: true });

    const res = await request(app)
      .post(`/api/registrations/manual/${comp._id}`)
      .set("Cookie", cookie)
      .send({ name: "Carlos", events: ["3x3"] });

    expect(res.status).toBe(404);
    const count = await Registration.countDocuments({ competition: comp._id });
    expect(count).toBe(0);
  });

  test("nombre duplicado con inscripción pending/approved existente -> 400", async () => {
    const comp = await makeCompetition();
    await Registration.create({
      competition: comp._id,
      name: "Carlos",
      status: "pending",
    });

    const res = await request(app)
      .post(`/api/registrations/manual/${comp._id}`)
      .set("Cookie", cookie)
      .send({ name: "Carlos", events: ["3x3"] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/registrations/:compId/generate-secret", () => {
  test("solo SuperAdmin -> Delegado recibe 403", async () => {
    await createUser("delegado3", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado3", "clave12345");
    const comp = await makeCompetition();
    const res = await request(app)
      .post(`/api/registrations/${comp._id}/generate-secret`)
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  test("SuperAdmin: genera y persiste el secreto", async () => {
    await createUser("admin1", "clave12345", "SuperAdmin");
    const cookie = await loginAs(app, "admin1", "clave12345");
    const comp = await makeCompetition();

    const res = await request(app)
      .post(`/api/registrations/${comp._id}/generate-secret`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.secret).toBeTruthy();

    const updated = await Competition.findById(comp._id);
    expect(updated.webhookSecret).toBe(res.body.secret);
  });
});

describe("PATCH /api/registrations/:id/approve", () => {
  let cookie;
  beforeEach(async () => {
    await createUser("delegado4", "clave12345", "Delegado");
    cookie = await loginAs(app, "delegado4", "clave12345");
  });

  test("inscripción inexistente -> 404", async () => {
    const fakeId = "64b000000000000000000000";
    const res = await request(app)
      .patch(`/api/registrations/${fakeId}/approve`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  test("ya aprobada -> 400", async () => {
    const comp = await makeCompetition();
    const reg = await Registration.create({
      competition: comp._id,
      name: "Ana",
      status: "approved",
      events: ["3x3"],
    });
    const res = await request(app)
      .patch(`/api/registrations/${reg._id}/approve`)
      .set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  test("aprueba correctamente: crea Competitor y marca approvedBy/approvedAt", async () => {
    const comp = await makeCompetition();
    const reg = await Registration.create({
      competition: comp._id,
      name: "Ana",
      wcaId: "2020AAAA01",
      events: ["3x3"],
      status: "pending",
    });

    const res = await request(app)
      .patch(`/api/registrations/${reg._id}/approve`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.registration.status).toBe("approved");
    expect(res.body.registration.approvedBy).toBe("delegado4");
    expect(res.body.competitor.name).toBe("Ana");
    expect(res.body.competitor.competitorNumber).toBe(1);

    expect(app.get("socketio").emit).toHaveBeenCalledWith(
      "competidor_actualizado",
      expect.objectContaining({ competitionId: comp._id.toString() }),
    );
  });

  test("aforo completo -> 400, no crea Competitor", async () => {
    const comp = await makeCompetition({ competitorLimit: 1 });
    await Competitor.create({
      competitorNumber: 1,
      name: "YaInscrito",
      competition: comp._id,
      events: ["3x3"],
    });
    const reg = await Registration.create({
      competition: comp._id,
      name: "Ana",
      events: ["3x3"],
      status: "pending",
    });

    const res = await request(app)
      .patch(`/api/registrations/${reg._id}/approve`)
      .set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Aforo completo/);
  });

  test("nombre duplicado entre competidores activos -> 400", async () => {
    const comp = await makeCompetition();
    await Competitor.create({
      competitorNumber: 1,
      name: "Ana",
      competition: comp._id,
      events: ["3x3"],
    });
    const reg = await Registration.create({
      competition: comp._id,
      name: "Ana",
      events: ["3x3"],
      status: "pending",
    });

    const res = await request(app)
      .patch(`/api/registrations/${reg._id}/approve`)
      .set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/registrations/:id/reject", () => {
  test("actualiza status, rejectedBy y notes", async () => {
    await createUser("delegado5", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado5", "clave12345");
    const comp = await makeCompetition();
    const reg = await Registration.create({
      competition: comp._id,
      name: "Ana",
      status: "pending",
    });

    const res = await request(app)
      .patch(`/api/registrations/${reg._id}/reject`)
      .set("Cookie", cookie)
      .send({ notes: "No pagó" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.rejectedBy).toBe("delegado5");
    expect(res.body.notes).toBe("No pagó");
  });
});

describe("DELETE /api/registrations/:id", () => {
  test("rol Delegado -> 403", async () => {
    await createUser("delegado6", "clave12345", "Delegado");
    const cookie = await loginAs(app, "delegado6", "clave12345");
    const comp = await makeCompetition();
    const reg = await Registration.create({
      competition: comp._id,
      name: "Ana",
      status: "pending",
    });

    const res = await request(app)
      .delete(`/api/registrations/${reg._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  test("SuperAdmin: elimina físicamente", async () => {
    await createUser("admin2", "clave12345", "SuperAdmin");
    const cookie = await loginAs(app, "admin2", "clave12345");
    const comp = await makeCompetition();
    const reg = await Registration.create({
      competition: comp._id,
      name: "Ana",
      status: "pending",
    });

    const res = await request(app)
      .delete(`/api/registrations/${reg._id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(await Registration.findById(reg._id)).toBeNull();
  });
});
