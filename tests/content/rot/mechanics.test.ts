import { describe, expect, it } from "vitest";

import {
  resolveNeutralized,
  resolveSelfEating,
  tryResolveNeutralized,
  tryResolveSelfEating,
} from "../../../src/domain";

describe("T038 NEUTRALIZED and SELF_EATING fixtures", () => {
  it("resets both sides' status lists without mutating the caller state", () => {
    const state = {
      player: ["RESONANCE", "BLOCKED"],
      enemy: ["WEAKENED"],
    } as const;

    expect(resolveNeutralized({}).step(state)).toEqual({
      state: { player: [], enemy: [] },
      event: "RESET_STATES",
      cleared: { player: 2, enemy: 1 },
    });
    expect(state).toEqual({ player: ["RESONANCE", "BLOCKED"], enemy: ["WEAKENED"] });
  });

  it("consumes boss health to gain power while preserving the final hit point", () => {
    const selfEating = resolveSelfEating({ hpCost: 3, powerGain: 2 });
    const first = selfEating.step({ hp: 8, power: 5 });
    const second = selfEating.step(first.state);
    const exhausted = selfEating.step(second.state);

    expect(first).toEqual({
      state: { hp: 5, power: 7 },
      event: "SELF_EATING",
      hpConsumed: 3,
      powerGained: 2,
    });
    expect(second.state).toEqual({ hp: 2, power: 9 });
    expect(exhausted).toEqual({
      state: { hp: 2, power: 9 },
      event: "EXHAUSTED",
      hpConsumed: 0,
      powerGained: 0,
    });
  });

  it("rejects unknown config and unsafe caller-supplied values", () => {
    for (const config of [undefined, { extra: true }]) {
      expect(tryResolveNeutralized(config).ok).toBe(false);
    }
    for (const config of [
      undefined,
      {},
      { hpCost: 0, powerGain: 1 },
      { hpCost: 1, powerGain: 0 },
      { hpCost: 1.5, powerGain: 1 },
      { hpCost: 1, powerGain: Number.NaN },
      { hpCost: 1, powerGain: Number.MAX_SAFE_INTEGER + 1 },
      { hpCost: 1, powerGain: 1, extra: true },
    ]) {
      expect(tryResolveSelfEating(config).ok).toBe(false);
    }
  });

  it("rejects duplicate or tampered state and overflow atomically", () => {
    const neutralized = resolveNeutralized({});
    expect(() => neutralized.reset({ player: ["SAME", "SAME"], enemy: [] })).toThrow("Invalid NEUTRALIZED state");
    expect(() => neutralized.reset({ player: [], enemy: [""] })).toThrow("Invalid NEUTRALIZED state");
    expect(() => neutralized.reset({ player: [], enemy: [], extra: true } as never)).toThrow("Invalid NEUTRALIZED state");

    const selfEating = resolveSelfEating({ hpCost: 1, powerGain: 2 });
    expect(() => selfEating.consume({ hp: 3, power: Number.MAX_SAFE_INTEGER })).toThrow("SELF_EATING power overflow");
    expect(() => selfEating.consume({ hp: 0, power: 1 })).toThrow("Invalid SELF_EATING state");
  });
});
