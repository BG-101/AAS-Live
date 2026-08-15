// ============================================================
// COMPONENTE: RegistrationPanel
// Renderiza la interfaz y la l?gica de este componente.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_URL } from "../utils/api";
import { toast } from "../utils/toast";
import { resolveCompetitorAge } from "../utils/formatters";
import { createSocket } from "../utils/socket";

const STATUS = {
  pending: {
    label: "Pendiente",
    cls: "bg-yellow-100 text-yellow-800 border-yellow-300",
  },
  approved: {
    label: "Pagado ✓",
    cls: "bg-green-100 text-green-800 border-green-300",
  },
  rejected: {
    label: "Rechazado",
    cls: "bg-red-100 text-red-800 border-red-300",
  },
};

const EMPTY_FORM = {
  name: "",
  wcaId: "",
  birthDate: "",
  locality: "",
  email: "",
  events: [],
};

/**
 * Displays and manages competition registrations in a modal panel.
 * @param {boolean} show - Whether the registration panel is visible.
 * @param {Function} onClose - Callback invoked when the panel is closed.
 * @param {string} competitionId - Identifier of the competition.
 * @param {string[]} competitionEvents - Events available for manual registrations.
 * @param {string|Date} competitionStartDate - Start date used to calculate competitor ages.
 * @param {Object} user - Current user, including their role for privileged actions.
 * @returns {JSX.Element|null} The registration panel when visible, otherwise `null`.
 */
export default function RegistrationPanel({
  show,
  onClose,
  competitionId,
  competitionEvents,
  competitionStartDate,
  user,
}) {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  const [newSecret, setNewSecret] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_FORM);

  const webhookUrl = `${API_URL || window.location.origin}/api/registrations/webhook/${competitionId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/api/registrations/${competitionId}`,
      );
      setRegistrations(data);
    } catch (err) {
      if (err.code !== "ECONNABORTED")
        toast("Error cargando inscripciones", "error");
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    if (!show || !competitionId) return;
    const socket = createSocket();
    socket.on("nueva_inscripcion", (data) => {
      if (data.competitionId === competitionId) load();
    });
    socket.on("competidor_actualizado", (data) => {
      if (data.competitionId === competitionId) load();
    });
    socket.on("inscripcion_actualizada", (data) => {
      if (data.competitionId === competitionId) load();
    });
    return () => socket.disconnect();
  }, [show, competitionId, load]);

  if (!show) return null;

  const counts = {
    pending: registrations.filter((r) => r.status === "pending").length,
    approved: registrations.filter((r) => r.status === "approved").length,
    rejected: registrations.filter((r) => r.status === "rejected").length,
  };
  const filtered =
    activeTab === "all"
      ? registrations
      : registrations.filter((r) => r.status === activeTab);

  const handleGenerateSecret = async () => {
    try {
      const { data } = await axios.post(
        `${API_URL}/api/registrations/${competitionId}/generate-secret`,
      );
      setNewSecret(data.secret);
    } catch (err) {
      toast(err.message?.data?.message || "Error generando secreto", "error");
    }
  };

  const handleApprove = async (id) => {
    setProcessingId(id);
    try {
      await axios.patch(`${API_URL}/api/registrations/${id}/approve`);
      toast("Competidor registrado correctamente", "success");
      load();
    } catch (err) {
      toast(err.response?.data?.message || "Error al aprobar", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    const notes = window.prompt("Motivo del rechazo (opcional):");
    if (notes === null) return;
    setProcessingId(id);
    try {
      await axios.patch(`${API_URL}/api/registrations/${id}/reject`, { notes });
      toast("Inscripción rechazada", "info");
      load();
    } catch {
      toast("Error al rechazar", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este registro definitivamente?")) return;
    try {
      await axios.delete(`${API_URL}/api/registrations/${id}`);
      load();
    } catch {
      toast("Error al eliminar", "error");
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_URL}/api/registrations/manual/${competitionId}`,
        manualForm,
      );
      toast("Inscripción manual añadida", "success");
      setManualForm(EMPTY_FORM);
      setShowManual(false);
      load();
    } catch (err) {
      toast(err.response?.data?.message || "Error", "error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-start pt-6 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-100 rounded-t-lg shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              📋 Panel de Inscripciones
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {counts.pending} pendientes · {counts.approved} aprobados ·{" "}
              {counts.rejected} rechazados
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setShowManual(true)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-blue-700 transition"
            >
              + Añadir manual
            </button>
            <button
              onClick={onClose}
              className="text-red-500 font-bold text-3xl leading-none hover:text-red-700"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Sidebar: configuración webhook */}
          <div className="w-full md:w-72 max-h-[40vh] md:max-h-none border-b md:border-b-0 md:border-r bg-gray-50 p-4 overflow-y-auto shrink-0 space-y-4">
            <div>
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                ⚙️ Webhook Google Form
              </p>
              <p className="text-xs font-bold text-gray-500 mb-1">URL</p>
              <div
                className="bg-white border rounded p-2 text-[11px] font-mono break-all text-gray-700 select-all cursor-copy"
                onClick={async () => {
                  try {
                    if (!navigator.clipboard?.writeText) {
                      throw new Error("clipboard-unavailable");
                    }
                    await navigator.clipboard.writeText(webhookUrl);
                    toast("URL copiada", "info");
                  } catch {
                    toast(
                      "No se pudo copiar; selecciona y copia a mano",
                      "error",
                    );
                  }
                }}
              >
                {webhookUrl}
              </div>
            </div>

            {newSecret && (
              <div>
                <p className="text-xs font-bold text-yellow-700 mb-1">
                  🔑 Secreto (cópialo ahora)
                </p>
                <div
                  className="bg-yellow-50 border border-yellow-300 rounded p-2 text-[11px] font-mono break-all text-yellow-900 select-all cursor-copy"
                  onClick={async () => {
                    try {
                      if (!navigator.clipboard?.writeText) {
                        throw new Error("clipboard-unavailable");
                      }
                      await navigator.clipboard.writeText(newSecret);
                      toast("Secreto copiado", "info");
                    } catch {
                      toast(
                        "No se pudo copiar; selecciona y copia a mano",
                        "error",
                      );
                    }
                  }}
                >
                  {newSecret}
                </div>
                <p className="text-[10px] text-yellow-600 mt-1">
                  No se mostrará de nuevo.
                </p>
              </div>
            )}

            {user?.role === "SuperAdmin" && (
              <button
                onClick={handleGenerateSecret}
                className="w-full bg-gray-800 text-white text-xs font-bold py-2 rounded hover:bg-gray-700 transition"
              >
                🔑 Generar / Regenerar secreto
              </button>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700 space-y-1">
              <p className="font-bold">Configuración Apps Script:</p>
              <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                <li>Genera un secreto (SuperAdmin)</li>
                <li>Abre el Google Form → hoja vinculada</li>
                <li>
                  <strong>Extensiones → Apps Script</strong>
                </li>
                <li>Pega el script plantilla y ajusta los nombres de campo</li>
                <li>
                  Si usas casillas de selección múltiple para eventos y el texto
                  de las opciones no coincide con los nombres internos, rellena{" "}
                  <code>EVENT_LABEL_MAP</code>
                </li>
                <li>Crea un activador: "Al enviar el formulario"</li>
              </ol>
            </div>

            {/* Script plantilla */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">
                📄 Plantilla Apps Script
              </p>
              <pre className="bg-gray-900 text-green-300 text-[10px] rounded p-2 overflow-x-auto whitespace-pre-wrap select-all">
                {`function onFormSubmit(e) {
  // Nota: "var" es intencional aquí (no un descuido) - es el estilo
  // predominante en la documentación y ejemplos oficiales de Google Apps
  // Script; let/const también funcionan en el runtime V8 moderno.
  var WEBHOOK_URL = "${webhookUrl}";
  var SECRET = "TU_SECRETO_AQUI";
  
  var r = e.namedValues;

  // Si tu pregunta de eventos usa casillas de verificación (selección
  // múltiple), Google Forms ya une las opciones marcadas con comas en
  // la celda de la hoja de respuestas (aunque el formulario muestre
  // fotos junto a cada opción, el valor enviado es el texto de la
  // opción). Ajusta este mapa si el texto de tus opciones no coincide
  // exactamente con los códigos internos de la app:
  // 3x3, 2x2, 4x4, 5x5, 6x6, 7x7, OH, 3x3 BLD, 4x4 BLD, 5x5 BLD,
  // FMC, Pyraminx, Skewb, Megaminx, Sq-1, Clock
  var EVENT_LABEL_MAP = {
    // "Texto exacto de tu opción": "CódigoInterno",
    // Ejemplo: "Cubo 3x3 clásico": "3x3",
  };
  
  function getField(key) {
    var arr = r[key];
    return arr && arr[0] ? arr[0].trim() : "";
  }

  function getEventsField(key) {
    var raw = getField(key);
    if (!raw) return [];
    return raw
      .split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .map(function (label) { return EVENT_LABEL_MAP[label] || label; });
  }

  // La fecha de nacimiento se lee del ItemResponse (no de namedValues)
  // para evitar ambigüedades de formato regional (DD/MM vs MM/DD).
  function getDateField(questionTitle) {
    var items = e.response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      if (items[i].getItem().getTitle() === questionTitle) {
        return items[i].getResponse();
      }
    }
    return "";
  }
  
  // Ajusta los títulos exactos a los de las preguntas de tu formulario:
  var data = {
    name: getField("Nombre completo"),
    wcaId: getField("WCA ID"),
    birthDate: getField("Fecha de nacimiento"),
    locality: getField("Ciudad"),
    email: getField("Email"),
    events: getEventsField("Eventos"),
    formResponseId: e.response.getId()
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    headers: { "X-Webhook-Secret": SECRET },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log(response.getContentText());
}`}
              </pre>
            </div>
          </div>

          {/* Main: lista */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex gap-1 p-3 border-b bg-white shrink-0 items-center">
              {[
                { key: "pending", label: `Pendientes (${counts.pending})` },
                { key: "approved", label: `Aprobados (${counts.approved})` },
                { key: "rejected", label: `Rechazados (${counts.rejected})` },
                { key: "all", label: "Todos" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-3 py-1 rounded text-sm font-bold transition ${
                    activeTab === key
                      ? "bg-almeria-orange text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={load}
                className="ml-auto text-gray-400 hover:text-gray-700 text-base"
                title="Recargar"
              >
                🔄️
              </button>
            </div>

            {/* Registrations */}
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {loading && (
                <p className="text-center text-gray-400 py-10">Cargando...</p>
              )}
              {!loading && filtered.length === 0 && (
                <p className="text-center text-gray-400 py-10">
                  No hay inscripciones
                  {activeTab !== "all"
                    ? ` en estado "${STATUS[activeTab]?.label}"`
                    : ""}
                  .
                </p>
              )}

              {filtered.map((reg) => (
                <div
                  key={reg._id}
                  className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">
                          {reg.name}
                        </span>
                        {reg.wcaId && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">
                            {reg.wcaId}
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded border font-bold ${STATUS[reg.status]?.cls}`}
                        >
                          {STATUS[reg.status]?.label}
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                        {(() => {
                          const displayAge = resolveCompetitorAge(
                            reg,
                            competitionStartDate,
                          );
                          return displayAge !== null ? (
                            <span>🎂 {displayAge} años</span>
                          ) : null;
                        })()}
                        {reg.locality && <span>📍 {reg.locality}</span>}
                        {reg.email && <span>✉️ {reg.email}</span>}
                      </div>

                      {reg.events.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {reg.events.map((ev) => (
                            <span
                              key={ev}
                              className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border font-bold uppercase"
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                      )}

                      {reg.notes && (
                        <p className="text-xs text-red-600 mt-1 italic">
                          📝 {reg.notes}
                        </p>
                      )}

                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(reg.createdAt).toLocaleString("es-ES")}
                        {reg.approvedBy && ` · Aprobado por ${reg.approvedBy}`}
                        {reg.rejectedBy && ` · Rechazado por ${reg.rejectedBy}`}
                      </p>
                    </div>

                    <div className="flex gap-1 shrink-0 items-start">
                      {reg.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(reg._id)}
                            disabled={processingId === reg._id}
                            className="bg-wca-green text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition"
                          >
                            ✓ Pagado
                          </button>
                          <button
                            onClick={() => handleReject(reg._id)}
                            disabled={processingId === reg._id}
                            className="bg-red-500 text-white px-2 py-1.5 rounded text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition"
                          >
                            ✕
                          </button>
                        </>
                      )}
                      {user?.role === "SuperAdmin" && (
                        <button
                          onClick={() => handleDelete(reg._id)}
                          className="text-gray-300 hover:text-red-500 text-base transition ml-1"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal inscripción manual */}
      {showManual && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 text-gray-800">
            <h3 className="text-xl font-bold mb-4">Inscripción Manual</h3>
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Nombre completo *"
                required
                className="w-full p-2 border rounded text-sm"
                value={manualForm.name}
                onChange={(e) =>
                  setManualForm({ ...manualForm, name: e.target.value })
                }
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="WCA ID"
                  className="flex-1 p-2 border rounded text-sm uppercase font-mono"
                  value={manualForm.wcaId}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, wcaId: e.target.value })
                  }
                />
                <input
                  type="date"
                  className="w-40 p-2 border rounded text-sm"
                  value={manualForm.birthDate}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, birthDate: e.target.value })
                  }
                />
              </div>
              <input
                type="text"
                placeholder="Localidad"
                className="w-full p-2 border rounded text-sm"
                value={manualForm.locality}
                onChange={(e) =>
                  setManualForm({ ...manualForm, locality: e.target.value })
                }
              />
              <input
                type="email"
                placeholder="Email"
                className="w-full p-2 border rounded text-sm"
                value={manualForm.email}
                onChange={(e) =>
                  setManualForm({ ...manualForm, email: e.target.value })
                }
              />
              <div className="bg-gray-50 p-2 rounded border">
                <p className="text-xs font-bold text-gray-600 mb-1">Eventos:</p>
                <div className="flex flex-wrap gap-1">
                  {competitionEvents.map((ev) => (
                    <label
                      key={ev}
                      className={`text-xs px-1.5 py-0.5 rounded border cursor-pointer font-bold transition focus-within:ring-2 focus-within:ring-almeria-orange ${
                        manualForm.events.includes(ev)
                          ? "bg-almeria-orange text-white border-almeria-orange"
                          : "bg-white text-gray-500 border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={manualForm.events.includes(ev)}
                        onChange={(e) => {
                          const evs = e.target.checked
                            ? [...manualForm.events, ev]
                            : manualForm.events.filter((x) => x !== ev);
                          setManualForm({ ...manualForm, events: evs });
                        }}
                      />
                      {ev}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManual(false)}
                  className="w-1/3 bg-gray-200 font-bold py-2 rounded hover:bg-gray-300 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-almeria-orange text-white font-bold py-2 rounded hover:bg-orange-600 text-sm"
                >
                  Añadir pendiente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
