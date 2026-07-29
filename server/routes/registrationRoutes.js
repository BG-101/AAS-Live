// ============================================================
// RUTAS: registrationRoutes
// Expone los endpoints HTTP relacionados con este recurso.
// ============================================================

const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const router = express.Router();
const Registration = require("../models/Registration");
const Competitor = require("../models/Competitor");
const Competition = require("../models/Competition");
const auth = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");
const { getCompetitionOrFail } = require("../utils/dbHelpers");

const normalizeAge = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value) && value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// GET /api/registrations/:compId - lista (admins)
router.get(
  "/:compId",
  validateObjectId("compId"),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    try {
      const filter = { competition: req.params.compId };
      const ALLOWED = ["pending", "approved", "rejected"];
      const status =
        typeof req.query.status === "string" ? req.query.status : null;
      if (status) {
        if (!ALLOWED.includes(status))
          return res.status(400).json({ message: "Estado inválido." });
        filter.status = status;
      }
      const regs = await Registration.find(filter).sort({ createdAt: -1 });
      res.json(regs);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// POST /api/registrations/webhook/:compId - receptor del Apps Script (sin auth, vailda secret)
router.post(
  "/webhook/:compId",
  validateObjectId("compId"),
  async (req, res) => {
    try {
      const secret = req.headers["x-webhook-secret"];
      const comp = await getCompetitionOrFail(req.params.compId, res);
      if (!comp) return;
      const expected = Buffer.from(comp.webhookSecret || "");
      const provided = Buffer.from(typeof secret === "string" ? secret : "");
      if (
        !comp.webhookSecret ||
        expected.length !== provided.length ||
        !crypto.timingSafeEqual(expected, provided)
      )
        return res.status(401).json({ message: "Secreto inválido." });

      const {
        name,
        wcaId,
        age,
        birthDate,
        locality,
        email,
        events,
        formResponseId,
        rawData,
      } = req.body;
      if (!name?.trim())
        return res.status(400).json({ message: "Nombre requerido." });

      const parsedAge = normalizeAge(age);
      const responseId =
        typeof formResponseId === "string" && formResponseId.trim()
          ? formResponseId.trim()
          : null;
      let reg;
      try {
        reg = await Registration.create({
          competition: req.params.compId,
          name: name.trim(),
          wcaId: wcaId?.trim() || "",
          age: parsedAge,
          birthDate: birthDate || null,
          locality: locality?.trim() || "",
          email: email?.trim() || "",
          events: Array.isArray(events) ? events : [],
          formResponseId: responseId,
          rawData: rawData || req.body,
        });
      } catch (createErr) {
        if (createErr.code === 11000) {
          const dup = await Registration.findOne({
            competition: req.params.compId,
            formResponseId: responseId,
          });
          return res.json({ message: "Ya registrado.", id: dup?._id });
        }
        throw createErr;
      }

      req.app
        .get("socketio")
        ?.emit("nueva_inscripcion", { competitionId: req.params.compId });
      res.status(201).json(reg);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// POST /api/registrations/manual/:compId - inscripción manual por admin
router.post(
  "/manual/:compId",
  validateObjectId("compId"),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    try {
      const { name, wcaId, age, birthDate, locality, email, events } = req.body;
      if (!name?.trim())
        return res.status(400).json({ message: "Nombre requerido." });

      const comp = await getCompetitionOrFail(req.params.compId, res);
      if (!comp) return;

      const dup = await Registration.findOne({
        competition: req.params.compId,
        name: name.trim(),
        status: { $in: ["pending", "approved"] },
      });
      if (dup)
        return res.status(400).json({
          message:
            "Ya existe una inscripción pendiente/aprobada con ese nombre.",
        });

      const normalizedAge = normalizeAge(age);
      const reg = await Registration.create({
        competition: req.params.compId,
        name: name.trim(),
        wcaId: wcaId?.trim() || "",
        age: normalizedAge,
        birthDate: birthDate || null,
        locality: locality?.trim() || "",
        email: email?.trim() || "",
        events: Array.isArray(events) ? events : [],
      });

      req.app
        .get("socketio")
        ?.emit("nueva_inscripcion", { competitionId: req.params.compId });
      res.status(201).json(reg);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// POST /api/registrations/:compId/generate-secret - genera/regenera el secreto del webhook
router.post(
  "/:compId/generate-secret",
  validateObjectId("compId"),
  auth(["SuperAdmin"]),
  async (req, res) => {
    try {
      const comp = await getCompetitionOrFail(req.params.compId, res);
      if (!comp) return;
      const secret = crypto.randomBytes(24).toString("hex");
      comp.webhookSecret = secret;
      await comp.save();
      res.json({ secret });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// PATCH /api/registrations/:id/approve - marca como pagado y crea el Competidor
router.patch(
  "/:id/approve",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      const reg = await Registration.findById(req.params.id).session(session);
      if (!reg)
        return res.status(404).json({ message: "Inscripción no encontrada." });
      if (reg.status === "approved")
        return res.status(400).json({ message: "Ya aprobada." });

      let newCompetitor;
      let registrationResult;
      const businessError = (msg) =>
        Object.assign(new Error(msg), { status: 400 });

      let createdCompetitor;
      let lastError;
      for (let attempt = 0; attempt <= 4; attempt++) {
        const nextNumber = await Competitor.findOne({
          competition: reg.competition,
        })
          .sort({ competitorNumber: -1 })
          .lean()
          .then((last) => (last?.competitorNumber ?? 0) + 1);

        try {
          await session.withTransaction(async () => {
            const claimed = await Registration.findOneAndUpdate(
              { _id: reg._id, status: { $ne: "approved" } },
              {
                status: "approved",
                approvedAt: new Date(),
                approvedBy: req.user?.username || "Desconocido",
              },
              { new: true, session },
            );
            if (!claimed) throw businessError("Ya aprobada.");

            const comp = await Competition.findOne({
              _id: reg.competition,
              isDeleted: { $ne: true },
            }).session(session);
            if (!comp) throw businessError("Competición no encontrada.");

            const currentCount = await Competitor.countDocuments({
              competition: reg.competition,
              isDeleted: { $ne: true },
            }).session(session);
            if (currentCount >= comp.competitorLimit)
              throw businessError(`Aforo completo (${comp.competitorLimit}).`);

            const dup = await Competitor.findOne({
              name: reg.name,
              competition: reg.competition,
              isDeleted: { $ne: true },
            }).session(session);
            if (dup)
              throw businessError(
                "Ya existe un competidor con ese nombre en esta competición.",
              );

            createdCompetitor = await new Competitor({
              competitorNumber: nextNumber,
              name: reg.name,
              wcaId: reg.wcaId || "",
              age: reg.age,
              birthDate: reg.birthDate,
              locality: reg.locality || "",
              competition: reg.competition,
              events: reg.events,
            }).save({ session });

            registrationResult = claimed;
            newCompetitor = createdCompetitor;
          });
          break;
        } catch (err) {
          lastError = err;
          if (err.code === 11000 && err.keyPattern?.competitorNumber) {
            if (attempt === 4) {
              throw new Error("Conflicto de número tras 5 intentos.");
            }
            continue;
          }
          throw err;
        }
      }

      if (!newCompetitor) {
        throw lastError || new Error("No se pudo crear el competidor.");
      }

      req.app.get("socketio")?.emit("competidor_actualizado", {
        competitionId: reg.competition.toString(),
      });
      res.json({
        registration: registrationResult || reg,
        competitor: newCompetitor,
      });
    } catch (err) {
      res.status(err.status === 400 ? 400 : 500).json({ message: err.message });
    } finally {
      session.endSession();
    }
  },
);

// PATCH /api/registrations/:id/reject
router.patch(
  "/:id/reject",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    try {
      const reg = await Registration.findOneAndUpdate(
        { _id: req.params.id, status: { $ne: "approved" } },
        {
          status: "rejected",
          rejectedAt: new Date(),
          rejectedBy: req.user?.username || "Desconocido",
          notes: req.body.notes || "",
        },
        { new: true },
      );
      if (!reg) {
        const exists = await Registration.exists({ _id: req.params.id });
        return exists
          ? res.status(400).json({
              message:
                "Inscripción ya aprobada; elimina primero al competidor.",
            })
          : res.status(404).json({ message: "No encontrada." });
      }
      res.json(reg);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// DELETE /api/registrations/:id - borrado físico (solo SuperAdmin)
router.delete(
  "/:id",
  validateObjectId(),
  auth(["SuperAdmin"]),
  async (req, res) => {
    try {
      const deleted = await Registration.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: "No encontrada." });
      res.json({ message: "Eliminada." });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;
