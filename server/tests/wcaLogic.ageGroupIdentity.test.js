const {
  resolveLocalAgeGroupId,
  ageGroupSignature,
  resolveAgeGroups,
} = require("../utils/wcaLogic");

describe("resolveLocalAgeGroupId", () => {
  const compA = {
    ageGroupsEnabled: true,
    ageGroups: [
      {
        _id: { toString: () => "a1" },
        label: "Cadete",
        minAge: 11,
        maxAge: 14,
      },
      {
        _id: { toString: () => "a2" },
        label: "Cadete",
        minAge: 15,
        maxAge: 17,
      },
    ],
  };
  const compB = {
    ageGroupsEnabled: true,
    ageGroups: [
      {
        _id: { toString: () => "b1" },
        label: "Cadete",
        minAge: 15,
        maxAge: 17,
      },
      {
        _id: { toString: () => "b2" },
        label: "Cadete",
        minAge: 11,
        maxAge: 14,
      },
    ],
  };

  test("distingue grupos con el mismo label pero rango distinto por firma completa", () => {
    const groups = resolveAgeGroups(compA);
    const youngerSig = ageGroupSignature(groups.find((g) => g.minAge === 11));
    const olderSig = ageGroupSignature(groups.find((g) => g.minAge === 15));

    expect(resolveLocalAgeGroupId(compA, youngerSig)).toBe("a1");
    expect(resolveLocalAgeGroupId(compA, olderSig)).toBe("a2");
    // Mismo label+rango en otra competición con orden de declaración distinto
    expect(resolveLocalAgeGroupId(compB, youngerSig)).toBe("b2");
    expect(resolveLocalAgeGroupId(compB, olderSig)).toBe("b1");
  });

  test("signature inexistente en la competición -> null", () => {
    expect(resolveLocalAgeGroupId(compA, "no_existente|0|0")).toBeNull();
  });

  test("sin ageGroupsEnabled -> null aunque la signature sea válida", () => {
    const disabled = { ...compA, ageGroupsEnabled: false };
    const sig = ageGroupSignature(resolveAgeGroups(compA)[0]);
    expect(resolveLocalAgeGroupId(disabled, sig)).toBeNull();
  });

  test("signature vacía/null -> null", () => {
    expect(resolveLocalAgeGroupId(compA, null)).toBeNull();
    expect(resolveLocalAgeGroupId(compA, "")).toBeNull();
  });
});
