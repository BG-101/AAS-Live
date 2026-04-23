// ============================================================
// MODELO: Competitor (Competidor)
// Representa a una persona inscrita en una competición.
// Cada competidor está vinculado a una competición específica
// y puede estar inscrito en múltiples eventos de esa competición.
// ============================================================

const mongoose = require("mongoose");

const competitorSchema = new mongoose.Schema({
  // Número de competidor asignado secuencialmente (1, 2, 3...)
  competitorNumber: { type: Number, required: true },

  // Nombre completo del competidor
  name: { type: String, required: true },

  // ID oficial de la WCA (ej: "2020GARC01"). Vacío si no tiene.
  wcaId: { type: String, default: "" },

  // Edad del competidor (opcional)
  age: { type: Number, default: null },

  // Ciudad o localidad de origen
  locality: { type: String, default: "" },

  // Género del competidor
  gender: { type: String, default: "" },

  // Eventos en los que está inscrito (ej: ["3x3", "2x2", "OH"])
  events: [{ type: String }],

  // Soft delete: si es true, el competidor está "en la papelera"
  // Se renombra al borrarlo para evitar conflictos con el índice único
  isDeleted: { type: Boolean, default: false },

  // Referencia a la competición a la que pertenece este competidor
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Competition",
    required: true,
  },

  // Retiradas voluntarias: lista de rondas a las que el competidor no puede asistir
  // { events: "3x3", fromRound: 2 } significa que no puede asistir a la Ronda 2 en adelante
  withdrawals: [
    {
      event: { type: String, required: true },
      fromRound: { type: Number, required: true },
    },
  ],
});

// Índice único compuesto: no puede haber dos competidores con el mismo nombre
// en la misma competición (evita inscripciones duplicadas)
competitorSchema.index({ name: 1, competition: 1 }, { unique: true });

// Índice compuesto para la consulta de elegibles por evento
competitorSchema.index({ competition: 1, events: 1 });

// Índice para soft delete: filtrar borrados es una condición en casi todas las queries
competitorSchema.index({ competition: 1, isDeleted: 1 });

module.exports = mongoose.model("Competitor", competitorSchema);
