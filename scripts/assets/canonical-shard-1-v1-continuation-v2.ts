import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  T015_CONTRACT_SHA256,
  T015_CORE_PLAN_PATH,
  T015_CORE_PLAN_SHA256,
  T015_ID_LIST_SHA256,
  T015_MASTER_STYLE_PATH,
  T015_MASTER_STYLE_SHA256,
  T015_NO_COPY_BOUNDARY,
  T015_REFERENCE_INSTRUCTION,
  T015_T014_APPROVAL_PATH,
  T015_T014_APPROVAL_SHA256,
  buildT015CanonicalShardPlan as buildLegacyPlan,
  canonicalJsonT015,
  renderT015CanonicalJson,
  sha256T015,
  t015PlanSha256 as legacyPlanSha256,
  type T015AssetRequest,
  type T015CanonicalShardPlan as T015LegacyPlan,
} from "./canonical-shard-1-v1";

export {
  T015_CONTRACT_SHA256,
  T015_ID_LIST_SHA256,
  T015_NO_COPY_BOUNDARY,
  T015_RECOVERY_OPERATOR_PHRASE,
  T015_REFERENCE_INSTRUCTION,
  T015_T014_APPROVAL_SHA256,
  canonicalJsonT015,
  renderT015CanonicalJson,
  sha256T015,
} from "./canonical-shard-1-v1";

export const T015_V2_PLAN_PATH = "assets/manifests/canonical-shard-1-v2.plan.json" as const;
export const T015_V2_RISK_PATH = "assets/evidence/t015-canonical-shard-1-risk-disclosure-v2.json" as const;
export const T015_V2_SCHEMA_PATH = "assets/evidence/t015-higgsfield-schema-v2.json" as const;
export const T015_V2_FORENSICS_PATH = "assets/evidence/t015-canonical-shard-1-v1-forensic-migration.json" as const;
export const T015_V2_DISCLOSURE_PACKET_PATH = "assets/evidence/t015-canonical-shard-1-disclosure-presentation-v2.pending.json" as const;
export const T015_V2_PRESENTATION_PATH = "assets/evidence/t015-canonical-shard-1-disclosure-presentation-v2.json" as const;
export const T015_V2_APPROVAL_PATH = "assets/evidence/t015-canonical-shard-1-approval-v2.json" as const;
export const T015_V2_ACTUAL_PATH = "assets/evidence/t015-canonical-shard-1-actual-run-v2.json" as const;
export const T015_V2_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t015-controller-disclosure-attestation-v2.json" as const;
export const T015_V2_CONTROLLER_APPROVAL_PATH = "assets/evidence/t015-controller-approval-attestation-v2.json" as const;
export const T015_V2_IMPLEMENTATION_BINDING_PATH = "assets/manifests/t015-implementation-binding-v2.json" as const;
export const T015_V1_PLAN_PATH = "assets/manifests/canonical-shard-1-v1.plan.json" as const;
export const T015_V1_BINDING_PATH = "assets/manifests/t015-implementation-binding-v1.json" as const;
export const T015_V1_RISK_PATH = "assets/evidence/t015-canonical-shard-1-risk-disclosure-v1.json" as const;
export const T015_V1_SCHEMA_PATH = "assets/evidence/t015-higgsfield-schema-v1.json" as const;
export const T015_V1_PRESENTATION_PATH = "assets/evidence/t015-canonical-shard-1-disclosure-presentation-v1.json" as const;
export const T015_V1_APPROVAL_PATH = "assets/evidence/t015-forensic-approval-v1.json" as const;
export const T015_V1_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t015-controller-disclosure-attestation-v1.json" as const;
export const T015_V1_CONTROLLER_APPROVAL_PATH = "assets/evidence/t015-forensic-controller-approval-attestation-v1.json" as const;
export const T015_V1_JOURNAL_PATH = "assets/runs/t015-canonical-shard-1/operations-v1.json" as const;

export const T015_V1_PLAN_SHA256 = "1a7ca4b377211a917d32ae856ecb50847dad360cb87ebb799975d573522b4e6c" as const;
export const T015_V1_BINDING_SHA256 = "78b1a2c3b827334bbfc012c466ca75e1167e7f30e5c3a9796bfd1effc9f96eb6" as const;
export const T015_V1_RISK_SHA256 = "b0b381c55ebec210f611f81d1a30ec7cbcddfc82285b43f828ae7aaeb6b7383e" as const;
export const T015_V1_SCHEMA_SHA256 = "35c2dfb05a22824d69d5549125559fecfa89156b81f63278db936bf26fb7a352" as const;
export const T015_V1_PRESENTATION_SHA256 = "13419414982a916a7ec06a9b3e7971bda3bb283856adc566b8876a00d6604ac0" as const;
export const T015_V1_APPROVAL_SHA256 = "d7e69e1a631529109329ff6c94ba1bd4311d1e175eaf5321a537956dc6542350" as const;
export const T015_V1_CONTROLLER_DISCLOSURE_SHA256 = "21922b6a484287fafea50161e31f29303c0b375f4a61d21970c744f599b570ae" as const;
export const T015_V1_CONTROLLER_APPROVAL_SHA256 = "2d844ee36c5468dc0c3bf2c61594c599c2a1d4a4fa72112eb18f883c7201951b" as const;
export const T015_V1_JOURNAL_SHA256 = "81d7ab7abdadbf86ee420953690550b62621910907fd9bb11cd8ccb19cf0d6f5" as const;
export const T015_V1_JOB_ID_LIST_SHA256 = "485a7c875f1893444d8eca01912f68dec30d8b7643976b86b6cb9856885fc9d3" as const;

export const T015_V2_EXACT_APPROVAL_PHRASE = "위 변경된 위험을 확인했고 T015 기존 12개 job ID의 무과금 복구와 CANONICAL 12..331 정확히 320장의 추가 480.00 credits 상한(이미 사용 18.00, 누적 상한 498.00), 자동 유료 재시도 0을 승인합니다." as const;

export const T015_V2_RISK_DISCLOSURE_TEXT = `T015 CANONICAL 0..331 총 332장·누적 498.00 credits 상한은 유지됩니다. 첫 12장(index 0..11)은 이미 단 한 번 제출되어 12개의 확정 job ID가 있고, 정확 단가 1.50에 따른 18.00 credits를 누적 상한에서 사용 처리합니다. 다만 제출 후 balance 차감 delta는 아직 조정되지 않아 실제 계정 차감액으로 확정하지 않습니다. 12개 job은 전부 nano_banana_flash·completed로 관찰됐습니다. 그 job을 새로 제출하거나 유료로 재시도하지 않고 기존 job ID만 무과금 조회·복구합니다. 기존 operations-v1 journal과 PROVIDER_RESPONSE_SIGNAL 실패 증거는 불변으로 보존하고, 새 코드는 별도 recovery-v2 journal로 정확한 job ID만 이전합니다. 실제 jobs_wait가 제공한 job metadata의 type=“image”만 정상으로 허용하며 다른 type, error·warning·thumbnail·알 수 없는 optional signal은 계속 fail-stop입니다. 나머지 CANONICAL 12..331 정확히 320장의 추가 유료 상한은 480.00 credits이며 자동 유료 재시도 예산은 0입니다. 이 320장은 변경된 코드·plan·presentation에 바인딩된 새 정확 승인 전에는 제출할 수 없으며, 과거 T015 v1 승인은 재사용하지 않습니다. 각 새 요청은 nano_banana_2, use_unlim=false, count=1, 3:4, 1k와 revision 1의 로컬 MEDIA_ONLY 참조로 제한됩니다. 이전 관찰의 표시 단가는 1, 정확 청구 단가는 credits_exact 1.50, 제출 전 balance는 861.90이었고 누적 상한 498.00 전부가 차감된다는 가정의 계산상 잔액은 363.90입니다. 계정에 적용되는 Terms/Privacy, Google supplemental terms 및 provider 조건, 학습 사용과 opt-out, reference 입력 권리, 공개 기본값·게시·attribution, 정확한 credit 만료 시각과 시간대는 아직 해결되지 않았습니다. 모호·부분 응답, 중복·index 불일치, model drift, 가격·balance 불일치, 파일 충돌은 fail-stop입니다. signed URL과 provider raw error는 일시적으로만 처리하고 journal·evidence·stdout에 남기지 않습니다. 결과 PNG는 provider-native bytes를 crop/resize 없이 최대 5000ppm의 3:4 오차만 허용해 public 및 별도 backup에 원자적으로 저장합니다. T016, CANONICAL index 332 이후, materials, hearts, world 자산은 제외됩니다. 새 승인은 이 고지가 실제 대화에 제시된 뒤 정확히 “${T015_V2_EXACT_APPROVAL_PHRASE}”로만 기록합니다.` as const;

export interface T015V2RiskDisclosure {
  schema_version: 2;
  evidence_version: "t015-canonical-shard-1-risk-disclosure-v2";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  secret_free: true;
  disclosure_text_ko: typeof T015_V2_RISK_DISCLOSURE_TEXT;
  disclosure_text_sha256: string;
  scope: T015V2ApprovalScope;
}

export interface T015V2ProviderSchemaEvidence {
  schema_version: 2;
  evidence_version: "t015-higgsfield-schema-v2";
  source: "T015 v1 nonpaid preflight and first paid batch observations";
  secret_free: true;
  model: { requested: "nano_banana_2"; provider_reported: "nano_banana_flash"; upstream_provider: "Google"; aspect_ratio: "3:4"; resolution: "1k"; media_role: "image"; use_unlim: false };
  cost: { display_credits_decimal: "1.00"; exact_credits_decimal: "1.50"; billing_basis: "credits_exact" };
  batch: { observed_contract_max_requests: 12; response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET" };
  jobs_wait: { production_input: "STDIN_ONLY"; expected_safe_job_type: "image"; other_type_values_fail_stop: true; other_optional_signals_fail_stop: true; signed_urls_persisted: false; raw_errors_persisted: false; same_job_repoll_only: true };
}

export interface T015V1ForensicMigrationEvidence {
  schema_version: 1;
  evidence_version: "t015-canonical-shard-1-v1-forensic-migration";
  secret_free: true;
  immutable_source: true;
  legacy: {
    journal: { path: typeof T015_V1_JOURNAL_PATH; sha256: typeof T015_V1_JOURNAL_SHA256 };
    plan: { path: typeof T015_V1_PLAN_PATH; sha256: typeof T015_V1_PLAN_SHA256 };
    implementation_binding: { path: typeof T015_V1_BINDING_PATH; sha256: typeof T015_V1_BINDING_SHA256 };
    risk: { path: typeof T015_V1_RISK_PATH; sha256: typeof T015_V1_RISK_SHA256 };
    provider_schema: { path: typeof T015_V1_SCHEMA_PATH; sha256: typeof T015_V1_SCHEMA_SHA256 };
    disclosure_presentation: { path: typeof T015_V1_PRESENTATION_PATH; sha256: typeof T015_V1_PRESENTATION_SHA256 };
    approval: { path: typeof T015_V1_APPROVAL_PATH; sha256: typeof T015_V1_APPROVAL_SHA256 };
    controller_disclosure: { path: typeof T015_V1_CONTROLLER_DISCLOSURE_PATH; sha256: typeof T015_V1_CONTROLLER_DISCLOSURE_SHA256 };
    controller_approval: { path: typeof T015_V1_CONTROLLER_APPROVAL_PATH; sha256: typeof T015_V1_CONTROLLER_APPROVAL_SHA256 };
  };
  observed: { first_batch_id: "canonical-shard-1-001"; asset_slice: "0..11"; asset_count: 12; exact_job_id_list_sha256: typeof T015_V1_JOB_ID_LIST_SHA256; submitted_exactly_once: true; submitted_count: 12; completed_count: 12; reported_model: "nano_banana_flash"; cap_committed_decimal: "18.00"; provider_balance_delta_verified: false; job_poll_count: 1; recovery_count: 0; preserved_failure_code: "PROVIDER_RESPONSE_SIGNAL"; recovery_failure_count: 1; remaining_planned_batch_count: 27 };
  migration_policy: { copy_exact_job_ids_at_runtime: true; mutate_legacy_journal: false; paid_submit_allowed: false; paid_retry_count: 0; signed_urls_or_raw_errors_persisted: false };
}

export interface T015V2ApprovalScope {
  category: "CANONICAL";
  legacy_recovery_slice: "0..11";
  legacy_recovery_asset_count: 12;
  legacy_cap_committed_decimal: "18.00";
  legacy_provider_balance_delta_verified: false;
  new_paid_slice: "12..331";
  new_paid_asset_count: 320;
  additional_credit_cap_decimal: "480.00";
  total_credit_cap_decimal: "498.00";
  automatic_paid_retry_reserve_decimal: "0.00";
  t016_or_other_assets_allowed: false;
}

export interface T015V2ImplementationBinding {
  schema_version: 2;
  manifest_version: "t015-implementation-binding-v2";
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  files: { [K in T015V2RuntimeFileKey]: { path: (typeof T015_V2_RUNTIME_FILE_PATHS)[K]; sha256: string } };
}

export interface T015V2CanonicalShardPlan {
  schema_version: 2;
  plan_version: "t015-canonical-shard-1-v2";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  state: "HOLD_FOR_FRESH_CONTINUATION_APPROVAL";
  remote_execution_allowed_without_approval: false;
  scope: { category: "CANONICAL"; total_slice: "0..331"; total_asset_count: 332; legacy_recovery_slice: "0..11"; legacy_recovery_asset_count: 12; new_paid_slice: "12..331"; new_paid_asset_count: 320; excluded_first_id: "forge__join_02__wash_02"; t016_or_other_assets_allowed: false };
  sources: {
    legacy_plan: { path: typeof T015_V1_PLAN_PATH; sha256: typeof T015_V1_PLAN_SHA256 };
    core_plan: { path: typeof T015_CORE_PLAN_PATH; sha256: typeof T015_CORE_PLAN_SHA256 };
    master_style: { path: typeof T015_MASTER_STYLE_PATH; sha256: typeof T015_MASTER_STYLE_SHA256 };
    t014_approval: { path: typeof T015_T014_APPROVAL_PATH; sha256: typeof T015_T014_APPROVAL_SHA256 };
    legacy_run_forensics: { path: typeof T015_V2_FORENSICS_PATH; sha256: string };
    risk_disclosure: { path: typeof T015_V2_RISK_PATH; sha256: string; text_sha256: string };
    provider_schema: { path: typeof T015_V2_SCHEMA_PATH; sha256: string };
    implementation_binding: { path: typeof T015_V2_IMPLEMENTATION_BINDING_PATH; sha256: string; files: T015V2ImplementationBinding["files"] };
  };
  selection: T015LegacyPlan["selection"];
  legacy_recovery: { batch: T015LegacyPlan["batches"][number]; source_journal_path: typeof T015_V1_JOURNAL_PATH; source_journal_sha256: typeof T015_V1_JOURNAL_SHA256; exact_existing_job_ids_only: true; new_paid_submit_allowed: false };
  provider_contract: { tool: "generate_image_batch"; requested_model: "nano_banana_2"; expected_provider_reported_model: "nano_banana_flash"; upstream_provider: "Google"; aspect_ratio: "3:4"; resolution: "1k"; count_per_asset: 1; use_unlim: false; batch_max: 12; response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET"; jobs_wait_expected_safe_type: "image" };
  reference_binding: T015LegacyPlan["reference_binding"];
  prompt_contract: T015LegacyPlan["prompt_contract"];
  budget: { unit_cost_decimal: "1.50"; total_request_count: 332; already_submitted_count: 12; legacy_cap_committed_decimal: "18.00"; legacy_provider_balance_delta_verified: false; new_paid_request_count: 320; new_paid_batch_count: 27; new_paid_batch_sizes: "12x26+8"; additional_credit_cap_decimal: "480.00"; total_credit_cap_decimal: "498.00"; historical_pre_submit_balance_decimal: "861.90"; projected_remainder_decimal: "363.90"; automatic_paid_retry_reserve_decimal: "0.00" };
  retry_policy: T015LegacyPlan["retry_policy"];
  recovery_policy: T015LegacyPlan["recovery_policy"];
  approval_gate: { pending_disclosure_packet_path: typeof T015_V2_DISCLOSURE_PACKET_PATH; disclosure_presentation_path: typeof T015_V2_PRESENTATION_PATH; controller_approval_attestation_path: typeof T015_V2_CONTROLLER_APPROVAL_PATH; approval_path: typeof T015_V2_APPROVAL_PATH; status: "MISSING_NOT_AUTHORIZED"; exact_phrase: typeof T015_V2_EXACT_APPROVAL_PHRASE; prior_t015_v1_approval_inherited: false };
  assets: Array<T015LegacyPlan["assets"][number]>;
  batches: Array<T015LegacyPlan["batches"][number]>;
}

export interface T015V2DisclosurePacket {
  schema_version: 2;
  artifact_version: "t015-canonical-shard-1-disclosure-presentation-v2-pending";
  status: "PENDING_PRESENTATION_NOT_AUTHORIZED";
  secret_free: true;
  plan_sha256: string;
  risk_disclosure_evidence_sha256: string;
  risk_disclosure_text_sha256: string;
  provider_schema_evidence_sha256: string;
  legacy_run_forensics_sha256: string;
  implementation_binding_sha256: string;
  implementation_files: T015V2ImplementationBinding["files"];
  t014_approval_sha256: typeof T015_T014_APPROVAL_SHA256;
  exact_approval_phrase_required: typeof T015_V2_EXACT_APPROVAL_PHRASE;
  prior_t015_v1_approval_inherited: false;
  authorized: false;
}

export interface T015V2DisclosurePresentationEvidence {
  schema_version: 2;
  evidence_version: "t015-canonical-shard-1-disclosure-presentation-v2";
  secret_free: true;
  pending_packet_sha256: string;
  plan_sha256: string;
  risk_disclosure_evidence_sha256: string;
  risk_disclosure_text_sha256: string;
  provider_schema_evidence_sha256: string;
  legacy_run_forensics_sha256: string;
  controller_attestation_sha256: string;
  implementation_binding_sha256: string;
  implementation_files: T015V2ImplementationBinding["files"];
  t014_approval_sha256: typeof T015_T014_APPROVAL_SHA256;
  disclosed_at: string;
  source: "current user conversation";
  exact_approval_phrase_required: typeof T015_V2_EXACT_APPROVAL_PHRASE;
}

export interface T015V2ApprovalEvidence {
  schema_version: 2;
  evidence_version: "t015-canonical-shard-1-approval-v2";
  secret_free: true;
  decision: "APPROVE_T015_RECOVERY_12_AND_NEW_PAID_CANONICAL_12_331_WITH_DISCLOSED_RISKS";
  source: "controller approval attestation";
  exact_user_quote: typeof T015_V2_EXACT_APPROVAL_PHRASE;
  approved_at: string;
  disclosed_at: string;
  plan_sha256: string;
  risk_disclosure_evidence_sha256: string;
  risk_disclosure_text_sha256: string;
  provider_schema_evidence_sha256: string;
  legacy_run_forensics_sha256: string;
  controller_attestation_sha256: string;
  controller_approval_attestation_path: typeof T015_V2_CONTROLLER_APPROVAL_PATH;
  controller_approval_attestation_sha256: string;
  implementation_binding_sha256: string;
  implementation_files: T015V2ImplementationBinding["files"];
  disclosure_presentation_evidence_sha256: string;
  t014_approval_sha256: typeof T015_T014_APPROVAL_SHA256;
  scope: T015V2ApprovalScope;
  prior_t015_v1_approval_inherited: false;
  acknowledges_prior_approvals_not_inherited: true;
}

interface T015V2ControllerDisclosureAttestation {
  schema_version: 2;
  evidence_version: "t015-controller-disclosure-attestation-v2";
  attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION";
  goal_slug: "ship-fictor-track1-2026";
  task_key: "T015";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  event_sequence: { assistant_disclosure_presented_at: string; assistant_disclosure_text_sha256: string; assistant_disclosure_was_presented_in_current_conversation: true; exact_scoped_approval_received_after_disclosure: false };
  bindings: { plan_sha256: string; pending_disclosure_packet_sha256: string; risk_disclosure_evidence_sha256: string; provider_schema_evidence_sha256: string; legacy_run_forensics_sha256: string; implementation_binding_sha256: string };
  scope: T015V2ApprovalScope;
  secret_free: true;
}

interface T015V2ControllerApprovalAttestation {
  schema_version: 2;
  evidence_version: "t015-controller-approval-attestation-v2";
  attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION";
  goal_slug: "ship-fictor-track1-2026";
  task_key: "T015";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  event_sequence: { assistant_disclosure_presented_at: string; exact_user_reply_ko: typeof T015_V2_EXACT_APPROVAL_PHRASE; exact_user_reply_received_at: string; exact_scoped_approval_received_after_disclosure: true };
  bindings: { plan_sha256: string; disclosure_presentation_evidence_sha256: string; risk_disclosure_evidence_sha256: string; risk_disclosure_text_sha256: string; provider_schema_evidence_sha256: string; legacy_run_forensics_sha256: string; implementation_binding_sha256: string };
  scope: T015V2ApprovalScope;
  secret_free: true;
}

export const T015_V2_RUNTIME_FILE_PATHS = {
  controller: "scripts/assets/canonical-shard-1-v1-continuation-v2-controller.ts",
  plan_builder: "scripts/assets/canonical-shard-1-v1-continuation-v2.ts",
  ops: "scripts/assets/canonical-shard-1-v1-continuation-v2-ops-cli.ts",
  cli: "scripts/assets/canonical-shard-1-v1-continuation-v2-cli.ts",
  legacy_plan_builder: "scripts/assets/canonical-shard-1-v1.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
  package_json: "package.json",
  package_lock: "package-lock.json",
} as const;
export type T015V2RuntimeFileKey = keyof typeof T015_V2_RUNTIME_FILE_PATHS;

const LOCAL_IMPORT_CLOSURE: Partial<Record<T015V2RuntimeFileKey, readonly string[]>> = {
  controller: ["./canonical-shard-1-v1-continuation-v2-cli", "./canonical-shard-1-v1-continuation-v2-ops-cli"],
  plan_builder: ["./canonical-shard-1-v1"],
  ops: ["./canonical-shard-1-v1-continuation-v2", "./filesystem"],
  cli: ["./canonical-shard-1-v1-continuation-v2", "./filesystem"],
  legacy_plan_builder: [],
  filesystem: ["./types"],
  filesystem_types: ["../../src/data/schema/contracts"],
  schema_contracts: [],
};

function localImports(source: string): string[] { return [...new Set([...source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)].map((match) => match[1]))].sort(); }
function readCanonicalJson<T>(root: string, path: string, expectedSha?: string): { value: T; bytes: Buffer; sha256: string } {
  const target = resolve(root, path); const info = lstatSync(target); if (info.isSymbolicLink() || !info.isFile()) throw new Error(`T015 v2 pinned JSON is not a regular file: ${path}`);
  const bytes = readFileSync(target); const sha256 = sha256T015(bytes); if (expectedSha && sha256 !== expectedSha) throw new Error(`T015 v2 pinned JSON changed: ${path}`);
  const value = JSON.parse(bytes.toString("utf8")) as T; if (bytes.toString("utf8") !== renderT015CanonicalJson(value)) throw new Error(`T015 v2 pinned JSON is not canonical: ${path}`); return { value, bytes, sha256 };
}
function assertTrackedIfPresent(root: string, path: string, bytes: string): void { const target = resolve(root, path); if (existsSync(target) && (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes)) throw new Error(`tracked T015 v2 artifact changed: ${path}`); }
function parseTimestamp(value: string, label: string): number { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`valid ${label} timestamp is required`); return Date.parse(value); }
export function t015V2ApprovalScope(): T015V2ApprovalScope { return { category: "CANONICAL", legacy_recovery_slice: "0..11", legacy_recovery_asset_count: 12, legacy_cap_committed_decimal: "18.00", legacy_provider_balance_delta_verified: false, new_paid_slice: "12..331", new_paid_asset_count: 320, additional_credit_cap_decimal: "480.00", total_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00", t016_or_other_assets_allowed: false }; }

export function buildT015V1ForensicMigrationEvidence(): T015V1ForensicMigrationEvidence {
  return {
    schema_version: 1, evidence_version: "t015-canonical-shard-1-v1-forensic-migration", secret_free: true, immutable_source: true,
    legacy: {
      journal: { path: T015_V1_JOURNAL_PATH, sha256: T015_V1_JOURNAL_SHA256 }, plan: { path: T015_V1_PLAN_PATH, sha256: T015_V1_PLAN_SHA256 }, implementation_binding: { path: T015_V1_BINDING_PATH, sha256: T015_V1_BINDING_SHA256 }, risk: { path: T015_V1_RISK_PATH, sha256: T015_V1_RISK_SHA256 }, provider_schema: { path: T015_V1_SCHEMA_PATH, sha256: T015_V1_SCHEMA_SHA256 }, disclosure_presentation: { path: T015_V1_PRESENTATION_PATH, sha256: T015_V1_PRESENTATION_SHA256 }, approval: { path: T015_V1_APPROVAL_PATH, sha256: T015_V1_APPROVAL_SHA256 }, controller_disclosure: { path: T015_V1_CONTROLLER_DISCLOSURE_PATH, sha256: T015_V1_CONTROLLER_DISCLOSURE_SHA256 }, controller_approval: { path: T015_V1_CONTROLLER_APPROVAL_PATH, sha256: T015_V1_CONTROLLER_APPROVAL_SHA256 },
    },
    observed: { first_batch_id: "canonical-shard-1-001", asset_slice: "0..11", asset_count: 12, exact_job_id_list_sha256: T015_V1_JOB_ID_LIST_SHA256, submitted_exactly_once: true, submitted_count: 12, completed_count: 12, reported_model: "nano_banana_flash", cap_committed_decimal: "18.00", provider_balance_delta_verified: false, job_poll_count: 1, recovery_count: 0, preserved_failure_code: "PROVIDER_RESPONSE_SIGNAL", recovery_failure_count: 1, remaining_planned_batch_count: 27 },
    migration_policy: { copy_exact_job_ids_at_runtime: true, mutate_legacy_journal: false, paid_submit_allowed: false, paid_retry_count: 0, signed_urls_or_raw_errors_persisted: false },
  };
}
export function buildT015V2RiskDisclosure(): T015V2RiskDisclosure { return { schema_version: 2, evidence_version: "t015-canonical-shard-1-risk-disclosure-v2", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T015_V2_RISK_DISCLOSURE_TEXT, disclosure_text_sha256: sha256T015(T015_V2_RISK_DISCLOSURE_TEXT), scope: t015V2ApprovalScope() }; }
export function buildT015V2ProviderSchemaEvidence(): T015V2ProviderSchemaEvidence { return { schema_version: 2, evidence_version: "t015-higgsfield-schema-v2", source: "T015 v1 nonpaid preflight and first paid batch observations", secret_free: true, model: { requested: "nano_banana_2", provider_reported: "nano_banana_flash", upstream_provider: "Google", aspect_ratio: "3:4", resolution: "1k", media_role: "image", use_unlim: false }, cost: { display_credits_decimal: "1.00", exact_credits_decimal: "1.50", billing_basis: "credits_exact" }, batch: { observed_contract_max_requests: 12, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET" }, jobs_wait: { production_input: "STDIN_ONLY", expected_safe_job_type: "image", other_type_values_fail_stop: true, other_optional_signals_fail_stop: true, signed_urls_persisted: false, raw_errors_persisted: false, same_job_repoll_only: true } }; }

function assertRuntimeClosure(root: string): void {
  for (const [key, expected] of Object.entries(LOCAL_IMPORT_CLOSURE) as Array<[T015V2RuntimeFileKey, readonly string[]]>) {
    const source = readFileSync(resolve(root, T015_V2_RUNTIME_FILE_PATHS[key]), "utf8");
    if (canonicalJsonT015(localImports(source)) !== canonicalJsonT015([...expected].sort())) throw new Error(`T015 v2 runtime import closure changed: ${key}`);
  }
}
export function buildT015V2ImplementationBinding(root: string): T015V2ImplementationBinding {
  assertRuntimeClosure(root); const files: Record<string, { path: string; sha256: string }> = {};
  for (const key of Object.keys(T015_V2_RUNTIME_FILE_PATHS) as T015V2RuntimeFileKey[]) { const path = T015_V2_RUNTIME_FILE_PATHS[key]; const target = resolve(root, path); const info = lstatSync(target); if (info.isSymbolicLink() || !info.isFile()) throw new Error(`T015 v2 runtime input is not a regular file: ${path}`); files[key] = { path, sha256: sha256T015(readFileSync(target)) }; }
  return { schema_version: 2, manifest_version: "t015-implementation-binding-v2", issue_contract_sha256: T015_CONTRACT_SHA256, files: files as T015V2ImplementationBinding["files"] };
}
export function loadT015V2ImplementationBinding(root: string): T015V2ImplementationBinding { const loaded = readCanonicalJson<T015V2ImplementationBinding>(root, T015_V2_IMPLEMENTATION_BINDING_PATH); const expected = buildT015V2ImplementationBinding(root); if (canonicalJsonT015(loaded.value) !== canonicalJsonT015(expected)) throw new Error("T015 v2 implementation binding changed"); return loaded.value; }
export function t015V2ImplementationBindingSha256(root: string): string { loadT015V2ImplementationBinding(root); return sha256T015(readFileSync(resolve(root, T015_V2_IMPLEMENTATION_BINDING_PATH))); }

function buildPlanRaw(root: string): T015V2CanonicalShardPlan {
  const legacy = buildLegacyPlan(root); if (legacyPlanSha256(legacy) !== T015_V1_PLAN_SHA256) throw new Error("T015 legacy plan changed");
  const implementation = loadT015V2ImplementationBinding(root); const implementationSha = t015V2ImplementationBindingSha256(root);
  const risk = buildT015V2RiskDisclosure(); const schema = buildT015V2ProviderSchemaEvidence(); const forensics = buildT015V1ForensicMigrationEvidence();
  const riskBytes = renderT015CanonicalJson(risk); const schemaBytes = renderT015CanonicalJson(schema); const forensicBytes = renderT015CanonicalJson(forensics);
  assertTrackedIfPresent(root, T015_V2_RISK_PATH, riskBytes); assertTrackedIfPresent(root, T015_V2_SCHEMA_PATH, schemaBytes); assertTrackedIfPresent(root, T015_V2_FORENSICS_PATH, forensicBytes);
  if (legacy.assets.length !== 332 || legacy.batches.length !== 28 || legacy.batches[0].size !== 12 || legacy.batches.slice(1).reduce((sum, batch) => sum + batch.size, 0) !== 320) throw new Error("T015 v2 continuation boundary changed");
  return {
    schema_version: 2, plan_version: "t015-canonical-shard-1-v2", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, state: "HOLD_FOR_FRESH_CONTINUATION_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: { category: "CANONICAL", total_slice: "0..331", total_asset_count: 332, legacy_recovery_slice: "0..11", legacy_recovery_asset_count: 12, new_paid_slice: "12..331", new_paid_asset_count: 320, excluded_first_id: "forge__join_02__wash_02", t016_or_other_assets_allowed: false },
    sources: { legacy_plan: { path: T015_V1_PLAN_PATH, sha256: T015_V1_PLAN_SHA256 }, core_plan: { path: T015_CORE_PLAN_PATH, sha256: T015_CORE_PLAN_SHA256 }, master_style: { path: T015_MASTER_STYLE_PATH, sha256: T015_MASTER_STYLE_SHA256 }, t014_approval: { path: T015_T014_APPROVAL_PATH, sha256: T015_T014_APPROVAL_SHA256 }, legacy_run_forensics: { path: T015_V2_FORENSICS_PATH, sha256: sha256T015(forensicBytes) }, risk_disclosure: { path: T015_V2_RISK_PATH, sha256: sha256T015(riskBytes), text_sha256: risk.disclosure_text_sha256 }, provider_schema: { path: T015_V2_SCHEMA_PATH, sha256: sha256T015(schemaBytes) }, implementation_binding: { path: T015_V2_IMPLEMENTATION_BINDING_PATH, sha256: implementationSha, files: implementation.files } },
    selection: legacy.selection,
    legacy_recovery: { batch: legacy.batches[0], source_journal_path: T015_V1_JOURNAL_PATH, source_journal_sha256: T015_V1_JOURNAL_SHA256, exact_existing_job_ids_only: true, new_paid_submit_allowed: false },
    provider_contract: { tool: "generate_image_batch", requested_model: "nano_banana_2", expected_provider_reported_model: "nano_banana_flash", upstream_provider: "Google", aspect_ratio: "3:4", resolution: "1k", count_per_asset: 1, use_unlim: false, batch_max: 12, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET", jobs_wait_expected_safe_type: "image" },
    reference_binding: legacy.reference_binding, prompt_contract: legacy.prompt_contract,
    budget: { unit_cost_decimal: "1.50", total_request_count: 332, already_submitted_count: 12, legacy_cap_committed_decimal: "18.00", legacy_provider_balance_delta_verified: false, new_paid_request_count: 320, new_paid_batch_count: 27, new_paid_batch_sizes: "12x26+8", additional_credit_cap_decimal: "480.00", total_credit_cap_decimal: "498.00", historical_pre_submit_balance_decimal: "861.90", projected_remainder_decimal: "363.90", automatic_paid_retry_reserve_decimal: "0.00" },
    retry_policy: legacy.retry_policy, recovery_policy: legacy.recovery_policy,
    approval_gate: { pending_disclosure_packet_path: T015_V2_DISCLOSURE_PACKET_PATH, disclosure_presentation_path: T015_V2_PRESENTATION_PATH, controller_approval_attestation_path: T015_V2_CONTROLLER_APPROVAL_PATH, approval_path: T015_V2_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T015_V2_EXACT_APPROVAL_PHRASE, prior_t015_v1_approval_inherited: false },
    assets: legacy.assets, batches: legacy.batches.slice(1),
  };
}
export function buildT015V2CanonicalShardPlan(root: string): T015V2CanonicalShardPlan { const plan = buildPlanRaw(root); validateT015V2CanonicalShardPlan(plan, root); return plan; }
export function validateT015V2CanonicalShardPlan(plan: T015V2CanonicalShardPlan, root: string): void { if (canonicalJsonT015(plan) !== canonicalJsonT015(buildPlanRaw(root))) throw new Error("T015 v2 plan changed from continuation contract"); }
export function renderT015V2Plan(plan: T015V2CanonicalShardPlan): string { return renderT015CanonicalJson(plan); }
export function t015V2PlanSha256(plan: T015V2CanonicalShardPlan): string { return sha256T015(renderT015V2Plan(plan)); }

export function buildT015V2DisclosurePacket(root: string, plan: T015V2CanonicalShardPlan, risk = buildT015V2RiskDisclosure(), schema = buildT015V2ProviderSchemaEvidence()): T015V2DisclosurePacket {
  const forensics = buildT015V1ForensicMigrationEvidence(); const binding = loadT015V2ImplementationBinding(root);
  return { schema_version: 2, artifact_version: "t015-canonical-shard-1-disclosure-presentation-v2-pending", status: "PENDING_PRESENTATION_NOT_AUTHORIZED", secret_free: true, plan_sha256: t015V2PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T015(renderT015CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256, provider_schema_evidence_sha256: sha256T015(renderT015CanonicalJson(schema)), legacy_run_forensics_sha256: sha256T015(renderT015CanonicalJson(forensics)), implementation_binding_sha256: t015V2ImplementationBindingSha256(root), implementation_files: binding.files, t014_approval_sha256: T015_T014_APPROVAL_SHA256, exact_approval_phrase_required: T015_V2_EXACT_APPROVAL_PHRASE, prior_t015_v1_approval_inherited: false, authorized: false };
}

function loadControllerDisclosure(root: string, plan: T015V2CanonicalShardPlan, packet: T015V2DisclosurePacket): { value: T015V2ControllerDisclosureAttestation; sha256: string } {
  const loaded = readCanonicalJson<T015V2ControllerDisclosureAttestation>(root, T015_V2_CONTROLLER_DISCLOSURE_PATH); const at = loaded.value?.event_sequence?.assistant_disclosure_presented_at; if (typeof at !== "string") throw new Error("T015 v2 disclosure timestamp is required"); parseTimestamp(at, "T015 v2 disclosure");
  const expected: T015V2ControllerDisclosureAttestation = { schema_version: 2, evidence_version: "t015-controller-disclosure-attestation-v2", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION", goal_slug: "ship-fictor-track1-2026", task_key: "T015", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, event_sequence: { assistant_disclosure_presented_at: at, assistant_disclosure_text_sha256: sha256T015(T015_V2_RISK_DISCLOSURE_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false }, bindings: { plan_sha256: packet.plan_sha256, pending_disclosure_packet_sha256: sha256T015(renderT015CanonicalJson(packet)), risk_disclosure_evidence_sha256: packet.risk_disclosure_evidence_sha256, provider_schema_evidence_sha256: packet.provider_schema_evidence_sha256, legacy_run_forensics_sha256: packet.legacy_run_forensics_sha256, implementation_binding_sha256: packet.implementation_binding_sha256 }, scope: t015V2ApprovalScope(), secret_free: true };
  if (canonicalJsonT015(loaded.value) !== canonicalJsonT015(expected) || packet.plan_sha256 !== t015V2PlanSha256(plan)) throw new Error("T015 v2 controller disclosure attestation changed"); return { value: loaded.value, sha256: loaded.sha256 };
}
export function buildT015V2DisclosurePresentationEvidence(root: string, plan: T015V2CanonicalShardPlan, risk = buildT015V2RiskDisclosure(), schema = buildT015V2ProviderSchemaEvidence()): T015V2DisclosurePresentationEvidence {
  const packet = buildT015V2DisclosurePacket(root, plan, risk, schema); const attestation = loadControllerDisclosure(root, plan, packet); const binding = loadT015V2ImplementationBinding(root);
  return { schema_version: 2, evidence_version: "t015-canonical-shard-1-disclosure-presentation-v2", secret_free: true, pending_packet_sha256: sha256T015(renderT015CanonicalJson(packet)), plan_sha256: packet.plan_sha256, risk_disclosure_evidence_sha256: packet.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: packet.risk_disclosure_text_sha256, provider_schema_evidence_sha256: packet.provider_schema_evidence_sha256, legacy_run_forensics_sha256: packet.legacy_run_forensics_sha256, controller_attestation_sha256: attestation.sha256, implementation_binding_sha256: packet.implementation_binding_sha256, implementation_files: binding.files, t014_approval_sha256: T015_T014_APPROVAL_SHA256, disclosed_at: attestation.value.event_sequence.assistant_disclosure_presented_at, source: "current user conversation", exact_approval_phrase_required: T015_V2_EXACT_APPROVAL_PHRASE };
}
export function validateT015V2DisclosurePresentationEvidence(value: unknown, root: string, plan: T015V2CanonicalShardPlan, risk = buildT015V2RiskDisclosure(), schema = buildT015V2ProviderSchemaEvidence()): asserts value is T015V2DisclosurePresentationEvidence { if (!value || typeof value !== "object" || Array.isArray(value) || canonicalJsonT015(value) !== canonicalJsonT015(buildT015V2DisclosurePresentationEvidence(root, plan, risk, schema))) throw new Error("T015 v2 disclosure presentation binding changed"); }

function loadControllerApproval(root: string, plan: T015V2CanonicalShardPlan, risk: T015V2RiskDisclosure, schema: T015V2ProviderSchemaEvidence, presentation: T015V2DisclosurePresentationEvidence, now: Date): { value: T015V2ControllerApprovalAttestation; sha256: string } {
  validateT015V2DisclosurePresentationEvidence(presentation, root, plan, risk, schema); const loaded = readCanonicalJson<T015V2ControllerApprovalAttestation>(root, T015_V2_CONTROLLER_APPROVAL_PATH); const approvedAt = loaded.value?.event_sequence?.exact_user_reply_received_at; if (typeof approvedAt !== "string") throw new Error("T015 v2 approval timestamp is required"); const approvedMs = parseTimestamp(approvedAt, "T015 v2 approval"); const disclosedMs = parseTimestamp(presentation.disclosed_at, "T015 v2 disclosure"); if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime() || now.getTime() - approvedMs > 15 * 60 * 1000) throw new Error("T015 v2 approval chronology is invalid");
  const expected: T015V2ControllerApprovalAttestation = { schema_version: 2, evidence_version: "t015-controller-approval-attestation-v2", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION", goal_slug: "ship-fictor-track1-2026", task_key: "T015", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T015_V2_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true }, bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T015(renderT015CanonicalJson(presentation)), risk_disclosure_evidence_sha256: presentation.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: presentation.risk_disclosure_text_sha256, provider_schema_evidence_sha256: presentation.provider_schema_evidence_sha256, legacy_run_forensics_sha256: presentation.legacy_run_forensics_sha256, implementation_binding_sha256: presentation.implementation_binding_sha256 }, scope: t015V2ApprovalScope(), secret_free: true };
  if (canonicalJsonT015(loaded.value) !== canonicalJsonT015(expected)) throw new Error("T015 v2 controller approval attestation changed or is not affirmative"); return { value: loaded.value, sha256: loaded.sha256 };
}
export function buildT015V2ApprovalEvidence(root: string, plan: T015V2CanonicalShardPlan, risk: T015V2RiskDisclosure, schema: T015V2ProviderSchemaEvidence, presentation: T015V2DisclosurePresentationEvidence, now = new Date()): T015V2ApprovalEvidence {
  const controller = loadControllerApproval(root, plan, risk, schema, presentation, now); const binding = loadT015V2ImplementationBinding(root); const approvedAt = controller.value.event_sequence.exact_user_reply_received_at;
  return { schema_version: 2, evidence_version: "t015-canonical-shard-1-approval-v2", secret_free: true, decision: "APPROVE_T015_RECOVERY_12_AND_NEW_PAID_CANONICAL_12_331_WITH_DISCLOSED_RISKS", source: "controller approval attestation", exact_user_quote: T015_V2_EXACT_APPROVAL_PHRASE, approved_at: approvedAt, disclosed_at: presentation.disclosed_at, plan_sha256: t015V2PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T015(renderT015CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256, provider_schema_evidence_sha256: sha256T015(renderT015CanonicalJson(schema)), legacy_run_forensics_sha256: sha256T015(renderT015CanonicalJson(buildT015V1ForensicMigrationEvidence())), controller_attestation_sha256: presentation.controller_attestation_sha256, controller_approval_attestation_path: T015_V2_CONTROLLER_APPROVAL_PATH, controller_approval_attestation_sha256: controller.sha256, implementation_binding_sha256: t015V2ImplementationBindingSha256(root), implementation_files: binding.files, disclosure_presentation_evidence_sha256: sha256T015(renderT015CanonicalJson(presentation)), t014_approval_sha256: T015_T014_APPROVAL_SHA256, scope: t015V2ApprovalScope(), prior_t015_v1_approval_inherited: false, acknowledges_prior_approvals_not_inherited: true };
}
export function validateT015V2ApprovalEvidence(value: unknown, root: string, plan: T015V2CanonicalShardPlan, risk: T015V2RiskDisclosure, schema: T015V2ProviderSchemaEvidence, presentation: T015V2DisclosurePresentationEvidence, now = new Date()): asserts value is T015V2ApprovalEvidence { if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { approved_at?: unknown }).approved_at !== "string") throw new Error("T015 v2 approval evidence is invalid"); const approvedAt = (value as { approved_at: string }).approved_at; const validationNow = now.getTime() === Date.parse(approvedAt) ? now : new Date(Date.parse(approvedAt)); if (canonicalJsonT015(value) !== canonicalJsonT015(buildT015V2ApprovalEvidence(root, plan, risk, schema, presentation, validationNow))) throw new Error("T015 v2 approval evidence binding changed"); }
export function isT015V2Authorized(root: string, plan: T015V2CanonicalShardPlan): boolean {
  const presentationPath = resolve(root, T015_V2_PRESENTATION_PATH); const approvalPath = resolve(root, T015_V2_APPROVAL_PATH); if (!existsSync(presentationPath) || !existsSync(approvalPath) || lstatSync(presentationPath).isSymbolicLink() || lstatSync(approvalPath).isSymbolicLink()) return false;
  try { const risk = buildT015V2RiskDisclosure(); const schema = buildT015V2ProviderSchemaEvidence(); const presentationLoaded = readCanonicalJson<T015V2DisclosurePresentationEvidence>(root, T015_V2_PRESENTATION_PATH); validateT015V2DisclosurePresentationEvidence(presentationLoaded.value, root, plan, risk, schema); const approvalLoaded = readCanonicalJson<T015V2ApprovalEvidence>(root, T015_V2_APPROVAL_PATH); validateT015V2ApprovalEvidence(approvalLoaded.value, root, plan, risk, schema, presentationLoaded.value); return true; } catch { return false; }
}
