const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Registration = require("../models/Registration");
const Competitor = require("../models/Competitor");
const Competition = require("../models/Competition");
const auth = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");

// GET /api/registrations/:compId - lista (admins)
router.get(
  "/:compId",
  validateObjectId("compId"),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    try {
      const filter = { competition: req.params.compId };
      if (req.query.status) filter.status = req.query.status;
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
      const secret = req.headers["x-webhook-secret"] || req.query.secret;
      const comp = await Competition.findOne({
        _id: req.params.compId,
        isDeleted: { $ne: true },
      });
      if (!comp)
        return res.status(404).json({ message: "Competición no encontrada." });
      if (!comp.webhookSecret || comp.webhookSecret !== secret)
        return res.status(401).json({ message: "Secreto inválido." });

      const {
        name,
        wcaId,
        age,
        locality,
        email,
        events,
        formResponseId,
        rawData,
      } = req.body;
      if (!name?.trim())
        return res.status(400).json({ message: "Nombre requerido." });

      let reg;
      try {
        reg = await Registration.create({
          competition: req.params.compId,
          name: name.trim(),
          wcaId: wcaId?.trim() || "",
          age: age ? Number(age) : null,
          locality: locality?.trim() || "",
          email: email?.trim() || "",
          events: Array.isArray(events) ? events : [],
          formResponseId: formResponseId || null,
          rawData: rawData || req.body,
        });
      } catch (createErr) {
        if (createErr.code === 11000) {
          const dup = await Registration.findOne({
            competition: req.params.compId,
            formResponseId,
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
      const { name, wcaId, age, locality, email, events } = req.body;
      if (!name?.trim())
        return res.status(400).json({ message: "Nombre requerido." });

      const reg = await Registration.create({
        competition: req.params.compId,
        name: name.trim(),
        wcaId: wcaId?.trim() || "",
        age: age ? Number(age) : null,
        locality: locality?.trim() || "",
        email: email?.trim() || "",
        events: Array.isArray(events) ? events : [],
      });
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
      const secret = crypto.randomBytes(24).toString("hex");
      await Competition.findByIdAndUpdate(req.params.compId, {
        webhookSecret: secret,
      });
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
    try {
      const reg = await Registration.findById(req.params.id);
      if (!reg)
        return res.status(404).json({ message: "Inscripción no encontrada." });
      if (reg.status === "approved")
        return res.status(400).json({ message: "Ya aprobada." });

      const comp = await Competition.findOne({
        _id: reg.competition,
        isDeleted: { $ne: true },
      });
      if (!comp)
        return res.status(404).json({ message: "Competición no encontrada." });

      const currentCount = await Competitor.countDocuments({
        competition: reg.competition,
        isDeleted: { $ne: true },
      });
      if (currentCount >= comp.competitorLimit)
        return res
          .status(400)
          .json({ message: `Aforo completo (${comp.competitorLimit}).` });

      const dup = await Competitor.findOne({
        name: reg.name,
        competition: reg.competition,
        isDeleted: { $ne: true },
      });
      if (dup)
        return res.status(400).json({
          message:
            "Ya existe un competidor con ese nombre en esta competición.",
        });

      // Mismo retry loop que en competitorRoutes
      let newCompetitor;
      for (let attempt = 0; attempt <= 4; attempt++) {
        const last = await Competitor.findOne({ competition: reg.competition })
          .sort({ competitorNumber: -1 })
          .lean();
        const nextNumber = (last?.competitorNumber ?? 0) + 1;
        try {
          newCompetitor = await new Competitor({
            competitorNumber: nextNumber,
            name: reg.name,
            wcaId: reg.wcaId || "",
            age: reg.age,
            locality: reg.locality || "",
            competition: reg.competition,
            events: reg.events,
          }).save();
          break;
        } catch (e) {
          if (e.code === 11000 && e.keyPattern?.competitorNumber) {
            if (attempt === 4)
              throw new Error("Conflicto de número tras 5 intentos.");
            continue;
          }
          throw e;
        }
      }

      reg.status = "approved";
      reg.approvedAt = new Date();
      reg.approvedBy = req.user?.username || "Desconocido";
      await reg.save();

      req.app.get("socketio")?.emit("competidor_actualizado", {
        competitionId: reg.competition.toString(),
      });
      res.json({ registration: reg, competitor: newCompetitor });
    } catch (err) {
      res.status(500).json({ message: err.message });
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
      const reg = await Registration.findByIdAndUpdate(
        req.params.id,
        {
          status: "rejected",
          rejectedAt: new Date(),
          rejectedBy: req.user?.username || "Desconocido",
          notes: req.body.notes || "",
        },
        { new: true },
      );
      if (!reg) return res.status(404).json({ message: "No encontrada." });
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
      await Registration.findByIdAndDelete(req.params.id);
      res.json({ message: "Eliminada." });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;
