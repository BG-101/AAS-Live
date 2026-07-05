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

// Rate limiter: máximo 10 intentos de login cada 15 minutos por IP
// Protege contra ataques de fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Ventana de 15 minutos
  max: 10, // Máximo 10 intentos
  message: {
    message:
      "Demasiados intentos de inicio de sesión. Ha sido bloqueado por 15 minutos.",
  },
});

// ============================================================
// POST /api/auth/login
// Autentica un usuario con username y password.
// Si es correcto, genera un JWT y lo envía como cookie httpOnly.
// ============================================================
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Busca el usuario en la base de datos
    const user = await User.findOne({ username });
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
      { expiresIn: "48h" },
    );

    // Envía el JWT como cookie httpOnly (no accesible desde JavaScript del cliente)
    // Esto protege contra ataques XSS
    res.cookie("jwtToken", token, {
      httpOnly: true, // No accesible desde JS del navegador
      secure: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Protección contra CSRF
      maxAge: 48 * 60 * 60 * 1000, // Expira en 48 horas (en ms)
    });

    // También devuelve los datos del usuario en el body del response
    res.json({ role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    secure: true,
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

  try {
    // Comprueba si ya existe un SuperAdmin
    const existingAdmin = await User.findOne({ role: "SuperAdmin" });
    if (existingAdmin)
      return res
        .status(400)
        .json({ message: "El sistema ya está inicializado." });

    // Hashea la contraseña por defecto con bcrypt (salt de 10 rondas)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("admin123", salt);

    // Crea el usuario SuperAdmin
    const newAdmin = new User({
      username: "admin",
      password: hashedPassword,
      role: "SuperAdmin",
    });

    await newAdmin.save();
    res.json({
      message: "SuperAdmin creado con éxito. Usuario: admin, Clave: admin123",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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

    // Verifica que no exista ya un usuario con ese nombre
    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ message: "El usuario ya existe." });

    // Hashea la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crea el usuario con el rol especificado (o "Delegado" por defecto)
    const newUser = new User({
      username,
      password: hashedPassword,
      role: role || "Delegado",
    });

    await newUser.save();
    res
      .status(201)
      .json({ message: `Usuario ${username} (${role}) creado correctamente.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
