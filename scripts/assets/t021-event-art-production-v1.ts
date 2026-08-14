import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AspectRatio } from "./types";
import {
  T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256, T020_MASTER_REFERENCE_ID, T020_MASTER_REFERENCE_JOB_ID, T020_MASTER_REFERENCE_SHA256,
  T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256, T020_REFERENCE_INSTRUCTION, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256,
  T020_V1_BATCH_MAX, T020_V1_EXPECTED_MODEL, T020_V1_REQUESTED_MODEL, T020_V1_UNIT_COST_UNITS,
  canonicalJsonT020, decimalT020, readPinnedT020, readRegularT020, renderT020CanonicalJson, sha256T020,
} from "./t020-world-art-production-v1";

/* Shared primitives keep their T020 names; T021 re-exports them under neutral aliases so its
   own modules read in one vocabulary without duplicating any audited implementation. */
export const sha256T021 = sha256T020;
export const canonicalJsonT021 = canonicalJsonT020;
export const renderT021CanonicalJson = renderT020CanonicalJson;
export const decimalT021 = decimalT020;
export const readRegularT021 = readRegularT020;
export const readPinnedT021 = readPinnedT020;

/* T021 event art: 20 EVENT assets, 2 batches, 30.00 credit hard cap, clean start. */

export const T021_ISSUE_NUMBER = 23 as const;
export const T021_CONTRACT_SHA256 = "9f83f23ac3872814a96819771f9b23a98082899b7488f86c662a388d9f61186f" as const;

/* ------------------------------------------------------------------ paths */

export const T021_V1_PLAN_PATH = "assets/manifests/t021-event-art-v1.plan.json" as const;
export const T021_V1_BINDING_PATH = "assets/evidence/t021-event-art-implementation-binding-v1.json" as const;
export const T021_V1_RISK_PATH = "assets/evidence/t021-event-art-risk-disclosure-v1.json" as const;
export const T021_V1_SCHEMA_PATH = "assets/evidence/t021-event-art-higgsfield-schema-v1.json" as const;
export const T021_V1_FORENSICS_PATH = "assets/evidence/t021-event-art-forensics-v1.json" as const;
export const T021_V1_PENDING_PATH = "assets/evidence/t021-event-art-disclosure-presentation-v1.pending.json" as const;
export const T021_V1_PRESENTATION_PATH = "assets/evidence/t021-event-art-disclosure-presentation-v1.json" as const;
export const T021_V1_APPROVAL_PATH = "assets/evidence/t021-event-art-approval-v1.json" as const;
export const T021_V1_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t021-event-art-controller-disclosure-attestation-v1.json" as const;
export const T021_V1_CONTROLLER_APPROVAL_PATH = "assets/evidence/t021-event-art-controller-approval-attestation-v1.json" as const;
export const T021_V1_JOURNAL_PATH = "assets/runs/t021-event-art/operations-v1.json" as const;
export const T021_V1_LOCK_PATH = "assets/runs/t021-event-art/operations-v1.lock" as const;
export const T021_V1_LOCAL_ROOT = "public/assets" as const;
export const T021_V1_BACKUP_ROOT = "assets/backups/t021-event-art" as const;
/**
 * Carry-over fix from T020 v2: the index links are built from this same constant as the
 * segment files, so they can never point at another version's directory. v2 hardcoded a v1
 * path in the link template while writing segments to a v2 directory, producing an index of
 * broken links that could not be corrected in place without invalidating a completed run.
 */
export const T021_V1_CONTACT_SEGMENT_DIR = "t021-event-art-v1" as const;
export const T021_V1_CONTACT_ROOT = "docs/asset-runs/contact-sheets" as const;
export const T021_V1_CONTACT_SEGMENT_ROOT = `${T021_V1_CONTACT_ROOT}/${T021_V1_CONTACT_SEGMENT_DIR}` as const;
export const T021_V1_CONTACT_INDEX_PATH = `${T021_V1_CONTACT_ROOT}/${T021_V1_CONTACT_SEGMENT_DIR}.html` as const;

export { T020_CORE_PLAN_PATH as T021_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256 as T021_CORE_PLAN_SHA256 };

/* --------------------------------------------------------------- economics */

export const T021_V1_ASSET_COUNT = 20 as const;
export const T021_V1_BATCH_COUNT = 2 as const;
export const T021_V1_BATCH_SIZES = [12, 8] as const;
export const T021_V1_BATCH_MAX = T020_V1_BATCH_MAX;
export const T021_V1_UNIT_COST_UNITS = T020_V1_UNIT_COST_UNITS;
export const T021_V1_TOTAL_CAP_UNITS = 3_000 as const;
export const T021_V1_MAX_BATCH_EXPOSURE_UNITS = 1_800 as const;
export const T021_V1_EXPECTED_MODEL = T020_V1_EXPECTED_MODEL;
export const T021_V1_REQUESTED_MODEL = T020_V1_REQUESTED_MODEL;
export const T021_V1_CANARY_BATCH_ID = "event-art-001" as const;
export const T021_V1_CANARY_BLOCKED_BATCH_ID = "event-art-002" as const;
export const T021_V1_CREDIT_EXPIRY_DATE = "2026-08-17" as const;

/**
 * Cumulative budget context, which Issue #23 requires the run to report rather than assume.
 *
 * The headroom after T021 is 3.90 — not a typo, and the reason this is a plan field rather
 * than a footnote. A single lost batch here (up to 18.00) would leave the rest of the plan
 * short, so T021 cannot be treated as a task whose losses are locally absorbed.
 */
export const T021_V1_BALANCE_AT_DISCLOSURE_UNITS = 28_290 as const;
export const T021_V1_REMAINING_PLAN_AFTER_T021_UNITS = 24_900 as const;
export const T021_V1_REMAINING_PLAN_BREAKDOWN = [
  { task: "T019", credit_units: 900, credit_decimal: "9.00" },
  { task: "T016", credit_units: 24_000, credit_decimal: "240.00" },
] as const;

/* -------------------------------------------------------------- tolerance */

/**
 * T021 declares exactly one aspect: 3:4 at 5000 ppm.
 *
 * T020's 16:9 tolerance of 12500 is deliberately NOT declared here. It exists only to clear
 * the provider's 32-px grid at 16:9, where the worst case near 1MP is about 11364 ppm. An
 * entry that is unreachable by design still invites a later reader to assume 16:9 is
 * acceptable in this task; an absent entry cannot leak, and the lookup below throws loudly on
 * anything undeclared. The plan selector already refuses a non-3:4 EVENT asset outright, so
 * this is the second of two independent refusals rather than the only one.
 *
 * 3:4's own delivered geometry is the same grid artifact: 896x1200 measures 4445 ppm off
 * exact, comfortably inside 5000. Known, observed, and not a reason to widen anything.
 */
export const T021_V1_ASPECT_TOLERANCE_PPM: Readonly<Partial<Record<AspectRatio, number>>> = { "3:4": 5_000 };
export function t021AspectTolerancePpm(aspect: AspectRatio): number {
  const tolerance = T021_V1_ASPECT_TOLERANCE_PPM[aspect];
  if (tolerance === undefined) throw new Error(`T021 has no declared tolerance for aspect ${aspect}`);
  return tolerance;
}
export const T021_V1_GRID_PX = 32 as const;
export const T021_V1_ASPECT_EXPECTATION = {
  criterion: "RATIO_ONLY_NO_ABSOLUTE_DIMENSION_REQUIREMENT",
  tolerance_ppm_by_aspect: { "3:4": 5_000 },
  declared_aspects: ["3:4"], undeclared_aspect_throws: true,
  provider_dimension_grid_px: T021_V1_GRID_PX,
  resolution: "1k",
  aspects_in_this_task: ["3:4"],
  observed_3_4: { width: 896, height: 1200, aspect_error_ppm: 4_445, source: "T015 and T020 deliveries", provider_validated: true },
  t020_16_9_tolerance_deliberately_not_declared_here: { tolerance_ppm: 12_500, reason: "16:9-SPECIFIC_GRID_ALLOWANCE_MUST_NOT_LEAK_INTO_3_4" },
  out_of_tolerance_terminal_code: "ASPECT_MISMATCH",
  out_of_tolerance_blocks_all_later_batches: true,
} as const;

/* ---------------------------------------------------------------- prompts */

export const T021_REFERENCE_INSTRUCTION = T020_REFERENCE_INSTRUCTION;
export const T021_NO_COPY_BOUNDARY = "MEDIA_ONLY no-copy boundary: preserve only the approved copperplate line treatment; derive this event asset's subject, geometry, pose, composition, whitespace, attribute colors, paper tone, density, representation, and aspect from the core event prompt, never from the reference subject. Event plates are 3:4 specimen studies; the reference image's own aspect is never inherited." as const;
export const T021_MASTER_REFERENCE_JOB_ID = T020_MASTER_REFERENCE_JOB_ID;
export const T021_MASTER_REFERENCE_SHA256 = T020_MASTER_REFERENCE_SHA256;
export const T021_MASTER_REFERENCE_ID = T020_MASTER_REFERENCE_ID;

/* ---------------------------------------------------------------- phrases */

export const T021_V1_EXACT_APPROVAL_PHRASE = "T021 이벤트 세계 아트 20장 생성을 승인한다. 한도 30.00 크레딧." as const;
export const T021_V1_RECOVERY_OPERATOR_PHRASE = "T021 이 배치의 확정 job ID만 복구하고 새 유료 제출은 하지 않습니다." as const;
export const T021_V1_RESUME_OPERATOR_PHRASE = "T021 실패한 배치를 재제출하지 않고 다음 배치만 진행합니다." as const;
export const T021_V1_LOSS_ACKNOWLEDGMENT_PHRASE = "T021 이 배치의 손실을 확인했고 재제출 없이 손실을 상한에서 차감한 뒤 남은 배치만 진행합니다." as const;

export const T021_V1_RISK_TEXT = `T021은 이벤트 세계 아트 정확히 20장을 2개 배치([12,8])로 배치당 단 한 번씩 유료 생성합니다. 상한은 정확히 30.00 credits(정확 단가 1.50 x 20장)이고 자동 유료 재시도 예산은 0이며, T015/T020 승인은 하나도 상속되지 않습니다.
(i) 범위 - 6개 이벤트 유형(cache, workshop, collapse, fictor, record, oddity) 기본 6장과 주요 터 변주 14장(cache 6터, oddity 6터, collapse 2터)을 합쳐 20장입니다. 전부 3:4이고 ${T021_V1_LOCAL_ROOT}/events/에 저장되며 같은 상대 경로로 ${T021_V1_BACKUP_ROOT} 아래에 백업됩니다. 이벤트 36변주 전체, 이벤트 런타임 구현, style 재결정, manifest ID 변경은 범위 밖입니다.
(ii) 종횡비 위험은 이번에 해소된 상태입니다 - T020에서 provider가 출력 크기를 32픽셀 격자에 맞춘다는 사실이 실증되었습니다. 이 실행의 20장은 전부 3:4이고, 3:4의 실제 전달값 896x1200은 정확한 3:4 대비 4445ppm으로 같은 격자 현상이지만 허용치 5000ppm 안쪽입니다. 이미 관찰된 값이고 허용 범위 안이므로 허용치를 넓힐 이유가 없습니다. T020에서 16:9에 적용했던 12500ppm은 16:9 전용 완화이므로 T021에는 아예 선언하지 않습니다. 즉 이 실행에서 3:4가 아닌 전달물은 어떤 값이든 통과하지 못합니다. 다만 provider가 크기 정책을 바꾸면 여전히 ASPECT_MISMATCH로 정지하며, 그 배치의 지출은 회수되지 않습니다.
(iii) 남는 실질 위험은 두 가지입니다. 첫째, 배치마다 제출 응답을 잃을 수 있는 모호 제출 구간이 정확히 1회씩 총 2회 있습니다. 각 구간에서 최대 18.00 credits(12장 x 1.50)가 실제로 차감되고도 응답을 받지 못하면 그 배치의 job ID를 전혀 열거할 수 없어 이미 지불한 이미지를 영구히 회수하지 못할 수 있습니다. 둘째, credits는 2026-08-17에 만료됩니다. 정확한 만료 시각은 알 수 없습니다.
(iv) 누적 예산 - 현재 잔액은 282.90입니다. T021이 상한까지 쓰면 252.90이 남고, 남은 계획은 T019 9.00과 T016 240.00을 합쳐 249.00입니다. 여유는 3.90뿐입니다. 따라서 이 실행에서 배치 하나를 손실로 확정하면(최대 18.00) 남은 계획을 그대로 수행할 수 없습니다. 구체적으로는 T016의 범위를 줄여야 하며, 잃은 1.50마다 canonical 카드 약 1장씩 줄어듭니다. 예를 들어 18.00을 잃으면 T016은 계획한 160장이 아니라 그보다 적은 수로 다시 잡아야 합니다. T021의 손실은 T021 안에서 흡수되지 않으므로, 손실이 발생하면 남은 계획의 범위를 다시 논의해야 합니다.
(v) 각 배치는 단 한 번만 제출합니다. 유료 envelope이 한 번이라도 밖으로 나간 배치는 모호 제출이든 부분 응답이든 즉시 fail-stop하고 어떤 경우에도 재제출하지 않습니다. fail-stop은 배치 단위이며, 지출이 0인 배치(유료 envelope 이전 단계 실패)만 되돌려 재실행할 수 있습니다. 지출이 발생한 배치는 operator가 정확히 “${T021_V1_LOSS_ACKNOWLEDGMENT_PHRASE}”로 손실을 확인해야만 다음 배치가 열리고, 확인된 손실은 30.00 상한에서 그대로 차감됩니다.
(vi) 과금은 provider가 보고하는 credits_exact(1.50)만 사용합니다. 화면 표시값 credits(1.00)는 기록만 하고 상한 계산에 절대 쓰지 않습니다.
(vii) 모델 canary는 모든 배치에 적용됩니다. 완료된 job의 provider-reported model이 ${T021_V1_EXPECTED_MODEL}가 아니면 그 배치는 즉시 정지하고 다음 배치는 직전 배치가 모델 확인을 통과할 때까지 열리지 않습니다. MODEL_DRIFT와 ASPECT_MISMATCH는 provider 계약 드리프트로 취급되어 한 번이라도 관찰되면 이후 모든 배치가 영구히 열리지 않으며, 손실 확인과 재개 문구로도 열 수 없습니다.
(viii) 승인 증거의 한계는 이전과 같습니다. operator 문구와 승인 attestation 파일은 모두 agent가 쓸 수 있고 “정확한 사용자 발화”는 코드 상수에서 나옵니다. 실제 인적 게이트는 절차적이며, 사용자가 이 고지를 본 뒤 이 세션에서 정확한 승인 문구를 직접 입력해야 하고 그 사실은 파일이 아니라 대화 기록으로만 확인됩니다.
(ix) 모든 요청은 use_unlim:false를 문자 그대로 포함하며 이 값은 각 자산의 canonical_request_sha256 안에 고정되어 있습니다. 저장은 provider가 준 바이트 그대로이고 crop이나 resize는 하지 않으며, 로컬과 백업 두 사본의 sha256이 저장 직후 일치해야 합니다.
signed URL, redirect URL, host, provider raw error는 journal, evidence, stdout 어디에도 기록하지 않습니다. 승인은 정확히 “${T021_V1_EXACT_APPROVAL_PHRASE}”라는 문구로만 기록합니다.` as const;

/* --------------------------------------------------------------- binding */

export const T021_V1_RUNTIME_FILES = {
  controller: "scripts/assets/t021-event-art-production-v1-controller.ts",
  preparation: "scripts/assets/t021-event-art-production-v1-cli.ts",
  production: "scripts/assets/t021-event-art-production-v1-ops.ts",
  contract: "scripts/assets/t021-event-art-production-v1.ts",
  provider_transport: "scripts/assets/provider-transport.ts",
  t020_contract: "scripts/assets/t020-world-art-production-v1.ts",
  t020_production: "scripts/assets/t020-world-art-production-v1-ops.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
} as const;

export interface T021Binding { schema_version: 1; manifest_version: "t021-event-art-implementation-binding-v1"; issue_number: typeof T021_ISSUE_NUMBER; issue_contract_sha256: typeof T021_CONTRACT_SHA256; files: Record<keyof typeof T021_V1_RUNTIME_FILES, { path: string; sha256: string }> }
export function buildT021Binding(root: string): T021Binding {
  return {
    schema_version: 1, manifest_version: "t021-event-art-implementation-binding-v1", issue_number: T021_ISSUE_NUMBER, issue_contract_sha256: T021_CONTRACT_SHA256,
    files: Object.fromEntries(Object.entries(T021_V1_RUNTIME_FILES).map(([key, path]) => [key, { path, sha256: sha256T021(readRegularT021(root, path)) }])) as T021Binding["files"],
  };
}
export function loadT021Binding(root: string): T021Binding {
  const bytes = readRegularT021(root, T021_V1_BINDING_PATH).toString("utf8");
  const value = JSON.parse(bytes) as T021Binding;
  if (bytes !== renderT021CanonicalJson(value) || canonicalJsonT021(value) !== canonicalJsonT021(buildT021Binding(root))) throw new Error("T021 implementation binding changed");
  return value;
}

/* -------------------------------------------------------------- forensics */

export type T021Forensics = ReturnType<typeof buildT021Forensics>;
export function buildT021Forensics(root: string) {
  return {
    schema_version: 1, evidence_version: "t021-event-art-forensics-v1", secret_free: true,
    immutable_sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: sha256T021(readPinnedT021(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256)) },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: sha256T021(readPinnedT021(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256)) },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: sha256T021(readPinnedT021(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256)) },
    },
    observed: {
      prior_paid_spend_units: 0, prior_journal_present: false, legacy_recovery_present: false,
      aspect_3_4_provider_validated: true, aspect_3_4_observed: "896x1200", aspect_3_4_observed_error_ppm: 4_445,
      provider_dimension_grid_px: T021_V1_GRID_PX, declared_aspects: ["3:4"], paid_retry_count: 0,
    },
    policy: {
      paid_resubmit_allowed: false, automatic_paid_retry_allowed: false, batch_scoped_fail_stop: true,
      operator_gated_resume_never_resubmits: true, aspect_homogeneous_batches: true,
      event_variant_expansion_allowed: false, style_redecision_allowed: false, manifest_id_change_allowed: false,
      prior_task_approval_inherited: false,
    },
  } as const;
}

/* ----------------------------------------------------------- risk / schema */

export function t021ApprovalScope() {
  return {
    task_key: "T021", category: "EVENT", asset_count: T021_V1_ASSET_COUNT,
    base_type_count: 6, variant_count: 14, aspect_ratio: "3:4",
    batch_count: T021_V1_BATCH_COUNT, batch_sizes: [...T021_V1_BATCH_SIZES], batch_max: T021_V1_BATCH_MAX, aspect_homogeneous_batches: true,
    unit_cost_decimal: decimalT021(T021_V1_UNIT_COST_UNITS), unit_cost_units: T021_V1_UNIT_COST_UNITS,
    total_credit_cap_decimal: decimalT021(T021_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS,
    legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00", automatic_paid_retry_count: 0,
    max_batch_exposure_decimal: decimalT021(T021_V1_MAX_BATCH_EXPOSURE_UNITS), ambiguous_submission_windows: T021_V1_BATCH_COUNT,
    aspect_tolerance_ppm_3_4: 5_000, aspect_3_4_provider_validated: true, declared_aspects: ["3:4"],
    balance_at_disclosure_decimal: decimalT021(T021_V1_BALANCE_AT_DISCLOSURE_UNITS),
    remaining_plan_after_t021_decimal: decimalT021(T021_V1_REMAINING_PLAN_AFTER_T021_UNITS),
    remaining_plan_breakdown: [...T021_V1_REMAINING_PLAN_BREAKDOWN],
    headroom_after_t021_decimal: decimalT021(T021_V1_BALANCE_AT_DISCLOSURE_UNITS - T021_V1_TOTAL_CAP_UNITS - T021_V1_REMAINING_PLAN_AFTER_T021_UNITS),
    a_single_lost_batch_breaks_the_remaining_plan: true,
    model_canary_applies_to_every_batch: true, contract_drift_blocks_all_later_batches: true,
    credit_expiry_date: T021_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    event_variant_expansion_allowed: false, style_redecision_allowed: false, other_categories_allowed: false, prior_task_approval_inherited: false,
  } as const;
}
export function buildT021Risk() {
  return { schema_version: 1, evidence_version: "t021-event-art-risk-disclosure-v1", issue_number: T021_ISSUE_NUMBER, issue_contract_sha256: T021_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T021_V1_RISK_TEXT, disclosure_text_sha256: sha256T021(T021_V1_RISK_TEXT), scope: t021ApprovalScope() } as const;
}
export function buildT021Schema() {
  return {
    schema_version: 1, evidence_version: "t021-event-art-higgsfield-schema-v1", source: "T015 observations plus T020 v1/v2 deliveries", secret_free: true,
    submit: { tool: "generate_image_batch", batch_max: T021_V1_BATCH_MAX, requested_model: T021_V1_REQUESTED_MODEL, expected_provider_reported_model: T021_V1_EXPECTED_MODEL, use_unlim: false, aspect_ratio_per_asset: true, aspect_ratios: ["3:4"], aspect_homogeneous_batches: true, resolution: "1k", count_per_asset: 1, response_required_keys: ["submitted_count", "failed_count", "jobs"], job_required_keys: ["index", "job_id", "status"], job_allowed_optional_keys: ["adjustments", "error", "warning", "preset_recommendation"], any_optional_key_fail_stops_batch: true },
    cost: { display_credits_decimal: "1.00", exact_credits_decimal: "1.50", integer_units_per_image: T021_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true, freshness_ms: 600_000, strictly_monotonic_observations: true },
    jobs_wait: { expected_type: "image", summary_required_keys: ["active", "completed", "errors", "failed", "total"], summary_compared_by_value: true, retryable_presence_only_for_status: "lookup_failed", optional_model_or_result_url_on_non_completed: true, download_only_when_completed: true, poll_intake_enforces_index_and_job_id_uniqueness: true },
    secure_download: { resolver_mapped_ipv6_allowed: false, resolver_public_ipv4_allowed: true, transport_peer_pin_required: true, fresh_connection_per_request: true, auto_select_family: false, remote_address_captured_at_response_headers: true, url_or_host_diagnostics_persisted: false, transport_module: "scripts/assets/provider-transport.ts" },
    model_canary: { canary_batch_id: T021_V1_CANARY_BATCH_ID, applies_to_every_batch: true, blocks_next_batch_until_previous_model_verified: true, blocks_batch_id_on_drift: T021_V1_CANARY_BLOCKED_BATCH_ID, drift_still_costs_batch_spend: true },
    aspect_expectation: T021_V1_ASPECT_EXPECTATION,
  } as const;
}

/* ------------------------------------------------------------------- plan */

export interface T021RequestParams { model: typeof T021_V1_REQUESTED_MODEL; prompt: string; aspect_ratio: AspectRatio; resolution: "1k"; count: 1; use_unlim: false; medias: Array<{ role: "image"; value: typeof T021_MASTER_REFERENCE_JOB_ID }> }
export interface T021AssetRequest { index: number; params: T021RequestParams }
export interface T021Asset { index: number; id: string; category: "EVENT"; event_type: string; ground: string | null; path: string; aspect_ratio: AspectRatio; core_prompt: string; core_prompt_sha256: string; effective_prompt: string; effective_prompt_sha256: string; request: T021AssetRequest; canonical_request_sha256: string }
export interface T021Batch { id: string; index: number; aspect_ratio: AspectRatio; asset_ids: string[]; size: number }

export const T021_V1_EVENT_TYPES = ["cache", "workshop", "collapse", "fictor", "record", "oddity"] as const;
export const T021_V1_ID_LIST_SHA256 = "dbe722ae258ed1d73d4e925148e05c6c8cc25d3b58b69feb69d74a70fc2e5b71" as const;
export const T021_V1_FIRST_ID = "event__cache" as const;
export const T021_V1_LAST_ID = "event__collapse__wash" as const;

interface CoreAsset { id: string; category: string; path: string; aspect_ratio: string; prompt: string }

export function selectT021EventAssets(root: string): CoreAsset[] {
  const core = JSON.parse(readPinnedT021(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256).toString("utf8")) as { assets?: CoreAsset[] };
  const selected = (core.assets ?? []).filter(({ category }) => category === "EVENT");
  if (selected.length !== T021_V1_ASSET_COUNT) throw new Error(`T021 expected exactly ${T021_V1_ASSET_COUNT} EVENT assets, found ${selected.length}`);
  for (const asset of selected) {
    // A different aspect would need its own tolerance treatment and its own disclosure.
    if (asset.aspect_ratio !== "3:4") throw new Error(`T021 EVENT aspect changed at ${asset.id}: ${asset.aspect_ratio}`);
    if (!asset.path.startsWith("events/") || !asset.path.endsWith(".png")) throw new Error(`T021 EVENT path changed at ${asset.id}: ${asset.path}`);
    if (typeof asset.prompt !== "string" || asset.prompt.length === 0) throw new Error(`T021 EVENT prompt missing at ${asset.id}`);
    if (!asset.id.startsWith("event__")) throw new Error(`T021 EVENT id changed: ${asset.id}`);
  }
  const ids = selected.map(({ id }) => id);
  if (new Set(ids).size !== T021_V1_ASSET_COUNT || new Set(selected.map(({ path }) => path)).size !== T021_V1_ASSET_COUNT) throw new Error("T021 EVENT ids or paths are not unique");
  if (ids[0] !== T021_V1_FIRST_ID || ids.at(-1) !== T021_V1_LAST_ID) throw new Error("T021 EVENT selection boundary changed");
  if (sha256T021(`${ids.join("\n")}\n`) !== T021_V1_ID_LIST_SHA256) throw new Error("T021 EVENT ID set changed");
  // All six declared types must be represented, which is the issue's coverage criterion.
  const types = new Set(ids.map((id) => id.split("__")[1]));
  if (T021_V1_EVENT_TYPES.some((type) => !types.has(type)) || types.size !== T021_V1_EVENT_TYPES.length) throw new Error("T021 EVENT type coverage changed");
  return selected;
}

export function buildT021Assets(root: string): T021Asset[] {
  return selectT021EventAssets(root).map((asset, index) => {
    const parts = asset.id.split("__");
    const effectivePrompt = `${asset.prompt}\n\nMaster-style reference instruction: ${T021_REFERENCE_INSTRUCTION}\n${T021_NO_COPY_BOUNDARY}`;
    const aspect = asset.aspect_ratio as AspectRatio;
    const request: T021AssetRequest = { index, params: { model: T021_V1_REQUESTED_MODEL, prompt: effectivePrompt, aspect_ratio: aspect, resolution: "1k", count: 1, use_unlim: false, medias: [{ role: "image", value: T021_MASTER_REFERENCE_JOB_ID }] } };
    return {
      index, id: asset.id, category: "EVENT" as const, event_type: parts[1], ground: parts[2] ?? null, path: asset.path, aspect_ratio: aspect,
      core_prompt: asset.prompt, core_prompt_sha256: sha256T021(asset.prompt), effective_prompt: effectivePrompt, effective_prompt_sha256: sha256T021(effectivePrompt),
      request, canonical_request_sha256: sha256T021(canonicalJsonT021(request)),
    };
  });
}

export function buildT021Batches(assets: readonly T021Asset[]): T021Batch[] {
  if (assets.length !== T021_V1_ASSET_COUNT) throw new Error("T021 batch partition needs exactly 20 assets");
  const batches: T021Batch[] = [];
  let offset = 0;
  for (const size of T021_V1_BATCH_SIZES) {
    const slice = assets.slice(offset, offset + size);
    if (slice.length !== size) throw new Error("T021 declared batch size does not fit the selection");
    batches.push({ id: `event-art-${String(batches.length + 1).padStart(3, "0")}`, index: batches.length, aspect_ratio: slice[0].aspect_ratio, asset_ids: slice.map(({ id }) => id), size });
    offset += size;
  }
  if (batches.length !== T021_V1_BATCH_COUNT || offset !== T021_V1_ASSET_COUNT) throw new Error("T021 batch layout changed");
  if (batches.some(({ size }) => size < 1 || size > T021_V1_BATCH_MAX)) throw new Error("T021 batch exceeds the provider contract maximum");
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const batch of batches) if (batch.asset_ids.some((id) => byId.get(id)?.aspect_ratio !== batch.aspect_ratio)) throw new Error(`T021 batch ${batch.id} is not aspect-homogeneous`);
  if (new Set(batches.flatMap(({ asset_ids }) => asset_ids)).size !== T021_V1_ASSET_COUNT) throw new Error("T021 batch partition is not a partition");
  if (batches[0].id !== T021_V1_CANARY_BATCH_ID || batches[1].id !== T021_V1_CANARY_BLOCKED_BATCH_ID) throw new Error("T021 canary batch identity changed");
  return batches;
}

function assertMasterStyleBindingT021(root: string): void {
  const master = JSON.parse(readPinnedT021(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256).toString("utf8")) as { selected_candidate?: { job_id?: string; image_sha256?: string }; reference_element?: { reference_id?: string; revision?: number; reference_instruction?: string }; media_style_lock?: { lock_scope?: string } };
  if (master.selected_candidate?.job_id !== T021_MASTER_REFERENCE_JOB_ID || master.selected_candidate.image_sha256 !== T021_MASTER_REFERENCE_SHA256 || master.reference_element?.reference_id !== T021_MASTER_REFERENCE_ID || master.reference_element.revision !== 1 || master.reference_element.reference_instruction !== T021_REFERENCE_INSTRUCTION || master.media_style_lock?.lock_scope !== "MEDIA_ONLY") throw new Error("T021 master-style binding changed");
  readPinnedT021(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256);
}

export type T021Plan = ReturnType<typeof buildT021Plan>;
export function buildT021Plan(root: string) {
  assertMasterStyleBindingT021(root);
  const risk = buildT021Risk();
  const schema = buildT021Schema();
  const forensics = buildT021Forensics(root);
  const binding = loadT021Binding(root);
  const assets = buildT021Assets(root);
  const batches = buildT021Batches(assets);
  return {
    schema_version: 1, plan_version: "t021-event-art-v1", issue_number: T021_ISSUE_NUMBER, issue_contract_sha256: T021_CONTRACT_SHA256,
    state: "HOLD_FOR_EXACT_SCOPED_USER_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: {
      task_key: "T021", category: "EVENT", asset_count: T021_V1_ASSET_COUNT,
      base_types: [...T021_V1_EVENT_TYPES], base_type_count: 6, variant_count: 14,
      event_variant_expansion_allowed: false, style_redecision_allowed: false, manifest_id_change_allowed: false, other_categories_allowed: false,
    },
    selection: {
      expression: "core.assets.filter(category === 'EVENT'), manifest order",
      id_list_encoding: "UTF-8_IDS_JOINED_BY_NEWLINE_WITH_TRAILING_NEWLINE", id_list_sha256: T021_V1_ID_LIST_SHA256,
      first_id: T021_V1_FIRST_ID, last_id: T021_V1_LAST_ID, unique_ids: true, unique_paths: true,
    },
    sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: T020_CORE_PLAN_SHA256 },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: T020_MASTER_STYLE_SHA256 },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: T020_T014_APPROVAL_SHA256 },
      risk_disclosure: { path: T021_V1_RISK_PATH, sha256: sha256T021(renderT021CanonicalJson(risk)), text_sha256: risk.disclosure_text_sha256 },
      provider_schema: { path: T021_V1_SCHEMA_PATH, sha256: sha256T021(renderT021CanonicalJson(schema)) },
      forensics: { path: T021_V1_FORENSICS_PATH, sha256: sha256T021(renderT021CanonicalJson(forensics)) },
      implementation_binding: { path: T021_V1_BINDING_PATH, sha256: sha256T021(renderT021CanonicalJson(binding)), files: binding.files },
    },
    provider_contract: {
      tool: "generate_image_batch", requested_model: T021_V1_REQUESTED_MODEL, expected_provider_reported_model_for_canary_and_drift: T021_V1_EXPECTED_MODEL,
      model_canary_applies_to_every_batch: true, aspect_ratio_per_asset: true, aspect_homogeneous_batches: true,
      resolution: "1k", count_per_asset: 1, use_unlim: false, batch_max: T021_V1_BATCH_MAX, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET",
    },
    reference_binding: { role: "image", source_job_id: T021_MASTER_REFERENCE_JOB_ID, reference_id: T021_MASTER_REFERENCE_ID, revision: 1, source_sha256: T021_MASTER_REFERENCE_SHA256, lock_scope: "MEDIA_ONLY", reference_instruction: T021_REFERENCE_INSTRUCTION },
    prompt_contract: { core_prompt_preserved_verbatim: true, reference_instruction: T021_REFERENCE_INSTRUCTION, no_copy_boundary: T021_NO_COPY_BOUNDARY, deterministic_text_only: true },
    budget: {
      unit_cost_decimal: decimalT021(T021_V1_UNIT_COST_UNITS), unit_cost_units: T021_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true,
      paid_request_count: T021_V1_ASSET_COUNT, paid_batch_count: T021_V1_BATCH_COUNT, paid_batch_sizes: [...T021_V1_BATCH_SIZES],
      total_credit_cap_decimal: decimalT021(T021_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS,
      legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00",
      credit_expiry_date: T021_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    },
    cumulative_budget: {
      balance_at_disclosure_decimal: decimalT021(T021_V1_BALANCE_AT_DISCLOSURE_UNITS), balance_at_disclosure_units: T021_V1_BALANCE_AT_DISCLOSURE_UNITS,
      this_task_cap_decimal: decimalT021(T021_V1_TOTAL_CAP_UNITS),
      projected_balance_after_t021_decimal: decimalT021(T021_V1_BALANCE_AT_DISCLOSURE_UNITS - T021_V1_TOTAL_CAP_UNITS),
      remaining_plan_after_t021_decimal: decimalT021(T021_V1_REMAINING_PLAN_AFTER_T021_UNITS), remaining_plan_breakdown: [...T021_V1_REMAINING_PLAN_BREAKDOWN],
      headroom_after_t021_decimal: decimalT021(T021_V1_BALANCE_AT_DISCLOSURE_UNITS - T021_V1_TOTAL_CAP_UNITS - T021_V1_REMAINING_PLAN_AFTER_T021_UNITS),
      // 3.90 of slack against a 18.00 per-batch exposure: a loss here is not locally absorbed.
      a_single_lost_batch_breaks_the_remaining_plan: true,
      max_single_batch_exposure_decimal: decimalT021(T021_V1_MAX_BATCH_EXPOSURE_UNITS),
    },
    retry_policy: {
      automatic_paid_retry_allowed: false, automatic_paid_retry_count: 0, ambiguous_or_partial_submission_retry_allowed: false,
      single_submission_per_batch: true, ambiguous_submission_windows: T021_V1_BATCH_COUNT,
      ambiguous_window_max_exposure_decimal: decimalT021(T021_V1_MAX_BATCH_EXPOSURE_UNITS),
      operator_recovery_only_for_durable_job_ids: true, operator_gated_resume_never_resubmits: true, fail_stop_scope: "BATCH",
    },
    recovery_policy: {
      local_root: T021_V1_LOCAL_ROOT, backup_root: T021_V1_BACKUP_ROOT, provider_native_unmodified: true, crop_or_resize_allowed: false,
      aspect_ratio_source: "PER_ASSET_FROM_PINNED_CORE_MANIFEST", aspect_expectation: T021_V1_ASPECT_EXPECTATION,
      production_jobs_wait_input: "STDIN_ONLY", signed_urls_or_raw_errors_persisted: false,
    },
    immutable_forensics: forensics.immutable_sources,
    model_canary: { expected_provider_reported_model: T021_V1_EXPECTED_MODEL, applies_to_every_batch: true, canary_batch_id: T021_V1_CANARY_BATCH_ID, blocks_batch_id_on_drift: T021_V1_CANARY_BLOCKED_BATCH_ID, drift_still_costs_batch_spend: true },
    approval_gate: {
      pending_disclosure_packet_path: T021_V1_PENDING_PATH, disclosure_presentation_path: T021_V1_PRESENTATION_PATH,
      controller_disclosure_attestation_path: T021_V1_CONTROLLER_DISCLOSURE_PATH, controller_approval_attestation_path: T021_V1_CONTROLLER_APPROVAL_PATH,
      approval_path: T021_V1_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T021_V1_EXACT_APPROVAL_PHRASE,
      prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true,
    },
    assets, batches,
  } as const;
}
export function renderT021Plan(plan: T021Plan): string { return renderT021CanonicalJson(plan); }
export function t021PlanSha256(plan: T021Plan): string { return sha256T021(renderT021Plan(plan)); }

export function crossCheckT021EffectivePrompts(root: string, plan: T021Plan, indices: readonly number[]): number {
  const source = selectT021EventAssets(root);
  let checked = 0;
  for (const index of indices) {
    const asset = plan.assets.find((item) => item.index === index);
    const origin = source[index];
    if (!asset || !origin || origin.id !== asset.id || origin.path !== asset.path || origin.aspect_ratio !== asset.aspect_ratio) throw new Error("T021 cross-check asset binding changed");
    const effective = `${asset.core_prompt}\n\nMaster-style reference instruction: ${T021_REFERENCE_INSTRUCTION}\n${T021_NO_COPY_BOUNDARY}`;
    if (effective !== asset.effective_prompt || sha256T021(effective) !== asset.effective_prompt_sha256 || sha256T021(canonicalJsonT021(asset.request)) !== asset.canonical_request_sha256 || asset.request.params.prompt !== asset.effective_prompt || asset.request.params.aspect_ratio !== asset.aspect_ratio) throw new Error("T021 cross-check effective prompt changed");
    checked += 1;
  }
  return checked;
}

/* -------------------------------------------------------- disclosure chain */

export { parseT020BalanceFile as parseT021BalanceFile, type T020BalanceObservation as T021BalanceObservation } from "./t020-world-art-production-v1";

function exactEvidenceT021(actual: unknown, expected: unknown, label: string): void { if (canonicalJsonT021(actual) !== canonicalJsonT021(expected)) throw new Error(`${label} changed or has unknown fields`); }
export function canonicalT021File<T>(root: string, path: string): { value: T; sha256: string } {
  const target = resolve(root, path);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`T021 artifact is not a regular file: ${path}`);
  const bytes = readFileSync(target, "utf8");
  const value = JSON.parse(bytes) as T;
  if (bytes !== renderT021CanonicalJson(value)) throw new Error(`T021 artifact is not canonical: ${path}`);
  return { value, sha256: sha256T021(bytes) };
}
function evidenceTimeT021(value: string, label: string): number { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(`${label} timestamp is not canonical UTC`); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is invalid`); return parsed; }

export type T021Pending = ReturnType<typeof buildT021Pending>;
export function buildT021Pending(root: string, plan: T021Plan) {
  const risk = buildT021Risk(); const schema = buildT021Schema(); const forensics = buildT021Forensics(root); const binding = loadT021Binding(root);
  return {
    schema_version: 1, artifact_version: "t021-event-art-disclosure-presentation-v1-pending", status: "PENDING_PRESENTATION_NOT_AUTHORIZED", secret_free: true,
    plan_sha256: t021PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T021(renderT021CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    provider_schema_evidence_sha256: sha256T021(renderT021CanonicalJson(schema)), forensics_evidence_sha256: sha256T021(renderT021CanonicalJson(forensics)),
    core_plan_sha256: T020_CORE_PLAN_SHA256,
    implementation_binding_sha256: sha256T021(renderT021CanonicalJson(binding)), implementation_files: binding.files,
    exact_approval_phrase_required: T021_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T021_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T021_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T021_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true, scope: t021ApprovalScope(), authorized: false,
  } as const;
}

export type T021ControllerDisclosure = ReturnType<typeof buildT021ControllerDisclosure>;
export function buildT021ControllerDisclosure(root: string, plan: T021Plan, disclosedAt: string) {
  evidenceTimeT021(disclosedAt, "T021 disclosure");
  const pending = buildT021Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t021-event-art-controller-disclosure-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T021", issue_number: T021_ISSUE_NUMBER, issue_contract_sha256: T021_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: disclosedAt, assistant_disclosure_text_sha256: sha256T021(T021_V1_RISK_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false },
    bindings: { plan_sha256: pending.plan_sha256, pending_disclosure_packet_sha256: sha256T021(renderT021CanonicalJson(pending)), risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256, implementation_binding_sha256: pending.implementation_binding_sha256 },
    scope: t021ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT021ControllerDisclosure(value: unknown, root: string, plan: T021Plan): asserts value is T021ControllerDisclosure {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T021 controller disclosure is invalid");
  const at = (value as { event_sequence?: { assistant_disclosure_presented_at?: unknown } }).event_sequence?.assistant_disclosure_presented_at;
  if (typeof at !== "string") throw new Error("T021 disclosure timestamp missing");
  exactEvidenceT021(value, buildT021ControllerDisclosure(root, plan, at), "T021 controller disclosure");
}

export type T021Presentation = ReturnType<typeof buildT021Presentation>;
export function buildT021Presentation(root: string, plan: T021Plan, balance: { credits: number; provider_observed_at: string } | null) {
  const pending = buildT021Pending(root, plan);
  const controller = canonicalT021File<T021ControllerDisclosure>(root, T021_V1_CONTROLLER_DISCLOSURE_PATH);
  validateT021ControllerDisclosure(controller.value, root, plan);
  const units = balance === null ? null : Math.round(balance.credits * 100);
  const disclosure = balance === null || units === null
    ? { balance_observation_present: false, covers_total_cap: null, balance_disclosure_incomplete: true } as const
    : {
      balance_observation_present: true, observed_balance_decimal: decimalT021(units), observed_balance_units: units,
      provider_observed_at: balance.provider_observed_at, total_credit_cap_decimal: decimalT021(T021_V1_TOTAL_CAP_UNITS),
      projected_remainder_decimal: decimalT021(units - T021_V1_TOTAL_CAP_UNITS), covers_total_cap: units >= T021_V1_TOTAL_CAP_UNITS,
      remaining_plan_after_t021_decimal: decimalT021(T021_V1_REMAINING_PLAN_AFTER_T021_UNITS),
      headroom_after_t021_decimal: decimalT021(units - T021_V1_TOTAL_CAP_UNITS - T021_V1_REMAINING_PLAN_AFTER_T021_UNITS),
      covers_remaining_plan: units - T021_V1_TOTAL_CAP_UNITS >= T021_V1_REMAINING_PLAN_AFTER_T021_UNITS,
      balance_disclosure_incomplete: false,
    } as const;
  return {
    schema_version: 1, evidence_version: "t021-event-art-disclosure-presentation-v1", secret_free: true,
    pending_packet_sha256: sha256T021(renderT021CanonicalJson(pending)), plan_sha256: pending.plan_sha256,
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, risk_disclosure_text_ko: T021_V1_RISK_TEXT,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    core_plan_sha256: T020_CORE_PLAN_SHA256,
    controller_disclosure_attestation_sha256: controller.sha256, implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    disclosed_at: controller.value.event_sequence.assistant_disclosure_presented_at, source: "current user conversation",
    balance_disclosure: disclosure, scope: t021ApprovalScope(),
    exact_approval_phrase_required: T021_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T021_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T021_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T021_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true, authorized: false,
  } as const;
}
function presentationBalanceT021(value: unknown): { credits: number; provider_observed_at: string } | null {
  const disclosure = (value as { balance_disclosure?: Record<string, unknown> } | null)?.balance_disclosure;
  if (!disclosure || typeof disclosure !== "object" || disclosure.balance_observation_present !== true) return null;
  const decimalValue = disclosure.observed_balance_decimal; const at = disclosure.provider_observed_at;
  if (typeof decimalValue !== "string" || !/^\d+\.\d{2}$/.test(decimalValue) || typeof at !== "string") throw new Error("T021 presentation balance is invalid");
  return { credits: Number(decimalValue), provider_observed_at: at };
}
export function validateT021Presentation(value: unknown, root: string, plan: T021Plan): asserts value is T021Presentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T021 presentation is invalid");
  exactEvidenceT021(value, buildT021Presentation(root, plan, presentationBalanceT021(value)), "T021 presentation");
}

export type T021ControllerApproval = ReturnType<typeof buildT021ControllerApproval>;
export function buildT021ControllerApproval(root: string, plan: T021Plan, presentation: T021Presentation, approvedAt: string, now = new Date()) {
  validateT021Presentation(presentation, root, plan);
  const disclosedMs = evidenceTimeT021(presentation.disclosed_at, "T021 disclosure");
  const approvedMs = evidenceTimeT021(approvedAt, "T021 approval");
  if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime()) throw new Error("T021 approval chronology is invalid");
  return {
    schema_version: 1, evidence_version: "t021-event-art-controller-approval-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T021", issue_number: T021_ISSUE_NUMBER, issue_contract_sha256: T021_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T021_V1_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true },
    bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T021(renderT021CanonicalJson(presentation)), risk_disclosure_evidence_sha256: presentation.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: presentation.risk_disclosure_text_sha256, provider_schema_evidence_sha256: presentation.provider_schema_evidence_sha256, forensics_evidence_sha256: presentation.forensics_evidence_sha256, implementation_binding_sha256: presentation.implementation_binding_sha256 },
    scope: t021ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT021ControllerApproval(value: unknown, root: string, plan: T021Plan, presentation: T021Presentation, now = new Date()): asserts value is T021ControllerApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T021 controller approval is invalid");
  const at = (value as { event_sequence?: { exact_user_reply_received_at?: unknown } }).event_sequence?.exact_user_reply_received_at;
  if (typeof at !== "string") throw new Error("T021 approval timestamp missing");
  exactEvidenceT021(value, buildT021ControllerApproval(root, plan, presentation, at, now), "T021 controller approval");
}

export type T021Approval = ReturnType<typeof buildT021Approval>;
export function buildT021Approval(root: string, plan: T021Plan, presentation: T021Presentation, now = new Date()) {
  validateT021Presentation(presentation, root, plan);
  const controller = canonicalT021File<T021ControllerApproval>(root, T021_V1_CONTROLLER_APPROVAL_PATH);
  validateT021ControllerApproval(controller.value, root, plan, presentation, now);
  const pending = buildT021Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t021-event-art-approval-v1", secret_free: true,
    decision: "APPROVE_T021_EVENT_ART_EXACTLY_20_ASSETS_30_00_CREDIT_CAP", source: "controller approval attestation",
    exact_user_quote: T021_V1_EXACT_APPROVAL_PHRASE, approved_at: controller.value.event_sequence.exact_user_reply_received_at, disclosed_at: presentation.disclosed_at,
    plan_sha256: pending.plan_sha256, disclosure_presentation_evidence_sha256: sha256T021(renderT021CanonicalJson(presentation)),
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    controller_disclosure_attestation_sha256: presentation.controller_disclosure_attestation_sha256,
    controller_approval_attestation_path: T021_V1_CONTROLLER_APPROVAL_PATH, controller_approval_attestation_sha256: controller.sha256,
    implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    core_plan_sha256: T020_CORE_PLAN_SHA256, balance_disclosure: presentation.balance_disclosure, scope: t021ApprovalScope(),
    prior_task_approval_inherited: false, acknowledges_prior_approvals_not_inherited: true, committed_clean_runtime_binding_required: true, automatic_paid_retry_count: 0,
  } as const;
}
export function validateT021Approval(value: unknown, root: string, plan: T021Plan, presentation: T021Presentation, now = new Date()): asserts value is T021Approval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T021 approval is invalid");
  exactEvidenceT021(value, buildT021Approval(root, plan, presentation, now), "T021 approval");
}

export function isT021Authorized(root: string, plan: T021Plan, now = new Date()): boolean {
  try {
    const presentation = canonicalT021File<T021Presentation>(root, T021_V1_PRESENTATION_PATH);
    validateT021Presentation(presentation.value, root, plan);
    const controller = canonicalT021File<T021ControllerApproval>(root, T021_V1_CONTROLLER_APPROVAL_PATH);
    validateT021ControllerApproval(controller.value, root, plan, presentation.value, now);
    const approval = canonicalT021File<T021Approval>(root, T021_V1_APPROVAL_PATH);
    validateT021Approval(approval.value, root, plan, presentation.value, now);
    return true;
  } catch { return false; }
}
export function loadT021Authorization(root: string, plan: T021Plan, now = new Date()): { presentation: T021Presentation; approval: T021Approval } {
  const presentation = canonicalT021File<T021Presentation>(root, T021_V1_PRESENTATION_PATH);
  validateT021Presentation(presentation.value, root, plan);
  const approval = canonicalT021File<T021Approval>(root, T021_V1_APPROVAL_PATH);
  validateT021Approval(approval.value, root, plan, presentation.value, now);
  return { presentation: presentation.value, approval: approval.value };
}
