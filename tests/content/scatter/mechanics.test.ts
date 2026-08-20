import { describe, expect, it } from "vitest";

import {
  resolveDispersal,
  resolveSpreading,
  tryResolveDispersal,
  tryResolveSpreading,
} from "../../../src/domain";

describe("T037 SPREADING and DISPERSAL fixtures", () => {
  it("spreads one debuff deterministically without mutating the caller's target list", () => {
    const targets = ["rear", "flank", "reserve"];
    const spreading = resolveSpreading({ maxTargets: 2 });

    expect(spreading.step("front", "WEAKENED", targets)).toEqual({
      event: "SPREAD_DEBUFF",
      sourceTargetId: "front",
      hits: [
        { targetId: "rear", debuffId: "WEAKENED" },
        { targetId: "flank", debuffId: "WEAKENED" },
      ],
    });
    expect(targets).toEqual(["rear", "flank", "reserve"]);
  });

  it("keeps DISPERSAL untargetable until the configured phase expires", () => {
    const dispersal = resolveDispersal({ phaseTurns: 2 });
    const first = dispersal.step(dispersal.initialState());
    const second = dispersal.step(first.state);
    const settled = dispersal.step(second.state);

    expect(first).toEqual({ state: { remainingTurns: 1 }, event: "DISPERSED", canBeHit: false });
    expect(second).toEqual({ state: { remainingTurns: 0 }, event: "MATERIALIZED", canBeHit: true });
    expect(settled).toEqual(second);
  });

  it("rejects missing, non-positive, unsafe, and extra numeric configuration", () => {
    for (const config of [undefined, {}, { maxTargets: 0 }, { maxTargets: -1 }, { maxTargets: 1.5 }, { maxTargets: Number.NaN }, { maxTargets: Number.MAX_SAFE_INTEGER + 1 }, { maxTargets: 1, extra: true }]) {
      expect(tryResolveSpreading(config).ok).toBe(false);
    }
    for (const config of [undefined, {}, { phaseTurns: 0 }, { phaseTurns: -1 }, { phaseTurns: 1.5 }, { phaseTurns: Number.NaN }, { phaseTurns: Number.MAX_SAFE_INTEGER + 1 }, { phaseTurns: 1, extra: true }]) {
      expect(tryResolveDispersal(config).ok).toBe(false);
    }
  });

  it("rejects duplicate, source, empty, and tampered-state inputs atomically", () => {
    const spreading = resolveSpreading({ maxTargets: 2 });
    expect(() => spreading.spread("front", "WEAKENED", [])).toThrow("Invalid SPREADING targets");
    expect(() => spreading.spread("front", "WEAKENED", ["rear", "rear"])).toThrow("Invalid SPREADING targets");
    expect(() => spreading.spread("front", "WEAKENED", ["front"])).toThrow("Invalid SPREADING targets");
    expect(() => spreading.spread("front", "", ["rear"])).toThrow("Invalid SPREADING targets");

    const dispersal = resolveDispersal({ phaseTurns: 2 });
    expect(() => dispersal.advance({ remainingTurns: 3 })).toThrow("Invalid DISPERSAL state");
    expect(() => dispersal.advance({ remainingTurns: -1 })).toThrow("Invalid DISPERSAL state");
    expect(() => dispersal.advance({ remainingTurns: 1, extra: 1 } as never)).toThrow("Invalid DISPERSAL state");
  });
});
