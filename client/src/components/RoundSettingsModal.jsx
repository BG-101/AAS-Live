// ============================================================
// COMPONENTE: RoundSettingsModal
// Modal para configurar los parámetros de una ronda:
// formato (Ao5/Mo3/Bo3), cutoff, tipo de avance y valor.
// ============================================================

import React from "react";

/**
 * @param {boolean} show - Si es true, muestra el modal
 * @param {Function} onClose - Callback para cerrar el modal
 * @param {Object} settingsData - Estado del formulario { type, value, format, cutoff }
 * @param {Function} setSettingsData - Setter del estado del formulario
 * @param {Function} onSubmit - Callback al enviar (guarda la configuración)
 * @param {number} selectedRound - Número de la ronda seleccionada (para mostrar en el título)
 * @param {string} selectedEvent - Evento seleccionado (para mostrar en el título)
 */
export default function RoundSettingsModal({
  show,
  onClose,
  settingsData,
  setSettingsData,
  onSubmit,
  selectedRound,
  selectedEvent,
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 text-gray-800">
        {/* Título del modal con la ronda y evento actual */}
        <h2 className="text-xl font-bold mb-4 border-b pb-2">
          ⚙️ Configurar Ronda {selectedRound} ({selectedEvent})
        </h2>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Fila 1: Formato y Cutoff */}
          <div className="grid grid-cols-2 gap-4">
            {/* Selector de formato de la ronda */}
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">
                Formato
              </label>
              <select
                className="w-full p-2 border rounded outline-none"
                value={settingsData.format}
                onChange={(e) =>
                  setSettingsData({ ...settingsData, format: e.target.value })
                }
              >
                <option value="a">Ao5</option>
                <option value="m">Mo3</option>
                <option value="b">Bo3</option>
              </select>
            </div>

            {/* Campo de cutoff (tiempo límite para completar todos los intentos) */}
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">
                Cutoff
              </label>
              <input
                type="text"
                placeholder="Ej: 1000"
                className="w-full p-2 border rounded outline-none"
                value={settingsData.cutoff}
                onChange={(e) =>
                  setSettingsData({ ...settingsData, cutoff: e.target.value })
                }
                title="Dejar vacío para quitar cutoff"
              />
            </div>
          </div>

          {/* Tipo de clasificación/avance */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">
              Tipo de Clasificación
            </label>
            <select
              className="w-full p-2 border rounded"
              value={settingsData.type}
              onChange={(e) =>
                setSettingsData({ ...settingsData, type: e.target.value })
              }
            >
              <option value="percent">Porcentaje (Ej: Top 75%)</option>
              <option value="ranking">Ranking Fijo (Ej: Top 16)</option>
            </select>
          </div>

          {/* Valor de corte: número de personas o porcentaje según el tipo */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">
              Valor de Corte (0 = Final)
            </label>
            <input
              type="number"
              min="0"
              max={settingsData.type === "percent" ? "100" : undefined}
              className="w-full p-2 border rounded"
              value={settingsData.value}
              onChange={(e) =>
                setSettingsData({ ...settingsData, value: e.target.value })
              }
              required
            />
          </div>

          {/* Botones de acción */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 bg-gray-200 text-gray-800 font-bold py-2 rounded hover:bg-gray-300 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="w-2/3 bg-almeria-orange text-white font-bold py-2 rounded hover:bg-orange-600 transition"
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
