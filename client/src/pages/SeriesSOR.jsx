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
  const [selectedEntry, setSelectedEntry] = useState(null);

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
        <div>
          {/* ── VISTA MÓVIL SERIE SOR ── */}
          <div className="block md:hidden bg-white text-gray-900 rounded-lg shadow-xl overflow-hidden">
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

            {data.rankings.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <span className="text-4xl block mb-2">🏆</span>
                No hay datos SOR disponibles para esta serie todavía.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {data.rankings.map((entry, index) => (
                  <li
                    key={entry.key}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70 ${index === 0 ? "bg-yellow-50 font-semibold" : index === 1 ? "bg-gray-50" : "bg-white"}`}
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

          {/* ── VISTA DESKTOP SERIE SOR ── */}
          <div className="hidden md:block bg-white text-gray-900 rounded-lg overflow-auto shadow-xl">
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

          {/* Bottom sheet detalle Serie SOR móvil */}
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
                      Detalle por competición
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

                <div className="flex flex-col gap-2 mb-4">
                  {data.competitions.map((comp) => (
                    <div
                      key={comp._id}
                      className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2"
                    >
                      <span className="font-bold text-gray-700 text-sm">
                        {comp.wcaId || comp.name}
                      </span>
                      <span className="font-black text-gray-900 font-mono">
                        {selectedEntry.perComp[comp._id] ?? "-"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-almeria-orange rounded-xl py-3 text-center">
                  <p className="text-xs font-bold text-orange-100 mb-0.5">
                    Total Serie
                  </p>
                  <p className="text-3xl font-black text-white font-mono">
                    {selectedEntry.totalScore}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SeriesSOR;
