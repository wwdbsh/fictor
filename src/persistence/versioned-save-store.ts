import { decodeForgeRuntimeState, type ForgeRuntimeStateV1 } from "../domain/forge-runtime";
import {
  createDefaultProfile,
  decodePersistentProfile,
  decodeRunProjection,
  parseKnownEnvelope,
  projectRuntimeState,
  runtimeReferencesAllowed,
  serializeSaveEnvelope,
  snapshotPersistenceAllowlist,
  type PersistenceAllowlistSnapshot,
} from "./codec";
import {
  FICTOR_SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  type PersistentProfileV1,
  type PersistenceAllowlist,
  type SaveEnvelopeV1,
  type SaveLoadIssue,
  type SaveLoadResult,
  type SaveRemoveResult,
  type SaveResetResult,
  type SaveWriteResult,
  type StorageLike,
} from "./types";

function decodeStarter(candidate: unknown, allowlist: PersistenceAllowlistSnapshot): ForgeRuntimeStateV1 | null {
  const decoded = decodeForgeRuntimeState(candidate);
  return decoded.valid && runtimeReferencesAllowed(decoded.value, allowlist) ? decoded.value : null;
}

function hydrateStarter(starter: ForgeRuntimeStateV1, profile: PersistentProfileV1): ForgeRuntimeStateV1 {
  const decoded = decodeForgeRuntimeState({
    ...starter,
    profile: { discoveredRecipeIds: [...profile.discoveredRecipeIds] },
  });
  if (!decoded.valid) throw new Error("validated starter could not be hydrated");
  return decoded.value;
}

function safeInitialized(starter: ForgeRuntimeStateV1, issue: SaveLoadIssue, writeBlocked: boolean): SaveLoadResult {
  const profile = createDefaultProfile();
  return {
    profile,
    runtimeState: hydrateStarter(starter, profile),
    revision: 0,
    source: "SAFE_INITIALIZED",
    writeBlocked,
    issues: [issue],
  };
}

export class VersionedSaveStore {
  readonly key: string;
  private readonly allowlist: PersistenceAllowlistSnapshot;

  constructor(private readonly storage: StorageLike, allowlist: PersistenceAllowlist, key: string = FICTOR_SAVE_KEY) {
    this.allowlist = snapshotPersistenceAllowlist(allowlist);
    this.key = key;
  }

  decodeProfile(candidate: unknown): PersistentProfileV1 | null {
    return decodePersistentProfile(candidate, this.allowlist.allowedRecipeIds);
  }

  decodeRuntime(candidate: unknown): ForgeRuntimeStateV1 | null {
    const decoded = decodeForgeRuntimeState(candidate);
    return decoded.valid && runtimeReferencesAllowed(decoded.value, this.allowlist) ? decoded.value : null;
  }

  load(rawStarter: unknown): SaveLoadResult {
    const starter = decodeStarter(rawStarter, this.allowlist);
    if (!starter) throw new TypeError("starter template must be a valid ForgeRuntimeStateV1 snapshot");
    let bytes: string | null;
    try {
      bytes = this.storage.getItem(this.key);
    } catch {
      return safeInitialized(starter, "READ_FAILED", true);
    }
    if (bytes === null) {
      const profile = createDefaultProfile();
      return {
        profile,
        runtimeState: hydrateStarter(starter, profile),
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
      return safeInitialized(starter, "INVALID_JSON", true);
    }
    const outer = parseKnownEnvelope(parsed);
    if (outer.kind === "UNSUPPORTED") return safeInitialized(starter, "UNSUPPORTED_VERSION", true);
    if (outer.kind === "INVALID") return safeInitialized(starter, "INVALID_ENVELOPE", true);

    const issues: SaveLoadIssue[] = [];
    const decodedProfile = decodePersistentProfile(outer.profile, this.allowlist.allowedRecipeIds);
    const profile = decodedProfile ?? createDefaultProfile();
    if (decodedProfile === null) issues.push("INVALID_PROFILE");
    const savedRuntime = decodeRunProjection(outer.run, profile.discoveredRecipeIds, this.allowlist);
    if (!savedRuntime) issues.push("INVALID_RUN");
    return {
      profile,
      runtimeState: savedRuntime ?? hydrateStarter(starter, profile),
      revision: outer.saveRevision,
      source: issues.length === 0 ? "SAVED" : "RECOVERED",
      writeBlocked: false,
      issues,
    };
  }

  save(rawProfile: unknown, rawRuntimeState: unknown, expectedRevision: number): SaveWriteResult {
    const profile = decodePersistentProfile(rawProfile, this.allowlist.allowedRecipeIds);
    if (!profile) return { ok: false, persisted: false, reason: "INVALID_PROFILE" };
    const decodedRuntime = decodeForgeRuntimeState(rawRuntimeState);
    if (!decodedRuntime.valid || !runtimeReferencesAllowed(decodedRuntime.value, this.allowlist)) return { ok: false, persisted: false, reason: "INVALID_RUNTIME" };
    if (profile.discoveredRecipeIds.length !== decodedRuntime.value.profile.discoveredRecipeIds.length
      || profile.discoveredRecipeIds.some((id, index) => id !== decodedRuntime.value.profile.discoveredRecipeIds[index])) {
      return { ok: false, persisted: false, reason: "PROFILE_RUNTIME_MISMATCH" };
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return { ok: false, persisted: false, reason: "STALE_WRITE" };
    }

    let currentBytes: string | null;
    try {
      currentBytes = this.storage.getItem(this.key);
    } catch {
      return { ok: false, persisted: false, reason: "READ_FAILED" };
    }
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
      currentRevision = outer.saveRevision;
    }
    if (currentRevision !== expectedRevision) return { ok: false, persisted: false, reason: "STALE_WRITE" };
    if (currentRevision === Number.MAX_SAFE_INTEGER) return { ok: false, persisted: false, reason: "REVISION_EXHAUSTED" };

    const envelope: SaveEnvelopeV1 = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      saveRevision: currentRevision + 1,
      profile,
      run: projectRuntimeState(decodedRuntime.value),
    };
    const bytes = serializeSaveEnvelope(envelope);
    try {
      this.storage.setItem(this.key, bytes);
    } catch {
      return { ok: false, persisted: false, reason: "WRITE_FAILED" };
    }
    return { ok: true, persisted: true, revision: envelope.saveRevision, bytes };
  }

  reset(rawStarter: unknown): SaveResetResult {
    const starter = decodeStarter(rawStarter, this.allowlist);
    if (!starter) return { ok: false, persisted: false, reason: "INVALID_RUNTIME" };
    const profile = createDefaultProfile();
    const runtimeState = hydrateStarter(starter, profile);
    const envelope: SaveEnvelopeV1 = {
      schemaVersion: SAVE_SCHEMA_VERSION,
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
        revision: 0,
        source: "SAVED",
        writeBlocked: false,
        issues: [],
      },
    };
  }

  remove(): SaveRemoveResult {
    try {
      this.storage.removeItem(this.key);
      return { ok: true };
    } catch {
      return { ok: false, reason: "REMOVE_FAILED" };
    }
  }
}
