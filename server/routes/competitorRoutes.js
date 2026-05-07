// ============================================================
// RUTAS DE COMPETIDORES (/api/competitors)
// Gestiona la inscripción, consulta y eliminación de competidores,
// así como la obtención de competidores elegibles para rondas avanzadas.
// ============================================================

const express = require("express");
const router = express.Router();
const Competitor = require("../models/Competitor");
const Result = require("../models/Result");
const Competition = require("../models/Competition");
const auth = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");

const { processAdvancements } = require("../utils/wcaLogic");

// ============================================================
// GET /api/competitors/:compId
// Devuelve todos los competidores activos de una competición.
// Acceso público (los espectadores necesitan ver la lista).
// ============================================================
router.get("/:compId", validateObjectId("compId"), async (req, res) => {
  try {
    const competitors = await Competitor.find({
      competition: req.params.compId,
      isDeleted: { $ne: true }, // Excluye los competidores borrados
    });
    res.json(competitors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// GET /api/competitors/:compId/eligible/:event/:round
// Devuelve los competidores ELEGIBLES para una ronda específica.
//
// Lógica:
// - Ronda 1: devuelve todos los inscritos en ese evento
// - Ronda > 1: calcula quién avanzó según los resultados de
//   la ronda anterior y las reglas de avance configuradas
//
// Este endpoint es clave para el formulario de entrada de tiempos,
// ya que solo muestra competidores que pueden participar en la ronda.
// ============================================================
router.get(
  "/:compId/eligible/:event/:round",
  validateObjectId("compId"),
  async (req, res) => {
    try {
      const { compId, event, round } = req.params;
      const currentRoundNum = parseInt(round);

      // --- Ronda 1: todos los inscritos en el evento ---
      if (currentRoundNum === 1) {
        const competitors = await Competitor.find({
          competition: compId,
          events: event, // MongoDB busca dentro del array de eventos
          isDeleted: { $ne: true },
        });
        return res.json(competitors);
      }

      // --- Ronda > 1: buscar quién avanzó de la ronda anterior ---
      const prevRoundNum = currentRoundNum - 1;
      const comp = await Competition.findById(compId);

      // Obtiene la configuración de avance de la ronda anterior
      const prevRound = comp.rounds.find(
        (r) => r.event === event && r.roundNumber === prevRoundNum,
      );

      // Si la ronda anterior no existe o no está finalizada, nadie es elegible
      if (!prevRound || prevRound.status !== "Finished") {
        return res.json([]);
      }

      // Obtiene los resultados de la ronda anterior con datos del competidor
      const rawPrevResults = await Result.find({
        competition: compId,
        event: event,
        round: prevRoundNum,
      })
        .populate({
          path: "competitor",
          match: { isDeleted: { $ne: true } }, // Excluye competidores borrados
        })
        .lean(); // Devuelve objetos JS planos (mejor rendimiento)

      // Filtra resultados cuyo competidor fue borrado (populate devuelve null)
      const validPrevResults = rawPrevResults.filter(
        (r) => r.competitor != null,
      );

      // Procesa los avances (ordena y marca quién avanza)
      const processedResults = await processAdvancements(
        validPrevResults,
        compId,
        event,
        prevRound,
        prevRoundNum,
        comp.ageGroupsEnabled || false,
      );

      // Extrae solo los competidores que avanzan
      const eligibleCompetitors = processedResults
        .filter((r) => r.advances)
        .map((r) => r.competitor);

      res.json(eligibleCompetitors);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// POST /api/competitors
// Inscribe un nuevo competidor en una competición.
//
// Validaciones:
// - No superar el límite de competidores de la competición
// - No duplicar nombres en la misma competición
// - Asigna automáticamente un número de competidor secuencial
//
// Requiere rol SuperAdmin o Delegado.
// ============================================================
router.post("/", auth(["SuperAdmin", "Delegado"]), async (req, res) => {
  try {
    const compId = req.body.competitionId;
    const comp = await Competition.findById(req.body.competitionId);

    // Comprueba que no se haya alcanzado el límite de competidores
    const currentCount = await Competitor.countDocuments({
      competition: compId,
      isDeleted: { $ne: true },
    });
    if (currentCount >= comp.competitorLimit) {
      return res.status(400).json({
        message: `¡Aforo completo! El límite es de ${comp.competitorLimit} competidores.`,
      });
    }

    // Comprueba que no existe ya un competidor con el mismo nombre (activo)
    const existingCompetitor = await Competitor.findOne({
      name: req.body.name.trim(),
      competition: compId,
      isDeleted: { $ne: true },
    });

    if (existingCompetitor) {
      return res.status(400).json({
        message: "¡Error! Este competidor ya está inscrito en este torneo.",
      });
    }

    // Calcula el siguiente número de competidor (auto-incremental)
    const lastCompetitor = await Competitor.findOne({
      competition: compId,
    }).sort({ competitorNumber: -1 }); // El de número más alto
    const nextNumber =
      lastCompetitor && lastCompetitor.competitorNumber
        ? lastCompetitor.competitorNumber + 1
        : 1; // Si no hay ninguno, empieza en 1

    // Crea el documento del competidor
    const competitor = new Competitor({
      competitorNumber: nextNumber,
      name: req.body.name.trim(),
      wcaId: req.body.wcaId ? req.body.wcaId.trim() : "",
      age: req.body.age || null,
      locality: req.body.locality ? req.body.locality.trim() : "",
      competition: compId,
      events: req.body.events, // Array de eventos en los que participa
    });

    const newCompetitor = await competitor.save();

    // ============================================================
    // AUTO-INSCRIPCIÓN EN SERIE
    // Si la competición pertenece a una serie, inscribe al
    // competidor (con los mismos datos y eventos) en todas las
    // demás competiciones de la serie.
    // Los fallos son silenciosos para no bloquear la inscripción principal.
    // ============================================================
    if (comp.series && comp.series.trim() !== "") {
      try {
        const seriesComps = await Competition.find({
          series: comp.series,
          _id: { $ne: compId },
          isDeleted: { $ne: true },
        });

        for (const seriesComp of seriesComps) {
          try {
            // No duplicar si ya existe (activo) en esa competición
            const alreadyExists = await Competitor.findOne({
              name: req.body.name.trim(),
              competition: seriesComp._id,
              isDeleted: { $ne: true },
            });
            if (alreadyExists) continue;

            // Respetar el límite de competidores de la competición destino
            const countInTarget = await Competitor.countDocuments({
              competition: seriesComp._id,
              isDeleted: { $ne: true },
            });
            if (countInTarget >= seriesComp.competitorLimit) {
              console.warn(
                `Auto-inscripción omitida en "${seriesComp.name}": aforo completo.`,
              );
              continue;
            }

            // Número de competidor secuencial de la competición destino
            const lastInTarget = await Competitor.findOne({
              competition: seriesComp._id,
            }).sort({ competitorNumber: -1 });
            const nextNum = lastInTarget?.competitorNumber
              ? lastInTarget.competitorNumber + 1
              : 1;

            const mirrored = new Competitor({
              competitorNumber: nextNum,
              name: req.body.name.trim(),
              wcaId: req.body.wcaId ? req.body.wcaId.trim() : "",
              age: req.body.age || null,
              locality: req.body.locality ? req.body.locality.trim() : "",
              competition: seriesComp._id,
              events: req.body.events,
            });

            await mirrored.save();

            // Notifica a los clientes de esa competición de la serio
            const io = req.app.get("socketio");
            if (io) {
              io.emit("competidor_actualizado", {
                competitionId: seriesComp._id.toString(),
              });
            }
          } catch (innerErr) {
            console.error(
              `Auto-inscripción fallida en "${seriesComp.name}":`,
              innerErr.message,
            );
          }
        }
      } catch (seriesErr) {
        console.error(
          "Error buscando competiciones de la serie:",
          seriesErr.message,
        );
      }
    }

    res.status(201).json(newCompetitor);
  } catch (err) {
    // Error 11000 = violación de índice único (nombre duplicado en MongoDB)
    if (err.code === 11000) {
      return res.status(400).json({
        message:
          "¡Error! Este competidor ya está inscrito (Detectado por la BD).",
      });
    }
    res.status(400).json({ message: err.message });
  }
});

// ============================================================
// DELETE /api/competitors/:id
// Soft delete de un competidor: marca isDeleted = true y
// renombra al competidor para liberar el nombre en el índice único.
//
// Los tiempos del competidor se mantienen pero se filtran en las consultas.
// Requiere rol SuperAdmin o Delegado.
// ============================================================
router.delete(
  "/:id",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    try {
      const comp = await Competitor.findById(req.params.id);
      if (!comp)
        return res.status(404).json({ message: "Competidor no encontrado" });

      // Renombra con timestamp para evitar conflicto con el índice único name+competition
      // Así se puede volver a inscribir a alguien con el mismo nombre
      const deletedName = `${comp.name} (Borrado ${Date.now()})`;

      await Competitor.findByIdAndUpdate(req.params.id, {
        isDeleted: true,
        name: deletedName,
      });

      res.json({ message: "Competidor movido a la papelera" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// DELETE /api/competitors/empty-trash/:compId
// Vaciado total de la papelera de una competición.
// Elimina FÍSICAMENTE (hard delete) todos los competidores borrados
// y sus resultados asociados. Esta acción es IRREVERSIBLE.
//
// Solo accesible para SuperAdmin.
// ============================================================
router.delete(
  "/empty-trash/:compId",
  validateObjectId("compId"),
  auth(["SuperAdmin"]),
  async (req, res) => {
    try {
      // Busca todos los competidores en la papelera de esta competición
      const trashedCompetitors = await Competitor.find({
        competition: req.params.compId,
        isDeleted: true,
      });

      // Obtiene sus IDs para borrar sus resultados asociados
      const trashedIds = trashedCompetitors.map((c) => c._id);

      // Elimina todos los resultados de esos competidores (hard delete)
      await Result.deleteMany({ competitor: { $in: trashedIds } });

      // Elimina físicamente los competidores (hard delete)
      const deletedCount = await Competitor.deleteMany({
        competition: req.params.compId,
        isDeleted: true,
      });

      const io = req.app.get("socketio");
      if (io)
        io.emit("competidor_actualizado", { competitionId: req.params.compId });

      res.json({
        message: `Papelera vaciada. ${deletedCount.deletedCount} competidores eliminados físicamente.`,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// PUT /api/competitors/:id
// Actualiza los datos editables de un competidor.
// Accesible para SuperAdmin (panel de edición).
// ============================================================
router.put(
  "/:id",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    try {
      const { name, wcaId, age, locality, events } = req.body;

      const comp = await Competitor.findById(req.params.id);
      if (!comp || comp.isDeleted)
        return res.status(404).json({ message: "Competidor no encontrado" });

      // Comprueba que el nuevo nombre no colisiona con otro competidor activo
      if (name && name.trim() !== comp.name) {
        const collision = await Competitor.findOne({
          name: name.trim(),
          competition: comp.competition,
          isDeleted: { $ne: true },
          _id: { $ne: comp._id },
        });
        if (collision)
          return res
            .status(400)
            .json({ message: "Ya existe un competidor con ese nombre." });
      }

      const updated = await Competitor.findByIdAndUpdate(
        req.params.id,
        {
          name: name ? name.trim() : comp.name,
          wcaId: wcaId !== undefined ? wcaId.trim() : comp.wcaId,
          age: age !== undefined ? (age === "" ? null : Number(age)) : comp.age,
          locality: locality !== undefined ? locality.trim() : comp.locality,
          events: events || comp.events,
        },
        { new: true },
      );

      // Notifica a los clientes para que recarguen la lista de competidores
      const io = req.app.get("socketio");
      if (io)
        io.emit("competidor_actualizado", {
          competitionId: comp.competition.toString(),
        });

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// PATCH /api/competitors/:id/withdraw
// Añade o elimina una retirada para un competidor en un evento/ronda.
// body: { event, fromRound, withdrawn: true | false }
// Accesible para SuperAdmin y Delegado.
// ============================================================
router.patch(
  "/:id/withdraw",
  validateObjectId(),
  auth(["SuperAdmin", "Delegado"]),
  async (req, res) => {
    try {
      const { event, fromRound, withdrawn } = req.body;
      const comp = await Competitor.findById(req.params.id);
      if (!comp || comp.isDeleted)
        return res.status(404).json({ message: "Competidor no encontrado." });

      if (withdrawn) {
        // Añade la retirada si no existe Ya
        const alreadyWithdrawn = comp.withdrawals.some(
          (w) => w.event === event && w.fromRound === fromRound,
        );
        if (!alreadyWithdrawn) {
          comp.withdrawals.push({ event, fromRound });
        }
      } else {
        // Elimina la retirada
        comp.withdrawals = comp.withdrawals.filter(
          (w) => !(w.event === event && w.fromRound === fromRound),
        );
      }

      await comp.save();

      const io = req.app.get("socketio");
      if (io) {
        io.emit("competidor_actualizado", {
          competitionId: comp.competition.toString(),
        });
      }

      res.json(comp);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;
