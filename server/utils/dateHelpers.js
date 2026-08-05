const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// true desde las 00:00 del día targetDate en adelante
const hasReachedDate = (targetDate, referenceDate = new Date()) =>
  startOfDay(referenceDate) >= startOfDay(targetDate);

const daysElapsedSince = (date, referenceDate = new Date()) => {
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.floor((startOfDay(referenceDate) - startOfDay(date)) / msInDay);
};

module.exports = { startOfDay, hasReachedDate, daysElapsedSince };
