// ============================================================
// RUTAS DE AUTENTICACIÓN (/api/auth)
// Gestiona login, logout, registro de usuarios y la
// inicialización del primer SuperAdmin del sistema.
// ============================================================

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs"); // Hashing de contraseñas
const jwt = require("jsonwebtoken"); // Generación de tokens JWT
const User = require("../models/User");
const rateLimit = require("express-rate-limit"); // Protección contra fuerza bruta
const auth = require("../middleware/auth");
const crypto = require("crypto");
const {
  parsePositiveInt,
  MAX_SAFE_TIMEOUT_MS,
} = require("../utils/parseEnvInt");
const { validateSecretStrength } = require("../utils/secretStrength");
const { isValidUsername } = require("../utils/validateUsername");
const { sendServerError } = require("../utils/errorResponse");

const resolveJwtExpiresIn = (raw) => {
  if (!raw) return "48h";
  const trimmed = raw.trim();
  // jsonwebtoken interpreta un number como segundos, y un string como ms().
  // Un env var puramente numérico ("3600") lo tratamos como segundos,
  // que es la interpretación intuitiva para quien configura el .env.
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
};

const JWT_EXPIRES_IN = resolveJwtExpiresIn(process.env.JWT_EXPIRES_IN);

try {
  jwt.sign({}, "validation-only", { expiresIn: JWT_EXPIRES_IN });
} catch (err) {
  console.error(
    `❌ FATAL: JWT_EXPIRES_IN inválido ("${process.env.JWT_EXPIRES_IN}"): ${err.message}`,
  );
  process.exit(1);
}

const LOGIN_WINDOW_MS = parsePositiveInt(
  process.env.RATE_LIMIT_LOGIN_WINDOW_MS,
  15 * 60 * 1000,
  MAX_SAFE_TIMEOUT_MS,
);
const LOGIN_WINDOW_MINUTES = Math.max(1, Math.ceil(LOGIN_WINDOW_MS / 60000));

// Rate limiter: máximo 10 intentos de login cada 15 minutos por IP
// Protege contra ataques de fuerza bruta
const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: parsePositiveInt(process.env.RATE_LIMIT_LOGIN_MAX, 10),
  message: {
    message: `Demasiados intentos de inicio de sesión. Ha sido bloqueado por ${LOGIN_WINDOW_MINUTES} minutos.`,
  },
  skip: () =>
    process.env.NODE_ENV === "test" &&
    process.env.DISABLE_RATE_LIMIT === "true", // solo tests, false por defecto
});

// ============================================================
// POST /api/auth/login
// Autentica un usuario con username y password.
// Si es correcto, genera un JWT y lo envía como cookie httpOnly.
// ============================================================
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({ message: "Usuario o contraseña incorrectos." });
    }
    const cleanUsername = username.trim();

    if (!cleanUsername || !password)
      return res
        .status(400)
        .json({ message: "Usuario o contraseña incorrectos." });

    // Busca el usuario en la base de datos
    const user = await User.findOne({ username: cleanUsername });
    if (!user)
      return res
        .status(400)
        .json({ message: "Usuario o contraseña incorrectos." });

    // Compara la contraseña con el hash almacenado
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res
        .status(400)
        .json({ message: "Usuario o contraseña incorrectos." });

    // Genera un JWT con el id y rol del usuario, válido 48 horas
    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    // Envía el JWT como cookie httpOnly (no accesible desde JavaScript del cliente)
    // Esto protege contra ataques XSS
    res.cookie("jwtToken", token, {
      httpOnly: true, // No accesible desde JS del navegador
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Protección contra CSRF
      maxAge: parsePositiveInt(
        process.env.COOKIE_MAX_AGE_MS,
        48 * 60 * 60 * 1000,
      ),
    });

    // También devuelve los datos del usuario en el body del response
    res.json({ role: user.role, username: user.username });
  } catch (err) {
    sendServerError(res, err);
  }
});

// ============================================================
// GET /api/auth/me
// Devuelve los datos del usuario autenticado actual.
// Se usa al cargar la app para verificar si la sesión sigue activa.
// Requiere un JWT válido (cualquier rol).
// ============================================================
router.get("/me", auth(), async (req, res) => {
  res.json({ role: req.user.role, username: req.user.username });
});

// ============================================================
// POST /api/auth/logout
// Cierra la sesión eliminando la cookie del JWT.
// ============================================================
router.post("/logout", (req, res) => {
  res.clearCookie("jwtToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  }); // Elimina la cookie del navegador
  res.json({ message: "Sesión cerrada correctamente" });
});

// ============================================================
// POST /api/auth/setup
// Endpoint de inicialización del sistema.
// Crea el primer SuperAdmin con credenciales por defecto.
// Solo funciona si NO existe ya un SuperAdmin.
// ============================================================
router.post("/setup", async (req, res) => {
  // Bloquea el endpoint si no está explícitamente habilitado en .env
  if (process.env.ALLOW_SETUP !== "true") {
    return res.status(403).json({
      message:
        "Endpoint deshabilitado. Establece ALLOW_SETUP=true en .env para usarlo.",
    });
  }

  const bootstrapToken = process.env.SETUP_BOOTSTRAP_TOKEN;
  const tokenError = validateSecretStrength(bootstrapToken, {
    minLength: 20,
    minUniqueChars: 8,
  });
  if (tokenError) {
    return res
      .status(500)
      .json({ message: `SETUP_BOOTSTRAP_TOKEN inválido: ${tokenError} ` });
  }

  const provided = Buffer.from(
    typeof req.headers["x-setup-token"] === "string"
      ? req.headers["x-setup-token"]
      : "",
  );
  const expected = Buffer.from(bootstrapToken);
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return res
      .status(401)
      .json({ message: "Token de inicialización inválido." });
  }

  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  const passwordError = validateSecretStrength(defaultPassword, {
    minLength: 12,
    minUniqueChars: 6,
  });
  if (passwordError) {
    return res
      .status(500)
      .json({ message: `DEFAULT_ADMIN_PASSWORD inválido: ${passwordError}` });
  }

  // Trim primero: " " es truthy y saltaría el fallback "admin", quedando luego
  // vacío tras el trim() de /login -> SuperAdmin inalcanzable.
  const rawUsername = (process.env.DEFAULT_ADMIN_USERNAME || "").trim();
  const defaultUsername = rawUsername || "admin";
  if (!isValidUsername(defaultUsername)) {
    return res.status(500).json({
      message:
        "DEFAULT_ADMIN_USERNAME inválido (máx 32 caracteres, solo letras/números/._-).",
    });
  }

  try {
    // Chequeo rápido para dar un mensaje claro en el caso común (no es la
    // garantía real de atomicidad, eso lo hace el índice único parcial)
    const existingAdmin = await User.findOne({ role: "SuperAdmin" });
    if (existingAdmin)
      return res
        .status(400)
        .json({ message: "El sistema ya está inicializado." });

    // Precheck: un 11000 por username (no por role) no significa "ya inicializado",
    // significa que DEFAULT_ADMIN_USERNAME choca con un usuario ya existente.
    const usernameToken = await User.findOne({ username: defaultUsername });
    if (usernameToken) {
      return res.status(500).json({
        message: `El usuario '${defaultUsername}' (DEFAULT_ADMIN_USERNAME) ya existe. Cambia DEFAULT_ADMIN_USERNAME y reintenta.`,
      });
    }

    // Hashea la contraseña por defecto con bcrypt (salt de 10 rondas)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);

    // Crea el usuario SuperAdmin
    await new User({
      username: defaultUsername,
      password: hashedPassword,
      role: "SuperAdmin",
    }).save();

    res.json({
      message: `SuperAdmin '${defaultUsername}' creado con éxito. Usa la contraseña definida en DEFAULT_ADMIN_PASSWORD.`,
    });
  } catch (err) {
    // Fallback de la carrera: dos requests concurrentes pueden pasar ambos
    // prechecks antes de que cualquiera haga save(). El índice único
    // distingue qué invariante se violó.
    if (err.code === 11000) {
      if (err.keyPattern?.role) {
        return res
          .status(400)
          .json({ message: "El sistema ya está inicializado." });
      }
      if (err.keyPattern?.username) {
        return res.status(500).json({
          message: `El usuario '${defaultUsername}' (DEFAULT_ADMIN_USERNAME) ya existe. Cambia DEFAULT_ADMIN_USERNAME y reintenta.`,
        });
      }
    }
    sendServerError(res, err);
  }
});

// ============================================================
// POST /api/auth/register
// Crea un nuevo usuario en el sistema.
// Solo accesible para SuperAdmin (gestión de cuentas).
// ============================================================
router.post("/register", auth(["SuperAdmin"]), async (req, res) => {
  try {
    const { username, password, role } = req.body;

    const ALLOWED_ROLES = ["SuperAdmin", "Delegado", "Espectador"];
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: "Rol no válido." });
    }

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !isValidUsername(username.trim()) ||
      password.length < 8
    ) {
      return res.status(400).json({
        message:
          "Usuario inválido (máx 32 caracteres, solo letras/números/tildes/._-) y contraseña mín. 8 caracteres.",
      });
    }
    const cleanUsername = username.trim();

    // Verifica que no exista ya un usuario con ese nombre
    const existingUser = await User.findOne({ username: cleanUsername });
    if (existingUser)
      return res.status(400).json({ message: "El usuario ya existe." });

    // Hashea la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crea el usuario con el rol especificado (o "Delegado" por defecto)
    const assignedRole = role || "Delegado";

    const newUser = new User({
      username: cleanUsername,
      password: hashedPassword,
      role: assignedRole,
    });

    await newUser.save();
    res.status(201).json({
      message: `Usuario ${cleanUsername} (${assignedRole}) creado correctamente.`,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "El usuario ya existe." });
    }
    sendServerError(res, err);
  }
});

// ============================================================
// POST /api/auth/logout-projectors
// Emite un evento de socket para forzar el cierre de sesión
// en todas las pantallas con rol Espectador.
// Solo accesible para SuperAdmin y Delegado.
// ============================================================
router.post(
  "/logout-projectors",
  auth(["SuperAdmin", "Delegado"]),
  (req, res) => {
    req.app.get("socketio").emit("proyector_logout");
    res.json({ message: "Señal de cierre enviada a todos los proyectores." });
  },
);

module.exports = router;
