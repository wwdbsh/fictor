import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const T015_CONTRACT_SHA256 = "9b1e9fa39c72101fd653d4c11696bf022aa5c6c1c899871863c90895239f451e" as const;
export const T015_PLAN_PATH = "assets/manifests/canonical-shard-1-v1.plan.json" as const;
export const T015_RISK_PATH = "assets/evidence/t015-canonical-shard-1-risk-disclosure-v1.json" as const;
export const T015_SCHEMA_PATH = "assets/evidence/t015-higgsfield-schema-v1.json" as const;
export const T015_PRESENTATION_PATH = "assets/evidence/t015-canonical-shard-1-disclosure-presentation-v1.json" as const;
export const T015_APPROVAL_PATH = "assets/evidence/t015-canonical-shard-1-approval-v1.json" as const;
export const T015_ACTUAL_PATH = "assets/evidence/t015-canonical-shard-1-actual-run-v1.json" as const;
export const T015_CONTROLLER_ATTESTATION_PATH = "assets/evidence/t015-controller-disclosure-attestation-v1.json" as const;
export const T015_CONTROLLER_ATTESTATION_SHA256 = "21922b6a484287fafea50161e31f29303c0b375f4a61d21970c744f599b570ae" as const;
export const T015_CONTROLLER_APPROVAL_ATTESTATION_PATH = "assets/evidence/t015-controller-approval-attestation-v1.json" as const;
export const T015_IMPLEMENTATION_BINDING_PATH = "assets/manifests/t015-implementation-binding-v1.json" as const;
export const T015_CORE_PLAN_PATH = "assets/manifests/core-v1.plan.json" as const;
export const T015_CORE_PLAN_SHA256 = "54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f" as const;
export const T015_MASTER_STYLE_PATH = "assets/manifests/master-style-v1.json" as const;
export const T015_MASTER_STYLE_SHA256 = "b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d" as const;
export const T015_T014_APPROVAL_PATH = "assets/manifests/material-style-approval-v1.json" as const;
export const T015_T014_APPROVAL_SHA256 = "72f5e863806cdee5b7638d8bb1cd9f1fab2c20feb6aeae3c53ba7ef6be872c96" as const;
export const T015_ID_LIST_SHA256 = "e499a0209d26ed966bc8c39eb74d02c84b41eeb1262991a4c812232cdb18d257" as const;
export const T015_EXACT_APPROVAL_PHRASE = "위 위험을 확인했고 T015 CANONICAL 0..331 정확히 332장과 초기 498.00 credits 상한, 자동 유료 재시도 0을 승인합니다." as const;
export const T015_RECOVERY_OPERATOR_PHRASE = "T015 기존 job ID만 복구하고 새 유료 제출은 하지 않습니다." as const;

export const T015_REFERENCE_INSTRUCTION = "Use this local master image as a MEDIA_ONLY reference for 17th-century copperplate line treatment; do not copy its subject, geometry, pose, composition, whitespace, colors, paper tone, density, representation, or aspect ratio." as const;
export const T015_NO_COPY_BOUNDARY = "MEDIA_ONLY no-copy boundary: preserve only the approved copperplate line treatment; derive this core canonical asset's subject, geometry, pose, composition, whitespace, attribute colors, paper tone, density, representation, and aspect from the core canonical prompt, never from the reference subject." as const;

export const T015_RISK_DISCLOSURE_TEXT = `승인 요청 범위는 Issue #17의 T015 core CANONICAL slice 0..331 정확히 332장뿐이며 초기 유료 상한은 498.00 credits, 자동 유료 재시도 예산은 0입니다. 각 요청은 nano_banana_2, use_unlim=false, count=1, 3:4, 1k와 revision 1의 로컬 MEDIA_ONLY 참조로 제한됩니다. 2026-08-12 약 02:38Z의 비유료 관찰에서 모델 제공자는 Google, 허용 해상도는 1k/2k/4k, media role은 image, 비율 3:4, 모델 supports_unlim은 true지만 계정 unlim.available은 false, batch 계약 최대치는 12, get_cost credits_exact는 1.50, Plus 계정 balance는 861.90이었습니다. 332장 예상 차감은 되돌릴 수 없는 498.00 credits이고 예상 잔액은 363.90입니다. 계정에 적용되는 Terms/Privacy, Google supplemental terms 및 provider 조건, 학습 사용과 opt-out, reference 입력 권리, 공개 기본값·게시·attribution, 정확한 credit 만료 시각과 시간대는 아직 해결되지 않았습니다. 제출이 모호하거나 부분 응답이어도 credit이 차감될 수 있으며 절대로 자동 재제출하지 않습니다. 첫 유료 batch는 provider가 보고하는 nano_banana_flash 모델 canary이며 model drift가 있으면 즉시 중단하고 batch 2를 열지 않습니다. provider optional signal, 알 수 없는 필드, 중복·부분·index 불일치, 가격·balance 불일치, 파일 충돌도 모두 fail-stop입니다. signed URL과 provider raw error는 일시적으로만 처리하고 journal·evidence·stdout에 남기지 않습니다. 결과 PNG는 provider-native bytes를 crop/resize 없이 최대 5000ppm의 3:4 오차만 허용해 public 및 별도 backup에 원자적으로 저장합니다. public+backup 용량은 약 1.2GB로 추정됩니다. T016, CANONICAL index 332(333번째) 이후, materials, hearts, world 자산은 승인 범위에서 제외됩니다. 과거의 일반적 승인 표현이나 T011/T013/T014 승인은 이 실행 승인이 아니며, 승인 의사는 위험 고지 제시 뒤 정확히 “${T015_EXACT_APPROVAL_PHRASE}”라는 문구로만 기록합니다.` as const;

export interface T015AssetRequest {
  index: number;
  params: {
    model: "nano_banana_2";
    prompt: string;
    aspect_ratio: "3:4";
    resolution: "1k";
    count: 1;
    use_unlim: false;
    medias: readonly [{ role: "image"; value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }];
  };
}

export interface T015RiskDisclosure {
  schema_version: 1;
  evidence_version: "t015-canonical-shard-1-risk-disclosure-v1";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  secret_free: true;
  disclosure_text_ko: typeof T015_RISK_DISCLOSURE_TEXT;
  disclosure_text_sha256: string;
  scope: { category: "CANONICAL"; slice: "0..331"; asset_count: 332; initial_credit_cap_decimal: "498.00"; automatic_paid_retry_reserve_decimal: "0.00" };
}

export interface T015ProviderSchemaEvidence {
  schema_version: 1;
  evidence_version: "t015-higgsfield-schema-v1";
  observation_window_utc: "2026-08-12 around 02:38Z";
  source: "fresh nonpaid Higgsfield observations supplied by the T015 contract";
  secret_free: true;
  model: { id: "nano_banana_2"; exists: true; upstream_provider: "Google"; resolutions: readonly ["1k", "2k", "4k"]; aspect_ratio: "3:4"; media_role: "image"; supports_unlim: true };
  account: { plan: "Plus"; unlim_available: false; observed_balance_decimal: "861.90"; projected_remainder_decimal: "363.90" };
  batch: { tool: "generate_image_batch"; observed_contract_max_requests: 12; response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET"; optional_fields_fail_stop: true };
  cost: { tool: "generate_image"; get_cost: true; credits_exact_decimal: "1.50"; nonpaid_contract: true };
  jobs_wait: { production_input: "STDIN_ONLY"; signed_urls_persisted: false; raw_errors_persisted: false; same_job_repoll_only: true };
}

export interface T015DisclosurePresentationEvidence {
  schema_version: 1;
  evidence_version: "t015-canonical-shard-1-disclosure-presentation-v1";
  secret_free: true;
  plan_sha256: string;
  risk_disclosure_evidence_sha256: string;
  risk_disclosure_text_sha256: string;
  provider_schema_evidence_sha256: string;
  controller_attestation_sha256: typeof T015_CONTROLLER_ATTESTATION_SHA256;
  implementation_binding_sha256: string;
  implementation_files: T015ImplementationBinding["files"];
  t014_approval_sha256: typeof T015_T014_APPROVAL_SHA256;
  disclosed_at: string;
  source: "current user conversation";
  exact_approval_phrase_required: typeof T015_EXACT_APPROVAL_PHRASE;
}

export interface T015ApprovalEvidence {
  schema_version: 1;
  evidence_version: "t015-canonical-shard-1-approval-v1";
  secret_free: true;
  decision: "APPROVE_T015_CANONICAL_0_331_EXACTLY_332_WITH_DISCLOSED_RISKS";
  source: "controller approval attestation";
  exact_user_quote: typeof T015_EXACT_APPROVAL_PHRASE;
  approved_at: string;
  disclosed_at: string;
  plan_sha256: string;
  risk_disclosure_evidence_sha256: string;
  risk_disclosure_text_sha256: string;
  provider_schema_evidence_sha256: string;
  controller_attestation_sha256: typeof T015_CONTROLLER_ATTESTATION_SHA256;
  controller_approval_attestation_path: typeof T015_CONTROLLER_APPROVAL_ATTESTATION_PATH;
  controller_approval_attestation_sha256: string;
  implementation_binding_sha256: string;
  implementation_files: T015ImplementationBinding["files"];
  disclosure_presentation_evidence_sha256: string;
  t014_approval_sha256: typeof T015_T014_APPROVAL_SHA256;
  scope: { category: "CANONICAL"; slice: "0..331"; asset_count: 332; initial_credit_cap_decimal: "498.00"; automatic_paid_retry_reserve_decimal: "0.00"; t016_or_other_assets_allowed: false };
  prior_generic_quote_is_approval: false;
  acknowledges_prior_approvals_not_inherited: true;
}

export interface T015CanonicalShardPlan {
  schema_version: 1;
  plan_version: "t015-canonical-shard-1-v1";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  state: "HOLD_FOR_EXACT_SCOPED_USER_APPROVAL";
  remote_execution_allowed_without_approval: false;
  scope: { category: "CANONICAL"; slice_start_inclusive: 0; slice_end_exclusive: 332; asset_count: 332; excluded_first_id: "forge__join_02__wash_02"; t016_or_other_assets_allowed: false };
  sources: {
    core_plan: { path: typeof T015_CORE_PLAN_PATH; sha256: typeof T015_CORE_PLAN_SHA256 };
    master_style: { path: typeof T015_MASTER_STYLE_PATH; sha256: typeof T015_MASTER_STYLE_SHA256 };
    t014_approval: { path: typeof T015_T014_APPROVAL_PATH; sha256: typeof T015_T014_APPROVAL_SHA256 };
    risk_disclosure: { path: typeof T015_RISK_PATH; sha256: string; text_sha256: string };
    provider_schema: { path: typeof T015_SCHEMA_PATH; sha256: string };
    controller_attestation: { path: typeof T015_CONTROLLER_ATTESTATION_PATH; sha256: typeof T015_CONTROLLER_ATTESTATION_SHA256 };
    implementation_binding: { path: typeof T015_IMPLEMENTATION_BINDING_PATH; sha256: string; files: T015ImplementationBinding["files"] };
  };
  selection: { expression: "core.assets.filter(category==='CANONICAL').slice(0,332)"; id_list_encoding: "UTF-8_IDS_JOINED_BY_NEWLINE_WITH_TRAILING_NEWLINE"; id_list_sha256: typeof T015_ID_LIST_SHA256; first_id: "forge__burn_01__burn_02"; last_id: "forge__join_02__wash_01"; unique_ids: true };
  provider_contract: { tool: "generate_image_batch"; requested_model: "nano_banana_2"; expected_provider_reported_model_for_canary_and_drift: "nano_banana_flash"; first_paid_batch_is_model_canary: true; batch_2_blocked_on_model_drift: true; upstream_provider: "Google"; aspect_ratio: "3:4"; resolution: "1k"; count_per_asset: 1; use_unlim: false; batch_max: 12; response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET" };
  reference_binding: { role: "image"; source_job_id: "e0f36c95-2e1b-4e38-9931-7e10e562f209"; reference_id: "fictor-copperplate-media-master"; revision: 1; source_sha256: "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3"; lock_scope: "MEDIA_ONLY"; reference_instruction: typeof T015_REFERENCE_INSTRUCTION };
  prompt_contract: { core_prompt_preserved_verbatim: true; reference_instruction: typeof T015_REFERENCE_INSTRUCTION; no_copy_boundary: typeof T015_NO_COPY_BOUNDARY; deterministic_text_only: true };
  budget: { unit_cost_decimal: "1.50"; initial_request_count: 332; batch_count: 28; batch_sizes: "12x27+8"; initial_credit_cap_decimal: "498.00"; observed_balance_decimal: "861.90"; projected_remainder_decimal: "363.90"; automatic_paid_retry_reserve_decimal: "0.00" };
  retry_policy: { automatic_paid_retry_allowed: false; automatic_paid_retry_count: 0; ambiguous_or_partial_submission_retry_allowed: false; operator_recovery_only_for_durable_job_ids: true };
  recovery_policy: { local_root: "public/assets"; backup_root: "assets/backups/t015-canonical-shard-1"; provider_native_unmodified: true; crop_or_resize_allowed: false; aspect_tolerance_ppm: 5000; production_jobs_wait_input: "STDIN_ONLY"; signed_urls_or_raw_errors_persisted: false; estimated_public_plus_backup: "~1.2GB" };
  approval_gate: { disclosure_presentation_path: typeof T015_PRESENTATION_PATH; controller_approval_attestation_path: typeof T015_CONTROLLER_APPROVAL_ATTESTATION_PATH; approval_path: typeof T015_APPROVAL_PATH; status: "MISSING_NOT_AUTHORIZED"; exact_phrase: typeof T015_EXACT_APPROVAL_PHRASE; prior_approval_inherited: false };
  assets: Array<{ index: number; id: string; path: string; core_prompt: string; core_prompt_sha256: string; effective_prompt: string; effective_prompt_sha256: string; request: T015AssetRequest; canonical_request_sha256: string }>;
  batches: Array<{ id: string; index: number; asset_ids: string[]; size: number }>;
}

export interface T015ControllerAttestation {
  schema_version: 1;
  evidence_version: "t015-controller-disclosure-attestation-v1";
  attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION";
  goal_slug: "ship-fictor-track1-2026";
  task_key: "T015";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  event_sequence: {
    user_message_exact_ko: "계속 진행하자. 크래딧 사용 승인할게";
    user_message_interpretation: "GENERIC_T015_CREDIT_INTENT_NOT_EXACT_EXECUTION_APPROVAL";
    assistant_disclosure_presented_at: "2026-08-12T03:01:17.021Z";
    assistant_disclosure_text_sha256: string;
    assistant_disclosure_was_presented_in_current_conversation: true;
    exact_scoped_approval_received_after_disclosure: false;
  };
  scope: { category: "CANONICAL"; slice: "0..331"; asset_count: 332; initial_credit_cap_decimal: "498.00"; automatic_paid_retry_reserve_decimal: "0.00" };
  secret_free: true;
}

export interface T015ControllerApprovalAttestation {
  schema_version: 1;
  evidence_version: "t015-controller-approval-attestation-v1";
  attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION";
  goal_slug: "ship-fictor-track1-2026";
  task_key: "T015";
  issue_number: 17;
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  event_sequence: {
    assistant_disclosure_presented_at: "2026-08-12T03:01:17.021Z";
    exact_user_reply_ko: typeof T015_EXACT_APPROVAL_PHRASE;
    exact_user_reply_received_at: string;
    exact_scoped_approval_received_after_disclosure: true;
  };
  bindings: {
    plan_sha256: string;
    disclosure_presentation_evidence_sha256: string;
    risk_disclosure_evidence_sha256: string;
    risk_disclosure_text_sha256: string;
    provider_schema_evidence_sha256: string;
    implementation_binding_sha256: string;
  };
  scope: { category: "CANONICAL"; slice: "0..331"; asset_count: 332; initial_credit_cap_decimal: "498.00"; automatic_paid_retry_reserve_decimal: "0.00"; t016_or_other_assets_allowed: false };
  secret_free: true;
}

export const T015_RUNTIME_FILE_PATHS = {
  controller: "scripts/assets/canonical-shard-1-v1-controller.ts",
  plan_builder: "scripts/assets/canonical-shard-1-v1.ts",
  ops: "scripts/assets/canonical-shard-1-v1-ops-cli.ts",
  cli: "scripts/assets/canonical-shard-1-v1-cli.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
  package_json: "package.json",
  package_lock: "package-lock.json",
} as const;
export type T015RuntimeFileKey = keyof typeof T015_RUNTIME_FILE_PATHS;

export interface T015ImplementationBinding {
  schema_version: 1;
  manifest_version: "t015-implementation-binding-v1";
  issue_contract_sha256: typeof T015_CONTRACT_SHA256;
  files: { [K in T015RuntimeFileKey]: { path: (typeof T015_RUNTIME_FILE_PATHS)[K]; sha256: string } };
}

export function sha256T015(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function renderT015CanonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function canonicalJsonT015(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonT015).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonT015(record[key])}`).join(",")}}`;
  }
  const rendered = JSON.stringify(value);
  if (rendered === undefined) throw new Error("canonical JSON does not support undefined");
  return rendered;
}

function readPinned(root: string, path: string, expected: string): Buffer {
  const target = resolve(root, path);
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`T015 pinned source is not a regular file: ${path}`);
  const bytes = readFileSync(target);
  if (sha256T015(bytes) !== expected) throw new Error(`T015 pinned source changed: ${path}`);
  return bytes;
}

function readCanonicalPinnedJson<T>(root: string, path: string, expectedSha?: string): { value: T; bytes: Buffer; sha256: string } {
  const target = resolve(root, path);
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`T015 pinned JSON is not a regular file: ${path}`);
  const bytes = readFileSync(target);
  const hash = sha256T015(bytes);
  if (expectedSha && hash !== expectedSha) throw new Error(`T015 pinned JSON changed: ${path}`);
  const value = JSON.parse(bytes.toString("utf8")) as T;
  if (bytes.toString("utf8") !== renderT015CanonicalJson(value)) throw new Error(`T015 pinned JSON is not canonical: ${path}`);
  return { value, bytes, sha256: hash };
}

export function loadT015ControllerAttestation(root: string): T015ControllerAttestation {
  const { value } = readCanonicalPinnedJson<T015ControllerAttestation>(root, T015_CONTROLLER_ATTESTATION_PATH, T015_CONTROLLER_ATTESTATION_SHA256);
  const expected: T015ControllerAttestation = {
    schema_version: 1, evidence_version: "t015-controller-disclosure-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION", goal_slug: "ship-fictor-track1-2026", task_key: "T015", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256,
    event_sequence: { user_message_exact_ko: "계속 진행하자. 크래딧 사용 승인할게", user_message_interpretation: "GENERIC_T015_CREDIT_INTENT_NOT_EXACT_EXECUTION_APPROVAL", assistant_disclosure_presented_at: "2026-08-12T03:01:17.021Z", assistant_disclosure_text_sha256: sha256T015(T015_RISK_DISCLOSURE_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false },
    scope: { category: "CANONICAL", slice: "0..331", asset_count: 332, initial_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00" }, secret_free: true,
  };
  if (canonicalJsonT015(value) !== canonicalJsonT015(expected)) throw new Error("T015 controller disclosure attestation changed");
  return value;
}

const T015_LOCAL_IMPORT_CLOSURE: Partial<Record<T015RuntimeFileKey, readonly string[]>> = {
  controller: ["./canonical-shard-1-v1-cli", "./canonical-shard-1-v1-ops-cli"],
  plan_builder: [],
  ops: ["./canonical-shard-1-v1", "./filesystem"],
  cli: ["./canonical-shard-1-v1", "./filesystem"],
  filesystem: ["./types"],
  filesystem_types: ["../../src/data/schema/contracts"],
  schema_contracts: [],
};

function localImports(source: string): string[] {
  return [...source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)].map((match) => match[1]).sort();
}

function assertT015RuntimeClosure(root: string): void {
  for (const [key, expected] of Object.entries(T015_LOCAL_IMPORT_CLOSURE) as Array<[T015RuntimeFileKey, readonly string[]]>) {
    const source = readFileSync(resolve(root, T015_RUNTIME_FILE_PATHS[key]), "utf8");
    if (canonicalJsonT015(localImports(source)) !== canonicalJsonT015([...expected].sort())) throw new Error(`T015 runtime import closure changed: ${key}`);
  }
  const packageJson = JSON.parse(readFileSync(resolve(root, T015_RUNTIME_FILE_PATHS.package_json), "utf8")) as { scripts?: Record<string, string> };
  const expectedScripts = {
    "assets:canonical:shard1:v1:gen": "tsx scripts/assets/canonical-shard-1-v1-controller.ts preparation gen",
    "assets:canonical:shard1:v1:check": "tsx scripts/assets/canonical-shard-1-v1-controller.ts preparation check",
    "assets:canonical:shard1:v1": "tsx scripts/assets/canonical-shard-1-v1-controller.ts preparation",
    "assets:canonical:shard1:v1:ops": "tsx scripts/assets/canonical-shard-1-v1-controller.ts ops",
  };
  for (const [name, command] of Object.entries(expectedScripts)) if (packageJson.scripts?.[name] !== command) throw new Error(`T015 controller runner changed: ${name}`);
}

export function buildT015ImplementationBinding(root: string): T015ImplementationBinding {
  assertT015RuntimeClosure(root);
  const files: Record<string, { path: string; sha256: string }> = {};
  for (const key of Object.keys(T015_RUNTIME_FILE_PATHS) as T015RuntimeFileKey[]) {
    const path = T015_RUNTIME_FILE_PATHS[key];
    const target = resolve(root, path);
    const info = lstatSync(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`T015 runtime input is not a regular file: ${path}`);
    files[key] = { path, sha256: sha256T015(readFileSync(target)) };
  }
  return { schema_version: 1, manifest_version: "t015-implementation-binding-v1", issue_contract_sha256: T015_CONTRACT_SHA256, files: files as T015ImplementationBinding["files"] };
}

export function loadT015ImplementationBinding(root: string): T015ImplementationBinding {
  const { value } = readCanonicalPinnedJson<T015ImplementationBinding>(root, T015_IMPLEMENTATION_BINDING_PATH);
  const expected = buildT015ImplementationBinding(root);
  if (canonicalJsonT015(value) !== canonicalJsonT015(expected)) throw new Error("T015 implementation binding or runtime closure changed");
  return value;
}

export function t015ImplementationBindingSha256(root: string): string {
  loadT015ImplementationBinding(root);
  return sha256T015(readFileSync(resolve(root, T015_IMPLEMENTATION_BINDING_PATH)));
}

export function buildT015RiskDisclosure(): T015RiskDisclosure {
  return { schema_version: 1, evidence_version: "t015-canonical-shard-1-risk-disclosure-v1", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T015_RISK_DISCLOSURE_TEXT, disclosure_text_sha256: sha256T015(T015_RISK_DISCLOSURE_TEXT), scope: { category: "CANONICAL", slice: "0..331", asset_count: 332, initial_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00" } };
}

export function buildT015ProviderSchemaEvidence(): T015ProviderSchemaEvidence {
  return { schema_version: 1, evidence_version: "t015-higgsfield-schema-v1", observation_window_utc: "2026-08-12 around 02:38Z", source: "fresh nonpaid Higgsfield observations supplied by the T015 contract", secret_free: true, model: { id: "nano_banana_2", exists: true, upstream_provider: "Google", resolutions: ["1k", "2k", "4k"], aspect_ratio: "3:4", media_role: "image", supports_unlim: true }, account: { plan: "Plus", unlim_available: false, observed_balance_decimal: "861.90", projected_remainder_decimal: "363.90" }, batch: { tool: "generate_image_batch", observed_contract_max_requests: 12, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET", optional_fields_fail_stop: true }, cost: { tool: "generate_image", get_cost: true, credits_exact_decimal: "1.50", nonpaid_contract: true }, jobs_wait: { production_input: "STDIN_ONLY", signed_urls_persisted: false, raw_errors_persisted: false, same_job_repoll_only: true } };
}

function buildPlanRaw(root: string): T015CanonicalShardPlan {
  const core = JSON.parse(readPinned(root, T015_CORE_PLAN_PATH, T015_CORE_PLAN_SHA256).toString("utf8")) as { assets?: Array<{ id: string; category: string; path: string; aspect_ratio: string; prompt: string }> };
  const master = JSON.parse(readPinned(root, T015_MASTER_STYLE_PATH, T015_MASTER_STYLE_SHA256).toString("utf8")) as { selected_candidate?: { job_id?: string; image_sha256?: string }; reference_element?: { reference_id?: string; revision?: number; reference_instruction?: string }; media_style_lock?: { lock_scope?: string } };
  readPinned(root, T015_T014_APPROVAL_PATH, T015_T014_APPROVAL_SHA256);
  loadT015ControllerAttestation(root);
  const implementation = loadT015ImplementationBinding(root);
  const implementationSha = t015ImplementationBindingSha256(root);
  if (master.selected_candidate?.job_id !== "e0f36c95-2e1b-4e38-9931-7e10e562f209" || master.selected_candidate.image_sha256 !== "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3" || master.reference_element?.reference_id !== "fictor-copperplate-media-master" || master.reference_element.revision !== 1 || master.reference_element.reference_instruction !== T015_REFERENCE_INSTRUCTION || master.media_style_lock?.lock_scope !== "MEDIA_ONLY") throw new Error("T015 master-style binding changed");
  const allCanonical = core.assets?.filter(({ category }) => category === "CANONICAL") ?? [];
  const selected = allCanonical.slice(0, 332);
  if (allCanonical.length !== 1326 || selected.length !== 332 || selected[0]?.id !== "forge__burn_01__burn_02" || selected[331]?.id !== "forge__join_02__wash_01" || allCanonical[332]?.id !== "forge__join_02__wash_02") throw new Error("T015 canonical selection boundary changed");
  if (new Set(selected.map(({ id }) => id)).size !== 332 || sha256T015(`${selected.map(({ id }) => id).join("\n")}\n`) !== T015_ID_LIST_SHA256) throw new Error("T015 canonical ID set changed");
  const risk = buildT015RiskDisclosure();
  const schema = buildT015ProviderSchemaEvidence();
  const riskBytes = renderT015CanonicalJson(risk);
  const schemaBytes = renderT015CanonicalJson(schema);
  const trackedRisk = resolve(root, T015_RISK_PATH);
  const trackedSchema = resolve(root, T015_SCHEMA_PATH);
  if (existsSync(trackedRisk) && (lstatSync(trackedRisk).isSymbolicLink() || readFileSync(trackedRisk, "utf8") !== riskBytes)) throw new Error("tracked T015 risk disclosure changed");
  if (existsSync(trackedSchema) && (lstatSync(trackedSchema).isSymbolicLink() || readFileSync(trackedSchema, "utf8") !== schemaBytes)) throw new Error("tracked T015 schema evidence changed");
  const assets = selected.map((asset, index) => {
    if (asset.aspect_ratio !== "3:4" || !asset.path.startsWith("cards/forge__") || !asset.path.endsWith(".png")) throw new Error(`T015 invalid canonical asset at ${index}`);
    const effectivePrompt = `${asset.prompt}\n\nMaster-style reference instruction: ${T015_REFERENCE_INSTRUCTION}\n${T015_NO_COPY_BOUNDARY}`;
    const request: T015AssetRequest = { index, params: { model: "nano_banana_2", prompt: effectivePrompt, aspect_ratio: "3:4", resolution: "1k", count: 1, use_unlim: false, medias: [{ role: "image", value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }] } };
    return { index, id: asset.id, path: asset.path, core_prompt: asset.prompt, core_prompt_sha256: sha256T015(asset.prompt), effective_prompt: effectivePrompt, effective_prompt_sha256: sha256T015(effectivePrompt), request, canonical_request_sha256: sha256T015(canonicalJsonT015(request)) };
  });
  const batches: T015CanonicalShardPlan["batches"] = [];
  for (let offset = 0; offset < assets.length; offset += 12) {
    const assetIds = assets.slice(offset, offset + 12).map(({ id }) => id);
    batches.push({ id: `canonical-shard-1-${String(batches.length + 1).padStart(3, "0")}`, index: batches.length, asset_ids: assetIds, size: assetIds.length });
  }
  return {
    schema_version: 1, plan_version: "t015-canonical-shard-1-v1", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256, state: "HOLD_FOR_EXACT_SCOPED_USER_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: { category: "CANONICAL", slice_start_inclusive: 0, slice_end_exclusive: 332, asset_count: 332, excluded_first_id: "forge__join_02__wash_02", t016_or_other_assets_allowed: false },
    sources: { core_plan: { path: T015_CORE_PLAN_PATH, sha256: T015_CORE_PLAN_SHA256 }, master_style: { path: T015_MASTER_STYLE_PATH, sha256: T015_MASTER_STYLE_SHA256 }, t014_approval: { path: T015_T014_APPROVAL_PATH, sha256: T015_T014_APPROVAL_SHA256 }, risk_disclosure: { path: T015_RISK_PATH, sha256: sha256T015(riskBytes), text_sha256: risk.disclosure_text_sha256 }, provider_schema: { path: T015_SCHEMA_PATH, sha256: sha256T015(schemaBytes) }, controller_attestation: { path: T015_CONTROLLER_ATTESTATION_PATH, sha256: T015_CONTROLLER_ATTESTATION_SHA256 }, implementation_binding: { path: T015_IMPLEMENTATION_BINDING_PATH, sha256: implementationSha, files: implementation.files } },
    selection: { expression: "core.assets.filter(category==='CANONICAL').slice(0,332)", id_list_encoding: "UTF-8_IDS_JOINED_BY_NEWLINE_WITH_TRAILING_NEWLINE", id_list_sha256: T015_ID_LIST_SHA256, first_id: "forge__burn_01__burn_02", last_id: "forge__join_02__wash_01", unique_ids: true },
    provider_contract: { tool: "generate_image_batch", requested_model: "nano_banana_2", expected_provider_reported_model_for_canary_and_drift: "nano_banana_flash", first_paid_batch_is_model_canary: true, batch_2_blocked_on_model_drift: true, upstream_provider: "Google", aspect_ratio: "3:4", resolution: "1k", count_per_asset: 1, use_unlim: false, batch_max: 12, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET" },
    reference_binding: { role: "image", source_job_id: "e0f36c95-2e1b-4e38-9931-7e10e562f209", reference_id: "fictor-copperplate-media-master", revision: 1, source_sha256: "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3", lock_scope: "MEDIA_ONLY", reference_instruction: T015_REFERENCE_INSTRUCTION },
    prompt_contract: { core_prompt_preserved_verbatim: true, reference_instruction: T015_REFERENCE_INSTRUCTION, no_copy_boundary: T015_NO_COPY_BOUNDARY, deterministic_text_only: true },
    budget: { unit_cost_decimal: "1.50", initial_request_count: 332, batch_count: 28, batch_sizes: "12x27+8", initial_credit_cap_decimal: "498.00", observed_balance_decimal: "861.90", projected_remainder_decimal: "363.90", automatic_paid_retry_reserve_decimal: "0.00" },
    retry_policy: { automatic_paid_retry_allowed: false, automatic_paid_retry_count: 0, ambiguous_or_partial_submission_retry_allowed: false, operator_recovery_only_for_durable_job_ids: true },
    recovery_policy: { local_root: "public/assets", backup_root: "assets/backups/t015-canonical-shard-1", provider_native_unmodified: true, crop_or_resize_allowed: false, aspect_tolerance_ppm: 5000, production_jobs_wait_input: "STDIN_ONLY", signed_urls_or_raw_errors_persisted: false, estimated_public_plus_backup: "~1.2GB" },
    approval_gate: { disclosure_presentation_path: T015_PRESENTATION_PATH, controller_approval_attestation_path: T015_CONTROLLER_APPROVAL_ATTESTATION_PATH, approval_path: T015_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T015_EXACT_APPROVAL_PHRASE, prior_approval_inherited: false }, assets, batches,
  };
}

export function buildT015CanonicalShardPlan(root: string): T015CanonicalShardPlan {
  const plan = buildPlanRaw(root);
  validateT015CanonicalShardPlan(plan, root);
  return plan;
}

export function validateT015CanonicalShardPlan(plan: T015CanonicalShardPlan, root: string): void {
  if (canonicalJsonT015(plan) !== canonicalJsonT015(buildPlanRaw(root))) throw new Error("T015 plan changed from Issue #17 contract");
}

export function renderT015Plan(plan: T015CanonicalShardPlan): string { return renderT015CanonicalJson(plan); }
export function t015PlanSha256(plan: T015CanonicalShardPlan): string { return sha256T015(renderT015Plan(plan)); }

function parseTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`valid ${label} timestamp is required`);
  return Date.parse(value);
}

export function buildT015DisclosurePresentationEvidence(root: string, plan: T015CanonicalShardPlan, risk: T015RiskDisclosure, schema: T015ProviderSchemaEvidence): T015DisclosurePresentationEvidence {
  const attestation = loadT015ControllerAttestation(root);
  return buildPresentation(root, plan, risk, schema, attestation.event_sequence.assistant_disclosure_presented_at);
}

function buildPresentation(root: string, plan: T015CanonicalShardPlan, risk: T015RiskDisclosure, schema: T015ProviderSchemaEvidence, disclosedAt: string): T015DisclosurePresentationEvidence {
  parseTimestamp(disclosedAt, "T015 disclosure");
  const attestation = loadT015ControllerAttestation(root);
  if (disclosedAt !== attestation.event_sequence.assistant_disclosure_presented_at || attestation.event_sequence.assistant_disclosure_text_sha256 !== risk.disclosure_text_sha256) throw new Error("T015 presentation must use the pinned controller disclosure event");
  return { schema_version: 1, evidence_version: "t015-canonical-shard-1-disclosure-presentation-v1", secret_free: true, plan_sha256: t015PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T015(renderT015CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256, provider_schema_evidence_sha256: sha256T015(renderT015CanonicalJson(schema)), controller_attestation_sha256: T015_CONTROLLER_ATTESTATION_SHA256, implementation_binding_sha256: t015ImplementationBindingSha256(root), implementation_files: loadT015ImplementationBinding(root).files, t014_approval_sha256: T015_T014_APPROVAL_SHA256, disclosed_at: disclosedAt, source: "current user conversation", exact_approval_phrase_required: T015_EXACT_APPROVAL_PHRASE };
}

export function validateT015DisclosurePresentationEvidence(value: unknown, root: string, plan: T015CanonicalShardPlan, risk: T015RiskDisclosure, schema: T015ProviderSchemaEvidence): asserts value is T015DisclosurePresentationEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { disclosed_at?: unknown }).disclosed_at !== "string") throw new Error("T015 disclosure presentation evidence is invalid");
  if (canonicalJsonT015(value) !== canonicalJsonT015(buildPresentation(root, plan, risk, schema, (value as { disclosed_at: string }).disclosed_at))) throw new Error("T015 disclosure presentation binding changed");
}

export function loadT015ControllerApprovalAttestation(root: string, plan: T015CanonicalShardPlan, risk: T015RiskDisclosure, schema: T015ProviderSchemaEvidence, presentation: T015DisclosurePresentationEvidence, now = new Date()): { value: T015ControllerApprovalAttestation; sha256: string } {
  validateT015DisclosurePresentationEvidence(presentation, root, plan, risk, schema);
  const loaded = readCanonicalPinnedJson<T015ControllerApprovalAttestation>(root, T015_CONTROLLER_APPROVAL_ATTESTATION_PATH);
  const approvedAt = loaded.value?.event_sequence?.exact_user_reply_received_at;
  if (typeof approvedAt !== "string") throw new Error("T015 controller approval attestation timestamp is required");
  const approvedMs = parseTimestamp(approvedAt, "T015 approval");
  const disclosedMs = parseTimestamp(presentation.disclosed_at, "T015 disclosure");
  if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime() || now.getTime() - approvedMs > 15 * 60 * 1000) throw new Error("T015 approval chronology is invalid");
  const expected: T015ControllerApprovalAttestation = {
    schema_version: 1, evidence_version: "t015-controller-approval-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION", goal_slug: "ship-fictor-track1-2026", task_key: "T015", issue_number: 17, issue_contract_sha256: T015_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: "2026-08-12T03:01:17.021Z", exact_user_reply_ko: T015_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true },
    bindings: { plan_sha256: t015PlanSha256(plan), disclosure_presentation_evidence_sha256: sha256T015(renderT015CanonicalJson(presentation)), risk_disclosure_evidence_sha256: sha256T015(renderT015CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256, provider_schema_evidence_sha256: sha256T015(renderT015CanonicalJson(schema)), implementation_binding_sha256: t015ImplementationBindingSha256(root) },
    scope: { category: "CANONICAL", slice: "0..331", asset_count: 332, initial_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00", t016_or_other_assets_allowed: false }, secret_free: true,
  };
  if (canonicalJsonT015(loaded.value) !== canonicalJsonT015(expected)) throw new Error("T015 controller approval attestation changed or is not affirmative");
  return { value: loaded.value, sha256: loaded.sha256 };
}

export function buildT015ApprovalEvidence(root: string, plan: T015CanonicalShardPlan, risk: T015RiskDisclosure, schema: T015ProviderSchemaEvidence, presentation: T015DisclosurePresentationEvidence, now = new Date()): T015ApprovalEvidence {
  const attestation = loadT015ControllerApprovalAttestation(root, plan, risk, schema, presentation, now);
  const approvedAt = attestation.value.event_sequence.exact_user_reply_received_at;
  return { schema_version: 1, evidence_version: "t015-canonical-shard-1-approval-v1", secret_free: true, decision: "APPROVE_T015_CANONICAL_0_331_EXACTLY_332_WITH_DISCLOSED_RISKS", source: "controller approval attestation", exact_user_quote: T015_EXACT_APPROVAL_PHRASE, approved_at: approvedAt, disclosed_at: presentation.disclosed_at, plan_sha256: t015PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T015(renderT015CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256, provider_schema_evidence_sha256: sha256T015(renderT015CanonicalJson(schema)), controller_attestation_sha256: T015_CONTROLLER_ATTESTATION_SHA256, controller_approval_attestation_path: T015_CONTROLLER_APPROVAL_ATTESTATION_PATH, controller_approval_attestation_sha256: attestation.sha256, implementation_binding_sha256: t015ImplementationBindingSha256(root), implementation_files: loadT015ImplementationBinding(root).files, disclosure_presentation_evidence_sha256: sha256T015(renderT015CanonicalJson(presentation)), t014_approval_sha256: T015_T014_APPROVAL_SHA256, scope: { category: "CANONICAL", slice: "0..331", asset_count: 332, initial_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00", t016_or_other_assets_allowed: false }, prior_generic_quote_is_approval: false, acknowledges_prior_approvals_not_inherited: true };
}

export function validateT015ApprovalEvidence(value: unknown, root: string, plan: T015CanonicalShardPlan, risk: T015RiskDisclosure, schema: T015ProviderSchemaEvidence, presentation: T015DisclosurePresentationEvidence, now = new Date()): asserts value is T015ApprovalEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T015 approval evidence is invalid");
  const approvedAt = (value as { approved_at?: unknown }).approved_at;
  if (typeof approvedAt !== "string") throw new Error("T015 approval evidence timestamp is required");
  const validationNow = now.getTime() === Date.parse(approvedAt) ? now : new Date(Date.parse(approvedAt));
  const expected = buildT015ApprovalEvidence(root, plan, risk, schema, presentation, validationNow);
  if (canonicalJsonT015(value) !== canonicalJsonT015(expected)) throw new Error("T015 approval evidence binding changed");
}

export function isT015Authorized(root: string, plan: T015CanonicalShardPlan): boolean {
  const presentationPath = resolve(root, T015_PRESENTATION_PATH);
  const approvalPath = resolve(root, T015_APPROVAL_PATH);
  if (!existsSync(presentationPath) || !existsSync(approvalPath) || lstatSync(presentationPath).isSymbolicLink() || lstatSync(approvalPath).isSymbolicLink()) return false;
  try {
    const risk = buildT015RiskDisclosure();
    const schema = buildT015ProviderSchemaEvidence();
    const presentationBytes = readFileSync(presentationPath, "utf8");
    const presentation = JSON.parse(presentationBytes) as unknown;
    if (presentationBytes !== renderT015CanonicalJson(presentation)) return false;
    validateT015DisclosurePresentationEvidence(presentation, root, plan, risk, schema);
    const approvalBytes = readFileSync(approvalPath, "utf8");
    const approval = JSON.parse(approvalBytes) as unknown;
    if (approvalBytes !== renderT015CanonicalJson(approval)) return false;
    validateT015ApprovalEvidence(approval, root, plan, risk, schema, presentation);
    return true;
  } catch { return false; }
}
