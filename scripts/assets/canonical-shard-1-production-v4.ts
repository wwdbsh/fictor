import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { T015_CONTRACT_SHA256, T015_NO_COPY_BOUNDARY, T015_REFERENCE_INSTRUCTION, T015_T014_APPROVAL_SHA256, canonicalJsonT015, renderT015CanonicalJson } from "./canonical-shard-1-v1";
import { T015_V1_JOURNAL_PATH, T015_V1_JOURNAL_SHA256, T015_V2_JOURNAL_PATH, T015_V2_JOURNAL_SHA256, T015_V2_PLAN_PATH, T015_V2_PLAN_SHA256, T015_V3_APPROVAL_PATH } from "./canonical-shard-1-recovery-v3";

export { canonicalJsonT015, renderT015CanonicalJson };

/* T015 v4 paid production contract: CANONICAL 12..331 (320 assets, 27 batches, +480.00 credits). */

export const T015_V4_PLAN_PATH = "assets/manifests/canonical-shard-1-v4.plan.json" as const;
export const T015_V4_BINDING_PATH = "assets/manifests/t015-implementation-binding-v4.json" as const;
export const T015_V4_RISK_PATH = "assets/evidence/t015-canonical-shard-1-risk-disclosure-v4.json" as const;
export const T015_V4_SCHEMA_PATH = "assets/evidence/t015-canonical-shard-1-higgsfield-schema-v4.json" as const;
export const T015_V4_FORENSICS_PATH = "assets/evidence/t015-canonical-shard-1-forensics-v4.json" as const;
/* v4.2 revision: the attestation chain and the journal move to new paths so the committed
   -v4 disclosure, approval, and journal stay on disk as immutable history of the live run.
   The regenerable artifacts (risk, schema, forensics, plan) keep their -v4 paths and are
   rewritten in place; only the no-clobber chain and the journal are re-versioned. */
export const T015_V4_PENDING_PATH = "assets/evidence/t015-canonical-shard-1-disclosure-presentation-v4.2.pending.json" as const;
export const T015_V4_PRESENTATION_PATH = "assets/evidence/t015-canonical-shard-1-disclosure-presentation-v4.2.json" as const;
export const T015_V4_APPROVAL_PATH = "assets/evidence/t015-canonical-shard-1-approval-v4.2.json" as const;
export const T015_V4_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t015-controller-disclosure-attestation-v4.2.json" as const;
export const T015_V4_CONTROLLER_APPROVAL_PATH = "assets/evidence/t015-controller-approval-attestation-v4.2.json" as const;
export const T015_V4_JOURNAL_PATH = "assets/runs/t015-canonical-shard-1/operations-v4-2.json" as const;
export const T015_V4_LOCK_PATH = "assets/runs/t015-canonical-shard-1/operations-v4-2.lock" as const;
/* Read (never written) by `production migrate`, which is the only command that touches the
   superseded v4.1 journal. */
export const T015_V4_LEGACY_JOURNAL_PATH = "assets/runs/t015-canonical-shard-1/operations-v4.json" as const;
export const T015_V4_LEGACY_LOCK_PATH = "assets/runs/t015-canonical-shard-1/operations-v4.lock" as const;
export const T015_V3_JOURNAL_PATH = "assets/runs/t015-canonical-shard-1/operations-v3.json" as const;
export const T015_V4_LOCAL_ROOT = "public/assets" as const;
export const T015_V4_BACKUP_ROOT = "assets/backups/t015-canonical-shard-1" as const;
export const T015_V4_CORE_PLAN_PATH = "assets/manifests/core-v1.plan.json" as const;
export const T015_V4_CONTACT_INDEX_PATH = "docs/asset-runs/contact-sheets/t015-canonical-shard-1-v4.html" as const;
export const T015_V4_CONTACT_SEGMENT_ROOT = "docs/asset-runs/contact-sheets/t015-canonical-shard-1-v4" as const;

export const T015_V4_PAID_SLICE_START = 12 as const;
export const T015_V4_PAID_SLICE_END = 331 as const;
export const T015_V4_PAID_ASSET_COUNT = 320 as const;
export const T015_V4_PAID_BATCH_COUNT = 27 as const;
export const T015_V4_TOTAL_ASSET_COUNT = 332 as const;
export const T015_V4_UNIT_COST_UNITS = 150 as const;
export const T015_V4_ADDITIONAL_CAP_UNITS = 48_000 as const;
export const T015_V4_LEGACY_COMMITTED_UNITS = 1_800 as const;
export const T015_V4_TOTAL_CAP_UNITS = 49_800 as const;
export const T015_V4_HISTORICAL_PRE_SUBMIT_BALANCE_UNITS = 86_190 as const;
export const T015_V4_EXPECTED_MODEL = "nano_banana_flash" as const;
export const T015_V4_CANARY_BATCH_ID = "canonical-shard-1-002" as const;
export const T015_V4_CANARY_BLOCKED_BATCH_ID = "canonical-shard-1-003" as const;
/* The batch that was in FAIL_STOP when the v4.1 defects were found; disclosed by name. */
export const T015_V4_MIGRATION_FAIL_STOP_BATCH_ID = "canonical-shard-1-004" as const;
export const T015_V4_CREDIT_EXPIRY_DATE = "2026-08-17" as const;
export const T015_V4_ASPECT_TOLERANCE_PPM = 5000 as const;
export const T015_V4_OBSERVED_RECOVERY_WIDTH = 896 as const;
export const T015_V4_OBSERVED_RECOVERY_HEIGHT = 1200 as const;
export const T015_V4_OBSERVED_RECOVERY_ASPECT_ERROR_PPM = 4445 as const;

export const T015_V4_EXACT_APPROVAL_PHRASE = "위 위험을 확인했고 T015 CANONICAL 12..331 정확히 320장의 유료 생성과 27개 배치(각 최대 12장), 추가 480.00 credits 상한(이미 사용 처리 18.00, 누적 상한 498.00), 자동 유료 재시도 0을 승인합니다." as const;
export const T015_V4_RECOVERY_OPERATOR_PHRASE = "T015 v4 이 배치의 확정 job ID만 복구하고 새 유료 제출은 하지 않습니다." as const;
export const T015_V4_RESUME_OPERATOR_PHRASE = "T015 v4 실패한 배치를 재제출하지 않고 다음 배치만 진행합니다." as const;
export const T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE = "T015 v4 이 배치의 손실을 확인했고 재제출 없이 손실을 상한에서 차감한 뒤 남은 배치만 진행합니다." as const;

export const T015_V4_RISK_TEXT = `T015 v4는 CANONICAL 12..331 정확히 320장을 27개 배치(각 최대 12장, 12x26+8)로 배치당 단 한 번씩 유료 생성합니다. 추가 상한은 480.00 credits(정확 단가 1.50 x 320장)이고, 이미 사용 처리된 legacy 18.00을 더한 누적 상한은 498.00이며 자동 유료 재시도 예산은 0입니다.
(i) 배치마다 제출 응답을 잃을 수 있는 모호 제출(ambiguous submission) 구간이 정확히 1회씩, 총 27회 존재합니다. 각 구간에서 최대 18.00 credits(12장 x 1.50)가 실제로 차감되고도 응답을 받지 못하면 그 배치의 job ID를 전혀 열거할 수 없고, 따라서 이미 지불한 이미지를 영구히 회수하지 못할 수 있습니다.
(ii) 각 배치는 단 한 번만 제출합니다. 유료 envelope이 한 번이라도 밖으로 나간 배치는 모호 제출이든 부분 응답이든 즉시 fail-stop하고 어떤 경우에도 재제출하지 않습니다.
(iii) fail-stop은 실행 전체가 아니라 배치 단위로 적용됩니다. 다음 배치로 넘어가려면 operator가 정확한 재개 문구를 입력해야 합니다. 재개는 두 갈래뿐입니다. 지출이 0인 배치(유료 envelope이 나가기 전 preflight 단계 실패)는 재개 뒤 PLANNED로 되돌려 같은 배치를 처음부터 다시 실행할 수 있고, 이때도 이전 실패 기록은 저널에 그대로 보존됩니다. 이미 지출이 발생했을 수 있는 배치는 절대 재실행하지 않고, operator가 정확히 “${T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE}”로 손실을 확인해야만 다음 배치가 열립니다. 확인된 손실은 480.00 상한에서 그대로 차감되어 남은 배치의 예산을 줄이며, 손실된 index의 이미지는 이 승인으로는 다시 생성하지 않습니다. 다시 만들려면 별도의 새 고지와 새 승인이 필요합니다. 손실이 하나라도 확인된 실행은 정확히 480.00으로 닫히지 않고 CLOSED_WITH_LOSSES 상태로 종료되며, 최종 audit은 회수한 자산 수와 확인된 손실 금액을 함께 보고합니다.
(iv) v3에서 복구한 PNG 12장은 모두 896x1200으로 관찰되었고 3:4 대비 종횡비 오차는 약 4444ppm(저널 기록 반올림값 4445ppm), 허용 오차는 5000ppm입니다. provider가 해상도를 조금만 바꿔도 이미 과금된 배치가 종횡비 검증에서 실패할 수 있으며 그 지출은 돌아오지 않습니다.
(v) legacy 18.00 balance delta는 아직 provider로 검증되지 않았습니다. 이 고지에는 새로 관찰한 balance와 제출 전 기록값 861.90에서 그 값을 뺀 함의 legacy delta를 함께 싣고, 함의 delta가 18.00이 아니면 legacy_delta_mismatch로 표시해 전면에 드러냅니다.
(vi) credits는 2026-08-17에 만료됩니다. 정확한 만료 시각(hour)은 알 수 없습니다.
(vii) 복구 개시와 재개에 쓰는 operator 문구는 agent가 스스로 입력할 수 있으므로 사용자 동의를 대신하지 않습니다. 사고와 오작동을 막는 게이트일 뿐입니다.
(viii) 모든 요청은 use_unlim:false를 문자 그대로 포함하며 이 값은 각 자산의 canonical_request_sha256 안에 고정되어 있습니다.
(ix) v3 승인은 상속되지 않습니다. v4 유료 실행은 이 고지 뒤에 받은 새 정확 승인 문구를 요구합니다.
(x) 모델 canary: 배치 ${T015_V4_CANARY_BATCH_ID}의 provider-reported model이 ${T015_V4_EXPECTED_MODEL}로 확인되지 않으면 배치 ${T015_V4_CANARY_BLOCKED_BATCH_ID}은 열리지 않습니다. 다만 드리프트로 멈추더라도 그 canary 배치에 이미 지출된 credits는 회수되지 않습니다.
(xi) v4.2 개정 사유 - 실행 도중 발견된 결함 2건입니다. 결함 1: LOSS_ACKNOWLEDGED discharge 검증이 그 discharge가 덮는 모든 terminal을 손실 코드로 요구했습니다. 배치 ${T015_V4_MIGRATION_FAIL_STOP_BATCH_ID}의 이력에는 나중에 같은 job ID를 다시 조회해 성공적으로 대체된 무비용 RECOVERY_FAILED terminal이 남아 있어 손실 확인 자체가 거부되었고, 그 결과 resume도 막혀 실행 전체가 멈췄습니다. v4.2는 discharge가 덮는 terminal로 손실 코드와 무비용으로 대체된 RECOVERY_FAILED를 함께 허용하되 최소 하나는 실제 손실 코드여야 하고, 마지막 활성 terminal이 손실 코드여야 한다는 기존 조건은 그대로 둡니다. 결함 2: provider의 jobs_wait가 완료되지 않은 job에도 model 필드를 실어 보냈고(관찰: status "failed", model "${T015_V4_EXPECTED_MODEL}", result_url 없음) topology 검증이 이를 거부해 RECOVERY_FAILED가 났습니다. operator가 그 필드를 손으로 제거해 진행한 사실을 함께 고지합니다. v4.2는 완료되지 않은 job의 선택적 model/result_url을 타입만 검증해 받아들이고, 완료되지 않은 job에서는 어떤 경우에도 내려받지 않으며, 완료된 job은 여전히 model과 result_url을 모두 요구합니다.
(xii) 저널 이관 - 기존 저널 ${T015_V4_LEGACY_JOURNAL_PATH}는 한 바이트도 고치지 않고 그대로 두고, 단 한 번만 실행되는 migrate 명령이 ${T015_V4_JOURNAL_PATH}를 새로 씁니다. 새 저널은 이 고지에서 나온 새 plan/presentation/approval sha를 헤더로 갖고, 기존 배치 기록(002·003의 COMPLETE와 balance_after, 004의 terminal·복구·제출·preflight)을 전부 그대로 가져오며, 원본 경로와 이관 시점의 원본 바이트 sha256과 이관 시각을 불변 포렌식에 함께 기록합니다. 대상 저널이 이미 있거나 원본이 레코드 검증에 실패하면 이관을 거부합니다.
(xiii) 이관 뒤 배치 ${T015_V4_MIGRATION_FAIL_STOP_BATCH_ID}는 관찰 delta 16.50, 회수 16.50, 확인 손실 0.00으로 discharge됩니다. 금액은 discharge 시점에 새로 측정한 balance로 다시 확정하므로 이 수치는 현재 관찰값이며 확정값이 아닙니다. 실패한 index 42 한 장은 이 승인으로는 다시 생성하지 않습니다. 다시 만들려면 별도의 새 고지와 새 승인이 필요합니다. 현재까지의 지출은 480.00 중 52.50(002 18.00 + 003 18.00 + 004 16.50)입니다.
signed URL, redirect URL, host, provider raw error는 journal, evidence, stdout 어디에도 기록하지 않습니다. operations-v1, operations-v2, operations-v3 저널과 v3 승인 증거는 불변 포렌식으로 바이트 고정합니다. T016, index 332 이후, materials, hearts, world 자산은 제외됩니다. 새 승인은 정확히 “${T015_V4_EXACT_APPROVAL_PHRASE}”로만 기록합니다.` as const;

export const T015_V4_RUNTIME_FILES = {
  controller: "scripts/assets/canonical-shard-1-production-v4-controller.ts",
  preparation: "scripts/assets/canonical-shard-1-production-v4-cli.ts",
  production: "scripts/assets/canonical-shard-1-production-v4-ops.ts",
  contract: "scripts/assets/canonical-shard-1-production-v4.ts",
  v3_contract: "scripts/assets/canonical-shard-1-recovery-v3.ts",
  v3_ops: "scripts/assets/canonical-shard-1-recovery-v3-ops.ts",
  v2_plan_builder: "scripts/assets/canonical-shard-1-v1-continuation-v2.ts",
  legacy_plan_builder: "scripts/assets/canonical-shard-1-v1.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
  package_json: "package.json",
  package_lock: "package-lock.json",
  legacy_production_revocation: "assets/manifests/t015-legacy-production-revocation-v3.json",
  v3_approval: T015_V3_APPROVAL_PATH,
} as const;

export function sha256T015V4(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string { return canonicalJsonT015(value); }
export function readRegularT015V4(root: string, path: string): Buffer { const target = resolve(root, path); if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`T015 v4 source is not a regular file: ${path}`); return readFileSync(target); }
export function decimalT015V4(units: number): string { const sign = units < 0 ? "-" : ""; const magnitude = Math.abs(units); return `${sign}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, "0")}`; }

/* ---------------------------------------------------------------- binding */

export interface T015V4Binding { schema_version: 4; manifest_version: "t015-implementation-binding-v4"; issue_contract_sha256: typeof T015_CONTRACT_SHA256; files: Record<keyof typeof T015_V4_RUNTIME_FILES, { path: string; sha256: string }> }
export function buildT015V4Binding(root: string): T015V4Binding { return { schema_version: 4, manifest_version: "t015-implementation-binding-v4", issue_contract_sha256: T015_CONTRACT_SHA256, files: Object.fromEntries(Object.entries(T015_V4_RUNTIME_FILES).map(([key, path]) => [key, { path, sha256: sha256T015V4(readRegularT015V4(root, path)) }])) as T015V4Binding["files"] }; }
export function loadT015V4Binding(root: string): T015V4Binding { const bytes = readRegularT015V4(root, T015_V4_BINDING_PATH).toString("utf8"); const value = JSON.parse(bytes) as T015V4Binding; const expected = buildT015V4Binding(root); if (bytes !== renderT015CanonicalJson(value) || canonical(value) !== canonical(expected)) throw new Error("T015 v4 implementation binding changed"); return value; }

/* -------------------------------------------------------------- forensics */

interface V3Journal { schema_version: number; journal_version: string; plan_sha256: string; run_state: string; accounting: { legacy_cap_committed_decimal: string; provider_balance_delta_verified: boolean; paid_retry_count: number }; legacy_recovery: { jobs: Array<{ index: number; asset_id: string; job_id: string; canonical_request_sha256: string }>; recoveries: Array<{ asset_id: string; provider_job_index: number; local_relative_path: string; backup_relative_path: string; sha256: string; size_bytes: number; actual_width: number; actual_height: number; aspect_error_ppm: number }>; failures: unknown[] } }

export interface T015V4PinnedV3Journal { value: V3Journal; sha256: string }
export function loadPinnedT015V3Journal(root: string): T015V4PinnedV3Journal {
  const bytes = readRegularT015V4(root, T015_V3_JOURNAL_PATH);
  const value = JSON.parse(bytes.toString("utf8")) as V3Journal;
  const recoveries = value.legacy_recovery?.recoveries ?? [];
  if (value.schema_version !== 3 || value.journal_version !== "t015-canonical-shard-1-operations-v3" || value.run_state !== "HOLD_FOR_FUTURE_PAID_IMPLEMENTATION" || value.accounting.paid_retry_count !== 0 || value.accounting.legacy_cap_committed_decimal !== "18.00" || value.accounting.provider_balance_delta_verified !== false || value.legacy_recovery.jobs.length !== 12 || recoveries.length !== 12) throw new Error("T015 v4 pinned operations-v3 forensic invariants changed");
  for (const recovery of recoveries) if (!/^[a-f0-9]{64}$/.test(recovery.sha256) || recovery.local_relative_path !== recovery.backup_relative_path || !Number.isSafeInteger(recovery.size_bytes) || recovery.size_bytes < 1 || recovery.aspect_error_ppm < 0 || recovery.aspect_error_ppm > T015_V4_ASPECT_TOLERANCE_PPM) throw new Error("T015 v4 pinned operations-v3 recovery invariants changed");
  return { value, sha256: sha256T015V4(bytes) };
}

export type T015V4Forensics = ReturnType<typeof buildT015V4Forensics>;
export function buildT015V4Forensics(root: string) {
  const v3 = loadPinnedT015V3Journal(root);
  const approvalSha = sha256T015V4(readRegularT015V4(root, T015_V3_APPROVAL_PATH));
  const dimensions = [...new Set(v3.value.legacy_recovery.recoveries.map(({ actual_width, actual_height }) => `${actual_width}x${actual_height}`))].sort();
  return {
    schema_version: 4, evidence_version: "t015-canonical-shard-1-forensics-v4", secret_free: true,
    immutable_sources: {
      operations_v1: { path: T015_V1_JOURNAL_PATH, sha256: T015_V1_JOURNAL_SHA256 },
      operations_v2: { path: T015_V2_JOURNAL_PATH, sha256: T015_V2_JOURNAL_SHA256 },
      operations_v3: { path: T015_V3_JOURNAL_PATH, sha256: v3.sha256 },
      v2_plan: { path: T015_V2_PLAN_PATH, sha256: T015_V2_PLAN_SHA256 },
      v3_approval: { path: T015_V3_APPROVAL_PATH, sha256: approvalSha },
    },
    observed: {
      v3_run_state: "HOLD_FOR_FUTURE_PAID_IMPLEMENTATION", v3_recovered_slice: "0..11", v3_recovery_count: 12, v3_failure_count: v3.value.legacy_recovery.failures.length,
      recovered_dimensions: dimensions, recovered_aspect_error_ppm_max: Math.max(...v3.value.legacy_recovery.recoveries.map(({ aspect_error_ppm }) => aspect_error_ppm)),
      aspect_tolerance_ppm: T015_V4_ASPECT_TOLERANCE_PPM, legacy_cap_committed_decimal: "18.00", legacy_provider_balance_delta_verified: false, paid_retry_count: 0,
    },
    policy: { mutate_v1_v2_or_v3_journals: false, paid_resubmit_of_legacy_jobs: false, automatic_paid_retry_allowed: false, batch_scoped_fail_stop: true, operator_gated_resume_never_resubmits: true },
  } as const;
}

/* ------------------------------------------------------------ risk/schema */

export function t015V4ApprovalScope() {
  return {
    category: "CANONICAL", paid_slice: "12..331", paid_asset_count: T015_V4_PAID_ASSET_COUNT, paid_batch_count: T015_V4_PAID_BATCH_COUNT, paid_batch_sizes: "12x26+8", batch_max: 12,
    unit_cost_decimal: "1.50", additional_credit_cap_decimal: decimalT015V4(T015_V4_ADDITIONAL_CAP_UNITS), additional_credit_cap_units: T015_V4_ADDITIONAL_CAP_UNITS,
    legacy_cap_committed_decimal: decimalT015V4(T015_V4_LEGACY_COMMITTED_UNITS), legacy_cap_committed_units: T015_V4_LEGACY_COMMITTED_UNITS,
    total_credit_cap_decimal: decimalT015V4(T015_V4_TOTAL_CAP_UNITS), total_credit_cap_units: T015_V4_TOTAL_CAP_UNITS,
    automatic_paid_retry_reserve_decimal: "0.00", automatic_paid_retry_count: 0, credit_expiry_date: T015_V4_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false, t016_or_other_assets_allowed: false,
  } as const;
}
export function buildT015V4Risk() { return { schema_version: 4, evidence_version: "t015-canonical-shard-1-risk-disclosure-v4", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T015_V4_RISK_TEXT, disclosure_text_sha256: sha256T015V4(T015_V4_RISK_TEXT), scope: t015V4ApprovalScope() } as const; }
export function buildT015V4Schema() {
  return {
    schema_version: 4, evidence_version: "t015-canonical-shard-1-higgsfield-schema-v4", source: "pinned T015 v1/v2/v3 observations; no new provider probe", secret_free: true,
    submit: { tool: "generate_image_batch", batch_max: 12, requested_model: "nano_banana_2", expected_provider_reported_model: T015_V4_EXPECTED_MODEL, use_unlim: false, aspect_ratio: "3:4", resolution: "1k", count_per_asset: 1, response_required_keys: ["submitted_count", "failed_count", "jobs"], job_required_keys: ["index", "job_id", "status"], job_allowed_optional_keys: ["adjustments", "error", "warning", "preset_recommendation"], any_optional_key_fail_stops_batch: true },
    cost: { display_credits_decimal: "1.00", exact_credits_decimal: "1.50", integer_units_per_image: T015_V4_UNIT_COST_UNITS, freshness_ms: 600_000, strictly_monotonic_observations: true },
    jobs_wait: { expected_type: "image", summary_required_keys: ["active", "completed", "errors", "failed", "total"], summary_compared_by_value: true, retryable_presence_only_for_status: "lookup_failed" },
    secure_download: { resolver_mapped_ipv6_allowed: false, resolver_public_ipv4_allowed: true, transport_peer_pin_required: true, fresh_connection_per_request: true, auto_select_family: false, remote_address_captured_at_response_headers: true, url_or_host_diagnostics_persisted: false },
    model_canary: { canary_batch_id: T015_V4_CANARY_BATCH_ID, blocks_batch_id_on_drift: T015_V4_CANARY_BLOCKED_BATCH_ID, drift_still_costs_canary_batch_spend: true },
  } as const;
}

/* ------------------------------------------------------------------- plan */

export interface T015V4RequestParams { model: string; prompt: string; aspect_ratio: string; resolution: string; count: number; use_unlim: false; medias: Array<{ role: string; value: string }> }
export interface T015V4AssetRequest { index: number; params: T015V4RequestParams }
export interface T015V4Asset { index: number; id: string; path: string; core_prompt: string; core_prompt_sha256: string; effective_prompt: string; effective_prompt_sha256: string; request: T015V4AssetRequest; canonical_request_sha256: string }
export interface T015V4Batch { id: string; index: number; asset_ids: string[]; size: number }
interface PinnedV2Plan { schema_version: number; plan_version: string; issue_number: number; issue_contract_sha256: string; sources: Record<string, unknown>; selection: Record<string, unknown>; provider_contract: Record<string, unknown>; reference_binding: Record<string, unknown>; prompt_contract: Record<string, unknown>; recovery_policy: Record<string, unknown>; assets: T015V4Asset[]; batches: T015V4Batch[] }

export function loadPinnedT015V2Plan(root: string): PinnedV2Plan {
  const bytes = readRegularT015V4(root, T015_V2_PLAN_PATH);
  if (sha256T015V4(bytes) !== T015_V2_PLAN_SHA256) throw new Error("T015 v4 pinned v2 plan changed");
  const text = bytes.toString("utf8");
  const value = JSON.parse(text) as PinnedV2Plan;
  if (text !== renderT015CanonicalJson(value) || value.schema_version !== 2 || value.plan_version !== "t015-canonical-shard-1-v2" || value.assets.length !== T015_V4_TOTAL_ASSET_COUNT || value.batches.length !== T015_V4_PAID_BATCH_COUNT || value.batches.reduce((sum, batch) => sum + batch.size, 0) !== T015_V4_PAID_ASSET_COUNT) throw new Error("T015 v4 pinned v2 plan invariants changed");
  return value;
}

export type T015V4Plan = ReturnType<typeof buildT015V4Plan>;
export function buildT015V4Plan(root: string) {
  const base = loadPinnedT015V2Plan(root);
  const risk = buildT015V4Risk();
  const schema = buildT015V4Schema();
  const forensics = buildT015V4Forensics(root);
  const binding = loadT015V4Binding(root);
  const v3 = loadPinnedT015V3Journal(root);
  const assets = base.assets.slice(T015_V4_PAID_SLICE_START, T015_V4_PAID_SLICE_END + 1);
  const batches = base.batches.map(({ id, index, asset_ids, size }) => ({ id, index, asset_ids: [...asset_ids], size }));
  const ids = new Set(assets.map(({ id }) => id));
  if (assets.length !== T015_V4_PAID_ASSET_COUNT || assets.some((asset, offset) => asset.index !== T015_V4_PAID_SLICE_START + offset || asset.request.index !== asset.index || asset.request.params.use_unlim !== false) || batches[0].id !== T015_V4_CANARY_BATCH_ID || batches.at(-1)!.id !== "canonical-shard-1-028" || batches.some((batch) => batch.asset_ids.length !== batch.size || batch.asset_ids.some((assetId) => !ids.has(assetId)))) throw new Error("T015 v4 paid slice invariants changed");
  const legacyAssets = base.assets.slice(0, T015_V4_PAID_SLICE_START).map((asset) => {
    const recovery = v3.value.legacy_recovery.recoveries.find(({ asset_id }) => asset_id === asset.id);
    if (!recovery || recovery.local_relative_path !== asset.path || recovery.provider_job_index !== asset.index) throw new Error("T015 v4 legacy recovery binding changed");
    return { index: asset.index, id: asset.id, path: asset.path, sha256: recovery.sha256, size_bytes: recovery.size_bytes, actual_width: recovery.actual_width, actual_height: recovery.actual_height, aspect_error_ppm: recovery.aspect_error_ppm };
  });
  return {
    schema_version: 4, plan_version: "t015-canonical-shard-1-v4", issue_number: base.issue_number, issue_contract_sha256: T015_CONTRACT_SHA256,
    state: "HOLD_FOR_FRESH_V4_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: { category: "CANONICAL", paid_slice: "12..331", paid_asset_count: T015_V4_PAID_ASSET_COUNT, legacy_recovered_slice: "0..11", legacy_recovered_asset_count: 12, total_slice: "0..331", total_asset_count: T015_V4_TOTAL_ASSET_COUNT, excluded_first_id: "forge__join_02__wash_02", t016_or_other_assets_allowed: false },
    selection: base.selection,
    sources: {
      pinned_v2_plan: { path: T015_V2_PLAN_PATH, sha256: T015_V2_PLAN_SHA256 },
      core_plan: base.sources.core_plan, master_style: base.sources.master_style, t014_approval: base.sources.t014_approval, legacy_plan: base.sources.legacy_plan,
      risk_disclosure: { path: T015_V4_RISK_PATH, sha256: sha256T015V4(renderT015CanonicalJson(risk)), text_sha256: risk.disclosure_text_sha256 },
      provider_schema: { path: T015_V4_SCHEMA_PATH, sha256: sha256T015V4(renderT015CanonicalJson(schema)) },
      forensics: { path: T015_V4_FORENSICS_PATH, sha256: sha256T015V4(renderT015CanonicalJson(forensics)) },
      implementation_binding: { path: T015_V4_BINDING_PATH, sha256: sha256T015V4(renderT015CanonicalJson(binding)), files: binding.files },
    },
    provider_contract: base.provider_contract, reference_binding: base.reference_binding, prompt_contract: base.prompt_contract,
    budget: {
      unit_cost_decimal: "1.50", unit_cost_units: T015_V4_UNIT_COST_UNITS, paid_request_count: T015_V4_PAID_ASSET_COUNT, paid_batch_count: T015_V4_PAID_BATCH_COUNT, paid_batch_sizes: "12x26+8",
      additional_credit_cap_decimal: decimalT015V4(T015_V4_ADDITIONAL_CAP_UNITS), additional_credit_cap_units: T015_V4_ADDITIONAL_CAP_UNITS,
      legacy_committed_decimal: decimalT015V4(T015_V4_LEGACY_COMMITTED_UNITS), legacy_committed_units: T015_V4_LEGACY_COMMITTED_UNITS,
      total_credit_cap_decimal: decimalT015V4(T015_V4_TOTAL_CAP_UNITS), total_credit_cap_units: T015_V4_TOTAL_CAP_UNITS,
      legacy_provider_balance_delta_verified: false, historical_pre_submit_balance_decimal: decimalT015V4(T015_V4_HISTORICAL_PRE_SUBMIT_BALANCE_UNITS),
      automatic_paid_retry_reserve_decimal: "0.00", credit_expiry_date: T015_V4_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    },
    retry_policy: { automatic_paid_retry_allowed: false, automatic_paid_retry_count: 0, ambiguous_or_partial_submission_retry_allowed: false, single_submission_per_batch: true, ambiguous_submission_windows: T015_V4_PAID_BATCH_COUNT, ambiguous_window_max_exposure_decimal: "18.00", operator_recovery_only_for_durable_job_ids: true, operator_gated_resume_never_resubmits: true, fail_stop_scope: "BATCH" },
    recovery_policy: base.recovery_policy,
    immutable_forensics: forensics.immutable_sources,
    legacy_recovery: { slice: "0..11", asset_count: 12, source_journal_path: T015_V3_JOURNAL_PATH, source_journal_sha256: forensics.immutable_sources.operations_v3.sha256, paid_resubmit_allowed: false, assets: legacyAssets },
    model_canary: { canary_batch_id: T015_V4_CANARY_BATCH_ID, expected_provider_reported_model: T015_V4_EXPECTED_MODEL, blocks_batch_id_on_drift: T015_V4_CANARY_BLOCKED_BATCH_ID, drift_still_costs_canary_batch_spend: true },
    approval_gate: { pending_disclosure_packet_path: T015_V4_PENDING_PATH, disclosure_presentation_path: T015_V4_PRESENTATION_PATH, controller_disclosure_attestation_path: T015_V4_CONTROLLER_DISCLOSURE_PATH, controller_approval_attestation_path: T015_V4_CONTROLLER_APPROVAL_PATH, approval_path: T015_V4_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T015_V4_EXACT_APPROVAL_PHRASE, prior_t015_v1_v2_or_v3_approval_inherited: false, committed_clean_runtime_binding_required: true },
    assets, batches,
  } as const;
}
export function renderT015V4Plan(plan: T015V4Plan): string { return renderT015CanonicalJson(plan); }
export function t015V4PlanSha256(plan: T015V4Plan): string { return sha256T015V4(renderT015V4Plan(plan)); }

/* Optional cross-check: recompute effective_prompt from the sha-pinned core plan with v1's exported constants. */
export function crossCheckT015V4EffectivePrompts(root: string, plan: T015V4Plan, indices: readonly number[]): number {
  const core = JSON.parse(readRegularT015V4(root, T015_V4_CORE_PLAN_PATH).toString("utf8")) as { assets: Array<{ id: string; category: string; prompt?: string }> };
  const canonicalAssets = core.assets.filter(({ category }) => category === "CANONICAL").slice(0, T015_V4_TOTAL_ASSET_COUNT);
  let checked = 0;
  for (const index of indices) {
    const asset = plan.assets.find((item) => item.index === index);
    const source = canonicalAssets[index];
    if (!asset || !source || source.id !== asset.id) throw new Error("T015 v4 cross-check asset binding changed");
    const effective = `${asset.core_prompt}\n\nMaster-style reference instruction: ${T015_REFERENCE_INSTRUCTION}\n${T015_NO_COPY_BOUNDARY}`;
    if (effective !== asset.effective_prompt || sha256T015V4(effective) !== asset.effective_prompt_sha256 || sha256T015V4(canonical(asset.request)) !== asset.canonical_request_sha256 || asset.request.params.prompt !== asset.effective_prompt) throw new Error("T015 v4 cross-check effective prompt changed");
    checked += 1;
  }
  return checked;
}

/* ------------------------------------------------------- disclosure chain */

export interface T015V4BalanceObservation { credits: number; provider_observed_at: string }
export function parseT015V4BalanceFile(raw: unknown): T015V4BalanceObservation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("T015 v4 balance file is invalid");
  const value = raw as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("credits") || !keys.includes("provider_observed_at") || typeof value.credits !== "number" || !Number.isFinite(value.credits) || value.credits < 0 || typeof value.provider_observed_at !== "string") throw new Error("T015 v4 balance file is invalid");
  const units = Math.round(value.credits * 100);
  if (!Number.isSafeInteger(units) || Math.abs(value.credits * 100 - units) > 1e-9) throw new Error("T015 v4 balance file credits are ambiguous");
  parseT015V4EvidenceTime(value.provider_observed_at, "T015 v4 balance observation");
  return { credits: value.credits, provider_observed_at: value.provider_observed_at };
}
export function t015V4LegacyDelta(observed: T015V4BalanceObservation) {
  const observedUnits = Math.round(observed.credits * 100);
  const impliedUnits = T015_V4_HISTORICAL_PRE_SUBMIT_BALANCE_UNITS - observedUnits;
  return { observed_balance_decimal: decimalT015V4(observedUnits), observed_balance_units: observedUnits, provider_observed_at: observed.provider_observed_at, historical_pre_submit_balance_decimal: decimalT015V4(T015_V4_HISTORICAL_PRE_SUBMIT_BALANCE_UNITS), implied_legacy_delta_decimal: decimalT015V4(impliedUnits), implied_legacy_delta_units: impliedUnits, expected_legacy_delta_decimal: decimalT015V4(T015_V4_LEGACY_COMMITTED_UNITS), legacy_delta_mismatch: impliedUnits !== T015_V4_LEGACY_COMMITTED_UNITS, legacy_provider_balance_delta_verified: false } as const;
}

export function parseT015V4EvidenceTime(value: string, label: string): number { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(`${label} timestamp is not canonical UTC`); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is invalid`); return parsed; }
function exactEvidence(actual: unknown, expected: unknown, label: string): void { if (canonical(actual) !== canonical(expected)) throw new Error(`${label} changed or has unknown fields`); }
export function canonicalT015V4File<T>(root: string, path: string): { value: T; sha256: string } { const bytes = readRegularT015V4(root, path).toString("utf8"); const value = JSON.parse(bytes) as T; if (bytes !== renderT015CanonicalJson(value)) throw new Error(`T015 v4 artifact is not canonical: ${path}`); return { value, sha256: sha256T015V4(bytes) }; }

export type T015V4Pending = ReturnType<typeof buildT015V4Pending>;
export function buildT015V4Pending(root: string, plan: T015V4Plan) {
  const risk = buildT015V4Risk(); const schema = buildT015V4Schema(); const forensics = buildT015V4Forensics(root); const binding = loadT015V4Binding(root);
  return {
    schema_version: 4, artifact_version: "t015-canonical-shard-1-disclosure-presentation-v4-pending", status: "PENDING_PRESENTATION_NOT_AUTHORIZED", secret_free: true,
    plan_sha256: t015V4PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T015V4(renderT015CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    provider_schema_evidence_sha256: sha256T015V4(renderT015CanonicalJson(schema)), forensics_evidence_sha256: sha256T015V4(renderT015CanonicalJson(forensics)),
    operations_v3_journal_sha256: forensics.immutable_sources.operations_v3.sha256, v3_approval_sha256: forensics.immutable_sources.v3_approval.sha256,
    implementation_binding_sha256: sha256T015V4(renderT015CanonicalJson(binding)), implementation_files: binding.files, t014_approval_sha256: T015_T014_APPROVAL_SHA256,
    exact_approval_phrase_required: T015_V4_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T015_V4_RECOVERY_OPERATOR_PHRASE, resume_operator_phrase: T015_V4_RESUME_OPERATOR_PHRASE,
    operator_phrases_are_agent_satisfiable: true, prior_t015_v1_v2_or_v3_approval_inherited: false, committed_clean_runtime_binding_required: true, scope: t015V4ApprovalScope(), authorized: false,
  } as const;
}

export type T015V4ControllerDisclosure = ReturnType<typeof buildT015V4ControllerDisclosure>;
export function buildT015V4ControllerDisclosure(root: string, plan: T015V4Plan, disclosedAt: string) {
  parseT015V4EvidenceTime(disclosedAt, "T015 v4 disclosure");
  const pending = buildT015V4Pending(root, plan);
  return { schema_version: 4, evidence_version: "t015-controller-disclosure-attestation-v4", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION", goal_slug: "ship-fictor-track1-2026", task_key: "T015", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, event_sequence: { assistant_disclosure_presented_at: disclosedAt, assistant_disclosure_text_sha256: sha256T015V4(T015_V4_RISK_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false }, bindings: { plan_sha256: pending.plan_sha256, pending_disclosure_packet_sha256: sha256T015V4(renderT015CanonicalJson(pending)), risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256, operations_v3_journal_sha256: pending.operations_v3_journal_sha256, v3_approval_sha256: pending.v3_approval_sha256, implementation_binding_sha256: pending.implementation_binding_sha256 }, scope: t015V4ApprovalScope(), secret_free: true } as const;
}
export function validateT015V4ControllerDisclosure(value: unknown, root: string, plan: T015V4Plan): asserts value is T015V4ControllerDisclosure { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T015 v4 controller disclosure is invalid"); const at = (value as { event_sequence?: { assistant_disclosure_presented_at?: unknown } }).event_sequence?.assistant_disclosure_presented_at; if (typeof at !== "string") throw new Error("T015 v4 disclosure timestamp missing"); exactEvidence(value, buildT015V4ControllerDisclosure(root, plan, at), "T015 v4 controller disclosure"); }

export type T015V4Presentation = ReturnType<typeof buildT015V4Presentation>;
export function buildT015V4Presentation(root: string, plan: T015V4Plan, balance: T015V4BalanceObservation | null) {
  const pending = buildT015V4Pending(root, plan);
  const controller = canonicalT015V4File<unknown>(root, T015_V4_CONTROLLER_DISCLOSURE_PATH);
  validateT015V4ControllerDisclosure(controller.value, root, plan);
  const legacy = balance === null ? { balance_observation_present: false, legacy_delta_mismatch: null, legacy_delta_disclosure_incomplete: true, legacy_provider_balance_delta_verified: false } as const : { balance_observation_present: true, ...t015V4LegacyDelta(balance), legacy_delta_disclosure_incomplete: false } as const;
  return {
    schema_version: 4, evidence_version: "t015-canonical-shard-1-disclosure-presentation-v4", secret_free: true,
    pending_packet_sha256: sha256T015V4(renderT015CanonicalJson(pending)), plan_sha256: pending.plan_sha256,
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, risk_disclosure_text_ko: T015_V4_RISK_TEXT,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    operations_v3_journal_sha256: pending.operations_v3_journal_sha256, v3_approval_sha256: pending.v3_approval_sha256,
    controller_disclosure_attestation_sha256: controller.sha256, implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    t014_approval_sha256: T015_T014_APPROVAL_SHA256, disclosed_at: controller.value.event_sequence.assistant_disclosure_presented_at, source: "current user conversation",
    legacy_balance_disclosure: legacy, scope: t015V4ApprovalScope(),
    exact_approval_phrase_required: T015_V4_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T015_V4_RECOVERY_OPERATOR_PHRASE, resume_operator_phrase: T015_V4_RESUME_OPERATOR_PHRASE,
    operator_phrases_are_agent_satisfiable: true, prior_t015_v1_v2_or_v3_approval_inherited: false, committed_clean_runtime_binding_required: true, authorized: false,
  } as const;
}
function presentationBalance(value: unknown): T015V4BalanceObservation | null {
  const legacy = (value as { legacy_balance_disclosure?: Record<string, unknown> } | null)?.legacy_balance_disclosure;
  if (!legacy || typeof legacy !== "object" || legacy.balance_observation_present !== true) return null;
  const decimalValue = legacy.observed_balance_decimal; const at = legacy.provider_observed_at;
  if (typeof decimalValue !== "string" || !/^\d+\.\d{2}$/.test(decimalValue) || typeof at !== "string") throw new Error("T015 v4 presentation balance is invalid");
  return { credits: Number(decimalValue), provider_observed_at: at };
}
export function validateT015V4Presentation(value: unknown, root: string, plan: T015V4Plan): asserts value is T015V4Presentation { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T015 v4 presentation is invalid"); exactEvidence(value, buildT015V4Presentation(root, plan, presentationBalance(value)), "T015 v4 presentation"); }

export type T015V4ControllerApproval = ReturnType<typeof buildT015V4ControllerApproval>;
export function buildT015V4ControllerApproval(root: string, plan: T015V4Plan, presentation: T015V4Presentation, approvedAt: string, now = new Date()) {
  validateT015V4Presentation(presentation, root, plan);
  const disclosedMs = parseT015V4EvidenceTime(presentation.disclosed_at, "T015 v4 disclosure");
  const approvedMs = parseT015V4EvidenceTime(approvedAt, "T015 v4 approval");
  if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime()) throw new Error("T015 v4 approval chronology is invalid");
  return { schema_version: 4, evidence_version: "t015-controller-approval-attestation-v4", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION", goal_slug: "ship-fictor-track1-2026", task_key: "T015", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T015_V4_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true }, bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T015V4(renderT015CanonicalJson(presentation)), risk_disclosure_evidence_sha256: presentation.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: presentation.risk_disclosure_text_sha256, provider_schema_evidence_sha256: presentation.provider_schema_evidence_sha256, forensics_evidence_sha256: presentation.forensics_evidence_sha256, operations_v3_journal_sha256: presentation.operations_v3_journal_sha256, v3_approval_sha256: presentation.v3_approval_sha256, implementation_binding_sha256: presentation.implementation_binding_sha256 }, scope: t015V4ApprovalScope(), secret_free: true } as const;
}
export function validateT015V4ControllerApproval(value: unknown, root: string, plan: T015V4Plan, presentation: T015V4Presentation, now = new Date()): asserts value is T015V4ControllerApproval { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T015 v4 controller approval is invalid"); const at = (value as { event_sequence?: { exact_user_reply_received_at?: unknown } }).event_sequence?.exact_user_reply_received_at; if (typeof at !== "string") throw new Error("T015 v4 approval timestamp missing"); exactEvidence(value, buildT015V4ControllerApproval(root, plan, presentation, at, now), "T015 v4 controller approval"); }

export type T015V4Approval = ReturnType<typeof buildT015V4Approval>;
export function buildT015V4Approval(root: string, plan: T015V4Plan, presentation: T015V4Presentation, now = new Date()) {
  validateT015V4Presentation(presentation, root, plan);
  const controller = canonicalT015V4File<unknown>(root, T015_V4_CONTROLLER_APPROVAL_PATH);
  validateT015V4ControllerApproval(controller.value, root, plan, presentation, now);
  const pending = buildT015V4Pending(root, plan);
  return {
    schema_version: 4, evidence_version: "t015-canonical-shard-1-approval-v4", secret_free: true, decision: "APPROVE_T015_V4_PAID_CANONICAL_12_331_320_ASSETS_480_CREDITS", source: "controller approval attestation",
    exact_user_quote: T015_V4_EXACT_APPROVAL_PHRASE, approved_at: controller.value.event_sequence.exact_user_reply_received_at, disclosed_at: presentation.disclosed_at,
    plan_sha256: pending.plan_sha256, disclosure_presentation_evidence_sha256: sha256T015V4(renderT015CanonicalJson(presentation)),
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    operations_v3_journal_sha256: pending.operations_v3_journal_sha256, v3_approval_sha256: pending.v3_approval_sha256,
    controller_disclosure_attestation_sha256: presentation.controller_disclosure_attestation_sha256, controller_approval_attestation_path: T015_V4_CONTROLLER_APPROVAL_PATH, controller_approval_attestation_sha256: controller.sha256,
    implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files, t014_approval_sha256: T015_T014_APPROVAL_SHA256,
    legacy_balance_disclosure: presentation.legacy_balance_disclosure, scope: t015V4ApprovalScope(),
    prior_t015_v1_v2_or_v3_approval_inherited: false, acknowledges_prior_approvals_not_inherited: true, committed_clean_runtime_binding_required: true, automatic_paid_retry_count: 0,
  } as const;
}
export function validateT015V4Approval(value: unknown, root: string, plan: T015V4Plan, presentation: T015V4Presentation, now = new Date()): asserts value is T015V4Approval { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T015 v4 approval is invalid"); exactEvidence(value, buildT015V4Approval(root, plan, presentation, now), "T015 v4 approval"); }

export function isT015V4Authorized(root: string, plan: T015V4Plan, now = new Date()): boolean {
  try {
    const presentation = canonicalT015V4File<unknown>(root, T015_V4_PRESENTATION_PATH);
    validateT015V4Presentation(presentation.value, root, plan);
    const controller = canonicalT015V4File<unknown>(root, T015_V4_CONTROLLER_APPROVAL_PATH);
    validateT015V4ControllerApproval(controller.value, root, plan, presentation.value, now);
    const approval = canonicalT015V4File<unknown>(root, T015_V4_APPROVAL_PATH);
    validateT015V4Approval(approval.value, root, plan, presentation.value, now);
    return true;
  } catch { return false; }
}
export function loadT015V4Authorization(root: string, plan: T015V4Plan, now = new Date()): { presentation: T015V4Presentation; approval: T015V4Approval } {
  const presentation = canonicalT015V4File<unknown>(root, T015_V4_PRESENTATION_PATH);
  validateT015V4Presentation(presentation.value, root, plan);
  const approval = canonicalT015V4File<unknown>(root, T015_V4_APPROVAL_PATH);
  validateT015V4Approval(approval.value, root, plan, presentation.value, now);
  return { presentation: presentation.value, approval: approval.value };
}
