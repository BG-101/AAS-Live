// ============================================================
// RUTAS DE RESULTADOS (/api/results)
// Consulta y guardado de tiempos de competidores.
// Calcula estadísticas (best, average) y procesa avances.
// Registra cada cambio en el log de auditoría.
// ============================================================

const express = require("express");
const router = express.Router();
const Result = require("../models/Result");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const AuditLog = require("../models/AuditLog");
const auth = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");

const { calculateStats, processAdvancements } = require("../utils/wcaLogic");

// ============================================================
// GET /api/results/:compId/:event/:round
// Devuelve los resultados de una ronda específica, ordenados
// según las reglas WCA y con información de avance calculada.
//
// Acceso público (los espectadores y el proyector lo necesitan).
// ============================================================
router.get(
  "/:compId/:event/:round",
  validateObjectId("compId"),
  async (req, res) => {
    try {
      // Convierte el parámetro de ronda a número (los params de URL son strings)
      const roundNum = Number(req.params.round);

      // Obtiene los resultados con datos del competidor (populate)
      const rawResults = await Result.find({
        competition: req.params.compId,
        event: req.params.event,
        round: roundNum,
      })
        .populate({
          path: "competitor",
          match: { isDeleted: { $ne: true } }, // Excluye competidores borrados
        })
        .lean(); // Devuelve objetos JS planos para poder modificarlos

      // Filtra resultados de competidores borrados (populate devuelve null)
      const validResults = rawResults.filter((r) => r.competitor != null);

      // Busca la configuración de la ronda actual (formato, avance, etc.)
      const comp = await Competition.findById(req.params.compId);
      const currentRound = comp.rounds.find(
        (r) => r.event === req.params.event && r.roundNumber === roundNum,
      );

      // Ordena los resultados y marca quién avanza a la siguiente ronda
      const results = await processAdvancements(
        validResults,
        req.params.compId,
        req.params.event,
        currentRound,
        req.params.round,
        comp.ageGroupsEnabled || false,
      );

      res.json(results);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// POST /api/results
// Guarda o actualiza los tiempos de un competidor en una ronda.
//
// Si el competidor ya tiene tiempos en esa ronda, los actualiza.
// Si no, crea un nuevo registro.
//
// También:
// - Calcula automáticamente best y average según el formato
// - Registra el cambio en el log de auditoría
// - Emite un evento WebSocket para actualizar el proyector en tiempo real
//
// Requiere rol SuperAdmin o Delegado.
// ============================================================
router.post("/", auth(["SuperAdmin", "Delegado"]), async (req, res) => {
  // Extrae los datos del body de la petición
  const { competitionId, competitorId, event, round, times } = req.body;
  const roundNum = Number(round); // Asegura que sea número

  // --- Validación de tiempos ---
  // Los tiempos deben ser un array de números, nunca menores a -2 (DNS)
  if (
    !Array.isArray(times) ||
    times.some((t) => typeof t !== "number" || t < -2)
  ) {
    return res.status(400).json({
      message: "Tiempos inválidos. No se permiten valores imposibles.",
    });
  }

  // --- Busca la configuración de la ronda para determinar el formato ---
  const comp = await Competition.findById(competitionId);
  const roundConfig = comp.rounds.find(
    (r) => r.event === event && r.roundNumber === roundNum,
  );
  const format = roundConfig ? roundConfig.format : "a"; // "a" por defecto

  // Calcula best y average según el formato de la ronda
  const { best, average } = calculateStats(times, format);

  try {
    // Busca si ya existe un resultado y actualízalo o créalo
    let result = await Result.findOne({
      competition: competitionId,
      competitor: competitorId,
      event,
      round: roundNum,
    });

    const isNew = !result;
    const oldTimes = result ? result.times : null;

    if (result) {
      result.times = times;
      result.best = best;
      result.average = average;
      await result.save();
    } else {
      result = await Result.create({
        competition: competitionId,
        competitor: competitorId,
        event,
        round: roundNum,
        times,
        best,
        average,
      });
    }

    // Registra la acción en la auditoría
    const compData = await Competitor.findById(competitorId);
    await AuditLog.create({
      competition: competitionId,
      competitorName: compData?.name || "Desconocido",
      event: event,
      round: roundNum,
      action: isNew ? "NUEVO" : "MODIFICADO",
      oldTimes: oldTimes || [],
      newTimes: times,
    });

    // Envía la respuesta HTTP para que el cliente no se quede esperando
    res.json(result);
  } catch (err) {
    console.error("Error guardando tiempos:", err);
    return res.status(500).json({ message: "Error interno del servidor al guardar." });
  }

  // Calcula y emite los resultados actualizados directamente por WebSocket,
  // evitando que cada cliente tenga que hacer un GET adicional
  try {
    const updatedResults = await Result.find({
      competition: competitionId,
      event,
      round: roundNum,
    })
      .populate({ path: "competitor", match: { isDeleted: { $ne: true } } })
      .lean();

    const validUpdated = updatedResults.filter((r) => r.competitor != null);
    const compForSocket = await Competition.findById(competitionId);
    const roundConfigForSocket = compForSocket.rounds.find(
      (r) => r.event === event && r.roundNumber === roundNum,
    );

    const processedForSocket = await processAdvancements(
      validUpdated,
      competitionId,
      event,
      roundConfigForSocket,
      roundNum,
      compForSocket.ageGroupsEnabled || false,
    );

    const io = req.app.get("socketio");

    if (io) {
      io.emit("resultado_actualizado", {
        competitionId,
        event,
        round: roundNum,
        results: processedForSocket, // ← payload completo
      });
    }
  } catch (socketErr) {
    // Si falla el cálculo para el socket, emite sin payload como fallback
    console.error("Error generando payload WebSocket:", socketErr);
    const io = req.app.get("socketio");
    if (io) {
      io.emit("resultado_actualizado", { competitionId, event, round: roundNum });
    }
  }
});

module.exports = router;
