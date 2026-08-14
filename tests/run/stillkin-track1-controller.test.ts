import { describe, expect, it } from "vitest";

import materialsSource from "../../src/data/source/materials.json";
import lawsSource from "../../src/data/source/laws.json";
import resultClassesSource from "../../src/data/source/resultClasses.json";
import {
  createStillkinTrack1Controller,
  type StillkinTrack1Controller,
  type StillkinTrack1Snapshot,
} from "../../src/application";
import {
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  type ForgeMaterial,
  type ForgeResolverContextV1,
  type ForgeResultClass,
} from "../../src/domain";
import { FICTOR_SAVE_KEY, FICTOR_SAVE_V2_KEY, type StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  failSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function context(): ForgeResolverContextV1 {
  return {
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    materials: materialsSource.map((item) => ({
      id: item.id, attribute: item.attribute, modifier_form: item.modifier_form, noun_form: item.noun_form,
      representation: item.representation, category: item.category, balance_status: item.balance_status,
      potency: item.potency, cost_base: item.cost_base, ...(item.category === "TOOL" ? { tool_domain: item.tool_domain } : {}),
    })) as ForgeMaterial[],
    inputs: {
      laws: lawsSource.map((item) => ({
        pair: item.pair, result_class: item.result_class, actor: item.actor, combat_effect: item.combat_effect,
        balance_status: item.balance_status, power_coefficient: item.power_coefficient,
        ...("drawback" in item ? { drawback: item.drawback } : {}),
      })) as unknown as ForgeResolverContextV1["inputs"]["laws"],
      resultClasses: resultClassesSource.map((item) => ({
        id: item.id, family: item.family, density: item.density, density_status: item.density_status,
        combat_effect: item.combat_effect,
        ...("equipment_interactions" in item ? { equipment_interactions: item.equipment_interactions } : {}),
      })) as ForgeResultClass[],
    },
  };
}

function controller(storage = new MemoryStorage()) {
  return { storage, value: createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "track1-generation" }) };
}

function base(snapshot: StillkinTrack1Snapshot) {
  return { expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId };
}

function enter(value: StillkinTrack1Controller): StillkinTrack1Snapshot {
  const before = value.snapshot();
  const result = value.dispatch({ type: "ENTER_NEXT_NODE", ...base(before) });
  expect(result.applied).toBe(true);
  return result.snapshot;
}

function winCombat(value: StillkinTrack1Controller): StillkinTrack1Snapshot {
  let snapshot = value.snapshot();
  while (snapshot.flow.phase === "IN_COMBAT") {
    const binding = snapshot.flow.combatBinding!;
    const active = snapshot.runtime.run.activeCombat!;
    const combatCommand = active.state.phase === "TURN_READY"
      ? { type: "START_TURN" as const }
      : active.state.player.energy > 0 && active.state.zones.hand.length > 0
        ? { type: "PLAY_CARD" as const, instanceId: active.state.zones.hand[0], target: { kind: "ENEMY" as const, enemyId: binding.encounterId } }
        : { type: "END_TURN" as const };
    const result = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: combatCommand });
    expect(result.applied).toBe(true);
    snapshot = result.snapshot;
  }
  return snapshot;
}

function resolveSimpleEvent(value: StillkinTrack1Controller, choiceId: string) {
  let snapshot = enter(value);
  const invalid = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "not-bound" });
  expect(invalid).toMatchObject({ applied: false, reason: "CHOICE_NOT_BOUND" });
  expect(invalid.snapshot).toEqual(snapshot);
  const result = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId });
  expect(result.applied).toBe(true);
  snapshot = result.snapshot;
  if (snapshot.flow.phase === "EVENT_RESOLVED") {
    const left = value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) });
    expect(left.applied).toBe(true);
    snapshot = left.snapshot;
  }
  return snapshot;
}

describe("Stillkin literal Track-1 controller", () => {
  it("owns combat authority, completes the literal route, and preserves paid/free forge economics", () => {
    const { storage, value } = controller();
    let snapshot = value.load().snapshot;
    expect(snapshot.runtime.run).toMatchObject({ fuel: 4, nextInstanceSequence: 30 });
    expect(snapshot.runtime.run.deck).toHaveLength(30);

    snapshot = enter(value);
    const staleBinding = { ...snapshot.flow.combatBinding!, encounterNonce: snapshot.flow.combatBinding!.encounterNonce + 1 };
    expect(value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...staleBinding, command: { type: "START_TURN" } })).toMatchObject({ applied: false, reason: "STALE_ENCOUNTER_BINDING" });
    snapshot = winCombat(value);
    expect(snapshot.runtime.run.activeCombat).toBeNull();
    expect(snapshot.rewardChoices).toEqual([
      { choiceId: "normal-ore", kind: "MATERIAL", materialId: "ore_still" },
      { choiceId: "normal-still-01", kind: "MATERIAL", materialId: "still_01" },
      { choiceId: "normal-still-02", kind: "MATERIAL", materialId: "still_02" },
    ]);
    snapshot = value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "normal-ore" }).snapshot;

    snapshot = enter(value);
    const cacheExhaustionStorage = new MemoryStorage();
    const cacheEnvelope = JSON.parse(storage.values.get(FICTOR_SAVE_V2_KEY)!);
    cacheEnvelope.runtime.run.nextInstanceSequence = Number.MAX_SAFE_INTEGER - 1;
    cacheExhaustionStorage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(cacheEnvelope));
    const cacheExhaustion = createStillkinTrack1Controller({ storage: cacheExhaustionStorage, resolverContext: context(), generationFactory: () => "unused" });
    const beforeCacheFailure = cacheExhaustion.load().snapshot;
    const failedCache = cacheExhaustion.dispatch({ type: "RESOLVE_EVENT", ...base(beforeCacheFailure), choiceId: "take-cache" });
    expect(failedCache).toMatchObject({ applied: false, reason: "CACHE_GRANT_FAILED" });
    expect(failedCache.snapshot).toEqual(beforeCacheFailure);
    snapshot = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "take-cache" }).snapshot;
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }).snapshot;
    snapshot = enter(value);
    snapshot = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "use-workshop" }).snapshot;
    const fuelBeforeFree = snapshot.runtime.run.fuel;
    const duplicateDefinitions = snapshot.runtime.run.ownedInstances.filter((item) => item.cardId === "ore_still").slice(0, 2);
    const beforeFailedFree = snapshot;
    const failedFree = value.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: [duplicateDefinitions[0].instanceId, duplicateDefinitions[1].instanceId] });
    expect(failedFree).toMatchObject({ applied: false, reason: "RUNTIME_REJECTED" });
    expect(failedFree.snapshot).toEqual(beforeFailedFree);
    expect(failedFree.snapshot.flow.workshopEntitlementNodeId).toBe("d1-workshop");
    expect(failedFree.snapshot.runtime.run.fuel).toBe(fuelBeforeFree);
    const ore = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "ore_still")!;
    const one = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "still_01")!;
    const free = value.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: [ore.instanceId, one.instanceId] });
    expect(free.applied).toBe(true);
    expect(free.snapshot.runtime.run.fuel).toBe(fuelBeforeFree);
    expect(free.events.some((event) => event.type === "FREE_WORKSHOP_USED")).toBe(true);
    expect(free.events.some((event) => event.type === "FUEL_SPENT")).toBe(false);
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(free.snapshot) }).snapshot;

    const two = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "still_02")!;
    const three = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "still_03")!;
    const paid = value.dispatch({ type: "FORGE_WORKSHOP", ...base(snapshot), materialInstanceIds: [two.instanceId, three.instanceId] });
    expect(paid.applied).toBe(true);
    expect(paid.snapshot.runtime.run.fuel).toBe(fuelBeforeFree - 1);
    expect(paid.events.filter((event) => event.type === "FUEL_SPENT")).toHaveLength(1);

    snapshot = winCombatAfterEnter(value);
    snapshot = value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "elite-tool-01" }).snapshot;
    snapshot = resolveSimpleEvent(value, "risk-collapse");
    snapshot = enter(value);
    const beforeInvalidFictor = snapshot;
    expect(value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "not-bound" })).toMatchObject({ applied: false, reason: "CHOICE_NOT_BOUND", snapshot: beforeInvalidFictor });

    const assertFictorForkRejected = (mutate: (envelope: any) => void, choiceId: string, reason: string) => {
      const forkStorage = new MemoryStorage();
      const envelope = JSON.parse(storage.values.get(FICTOR_SAVE_V2_KEY)!);
      mutate(envelope);
      forkStorage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(envelope));
      const fork = createStillkinTrack1Controller({ storage: forkStorage, resolverContext: context(), generationFactory: () => "unused" });
      const before = fork.load().snapshot;
      const rejected = fork.dispatch({ type: "RESOLVE_EVENT", ...base(before), choiceId });
      expect(rejected).toMatchObject({ applied: false, reason });
      expect(rejected.snapshot).toEqual(before);
    };
    assertFictorForkRejected((envelope) => { envelope.runtime.run.fuel = 0; }, "fictor-still-04", "INSUFFICIENT_FUEL");
    assertFictorForkRejected((envelope) => {
      const sequence = envelope.runtime.run.nextInstanceSequence;
      envelope.runtime.run.ownedInstances.push({ instanceId: `forge-instance-v1-${sequence}`, cardId: "tool_02" });
      envelope.runtime.run.deck.push(`forge-instance-v1-${sequence}`);
      envelope.runtime.run.nextInstanceSequence += 1;
    }, "fictor-tool-02", "UNIQUE_TOOL_ALREADY_OWNED");
    assertFictorForkRejected((envelope) => { envelope.profile.discoveredRecipeIds.push("ore_burn|ore_still"); envelope.profile.discoveredRecipeIds.sort(); }, "fictor-recipe", "CHOICE_ALREADY_OWNED");
    const fictor = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "fictor-tool-02" });
    expect(fictor.applied).toBe(true);
    expect(fictor.snapshot.runtime.run.fuel).toBe(fuelBeforeFree - 2);
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(fictor.snapshot) }).snapshot;
    snapshot = resolveSimpleEvent(value, "read-record");
    snapshot = resolveSimpleEvent(value, "take-oddity");
    snapshot = winCombatAfterEnter(value);
    expect(snapshot.flow.phase).toBe("RUN_WON");
    expect(snapshot.profile.ownedHeartIds).toEqual(["heart__still"]);
    expect(snapshot.profile.featureFlags.heartForge).toBe(false);

    const oldRunId = snapshot.flow.runId;
    const restarted = value.dispatch({ type: "RESTART", ...base(snapshot) });
    expect(restarted.applied).toBe(true);
    expect(restarted.snapshot.flow.runId).not.toBe(oldRunId);
    expect(restarted.snapshot.runtime.run).toMatchObject({ fuel: 4, nextInstanceSequence: 30, activeCombat: null });
    expect(restarted.snapshot.profile.ownedHeartIds).toEqual(["heart__still"]);
  });

  it("reloads v2 mid-combat, rejects stale writers, rolls back quota failure, and leaves v1 bytes untouched", () => {
    const { storage, value } = controller();
    let snapshot = enter(value);
    const originalV1 = JSON.stringify({ schemaVersion: 999, opaque: "keep" });
    storage.values.set(FICTOR_SAVE_KEY, originalV1);
    const reloaded = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "unused" });
    expect(reloaded.load().snapshot).toMatchObject({ flow: { phase: "IN_COMBAT", combatBinding: snapshot.flow.combatBinding } });
    expect(storage.values.get(FICTOR_SAVE_KEY)).toBe(originalV1);

    const stale = snapshot;
    snapshot = reloaded.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding!, command: { type: "START_TURN" } }).snapshot;
    expect(value.dispatch({ type: "APPLY_COMBAT", expectedRevision: stale.flow.revision, ...stale.flow.combatBinding!, command: { type: "START_TURN" } })).toMatchObject({ applied: false, persistence: { reason: "STALE_WRITE" } });

    storage.failSet = true;
    const before = reloaded.snapshot();
    const failed = reloaded.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding!, command: { type: "PLAY_CARD", instanceId: snapshot.runtime.run.activeCombat!.state.zones.hand[0], target: { kind: "ENEMY", enemyId: snapshot.flow.combatBinding!.encounterId } } });
    expect(failed).toMatchObject({ applied: false, persistence: { reason: "WRITE_FAILED" } });
    expect(reloaded.snapshot()).toEqual(before);
    expect(storage.values.has(FICTOR_SAVE_V2_KEY)).toBe(true);
  });

  it("migrates only a valid v1 profile, blocks corrupt v2, detaches snapshots, and rejects hostile commands", () => {
    const storage = new MemoryStorage();
    const profile = {
      schemaVersion: 1,
      discoveredRecipeIds: ["ore_burn|ore_still"],
      ownedHeartIds: ["heart__still"],
      featureFlags: { heartForge: false },
    };
    const v1 = JSON.stringify({ schemaVersion: 1, saveGeneration: "legacy", saveRevision: 8, profile, run: { ignored: true } });
    storage.values.set(FICTOR_SAVE_KEY, v1);
    const migrated = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "migrated" });
    const loaded = migrated.load();
    expect(loaded.source).toBe("MIGRATED_V1");
    expect(loaded.snapshot.profile).toEqual(profile);
    expect(loaded.snapshot.runtime.run).toMatchObject({ fuel: 4, nextInstanceSequence: 30 });
    expect(storage.values.get(FICTOR_SAVE_KEY)).toBe(v1);

    const detached = migrated.snapshot();
    detached.runtime.run.fuel = 999;
    expect(migrated.snapshot().runtime.run.fuel).toBe(4);
    expect(migrated.dispatch({ get type() { throw new Error("must not run"); } })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    expect(migrated.dispatch(new Proxy({}, { ownKeys() { throw new Error("trap"); } }))).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    const cycle: Record<string, unknown> = { type: "ENTER_NEXT_NODE" };
    cycle.self = cycle;
    expect(migrated.dispatch(cycle)).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    expect(migrated.dispatch({ type: "RESOLVE_COMBAT", expectedRevision: 0, runId: loaded.snapshot.flow.runId, result: "VICTORY" })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    expect(migrated.dispatch({ type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: loaded.snapshot.flow.runId, scenario: {} })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    const sparse: unknown[] = [];
    sparse.length = 2;
    expect(migrated.dispatch({ type: "FORGE_WORKSHOP", expectedRevision: 0, runId: loaded.snapshot.flow.runId, materialInstanceIds: sparse })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });

    const corruptStorage = new MemoryStorage();
    corruptStorage.values.set(FICTOR_SAVE_V2_KEY, "{bad");
    const corrupt = createStillkinTrack1Controller({ storage: corruptStorage, resolverContext: context(), generationFactory: () => "blocked" });
    const safe = corrupt.load().snapshot;
    expect(safe.persistence.writeBlocked).toBe(true);
    expect(corrupt.dispatch({ type: "ENTER_NEXT_NODE", ...base(safe) })).toMatchObject({ applied: false, persistence: { reason: "WRITE_BLOCKED" } });
    expect(corruptStorage.values.get(FICTOR_SAVE_V2_KEY)).toBe("{bad");

    let getterCalls = 0;
    const accessorOptions = {
      get storage() { getterCalls += 1; return storage; },
      resolverContext: context(),
    };
    expect(() => createStillkinTrack1Controller(accessorOptions)).toThrow("invalid Stillkin Track-1 controller options");
    expect(getterCalls).toBe(0);
    expect(() => createStillkinTrack1Controller(new Proxy({}, { ownKeys() { throw new Error("secret trap detail"); } }))).toThrow("invalid Stillkin Track-1 controller options");
  });

  it("fails closed when persisted phase, active combat, node, or nonce authority diverges", () => {
    const original = controller();
    enter(original.value);
    const bytes = original.storage.values.get(FICTOR_SAVE_V2_KEY)!;
    const mutations: Array<(envelope: any) => void> = [
      (envelope) => { envelope.runtime.run.activeCombat = null; },
      (envelope) => { envelope.flow.combatBinding.encounterNonce += 1; },
      (envelope) => { envelope.flow.combatBinding.nodeId = "d2-elite"; },
      (envelope) => { envelope.flow.phase = "BETWEEN_NODES"; },
    ];
    for (const mutate of mutations) {
      const storage = new MemoryStorage();
      const envelope = JSON.parse(bytes);
      mutate(envelope);
      storage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(envelope));
      const value = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "blocked" });
      const loaded = value.load();
      expect(loaded).toMatchObject({ source: "SAFE_INITIALIZED", snapshot: { persistence: { writeBlocked: true } } });
      expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe(JSON.stringify(envelope));
    }
  });

  it("settles defeat atomically, rejects a repeated terminal binding, and restarts from owned state", () => {
    const { value } = controller();
    let snapshot = enter(value);
    const binding = snapshot.flow.combatBinding!;
    while (snapshot.flow.phase === "IN_COMBAT") {
      const active = snapshot.runtime.run.activeCombat!;
      const command = active.state.phase === "TURN_READY" ? { type: "START_TURN" as const } : { type: "END_TURN" as const };
      const result = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command });
      expect(result.applied).toBe(true);
      snapshot = result.snapshot;
    }
    expect(snapshot).toMatchObject({ flow: { phase: "RUN_LOST", playerHp: 0, combatBinding: null }, runtime: { run: { activeCombat: null } } });
    expect(value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "START_TURN" } })).toMatchObject({ applied: false, reason: "STALE_ENCOUNTER_BINDING" });
    const restarted = value.dispatch({ type: "RESTART", ...base(snapshot) });
    expect(restarted).toMatchObject({ applied: true, snapshot: { flow: { phase: "BETWEEN_NODES", playerHp: 30, nextEncounterNonce: 1 }, runtime: { run: { fuel: 4, activeCombat: null } } } });
  });
});

function winCombatAfterEnter(value: StillkinTrack1Controller): StillkinTrack1Snapshot {
  enter(value);
  return winCombat(value);
}
