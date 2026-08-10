// ============================================================
// MODELO: User (Usuario del sistema)
// Representa a un usuario que puede autenticarse en la app.
// Los roles controlan qué acciones puede realizar cada uno.
// ============================================================

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  // Nombre de usuario para el login (único en todo el sistema)
  username: { type: String, required: true, unique: true },

  // Contraseña hasheada con bcrypt (nunca se almacena en texto plano)
  password: { type: String, required: true },

  // Rol del usuario que determina sus permisos:
  //   "SuperAdmin"  → Control total: crear competiciones, gestionar usuarios, vaciar papelera
  //   "Delegado"    → Puede registrar competidores e ingresar tiempos
  //   "Espectador"  → Solo lectura, pensado para la pantalla del proyector
  role: {
    type: String,
    enum: ["SuperAdmin", "Delegado", "Espectador", "Metetiempos"],
    default: "Delegado",
  },
});

// Garantiza a nivel de BD que solo puede existir un SuperAdmin: protege /setup
// frente a dos requests concurrentes que pasan el check "no existe admin" a la vez.
userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: "SuperAdmin" } },
);

module.exports = mongoose.model("User", userSchema);
