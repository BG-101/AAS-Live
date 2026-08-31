import React from "react";
import { toast } from "../utils/toast";
import { downloadReportAsWord } from "../utils/exportReportDoc";

/**
 * Displays the competition's final report in a modal with copy and download actions.
 * @param {boolean} show - Whether to display the modal.
 * @param {Function} onClose - Called when the modal is closed.
 * @param {string} reportText - The report content to display and export.
 * @param {boolean} loading - Whether the report is still being generated.
 * @param {string} competitionName - The competition name used for the downloaded document.
 * @returns {JSX.Element|null} The report modal, or null when it is hidden.
 */
export default function ClosingReportModal({
  show,
  onClose,
  reportText,
  loading,
  competitionName,
}) {
  if (!show) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      toast("Resumen copiado al portapapeles", "success");
    } catch {
      toast("No se pudo copiar; selecciona y copia a mano", "error");
    }
  };

  const handleDownloadWord = () => {
    downloadReportAsWord(reportText, competitionName);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col text-gray-800">
        <div className="p-4 border-b flex justify-between items-center bg-gray-100 rounded-t-lg shrink-0">
          <h2 className="text-xl font-bold">
            📄 Resumen Final de la Competición
          </h2>
          <button
            onClick={onClose}
            className="text-red-500 font-bold text-3xl leading-none hover:text-red-700"
          >
            &times;
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-center text-gray-400 py-10">
              Generando resumen...
            </p>
          ) : (
            <textarea
              readOnly
              className="w-full h-96 border rounded p-3 font-mono text-xs whitespace-pre bg-gray-50"
              value={reportText}
            />
          )}
        </div>

        <div className="p-4 border-t flex gap-2 shrink-0">
          <button
            onClick={handleCopy}
            disabled={loading}
            className="flex-1 bg-gray-800 text-white font-bold py-2 rounded hover:bg-gray-700 disabled:opacity-50"
          >
            📋 Copiar
          </button>
          <button
            onClick={handleDownloadWord}
            disabled={loading}
            className="flex-1 bg-almeria-orange text-white font-bold py-2 rounded hover:bg-orange-600 disabled:opacity-50"
          >
            📝 Descargar Word
          </button>
        </div>
      </div>
    </div>
  );
}
