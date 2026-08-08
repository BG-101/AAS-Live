// ============================================================
// RUTAS DE COMPETICIONES (/api/competitions)
// CRUD de competiciones y gestión de rondas (crear siguiente
// ronda, modificar configuración y cambiar estado).
// ============================================================

const express = require("express");
const router = express.Router();
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const auth = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");
const Result = require("../models/Result");
const mongoose = require("mongoose");
const { getCompetitionOrFail } = require("../utils/dbHelpers");
const { editWindowGuard, byParamId } = require("../middleware/editWindow");
const { ROUND_FORMATS } = require("../utils/wcaLogic");
const { sendServerError } = require("../utils/errorResponse");

// ============================================================
// GET /api/competitions
// Devuelve todas las competiciones activas (no borradas),
// ordenadas por fecha de inicio descendente (más recientes primero).
// Acceso público (no requiere autenticación).
// ============================================================
router.get("/", async (req, res) => {
  try {
    const competitions = await Competition.find({
      isDeleted: { $ne: true }, // Excluye las que están en la papelera
    })
      .select("-webhookSecret")
      .sort({
        startDate: -1, // Ordena por fecha de inicio, más recientes primero
      });
    res.json(competitions);
  } catch (err) {
    sendServerError(res, err);
  }
});

// ============================================================
// GET /api/competitions/by-wca/:wcaId
// Resuelve una competición por su ID WCA (URL amigable).
// Soporta también el _id de Mongo como fallback, para no romper
// enlaces antiguos ya compartidos.
// ============================================================
router.get("/by-wca/:wcaId", async (req, res) => {
  try {
    const { wcaId } = req.params;

    let competition = await Competition.findOne({
      wcaId,
      isDeleted: { $ne: true },
    });
    if (!competition && mongoose.Types.ObjectId.isValid(wcaId)) {
      competition = await Competition.findOne({
        _id: wcaId,
        isDeleted: { $ne: true },
      });
    }
    if (!competition)
      return res.status(404).json({ message: "No encontrada." });

    const competitorCount = await Competitor.countDocuments({
      competition: competition._id,
      isDeleted: { $ne: true },
    });

    const publicCompetition = competition.toObject();
    delete publicCompetition.webhookSecret;

    res.json({ ...publicCompetition, competitorCount });
  } catch (err) {
    sendServerError(res, err);
  }
});

// ============================================================
// GET /api/competitions/:id
// Devuelve una competición específica por su ID de MongoDB.
// Acceso público. Devuelve 404 si no existe o está borrada.
// ============================================================
router.get("/:id", validateObjectId(), async (req, res) => {
  try {
    const competition = await Competition.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    });
    if (!competition) return res.status(404).json({ message: "No encontrada" });

    // Cuenta los competidores activos de esta competición
    const competitorCount = await Competitor.countDocuments({
      competition: req.params.id,
      isDeleted: { $ne: true },
    });

    const publicCompetition = competition.toObject();
    delete publicCompetition.webhookSecret;

    res.json({ ...publicCompetition, competitorCount });
  } catch (err) {
    sendServerError(res, err);
  }
});

// ============================================================
// POST /api/competitions
// Crea una nueva competición con sus eventos y rondas iniciales.
// Solo SuperAdmin puede crear competiciones.
// ============================================================
router.post("/", auth(["SuperAdmin"]), async (req, res) => {
  const {
    wcaId,
    name,
    series,
    startDate,
    endDate,
    location,
    competitorLimit,
    events,
    rounds,
    sorEnabled,
    scoringSystem,
    ageGroupsEnabled,
    ageGroups,
  } = req.body;

  if (!Array.isArray(events) || events.length === 0)
    return res
      .status(400)
      .json({ message: "Debes incluir al menos 1 evento." });
  if (!Array.isArray(rounds) || rounds.length === 0)
    return res.status(400).json({ message: "Debes incluir al menos 1 ronda." });

  const invalidFormatRound = rounds.find(
    (r) =>
      !r ||
      typeof r.format !== "string" ||
      !Object.hasOwn(ROUND_FORMATS, r.format),
  );
  if (invalidFormatRound)
    return res.status(400).json({
      message: `Formato de ronda inválido: "${invalidFormatRound?.format}".`,
    });

  if (
    competitorLimit !== undefined &&
    (isNaN(competitorLimit) || Number(competitorLimit) <= 0)
  )
    return res
      .status(400)
      .json({ message: "competitorLimit debe ser un número positivo." });
  if (new Date(startDate) > new Date(endDate))
    return res
      .status(400)
      .json({ message: "startDate no puede ser posterior a endDate." });

  // Construye el documento de la competición
  const competition = new Competition({
    wcaId,
    name,
    series: series ? series.trim() : "", // Elimina espacios innecesarios
    startDate,
    endDate,
    location,
    competitorLimit: competitorLimit || 50, // Límite por defecto: 50
    events,
    rounds, // Array de configuración de rondas enviado desde el frontend
    sorEnabled: sorEnabled ?? false,
    scoringSystem: scoringSystem || "sor",
    ageGroupsEnabled: ageGroupsEnabled ?? false,
    ageGroups: Array.isArray(ageGroups) ? ageGroups : [],
  });

  try {
    const newCompetition = await competition.save();
    res.status(201).json(newCompetition);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ============================================================
// POST /api/competitions/:id/next-round
// Crea la siguiente ronda para un evento específico.
//
// Requisitos:
// - La ronda actual debe estar en estado "Finished"
// - La siguiente ronda no debe existir ya
//
// Emite un evento WebSocket para que todos los clientes se actualicen.
// ============================================================
router.post(
  "/:id/next-round",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  editWindowGuard(byParamId()),
  async (req, res) => {
    const { event, currentRoundNumber } = req.body;
    try {
      const comp = await getCompetitionOrFail(req.params.id, res);
      if (!comp) return;

      // Busca la ronda actual en la configuración
      const currentRound = comp.rounds.find(
        (r) => r.event === event && r.roundNumber === currentRoundNumber,
      );

      if (!currentRound) {
        return res
          .status(404)
          .json({ message: "La ronda actual no existe en la base de datos." });
      }

      // No permite abrir la siguiente ronda si la actual no ha sido cerrada
      if (currentRound.status !== "Finished") {
        return res.status(400).json({
          message:
            "¡Alto ahí! Debes finalizar (cerrar con el candado) la ronda actual antes de poder abrir la siguiente.",
        });
      }

      // Comprueba que la siguiente ronda no exista ya (evita duplicados)
      const nextRoundNumber = currentRoundNumber + 1;
      if (
        comp.rounds.find(
          (r) => r.event === event && r.roundNumber === nextRoundNumber,
        )
      )
        return res.status(400).json({ message: "La ronda ya existe." });

      // Crea la nueva ronda con valores por defecto
      comp.rounds.push({
        event,
        roundNumber: nextRoundNumber,
        status: "In Progress",
        advancementType: "percent", // Por defecto avanza un porcentaje
        advancementValue: 75, // Por defecto avanza el 75%
        format: currentRound.format || "a",
      });

      await comp.save();

      // Notifica a todos los clientes conectados por WebSocket
      req.app.get("socketio").emit("competicion_actualizada", req.params.id);
      res.json(comp);
    } catch (err) {
      sendServerError(res, err);
    }
  },
);

// ============================================================
// PUT /api/competitions/:id/round-settings
// Actualiza la configuración de una ronda existente:
// formato (Ao5/Mo3/Bo3), cutoff, tipo de avance y valor.
//
// Emite un evento WebSocket para actualizar el proyector.
// ============================================================
router.put(
  "/:id/round-settings",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  editWindowGuard(byParamId()),
  async (req, res) => {
    const {
      event,
      roundNumber,
      advancementType,
      advancementValue,
      format,
      cutoff,
    } = req.body;
    try {
      const comp = await getCompetitionOrFail(req.params.id, res);
      if (!comp) return;

      // Busca el índice de la ronda en el array
      const roundIndex = comp.rounds.findIndex(
        (r) => r.event === event && r.roundNumber === roundNumber,
      );

      if (roundIndex !== -1) {
        const resolvedFormat = format || "a";
        if (!Object.hasOwn(ROUND_FORMATS, resolvedFormat))
          return res
            .status(400)
            .json({ message: `Formato de ronda inválido: "${format}".` });

        // Actualiza los campos de configuración
        comp.rounds[roundIndex].advancementType = advancementType;
        comp.rounds[roundIndex].advancementValue = advancementValue;
        comp.rounds[roundIndex].format = resolvedFormat;
        comp.rounds[roundIndex].cutoff = cutoff || 0;

        await comp.save();
        // Notifica a los clientes conectados
        req.app.get("socketio").emit("competicion_actualizada", req.params.id);
        res.json(comp);
      } else {
        res.status(404).json({ message: "Ronda no encontrada" });
      }
    } catch (err) {
      sendServerError(res, err);
    }
  },
);

// ============================================================
// PUT /api/competitions/:id/round-status
// Cambia el estado de una ronda entre "In Progress" y "Finished".
// Se usa para "cerrar" una ronda (bloquear más entradas de tiempos)
// o "reabrirla" si es necesario.
//
// Emite un evento WebSocket.
// ============================================================
router.put(
  "/:id/round-status",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  editWindowGuard(byParamId()),
  async (req, res) => {
    const { event, roundNumber, status } = req.body;
    try {
      const comp = await getCompetitionOrFail(req.params.id, res);
      if (!comp) return;

      // Busca la ronda y actualiza su estado
      const roundIndex = comp.rounds.findIndex(
        (r) => r.event === event && r.roundNumber === roundNumber,
      );

      if (roundIndex !== -1) {
        comp.rounds[roundIndex].status = status;
        await comp.save();

        // Notifica a los clientes conectados
        req.app.get("socketio").emit("competicion_actualizada", req.params.id);
        res.json(comp);
      } else {
        res.status(404).json({ message: "Ronda no encontrada" });
      }
    } catch (err) {
      sendServerError(res, err);
    }
  },
);

// ============================================================
// DELETE /api/competitions/:id
// Soft delete de una competición: marca isDeleted = true.
// La competición deja de aparecer en las consultas pero sus
// datos se mantienen en la base de datos.
// Solo accesible para SuperAdmin.
// ============================================================
router.delete(
  "/:id",
  validateObjectId(),
  auth(["SuperAdmin"]),
  async (req, res) => {
    try {
      await Competition.findByIdAndUpdate(req.params.id, { isDeleted: true });

      // Notifica a todos los clientes para que redirijan si están dentro
      req.app.get("socketio").emit("competicion_actualizada", req.params.id);

      res.json({ message: "Competición movida a la papelera (Soft Delete)" });
    } catch (err) {
      sendServerError(res, err);
    }
  },
);

/**
 * DELETE /api/competitions/:id/round-results-after
 * Elimina los resultados de un evento en todas las rondas posteriores que estuviera
 * Finished, ya que sus resultados quedaron borrados. Operación atómica
 * (transacción): si el guardado de la competición falla, el borrado de
 * resultados se revierte.
 * @param {string} req.params.id - ID de la competición
 * @param {string} req.body.event - Evento a limpiar (debe existir en comp.events)
 * @param {number} req.body.fromRound - Ronda a partir de la cual se borra (exclusive)
 */
router.delete(
  "/:id/round-results-after",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  editWindowGuard(byParamId()),
  async (req, res) => {
    const { event, fromRound } = req.body;

    if (typeof event !== "string" || event.trim() === "") {
      return res.status(400).json({ message: "event inválido." });
    }
    const parsedFromRound = Number(fromRound);
    if (!Number.isInteger(parsedFromRound) || parsedFromRound < 0) {
      return res.status(400).json({ message: "fromRound inválido." });
    }

    const session = await mongoose.startSession();
    const businessError = (status, msg) =>
      Object.assign(new Error(msg), { status });

    try {
      await session.withTransaction(async () => {
        // Lectura DENTRO de la transacción: se re-evalúa en cada retry,
        // así que un round-status concurrente entre intentos queda cubierto
        const comp = await Competition.findOne({
          _id: req.params.id,
          isDeleted: { $ne: true },
        }).session(session);
        if (!comp) throw businessError(404, "Competición no enontrada.");

        if (!comp.events.includes(event)) {
          throw businessError(400, "Evento no pertenece a esta competición.");
        }

        await Result.deleteMany(
          {
            competition: req.params.id,
            event,
            round: { $gt: parsedFromRound },
          },
          { session },
        );

        let reopenedAny = false;
        comp.rounds.forEach((r) => {
          if (
            r.event === event &&
            r.roundNumber > parsedFromRound &&
            r.status === "Finished"
          ) {
            r.status = "In Progress";
            reopenedAny = true;
          }
        });
        if (reopenedAny) await comp.save({ session });
      });

      // Socket + respuesta solo tras commit confirmado
      req.app.get("socketio").emit("competicion_actualizada", req.params.id);
      res.json({ message: "Resultados posteriores eliminados." });
    } catch (err) {
      sendServerError(res, err, { status: err.status || 500 });
    } finally {
      session.endSession();
    }
  },
);

module.exports = router;
