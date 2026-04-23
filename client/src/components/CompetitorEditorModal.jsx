// ============================================================
// COMPONENTE: CompetitorEditorModal
// Panel exclusivo para SuperAdmin que permite editar todos los
// datos de los competidores de la competición (nombre, WCA ID,
// edad, localidad y eventos inscritos).
// ============================================================

import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_URL } from "../utils/api";

/**
 * @param {boolean} show - Si es true, muestra el modal
 * @param {Function} onClose - Callback para cerrar el modal
 * @param {string} competitionId - ID de la competición
 * @param {string[]} competitionEvents - Eventos disponibles en la competición
 * @param {Function} onSaved - Callback tras guardar (para refrescar datos del padre)
 */
export default function CompetitorEditorModal({
  show,
  onClose,
  competitionId,
  competitionEvents,
  onSaved,
}) {
  const [competitors, setCompetitors] = useState([]);
  const [editStates, setEditStates] = useState({}); // { [_id]: { ...campos } }
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Carga todos los competidores al abrir el modal
  useEffect(() => {
    if (!show || !competitionId) return;
    setLoading(true);
    axios
      .get(`${API_URL}/api/competitors/${competitionId}`)
      .then((res) => {
        // Ordena por número de competidor
        const sorted = res.data.sort(
          (a, b) => a.competitorNumber - b.competitorNumber,
        );
        setCompetitors(sorted);
        // Inicializa el estado de edición con los datos actuales
        const initial = {};
        sorted.forEach((c) => {
          initial[c._id] = {
            name: c.name,
            wcaId: c.wcaId || "",
            age: c.age ?? "",
            locality: c.locality || "",
            events: [...(c.events || [])],
          };
        });
        setEditStates(initial);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [show, competitionId]);

  if (!show) return null;

  const updateField = (id, field, value) => {
    setEditStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const toggleEvent = (id, ev) => {
    const current = editStates[id]?.events || [];
    const updated = current.includes(ev)
      ? current.filter((e) => e !== ev)
      : [...current, ev];
    updateField(id, "events", updated);
  };

  const handleSave = async (competitorId) => {
    setSavingId(competitorId);
    try {
      await axios.put(
        `${API_URL}/api/competitors/${competitorId}`,
        editStates[competitorId],
      );
      // Actualiza el estado local para reflejar el guardado
      setCompetitors((prev) =>
        prev.map((c) =>
          c._id === competitorId ? { ...c, ...editStates[competitorId] } : c,
        ),
      );
      onSaved?.();
    } catch (err) {
      alert(err.response?.data?.message || "Error al guardar.");
    } finally {
      setSavingId(null);
    }
  };

  // Comprueba si una fila tiene cambios respecto al estado original
  const isDirty = (competitor) => {
    const edit = editStates[competitor._id];
    if (!edit) return false;
    return (
      edit.name !== competitor.name ||
      edit.wcaId !== (competitor.wcaId || "") ||
      edit.age !== (competitor.age ?? "") ||
      edit.locality !== (competitor.locality || "") ||
      JSON.stringify(edit.events) !== JSON.stringify(competitor.events || [])
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Cabecera */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-100 rounded-t-lg shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              ✏️ Editor de Competidores
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {competitors.length} competidores · Solo visible para SuperAdmin
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-red-500 font-bold text-3xl leading-none hover:text-red-700"
          >
            &times;
          </button>
        </div>

        {/* Cuerpo */}
        <div className="overflow-auto flex-1 p-4">
          {loading ? (
            <div className="p-10 text-center text-gray-400">
              Cargando competidores...
            </div>
          ) : (
            <table className="w-full text-sm text-left min-w-max">
              <thead className="bg-gray-800 text-white sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3 min-w-[160px]">Nombre</th>
                  <th className="p-3 w-32">WCA ID</th>
                  <th className="p-3 w-20">Edad</th>
                  <th className="p-3 min-w-[140px]">Localidad</th>
                  <th className="p-3 min-w-[120px]">Eventos</th>
                  <th className="p-3 w-24 text-center">Guardar</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {competitors.map((competitor) => {
                  const edit = editStates[competitor._id];
                  if (!edit) return null;
                  const dirty = isDirty(competitor);
                  const saving = savingId === competitor._id;

                  return (
                    <tr
                      key={competitor._id}
                      className={`transition ${dirty ? "bg-orange-50" : "bg-white hover:bg-gray-50"}`}
                    >
                      {/* Número de competidor (readonly) */}
                      <td className="p-3 text-center font-mono text-gray-500 font-bold">
                        {competitor.competitorNumber}
                      </td>

                      {/* Nombre */}
                      <td className="p-3">
                        <input
                          type="text"
                          className="w-full border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-almeria-orange"
                          value={edit.name}
                          onChange={(e) =>
                            updateField(competitor._id, "name", e.target.value)
                          }
                        />
                      </td>

                      {/* WCA ID */}
                      <td className="p-3">
                        <input
                          type="text"
                          className="w-full border px-2 py-1 text-sm font-mono uppercase outline-none focus:ring-2 focus:ring-almeria-orange"
                          value={edit.wcaId}
                          onChange={(e) =>
                            updateField(competitor._id, "wcaId", e.target.value)
                          }
                          placeholder="Sin ID"
                        />
                      </td>

                      {/* Edad */}
                      <td className="p-3">
                        <input
                          type="number"
                          className="w-full border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-almeria-orange"
                          value={edit.age}
                          onChange={(e) =>
                            updateField(competitor._id, "age", e.target.value)
                          }
                          placeholder="-"
                        />
                      </td>

                      {/* Localidad */}
                      <td className="p-3">
                        <input
                          type="text"
                          className="w-full border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-almeria-orange"
                          value={edit.locality}
                          onChange={(e) =>
                            updateField(
                              competitor._id,
                              "locality",
                              e.target.value,
                            )
                          }
                          placeholder="-"
                        />
                      </td>

                      {/* Eventos (checkboxes) */}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {competitionEvents.map((ev) => (
                            <label
                              key={ev}
                              className={`text-xs px-1.5 py-0.5 rounded border cursor-pointer select-none transition font-bold ${
                                edit.events.includes(ev)
                                  ? "bg-almeria-orange text-white border-almeria-orange"
                                  : "bg-gray-100 text-gray-500 border-gray-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={edit.events.includes(ev)}
                                onChange={() => toggleEvent(competitor._id, ev)}
                              />
                              {ev}
                            </label>
                          ))}
                        </div>
                      </td>

                      {/* Botón guardar */}
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleSave(competitor._id)}
                          disabled={!dirty || saving}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition ${
                            dirty && !saving
                              ? "bg-wca-green text-white hover:bg-green-700 shadow"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          {saving ? "..." : dirty ? "💾 Guardar" : "✓"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
