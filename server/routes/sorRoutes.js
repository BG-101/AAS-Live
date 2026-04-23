// ============================================================
// RUTAS SOR (/api/sor)
// Calcula el Sum of Ranks de una competición o de una serie
// completa, con soporte opcional para grupos de edad.
// ============================================================

const express = require("express");
const router = express.Router();
const Competition = require("../models/Competition");
const { calculateSOR, AGE_GROUPS } = require("../utils/wcaLogic");

// ============================================================
// GET /api/sor/series/:seriesName
// Devuelve el SOR agregado de todas las competiciones SOR
// dentro de una serie. Clave de agrupación: wcaId si existe,
// nombre si no (para cruzar competidores entre competiciones).
//
// El score de un competidor ausente en una competición es:
// (nCompetidores + 1) * nEventos — penalización máxima.
//
// IMPORTANTE: esta ruta debe ir ANTES de /:compId para que
// Express no interprete "series" como un compId.
// ============================================================
router.get("/series/:seriesName", async (req, res) => {
  try {
    const { seriesName } = req.params;
    const { ageGroup } = req.query;

    const competitions = await Competition.find({
      series: seriesName,
      sorEnabled: true,
      isDeleted: { $ne: true },
    }).sort({ startDate: 1 });

    if (competitions.length === 0)
      return res.json({
        rankings: [],
        competitions: [],
        ageGroupsEnabled: false,
      });

    const ageGroupsEnabled = competitions.some((c) => c.ageGroupsEnabled);

    // Calcula SOR individual de cada competición
    const compSORs = await Promise.all(
      competitions.map(async (comp) => ({
        comp,
        sor: await calculateSOR(comp._id.toString(), ageGroup || null),
      })),
    );

    // Función de clave de agrupación cross-competición
    const getKey = (entry) =>
      entry.wcaId && entry.wcaId.trim() !== ""
        ? `wca_${entry.wcaId.trim().toUpperCase()}`
        : `name_${entry.name.toLowerCase().trim()}`;

    const masterMap = {};

    // Agrega los scores de cada competición
    compSORs.forEach(({ comp, sor }) => {
      if (!sor.rankings) return;
      sor.rankings.forEach((entry) => {
        const key = getKey(entry);
        if (!masterMap[key]) {
          masterMap[key] = {
            key,
            name: entry.name,
            wcaId: entry.wcaId,
            age: entry.age,
            totalScore: 0,
            perComp: {},
          };
        }
        masterMap[key].totalScore += entry.totalScore;
        masterMap[key].perComp[comp._id.toString()] = entry.totalScore;
      });
    });

    // Penalización por competición ausente según sistema de puntuación
    compSORs.forEach(({ comp, sor }) => {
      const compId = comp._id.toString();
      const isF1 = (comp.scoringSystem || "sor") === "f1";
      // SOR: penalización máxima. F1: 0 puntos (no participó, no puntúa)
      const penalty = isF1 ? 0 : (sor.rankings.length + 1) * comp.events.length;
      Object.values(masterMap).forEach((entry) => {
        if (entry.perComp[compId] === undefined) {
          entry.totalScore += penalty;
          entry.perComp[compId] = penalty;
        }
      });
    });

    const isF1Series = (competitions[0]?.scoringSystem || "sor") === "f1";
    const rankings = Object.values(masterMap).sort((a, b) =>
      isF1Series ? b.totalScore - a.totalScore : a.totalScore - b.totalScore,
    );

    res.json({
      rankings,
      competitions: competitions.map((c) => ({
        _id: c._id,
        name: c.name,
        wcaId: c.wcaId,
        events: c.events,
      })),
      ageGroupsEnabled,
      // El sistema de la serie es el de la primera competición
      // (se asume homogéneo dentro de una serie)
      scoringSystem: competitions[0]?.scoringSystem || "sor",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// GET /api/sor/:compId?ageGroup=alevin|infantil|absoluta
// Devuelve el SOR de una competición individual.
// Si se pasa ageGroup, filtra competidores y recalcula rangos
// solo dentro de ese grupo.
// ============================================================
router.get("/:compId", async (req, res) => {
  try {
    const { ageGroup } = req.query;
    const data = await calculateSOR(req.params.compId, ageGroup || null);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
