import { describe, expect, it } from "vitest";

import {
  resolveBlast,
  resolveBurnout,
  tryResolveBlast,
  tryResolveBurnout,
} from "../../../src/domain";

describe("T036 BLAST and BURNOUT fixtures", () => {
  it("resolves BLAST as one immediate equal hit against every unique target", () => {
    const blast = resolveBlast({ damage: 4 });
    expect(blast.step(["front", "rear"])).toEqual({
      event: "BURST_AOE",
      hits: [
        { targetId: "front", damage: 4 },
        { targetId: "rear", damage: 4 },
      ],
      totalDamage: 8,
    });
    expect(() => blast.step([])).toThrow("Invalid BLAST targets");
    expect(() => blast.step(["same", "same"])).toThrow("Invalid BLAST targets");
  });

  it("spends boss health to raise BURNOUT power while preserving the final hit point", () => {
    const burnout = resolveBurnout({ hpCost: 3, powerGain: 2 });
    const first = burnout.step({ hp: 8, power: 5 });
    const second = burnout.step(first.state);
    const exhausted = burnout.step(second.state);

    expect(first).toEqual({
      state: { hp: 5, power: 7 },
      event: "BURN",
      hpSpent: 3,
      powerGained: 2,
    });
    expect(second).toEqual({
      state: { hp: 2, power: 9 },
      event: "BURN",
      hpSpent: 3,
      powerGained: 2,
    });
    expect(exhausted).toEqual({
      state: { hp: 2, power: 9 },
      event: "EXHAUSTED",
      hpSpent: 0,
      powerGained: 0,
    });
  });

  it("rejects missing, non-positive, unsafe, and extra numeric configuration", () => {
    for (const config of [undefined, {}, { damage: 0 }, { damage: -1 }, { damage: 1.5 }, { damage: Number.NaN }, { damage: Number.MAX_SAFE_INTEGER + 1 }, { damage: 1, extra: true }]) {
      expect(tryResolveBlast(config).ok).toBe(false);
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
      expect(tryResolveBurnout(config).ok).toBe(false);
    }
  });

  it("keeps runtime numbers caller-supplied and rejects state overflow atomically", () => {
    const blast = resolveBlast({ damage: Number.MAX_SAFE_INTEGER });
    expect(() => blast.release(["left", "right"])).toThrow("BLAST damage overflow");

    const burnout = resolveBurnout({ hpCost: 1, powerGain: 2 });
    expect(() => burnout.burn({ hp: 3, power: Number.MAX_SAFE_INTEGER })).toThrow("BURNOUT power overflow");
    expect(() => burnout.burn({ hp: 0, power: 1 })).toThrow("Invalid BURNOUT state");
  });
});
