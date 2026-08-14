import { describe, expect, it } from "vitest";

import {
  COMBAT_EFFECT_IDS,
  createCombatState,
  reduceCombat,
  type CombatCommand,
  type CombatState,
  type CombatTarget,
  type TerminalPolicy,
} from "../../src/domain";
import {
  enemyId,
  fixed,
  fixtureSetup,
  jsonClone,
  power,
  program,
  setupForEveryEffect,
} from "./fixtures";

function started(setup = fixtureSetup()): CombatState {
  return reduceCombat(createCombatState(setup), { type: "START_TURN" }).state;
}

function play(instanceId: string, target: CombatTarget | null = { kind: "ENEMY", enemyId }) {
  return { type: "PLAY_CARD" as const, instanceId, target };
}

describe("combat state machine", () => {
  it("enforces the command/phase matrix", () => {
    const ready = createCombatState(fixtureSetup());
    expect(reduceCombat(ready, { type: "START_TURN" }).events[0]).toEqual({
      type: "PHASE_CHANGED",
      phase: "START_TURN",
    });
    expect(reduceCombat(ready, { type: "END_TURN" }).events).toEqual([
      { type: "COMMAND_REJECTED", command: "END_TURN", reason: "INVALID_PHASE" },
    ]);
    expect(reduceCombat(ready, play("instance_a1")).events[0]).toMatchObject({ reason: "INVALID_PHASE" });

    const action = started();
    expect(reduceCombat(action, { type: "START_TURN" }).events[0]).toMatchObject({ reason: "INVALID_PHASE" });
    expect(reduceCombat(action, { type: "END_TURN" }).state.phase).toBe("TURN_READY");

    for (const phase of ["START_TURN", "END_TURN"] as const) {
      const intermediate = jsonClone(action);
      intermediate.phase = phase;
      for (const command of [{ type: "START_TURN" }, { type: "END_TURN" }, play("instance_a1")] as CombatCommand[]) {
        expect(reduceCombat(intermediate, command).events[0]).toMatchObject({ reason: "INVALID_PHASE" });
      }
    }
  });

  it("starts at turn zero, increments on successful start, resets energy, and draws from deck top", () => {
    const initial = createCombatState(fixtureSetup());
    expect(initial.turn).toBe(0);
    expect(initial.zones.deck[0]).toBe("instance_a1");
    const result = reduceCombat(initial, { type: "START_TURN" });
    expect(result.state).toMatchObject({ turn: 1, phase: "PLAYER_ACTION" });
    expect(result.state.player.energy).toBe(3);
    expect(result.state.zones.hand).toEqual([
      "instance_a1",
      "instance_a2",
      "instance_b",
      "instance_guard",
    ]);
  });

  it("rejects turn counter overflow atomically", () => {
    const state = createCombatState(fixtureSetup());
    state.turn = Number.MAX_SAFE_INTEGER;
    const result = reduceCombat(state, { type: "START_TURN" });
    expect(result.events[0]).toMatchObject({ reason: "CALCULATION_OVERFLOW" });
    expect(result.state).toEqual(state);
  });

  it("plays successfully with energy, first resonance multiplier, operations, zone move, and ordered events", () => {
    const result = reduceCombat(started(), play("instance_a1"));
    expect(result.state.player.energy).toBe(2);
    expect(result.state.enemy.hp).toBe(29);
    expect(result.state.resonance.activeAttribute).toBe("STILL");
    expect(result.state.resonance.streakByAttribute.STILL).toBe(1);
    expect(result.state.zones.discard).toEqual(["instance_a1"]);
    expect(result.events.map(({ type }) => type)).toEqual([
      "ENERGY_SPENT",
      "RESONANCE_ADVANCED",
      "CARD_PLAYED",
      "OPERATION_APPLIED",
      "CARD_MOVED",
    ]);
    expect(result.events[2]).toMatchObject({ effectivePower: 11 });
  });

  it("uses effect-id dispatch for all 21 ids without card-id branching", () => {
    for (let index = 0; index < COMBAT_EFFECT_IDS.length; index += 1) {
      const setup = setupForEveryEffect();
      setup.deck = [setup.instances[index].instanceId];
      setup.instances = [setup.instances[index]];
      setup.cards = [setup.cards[index]];
      const action = started(setup);
      const result = reduceCombat(action, play(setup.instances[0].instanceId, null));
      expect(result.events.find((event) => event.type === "CARD_PLAYED")).toMatchObject({
        effectId: COMBAT_EFFECT_IDS[index],
      });
    }
  });

  it.each([
    ["missing program", (state: CombatState) => { state.programs = []; }, "EFFECT_PROGRAM_UNAVAILABLE"],
    ["missing resonance projection", (state: CombatState) => { state.cards[0].resonanceAttribute = null; }, "RESONANCE_ATTRIBUTE_REQUIRED"],
    ["null rate", (state: CombatState) => { state.rules.resonanceRate = null; }, "INVALID_RESONANCE_RATE"],
    ["insufficient energy", (state: CombatState) => { state.player.energy = 0; }, "INSUFFICIENT_ENERGY"],
  ] as const)("rejects %s atomically", (_label, change, reason) => {
    const state = started();
    change(state);
    const before = jsonClone(state);
    const result = reduceCombat(state, play("instance_a1"));
    expect(result.events).toEqual([{ type: "COMMAND_REJECTED", command: "PLAY_CARD", reason }]);
    expect(result.state).toEqual(before);
    expect(state).toEqual(before);
  });

  it("rejects missing, invalid, and mismatched targets without mutation", () => {
    const state = started();
    const cases = [
      [null, "TARGET_REQUIRED"],
      [{ kind: "PLAYER" } as const, "TARGET_NOT_ALLOWED"],
      [{ kind: "ENEMY", enemyId: "other" } as const, "TARGET_ENEMY_MISMATCH"],
    ] as const;
    for (const [target, reason] of cases) {
      const result = reduceCombat(state, play("instance_a1", target));
      expect(result.events[0]).toMatchObject({ reason });
      expect(result.state).toEqual(state);
    }
  });

  it("applies block before hp damage, clamps hp to zero, and supports exile destinations", () => {
    const setup = fixtureSetup();
    setup.enemy.block = 5;
    setup.enemy.hp = 5;
    setup.programs[0].playedCardDestination = "EXILE";
    const result = reduceCombat(started(setup), play("instance_a1"));
    expect(result.state.enemy).toMatchObject({ hp: 0, block: 0 });
    expect(result.state.zones.exile).toEqual(["instance_a1"]);
    expect(result.state.status).toBe("VICTORY");
  });

  it("discards hand, expires enemy block before its intent, protects player with block, retains by rational floor, and rotates", () => {
    const setup = fixtureSetup();
    setup.rules.blockRetention = { numerator: 1, denominator: 2, rounding: "FLOOR" };
    setup.enemy.block = 7;
    setup.enemy.intents[0] = {
      intentId: "intent_special",
      labelKo: "다시 굳기",
      telegraph: "SPECIAL",
      displayAmount: null,
      program: {
        operations: [
          { kind: "GAIN_BLOCK", target: { kind: "ENEMY", enemyId }, amount: fixed(2) },
          { kind: "DAMAGE", target: { kind: "PLAYER" }, amount: fixed(3) },
        ],
      },
    };
    const state = started(setup);
    state.player.block = 6;
    const result = reduceCombat(state, { type: "END_TURN" });
    expect(result.state.enemy.block).toBe(2);
    expect(result.state.player).toMatchObject({ hp: 30, block: 1 });
    expect(result.state.zones.discard).toEqual(state.zones.hand);
    expect(result.state.enemy.currentIntentIndex).toBe(1);
    expect(result.events.map(({ type }) => type)).toEqual([
      "PHASE_CHANGED",
      "HAND_DISCARDED",
      "ENEMY_BLOCK_EXPIRED",
      "ENEMY_INTENT_EXECUTED",
      "OPERATION_APPLIED",
      "OPERATION_APPLIED",
      "PLAYER_BLOCK_RETAINED",
      "ENEMY_INTENT_ROTATED",
      "TURN_ENDED",
      "PHASE_CHANGED",
    ]);
  });

  it("ends immediately after lethal intent without retention or rotation", () => {
    const setup = fixtureSetup();
    setup.player.hp = 2;
    const state = started(setup);
    const result = reduceCombat(state, { type: "END_TURN" });
    expect(result.state.status).toBe("DEFEAT");
    expect(result.state.phase).toBe("TERMINAL");
    expect(result.state.enemy.currentIntentIndex).toBe(0);
    expect(result.events.slice(-2)).toEqual([
      { type: "COMBAT_ENDED", status: "DEFEAT" },
      { type: "PHASE_CHANGED", phase: "TERMINAL" },
    ]);
    expect(reduceCombat(result.state, { type: "START_TURN" }).events[0]).toMatchObject({
      reason: "TERMINAL_COMBAT",
    });
  });

  it.each([
    ["DEFEAT_FIRST", "DEFEAT"],
    ["VICTORY_FIRST", "VICTORY"],
  ] as [TerminalPolicy, string][])("resolves simultaneous lethal using %s", (terminalPolicy, expected) => {
    const setup = fixtureSetup();
    setup.rules.terminalPolicy = terminalPolicy;
    setup.player.hp = 2;
    setup.enemy.hp = 2;
    setup.programs[0] = program("DELAYED_EXPLOSION", [
      { kind: "DAMAGE", target: { kind: "ENEMY", enemyId }, amount: fixed(2) },
      { kind: "DAMAGE", target: { kind: "PLAYER" }, amount: fixed(2) },
    ]);
    const result = reduceCombat(started(setup), play("instance_a1"));
    expect(result.state.status).toBe(expected);
  });

  it("supports self-damage and evaluates terminal state only after the full program", () => {
    const setup = fixtureSetup();
    setup.player.hp = 1;
    setup.programs[0] = program("DELAYED_EXPLOSION", [
      { kind: "DAMAGE", target: { kind: "PLAYER" }, amount: fixed(1) },
      { kind: "HEAL", target: { kind: "PLAYER" }, amount: fixed(2) },
    ]);
    const result = reduceCombat(started(setup), play("instance_a1"));
    expect(result.state.player.hp).toBe(2);
    expect(result.state.status).toBe("ONGOING");
  });

  it("fails the whole play when a later operation overflows", () => {
    const setup = fixtureSetup();
    setup.player.block = Number.MAX_SAFE_INTEGER;
    setup.programs[0] = program("DELAYED_EXPLOSION", [
      { kind: "DAMAGE", target: { kind: "ENEMY", enemyId }, amount: fixed(1) },
      { kind: "GAIN_BLOCK", target: { kind: "PLAYER" }, amount: fixed(1) },
    ]);
    const state = started(setup);
    const before = jsonClone(state);
    const result = reduceCombat(state, play("instance_a1"));
    expect(result.events[0]).toMatchObject({ reason: "CALCULATION_OVERFLOW" });
    expect(result.state).toEqual(before);
  });

  it("classifies EFFECT_POWER multiplication overflow and rejects atomically", () => {
    const setup = fixtureSetup();
    setup.rules.resonanceRate = 0;
    setup.programs[0] = program("DELAYED_EXPLOSION", [
      {
        kind: "DAMAGE",
        target: { kind: "ENEMY", enemyId },
        amount: { kind: "EFFECT_POWER", multiplier: Number.MAX_SAFE_INTEGER },
      },
    ]);
    const state = started(setup);
    const before = jsonClone(state);
    const result = reduceCombat(state, play("instance_a1"));
    expect(result.events).toEqual([
      { type: "COMMAND_REJECTED", command: "PLAY_CARD", reason: "CALCULATION_OVERFLOW" },
    ]);
    expect(result.state).toEqual(before);
    expect(state).toEqual(before);
  });
});
