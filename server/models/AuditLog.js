// ============================================================
// MODELO: AuditLog (Registro de Auditoría)
// Guarda un historial de todos los cambios realizados en los
// tiempos de los competidores. Permite rastrear quién modificó
// qué y cuándo, mostrando los tiempos anteriores y nuevos.
// ============================================================

const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  // Referencia a la competición donde se realizó el cambio
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Competition",
    required: true,
  },

  // Nombre del competidor (se guarda como string para mantener el registro
  // incluso si el competidor es eliminado posteriormente)
  competitorName: { type: String, required: true },

  // Evento donde se modificaron los tiempos (ej: "3x3")
  event: { type: String, required: true },

  // Número de ronda donde se hizo el cambio
  round: { type: Number, required: true },

  // Tipo de acción realizada: "NUEVO" (primer registro) o "MODIFICADO" (edición)
  action: { type: String, required: true },

  // Tiempos anteriores (vacío si la acción es "NUEVO")
  oldTimes: [{ type: Number }],

  // Tiempos nuevos que se guardaron
  newTimes: [{ type: Number }],

  // Fecha y hora exacta del cambio (se genera automáticamente)
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
