const logger = require("./logger");

/**
 * Responde con un error HTTP, logueando al detalle real siempre pero
 * exponiéndolo al cliente solo si el status no es 500 o el entorno
 * es explícitamente development/test (nunca por defecto/misconfig).
 * @param {import('express').Response} res
 * @param {Error} err - Error capturado
 * @param {{status?: number, fallbackMessage?: string}} [options]
 */
const sendServerError = (
  res,
  err,
  { status = 500, fallbackMessage = "Error interno del servidor." } = {},
) => {
  logger.error({ err }, "Request failed");
  const isNonProdEnv = ["development", "test"].includes(process.env.NODE_ENV);
  const exposeDetail = status !== 500 || isNonProdEnv;
  res
    .status(status)
    .json({ message: exposeDetail ? err.message : fallbackMessage });
};

module.exports = { sendServerError };
