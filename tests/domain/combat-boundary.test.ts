import { describe, expect, it } from "vitest";

import {
  CombatReplayValidationError,
  CombatValidationError,
  createCombatState,
  decodeCombatSetup,
  decodeCombatState,
  reduceCombat,
  runCombatReplay,
  validateCombatCommand,
  validateCombatSetup,
  validateCombatState,
  type CombatCommand,
  type CombatState,
} from "../../src/domain";
import { cloneCombatSetup, cloneOperation } from "../../src/domain/combat/clone";
import { enemyId, fixtureSetup, jsonClone } from "./fixtures";

function changingDescriptor<T extends object>(
  source: T,
  key: PropertyKey,
  values: readonly unknown[],
): { value: T; reads: () => number } {
  let reads = 0;
  return {
    value: new Proxy(source, {
      getOwnPropertyDescriptor(target, candidate) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, candidate);
        if (candidate !== key || !descriptor || !("value" in descriptor)) return descriptor;
        const value = values[Math.min(reads, values.length - 1)];
        reads += 1;
        return { ...descriptor, value };
      },
    }),
    reads: () => reads,
  };
}

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

  it("reads nested card descriptors once and keeps the first setup/state snapshot", () => {
    const setup = fixtureSetup();
    const setupCost = changingDescriptor(setup.cards[0], "cost", [1, 2, 3]);
    setup.cards[0] = setupCost.value;
    const decodedSetup = decodeCombatSetup(setup);
    expect(decodedSetup.valid).toBe(true);
    if (!decodedSetup.valid) throw new Error(decodedSetup.errors.join("; "));
    expect(decodedSetup.value.cards[0].cost).toBe(1);
    expect(setupCost.reads()).toBe(1);

    const state = createCombatState(fixtureSetup());
    const stateCost = changingDescriptor(state.cards[0], "cost", [1, 2, 3]);
    state.cards[0] = stateCost.value;
    const decodedState = decodeCombatState(state);
    expect(decodedState.valid).toBe(true);
    if (!decodedState.valid) throw new Error(decodedState.errors.join("; "));
    expect(decodedState.value.cards[0].cost).toBe(1);
    expect(stateCost.reads()).toBe(1);
  });

  it("uses one decoded setup snapshot for replay setup and initial state", () => {
    const seed = changingDescriptor(fixtureSetup(), "seed", [100, 101, 102]);
    const replay = runCombatReplay(seed.value, []);
    expect(seed.reads()).toBe(1);
    expect(replay.initialSetup.seed).toBe(100);
    expect(replay.initialState.randomState).toBe(100);
    expect(createCombatState(replay.initialSetup)).toEqual(replay.initialState);
  });

  it("uses the first command target and replay array descriptors exactly once", () => {
    const action = reduceCombat(createCombatState(fixtureSetup()), { type: "START_TURN" }).state;
    const enemyTarget = { kind: "ENEMY" as const, enemyId };
    const command = changingDescriptor(
      { type: "PLAY_CARD" as const, instanceId: "instance_a1", target: enemyTarget },
      "target",
      [enemyTarget, { kind: "PLAYER" }, null],
    );
    const result = reduceCombat(action, command.value);
    expect(command.reads()).toBe(1);
    expect(result.state?.enemy.hp).toBe(29);
    expect(result.events.some((event) => event.type === "CARD_PLAYED")).toBe(true);

    const firstCommand = { type: "START_TURN" as const };
    const commands = changingDescriptor(
      [firstCommand],
      "0",
      [firstCommand, { type: "END_TURN" }, { type: "PLAY_CARD" }],
    );
    const replay = runCombatReplay(fixtureSetup(), commands.value);
    expect(commands.reads()).toBe(1);
    expect(replay.commands).toEqual([firstCommand]);
    expect(replay.steps[0].state.phase).toBe("PLAYER_ACTION");
  });

  it("returns a decoded state immune to later source mutation", () => {
    const source = createCombatState(fixtureSetup());
    const decoded = decodeCombatState(source);
    expect(decoded.valid).toBe(true);
    if (!decoded.valid) throw new Error(decoded.errors.join("; "));
    source.player.hp = 1;
    source.cards[0].cost = 2;
    source.zones.deck.reverse();
    expect(decoded.value.player.hp).toBe(30);
    expect(decoded.value.cards[0].cost).toBe(1);
    expect(decoded.value.zones.deck[0]).toBe("instance_a1");
  });

  it("turns reflection failures into invalid boundary results", () => {
    const setup = new Proxy(fixtureSetup(), {
      getOwnPropertyDescriptor(target, key) {
        if (key === "seed") throw new Error("descriptor failure");
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(decodeCombatSetup(setup).valid).toBe(false);
    expect(() => createCombatState(setup)).toThrow(CombatValidationError);
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

    for (const phase of ["START_TURN", "END_TURN"] as const) {
      const transient = createCombatState(fixtureSetup());
      transient.phase = phase;
      expect(validateCombatState(transient).errors).toContain(
        "ongoing combat must use an externally resumable phase",
      );
      expect(reduceCombat(transient, { type: "START_TURN" }).events[0]).toMatchObject({
        command: "UNKNOWN",
        reason: "INVALID_STATE",
      });
    }
  });

  it("throws for every malicious clone discriminant", () => {
    const operation = {
      kind: "DAMAGE",
      target: { kind: "PLAYER" },
      amount: { kind: "FIXED", amount: 1 },
    };
    expect(() => cloneOperation({ ...operation, kind: "BOGUS" } as never)).toThrow(
      "Invalid combat operation",
    );
    expect(() => cloneOperation({ ...operation, target: { kind: "BOGUS" } } as never)).toThrow(
      "Invalid combat target",
    );
    expect(() => cloneOperation({ ...operation, amount: { kind: "BOGUS" } } as never)).toThrow(
      "Invalid combat amount",
    );

    const setup = fixtureSetup();
    setup.programs[0].targetRule = { kind: "BOGUS" } as never;
    expect(() => cloneCombatSetup(setup)).toThrow("Invalid combat target rule");
  });
});
