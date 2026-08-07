const logger = require("./logger");

const sendServerError = (
  res,
  err,
  { status = 500, fallbackMessage = "Error interno del servidor." } = {},
) => {
  logger.error({ err }, "Request failed");
  const exposeDetail = status !== 500 || process.env.NODE_ENV !== "production";
  res
    .status(status)
    .json({ message: exposeDetail ? err.message : fallbackMessage });
};

module.exports = { sendServerError };
