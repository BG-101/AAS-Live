// ============================================================
// COMPONENTE: ResultsTable
// Tabla de resultados de una ronda. Muestra la clasificación
// con colores que indican el estado de cada competidor:
// - Verde: clasificado para la siguiente ronda
// - Azul: posiblemente clasificado (faltan competidores por registrar)
// - Oro/Plata/Bronce: podio en la ronda final
// ============================================================

import React, { useState } from "react";

/**
 * @param {Array} results - Array de resultados ordenados por posición
 * @param {number} attemptsCount - Número de intentos (5 para Ao5, 3 para Mo3/Bo3)
 * @param {string} roundFormat - Formato de la ronda ("a", "m", "b")
 * @param {boolean} isRoundFinished - Si la ronda está cerrada/finalizada
 * @param {boolean} isFinalRound - Si es la ronda final (sin avance, advancementValue = 0)
 * @param {number} faltantes - Competidores que aún no tienen tiempos registrados
 * @param {number} participantesQueClasifican - Número de competidores que avanzan
 * @param {number} selectedRound - Número de ronda actual (para mensajes)
 * @param {string} selectedEvent - Evento actual (para mensajes)
 * @param {Function} formatTime - Función para formatear un tiempo
 * @param {Function} formatWCATimesArray - Función para formatear array de tiempos WCA
 */

// ============================================================
// Panel de detalle móvil (bottom sheet)
// Muestra los tiempos completos de un competidor al pulsar su fila.
// ============================================================
function MobileDetailSheet({
  result,
  roundFormat,
  attemptsCount,
  formatTime,
  formatWCATimesArray,
  onClose,
}) {
  if (!result) return null;

  const paddedTimes = [...result.times];
  while (paddedTimes.length < attemptsCount) paddedTimes.push(0);
  const formattedTimes = formatWCATimesArray(paddedTimes, roundFormat);
  const avgLabel =
    roundFormat === "a" ? "Ao5" : roundFormat === "m" ? "Mo3" : "Best";
  const avgValue = formatTime(
    roundFormat === "b" ? result.best : result.average,
  );

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-60 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl p-6 animate-slide-up">
        {/* Cabecera de la sheet */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">
              Tiempos completos
            </p>
            <h3 className="text-xl font-black text-gray-900 leading-tight">
              {result.competitor.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-3xl leading-none font-bold mt-1"
          >
            &times;
          </button>
        </div>

        {/* Intentos individuales */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {formattedTimes.map((t, i) => {
            if (!t) return null;
            const isDimmed = t.includes("(");
            return (
              <div
                key={i}
                className={`flex-1 min-w-[52px] text-center rounded-lg py-3 ${
                  isDimmed
                    ? "bg-gray-100 text-gray-400"
                    : "bg-almeria-dark text-white"
                }`}
              >
                <p className="text-xs font-bold text-gray-400 mb-1">{i + 1}</p>
                <p
                  className={`text-base font-black font-mono ${isDimmed ? "text-gray-400" : "text-white"}`}
                >
                  {isDimmed ? t.replace("(", "").replace(")", "") : t}
                </p>
              </div>
            );
          })}
        </div>

        {/* Resultado final */}
        <div className="bg-almeria-orange rounded-xl py-3 text-center">
          <p className="text-xs font-bold text-orange-100 mb-0.5">{avgLabel}</p>
          <p className="text-3xl font-black text-white font-mono">
            {avgValue || "-"}
          </p>
        </div>
      </div>
    </>
  );
}

// ============================================================
// COMPONENTE: ResultsTable
// ============================================================
export default function ResultsTable({
  results,
  attemptsCount,
  roundFormat,
  isRoundFinished,
  isFinalRound,
  faltantes,
  participantesQueClasifican,
  selectedRound,
  selectedEvent,
  formatTime,
  formatWCATimesArray,
  suppressAdvanceColors = false,
  isWritableAdmin = false,
  onToggleWithdrawal = null,
}) {
  const [selectedResult, setSelectedResult] = useState(null);

  const avgLabel =
    roundFormat === "a" ? "Ao5" : roundFormat === "m" ? "Mo3" : "Best";

  // Calcula el rowClass
  const getRowClass = (res, posicion) => {
    let base = "transition";
    if (isFinalRound) {
      if (posicion === 1)
        return isRoundFinished
          ? `${base} bg-yellow-300 hover:bg-yellow-400 font-bold`
          : `${base} bg-blue-200 hover:bg-blue-300 font-bold`;
      if (posicion === 2)
        return isRoundFinished
          ? `${base} bg-gray-300 hover:bg-gray-400 font-bold`
          : `${base} bg-blue-100 hover:bg-blue-200 font-bold`;
      if (posicion === 3)
        return isRoundFinished
          ? `${base} bg-orange-300 hover:bg-orange-400 font-bold`
          : `${base} bg-blue-50 hover:bg-blue-100 font-bold`;
      return `${base} bg-white hover:bg-orange-50 text-black`;
    }
    if (!suppressAdvanceColors && res.advances) {
      if (isRoundFinished) return `${base} bg-green-100 hover:bg-green-200`;
      return posicion + faltantes <= participantesQueClasifican
        ? `${base} bg-green-100 hover:bg-green-200`
        : `${base} bg-blue-100 hover:bg-blue-200`;
    }
    return `${base} bg-white hover:bg-orange-50 text-black`;
  };

  return (
    <>
      {/* ── VISTA MÓVIL ── */}
      <div className="block md:hidden bg-white text-gray-900 rounded-b-lg rounded-tr-lg shadow-xl overflow-hidden">
        {results.length === 0 ? (
          <div className="p-10 text-center text-gray-500 flex flex-col items-center">
            <span className="text-4xl mb-2">⏱️</span>
            <p>No hay resultados en {selectedEvent} todavía.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {results.map((res, index) => {
              const posicion = index + 1;
              const avgValue = formatTime(
                roundFormat === "b" ? res.best : res.average,
              );
              const rowClass = getRowClass(res, posicion);

              return (
                <li
                  key={res._id}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70 ${rowClass}`}
                  onClick={() => setSelectedResult(res)}
                >
                  {/* Posición */}
                  <span className="text-gray-400 font-black text-sm w-5 shrink-0 text-center">
                    {posicion}
                  </span>

                  {/* Nombre - se parte en líneas si es largo */}
                  <span className="font-bold text-sm flex-1 leading-snug break-words min-w-0">
                    {res.competitor.name}
                  </span>

                  {/* Media */}
                  <span className="font-black text-base text-almeria-dark font-mono shrink-0">
                    {avgValue || "-"}
                  </span>

                  {/* Indicador de que hay más info */}
                  <span className="text-gray-300 text-sm shrink-0">›</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── VISTA DESKTOP ── */}
      <div className="hidden md:block bg-white text-gray-900 rounded-b-lg rounded-tr-lg overflow-auto shadow-xl max-h-[70vh]">
        <table className="w-full text-left min-w-max relative">
          {/* Cabecera sticky: se mantiene visible al hacer scroll */}
          <thead className="sticky top-0 z-20 shadow-sm">
            <tr>
              {/* Columna de posición (#) */}
              <th className="p-4 w-12 text-center bg-gray-100 border-b-2 border-gray-300 uppercase text-xs font-bold text-gray-600">
                #
              </th>

              {/* Columna de nombre */}
              <th className="p-4 bg-gray-100 border-b-2 border-gray-300 uppercase text-xs font-bold text-gray-600">
                Nombre
              </th>

              {/* Columnas de intentos (1, 2, 3...) */}
              {Array.from({ length: attemptsCount }).map((_, i) => (
                <th
                  key={i}
                  className="p-4 text-center bg-gray-100 border-b-2 border-gray-300 text-xs font-bold text-gray-600"
                >
                  {i + 1}
                </th>
              ))}

              {/* Columna de resultado: muestra Ao5, Mo3 o Best según el formato */}
              <th className="p-4 text-right bg-gray-100 border-b-2 border-gray-300 text-xs font-bold text-gray-600">
                {avgLabel}
              </th>

              {isWritableAdmin && !isRoundFinished && (
                <th className="p-4 text-center bg-gray-100 border-b-2 border-gray-300 text-xs font-bold text-gray-600 w-24">
                  Baja
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {results.map((res, index) => {
              // Rellena los tiempos con ceros si faltan intentos
              const paddedTimes = [...res.times];
              while (paddedTimes.length < attemptsCount) paddedTimes.push(0);

              // Formatea los tiempos (con paréntesis en best/worst para Ao5)
              const formattedTimes = formatWCATimesArray(
                paddedTimes,
                roundFormat,
              );

              const posicion = index + 1;

              // --- Determina el color de la fila según la posición y estado ---
              const rowClass = getRowClass(res, posicion);

              return (
                <tr key={res._id} className={rowClass}>
                  {/* Posición en la clasificación */}
                  <td className="p-4 text-center font-bold text-gray-500">
                    {posicion}
                  </td>

                  {/* Nombre del competidor */}
                  <td className="p-4 font-bold whitespace-nowrap">
                    {res.competitor.name}
                  </td>

                  {/* Tiempos individuales (con paréntesis si son best/worst en Ao5) */}
                  {formattedTimes.map((t, i) => (
                    <td
                      key={i}
                      className={`p-4 text-center text-sm ${t?.includes("(") ? "text-gray-400" : "font-medium"}`}
                    >
                      {t}
                    </td>
                  ))}

                  {/* Resultado final: average (Ao5/Mo3) o best (Bo3) */}
                  <td className="p-4 text-right font-black text-lg text-almeria-dark">
                    {formatTime(roundFormat === "b" ? res.best : res.average)}
                  </td>

                  {isWritableAdmin && !isRoundFinished && (
                    <td className="p-4 text-center">
                      {(() => {
                        const withdrawn =
                          res.competitor?.withdrawals?.some(
                            (w) =>
                              w.event === selectedEvent &&
                              w.fromRound === selectedRound + 1,
                          ) || false;

                        return (
                          <button
                            onClick={() =>
                              onToggleWithdrawal?.(
                                res.competitor._id,
                                selectedEvent,
                                selectedRound + 1,
                                !withdrawn,
                              )
                            }
                            title={
                              withdrawn
                                ? "Restaurar clasificación"
                                : "Marcar como retirado de la siguiente ronda"
                            }
                            className={`px-2 py-1 rounded text-xs font-bold transition ${
                              withdrawn
                                ? "bg-red-100 text-red-700 border border-red-300 hover:bg-red-200"
                                : "bg-gray-100 text-gray-500 border border-gray-300 hover:bg-red-100 hover:text-red-600"
                            }`}
                          >
                            {withdrawn ? "🚫 Retirado" : "✓ Activo"}
                          </button>
                        );
                      })()}
                    </td>
                  )}
                </tr>
              );
            })}

            {/* Mensaje cuando no hay resultados */}
            {results.length === 0 && (
              <tr>
                <td
                  colSpan={
                    2 +
                    attemptsCount +
                    1 +
                    (isWritableAdmin && !isRoundFinished ? 1 : 0)
                  }
                  className="p-10 text-center text-gray-500"
                >
                  <span className="text-4xl block mb-2">⏱️</span>
                  No hay resultados registrados en {selectedEvent} todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom sheet de detalle */}
      {selectedResult && (
        <MobileDetailSheet
          result={selectedResult}
          roundFormat={roundFormat}
          attemptsCount={attemptsCount}
          formatTime={formatTime}
          formatWCATimesArray={formatWCATimesArray}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </>
  );
}
