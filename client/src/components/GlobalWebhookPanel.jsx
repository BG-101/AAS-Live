// ============================================================
// COMPONENTE: GlobalWebhookPanel
// Panel SuperAdmin: gestiona el secreto único del webhook
// centralizado de inscripciones (Excel maestro con Apps Script).
// La misma URL sirve para todas las competiciones; el enrutado
// al torneo correcto se hace por el campo competitionWcaId.
// ============================================================

import { useState } from "react";
import axios from "axios";
import { API_URL } from "../utils/api";
import { toast } from "../utils/toast";

export default function GlobalWebhookPanel({ show, onClose }) {
  const [newSecret, setNewSecret] = useState(null);
  const [generating, setGenerating] = useState(false);

  const webhookUrl = `${API_URL || window.location.origin}/api/registrations/webhook`;

  if (!show) return null;

  const handleGenerateSecret = async () => {
    if (
      newSecret === null &&
      !window.confirm(
        "Si ya existía un secreto, dejará de funcionar hasta que actualices el Apps Scripts. ¿Continuar?",
      )
    )
      return;
    setGenerating(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/registrations/generate-secret-global`,
      );
      setNewSecret(data.secret);
    } catch (err) {
      toast(err.response?.data?.message || "Error generando secreto", "error");
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copiado`, "info");
    } catch {
      toast("No se pudo copiar; selecciona y copia a mano", "error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col text-gray-800">
        <div className="p-4 border-b flex justify-between items-center bg-gray-100 rounded-t-lg shrink-0">
          <h2 className="text-2xl font-bold text-gray-800">
            🔗 Inscripciones · Excel Maestro
          </h2>
          <button
            onClick={onClose}
            className="text-red-500 font-bold text-3xl leading-none hover:text-red-700"
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700">
            Una única hoja de Google Sheets alimenta a TODAS las competiciones.
            Cada fila debe incluir una columna con el <strong>wcaId</strong> de
            la competición a la que pertenece; el servidor la enruta
            automáticamente y respeta la caducidad individual de cada torneo.
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">
              URL del webhook (única, para todas las competiciones)
            </p>
            <div
              className="bg-gray-50 border rounded p-2 text-xs font-mono break-all select-all cursor-copy"
              onClick={() => copy(webhookUrl, "URL")}
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
                className="bg-yellow-50 border border-yellow-300 rounded p-2 text-xs font-mono break-all text-yellow-900 select-all cursor-copy"
                onClick={() => copy(newSecret, "Secreto")}
              >
                {newSecret}
              </div>
              <p className="text-[10px] text-yellow-600 mt-1">
                No se mostrará de nuevo. Pégalo en la variable SECRET del Apps
                Script.
              </p>
            </div>
          )}

          <button
            onClick={handleGenerateSecret}
            disabled={generating}
            className="w-full bg-gray-800 text-white text-sm font-bold py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition"
          >
            {generating
              ? "Generando..."
              : newSecret
                ? "🔑 Regenerar secreto"
                : "🔑 Generar secreto"}
          </button>

          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">
              📄 Plantilla Apps Script (hoja maestra)
            </p>
            <pre className="bg-gray-900 text-green-300 text-[10px] rounded p-2 overflow-x-auto whitespace-pre-wrap select-all">
              {`function onFormSubmit(e) {
  var WEBHOOK_URL = "${webhookUrl}";
  var SECRET = "TU_SECRETO_AQUI";

  var r = e.namedValues;

  var EVENT_LABEL_MAP = {
    // "Texto exacto de tu opción": "CódigoInterno",
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

  var data = {
    competitionWcaId: getField("Competición (wcaId)"),
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
            <p className="text-[10px] text-gray-500 mt-1">
              Activador: <strong>Al enviar el formulario</strong>, desde{" "}
              <strong>Extensiones → Apps Script</strong> en la hoja de
              respuestas. Añade la pregunta "Competición (wcaId)" a CADA
              formulario que alimente el Excel maestro (puede ir oculta con
              valor prefijado por forumlario).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
