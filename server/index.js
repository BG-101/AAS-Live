// ============================================================
// PUNTO DE ENTRADA DEL SERVIDOR
// Configura Express, WebSockets (Socket.IO), middlewares de
// seguridad, conexión a MongoDB y monta todas las rutas de la API.
// ============================================================

// Carga las variables de entorno desde el archivo .env (MONGO_URI, JWT_SECRET, etc.)
require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error(
    "❌ FATAL: JWT_SECRET no definido en .env. Abortando arranque.",
  );
  process.exit(1);
}

// --- Dependencias principales ---
const { connectDB } = require("./config/db");
const http = require("http"); // Servidor HTTP nativo (necesario para Socket.IO)
const { Server } = require("socket.io"); // WebSockets para actualizaciones en tiempo real
const createApp = require("./app");

// --- Creación de la aplicación Express ---
const app = createApp();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  process.env.CLIENT_URL,
].filter(Boolean); // Elimina undefined si CLIENT_URL no está definida

// ============================================================
// CONFIGURACIÓN DE WEBSOCKETS (Socket.IO)
// Se usa para emitir eventos en tiempo real al proyector y a
// otros clientes cuando se actualizan resultados o competiciones.
// ============================================================
const server = http.createServer(app);

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
// CONEXIÓN A MONGODB
// Usa la URI definida en .env para conectar a MongoDB Atlas.
// ============================================================
connectDB().catch((err) => {
  console.error("❌ Error de conexión a MongoDB:", err);
  process.exit(1);
});

// --- Inicia el servidor HTTP (que a su vez activa Socket.IO) ---
server.listen(PORT, () => {
  console.log(`🚀 Servidor protegido corriendo en puerto ${PORT}`);
});
