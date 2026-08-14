import type { ForgeRuntimeStateV1 } from "../domain/forge-runtime";

export const FICTOR_SAVE_KEY = "fictor.save.v1" as const;
export const SAVE_SCHEMA_VERSION = 1 as const;
export const PROFILE_SCHEMA_VERSION = 1 as const;

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

export interface PersistenceAllowlist {
  allowedRecipeIds: readonly string[] | ReadonlySet<string>;
  allowedCardIds: readonly string[] | ReadonlySet<string>;
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
  saveRevision: number;
  profile: PersistentProfileV1;
  run: RunProjectionV1;
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
  | "REVISION_EXHAUSTED";

export type SaveWriteResult =
  | { ok: true; persisted: true; revision: number; bytes: string }
  | { ok: false; persisted: false; reason: SaveFailureCode };

export type SaveResetResult =
  | { ok: true; persisted: true; value: SaveLoadResult; bytes: string }
  | { ok: false; persisted: false; reason: "INVALID_RUNTIME" | "WRITE_FAILED" };

export type SaveRemoveResult =
  | { ok: true }
  | { ok: false; reason: "REMOVE_FAILED" };
