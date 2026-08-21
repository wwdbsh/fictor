import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "./style-candidates";

export const T013_CONTRACT_SHA256 = "dcb076f1af7ad35029ec7169cc8406e1fbdd868d5fae854da18cfd58c219b947" as const;
export const T013_PLAN_PATH = "assets/manifests/materials-v1.plan.json" as const;
export const T013_RISK_PATH = "assets/evidence/t013-materials-risk-disclosure-v1.json" as const;
export const T013_SCHEMA_EVIDENCE_PATH = "assets/evidence/t013-higgsfield-schema-v1.json" as const;
export const T013_DISCLOSURE_PRESENTATION_PATH = "assets/evidence/t013-materials-disclosure-presentation-v1.json" as const;
export const T013_APPROVAL_PATH = "assets/evidence/t013-materials-approval-v1.json" as const;
export const T013_CORE_PLAN_PATH = "assets/manifests/core-v1.plan.json" as const;
export const T013_CORE_PLAN_SHA256 = "54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f" as const;
export const T013_MATERIALS_PATH = "src/data/source/materials.json" as const;
export const T013_MATERIALS_SHA256 = "c1ce53ac380f637b9947211250313db25d03503f837de219dfb1ba8d7c897931" as const;
export const T013_MASTER_STYLE_PATH = "assets/manifests/master-style-v1.json" as const;
export const T013_MASTER_STYLE_SHA256 = "b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d" as const;

const T044_APPROVAL_PATH = "docs/balance/t043-approved-values-2026-08-21.json" as const;
export const T013_T044_BALANCE_REBIND = {
  trackedPlanSha256: "22cc0b976501b6d2f9fc0df5d584e891c214ec0c4da4797ddcbf8b98c86b7611",
  historicalMaterialsSha256: T013_MATERIALS_SHA256,
  currentMaterialsSha256: "607266635b128fe73dcde391362b0f1ea16619e879081db7c3c06eabe136cd8c",
  historicalStableMaterialsProjectionSha256: "2b57d9b7838a929fde8355495595b1974c500b72dcd14a1ed40628d4a895340d",
  approvalSha256: "1b97e425bd857279f48470c2b59681b012935e6f7d45cf97e7c46b567a9ba086",
} as const;

export const T013_EXACT_APPROVAL_PHRASE = "위 위험을 확인했고 T013 재료 52장과 초기 78.00 credits 상한, 자동 유료 재시도 0을 승인합니다." as const;
export const T013_RISK_DISCLOSURE_TEXT = `승인 요청 범위는 T013 재료 이미지 정확히 52장뿐이며 초기 유료 상한은 78.00 credits, 자동 유료 재시도 예산은 0입니다. 요청은 nano_banana_2, use_unlim=false, count=1, 3:4, 1k와 revision 1의 로컬 MEDIA_ONLY 참조로 제한되지만 provider가 보고하는 모델 식별자·batch/job 1:1 응답·현재 가격과 balance는 실행 때 달라질 수 있습니다. 각 batch 직전 첫 자산의 실제 generate_image 요청에 get_cost=true를 붙여 대표 가격을 확인하며, prompt는 provider 가격에 영향을 주지 않는다는 현재 계약에 따라 제외하고 나머지 모든 가격 영향 인자가 batch 전체에서 동일함을 검증합니다. get_cost 계약은 job 제출이 아니며 응답에는 job_created 필드가 없고, numeric cost와 balance는 내부에서 정확한 소수 단위로 정규화합니다. generate_image_batch job의 adjustments·error·warning·preset_recommendation은 실제 wire 선택 필드이며, definite job ID는 먼저 안전하게 보존하되 값 원문은 저장하지 않고 adjustments·error·preset_recommendation 또는 안전하다고 입증되지 않은 warning이 하나라도 있으면 실행을 중단합니다. jobs_wait의 lookup_failed는 제출 실패가 아니므로 retryable=true일 때 같은 유료 job ID만 다시 조회하고, false 또는 누락이면 모호하거나 복구 불가능한 조회 실패로 중단하며 새로 제출하지 않습니다. actual jobs_wait JSON은 파일이나 argv가 아니라 production jobs-handoff stdin으로만 받아 메모리에서 검증·삭제하며, jobs --file과 ingest --input-png는 격리된 diagnostic test seam에서만 허용되어 COMPLETE 근거가 될 수 없습니다. 관찰로 확정된 결과 host allow-list가 없으므로 완료 URL은 generic HTTPS hostname의 기본 443 port만 허용하고 모든 DNS 응답이 public address인지 확인한 뒤 하나를 고정해 원래 hostname/SNI의 TLS 검증으로 직접 연결합니다. redirect마다 URL·DNS·고정을 다시 검증하고 실제 remote address가 고정값과 다르면 중단하며, URL은 제한된 임시 PNG 다운로드에만 사용한 뒤 journal·stdout·파일에 남기지 않습니다. 계정 적용 Terms/Privacy, Google supplemental terms와 provider 조건, 학습 사용 및 opt-out, reference 입력 권리, 공개 기본값과 attribution, 정확한 credit 만료 시각·시간대는 이 52장 범위에서 아직 재검증되지 않았습니다. 제출 모호성·부분 batch 응답·job 실패도 credit을 소비할 수 있으며 자동 재제출하지 않습니다. terminal generation failure 재시도는 최대 3회 범위라도 매회 별도의 새 사용자 승인이 필요합니다. 결과 PNG는 provider-native bytes를 crop/resize 없이 최대 5000ppm의 3:4 오차만 허용해 즉시 local 및 별도 backup에 저장하며, 재료 52장 외 core/bulk 생성은 승인 범위가 아닙니다. 승인 의사는 반드시 “${T013_EXACT_APPROVAL_PHRASE}”라는 정확한 긍정 문구로만 기록합니다.` as const;

const REFERENCE_INSTRUCTION = "Use this local master image as a MEDIA_ONLY reference for 17th-century copperplate line treatment; do not copy its subject, geometry, pose, composition, whitespace, colors, paper tone, density, representation, or aspect ratio." as const;
const NO_COPY_BOUNDARY = "MEDIA_ONLY no-copy boundary: preserve only the approved copperplate line treatment; derive this asset's subject, geometry, pose, composition, whitespace, attribute colors, paper tone, density, representation, and aspect from the core material prompt, never from the reference subject." as const;

export interface T013RiskDisclosure {
  schema_version: 1;
  evidence_version: "t013-materials-risk-disclosure-v1";
  issue_contract_sha256: typeof T013_CONTRACT_SHA256;
  secret_free: true;
  disclosure_text_ko: typeof T013_RISK_DISCLOSURE_TEXT;
  disclosure_text_sha256: string;
  scope: { category: "MATERIAL"; asset_count: 52; initial_credit_cap_decimal: "78.00"; automatic_paid_retry_reserve_decimal: "0.00" };
}

export interface T013ProviderSchemaEvidence {
  schema_version: 1;
  evidence_version: "t013-higgsfield-schema-v1";
  observed_at: "2026-08-11T13:57:31.503Z";
  source: "T013 second review live Higgsfield schema observation";
  secret_free: true;
  media_binding: { field: "medias"; item_shape: { role: "image"; value: "SOURCE_JOB_ID" } };
  generate_image_batch: {
    request_shape: "requests[index,params[model,prompt,aspect_ratio,resolution,count,use_unlim,medias]]";
    response_shape: "submitted_count,failed_count,jobs[index,job_id,status,adjustments?,error?,warning?,preset_recommendation?]";
    statuses: readonly ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "submission_failed"];
    optional_job_field_policy: "VALIDATE_REDACT_PRESERVE_DEFINITE_JOB_IDS_FAIL_STOP_ON_SIGNAL";
    benign_warning_allowlist: readonly [];
  };
  jobs_wait: {
    request_shape: "jobs[index,job_id]";
    response_shape: "all_terminal,jobs[index,job_id,status,model?,result_url?,thumbnail_url?,error?,retryable?,type?],summary,poll_after_seconds?,timed_out?,aborted?";
    statuses: readonly ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"];
    lookup_failed_policy: "RETRYABLE_TRUE_REPOLL_SAME_JOB_FALSE_OR_MISSING_FAIL_STOP_NO_RESUBMIT";
    sensitive_field_policy: "RESULT_URL_THUMBNAIL_URL_ERROR_TRANSIENT_ONLY_NEVER_PERSIST";
    handoff: "ACTUAL_JSON_STDIN_ONLY_PUBLIC_DNS_PINNED_HTTPS_REDIRECT_REVALIDATED_TEMP_INGEST_DELETE";
    observed_download_host_allowlist: readonly [];
    download_network_policy: "GENERIC_HTTPS_HOSTNAME_DEFAULT_443_ALL_DNS_ANSWERS_PUBLIC_PINNED_ORIGINAL_TLS_IDENTITY_NO_PROXY";
    redirect_policy: "MAX_3_EACH_HOP_URL_DNS_PIN_REVALIDATED";
    completion_provenance: "ONLY_JOBS_HANDOFF_STDIN_JOB_BOUND_RECOVERIES";
    diagnostic_command_policy: "JOBS_FILE_AND_INGEST_INPUT_PNG_TEST_INTERNAL_ONLY_NOT_PRODUCTION";
  };
  generate_image_get_cost: {
    request_shape: "params[model,prompt,aspect_ratio,resolution,count,use_unlim,medias,get_cost:true]";
    response_shape: "cost[credits:number,credits_exact:number]";
    representative_asset: "FIRST_ASSET_IN_EACH_BATCH";
    price_affecting_params: readonly ["model", "aspect_ratio", "resolution", "count", "use_unlim", "medias"];
    prompt_pricing_policy: "EXEMPT_PROVIDER_PRICING_INDEPENDENT";
    no_job_submission_observation: "DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED";
  };
  balance: { response_shape: "credits:number"; normalization: "EXACT_DECIMAL_INTERNAL" };
}

export interface T013DisclosurePresentationEvidence {
  schema_version: 1;
  evidence_version: "t013-materials-disclosure-presentation-v1";
  secret_free: true;
  plan_sha256: string;
  risk_disclosure_evidence_sha256: string;
  risk_disclosure_text_sha256: string;
  disclosed_at: string;
  source: "current user conversation";
  exact_approval_phrase_required: typeof T013_EXACT_APPROVAL_PHRASE;
}

export interface T013ApprovalEvidence {
  schema_version: 1;
  evidence_version: "t013-materials-approval-v1";
  secret_free: true;
  decision: "APPROVE_T013_EXACTLY_52_MATERIALS_WITH_DISCLOSED_RISKS";
  source: "current user conversation";
  exact_user_quote: string;
  approved_at: string;
  disclosed_at: string;
  plan_sha256: string;
  risk_disclosure_evidence_sha256: string;
  risk_disclosure_text_sha256: string;
  disclosure_presentation_evidence_sha256: string;
  scope: {
    category: "MATERIAL";
    asset_count: 52;
    initial_credit_cap_decimal: "78.00";
    automatic_paid_retry_reserve_decimal: "0.00";
    core_or_bulk_allowed: false;
  };
  acknowledges_t011_approval_not_inherited: true;
}

export interface T013AssetRequest {
  index: number;
  params: {
    model: "nano_banana_2";
    aspect_ratio: "3:4";
    resolution: "1k";
    prompt: string;
    use_unlim: false;
    count: 1;
    medias: readonly [{ role: "image"; value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }];
  };
}

export interface T013MaterialsPlan {
  schema_version: 1;
  plan_version: "t013-materials-v1";
  issue_contract_sha256: typeof T013_CONTRACT_SHA256;
  state: "HOLD_FOR_SCOPED_USER_APPROVAL";
  remote_execution_allowed_without_approval: false;
  scope: { category: "MATERIAL"; asset_count: 52; core_or_bulk_allowed: false };
  sources: {
    materials: { path: typeof T013_MATERIALS_PATH; sha256: typeof T013_MATERIALS_SHA256 };
    core_plan: { path: typeof T013_CORE_PLAN_PATH; sha256: typeof T013_CORE_PLAN_SHA256 };
    master_style: { path: typeof T013_MASTER_STYLE_PATH; sha256: typeof T013_MASTER_STYLE_SHA256 };
    risk_disclosure: { path: typeof T013_RISK_PATH; sha256: string; text_sha256: string };
    provider_schema: { path: typeof T013_SCHEMA_EVIDENCE_PATH; sha256: string };
  };
  provider_contract: {
    tool: "generate_image_batch";
    requested_model: "nano_banana_2";
    expected_provider_reported_model_for_drift_detection: "nano_banana_flash";
    upstream_provider: "Google";
    aspect_ratio: "3:4";
    resolution: "1k";
    count_per_asset: 1;
    use_unlim: false;
    response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET";
    cost_preflight: {
      tool: "generate_image";
      representative_asset: "FIRST_ASSET_IN_EACH_BATCH";
      get_cost: true;
      price_affecting_params_identical_within_batch: true;
      prompt_pricing_policy: "EXEMPT_PROVIDER_PRICING_INDEPENDENT";
      no_job_submission_observation: "DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED";
    };
  };
  reference_binding: {
    role: "image";
    source_job_id: "e0f36c95-2e1b-4e38-9931-7e10e562f209";
    reference_id: "fictor-copperplate-media-master";
    revision: 1;
    source_sha256: "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3";
    kind: "LOCAL_MASTER_IMAGE";
    lock_scope: "MEDIA_ONLY";
    reference_instruction: typeof REFERENCE_INSTRUCTION;
    provider_media_id: null;
    provider_reference_id: null;
  };
  prompt_contract: {
    core_prompt_preserved_verbatim: true;
    reference_instruction: typeof REFERENCE_INSTRUCTION;
    no_copy_boundary: typeof NO_COPY_BOUNDARY;
    deterministic_text_only: true;
  };
  budget: {
    unit_cost_decimal: "1.50";
    initial_request_count: 52;
    initial_credit_cap_decimal: "78.00";
    automatic_paid_retry_reserve_decimal: "0.00";
  };
  retry_policy: {
    automatic_paid_retry_allowed: false;
    terminal_generation_failure_max_retries: 3;
    each_retry_requires_new_scoped_user_approval: true;
    ambiguous_or_partial_submission_retry_allowed: false;
  };
  recovery_policy: {
    local_root: "public/assets";
    backup_root: "assets/backups/t013-materials";
    provider_native_unmodified: true;
    crop_or_resize_allowed: false;
    aspect_tolerance_ppm: 5000;
    immediate_local_and_backup_before_next_batch: true;
    production_jobs_wait_input: "STDIN_ONLY";
    production_diagnostic_file_commands_allowed: false;
    completion_requires_jobs_handoff_provenance: true;
    observed_download_host_allowlist: readonly [];
    download_network_policy: "GENERIC_HTTPS_DEFAULT_443_ALL_DNS_ANSWERS_PUBLIC_PINNED_ORIGINAL_TLS_IDENTITY_REDIRECT_REVALIDATED";
  };
  approval_gate: {
    disclosure_presentation_path: typeof T013_DISCLOSURE_PRESENTATION_PATH;
    path: typeof T013_APPROVAL_PATH;
    status: "MISSING_NOT_AUTHORIZED";
    exact_scope_asset_count: 52;
    exact_cap_decimal: "78.00";
    t011_approval_inherited: false;
  };
  assets: Array<{
    index: number;
    id: string;
    path: string;
    core_prompt: string;
    core_prompt_sha256: string;
    effective_prompt: string;
    effective_prompt_sha256: string;
    request: T013AssetRequest;
    canonical_request_sha256: string;
  }>;
  batches: Array<{ id: string; index: number; asset_ids: string[]; size: number }>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readPinned(root: string, path: string, expectedSha: string): Buffer {
  const bytes = readFileSync(resolve(root, path));
  if (sha256(bytes) !== expectedSha) throw new Error(`T013 pinned source changed: ${path}`);
  return bytes;
}

function t044StableMaterialsProjection(materialsBytes: string | Uint8Array): unknown[] {
  const parsed = JSON.parse(Buffer.from(materialsBytes).toString("utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 52) throw new Error("T044_BALANCE_REBIND requires exactly 52 materials");
  return parsed.map((value, index) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`T044_BALANCE_REBIND material ${index} is not an object`);
    }
    const { balance_status: balanceStatus, potency, cost_base: costBase, ...stable } = value as Record<string, unknown>;
    void balanceStatus;
    void potency;
    void costBase;
    return stable;
  });
}

function validateT044Approval(approvalBytes: string): void {
  if (sha256(approvalBytes) !== T013_T044_BALANCE_REBIND.approvalSha256) {
    throw new Error("T044_BALANCE_REBIND approval artifact bytes mismatch");
  }
  const approval = JSON.parse(approvalBytes) as {
    status?: unknown;
    task?: { key?: unknown };
    scope?: {
      approved_value_sets?: unknown;
      card_exceptions?: unknown;
      structural_changes?: unknown;
      application_task?: unknown;
    };
  };
  if (
    approval.status !== "APPROVED_NOT_APPLIED" ||
    approval.task?.key !== "T043" ||
    canonicalJson(approval.scope?.approved_value_sets) !== canonicalJson(["global_coefficients", "laws", "materials"]) ||
    !Array.isArray(approval.scope?.card_exceptions) ||
    approval.scope.card_exceptions.length !== 0 ||
    approval.scope.structural_changes !== false ||
    approval.scope.application_task !== "T044"
  ) {
    throw new Error("T044_BALANCE_REBIND approval scope mismatch");
  }
}

export function validateT044T013MaterialsRebind(
  trackedPlanBytes: string,
  currentMaterialsBytes: string | Uint8Array,
  approvalBytes: string,
): T013MaterialsPlan {
  if (sha256(trackedPlanBytes) !== T013_T044_BALANCE_REBIND.trackedPlanSha256) {
    throw new Error("T044_BALANCE_REBIND tracked T013 plan bytes mismatch");
  }
  const trackedPlan = JSON.parse(trackedPlanBytes) as T013MaterialsPlan;
  if (trackedPlan.sources.materials.sha256 !== T013_T044_BALANCE_REBIND.historicalMaterialsSha256) {
    throw new Error("T044_BALANCE_REBIND historical T013 materials hash mismatch");
  }
  if (
    sha256(canonicalJson(t044StableMaterialsProjection(currentMaterialsBytes))) !==
    T013_T044_BALANCE_REBIND.historicalStableMaterialsProjectionSha256
  ) {
    throw new Error("T044_BALANCE_REBIND stable T013 material projection mismatch");
  }
  if (sha256(currentMaterialsBytes) !== T013_T044_BALANCE_REBIND.currentMaterialsSha256) {
    throw new Error("T044_BALANCE_REBIND current T013 materials bytes mismatch");
  }
  validateT044Approval(approvalBytes);
  return trackedPlan;
}

/** Read-only T044 compatibility check. Generation, approval, and paid operations stay strict. */
export function loadT013MaterialsPlanForT044Check(repositoryRoot: string): T013MaterialsPlan {
  return validateT044T013MaterialsRebind(
    readFileSync(resolve(repositoryRoot, T013_PLAN_PATH), "utf8"),
    readFileSync(resolve(repositoryRoot, T013_MATERIALS_PATH)),
    readFileSync(resolve(repositoryRoot, T044_APPROVAL_PATH), "utf8"),
  );
}

export function validateT013MaterialsPlanForT044Check(plan: T013MaterialsPlan, repositoryRoot: string): void {
  if (canonicalJson(plan) !== canonicalJson(loadT013MaterialsPlanForT044Check(repositoryRoot))) {
    throw new Error("T013 materials plan changed from the immutable T044 check target");
  }
}

export function buildT013RiskDisclosure(): T013RiskDisclosure {
  return {
    schema_version: 1,
    evidence_version: "t013-materials-risk-disclosure-v1",
    issue_contract_sha256: T013_CONTRACT_SHA256,
    secret_free: true,
    disclosure_text_ko: T013_RISK_DISCLOSURE_TEXT,
    disclosure_text_sha256: sha256(T013_RISK_DISCLOSURE_TEXT),
    scope: { category: "MATERIAL", asset_count: 52, initial_credit_cap_decimal: "78.00", automatic_paid_retry_reserve_decimal: "0.00" },
  };
}

export function buildT013ProviderSchemaEvidence(): T013ProviderSchemaEvidence {
  return {
    schema_version: 1,
    evidence_version: "t013-higgsfield-schema-v1",
    observed_at: "2026-08-11T13:57:31.503Z",
    source: "T013 second review live Higgsfield schema observation",
    secret_free: true,
    media_binding: { field: "medias", item_shape: { role: "image", value: "SOURCE_JOB_ID" } },
    generate_image_batch: {
      request_shape: "requests[index,params[model,prompt,aspect_ratio,resolution,count,use_unlim,medias]]",
      response_shape: "submitted_count,failed_count,jobs[index,job_id,status,adjustments?,error?,warning?,preset_recommendation?]",
      statuses: ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "submission_failed"],
      optional_job_field_policy: "VALIDATE_REDACT_PRESERVE_DEFINITE_JOB_IDS_FAIL_STOP_ON_SIGNAL",
      benign_warning_allowlist: [],
    },
    jobs_wait: {
      request_shape: "jobs[index,job_id]",
      response_shape: "all_terminal,jobs[index,job_id,status,model?,result_url?,thumbnail_url?,error?,retryable?,type?],summary,poll_after_seconds?,timed_out?,aborted?",
      statuses: ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"],
      lookup_failed_policy: "RETRYABLE_TRUE_REPOLL_SAME_JOB_FALSE_OR_MISSING_FAIL_STOP_NO_RESUBMIT",
      sensitive_field_policy: "RESULT_URL_THUMBNAIL_URL_ERROR_TRANSIENT_ONLY_NEVER_PERSIST",
      handoff: "ACTUAL_JSON_STDIN_ONLY_PUBLIC_DNS_PINNED_HTTPS_REDIRECT_REVALIDATED_TEMP_INGEST_DELETE",
      observed_download_host_allowlist: [],
      download_network_policy: "GENERIC_HTTPS_HOSTNAME_DEFAULT_443_ALL_DNS_ANSWERS_PUBLIC_PINNED_ORIGINAL_TLS_IDENTITY_NO_PROXY",
      redirect_policy: "MAX_3_EACH_HOP_URL_DNS_PIN_REVALIDATED",
      completion_provenance: "ONLY_JOBS_HANDOFF_STDIN_JOB_BOUND_RECOVERIES",
      diagnostic_command_policy: "JOBS_FILE_AND_INGEST_INPUT_PNG_TEST_INTERNAL_ONLY_NOT_PRODUCTION",
    },
    generate_image_get_cost: {
      request_shape: "params[model,prompt,aspect_ratio,resolution,count,use_unlim,medias,get_cost:true]",
      response_shape: "cost[credits:number,credits_exact:number]",
      representative_asset: "FIRST_ASSET_IN_EACH_BATCH",
      price_affecting_params: ["model", "aspect_ratio", "resolution", "count", "use_unlim", "medias"],
      prompt_pricing_policy: "EXEMPT_PROVIDER_PRICING_INDEPENDENT",
      no_job_submission_observation: "DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED",
    },
    balance: { response_shape: "credits:number", normalization: "EXACT_DECIMAL_INTERNAL" },
  };
}

export function renderCanonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildT013MaterialsPlanRaw(repositoryRoot: string): T013MaterialsPlan {
  const materialBytes = readPinned(repositoryRoot, T013_MATERIALS_PATH, T013_MATERIALS_SHA256);
  const coreBytes = readPinned(repositoryRoot, T013_CORE_PLAN_PATH, T013_CORE_PLAN_SHA256);
  const masterBytes = readPinned(repositoryRoot, T013_MASTER_STYLE_PATH, T013_MASTER_STYLE_SHA256);
  const risk = buildT013RiskDisclosure();
  const riskBytes = renderCanonicalJson(risk);
  const schemaEvidence = buildT013ProviderSchemaEvidence();
  const schemaBytes = renderCanonicalJson(schemaEvidence);
  const trackedRiskPath = resolve(repositoryRoot, T013_RISK_PATH);
  if (existsSync(trackedRiskPath) && readFileSync(trackedRiskPath, "utf8") !== riskBytes) throw new Error("tracked T013 risk disclosure changed");
  const trackedSchemaPath = resolve(repositoryRoot, T013_SCHEMA_EVIDENCE_PATH);
  if (existsSync(trackedSchemaPath) && readFileSync(trackedSchemaPath, "utf8") !== schemaBytes) throw new Error("tracked T013 provider schema evidence changed");
  const materials = JSON.parse(materialBytes.toString("utf8")) as Array<{ id: string; art: string }>;
  const core = JSON.parse(coreBytes.toString("utf8")) as { assets?: Array<{ id: string; category: string; path: string; aspect_ratio: string; prompt: string }> };
  const master = JSON.parse(masterBytes.toString("utf8")) as {
    reference_element?: { reference_id?: string; revision?: number; reference_instruction?: string; provider_registration?: { provider_media_id?: unknown; provider_reference_id?: unknown } };
    selected_candidate?: { image_sha256?: string; job_id?: string };
    media_style_lock?: { lock_scope?: string };
  };
  const coreMaterials = core.assets?.filter(({ category }) => category === "MATERIAL") ?? [];
  if (materials.length !== 52 || coreMaterials.length !== 52) throw new Error("T013 requires exactly 52 materials");
  materials.forEach((material, index) => {
    const asset = coreMaterials[index];
    if (!asset || material.id !== asset.id || material.art !== asset.path || asset.aspect_ratio !== "3:4") throw new Error(`T013 material/core order drift at index ${index}`);
  });
  if (master.reference_element?.reference_id !== "fictor-copperplate-media-master" || master.reference_element.revision !== 1 ||
      master.reference_element.reference_instruction !== REFERENCE_INSTRUCTION || master.reference_element.provider_registration?.provider_media_id !== null ||
      master.reference_element.provider_registration.provider_reference_id !== null || master.selected_candidate?.image_sha256 !== "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3" ||
      master.selected_candidate.job_id !== "e0f36c95-2e1b-4e38-9931-7e10e562f209" || master.media_style_lock?.lock_scope !== "MEDIA_ONLY") {
    throw new Error("T013 master-style binding changed");
  }
  const assets = coreMaterials.map((asset, index) => {
    const effectivePrompt = `${asset.prompt}\n\nMaster-style reference instruction: ${REFERENCE_INSTRUCTION}\n${NO_COPY_BOUNDARY}`;
    const request: T013AssetRequest = {
      index,
      params: {
        model: "nano_banana_2",
        aspect_ratio: "3:4",
        resolution: "1k",
        prompt: effectivePrompt,
        use_unlim: false,
        count: 1,
        medias: [{ role: "image", value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }],
      },
    };
    return {
      index,
      id: asset.id,
      path: asset.path,
      core_prompt: asset.prompt,
      core_prompt_sha256: sha256(asset.prompt),
      effective_prompt: effectivePrompt,
      effective_prompt_sha256: sha256(effectivePrompt),
      request,
      canonical_request_sha256: sha256(canonicalJson(request)),
    };
  });
  const batches: T013MaterialsPlan["batches"] = [];
  for (let index = 0; index < assets.length; index += 12) {
    const assetIds = assets.slice(index, index + 12).map(({ id }) => id);
    batches.push({ id: `materials-${String(batches.length + 1).padStart(3, "0")}`, index: batches.length, asset_ids: assetIds, size: assetIds.length });
  }
  const plan: T013MaterialsPlan = {
    schema_version: 1,
    plan_version: "t013-materials-v1",
    issue_contract_sha256: T013_CONTRACT_SHA256,
    state: "HOLD_FOR_SCOPED_USER_APPROVAL",
    remote_execution_allowed_without_approval: false,
    scope: { category: "MATERIAL", asset_count: 52, core_or_bulk_allowed: false },
    sources: {
      materials: { path: T013_MATERIALS_PATH, sha256: T013_MATERIALS_SHA256 },
      core_plan: { path: T013_CORE_PLAN_PATH, sha256: T013_CORE_PLAN_SHA256 },
      master_style: { path: T013_MASTER_STYLE_PATH, sha256: T013_MASTER_STYLE_SHA256 },
      risk_disclosure: { path: T013_RISK_PATH, sha256: sha256(riskBytes), text_sha256: risk.disclosure_text_sha256 },
      provider_schema: { path: T013_SCHEMA_EVIDENCE_PATH, sha256: sha256(schemaBytes) },
    },
    provider_contract: {
      tool: "generate_image_batch", requested_model: "nano_banana_2", expected_provider_reported_model_for_drift_detection: "nano_banana_flash", upstream_provider: "Google", aspect_ratio: "3:4", resolution: "1k",
      count_per_asset: 1, use_unlim: false, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET",
      cost_preflight: { tool: "generate_image", representative_asset: "FIRST_ASSET_IN_EACH_BATCH", get_cost: true, price_affecting_params_identical_within_batch: true, prompt_pricing_policy: "EXEMPT_PROVIDER_PRICING_INDEPENDENT", no_job_submission_observation: "DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED" },
    },
    reference_binding: {
      role: "image", source_job_id: "e0f36c95-2e1b-4e38-9931-7e10e562f209", reference_id: "fictor-copperplate-media-master",
      revision: 1, source_sha256: "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3",
      kind: "LOCAL_MASTER_IMAGE", lock_scope: "MEDIA_ONLY", reference_instruction: REFERENCE_INSTRUCTION,
      provider_media_id: null, provider_reference_id: null,
    },
    prompt_contract: { core_prompt_preserved_verbatim: true, reference_instruction: REFERENCE_INSTRUCTION, no_copy_boundary: NO_COPY_BOUNDARY, deterministic_text_only: true },
    budget: { unit_cost_decimal: "1.50", initial_request_count: 52, initial_credit_cap_decimal: "78.00", automatic_paid_retry_reserve_decimal: "0.00" },
    retry_policy: { automatic_paid_retry_allowed: false, terminal_generation_failure_max_retries: 3, each_retry_requires_new_scoped_user_approval: true, ambiguous_or_partial_submission_retry_allowed: false },
    recovery_policy: {
      local_root: "public/assets", backup_root: "assets/backups/t013-materials", provider_native_unmodified: true, crop_or_resize_allowed: false,
      aspect_tolerance_ppm: 5000, immediate_local_and_backup_before_next_batch: true, production_jobs_wait_input: "STDIN_ONLY",
      production_diagnostic_file_commands_allowed: false, completion_requires_jobs_handoff_provenance: true, observed_download_host_allowlist: [],
      download_network_policy: "GENERIC_HTTPS_DEFAULT_443_ALL_DNS_ANSWERS_PUBLIC_PINNED_ORIGINAL_TLS_IDENTITY_REDIRECT_REVALIDATED",
    },
    approval_gate: { disclosure_presentation_path: T013_DISCLOSURE_PRESENTATION_PATH, path: T013_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_scope_asset_count: 52, exact_cap_decimal: "78.00", t011_approval_inherited: false },
    assets,
    batches,
  };
  return plan;
}

export function buildT013MaterialsPlan(repositoryRoot: string): T013MaterialsPlan {
  const plan = buildT013MaterialsPlanRaw(repositoryRoot);
  validateT013MaterialsPlan(plan, repositoryRoot);
  return plan;
}

export function validateT013MaterialsPlan(plan: T013MaterialsPlan, repositoryRoot: string): void {
  const expected = buildT013MaterialsPlanRaw(repositoryRoot);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("T013 materials plan changed from Issue 15 contract");
}

export function renderT013MaterialsPlan(plan: T013MaterialsPlan): string {
  return renderCanonicalJson(plan);
}

export function t013PlanSha256(plan: T013MaterialsPlan): string {
  return sha256(renderT013MaterialsPlan(plan));
}

function parseEvidenceTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`valid ${label} timestamp is required`);
  }
  return Date.parse(value);
}

function buildT013DisclosurePresentationEvidenceInternal(
  plan: T013MaterialsPlan,
  risk: T013RiskDisclosure,
  disclosedAt: string,
  now: Date,
  requireFreshRecording: boolean,
): T013DisclosurePresentationEvidence {
  const disclosedMs = parseEvidenceTimestamp(disclosedAt, "T013 disclosure");
  if (disclosedMs > now.getTime()) throw new Error("T013 disclosure timestamp cannot be in the future");
  if (requireFreshRecording && now.getTime() - disclosedMs > 15 * 60 * 1000) throw new Error("T013 disclosure timestamp is outside the 15-minute recording window");
  return {
    schema_version: 1,
    evidence_version: "t013-materials-disclosure-presentation-v1",
    secret_free: true,
    plan_sha256: t013PlanSha256(plan),
    risk_disclosure_evidence_sha256: sha256(renderCanonicalJson(risk)),
    risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    disclosed_at: disclosedAt,
    source: "current user conversation",
    exact_approval_phrase_required: T013_EXACT_APPROVAL_PHRASE,
  };
}

export function buildT013DisclosurePresentationEvidence(
  plan: T013MaterialsPlan,
  risk: T013RiskDisclosure,
  disclosedAt: string,
  now = new Date(),
): T013DisclosurePresentationEvidence {
  return buildT013DisclosurePresentationEvidenceInternal(plan, risk, disclosedAt, now, true);
}

export function validateT013DisclosurePresentationEvidence(
  value: unknown,
  plan: T013MaterialsPlan,
  risk: T013RiskDisclosure,
  now = new Date(),
): asserts value is T013DisclosurePresentationEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T013 disclosure presentation evidence must be an object");
  const disclosedAt = (value as Record<string, unknown>).disclosed_at;
  if (typeof disclosedAt !== "string") throw new Error("T013 disclosure timestamp is required");
  const expected = buildT013DisclosurePresentationEvidenceInternal(plan, risk, disclosedAt, now, false);
  if (canonicalJson(value) !== canonicalJson(expected)) throw new Error("T013 disclosure presentation provenance changed");
}

function buildT013ApprovalEvidenceInternal(
  plan: T013MaterialsPlan,
  risk: T013RiskDisclosure,
  presentation: T013DisclosurePresentationEvidence,
  exactUserQuote: string,
  approvedAt: string,
  now: Date,
  requireFreshRecording: boolean,
): T013ApprovalEvidence {
  validateT013DisclosurePresentationEvidence(presentation, plan, risk, now);
  if (exactUserQuote !== T013_EXACT_APPROVAL_PHRASE) throw new Error("exact positive T013 approval phrase is required");
  const approvedMs = parseEvidenceTimestamp(approvedAt, "T013 approval");
  const disclosedMs = parseEvidenceTimestamp(presentation.disclosed_at, "T013 disclosure");
  if (approvedMs <= disclosedMs) throw new Error("T013 approval must be strictly after risk disclosure");
  if (approvedMs - disclosedMs > 24 * 60 * 60 * 1000) throw new Error("T013 approval is outside the 24-hour disclosure window");
  if (approvedMs > now.getTime()) throw new Error("T013 approval timestamp cannot be in the future");
  if (requireFreshRecording && now.getTime() - approvedMs > 15 * 60 * 1000) throw new Error("T013 approval timestamp is outside the 15-minute recording window");
  return {
    schema_version: 1,
    evidence_version: "t013-materials-approval-v1",
    secret_free: true,
    decision: "APPROVE_T013_EXACTLY_52_MATERIALS_WITH_DISCLOSED_RISKS",
    source: "current user conversation",
    exact_user_quote: exactUserQuote,
    approved_at: approvedAt,
    disclosed_at: presentation.disclosed_at,
    plan_sha256: t013PlanSha256(plan),
    risk_disclosure_evidence_sha256: sha256(renderCanonicalJson(risk)),
    risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    disclosure_presentation_evidence_sha256: sha256(renderCanonicalJson(presentation)),
    scope: { category: "MATERIAL", asset_count: 52, initial_credit_cap_decimal: "78.00", automatic_paid_retry_reserve_decimal: "0.00", core_or_bulk_allowed: false },
    acknowledges_t011_approval_not_inherited: true,
  };
}

export function buildT013ApprovalEvidence(
  plan: T013MaterialsPlan,
  risk: T013RiskDisclosure,
  presentation: T013DisclosurePresentationEvidence,
  exactUserQuote: string,
  approvedAt: string,
  now = new Date(),
): T013ApprovalEvidence {
  return buildT013ApprovalEvidenceInternal(plan, risk, presentation, exactUserQuote, approvedAt, now, true);
}

export function validateT013ApprovalEvidence(
  value: unknown,
  plan: T013MaterialsPlan,
  risk: T013RiskDisclosure,
  presentation: T013DisclosurePresentationEvidence,
  now = new Date(),
): asserts value is T013ApprovalEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T013 approval evidence must be an object");
  const record = value as Record<string, unknown>;
  const quote = record.exact_user_quote;
  const approvedAt = record.approved_at;
  if (typeof quote !== "string" || typeof approvedAt !== "string") throw new Error("T013 approval quote and timestamp are required");
  const expected = buildT013ApprovalEvidenceInternal(plan, risk, presentation, quote, approvedAt, now, false);
  if (canonicalJson(value) !== canonicalJson(expected)) throw new Error("T013 approval evidence scope or provenance changed");
}

export function isT013Authorized(repositoryRoot: string, plan: T013MaterialsPlan): boolean {
  const approvalPath = resolve(repositoryRoot, T013_APPROVAL_PATH);
  const presentationPath = resolve(repositoryRoot, T013_DISCLOSURE_PRESENTATION_PATH);
  if (!existsSync(approvalPath) || !existsSync(presentationPath)) return false;
  try {
    const presentationBytes = readFileSync(presentationPath, "utf8");
    const presentation = JSON.parse(presentationBytes) as unknown;
    if (presentationBytes !== renderCanonicalJson(presentation)) return false;
    validateT013DisclosurePresentationEvidence(presentation, plan, buildT013RiskDisclosure());
    const bytes = readFileSync(approvalPath, "utf8");
    const parsed = JSON.parse(bytes) as unknown;
    if (bytes !== renderCanonicalJson(parsed)) return false;
    validateT013ApprovalEvidence(parsed, plan, buildT013RiskDisclosure(), presentation);
    return true;
  } catch {
    return false;
  }
}
