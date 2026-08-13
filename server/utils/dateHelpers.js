const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Día calendario "puro" en UTC (sin componente horario), inmune a DST:
// dos medianoches locales distan 23h o 25h en un cambio de hora, pero
// sus fechas UTC-only siempre distan un múltiplo exacto de 24h.
const toCalendarDayUTC = (date) => {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// true desde las 00:00 del día targetDate en adelante
const hasReachedDate = (targetDate, referenceDate = new Date()) =>
  toCalendarDayUTC(referenceDate) >= toCalendarDayUTC(targetDate);

const daysElapsedSince = (date, referenceDate = new Date()) => {
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (toCalendarDayUTC(referenceDate) - toCalendarDayUTC(date)) / msInDay,
  );
};

module.exports = { startOfDay, hasReachedDate, daysElapsedSince };
