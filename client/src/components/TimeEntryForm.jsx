// ============================================================
// COMPONENTE: TimeEntryForm
// Formulario para ingresar los tiempos de un competidor.
// Incluye un buscador con dropdown de competidores y
// campos de entrada de tiempos con soporte para cutoff.
// ============================================================

import React, { useMemo } from "react";
import { formatCutoff } from "../utils/formatters";

/**
 * Provides competitor selection and time-entry controls for a round.
 * @param {Array} competitors - Competitors eligible for the round.
 * @param {string} searchName - Current competitor search text.
 * @param {boolean} showDropdown - Whether to display search results.
 * @param {string} selectedCompetitorId - ID of the selected competitor.
 * @param {Array} inputTimes - Entered attempt times.
 * @param {boolean} isSavingTimes - Whether times are currently being saved.
 * @param {number} attemptsCount - Number of attempts to display.
 * @param {number} roundCutoff - Cutoff value, or `0` when no cutoff is active.
 * @param {number} limitIndex - Index from which cutoff-blocked attempts begin.
 * @param {boolean} cutoffPassed - Whether the competitor has passed the cutoff.
 * @param {boolean} canDeleteCompetitor - Whether competitors can be deleted.
 * @return {JSX.Element} The time-entry form.
 */
export default function TimeEntryForm({
  competitors = [],
  searchName = "",
  setSearchName,
  showDropdown,
  setShowDropdown,
  selectedCompetitorId,
  setSelectedCompetitorId,
  handleSelectCompetitor,
  handleDeleteCompetitor,
  inputTimes = [],
  setInputTimes,
  handleTimeKeyDown,
  handleSubmitTimes,
  inputRefs,
  searchInputRef,
  submitBtnRef,
  isSavingTimes,
  attemptsCount = 5,
  roundCutoff = 0,
  limitIndex = 2,
  cutoffPassed = true,
  canDeleteCompetitor = true,
}) {
  // Filtra competidores por nombre o número de competidor (memo para rendimiento)
  const filteredCompetitors = useMemo(() => {
    const lowerSearch = (searchName || "").toLowerCase();
    const isNumericSearch = /^\d+$/.test(lowerSearch);
    return (competitors || []).filter((c) => {
      const matchName = c.name && c.name.toLowerCase().includes(lowerSearch);
      const matchNum = isNumericSearch
        ? c.competitorNumber?.toString() === lowerSearch
        : c.competitorNumber?.toString().includes(lowerSearch);
      return matchName || matchNum;
    });
  }, [competitors, searchName]);

  // Al pulsar Enter en el buscador, selecciona automáticamente el primer resultado
  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCompetitors.length > 0) {
        handleSelectCompetitor(
          filteredCompetitors[0]._id,
          filteredCompetitors[0].name,
        );
      }
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded shadow border border-gray-700">
      <h2 className="font-bold text-almeria-orange mb-4">Ingresar Tiempos</h2>

      <form onSubmit={handleSubmitTimes}>
        {/* ========== BUSCADOR DE COMPETIDORES ========== */}
        <div className="relative mb-4">
          <input
            ref={searchInputRef}
            id="search-input"
            type="text"
            placeholder="🔍 Buscar y pulsar Enter..."
            className="w-full p-2 text-black rounded outline-none focus:ring-2 focus:ring-almeria-orange"
            value={searchName}
            onChange={(e) => {
              setSearchName(e.target.value);
              setShowDropdown(true);
              // Si cambia el texto, deselecciona el competidor actual
              if (selectedCompetitorId) setSelectedCompetitorId("");
            }}
            onFocus={() => setShowDropdown(true)}
            // onBlur cierra el dropdown con un delay para permitir clicks en las opciones
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            onKeyDown={handleSearchKeyDown}
          />

          {/* Dropdown de resultados de búsqueda */}
          {showDropdown && (
            <div className="absolute z-50 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto mt-1 text-black">
              {filteredCompetitors.map((c) => (
                <div
                  key={c._id}
                  className="p-2 hover:bg-gray-100 cursor-pointer border-b text-sm font-semibold flex justify-between items-center group"
                  onMouseDown={() => handleSelectCompetitor(c._id, c.name)}
                >
                  {/* Info del competidor: número, nombre, WCA ID y localidad */}
                  <span className="flex-1">
                    <span className="text-gray-400 font-mono mr-2">
                      #{c.competitorNumber}
                    </span>
                    {c.name}
                    {c.wcaId && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">
                        {c.wcaId}
                      </span>
                    )}
                    {c.locality && (
                      <span className="ml-2 text-xs text-gray-500 font-normal italic">
                        {c.locality}
                      </span>
                    )}
                  </span>

                  {/* Botón de borrar competidor (se muestra en el dropdown) */}
                  {canDeleteCompetitor && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteCompetitor(c._id, c.name);
                      }}
                      className="bg-red-500 text-white hover:bg-red-700 px-3 py-1 rounded shadow transition ml-2 text-xs"
                    >
                      🗑️ Borrar
                    </button>
                  )}
                </div>
              ))}

              {/* Mensaje cuando no hay coincidencias */}
              {filteredCompetitors.length === 0 && (
                <div className="p-2 text-gray-500 text-sm">No encontrado.</div>
              )}
            </div>
          )}
        </div>

        {/* ========== CAMPOS DE ENTRADA DE TIEMPOS ========== */}
        <div className="flex gap-2 mb-4">
          {Array.from({ length: attemptsCount }).map((_, index) => {
            // Determina si este campo está bloqueado por el cutoff.
            // Si hay cutoff activo y el competidor no lo ha pasado,
            // los intentos después del índice límite se bloquean.
            const isCutoffBlocked =
              roundCutoff > 0 && index >= limitIndex && !cutoffPassed;
            const isInputDisabled = isSavingTimes || isCutoffBlocked;

            return (
              <input
                key={index}
                ref={(el) => {
                  if (inputRefs && inputRefs.current)
                    inputRefs.current[index] = el;
                }}
                id={`time-input-${index}`}
                type="text"
                inputMode="numeric"
                placeholder={isCutoffBlocked ? "CUT" : `T${index + 1}`}
                className={`w-full p-2 text-center rounded text-sm focus:outline-none focus:ring-2 focus:ring-almeria-orange ${isCutoffBlocked ? "bg-gray-600 text-gray-400 placeholder-gray-400 cursor-not-allowed" : "bg-white text-black"}`}
                value={inputTimes[index] || ""}
                onChange={(e) => {
                  const newTimes = [...inputTimes];
                  newTimes[index] = e.target.value;
                  setInputTimes(newTimes);
                }}
                onKeyDown={(e) => handleTimeKeyDown(e, index)}
                disabled={isInputDisabled}
              />
            );
          })}
        </div>

        {/* Indicador visual del cutoff activo */}
        {roundCutoff > 0 && (
          <p className="text-xs text-red-400 mb-3 text-center font-bold">
            ⚠️ Cutoff: {formatCutoff(roundCutoff)}
          </p>
        )}

        {/* Botón de guardar */}
        <button
          ref={submitBtnRef}
          type="submit"
          disabled={isSavingTimes}
          className={`w-full text-white font-bold py-2 rounded transition focus:ring-4 focus:ring-white ${isSavingTimes ? "bg-gray-400 cursor-not-allowed" : "bg-almeria-orange hover:bg-orange-600"}`}
        >
          {isSavingTimes ? "Guardando..." : "Guardar Resultados"}
        </button>
      </form>
    </div>
  );
}
