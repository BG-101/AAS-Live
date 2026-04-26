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
    }).sort({
      startDate: -1, // Ordena por fecha de inicio, más recientes primero
    });
    res.json(competitions);
  } catch (err) {
    res.status(500).json({ message: err.message });
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

    res.json({ ...competition.toObject(), competitorCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
  } = req.body;

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
  async (req, res) => {
    const { event, currentRoundNumber } = req.body;
    try {
      const comp = await Competition.findById(req.params.id);

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
      });

      await comp.save();

      // Notifica a todos los clientes conectados por WebSocket
      req.app.get("socketio").emit("competicion_actualizada", req.params.id);
      res.json(comp);
    } catch (err) {
      res.status(500).json({ message: err.message });
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
      const comp = await Competition.findById(req.params.id);

      // Busca el índice de la ronda en el array
      const roundIndex = comp.rounds.findIndex(
        (r) => r.event === event && r.roundNumber === roundNumber,
      );

      if (roundIndex !== -1) {
        // Actualiza los campos de configuración
        comp.rounds[roundIndex].advancementType = advancementType;
        comp.rounds[roundIndex].advancementValue = advancementValue;
        comp.rounds[roundIndex].format = format || "a";
        comp.rounds[roundIndex].cutoff = cutoff || 0;

        await comp.save();

        // Notifica a los clientes conectados
        req.app.get("socketio").emit("competicion_actualizada", req.params.id);
        res.json(comp);
      } else {
        res.status(404).json({ message: "Ronda no encontrada" });
      }
    } catch (err) {
      res.status(500).json({ message: err.message });
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
  async (req, res) => {
    const { event, roundNumber, status } = req.body;
    try {
      const comp = await Competition.findById(req.params.id);

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
      res.status(500).json({ message: err.message });
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
      res.json({ message: "Competición movida a la papelera (Soft Delete)" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;
