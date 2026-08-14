import { describe, expect, it } from "vitest";

import {
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  type ForgeRuntimeStateV1,
} from "../../src/domain";
import {
  FICTOR_SAVE_KEY,
  HEART_IDS,
  VersionedSaveStore,
  createDefaultProfile,
  decodePersistentProfile,
  projectRuntimeState,
  serializeSaveEnvelope,
  type SaveEnvelopeV1,
  type StorageLike,
} from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;

  getItem(key: string): string | null {
    if (this.failGet) throw new Error("secret read detail");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error("quota detail");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemove) throw new Error("secret remove detail");
    this.values.delete(key);
  }
}

function starter(): ForgeRuntimeStateV1 {
  return {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    revision: 0,
    profile: { discoveredRecipeIds: [] },
    run: {
      fuel: 3,
      nextInstanceSequence: 2,
      ownedInstances: [
        { instanceId: "starter-1", cardId: "ore_burn" },
        { instanceId: "starter-2", cardId: "ore_still" },
      ],
      deck: ["starter-1", "starter-2"],
      activeCombat: null,
    },
  };
}

function allowlist() {
  return {
    allowedRecipeIds: ["ore_burn|ore_still"],
    allowedCardIds: ["ore_burn", "ore_still", "burn_01", "forge__ore_burn__ore_still"],
  };
}

function savedFixture() {
  const storage = new MemoryStorage();
  const store = new VersionedSaveStore(storage, allowlist());
  const profile = {
    ...createDefaultProfile(),
    discoveredRecipeIds: ["ore_burn|ore_still"],
    ownedHeartIds: ["heart__still" as const],
  };
  const runtime = starter();
  runtime.profile.discoveredRecipeIds = [...profile.discoveredRecipeIds];
  runtime.run.fuel = 1;
  expect(store.save(profile, runtime, 0).ok).toBe(true);
  return { storage, store, profile, runtime };
}

describe("VersionedSaveStore", () => {
  it("round-trips deterministic v1 bytes without serializing runtime.profile or aliases", () => {
    const { storage, store, profile, runtime } = savedFixture();
    const bytes = storage.getItem(FICTOR_SAVE_KEY)!;
    const envelope = JSON.parse(bytes) as SaveEnvelopeV1 & { run: { profile?: unknown } };
    expect(envelope.run.profile).toBeUndefined();
    expect(serializeSaveEnvelope(envelope)).toBe(bytes);

    const projection = projectRuntimeState(runtime);
    runtime.run.fuel = 98;
    expect(projection.run.fuel).toBe(1);

    profile.discoveredRecipeIds.length = 0;
    runtime.run.fuel = 99;
    const loaded = store.load(starter());
    expect(loaded).toMatchObject({ source: "SAVED", revision: 1, writeBlocked: false, issues: [] });
    expect(loaded.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
    expect(loaded.runtimeState.profile.discoveredRecipeIds).toEqual(loaded.profile.discoveredRecipeIds);
    expect(loaded.runtimeState.run.fuel).toBe(1);
    loaded.profile.discoveredRecipeIds.length = 0;
    expect(store.load(starter()).profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
  });

  it("recovers profile and run independently under a known v1 envelope", () => {
    const first = savedFixture();
    const badRun = JSON.parse(first.storage.getItem(FICTOR_SAVE_KEY)!) as SaveEnvelopeV1;
    (badRun.run.run as { fuel: unknown }).fuel = -1;
    first.storage.setItem(FICTOR_SAVE_KEY, JSON.stringify(badRun));
    const profileOnly = first.store.load(starter());
    expect(profileOnly).toMatchObject({ source: "RECOVERED", issues: ["INVALID_RUN"], revision: 1 });
    expect(profileOnly.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
    expect(profileOnly.runtimeState.run.fuel).toBe(3);
    expect(profileOnly.runtimeState.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);

    const second = savedFixture();
    const badProfile = JSON.parse(second.storage.getItem(FICTOR_SAVE_KEY)!) as SaveEnvelopeV1;
    badProfile.profile.featureFlags = { heartForge: true as false };
    second.storage.setItem(FICTOR_SAVE_KEY, JSON.stringify(badProfile));
    const runOnly = second.store.load(starter());
    expect(runOnly).toMatchObject({ source: "RECOVERED", issues: ["INVALID_PROFILE"] });
    expect(runOnly.profile).toEqual(createDefaultProfile());
    expect(runOnly.runtimeState.run.fuel).toBe(1);
    expect(runOnly.runtimeState.profile.discoveredRecipeIds).toEqual([]);
  });

  it.each([
    ["invalid JSON", "{"],
    ["null", "null"],
    ["array", "[]"],
    ["missing version", JSON.stringify({ revision: 4 })],
  ])("safe-initializes %s, preserves bytes, and blocks writes", (_label, bytes) => {
    const storage = new MemoryStorage();
    storage.setItem(FICTOR_SAVE_KEY, bytes);
    const store = new VersionedSaveStore(storage, allowlist());
    const loaded = store.load(starter());
    expect(loaded).toMatchObject({ source: "SAFE_INITIALIZED", writeBlocked: true, revision: 0 });
    expect(loaded.profile).toEqual(createDefaultProfile());
    expect(storage.getItem(FICTOR_SAVE_KEY)).toBe(bytes);
    expect(store.save(loaded.profile, loaded.runtimeState, loaded.revision)).toEqual({ ok: false, persisted: false, reason: "WRITE_BLOCKED" });
    expect(storage.getItem(FICTOR_SAVE_KEY)).toBe(bytes);
  });

  it.each([0, 2, 999])("preserves unsupported schema version %s until explicit reset", (schemaVersion) => {
    const storage = new MemoryStorage();
    const bytes = JSON.stringify({ schemaVersion, opaque: "preserve me" });
    storage.setItem(FICTOR_SAVE_KEY, bytes);
    const store = new VersionedSaveStore(storage, allowlist());
    expect(store.load(starter())).toMatchObject({ writeBlocked: true, issues: ["UNSUPPORTED_VERSION"] });
    expect(storage.getItem(FICTOR_SAVE_KEY)).toBe(bytes);
    const reset = store.reset(starter());
    expect(reset.ok).toBe(true);
    expect(store.load(starter())).toMatchObject({ source: "SAVED", writeBlocked: false, revision: 0 });
  });

  it("returns non-sensitive typed read, quota, and remove failures without throwing", () => {
    const storage = new MemoryStorage();
    const store = new VersionedSaveStore(storage, allowlist());
    storage.failGet = true;
    expect(store.load(starter())).toMatchObject({ writeBlocked: true, issues: ["READ_FAILED"] });
    const profile = createDefaultProfile();
    expect(store.save(profile, starter(), 0)).toEqual({ ok: false, persisted: false, reason: "READ_FAILED" });
    storage.failGet = false;
    storage.failSet = true;
    expect(store.save(profile, starter(), 0)).toEqual({ ok: false, persisted: false, reason: "WRITE_FAILED" });
    expect(store.reset(starter())).toEqual({ ok: false, persisted: false, reason: "WRITE_FAILED" });
    storage.failSet = false;
    storage.failRemove = true;
    expect(store.remove()).toEqual({ ok: false, reason: "REMOVE_FAILED" });
  });

  it("rejects stale and exhausted revisions after rereading storage", () => {
    const storage = new MemoryStorage();
    const first = new VersionedSaveStore(storage, allowlist());
    const second = new VersionedSaveStore(storage, allowlist());
    const a = first.load(starter());
    const b = second.load(starter());
    expect(first.save(a.profile, a.runtimeState, a.revision)).toMatchObject({ ok: true, revision: 1 });
    expect(second.save(b.profile, b.runtimeState, b.revision)).toEqual({ ok: false, persisted: false, reason: "STALE_WRITE" });

    const envelope = JSON.parse(storage.getItem(FICTOR_SAVE_KEY)!) as SaveEnvelopeV1;
    envelope.saveRevision = Number.MAX_SAFE_INTEGER;
    storage.setItem(FICTOR_SAVE_KEY, JSON.stringify(envelope));
    const max = first.load(starter());
    expect(first.save(max.profile, max.runtimeState, max.revision)).toEqual({ ok: false, persisted: false, reason: "REVISION_EXHAUSTED" });
  });

  it("strictly rejects malformed profiles, heart flags, and noncanonical collections", () => {
    const base = { ...createDefaultProfile(), discoveredRecipeIds: ["ore_burn|ore_still"] };
    const allowedRecipes = new Set(allowlist().allowedRecipeIds);
    expect(decodePersistentProfile(base, allowedRecipes)).not.toBeNull();
    const malformed = [
      { ...base, discoveredRecipeIds: ["ore_burn|ore_still", "ore_burn|ore_still"] },
      { ...base, discoveredRecipeIds: ["ore_still|ore_burn"] },
      { ...base, discoveredRecipeIds: ["fake_a|fake_b"] },
      { ...base, discoveredRecipeIds: Array.from({ length: 1327 }, () => "ore_burn|ore_still") },
      { ...base, ownedHeartIds: [HEART_IDS[0], HEART_IDS[0]] },
      { ...base, ownedHeartIds: ["heart__unknown"] },
      { ...base, featureFlags: { heartForge: true } },
      { ...base, featureFlags: {} },
      { ...base, extra: true },
    ];
    for (const candidate of malformed) expect(decodePersistentProfile(candidate, allowedRecipes)).toBeNull();
  });

  it("requires a strict decoded starter and validates profile/runtime agreement before I/O", () => {
    const storage = new MemoryStorage();
    const store = new VersionedSaveStore(storage, allowlist());
    expect(() => store.load({ ...starter(), extra: true })).toThrow(TypeError);
    const profile = { ...createDefaultProfile(), discoveredRecipeIds: ["ore_burn|ore_still"] };
    expect(store.save(profile, starter(), 0)).toEqual({ ok: false, persisted: false, reason: "PROFILE_RUNTIME_MISMATCH" });
    expect(storage.getItem(FICTOR_SAVE_KEY)).toBeNull();
  });

  it("snapshots a strict injected allowlist and rejects unreviewed run references", () => {
    const storage = new MemoryStorage();
    const catalog = allowlist();
    const store = new VersionedSaveStore(storage, catalog);
    catalog.allowedCardIds[0] = "mutated_after_construction";
    expect(store.load(starter()).source).toBe("EMPTY");

    const unreviewed = starter();
    unreviewed.run.ownedInstances[0].cardId = "not_reviewed";
    expect(store.save(createDefaultProfile(), unreviewed, 0)).toEqual({ ok: false, persisted: false, reason: "INVALID_RUNTIME" });
    expect(() => new VersionedSaveStore(storage, { ...allowlist(), allowedRecipeIds: ["fake_a|fake_b"] })).toThrow(TypeError);
    expect(() => new VersionedSaveStore(storage, { ...allowlist(), allowedCardIds: ["ore_burn", "ore_burn"] })).toThrow(TypeError);
    expect(() => new VersionedSaveStore(storage, { ...allowlist(), extra: [] } as never)).toThrow(TypeError);

    const setCatalog = new VersionedSaveStore(storage, {
      allowedRecipeIds: new Set(["ore_burn|ore_still"]),
      allowedCardIds: new Set(["ore_burn", "ore_still"]),
    });
    expect(setCatalog.load(starter()).source).toBe("EMPTY");
  });
});
