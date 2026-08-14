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
  SAVE_GENERATION_MAX_LENGTH,
  SAVE_SCHEMA_VERSION,
  type HeartId,
  type PersistenceCatalog,
  type PersistentProfileV1,
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
const RECIPE_CARD_ENTRIES: Array<readonly [string, string]> = [];
for (let left = 0; left < MATERIAL_IDS.length; left += 1) {
  for (let right = left + 1; right < MATERIAL_IDS.length; right += 1) {
    const recipeId = `${MATERIAL_IDS[left]}|${MATERIAL_IDS[right]}`;
    RECIPE_CARD_ENTRIES.push([recipeId, `forge__${MATERIAL_IDS[left]}__${MATERIAL_IDS[right]}`]);
  }
}
const RECIPE_CARD_MAP = new Map(RECIPE_CARD_ENTRIES);
const FORGE_CARD_RECIPE_MAP = new Map(RECIPE_CARD_ENTRIES.map(([recipeId, cardId]) => [cardId, recipeId]));
const HEART_ID_SET = new Set<string>(HEART_IDS);
const MAX_RECIPE_COUNT = (MATERIAL_IDS.length * (MATERIAL_IDS.length - 1)) / 2;
const SAFE_INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_SAVE_GENERATION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

class SnapshotError extends Error {}

export interface PersistenceCatalogSnapshot {
  sourceHash: typeof FORGE_RUNTIME_SOURCE_HASH;
  allowedEnemyIds: ReadonlySet<string>;
  allowedIntentIds: ReadonlySet<string>;
  allowedDisplayTexts: ReadonlySet<string>;
}

export type ClassifiedDecode<T> =
  | { kind: "VALID"; value: T }
  | { kind: "INVALID" }
  | { kind: "UNSUPPORTED" };

function snapshotValue(value: unknown, ancestors: Set<object>): unknown {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new SnapshotError();
  if (typeof value === "number" && !Number.isFinite(value)) throw new SnapshotError();
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new SnapshotError();

  let prototype: object | null;
  let keys: (string | symbol)[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
  } catch {
    throw new SnapshotError();
  }
  const isArray = Array.isArray(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new SnapshotError();
  if (keys.some((key) => typeof key === "symbol")) throw new SnapshotError();
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of keys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new SnapshotError();
    }
    if (!descriptor || !("value" in descriptor)) throw new SnapshotError();
    descriptors.set(key, descriptor);
  }
  const next = new Set(ancestors).add(value);
  if (isArray) {
    const length = descriptors.get("length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || descriptors.size !== length + 1) throw new SnapshotError();
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors.get(String(index));
      if (!descriptor) throw new SnapshotError();
      result.push(snapshotValue(descriptor.value, next));
    }
    for (const key of descriptors.keys()) {
      if (key === "length") continue;
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) throw new SnapshotError();
    }
    return result;
  }
  const result: UnknownRecord = {};
  for (const [key, descriptor] of descriptors) result[key] = snapshotValue(descriptor.value, next);
  return result;
}

function snapshot(candidate: unknown): unknown | null {
  try {
    return snapshotValue(candidate, new Set());
  } catch {
    return null;
  }
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

function strictCollection(candidate: unknown, predicate: (value: string) => boolean): string[] {
  let values: unknown[];
  if (Array.isArray(candidate)) {
    const captured = snapshotValue(candidate, new Set());
    if (!Array.isArray(captured)) throw new SnapshotError();
    values = captured;
  } else {
    let prototype: object | null;
    try {
      prototype = Object.getPrototypeOf(candidate) as object | null;
      if (prototype !== Set.prototype || Reflect.ownKeys(candidate as object).length !== 0) throw new SnapshotError();
      values = [...Set.prototype.values.call(candidate as Set<unknown>)];
    } catch {
      throw new SnapshotError();
    }
  }
  if (!values.every((value) => typeof value === "string" && predicate(value))) throw new SnapshotError();
  if (new Set(values).size !== values.length) throw new SnapshotError();
  return values as string[];
}

function strictCatalogRecord(candidate: unknown): UnknownRecord {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) throw new SnapshotError();
  let prototype: object | null;
  let keys: (string | symbol)[];
  try {
    prototype = Object.getPrototypeOf(candidate) as object | null;
    keys = Reflect.ownKeys(candidate);
  } catch {
    throw new SnapshotError();
  }
  if (prototype !== Object.prototype && prototype !== null) throw new SnapshotError();
  const expected = ["sourceHash", "allowedEnemyIds", "allowedIntentIds", "allowedDisplayTexts"];
  if (keys.some((key) => typeof key === "symbol") || keys.length !== expected.length || !(keys as string[]).every((key) => expected.includes(key))) throw new SnapshotError();
  const result: UnknownRecord = {};
  for (const key of keys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(candidate, key);
    } catch {
      throw new SnapshotError();
    }
    if (!descriptor || !("value" in descriptor)) throw new SnapshotError();
    result[key] = descriptor.value;
  }
  return result;
}

export function snapshotPersistenceCatalog(candidate: PersistenceCatalog): PersistenceCatalogSnapshot {
  try {
    const record = strictCatalogRecord(candidate);
    if (record.sourceHash !== FORGE_RUNTIME_SOURCE_HASH) throw new SnapshotError();
    const allowedEnemyIds = strictCollection(record.allowedEnemyIds, (value) => SAFE_CATALOG_ID.test(value));
    const allowedIntentIds = strictCollection(record.allowedIntentIds, (value) => SAFE_CATALOG_ID.test(value));
    const allowedDisplayTexts = strictCollection(
      record.allowedDisplayTexts,
      (value) => value.length > 0 && value.length <= 128 && !value.includes("@") && !/[\u0000-\u001f\u007f]/.test(value),
    );
    return {
      sourceHash: FORGE_RUNTIME_SOURCE_HASH,
      allowedEnemyIds: new Set(allowedEnemyIds),
      allowedIntentIds: new Set(allowedIntentIds),
      allowedDisplayTexts: new Set(allowedDisplayTexts),
    };
  } catch {
    throw new TypeError("invalid persistence catalog");
  }
}

export function isCanonicalRecipeId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("|");
  return parts.length === 2 && parts[0] < parts[1] && MATERIAL_ID_SET.has(parts[0]) && MATERIAL_ID_SET.has(parts[1]);
}

export function canonicalRecipeCardEntries(): Array<readonly [recipeId: string, cardId: string]> {
  return RECIPE_CARD_ENTRIES.map(([recipeId, cardId]) => [recipeId, cardId] as const);
}

export function canonicalCardIdForRecipe(recipeId: string): string | null {
  return RECIPE_CARD_MAP.get(recipeId) ?? null;
}

export function canonicalRecipeIdForCard(cardId: string): string | null {
  return FORGE_CARD_RECIPE_MAP.get(cardId) ?? null;
}

export function isValidSaveGeneration(value: unknown): value is string {
  return typeof value === "string" && value.length <= SAVE_GENERATION_MAX_LENGTH && SAFE_SAVE_GENERATION.test(value);
}

export function createDefaultProfile(): PersistentProfileV1 {
  return { schemaVersion: PROFILE_SCHEMA_VERSION, discoveredRecipeIds: [], ownedHeartIds: [], featureFlags: { heartForge: false } };
}

export function classifyPersistentProfile(candidate: unknown): ClassifiedDecode<PersistentProfileV1> {
  const captured = snapshot(candidate);
  if (captured === null || typeof captured !== "object" || Array.isArray(captured)) return { kind: "INVALID" };
  if (!("schemaVersion" in captured)) return { kind: "INVALID" };
  if ((captured as UnknownRecord).schemaVersion !== PROFILE_SCHEMA_VERSION) return { kind: "UNSUPPORTED" };
  if (!exactRecord(captured, ["schemaVersion", "discoveredRecipeIds", "ownedHeartIds", "featureFlags"])) return { kind: "INVALID" };
  const profile = captured as UnknownRecord;
  if (!Array.isArray(profile.discoveredRecipeIds) || profile.discoveredRecipeIds.length > MAX_RECIPE_COUNT) return { kind: "INVALID" };
  if (!profile.discoveredRecipeIds.every((id: unknown) => typeof id === "string" && RECIPE_CARD_MAP.has(id))
    || !isSortedUnique(profile.discoveredRecipeIds as string[])) return { kind: "INVALID" };
  if (!Array.isArray(profile.ownedHeartIds)
    || !profile.ownedHeartIds.every((id: unknown) => typeof id === "string" && HEART_ID_SET.has(id))
    || !isSortedUnique(profile.ownedHeartIds as string[])) return { kind: "INVALID" };
  if (!exactRecord(profile.featureFlags, ["heartForge"]) || profile.featureFlags.heartForge !== false) return { kind: "INVALID" };
  return {
    kind: "VALID",
    value: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      discoveredRecipeIds: profile.discoveredRecipeIds as string[],
      ownedHeartIds: profile.ownedHeartIds as HeartId[],
      featureFlags: { heartForge: false },
    },
  };
}

export function decodePersistentProfile(candidate: unknown): PersistentProfileV1 | null {
  const classified = classifyPersistentProfile(candidate);
  return classified.kind === "VALID" ? classified.value : null;
}

export function projectRuntimeState(runtimeState: ForgeRuntimeStateV1): RunProjectionV1 {
  const decoded = decodeForgeRuntimeState(runtimeState);
  if (!decoded.valid) throw new TypeError("runtime state must be a valid ForgeRuntimeStateV1 snapshot");
  const state = decoded.value;
  return {
    schemaVersion: state.schemaVersion,
    engineVersion: state.engineVersion,
    resolverVersion: state.resolverVersion,
    sourceHash: state.sourceHash,
    revision: state.revision,
    run: state.run,
  };
}

function safeInstanceId(value: string): boolean {
  return SAFE_INSTANCE_ID.test(value);
}

export function runtimeReferencesAllowed(runtime: ForgeRuntimeStateV1, catalog: PersistenceCatalogSnapshot): boolean {
  if (runtime.sourceHash !== catalog.sourceHash) return false;
  if (runtime.profile.discoveredRecipeIds.some((id) => !RECIPE_CARD_MAP.has(id))) return false;
  const discoveries = new Set(runtime.profile.discoveredRecipeIds);
  const cardAllowed = (cardId: string): boolean => MATERIAL_ID_SET.has(cardId)
    || (FORGE_CARD_RECIPE_MAP.has(cardId) && discoveries.has(FORGE_CARD_RECIPE_MAP.get(cardId)!));
  if (runtime.run.ownedInstances.some((item) => !safeInstanceId(item.instanceId) || !cardAllowed(item.cardId))) return false;
  if (runtime.run.deck.some((id) => !safeInstanceId(id))) return false;
  const active = runtime.run.activeCombat;
  if (!active) return true;
  if (!catalog.allowedEnemyIds.has(active.state.enemy.enemyId)) return false;
  if (active.state.enemy.intents.some((intent) =>
    !catalog.allowedIntentIds.has(intent.intentId) || !catalog.allowedDisplayTexts.has(intent.labelKo),
  )) return false;
  if (active.state.cards.some((card) => !cardAllowed(card.cardId))) return false;
  if (active.state.instances.some((item) => !safeInstanceId(item.instanceId) || !cardAllowed(item.cardId))) return false;
  if ([active.state.zones.deck, active.state.zones.hand, active.state.zones.discard, active.state.zones.exile]
    .some((zone) => zone.some((id) => !safeInstanceId(id)))) return false;
  if (active.enrolledPersistentInstanceIds.some((id) => !safeInstanceId(id))) return false;
  if (active.isolatedMaterials.some((item) => !safeInstanceId(item.instance.instanceId) || !cardAllowed(item.instance.cardId))) return false;
  return active.ephemeralResults.every((item) => {
    const recipeId = FORGE_CARD_RECIPE_MAP.get(item.cardId);
    return safeInstanceId(item.instanceId) && recipeId === item.recipeId && discoveries.has(item.recipeId);
  });
}

export function classifyRunProjection(
  candidate: unknown,
  discoveredRecipeIds: readonly string[],
  catalog: PersistenceCatalogSnapshot,
): ClassifiedDecode<ForgeRuntimeStateV1> {
  const captured = snapshot(candidate);
  if (captured === null || typeof captured !== "object" || Array.isArray(captured)) return { kind: "INVALID" };
  const record = captured as UnknownRecord;
  const expectedVersions: UnknownRecord = {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
  };
  for (const [key, expected] of Object.entries(expectedVersions)) {
    if (key in record && record[key] !== expected) return { kind: "UNSUPPORTED" };
  }
  if (Object.keys(expectedVersions).some((key) => !(key in record))) return { kind: "INVALID" };
  if (!exactRecord(captured, ["schemaVersion", "engineVersion", "resolverVersion", "sourceHash", "revision", "run"])
    || !isSafeRevision(captured.revision)) return { kind: "INVALID" };
  const decoded = decodeForgeRuntimeState({
    schemaVersion: captured.schemaVersion,
    engineVersion: captured.engineVersion,
    resolverVersion: captured.resolverVersion,
    sourceHash: captured.sourceHash,
    revision: captured.revision,
    profile: { discoveredRecipeIds: [...discoveredRecipeIds] },
    run: captured.run,
  });
  return decoded.valid && runtimeReferencesAllowed(decoded.value, catalog)
    ? { kind: "VALID", value: decoded.value }
    : { kind: "INVALID" };
}

export function decodeRunProjection(candidate: unknown, discoveredRecipeIds: readonly string[], catalog: PersistenceCatalogSnapshot): ForgeRuntimeStateV1 | null {
  const classified = classifyRunProjection(candidate, discoveredRecipeIds, catalog);
  return classified.kind === "VALID" ? classified.value : null;
}

export function parseKnownEnvelope(candidate: unknown):
  | { kind: "KNOWN"; saveGeneration: string; saveRevision: number; profile: unknown; run: unknown }
  | { kind: "UNSUPPORTED" }
  | { kind: "INVALID" } {
  const captured = snapshot(candidate);
  if (captured === null || typeof captured !== "object" || Array.isArray(captured)) return { kind: "INVALID" };
  if ((captured as UnknownRecord).schemaVersion !== SAVE_SCHEMA_VERSION) return "schemaVersion" in captured ? { kind: "UNSUPPORTED" } : { kind: "INVALID" };
  if (!exactRecord(captured, ["schemaVersion", "saveGeneration", "saveRevision", "profile", "run"])
    || !isValidSaveGeneration(captured.saveGeneration)
    || !isSafeRevision(captured.saveRevision)) return { kind: "INVALID" };
  return {
    kind: "KNOWN",
    saveGeneration: captured.saveGeneration,
    saveRevision: captured.saveRevision,
    profile: captured.profile,
    run: captured.run,
  };
}

export function serializeSaveEnvelope(envelope: SaveEnvelopeV1): string {
  return JSON.stringify(envelope);
}
