import { describe, expect, it } from "vitest";

import {
  resolvePressedFire,
  resolveTotalStop,
  tryResolvePressedFire,
  tryResolveTotalStop,
} from "../../src/domain";

describe("Stillkin encounter mechanics", () => {
  it("requires strict safe positive integer configuration", () => {
    for (const config of [
      undefined,
      null,
      {},
      { chargeTurns: 0, explosionPower: 1 },
      { chargeTurns: -1, explosionPower: 1 },
      { chargeTurns: 1.5, explosionPower: 1 },
      { chargeTurns: Number.NaN, explosionPower: 1 },
      { chargeTurns: Number.POSITIVE_INFINITY, explosionPower: 1 },
      { chargeTurns: Number.MAX_SAFE_INTEGER + 1, explosionPower: 1 },
      { chargeTurns: 2, explosionPower: 1, extra: true },
      { chargeTurns: 2, explosionPower: 0 },
      { chargeTurns: 2, explosionPower: -1 },
      { chargeTurns: 2, explosionPower: 1.5 },
      { chargeTurns: 2, explosionPower: Number.NaN },
      { chargeTurns: 2, explosionPower: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(tryResolvePressedFire(config).ok).toBe(false);
    }
    for (const config of [
      undefined,
      {},
      { shield: 0 },
      { shield: -1 },
      { shield: 1.5 },
      { shield: Number.NaN },
      { shield: Number.MAX_SAFE_INTEGER + 1 },
      { shield: 2, extra: true },
    ]) {
      expect(tryResolveTotalStop(config).ok).toBe(false);
    }
    expect(() => resolvePressedFire({ chargeTurns: 0, explosionPower: 1 })).toThrow();
    expect(() => resolveTotalStop({ shield: 0 })).toThrow();
  });

  it("charges from zero and releases exactly at the configured boundary", () => {
    const evaluator = resolvePressedFire({ chargeTurns: 3, explosionPower: 7 });
    const initial = evaluator.initialState();
    const first = evaluator.step(initial);
    const second = evaluator.step(first.state);
    const third = evaluator.step(second.state);

    expect(initial).toEqual({ charge: 0 });
    expect(first).toEqual({ state: { charge: 1 }, event: "CHARGE", explosionPower: null });
    expect(second).toEqual({ state: { charge: 2 }, event: "CHARGE", explosionPower: null });
    expect(third).toEqual({ state: { charge: 0 }, event: "RELEASE", explosionPower: 7 });
  });

  it("starts sealed, reduces by nonnegative safe damage, and breaks once", () => {
    const evaluator = resolveTotalStop({ shield: 5 });
    const initial = evaluator.initialState();
    const partial = evaluator.step(initial, 2);
    const broken = evaluator.step(partial.state, 3);
    const afterBroken = evaluator.step(broken.state, Number.MAX_SAFE_INTEGER);

    expect(initial).toEqual({ status: "SEALED", remainingShield: 5 });
    expect(partial).toEqual({ state: { status: "SEALED", remainingShield: 3 }, event: "SEALED" });
    expect(broken).toEqual({ state: { status: "BROKEN", remainingShield: 0 }, event: "BROKEN" });
    expect(afterBroken).toEqual(broken);
  });

  it("is deterministic under repeated serialization of evaluator states", () => {
    const pressed = resolvePressedFire({ chargeTurns: 2, explosionPower: 5 });
    const pressedTrace = [pressed.initialState()];
    pressedTrace.push(pressed.step(pressedTrace[0]).state);
    pressedTrace.push(pressed.step(pressedTrace[1]).state);

    const stop = resolveTotalStop({ shield: 4 });
    const stopTrace = [stop.initialState()];
    stopTrace.push(stop.step(stopTrace[0], 1).state);
    stopTrace.push(stop.step(stopTrace[1], 3).state);

    expect(JSON.stringify(pressedTrace)).toBe(JSON.stringify([{ charge: 0 }, { charge: 1 }, { charge: 0 }]));
    expect(JSON.stringify(stopTrace)).toBe(
      JSON.stringify([
        { status: "SEALED", remainingShield: 4 },
        { status: "SEALED", remainingShield: 3 },
        { status: "BROKEN", remainingShield: 0 },
      ]),
    );
  });
});
