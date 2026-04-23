// ============================================================
// MODELO: Competition (Competición)
// Define la estructura de una competición de speedcubing.
// Cada competición tiene eventos (3x3, 2x2, etc.) y rondas
// configurables con reglas de avance entre ellas.
// ============================================================

const mongoose = require("mongoose");

const competitionSchema = new mongoose.Schema({
  // Identificador oficial WCA (ej: "AlmeriaOpen2026")
  wcaId: { type: String, required: true, unique: true, trim: true },

  // Nombre visible de la competición
  name: { type: String, required: true },

  // Serie o liga a la que pertenece (ej: "Liga Sur 2026"). Vacío si es independiente.
  series: { type: String, default: "" },

  // Rango de fechas del torneo
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },

  // Lugar donde se celebra
  location: { type: String, required: true },

  // Lista de eventos/categorías del torneo (ej: ["3x3", "2x2", "OH"])
  events: [{ type: String }],

  // Número máximo de competidores permitidos
  competitorLimit: { type: Number, default: 50 },

  // Configuración de rondas por evento.
  // Cada ronda define su formato, cutoff y regla de avance.
  rounds: [
    {
      event: String, // Evento al que pertenece esta ronda (ej: "3x3")
      roundNumber: Number, // Número de ronda (1, 2, 3...)

      // Estado: "In Progress" (abierta) o "Finished" (cerrada/finalizada)
      status: { type: String, default: "In Progress" },

      // Tipo de avance a la siguiente ronda: "ranking" (top N) o "percent" (top X%)
      advancementType: { type: String, default: "ranking" },

      // Valor del avance: si es ranking → número de personas, si es percent → porcentaje
      // Un valor de 0 indica que es la ronda final (no hay avance)
      advancementValue: { type: Number, default: 16 },

      // Formato de la ronda: "a" (Ao5), "m" (Mo3), "b" (Bo3)
      format: { type: String, default: "a" },

      // Cutoff en centésimas de segundo: si > 0, el competidor debe hacer un tiempo
      // menor al cutoff en los primeros intentos para poder completar todos los intentos
      cutoff: { type: Number, default: 0 },
    },
  ],

  // Soft delete: si es true, la competición está "en la papelera" y no se muestra
  isDeleted: { type: Boolean, default: false },

  // Fecha de creación del registro
  createdAt: { type: Date, default: Date.now },

  // Activa el sistema de puntuación SOR para esta competición
  sorEnabled: { type: Boolean, default: false },

  // Activa la separación de resultados por grupos de edad
  ageGroupsEnabled: { type: Boolean, default: false },

  // Sistema de puntuación: "sor" (clásico, menor = mejor) o "f1" (mayor = mejor)
  scoringSystem: { type: String, enum: ["sor", "f1"], default: "sor" },
});

module.exports = mongoose.model("Competition", competitionSchema);
