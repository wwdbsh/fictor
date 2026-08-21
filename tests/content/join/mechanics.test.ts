import { describe, expect, it } from "vitest";

import {
  resolveHardened,
  resolveKnot,
  tryResolveHardened,
  tryResolveKnot,
} from "../../../src/domain";

describe("T040 HARDENED and KNOT fixtures", () => {
  it("grants the configured defense to every ally without mutating caller state", () => {
    const state = { allies: [{ id: "swarm", block: 0 }, { id: "shell", block: 3 }] } as const;

    expect(resolveHardened({ block: 2 }).step(state)).toEqual({
      state: { allies: [{ id: "swarm", block: 2 }, { id: "shell", block: 5 }] },
      event: "HARDENED",
      grantedBlock: 2,
    });
    expect(state).toEqual({ allies: [{ id: "swarm", block: 0 }, { id: "shell", block: 3 }] });
  });

  it("regenerates the boss up to max HP without mutating caller state", () => {
    const state = { hp: 7, maxHp: 10 } as const;

    expect(resolveKnot({ healing: 2 }).regenerate(state)).toEqual({
      state: { hp: 9, maxHp: 10 },
      event: "KNOT",
      healed: 2,
    });
    expect(resolveKnot({ healing: 5 }).step(state)).toEqual({
      state: { hp: 10, maxHp: 10 },
      event: "KNOT",
      healed: 3,
    });
    expect(state).toEqual({ hp: 7, maxHp: 10 });
  });

  it("rejects unknown config and unsafe values", () => {
    for (const config of [undefined, {}, { block: 0 }, { block: 1.5 }, { block: 1, extra: true }]) {
      expect(tryResolveHardened(config).ok).toBe(false);
    }
    for (const config of [undefined, {}, { healing: 0 }, { healing: Number.NaN }, { healing: 1, extra: true }]) {
      expect(tryResolveKnot(config).ok).toBe(false);
    }
  });

  it("rejects tampered or overflowing state atomically", () => {
    const hardened = resolveHardened({ block: 1 });
    expect(() => hardened.grant({ allies: [] })).toThrow("Invalid HARDENED state");
    expect(() => hardened.grant({ allies: [{ id: "same", block: 0 }, { id: "same", block: 1 }] })).toThrow("Invalid HARDENED state");
    expect(() => hardened.grant({ allies: [{ id: "ally", block: Number.MAX_SAFE_INTEGER }] })).toThrow("HARDENED block overflow");

    const knot = resolveKnot({ healing: 1 });
    expect(() => knot.regenerate({ hp: 0, maxHp: 3 })).toThrow("Invalid KNOT state");
    expect(() => knot.regenerate({ hp: 4, maxHp: 3 })).toThrow("Invalid KNOT state");
  });
});
