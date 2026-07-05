// ============================================================
// PUNTO DE ENTRADA DEL SERVIDOR
// Configura Express, WebSockets (Socket.IO), middlewares de
// seguridad, conexión a MongoDB y monta todas las rutas de la API.
// ============================================================

// Carga las variables de entorno desde el archivo .env (MONGO_URI, JWT_SECRET, etc.)
require("dotenv").config();

// --- Dependencias principales ---
const express = require("express");
const cors = require("cors"); // Permite peticiones cross-origin desde el frontend
const mongoose = require("mongoose"); // ODM para MongoDB
const http = require("http"); // Servidor HTTP nativo (necesario para Socket.IO)
const { Server } = require("socket.io"); // WebSockets para actualizaciones en tiempo real
const helmet = require("helmet"); // Cabeceras HTTP de seguridad
const cookieParser = require("cookie-parser"); // Parsea cookies (usadas para el JWT)
const rateLimit = require("express-rate-limit"); // Limita peticiones por IP para evitar abuso

// --- Importación de rutas ---
const competitionRoutes = require("./routes/competitionRoutes");
const competitorRoutes = require("./routes/competitorRoutes");
const resultRoutes = require("./routes/resultRoutes");
const auditRoutes = require("./routes/auditRoutes");
const authRoutes = require("./routes/authRoutes");
const sorRoutes = require("./routes/sorRoutes");

// --- Creación de la aplicación Express ---
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;

// ============================================================
// CONFIGURACIÓN DE WEBSOCKETS (Socket.IO)
// Se usa para emitir eventos en tiempo real al proyector y a
// otros clientes cuando se actualizan resultados o competiciones.
// ============================================================
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  process.env.CLIENT_URL,
].filter(Boolean); // Elimina undefined si CLIENT_URL no está definida

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // Permite enviar cookies junto con las peticiones
  },
});

// Almacena la instancia de Socket.IO en Express para poder acceder
// desde cualquier ruta con req.app.get("socketio")
app.set("socketio", io);

// Escucha conexiones/desconexiones de clientes WebSocket
io.on("connection", (socket) => {
  console.log(
    `📡 Un espectador/admin se ha conectado en vivo (ID: ${socket.id})`,
  );

  socket.on("disconnect", () => {
    console.log(`🔌 Espectador desconectado (ID: ${socket.id})`);
  });
});

// ============================================================
// MIDDLEWARES GLOBALES
// Se ejecutan en orden para cada petición entrante.
// ============================================================
app.use(helmet()); // Añade cabeceras de seguridad (X-Frame-Options, CSP, etc.)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // Habilita el envío/recepción de cookies
  }),
);
app.use(express.json({ limit: "10kb" })); // Parsea el body de las peticiones como JSON
app.use(cookieParser()); // Parsea las cookies del header (necesario para leer el JWT)

// ============================================================
// CONEXIÓN A MONGODB
// Usa la URI definida en .env para conectar a MongoDB Atlas.
// ============================================================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => console.error("❌ Error de conexión a MongoDB:", err));

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // máximo de 100 escrituras por minuto por IP
  message: { message: "Demasiadas peticiones. Espera un momento." },
});

// ============================================================
// MONTAJE DE RUTAS DE LA API
// Cada grupo de rutas maneja un recurso diferente.
// Las rutas de escritura incluyen writeLimiter directamente.
// ============================================================
app.use("/api/auth", authRoutes); // Login, logout, registro y verificación
app.use("/api/competitions", writeLimiter, competitionRoutes); // CRUD de competiciones y rondas
app.use("/api/competitors", writeLimiter, competitorRoutes); // CRUD de competidores
app.use("/api/results", writeLimiter, resultRoutes); // Guardar/consultar tiempos y resultados
app.use("/api/audit", auditRoutes); // Consultar el registro de auditoría
app.use("/api/sor", sorRoutes);

// --- Inicia el servidor HTTP (que a su vez activa Socket.IO) ---
server.listen(PORT, () => {
  console.log(`🚀 Servidor protegido corriendo en puerto ${PORT}`);
});
