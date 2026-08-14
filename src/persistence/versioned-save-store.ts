import { decodeForgeRuntimeState, type ForgeRuntimeStateV1 } from "../domain/forge-runtime";
import {
  classifyPersistentProfile,
  classifyRunProjection,
  createDefaultProfile,
  parseKnownEnvelope,
  projectRuntimeState,
  runtimeReferencesAllowed,
  serializeSaveEnvelope,
  snapshotPersistenceCatalog,
  isValidSaveGeneration,
  type PersistenceCatalogSnapshot,
} from "./codec";
import {
  FICTOR_SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  type PersistenceCatalog,
  type PersistentProfileV1,
  type SaveEnvelopeV1,
  type SaveGenerationFactory,
  type SaveLoadIssue,
  type SaveLoadResult,
  type SaveResetResult,
  type SaveWriteResult,
  type StorageLike,
} from "./types";

function decodeStarter(candidate: unknown, catalog: PersistenceCatalogSnapshot): ForgeRuntimeStateV1 | null {
  const decoded = decodeForgeRuntimeState(candidate);
  return decoded.valid && runtimeReferencesAllowed(decoded.value, catalog) ? decoded.value : null;
}

function hydrateStarter(starter: ForgeRuntimeStateV1, profile: PersistentProfileV1, catalog: PersistenceCatalogSnapshot): ForgeRuntimeStateV1 {
  const decoded = decodeForgeRuntimeState({ ...starter, profile: { discoveredRecipeIds: [...profile.discoveredRecipeIds] } });
  if (!decoded.valid || !runtimeReferencesAllowed(decoded.value, catalog)) throw new Error("validated starter could not be hydrated");
  return decoded.value;
}

function safeInitialized(
  starter: ForgeRuntimeStateV1,
  catalog: PersistenceCatalogSnapshot,
  issue: SaveLoadIssue,
  writeBlocked: boolean,
): SaveLoadResult {
  const profile = createDefaultProfile();
  return {
    profile,
    runtimeState: hydrateStarter(starter, profile, catalog),
    generation: null,
    revision: 0,
    source: "SAFE_INITIALIZED",
    writeBlocked,
    issues: [issue],
  };
}

export function browserSaveGenerationFactory(): string {
  return globalThis.crypto.randomUUID();
}

export class VersionedSaveStore {
  readonly key: string;
  private readonly catalog: PersistenceCatalogSnapshot;

  constructor(
    private readonly storage: StorageLike,
    catalog: PersistenceCatalog,
    private readonly generationFactory: SaveGenerationFactory = browserSaveGenerationFactory,
    key: string = FICTOR_SAVE_KEY,
  ) {
    this.catalog = snapshotPersistenceCatalog(catalog);
    this.key = key;
  }

  decodeProfile(candidate: unknown): PersistentProfileV1 | null {
    const classified = classifyPersistentProfile(candidate);
    return classified.kind === "VALID" ? classified.value : null;
  }

  decodeRuntime(candidate: unknown): ForgeRuntimeStateV1 | null {
    const decoded = decodeForgeRuntimeState(candidate);
    return decoded.valid && runtimeReferencesAllowed(decoded.value, this.catalog) ? decoded.value : null;
  }

  load(rawStarter: unknown): SaveLoadResult {
    const starter = decodeStarter(rawStarter, this.catalog);
    if (!starter) throw new TypeError("starter template must be a valid allowed ForgeRuntimeStateV1 snapshot");
    let bytes: string | null;
    try {
      bytes = this.storage.getItem(this.key);
    } catch {
      return safeInitialized(starter, this.catalog, "READ_FAILED", true);
    }
    if (bytes === null) {
      const profile = createDefaultProfile();
      return {
        profile,
        runtimeState: hydrateStarter(starter, profile, this.catalog),
        generation: null,
        revision: 0,
        source: "EMPTY",
        writeBlocked: false,
        issues: [],
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes) as unknown;
    } catch {
      return safeInitialized(starter, this.catalog, "INVALID_JSON", true);
    }
    const outer = parseKnownEnvelope(parsed);
    if (outer.kind === "UNSUPPORTED") return safeInitialized(starter, this.catalog, "UNSUPPORTED_VERSION", true);
    if (outer.kind === "INVALID") return safeInitialized(starter, this.catalog, "INVALID_ENVELOPE", true);

    const profileResult = classifyPersistentProfile(outer.profile);
    const provisionalProfile = profileResult.kind === "VALID" ? profileResult.value : createDefaultProfile();
    const runResult = classifyRunProjection(outer.run, provisionalProfile.discoveredRecipeIds, this.catalog);
    if (profileResult.kind === "UNSUPPORTED" || runResult.kind === "UNSUPPORTED") {
      return safeInitialized(starter, this.catalog, "UNSUPPORTED_VERSION", true);
    }

    const issues: SaveLoadIssue[] = [];
    if (profileResult.kind === "INVALID") issues.push("INVALID_PROFILE");
    if (runResult.kind === "INVALID") issues.push("INVALID_RUN");
    const profile = profileResult.kind === "VALID" ? profileResult.value : createDefaultProfile();
    return {
      profile,
      runtimeState: runResult.kind === "VALID" ? runResult.value : hydrateStarter(starter, profile, this.catalog),
      generation: outer.saveGeneration,
      revision: outer.saveRevision,
      source: issues.length === 0 ? "SAVED" : "RECOVERED",
      writeBlocked: false,
      issues,
    };
  }

  save(
    rawProfile: unknown,
    rawRuntimeState: unknown,
    expectedGeneration: string | null,
    expectedRevision: number,
  ): SaveWriteResult {
    const profileResult = classifyPersistentProfile(rawProfile);
    if (profileResult.kind !== "VALID") return { ok: false, persisted: false, reason: "INVALID_PROFILE" };
    const profile = profileResult.value;
    const runtimeState = this.decodeRuntime(rawRuntimeState);
    if (!runtimeState) return { ok: false, persisted: false, reason: "INVALID_RUNTIME" };
    if (profile.discoveredRecipeIds.length !== runtimeState.profile.discoveredRecipeIds.length
      || profile.discoveredRecipeIds.some((id, index) => id !== runtimeState.profile.discoveredRecipeIds[index])) {
      return { ok: false, persisted: false, reason: "PROFILE_RUNTIME_MISMATCH" };
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { ok: false, persisted: false, reason: "STALE_WRITE" };

    let currentBytes: string | null;
    try {
      currentBytes = this.storage.getItem(this.key);
    } catch {
      return { ok: false, persisted: false, reason: "READ_FAILED" };
    }
    let currentGeneration: string | null = null;
    let currentRevision = 0;
    if (currentBytes !== null) {
      let current: unknown;
      try {
        current = JSON.parse(currentBytes) as unknown;
      } catch {
        return { ok: false, persisted: false, reason: "WRITE_BLOCKED" };
      }
      const outer = parseKnownEnvelope(current);
      if (outer.kind !== "KNOWN") return { ok: false, persisted: false, reason: "WRITE_BLOCKED" };
      const currentProfile = classifyPersistentProfile(outer.profile);
      const currentRecipes = currentProfile.kind === "VALID" ? currentProfile.value.discoveredRecipeIds : [];
      const currentRun = classifyRunProjection(outer.run, currentRecipes, this.catalog);
      if (currentProfile.kind === "UNSUPPORTED" || currentRun.kind === "UNSUPPORTED") {
        return { ok: false, persisted: false, reason: "WRITE_BLOCKED" };
      }
      currentGeneration = outer.saveGeneration;
      currentRevision = outer.saveRevision;
    }
    if (currentGeneration !== expectedGeneration || currentRevision !== expectedRevision) {
      return { ok: false, persisted: false, reason: "STALE_WRITE" };
    }
    if (currentRevision === Number.MAX_SAFE_INTEGER) return { ok: false, persisted: false, reason: "REVISION_EXHAUSTED" };

    let saveGeneration = currentGeneration;
    let saveRevision = currentRevision + 1;
    if (currentGeneration === null) {
      let generated: string;
      try {
        generated = this.generationFactory();
      } catch {
        return { ok: false, persisted: false, reason: "GENERATION_FAILED" };
      }
      if (!isValidSaveGeneration(generated)) return { ok: false, persisted: false, reason: "GENERATION_FAILED" };
      saveGeneration = generated;
      saveRevision = 0;
    }
    if (saveGeneration === null) return { ok: false, persisted: false, reason: "GENERATION_FAILED" };

    const envelope: SaveEnvelopeV1 = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      saveGeneration,
      saveRevision,
      profile,
      run: projectRuntimeState(runtimeState),
    };
    const bytes = serializeSaveEnvelope(envelope);
    try {
      this.storage.setItem(this.key, bytes);
    } catch {
      return { ok: false, persisted: false, reason: "WRITE_FAILED" };
    }
    return {
      ok: true,
      persisted: true,
      generation: envelope.saveGeneration,
      revision: envelope.saveRevision,
      bytes,
    };
  }

  reset(rawStarter: unknown): SaveResetResult {
    const starter = decodeStarter(rawStarter, this.catalog);
    if (!starter) return { ok: false, persisted: false, reason: "INVALID_RUNTIME" };
    let currentBytes: string | null;
    try {
      currentBytes = this.storage.getItem(this.key);
    } catch {
      return { ok: false, persisted: false, reason: "READ_FAILED" };
    }
    let currentGeneration: string | null = null;
    if (currentBytes !== null) {
      try {
        const outer = parseKnownEnvelope(JSON.parse(currentBytes) as unknown);
        if (outer.kind === "KNOWN") currentGeneration = outer.saveGeneration;
      } catch { /* A reset may replace malformed bytes. */ }
    }
    let nextGeneration: string;
    try {
      nextGeneration = this.generationFactory();
    } catch {
      return { ok: false, persisted: false, reason: "GENERATION_FAILED" };
    }
    if (!isValidSaveGeneration(nextGeneration) || nextGeneration === currentGeneration) {
      return { ok: false, persisted: false, reason: "GENERATION_FAILED" };
    }
    const profile = createDefaultProfile();
    const runtimeState = hydrateStarter(starter, profile, this.catalog);
    const envelope: SaveEnvelopeV1 = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      saveGeneration: nextGeneration,
      saveRevision: 0,
      profile,
      run: projectRuntimeState(runtimeState),
    };
    const bytes = serializeSaveEnvelope(envelope);
    try {
      this.storage.setItem(this.key, bytes);
    } catch {
      return { ok: false, persisted: false, reason: "WRITE_FAILED" };
    }
    return {
      ok: true,
      persisted: true,
      bytes,
      value: {
        profile,
        runtimeState,
        generation: nextGeneration,
        revision: 0,
        source: "SAVED",
        writeBlocked: false,
        issues: [],
      },
    };
  }
}
