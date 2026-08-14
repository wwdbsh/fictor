import { describe, expect, it } from "vitest";

import {
  CombatReplayValidationError,
  CombatValidationError,
  createCombatState,
  reduceCombat,
  runCombatReplay,
  validateCombatCommand,
  validateCombatSetup,
  validateCombatState,
  type CombatCommand,
  type CombatState,
} from "../../src/domain";
import { enemyId, fixtureSetup, jsonClone } from "./fixtures";

describe("strict public combat boundaries", () => {
  it.each([
    { type: "BOGUS" },
    { type: "END_TURN", extra: true },
    { type: "PLAY_CARD", instanceId: "instance_a1", target: { kind: "BOGUS" } },
    { type: "PLAY_CARD", instanceId: "instance_a1", target: { kind: "PLAYER", extra: 1 } },
  ])("rejects malformed command shape atomically: $type", (command) => {
    const state = createCombatState(fixtureSetup());
    const before = jsonClone(state);
    const result = reduceCombat(state, command);
    expect(result).toEqual({
      state: before,
      events: [{ type: "COMMAND_REJECTED", command: "UNKNOWN", reason: "INVALID_COMMAND" }],
    });
    expect(state).toEqual(before);
  });

  it("never treats an unknown command as END_TURN", () => {
    const action = reduceCombat(createCombatState(fixtureSetup()), { type: "START_TURN" }).state;
    const before = jsonClone(action);
    const result = reduceCombat(action, { type: "UNKNOWN_END" });
    expect(result.state).toEqual(before);
    expect(result.events).toEqual([
      { type: "COMMAND_REJECTED", command: "UNKNOWN", reason: "INVALID_COMMAND" },
    ]);
    expect(result.state?.zones.hand).toEqual(before.zones.hand);
  });

  it("rejects inherited command fields and accessors without executing getters", () => {
    const inherited = Object.create({ type: "START_TURN" }) as unknown;
    expect(validateCombatCommand(inherited).valid).toBe(false);

    let reads = 0;
    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "type", {
      enumerable: true,
      get() {
        reads += 1;
        return "START_TURN";
      },
    });
    expect(validateCombatCommand(accessor).valid).toBe(false);
    expect(reduceCombat(createCombatState(fixtureSetup()), accessor).events[0]).toMatchObject({
      command: "UNKNOWN",
      reason: "INVALID_COMMAND",
    });
    expect(reads).toBe(0);
  });

  it("canonicalizes a descriptor-safe proxy without invoking its get trap", () => {
    let reads = 0;
    const command = new Proxy({ type: "START_TURN" as const }, {
      get() {
        reads += 1;
        throw new Error("get trap must not run");
      },
    });
    const result = reduceCombat(createCombatState(fixtureSetup()), command);
    expect(result.state?.phase).toBe("PLAYER_ACTION");
    expect(reads).toBe(0);
  });

  it("canonicalizes descriptor-safe state proxies without invoking get traps", () => {
    let reads = 0;
    const proxiedState = new Proxy(createCombatState(fixtureSetup()), {
      get() {
        reads += 1;
        throw new Error("state get trap must not run");
      },
    });
    expect(validateCombatState(proxiedState).valid).toBe(true);
    expect(reduceCombat(proxiedState, { type: "START_TURN" }).state?.phase).toBe("PLAYER_ACTION");
    expect(reads).toBe(0);
  });

  it("returns a null-state boundary failure for malformed state without cloning it", () => {
    let reads = 0;
    const state = createCombatState(fixtureSetup());
    Object.defineProperty(state.player, "hp", {
      enumerable: true,
      get() {
        reads += 1;
        return 30;
      },
    });
    expect(reduceCombat(state, { type: "START_TURN" })).toEqual({
      state: null,
      events: [{ type: "COMMAND_REJECTED", command: "UNKNOWN", reason: "INVALID_STATE" }],
    });
    expect(reads).toBe(0);
  });

  it("rejects custom prototypes, extra callbacks, symbols, sparse arrays, and array properties", () => {
    const inheritedState = Object.create(createCombatState(fixtureSetup()));
    expect(validateCombatState(inheritedState).valid).toBe(false);

    const callbackState = createCombatState(fixtureSetup()) as CombatState & { callback?: () => void };
    callbackState.callback = () => undefined;
    expect(validateCombatState(callbackState).valid).toBe(false);

    const symbolState = createCombatState(fixtureSetup()) as CombatState & { [key: symbol]: boolean };
    symbolState[Symbol("extra")] = true;
    expect(validateCombatState(symbolState).valid).toBe(false);

    const arrayPropertyState = createCombatState(fixtureSetup());
    (arrayPropertyState.cards as unknown as { callback?: () => void }).callback = () => undefined;
    expect(validateCombatState(arrayPropertyState).valid).toBe(false);

    const sparseState = createCombatState(fixtureSetup());
    delete sparseState.zones.deck[1];
    expect(validateCombatState(sparseState).valid).toBe(false);

    expect(validateCombatSetup(Object.create(fixtureSetup())).valid).toBe(false);
    const callbackSetup = fixtureSetup() as ReturnType<typeof fixtureSetup> & { callback?: () => void };
    callbackSetup.callback = () => undefined;
    expect(validateCombatSetup(callbackSetup).valid).toBe(false);
  });

  it("rejects setup accessors without executing them", () => {
    let reads = 0;
    const setup = fixtureSetup();
    Object.defineProperty(setup.rules, "maxEnergy", {
      enumerable: true,
      get() {
        reads += 1;
        return 3;
      },
    });
    expect(validateCombatSetup(setup).valid).toBe(false);
    expect(() => createCombatState(setup)).toThrow(CombatValidationError);
    expect(reads).toBe(0);
  });

  it("is unaffected by Object.prototype pollution and accepts null-prototype top-level records", () => {
    Object.defineProperty(Object.prototype, "pollutedCallback", {
      configurable: true,
      value: () => undefined,
    });
    try {
      expect(validateCombatState(createCombatState(fixtureSetup())).valid).toBe(true);
      const nullPrototypeSetup = Object.assign(Object.create(null), fixtureSetup()) as unknown;
      expect(validateCombatSetup(nullPrototypeSetup).valid).toBe(true);
      expect(createCombatState(nullPrototypeSetup).phase).toBe("TURN_READY");
    } finally {
      delete (Object.prototype as { pollutedCallback?: unknown }).pollutedCallback;
    }
  });

  it("throws typed validation errors for malformed setup and replay commands", () => {
    expect(() => createCombatState({})).toThrow(CombatValidationError);
    expect(() => runCombatReplay(fixtureSetup(), [{ type: "BOGUS" }])).toThrow(
      CombatReplayValidationError,
    );
    const commands = [{ type: "START_TURN" }] as CombatCommand[] & { callback?: () => void };
    commands.callback = () => undefined;
    expect(() => runCombatReplay(fixtureSetup(), commands)).toThrow(CombatReplayValidationError);
  });

  it("allows pending card numerics in state but refuses to play them", () => {
    const setup = fixtureSetup();
    setup.cards[0].cost = null;
    setup.cards[0].power = null;
    expect(validateCombatSetup(setup).valid).toBe(true);
    const action = reduceCombat(createCombatState(setup), { type: "START_TURN" }).state;
    const before = jsonClone(action);
    const result = reduceCombat(action, {
      type: "PLAY_CARD",
      instanceId: "instance_a1",
      target: { kind: "ENEMY", enemyId },
    });
    expect(result.events).toEqual([
      { type: "COMMAND_REJECTED", command: "PLAY_CARD", reason: "INVALID_CARD_NUMERIC" },
    ]);
    expect(result.state).toEqual(before);
  });

  it("enforces status/TERMINAL phase coherence", () => {
    const ongoingTerminal = createCombatState(fixtureSetup());
    ongoingTerminal.phase = "TERMINAL";
    expect(validateCombatState(ongoingTerminal).valid).toBe(false);

    const staleTerminal = createCombatState(fixtureSetup());
    staleTerminal.enemy.hp = 0;
    staleTerminal.status = "VICTORY";
    staleTerminal.phase = "PLAYER_ACTION";
    expect(validateCombatState(staleTerminal).valid).toBe(false);
    staleTerminal.phase = "TERMINAL";
    expect(validateCombatState(staleTerminal).valid).toBe(true);
  });
});
