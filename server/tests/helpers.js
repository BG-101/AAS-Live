// ============================================================
// PRUEBAS: helpers
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const bcrypt = require("bcryptjs");
const request = require("supertest");
const User = require("../models/User");

const createUser = async (username, password, role = "Delegado") => {
  const hashed = await bcrypt.hash(password, 10);
  return User.create({ username, password: hashed, role });
};

const loginAs = async (app, username, password) => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username, password });
  return res.headers["set-cookie"];
};

module.exports = { createUser, loginAs };
