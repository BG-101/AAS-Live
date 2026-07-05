/**
 * Genera y descarga un CSV con los resultados de una ronda.
 *
 * @param {Array} results - Array de resultados procesados
 * @param {string} event - Nombre del evento (ej: "3x3")
 * @param {number} round - Número de ronda
 * @param {string} roundFormat - Formato ("a", "m", "b")
 * @param {Function} formatTime - Función de formateo de tiempos
 */
export function exportResultsToCSV(
  results,
  event,
  round,
  roundFormat,
  formatTime,
) {
  const avgLabel =
    roundFormat === "a" ? "Ao5" : roundFormat === "m" ? "Mo3" : "Best";
  const attemptsCount = roundFormat === "a" ? 5 : 3;

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
      formatTime(roundFormat === "b" ? res.best : res.average) || "",
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
