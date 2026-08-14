import { describe, expect, it } from "vitest";

import {
  applyForgeRuntimeResult,
  loadGameSession,
  ownsHeart,
  recordOwnedHeart,
  startNewRun,
} from "../../src/application";
import {
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  type ForgeRuntimeStateV1,
} from "../../src/domain";
import { VersionedSaveStore, type StorageLike } from "../../src/persistence";

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

function starter(): ForgeRuntimeStateV1 {
  return {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    revision: 0,
    profile: { discoveredRecipeIds: [] },
    run: {
      fuel: 4,
      nextInstanceSequence: 0,
      ownedInstances: [
        { instanceId: "starter-a", cardId: "ore_burn" },
        { instanceId: "starter-b", cardId: "ore_still" },
      ],
      deck: ["starter-a", "starter-b"],
      activeCombat: null,
    },
  };
}

function storeFor(storage: MemoryStorage): VersionedSaveStore {
  return new VersionedSaveStore(storage, {
    allowedRecipeIds: ["ore_burn|ore_still"],
    allowedCardIds: ["ore_burn", "ore_still", "burn_01"],
  });
}

function runtimeResult(state: ForgeRuntimeStateV1) {
  return { state, events: [] };
}

describe("game session", () => {
  it("keeps one canonical Codex entry across instant/workshop result sync and reload", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    let session = loadGameSession(store, starter());
    const instant = structuredClone(session.runtimeState);
    instant.revision += 1;
    instant.profile.discoveredRecipeIds = ["ore_burn|ore_still"];
    let mutation = applyForgeRuntimeResult(store, session, runtimeResult(instant));
    expect(mutation).toMatchObject({ applied: true, persistence: { ok: true, persisted: true } });
    session = mutation.session;

    const workshopReverseSelection = structuredClone(session.runtimeState);
    workshopReverseSelection.revision += 1;
    workshopReverseSelection.profile.discoveredRecipeIds = ["ore_burn|ore_still"];
    mutation = applyForgeRuntimeResult(store, session, runtimeResult(workshopReverseSelection));
    expect(mutation.session.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
    expect(loadGameSession(store, starter()).profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
  });

  it("starts a fully fresh injected run while retaining Codex and heart profile", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    let session = loadGameSession(store, starter());
    const progressed = structuredClone(session.runtimeState);
    progressed.revision = 8;
    progressed.profile.discoveredRecipeIds = ["ore_burn|ore_still"];
    progressed.run.fuel = 0;
    progressed.run.nextInstanceSequence = 9;
    progressed.run.ownedInstances = [{ instanceId: "changed", cardId: "burn_01" }];
    progressed.run.deck = ["changed"];
    session = applyForgeRuntimeResult(store, session, runtimeResult(progressed)).session;
    session = recordOwnedHeart(store, session, "heart__still").session;

    const reset = startNewRun(store, session, starter());
    expect(reset).toMatchObject({ applied: true, persistence: { ok: true, persisted: true } });
    expect(reset.session.runtimeState.run).toEqual(starter().run);
    expect(reset.session.runtimeState.revision).toBe(starter().revision);
    expect(reset.session.profile.discoveredRecipeIds).toEqual(["ore_burn|ore_still"]);
    expect(ownsHeart(reset.session, "heart__still")).toBe(true);
    expect(reset.session.profile.featureFlags.heartForge).toBe(false);
    expect(reset.session.runtimeState.profile.discoveredRecipeIds).toEqual(reset.session.profile.discoveredRecipeIds);

    const reloaded = loadGameSession(store, starter());
    expect(reloaded.runtimeState.run).toEqual(starter().run);
    expect(reloaded.profile).toEqual(reset.session.profile);
  });

  it("records only exact observed heart IDs without consumption or heart-forge commands", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const session = loadGameSession(store, starter());
    const invalid = recordOwnedHeart(store, session, "heart__unknown");
    expect(invalid).toMatchObject({ applied: false, persistence: null });
    expect(invalid.session).toEqual(session);
    const first = recordOwnedHeart(store, session, "heart__wash");
    const duplicate = recordOwnedHeart(store, first.session, "heart__wash");
    expect(duplicate.session.profile.ownedHeartIds).toEqual(["heart__wash"]);
    expect(duplicate.session.profile.featureFlags).toEqual({ heartForge: false });
  });

  it("preserves advanced in-memory state and reports quota failure without claiming persistence", () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const session = loadGameSession(store, starter());
    const advanced = structuredClone(session.runtimeState);
    advanced.revision = 1;
    advanced.run.fuel = 2;
    storage.failSet = true;
    const result = applyForgeRuntimeResult(store, session, runtimeResult(advanced));
    expect(result).toMatchObject({ applied: true, persistence: { ok: false, persisted: false, reason: "WRITE_FAILED" } });
    expect(result.session.runtimeState.run.fuel).toBe(2);
    expect(result.session.persistenceRevision).toBe(0);
    expect(storage.value).toBeNull();
  });

  it("does not apply invalid reducer results and honors a loaded write block", () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({ schemaVersion: 2, opaque: true });
    const store = storeFor(storage);
    const blocked = loadGameSession(store, starter());
    const state = structuredClone(blocked.runtimeState);
    state.run.fuel = 2;
    expect(applyForgeRuntimeResult(store, blocked, runtimeResult(state))).toMatchObject({
      applied: true,
      persistence: { ok: false, persisted: false, reason: "WRITE_BLOCKED" },
    });
    const invalid = applyForgeRuntimeResult(store, blocked, {
      state: null,
      events: [{ type: "FORGE_REJECTED", command: "UNKNOWN", reason: "INVALID_STATE" }],
    });
    expect(invalid).toMatchObject({ applied: false, persistence: null });
  });
});
