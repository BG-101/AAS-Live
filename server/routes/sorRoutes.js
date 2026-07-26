// ============================================================
// RUTAS SOR (/api/sor)
// Calcula el Sum of Ranks de una competición o de una serie
// completa, con soporte opcional para grupos de edad.
// ============================================================

const express = require("express");
const router = express.Router();
const Competition = require("../models/Competition");
const { calculateSOR, resolveAgeGroups } = require("../utils/wcaLogic");

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

    const scoringSystems = new Set(
      competitions.map((c) => c.scoringSystem || "sor"),
    );
    if (scoringSystems.size > 1) {
      return res.status(409).json({
        message:
          "Las competiciones de la serie usan sistemas de puntuación distintos (SOR/F1). Unifícalos antes de consultar el SOR de serie.",
      });
    }

    const ageGroupsEnabledComps = competitions.filter(
      (c) => c.ageGroupsEnabled,
    );
    const ageGroupsEnabled = ageGroupsEnabledComps.length > 0;

    // Firma normalizada: mismo conjunto de label+minAge+maxAge, sin importar el orden
    const groupSignature = (comp) =>
      resolveAgeGroups(comp)
        .map(
          (g) =>
            `${g.label.trim().toLowerCase()}|${g.minAge ?? ""}|${g.maxAge ?? ""}`,
        )
        .sort()
        .join(",");

    let ageGroupsHomogeneus = true;
    if (ageGroupsEnabled) {
      if (ageGroupsEnabledComps.length !== competitions.length) {
        // No todas las competiciones de la serie tienen grupos de edad activados
        ageGroupsHomogeneus = false;
      } else if (ageGroupsEnabledComps.length > 1) {
        const signature = groupSignature(ageGroupsEnabledComps[0]);
        ageGroupsHomogeneus = ageGroupsEnabledComps.every(
          (c) => groupSignature(c) === signature,
        );
      }
    }

    const ageGroupsSource = ageGroupsEnabledComps[0] || null;
    const seriesAgeGroups =
      ageGroupsEnabled && ageGroupsHomogeneus && ageGroupsSource
        ? resolveAgeGroups(ageGroupsSource)
        : [];

    let ageGroupLabel = null;
    if (ageGroup && ageGroupsHomogeneus && ageGroupsSource) {
      ageGroupLabel =
        seriesAgeGroups.find((g) => g._id === ageGroup)?.label || null;
    }

    // Calcula SOR individual de cada competición
    const compSORs = await Promise.all(
      competitions.map(async (comp) => {
        let localAgeGroupId = null;
        if (ageGroupLabel && comp.ageGroupsEnabled) {
          const localGroups = resolveAgeGroups(comp);
          const normalizedTarget = ageGroupLabel.trim().toLowerCase();
          localAgeGroupId =
            localGroups.find(
              (g) => g.label.trim().toLowerCase() === normalizedTarget,
            )?._id || null;
        }
        return {
          comp,
          sor: await calculateSOR(comp._id.toString(), localAgeGroupId),
        };
      }),
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
      const penalty = isF1
        ? 0
        : (sor.absentPenalty ?? (sor.rankings.length + 1) * comp.events.length);
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
      ageGroupsHomogeneus,
      ageGroups: seriesAgeGroups,
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
