import { describe, expect, it } from "vitest";

import {
  canonicalSerialize,
  createCombatState,
  fnv1a32,
  reduceCombat,
  runCombatReplay,
  shuffleInstanceIds,
  type CombatCommand,
} from "../../src/domain";
import { enemyId, fixtureSetup, jsonClone } from "./fixtures";

describe("deterministic draw and shuffle", () => {
  it("treats index zero as deck top and preserves initial order", () => {
    const setup = fixtureSetup();
    setup.rules.drawCount = 2;
    const result = reduceCombat(createCombatState(setup), { type: "START_TURN" });
    expect(result.state.zones.hand).toEqual(["instance_a1", "instance_a2"]);
    expect(result.state.zones.deck).toEqual(["instance_b", "instance_guard"]);
  });

  it("draws the remaining deck before shuffling the whole discard at the empty boundary", () => {
    const state = createCombatState(fixtureSetup());
    state.zones = {
      deck: ["instance_a1"],
      hand: ["instance_guard"],
      discard: ["instance_a2", "instance_b"],
      exile: [],
    };
    state.rules.drawCount = 3;
    const result = reduceCombat(state, { type: "START_TURN" });
    expect(result.state.zones.hand[1]).toBe("instance_a1");
    expect(result.events.map(({ type }) => type).filter((type) => type.includes("DRAWN") || type.includes("SHUFFLED"))).toEqual([
      "CARD_DRAWN",
      "DISCARD_SHUFFLED",
      "CARD_DRAWN",
      "CARD_DRAWN",
    ]);
    expect(result.state.zones.discard).toEqual([]);
    expect(result.state.zones.deck).toEqual([]);
  });

  it("stops cleanly on overdraw and on fully empty zones", () => {
    const state = createCombatState(fixtureSetup());
    state.zones = { deck: [], hand: [], discard: ["instance_a1"], exile: ["instance_a2", "instance_b", "instance_guard"] };
    state.rules.drawCount = 10;
    const result = reduceCombat(state, { type: "START_TURN" });
    expect(result.state.zones.hand).toEqual(["instance_a1"]);
    expect(result.events.map(({ type }) => type).filter((type) => type.includes("DRAWN") || type.includes("SHUFFLED"))).toEqual(["DISCARD_SHUFFLED", "CARD_DRAWN"]);

    const empty = createCombatState(fixtureSetup());
    empty.zones = { deck: [], hand: [], discard: [], exile: ["instance_a1", "instance_a2", "instance_b", "instance_guard"] };
    empty.rules.drawCount = 2;
    const emptyResult = reduceCombat(empty, { type: "START_TURN" });
    expect(emptyResult.events.some(({ type }) => type === "CARD_DRAWN" || type === "DISCARD_SHUFFLED")).toBe(false);
  });

  it("is deterministic per seed and produces multiple orders across seeds", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `instance_${index}`);
    for (let seed = 0; seed < 30; seed += 1) {
      expect(shuffleInstanceIds(ids, seed)).toEqual(shuffleInstanceIds(ids, seed));
    }
    const orders = new Set(
      Array.from({ length: 30 }, (_, seed) => shuffleInstanceIds(ids, seed).instanceIds.join("|")),
    );
    expect(orders.size).toBeGreaterThan(20);
  });
});

describe("combat replay", () => {
  const commands: CombatCommand[] = [
    { type: "START_TURN" },
    { type: "PLAY_CARD", instanceId: "instance_a1", target: { kind: "ENEMY", enemyId } },
    { type: "END_TURN" },
  ];

  it("replays identical seed/setup/commands to deep-equal steps and hash", () => {
    const first = runCombatReplay(fixtureSetup(), commands);
    const second = runCombatReplay(fixtureSetup(), commands);
    expect(second).toEqual(first);
    expect(first.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(first).toMatchObject({
      schemaVersion: "combat-replay-v1",
      engineVersion: "combat-engine-v1",
      prngVersion: "fictor-lcg32-fisher-yates-v1",
      hashAlgorithm: "fnv1a32-v1",
    });
  });

  it("changes the regression hash when an intermediate command changes", () => {
    const first = runCombatReplay(fixtureSetup(), commands);
    const changed = runCombatReplay(fixtureSetup(), [
      commands[0],
      { type: "PLAY_CARD", instanceId: "instance_a2", target: { kind: "ENEMY", enemyId } },
      commands[2],
    ]);
    expect(changed.hash).not.toBe(first.hash);
  });

  it("canonicalizes recursive object key order and exposes the FNV-1a32 golden", () => {
    const left = { z: 1, nested: { b: "한글", a: [true, null] } };
    const right = { nested: { a: [true, null], b: "한글" }, z: 1 };
    expect(canonicalSerialize(left)).toBe(canonicalSerialize(right));
    expect(fnv1a32("hello")).toBe("4f9f2cab");
  });
});

describe("mutation isolation", () => {
  it("does not alias caller setup into state", () => {
    const setup = fixtureSetup();
    const state = createCombatState(setup);
    setup.player.hp = 1;
    setup.deck.reverse();
    setup.enemy.intents[0].labelKo = "바뀜";
    setup.programs[0].operations.length = 0;
    expect(state.player.hp).toBe(30);
    expect(state.zones.deck[0]).toBe("instance_a1");
    expect(state.enemy.intents[0].labelKo).toBe("내리치기");
    expect(state.programs[0].operations).toHaveLength(1);
  });

  it("does not alias reducer state or events into input", () => {
    const input = createCombatState(fixtureSetup());
    const snapshot = jsonClone(input);
    const result = reduceCombat(input, { type: "START_TURN" });
    result.state.rules.blockRetention.numerator = 99;
    const drawn = result.events.find((event) => event.type === "CARD_DRAWN");
    if (drawn?.type === "CARD_DRAWN") drawn.instanceId = "mutated";
    expect(input).toEqual(snapshot);
  });

  it("does not alias replay inputs or repeated results", () => {
    const setup = fixtureSetup();
    const inputCommands = jsonClone([
      { type: "START_TURN" as const },
      { type: "END_TURN" as const },
    ]);
    const replay = runCombatReplay(setup, inputCommands);
    replay.initialSetup.deck.reverse();
    replay.steps[0].state.zones.hand.length = 0;
    expect(setup.deck[0]).toBe("instance_a1");
    expect(inputCommands).toEqual([{ type: "START_TURN" }, { type: "END_TURN" }]);
    expect(runCombatReplay(setup, inputCommands).steps[0].state.zones.hand).toHaveLength(4);
  });
});
