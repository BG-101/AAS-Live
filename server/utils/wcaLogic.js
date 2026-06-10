// ============================================================
// LÓGICA WCA (World Cube Association)
// Contiene las funciones de negocio para calcular estadísticas
// de tiempos, ordenar resultados y gestionar los avances entre
// rondas siguiendo las reglas de la WCA.
// ============================================================

const Competitor = require("../models/Competitor");
const Result = require("../models/Result");
const Competition = require("../models/Competition");

// ============================================================
// calculateStats(times, format)
// Calcula el "best" (mejor tiempo) y el "average" (promedio)
// de un array de tiempos según el formato de la ronda.
//
// Convenciones de tiempos:
//   - Positivo: tiempo válido en centésimas de segundo
//   - -1: DNF (Did Not Finish)
//   - -2: DNS (Did Not Start)
//   -  0: intento vacío (aún no realizado)
//
// Formatos de ronda:
//   "a" → Average of 5 (Ao5): se descartan el mejor y el peor, media de los 3 centrales
//   "m" → Mean of 3 (Mo3): media aritmética de los 3 intentos
//   "b" → Best of 3 (Bo3): solo cuenta el mejor tiempo, sin average
// ============================================================
const calculateStats = (times, format) => {
  // --- Calcular el mejor tiempo (best) ---
  // Se busca el mínimo entre los tiempos positivos (>0 descarta DNF, DNS y vacíos)
  let best = Infinity;
  times.forEach((t) => {
    if (t > 0 && t < best) best = t;
  });
  // Si no hubo ningún tiempo válido, best = -1 (equivalente a "sin mejor tiempo")
  best = best === Infinity ? -1 : best;

  // --- Calcular el promedio (average) según el formato ---
  let average = 0;
  let dnfCount = 0; // Contador de DNF/DNS
  let validTimes = []; // Tiempos para ordenar (DNF/DNS se convierten en Infinity)

  times.forEach((t) => {
    if (t === -1 || t === -2) {
      dnfCount++;
      validTimes.push(Infinity); // Los DNF/DNS van al fondo al ordenar
    } else {
      validTimes.push(t);
    }
  });

  if (format === "a") {
    // --- Ao5 (Average of 5) ---
    // Necesita exactamente 5 intentos, ninguno vacío (0)
    if (!times || times.length !== 5 || times.includes(0))
      return { best, average: 0 }; // Incompleto, no se puede calcular

    // Si hay más de 1 DNF/DNS, el average es DNF
    if (dnfCount > 1) return { best, average: -1 };

    // Se ordenan, se descartan el mejor [0] y el peor [4], y se promedian los 3 centrales
    validTimes.sort((a, b) => a - b);
    const sum = validTimes[1] + validTimes[2] + validTimes[3];
    average = Math.round(sum / 3);
  } else if (format === "m") {
    // --- Mo3 (Mean of 3) ---
    // Necesita exactamente 3 intentos, ninguno vacío
    if (!times || times.length !== 3 || times.includes(0))
      return { best, average: 0 };

    // Si hay algún DNF/DNS, el average es DNF (no se descarta nada en Mo3)
    if (dnfCount > 0) return { best, average: -1 };

    // Media aritmética simple de los 3 intentos
    const sum = validTimes[0] + validTimes[1] + validTimes[2];
    average = Math.round(sum / 3);
  } else if (format === "b") {
    // --- Bo3 (Best of 3) ---
    // No tiene average, solo se usa el best
    average = 0;
  }

  return { best, average };
};

// ============================================================
// sortResultsWCA(results)
// Ordena los resultados siguiendo las reglas WCA:
//   1. Primero por average (menor es mejor)
//   2. Empates se rompen por best (menor es mejor)
//   3. DNF (-1) y DNS (-2) van al final
// ============================================================
const sortResultsWCA = (results) => {
  return [...results].sort((a, b) => {
    // Convierte valores especiales a pesos altos para que vayan al final
    // -1 (DNF) → 9999999, -2 (DNS/sin resultado) → 8888888
    const getWeight = (val) => (val > 0 ? val : val === -1 ? 9999999 : 8888888);
    const avgA = getWeight(a.average);
    const avgB = getWeight(b.average);

    // Primero ordena por average
    if (avgA !== avgB) return avgA - avgB;

    // Si empatan en average, desempata por best
    return getWeight(a.best) - getWeight(b.best);
  });
};

// ============================================================
// getEligibleCount(compId, event, round)
// Calcula cuántos competidores son elegibles para una ronda.
//
// - Ronda 1: todos los inscritos en ese evento
// - Ronda > 1: se miran los resultados de la ronda anterior
//   y se aplican las reglas de avance (por ranking o porcentaje)
// ============================================================
async function getEligibleCount(compId, event, round) {
  if (round === 1) {
    // Ronda 1: cuenta todos los competidores inscritos en el evento (no borrados)
    return await Competitor.countDocuments({
      competition: compId,
      events: event,
      isDeleted: { $ne: true },
    });
  }

  // Ronda > 1: obtiene los resultados de la ronda anterior
  const prevRoundNum = round - 1;
  const prevResults = await Result.find({
    competition: compId,
    event: event,
    round: prevRoundNum,
  })
    // Populate filtra competidores borrados (devuelve null si isDeleted)
    .populate({ path: "competitor", match: { isDeleted: { $ne: true } } })
    .lean();

  // Descarta resultados cuyo competidor fue borrado (populate devolvió null)
  const validPrevResults = prevResults.filter((r) => r.competitor !== null);

  // Busca la configuración de la ronda anterior (tipo y valor de avance)
  const comp = await Competition.findById(compId);
  const prevRound = comp.rounds.find(
    (r) => r.event === event && r.roundNumber === prevRoundNum,
  );

  if (!prevRound) return 0;

  // Cuenta solo los competidores que tuvieron al menos un tiempo válido (best > 0)
  const validCompetitors = validPrevResults.filter((r) => r.best > 0).length;

  if (prevRound.advancementType === "ranking") {
    // Avance por ranking fijo: avanza el top N (o menos si no hay suficientes)
    return Math.min(prevRound.advancementValue, validCompetitors);
  } else if (prevRound.advancementType === "percent") {
    // Avance por porcentaje: avanza un % del total de elegibles de esa ronda
    const prevTotal = await getEligibleCount(compId, event, prevRoundNum);
    return Math.floor(prevTotal * (prevRound.advancementValue / 100));
  }

  return 0;
}

// ============================================================
// getEligibleCountByAgeGroup(compId, event, round, ageGroupKey)
// Versión age-aware de getEligibleCount. Cuenta solo los
// competidores elegibles que pertenecen al grupo de edad dado.
// ============================================================
async function getEligibleCountByAgeGroup(compId, event, round, ageGroupKey) {
  if (round === 1) {
    const allInEvent = await Competitor.find({
      competition: compId,
      events: event,
      isDeleted: { $ne: true },
    }).lean();
    return filterByAgeGroup(allInEvent, ageGroupKey).length;
  }

  const prevRoundNum = round - 1;
  const prevResults = await Result.find({
    competition: compId,
    event,
    round: prevRoundNum,
  })
    .populate({ path: "competitor", match: { isDeleted: { $ne: true } } })
    .lean();

  const validPrevResults = prevResults
    .filter((r) => r.competitor !== null)
    .filter((r) => filterByAgeGroup([r.competitor], ageGroupKey).length > 0);

  const comp = await Competition.findById(compId);
  const prevRound = comp.rounds.find(
    (r) => r.event === event && r.roundNumber === prevRoundNum,
  );
  if (!prevRound) return 0;

  const validCompetitors = validPrevResults.filter((r) => r.best > 0).length;

  if (prevRound.advancementType === "ranking") {
    return Math.min(prevRound.advancementValue, validCompetitors);
  } else if (prevRound.advancementType === "percent") {
    const prevTotal = await getEligibleCountByAgeGroup(
      compId,
      event,
      prevRoundNum,
      ageGroupKey,
    );
    return Math.floor(prevTotal * (prevRound.advancementValue / 100));
  }

  return 0;
}

// ============================================================
// isWithdrawnFromNextRound(competitor, event, currentRound)
// Comprueba si un competidor está retirado para la siguiente
// ronda, es decir, si no puede avanzar desde la ronda actual.
// ============================================================
const isWithdrawnFromNextRound = (competitor, event, currentRound) => {
  if (!competitor?.withdrawals?.length) return false;
  return competitor.withdrawals.some(
    (w) => w.event === event && w.fromRound === currentRound + 1,
  );
};

// ============================================================
// processAdvancements(results, compId, event, roundObj, roundNum)
// Procesa los resultados de una ronda: los ordena y marca
// cuáles avanzan a la siguiente ronda según la configuración.
//
// Cada resultado recibe una propiedad "advances" (true/false).
// ============================================================
async function processAdvancements(
  results,
  compId,
  event,
  roundObj,
  roundNum,
  ageGroupsEnabled = false,
) {
  // Ordena los resultados según las reglas WCA
  const sortedResults = sortResultsWCA(results);
  const currentRound = parseInt(roundNum);

  // Ronda final o sin configuración de avance
  if (!roundObj || roundObj.advancementValue === 0) {
    sortedResults.forEach((res) => (res.advances = false));
    return sortedResults;
  }

  if (!ageGroupsEnabled) {
    // ── Lógica original sin grupos de edad ──
    const totalParticipantes = await getEligibleCount(
      compId,
      event,
      currentRound,
    );
    const cutoffIndex =
      roundObj.advancementType === "ranking"
        ? Math.min(roundObj.advancementValue, totalParticipantes)
        : Math.floor(totalParticipantes * (roundObj.advancementValue / 100));

    // Rellena slots en orden WCA, saltando retirados y DNF/DNS
    let slotsRemaining = cutoffIndex;
    sortedResults.forEach((res) => {
      const withdrawn = isWithdrawnFromNextRound(
        res.competitor,
        event,
        currentRound,
      );
      if (slotsRemaining > 0 && res.best > 0 && !withdrawn) {
        res.advances = true;
        slotsRemaining--;
      } else {
        res.advances = false;
      }
    });

    return sortedResults;
  }

  // ── Lógica con grupos de edad ──
  // Inicializa todos como "no clasificados"
  sortedResults.forEach((res) => (res.advances = false));

  for (const groupKey of Object.keys(AGE_GROUPS)) {
    // Filtra los resultados de este grupo preservando el orden WCA
    const groupResults = sortedResults.filter(
      (r) => filterByAgeGroup([r.competitor], groupKey).length > 0,
    );
    if (groupResults.length === 0) continue;

    const totalInGroup = await getEligibleCountByAgeGroup(
      compId,
      event,
      currentRound,
      groupKey,
    );

    const cutoffIndex =
      roundObj.advancementType === "ranking"
        ? Math.min(roundObj.advancementValue, totalInGroup)
        : Math.floor(totalInGroup * (roundObj.advancementValue / 100));

    // Marca clasificados dentro del grupo (el orden relativo ya es WCA)
    let slotsRemaining = cutoffIndex;
    groupResults.forEach((res) => {
      const withdrawn = isWithdrawnFromNextRound(
        res.competitor,
        event,
        currentRound,
      );
      if (slotsRemaining > 0 && res.best > 0 && !withdrawn) {
        res.advances = true;
        slotsRemaining--;
      } else {
        res.advances = false;
      }
    });
  }

  return sortedResults;
}

// ============================================================
// CONSTANTES DE GRUPOS DE EDAD
// Alevín ≤10 | Infantil 11-15 | Absoluta ≥16
// ============================================================
const AGE_GROUPS = {
  alevin: { label: "Alevín", maxAge: 10 },
  infantil: { label: "Infantil", minAge: 11, maxAge: 15 },
  absoluta: { label: "Absoluta", minAge: 16 },
};

// Puntos F1 por posición (índice 0 = 1er puesto)
const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// ============================================================
// filterByAgeGroup(competitors, groupKey)
// Filtra un array de competidores (lean) según el grupo de edad.
// ============================================================
const filterByAgeGroup = (competitors, groupKey) => {
  if (!groupKey) return competitors;
  const group = AGE_GROUPS[groupKey];
  if (!group) return competitors;
  return competitors.filter((c) => {
    const age = c.age;
    if (age === null || age === undefined) return false;
    if (group.minAge !== undefined && group.maxAge !== undefined)
      return age >= group.minAge && age <= group.maxAge;
    if (group.maxAge !== undefined) return age <= group.maxAge;
    if (group.minAge !== undefined) return age >= group.minAge;
    return false;
  });
};

// ============================================================
// calculateSOR(compId, ageGroup?)
// Calcula el Sum of Ranks de una competición.
//
// Para cada evento:
//   1. Busca la ronda finalizada (status "Finished") de mayor número.
//   2. Ordena sus resultados por reglas WCA dentro del grupo de edad.
//   3. Asigna rangos (1, 2, 3...). DNF/DNS o ausente = (válidos + 1).
//   4. Acumula los rangos por competidor.
//
// @param {string} compId - ID de la competición
// @param {string|null} ageGroup - "alevin", "infantil", "absoluta" o null
// @returns {{ rankings: Array, events: string[] }}
// ============================================================
async function calculateSOR(compId, ageGroup = null) {
  const comp = await Competition.findById(compId);
  if (!comp) throw new Error("Competición no encontrada");

  const isF1 = (comp.scoringSystem || "sor") === "f1";

  // Obtiene todos los competidores activos, filtrando por edad si procede
  let allCompetitors = await Competitor.find({
    competition: compId,
    isDeleted: { $ne: true },
  }).lean();

  if (ageGroup) allCompetitors = filterByAgeGroup(allCompetitors, ageGroup);
  if (allCompetitors.length === 0)
    return {
      rankings: [],
      events: [],
      scoringSystem: comp.scoringSystem || "sor",
    };

  // Mapa por ID para acumular rangos
  const competitorMap = {};
  allCompetitors.forEach((c) => {
    competitorMap[c._id.toString()] = {
      competitorId: c._id.toString(),
      name: c.name,
      wcaId: c.wcaId || "",
      age: c.age,
      totalScore: 0,
      eventRanks: {},
    };
  });

  const groupIds = new Set(allCompetitors.map((c) => c._id.toString()));
  const events = comp.events;

  // ── UNA SOLA QUERY: todos los resultados de la competición ──
  // Se agrupa en memoria en lugar de hacer Result.find() por cada evento
  const allResults = await Result.find({ competition: compId })
    .populate({ path: "competitor", match: { isDeleted: { $ne: true } } })
    .lean();

  // Agrupa por evento para acceso 0(1) en el bucle posterior
  const resultsByEvent = {};
  allResults.forEach((r) => {
    if (!r.competitor) return; // Competidor borrado, descartado
    if (!resultsByEvent[r.event]) resultsByEvent[r.event] = [];
    resultsByEvent[r.event].push(r);
  });

  for (const event of events) {
    // Usa la ronda más avanzada disponible:
    // 1. La ronda "Finished" de mayor número (preferida)
    // 2. Si no hay ninguna finalizada, la ronda "In Progress" de mayor número
    const finishedRounds = comp.rounds
      .filter((r) => r.event === event && r.status === "Finished")
      .sort((a, b) => b.roundNumber - a.roundNumber);

    const inProgressRounds = comp.rounds
      .filter((r) => r.event === event && r.status === "In Progress")
      .sort((a, b) => b.roundNumber - a.roundNumber);

    const bestRound = finishedRounds[0] || inProgressRounds[0] || null;

    if (!bestRound) {
      // Sin ninguna ronda: penalización según sistema
      const penalty = isF1 ? 0 : allCompetitors.length + 1;
      allCompetitors.forEach((c) => {
        const cid = c._id.toString();
        competitorMap[cid].eventRanks[event] = penalty;
        competitorMap[cid].totalScore += penalty;
      });
      continue;
    }

    // Filtra en memoria: solo los de esta ronda y del grupo de edad actual
    const roundResults = (resultsByEvent[event] || [])
      .filter((r) => r.round === bestRound.roundNumber)
      .filter((r) => groupIds.has(r.competitor._id.toString()));

    const sorted = sortResultsWCA(roundResults);

    // Número de competidores con resultado válido (best > 0)
    const validCount = sorted.filter((r) => r.best > 0).length;
    // Penalización SOR para ausentes/DNF: validCount + 1
    // Penalización F1 para ausentes/DNF: 0 puntos
    const penaltySOR = allCompetitors.length + 1;

    const rankedIds = new Set();

    sorted.forEach((r, index) => {
      const cid = r.competitor._id.toString();
      let score;

      if (isF1) {
        // F1: puntos por posición si tiempo válido, 0 si DNF/DNS
        score = r.best > 0 ? (F1_POINTS[index] ?? 0) : 0;
      } else {
        // SOR clásico: rango ordinal, penalización si inválido
        score = r.best > 0 ? index + 1 : penaltySOR;
      }

      competitorMap[cid].eventRanks[event] = score;
      competitorMap[cid].totalScore += score;
      rankedIds.add(cid);
    });

    // Competidores que no llegaron a esta ronda
    allCompetitors.forEach((c) => {
      const cid = c._id.toString();
      if (!rankedIds.has(cid)) {
        const absentScore = isF1 ? 0 : penaltySOR;
        competitorMap[cid].eventRanks[event] = absentScore;
        competitorMap[cid].totalScore += absentScore;
      }
    });
  }

  // SOR: menor puntuación = mejor → ascendente
  // F1: mayor puntuación = mejor → descendente
  const rankings = Object.values(competitorMap).sort((a, b) =>
    isF1 ? b.totalScore - a.totalScore : a.totalScore - b.totalScore,
  );

  return { rankings, events, scoringSystem: comp.scoringSystem || "sor" };
}

module.exports = {
  calculateStats,
  processAdvancements,
  sortResultsWCA,
  calculateSOR,
  AGE_GROUPS,
  F1_POINTS,
  filterByAgeGroup,
  getEligibleCountByAgeGroup,
  isWithdrawnFromNextRound,
};
