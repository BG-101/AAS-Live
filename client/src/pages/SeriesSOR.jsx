// ============================================================
// PÁGINA: SeriesSOR
// Muestra el ranking SOR agregado de todas las competiciones
// de una serie. Accesible desde cualquier competición de la serie.
// ============================================================

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../utils/api";

const AGE_GROUP_KEYS = ["alevin", "infantil", "absoluta"];
const AGE_GROUP_LABELS = {
  alevin: "Alevín (<=10)",
  infantil: "Infantil (11-15)",
  absoluta: "Absoluta (>=16)",
};

function SeriesSOR() {
  const { seriesName } = useParams();
  const [data, setData] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const url = `${API_URL}/api/sor/series/${encodeURIComponent(seriesName)}${
      activeGroup ? `?ageGroup=${activeGroup}` : ""
    }`;
    axios
      .get(url)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seriesName, activeGroup]);

  if (loading)
    return (
      <div className="min-h-screen bg-almeria-dark text-white flex items-center justify-center text-2xl font-bold">
        ⌛ Calculando SOR de la serie...
      </div>
    );

  const { rankings, competitions, ageGroupsEnabled } = data;

  return (
    <div className="min-h-screen bg-almeria-dark text-almeria-light p-8">
      <div className="max-w-6xl mx-auto">
        {/* Cabecera */}
        <Link
          to="/"
          className="text-sm text-gray-400 hover:text-almeria-orange transition"
        >
          ← Volver al inicio
        </Link>
        <div className="mt-4 mb-6">
          <h1 className="text-4xl font-bold text-almeria-orange uppercase tracking-wide">
            🏆 SOR de la Serie
          </h1>
          <h2 className="text-xl text-gray-300 mt-1">{seriesName}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {competitions.length}{" "}
            {competitions.length !== 1 ? "competiciones" : "competición"}{" "}
            incluida{competitions.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Pestañas de grupos de edad */}
        {ageGroupsEnabled && (
          <div className="flex gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setActiveGroup(null)}
              className={`px-4 py-2 rounded font-bold text-sm transition ${
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
                className={`px-4 py-2 rounded font-bold text-sm transition ${
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

        {data?.scoringSystem && (
          <div
            className={`inline-block text-xs font-bold px-3 py-1 rounded-full border mb-4 ${
              data.scoringSystem === "f1"
                ? "bg-red-100 text-red-700 border-red-300"
                : "bg-blue-100 text-blue-700 border-blue-300"
            }`}
          >
            {data.scoringSystem === "f1"
              ? "Estilo F1 · Mayor puntuación = mejor"
              : "SOR Clásico · Menor puntuación = mejor"}
          </div>
        )}

        {/* Tabla principal */}
        <div className="bg-white text-gray-900 rounded-lg overflow-auto shadow-xl">
          {data && (
            <table className="w-full text-left min-w-max">
              <thead className="sticky top-0 bg-gray-100 z-20 shadow-sm">
                <tr>
                  <th className="p-4 w-12 text-center border-b-2 border-gray-300 uppercase text-xs font-bold text-gray-600">
                    #
                  </th>
                  <th className="p-4 border-b-2 border-gray-300 uppercase text-xs font-bold text-gray-600">
                    Nombre
                  </th>
                  {data.competitions.map((comp) => (
                    <th
                      key={comp._id}
                      className="p-4 text-center border-b-2 border-gray-300 text-xs font-bold text-gray-600 uppercase max-w-xs truncate"
                      title={comp.name}
                    >
                      {comp.wcaId || comp.name}
                    </th>
                  ))}
                  <th className="p-4 text-right border-b-2 border-gray-300 text-xs font-bold text-almeria-dark uppercase">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {data.rankings.length > 0 ? (
                  data.rankings.map((entry, index) => (
                    <tr
                      key={entry.key}
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
                      {competitions.map((comp) => (
                        <td
                          key={comp._id}
                          className="p-4 text-center font-mono text-sm text-gray-700"
                        >
                          {entry.perComp[comp._id] ?? "-"}
                        </td>
                      ))}
                      <td className="p-4 text-right font-black text-lg text-almeria-dark">
                        {entry.totalScore}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={2 + (data.competitions?.length || 0) + 1}
                      className="p-10 text-center text-gray-500"
                    >
                      <span className="text-4xl block mb-2">🏆</span>
                      No hay datos SOR disponibles para esta serie todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default SeriesSOR;
