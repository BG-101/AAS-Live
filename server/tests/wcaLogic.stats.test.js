// ============================================================
// PRUEBAS: wcaLogic.stats.test
// Comprueba el comportamiento esperado de esta funcionalidad.
// ============================================================

const { calculateStats, sortResultsWCA } = require("../utils/wcaLogic");

describe("calculateAo5", () => {
  describe("Formato Ao5", () => {
    test("descarta mejor y peor, promedia 3 centrales", () => {
      const { best, average } = calculateStats(
        [1200, 1100, 1300, 1000, 1400],
        "a",
      );
      expect(best).toBe(1000);
      expect(average).toBe(1200);
    });

    test("1 DNF se descarta como peor, average se calcula", () => {
      const { best, average } = calculateStats(
        [1000, 1100, -1, 1200, 1300],
        "a",
      );
      expect(best).toBe(1000);
      expect(average).toBe(1200);
    });

    test("2 DNF/DNS -> average DNF (-1)", () => {
      const { average } = calculateStats([1000, -1, -2, 1200, 1300], "a");
      expect(average).toBe(-1);
    });

    test("intento vacío (0) -> average 0 (incompleto)", () => {
      const { average } = calculateStats([1000, 1100, 0, 1200, 1300], "a");
      expect(average).toBe(0);
    });

    test("longitud distinta de 5 -> average 0", () => {
      const { average } = calculateStats([1000, 1100, 1200], "a");
      expect(average).toBe(0);
    });

    test("todos DNF -> best -1", () => {
      const { best } = calculateStats([-1, -1, -1, -1, -1], "a");
      expect(best).toBe(-1);
    });
  });

  describe("Formate Mo3", () => {
    test("media aritmética simple sin descartes", () => {
      const { best, average } = calculateStats([1000, 1100, 1200], "m");
      expect(best).toBe(1000);
      expect(average).toBe(1100);
    });

    test("1 solo DNF ya invalida el average completo", () => {
      const { average } = calculateStats([1000, -1, 1200], "m");
      expect(average).toBe(-1);
    });

    test("intento vacío -> average 0", () => {
      const { average } = calculateStats([1000, 1100, 0], "m");
      expect(average).toBe(0);
    });
  });

  describe("Formate Bo3", () => {
    test("average siempre 0, best = mínimo válido", () => {
      const { best, average } = calculateStats([1500, -1, 1200], "b");
      expect(best).toBe(1200);
      expect(average).toBe(0);
    });

    test("todos DNF -> best -1", () => {
      const { best } = calculateStats([-1, -2, -1], "b");
      expect(best).toBe(-1);
    });
  });
});

describe("sortResultsWCA", () => {
  test("ordena ascendente por average", () => {
    const sorted = sortResultsWCA([
      { average: 1500, best: 1400 },
      { average: 1200, best: 1100 },
    ]);
    expect(sorted[0].average).toBe(1200);
  });

  test("empate en average desempata por best", () => {
    const sorted = sortResultsWCA([
      { average: 1200, best: 1150 },
      { average: 1200, best: 1050 },
    ]);
    expect(sorted[0].best).toBe(1050);
  });

  test("pesos actuales: DNS (-2) queda antes que DNF (-1)", () => {
    const sorted = sortResultsWCA([
      { average: -1, best: -1 }, // DNF -> peso 9999999
      { average: -2, best: -2 }, // DNS -> peso 8888888
      { average: 1000, best: 900 },
    ]);
    expect(sorted.map((r) => r.average)).toEqual([1000, -2, -1]);
  });

  test("no muta el array original", () => {
    const results = [
      { average: 1500, best: 1400 },
      { average: 1200, best: 1100 },
    ];
    const snapshot = JSON.parse(JSON.stringify(results));
    sortResultsWCA(results);
    expect(results).toEqual(snapshot);
  });
});
