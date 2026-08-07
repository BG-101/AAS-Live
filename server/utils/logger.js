const pino = require("pino");

const logger = pino({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
  redact: [
    "req.headers.cookie",
    "req.headers.authorization",
    "*.password",
    "*.webhookSecret",
  ],
});

module.exports = logger;
