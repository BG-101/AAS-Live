// ============================================================
// RUTAS DE RESULTADOS (/api/results)
// Consulta y guardado de tiempos de competidores.
// Calcula estadísticas (best, average) y procesa avances.
// Registra cada cambio en el log de auditoría.
// ============================================================

const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Result = require("../models/Result");
const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const AuditLog = require("../models/AuditLog");
const auth = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");

const {
  calculateStats,
  processAdvancements,
  getRoundFormatMeta,
  ROUND_FORMATS,
  toPublicCompetitor,
  invalidateSORCache,
} = require("../utils/wcaLogic");
const {
  getCompetitionOrFail,
  getCompetitorOrFail,
} = require("../utils/dbHelpers");
const {
  editWindowGuard,
  byBodyCompetitionId,
} = require("../middleware/editWindow");
const { hasReachedDate } = require("../utils/dateHelpers");

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
      const comp = await getCompetitionOrFail(req.params.compId, res);
      if (!comp) return;

      // Obtiene los resultados con datos del competidor (populate)
      const rawResults = await Result.find({
        competition: req.params.compId,
        event: req.params.event,
        round: roundNum,
      })
        .populate({
          path: "competitor",
          match: { isDeleted: { $ne: true } }, // Excluye competidores borrados
          select: "+birthDate", // Necesario para clasificar por grupo de edad
        })
        .lean(); // Devuelve objetos JS planos para poder modificarlos

      // Filtra resultados de competidores borrados (populate devuelve null)
      const validResults = rawResults.filter((r) => r.competitor != null);

      // Busca la configuración de la ronda actual (formato, avance, etc.)
      const currentRound = comp.rounds.find(
        (r) => r.event === req.params.event && r.roundNumber === roundNum,
      );

      // Ordena los resultados y marca quién avanza a la siguiente ronda
      const processed = await processAdvancements(
        validResults,
        req.params.compId,
        req.params.event,
        currentRound,
        req.params.round,
        comp.ageGroupsEnabled || false,
      );

      // Ruta pública: nunca exponer birthDate, solo la edad ya resuelta
      const results = processed.map((r) => ({
        ...r,
        competitor: toPublicCompetitor(r.competitor, comp.startDate),
      }));

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
router.post(
  "/",
  auth(["SuperAdmin", "Delegado", "Metetiempos"]),
  editWindowGuard(byBodyCompetitionId),
  async (req, res) => {
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

    if (
      !mongoose.Types.ObjectId.isValid(competitionId) ||
      !mongoose.Types.ObjectId.isValid(competitorId)
    ) {
      return res
        .status(400)
        .json({ message: "ID de competición o competidor inválido." });
    }

    try {
      const comp = await getCompetitionOrFail(competitionId, res);
      if (!comp) return;

      if (req.user.role !== "SuperAdmin" && !hasReachedDate(comp.startDate)) {
        return res.status(403).json({
          message:
            "No puedes introducir tiempos antes de la fecha de inicio de la competición.",
        });
      }

      const competitorDoc = await getCompetitorOrFail(
        competitorId,
        competitionId,
        res,
      );
      if (!competitorDoc) return;
      if (!competitorDoc.events.includes(event))
        return res
          .status(400)
          .json({ message: "El competidor no está inscrito en este evento." });

      const roundConfig = comp.rounds.find(
        (r) => r.event === event && r.roundNumber === roundNum,
      );
      if (!roundConfig) {
        return res.status(404).json({
          message: "La ronda especificada no existe para este evento.",
        });
      }

      if (roundConfig.status === "Finished") {
        return res.status(403).json({
          message:
            "Esta ronda está cerrada. Reábrela antes de modificar tiempos.",
        });
      }

      const format = roundConfig.format;
      if (!Object.hasOwn(ROUND_FORMATS, format)) {
        return res.status(400).json({
          message:
            "Formato de ronda inválido en la configuración de la competición.",
        });
      }

      const { attempts: expectedLength, label: formatLabel } =
        getRoundFormatMeta(format);
      if (times.length !== expectedLength) {
        return res.status(400).json({
          message: `Formato ${formatLabel} requiere exactamente ${expectedLength} intentos.`,
        });
      }

      // Intentos bloqueados por cutoff no superado -> DNF (-1), nunca "vacío" (0).
      // Ao5 evalúa cutoff sobre los 2 primeros intentos; el resto sobre el 1º.
      const cutoffLimitIndex = format === "a" ? 2 : 1;
      const cutoff = roundConfig.cutoff || 0;
      let normalizedTimes = [...times];
      if (cutoff > 0) {
        const passedCutoff = normalizedTimes
          .slice(0, cutoffLimitIndex)
          .some((t) => t > 0 && t < cutoff);
        if (!passedCutoff) {
          normalizedTimes = normalizedTimes.map((t, i) =>
            i >= cutoffLimitIndex && t === 0 ? -1 : t,
          );
        }
      }

      const { best, average } = calculateStats(normalizedTimes, format);

      // Result + AuditLog deben confirmarse atómicamente: si el AuditLog falla,
      // el Result no debe quedar persistido sin su rastro de auditoría.
      let result;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          let existing = await Result.findOne({
            competition: competitionId,
            competitor: competitorId,
            event,
            round: roundNum,
          }).session(session);

          let isNew = !existing;
          let oldTimes = existing ? existing.times : null;

          if (existing) {
            existing.times = normalizedTimes;
            existing.best = best;
            existing.average = average;
            await existing.save({ session });
            result = existing;
          } else {
            try {
              const created = await Result.create(
                [
                  {
                    competition: competitionId,
                    competitor: competitorId,
                    event,
                    round: roundNum,
                    times: normalizedTimes,
                    best,
                    average,
                  },
                ],
                { session },
              );
              result = created[0];
            } catch (err) {
              if (err.code !== 11000) throw err;
              existing = await Result.findOne({
                competition: competitionId,
                competitor: competitorId,
                event,
                round: roundNum,
              }).session(session);
              if (!existing) throw err;
              isNew = false;
              oldTimes = existing.times;
              existing.times = normalizedTimes;
              existing.best = best;
              existing.average = average;
              await existing.save({ session });
              result = existing;
            }
          }

          await AuditLog.create(
            [
              {
                competition: competitionId,
                competitorName: competitorDoc?.name || "Desconocido",
                event,
                round: roundNum,
                action: isNew ? "NUEVO" : "MODIFICADO",
                oldTimes: oldTimes || [],
                newTimes: normalizedTimes,
                user: req.user?.username || "Desconocido",
              },
            ],
            { session },
          );
        });
      } catch (err) {
        console.error("Error guardando resultados y auditoría:", err);
        return res
          .status(500)
          .json({ message: "Error interno del servidor al guardar." });
      } finally {
        session.endSession();
      }

      // Calcula y emite los resultados actualizados por WebSocket ANTES de responder.
      // (Antes vivía fuera del try/catch, sin await: quedaba como trabajo en segundo
      // plano no rastreado, causando condiciones de carrera en tests y la posibilidad
      // de servir una respuesta HTTP inconsitente con el evento de socket emitido).
      try {
        const updatedResults = await Result.find({
          competition: competitionId,
          event,
          round: roundNum,
        })
          .populate({
            path: "competitor",
            match: { isDeleted: { $ne: true } },
            select: "+birthDate",
          })
          .lean();

        const validUpdated = updatedResults.filter((r) => r.competitor != null);

        // Recarga deliberadamente (no reusar el `comp` de getCompetitionOrFail de arriba):
        // entre el guardado transaccional del Result y este punto, otra request pudo
        // mutar `comp.rounds` (round-status, round-settings) de forma concurrente.
        // Usar el `comp` cacheado serviría un payload de socket con reglas de avance
        // obsoletas. Si se cachea, debe ser con invalidación explícita, no por defecto.
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

        const publicForSocket = processedForSocket.map((r) => ({
          ...r,
          competitor: toPublicCompetitor(r.competitor, compForSocket.startDate),
        }));

        invalidateSORCache(competitionId);
        const io = req.app.get("socketio");
        if (io) {
          io.emit("resultado_actualizado", {
            competitionId,
            event,
            round: roundNum,
            results: publicForSocket, // ← payload completo
          });
        }
      } catch (socketErr) {
        // Si falla el cálculo para el socket, emite sin payload como fallback
        console.error("Error generando payload WebSocket:", socketErr);
        const io = req.app.get("socketio");
        if (io) {
          io.emit("resultado_actualizado", {
            competitionId,
            event,
            round: roundNum,
          });
        }
      }

      // Envía la respuesta HTTP para que el cliente no se quede esperando
      res.json(result);
    } catch (err) {
      console.error("Error guardando tiempos:", err);
      return res
        .status(500)
        .json({ message: "Error interno del servidor al guardar." });
    }
  },
);

module.exports = router;
