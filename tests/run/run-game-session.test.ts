import { describe, expect, it } from "vitest";

import { executeRunGameCommand, type RunGameSessionV1 } from "../../src/application/run/game-run-session";
import { createDormantRunFlowState } from "../../src/application/run/reducer";
import type { RunScenarioV1 } from "../../src/application/run/types";
import { loadGameSession } from "../../src/application/game-session";
import {
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  createCombatState,
  type ForgeRuntimeStateV1,
  type CombatState,
} from "../../src/domain";
import { VersionedSaveStore, type PersistenceCatalog, type StorageLike } from "../../src/persistence";
import { fixtureSetup } from "../domain/fixtures";

class MemoryStorage implements StorageLike {
  value: string | null = null;
  failSet = false;
  getItem(): string | null { return this.value; }
  setItem(_key: string, value: string): void {
    if (this.failSet) throw new Error("quota");
    this.value = value;
  }
  removeItem(): void { this.value = null; }
}

function starter(fuel = 4): ForgeRuntimeStateV1 {
  return {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    revision: 0,
    profile: { discoveredRecipeIds: [] },
    run: { fuel, nextInstanceSequence: 0, ownedInstances: [], deck: [], activeCombat: null },
  };
}

function storeFor(storage: MemoryStorage): VersionedSaveStore {
  const catalog: PersistenceCatalog = { sourceHash: FORGE_RUNTIME_SOURCE_HASH, allowedEnemyIds: ["enemy_fixture"], allowedIntentIds: ["intent_attack", "intent_attack_2"], allowedDisplayTexts: ["내리치기"] };
  let sequence = 0;
  return new VersionedSaveStore(storage, catalog, () => `run-generation-${sequence += 1}`);
}

function terminalCombatState(result: "VICTORY" | "DEFEAT"): CombatState {
  const state = createCombatState(fixtureSetup());
  return result === "VICTORY"
    ? { ...state, phase: "TERMINAL", status: "VICTORY", enemy: { ...state.enemy, hp: 0 } }
    : { ...state, phase: "TERMINAL", status: "DEFEAT", player: { ...state.player, hp: 0 } };
}

function terminalContext(result: "VICTORY" | "DEFEAT") {
  return { terminalCombatState: terminalCombatState(result) };
}

function scenario(): RunScenarioV1 {
  return {
    schemaVersion: "run-scenario-v1",
    scenarioId: "application-fixture",
    status: "APPROVED",
    raceId: "Stillkin",
    groundId: "GROUND_STILL",
    pendingReasons: [],
    nodes: [
      {
        nodeId: "normal", kind: "ENCOUNTER", depth: 1, encounterKind: "NORMAL", encounterId: "enemy__still__swarm",
        rewardOffer: { offerId: "normal", source: "NORMAL", choices: [
          { choiceId: "ore", kind: "MATERIAL", materialId: "ore_still" },
          { choiceId: "one", kind: "MATERIAL", materialId: "still_01" },
          { choiceId: "two", kind: "MATERIAL", materialId: "still_02" },
        ] },
      },
      { nodeId: "workshop", kind: "EVENT", depth: 2, eventType: "WORKSHOP", choices: [{ choiceId: "use", effect: { kind: "WORKSHOP_ENTITLEMENT" }, economy: { status: "NOT_REQUIRED" } }] },
      { nodeId: "boss", kind: "ENCOUNTER", depth: 3, encounterKind: "BOSS", encounterId: "the_stilling", rewardOffer: null },
    ],
  };
}

function recordScenario(): RunScenarioV1 {
  const value = scenario();
  return {
    ...value,
    scenarioId: "record-application-fixture",
    nodes: [
      value.nodes[0],
      {
        nodeId: "record",
        kind: "EVENT",
        depth: 2,
        eventType: "RECORD",
        choices: [{
          choiceId: "read",
          effect: {
            kind: "REWARD",
            offer: { offerId: "record-offer", source: "RECORD", choices: [{ choiceId: "recipe", kind: "RECIPE", recipeId: "ore_burn|ore_still" }] },
            rewardChoiceIds: ["recipe"],
          },
          economy: { status: "NOT_REQUIRED" },
        }],
      },
      value.nodes[2],
    ],
  };
}

function begin(store: VersionedSaveStore): RunGameSessionV1 {
  const value: RunGameSessionV1 = { game: loadGameSession(store, starter()), flow: createDormantRunFlowState() };
  const started = executeRunGameCommand(store, value, { type: "START", scenario: scenario(), ownedUniqueToolIds: [] });
  return executeRunGameCommand(store, started.value, { type: "ENTER_NEXT_NODE" }).value;
}

function reachReward(store: VersionedSaveStore, value: RunGameSessionV1): RunGameSessionV1 {
  return executeRunGameCommand(store, value, { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true }, terminalContext("VICTORY")).value;
}

describe("run/game session atomic composition", () => {
  it("persists material and boss heart, while workshop leaves fuel unchanged", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    let value = reachReward(store, begin(store));
    const material = executeRunGameCommand(store, value, { type: "CHOOSE_REWARD", choiceId: "ore" });
    expect(material).toMatchObject({ applied: true, persistence: { ok: true } });
    value = material.value;
    expect(value.game.runtimeState.run.ownedInstances).toEqual([{ instanceId: "forge-instance-v1-0", cardId: "ore_still" }]);
    expect(value.game.runtimeState.run.deck).toEqual(["forge-instance-v1-0"]);
    const fuel = value.game.runtimeState.run.fuel;
    value = executeRunGameCommand(store, value, { type: "ENTER_NEXT_NODE" }).value;
    value = executeRunGameCommand(store, value, { type: "RESOLVE_EVENT", choiceId: "use" }).value;
    expect(value.game.runtimeState.run.fuel).toBe(fuel);
    expect(value.flow.workshopEntitlements).toBe(1);
    value = executeRunGameCommand(store, value, { type: "SETTLE_FREE_WORKSHOP", outcome: "SUCCEEDED" }).value;
    value = executeRunGameCommand(store, value, { type: "LEAVE_EVENT" }).value;
    value = executeRunGameCommand(store, value, { type: "ENTER_NEXT_NODE" }).value;
    const boss = executeRunGameCommand(store, value, { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true }, terminalContext("VICTORY"));
    expect(boss).toMatchObject({ applied: true, persistence: { ok: true } });
    expect(boss.value.game.profile.ownedHeartIds).toEqual(["heart__still"]);
    expect(boss.value.game.profile.featureFlags.heartForge).toBe(false);
    expect(loadGameSession(store, starter()).profile.ownedHeartIds).toEqual(["heart__still"]);
  });

  it("rolls both flow and session back on quota and stale failures", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const stale = reachReward(store, begin(store));
    const current = reachReward(store, begin(store));
    const saved = executeRunGameCommand(store, current, { type: "CHOOSE_REWARD", choiceId: "ore" });
    expect(saved.applied).toBe(true);
    const staleResult = executeRunGameCommand(store, stale, { type: "CHOOSE_REWARD", choiceId: "ore" });
    expect(staleResult).toMatchObject({ applied: false, persistence: { ok: false, reason: "STALE_WRITE" } });
    expect(staleResult.value).toEqual(stale);

    const freshStorage = new MemoryStorage();
    const freshStore = storeFor(freshStorage);
    const before = reachReward(freshStore, begin(freshStore));
    freshStorage.failSet = true;
    const failed = executeRunGameCommand(freshStore, before, { type: "CHOOSE_REWARD", choiceId: "ore" });
    expect(failed).toMatchObject({ applied: false, persistence: { ok: false, reason: "WRITE_FAILED" } });
    expect(failed.value).toEqual(before);
    expect(freshStorage.value).toBeNull();
  });

  it("restart preserves profile knowledge and hearts without store reset", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    let value = begin(store);
    value = executeRunGameCommand(store, value, { type: "RESOLVE_COMBAT", result: "DEFEAT", cleanupCompleted: true }, terminalContext("DEFEAT")).value;
    const profile = store.decodeProfile({ ...value.game.profile, discoveredRecipeIds: ["ore_burn|ore_still"], ownedHeartIds: ["heart__still"] })!;
    const runtimeState = store.decodeRuntime({ ...value.game.runtimeState, profile: { discoveredRecipeIds: profile.discoveredRecipeIds } })!;
    value = { ...value, game: { ...value.game, profile, runtimeState } };
    const restarted = executeRunGameCommand(
      store,
      value,
      { type: "RESTART", scenario: scenario(), ownedUniqueToolIds: [] },
      { restartStarterTemplate: starter(9) },
    );
    expect(restarted.applied).toBe(true);
    expect(restarted.value.game.runtimeState.run.fuel).toBe(9);
    expect(restarted.value.game.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
    expect(restarted.value.game.profile.ownedHeartIds).toEqual(["heart__still"]);
  });

  it("persists a RECORD recipe to both profile authorities without creating a card", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    let value: RunGameSessionV1 = { game: loadGameSession(store, starter()), flow: createDormantRunFlowState() };
    value = executeRunGameCommand(store, value, { type: "START", scenario: recordScenario(), ownedUniqueToolIds: [] }).value;
    value = executeRunGameCommand(store, value, { type: "ENTER_NEXT_NODE" }).value;
    value = executeRunGameCommand(store, value, { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true }, terminalContext("VICTORY")).value;
    value = executeRunGameCommand(store, value, { type: "CHOOSE_REWARD", choiceId: "ore" }).value;
    const instanceCount = value.game.runtimeState.run.ownedInstances.length;
    value = executeRunGameCommand(store, value, { type: "ENTER_NEXT_NODE" }).value;
    const record = executeRunGameCommand(store, value, { type: "RESOLVE_EVENT", choiceId: "read" });
    expect(record).toMatchObject({ applied: true, persistence: { ok: true } });
    expect(record.value.game.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
    expect(record.value.game.runtimeState.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
    expect(record.value.game.runtimeState.run.ownedInstances).toHaveLength(instanceCount);
    expect(loadGameSession(store, starter()).profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
  });

  it("canonicalizes hostile commands once and requires cleared combat authority", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const value = begin(store);
    const accessor = { get type() { throw new Error("must not execute"); } };
    expect(executeRunGameCommand(store, value, accessor)).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    const proxy = new Proxy({}, { ownKeys() { throw new Error("must not escape"); } });
    expect(executeRunGameCommand(store, value, proxy)).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });

    const baseSetup = fixtureSetup();
    const materialIds = ["ore_still", "ore_burn", "ore_scatter", "ore_rot"];
    const cards = baseSetup.cards.map((card, index) => ({ ...card, cardId: materialIds[index] }));
    const instances = baseSetup.instances.map((instance, index) => ({ ...instance, cardId: materialIds[index] }));
    const setup = fixtureSetup({ cards, instances, deck: instances.map(({ instanceId }) => instanceId) });
    const activeRuntime = store.decodeRuntime({
      ...value.game.runtimeState,
      run: {
        ...value.game.runtimeState.run,
        ownedInstances: setup.instances,
        deck: setup.deck,
        activeCombat: {
          state: createCombatState(setup),
          enrolledPersistentInstanceIds: setup.deck,
          forgeActionTurn: 0,
          forgeActionsRemaining: 0,
          isolatedMaterials: [],
          ephemeralResults: [],
        },
      },
    })!;
    const activeCombatGame = {
      ...value.game,
      runtimeState: activeRuntime,
    };
    expect(executeRunGameCommand(
      store,
      { ...value, game: activeCombatGame },
      { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true },
      terminalContext("VICTORY"),
    )).toMatchObject({ applied: false, reason: "COMBAT_RESULT_REQUIRED" });

    expect(executeRunGameCommand(store, value, { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true })).toMatchObject({ applied: false, reason: "COMBAT_RESULT_REQUIRED" });
    expect(executeRunGameCommand(
      store,
      value,
      { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true },
      { terminalCombatState: createCombatState(fixtureSetup()) },
    )).toMatchObject({ applied: false, reason: "COMBAT_RESULT_REQUIRED" });
    expect(executeRunGameCommand(
      store,
      value,
      { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true },
      terminalContext("DEFEAT"),
    )).toMatchObject({ applied: false, reason: "COMBAT_RESULT_MISMATCH" });
  });
});
