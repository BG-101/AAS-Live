// ============================================================
// COMPONENTE: AuditModal
// Modal que muestra el historial completo de cambios en tiempos.
// Muestra una tabla con: hora, acción, competidor, evento,
// tiempos anteriores (tachados) y tiempos nuevos.
// ============================================================

import React from "react";

/**
 * @param {boolean} show - Si es true, muestra el modal
 * @param {Function} onClose - Callback para cerrar el modal
 * @param {Array} auditLogs - Array de registros de auditoría del servidor
 * @param {Function} formatTime - Función para formatear un tiempo individual
 * @param {Function} formatWCATimesArray - Función para formatear array de tiempos WCA
 */
export default function AuditModal({
  show,
  onClose,
  auditLogs,
  formatTime,
  formatWCATimesArray,
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        {/* Cabecera del modal con título y botón de cierre */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-100 rounded-t-lg">
          <h2 className="text-2xl font-bold text-gray-800">
            📜 Registro de Auditoría de Tiempos
          </h2>
          <button
            onClick={onClose}
            className="text-red-500 font-bold text-3xl leading-none hover:text-red-700"
          >
            &times;
          </button>
        </div>

        {/* Cuerpo del modal: tabla scrollable con los registros */}
        <div className="p-4 overflow-y-auto flex-1 text-black">
          <table className="w-full text-sm text-left">
            {/* Cabecera de la tabla (sticky para que se mantenga visible al hacer scroll) */}
            <thead className="bg-almeria-dark text-white sticky top-0">
              <tr>
                <th className="p-3">Hora Local</th>
                <th className="p-3">Acción</th>
                <th className="p-3">Competidor</th>
                <th className="p-3">Evento</th>
                <th className="p-3 text-red-400">Tiempos Anteriores</th>
                <th className="p-3 text-wca-green">Nuevos Tiempos</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-300 bg-gray-50">
              {/* Renderiza cada registro de auditoría como una fila */}
              {auditLogs.map((log) => (
                <tr key={log._id} className="hover:bg-gray-200 transition">
                  {/* Hora local del cambio */}
                  <td className="p-3 font-mono text-xs">
                    {new Date(log.timestamp).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>

                  {/* Tipo de acción con emoji indicativo */}
                  <td className="p-3 font-bold">
                    {log.action === "NUEVO" ? "🆕 NUEVO" : "✏️ MOD"}
                  </td>

                  {/* Nombre del competidor afectado */}
                  <td className="p-3 font-semibold">{log.competitorName}</td>

                  {/* Evento y número de ronda */}
                  <td className="p-3">
                    {log.event} (R{log.round})
                  </td>

                  {/* Tiempos anteriores (tachados en rojo, o "Ninguno" si es nuevo) */}
                  <td className="p-3 text-red-600 line-through">
                    {log.oldTimes.length > 0
                      ? log.oldTimes.map(formatTime).join(" - ")
                      : "Ninguno"}
                  </td>

                  {/* Tiempos nuevos (en verde) */}
                  <td className="p-3 text-wca-green font-bold">
                    {log.newTimes.map(formatTime).join(" - ")}
                  </td>
                </tr>
              ))}

              {/* Mensaje cuando no hay registros */}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-gray-500">
                    No hay registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
