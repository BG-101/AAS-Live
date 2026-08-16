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

  function getDateField(questionTitle) {
    var items = e.response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      if (items[i].getItem().getTitle() === questionTitle) {
        return items[i].getResponse();
      }
    }
    return "";
  }
  
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
}`;
