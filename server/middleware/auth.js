// ============================================================
// MIDDLEWARE DE AUTENTICACIÓN Y AUTORIZACIÓN
// Verifica que el usuario tenga un JWT válido en sus cookies
// y (opcionalmente) que su rol esté dentro de los permitidos.
// ============================================================

const jwt = require("jsonwebtoken");

/**
 * Crea un middleware de autenticación configurable.
 *
 * @param {string[]} allowedRoles - Roles permitidos (ej: ["SuperAdmin", "Delegado"]).
 *                                  Si está vacío, cualquier usuario autenticado pasa.
 * @returns {Function} Middleware de Express (req, res, next)
 *
 * Flujo:
 * 1. Extrae el token JWT de la cookie "jwtToken"
 * 2. Si no hay token → 401 (no autenticado)
 * 3. Verifica y decodifica el token con el secreto JWT
 * 4. Si hay roles permitidos y el del usuario no está → 403 (no autorizado)
 * 5. Adjunta los datos del usuario a req.user para uso posterior
 */
const auth = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      // Intenta obtener el JWT de las cookies
      const token = req.cookies.jwtToken;
      if (!token)
        return res
          .status(401)
          .json({ message: "Acceso denegado. No hay token." });

      // Verifica la firma y decodifica el payload (contiene id y role del usuario)
      const verified = jwt.verify(token, process.env.JWT_SECRET);

      // Si se especificaron roles permitidos, comprueba que el usuario tenga uno de ellos
      if (allowedRoles.length > 0 && !allowedRoles.includes(verified.role)) {
        return res
          .status(403)
          .json({ message: "No tienes permiso para hacer esto." });
      }

      // Adjunta el payload decodificado a la request para que las rutas puedan usarlo
      req.user = verified;
      next();
    } catch (err) {
      // El token es inválido, ha expirado o ha sido manipulado
      res.status(401).json({ message: "Token inválido o caducado." });
    }
  };
};

module.exports = auth;
