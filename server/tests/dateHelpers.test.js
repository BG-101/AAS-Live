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
});
