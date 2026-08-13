import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AspectRatio } from "./types";
import {
  T020_CONTRACT_SHA256, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256, T020_ISSUE_NUMBER, T020_MASTER_REFERENCE_ID, T020_MASTER_REFERENCE_JOB_ID,
  T020_MASTER_REFERENCE_SHA256, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256, T020_NO_COPY_BOUNDARY, T020_REFERENCE_INSTRUCTION,
  T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256, T020_V1_ASSET_COUNT, T020_V1_BACKGROUND_ASSET_COUNT, T020_V1_BATCH_MAX,
  T020_V1_ENEMY_ASSET_COUNT, T020_V1_EXPECTED_MODEL, T020_V1_ID_LIST_SHA256, T020_V1_JOURNAL_PATH, T020_V1_REQUESTED_MODEL,
  T020_V1_UNIT_COST_UNITS, buildT020Assets, canonicalJsonT020, decimalT020, readPinnedT020, readRegularT020, renderT020CanonicalJson,
  sha256T020, type T020Asset,
} from "./t020-world-art-production-v1";

export { canonicalJsonT020, decimalT020, renderT020CanonicalJson, sha256T020 };

/* T020 v2: the same 54 world assets, after v1's batch 1 fail-stopped on delivered geometry.
   6 already-billed images are recovered at zero cost from their v1 job IDs; the remaining 48
   are generated under a 72.00 cap. The v1 journal is closed, immutable, and pinned here. */

/* ------------------------------------------------------------------ paths */

export const T020_V2_PLAN_PATH = "assets/manifests/t020-world-art-v2.plan.json" as const;
export const T020_V2_BINDING_PATH = "assets/evidence/t020-world-art-implementation-binding-v2.json" as const;
export const T020_V2_RISK_PATH = "assets/evidence/t020-world-art-risk-disclosure-v2.json" as const;
export const T020_V2_SCHEMA_PATH = "assets/evidence/t020-world-art-higgsfield-schema-v2.json" as const;
export const T020_V2_FORENSICS_PATH = "assets/evidence/t020-world-art-forensics-v2.json" as const;
export const T020_V2_PENDING_PATH = "assets/evidence/t020-world-art-disclosure-presentation-v2.pending.json" as const;
export const T020_V2_PRESENTATION_PATH = "assets/evidence/t020-world-art-disclosure-presentation-v2.json" as const;
export const T020_V2_APPROVAL_PATH = "assets/evidence/t020-world-art-approval-v2.json" as const;
export const T020_V2_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t020-world-art-controller-disclosure-attestation-v2.json" as const;
export const T020_V2_CONTROLLER_APPROVAL_PATH = "assets/evidence/t020-world-art-controller-approval-attestation-v2.json" as const;
export const T020_V2_JOURNAL_PATH = "assets/runs/t020-world-art/operations-v2.json" as const;
export const T020_V2_LOCK_PATH = "assets/runs/t020-world-art/operations-v2.lock" as const;
export const T020_V2_LOCAL_ROOT = "public/assets" as const;
export const T020_V2_BACKUP_ROOT = "assets/backups/t020-world-art" as const;
export const T020_V2_CONTACT_INDEX_PATH = "docs/asset-runs/contact-sheets/t020-world-art-v2.html" as const;
export const T020_V2_CONTACT_SEGMENT_ROOT = "docs/asset-runs/contact-sheets/t020-world-art-v2" as const;

/**
 * The v1 journal is closed (CLOSED_WITH_LOSSES) and lives under the gitignored runtime path.
 * A byte copy is committed as evidence and pinned here, so the forensic chain survives in git
 * without force-adding an ignored path or moving the runtime location.
 */
export const T020_V1_JOURNAL_FORENSIC_PATH = "assets/evidence/t020-world-art-v1-final-journal-forensic.json" as const;
export const T020_V1_JOURNAL_FORENSIC_SHA256 = "2f017a34afb7aadef6d0bd2ff93e30bc02e7c916fb36066225e78ce6b6e51636" as const;
export const T020_V1_APPROVAL_PATH_PINNED = "assets/evidence/t020-world-art-approval-v1.json" as const;
export const T020_V1_PLAN_PATH_PINNED = "assets/manifests/t020-world-art-v1.plan.json" as const;
export { T020_V1_JOURNAL_PATH };

/* --------------------------------------------------------------- economics */

export const T020_V2_TOTAL_ASSET_COUNT = T020_V1_ASSET_COUNT;
/** The six 16:9 backgrounds v1 already paid for; recovered under v2 at zero additional cost. */
export const T020_V2_LEGACY_ASSET_COUNT = 6 as const;
export const T020_V2_PAID_ASSET_COUNT = 48 as const;
export const T020_V2_BATCH_COUNT = 4 as const;
export const T020_V2_BATCH_SIZES = [12, 12, 12, 12] as const;
export const T020_V2_UNIT_COST_UNITS = T020_V1_UNIT_COST_UNITS;
export const T020_V2_TOTAL_CAP_UNITS = 7_200 as const;
/** Booked and closed in v1. v2 adds no new claim on it; it is disclosed, not re-charged. */
export const T020_V2_V1_SUNK_UNITS = 900 as const;
export const T020_V2_MAX_BATCH_EXPOSURE_UNITS = 1_800 as const;
export const T020_V2_EXPECTED_MODEL = T020_V1_EXPECTED_MODEL;
export const T020_V2_REQUESTED_MODEL = T020_V1_REQUESTED_MODEL;
export const T020_V2_CANARY_BATCH_ID = "world-art-v2-001" as const;
export const T020_V2_CANARY_BLOCKED_BATCH_ID = "world-art-v2-002" as const;
export const T020_V2_CREDIT_EXPIRY_DATE = "2026-08-17" as const;

/* -------------------------------------------------------------- tolerance */

/**
 * Per-aspect tolerance, derived from the mechanism v1 exposed rather than from one reading.
 *
 * The provider quantizes output dimensions to a 32-px grid. For a 16:9 target at height
 * h = 32k the ideal width is 512k/9 and the delivered width is the nearest grid point, so the
 * ratio error is bounded by (4/9 · 32) / (512k/9) = 0.25/k. v1 observed 1376x768 (k=24) at
 * 7813 ppm. The worst case for plausible ~1MP heights (k >= 22) is about 11364 ppm, and
 * h=800 (k=25) lands on exactly 10000 — so a 10000 ppm limit would sit on the boundary.
 * 12500 clears the mechanism with margin.
 *
 * It still rejects a genuine aspect change: 7:4 is 15625 ppm and 4:3 is 250000 ppm.
 *
 * Deliberate boundary: 1344x768 — the grid point below, had the provider rounded down rather
 * than to nearest — also scores exactly 15625 and is indistinguishable from a real 7:4
 * delivery. v2 therefore accepts round-to-nearest quantization and refuses round-down. If the
 * provider ever switches policy we want a new disclosure, not a silent accept.
 *
 * 3:4 stays at 5000: its observed 4445 ppm is the same artifact already inside tolerance, and
 * widening it would only discard signal.
 */
export const T020_V2_ASPECT_TOLERANCE_PPM: Readonly<Record<AspectRatio, number>> = { "3:4": 5_000, "16:9": 12_500 };
export function t020V2AspectTolerancePpm(aspect: AspectRatio): number {
  const tolerance = T020_V2_ASPECT_TOLERANCE_PPM[aspect];
  if (tolerance === undefined) throw new Error(`T020 v2 has no declared tolerance for aspect ${aspect}`);
  return tolerance;
}
export const T020_V2_GRID_PX = 32 as const;
export const T020_V2_ASPECT_EXPECTATION = {
  criterion: "RATIO_ONLY_NO_ABSOLUTE_DIMENSION_REQUIREMENT",
  tolerance_ppm_by_aspect: { "3:4": 5_000, "16:9": 12_500 },
  provider_dimension_grid_px: T020_V2_GRID_PX,
  resolution: "1k",
  observed_3_4: { width: 896, height: 1200, aspect_error_ppm: 4_445, source: "T015 recovered PNGs", provider_validated: true },
  observed_16_9: { width: 1376, height: 768, aspect_error_ppm: 7_813, source: "T020 v1 batch world-art-001 delivery", provider_validated: true, accepted_under_v1_tolerance: false, accepted_under_v2_tolerance: true },
  grid_worst_case_16_9_ppm_at_1mp: 11_364,
  boundary_examples_16_9: [
    { dimensions: "1408x800", aspect_error_ppm: 10_000, note: "GRID_NEAREST_LANDS_EXACTLY_ON_A_10000_LIMIT" },
    { dimensions: "1344x768", ratio: "7:4", aspect_error_ppm: 15_625, note: "GRID_ROUND_DOWN_INDISTINGUISHABLE_FROM_A_REAL_7_4_DELIVERY_REFUSED" },
    { dimensions: "1024x768", ratio: "4:3", aspect_error_ppm: 250_000, note: "REFUSED" },
  ],
  out_of_tolerance_terminal_code: "ASPECT_MISMATCH",
  out_of_tolerance_blocks_all_later_batches: true,
} as const;

/* ---------------------------------------------------------------- phrases */

export const T020_V2_EXACT_APPROVAL_PHRASE = "T020 세계 아트 v2 실행을 승인한다. 신규 한도 72.00 크레딧, 기존 6장 무비용 복구 포함." as const;
export const T020_V2_LEGACY_RECOVERY_PHRASE = "T020 v2 기존 6장의 확정 job ID만 무비용으로 복구하고 새 유료 제출은 하지 않습니다." as const;
export const T020_V2_RECOVERY_OPERATOR_PHRASE = "T020 v2 이 배치의 확정 job ID만 복구하고 새 유료 제출은 하지 않습니다." as const;
export const T020_V2_RESUME_OPERATOR_PHRASE = "T020 v2 실패한 배치를 재제출하지 않고 다음 배치만 진행합니다." as const;
export const T020_V2_LOSS_ACKNOWLEDGMENT_PHRASE = "T020 v2 이 배치의 손실을 확인했고 재제출 없이 손실을 상한에서 차감한 뒤 남은 배치만 진행합니다." as const;

export const T020_V2_RISK_TEXT = `T020 v2는 v1 배치 1이 전달 화소 비율 때문에 정지한 뒤의 후속 실행입니다. 전체 범위는 v1과 같은 세계 아트 54장이고, 그중 6장(배경 16:9)은 v1에서 이미 과금되어 job ID가 남아 있으므로 추가 비용 0으로 회수합니다. 나머지 48장(배경 12장 + 적 36장)만 새로 생성하며 신규 상한은 정확히 72.00 credits(1.50 x 48장)입니다. 자동 유료 재시도 예산은 0이고, v1 승인은 상속되지 않습니다.
(i) v1에서 무슨 일이 있었는지 - v1 배치 world-art-001은 6장 모두 제출·완료되었고 provider가 보고한 model은 전부 ${T020_V2_EXPECTED_MODEL}로 정상이었습니다. 실패 원인은 모델이 아니라 전달된 화소 크기였습니다. 요청은 16:9였으나 provider는 1376x768을 내려주었고, 이는 정확한 16:9 대비 7813ppm 오차로 v1의 허용치 5000ppm을 넘었습니다. 규율대로 이미지는 한 장도 저장하지 않고 정지했으며, 9.00 credits는 실제로 차감되어 v1 저널에 손실로 확정 기록되고 실행은 CLOSED_WITH_LOSSES로 마감되었습니다.
(ii) 원인 진단 - provider는 출력 크기를 32픽셀 격자에 맞춥니다(1376 = 43x32, 768 = 24x32). 높이 h = 32k인 16:9에서 이상적 너비는 512k/9이고 실제로는 가장 가까운 격자점이 오므로 비율 오차는 0.25/k로 제한됩니다. 1MP 부근(k >= 22)의 최악값은 약 11364ppm이고, h=800(k=25)은 정확히 10000ppm에 떨어집니다. 3:4의 관찰값 4445ppm도 같은 현상이며 단지 5000 안쪽이었을 뿐입니다. 즉 이것은 결함이 아니라 provider의 크기 정책이고, v1의 허용치가 그 정책을 담기에 좁았던 것입니다.
(iii) v2의 허용치 - 16:9는 12500ppm, 3:4는 5000ppm 그대로입니다. 12500은 위 격자 메커니즘의 최악값을 여유 있게 덮으면서도 실제 비율이 다른 전달은 그대로 거부합니다(7:4은 15625ppm, 4:3은 250000ppm). 한 가지 경계를 분명히 밝힙니다. provider가 반올림 대신 내림을 택했다면 1344x768이 왔을 것이고 그 값은 15625ppm으로 진짜 7:4 전달과 화소만으로는 구별되지 않습니다. v2는 반올림 양자화는 받아들이고 내림은 거부합니다. provider가 정책을 바꾸면 조용히 통과시키지 않고 새 고지와 새 승인을 요구하겠다는 뜻입니다.
(iv) 무비용 복구가 먼저입니다 - 유료 배치를 하나라도 열기 전에, v1에서 이미 과금된 6장을 그 job ID로 회수합니다. 이 단계는 credits를 전혀 쓰지 않으며, 동시에 새 허용치가 실제 전달물에서 통하는지 확인하는 검문 역할을 합니다. 6장이 새 허용치에서도 통과하지 못하면 유료 배치는 열리지 않습니다. 다만 provider의 result URL은 저장하지 않는 규율이므로, 회수는 실행 시점에 job ID를 다시 조회해 얻는 새 응답으로 수행합니다.
(v) job ID 만료 가능성 - 위 6개 job이 실행 시점에 더 이상 조회되지 않으면 무비용 회수는 불가능합니다. 그 경우 v2는 자동으로 유료 재생성으로 넘어가지 않고 정지합니다. 6장을 다시 만들려면 신규 상한이 72.00이 아니라 81.00이 되어야 하고, 그것은 이 승인의 범위가 아니므로 별도의 새 고지와 새 승인이 필요합니다.
(vi) 유료 부분의 규율은 v1과 동일합니다 - 48장을 4개 배치(각 12장)로 나누고 배치당 단 한 번만 제출합니다. 배치마다 모호 제출 구간이 정확히 1회씩 총 4회 있고 각 구간의 최대 노출은 18.00입니다. 모호·부분 제출은 절대 자동 재제출하지 않으며 fail-stop은 배치 단위입니다. 지출이 0인 배치만 되돌려 재실행할 수 있고, 지출이 발생한 배치는 operator가 정확히 “${T020_V2_LOSS_ACKNOWLEDGMENT_PHRASE}”로 손실을 확인해야만 다음 배치가 열립니다.
(vii) 과금은 provider가 보고하는 credits_exact(1.50)만 사용합니다. 화면 표시값 credits(1.00)는 기록만 하고 상한 계산에 쓰지 않습니다.
(viii) 모델 canary는 모든 배치에 적용됩니다. 완료된 job의 provider-reported model이 ${T020_V2_EXPECTED_MODEL}가 아니면 그 배치는 즉시 정지하고 다음 배치는 열리지 않습니다. MODEL_DRIFT와 ASPECT_MISMATCH는 provider 계약 드리프트로 취급되어 한 번이라도 관찰되면 이후 모든 배치가 영구히 열리지 않으며, 손실 확인과 재개 문구로도 열 수 없습니다. 다만 두 코드 모두 손실 코드이므로 이미 쓴 금액은 저널에 정직하게 기록되고 실행은 CLOSED_WITH_LOSSES로 닫힙니다.
(ix) 승인 증거의 한계는 v1과 같습니다. operator 문구와 승인 attestation 파일은 모두 agent가 쓸 수 있고 “정확한 사용자 발화”는 코드 상수에서 나옵니다. 실제 인적 게이트는 절차적이며, 사용자가 이 고지를 본 뒤 이 세션에서 정확한 승인 문구를 직접 입력해야 하고 그 사실은 대화 기록으로만 확인됩니다.
(x) 금액 정리 - v1에서 이미 확정 손실로 기록된 9.00은 되돌릴 수 없습니다. v2가 그 6장을 무비용으로 회수하면 그 9.00은 손실이 아니라 실제로 받은 이미지의 대가가 되어 순 금전 손실은 0이 됩니다. v2가 전부 성공하면 T020 전체 지출은 9.00 + 72.00 = 81.00으로 원래 승인했던 총액과 같고 54장을 모두 확보합니다.
(xi) 저장 경로와 범위는 v1과 같습니다. 배경은 ${T020_V2_LOCAL_ROOT}/backgrounds/, 적과 엘리트는 ${T020_V2_LOCAL_ROOT}/enemies/이고 백업은 ${T020_V2_BACKUP_ROOT} 아래 같은 상대 경로입니다. 보스는 신의 심장 카드 아트를 재사용하므로 별도 세계 아트를 만들지 않고, 이벤트 아트 20장은 T021의 범위입니다.
(xii) v1 저널은 한 바이트도 고치지 않습니다. 마감된 v1 저널의 바이트 사본을 증거로 커밋하고 sha256으로 고정해 v2의 불변 포렌식에 싣습니다.
signed URL, redirect URL, host, provider raw error는 journal, evidence, stdout 어디에도 기록하지 않습니다. 승인은 정확히 “${T020_V2_EXACT_APPROVAL_PHRASE}”라는 문구로만 기록합니다.` as const;

/* --------------------------------------------------------------- binding */

export const T020_V2_RUNTIME_FILES = {
  controller: "scripts/assets/t020-world-art-production-v2-controller.ts",
  preparation: "scripts/assets/t020-world-art-production-v2-cli.ts",
  production: "scripts/assets/t020-world-art-production-v2-ops.ts",
  contract: "scripts/assets/t020-world-art-production-v2.ts",
  v1_contract: "scripts/assets/t020-world-art-production-v1.ts",
  v1_production: "scripts/assets/t020-world-art-production-v1-ops.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
} as const;

export interface T020V2Binding { schema_version: 2; manifest_version: "t020-world-art-implementation-binding-v2"; issue_number: typeof T020_ISSUE_NUMBER; issue_contract_sha256: typeof T020_CONTRACT_SHA256; files: Record<keyof typeof T020_V2_RUNTIME_FILES, { path: string; sha256: string }> }
export function buildT020V2Binding(root: string): T020V2Binding {
  return {
    schema_version: 2, manifest_version: "t020-world-art-implementation-binding-v2", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    files: Object.fromEntries(Object.entries(T020_V2_RUNTIME_FILES).map(([key, path]) => [key, { path, sha256: sha256T020(readRegularT020(root, path)) }])) as T020V2Binding["files"],
  };
}
export function loadT020V2Binding(root: string): T020V2Binding {
  const bytes = readRegularT020(root, T020_V2_BINDING_PATH).toString("utf8");
  const value = JSON.parse(bytes) as T020V2Binding;
  if (bytes !== renderT020CanonicalJson(value) || canonicalJsonT020(value) !== canonicalJsonT020(buildT020V2Binding(root))) throw new Error("T020 v2 implementation binding changed");
  return value;
}

/* ------------------------------------------------------- v1 legacy source */

export interface T020V2LegacyJob { index: number; asset_id: string; job_id: string; canonical_request_sha256: string; path: string; aspect_ratio: AspectRatio }

interface V1JournalShape {
  schema_version: number; journal_version: string; run_state: string; plan_sha256: string;
  batches: Array<{ batch_id: string; state: string; asset_ids: string[]; terminals: Array<{ code: string }>; discharges: Array<{ kind: string; acknowledged_loss_units: number; observed_delta_units: number }>; recoveries: unknown[]; submission?: { jobs: Array<{ index: number; asset_id: string; job_id: string; canonical_request_sha256: string }> } }>;
}

/**
 * The closed v1 journal, read from its committed byte copy and pinned by sha256. Every
 * invariant v2 depends on is re-checked here rather than assumed: the run is closed, exactly
 * one batch was discharged, it booked exactly 9.00, nothing was ever recovered, and its six
 * confirmed jobs line up one-for-one with the first six plan assets.
 */
export function loadPinnedT020V1Journal(root: string): { value: V1JournalShape; sha256: string; jobs: T020V2LegacyJob[] } {
  const bytes = readPinnedT020(root, T020_V1_JOURNAL_FORENSIC_PATH, T020_V1_JOURNAL_FORENSIC_SHA256);
  const value = JSON.parse(bytes.toString("utf8")) as V1JournalShape;
  if (value.schema_version !== 1 || value.journal_version !== "t020-world-art-operations-v1" || value.run_state !== "CLOSED_WITH_LOSSES") throw new Error("T020 v2 pinned v1 journal is not a closed v1 journal");
  const discharged = value.batches.filter(({ discharges }) => discharges.some(({ kind }) => kind === "LOSS_ACKNOWLEDGED"));
  if (discharged.length !== 1) throw new Error("T020 v2 expects exactly one discharged v1 batch");
  const batch = discharged[0];
  if (batch.batch_id !== "world-art-001" || !batch.terminals.some(({ code }) => code === "ASPECT_MISMATCH")) throw new Error("T020 v2 pinned v1 discharge is not the batch-1 aspect mismatch");
  const booked = value.batches.reduce((sum, record) => sum + record.discharges.reduce((batchSum, discharge) => batchSum + discharge.observed_delta_units, 0), 0);
  if (booked !== T020_V2_V1_SUNK_UNITS) throw new Error(`T020 v2 pinned v1 spend changed: ${booked}`);
  if (value.batches.some(({ recoveries }) => recoveries.length > 0)) throw new Error("T020 v2 pinned v1 journal recovered assets; the legacy set would not be six");
  const jobs = batch.submission?.jobs ?? [];
  if (jobs.length !== T020_V2_LEGACY_ASSET_COUNT) throw new Error("T020 v2 pinned v1 batch does not carry exactly six confirmed jobs");
  const assets = buildT020Assets(root);
  const bound = jobs.map((job) => {
    const asset = assets[job.index];
    if (!asset || asset.id !== job.asset_id || asset.canonical_request_sha256 !== job.canonical_request_sha256) throw new Error(`T020 v2 legacy job binding changed at index ${job.index}`);
    if (asset.aspect_ratio !== "16:9") throw new Error("T020 v2 legacy assets must all be 16:9 backgrounds");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(job.job_id)) throw new Error("T020 v2 legacy job id is malformed");
    return { index: job.index, asset_id: job.asset_id, job_id: job.job_id, canonical_request_sha256: job.canonical_request_sha256, path: asset.path, aspect_ratio: asset.aspect_ratio };
  });
  if (new Set(bound.map(({ job_id }) => job_id)).size !== T020_V2_LEGACY_ASSET_COUNT) throw new Error("T020 v2 legacy job ids are not distinct");
  if (bound.some((job, offset) => job.index !== offset)) throw new Error("T020 v2 legacy jobs are not plan indices 0..5");
  return { value, sha256: sha256T020(bytes), jobs: bound };
}

/* -------------------------------------------------------------- forensics */

export type T020V2Forensics = ReturnType<typeof buildT020V2Forensics>;
export function buildT020V2Forensics(root: string) {
  const v1 = loadPinnedT020V1Journal(root);
  return {
    schema_version: 2, evidence_version: "t020-world-art-forensics-v2", secret_free: true,
    immutable_sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: T020_CORE_PLAN_SHA256 },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: T020_MASTER_STYLE_SHA256 },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: T020_T014_APPROVAL_SHA256 },
      v1_journal_forensic_copy: { path: T020_V1_JOURNAL_FORENSIC_PATH, sha256: v1.sha256, runtime_path: T020_V1_JOURNAL_PATH, mutated: false },
      v1_plan: { path: T020_V1_PLAN_PATH_PINNED, sha256: sha256T020(readRegularT020(root, T020_V1_PLAN_PATH_PINNED)) },
      v1_approval: { path: T020_V1_APPROVAL_PATH_PINNED, sha256: sha256T020(readRegularT020(root, T020_V1_APPROVAL_PATH_PINNED)) },
    },
    observed: {
      v1_run_state: "CLOSED_WITH_LOSSES", v1_discharged_batch: "world-art-001", v1_terminal_code: "ASPECT_MISMATCH",
      v1_spend_units: T020_V2_V1_SUNK_UNITS, v1_recovered_asset_count: 0, v1_confirmed_job_count: T020_V2_LEGACY_ASSET_COUNT,
      v1_delivered_dimensions: "1376x768", v1_delivered_aspect_error_ppm: 7_813, v1_tolerance_ppm: 5_000,
      provider_dimension_grid_px: T020_V2_GRID_PX, model_canary_passed_in_v1: true, paid_retry_count: 0,
    },
    policy: {
      mutate_v1_journal: false, legacy_recovery_is_zero_cost: true, legacy_recovery_precedes_any_paid_batch: true,
      expired_legacy_jobs_fall_back_to_paid_regeneration: false, expired_legacy_jobs_fail_stop: true,
      automatic_paid_retry_allowed: false, batch_scoped_fail_stop: true, aspect_homogeneous_batches: true,
      prior_task_approval_inherited: false,
    },
  } as const;
}

/* ----------------------------------------------------------- risk / schema */

export function t020V2ApprovalScope() {
  return {
    task_key: "T020", revision: "v2", total_asset_count: T020_V2_TOTAL_ASSET_COUNT,
    legacy_recovered_asset_count: T020_V2_LEGACY_ASSET_COUNT, legacy_recovery_credit_units: 0,
    paid_asset_count: T020_V2_PAID_ASSET_COUNT, paid_batch_count: T020_V2_BATCH_COUNT, paid_batch_sizes: [...T020_V2_BATCH_SIZES],
    batch_max: T020_V1_BATCH_MAX, aspect_homogeneous_batches: true,
    unit_cost_decimal: decimalT020(T020_V2_UNIT_COST_UNITS), unit_cost_units: T020_V2_UNIT_COST_UNITS,
    new_credit_cap_decimal: decimalT020(T020_V2_TOTAL_CAP_UNITS), new_credit_cap_units: T020_V2_TOTAL_CAP_UNITS,
    v1_sunk_decimal: decimalT020(T020_V2_V1_SUNK_UNITS), v1_sunk_units: T020_V2_V1_SUNK_UNITS,
    combined_t020_spend_on_full_success_decimal: decimalT020(T020_V2_V1_SUNK_UNITS + T020_V2_TOTAL_CAP_UNITS),
    net_monetary_loss_target_decimal: "0.00",
    aspect_tolerance_ppm_3_4: 5_000, aspect_tolerance_ppm_16_9: 12_500, provider_dimension_grid_px: T020_V2_GRID_PX,
    automatic_paid_retry_reserve_decimal: "0.00", automatic_paid_retry_count: 0,
    max_batch_exposure_decimal: decimalT020(T020_V2_MAX_BATCH_EXPOSURE_UNITS), ambiguous_submission_windows: T020_V2_BATCH_COUNT,
    model_canary_applies_to_every_batch: true, contract_drift_blocks_all_later_batches: true,
    legacy_job_expiry_falls_back_to_paid: false, credit_expiry_date: T020_V2_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    boss_world_art_allowed: false, event_art_allowed: false, prior_task_approval_inherited: false,
  } as const;
}
export function buildT020V2Risk() {
  return { schema_version: 2, evidence_version: "t020-world-art-risk-disclosure-v2", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T020_V2_RISK_TEXT, disclosure_text_sha256: sha256T020(T020_V2_RISK_TEXT), scope: t020V2ApprovalScope() } as const;
}
export function buildT020V2Schema() {
  return {
    schema_version: 2, evidence_version: "t020-world-art-higgsfield-schema-v2", source: "T015 observations plus the T020 v1 batch-1 delivery", secret_free: true,
    submit: { tool: "generate_image_batch", batch_max: T020_V1_BATCH_MAX, requested_model: T020_V2_REQUESTED_MODEL, expected_provider_reported_model: T020_V2_EXPECTED_MODEL, use_unlim: false, aspect_ratio_per_asset: true, aspect_ratios: ["3:4", "16:9"], aspect_homogeneous_batches: true, resolution: "1k", count_per_asset: 1, response_required_keys: ["submitted_count", "failed_count", "jobs"], job_required_keys: ["index", "job_id", "status"], job_allowed_optional_keys: ["adjustments", "error", "warning", "preset_recommendation"], any_optional_key_fail_stops_batch: true },
    cost: { display_credits_decimal: "1.00", exact_credits_decimal: "1.50", integer_units_per_image: T020_V2_UNIT_COST_UNITS, billing_uses_credits_exact_only: true, freshness_ms: 600_000, strictly_monotonic_observations: true, unpaid_16_9_get_cost_matches_3_4: true },
    jobs_wait: { expected_type: "image", summary_required_keys: ["active", "completed", "errors", "failed", "total"], summary_compared_by_value: true, retryable_presence_only_for_status: "lookup_failed", optional_model_or_result_url_on_non_completed: true, download_only_when_completed: true, legacy_job_ids_repollable: "UNKNOWN_AT_DISCLOSURE_TIME_VERIFIED_AT_EXECUTION" },
    secure_download: { resolver_mapped_ipv6_allowed: false, resolver_public_ipv4_allowed: true, transport_peer_pin_required: true, fresh_connection_per_request: true, auto_select_family: false, remote_address_captured_at_response_headers: true, url_or_host_diagnostics_persisted: false },
    model_canary: { canary_batch_id: T020_V2_CANARY_BATCH_ID, applies_to_every_batch: true, blocks_next_batch_until_previous_model_verified: true, drift_still_costs_batch_spend: true },
    aspect_expectation: T020_V2_ASPECT_EXPECTATION,
  } as const;
}

/* ------------------------------------------------------------------- plan */

export interface T020V2Batch { id: string; index: number; group: string; aspect_ratio: AspectRatio; asset_ids: string[]; size: number }

/** The 48 assets v1 never paid for: plan indices 6..53, i.e. everything after the legacy six. */
export function buildT020V2PaidAssets(root: string): T020Asset[] {
  const assets = buildT020Assets(root);
  if (assets.length !== T020_V2_TOTAL_ASSET_COUNT) throw new Error("T020 v2 total asset count changed");
  const paid = assets.slice(T020_V2_LEGACY_ASSET_COUNT);
  if (paid.length !== T020_V2_PAID_ASSET_COUNT) throw new Error("T020 v2 paid asset count changed");
  if (paid.filter(({ aspect_ratio }) => aspect_ratio === "16:9").length !== T020_V1_BACKGROUND_ASSET_COUNT - T020_V2_LEGACY_ASSET_COUNT) throw new Error("T020 v2 remaining background count changed");
  if (paid.filter(({ aspect_ratio }) => aspect_ratio === "3:4").length !== T020_V1_ENEMY_ASSET_COUNT) throw new Error("T020 v2 enemy count changed");
  return paid;
}

export function buildT020V2Batches(paid: readonly T020Asset[]): T020V2Batch[] {
  const batches: T020V2Batch[] = [];
  for (const group of ["BACKGROUND", "ENEMY"] as const) {
    const members = paid.filter(({ group: key }) => key === group);
    for (let offset = 0; offset < members.length; offset += T020_V1_BATCH_MAX) {
      const slice = members.slice(offset, offset + T020_V1_BATCH_MAX);
      batches.push({ id: `world-art-v2-${String(batches.length + 1).padStart(3, "0")}`, index: batches.length, group, aspect_ratio: slice[0].aspect_ratio, asset_ids: slice.map(({ id }) => id), size: slice.length });
    }
  }
  if (batches.length !== T020_V2_BATCH_COUNT || canonicalJsonT020(batches.map(({ size }) => size)) !== canonicalJsonT020([...T020_V2_BATCH_SIZES])) throw new Error("T020 v2 batch layout changed");
  if (batches.reduce((sum, { size }) => sum + size, 0) !== T020_V2_PAID_ASSET_COUNT) throw new Error("T020 v2 batch partition does not cover the paid slice");
  const byId = new Map(paid.map((asset) => [asset.id, asset]));
  for (const batch of batches) if (batch.asset_ids.some((id) => byId.get(id)?.aspect_ratio !== batch.aspect_ratio)) throw new Error(`T020 v2 batch ${batch.id} is not aspect-homogeneous`);
  if (batches[0].id !== T020_V2_CANARY_BATCH_ID || batches[1].id !== T020_V2_CANARY_BLOCKED_BATCH_ID) throw new Error("T020 v2 canary batch identity changed");
  return batches;
}

function assertMasterStyleBindingV2(root: string): void {
  const master = JSON.parse(readPinnedT020(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256).toString("utf8")) as { selected_candidate?: { job_id?: string; image_sha256?: string }; reference_element?: { reference_id?: string; revision?: number; reference_instruction?: string }; media_style_lock?: { lock_scope?: string } };
  if (master.selected_candidate?.job_id !== T020_MASTER_REFERENCE_JOB_ID || master.selected_candidate.image_sha256 !== T020_MASTER_REFERENCE_SHA256 || master.reference_element?.reference_id !== T020_MASTER_REFERENCE_ID || master.reference_element.revision !== 1 || master.reference_element.reference_instruction !== T020_REFERENCE_INSTRUCTION || master.media_style_lock?.lock_scope !== "MEDIA_ONLY") throw new Error("T020 v2 master-style binding changed");
  readPinnedT020(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256);
}

export type T020V2Plan = ReturnType<typeof buildT020V2Plan>;
export function buildT020V2Plan(root: string) {
  assertMasterStyleBindingV2(root);
  const risk = buildT020V2Risk();
  const schema = buildT020V2Schema();
  const forensics = buildT020V2Forensics(root);
  const binding = loadT020V2Binding(root);
  const legacy = loadPinnedT020V1Journal(root);
  const assets = buildT020V2PaidAssets(root);
  const batches = buildT020V2Batches(assets);
  return {
    schema_version: 2, plan_version: "t020-world-art-v2", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    state: "HOLD_FOR_EXACT_SCOPED_USER_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: {
      task_key: "T020", revision: "v2", total_asset_count: T020_V2_TOTAL_ASSET_COUNT,
      legacy_slice: "0..5", legacy_asset_count: T020_V2_LEGACY_ASSET_COUNT,
      paid_slice: "6..53", paid_asset_count: T020_V2_PAID_ASSET_COUNT,
      boss_world_art_allowed: false, event_art_allowed: false, other_categories_allowed: false,
    },
    selection: {
      expression: "T020 v1 selection, then split at index 6: 0..5 legacy (already billed), 6..53 paid",
      v1_id_list_sha256: T020_V1_ID_LIST_SHA256, first_paid_id: assets[0].id, last_paid_id: assets.at(-1)!.id, unique_ids: true,
    },
    sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: T020_CORE_PLAN_SHA256 },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: T020_MASTER_STYLE_SHA256 },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: T020_T014_APPROVAL_SHA256 },
      v1_journal_forensic_copy: { path: T020_V1_JOURNAL_FORENSIC_PATH, sha256: legacy.sha256 },
      risk_disclosure: { path: T020_V2_RISK_PATH, sha256: sha256T020(renderT020CanonicalJson(risk)), text_sha256: risk.disclosure_text_sha256 },
      provider_schema: { path: T020_V2_SCHEMA_PATH, sha256: sha256T020(renderT020CanonicalJson(schema)) },
      forensics: { path: T020_V2_FORENSICS_PATH, sha256: sha256T020(renderT020CanonicalJson(forensics)) },
      implementation_binding: { path: T020_V2_BINDING_PATH, sha256: sha256T020(renderT020CanonicalJson(binding)), files: binding.files },
    },
    provider_contract: {
      tool: "generate_image_batch", requested_model: T020_V2_REQUESTED_MODEL, expected_provider_reported_model_for_canary_and_drift: T020_V2_EXPECTED_MODEL,
      model_canary_applies_to_every_batch: true, aspect_ratio_per_asset: true, aspect_homogeneous_batches: true,
      resolution: "1k", count_per_asset: 1, use_unlim: false, batch_max: T020_V1_BATCH_MAX, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET",
    },
    reference_binding: { role: "image", source_job_id: T020_MASTER_REFERENCE_JOB_ID, reference_id: T020_MASTER_REFERENCE_ID, revision: 1, source_sha256: T020_MASTER_REFERENCE_SHA256, lock_scope: "MEDIA_ONLY", reference_instruction: T020_REFERENCE_INSTRUCTION },
    prompt_contract: { core_prompt_preserved_verbatim: true, reference_instruction: T020_REFERENCE_INSTRUCTION, no_copy_boundary: T020_NO_COPY_BOUNDARY, deterministic_text_only: true, unchanged_from_v1: true },
    budget: {
      unit_cost_decimal: decimalT020(T020_V2_UNIT_COST_UNITS), unit_cost_units: T020_V2_UNIT_COST_UNITS, billing_uses_credits_exact_only: true,
      paid_request_count: T020_V2_PAID_ASSET_COUNT, paid_batch_count: T020_V2_BATCH_COUNT, paid_batch_sizes: [...T020_V2_BATCH_SIZES],
      new_credit_cap_decimal: decimalT020(T020_V2_TOTAL_CAP_UNITS), new_credit_cap_units: T020_V2_TOTAL_CAP_UNITS,
      legacy_recovery_credit_units: 0, v1_sunk_units: T020_V2_V1_SUNK_UNITS, v1_sunk_decimal: decimalT020(T020_V2_V1_SUNK_UNITS),
      combined_t020_spend_on_full_success_decimal: decimalT020(T020_V2_V1_SUNK_UNITS + T020_V2_TOTAL_CAP_UNITS),
      net_monetary_loss_target_decimal: "0.00", automatic_paid_retry_reserve_decimal: "0.00",
      credit_expiry_date: T020_V2_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    },
    retry_policy: {
      automatic_paid_retry_allowed: false, automatic_paid_retry_count: 0, ambiguous_or_partial_submission_retry_allowed: false,
      single_submission_per_batch: true, ambiguous_submission_windows: T020_V2_BATCH_COUNT,
      ambiguous_window_max_exposure_decimal: decimalT020(T020_V2_MAX_BATCH_EXPOSURE_UNITS),
      operator_recovery_only_for_durable_job_ids: true, operator_gated_resume_never_resubmits: true, fail_stop_scope: "BATCH",
    },
    recovery_policy: {
      local_root: T020_V2_LOCAL_ROOT, backup_root: T020_V2_BACKUP_ROOT, provider_native_unmodified: true, crop_or_resize_allowed: false,
      aspect_ratio_source: "PER_ASSET_FROM_PINNED_CORE_MANIFEST", aspect_expectation: T020_V2_ASPECT_EXPECTATION,
      production_jobs_wait_input: "STDIN_ONLY", signed_urls_or_raw_errors_persisted: false,
    },
    legacy_recovery: {
      slice: "0..5", asset_count: T020_V2_LEGACY_ASSET_COUNT, credit_units: 0,
      source_journal_path: T020_V1_JOURNAL_FORENSIC_PATH, source_journal_sha256: legacy.sha256, source_runtime_path: T020_V1_JOURNAL_PATH,
      paid_resubmit_allowed: false, must_precede_any_paid_batch: true,
      result_urls_persisted: false, repolled_at_execution_time: true,
      expiry_falls_back_to_paid_regeneration: false, expiry_fail_stops: true,
      jobs: legacy.jobs,
    },
    immutable_forensics: forensics.immutable_sources,
    model_canary: { expected_provider_reported_model: T020_V2_EXPECTED_MODEL, applies_to_every_batch: true, canary_batch_id: T020_V2_CANARY_BATCH_ID, blocks_batch_id_on_drift: T020_V2_CANARY_BLOCKED_BATCH_ID, drift_still_costs_batch_spend: true },
    approval_gate: {
      pending_disclosure_packet_path: T020_V2_PENDING_PATH, disclosure_presentation_path: T020_V2_PRESENTATION_PATH,
      controller_disclosure_attestation_path: T020_V2_CONTROLLER_DISCLOSURE_PATH, controller_approval_attestation_path: T020_V2_CONTROLLER_APPROVAL_PATH,
      approval_path: T020_V2_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T020_V2_EXACT_APPROVAL_PHRASE,
      v1_approval_inherited: false, committed_clean_runtime_binding_required: true,
    },
    assets, batches,
  } as const;
}
export function renderT020V2Plan(plan: T020V2Plan): string { return renderT020CanonicalJson(plan); }
export function t020V2PlanSha256(plan: T020V2Plan): string { return sha256T020(renderT020V2Plan(plan)); }

/* -------------------------------------------------------- disclosure chain */

export { canonicalT020File, parseT020BalanceFile, parseT020EvidenceTime, t020BalanceDisclosure, type T020BalanceObservation } from "./t020-world-art-production-v1";

function exactEvidenceV2(actual: unknown, expected: unknown, label: string): void { if (canonicalJsonT020(actual) !== canonicalJsonT020(expected)) throw new Error(`${label} changed or has unknown fields`); }
function canonicalFileV2<T>(root: string, path: string): { value: T; sha256: string } {
  const target = resolve(root, path);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`T020 v2 artifact is not a regular file: ${path}`);
  const bytes = readFileSync(target, "utf8");
  const value = JSON.parse(bytes) as T;
  if (bytes !== renderT020CanonicalJson(value)) throw new Error(`T020 v2 artifact is not canonical: ${path}`);
  return { value, sha256: sha256T020(bytes) };
}
function evidenceTime(value: string, label: string): number { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(`${label} timestamp is not canonical UTC`); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is invalid`); return parsed; }

export type T020V2Pending = ReturnType<typeof buildT020V2Pending>;
export function buildT020V2Pending(root: string, plan: T020V2Plan) {
  const risk = buildT020V2Risk(); const schema = buildT020V2Schema(); const forensics = buildT020V2Forensics(root); const binding = loadT020V2Binding(root);
  return {
    schema_version: 2, artifact_version: "t020-world-art-disclosure-presentation-v2-pending", status: "PENDING_PRESENTATION_NOT_AUTHORIZED", secret_free: true,
    plan_sha256: t020V2PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T020(renderT020CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    provider_schema_evidence_sha256: sha256T020(renderT020CanonicalJson(schema)), forensics_evidence_sha256: sha256T020(renderT020CanonicalJson(forensics)),
    core_plan_sha256: T020_CORE_PLAN_SHA256, v1_journal_forensic_sha256: forensics.immutable_sources.v1_journal_forensic_copy.sha256,
    implementation_binding_sha256: sha256T020(renderT020CanonicalJson(binding)), implementation_files: binding.files,
    exact_approval_phrase_required: T020_V2_EXACT_APPROVAL_PHRASE, legacy_recovery_operator_phrase: T020_V2_LEGACY_RECOVERY_PHRASE,
    recovery_operator_phrase: T020_V2_RECOVERY_OPERATOR_PHRASE, resume_operator_phrase: T020_V2_RESUME_OPERATOR_PHRASE,
    loss_acknowledgment_operator_phrase: T020_V2_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    v1_approval_inherited: false, committed_clean_runtime_binding_required: true, scope: t020V2ApprovalScope(), authorized: false,
  } as const;
}

export type T020V2ControllerDisclosure = ReturnType<typeof buildT020V2ControllerDisclosure>;
export function buildT020V2ControllerDisclosure(root: string, plan: T020V2Plan, disclosedAt: string) {
  evidenceTime(disclosedAt, "T020 v2 disclosure");
  const pending = buildT020V2Pending(root, plan);
  return {
    schema_version: 2, evidence_version: "t020-world-art-controller-disclosure-attestation-v2", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T020", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: disclosedAt, assistant_disclosure_text_sha256: sha256T020(T020_V2_RISK_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false },
    bindings: { plan_sha256: pending.plan_sha256, pending_disclosure_packet_sha256: sha256T020(renderT020CanonicalJson(pending)), risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256, implementation_binding_sha256: pending.implementation_binding_sha256, v1_journal_forensic_sha256: pending.v1_journal_forensic_sha256 },
    scope: t020V2ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT020V2ControllerDisclosure(value: unknown, root: string, plan: T020V2Plan): asserts value is T020V2ControllerDisclosure {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 v2 controller disclosure is invalid");
  const at = (value as { event_sequence?: { assistant_disclosure_presented_at?: unknown } }).event_sequence?.assistant_disclosure_presented_at;
  if (typeof at !== "string") throw new Error("T020 v2 disclosure timestamp missing");
  exactEvidenceV2(value, buildT020V2ControllerDisclosure(root, plan, at), "T020 v2 controller disclosure");
}

export type T020V2Presentation = ReturnType<typeof buildT020V2Presentation>;
export function buildT020V2Presentation(root: string, plan: T020V2Plan, balance: { credits: number; provider_observed_at: string } | null) {
  const pending = buildT020V2Pending(root, plan);
  const controller = canonicalFileV2<T020V2ControllerDisclosure>(root, T020_V2_CONTROLLER_DISCLOSURE_PATH);
  validateT020V2ControllerDisclosure(controller.value, root, plan);
  const units = balance === null ? null : Math.round(balance.credits * 100);
  const disclosure = balance === null || units === null
    ? { balance_observation_present: false, covers_new_cap: null, balance_disclosure_incomplete: true } as const
    : {
      balance_observation_present: true, observed_balance_decimal: decimalT020(units), observed_balance_units: units,
      provider_observed_at: balance.provider_observed_at, new_credit_cap_decimal: decimalT020(T020_V2_TOTAL_CAP_UNITS),
      projected_remainder_decimal: decimalT020(units - T020_V2_TOTAL_CAP_UNITS), covers_new_cap: units >= T020_V2_TOTAL_CAP_UNITS,
      balance_disclosure_incomplete: false,
    } as const;
  return {
    schema_version: 2, evidence_version: "t020-world-art-disclosure-presentation-v2", secret_free: true,
    pending_packet_sha256: sha256T020(renderT020CanonicalJson(pending)), plan_sha256: pending.plan_sha256,
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, risk_disclosure_text_ko: T020_V2_RISK_TEXT,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    core_plan_sha256: T020_CORE_PLAN_SHA256, v1_journal_forensic_sha256: pending.v1_journal_forensic_sha256,
    controller_disclosure_attestation_sha256: controller.sha256, implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    disclosed_at: controller.value.event_sequence.assistant_disclosure_presented_at, source: "current user conversation",
    balance_disclosure: disclosure, scope: t020V2ApprovalScope(),
    exact_approval_phrase_required: T020_V2_EXACT_APPROVAL_PHRASE, legacy_recovery_operator_phrase: T020_V2_LEGACY_RECOVERY_PHRASE,
    recovery_operator_phrase: T020_V2_RECOVERY_OPERATOR_PHRASE, resume_operator_phrase: T020_V2_RESUME_OPERATOR_PHRASE,
    loss_acknowledgment_operator_phrase: T020_V2_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, approval_attestation_is_agent_writable: true, human_approval_gate_is_procedural: true,
    v1_approval_inherited: false, committed_clean_runtime_binding_required: true, authorized: false,
  } as const;
}
function presentationBalanceV2(value: unknown): { credits: number; provider_observed_at: string } | null {
  const disclosure = (value as { balance_disclosure?: Record<string, unknown> } | null)?.balance_disclosure;
  if (!disclosure || typeof disclosure !== "object" || disclosure.balance_observation_present !== true) return null;
  const decimalValue = disclosure.observed_balance_decimal; const at = disclosure.provider_observed_at;
  if (typeof decimalValue !== "string" || !/^\d+\.\d{2}$/.test(decimalValue) || typeof at !== "string") throw new Error("T020 v2 presentation balance is invalid");
  return { credits: Number(decimalValue), provider_observed_at: at };
}
export function validateT020V2Presentation(value: unknown, root: string, plan: T020V2Plan): asserts value is T020V2Presentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 v2 presentation is invalid");
  exactEvidenceV2(value, buildT020V2Presentation(root, plan, presentationBalanceV2(value)), "T020 v2 presentation");
}

export type T020V2ControllerApproval = ReturnType<typeof buildT020V2ControllerApproval>;
export function buildT020V2ControllerApproval(root: string, plan: T020V2Plan, presentation: T020V2Presentation, approvedAt: string, now = new Date()) {
  validateT020V2Presentation(presentation, root, plan);
  const disclosedMs = evidenceTime(presentation.disclosed_at, "T020 v2 disclosure");
  const approvedMs = evidenceTime(approvedAt, "T020 v2 approval");
  if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime()) throw new Error("T020 v2 approval chronology is invalid");
  return {
    schema_version: 2, evidence_version: "t020-world-art-controller-approval-attestation-v2", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T020", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T020_V2_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true },
    bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T020(renderT020CanonicalJson(presentation)), risk_disclosure_evidence_sha256: presentation.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: presentation.risk_disclosure_text_sha256, provider_schema_evidence_sha256: presentation.provider_schema_evidence_sha256, forensics_evidence_sha256: presentation.forensics_evidence_sha256, implementation_binding_sha256: presentation.implementation_binding_sha256, v1_journal_forensic_sha256: presentation.v1_journal_forensic_sha256 },
    scope: t020V2ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT020V2ControllerApproval(value: unknown, root: string, plan: T020V2Plan, presentation: T020V2Presentation, now = new Date()): asserts value is T020V2ControllerApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 v2 controller approval is invalid");
  const at = (value as { event_sequence?: { exact_user_reply_received_at?: unknown } }).event_sequence?.exact_user_reply_received_at;
  if (typeof at !== "string") throw new Error("T020 v2 approval timestamp missing");
  exactEvidenceV2(value, buildT020V2ControllerApproval(root, plan, presentation, at, now), "T020 v2 controller approval");
}

export type T020V2Approval = ReturnType<typeof buildT020V2Approval>;
export function buildT020V2Approval(root: string, plan: T020V2Plan, presentation: T020V2Presentation, now = new Date()) {
  validateT020V2Presentation(presentation, root, plan);
  const controller = canonicalFileV2<T020V2ControllerApproval>(root, T020_V2_CONTROLLER_APPROVAL_PATH);
  validateT020V2ControllerApproval(controller.value, root, plan, presentation, now);
  const pending = buildT020V2Pending(root, plan);
  return {
    schema_version: 2, evidence_version: "t020-world-art-approval-v2", secret_free: true,
    decision: "APPROVE_T020_V2_48_PAID_ASSETS_72_00_CAP_PLUS_6_ZERO_COST_LEGACY_RECOVERIES", source: "controller approval attestation",
    exact_user_quote: T020_V2_EXACT_APPROVAL_PHRASE, approved_at: controller.value.event_sequence.exact_user_reply_received_at, disclosed_at: presentation.disclosed_at,
    plan_sha256: pending.plan_sha256, disclosure_presentation_evidence_sha256: sha256T020(renderT020CanonicalJson(presentation)),
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    controller_disclosure_attestation_sha256: presentation.controller_disclosure_attestation_sha256,
    controller_approval_attestation_path: T020_V2_CONTROLLER_APPROVAL_PATH, controller_approval_attestation_sha256: controller.sha256,
    implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    core_plan_sha256: T020_CORE_PLAN_SHA256, v1_journal_forensic_sha256: pending.v1_journal_forensic_sha256,
    balance_disclosure: presentation.balance_disclosure, scope: t020V2ApprovalScope(),
    v1_approval_inherited: false, acknowledges_prior_approvals_not_inherited: true, committed_clean_runtime_binding_required: true, automatic_paid_retry_count: 0,
  } as const;
}
export function validateT020V2Approval(value: unknown, root: string, plan: T020V2Plan, presentation: T020V2Presentation, now = new Date()): asserts value is T020V2Approval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 v2 approval is invalid");
  exactEvidenceV2(value, buildT020V2Approval(root, plan, presentation, now), "T020 v2 approval");
}

export function isT020V2Authorized(root: string, plan: T020V2Plan, now = new Date()): boolean {
  try {
    const presentation = canonicalFileV2<T020V2Presentation>(root, T020_V2_PRESENTATION_PATH);
    validateT020V2Presentation(presentation.value, root, plan);
    const controller = canonicalFileV2<T020V2ControllerApproval>(root, T020_V2_CONTROLLER_APPROVAL_PATH);
    validateT020V2ControllerApproval(controller.value, root, plan, presentation.value, now);
    const approval = canonicalFileV2<T020V2Approval>(root, T020_V2_APPROVAL_PATH);
    validateT020V2Approval(approval.value, root, plan, presentation.value, now);
    return true;
  } catch { return false; }
}
export function loadT020V2Authorization(root: string, plan: T020V2Plan, now = new Date()): { presentation: T020V2Presentation; approval: T020V2Approval } {
  const presentation = canonicalFileV2<T020V2Presentation>(root, T020_V2_PRESENTATION_PATH);
  validateT020V2Presentation(presentation.value, root, plan);
  const approval = canonicalFileV2<T020V2Approval>(root, T020_V2_APPROVAL_PATH);
  validateT020V2Approval(approval.value, root, plan, presentation.value, now);
  return { presentation: presentation.value, approval: approval.value };
}
