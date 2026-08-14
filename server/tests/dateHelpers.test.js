process.env.TZ = "America/Los_Angeles"; // Fuerza timezone no-UTC para el test

const { hasReachedDate, daysElapsedSince } = require("../utils/dateHelpers");

describe("hasReachedDate - independiente de TZ del servidor", () => {
  test("startDate a medianoche UTC, servidor en UTC-8: ya alcanzada si son las 20:00 UTC del día anterior en local pero ya es el día en UTC", () => {
    // 2026-06-01T00:00:00Z -> en America/Los_Angeles es 2026-05-31T17:00 local
    const startDateUTC = "2026-06-01T00:00:00.000Z";
    const referenceUTC = new Date("2026-06-01T00:00:00.000Z"); // Exactamente el borde
    expect(hasReachedDate(startDateUTC, referenceUTC)).toBe(true);
  });

  test("un milisegundo antes del borde UTC -> aún no alcanzada", () => {
    const startDateUTC = "2026-06-01T00:00:00.000Z";
    const referenceUTC = new Date("2026-05-31T23:59:59.999Z");
    expect(hasReachedDate(startDateUTC, referenceUTC)).toBe(false);
  });

  test("cambio de DST en el hemisferio norte (marzo) no desplaza el día calendario", () => {
    // 2026-03-08 es el día del cambio a horario de verano en EE.UU.
    expect(
      daysElapsedSince(
        "2026-03-08T00:00:00.000Z",
        new Date("2026-03-09T00:00:00.000Z"),
      ),
    ).toBe(1);
  });

  test("un timestamp que cruza medianoche UTC durante el mismo día en que ocurre la transición DST de LA sigue comparándose en UTC, no en hora local", () => {
    // 2026-03-08 10:00 UTC es el instante exacto de la transición DST en LA
    // (2:00 AM PST salta a 3:00 AM PDT). Elegimos un par de timestamps
    // DESPUÉS de esta transición (ya en PDT, UTC-7) que caen en días UTC
    // distintos pero en el MISMO día calendario local:
    //   referenceDate: 2026-03-08T23:59:59.999Z -> local 2026-03-08T16:59:59.999 PDT
    //   startDate:     2026-03-09T00:00:00.000Z -> local 2026-03-08T17:00:00.000 PDT
    // Con getters locales ambos caerían en "8 de marzo" (mismo día -> true).
    // En UTC son días distintos (8 vs 9) -> debe ser false
    const startDateUTC = "2026-03-09T00:00:00.000Z";
    const referenceUTC = new Date("2026-03-08T23:59:59.999Z");
    expect(hasReachedDate(startDateUTC, referenceUTC)).toBe(false);
  });

  test("instante justo antes y justo después de la transición DST de LA (01:59:59.999 PST -> 3:00:00.000 PDT) permanecen en el mismo día calendario UTC", () => {
    const beforeTransition = "2026-03-08T09:59:59.999Z"; // 01:59:59.999 PST
    const afterTransition = "2026-03-08T10:00:00.000Z"; // 3:00:00.000 PDT
    expect(daysElapsedSince(beforeTransition, afterTransition)).toBe(0);
    expect(hasReachedDate(afterTransition, beforeTransition)).toBe(true);
  });
});
