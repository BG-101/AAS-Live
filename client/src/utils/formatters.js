// ============================================================
// UTILIDADES DE FORMATEO
// Funciones para convertir tiempos entre diferentes formatos:
// - Centésimas de segundo (almacenamiento interno) ↔ String legible
// - Formateo de rangos de fechas
// - Formateo WCA con paréntesis en best/worst del Ao5
// ============================================================

/**
 * Convierte un tiempo en centésimas de segundo a un string legible.
 *
 * Ejemplos:
 *   1234  → "12.34"      (12 segundos, 34 centésimas)
 *   7523  → "1:15.23"    (1 minuto, 15 segundos, 23 centésimas)
 *   -1    → "DNF"        (Did Not Finish)
 *   -2    → "DNS"        (Did Not Start)
 *   0     → ""           (intento vacío)
 *
 * @param {number} time - Tiempo en centésimas de segundo
 * @returns {string} Tiempo formateado
 */
export const formatTime = (time) => {
  if (time === -1) return "DNF";
  if (time === -2) return "DNS";
  if (time === 0 || !time) return "";

  // Descompone las centésimas en componentes
  const centiseconds = time % 100;
  const totalSeconds = Math.floor(time / 100);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Formatea con padding de ceros (ej: "05" en vez de "5")
  const csStr = centiseconds.toString().padStart(2, "0");

  // Si hay minutos: "M:SS.CC", si no: "S.CC"
  if (minutes > 0)
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${csStr}`;
  return `${seconds}.${csStr}`;
};

/**
 * Parsea un string introducido por el usuario a centésimas de segundo.
 *
 * Acepta múltiples formatos de entrada:
 *   "dnf", "/", "-1"  → -1 (DNF)
 *   "dns", "*", "-2"  → -2 (DNS)
 *   ""                → 0  (vacío)
 *   "12.34"           → 1234 (con punto decimal, se interpreta como segundos)
 *   "1234"            → 1234 (sin punto: las últimas 2 cifras son centésimas)
 *   "11234"           → 11234 (1 minuto, 12 segundos, 34 centésimas)
 *
 * @param {string} str - Texto introducido por el usuario
 * @returns {number} Tiempo en centésimas de segundo
 */
export const parseTimeInput = (str) => {
  const cleanStr = str.trim().toLowerCase();

  // Atajos para DNF y DNS (acepta múltiples formatos)
  if (["dnf", "/", "-1"].includes(cleanStr)) return -1;
  if (["dns", "*", "-2"].includes(cleanStr)) return -2;
  if (cleanStr === "") return 0;

  // Si contiene un punto decimal, interpreta como segundos.centésimas
  // Ej: "12.34" → 12.34 * 100 = 1234 centésimas
  if (cleanStr.includes(".")) return Math.round(parseFloat(cleanStr) * 100);

  // Sin punto: interpreta como un número compacto MMSSCC
  // Se eliminan caracteres no numéricos
  const numStr = cleanStr.replace(/\D/g, "");
  if (numStr.length === 0) return 0;

  let cs = 0,  // Centésimas
    sec = 0,   // Segundos
    min = 0;   // Minutos

  if (numStr.length <= 2) {
    // Solo centésimas (ej: "34" → 34cs)
    cs = parseInt(numStr, 10);
  } else if (numStr.length <= 4) {
    // Segundos y centésimas (ej: "1234" → 12s 34cs)
    cs = parseInt(numStr.slice(-2), 10);
    sec = parseInt(numStr.slice(0, -2), 10);
  } else {
    // Minutos, segundos y centésimas (ej: "11234" → 1m 12s 34cs)
    cs = parseInt(numStr.slice(-2), 10);
    sec = parseInt(numStr.slice(-4, -2), 10);
    min = parseInt(numStr.slice(0, -4), 10);
  }

  // Convierte todo a centésimas: 1 minuto = 6000cs, 1 segundo = 100cs
  return min * 6000 + sec * 100 + cs;
};

/**
 * Parsea un valor de cutoff introducido como texto.
 * Misma lógica que parseTimeInput pero sin soporte para DNF/DNS.
 *
 * @param {string} str - Texto del cutoff
 * @returns {number} Cutoff en centésimas de segundo (0 si vacío)
 */
export const parseCutoff = (str) => {
  if (!str) return 0;
  const cleanStr = str.toString().trim();
  if (!cleanStr) return 0;

  const numStr = cleanStr.replace(/\D/g, "");
  if (numStr.length === 0) return 0;

  let cs = 0,
    sec = 0,
    min = 0;

  if (numStr.length <= 2) cs = parseInt(numStr, 10);
  else if (numStr.length <= 4) {
    cs = parseInt(numStr.slice(-2), 10);
    sec = parseInt(numStr.slice(0, -2), 10);
  } else {
    cs = parseInt(numStr.slice(-2), 10);
    sec = parseInt(numStr.slice(-4, -2), 10);
    min = parseInt(numStr.slice(0, -4), 10);
  }
  return min * 6000 + sec * 100 + cs;
};

/**
 * Formatea un cutoff en centésimas a un string legible.
 *
 * @param {number} time - Cutoff en centésimas
 * @returns {string} Cutoff formateado (ej: "1:30.00") o vacío si es 0
 */
export const formatCutoff = (time) => {
  if (!time || time === 0) return "";
  const cs = (time % 100).toString().padStart(2, "0");
  const totSec = Math.floor(time / 100);
  const m = Math.floor(totSec / 60);
  const s = (totSec % 60).toString().padStart(2, "0");
  return m > 0 ? `${m}:${s}.${cs}` : `${s}.${cs}`;
};

/**
 * Formatea un array de tiempos para mostrar en formato WCA.
 *
 * En formato Ao5, cuando los 5 intentos están completos,
 * envuelve entre paréntesis el mejor y el peor tiempo
 * (los que se descartan para calcular el average).
 *
 * Ejemplo Ao5: ["(5.23)", "7.45", "6.89", "8.12", "(DNF)"]
 *
 * @param {number[]} times - Array de tiempos en centésimas
 * @param {string} format - Formato de la ronda ("a", "m", "b")
 * @returns {string[]} Array de tiempos formateados
 */
export const formatWCATimesArray = (times, format) => {
  // Para formatos que no son Ao5, simplemente formatea cada tiempo
  if (format !== "a") return times.map((t) => formatTime(t));

  // Comprueba si los 5 intentos están completos (ninguno vacío)
  const isComplete = times.filter((t) => t !== 0).length === 5;
  let bestIdx = -1,  // Índice del mejor tiempo (se encierra en paréntesis)
    worstIdx = -1;   // Índice del peor tiempo (se encierra en paréntesis)

  if (times.length === 5 && isComplete) {
    // Ordena por valor para encontrar el mejor (índice 0) y peor (índice 4)
    // Los DNF/DNS se tratan como Infinity para que vayan al final
    let validTimes = times.map((t, i) => ({ t: t <= 0 ? Infinity : t, i }));
    validTimes.sort((a, b) => a.t - b.t);
    bestIdx = validTimes[0].i;  // Mejor tiempo
    worstIdx = validTimes[4].i; // Peor tiempo
  }

  // Formatea cada tiempo, envolviendo best y worst entre paréntesis
  return times.map((t, i) => {
    if (t === 0) return ""; // Intento vacío
    const str = formatTime(t);
    return i === bestIdx || i === worstIdx ? `(${str})` : str;
  });
};

/**
 * Formatea un rango de fechas para mostrar.
 *
 * - Si las fechas de inicio y fin son iguales: muestra solo una fecha
 * - Si son diferentes: muestra "inicio - fin"
 * - Si no hay startDate/endDate pero hay legacyDate: usa esa
 *
 * @param {string} startDate - Fecha de inicio (ISO string)
 * @param {string} endDate - Fecha de fin (ISO string)
 * @param {string} legacyDate - Fecha legacy (compatibilidad con datos antiguos)
 * @returns {string} Rango de fechas formateado en formato español
 */
export const formatDateRange = (startDate, endDate, legacyDate) => {
  // Fallback a fecha legacy si no hay fechas de rango
  if (!startDate && !endDate && legacyDate)
    return new Date(legacyDate).toLocaleDateString("es-ES");

  if (!startDate || !endDate) return "Fecha no definida";

  // Formatea ambas fechas en locale español
  const s = new Date(startDate).toLocaleDateString("es-ES");
  const e = new Date(endDate).toLocaleDateString("es-ES");

  // Si es un solo día, muestra solo la fecha; si no, muestra el rango
  return s === e ? s : `${s} - ${e}`;
};
