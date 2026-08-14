import { describe, expect, it } from "vitest";

import {
  advanceResonance,
  calculateResonantPower,
  createResonanceState,
  currentResonanceStreak,
} from "../../src/domain";

describe("base resonance", () => {
  it("tracks A, AA, AAB, and ABB without storing a separate current streak", () => {
    const initial = createResonanceState();
    const a = advanceResonance(initial, "STILL");
    const aa = advanceResonance(a, "STILL");
    const aab = advanceResonance(aa, "BURN");
    const abb = advanceResonance(aab, "BURN");

    expect(currentResonanceStreak(a)).toBe(1);
    expect(currentResonanceStreak(aa)).toBe(2);
    expect(aab).toEqual({
      activeAttribute: "BURN",
      streakByAttribute: { STILL: 0, BURN: 1, SCATTER: 0, ROT: 0, WASH: 0, JOIN: 0 },
    });
    expect(currentResonanceStreak(abb)).toBe(2);
    expect(initial).toEqual(createResonanceState());
  });

  it("applies the first-card multiplier without rounding", () => {
    expect(calculateResonantPower(3, 1, 0.125)).toEqual({ ok: true, value: 3.375 });
  });

  it.each([null, -0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "fails closed for invalid rate %s",
    (rate) => {
      expect(calculateResonantPower(3, 1, rate)).toEqual({
        ok: false,
        reason: "INVALID_RESONANCE_RATE",
      });
    },
  );

  it("rejects calculation overflow", () => {
    expect(calculateResonantPower(Number.MAX_SAFE_INTEGER, 2, 1)).toEqual({
      ok: false,
      reason: "CALCULATION_OVERFLOW",
    });
  });
});
