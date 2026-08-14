import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AspectRatio } from "./types";
import {
  T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256, T020_MASTER_REFERENCE_ID, T020_MASTER_REFERENCE_JOB_ID, T020_MASTER_REFERENCE_SHA256,
  T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256, T020_REFERENCE_INSTRUCTION, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256,
  T020_V1_BATCH_MAX, T020_V1_EXPECTED_MODEL, T020_V1_REQUESTED_MODEL, T020_V1_UNIT_COST_UNITS,
  canonicalJsonT020, decimalT020, readPinnedT020, readRegularT020, renderT020CanonicalJson, sha256T020,
} from "./t020-world-art-production-v1";

/* Shared primitives keep their T020 names; T019 re-exports them under neutral aliases so its
   own modules read in one vocabulary without duplicating any audited implementation. */
export const sha256T019 = sha256T020;
export const canonicalJsonT019 = canonicalJsonT020;
export const renderT019CanonicalJson = renderT020CanonicalJson;
export const decimalT019 = decimalT020;
export const readRegularT019 = readRegularT020;
export const readPinnedT019 = readPinnedT020;

/* T019 heart cards: 6 HEART assets, a single batch, 9.00 credit hard cap, clean start.
   These six double as boss art — the T020 contract has bosses reuse the heart card art rather
   than generating separate world plates, so nothing else in the plan depends on regenerating
   them. HEART_FORGE (36) is out of scope by budget reallocation and falls back at runtime. */

export const T019_ISSUE_NUMBER = 21 as const;
export const T019_CONTRACT_SHA256 = "7c5b1e3d94a2f60c8b3e7d51a9f4c02e6b8d3a175f9e2c48b06d1a73e5c9f284" as const;

/* ------------------------------------------------------------------ paths */

export const T019_V1_PLAN_PATH = "assets/manifests/t019-heart-cards-v1.plan.json" as const;
export const T019_V1_BINDING_PATH = "assets/evidence/t019-heart-cards-implementation-binding-v1.json" as const;
export const T019_V1_RISK_PATH = "assets/evidence/t019-heart-cards-risk-disclosure-v1.json" as const;
export const T019_V1_SCHEMA_PATH = "assets/evidence/t019-heart-cards-higgsfield-schema-v1.json" as const;
export const T019_V1_FORENSICS_PATH = "assets/evidence/t019-heart-cards-forensics-v1.json" as const;
export const T019_V1_PENDING_PATH = "assets/evidence/t019-heart-cards-disclosure-presentation-v1.pending.json" as const;
export const T019_V1_PRESENTATION_PATH = "assets/evidence/t019-heart-cards-disclosure-presentation-v1.json" as const;
export const T019_V1_APPROVAL_PATH = "assets/evidence/t019-heart-cards-approval-v1.json" as const;
export const T019_V1_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t019-heart-cards-controller-disclosure-attestation-v1.json" as const;
export const T019_V1_CONTROLLER_APPROVAL_PATH = "assets/evidence/t019-heart-cards-controller-approval-attestation-v1.json" as const;
export const T019_V1_JOURNAL_PATH = "assets/runs/t019-heart-cards/operations-v1.json" as const;
export const T019_V1_LOCK_PATH = "assets/runs/t019-heart-cards/operations-v1.lock" as const;
export const T019_V1_LOCAL_ROOT = "public/assets" as const;
export const T019_V1_BACKUP_ROOT = "assets/backups/t019-heart-cards" as const;
/**
 * Carry-over fix from T020 v2: the index links are built from this same constant as the
 * segment files, so they can never point at another version's directory. v2 hardcoded a v1
 * path in the link template while writing segments to a v2 directory, producing an index of
 * broken links that could not be corrected in place without invalidating a completed run.
 */
export const T019_V1_CONTACT_SEGMENT_DIR = "t019-heart-cards-v1" as const;
export const T019_V1_CONTACT_ROOT = "docs/asset-runs/contact-sheets" as const;
export const T019_V1_CONTACT_SEGMENT_ROOT = `${T019_V1_CONTACT_ROOT}/${T019_V1_CONTACT_SEGMENT_DIR}` as const;
export const T019_V1_CONTACT_INDEX_PATH = `${T019_V1_CONTACT_ROOT}/${T019_V1_CONTACT_SEGMENT_DIR}.html` as const;

export { T020_CORE_PLAN_PATH as T019_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256 as T019_CORE_PLAN_SHA256 };

/* --------------------------------------------------------------- economics */

export const T019_V1_ASSET_COUNT = 6 as const;
export const T019_V1_BATCH_COUNT = 1 as const;
export const T019_V1_BATCH_SIZES = [6] as const;
export const T019_V1_BATCH_MAX = T020_V1_BATCH_MAX;
export const T019_V1_UNIT_COST_UNITS = T020_V1_UNIT_COST_UNITS;
export const T019_V1_TOTAL_CAP_UNITS = 900 as const;
/** One batch of six, so the single ambiguous window exposes the whole cap. */
export const T019_V1_MAX_BATCH_EXPOSURE_UNITS = 900 as const;
export const T019_V1_EXPECTED_MODEL = T020_V1_EXPECTED_MODEL;
export const T019_V1_REQUESTED_MODEL = T020_V1_REQUESTED_MODEL;
/** With one batch the canary is the run: there is no later batch for it to gate. */
export const T019_V1_CANARY_BATCH_ID = "heart-cards-001" as const;
export const T019_V1_CREDIT_EXPIRY_DATE = "2026-08-17" as const;

/**
 * Cumulative budget context, which Issue #23 requires the run to report rather than assume.
 *
 * The headroom after T019 is 3.90 — not a typo, and the reason this is a plan field rather
 * than a footnote. This run has one batch, so a loss is the whole 9.00 at once and takes the
 * headroom to -5.10 — T019 cannot be treated as a task whose losses are locally absorbed.
 */
export const T019_V1_BALANCE_AT_DISCLOSURE_UNITS = 25_290 as const;
/**
 * One source of truth. The approver is shown the per-task breakdown but the headroom is
 * derived from the total, so publishing them as independent constants would let an edit to
 * one contradict the other — a disclosure stating a decomposition that disagrees with its own
 * arithmetic. Both the total and each task's decimal are computed from this list.
 */
const T019_V1_REMAINING_PLAN_TASKS = [
  { task: "T016", credit_units: 24_000 },
] as const;
export const T019_V1_REMAINING_PLAN_BREAKDOWN: ReadonlyArray<{ task: string; credit_units: number; credit_decimal: string }> =
  T019_V1_REMAINING_PLAN_TASKS.map(({ task, credit_units }) => ({ task, credit_units, credit_decimal: decimalT019(credit_units) }));
export const T019_V1_REMAINING_PLAN_AFTER_T019_UNITS: number =
  T019_V1_REMAINING_PLAN_TASKS.reduce((sum, { credit_units }) => sum + credit_units, 0);

/* -------------------------------------------------------------- tolerance */

/**
 * T019 declares exactly one aspect: 3:4 at 5000 ppm.
 *
 * T020's 16:9 tolerance of 12500 is deliberately NOT declared here. It exists only to clear
 * the provider's 32-px grid at 16:9, where the worst case near 1MP is about 11364 ppm. An
 * entry that is unreachable by design still invites a later reader to assume 16:9 is
 * acceptable in this task; an absent entry cannot leak, and the lookup below throws loudly on
 * anything undeclared. The plan selector already refuses a non-3:4 HEART asset outright, so
 * this is the second of two independent refusals rather than the only one.
 *
 * 3:4's own delivered geometry is the same grid artifact: 896x1200 measures 4445 ppm off
 * exact, comfortably inside 5000. Known, observed, and not a reason to widen anything.
 */
export const T019_V1_ASPECT_TOLERANCE_PPM: Readonly<Partial<Record<AspectRatio, number>>> = { "3:4": 5_000 };
export function t019AspectTolerancePpm(aspect: AspectRatio): number {
  const tolerance = T019_V1_ASPECT_TOLERANCE_PPM[aspect];
  if (tolerance === undefined) throw new Error(`T019 has no declared tolerance for aspect ${aspect}`);
  return tolerance;
}
export const T019_V1_GRID_PX = 32 as const;
export const T019_V1_ASPECT_EXPECTATION = {
  criterion: "RATIO_ONLY_NO_ABSOLUTE_DIMENSION_REQUIREMENT",
  tolerance_ppm_by_aspect: { "3:4": 5_000 },
  declared_aspects: ["3:4"], undeclared_aspect_throws: true,
  provider_dimension_grid_px: T019_V1_GRID_PX,
  resolution: "1k",
  aspects_in_this_task: ["3:4"],
  observed_3_4: { width: 896, height: 1200, aspect_error_ppm: 4_445, source: "T015 and T020 deliveries", provider_validated: true },
  t020_16_9_tolerance_deliberately_not_declared_here: { tolerance_ppm: 12_500, reason: "16:9-SPECIFIC_GRID_ALLOWANCE_MUST_NOT_LEAK_INTO_3_4" },
  out_of_tolerance_terminal_code: "ASPECT_MISMATCH",
  out_of_tolerance_blocks_all_later_batches: true,
} as const;

/* ---------------------------------------------------------------- prompts */

export const T019_REFERENCE_INSTRUCTION = T020_REFERENCE_INSTRUCTION;
export const T019_NO_COPY_BOUNDARY = "MEDIA_ONLY no-copy boundary: preserve only the approved copperplate line treatment; derive this god-heart card's subject, geometry, pose, composition, whitespace, attribute colors, paper tone, density, representation, and aspect from the core heart prompt, never from the reference subject. Heart cards are 3:4 CELESTIAL plates; the reference image's own aspect is never inherited." as const;
export const T019_MASTER_REFERENCE_JOB_ID = T020_MASTER_REFERENCE_JOB_ID;
export const T019_MASTER_REFERENCE_SHA256 = T020_MASTER_REFERENCE_SHA256;
export const T019_MASTER_REFERENCE_ID = T020_MASTER_REFERENCE_ID;

/* ---------------------------------------------------------------- phrases */

export const T019_V1_EXACT_APPROVAL_PHRASE = "T019 신의 심장 카드 6장 생성을 승인한다. 한도 9.00 크레딧." as const;
export const T019_V1_RECOVERY_OPERATOR_PHRASE = "T019 이 배치의 확정 job ID만 복구하고 새 유료 제출은 하지 않습니다." as const;
export const T019_V1_RESUME_OPERATOR_PHRASE = "T019 실패한 배치를 재제출하지 않고 다음 배치만 진행합니다." as const;
export const T019_V1_LOSS_ACKNOWLEDGMENT_PHRASE = "T019 이 배치의 손실을 확인했고 재제출 없이 손실을 상한에서 차감한 뒤 남은 배치만 진행합니다." as const;

export const T019_V1_RISK_TEXT = `T019는 신의 심장 카드 정확히 6장을 단일 배치로 한 번만 유료 생성합니다. 상한은 정확히 9.00 credits(정확 단가 1.50 x 6장)이고 자동 유료 재시도 예산은 0이며, T015/T020/T021 승인은 하나도 상속되지 않습니다.
(i) 범위 - 여섯 터에 대응하는 신의 심장 6장(heart__still, heart__burn, heart__scatter, heart__rot, heart__wash, heart__join)입니다. 전부 3:4이고 구성은 CELESTIAL, 밀도는 MAX, 색은 GOLD에 터별 색을 더한 조합이며, id는 속성 이름을 그대로 따릅니다. 이 네 가지(종횡비·구성·밀도·명명)는 가정하지 않고 고정 manifest와 대조해 확인하며 하나라도 어긋나면 생성 전에 정지합니다.
(ii) 저장 경로 - 파일은 ${T019_V1_LOCAL_ROOT}/cards/에 저장됩니다. 이 디렉터리에는 이미 T015가 만든 카드 384장이 있습니다. 새로 쓰는 6장은 그 안에 이름이 겹치지 않는 새 파일로 들어가며, 저장은 무클로버 방식이라 이미 존재하는 파일과 내용이 다르면 덮어쓰지 않고 정지합니다. 즉 기존 384장이 이 실행으로 변경되거나 손실될 경로는 없습니다. 백업은 ${T019_V1_BACKUP_ROOT} 아래 같은 상대 경로에 만들어집니다.
(iii) 이 6장은 보스 아트를 겸합니다 - T020 계약에서 보스는 별도의 세계 아트를 만들지 않고 신의 심장 카드 아트를 재사용하기로 했습니다. 따라서 이 6장은 카드로도 보스 표현으로도 쓰이며, 생성에 실패한 속성이 있으면 그 터의 보스 표현도 함께 비게 됩니다.
(iv) 범위 밖 - 심장 빚기(HEART_FORGE) 36종은 예산 재배분으로 이번에 생성하지 않으며 런타임에서 폴백 처리합니다. 이 승인은 그 36장을 만들 권한을 포함하지 않습니다. style 재결정과 manifest ID 변경도 범위 밖입니다.
(v) 남는 실질 위험 - 첫째, 모호 제출 구간이 정확히 1회 있습니다. 배치가 하나뿐이므로 그 한 번의 구간이 상한 전체를 노출합니다. 최대 9.00 credits가 실제로 차감되고도 응답을 받지 못하면 job ID를 전혀 열거할 수 없어 이미 지불한 이미지를 영구히 회수하지 못할 수 있고, 그 경우 6장 전부를 잃습니다. 둘째, credits는 2026-08-17에 만료됩니다. 정확한 만료 시각은 알 수 없습니다.
(vi) 종횡비 - 3:4는 T015·T020·T021에서 반복 실증된 값입니다. provider는 출력 크기를 32픽셀 격자에 맞추며 실제 전달값 896x1200은 정확한 3:4 대비 4445ppm으로 허용치 5000ppm 안쪽입니다. T020에서 16:9에 적용했던 12500ppm은 16:9 전용 완화이므로 T019에는 아예 선언하지 않습니다. 즉 3:4가 아닌 전달물은 어떤 값이든 통과하지 못합니다.
(vii) 누적 예산 - 아래 수치는 이 계획을 작성한 시점의 관찰값(as-of)입니다. 승인 시점에 다시 관찰한 잔액으로 공시 문서(presentation)가 여유를 새로 계산하며, 두 값이 다르면 공시 문서 쪽이 정확합니다. 작성 시점 잔액은 252.90입니다. T019가 상한까지 쓰면 243.90이 남고, 남은 계획은 T016 240.00입니다. 여유는 3.90뿐입니다. 이 실행에서 배치를 잃으면(최대 9.00) 남은 여유가 마이너스가 되어 T016의 범위를 줄여야 하며, 잃은 1.50마다 canonical 카드 약 1장씩 줄어듭니다.
(viii) 배치는 단 한 번만 제출합니다. 유료 envelope이 한 번이라도 밖으로 나가면 모호 제출이든 부분 응답이든 즉시 fail-stop하고 어떤 경우에도 재제출하지 않습니다. 지출이 0인 상태(유료 envelope 이전 단계 실패)에서만 되돌려 다시 실행할 수 있습니다. 지출이 발생한 뒤에는 operator가 정확히 “${T019_V1_LOSS_ACKNOWLEDGMENT_PHRASE}”로 손실을 확인해야 실행을 마감할 수 있고, 확인된 손실은 9.00 상한에서 그대로 차감됩니다.
(ix) 과금은 provider가 보고하는 credits_exact(1.50)만 사용합니다. 화면 표시값 credits(1.00)는 기록만 하고 상한 계산에 절대 쓰지 않습니다.
(x) 모델 canary - 완료된 job의 provider-reported model이 ${T019_V1_EXPECTED_MODEL}가 아니면 즉시 정지합니다. 배치가 하나뿐이라 막을 다음 배치는 없지만, 드리프트가 관찰되면 그 지출은 회수되지 않은 채 실행이 끝납니다. MODEL_DRIFT와 ASPECT_MISMATCH는 provider 계약 드리프트로 기록되며 이 승인으로는 재생성하지 않습니다.
(xi) 승인 증거의 한계는 이전과 같습니다. operator 문구와 승인 attestation 파일은 모두 agent가 쓸 수 있고 “정확한 사용자 발화”는 코드 상수에서 나옵니다. 실제 인적 게이트는 절차적이며, 사용자가 이 고지를 본 뒤 이 세션에서 정확한 승인 문구를 직접 입력해야 하고 그 사실은 파일이 아니라 대화 기록으로만 확인됩니다.
(xii) 모든 요청은 use_unlim:false를 문자 그대로 포함하며 이 값은 각 자산의 canonical_request_sha256 안에 고정되어 있습니다. 저장은 provider가 준 바이트 그대로이고 crop이나 resize는 하지 않으며, 로컬과 백업 두 사본의 sha256이 저장 직후 일치해야 합니다.
signed URL, redirect URL, host, provider raw error는 journal, evidence, stdout 어디에도 기록하지 않습니다. 승인은 정확히 “${T019_V1_EXACT_APPROVAL_PHRASE}”라는 문구로만 기록합니다.` as const;

/* --------------------------------------------------------------- binding */

export const T019_V1_RUNTIME_FILES = {
  controller: "scripts/assets/t019-heart-cards-production-v1-controller.ts",
  preparation: "scripts/assets/t019-heart-cards-production-v1-cli.ts",
  production: "scripts/assets/t019-heart-cards-production-v1-ops.ts",
  contract: "scripts/assets/t019-heart-cards-production-v1.ts",
  provider_transport: "scripts/assets/provider-transport.ts",
  t020_contract: "scripts/assets/t020-world-art-production-v1.ts",
  t020_production: "scripts/assets/t020-world-art-production-v1-ops.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
} as const;

export interface T019Binding { schema_version: 1; manifest_version: "t019-heart-cards-implementation-binding-v1"; issue_number: typeof T019_ISSUE_NUMBER; issue_contract_sha256: typeof T019_CONTRACT_SHA256; files: Record<keyof typeof T019_V1_RUNTIME_FILES, { path: string; sha256: string }> }
export function buildT019Binding(root: string): T019Binding {
  return {
    schema_version: 1, manifest_version: "t019-heart-cards-implementation-binding-v1", issue_number: T019_ISSUE_NUMBER, issue_contract_sha256: T019_CONTRACT_SHA256,
    files: Object.fromEntries(Object.entries(T019_V1_RUNTIME_FILES).map(([key, path]) => [key, { path, sha256: sha256T019(readRegularT019(root, path)) }])) as T019Binding["files"],
  };
}
export function loadT019Binding(root: string): T019Binding {
  const bytes = readRegularT019(root, T019_V1_BINDING_PATH).toString("utf8");
  const value = JSON.parse(bytes) as T019Binding;
  if (bytes !== renderT019CanonicalJson(value) || canonicalJsonT019(value) !== canonicalJsonT019(buildT019Binding(root))) throw new Error("T019 implementation binding changed");
  return value;
}

/* -------------------------------------------------------------- forensics */

export type T019Forensics = ReturnType<typeof buildT019Forensics>;
export function buildT019Forensics(root: string) {
  return {
    schema_version: 1, evidence_version: "t019-heart-cards-forensics-v1", secret_free: true,
    immutable_sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: sha256T019(readPinnedT019(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256)) },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: sha256T019(readPinnedT019(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256)) },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: sha256T019(readPinnedT019(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256)) },
    },
    observed: {
      prior_paid_spend_units: 0, prior_journal_present: false, legacy_recovery_present: false,
      aspect_3_4_provider_validated: true, aspect_3_4_observed: "896x1200", aspect_3_4_observed_error_ppm: 4_445,
      provider_dimension_grid_px: T019_V1_GRID_PX, declared_aspects: ["3:4"], paid_retry_count: 0,
    },
    policy: {
      paid_resubmit_allowed: false, automatic_paid_retry_allowed: false, batch_scoped_fail_stop: true,
      operator_gated_resume_never_resubmits: true, aspect_homogeneous_batches: true,
      heart_forge_generation_allowed: false, style_redecision_allowed: false, manifest_id_change_allowed: false,
      prior_task_approval_inherited: false,
    },
  } as const;
}

/* ----------------------------------------------------------- risk / schema */

export function t019ApprovalScope() {
  return {
    task_key: "T019", category: "HEART", asset_count: T019_V1_ASSET_COUNT,
    attributes: [...T019_V1_ATTRIBUTES], composition: "CELESTIAL", density: "MAX", aspect_ratio: "3:4",
    doubles_as_boss_art: true, heart_forge_out_of_scope_count: 36,
    batch_count: T019_V1_BATCH_COUNT, batch_sizes: [...T019_V1_BATCH_SIZES], batch_max: T019_V1_BATCH_MAX, aspect_homogeneous_batches: true,
    unit_cost_decimal: decimalT019(T019_V1_UNIT_COST_UNITS), unit_cost_units: T019_V1_UNIT_COST_UNITS,
    total_credit_cap_decimal: decimalT019(T019_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T019_V1_TOTAL_CAP_UNITS,
    legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00", automatic_paid_retry_count: 0,
    max_batch_exposure_decimal: decimalT019(T019_V1_MAX_BATCH_EXPOSURE_UNITS), ambiguous_submission_windows: T019_V1_BATCH_COUNT,
    aspect_tolerance_ppm_3_4: 5_000, aspect_3_4_provider_validated: true, declared_aspects: ["3:4"],
    balance_at_disclosure_decimal: decimalT019(T019_V1_BALANCE_AT_DISCLOSURE_UNITS),
    remaining_plan_after_t019_decimal: decimalT019(T019_V1_REMAINING_PLAN_AFTER_T019_UNITS),
    remaining_plan_breakdown: T019_V1_REMAINING_PLAN_BREAKDOWN.map((entry) => ({ ...entry })),
    headroom_after_t019_decimal: decimalT019(T019_V1_BALANCE_AT_DISCLOSURE_UNITS - T019_V1_TOTAL_CAP_UNITS - T019_V1_REMAINING_PLAN_AFTER_T019_UNITS),
    a_single_lost_batch_breaks_the_remaining_plan: true,
    model_canary_applies_to_every_batch: true, contract_drift_blocks_all_later_batches: true,
    credit_expiry_date: T019_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    heart_forge_generation_allowed: false, style_redecision_allowed: false, other_categories_allowed: false, prior_task_approval_inherited: false,
  } as const;
}
export function buildT019Risk() {
  return { schema_version: 1, evidence_version: "t019-heart-cards-risk-disclosure-v1", issue_number: T019_ISSUE_NUMBER, issue_contract_sha256: T019_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T019_V1_RISK_TEXT, disclosure_text_sha256: sha256T019(T019_V1_RISK_TEXT), scope: t019ApprovalScope() } as const;
}
export function buildT019Schema() {
  return {
    schema_version: 1, evidence_version: "t019-heart-cards-higgsfield-schema-v1", source: "T015 observations plus T020 v1/v2 deliveries", secret_free: true,
    submit: { tool: "generate_image_batch", batch_max: T019_V1_BATCH_MAX, requested_model: T019_V1_REQUESTED_MODEL, expected_provider_reported_model: T019_V1_EXPECTED_MODEL, use_unlim: false, aspect_ratio_per_asset: true, aspect_ratios: ["3:4"], aspect_homogeneous_batches: true, resolution: "1k", count_per_asset: 1, response_required_keys: ["submitted_count", "failed_count", "jobs"], job_required_keys: ["index", "job_id", "status"], job_allowed_optional_keys: ["adjustments", "error", "warning", "preset_recommendation"], any_optional_key_fail_stops_batch: true },
    cost: { display_credits_decimal: "1.00", exact_credits_decimal: "1.50", integer_units_per_image: T019_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true, freshness_ms: 600_000, strictly_monotonic_observations: true },
    jobs_wait: { expected_type: "image", summary_required_keys: ["active", "completed", "errors", "failed", "total"], summary_compared_by_value: true, retryable_presence_only_for_status: "lookup_failed", optional_model_or_result_url_on_non_completed: true, download_only_when_completed: true, poll_intake_enforces_index_and_job_id_uniqueness: true },
    secure_download: { resolver_mapped_ipv6_allowed: false, resolver_public_ipv4_allowed: true, transport_peer_pin_required: true, fresh_connection_per_request: true, auto_select_family: false, remote_address_captured_at_response_headers: true, url_or_host_diagnostics_persisted: false, transport_module: "scripts/assets/provider-transport.ts" },
    model_canary: { canary_batch_id: T019_V1_CANARY_BATCH_ID, applies_to_every_batch: true, blocks_next_batch_until_previous_model_verified: true, blocks_all_later_batches_on_drift: true, later_batches_exist: false, drift_still_costs_batch_spend: true },
    aspect_expectation: T019_V1_ASPECT_EXPECTATION,
  } as const;
}

/* ------------------------------------------------------------------- plan */

export interface T019RequestParams { model: typeof T019_V1_REQUESTED_MODEL; prompt: string; aspect_ratio: AspectRatio; resolution: "1k"; count: 1; use_unlim: false; medias: Array<{ role: "image"; value: typeof T019_MASTER_REFERENCE_JOB_ID }> }
export interface T019AssetRequest { index: number; params: T019RequestParams }
export interface T019Asset { index: number; id: string; category: "HEART"; attribute: string; composition: string; density: string; path: string; aspect_ratio: AspectRatio; core_prompt: string; core_prompt_sha256: string; effective_prompt: string; effective_prompt_sha256: string; request: T019AssetRequest; canonical_request_sha256: string }
export interface T019Batch { id: string; index: number; aspect_ratio: AspectRatio; asset_ids: string[]; size: number }

export const T019_V1_ATTRIBUTES = ["STILL", "BURN", "SCATTER", "ROT", "WASH", "JOIN"] as const;
export const T019_V1_ID_LIST_SHA256 = "e1b132635564a4c930139d09ea0d03e18f39c4f0611c2c450f02e9adcf666885" as const;
export const T019_V1_FIRST_ID = "heart__still" as const;
export const T019_V1_LAST_ID = "heart__join" as const;

interface CoreAsset { id: string; category: string; path: string; aspect_ratio: string; prompt: string }

interface CoreHeartAsset extends CoreAsset { prompt_inputs?: { composition?: string; density?: string; colors?: string[]; attribute?: string } }

/**
 * The six god-heart cards. Acceptance names three things to check against the manifest rather
 * than assume — CELESTIAL composition, MAX density, and the fixed naming — so all three are
 * verified here, alongside the usual aspect, path, and id-set pins.
 *
 * Note the path prefix is `cards/`, shared with T015's 384 canonical cards rather than a
 * directory of its own. Nothing is overwritten: the store is no-clobber and refuses a
 * differing file at an existing path, and none of the six exist yet.
 */
export function selectT019HeartAssets(root: string): CoreHeartAsset[] {
  const core = JSON.parse(readPinnedT019(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256).toString("utf8")) as { assets?: CoreHeartAsset[] };
  const selected = (core.assets ?? []).filter(({ category }) => category === "HEART");
  if (selected.length !== T019_V1_ASSET_COUNT) throw new Error(`T019 expected exactly ${T019_V1_ASSET_COUNT} HEART assets, found ${selected.length}`);
  for (const asset of selected) {
    if (asset.aspect_ratio !== "3:4") throw new Error(`T019 HEART aspect changed at ${asset.id}: ${asset.aspect_ratio}`);
    if (!asset.path.startsWith("cards/") || !asset.path.endsWith(".png")) throw new Error(`T019 HEART path changed at ${asset.id}: ${asset.path}`);
    if (typeof asset.prompt !== "string" || asset.prompt.length === 0) throw new Error(`T019 HEART prompt missing at ${asset.id}`);
    const inputs = asset.prompt_inputs ?? {};
    if (inputs.composition !== "CELESTIAL") throw new Error(`T019 HEART composition changed at ${asset.id}: ${String(inputs.composition)}`);
    if (inputs.density !== "MAX") throw new Error(`T019 HEART density changed at ${asset.id}: ${String(inputs.density)}`);
    if (!(inputs.colors ?? []).includes("GOLD")) throw new Error(`T019 HEART palette lost GOLD at ${asset.id}`);
    const attribute = inputs.attribute ?? "";
    if (!(T019_V1_ATTRIBUTES as readonly string[]).includes(attribute)) throw new Error(`T019 HEART attribute changed at ${asset.id}: ${attribute}`);
    // The designated naming: the id is the attribute, lower-cased, behind `heart__`.
    if (asset.id !== `heart__${attribute.toLowerCase()}`) throw new Error(`T019 HEART naming changed: ${asset.id} does not match attribute ${attribute}`);
  }
  const ids = selected.map(({ id }) => id);
  if (new Set(ids).size !== T019_V1_ASSET_COUNT || new Set(selected.map(({ path }) => path)).size !== T019_V1_ASSET_COUNT) throw new Error("T019 HEART ids or paths are not unique");
  if (ids[0] !== T019_V1_FIRST_ID || ids.at(-1) !== T019_V1_LAST_ID) throw new Error("T019 HEART selection boundary changed");
  if (sha256T019(`${ids.join("\n")}\n`) !== T019_V1_ID_LIST_SHA256) throw new Error("T019 HEART ID set changed");
  // One card per attribute, all six, no duplicates — the whole set or nothing.
  const attributes = selected.map(({ prompt_inputs }) => prompt_inputs?.attribute);
  if (new Set(attributes).size !== T019_V1_ATTRIBUTES.length) throw new Error("T019 HEART attribute coverage changed");
  return selected;
}

export function buildT019Assets(root: string): T019Asset[] {
  return selectT019HeartAssets(root).map((asset, index) => {
    const inputs = asset.prompt_inputs ?? {};
    const effectivePrompt = `${asset.prompt}

Master-style reference instruction: ${T019_REFERENCE_INSTRUCTION}
${T019_NO_COPY_BOUNDARY}`;
    const aspect = asset.aspect_ratio as AspectRatio;
    const request: T019AssetRequest = { index, params: { model: T019_V1_REQUESTED_MODEL, prompt: effectivePrompt, aspect_ratio: aspect, resolution: "1k", count: 1, use_unlim: false, medias: [{ role: "image", value: T019_MASTER_REFERENCE_JOB_ID }] } };
    return {
      index, id: asset.id, category: "HEART" as const, attribute: inputs.attribute ?? "", composition: inputs.composition ?? "", density: inputs.density ?? "",
      path: asset.path, aspect_ratio: aspect,
      core_prompt: asset.prompt, core_prompt_sha256: sha256T019(asset.prompt), effective_prompt: effectivePrompt, effective_prompt_sha256: sha256T019(effectivePrompt),
      request, canonical_request_sha256: sha256T019(canonicalJsonT019(request)),
    };
  });
}

export function buildT019Batches(assets: readonly T019Asset[]): T019Batch[] {
  if (assets.length !== T019_V1_ASSET_COUNT) throw new Error(`T019 batch partition needs exactly ${T019_V1_ASSET_COUNT} assets`);
  const batches: T019Batch[] = [];
  let offset = 0;
  for (const size of T019_V1_BATCH_SIZES) {
    const slice = assets.slice(offset, offset + size);
    if (slice.length !== size) throw new Error("T019 declared batch size does not fit the selection");
    batches.push({ id: `heart-cards-${String(batches.length + 1).padStart(3, "0")}`, index: batches.length, aspect_ratio: slice[0].aspect_ratio, asset_ids: slice.map(({ id }) => id), size });
    offset += size;
  }
  if (batches.length !== T019_V1_BATCH_COUNT || offset !== T019_V1_ASSET_COUNT) throw new Error("T019 batch layout changed");
  if (batches.some(({ size }) => size < 1 || size > T019_V1_BATCH_MAX)) throw new Error("T019 batch exceeds the provider contract maximum");
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const batch of batches) if (batch.asset_ids.some((id) => byId.get(id)?.aspect_ratio !== batch.aspect_ratio)) throw new Error(`T019 batch ${batch.id} is not aspect-homogeneous`);
  if (new Set(batches.flatMap(({ asset_ids }) => asset_ids)).size !== T019_V1_ASSET_COUNT) throw new Error("T019 batch partition is not a partition");
  if (batches[0].id !== T019_V1_CANARY_BATCH_ID) throw new Error("T019 canary batch identity changed");
  return batches;
}

function assertMasterStyleBindingT019(root: string): void {
  const master = JSON.parse(readPinnedT019(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256).toString("utf8")) as { selected_candidate?: { job_id?: string; image_sha256?: string }; reference_element?: { reference_id?: string; revision?: number; reference_instruction?: string }; media_style_lock?: { lock_scope?: string } };
  if (master.selected_candidate?.job_id !== T019_MASTER_REFERENCE_JOB_ID || master.selected_candidate.image_sha256 !== T019_MASTER_REFERENCE_SHA256 || master.reference_element?.reference_id !== T019_MASTER_REFERENCE_ID || master.reference_element.revision !== 1 || master.reference_element.reference_instruction !== T019_REFERENCE_INSTRUCTION || master.media_style_lock?.lock_scope !== "MEDIA_ONLY") throw new Error("T019 master-style binding changed");
  readPinnedT019(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256);
}

export type T019Plan = ReturnType<typeof buildT019Plan>;
export function buildT019Plan(root: string) {
  assertMasterStyleBindingT019(root);
  const risk = buildT019Risk();
  const schema = buildT019Schema();
  const forensics = buildT019Forensics(root);
  const binding = loadT019Binding(root);
  const assets = buildT019Assets(root);
  const batches = buildT019Batches(assets);
  return {
    schema_version: 1, plan_version: "t019-heart-cards-v1", issue_number: T019_ISSUE_NUMBER, issue_contract_sha256: T019_CONTRACT_SHA256,
    state: "HOLD_FOR_EXACT_SCOPED_USER_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: {
      task_key: "T019", category: "HEART", asset_count: T019_V1_ASSET_COUNT,
      attributes: [...T019_V1_ATTRIBUTES], composition: "CELESTIAL", density: "MAX",
      // The T020 contract has bosses reuse these six rather than generating separate world art.
      doubles_as_boss_art: true,
      // HEART_FORGE (36) is dropped by budget reallocation and falls back at runtime.
      heart_forge_generation_allowed: false, heart_forge_out_of_scope_count: 36,
      style_redecision_allowed: false, manifest_id_change_allowed: false, other_categories_allowed: false,
    },
    selection: {
      expression: "core.assets.filter(category === 'HEART'), manifest order",
      id_list_encoding: "UTF-8_IDS_JOINED_BY_NEWLINE_WITH_TRAILING_NEWLINE", id_list_sha256: T019_V1_ID_LIST_SHA256,
      first_id: T019_V1_FIRST_ID, last_id: T019_V1_LAST_ID, unique_ids: true, unique_paths: true,
    },
    sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: T020_CORE_PLAN_SHA256 },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: T020_MASTER_STYLE_SHA256 },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: T020_T014_APPROVAL_SHA256 },
      risk_disclosure: { path: T019_V1_RISK_PATH, sha256: sha256T019(renderT019CanonicalJson(risk)), text_sha256: risk.disclosure_text_sha256 },
      provider_schema: { path: T019_V1_SCHEMA_PATH, sha256: sha256T019(renderT019CanonicalJson(schema)) },
      forensics: { path: T019_V1_FORENSICS_PATH, sha256: sha256T019(renderT019CanonicalJson(forensics)) },
      implementation_binding: { path: T019_V1_BINDING_PATH, sha256: sha256T019(renderT019CanonicalJson(binding)), files: binding.files },
    },
    provider_contract: {
      tool: "generate_image_batch", requested_model: T019_V1_REQUESTED_MODEL, expected_provider_reported_model_for_canary_and_drift: T019_V1_EXPECTED_MODEL,
      model_canary_applies_to_every_batch: true, aspect_ratio_per_asset: true, aspect_homogeneous_batches: true,
      resolution: "1k", count_per_asset: 1, use_unlim: false, batch_max: T019_V1_BATCH_MAX, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET",
    },
    reference_binding: { role: "image", source_job_id: T019_MASTER_REFERENCE_JOB_ID, reference_id: T019_MASTER_REFERENCE_ID, revision: 1, source_sha256: T019_MASTER_REFERENCE_SHA256, lock_scope: "MEDIA_ONLY", reference_instruction: T019_REFERENCE_INSTRUCTION },
    prompt_contract: { core_prompt_preserved_verbatim: true, reference_instruction: T019_REFERENCE_INSTRUCTION, no_copy_boundary: T019_NO_COPY_BOUNDARY, deterministic_text_only: true },
    budget: {
      unit_cost_decimal: decimalT019(T019_V1_UNIT_COST_UNITS), unit_cost_units: T019_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true,
      paid_request_count: T019_V1_ASSET_COUNT, paid_batch_count: T019_V1_BATCH_COUNT, paid_batch_sizes: [...T019_V1_BATCH_SIZES],
      total_credit_cap_decimal: decimalT019(T019_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T019_V1_TOTAL_CAP_UNITS,
      legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00",
      credit_expiry_date: T019_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    },
    cumulative_budget: {
      balance_at_disclosure_decimal: decimalT019(T019_V1_BALANCE_AT_DISCLOSURE_UNITS), balance_at_disclosure_units: T019_V1_BALANCE_AT_DISCLOSURE_UNITS,
      this_task_cap_decimal: decimalT019(T019_V1_TOTAL_CAP_UNITS),
      projected_balance_after_t019_decimal: decimalT019(T019_V1_BALANCE_AT_DISCLOSURE_UNITS - T019_V1_TOTAL_CAP_UNITS),
      remaining_plan_after_t019_decimal: decimalT019(T019_V1_REMAINING_PLAN_AFTER_T019_UNITS), remaining_plan_breakdown: T019_V1_REMAINING_PLAN_BREAKDOWN.map((entry) => ({ ...entry })),
      headroom_after_t019_decimal: decimalT019(T019_V1_BALANCE_AT_DISCLOSURE_UNITS - T019_V1_TOTAL_CAP_UNITS - T019_V1_REMAINING_PLAN_AFTER_T019_UNITS),
      // 3.90 of slack against a 18.00 per-batch exposure: a loss here is not locally absorbed.
      a_single_lost_batch_breaks_the_remaining_plan: true,
      max_single_batch_exposure_decimal: decimalT019(T019_V1_MAX_BATCH_EXPOSURE_UNITS),
    },
    retry_policy: {
      automatic_paid_retry_allowed: false, automatic_paid_retry_count: 0, ambiguous_or_partial_submission_retry_allowed: false,
      single_submission_per_batch: true, ambiguous_submission_windows: T019_V1_BATCH_COUNT,
      ambiguous_window_max_exposure_decimal: decimalT019(T019_V1_MAX_BATCH_EXPOSURE_UNITS),
      operator_recovery_only_for_durable_job_ids: true, operator_gated_resume_never_resubmits: true, fail_stop_scope: "BATCH",
    },
    recovery_policy: {
      local_root: T019_V1_LOCAL_ROOT, backup_root: T019_V1_BACKUP_ROOT, provider_native_unmodified: true, crop_or_resize_allowed: false,
      aspect_ratio_source: "PER_ASSET_FROM_PINNED_CORE_MANIFEST", aspect_expectation: T019_V1_ASPECT_EXPECTATION,
      production_jobs_wait_input: "STDIN_ONLY", signed_urls_or_raw_errors_persisted: false,
    },
    immutable_forensics: forensics.immutable_sources,
    model_canary: { expected_provider_reported_model: T019_V1_EXPECTED_MODEL, applies_to_every_batch: true, canary_batch_id: T019_V1_CANARY_BATCH_ID, blocks_all_later_batches_on_drift: true, later_batches_exist: false, drift_still_costs_batch_spend: true },
    approval_gate: {
      pending_disclosure_packet_path: T019_V1_PENDING_PATH, disclosure_presentation_path: T019_V1_PRESENTATION_PATH,
      controller_disclosure_attestation_path: T019_V1_CONTROLLER_DISCLOSURE_PATH, controller_approval_attestation_path: T019_V1_CONTROLLER_APPROVAL_PATH,
      approval_path: T019_V1_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T019_V1_EXACT_APPROVAL_PHRASE,
      prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true,
    },
    assets, batches,
  } as const;
}
export function renderT019Plan(plan: T019Plan): string { return renderT019CanonicalJson(plan); }
export function t019PlanSha256(plan: T019Plan): string { return sha256T019(renderT019Plan(plan)); }

export function crossCheckT019EffectivePrompts(root: string, plan: T019Plan, indices: readonly number[]): number {
  const source = selectT019HeartAssets(root);
  let checked = 0;
  for (const index of indices) {
    const asset = plan.assets.find((item) => item.index === index);
    const origin = source[index];
    if (!asset || !origin || origin.id !== asset.id || origin.path !== asset.path || origin.aspect_ratio !== asset.aspect_ratio) throw new Error("T019 cross-check asset binding changed");
    const effective = `${asset.core_prompt}\n\nMaster-style reference instruction: ${T019_REFERENCE_INSTRUCTION}\n${T019_NO_COPY_BOUNDARY}`;
    if (effective !== asset.effective_prompt || sha256T019(effective) !== asset.effective_prompt_sha256 || sha256T019(canonicalJsonT019(asset.request)) !== asset.canonical_request_sha256 || asset.request.params.prompt !== asset.effective_prompt || asset.request.params.aspect_ratio !== asset.aspect_ratio) throw new Error("T019 cross-check effective prompt changed");
    checked += 1;
  }
  return checked;
}

/* -------------------------------------------------------- disclosure chain */

export { parseT020BalanceFile as parseT019BalanceFile, type T020BalanceObservation as T019BalanceObservation } from "./t020-world-art-production-v1";

function exactEvidenceT019(actual: unknown, expected: unknown, label: string): void { if (canonicalJsonT019(actual) !== canonicalJsonT019(expected)) throw new Error(`${label} changed or has unknown fields`); }
export function canonicalT019File<T>(root: string, path: string): { value: T; sha256: string } {
  const target = resolve(root, path);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`T019 artifact is not a regular file: ${path}`);
  const bytes = readFileSync(target, "utf8");
  const value = JSON.parse(bytes) as T;
  if (bytes !== renderT019CanonicalJson(value)) throw new Error(`T019 artifact is not canonical: ${path}`);
  return { value, sha256: sha256T019(bytes) };
}
function evidenceTimeT019(value: string, label: string): number { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(`${label} timestamp is not canonical UTC`); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is invalid`); return parsed; }

export type T019Pending = ReturnType<typeof buildT019Pending>;
export function buildT019Pending(root: string, plan: T019Plan) {
  const risk = buildT019Risk(); const schema = buildT019Schema(); const forensics = buildT019Forensics(root); const binding = loadT019Binding(root);
  return {
    schema_version: 1, artifact_version: "t019-heart-cards-disclosure-presentation-v1-pending", status: "PENDING_PRESENTATION_NOT_AUTHORIZED", secret_free: true,
    plan_sha256: t019PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T019(renderT019CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    provider_schema_evidence_sha256: sha256T019(renderT019CanonicalJson(schema)), forensics_evidence_sha256: sha256T019(renderT019CanonicalJson(forensics)),
    core_plan_sha256: T020_CORE_PLAN_SHA256,
    implementation_binding_sha256: sha256T019(renderT019CanonicalJson(binding)), implementation_files: binding.files,
    exact_approval_phrase_required: T019_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T019_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T019_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T019_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true, scope: t019ApprovalScope(), authorized: false,
  } as const;
}

export type T019ControllerDisclosure = ReturnType<typeof buildT019ControllerDisclosure>;
export function buildT019ControllerDisclosure(root: string, plan: T019Plan, disclosedAt: string) {
  evidenceTimeT019(disclosedAt, "T019 disclosure");
  const pending = buildT019Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t019-heart-cards-controller-disclosure-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T019", issue_number: T019_ISSUE_NUMBER, issue_contract_sha256: T019_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: disclosedAt, assistant_disclosure_text_sha256: sha256T019(T019_V1_RISK_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false },
    bindings: { plan_sha256: pending.plan_sha256, pending_disclosure_packet_sha256: sha256T019(renderT019CanonicalJson(pending)), risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256, implementation_binding_sha256: pending.implementation_binding_sha256 },
    scope: t019ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT019ControllerDisclosure(value: unknown, root: string, plan: T019Plan): asserts value is T019ControllerDisclosure {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T019 controller disclosure is invalid");
  const at = (value as { event_sequence?: { assistant_disclosure_presented_at?: unknown } }).event_sequence?.assistant_disclosure_presented_at;
  if (typeof at !== "string") throw new Error("T019 disclosure timestamp missing");
  exactEvidenceT019(value, buildT019ControllerDisclosure(root, plan, at), "T019 controller disclosure");
}

export type T019Presentation = ReturnType<typeof buildT019Presentation>;
export function buildT019Presentation(root: string, plan: T019Plan, balance: { credits: number; provider_observed_at: string } | null) {
  const pending = buildT019Pending(root, plan);
  const controller = canonicalT019File<T019ControllerDisclosure>(root, T019_V1_CONTROLLER_DISCLOSURE_PATH);
  validateT019ControllerDisclosure(controller.value, root, plan);
  const units = balance === null ? null : Math.round(balance.credits * 100);
  const disclosure = balance === null || units === null
    ? { balance_observation_present: false, covers_total_cap: null, balance_disclosure_incomplete: true } as const
    : {
      balance_observation_present: true, observed_balance_decimal: decimalT019(units), observed_balance_units: units,
      provider_observed_at: balance.provider_observed_at, total_credit_cap_decimal: decimalT019(T019_V1_TOTAL_CAP_UNITS),
      projected_remainder_decimal: decimalT019(units - T019_V1_TOTAL_CAP_UNITS), covers_total_cap: units >= T019_V1_TOTAL_CAP_UNITS,
      remaining_plan_after_t019_decimal: decimalT019(T019_V1_REMAINING_PLAN_AFTER_T019_UNITS),
      headroom_after_t019_decimal: decimalT019(units - T019_V1_TOTAL_CAP_UNITS - T019_V1_REMAINING_PLAN_AFTER_T019_UNITS),
      covers_remaining_plan: units - T019_V1_TOTAL_CAP_UNITS >= T019_V1_REMAINING_PLAN_AFTER_T019_UNITS,
      balance_disclosure_incomplete: false,
    } as const;
  return {
    schema_version: 1, evidence_version: "t019-heart-cards-disclosure-presentation-v1", secret_free: true,
    pending_packet_sha256: sha256T019(renderT019CanonicalJson(pending)), plan_sha256: pending.plan_sha256,
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, risk_disclosure_text_ko: T019_V1_RISK_TEXT,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    core_plan_sha256: T020_CORE_PLAN_SHA256,
    controller_disclosure_attestation_sha256: controller.sha256, implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    disclosed_at: controller.value.event_sequence.assistant_disclosure_presented_at, source: "current user conversation",
    balance_disclosure: disclosure, scope: t019ApprovalScope(),
    exact_approval_phrase_required: T019_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T019_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T019_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T019_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true, authorized: false,
  } as const;
}
function presentationBalanceT019(value: unknown): { credits: number; provider_observed_at: string } | null {
  const disclosure = (value as { balance_disclosure?: Record<string, unknown> } | null)?.balance_disclosure;
  if (!disclosure || typeof disclosure !== "object" || disclosure.balance_observation_present !== true) return null;
  const decimalValue = disclosure.observed_balance_decimal; const at = disclosure.provider_observed_at;
  if (typeof decimalValue !== "string" || !/^\d+\.\d{2}$/.test(decimalValue) || typeof at !== "string") throw new Error("T019 presentation balance is invalid");
  return { credits: Number(decimalValue), provider_observed_at: at };
}
export function validateT019Presentation(value: unknown, root: string, plan: T019Plan): asserts value is T019Presentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T019 presentation is invalid");
  exactEvidenceT019(value, buildT019Presentation(root, plan, presentationBalanceT019(value)), "T019 presentation");
}

export type T019ControllerApproval = ReturnType<typeof buildT019ControllerApproval>;
export function buildT019ControllerApproval(root: string, plan: T019Plan, presentation: T019Presentation, approvedAt: string, now = new Date()) {
  validateT019Presentation(presentation, root, plan);
  const disclosedMs = evidenceTimeT019(presentation.disclosed_at, "T019 disclosure");
  const approvedMs = evidenceTimeT019(approvedAt, "T019 approval");
  if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime()) throw new Error("T019 approval chronology is invalid");
  return {
    schema_version: 1, evidence_version: "t019-heart-cards-controller-approval-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T019", issue_number: T019_ISSUE_NUMBER, issue_contract_sha256: T019_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T019_V1_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true },
    bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T019(renderT019CanonicalJson(presentation)), risk_disclosure_evidence_sha256: presentation.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: presentation.risk_disclosure_text_sha256, provider_schema_evidence_sha256: presentation.provider_schema_evidence_sha256, forensics_evidence_sha256: presentation.forensics_evidence_sha256, implementation_binding_sha256: presentation.implementation_binding_sha256 },
    scope: t019ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT019ControllerApproval(value: unknown, root: string, plan: T019Plan, presentation: T019Presentation, now = new Date()): asserts value is T019ControllerApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T019 controller approval is invalid");
  const at = (value as { event_sequence?: { exact_user_reply_received_at?: unknown } }).event_sequence?.exact_user_reply_received_at;
  if (typeof at !== "string") throw new Error("T019 approval timestamp missing");
  exactEvidenceT019(value, buildT019ControllerApproval(root, plan, presentation, at, now), "T019 controller approval");
}

export type T019Approval = ReturnType<typeof buildT019Approval>;
export function buildT019Approval(root: string, plan: T019Plan, presentation: T019Presentation, now = new Date()) {
  validateT019Presentation(presentation, root, plan);
  const controller = canonicalT019File<T019ControllerApproval>(root, T019_V1_CONTROLLER_APPROVAL_PATH);
  validateT019ControllerApproval(controller.value, root, plan, presentation, now);
  const pending = buildT019Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t019-heart-cards-approval-v1", secret_free: true,
    decision: "APPROVE_T019_HEART_CARDS_EXACTLY_6_ASSETS_9_00_CREDIT_CAP", source: "controller approval attestation",
    exact_user_quote: T019_V1_EXACT_APPROVAL_PHRASE, approved_at: controller.value.event_sequence.exact_user_reply_received_at, disclosed_at: presentation.disclosed_at,
    plan_sha256: pending.plan_sha256, disclosure_presentation_evidence_sha256: sha256T019(renderT019CanonicalJson(presentation)),
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    controller_disclosure_attestation_sha256: presentation.controller_disclosure_attestation_sha256,
    controller_approval_attestation_path: T019_V1_CONTROLLER_APPROVAL_PATH, controller_approval_attestation_sha256: controller.sha256,
    implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    core_plan_sha256: T020_CORE_PLAN_SHA256, balance_disclosure: presentation.balance_disclosure, scope: t019ApprovalScope(),
    prior_task_approval_inherited: false, acknowledges_prior_approvals_not_inherited: true, committed_clean_runtime_binding_required: true, automatic_paid_retry_count: 0,
  } as const;
}
export function validateT019Approval(value: unknown, root: string, plan: T019Plan, presentation: T019Presentation, now = new Date()): asserts value is T019Approval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T019 approval is invalid");
  exactEvidenceT019(value, buildT019Approval(root, plan, presentation, now), "T019 approval");
}

export function isT019Authorized(root: string, plan: T019Plan, now = new Date()): boolean {
  try {
    const presentation = canonicalT019File<T019Presentation>(root, T019_V1_PRESENTATION_PATH);
    validateT019Presentation(presentation.value, root, plan);
    const controller = canonicalT019File<T019ControllerApproval>(root, T019_V1_CONTROLLER_APPROVAL_PATH);
    validateT019ControllerApproval(controller.value, root, plan, presentation.value, now);
    const approval = canonicalT019File<T019Approval>(root, T019_V1_APPROVAL_PATH);
    validateT019Approval(approval.value, root, plan, presentation.value, now);
    return true;
  } catch { return false; }
}
export function loadT019Authorization(root: string, plan: T019Plan, now = new Date()): { presentation: T019Presentation; approval: T019Approval } {
  const presentation = canonicalT019File<T019Presentation>(root, T019_V1_PRESENTATION_PATH);
  validateT019Presentation(presentation.value, root, plan);
  const approval = canonicalT019File<T019Approval>(root, T019_V1_APPROVAL_PATH);
  validateT019Approval(approval.value, root, plan, presentation.value, now);
  return { presentation: presentation.value, approval: approval.value };
}
