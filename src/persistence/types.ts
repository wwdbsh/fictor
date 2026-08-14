import {
  FORGE_RUNTIME_SOURCE_HASH,
  type ForgeRuntimeStateV1,
} from "../domain/forge-runtime";

export const FICTOR_SAVE_KEY = "fictor.save.v1" as const;
export const FICTOR_SAVE_V2_KEY = "fictor.save.v2" as const;
export const SAVE_SCHEMA_VERSION_V2 = 2 as const;
export const SAVE_SCHEMA_VERSION = 1 as const;
export const PROFILE_SCHEMA_VERSION = 1 as const;
export const SAVE_GENERATION_MAX_LENGTH = 128 as const;

export const HEART_IDS = [
  "heart__still",
  "heart__burn",
  "heart__scatter",
  "heart__rot",
  "heart__wash",
  "heart__join",
] as const;

export type HeartId = (typeof HEART_IDS)[number];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistenceCatalog {
  sourceHash: typeof FORGE_RUNTIME_SOURCE_HASH;
  allowedEnemyIds: readonly string[] | ReadonlySet<string>;
  allowedIntentIds: readonly string[] | ReadonlySet<string>;
  allowedDisplayTexts: readonly string[] | ReadonlySet<string>;
}

export interface PersistentProfileV1 {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  discoveredRecipeIds: string[];
  ownedHeartIds: HeartId[];
  featureFlags: {
    heartForge: false;
  };
}

export interface RunProjectionV1 {
  schemaVersion: ForgeRuntimeStateV1["schemaVersion"];
  engineVersion: ForgeRuntimeStateV1["engineVersion"];
  resolverVersion: ForgeRuntimeStateV1["resolverVersion"];
  sourceHash: ForgeRuntimeStateV1["sourceHash"];
  revision: number;
  run: ForgeRuntimeStateV1["run"];
}

export interface SaveEnvelopeV1 {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  saveGeneration: string;
  saveRevision: number;
  profile: PersistentProfileV1;
  run: RunProjectionV1;
}

export interface SaveEnvelopeV2<TFlow = unknown> {
  schemaVersion: typeof SAVE_SCHEMA_VERSION_V2;
  saveGeneration: string;
  saveRevision: number;
  profile: PersistentProfileV1;
  runtime: RunProjectionV1;
  flow: TFlow;
}

export type SaveLoadIssue =
  | "READ_FAILED"
  | "INVALID_JSON"
  | "INVALID_ENVELOPE"
  | "UNSUPPORTED_VERSION"
  | "INVALID_PROFILE"
  | "INVALID_RUN";

export interface SaveLoadResult {
  profile: PersistentProfileV1;
  runtimeState: ForgeRuntimeStateV1;
  generation: string | null;
  revision: number;
  source: "EMPTY" | "SAVED" | "RECOVERED" | "SAFE_INITIALIZED";
  writeBlocked: boolean;
  issues: SaveLoadIssue[];
}

export type SaveFailureCode =
  | "INVALID_PROFILE"
  | "INVALID_RUNTIME"
  | "PROFILE_RUNTIME_MISMATCH"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "WRITE_BLOCKED"
  | "STALE_WRITE"
  | "REVISION_EXHAUSTED"
  | "GENERATION_FAILED";

export type SaveWriteResult =
  | { ok: true; persisted: true; generation: string; revision: number; bytes: string }
  | { ok: false; persisted: false; reason: SaveFailureCode };

export type SaveResetResult =
  | { ok: true; persisted: true; value: SaveLoadResult; bytes: string }
  | { ok: false; persisted: false; reason: "INVALID_RUNTIME" | "READ_FAILED" | "WRITE_FAILED" | "GENERATION_FAILED" };

export type SaveGenerationFactory = () => string;
