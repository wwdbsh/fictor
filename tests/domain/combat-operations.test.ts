import { describe, expect, it } from "vitest";

import { createCombatState, type AtomicOperation, type CombatEvent } from "../../src/domain";
import { applyOperations } from "../../src/domain/combat/operations";
import { fixtureSetup, jsonClone } from "./fixtures";

describe("atomic amount resolution", () => {
  it("classifies malformed amount expressions as INVALID_EFFECT_PROGRAM", () => {
    const state = createCombatState(fixtureSetup());
    const before = jsonClone(state);
    const events: CombatEvent[] = [];
    const operation = {
      kind: "DAMAGE",
      target: { kind: "PLAYER" },
      amount: { kind: "UNKNOWN", callback: () => 1 },
    } as unknown as AtomicOperation;
    expect(applyOperations(
      state,
      [operation],
      { source: "CARD", selectedTarget: null, effectivePower: 1 },
      events,
    )).toEqual({ ok: false, reason: "INVALID_EFFECT_PROGRAM" });
    expect(state).toEqual(before);
    expect(events).toEqual([]);
  });
});
