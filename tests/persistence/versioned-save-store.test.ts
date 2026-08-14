import { describe, expect, it } from "vitest";

import canonicalGenerated from "../../src/data/generated/cards.generated.json";
import { generateCatalogPayloads } from "../../src/data/generator/generate-catalog";
import lawsSource from "../../src/data/source/laws.json";
import materialsSource from "../../src/data/source/materials.json";
import resultClassesSource from "../../src/data/source/resultClasses.json";
import {
  createCombatState,
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  type ForgeInputs,
  type ForgeMaterial,
  type ForgeRuntimeStateV1,
} from "../../src/domain";
import {
  canonicalRecipeCardEntries,
  FICTOR_SAVE_KEY,
  VersionedSaveStore,
  classifyPersistentProfile,
  createDefaultProfile,
  decodePersistentProfile,
  type PersistenceCatalog,
  type SaveEnvelopeV1,
  type StorageLike,
} from "../../src/persistence";
import { fixtureSetup } from "../domain/fixtures";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failGet = false;
  failSet = false;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error("private read detail");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error("private quota detail");
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}

const RECIPE = "ore_burn|ore_still";
const RESULT_CARD = "forge__ore_burn__ore_still";

function catalog(): PersistenceCatalog {
  return {
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    allowedEnemyIds: ["enemy_fixture"],
    allowedIntentIds: ["intent_attack", "intent_attack_2"],
    allowedDisplayTexts: ["내리치기"],
  };
}

function generationSequence(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `generation-${index}`;
}

function createStore(storage: MemoryStorage, factory = generationSequence("generation-1", "generation-2", "generation-3")) {
  return new VersionedSaveStore(storage, catalog(), factory);
}

function starter(active = false): ForgeRuntimeStateV1 {
  const ownedInstances = [
    { instanceId: "starter-a", cardId: "ore_burn" },
    { instanceId: "starter-b", cardId: "ore_still" },
  ];
  const state: ForgeRuntimeStateV1 = {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    revision: 0,
    profile: { discoveredRecipeIds: [] },
    run: { fuel: 3, nextInstanceSequence: 0, ownedInstances, deck: ownedInstances.map(({ instanceId }) => instanceId), activeCombat: null },
  };
  if (active) {
    const setup = fixtureSetup({
      rules: { ...fixtureSetup().rules, drawCount: 2 },
      cards: [
        { cardId: "ore_burn", effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "BURN" },
        { cardId: "ore_still", effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "STILL" },
      ],
      instances: ownedInstances,
      deck: ownedInstances.map(({ instanceId }) => instanceId),
    });
    state.run.activeCombat = {
      state: createCombatState(setup),
      enrolledPersistentInstanceIds: ownedInstances.map(({ instanceId }) => instanceId),
      forgeActionTurn: 0,
      forgeActionsRemaining: 0,
      isolatedMaterials: [],
      ephemeralResults: [],
    };
  }
  return state;
}

function savedFixture() {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  const profile = { ...createDefaultProfile(), discoveredRecipeIds: [RECIPE], ownedHeartIds: ["heart__still" as const] };
  const runtime = starter();
  runtime.profile.discoveredRecipeIds = [RECIPE];
  runtime.run.fuel = 1;
  expect(store.save(profile, runtime, null, 0)).toMatchObject({ ok: true, generation: "generation-1", revision: 0 });
  return { storage, store, profile, runtime };
}

describe("VersionedSaveStore", () => {
  it("derives all 1,326 recipe-card pairs exactly from canonical source and generator output", () => {
    const authority = canonicalRecipeCardEntries();
    const generated = generateCatalogPayloads(
      materialsSource as unknown as ForgeMaterial[],
      { laws: lawsSource, resultClasses: resultClassesSource } as unknown as ForgeInputs,
    ).cards;
    expect(authority).toHaveLength(1326);
    expect(new Set(authority.map(([recipeId]) => recipeId)).size).toBe(1326);
    expect(new Set(authority.map(([, cardId]) => cardId)).size).toBe(1326);
    expect(authority).toEqual(generated.map(({ recipe_id, card_id }) => [recipe_id, card_id]));
    expect(authority).toEqual(canonicalGenerated.items.map(({ recipe_id, card_id }) => [recipe_id, card_id]));
    const materialIds = new Set(authority.flatMap(([recipeId]) => recipeId.split("|")));
    expect([...materialIds].sort()).toEqual(materialsSource.map(({ id }) => id).sort());
  });

  it("round-trips deterministic detached bytes without runtime.profile", () => {
    const { storage, store, profile, runtime } = savedFixture();
    const bytes = storage.getItem(FICTOR_SAVE_KEY)!;
    const envelope = JSON.parse(bytes) as SaveEnvelopeV1 & { run: { profile?: unknown } };
    expect(envelope.run.profile).toBeUndefined();
    expect(JSON.stringify(envelope)).toBe(bytes);
    profile.discoveredRecipeIds.length = 0;
    runtime.run.fuel = 99;
    const loaded = store.load(starter());
    expect(loaded).toMatchObject({ source: "SAVED", generation: "generation-1", revision: 0, writeBlocked: false, issues: [] });
    expect(loaded.profile.discoveredRecipeIds).toEqual([RECIPE]);
    expect(loaded.runtimeState.profile.discoveredRecipeIds).toEqual([RECIPE]);
    expect(loaded.runtimeState.run.fuel).toBe(1);
  });

  it("partially recovers ordinary malformed known-v1 profile and run", () => {
    const profileFixture = savedFixture();
    const badProfile = JSON.parse(profileFixture.storage.getItem(FICTOR_SAVE_KEY)!) as SaveEnvelopeV1;
    badProfile.profile.featureFlags = { heartForge: true as false };
    profileFixture.storage.setItem(FICTOR_SAVE_KEY, JSON.stringify(badProfile));
    const runOnly = profileFixture.store.load(starter());
    expect(runOnly).toMatchObject({ source: "RECOVERED", issues: ["INVALID_PROFILE"], writeBlocked: false });
    expect(runOnly.profile).toEqual(createDefaultProfile());
    expect(runOnly.runtimeState.run.fuel).toBe(1);
    expect(profileFixture.store.save(runOnly.profile, runOnly.runtimeState, runOnly.generation, runOnly.revision)).toMatchObject({ ok: true, revision: 1 });

    const runFixture = savedFixture();
    const badRun = JSON.parse(runFixture.storage.getItem(FICTOR_SAVE_KEY)!) as SaveEnvelopeV1;
    badRun.run.run.fuel = -1;
    runFixture.storage.setItem(FICTOR_SAVE_KEY, JSON.stringify(badRun));
    const profileOnly = runFixture.store.load(starter());
    expect(profileOnly).toMatchObject({ source: "RECOVERED", issues: ["INVALID_RUN"], writeBlocked: false });
    expect(profileOnly.profile.discoveredRecipeIds).toEqual([RECIPE]);
    expect(profileOnly.runtimeState.run.fuel).toBe(3);
  });

  it("blocks and preserves nested unsupported profile versions", () => {
    const { storage, store } = savedFixture();
    const envelope = JSON.parse(storage.getItem(FICTOR_SAVE_KEY)!) as SaveEnvelopeV1;
    (envelope.profile as unknown as { schemaVersion: number }).schemaVersion = 2;
    const bytes = JSON.stringify(envelope);
    storage.setItem(FICTOR_SAVE_KEY, bytes);
    const loaded = store.load(starter());
    expect(loaded).toMatchObject({ source: "SAFE_INITIALIZED", issues: ["UNSUPPORTED_VERSION"], writeBlocked: true });
    expect(loaded.profile).toEqual(createDefaultProfile());
    expect(loaded.runtimeState.run).toEqual(starter().run);
    expect(store.save(loaded.profile, loaded.runtimeState, loaded.generation, loaded.revision)).toMatchObject({ ok: false, reason: "WRITE_BLOCKED" });
    expect(storage.getItem(FICTOR_SAVE_KEY)).toBe(bytes);
  });

  it.each([
    ["schemaVersion", "forge-runtime-state-v2"],
    ["engineVersion", "forge-runtime-engine-v2"],
    ["resolverVersion", "canonical-v2"],
    ["sourceHash", "f".repeat(64)],
  ])("blocks and preserves nested unsupported run %s", (field, value) => {
    const { storage, store } = savedFixture();
    const envelope = JSON.parse(storage.getItem(FICTOR_SAVE_KEY)!) as SaveEnvelopeV1;
    (envelope.run as unknown as Record<string, unknown>)[field] = value;
    const bytes = JSON.stringify(envelope);
    storage.setItem(FICTOR_SAVE_KEY, bytes);
    const loaded = store.load(starter());
    expect(loaded).toMatchObject({ source: "SAFE_INITIALIZED", issues: ["UNSUPPORTED_VERSION"], writeBlocked: true });
    expect(store.save(loaded.profile, loaded.runtimeState, loaded.generation, loaded.revision)).toMatchObject({ ok: false, reason: "WRITE_BLOCKED" });
    expect(storage.getItem(FICTOR_SAVE_KEY)).toBe(bytes);
  });

  it.each([["invalid JSON", "{"], ["null", "null"], ["array", "[]"]])(
    "safe-initializes and preserves malformed outer %s",
    (_label, bytes) => {
      const storage = new MemoryStorage();
      storage.setItem(FICTOR_SAVE_KEY, bytes);
      const store = createStore(storage);
      const loaded = store.load(starter());
      expect(loaded).toMatchObject({ source: "SAFE_INITIALIZED", writeBlocked: true });
      expect(store.save(loaded.profile, loaded.runtimeState, loaded.generation, 0)).toMatchObject({ ok: false, reason: "WRITE_BLOCKED" });
      expect(storage.getItem(FICTOR_SAVE_KEY)).toBe(bytes);
    },
  );

  it("replaces a known generation on reset and rejects a pre-reset stale session", () => {
    const storage = new MemoryStorage();
    const factory = generationSequence("generation-first", "generation-reset");
    const first = createStore(storage, factory);
    const second = createStore(storage, factory);
    const before = first.load(starter());
    expect(first.save(before.profile, before.runtimeState, before.generation, 0)).toMatchObject({ ok: true, generation: "generation-first", revision: 0 });
    const stale = second.load(starter());
    const reset = first.reset(starter());
    expect(reset).toMatchObject({ ok: true, value: { generation: "generation-reset", revision: 0 } });
    expect(second.save(stale.profile, stale.runtimeState, stale.generation, stale.revision)).toEqual({ ok: false, persisted: false, reason: "STALE_WRITE" });
  });

  it.each([
    ["empty", null],
    ["invalid JSON", "{"],
    ["unsupported outer", JSON.stringify({ schemaVersion: 9, opaque: true })],
  ])("a fresh reset generation makes a pre-reset %s session stale", (_label, initialBytes) => {
    const storage = new MemoryStorage();
    if (initialBytes !== null) storage.setItem(FICTOR_SAVE_KEY, initialBytes);
    const store = createStore(storage, generationSequence("reset-generation"));
    const stale = store.load(starter());
    expect(stale.generation).toBeNull();
    expect(store.reset(starter())).toMatchObject({ ok: true, value: { generation: "reset-generation", revision: 0 } });
    expect(store.save(stale.profile, stale.runtimeState, stale.generation, stale.revision)).toEqual({
      ok: false,
      persisted: false,
      reason: "STALE_WRITE",
    });
  });

  it("a first save from empty mints identity and rejects another empty session", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage, generationSequence("first-generation"));
    const first = store.load(starter());
    const stale = store.load(starter());
    expect(store.save(first.profile, first.runtimeState, first.generation, first.revision)).toMatchObject({
      ok: true,
      generation: "first-generation",
      revision: 0,
    });
    expect(store.save(stale.profile, stale.runtimeState, stale.generation, stale.revision)).toEqual({
      ok: false,
      persisted: false,
      reason: "STALE_WRITE",
    });
  });

  it("lets explicit reset replace unsupported bytes with a fresh token", () => {
    const storage = new MemoryStorage();
    storage.setItem(FICTOR_SAVE_KEY, JSON.stringify({ schemaVersion: 9, opaque: true }));
    const store = createStore(storage);
    expect(store.load(starter()).writeBlocked).toBe(true);
    expect(store.reset(starter())).toMatchObject({ ok: true, value: { generation: "generation-1", revision: 0, writeBlocked: false } });
  });

  it("returns typed reset read/write/generation failures", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    storage.failGet = true;
    expect(store.reset(starter())).toEqual({ ok: false, persisted: false, reason: "READ_FAILED" });
    storage.failGet = false;
    expect(store.save(createDefaultProfile(), starter(), null, 0)).toMatchObject({ ok: true });
    storage.failSet = true;
    expect(store.reset(starter())).toEqual({ ok: false, persisted: false, reason: "WRITE_FAILED" });
    storage.failSet = false;
    const duplicate = createStore(storage, () => "generation-1");
    expect(duplicate.reset(starter())).toEqual({ ok: false, persisted: false, reason: "GENERATION_FAILED" });
  });

  it("takes one strict profile snapshot and rejects accessors, symbols, sparse arrays, prototypes, and traps", () => {
    const base = { ...createDefaultProfile(), discoveredRecipeIds: [RECIPE] };
    expect(decodePersistentProfile(base)).not.toBeNull();
    const accessor = { ...base } as Record<string, unknown>;
    Object.defineProperty(accessor, "schemaVersion", { enumerable: true, get: () => 1 });
    const symbol = { ...base, [Symbol("hidden")]: true };
    const sparse = { ...base, discoveredRecipeIds: new Array(1) };
    const inherited = Object.assign(Object.create({ inherited: true }), base);
    const trapped = new Proxy(base, { ownKeys() { throw new Error("secret trap"); } });
    for (const candidate of [accessor, symbol, sparse, inherited, trapped]) {
      expect(classifyPersistentProfile(candidate)).toEqual({ kind: "INVALID" });
    }
    let reads = 0;
    const proxied = new Proxy(base, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "schemaVersion") reads += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(classifyPersistentProfile(proxied).kind).toBe("VALID");
    expect(reads).toBe(1);
  });

  it("rejects PII-like and unreviewed runtime refs plus wrong recipe-card pairs", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    const mutations: Array<(state: ForgeRuntimeStateV1) => void> = [
      (state) => {
        state.run.ownedInstances[0].instanceId = "person@example.com";
        state.run.deck[0] = "person@example.com";
        state.run.activeCombat!.enrolledPersistentInstanceIds[0] = "person@example.com";
        state.run.activeCombat!.state.instances[0].instanceId = "person@example.com";
        state.run.activeCombat!.state.zones.deck[0] = "person@example.com";
      },
      (state) => { state.run.activeCombat!.state.enemy.enemyId = "unknown_enemy"; },
      (state) => { state.run.activeCombat!.state.enemy.intents[0].intentId = "unknown_intent"; },
      (state) => { state.run.activeCombat!.state.enemy.intents[0].labelKo = "person@example.com"; },
      (state) => {
        state.run.activeCombat!.ephemeralResults.push({ instanceId: "ephemeral-1", cardId: "burn_01", recipeId: RECIPE, location: "HAND" });
      },
    ];
    for (const mutate of mutations) {
      const state = starter(true);
      mutate(state);
      expect(store.save(createDefaultProfile(), state, null, 0)).toEqual({ ok: false, persisted: false, reason: "INVALID_RUNTIME" });
    }
  });

  it("rejects a permanent workshop result until its canonical recipe is discovered", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    const state = starter();
    state.run.ownedInstances = [{ instanceId: "workshop-result", cardId: RESULT_CARD }];
    state.run.deck = ["workshop-result"];
    expect(store.save(createDefaultProfile(), state, null, 0)).toEqual({
      ok: false,
      persisted: false,
      reason: "INVALID_RUNTIME",
    });
    state.profile.discoveredRecipeIds = [RECIPE];
    const profile = { ...createDefaultProfile(), discoveredRecipeIds: [RECIPE] };
    expect(store.save(profile, state, null, 0)).toMatchObject({ ok: true, generation: "generation-1", revision: 0 });
  });

  it("snapshots a source-bound catalog and masks reflection trap details", () => {
    const storage = new MemoryStorage();
    const input = catalog();
    const store = new VersionedSaveStore(storage, input, generationSequence("generation-1"));
    (input.allowedEnemyIds as string[])[0] = "mutated";
    expect(store.load(starter()).source).toBe("EMPTY");
    const wrongSource = { ...catalog(), sourceHash: "f".repeat(64) } as PersistenceCatalog;
    expect(() => new VersionedSaveStore(storage, wrongSource)).toThrowError(new TypeError("invalid persistence catalog"));
    const trapped = new Proxy(catalog(), { ownKeys() { throw new Error("raw secret"); } });
    expect(() => new VersionedSaveStore(storage, trapped)).toThrowError(new TypeError("invalid persistence catalog"));
  });
});
