import { getRoundFormatMeta, shouldUseBestAsResult } from "./formatters";

/**
 * Generates and downloads a CSV file containing the results of a round.
 *
 * @param {Array} results - The processed competitor results.
 * @param {string} event - The event name used in the output filename.
 * @param {number} round - The round number used in the output filename.
 * @param {string} roundFormat - The round format that determines the attempt columns and final-result value.
 * @param {Function} formatTime - Formats attempt and result times for CSV output.
 */
export function exportResultsToCSV(
  results,
  event,
  round,
  roundFormat,
  formatTime,
) {
  const { label: avgLabel, attempts: attemptsCount } =
    getRoundFormatMeta(roundFormat);

  // Cabecera
  const headers = [
    "Posición",
    "Nombre",
    "WCA ID",
    ...Array.from({ length: attemptsCount }, (_, i) => `T${i + 1}`),
    avgLabel,
  ];

  // Filas
  const rows = results.map((res, index) => {
    const paddedTimes = [...res.times];
    while (paddedTimes.length < attemptsCount) paddedTimes.push(0);

    return [
      index + 1,
      `"${res.competitor.name}"`, // Comillas por si hay comas en el nombre
      res.competitor.wcaId || "",
      ...paddedTimes.map((t) => formatTime(t) || ""),
      formatTime(shouldUseBestAsResult(roundFormat) ? res.best : res.average) ||
        "",
    ];
  });

  const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");

  // Descarga
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event}_Ronda${round}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
