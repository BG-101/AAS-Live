// ============================================================
// COMPONENTE: SORTable
// Tabla de clasificación SOR de una competición.
// Muestra los rangos por evento y el total acumulado.
// Si ageGroupsEnabled, muestra pestañas por grupo de edad.
// ============================================================

import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../utils/api";

const AGE_GROUP_KEYS = ["alevin", "infantil", "absoluta"];
const AGE_GROUP_LABELS = {
  alevin: "Alevín (<=10)",
  infantil: "Infantil (11-15)",
  absoluta: "Absoluta (>=16)",
};

/**
 * @param {string} compId - ID de la competición
 * @param {boolean} ageGroupsEnabled - Si true, muestra pestañas de grupos de edad
 */
export default function SORTable({ compId, ageGroupsEnabled }) {
  const [activeGroup, setActiveGroup] = useState(null); // null = todos (sin filtro)
  const [sorData, setSorData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null); // Para el sheet móvil

  const systemLabel =
    sorData?.scoringSystem === "f1"
      ? {
          text: "Estilo F1 · Mayor puntuación = mejor",
          color: "bg-red-100 text-red-700 border-red-300",
        }
      : {
          text: "SOR Clásico · Menor puntuación = mejor",
          color: "bg-blue-100 text-blue-700 border-blue-300",
        };

  useEffect(() => {
    if (!compId) return;
    setLoading(true);
    setSorData(null);
    const url = `${API_URL}/api/sor/${compId}${
      activeGroup ? `?ageGroup=${activeGroup}` : ""
    }`;
    axios
      .get(url)
      .then((res) => setSorData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [compId, activeGroup]);

  return (
    <div>
      {/* Badge del sistema de puntuación */}
      {sorData && (
        <div
          className={`inline-block text-xs font-bold px-3 py-1 rounded-full border mb-3 ${systemLabel.color}`}
        >
          {systemLabel.text}
        </div>
      )}

      {/* Pestañas de grupos de edad */}
      {ageGroupsEnabled && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActiveGroup(null)}
            className={`px-4 py-1 rounded font-bold text-sm transition ${
              !activeGroup
                ? "bg-almeria-orange text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            General
          </button>
          {AGE_GROUP_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setActiveGroup(key)}
              className={`px-4 py-1 rounded font-bold text-sm transition ${
                activeGroup === key
                  ? "bg-almeria-orange text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {AGE_GROUP_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="p-10 text-center text-gray-400">
          ⌛ Calculando SOR...
        </div>
      )}

      {ageGroupsEnabled &&
        sorData?.rankings?.some(
          (r) => r.age === null || r.age === undefined,
        ) && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-700 text-xs font-bold px-3 py-2 rounded mb-3">
            ⚠️ Hay competidores sin edad registrada. No aparecerán en los
            rankings por grupo de edad, solo en el General.
          </div>
        )}

      {!loading && sorData && (
        <>
          {/* ── VISTA MÓVIL SOR ── */}
          <div className="block md:hidden bg-white text-gray-900 rounded-b-lg rounded-tr-lg shadow-xl overflow-hidden">
            {/* Encabezado */}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b-2 border-gray-300">
              <span className="text-gray-600 font-bold text-xs uppercase w-5 text-center shrink-0">
                #
              </span>
              <span className="text-gray-600 font-bold text-xs uppercase flex-1">
                Nombre
              </span>
              <span className="text-gray-600 font-bold text-xs uppercase shrink-0">
                Total
              </span>
              <span className="w-3 shrink-0" />
            </div>

            {sorData.rankings.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                No hay datos SOR disponibles aún.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {sorData.rankings.map((entry, index) => (
                  <li
                    key={entry.competitorId}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70 ${index === 0 ? "bg-yellow-50" : index === 1 ? "bg-gray-50" : "bg-white"}`}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <span className="text-gray-400 font-black text-sm w-5 shrink-0 text-center">
                      {index + 1}
                    </span>
                    <span className="font-bold text-sm flex-1 leading-snug break-words min-w-0">
                      {entry.name}
                    </span>
                    <span className="font-black text-base text-almeria-dark font-mono shrink-0">
                      {entry.totalScore}
                    </span>
                    <span className="text-gray-300 text-sm shrink-0">›</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── VISTA DESKTOP SOR ── */}
          <div className="hidden md:block bg-white text-gray-900 rounded-b-lg rounded-tr-lg overflow-auto shadow-xl max-h-[70vh]">
            <table className="w-full text-left min-w-max relative">
              <thead className="sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="p-4 w-12 text-center bg-gray-100 border-b-2 border-gray-300 uppercase text-xs font-bold text-gray-600">
                    #
                  </th>
                  <th className="p-4 bg-gray-100 border-b-2 border-gray-300 uppercase text-xs font-bold text-gray-600">
                    Nombre
                  </th>
                  {sorData.events.map((ev) => (
                    <th
                      key={ev}
                      className="p-4 text-center bg-gray-100 border-b-2 border-gray-300 text-xs font-bold text-gray-600 uppercase"
                    >
                      {ev}
                    </th>
                  ))}
                  <th className="p-4 text-right bg-gray-100 border-b-2 border-gray-300 text-xs font-bold text-almeria-dark uppercase">
                    Total SOR
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {sorData.rankings.map((entry, index) => (
                  <tr
                    key={entry.competitorId}
                    className={`hover:bg-orange-50 transition ${
                      index === 0
                        ? "bg-yellow-50 font-semibold"
                        : index === 1
                          ? "bg-gray-50"
                          : "bg-white"
                    }`}
                  >
                    <td className="p-4 text-center font-bold text-gray-500">
                      {index + 1}
                    </td>
                    <td className="p-4 font-bold">{entry.name}</td>
                    {sorData.events.map((ev) => (
                      <td
                        key={ev}
                        className="p-4 text-center text-sm font-mono text-gray-700"
                      >
                        {entry.eventRanks[ev] ?? "-"}
                      </td>
                    ))}
                    <td className="p-4 text-right font-black text-lg text-almeria-dark">
                      {entry.totalScore}
                    </td>
                  </tr>
                ))}

                {sorData.rankings.length === 0 && (
                  <tr>
                    <td
                      colSpan={2 + (sorData.events?.length || 0) + 1}
                      className="p-10 text-center text-gray-500"
                    >
                      No hay datos SOR disponibles aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom sheet detalle SOR móvil */}
          {selectedEntry && (
            <>
              <div
                className="fixed inset-0 bg-black bg-opacity-60 z-40"
                onClick={() => setSelectedEntry(null)}
              />
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl p-6 animate-slide-up">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                      Detalle SOR
                    </p>
                    <h3 className="text-xl font-black text-gray-900 leading-tight">
                      {selectedEntry.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedEntry(null)}
                    className="text-gray-400 hover:text-gray-700 text-3xl leading-none font-bold mt-1"
                  >
                    &times;
                  </button>
                </div>

                {/* Puntuación por evento */}
                <div className="flex flex-col gap-2 mb-4">
                  {sorData.events.map((ev) => (
                    <div
                      key={ev}
                      className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2"
                    >
                      <span className="font-bold text-gray-700 text-sm uppercase">
                        {ev}
                      </span>
                      <span className="font-black text-gray-900 font-mono">
                        {selectedEntry.eventRanks[ev] ?? "-"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="bg-almeria-orange rounded-xl py-3 text-center">
                  <p className="text-xs font-bold text-orange-100 mb-0.5">
                    Total SOR
                  </p>
                  <p className="text-3xl font-black text-white font-mono">
                    {selectedEntry.totalScore}
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
