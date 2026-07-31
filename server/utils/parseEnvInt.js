const MAX_SAFE_TIMEOUT_MS = 2147483647; // Límite de setTimeout/setInterval en Node (~24.8 días)

const parsePositiveInt = (value, fallback, max = Infinity) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};

module.exports = { parsePositiveInt, MAX_SAFE_TIMEOUT_MS };
