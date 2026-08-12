import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_MAX_PNG_BYTES, verifyExistingPng } from "./filesystem";

export const T014_CONTRACT_SHA256 = "aa64fa1b7737c67ce3acca9587668ab996674e80faf27f119bee1d5a4f30da50" as const;
export const MATERIAL_STYLE_APPROVAL_PATH = "assets/manifests/material-style-approval-v1.json" as const;
export const T014_PLAN_PATH = "assets/manifests/materials-v1.plan.json" as const;
export const T014_PLAN_SHA256 = "22cc0b976501b6d2f9fc0df5d584e891c214ec0c4da4797ddcbf8b98c86b7611" as const;
export const T014_ACTUAL_EVIDENCE_PATH = "assets/evidence/t013-materials-actual-run-v1.json" as const;
export const T014_ACTUAL_EVIDENCE_SHA256 = "722937487ecf6d4248c1ce6aa0fdec44cd730b3ddfbc4ca3a008762d6812d610" as const;
export const T014_CONTACT_SHEET_PATH = "docs/asset-runs/contact-sheets/t013-materials-v1.html" as const;
export const T014_CONTACT_SHEET_SHA256 = "2334fac68feefddd2069625aa8e461f9525e3ba5733f34d72b2657f7bd8e0908" as const;
export const T014_MASTER_STYLE_PATH = "assets/manifests/master-style-v1.json" as const;
export const T014_MASTER_STYLE_SHA256 = "b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d" as const;
export const T014_EXACT_APPROVAL = "승인" as const;
export const T014_CONTROLLER_APPROVED_AT = "2026-08-12T01:34:36.573Z" as const;

const LOCAL_ROOT = "public/assets";
const BACKUP_ROOT = "assets/backups/t013-materials";

interface T013PlanAsset {
  index: number;
  id: string;
  path: string;
}

interface T013PlanBatch {
  id: string;
  asset_ids: string[];
  size: number;
}

interface T013Plan {
  assets?: T013PlanAsset[];
  batches?: T013PlanBatch[];
}

interface T013Recovery {
  asset_id: string;
  provider_job_index: number;
  recovery_source: string;
  local_relative_path: string;
  backup_relative_path: string;
  sha256: string;
  size_bytes: number;
  target_aspect_ratio: string;
  actual_width: number;
  actual_height: number;
  aspect_error_ppm: number;
  provider_native_unmodified: boolean;
}

interface T013ActualBatch {
  batch_id: string;
  submission?: { submitted_count?: number; failed_count?: number };
  recoveries?: T013Recovery[];
}

interface T013ActualEvidence {
  plan_sha256?: string;
  total_assets?: number;
  asset_order?: string[];
  batches?: T013ActualBatch[];
}

export interface MaterialStyleApprovalManifest {
  schema_version: 1;
  manifest_version: "material-style-approval-v1";
  decision: {
    decision_id: "T014_MATERIAL_STYLE_APPROVAL";
    issue_contract_sha256: typeof T014_CONTRACT_SHA256;
    state: "APPROVED_EXISTING_T013_52_ONLY";
    user_evidence: {
      exact_text_ko: typeof T014_EXACT_APPROVAL;
      controller_approved_at: typeof T014_CONTROLLER_APPROVED_AT;
      source: "current user conversation";
      sequence: "AFTER_FULL_SET_HANDOFF_AND_QA_DISCLOSURE";
    };
  };
  sources: {
    t013_plan: { path: typeof T014_PLAN_PATH; sha256: typeof T014_PLAN_SHA256 };
    t013_actual_run: { path: typeof T014_ACTUAL_EVIDENCE_PATH; sha256: typeof T014_ACTUAL_EVIDENCE_SHA256 };
    t013_contact_sheet: { path: typeof T014_CONTACT_SHEET_PATH; sha256: typeof T014_CONTACT_SHEET_SHA256 };
    master_style: { path: typeof T014_MASTER_STYLE_PATH; sha256: typeof T014_MASTER_STYLE_SHA256 };
  };
  review: {
    scope: "EXACT_T013_MATERIAL_IMAGE_BYTES";
    total: 52;
    reviewed: 52;
    approved: 52;
    pending: 0;
    rejected: 0;
    replacement_required: 0;
    assets: Array<{ index: number; id: string; path: string; image_sha256: string; status: "APPROVED" }>;
  };
  accepted_qa_flags: readonly [
    {
      flag_id: "TOOL_08_TEXT_LIKE_LABEL";
      asset_ids: readonly ["tool_08"];
      observation: "Readable text-like label appears on the specimen box front, violating the T013 No text prompt constraint.";
      disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY";
    },
    {
      flag_id: "ODD_01_MASTER_COMPOSITION_AND_JOINTED_LEG_LEAKAGE";
      asset_ids: readonly ["odd_01"];
      observation: "The required walking-kettle subject also strongly inherits the master's central composition and jointed-leg form and placement, so the MEDIA_ONLY non-copy boundary is not judged fully preserved for this asset.";
      disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY";
    },
    {
      flag_id: "GENERAL_STYLE_PAPER_3D_COLOR_DRIFT";
      asset_ids: readonly ["MULTIPLE_T013_MATERIALS"];
      observation: "Some images drift from line-led copperplate treatment toward smooth color and three-dimensional rendering, with background brightness and paper texture variation.";
      disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY";
    },
  ];
  future_policy: {
    existing_byte_acceptance_is_precedent: false;
    no_text_policy: "UNCHANGED_REQUIRED";
    media_only_non_copy_policy: "UNCHANGED_REQUIRED";
    prompt_policy: "UNCHANGED_REQUIRED";
    style_policy: "UNCHANGED_REQUIRED";
    replacement_or_new_bytes_require_new_revision_and_approval: true;
  };
  downstream: {
    canonical_bulk_style_gate: "GO";
    t015_dependency: "SATISFIED";
    t014_authorizes_provider_call: false;
    immediate_provider_call: "NOT_AUTHORIZED";
    t015_requires_selected_task_cycle: true;
    t015_execution_requirements: readonly [
      "FROZEN_RUN_PLAN",
      "CURRENT_COST_BALANCE_AND_PREFLIGHT",
      "CURRENT_PROVIDER_SCHEMA_MODEL_AND_BATCH_CONSTRAINTS",
      "BATCH_SIZE_AT_MOST_12",
      "USE_UNLIM_FALSE",
      "IMMEDIATE_LOCAL_AND_DISTINCT_BACKUP_RECOVERY",
    ];
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readPinned(repositoryRoot: string, path: string, expectedSha256: string): Buffer {
  const absolute = resolve(repositoryRoot, path);
  if (!existsSync(absolute)) throw new Error(`required T014 source is missing: ${path}`);
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== expectedSha256) throw new Error(`T014 source SHA mismatch: ${path}`);
  return bytes;
}

function assertExactSet(plan: T013Plan, actual: T013ActualEvidence, repositoryRoot: string) {
  const assets = plan.assets ?? [];
  const batches = plan.batches ?? [];
  const actualBatches = actual.batches ?? [];
  if (assets.length !== 52 || actual.total_assets !== 52 || batches.length !== 5 || actualBatches.length !== 5) {
    throw new Error("T014 requires the exact complete T013 52-image set");
  }
  if (actual.plan_sha256 !== T014_PLAN_SHA256) throw new Error("T014 actual evidence does not bind the pinned plan");
  const expectedIds = assets.map(({ id }) => id);
  if (new Set(expectedIds).size !== 52 || JSON.stringify(actual.asset_order) !== JSON.stringify(expectedIds)) {
    throw new Error("T014 T013 asset order is missing, duplicated, or changed");
  }
  assets.forEach((asset, index) => {
    if (asset.index !== index || !asset.id || asset.path !== `cards/${asset.id}.png`) {
      throw new Error(`T014 plan asset identity/path drift at index ${index}`);
    }
  });

  const recoveryByIndex = new Map<number, T013Recovery>();
  actualBatches.forEach((actualBatch, batchIndex) => {
    const plannedBatch = batches[batchIndex];
    if (!plannedBatch || actualBatch.batch_id !== plannedBatch.id || plannedBatch.size !== plannedBatch.asset_ids.length ||
        actualBatch.submission?.submitted_count !== plannedBatch.size || actualBatch.submission.failed_count !== 0) {
      throw new Error(`T014 T013 batch mismatch at index ${batchIndex}`);
    }
    const recoveries = actualBatch.recoveries ?? [];
    if (recoveries.length !== plannedBatch.size ||
        JSON.stringify([...recoveries.map(({ asset_id }) => asset_id)].sort()) !== JSON.stringify([...plannedBatch.asset_ids].sort())) {
      throw new Error(`T014 T013 recovery membership mismatch for ${plannedBatch.id}`);
    }
    for (const recovery of recoveries) {
      if (recoveryByIndex.has(recovery.provider_job_index)) throw new Error("T014 duplicate T013 recovery index");
      recoveryByIndex.set(recovery.provider_job_index, recovery);
    }
  });

  return assets.map((asset) => {
    const recovery = recoveryByIndex.get(asset.index);
    if (!recovery || recovery.asset_id !== asset.id || recovery.local_relative_path !== asset.path ||
        recovery.backup_relative_path !== asset.path || recovery.recovery_source !== "JOBS_HANDOFF_STDIN" ||
        recovery.provider_native_unmodified !== true || recovery.target_aspect_ratio !== "3:4" ||
        recovery.actual_width !== 896 || recovery.actual_height !== 1200 || recovery.aspect_error_ppm !== 4445 ||
        !/^[a-f0-9]{64}$/.test(recovery.sha256)) {
      throw new Error(`T014 T013 recovery mismatch at index ${asset.index}`);
    }
    const local = verifyExistingPng(resolve(repositoryRoot, LOCAL_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5_000);
    const backup = verifyExistingPng(resolve(repositoryRoot, BACKUP_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5_000);
    if (local.size !== recovery.size_bytes || backup.size !== recovery.size_bytes || local.width !== recovery.actual_width ||
        backup.width !== recovery.actual_width || local.height !== recovery.actual_height || backup.height !== recovery.actual_height ||
        local.aspect_error_ppm !== recovery.aspect_error_ppm || backup.aspect_error_ppm !== recovery.aspect_error_ppm) {
      throw new Error(`T014 T013 local/backup recovery bytes changed for ${asset.id}`);
    }
    return { index: asset.index, id: asset.id, path: asset.path, image_sha256: recovery.sha256, status: "APPROVED" as const };
  });
}

function buildUnchecked(repositoryRoot: string): MaterialStyleApprovalManifest {
  const plan = JSON.parse(readPinned(repositoryRoot, T014_PLAN_PATH, T014_PLAN_SHA256).toString("utf8")) as T013Plan;
  const actual = JSON.parse(readPinned(repositoryRoot, T014_ACTUAL_EVIDENCE_PATH, T014_ACTUAL_EVIDENCE_SHA256).toString("utf8")) as T013ActualEvidence;
  readPinned(repositoryRoot, T014_CONTACT_SHEET_PATH, T014_CONTACT_SHEET_SHA256);
  readPinned(repositoryRoot, T014_MASTER_STYLE_PATH, T014_MASTER_STYLE_SHA256);
  const assets = assertExactSet(plan, actual, repositoryRoot);
  return {
    schema_version: 1,
    manifest_version: "material-style-approval-v1",
    decision: {
      decision_id: "T014_MATERIAL_STYLE_APPROVAL",
      issue_contract_sha256: T014_CONTRACT_SHA256,
      state: "APPROVED_EXISTING_T013_52_ONLY",
      user_evidence: {
        exact_text_ko: T014_EXACT_APPROVAL,
        controller_approved_at: T014_CONTROLLER_APPROVED_AT,
        source: "current user conversation",
        sequence: "AFTER_FULL_SET_HANDOFF_AND_QA_DISCLOSURE",
      },
    },
    sources: {
      t013_plan: { path: T014_PLAN_PATH, sha256: T014_PLAN_SHA256 },
      t013_actual_run: { path: T014_ACTUAL_EVIDENCE_PATH, sha256: T014_ACTUAL_EVIDENCE_SHA256 },
      t013_contact_sheet: { path: T014_CONTACT_SHEET_PATH, sha256: T014_CONTACT_SHEET_SHA256 },
      master_style: { path: T014_MASTER_STYLE_PATH, sha256: T014_MASTER_STYLE_SHA256 },
    },
    review: { scope: "EXACT_T013_MATERIAL_IMAGE_BYTES", total: 52, reviewed: 52, approved: 52, pending: 0, rejected: 0, replacement_required: 0, assets },
    accepted_qa_flags: [
      {
        flag_id: "TOOL_08_TEXT_LIKE_LABEL",
        asset_ids: ["tool_08"],
        observation: "Readable text-like label appears on the specimen box front, violating the T013 No text prompt constraint.",
        disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY",
      },
      {
        flag_id: "ODD_01_MASTER_COMPOSITION_AND_JOINTED_LEG_LEAKAGE",
        asset_ids: ["odd_01"],
        observation: "The required walking-kettle subject also strongly inherits the master's central composition and jointed-leg form and placement, so the MEDIA_ONLY non-copy boundary is not judged fully preserved for this asset.",
        disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY",
      },
      {
        flag_id: "GENERAL_STYLE_PAPER_3D_COLOR_DRIFT",
        asset_ids: ["MULTIPLE_T013_MATERIALS"],
        observation: "Some images drift from line-led copperplate treatment toward smooth color and three-dimensional rendering, with background brightness and paper texture variation.",
        disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY",
      },
    ],
    future_policy: {
      existing_byte_acceptance_is_precedent: false,
      no_text_policy: "UNCHANGED_REQUIRED",
      media_only_non_copy_policy: "UNCHANGED_REQUIRED",
      prompt_policy: "UNCHANGED_REQUIRED",
      style_policy: "UNCHANGED_REQUIRED",
      replacement_or_new_bytes_require_new_revision_and_approval: true,
    },
    downstream: {
      canonical_bulk_style_gate: "GO",
      t015_dependency: "SATISFIED",
      t014_authorizes_provider_call: false,
      immediate_provider_call: "NOT_AUTHORIZED",
      t015_requires_selected_task_cycle: true,
      t015_execution_requirements: [
        "FROZEN_RUN_PLAN",
        "CURRENT_COST_BALANCE_AND_PREFLIGHT",
        "CURRENT_PROVIDER_SCHEMA_MODEL_AND_BATCH_CONSTRAINTS",
        "BATCH_SIZE_AT_MOST_12",
        "USE_UNLIM_FALSE",
        "IMMEDIATE_LOCAL_AND_DISTINCT_BACKUP_RECOVERY",
      ],
    },
  };
}

export function buildMaterialStyleApprovalManifest(repositoryRoot: string): MaterialStyleApprovalManifest {
  return buildUnchecked(repositoryRoot);
}

export function validateMaterialStyleApprovalManifest(manifest: MaterialStyleApprovalManifest, repositoryRoot: string): void {
  if (JSON.stringify(manifest) !== JSON.stringify(buildUnchecked(repositoryRoot))) {
    throw new Error("material-style-approval-v1 changed from the approved T014 decision");
  }
}

export function renderMaterialStyleApprovalManifest(manifest: MaterialStyleApprovalManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function materialStyleApprovalSha256(manifest: MaterialStyleApprovalManifest): string {
  return sha256(renderMaterialStyleApprovalManifest(manifest));
}
