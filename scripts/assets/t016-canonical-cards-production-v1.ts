import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AspectRatio } from "./types";
import {
  T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256, T020_MASTER_REFERENCE_ID, T020_MASTER_REFERENCE_JOB_ID, T020_MASTER_REFERENCE_SHA256,
  T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256, T020_REFERENCE_INSTRUCTION, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256,
  T020_V1_BATCH_MAX, T020_V1_EXPECTED_MODEL, T020_V1_REQUESTED_MODEL, T020_V1_UNIT_COST_UNITS,
  canonicalJsonT020, decimalT020, readPinnedT020, readRegularT020, renderT020CanonicalJson, sha256T020,
} from "./t020-world-art-production-v1";
import { T016_SELECTION_PATH, loadT016Selection } from "./t016-canonical-selection-v1";

/* Shared primitives keep their T020 names; T016 re-exports them under neutral aliases so its
   own modules read in one vocabulary without duplicating any audited implementation. */
export const sha256T016 = sha256T020;
export const canonicalJsonT016 = canonicalJsonT020;
export const renderT016CanonicalJson = renderT020CanonicalJson;
export const decimalT016 = decimalT020;
export const readRegularT016 = readRegularT020;
export const readPinnedT016 = readPinnedT020;

/* T016 canonical coverage cards: 160 of the 994 unmade CANONICAL pairs, 14 batches, 240.00
   credit hard cap, clean start. The 160 come from the pinned coverage-selection artifact —
   NOT from a frequency score, which the repository has no data to compute. This is the last
   paid task in the plan, so a loss here has nothing downstream to absorb it. */

export const T016_ISSUE_NUMBER = 18 as const;
export const T016_CONTRACT_SHA256 = "ecdba1e3f0a94c7b25d8e61f3ab07c9d4e82f5163b0da97e4c1852f6bd390a7e" as const;

/* ------------------------------------------------------------------ paths */

export const T016_V1_PLAN_PATH = "assets/manifests/t016-canonical-cards-v1.plan.json" as const;
export const T016_V1_BINDING_PATH = "assets/evidence/t016-canonical-cards-implementation-binding-v1.json" as const;
export const T016_V1_RISK_PATH = "assets/evidence/t016-canonical-cards-risk-disclosure-v1.json" as const;
export const T016_V1_SCHEMA_PATH = "assets/evidence/t016-canonical-cards-higgsfield-schema-v1.json" as const;
export const T016_V1_FORENSICS_PATH = "assets/evidence/t016-canonical-cards-forensics-v1.json" as const;
export const T016_V1_PENDING_PATH = "assets/evidence/t016-canonical-cards-disclosure-presentation-v1.pending.json" as const;
export const T016_V1_PRESENTATION_PATH = "assets/evidence/t016-canonical-cards-disclosure-presentation-v1.json" as const;
export const T016_V1_APPROVAL_PATH = "assets/evidence/t016-canonical-cards-approval-v1.json" as const;
export const T016_V1_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t016-canonical-cards-controller-disclosure-attestation-v1.json" as const;
export const T016_V1_CONTROLLER_APPROVAL_PATH = "assets/evidence/t016-canonical-cards-controller-approval-attestation-v1.json" as const;
export const T016_V1_JOURNAL_PATH = "assets/runs/t016-canonical-cards/operations-v1.json" as const;
export const T016_V1_LOCK_PATH = "assets/runs/t016-canonical-cards/operations-v1.lock" as const;
export const T016_V1_LOCAL_ROOT = "public/assets" as const;
export const T016_V1_BACKUP_ROOT = "assets/backups/t016-canonical-cards" as const;
/**
 * Carry-over fix from T020 v2: the index links are built from this same constant as the
 * segment files, so they can never point at another version's directory. v2 hardcoded a v1
 * path in the link template while writing segments to a v2 directory, producing an index of
 * broken links that could not be corrected in place without invalidating a completed run.
 */
export const T016_V1_CONTACT_SEGMENT_DIR = "t016-canonical-cards-v1" as const;
export const T016_V1_CONTACT_ROOT = "docs/asset-runs/contact-sheets" as const;
export const T016_V1_CONTACT_SEGMENT_ROOT = `${T016_V1_CONTACT_ROOT}/${T016_V1_CONTACT_SEGMENT_DIR}` as const;
export const T016_V1_CONTACT_INDEX_PATH = `${T016_V1_CONTACT_ROOT}/${T016_V1_CONTACT_SEGMENT_DIR}.html` as const;

export { T020_CORE_PLAN_PATH as T016_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256 as T016_CORE_PLAN_SHA256 };

/* --------------------------------------------------------------- economics */

export const T016_V1_ASSET_COUNT = 160 as const;
export const T016_V1_BATCH_COUNT = 14 as const;
export const T016_V1_BATCH_SIZES = [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 4] as const;
export const T016_V1_BATCH_MAX = T020_V1_BATCH_MAX;
export const T016_V1_UNIT_COST_UNITS = T020_V1_UNIT_COST_UNITS;
export const T016_V1_TOTAL_CAP_UNITS = 24_000 as const;
export const T016_V1_MAX_BATCH_EXPOSURE_UNITS = 1_800 as const;
export const T016_V1_EXPECTED_MODEL = T020_V1_EXPECTED_MODEL;
export const T016_V1_REQUESTED_MODEL = T020_V1_REQUESTED_MODEL;
export const T016_V1_CANARY_BATCH_ID = "canonical-selected-001" as const;
export const T016_V1_CANARY_BLOCKED_BATCH_ID = "canonical-selected-002" as const;
export const T016_V1_CREDIT_EXPIRY_DATE = "2026-08-17" as const;

/**
 * Cumulative budget context, which Issue #18 requires the run to report rather than assume.
 *
 * T016 is the last paid task, so "remaining plan" is empty and the headroom is whatever the
 * cap does not consume: 243.90 − 240.00 = 3.90. That is smaller than the smallest batch this
 * run can lose (the 4-asset tail at 6.00; a full 12-asset batch is 18.00), so a lost batch is
 * never re-bought — the run simply closes with fewer cards, one card per 1.50 lost. The field
 * below records that, because "a loss here is absorbed later" is true of every earlier task
 * and false of this one.
 */
export const T016_V1_BALANCE_AT_DISCLOSURE_UNITS = 24_390 as const;
/**
 * One source of truth. The approver is shown the per-task breakdown but the headroom is
 * derived from the total, so publishing them as independent constants would let an edit to
 * one contradict the other — a disclosure stating a decomposition that disagrees with its own
 * arithmetic. Both the total and each task's decimal are computed from this list.
 */
/** T016 is the last paid task: nothing remains after it, so the remaining plan is empty. */
const T016_V1_REMAINING_PLAN_TASKS: ReadonlyArray<{ task: string; credit_units: number }> = [];
export const T016_V1_REMAINING_PLAN_BREAKDOWN: ReadonlyArray<{ task: string; credit_units: number; credit_decimal: string }> =
  T016_V1_REMAINING_PLAN_TASKS.map(({ task, credit_units }) => ({ task, credit_units, credit_decimal: decimalT016(credit_units) }));
export const T016_V1_REMAINING_PLAN_AFTER_T016_UNITS: number =
  T016_V1_REMAINING_PLAN_TASKS.reduce((sum, { credit_units }) => sum + credit_units, 0);

/* -------------------------------------------------------------- tolerance */

/**
 * T016 declares exactly one aspect: 3:4 at 5000 ppm.
 *
 * T020's 16:9 tolerance of 12500 is deliberately NOT declared here. It exists only to clear
 * the provider's 32-px grid at 16:9, where the worst case near 1MP is about 11364 ppm. An
 * entry that is unreachable by design still invites a later reader to assume 16:9 is
 * acceptable in this task; an absent entry cannot leak, and the lookup below throws loudly on
 * anything undeclared. The plan selector already refuses a non-3:4 selected asset outright, so
 * this is the second of two independent refusals rather than the only one.
 *
 * 3:4's own delivered geometry is the same grid artifact: 896x1200 measures 4445 ppm off
 * exact, comfortably inside 5000. Known, observed, and not a reason to widen anything.
 */
export const T016_V1_ASPECT_TOLERANCE_PPM: Readonly<Partial<Record<AspectRatio, number>>> = { "3:4": 5_000 };
export function t016AspectTolerancePpm(aspect: AspectRatio): number {
  const tolerance = T016_V1_ASPECT_TOLERANCE_PPM[aspect];
  if (tolerance === undefined) throw new Error(`T016 has no declared tolerance for aspect ${aspect}`);
  return tolerance;
}
export const T016_V1_GRID_PX = 32 as const;
export const T016_V1_ASPECT_EXPECTATION = {
  criterion: "RATIO_ONLY_NO_ABSOLUTE_DIMENSION_REQUIREMENT",
  tolerance_ppm_by_aspect: { "3:4": 5_000 },
  declared_aspects: ["3:4"], undeclared_aspect_throws: true,
  provider_dimension_grid_px: T016_V1_GRID_PX,
  resolution: "1k",
  aspects_in_this_task: ["3:4"],
  observed_3_4: { width: 896, height: 1200, aspect_error_ppm: 4_445, source: "T015 and T020 deliveries", provider_validated: true },
  t020_16_9_tolerance_deliberately_not_declared_here: { tolerance_ppm: 12_500, reason: "16:9-SPECIFIC_GRID_ALLOWANCE_MUST_NOT_LEAK_INTO_3_4" },
  out_of_tolerance_terminal_code: "ASPECT_MISMATCH",
  out_of_tolerance_blocks_all_later_batches: true,
} as const;

/* ---------------------------------------------------------------- prompts */

export const T016_REFERENCE_INSTRUCTION = T020_REFERENCE_INSTRUCTION;
export const T016_NO_COPY_BOUNDARY = "MEDIA_ONLY no-copy boundary: preserve only the approved copperplate line treatment; derive this canonical card's subject, geometry, pose, composition, whitespace, attribute colors, paper tone, density, representation, and aspect from the core canonical prompt, never from the reference subject. Canonical forge cards are 3:4 specimen studies; the reference image's own aspect is never inherited." as const;
export const T016_MASTER_REFERENCE_JOB_ID = T020_MASTER_REFERENCE_JOB_ID;
export const T016_MASTER_REFERENCE_SHA256 = T020_MASTER_REFERENCE_SHA256;
export const T016_MASTER_REFERENCE_ID = T020_MASTER_REFERENCE_ID;

/* ---------------------------------------------------------------- phrases */

export const T016_V1_EXACT_APPROVAL_PHRASE = "T016 canonical 선별 카드 160장 생성을 승인한다. 한도 240.00 크레딧." as const;
export const T016_V1_RECOVERY_OPERATOR_PHRASE = "T016 이 배치의 확정 job ID만 복구하고 새 유료 제출은 하지 않습니다." as const;
export const T016_V1_RESUME_OPERATOR_PHRASE = "T016 실패한 배치를 재제출하지 않고 다음 배치만 진행합니다." as const;
export const T016_V1_LOSS_ACKNOWLEDGMENT_PHRASE = "T016 이 배치의 손실을 확인했고 재제출 없이 손실을 상한에서 차감한 뒤 남은 배치만 진행합니다." as const;

export const T016_V1_RISK_TEXT = `T016은 canonical 카드 160장을 14개 배치([12 x 13, 4])로 배치당 단 한 번씩 유료 생성합니다. 상한은 정확히 240.00 credits(정확 단가 1.50 x 160장)이고 자동 유료 재시도 예산은 0이며, T015/T019/T020/T021 승인은 하나도 상속되지 않습니다. **이 실행은 계획의 마지막 유료 작업입니다.**
(i) 어떤 160장인가 - 전체 canonical 조합 1,326개 중 T015가 이미 만든 332장을 뺀 994개가 후보이고, 그중 160개를 고정된 선별 산출물(${T016_SELECTION_PATH})이 정합니다. 이 산출물은 고정 manifest와 materials 데이터에서 매번 다시 파생되어 바이트가 일치하는지 확인되며, 목록 sha가 조금이라도 달라지면 실행이 시작되지 않습니다.
(ii) 이 선별은 "노출 빈도"가 아니라 "커버리지"입니다 - 원래 계약은 3종족 시작 덱과 터별 재료 드랍 풀에 기반한 결정론적 노출 빈도 점수를 요구했습니다. 그 데이터는 저장소에 존재하지 않습니다. 종족·시작 덱·드랍 풀 정의가 어디에도 없고, 대신 쓸 수 있을 재료 가중치도 없거나 미확정입니다. rarity는 52개 중 30개가 null(PENDING_DEPTH_CLASSIFICATION)이고 potency와 cost_base는 52개 전부 null이며 모든 재료의 balance_status가 PENDING_2026_08_21입니다. rarity만으로 점수를 만들면 994개 후보 중 763개(76.8%)가 신호 없는 재료를 최소 하나 포함하고 257개는 둘 다 신호가 없습니다. 그리고 재료 balance가 확정되는 2026-08-21은 credits 만료일 2026-08-17보다 뒤이므로 데이터를 기다리면 실행 자체가 불가능해집니다. 따라서 이 선별은 빈도를 모형화한다고 주장하지 않습니다. 후보군의 구조를 고르게 덮어 체계적 사각지대를 만들지 않는다고만 주장합니다.
(iii) 기각한 대안 - 첫째, manifest 순서로 앞 160개를 취하는 방식. 중립처럼 보이지만 실제로는 join_03·join_04·join_05가 각각 44번 등장하고 BURN 재료 다섯 개와 join_01은 단 한 번도 나오지 않습니다. 즉 여섯 터가 대칭인 게임에서 BURN 터가 통째로 빠진 160장이 됩니다. 둘째, 진짜 빈도 데이터를 기다리는 방식. 위 날짜 계산으로 불가능합니다.
(iv) 선별 규칙 - 후보를 재료 출신(origin) 쌍으로 35개 버킷에 나누고, 160석을 버킷 크기에 비례해 최대잉여법으로 배분한 뒤, 각 버킷 안에서는 manifest 순서로 채웁니다. 계산은 부동소수점을 쓰지 않고 정수만 씁니다. 잉여가 같을 때는 그 버킷의 첫 후보가 manifest에서 나오는 순서로 정렬해 정합니다. 결과는 35개 버킷 중 34개가 최소 한 석을 받고, 출신별 대표 수는 BURN 6 / JOIN 28 / ODDITY 43 / ROT 43 / SCATTER 43 / STILL 43 / TOOL 71 / WASH 43입니다.
(v) BURN이 낮은 이유 - 규칙이 만든 편향이 아니라 후보군에 원래 있는 비대칭입니다. T015가 BURN 조합을 이미 대부분 가져갔기 때문에 남은 후보에 BURN 쌍이 적습니다. 규칙은 이 비대칭을 만들지도 감추지도 않습니다.
(vi) 남는 실질 위험 - 배치마다 제출 응답을 잃을 수 있는 모호 제출 구간이 정확히 1회씩, 총 14회 존재합니다. 각 구간에서 최대 18.00 credits(12장 x 1.50)가 실제로 차감되고도 응답을 받지 못하면 그 배치의 job ID를 전혀 열거할 수 없어 이미 지불한 이미지를 영구히 회수하지 못할 수 있습니다.
(vii) 누적 예산과 손실의 결과 - 아래 수치는 이 계획을 작성한 시점의 관찰값(as-of)입니다. 승인 시점에 다시 관찰한 잔액으로 공시 문서(presentation)가 여유를 새로 계산하며, 두 값이 다르면 공시 문서 쪽이 정확합니다. 작성 시점 잔액은 243.90이고 이 실행의 상한은 240.00이므로 여유는 3.90입니다. **이 실행은 마지막 유료 작업이므로 손실을 흡수할 후속 작업이 없습니다.** 배치 하나(12장, 18.00)를 잃으면 그 12장은 이 승인으로 다시 만들지 않으며, 실행은 160장이 아니라 148장으로 마감됩니다. 일반화하면 잃은 1.50마다 카드 한 장씩 줄어듭니다. 여유 3.90은 어떤 배치 손실도 메우지 못합니다(최소 손실 단위가 4장 배치의 6.00, 12장 배치는 18.00).
(viii) 각 배치는 단 한 번만 제출합니다. 유료 envelope이 한 번이라도 밖으로 나간 배치는 모호 제출이든 부분 응답이든 즉시 fail-stop하고 어떤 경우에도 재제출하지 않습니다. fail-stop은 배치 단위이며, 지출이 0인 배치만 되돌려 재실행할 수 있습니다. 지출이 발생한 배치는 operator가 정확히 “${T016_V1_LOSS_ACKNOWLEDGMENT_PHRASE}”로 손실을 확인해야만 다음 배치가 열리고, 확인된 손실은 240.00 상한에서 그대로 차감됩니다.
(ix) 과금은 provider가 보고하는 credits_exact(1.50)만 사용합니다. 화면 표시값 credits(1.00)는 기록만 하고 상한 계산에 절대 쓰지 않습니다.
(x) 저장 경로 - 파일은 ${T016_V1_LOCAL_ROOT}/cards/에 저장됩니다. 이 디렉터리는 이미 세 Task가 공유하고 있습니다 - T015의 canonical 카드 332장, T013의 재료 카드 52장, T019의 심장 6장으로 합계 390장입니다. 새 160장은 이름이 겹치지 않는 새 파일로 들어가며 저장은 무클로버라 기존 파일과 내용이 다르면 덮어쓰지 않고 정지합니다. 백업은 ${T016_V1_BACKUP_ROOT} 아래 같은 상대 경로입니다.
(xi) 종횡비 - 3:4만 선언하며 허용치는 5000ppm입니다. provider는 출력 크기를 32픽셀 격자에 맞추고 실제 전달값 896x1200은 4445ppm으로 허용치 안쪽입니다. T020에서 16:9에 적용했던 12500ppm은 16:9 전용 완화이므로 여기에는 선언하지 않습니다.
(xii) 모델 canary는 모든 배치에 적용됩니다. 완료된 job의 provider-reported model이 ${T016_V1_EXPECTED_MODEL}가 아니면 그 배치는 즉시 정지하고 다음 배치는 직전 배치가 모델 확인을 통과할 때까지 열리지 않습니다. MODEL_DRIFT와 ASPECT_MISMATCH는 provider 계약 드리프트로 취급되어 한 번이라도 관찰되면 이후 모든 배치가 영구히 열리지 않습니다.
(xiii) 범위 밖 - 이 실행 뒤에도 만들지 않은 canonical 조합이 834개 남습니다. 이 승인은 그것들을 만들 권한을 포함하지 않습니다. style 재결정과 manifest ID 변경도 범위 밖입니다.
(xiv) 승인 증거의 한계는 이전과 같습니다. operator 문구와 승인 attestation 파일은 모두 agent가 쓸 수 있고 “정확한 사용자 발화”는 코드 상수에서 나옵니다. 실제 인적 게이트는 절차적이며, 사용자가 이 고지를 본 뒤 이 세션에서 정확한 승인 문구를 직접 입력해야 하고 그 사실은 대화 기록으로만 확인됩니다.
(xv) credits는 2026-08-17에 만료됩니다. 정확한 만료 시각은 알 수 없습니다. 모든 요청은 use_unlim:false를 문자 그대로 포함하며 이 값은 각 자산의 canonical_request_sha256 안에 고정되어 있습니다.
signed URL, redirect URL, host, provider raw error는 journal, evidence, stdout 어디에도 기록하지 않습니다. 승인은 정확히 “${T016_V1_EXACT_APPROVAL_PHRASE}”라는 문구로만 기록합니다.` as const;

/* --------------------------------------------------------------- binding */

export const T016_V1_RUNTIME_FILES = {
  controller: "scripts/assets/t016-canonical-cards-production-v1-controller.ts",
  preparation: "scripts/assets/t016-canonical-cards-production-v1-cli.ts",
  production: "scripts/assets/t016-canonical-cards-production-v1-ops.ts",
  contract: "scripts/assets/t016-canonical-cards-production-v1.ts",
  // The selection module is runtime, not documentation: it decides which 160 of the 994 get
  // paid for. Pinning it here means editing the rule after approval changes the binding, the
  // plan sha, and the packet — the approver's consent cannot be silently re-pointed.
  selection: "scripts/assets/t016-canonical-selection-v1.ts",
  provider_transport: "scripts/assets/provider-transport.ts",
  t020_contract: "scripts/assets/t020-world-art-production-v1.ts",
  t020_production: "scripts/assets/t020-world-art-production-v1-ops.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
} as const;

export interface T016Binding { schema_version: 1; manifest_version: "t016-canonical-cards-implementation-binding-v1"; issue_number: typeof T016_ISSUE_NUMBER; issue_contract_sha256: typeof T016_CONTRACT_SHA256; files: Record<keyof typeof T016_V1_RUNTIME_FILES, { path: string; sha256: string }> }
export function buildT016Binding(root: string): T016Binding {
  return {
    schema_version: 1, manifest_version: "t016-canonical-cards-implementation-binding-v1", issue_number: T016_ISSUE_NUMBER, issue_contract_sha256: T016_CONTRACT_SHA256,
    files: Object.fromEntries(Object.entries(T016_V1_RUNTIME_FILES).map(([key, path]) => [key, { path, sha256: sha256T016(readRegularT016(root, path)) }])) as T016Binding["files"],
  };
}
export function loadT016Binding(root: string): T016Binding {
  const bytes = readRegularT016(root, T016_V1_BINDING_PATH).toString("utf8");
  const value = JSON.parse(bytes) as T016Binding;
  if (bytes !== renderT016CanonicalJson(value) || canonicalJsonT016(value) !== canonicalJsonT016(buildT016Binding(root))) throw new Error("T016 implementation binding changed");
  return value;
}

/* -------------------------------------------------------------- forensics */

export type T016Forensics = ReturnType<typeof buildT016Forensics>;
export function buildT016Forensics(root: string) {
  return {
    schema_version: 1, evidence_version: "t016-canonical-cards-forensics-v1", secret_free: true,
    immutable_sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: sha256T016(readPinnedT016(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256)) },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: sha256T016(readPinnedT016(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256)) },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: sha256T016(readPinnedT016(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256)) },
    },
    observed: {
      prior_paid_spend_units: 0, prior_journal_present: false, legacy_recovery_present: false,
      aspect_3_4_provider_validated: true, aspect_3_4_observed: "896x1200", aspect_3_4_observed_error_ppm: 4_445,
      provider_dimension_grid_px: T016_V1_GRID_PX, declared_aspects: ["3:4"], paid_retry_count: 0,
    },
    policy: {
      paid_resubmit_allowed: false, automatic_paid_retry_allowed: false, batch_scoped_fail_stop: true,
      operator_gated_resume_never_resubmits: true, aspect_homogeneous_batches: true,
      unmade_generation_allowed: false, style_redecision_allowed: false, manifest_id_change_allowed: false,
      prior_task_approval_inherited: false,
    },
  } as const;
}

/* ----------------------------------------------------------- risk / schema */

export function t016ApprovalScope() {
  return {
    task_key: "T016", category: "CANONICAL", asset_count: T016_V1_ASSET_COUNT, aspect_ratio: "3:4",
    selection_kind: "COVERAGE_NOT_FREQUENCY", selection_artifact_path: T016_SELECTION_PATH, selection_list_sha256: T016_V1_ID_LIST_SHA256,
    candidate_pool: 994, total_canonical: 1_326, t015_already_made: 332,
    frequency_score_available: false, is_final_paid_task: true,
    batch_count: T016_V1_BATCH_COUNT, batch_sizes: [...T016_V1_BATCH_SIZES], batch_max: T016_V1_BATCH_MAX, aspect_homogeneous_batches: true,
    unit_cost_decimal: decimalT016(T016_V1_UNIT_COST_UNITS), unit_cost_units: T016_V1_UNIT_COST_UNITS,
    total_credit_cap_decimal: decimalT016(T016_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T016_V1_TOTAL_CAP_UNITS,
    legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00", automatic_paid_retry_count: 0,
    max_batch_exposure_decimal: decimalT016(T016_V1_MAX_BATCH_EXPOSURE_UNITS), ambiguous_submission_windows: T016_V1_BATCH_COUNT,
    aspect_tolerance_ppm_3_4: 5_000, aspect_3_4_provider_validated: true, declared_aspects: ["3:4"],
    balance_at_disclosure_decimal: decimalT016(T016_V1_BALANCE_AT_DISCLOSURE_UNITS),
    remaining_plan_after_t016_decimal: decimalT016(T016_V1_REMAINING_PLAN_AFTER_T016_UNITS),
    remaining_plan_breakdown: T016_V1_REMAINING_PLAN_BREAKDOWN.map((entry) => ({ ...entry })),
    headroom_after_t016_decimal: decimalT016(T016_V1_BALANCE_AT_DISCLOSURE_UNITS - T016_V1_TOTAL_CAP_UNITS - T016_V1_REMAINING_PLAN_AFTER_T016_UNITS),
    a_single_lost_batch_breaks_the_remaining_plan: true,
    model_canary_applies_to_every_batch: true, contract_drift_blocks_all_later_batches: true,
    credit_expiry_date: T016_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    unmade_generation_allowed: false, style_redecision_allowed: false, other_categories_allowed: false, prior_task_approval_inherited: false,
  } as const;
}
export function buildT016Risk() {
  return { schema_version: 1, evidence_version: "t016-canonical-cards-risk-disclosure-v1", issue_number: T016_ISSUE_NUMBER, issue_contract_sha256: T016_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T016_V1_RISK_TEXT, disclosure_text_sha256: sha256T016(T016_V1_RISK_TEXT), scope: t016ApprovalScope() } as const;
}
export function buildT016Schema() {
  return {
    schema_version: 1, evidence_version: "t016-canonical-cards-higgsfield-schema-v1", source: "T015 observations plus T020 v1/v2 deliveries", secret_free: true,
    submit: { tool: "generate_image_batch", batch_max: T016_V1_BATCH_MAX, requested_model: T016_V1_REQUESTED_MODEL, expected_provider_reported_model: T016_V1_EXPECTED_MODEL, use_unlim: false, aspect_ratio_per_asset: true, aspect_ratios: ["3:4"], aspect_homogeneous_batches: true, resolution: "1k", count_per_asset: 1, response_required_keys: ["submitted_count", "failed_count", "jobs"], job_required_keys: ["index", "job_id", "status"], job_allowed_optional_keys: ["adjustments", "error", "warning", "preset_recommendation"], any_optional_key_fail_stops_batch: true },
    cost: { display_credits_decimal: "1.00", exact_credits_decimal: "1.50", integer_units_per_image: T016_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true, freshness_ms: 600_000, strictly_monotonic_observations: true },
    jobs_wait: { expected_type: "image", summary_required_keys: ["active", "completed", "errors", "failed", "total"], summary_compared_by_value: true, retryable_presence_only_for_status: "lookup_failed", optional_model_or_result_url_on_non_completed: true, download_only_when_completed: true, poll_intake_enforces_index_and_job_id_uniqueness: true },
    secure_download: { resolver_mapped_ipv6_allowed: false, resolver_public_ipv4_allowed: true, transport_peer_pin_required: true, fresh_connection_per_request: true, auto_select_family: false, remote_address_captured_at_response_headers: true, url_or_host_diagnostics_persisted: false, transport_module: "scripts/assets/provider-transport.ts" },
    model_canary: { canary_batch_id: T016_V1_CANARY_BATCH_ID, applies_to_every_batch: true, blocks_next_batch_until_previous_model_verified: true, blocks_batch_id_on_drift: T016_V1_CANARY_BLOCKED_BATCH_ID, drift_still_costs_batch_spend: true },
    aspect_expectation: T016_V1_ASPECT_EXPECTATION,
  } as const;
}

/* ------------------------------------------------------------------- plan */

export interface T016RequestParams { model: typeof T016_V1_REQUESTED_MODEL; prompt: string; aspect_ratio: AspectRatio; resolution: "1k"; count: 1; use_unlim: false; medias: Array<{ role: "image"; value: typeof T016_MASTER_REFERENCE_JOB_ID }> }
export interface T016AssetRequest { index: number; params: T016RequestParams }
export interface T016Asset { index: number; id: string; category: "CANONICAL"; bucket: string; left: string; right: string; manifest_index: number; path: string; aspect_ratio: AspectRatio; core_prompt: string; core_prompt_sha256: string; effective_prompt: string; effective_prompt_sha256: string; request: T016AssetRequest; canonical_request_sha256: string }
export interface T016Batch { id: string; index: number; aspect_ratio: AspectRatio; asset_ids: string[]; size: number }


/** The selection artifact's own id-list sha; the plan refuses to build if it drifts. */
export const T016_V1_ID_LIST_SHA256 = "d161c90456757ca5f00957b563fd80ace2b3e9a19a0fa5d03e61675e37d264f0" as const;
export const T016_V1_FIRST_ID = "forge__join_02__wash_02" as const;
export const T016_V1_LAST_ID = "forge__tool_01__tool_08" as const;

interface CoreAsset { id: string; category: string; path: string; aspect_ratio: string; prompt: string }

/**
 * The 160 come from the sha-pinned coverage-selection artifact, which is itself re-derived
 * from the pinned core manifest and materials on every load. Selecting here rather than
 * filtering a category is the whole point of T016: which 160 of the 994 were chosen, and by
 * what rule, is the contract-critical decision and it lives in one auditable place.
 */
export function selectT016SelectedAssets(root: string): Array<{ id: string; path: string; aspect_ratio: string; prompt: string; bucket: string; left: string; right: string; manifest_index: number }> {
  const selection = loadT016Selection(root);
  if (selection.value.selection_list_sha256 !== T016_V1_ID_LIST_SHA256) throw new Error("T016 selection list sha changed; the approved 160 are not these 160");
  if (selection.value.selected.length !== T016_V1_ASSET_COUNT) throw new Error(`T016 selection holds ${selection.value.selected.length}, expected ${T016_V1_ASSET_COUNT}`);
  const core = JSON.parse(readPinnedT016(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256).toString("utf8")) as { assets?: Array<{ id: string; category: string; path: string; aspect_ratio: string; prompt: string }> };
  const byId = new Map((core.assets ?? []).filter(({ category }) => category === "CANONICAL").map((asset) => [asset.id, asset]));
  const selected = selection.value.selected.map((entry) => {
    const asset = byId.get(entry.id);
    if (!asset) throw new Error(`T016 selected id is not a CANONICAL asset: ${entry.id}`);
    if (asset.path !== entry.path) throw new Error(`T016 selected path drifted at ${entry.id}`);
    if (asset.aspect_ratio !== "3:4") throw new Error(`T016 aspect changed at ${entry.id}: ${asset.aspect_ratio}`);
    if (!asset.path.startsWith("cards/") || !asset.path.endsWith(".png")) throw new Error(`T016 path changed at ${entry.id}`);
    if (typeof asset.prompt !== "string" || asset.prompt.length === 0) throw new Error(`T016 prompt missing at ${entry.id}`);
    return { id: asset.id, path: asset.path, aspect_ratio: asset.aspect_ratio, prompt: asset.prompt, bucket: entry.bucket, left: entry.left, right: entry.right, manifest_index: entry.manifest_index };
  });
  const ids = selected.map(({ id }) => id);
  if (new Set(ids).size !== T016_V1_ASSET_COUNT || new Set(selected.map(({ path }) => path)).size !== T016_V1_ASSET_COUNT) throw new Error("T016 selected ids or paths are not unique");
  if (ids[0] !== T016_V1_FIRST_ID || ids.at(-1) !== T016_V1_LAST_ID) throw new Error("T016 selection boundary changed");
  if (sha256T016(`${ids.join("\n")}\n`) !== T016_V1_ID_LIST_SHA256) throw new Error("T016 selected ID set changed");
  return selected;
}

export function buildT016Assets(root: string): T016Asset[] {
  return selectT016SelectedAssets(root).map((asset, index) => {
    const effectivePrompt = `${asset.prompt}

Master-style reference instruction: ${T016_REFERENCE_INSTRUCTION}
${T016_NO_COPY_BOUNDARY}`;
    const aspect = asset.aspect_ratio as AspectRatio;
    const request: T016AssetRequest = { index, params: { model: T016_V1_REQUESTED_MODEL, prompt: effectivePrompt, aspect_ratio: aspect, resolution: "1k", count: 1, use_unlim: false, medias: [{ role: "image", value: T016_MASTER_REFERENCE_JOB_ID }] } };
    return {
      index, id: asset.id, category: "CANONICAL" as const, bucket: asset.bucket, left: asset.left, right: asset.right, manifest_index: asset.manifest_index,
      path: asset.path, aspect_ratio: aspect,
      core_prompt: asset.prompt, core_prompt_sha256: sha256T016(asset.prompt), effective_prompt: effectivePrompt, effective_prompt_sha256: sha256T016(effectivePrompt),
      request, canonical_request_sha256: sha256T016(canonicalJsonT016(request)),
    };
  });
}

export function buildT016Batches(assets: readonly T016Asset[]): T016Batch[] {
  if (assets.length !== T016_V1_ASSET_COUNT) throw new Error(`T016 batch partition needs exactly ${T016_V1_ASSET_COUNT} assets, got ${assets.length}`);
  const batches: T016Batch[] = [];
  let offset = 0;
  for (const size of T016_V1_BATCH_SIZES) {
    const slice = assets.slice(offset, offset + size);
    if (slice.length !== size) throw new Error("T016 declared batch size does not fit the selection");
    batches.push({ id: `canonical-selected-${String(batches.length + 1).padStart(3, "0")}`, index: batches.length, aspect_ratio: slice[0].aspect_ratio, asset_ids: slice.map(({ id }) => id), size });
    offset += size;
  }
  if (batches.length !== T016_V1_BATCH_COUNT || offset !== T016_V1_ASSET_COUNT) throw new Error("T016 batch layout changed");
  if (batches.some(({ size }) => size < 1 || size > T016_V1_BATCH_MAX)) throw new Error("T016 batch exceeds the provider contract maximum");
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const batch of batches) if (batch.asset_ids.some((id) => byId.get(id)?.aspect_ratio !== batch.aspect_ratio)) throw new Error(`T016 batch ${batch.id} is not aspect-homogeneous`);
  if (new Set(batches.flatMap(({ asset_ids }) => asset_ids)).size !== T016_V1_ASSET_COUNT) throw new Error("T016 batch partition is not a partition");
  if (batches[0].id !== T016_V1_CANARY_BATCH_ID || batches[1].id !== T016_V1_CANARY_BLOCKED_BATCH_ID) throw new Error("T016 canary batch identity changed");
  return batches;
}

function assertMasterStyleBindingT016(root: string): void {
  const master = JSON.parse(readPinnedT016(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256).toString("utf8")) as { selected_candidate?: { job_id?: string; image_sha256?: string }; reference_element?: { reference_id?: string; revision?: number; reference_instruction?: string }; media_style_lock?: { lock_scope?: string } };
  if (master.selected_candidate?.job_id !== T016_MASTER_REFERENCE_JOB_ID || master.selected_candidate.image_sha256 !== T016_MASTER_REFERENCE_SHA256 || master.reference_element?.reference_id !== T016_MASTER_REFERENCE_ID || master.reference_element.revision !== 1 || master.reference_element.reference_instruction !== T016_REFERENCE_INSTRUCTION || master.media_style_lock?.lock_scope !== "MEDIA_ONLY") throw new Error("T016 master-style binding changed");
  readPinnedT016(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256);
}

export type T016Plan = ReturnType<typeof buildT016Plan>;
export function buildT016Plan(root: string) {
  assertMasterStyleBindingT016(root);
  const risk = buildT016Risk();
  const schema = buildT016Schema();
  const forensics = buildT016Forensics(root);
  const binding = loadT016Binding(root);
  const assets = buildT016Assets(root);
  const batches = buildT016Batches(assets);
  return {
    schema_version: 1, plan_version: "t016-canonical-cards-v1", issue_number: T016_ISSUE_NUMBER, issue_contract_sha256: T016_CONTRACT_SHA256,
    state: "HOLD_FOR_EXACT_SCOPED_USER_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: {
      task_key: "T016", category: "CANONICAL", asset_count: T016_V1_ASSET_COUNT,
      selection_kind: "COVERAGE_NOT_FREQUENCY", candidate_pool: 994, total_canonical: 1_326, t015_already_made: 332,
      // The remaining 834 unmade pairs are out of scope; this approval does not cover them.
      unmade_after_this_task: 834, unmade_generation_allowed: false,
      style_redecision_allowed: false, manifest_id_change_allowed: false, other_categories_allowed: false,
    },
    selection: {
      expression: "the sha-pinned coverage-selection artifact's ids, in its own order",
      // Coverage, not frequency. The frequency inputs the contract asked for do not exist in
      // the repository; the artifact records that finding, the rule actually used, and the
      // alternatives rejected. Naming it in the plan keeps the approver from reading
      // "selected" as "highest-exposure".
      kind: "COVERAGE_NOT_FREQUENCY", frequency_score_available: false,
      artifact_path: T016_SELECTION_PATH, artifact_sha256: loadT016Selection(root).sha256,
      rule: "proportional-to-bucket-size largest-remainder over origin-pair buckets, integer arithmetic, manifest order within each bucket",
      id_list_encoding: "UTF-8_IDS_JOINED_BY_NEWLINE_WITH_TRAILING_NEWLINE", id_list_sha256: T016_V1_ID_LIST_SHA256,
      first_id: T016_V1_FIRST_ID, last_id: T016_V1_LAST_ID, unique_ids: true, unique_paths: true,
    },
    sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: T020_CORE_PLAN_SHA256 },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: T020_MASTER_STYLE_SHA256 },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: T020_T014_APPROVAL_SHA256 },
      risk_disclosure: { path: T016_V1_RISK_PATH, sha256: sha256T016(renderT016CanonicalJson(risk)), text_sha256: risk.disclosure_text_sha256 },
      provider_schema: { path: T016_V1_SCHEMA_PATH, sha256: sha256T016(renderT016CanonicalJson(schema)) },
      forensics: { path: T016_V1_FORENSICS_PATH, sha256: sha256T016(renderT016CanonicalJson(forensics)) },
      implementation_binding: { path: T016_V1_BINDING_PATH, sha256: sha256T016(renderT016CanonicalJson(binding)), files: binding.files },
    },
    provider_contract: {
      tool: "generate_image_batch", requested_model: T016_V1_REQUESTED_MODEL, expected_provider_reported_model_for_canary_and_drift: T016_V1_EXPECTED_MODEL,
      model_canary_applies_to_every_batch: true, aspect_ratio_per_asset: true, aspect_homogeneous_batches: true,
      resolution: "1k", count_per_asset: 1, use_unlim: false, batch_max: T016_V1_BATCH_MAX, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET",
    },
    reference_binding: { role: "image", source_job_id: T016_MASTER_REFERENCE_JOB_ID, reference_id: T016_MASTER_REFERENCE_ID, revision: 1, source_sha256: T016_MASTER_REFERENCE_SHA256, lock_scope: "MEDIA_ONLY", reference_instruction: T016_REFERENCE_INSTRUCTION },
    prompt_contract: { core_prompt_preserved_verbatim: true, reference_instruction: T016_REFERENCE_INSTRUCTION, no_copy_boundary: T016_NO_COPY_BOUNDARY, deterministic_text_only: true },
    budget: {
      unit_cost_decimal: decimalT016(T016_V1_UNIT_COST_UNITS), unit_cost_units: T016_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true,
      paid_request_count: T016_V1_ASSET_COUNT, paid_batch_count: T016_V1_BATCH_COUNT, paid_batch_sizes: [...T016_V1_BATCH_SIZES],
      total_credit_cap_decimal: decimalT016(T016_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T016_V1_TOTAL_CAP_UNITS,
      legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00",
      credit_expiry_date: T016_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    },
    cumulative_budget: {
      balance_at_disclosure_decimal: decimalT016(T016_V1_BALANCE_AT_DISCLOSURE_UNITS), balance_at_disclosure_units: T016_V1_BALANCE_AT_DISCLOSURE_UNITS,
      this_task_cap_decimal: decimalT016(T016_V1_TOTAL_CAP_UNITS),
      projected_balance_after_t016_decimal: decimalT016(T016_V1_BALANCE_AT_DISCLOSURE_UNITS - T016_V1_TOTAL_CAP_UNITS),
      remaining_plan_after_t016_decimal: decimalT016(T016_V1_REMAINING_PLAN_AFTER_T016_UNITS), remaining_plan_breakdown: T016_V1_REMAINING_PLAN_BREAKDOWN.map((entry) => ({ ...entry })),
      headroom_after_t016_decimal: decimalT016(T016_V1_BALANCE_AT_DISCLOSURE_UNITS - T016_V1_TOTAL_CAP_UNITS - T016_V1_REMAINING_PLAN_AFTER_T016_UNITS),
      // 3.90 of slack against an 18.00 per-batch exposure, with nothing downstream to absorb it.
      is_final_paid_task: true, remaining_plan_task_count: 0,
      a_lost_batch_reduces_this_task_scope: true,
      cards_lost_per_credit_unit_lost: "1 card per 1.50",
      headroom_covers_smallest_batch_loss: false,
      max_single_batch_exposure_decimal: decimalT016(T016_V1_MAX_BATCH_EXPOSURE_UNITS),
    },
    retry_policy: {
      automatic_paid_retry_allowed: false, automatic_paid_retry_count: 0, ambiguous_or_partial_submission_retry_allowed: false,
      single_submission_per_batch: true, ambiguous_submission_windows: T016_V1_BATCH_COUNT,
      ambiguous_window_max_exposure_decimal: decimalT016(T016_V1_MAX_BATCH_EXPOSURE_UNITS),
      operator_recovery_only_for_durable_job_ids: true, operator_gated_resume_never_resubmits: true, fail_stop_scope: "BATCH",
    },
    recovery_policy: {
      local_root: T016_V1_LOCAL_ROOT, backup_root: T016_V1_BACKUP_ROOT, provider_native_unmodified: true, crop_or_resize_allowed: false,
      aspect_ratio_source: "PER_ASSET_FROM_PINNED_CORE_MANIFEST", aspect_expectation: T016_V1_ASPECT_EXPECTATION,
      production_jobs_wait_input: "STDIN_ONLY", signed_urls_or_raw_errors_persisted: false,
    },
    immutable_forensics: forensics.immutable_sources,
    model_canary: { expected_provider_reported_model: T016_V1_EXPECTED_MODEL, applies_to_every_batch: true, canary_batch_id: T016_V1_CANARY_BATCH_ID, blocks_batch_id_on_drift: T016_V1_CANARY_BLOCKED_BATCH_ID, drift_still_costs_batch_spend: true },
    approval_gate: {
      pending_disclosure_packet_path: T016_V1_PENDING_PATH, disclosure_presentation_path: T016_V1_PRESENTATION_PATH,
      controller_disclosure_attestation_path: T016_V1_CONTROLLER_DISCLOSURE_PATH, controller_approval_attestation_path: T016_V1_CONTROLLER_APPROVAL_PATH,
      approval_path: T016_V1_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T016_V1_EXACT_APPROVAL_PHRASE,
      prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true,
    },
    assets, batches,
  } as const;
}
export function renderT016Plan(plan: T016Plan): string { return renderT016CanonicalJson(plan); }
export function t016PlanSha256(plan: T016Plan): string { return sha256T016(renderT016Plan(plan)); }

export function crossCheckT016EffectivePrompts(root: string, plan: T016Plan, indices: readonly number[]): number {
  const source = selectT016SelectedAssets(root);
  let checked = 0;
  for (const index of indices) {
    const asset = plan.assets.find((item) => item.index === index);
    const origin = source[index];
    if (!asset || !origin || origin.id !== asset.id || origin.path !== asset.path || origin.aspect_ratio !== asset.aspect_ratio) throw new Error("T016 cross-check asset binding changed");
    const effective = `${asset.core_prompt}\n\nMaster-style reference instruction: ${T016_REFERENCE_INSTRUCTION}\n${T016_NO_COPY_BOUNDARY}`;
    if (effective !== asset.effective_prompt || sha256T016(effective) !== asset.effective_prompt_sha256 || sha256T016(canonicalJsonT016(asset.request)) !== asset.canonical_request_sha256 || asset.request.params.prompt !== asset.effective_prompt || asset.request.params.aspect_ratio !== asset.aspect_ratio) throw new Error("T016 cross-check effective prompt changed");
    checked += 1;
  }
  return checked;
}

/* -------------------------------------------------------- disclosure chain */

export { parseT020BalanceFile as parseT016BalanceFile, type T020BalanceObservation as T016BalanceObservation } from "./t020-world-art-production-v1";

function exactEvidenceT016(actual: unknown, expected: unknown, label: string): void { if (canonicalJsonT016(actual) !== canonicalJsonT016(expected)) throw new Error(`${label} changed or has unknown fields`); }
export function canonicalT016File<T>(root: string, path: string): { value: T; sha256: string } {
  const target = resolve(root, path);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`T016 artifact is not a regular file: ${path}`);
  const bytes = readFileSync(target, "utf8");
  const value = JSON.parse(bytes) as T;
  if (bytes !== renderT016CanonicalJson(value)) throw new Error(`T016 artifact is not canonical: ${path}`);
  return { value, sha256: sha256T016(bytes) };
}
function evidenceTimeT016(value: string, label: string): number { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(`${label} timestamp is not canonical UTC`); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is invalid`); return parsed; }

export type T016Pending = ReturnType<typeof buildT016Pending>;
export function buildT016Pending(root: string, plan: T016Plan) {
  const risk = buildT016Risk(); const schema = buildT016Schema(); const forensics = buildT016Forensics(root); const binding = loadT016Binding(root);
  return {
    schema_version: 1, artifact_version: "t016-canonical-cards-disclosure-presentation-v1-pending", status: "PENDING_PRESENTATION_NOT_AUTHORIZED", secret_free: true,
    plan_sha256: t016PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T016(renderT016CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    provider_schema_evidence_sha256: sha256T016(renderT016CanonicalJson(schema)), forensics_evidence_sha256: sha256T016(renderT016CanonicalJson(forensics)),
    core_plan_sha256: T020_CORE_PLAN_SHA256,
    implementation_binding_sha256: sha256T016(renderT016CanonicalJson(binding)), implementation_files: binding.files,
    exact_approval_phrase_required: T016_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T016_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T016_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T016_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true, scope: t016ApprovalScope(), authorized: false,
  } as const;
}

export type T016ControllerDisclosure = ReturnType<typeof buildT016ControllerDisclosure>;
export function buildT016ControllerDisclosure(root: string, plan: T016Plan, disclosedAt: string) {
  evidenceTimeT016(disclosedAt, "T016 disclosure");
  const pending = buildT016Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t016-canonical-cards-controller-disclosure-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T016", issue_number: T016_ISSUE_NUMBER, issue_contract_sha256: T016_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: disclosedAt, assistant_disclosure_text_sha256: sha256T016(T016_V1_RISK_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false },
    bindings: { plan_sha256: pending.plan_sha256, pending_disclosure_packet_sha256: sha256T016(renderT016CanonicalJson(pending)), risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256, implementation_binding_sha256: pending.implementation_binding_sha256 },
    scope: t016ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT016ControllerDisclosure(value: unknown, root: string, plan: T016Plan): asserts value is T016ControllerDisclosure {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T016 controller disclosure is invalid");
  const at = (value as { event_sequence?: { assistant_disclosure_presented_at?: unknown } }).event_sequence?.assistant_disclosure_presented_at;
  if (typeof at !== "string") throw new Error("T016 disclosure timestamp missing");
  exactEvidenceT016(value, buildT016ControllerDisclosure(root, plan, at), "T016 controller disclosure");
}

export type T016Presentation = ReturnType<typeof buildT016Presentation>;
export function buildT016Presentation(root: string, plan: T016Plan, balance: { credits: number; provider_observed_at: string } | null) {
  const pending = buildT016Pending(root, plan);
  const controller = canonicalT016File<T016ControllerDisclosure>(root, T016_V1_CONTROLLER_DISCLOSURE_PATH);
  validateT016ControllerDisclosure(controller.value, root, plan);
  const units = balance === null ? null : Math.round(balance.credits * 100);
  const disclosure = balance === null || units === null
    ? { balance_observation_present: false, covers_total_cap: null, balance_disclosure_incomplete: true } as const
    : {
      balance_observation_present: true, observed_balance_decimal: decimalT016(units), observed_balance_units: units,
      provider_observed_at: balance.provider_observed_at, total_credit_cap_decimal: decimalT016(T016_V1_TOTAL_CAP_UNITS),
      projected_remainder_decimal: decimalT016(units - T016_V1_TOTAL_CAP_UNITS), covers_total_cap: units >= T016_V1_TOTAL_CAP_UNITS,
      remaining_plan_after_t016_decimal: decimalT016(T016_V1_REMAINING_PLAN_AFTER_T016_UNITS),
      headroom_after_t016_decimal: decimalT016(units - T016_V1_TOTAL_CAP_UNITS - T016_V1_REMAINING_PLAN_AFTER_T016_UNITS),
      covers_remaining_plan: units - T016_V1_TOTAL_CAP_UNITS >= T016_V1_REMAINING_PLAN_AFTER_T016_UNITS,
      balance_disclosure_incomplete: false,
    } as const;
  return {
    schema_version: 1, evidence_version: "t016-canonical-cards-disclosure-presentation-v1", secret_free: true,
    pending_packet_sha256: sha256T016(renderT016CanonicalJson(pending)), plan_sha256: pending.plan_sha256,
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, risk_disclosure_text_ko: T016_V1_RISK_TEXT,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    core_plan_sha256: T020_CORE_PLAN_SHA256,
    controller_disclosure_attestation_sha256: controller.sha256, implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    disclosed_at: controller.value.event_sequence.assistant_disclosure_presented_at, source: "current user conversation",
    balance_disclosure: disclosure, scope: t016ApprovalScope(),
    exact_approval_phrase_required: T016_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T016_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T016_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T016_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true, authorized: false,
  } as const;
}
function presentationBalanceT016(value: unknown): { credits: number; provider_observed_at: string } | null {
  const disclosure = (value as { balance_disclosure?: Record<string, unknown> } | null)?.balance_disclosure;
  if (!disclosure || typeof disclosure !== "object" || disclosure.balance_observation_present !== true) return null;
  const decimalValue = disclosure.observed_balance_decimal; const at = disclosure.provider_observed_at;
  if (typeof decimalValue !== "string" || !/^\d+\.\d{2}$/.test(decimalValue) || typeof at !== "string") throw new Error("T016 presentation balance is invalid");
  return { credits: Number(decimalValue), provider_observed_at: at };
}
export function validateT016Presentation(value: unknown, root: string, plan: T016Plan): asserts value is T016Presentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T016 presentation is invalid");
  exactEvidenceT016(value, buildT016Presentation(root, plan, presentationBalanceT016(value)), "T016 presentation");
}

export type T016ControllerApproval = ReturnType<typeof buildT016ControllerApproval>;
export function buildT016ControllerApproval(root: string, plan: T016Plan, presentation: T016Presentation, approvedAt: string, now = new Date()) {
  validateT016Presentation(presentation, root, plan);
  const disclosedMs = evidenceTimeT016(presentation.disclosed_at, "T016 disclosure");
  const approvedMs = evidenceTimeT016(approvedAt, "T016 approval");
  if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime()) throw new Error("T016 approval chronology is invalid");
  return {
    schema_version: 1, evidence_version: "t016-canonical-cards-controller-approval-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T016", issue_number: T016_ISSUE_NUMBER, issue_contract_sha256: T016_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T016_V1_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true },
    bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T016(renderT016CanonicalJson(presentation)), risk_disclosure_evidence_sha256: presentation.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: presentation.risk_disclosure_text_sha256, provider_schema_evidence_sha256: presentation.provider_schema_evidence_sha256, forensics_evidence_sha256: presentation.forensics_evidence_sha256, implementation_binding_sha256: presentation.implementation_binding_sha256 },
    scope: t016ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT016ControllerApproval(value: unknown, root: string, plan: T016Plan, presentation: T016Presentation, now = new Date()): asserts value is T016ControllerApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T016 controller approval is invalid");
  const at = (value as { event_sequence?: { exact_user_reply_received_at?: unknown } }).event_sequence?.exact_user_reply_received_at;
  if (typeof at !== "string") throw new Error("T016 approval timestamp missing");
  exactEvidenceT016(value, buildT016ControllerApproval(root, plan, presentation, at, now), "T016 controller approval");
}

export type T016Approval = ReturnType<typeof buildT016Approval>;
export function buildT016Approval(root: string, plan: T016Plan, presentation: T016Presentation, now = new Date()) {
  validateT016Presentation(presentation, root, plan);
  const controller = canonicalT016File<T016ControllerApproval>(root, T016_V1_CONTROLLER_APPROVAL_PATH);
  validateT016ControllerApproval(controller.value, root, plan, presentation, now);
  const pending = buildT016Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t016-canonical-cards-approval-v1", secret_free: true,
    decision: "APPROVE_T016_CANONICAL_COVERAGE_EXACTLY_160_ASSETS_240_00_CREDIT_CAP", source: "controller approval attestation",
    exact_user_quote: T016_V1_EXACT_APPROVAL_PHRASE, approved_at: controller.value.event_sequence.exact_user_reply_received_at, disclosed_at: presentation.disclosed_at,
    plan_sha256: pending.plan_sha256, disclosure_presentation_evidence_sha256: sha256T016(renderT016CanonicalJson(presentation)),
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    controller_disclosure_attestation_sha256: presentation.controller_disclosure_attestation_sha256,
    controller_approval_attestation_path: T016_V1_CONTROLLER_APPROVAL_PATH, controller_approval_attestation_sha256: controller.sha256,
    implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    core_plan_sha256: T020_CORE_PLAN_SHA256, balance_disclosure: presentation.balance_disclosure, scope: t016ApprovalScope(),
    prior_task_approval_inherited: false, acknowledges_prior_approvals_not_inherited: true, committed_clean_runtime_binding_required: true, automatic_paid_retry_count: 0,
  } as const;
}
export function validateT016Approval(value: unknown, root: string, plan: T016Plan, presentation: T016Presentation, now = new Date()): asserts value is T016Approval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T016 approval is invalid");
  exactEvidenceT016(value, buildT016Approval(root, plan, presentation, now), "T016 approval");
}

export function isT016Authorized(root: string, plan: T016Plan, now = new Date()): boolean {
  try {
    const presentation = canonicalT016File<T016Presentation>(root, T016_V1_PRESENTATION_PATH);
    validateT016Presentation(presentation.value, root, plan);
    const controller = canonicalT016File<T016ControllerApproval>(root, T016_V1_CONTROLLER_APPROVAL_PATH);
    validateT016ControllerApproval(controller.value, root, plan, presentation.value, now);
    const approval = canonicalT016File<T016Approval>(root, T016_V1_APPROVAL_PATH);
    validateT016Approval(approval.value, root, plan, presentation.value, now);
    return true;
  } catch { return false; }
}
export function loadT016Authorization(root: string, plan: T016Plan, now = new Date()): { presentation: T016Presentation; approval: T016Approval } {
  const presentation = canonicalT016File<T016Presentation>(root, T016_V1_PRESENTATION_PATH);
  validateT016Presentation(presentation.value, root, plan);
  const approval = canonicalT016File<T016Approval>(root, T016_V1_APPROVAL_PATH);
  validateT016Approval(approval.value, root, plan, presentation.value, now);
  return { presentation: presentation.value, approval: approval.value };
}
