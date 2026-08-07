// ============================================================
// CONFIGURACIÓN DE LA APP EXPRESS (app.js)
// Middlewares y montaje de rutas. Sin server.listen() ni
// mongoose.connect() para poder testear con supertest sin
// levantar el servidor real ni depender de Atlas.
// ============================================================

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const competitionRoutes = require("./routes/competitionRoutes");
const competitorRoutes = require("./routes/competitorRoutes");
const resultRoutes = require("./routes/resultRoutes");
const auditRoutes = require("./routes/auditRoutes");
const authRoutes = require("./routes/authRoutes");
const sorRoutes = require("./routes/sorRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const {
  parsePositiveInt,
  MAX_SAFE_TIMEOUT_MS,
} = require("./utils/parseEnvInt");
const logger = require("./utils/logger");

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  process.env.CLIENT_URL,
].filter(Boolean);

const createApp = () => {
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: process.env.BODY_LIMIT || "10kb" }));
  app.use(cookieParser());

  const writeLimiter = rateLimit({
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_WRITE_WINDOW_MS,
      60 * 1000,
      MAX_SAFE_TIMEOUT_MS,
    ),
    max: parsePositiveInt(process.env.RATE_LIMIT_WRITE_MAX, 100),
    message: { message: "Demasiadas peticiones. Espera un momento." },
  });

  const mutatingOnly = (limiter) => (req, res, next) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
      ? limiter(req, res, next)
      : next();

  app.use("/api/auth", authRoutes);
  app.use("/api/competitions", mutatingOnly(writeLimiter), competitionRoutes);
  app.use("/api/competitors", mutatingOnly(writeLimiter), competitorRoutes);
  app.use("/api/results", mutatingOnly(writeLimiter), resultRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/sor", sorRoutes);
  app.use("/api/registrations", mutatingOnly(writeLimiter), registrationRoutes);

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res
        .status(400)
        .json({ message: "JSON inválido en el cuerpo de la petición." });
    }
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ message: "Error interno del servidor." });
  });

  return app;
};

module.exports = createApp;
