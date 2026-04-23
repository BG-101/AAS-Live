// ============================================================
// COMPONENTE: ResultsTable
// Tabla de resultados de una ronda. Muestra la clasificación
// con colores que indican el estado de cada competidor:
// - Verde: clasificado para la siguiente ronda
// - Azul: posiblemente clasificado (faltan competidores por registrar)
// - Oro/Plata/Bronce: podio en la ronda final
// ============================================================

import React from "react";

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
  return (
    <div className="bg-white text-gray-900 rounded-b-lg rounded-tr-lg overflow-auto shadow-xl max-h-[70vh]">
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
              {roundFormat === "a"
                ? "Ao5"
                : roundFormat === "m"
                  ? "Mo3"
                  : "Best"}
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
            let rowClass = "bg-white hover:bg-orange-50 transition text-black";

            if (isFinalRound) {
              // RONDA FINAL: colores de podio
              if (posicion === 1)
                rowClass = isRoundFinished
                  ? "bg-yellow-300 hover:bg-yellow-400 font-bold" // 🥇 Oro
                  : "bg-blue-200 hover:bg-blue-300 font-bold";
              else if (posicion === 2)
                rowClass = isRoundFinished
                  ? "bg-gray-300 hover:bg-gray-400 font-bold" // 🥈 Plata
                  : "bg-blue-100 hover:bg-blue-200 font-bold";
              else if (posicion === 3)
                rowClass = isRoundFinished
                  ? "bg-orange-300 hover:bg-orange-400 font-bold" // 🥉 Bronce
                  : "bg-blue-50 hover:bg-blue-100 font-bold";
            } else if (!suppressAdvanceColors && res.advances) {
              // RONDA NO FINAL: colores de clasificación
              if (isRoundFinished)
                // Ronda cerrada: verde = clasificado confirmado
                rowClass = "bg-green-100 hover:bg-green-200 transition";
              else {
                // Ronda en curso: azul = podría cambiar, verde = seguro
                if (posicion + faltantes <= participantesQueClasifican)
                  // Aunque los que faltan queden por delante, sigue clasificado
                  rowClass = "bg-green-100 hover:bg-green-200 transition";
                else
                  // Clasificado pero podría ser desplazado por los que faltan
                  rowClass = "bg-blue-100 hover:bg-blue-200 transition";
              }
            }

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
        </tbody>
      </table>

      {/* Mensaje cuando no hay resultados */}
      {results.length === 0 && (
        <div className="p-10 text-center text-gray-500 flex flex-col items-center">
          <span className="text-4xl mb-2">⏱️</span>
          <p>No hay resultados registrados en {selectedEvent} todavía.</p>
        </div>
      )}
    </div>
  );
}
