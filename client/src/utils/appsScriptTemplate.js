// Plantilla del Google Apps Script para el webhook de inscripciones.
// Los nombres de campo (name, wcaId, birthDate, locality, email, events,
// formResponseId) deben coincidir con lo que lee registrationRoutes.js
// en POST /webhook/:compId. Si cambia el payload ahí, actualiza aquí también.
export const buildAppsScriptTemplate = (
  webhookUrl,
) => `function onFormSubmit(e) {
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

  // Normaliza a YYYY-MM-DD sin importar el formato regional del formulario
  // (dd/mm/aaaa, mm/dd/aaaa...).
  function normalizeDate(raw) {
    if (!raw) return "";
    var parsed = new Date(raw);
    if (isNaN(parsed.getTime())) return raw; // No parseable: se envía tal cual
    var y = parsed.getFullYear();
    var m = String(parsed.getMonth() + 1).padStart(2, "0");
    var d = String(parsed.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  // Este trigger está vinculado a la HOJA de respuestas, no al formulario:
  // "e" solo trae namedValue/range/values, nunca e.response. formResponseId
  // se deriva de la fila de la hoja (estable salve reordenar/borrar filas a mano).
  var data = {
    name: getField("Nombre completo"),
    wcaId: getField("WCA ID"),
    birthDate: normalizeDate(getField("Fecha de nacimiento")),
    locality: getField("Ciudad"),
    email: getField("Email"),
    events: getEventsField("Eventos"),
    formResponseId: "row_" + e.range.getRow()
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
}`;
