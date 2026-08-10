// ============================================================
// PRUEBAS: wcaLogic.agegroups.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const {
  DEFAULT_AGE_GROUPS,
  resolveAgeGroups,
  filterByAgeGroup,
  getAgeAtDate,
  resolveCompetitorAge,
} = require("../utils/wcaLogic");

describe("getAgeAtDate", () => {
  test("cumpleaños ya pasado este año", () => {
    expect(getAgeAtDate("2010-05-01", "2026-06-01")).toBe(16);
  });
  test("cumpleaños aún no llega este año", () => {
    expect(getAgeAtDate("2010-08-01", "2026-06-01")).toBe(15);
  });
  test("mismo día exacto cuenta como cumplido", () => {
    expect(getAgeAtDate("2010-06-01", "2026-06-01")).toBe(16);
  });
  test("sin birthDate o referencia -> null", () => {
    expect(getAgeAtDate(null, "2026-06-01")).toBeNull();
    expect(getAgeAtDate("2010-06-01", null)).toBeNull();
  });
});

describe("resolveCompetitorAge", () => {
  test("prioriza birthDate sobre age legacy", () => {
    expect(
      resolveCompetitorAge({ birthDate: "2010-06-01", age: 99 }, "2026-06-01"),
    ).toBe(16);
  });
  test("cae a age legacy si no hay birthDate", () => {
    expect(resolveCompetitorAge({ age: 20 }, "2026-06-01")).toBe(20);
  });
  test("sin birthDate ni age -> null", () => {
    expect(resolveCompetitorAge({}, "2026-06-01")).toBeNull();
  });
});

describe("resolveAgeGroups", () => {
  test("sin ageGroups personalizados -> devuelve los 3 por defecto", () => {
    expect(resolveAgeGroups({ ageGroups: [] })).toEqual(DEFAULT_AGE_GROUPS);
    expect(resolveAgeGroups({})).toEqual(DEFAULT_AGE_GROUPS);
  });

  test("normaliza minAge/maxAge null -> undefined", () => {
    const comp = {
      ageGroups: [
        {
          _id: { toString: () => "abc123" },
          label: "Sub23",
          minAge: 18,
          maxAge: null,
        },
      ],
    };
    expect(resolveAgeGroups(comp)).toEqual([
      { _id: "abc123", label: "Sub23", minAge: 18, maxAge: undefined },
    ]);
  });
});

describe("filterByAgeGroup", () => {
  const referenceDate = "2026-06-01";
  const competitors = [
    { name: "Menor10", birthDate: "2018-01-01" }, // 8 años
    { name: "Adolescente", birthDate: "2012-01-01" }, // 14 años
    { name: "Adulto20", birthDate: "2006-01-01" }, // 20 años
    { name: "SinEdad" },
  ];

  test("sin groupKey devuelve todos sin filtrar", () => {
    expect(
      filterByAgeGroup(competitors, null, DEFAULT_AGE_GROUPS, referenceDate),
    ).toEqual(competitors);
  });

  test("grupo solo con minAge y maxAge (rango cerrado)", () => {
    const groups = [{ _id: "g1", label: "11-15", minAge: 11, maxAge: 15 }];
    expect(
      filterByAgeGroup(competitors, "g1", groups, referenceDate).map(
        (c) => c.name,
      ),
    ).toEqual(["Adolescente"]);
  });

  test("grupo solo con maxAge (<=10)", () => {
    const groups = [{ _id: "g2", label: "Peques", maxAge: 10 }];
    expect(
      filterByAgeGroup(competitors, "g2", groups, referenceDate).map(
        (c) => c.name,
      ),
    ).toEqual(["Menor10"]);
  });

  test("grupo solo con minAge (>=16)", () => {
    const groups = [{ _id: "g3", label: "Absoluta", minAge: 16 }];
    expect(
      filterByAgeGroup(competitors, "g3", groups, referenceDate).map(
        (c) => c.name,
      ),
    ).toEqual(["Adulto20"]);
  });

  test("grupo solo con minAge, maxAge=null crudo (tal cual sale de Mongo sin pasar por resolveAgeGroups)", () => {
    const groups = [{ _id: "g4", label: "Absoluta", minAge: 16, maxAge: null }];
    expect(
      filterByAgeGroup(competitors, "g4", groups, referenceDate).map(
        (c) => c.name,
      ),
    ).toEqual(["Adulto20"]);
  });

  test("competidor sin edad resuelta nunca entra en ningún grupo", () => {
    const groups = [{ _id: "g5", label: "Todos", minAge: 0 }];
    expect(
      filterByAgeGroup(competitors, "g5", groups, referenceDate).find(
        (c) => c.name === "SinEdad",
      ),
    ).toBeUndefined();
  });

  test("groupKey que no existe en la lista -> array vacío", () => {
    expect(
      filterByAgeGroup(
        competitors,
        "no-existe",
        DEFAULT_AGE_GROUPS,
        referenceDate,
      ),
    ).toEqual([]);
  });

  test("grupo sin minAge ni maxAge definidos -> nadie entra", () => {
    expect(
      filterByAgeGroup(
        competitors,
        "g6",
        [{ _id: "g6", label: "Roto" }],
        referenceDate,
      ),
    ).toEqual([]);
  });
});
