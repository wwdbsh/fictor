import { describe, expect, it } from "vitest";

import {
  advanceStillkinResonance,
  calculateStillkinResonantPower,
  clearStillkinHarden,
  createStillkinHardenOverlay,
  createStillkinResonanceState,
  enforceStillkinHarden,
  selectStillkinHardenTarget,
  STILLKIN_BLOCK_RETENTION,
  STILLKIN_POLICY,
  STILLKIN_RESONANCE_RATE,
} from "../../src/domain";

describe("Stillkin pure policy", () => {
  it("uses exactly half-floor retention and the approved configured resonance rate", () => {
    expect(STILLKIN_BLOCK_RETENTION).toEqual({ numerator: 1, denominator: 2, rounding: "FLOOR" });
    expect(Object.keys(STILLKIN_BLOCK_RETENTION)).toEqual(["numerator", "denominator", "rounding"]);
    expect(STILLKIN_POLICY.blockRetention).toBe(STILLKIN_BLOCK_RETENTION);
    expect(STILLKIN_RESONANCE_RATE).toEqual({ status: "CONFIGURED", value: 0.08 });
  });

  it("preserves every attribute streak while changing the active attribute", () => {
    const still = advanceStillkinResonance(createStillkinResonanceState(), "STILL");
    const stillAgain = advanceStillkinResonance(still, "STILL");
    const alternating = advanceStillkinResonance(stillAgain, "BURN");
    const returned = advanceStillkinResonance(alternating, "STILL");

    expect(alternating).toEqual({
      activeAttribute: "BURN",
      streakByAttribute: { STILL: 2, BURN: 1, SCATTER: 0, ROT: 0, WASH: 0, JOIN: 0 },
    });
    expect(returned).toEqual({
      activeAttribute: "STILL",
      streakByAttribute: { STILL: 3, BURN: 1, SCATTER: 0, ROT: 0, WASH: 0, JOIN: 0 },
    });
  });

  it("uses the configured default and still rejects an explicitly pending rate", () => {
    expect(calculateStillkinResonantPower(3, 1)).toEqual({ ok: true, value: 3.24 });
    expect(calculateStillkinResonantPower(3, 1, { status: "PENDING_2026_08_21" })).toEqual({
      ok: false,
      reason: "PENDING_RESONANCE_RATE",
    });
    expect(calculateStillkinResonantPower(3, 1, { status: "CONFIGURED", value: 0.125 })).toEqual({
      ok: true,
      value: 3.375,
    });
  });
});

describe("Stillkin HARDEN overlay", () => {
  const zones = {
    deck: ["deck-a", "target", "deck-b"],
    hand: ["hand-target"],
    discard: ["discard-target"],
    exile: ["exile-target"],
  } as const;

  it("selects an instance without moving any zone", () => {
    const overlay = selectStillkinHardenTarget("target");
    expect(overlay).toEqual({ targetInstanceId: "target" });
    expect(zones.deck).toEqual(["deck-a", "target", "deck-b"]);
  });

  it("moves only an exact draw-deck instance stably and is idempotent", () => {
    const overlay = selectStillkinHardenTarget(createStillkinHardenOverlay(), "target");
    const first = enforceStillkinHarden(zones, overlay);
    const second = enforceStillkinHarden(first, overlay);

    expect(first).toEqual({
      deck: ["target", "deck-a", "deck-b"],
      hand: ["hand-target"],
      discard: ["discard-target"],
      exile: ["exile-target"],
    });
    expect(second).toEqual(first);
  });

  it("does not teleport a selected hand, discard, or exile instance", () => {
    for (const instanceId of ["hand-target", "discard-target", "exile-target"]) {
      const result = enforceStillkinHarden(zones, selectStillkinHardenTarget(instanceId));
      expect(result).toEqual(zones);
    }
  });

  it("uses instance IDs so duplicated card definitions remain distinct", () => {
    const duplicatedDefinitions = [
      { cardId: "ore_still", instanceId: "ore-a" },
      { cardId: "ore_still", instanceId: "ore-b" },
    ];
    const result = enforceStillkinHarden(
      { deck: ["ore-a", "ore-b"], hand: [], discard: [], exile: [] },
      selectStillkinHardenTarget("ore-b"),
    );
    expect(duplicatedDefinitions[0].cardId).toBe(duplicatedDefinitions[1].cardId);
    expect(result.deck).toEqual(["ore-b", "ore-a"]);
  });

  it("clears the target at combat end", () => {
    expect(clearStillkinHarden()).toEqual({ targetInstanceId: null });
  });
});
