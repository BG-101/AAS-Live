// ============================================================
// UTILIDAD: exportReportDoc
// Genera un .doc (HTML con mimetype de Word) a partir del texto
// plano del resumen final, y dispara su descarga.
// ============================================================

const escapeHtml = (str) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Los emojis dependen de fuentes de color que no están garantizadas en el
// visor de Word (y menos con una fuente monoespaciada como Courier New),
// así que se sustituyen por texto plano solo en el documento exportado.
const EMOJI_REPLACEMENTS = [
  [/🏆\s*/g, ""],
  [/📅\s*/g, "Fecha: "],
  [/📍\s*/g, "Lugar: "],
  [/🥇/g, "1º"],
  [/🥈/g, "2º"],
  [/🥉/g, "3º"],
  [/🏅\s*/g, ""],
];

const stripEmojisForWord = (text) =>
  EMOJI_REPLACEMENTS.reduce(
    (acc, [CanvasPattern, replacement]) =>
      acc.replace(CanvasPattern, replacement),
    text,
  );

/**
 * @param {string} reportText - Texto plano generado por buildClosingReport
 * @param {string} competitionName - Usado para el nombre del archivo descargado
 */
export function downloadReportAsWord(reportText, competitionName) {
  const htmlBody = stripEmojisForWord(reportText || "")
    .split("\n")
    .map(escapeHtml)
    .join("<br>");

  // Namespaces o:/w: son los que Word reconoce para tratar el HTML
  // como documento nativo en vez de abrirlo con el navegador embebido.
  const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>Resumen Final</title></head>
<body style="font-family:'Courier New',monospace; white-space:pre-wrap; font-size:12pt;">
${htmlBody}
</body>
</html>`;

  const blob = new Blob(["\ufeff" + htmlContent], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safeName = (competitionName || "competicion").replace(/[^\w-]+/g, "_");
  link.download = `Resumen_${safeName}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}
