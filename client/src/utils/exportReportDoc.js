// ============================================================
// UTILIDAD: exportReportDoc
// Genera un PDF a partir del texto plano del resumen final,
// usando fuente monoespaciada para conservar la alineación de
// columnas (medallas, cifras), y dispara su descarga.
// ============================================================

import jsPDF from "jspdf";

// Los emojis de color no se renderizan en las fuentes estándar de jsPDF,
// así que se sustituyen por texto plano antes de generar el PDF.
const EMOJI_REPLACEMENTS = [
  [/🏆\s*/g, ""],
  [/📅\s*/g, "Fecha: "],
  [/📍\s*/g, "Lugar: "],
  [/🥇/g, "1º"],
  [/🥈/g, "2º"],
  [/🥉/g, "3º"],
  [/🏅\s*/g, ""],
];

const stripEmojisForExport = (text) =>
  EMOJI_REPLACEMENTS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );

/**
 * Generates and downloads the report as a PDF document.
 * @param {string} reportText - The report content to include in the document.
 * @param {string} competitionName - The competition name used to create the file name.
 */
export function downloadReportAsPDF(reportText, competitionName) {
  const plainText = stripEmojisForExport(reportText || "");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const lineHeight = 13;
  const fontSize = 9;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;

  doc.setFont("courier", "normal");
  doc.setFontSize(fontSize);

  let y = margin;
  plainText.split("\n").forEach((line) => {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    wrapped.forEach((wrappedLine) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(wrappedLine, margin, y);
      y += lineHeight;
    });
  });

  const safeName = (competitionName || "competicion").replace(/[^\w-]+/g, "_");
  doc.save(`Resumen_${safeName}.pdf`);
}
