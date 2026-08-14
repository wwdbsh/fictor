import { describe, expect, it } from "vitest";

import {
  executeForgeRuntimeCommand,
  loadGameSession,
  ownsHeart,
  recordOwnedHeart,
  startNewRun,
} from "../../src/application";
import materialsSource from "../../src/data/source/materials.json";
import lawsSource from "../../src/data/source/laws.json";
import resultClassesSource from "../../src/data/source/resultClasses.json";
import {
  createCombatState,
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  reduceCombat,
  type ForgeMaterial,
  type ForgeResolverContextV1,
  type ForgeResultClass,
  type ForgeRuntimeStateV1,
} from "../../src/domain";
import {
  VersionedSaveStore,
  type PersistenceCatalog,
  type StorageLike,
} from "../../src/persistence";
import { fixtureSetup } from "../domain/fixtures";

class MemoryStorage implements StorageLike {
  value: string | null = null;
  failSet = false;
  getItem(): string | null { return this.value; }
  setItem(_key: string, value: string): void {
    if (this.failSet) throw new Error("quota details must not escape");
    this.value = value;
  }
  removeItem(): void { this.value = null; }
}

const FIRST_CARD = "ore_burn";
const SECOND_CARD = "ore_still";
const RECIPE = "ore_burn|ore_still";
const RESULT_CARD = "forge__ore_burn__ore_still";

function context(): ForgeResolverContextV1 {
  const materials = materialsSource.map((item) => ({
    id: item.id,
    attribute: item.attribute,
    modifier_form: item.modifier_form,
    noun_form: item.noun_form,
    representation: item.representation,
    category: item.category,
    balance_status: item.balance_status,
    potency: item.potency,
    cost_base: item.cost_base,
    ...(item.category === "TOOL" ? { tool_domain: item.tool_domain } : {}),
  })) as ForgeMaterial[];
  const laws = lawsSource.map((item) => ({
    pair: item.pair,
    result_class: item.result_class,
    actor: item.actor,
    combat_effect: item.combat_effect,
    balance_status: item.balance_status,
    power_coefficient: item.power_coefficient,
    ...("drawback" in item ? { drawback: item.drawback } : {}),
  })) as unknown as ForgeResolverContextV1["inputs"]["laws"];
  const resultClasses = resultClassesSource.map((item) => ({
    id: item.id,
    family: item.family,
    density: item.density,
    density_status: item.density_status,
    combat_effect: item.combat_effect,
    ...("equipment_interactions" in item ? { equipment_interactions: item.equipment_interactions } : {}),
  })) as ForgeResultClass[];
  return {
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    materials,
    inputs: { laws, resultClasses },
  };
}

function catalog(): PersistenceCatalog {
  return {
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    allowedEnemyIds: ["enemy_fixture"],
    allowedIntentIds: ["intent_attack", "intent_attack_2"],
    allowedDisplayTexts: ["내리치기"],
  };
}

function storeFor(storage: MemoryStorage): VersionedSaveStore {
  let sequence = 0;
  return new VersionedSaveStore(storage, catalog(), () => `generation-${sequence += 1}`);
}

function workshopStarter(fuel = 4): ForgeRuntimeStateV1 {
  const ownedInstances = [
    { instanceId: "material-a", cardId: FIRST_CARD },
    { instanceId: "material-b", cardId: SECOND_CARD },
  ];
  return {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    revision: 0,
    profile: { discoveredRecipeIds: [] },
    run: { fuel, nextInstanceSequence: 0, ownedInstances, deck: ownedInstances.map(({ instanceId }) => instanceId), activeCombat: null },
  };
}

function instantStarter(): ForgeRuntimeStateV1 {
  const base = workshopStarter();
  const setup = fixtureSetup({
    rules: { ...fixtureSetup().rules, drawCount: 2 },
    cards: [
      { cardId: FIRST_CARD, effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "BURN" },
      { cardId: SECOND_CARD, effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "STILL" },
    ],
    instances: base.run.ownedInstances,
    deck: base.run.deck,
  });
  const started = reduceCombat(createCombatState(setup), { type: "START_TURN" });
  if (started.state === null) throw new Error("fixture combat must start");
  base.run.activeCombat = {
    state: started.state,
    enrolledPersistentInstanceIds: [...base.run.deck],
    forgeActionTurn: 1,
    forgeActionsRemaining: 1,
    isolatedMaterials: [],
    ephemeralResults: [],
  };
  return base;
}

describe("game session", () => {
  it("uses the real reducer for instant and reversed workshop order, reload, and new run", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    let session = loadGameSession(store, instantStarter());
    const instant = executeForgeRuntimeCommand(
      store,
      session,
      { type: "FORGE_INSTANT", materialInstanceIds: ["material-b", "material-a"] },
      context(),
    );
    expect(instant).toMatchObject({ applied: true, persistence: { ok: true, persisted: true } });
    expect(instant.runtimeResult?.events).toContainEqual(expect.objectContaining({ type: "FORGE_RESULT_CREATED", mode: "INSTANT", recipeId: RECIPE }));
    expect(instant.session.profile.discoveredRecipeIds).toEqual([RECIPE]);

    session = loadGameSession(store, instantStarter());
    expect(session.profile.discoveredRecipeIds).toEqual([RECIPE]);
    const newRun = startNewRun(store, session, workshopStarter());
    expect(newRun.session.runtimeState.run).toEqual(workshopStarter().run);
    expect(newRun.session.profile.discoveredRecipeIds).toEqual([RECIPE]);

    const workshop = executeForgeRuntimeCommand(
      store,
      newRun.session,
      { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-a", "material-b"] },
      context(),
    );
    expect(workshop).toMatchObject({ applied: true, persistence: { ok: true, persisted: true } });
    expect(workshop.runtimeResult?.events).toContainEqual(expect.objectContaining({ type: "FORGE_RESULT_CREATED", mode: "WORKSHOP", recipeId: RECIPE }));
    expect(workshop.session.profile.discoveredRecipeIds).toEqual([RECIPE]);
    expect(loadGameSession(store, workshopStarter()).profile.discoveredRecipeIds).toEqual([RECIPE]);
  });

  it("cannot inject a stale reducer result after another session starts a new run", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const staleSession = loadGameSession(store, workshopStarter());
    const currentSession = loadGameSession(store, workshopStarter());
    const reset = startNewRun(store, currentSession, workshopStarter(9));
    expect(reset.persistence).toMatchObject({ ok: true, generation: "generation-1", revision: 0 });

    const stale = executeForgeRuntimeCommand(
      store,
      staleSession,
      { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-a", "material-b"] },
      context(),
    );
    expect(stale).toMatchObject({ applied: true, persistence: { ok: false, persisted: false, reason: "STALE_WRITE" } });
    expect(stale.session.runtimeState.run.fuel).toBe(3);
    expect(loadGameSession(store, workshopStarter()).runtimeState.run.fuel).toBe(9);
  });

  it("does not persist rejected domain commands", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const session = loadGameSession(store, workshopStarter(0));
    const rejected = executeForgeRuntimeCommand(
      store,
      session,
      { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-a", "material-b"] },
      context(),
    );
    expect(rejected).toMatchObject({ applied: false, persistence: null });
    expect(rejected.runtimeResult?.events).toContainEqual(expect.objectContaining({ type: "FORGE_REJECTED", reason: "INSUFFICIENT_FUEL" }));
    expect(storage.value).toBeNull();
  });

  it("keeps successful reducer state in memory when quota persistence fails", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const session = loadGameSession(store, workshopStarter());
    storage.failSet = true;
    const result = executeForgeRuntimeCommand(
      store,
      session,
      { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-a", "material-b"] },
      context(),
    );
    expect(result).toMatchObject({ applied: true, persistence: { ok: false, persisted: false, reason: "WRITE_FAILED" } });
    expect(result.session.runtimeState.run.fuel).toBe(3);
    expect(result.session.profile.discoveredRecipeIds).toEqual([RECIPE]);
    expect(storage.value).toBeNull();
  });

  it("persists exact heart ownership across a new run with heart forge false", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const session = loadGameSession(store, workshopStarter());
    const invalid = recordOwnedHeart(store, session, "heart__unknown");
    expect(invalid).toMatchObject({ applied: false, persistence: null, runtimeResult: null });
    const heart = recordOwnedHeart(store, session, "heart__wash");
    const newRun = startNewRun(store, heart.session, workshopStarter(7));
    expect(ownsHeart(newRun.session, "heart__wash")).toBe(true);
    expect(newRun.session.profile.featureFlags.heartForge).toBe(false);
    expect(loadGameSession(store, workshopStarter()).profile.ownedHeartIds).toEqual(["heart__wash"]);
  });
});
