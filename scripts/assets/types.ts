import type { BaseAttribute } from "../../src/data/schema/contracts";

export const ASSET_PLAN_VERSION = "core-v1" as const;
export const PAPER_TONES = ["CREAM", "OCHRE", "SCORCHED_BROWN", "BLUE_GREY"] as const;
export const ASPECT_RATIOS = ["3:4", "16:9"] as const;

export type PaperTone = (typeof PAPER_TONES)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type AssetCategory =
  | "MATERIAL"
  | "CANONICAL"
  | "HEART"
  | "HEART_FORGE"
  | "BACKGROUND"
  | "ENEMY"
  | "ELITE"
  | "EVENT";

export interface AssetPromptInputs {
  composition: string;
  colors: string[];
  density: string;
  paper: PaperTone;
  subject: string;
  representation?: string;
  material_inputs?: Array<{ material_id: string; representation: string }>;
  attribute?: BaseAttribute;
  secondary_attribute?: BaseAttribute;
  depth?: number;
  event_type?: string;
  shape?: string;
}

export interface PlannedAsset {
  id: string;
  category: AssetCategory;
  path: string;
  aspect_ratio: AspectRatio;
  prompt: string;
  prompt_inputs: AssetPromptInputs;
  source_art?: string;
}

export interface PlannedBatch {
  id: string;
  phase: "MATERIAL_APPROVAL" | "CORE_AFTER_APPROVAL";
  asset_ids: string[];
  retry_of: null;
}

export interface AssetPlanManifest {
  schema_version: 1;
  plan_version: typeof ASSET_PLAN_VERSION;
  model: "nano_banana_2";
  use_unlim: false;
  source_hashes: {
    materials: string;
    laws: string;
    result_classes: string;
    canonical_cards: string;
  };
  counts: {
    total: 1494;
    cards: 1420;
    world: 74;
    by_category: Record<AssetCategory, number>;
    boss_duplicates: 0;
  };
  batching: {
    provider_limit: 12;
    theoretical_global_batches: 125;
    initial_plan_batches: 126;
    material_gate_batches: 5;
    retry_batches_included: false;
  };
  budget: {
    unit_cost_decimal: "0.12";
    total_cost_decimal: "179.28";
  };
  approval_gate: {
    after_asset_count: 52;
    after_batch_id: "initial-005";
    requires_human_approval: true;
  };
  assets: PlannedAsset[];
  batches: PlannedBatch[];
}

export const BATCH_RUN_STATES = [
  "PLANNED",
  "SUBMITTING",
  "SUBMITTED",
  "REMOTE_SUCCEEDED",
  "REMOTE_FAILED",
  "BALANCE_AFTER_VERIFIED",
  "DOWNLOADING",
  "LOCAL_VERIFIED",
  "BACKING_UP",
  "BACKUP_VERIFIED",
  "COMPLETE",
  "RETRY_PENDING",
  "TERMINAL_FAILED",
  "AMBIGUOUS_SUBMISSION",
] as const;

export type BatchRunState = (typeof BATCH_RUN_STATES)[number];
export type AssetRecoveryState =
  | "PLANNED"
  | "DOWNLOADING"
  | "LOCAL_VERIFIED"
  | "BACKING_UP"
  | "COMPLETE";

export interface BatchAttempt {
  attempt: number;
  batch_id: string;
  idempotency_key: string;
  state: BatchRunState;
  job_id?: string;
  balance_before?: string;
  balance_after?: string;
  remote_assets?: Record<string, string>;
  error_code?: string;
}

export interface AssetRecoveryRecord {
  asset_id: string;
  state: AssetRecoveryState;
  remote_ref?: string;
  local_sha256?: string;
  backup_sha256?: string;
}

export interface BatchRunRecord {
  initial_batch_id: string;
  phase: PlannedBatch["phase"];
  state: BatchRunState;
  attempts: BatchAttempt[];
  assets: Record<string, AssetRecoveryRecord>;
  error_code?: string;
}

export interface RunLedger {
  schema_version: 1;
  plan_version: typeof ASSET_PLAN_VERSION;
  plan_sha256: string;
  run_id: string;
  batches: Record<string, BatchRunRecord>;
  successful: boolean;
}

export interface MaterialApprovalEvidence {
  schema_version: 1;
  plan_sha256: string;
  run_id: string;
  material_batch_ids: string[];
  material_asset_ids: string[];
  asset_hashes: Array<{ asset_id: string; local_sha256: string; backup_sha256: string }>;
  approved_by: string;
  approved_at: string;
  approval_reference: string;
  approved: true;
}

export interface ProviderBatchRequest {
  batch_id: string;
  model: "nano_banana_2";
  use_unlim: false;
  assets: PlannedAsset[];
}

export interface ProviderSubmission {
  job_id: string;
}

export type ProviderJobQuery =
  | { state: "PENDING" }
  | { state: "SUCCEEDED"; assets: Array<{ asset_id: string; remote_ref: string }> }
  | { state: "FAILED"; error_code: string };

export interface AssetProvider {
  readonly name: string;
  readonly supports_idempotency: boolean;
  balance(): Promise<string>;
  submitBatch(batch: ProviderBatchRequest, idempotencyKey: string): Promise<ProviderSubmission>;
  queryJob(jobId: string): Promise<ProviderJobQuery>;
  queryByIdempotencyKey?(idempotencyKey: string): Promise<ProviderSubmission | null>;
  download(remoteRef: string): Promise<Uint8Array>;
}
