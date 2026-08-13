// ============================================================
// UTILIDAD: secretStrength
// Heurísticas mínimas para secretos de bootstrap (token/password).
// No sustituye un validador NIST completo, pero bloquea el caso
// "cumple la longitud pero es trivialmente adivinable".
// ============================================================

const crypto = require("crypto");

const COMMON_WEAK_VALUES = [
  "admin123",
  "password",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "changeme123",
  "administrator",
];

const hasLowCharDiversity = (value, minUniqueChars) =>
  new Set(value.toLowerCase()).size < minUniqueChars;

// Detecta que todo el string sea la repetición de un bloque de 1-4 chars
// (ej: "aaaaaaaaaaaa", "abababababab").
const isRepeatingPattern = (value) => {
  for (let blockLen = 1; blockLen <= 4; blockLen++) {
    const block = value.slice(0, blockLen);
    if (
      block
        .repeat(Math.ceil(value.length / blockLen))
        .slice(0, value.length) === value
    )
      return true;
  }
  return false;
};

/**
 * @returns {string|null} mensaje de error, o null si el secreto es aceptable
 */
const validateSecretStrength = (value, { minLength, minUniqueChars }) => {
  if (!value || value.length < minLength)
    return `Debe tener al menos ${minLength} caracteres.`;
  if (COMMON_WEAK_VALUES.includes(value.trim().toLowerCase()))
    return "Es un valor común/predecible. Elige uno distinto.";
  if (hasLowCharDiversity(value, minUniqueChars))
    return `Debe tener al menos ${minUniqueChars} caracteres distintos (evita repeticiones).`;
  if (isRepeatingPattern(value))
    return "Es un patrón repetitivo trivial. Elige uno con más entropía.";
  return null;
};

const generateStrongPassword = (length = 12) => {
  let result = "";
  while (result.length < length) {
    result += crypto
      .randomBytes(length)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "");
  }
  return result.slice(0, length);
};

module.exports = { validateSecretStrength, generateStrongPassword };
