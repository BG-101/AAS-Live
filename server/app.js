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
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { message: "Demasiadas peticiones. Espera un momento." },
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/competitions", writeLimiter, competitionRoutes);
  app.use("/api/competitors", writeLimiter, competitorRoutes);
  app.use("/api/results", writeLimiter, resultRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/sor", sorRoutes);
  app.use("/api/registrations", writeLimiter, registrationRoutes);

  return app;
};

module.exports = createApp;
