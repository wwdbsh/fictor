import { describe, expect, it } from "vitest";

import {
  resolveClarified,
  resolveEmptied,
  tryResolveClarified,
  tryResolveEmptied,
} from "../../../src/domain";

describe("T039 CLARIFIED and EMPTIED fixtures", () => {
  it("cleanses the elite and applies capped healing without mutating caller state", () => {
    const state = { hp: 7, maxHp: 10, statuses: ["WEAKENED", "BURNING"] } as const;

    expect(resolveClarified({ healing: 2 }).step(state)).toEqual({
      state: { hp: 9, maxHp: 10, statuses: [] },
      event: "CLARIFIED",
      cleared: 2,
      healed: 2,
    });
    expect(resolveClarified({ healing: 4 }).step(state).state.hp).toBe(10);
    expect(state).toEqual({ hp: 7, maxHp: 10, statuses: ["WEAKENED", "BURNING"] });
  });

  it("counts down before atomically resetting all statuses on its configured period", () => {
    const emptied = resolveEmptied({ intervalTurns: 2 });
    const state = { remainingTurns: 2, player: ["RESONANCE"], enemy: ["POWER_UP"] } as const;
    const countdown = emptied.step(state);

    expect(countdown).toEqual({
      state: { remainingTurns: 1, player: ["RESONANCE"], enemy: ["POWER_UP"] },
      event: "COUNTDOWN",
      cleared: { player: 0, enemy: 0 },
    });
    expect(emptied.step(countdown.state)).toEqual({
      state: { remainingTurns: 2, player: [], enemy: [] },
      event: "EMPTIED",
      cleared: { player: 1, enemy: 1 },
    });
    expect(state).toEqual({ remainingTurns: 2, player: ["RESONANCE"], enemy: ["POWER_UP"] });
  });

  it("rejects unknown config and unsafe caller-supplied values", () => {
    for (const config of [undefined, {}, { healing: 0 }, { healing: 1.5 }, { healing: 1, extra: true }]) {
      expect(tryResolveClarified(config).ok).toBe(false);
    }
    for (const config of [undefined, {}, { intervalTurns: 0 }, { intervalTurns: Number.NaN }, { intervalTurns: 2, extra: true }]) {
      expect(tryResolveEmptied(config).ok).toBe(false);
    }
  });

  it("rejects tampered state atomically", () => {
    const clarified = resolveClarified({ healing: 1 });
    expect(() => clarified.heal({ hp: 0, maxHp: 3, statuses: [] })).toThrow("Invalid CLARIFIED state");
    expect(() => clarified.heal({ hp: 4, maxHp: 3, statuses: [] })).toThrow("Invalid CLARIFIED state");
    expect(() => clarified.heal({ hp: 1, maxHp: 3, statuses: ["SAME", "SAME"] })).toThrow("Invalid CLARIFIED state");

    const emptied = resolveEmptied({ intervalTurns: 2 });
    expect(() => emptied.reset({ remainingTurns: 0, player: [], enemy: [] })).toThrow("Invalid EMPTIED state");
    expect(() => emptied.reset({ remainingTurns: 3, player: [], enemy: [] })).toThrow("Invalid EMPTIED state");
    expect(() => emptied.reset({ remainingTurns: 1, player: [""], enemy: [] })).toThrow("Invalid EMPTIED state");
  });
});
