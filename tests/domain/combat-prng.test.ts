import { describe, expect, it } from "vitest";

import {
  nextBoundedUint32,
  nextUint32,
  shuffleInstanceIds,
} from "../../src/domain/combat/prng";

describe("combat PRNG v2 golden vectors", () => {
  it.each([
    [0, 2_654_435_769, 1_684_164_658],
    [1, 2_654_435_770, 1_580_013_426],
    [1_234, 2_654_437_003, 3_112_186_583],
    [4_294_967_295, 2_654_435_768, 3_950_124_170],
  ])("pins nextUint32(%i)", (seed, state, value) => {
    expect(nextUint32(seed)).toEqual({ state, value });
  });

  it.each([
    [0, 3, 2_654_435_769, 1],
    [1, 10, 2_654_435_770, 6],
    [1_234, 24, 2_654_437_003, 23],
    [4_294_967_295, 7, 2_654_435_768, 6],
    [3, 2_147_483_649, 3_668_340_014, 1_437_520_376],
  ])("pins unbiased bounded vector seed=%i bound=%i", (seed, bound, state, value) => {
    expect(nextBoundedUint32(seed, bound)).toEqual({ state, value });
  });

  it.each([
    [0, ["b", "a", "d", "c"], 3_668_340_011],
    [1, ["a", "d", "b", "c"], 3_668_340_012],
    [1_234, ["b", "c", "a", "d"], 3_668_341_245],
  ] as const)("pins shuffle vector seed=%i", (seed, instanceIds, randomState) => {
    expect(shuffleInstanceIds(["a", "b", "c", "d"], seed)).toEqual({
      instanceIds,
      randomState,
    });
  });

  it("reaches all 24 four-card permutations across a fixed seed range", () => {
    const orders = new Set(
      Array.from({ length: 1_000 }, (_, seed) =>
        shuffleInstanceIds(["a", "b", "c", "d"], seed).instanceIds.join(""),
      ),
    );
    expect([...orders].sort()).toEqual([
      "abcd", "abdc", "acbd", "acdb", "adbc", "adcb",
      "bacd", "badc", "bcad", "bcda", "bdac", "bdca",
      "cabd", "cadb", "cbad", "cbda", "cdab", "cdba",
      "dabc", "dacb", "dbac", "dbca", "dcab", "dcba",
    ]);
  });

  it("rejects invalid bounds", () => {
    for (const bound of [0, -1, 1.5, Number.NaN, 0x1_0000_0001]) {
      expect(() => nextBoundedUint32(0, bound)).toThrow(RangeError);
    }
  });
});
