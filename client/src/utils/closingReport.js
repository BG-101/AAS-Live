import axios from "axios";
import { API_URL } from "./api";
import {
  formatTime,
  formatDateRange,
  shouldUseBestAsResult,
  getRoundFormatMeta,
  resolveCompetitorAge,
} from "./formatters";

const MEDALS = ["🥇", "🥈", "🥉"];

const isInGroup = (competitor, group, referenceDate) => {
  const age = resolveCompetitorAge(competitor, referenceDate);
  if (age === null || age === undefined) return false;
  if (group.minAge != null && group.maxAge != null)
    return age >= group.minAge && age <= group.maxAge;
  if (group.maxAge != null) return age <= group.maxAge;
  if (group.minAge != null) return age >= group.minAge;
  return false;
};

const pickBestRound = (rounds, event) => {
  const forEvent = rounds.filter((r) => r.event === event);
  const finished = forEvent
    .filter((r) => r.status === "Finished")
    .sort((a, b) => b.roundNumber - a.roundNumber);
  return (
    finished[0] ||
    forEvent.sort((a, b) => b.roundNumber - a.roundNumber)[0] ||
    null
  );
};

const medalLines = (entries, valueSuffix = "") =>
  entries
    .slice(0, 3)
    .map((e, i) => `${MEDALS[i]} ${e.name} - ${e.value}${valueSuffix}`);

// ── Top 3 por evento (+ por grupo de edad) ──
const buildEventBlock = async (competition) => {
  const lines = [];
  for (const event of competition.events) {
    const round = pickBestRound(competition.rounds, event);
    if (!round) continue;

    const { data: results } = await axios.get(
      `${API_URL}/api/results/${competition._id}/${event}/${round.roundNumber}`,
    );
    const withValue = results.map((r) => ({
      name: r.competitor.name,
      competitor: r.competitor,
      value: formatTime(
        shouldUseBestAsResult(round.format) ? r.best : r.average,
      ),
    }));
    if (withValue.length === 0) continue;

    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(`EVENTO ${event} (${getRoundFormatMeta(round.format).label})`);
    lines.push("━━━━━━━━━━━━━━━━━━━━", ...medalLines(withValue));

    if (competition.ageGroupsEnabled && competition.resolvedAgeGroups?.length) {
      competition.resolvedAgeGroups.forEach((group) => {
        const inGroup = withValue.filter((e) =>
          isInGroup(e.competitor, group, competition.startDate),
        );
        if (inGroup.length === 0) return;
        lines.push(
          "",
          `  ${group.label}:`,
          ...medalLines(inGroup).map((l) => `  ${l}`),
        );
      });
    }
    lines.push("");
  }
  return lines;
};

// ── Top 3 SOR (+ por grupo de edad) ──
const buildSORBlock = async (competition) => {
  if (!competition.sorEnabled) return [];
  const { data } = await axios.get(`${API_URL}/api/sor/${competition._id}`);
  if (data.rankings.length === 0) return [];
  const suffix = data.scoringSystem === "f1" ? " pts" : " pts SOR";

  const lines = ["━━━━━━━━━━━━━━━━━━━━", "🏅 SOR", "━━━━━━━━━━━━━━━━━━━━"];
  lines.push(
    ...medalLines(
      data.rankings.map((r) => ({ name: r.name, value: r.totalScore })),
      suffix,
    ),
  );

  if (competition.ageGroupsEnabled && data.ageGroups?.length) {
    for (const group of data.ageGroups) {
      const { data: g } = await axios.get(
        `${API_URL}/api/sor/${competition._id}?ageGroup=${group._id}`,
      );
      if (g.rankings.length === 0) continue;
      lines.push("", `  ${group.label}:`);
      lines.push(
        ...medalLines(
          g.rankings.map((r) => ({ name: r.name, value: r.totalScore })),
          suffix,
        ).map((l) => `  ${l}`),
      );
    }
  }
  lines.push("");
  return lines;
};

// ── SOR de serie, solo si esta es la última competición (por endDate) ──
const buildSeriesSORBlock = async (competition) => {
  if (!competition.series?.trim()) return [];

  const { data: allComps } = await axios.get(`${API_URL}/api/competitions`);
  const seriesComps = allComps.filter((c) => c.series === competition.series);
  if (seriesComps.length === 0) return [];

  const latest = seriesComps.reduce((a, b) =>
    new Date(a.endDate) > new Date(b.endDate) ? a : b,
  );
  if (latest._id !== competition._id) return []; // No es la última

  const { data } = await axios.get(
    `${API_URL}/api/sor/series/${encodeURIComponent(competition.series)}`,
  );
  if (data.rankings.length === 0) return [];
  const suffix = data.scoringSystem === "f1" ? " pts" : " pts SOR";

  const lines = [
    "━━━━━━━━━━━━━━━━━━━━",
    `🏆 SOR DE LA SERIE (${competition.series})`,
    "━━━━━━━━━━━━━━━━━━━━",
  ];
  lines.push(
    ...medalLines(
      data.rankings.map((r) => ({ name: r.name, value: r.totalScore })),
      suffix,
    ),
  );

  if (
    data.ageGroupsEnabled &&
    data.ageGroupsHomogeneus &&
    data.ageGroups?.length
  ) {
    for (const group of data.ageGroups) {
      const { data: g } = await axios.get(
        `${API_URL}/api/sor/series/${encodeURIComponent(competition.series)}?ageGroup=${group._id}`,
      );
      if (g.rankings.length === 0) continue;
      lines.push("", `  ${group.label}:`);
      lines.push(
        ...medalLines(
          g.rankings.map((r) => ({ name: r.name, value: r.totalScore })),
          suffix,
        ).map((l) => `  ${l}`),
      );
    }
  }
  lines.push("");
  return lines;
};

export const buildClosingReport = async (competition) => {
  const header = [
    `🏆 RESUMEN FINAL - ${competition.name}`,
    `📅 ${formatDateRange(competition.startDate, competition.endDate)} · 📍 ${competition.location}`,
    "",
  ];
  const [eventLines, sorLines, seriesLines] = await Promise.all([
    buildEventBlock(competition),
    buildSORBlock(competition),
    buildSeriesSORBlock(competition),
  ]);
  return [...header, ...eventLines, ...sorLines, ...seriesLines].join("\n");
};
