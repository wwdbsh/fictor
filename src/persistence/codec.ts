import {
  decodeForgeRuntimeState,
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  type ForgeRuntimeStateV1,
} from "../domain/forge-runtime";
import {
  HEART_IDS,
  PROFILE_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  type HeartId,
  type PersistentProfileV1,
  type PersistenceAllowlist,
  type RunProjectionV1,
  type SaveEnvelopeV1,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const MATERIAL_IDS = [
  ...["still", "burn", "scatter", "rot", "wash", "join"].map((attribute) => `ore_${attribute}`),
  ...["still", "burn", "scat", "rot", "wash", "join"].flatMap((attribute) =>
    Array.from({ length: 5 }, (_, index) => `${attribute}_${String(index + 1).padStart(2, "0")}`),
  ),
  ...Array.from({ length: 10 }, (_, index) => `tool_${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `odd_${String(index + 1).padStart(2, "0")}`),
].sort();
const MATERIAL_ID_SET = new Set(MATERIAL_IDS);
const HEART_ID_SET = new Set<string>(HEART_IDS);
const MAX_RECIPE_COUNT = (MATERIAL_IDS.length * (MATERIAL_IDS.length - 1)) / 2;

export interface PersistenceAllowlistSnapshot {
  allowedRecipeIds: ReadonlySet<string>;
  allowedCardIds: ReadonlySet<string>;
}

function snapshotStringCollection(candidate: readonly string[] | ReadonlySet<string>, location: string): string[] {
  let values: unknown[];
  if (Array.isArray(candidate)) {
    if (Object.getPrototypeOf(candidate) !== Array.prototype) throw new TypeError(`${location} must be a plain array or Set`);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key === "symbol")) throw new TypeError(`${location} has symbol keys`);
    if (Object.keys(descriptors).length !== candidate.length + 1) throw new TypeError(`${location} must be dense data`);
    values = Array.from({ length: candidate.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor)) throw new TypeError(`${location} must contain own data values`);
      return descriptor.value;
    });
  } else {
    if (Object.getPrototypeOf(candidate) !== Set.prototype) throw new TypeError(`${location} must be a plain array or Set`);
    try {
      values = [...Set.prototype.values.call(candidate as Set<unknown>)];
    } catch {
      throw new TypeError(`${location} cannot be inspected safely`);
    }
  }
  if (!values.every((value) => typeof value === "string" && value.length > 0)) throw new TypeError(`${location} must contain nonempty strings`);
  if (new Set(values).size !== values.length) throw new TypeError(`${location} must contain unique strings`);
  return values as string[];
}

export function snapshotPersistenceAllowlist(candidate: PersistenceAllowlist): PersistenceAllowlistSnapshot {
  if (!exactRecord(candidate, ["allowedRecipeIds", "allowedCardIds"])) throw new TypeError("persistence allowlist must contain exactly recipe and card ids");
  const allowedRecipeIds = snapshotStringCollection(candidate.allowedRecipeIds, "allowedRecipeIds");
  const allowedCardIds = snapshotStringCollection(candidate.allowedCardIds, "allowedCardIds");
  if (allowedRecipeIds.length > MAX_RECIPE_COUNT || !allowedRecipeIds.every(isCanonicalRecipeId)) {
    throw new TypeError("allowedRecipeIds contains a noncanonical recipe");
  }
  return {
    allowedRecipeIds: new Set(allowedRecipeIds),
    allowedCardIds: new Set(allowedCardIds),
  };
}

function exactRecord(value: unknown, keys: readonly string[]): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isSafeRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}

export function isCanonicalRecipeId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("|");
  return parts.length === 2
    && parts[0] < parts[1]
    && MATERIAL_ID_SET.has(parts[0])
    && MATERIAL_ID_SET.has(parts[1]);
}

export function createDefaultProfile(): PersistentProfileV1 {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    discoveredRecipeIds: [],
    ownedHeartIds: [],
    featureFlags: { heartForge: false },
  };
}

export function decodePersistentProfile(candidate: unknown, allowedRecipeIds: ReadonlySet<string>): PersistentProfileV1 | null {
  if (!exactRecord(candidate, ["schemaVersion", "discoveredRecipeIds", "ownedHeartIds", "featureFlags"])) return null;
  if (candidate.schemaVersion !== PROFILE_SCHEMA_VERSION) return null;
  if (!Array.isArray(candidate.discoveredRecipeIds) || candidate.discoveredRecipeIds.length > MAX_RECIPE_COUNT) return null;
  if (!candidate.discoveredRecipeIds.every((id) => isCanonicalRecipeId(id) && allowedRecipeIds.has(id)) || !isSortedUnique(candidate.discoveredRecipeIds)) return null;
  if (!Array.isArray(candidate.ownedHeartIds) || !candidate.ownedHeartIds.every((id) => typeof id === "string" && HEART_ID_SET.has(id))) return null;
  if (!isSortedUnique(candidate.ownedHeartIds)) return null;
  if (!exactRecord(candidate.featureFlags, ["heartForge"]) || candidate.featureFlags.heartForge !== false) return null;
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    discoveredRecipeIds: [...candidate.discoveredRecipeIds],
    ownedHeartIds: [...candidate.ownedHeartIds] as HeartId[],
    featureFlags: { heartForge: false },
  };
}

export function projectRuntimeState(runtimeState: ForgeRuntimeStateV1): RunProjectionV1 {
  const decoded = decodeForgeRuntimeState(runtimeState);
  if (!decoded.valid) throw new TypeError("runtime state must be a valid ForgeRuntimeStateV1 snapshot");
  const snapshot = decoded.value;
  return {
    schemaVersion: snapshot.schemaVersion,
    engineVersion: snapshot.engineVersion,
    resolverVersion: snapshot.resolverVersion,
    sourceHash: snapshot.sourceHash,
    revision: snapshot.revision,
    run: snapshot.run,
  };
}

export function decodeRunProjection(
  candidate: unknown,
  discoveredRecipeIds: readonly string[],
  allowlist: PersistenceAllowlistSnapshot,
): ForgeRuntimeStateV1 | null {
  if (!exactRecord(candidate, ["schemaVersion", "engineVersion", "resolverVersion", "sourceHash", "revision", "run"])) return null;
  if (candidate.schemaVersion !== FORGE_RUNTIME_SCHEMA_VERSION
    || candidate.engineVersion !== FORGE_RUNTIME_ENGINE_VERSION
    || candidate.resolverVersion !== FORGE_RUNTIME_RESOLVER_VERSION
    || candidate.sourceHash !== FORGE_RUNTIME_SOURCE_HASH
    || !isSafeRevision(candidate.revision)) return null;
  const decoded = decodeForgeRuntimeState({
    schemaVersion: candidate.schemaVersion,
    engineVersion: candidate.engineVersion,
    resolverVersion: candidate.resolverVersion,
    sourceHash: candidate.sourceHash,
    revision: candidate.revision,
    profile: { discoveredRecipeIds: [...discoveredRecipeIds] },
    run: candidate.run,
  });
  return decoded.valid && runtimeReferencesAllowed(decoded.value, allowlist) ? decoded.value : null;
}

export function runtimeReferencesAllowed(runtime: ForgeRuntimeStateV1, allowlist: PersistenceAllowlistSnapshot): boolean {
  if (runtime.profile.discoveredRecipeIds.some((id) => !allowlist.allowedRecipeIds.has(id))) return false;
  if (runtime.run.ownedInstances.some((instance) => !allowlist.allowedCardIds.has(instance.cardId))) return false;
  const active = runtime.run.activeCombat;
  if (!active) return true;
  if (active.state.cards.some((card) => !allowlist.allowedCardIds.has(card.cardId))) return false;
  if (active.state.instances.some((instance) => !allowlist.allowedCardIds.has(instance.cardId))) return false;
  if (active.isolatedMaterials.some((item) => !allowlist.allowedCardIds.has(item.instance.cardId))) return false;
  return active.ephemeralResults.every((item) =>
    allowlist.allowedCardIds.has(item.cardId) && allowlist.allowedRecipeIds.has(item.recipeId),
  );
}

export function parseKnownEnvelope(candidate: unknown):
  | { kind: "KNOWN"; saveRevision: number; profile: unknown; run: unknown }
  | { kind: "UNSUPPORTED" }
  | { kind: "INVALID" } {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return { kind: "INVALID" };
  if (!("schemaVersion" in candidate)) return { kind: "INVALID" };
  if ((candidate as UnknownRecord).schemaVersion !== SAVE_SCHEMA_VERSION) return { kind: "UNSUPPORTED" };
  if (!exactRecord(candidate, ["schemaVersion", "saveRevision", "profile", "run"])) return { kind: "INVALID" };
  const envelope = candidate as UnknownRecord;
  if (!isSafeRevision(envelope.saveRevision)) return { kind: "INVALID" };
  return { kind: "KNOWN", saveRevision: envelope.saveRevision, profile: envelope.profile, run: envelope.run };
}

export function serializeSaveEnvelope(envelope: SaveEnvelopeV1): string {
  return JSON.stringify(envelope);
}
