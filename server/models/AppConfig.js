// ============================================================
// MODELO: AppConfig
// Almacena configuración global de la aplicación en pares
// clave/valor. Usado para el secreto único del webhook
// centralizado de inscripciones (Excel maestro).
// ============================================================

const mongoose = require("mongoose");

const appConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, default: "", select: false },
});
module.exports = mongoose.model("AppConfig", appConfigSchema);
