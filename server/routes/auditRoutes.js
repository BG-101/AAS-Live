// ============================================================
// RUTAS DE AUDITORÍA (/api/audit)
// Endpoint de solo lectura para consultar el historial
// de cambios en los tiempos de una competición.
// ============================================================

const express = require("express");
const router = express.Router();
const AuditLog = require("../models/AuditLog");
const auth = require("../middleware/auth");
const { sendServerError } = require("../utils/errorResponse");

// ============================================================
// GET /api/audit/:compId
// Devuelve todos los registros de auditoría de una competición,
// ordenados del más reciente al más antiguo.
//
// Acceso público (sin autenticación), ya que el frontend
// controla su visibilidad según el rol del usuario.
// ============================================================
router.get("/:compId", auth(["SuperAdmin", "Delegado"]), async (req, res) => {
  try {
    const logs = await AuditLog.find({ competition: req.params.compId }).sort({
      timestamp: -1, // Más recientes primero
    });
    res.json(logs);
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
