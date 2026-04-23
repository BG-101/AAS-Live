// ============================================================
// COMPONENTE: CompetitionList
// Muestra la lista de competiciones agrupadas por estado:
// "En Curso", "Próximas" y "Finalizadas".
// Dentro de cada sección, agrupa por serie/liga y ordena por fecha.
// ============================================================

import React from "react";
import { Link } from "react-router-dom";
import { formatDateRange } from "../utils/formatters";

/**
 * @param {Array} competitions - Array de todas las competiciones
 * @param {Object} user - Usuario autenticado (null si no hay sesión)
 * @param {Function} onDeleteComp - Callback para borrar una competición (solo SuperAdmin)
 */
export default function CompetitionList({ competitions, user, onDeleteComp }) {
  /**
   * Calcula una etiqueta temporal relativa ("Hoy", "Mañana", "Hace 3 días", etc.)
   * basándose en las fechas de inicio y fin del torneo.
   */
  const getRelativeTimeLabel = (startDate, endDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normaliza a medianoche
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const msInDay = 24 * 60 * 60 * 1000;

    // Ya terminó
    if (today > end) {
      const daysAgo = Math.round((today - end) / msInDay);
      return daysAgo === 1 ? "Ayer" : `Hace ${daysAgo} días`;
    }
    // Aún no empieza
    if (today < start) {
      const daysLeft = Math.round((start - today) / msInDay);
      return daysLeft === 1 ? "Mañana" : `En ${daysLeft} días`;
    }
    // Está en curso
    if (today >= start && today <= end) {
      return today.getTime() === end.getTime() ? "¡Último día!" : "¡Hoy!";
    }
    return "";
  };

  // --- Clasifica las competiciones en 3 categorías según la fecha actual ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inProgress = []; // Competiciones que están ocurriendo ahora
  const upcoming = []; // Competiciones futuras
  const finished = []; // Competiciones pasadas

  competitions.forEach((comp) => {
    const start = new Date(comp.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(comp.endDate);
    end.setHours(0, 0, 0, 0);

    if (today >= start && today <= end) inProgress.push(comp);
    else if (today < start) upcoming.push(comp);
    else finished.push(comp);
  });

  /**
   * Renderiza un grupo de competiciones, agrupándolas por serie/liga.
   *
   * Las competiciones con el mismo valor "series" se agrupan visualmente
   * bajo un encabezado compartido. Las competiciones sin serie se muestran
   * como bloques independientes.
   *
   * @param {Array} compsList - Competiciones de esta sección
   * @param {string} sectionColor - Clase CSS para el color del borde lateral
   * @param {boolean} isAscending - Si true ordena de más próxima a más lejana
   */
  const renderGroupedCompetitions = (compsList, sectionColor, isAscending) => {
    if (compsList.length === 0)
      return (
        <p className="text-gray-500 italic text-sm py-2">
          No hay torneos en esta categoría.
        </p>
      );

    const groups = {}; // Competiciones agrupadas por nombre de serie
    const blocks = []; // Bloques finales para renderizar (series + sueltas)

    // Separa competiciones con serie de las independientes
    compsList.forEach((c) => {
      if (c.series && c.series.trim() !== "") {
        // Agrupa por nombre de serie
        if (!groups[c.series]) {
          groups[c.series] = {
            type: "series",
            name: c.series,
            competitions: [],
          };
        }
        groups[c.series].competitions.push(c);
      } else {
        // Competición independiente (sin serie)
        blocks.push({
          type: "standalone",
          competition: c,
          sortDate: new Date(c.endDate).getTime(),
        });
      }
    });

    // Calcula la fecha de ordenación para cada grupo de series
    // y ordena las competiciones dentro del grupo
    Object.values(groups).forEach((g) => {
      const dates = g.competitions.map((c) => new Date(c.endDate).getTime());
      g.sortDate = isAscending ? Math.min(...dates) : Math.max(...dates);

      // Ordena las competiciones dentro de la serie por fecha
      g.competitions.sort((a, b) => {
        const dateA = new Date(a.endDate).getTime();
        const dateB = new Date(b.endDate).getTime();
        return isAscending ? dateA - dateB : dateB - dateA;
      });

      blocks.push(g);
    });

    // Ordena todos los bloques (series y sueltas) por fecha
    blocks.sort((a, b) =>
      isAscending ? a.sortDate - b.sortDate : b.sortDate - a.sortDate,
    );

    return (
      <div className="flex flex-col gap-4">
        {blocks.map((block, index) => {
          if (block.type === "series") {
            // --- Bloque de serie: competiciones agrupadas ---
            return (
              <div
                key={`series-${index}`}
                className={`border-l-4 ${sectionColor} pl-4 bg-gray-800/50 py-3 pr-2 rounded-r`}
              >
                <h4 className="text-sm font-black text-gray-300 uppercase tracking-widest mb-3">
                  🏆 {block.name}
                </h4>
                <div className="space-y-3">
                  {block.competitions.map((comp) =>
                    renderCompetitionCard(comp),
                  )}
                </div>
              </div>
            );
          } else {
            // --- Bloque independiente ---
            return (
              <div key={`standalone-${index}`}>
                {renderCompetitionCard(block.competition)}
              </div>
            );
          }
        })}
      </div>
    );
  };

  /**
   * Renderiza una tarjeta individual de competición.
   * Muestra: nombre, fechas, ubicación, eventos y botón de borrar (solo SuperAdmin).
   */
  const renderCompetitionCard = (comp) => {
    const displayDate = formatDateRange(
      comp.startDate,
      comp.endDate,
      comp.date,
    );
    const relativeTime = getRelativeTimeLabel(comp.startDate, comp.endDate);

    return (
      <div
        key={comp._id}
        className="relative group bg-gray-800 rounded border border-gray-700 hover:border-almeria-orange transition shadow-md"
      >
        {/* Toda la tarjeta es un enlace a los detalles de la competición */}
        <Link to={`/competition/${comp._id}`} className="block p-4">
          <div className="flex justify-between items-start">
            <h3 className="text-xl font-bold text-almeria-orange">
              {comp.name}
            </h3>
            <div className="flex flex-col items-end gap-1">
              {/* Badge con límite de competidores */}
              <span className="text-xs bg-gray-600 text-white px-2 py-0.5 rounded font-bold shadow-sm">
                Max: {comp.competitorLimit}
              </span>
              {/* Badge con tiempo relativo */}
              <span className="text-[10px] uppercase font-black text-gray-300 bg-gray-900 px-2 py-0.5 rounded border border-gray-600">
                ⏳ {relativeTime}
              </span>
            </div>
          </div>

          {/* Fecha y ubicación */}
          <p className="text-sm text-gray-400 mt-1">
            📅 {displayDate} | 📍 {comp.location}
          </p>

          {/* Tags de eventos */}
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {comp.events &&
              comp.events.map((ev) => (
                <span
                  key={ev}
                  className="text-[11px] font-bold bg-gray-700 text-gray-200 px-2 py-1 rounded border border-gray-600 uppercase shadow-sm"
                >
                  {ev}
                </span>
              ))}
          </div>
        </Link>

        {/* Botón de borrar (solo visible para SuperAdmin, aparece al hover) */}
        {user?.role === "SuperAdmin" && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onDeleteComp(comp._id, comp.name);
            }}
            className="absolute bottom-4 right-4 text-gray-500 hover:text-red-500 hidden group-hover:block transition text-lg drop-shadow"
            title="Eliminar"
          >
            🗑️
          </button>
        )}
      </div>
    );
  };

  // --- Renderizado principal: 3 secciones por estado ---
  return (
    <div className="space-y-12">
      {/* Sección: En Curso (con indicador pulsante rojo) */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]"></span>
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider">
            En Curso
          </h2>
        </div>
        {renderGroupedCompetitions(inProgress, "border-red-500", true)}
      </div>

      {/* Sección: Próximas */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-3 h-3 bg-almeria-orange rounded-full"></span>
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider">
            Próximas
          </h2>
        </div>
        {renderGroupedCompetitions(upcoming, "border-almeria-orange", true)}
      </div>

      {/* Sección: Finalizadas (opacidad reducida, se activa al hover) */}
      <div className="opacity-75 hover:opacity-100 transition duration-300">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
          <h2 className="text-2xl font-bold text-gray-400 uppercase tracking-wider">
            Finalizadas
          </h2>
        </div>
        {renderGroupedCompetitions(finished, "border-gray-500", false)}
      </div>
    </div>
  );
}
