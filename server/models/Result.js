// ============================================================
// MODELO: Result (Resultado)
// Almacena los tiempos de un competidor en un evento y ronda
// específicos, junto con el best y average calculados.
// ============================================================

const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
  // Referencia a la competición
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Competition",
    required: true,
  },

  // Referencia al competidor que realizó estos tiempos
  competitor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Competitor",
    required: true,
  },

  // Evento en el que se registraron los tiempos (ej: "3x3")
  event: { type: String, required: true },

  // Número de ronda (1, 2, 3...)
  round: { type: Number, required: true },

  // Array de tiempos en centésimas de segundo.
  // Valores especiales: -1 = DNF, -2 = DNS, 0 = intento vacío
  // Ej: [1234, 1156, -1, 1089, 1342] para un Ao5
  times: [{ type: Number }],

  // Promedio calculado (según el formato: Ao5, Mo3, o 0 para Bo3)
  // -1 si el average es DNF
  average: { type: Number, default: 0 },

  // Mejor tiempo individual de los intentos
  // -1 si todos los intentos son DNF/DNS
  best: { type: Number, default: 0 },
});

// Índice compuesto para la consulta más frecuente del sistema:
// buscar todos los resultados de un evento/ronda en una competición
resultSchema.index({ competition: 1, event: 1, round: 1 });

// Índice para buscar todos los resultados de un competidor (auditoría, borrado)
resultSchema.index({ competitor: 1 });

module.exports = mongoose.model("Result", resultSchema);
