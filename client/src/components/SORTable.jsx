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
        <div className="bg-white text-gray-900 rounded-b-lg rounded-tr-lg overflow-auto shadow-xl max-h-[70vh]">
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
      )}
    </div>
  );
}
