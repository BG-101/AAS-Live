const mongoose = require("mongoose");

/**
 * Middleware que valida que un parámetro de ruta sea un ObjectId válido de MongoDB.
 * Devuelve 400 si no lo es, evitando que Mongoose lance un CastError como 500.
 *
 * @param {string} paramName - Nombre del parámetro de ruta a validar (por defecto "id")
 */
const validateObjectId =
  (paramName = "id") =>
  (req, res, next) => {
    const value = req.params[paramName];
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return res.status(400).json({ message: `ID inválido: ${paramName}.` });
    }
    next();
  };

module.exports = validateObjectId;
