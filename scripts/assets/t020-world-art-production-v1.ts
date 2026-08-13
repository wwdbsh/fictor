import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AspectRatio } from "./types";

/* T020 world-art paid production contract: 36 ENEMY/ELITE (3:4) + 18 BACKGROUND (16:9),
   exactly 54 assets, 5 batches, 81.00 credits hard cap, clean start with no legacy chain. */

export const T020_ISSUE_NUMBER = 22 as const;
export const T020_CONTRACT_SHA256 = "0612a8cc46a3e9db8b8c8ad82e132c15484d77c18205ff5530507f55a794aea9" as const;

/* ------------------------------------------------------------------ paths */

export const T020_V1_PLAN_PATH = "assets/manifests/t020-world-art-v1.plan.json" as const;
export const T020_V1_BINDING_PATH = "assets/evidence/t020-world-art-implementation-binding-v1.json" as const;
export const T020_V1_RISK_PATH = "assets/evidence/t020-world-art-risk-disclosure-v1.json" as const;
export const T020_V1_SCHEMA_PATH = "assets/evidence/t020-world-art-higgsfield-schema-v1.json" as const;
export const T020_V1_FORENSICS_PATH = "assets/evidence/t020-world-art-forensics-v1.json" as const;
export const T020_V1_PENDING_PATH = "assets/evidence/t020-world-art-disclosure-presentation-v1.pending.json" as const;
export const T020_V1_PRESENTATION_PATH = "assets/evidence/t020-world-art-disclosure-presentation-v1.json" as const;
export const T020_V1_APPROVAL_PATH = "assets/evidence/t020-world-art-approval-v1.json" as const;
export const T020_V1_CONTROLLER_DISCLOSURE_PATH = "assets/evidence/t020-world-art-controller-disclosure-attestation-v1.json" as const;
export const T020_V1_CONTROLLER_APPROVAL_PATH = "assets/evidence/t020-world-art-controller-approval-attestation-v1.json" as const;
export const T020_V1_JOURNAL_PATH = "assets/runs/t020-world-art/operations-v1.json" as const;
export const T020_V1_LOCK_PATH = "assets/runs/t020-world-art/operations-v1.lock" as const;
export const T020_V1_LOCAL_ROOT = "public/assets" as const;
export const T020_V1_BACKUP_ROOT = "assets/backups/t020-world-art" as const;
export const T020_V1_CONTACT_INDEX_PATH = "docs/asset-runs/contact-sheets/t020-world-art-v1.html" as const;
export const T020_V1_CONTACT_SEGMENT_ROOT = "docs/asset-runs/contact-sheets/t020-world-art-v1" as const;

/* Pinned immutable inputs. Every one of these is byte-verified on each plan derivation. */
export const T020_CORE_PLAN_PATH = "assets/manifests/core-v1.plan.json" as const;
export const T020_CORE_PLAN_SHA256 = "54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f" as const;
export const T020_MASTER_STYLE_PATH = "assets/manifests/master-style-v1.json" as const;
export const T020_MASTER_STYLE_SHA256 = "b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d" as const;
export const T020_T014_APPROVAL_PATH = "assets/manifests/material-style-approval-v1.json" as const;
export const T020_T014_APPROVAL_SHA256 = "72f5e863806cdee5b7638d8bb1cd9f1fab2c20feb6aeae3c53ba7ef6be872c96" as const;

/* --------------------------------------------------------------- economics */

export const T020_V1_ASSET_COUNT = 54 as const;
export const T020_V1_ENEMY_ASSET_COUNT = 36 as const;
export const T020_V1_BACKGROUND_ASSET_COUNT = 18 as const;
export const T020_V1_BATCH_COUNT = 5 as const;
export const T020_V1_BATCH_MAX = 12 as const;
/** Integer units are hundredths of a credit; billing uses credits_exact only. */
export const T020_V1_UNIT_COST_UNITS = 150 as const;
export const T020_V1_TOTAL_CAP_UNITS = 8_100 as const;
export const T020_V1_EXPECTED_MODEL = "nano_banana_flash" as const;
export const T020_V1_REQUESTED_MODEL = "nano_banana_2" as const;
export const T020_V1_CANARY_BATCH_ID = "world-art-001" as const;
export const T020_V1_CANARY_BLOCKED_BATCH_ID = "world-art-002" as const;
export const T020_V1_ASPECT_TOLERANCE_PPM = 5000 as const;
export const T020_V1_CREDIT_EXPIRY_DATE = "2026-08-17" as const;
/** The maximum credits a single ambiguous submission window can consume without recovery. */
export const T020_V1_MAX_BATCH_EXPOSURE_UNITS = 1_800 as const;

/* ---------------------------------------------------------------- selection */

/**
 * Batches must be aspect-homogeneous because a batch is a single provider envelope and the
 * ingest/verify path checks one aspect per stored PNG. The 3:4 group (ENEMY+ELITE, 36) is
 * ordered ahead of the 16:9 group (BACKGROUND, 18) so the batch sizes land on exactly
 * [12,12,12,12,6] with no batch straddling an aspect boundary.
 */
export const T020_V1_GROUPS = [
  { key: "ENEMY", categories: ["ENEMY", "ELITE"], aspect_ratio: "3:4", path_prefix: "enemies/", asset_count: T020_V1_ENEMY_ASSET_COUNT },
  { key: "BACKGROUND", categories: ["BACKGROUND"], aspect_ratio: "16:9", path_prefix: "backgrounds/", asset_count: T020_V1_BACKGROUND_ASSET_COUNT },
] as const;
export const T020_V1_BATCH_SIZES = [12, 12, 12, 12, 6] as const;
export const T020_V1_ID_LIST_SHA256 = "86e01cf9775b46da778a2d7f1d9cb0918c9acbe981ccf54f974a5f2c24447bf9" as const;
export const T020_V1_FIRST_ID = "enemy__still__swarm" as const;
export const T020_V1_LAST_ID = "background__join__depth_03" as const;

/* ----------------------------------------------------------------- prompts */

/** Verbatim from the pinned master-style manifest; re-verified against it on every build. */
export const T020_REFERENCE_INSTRUCTION = "Use this local master image as a MEDIA_ONLY reference for 17th-century copperplate line treatment; do not copy its subject, geometry, pose, composition, whitespace, colors, paper tone, density, representation, or aspect ratio." as const;
/** T020-specific: the boundary names world assets, not cards, and pins aspect to the manifest. */
export const T020_NO_COPY_BOUNDARY = "MEDIA_ONLY no-copy boundary: preserve only the approved copperplate line treatment; derive this world asset's subject, geometry, pose, composition, whitespace, attribute colors, paper tone, density, representation, and aspect from the core world prompt, never from the reference subject. Background plates are wide 16:9 landscape vistas and enemy plates are 3:4 specimen studies; the reference image's own aspect is never inherited." as const;
export const T020_MASTER_REFERENCE_JOB_ID = "e0f36c95-2e1b-4e38-9931-7e10e562f209" as const;
export const T020_MASTER_REFERENCE_SHA256 = "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3" as const;
export const T020_MASTER_REFERENCE_ID = "fictor-copperplate-media-master" as const;

/* ---------------------------------------------------------------- phrases */

export const T020_V1_EXACT_APPROVAL_PHRASE = "T020 세계 아트 54장 생성을 승인한다. 한도 81.00 크레딧." as const;
export const T020_V1_RECOVERY_OPERATOR_PHRASE = "T020 이 배치의 확정 job ID만 복구하고 새 유료 제출은 하지 않습니다." as const;
export const T020_V1_RESUME_OPERATOR_PHRASE = "T020 실패한 배치를 재제출하지 않고 다음 배치만 진행합니다." as const;
export const T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE = "T020 이 배치의 손실을 확인했고 재제출 없이 손실을 상한에서 차감한 뒤 남은 배치만 진행합니다." as const;

export const T020_V1_RISK_TEXT = `T020은 세계 아트 정확히 54장(적 36장 = ENEMY 30 + ELITE 6, 배경 18장)을 5개 배치([12,12,12,12,6])로 배치당 단 한 번씩 유료 생성합니다. 상한은 정확히 81.00 credits(정확 단가 1.50 x 54장)이고 자동 유료 재시도 예산은 0이며, 이전 T011/T013/T015 승인은 하나도 상속되지 않습니다.
(i) 배치마다 제출 응답을 잃을 수 있는 모호 제출(ambiguous submission) 구간이 정확히 1회씩, 총 5회 존재합니다. 각 구간에서 최대 18.00 credits(12장 x 1.50)가 실제로 차감되고도 응답을 받지 못하면 그 배치의 job ID를 전혀 열거할 수 없고, 따라서 이미 지불한 이미지를 영구히 회수하지 못할 수 있습니다.
(ii) 각 배치는 단 한 번만 제출합니다. 유료 envelope이 한 번이라도 밖으로 나간 배치는 모호 제출이든 부분 응답이든 즉시 fail-stop하고 어떤 경우에도 재제출하지 않습니다.
(iii) fail-stop은 실행 전체가 아니라 배치 단위로 적용됩니다. 다음 배치로 넘어가려면 operator가 정확한 재개 문구를 입력해야 합니다. 재개는 두 갈래뿐입니다. 지출이 0인 배치(유료 envelope이 나가기 전 preflight 단계 실패)는 재개 뒤 PLANNED로 되돌려 같은 배치를 처음부터 다시 실행할 수 있고, 이때도 이전 실패 기록은 저널에 그대로 보존됩니다. 이미 지출이 발생했을 수 있는 배치는 절대 재실행하지 않고, operator가 정확히 “${T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE}”로 손실을 확인해야만 다음 배치가 열립니다. 확인된 손실은 81.00 상한에서 그대로 차감되어 남은 배치의 예산을 줄이며, 손실된 자산의 이미지는 이 승인으로는 다시 생성하지 않습니다. 다시 만들려면 별도의 새 고지와 새 승인이 필요합니다. 손실이 하나라도 확인된 실행은 정확히 81.00으로 닫히지 않고 CLOSED_WITH_LOSSES 상태로 종료됩니다.
(iv) 종횡비 위험 - 이 실행은 서로 다른 두 종횡비를 요청합니다. 적 36장은 3:4이고 배경 18장은 16:9입니다. 3:4는 T015에서 실측 검증된 값입니다(관찰 896x1200, 오차 약 4445ppm, 허용 5000ppm). 그러나 16:9는 이 provider에게 한 번도 유료·무료로 확인된 적이 없습니다. provider가 16:9를 다른 화소비로 반환하면 이미 과금된 배경 배치가 종횡비 검증에서 실패하고 그 지출은 돌아오지 않습니다. 배치는 종횡비별로 분리되어 하나의 배치가 두 종횡비를 섞지 않으며, 16:9 배치는 4번째와 5번째입니다. 즉 16:9 위험이 드러나는 시점에는 이미 최대 54.00 credits가 3:4 배치에 지출된 뒤입니다.
(v) 저장 경로 - 각 자산은 고정된 core manifest의 path 필드를 그대로 씁니다. 배경은 ${T020_V1_LOCAL_ROOT}/backgrounds/, 적과 엘리트는 ${T020_V1_LOCAL_ROOT}/enemies/에 저장되고 같은 상대 경로로 ${T020_V1_BACKUP_ROOT} 아래에 백업됩니다. 두 사본은 저장 직후 sha256이 서로 같아야 하며 다르면 fail-stop입니다.
(vi) 과금은 provider가 보고하는 credits_exact(1.50)만 사용합니다. 화면 표시값 credits(1.00)는 기록만 하고 상한 계산에 절대 쓰지 않습니다.
(vii) credits는 2026-08-17에 만료됩니다. 정확한 만료 시각(hour)은 알 수 없습니다.
(viii) 복구 개시와 재개에 쓰는 operator 문구는 agent가 스스로 입력할 수 있으므로 사용자 동의를 대신하지 않습니다. 사고와 오작동을 막는 게이트일 뿐입니다.
(ix) 모든 요청은 use_unlim:false를 문자 그대로 포함하며 이 값은 각 자산의 canonical_request_sha256 안에 고정되어 있습니다.
(x) 모델 canary: 배치 ${T020_V1_CANARY_BATCH_ID}의 provider-reported model이 ${T020_V1_EXPECTED_MODEL}로 확인되지 않으면 배치 ${T020_V1_CANARY_BLOCKED_BATCH_ID}은 열리지 않습니다. 다만 드리프트로 멈추더라도 그 canary 배치에 이미 지출된 credits는 회수되지 않습니다.
(xi) 범위 밖 - 보스는 신의 심장 카드 아트를 재사용하므로 별도 세계 아트를 만들지 않습니다. 이벤트 아트 20장은 T021의 범위이며 이 승인에 포함되지 않습니다. MATERIAL, CANONICAL, HEART, HEART_FORGE 자산도 전부 제외됩니다.
signed URL, redirect URL, host, provider raw error는 journal, evidence, stdout 어디에도 기록하지 않습니다. 승인은 정확히 “${T020_V1_EXACT_APPROVAL_PHRASE}”라는 문구로만 기록합니다.` as const;

/* --------------------------------------------------------------- primitives */

export const T020_V1_RUNTIME_FILES = {
  controller: "scripts/assets/t020-world-art-production-v1-controller.ts",
  preparation: "scripts/assets/t020-world-art-production-v1-cli.ts",
  production: "scripts/assets/t020-world-art-production-v1-ops.ts",
  contract: "scripts/assets/t020-world-art-production-v1.ts",
  filesystem: "scripts/assets/filesystem.ts",
  filesystem_types: "scripts/assets/types.ts",
  schema_contracts: "src/data/schema/contracts.ts",
} as const;

export function sha256T020(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
export function renderT020CanonicalJson(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
export function canonicalJsonT020(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonT020).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonT020(record[key])}`).join(",")}}`;
  }
  const rendered = JSON.stringify(value);
  if (rendered === undefined) throw new Error("canonical JSON does not support undefined");
  return rendered;
}
function canonical(value: unknown): string { return canonicalJsonT020(value); }
export function readRegularT020(root: string, path: string): Buffer {
  const target = resolve(root, path);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`T020 source is not a regular file: ${path}`);
  return readFileSync(target);
}
function readPinnedT020(root: string, path: string, expected: string): Buffer {
  const bytes = readRegularT020(root, path);
  if (sha256T020(bytes) !== expected) throw new Error(`T020 pinned source changed: ${path}`);
  return bytes;
}
export function decimalT020(units: number): string { const sign = units < 0 ? "-" : ""; const magnitude = Math.abs(units); return `${sign}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, "0")}`; }

/* ---------------------------------------------------------------- binding */

export interface T020Binding { schema_version: 1; manifest_version: "t020-world-art-implementation-binding-v1"; issue_number: typeof T020_ISSUE_NUMBER; issue_contract_sha256: typeof T020_CONTRACT_SHA256; files: Record<keyof typeof T020_V1_RUNTIME_FILES, { path: string; sha256: string }> }
/**
 * package.json is deliberately absent: the execution entry is
 * `npx tsx scripts/assets/t020-world-art-production-v1-controller.ts`, never an npm script,
 * so package.json bytes can change without invalidating an approved T020 run.
 */
export function buildT020Binding(root: string): T020Binding {
  return {
    schema_version: 1, manifest_version: "t020-world-art-implementation-binding-v1", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    files: Object.fromEntries(Object.entries(T020_V1_RUNTIME_FILES).map(([key, path]) => [key, { path, sha256: sha256T020(readRegularT020(root, path)) }])) as T020Binding["files"],
  };
}
export function loadT020Binding(root: string): T020Binding {
  const bytes = readRegularT020(root, T020_V1_BINDING_PATH).toString("utf8");
  const value = JSON.parse(bytes) as T020Binding;
  const expected = buildT020Binding(root);
  if (bytes !== renderT020CanonicalJson(value) || canonical(value) !== canonical(expected)) throw new Error("T020 implementation binding changed");
  return value;
}

/* -------------------------------------------------------------- forensics */

export type T020Forensics = ReturnType<typeof buildT020Forensics>;
/**
 * T020 is a clean start: there is no prior journal, no recovered legacy slice, and no
 * committed spend to carry forward. The forensic record therefore pins the immutable inputs
 * the plan is derived from and states the policy the run is bound to.
 */
export function buildT020Forensics(root: string) {
  return {
    schema_version: 1, evidence_version: "t020-world-art-forensics-v1", secret_free: true,
    immutable_sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: sha256T020(readPinnedT020(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256)) },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: sha256T020(readPinnedT020(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256)) },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: sha256T020(readPinnedT020(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256)) },
    },
    observed: {
      prior_paid_spend_units: 0, prior_journal_present: false, legacy_recovery_present: false,
      aspect_3_4_provider_validated: true, aspect_16_9_provider_validated: false,
      aspect_tolerance_ppm: T020_V1_ASPECT_TOLERANCE_PPM, paid_retry_count: 0,
    },
    policy: {
      paid_resubmit_allowed: false, automatic_paid_retry_allowed: false, batch_scoped_fail_stop: true,
      operator_gated_resume_never_resubmits: true, aspect_homogeneous_batches: true,
      bosses_reuse_heart_card_art: true, event_art_is_out_of_scope: true, prior_task_approval_inherited: false,
    },
  } as const;
}

/* ----------------------------------------------------------- risk / schema */

export function t020ApprovalScope() {
  return {
    task_key: "T020", categories: ["ENEMY", "ELITE", "BACKGROUND"],
    asset_count: T020_V1_ASSET_COUNT, enemy_asset_count: T020_V1_ENEMY_ASSET_COUNT, background_asset_count: T020_V1_BACKGROUND_ASSET_COUNT,
    batch_count: T020_V1_BATCH_COUNT, batch_sizes: [...T020_V1_BATCH_SIZES], batch_max: T020_V1_BATCH_MAX, aspect_homogeneous_batches: true,
    enemy_aspect_ratio: "3:4", background_aspect_ratio: "16:9",
    unit_cost_decimal: decimalT020(T020_V1_UNIT_COST_UNITS), unit_cost_units: T020_V1_UNIT_COST_UNITS,
    total_credit_cap_decimal: decimalT020(T020_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T020_V1_TOTAL_CAP_UNITS,
    legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00", automatic_paid_retry_count: 0,
    max_batch_exposure_decimal: decimalT020(T020_V1_MAX_BATCH_EXPOSURE_UNITS), ambiguous_submission_windows: T020_V1_BATCH_COUNT,
    credit_expiry_date: T020_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    boss_world_art_allowed: false, event_art_allowed: false, other_categories_allowed: false, prior_task_approval_inherited: false,
  } as const;
}
export function buildT020Risk() {
  return { schema_version: 1, evidence_version: "t020-world-art-risk-disclosure-v1", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256, secret_free: true, disclosure_text_ko: T020_V1_RISK_TEXT, disclosure_text_sha256: sha256T020(T020_V1_RISK_TEXT), scope: t020ApprovalScope() } as const;
}
export function buildT020Schema() {
  return {
    schema_version: 1, evidence_version: "t020-world-art-higgsfield-schema-v1", source: "pinned T015 v1..v4 provider observations; no new provider probe", secret_free: true,
    submit: { tool: "generate_image_batch", batch_max: T020_V1_BATCH_MAX, requested_model: T020_V1_REQUESTED_MODEL, expected_provider_reported_model: T020_V1_EXPECTED_MODEL, use_unlim: false, aspect_ratio_per_asset: true, aspect_ratios: ["3:4", "16:9"], aspect_homogeneous_batches: true, resolution: "1k", count_per_asset: 1, response_required_keys: ["submitted_count", "failed_count", "jobs"], job_required_keys: ["index", "job_id", "status"], job_allowed_optional_keys: ["adjustments", "error", "warning", "preset_recommendation"], any_optional_key_fail_stops_batch: true },
    cost: { display_credits_decimal: "1.00", exact_credits_decimal: "1.50", integer_units_per_image: T020_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true, freshness_ms: 600_000, strictly_monotonic_observations: true },
    jobs_wait: { expected_type: "image", summary_required_keys: ["active", "completed", "errors", "failed", "total"], summary_compared_by_value: true, retryable_presence_only_for_status: "lookup_failed", optional_model_or_result_url_on_non_completed: true, download_only_when_completed: true },
    secure_download: { resolver_mapped_ipv6_allowed: false, resolver_public_ipv4_allowed: true, transport_peer_pin_required: true, fresh_connection_per_request: true, auto_select_family: false, remote_address_captured_at_response_headers: true, url_or_host_diagnostics_persisted: false },
    model_canary: { canary_batch_id: T020_V1_CANARY_BATCH_ID, blocks_batch_id_on_drift: T020_V1_CANARY_BLOCKED_BATCH_ID, drift_still_costs_canary_batch_spend: true },
    unvalidated: { aspect_16_9_never_observed_from_this_provider: true },
  } as const;
}

/* ------------------------------------------------------------------- plan */

export interface T020RequestParams { model: typeof T020_V1_REQUESTED_MODEL; prompt: string; aspect_ratio: AspectRatio; resolution: "1k"; count: 1; use_unlim: false; medias: Array<{ role: "image"; value: typeof T020_MASTER_REFERENCE_JOB_ID }> }
export interface T020AssetRequest { index: number; params: T020RequestParams }
export interface T020Asset { index: number; id: string; category: string; group: string; path: string; aspect_ratio: AspectRatio; core_prompt: string; core_prompt_sha256: string; effective_prompt: string; effective_prompt_sha256: string; request: T020AssetRequest; canonical_request_sha256: string }
export interface T020Batch { id: string; index: number; group: string; aspect_ratio: AspectRatio; asset_ids: string[]; size: number }

interface CoreAsset { id: string; category: string; path: string; aspect_ratio: string; prompt: string }

/** Deterministic selection: the two aspect groups in declared order, manifest order within each. */
export function selectT020WorldAssets(root: string): CoreAsset[] {
  const core = JSON.parse(readPinnedT020(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256).toString("utf8")) as { assets?: CoreAsset[] };
  const all = core.assets ?? [];
  const selected: CoreAsset[] = [];
  for (const group of T020_V1_GROUPS) {
    const members = all.filter(({ category }) => (group.categories as readonly string[]).includes(category));
    if (members.length !== group.asset_count) throw new Error(`T020 world-art group ${group.key} has ${members.length} assets, expected ${group.asset_count}`);
    for (const member of members) {
      if (member.aspect_ratio !== group.aspect_ratio) throw new Error(`T020 world-art group ${group.key} aspect changed at ${member.id}: ${member.aspect_ratio}`);
      if (!member.path.startsWith(group.path_prefix) || !member.path.endsWith(".png")) throw new Error(`T020 world-art group ${group.key} path changed at ${member.id}: ${member.path}`);
      if (typeof member.prompt !== "string" || member.prompt.length === 0) throw new Error(`T020 world-art prompt missing at ${member.id}`);
    }
    selected.push(...members);
  }
  const ids = selected.map(({ id }) => id);
  if (selected.length !== T020_V1_ASSET_COUNT || new Set(ids).size !== T020_V1_ASSET_COUNT) throw new Error("T020 world-art selection is not exactly 54 distinct assets");
  if (ids[0] !== T020_V1_FIRST_ID || ids.at(-1) !== T020_V1_LAST_ID) throw new Error("T020 world-art selection boundary changed");
  if (sha256T020(`${ids.join("\n")}\n`) !== T020_V1_ID_LIST_SHA256) throw new Error("T020 world-art ID set changed");
  if (new Set(selected.map(({ path }) => path)).size !== T020_V1_ASSET_COUNT) throw new Error("T020 world-art paths are not unique");
  return selected;
}

function groupKeyOf(category: string): string {
  const group = T020_V1_GROUPS.find(({ categories }) => (categories as readonly string[]).includes(category));
  if (!group) throw new Error(`T020 unknown world-art category: ${category}`);
  return group.key;
}

export function buildT020Assets(root: string): T020Asset[] {
  return selectT020WorldAssets(root).map((asset, index) => {
    const effectivePrompt = `${asset.prompt}\n\nMaster-style reference instruction: ${T020_REFERENCE_INSTRUCTION}\n${T020_NO_COPY_BOUNDARY}`;
    const aspect = asset.aspect_ratio as AspectRatio;
    const request: T020AssetRequest = { index, params: { model: T020_V1_REQUESTED_MODEL, prompt: effectivePrompt, aspect_ratio: aspect, resolution: "1k", count: 1, use_unlim: false, medias: [{ role: "image", value: T020_MASTER_REFERENCE_JOB_ID }] } };
    return { index, id: asset.id, category: asset.category, group: groupKeyOf(asset.category), path: asset.path, aspect_ratio: aspect, core_prompt: asset.prompt, core_prompt_sha256: sha256T020(asset.prompt), effective_prompt: effectivePrompt, effective_prompt_sha256: sha256T020(effectivePrompt), request, canonical_request_sha256: sha256T020(canonical(request)) };
  });
}

/** Partitions the selection into aspect-homogeneous batches of at most 12. */
export function buildT020Batches(assets: readonly T020Asset[]): T020Batch[] {
  const batches: T020Batch[] = [];
  for (const group of T020_V1_GROUPS) {
    const members = assets.filter(({ group: key }) => key === group.key);
    for (let offset = 0; offset < members.length; offset += T020_V1_BATCH_MAX) {
      const slice = members.slice(offset, offset + T020_V1_BATCH_MAX);
      batches.push({ id: `world-art-${String(batches.length + 1).padStart(3, "0")}`, index: batches.length, group: group.key, aspect_ratio: group.aspect_ratio, asset_ids: slice.map(({ id }) => id), size: slice.length });
    }
  }
  if (batches.length !== T020_V1_BATCH_COUNT) throw new Error(`T020 batch partition produced ${batches.length} batches, expected ${T020_V1_BATCH_COUNT}`);
  if (canonical(batches.map(({ size }) => size)) !== canonical([...T020_V1_BATCH_SIZES])) throw new Error("T020 batch sizes changed");
  if (batches.reduce((sum, { size }) => sum + size, 0) !== T020_V1_ASSET_COUNT) throw new Error("T020 batch partition does not cover exactly 54 assets");
  if (batches.some(({ size }) => size < 1 || size > T020_V1_BATCH_MAX)) throw new Error("T020 batch exceeds the provider contract maximum");
  if (batches[0].id !== T020_V1_CANARY_BATCH_ID || batches[1].id !== T020_V1_CANARY_BLOCKED_BATCH_ID) throw new Error("T020 canary batch identity changed");
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const batch of batches) {
    if (batch.asset_ids.some((id) => byId.get(id)?.aspect_ratio !== batch.aspect_ratio)) throw new Error(`T020 batch ${batch.id} is not aspect-homogeneous`);
  }
  if (new Set(batches.flatMap(({ asset_ids }) => asset_ids)).size !== T020_V1_ASSET_COUNT) throw new Error("T020 batch partition is not a partition");
  return batches;
}

function assertMasterStyleBinding(root: string): void {
  const master = JSON.parse(readPinnedT020(root, T020_MASTER_STYLE_PATH, T020_MASTER_STYLE_SHA256).toString("utf8")) as { selected_candidate?: { job_id?: string; image_sha256?: string }; reference_element?: { reference_id?: string; revision?: number; reference_instruction?: string }; media_style_lock?: { lock_scope?: string } };
  if (master.selected_candidate?.job_id !== T020_MASTER_REFERENCE_JOB_ID || master.selected_candidate.image_sha256 !== T020_MASTER_REFERENCE_SHA256 || master.reference_element?.reference_id !== T020_MASTER_REFERENCE_ID || master.reference_element.revision !== 1 || master.reference_element.reference_instruction !== T020_REFERENCE_INSTRUCTION || master.media_style_lock?.lock_scope !== "MEDIA_ONLY") throw new Error("T020 master-style binding changed");
  readPinnedT020(root, T020_T014_APPROVAL_PATH, T020_T014_APPROVAL_SHA256);
}

export type T020Plan = ReturnType<typeof buildT020Plan>;
export function buildT020Plan(root: string) {
  assertMasterStyleBinding(root);
  const risk = buildT020Risk();
  const schema = buildT020Schema();
  const forensics = buildT020Forensics(root);
  const binding = loadT020Binding(root);
  const assets = buildT020Assets(root);
  const batches = buildT020Batches(assets);
  return {
    schema_version: 1, plan_version: "t020-world-art-v1", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    state: "HOLD_FOR_EXACT_SCOPED_USER_APPROVAL", remote_execution_allowed_without_approval: false,
    scope: {
      task_key: "T020", categories: ["ENEMY", "ELITE", "BACKGROUND"], asset_count: T020_V1_ASSET_COUNT,
      enemy_asset_count: T020_V1_ENEMY_ASSET_COUNT, background_asset_count: T020_V1_BACKGROUND_ASSET_COUNT,
      boss_world_art_allowed: false, event_art_allowed: false, other_categories_allowed: false,
    },
    selection: {
      expression: "core.assets grouped as [ENEMY+ELITE (3:4), BACKGROUND (16:9)], manifest order within each group",
      id_list_encoding: "UTF-8_IDS_JOINED_BY_NEWLINE_WITH_TRAILING_NEWLINE", id_list_sha256: T020_V1_ID_LIST_SHA256,
      first_id: T020_V1_FIRST_ID, last_id: T020_V1_LAST_ID, unique_ids: true, unique_paths: true,
    },
    sources: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: T020_CORE_PLAN_SHA256 },
      master_style: { path: T020_MASTER_STYLE_PATH, sha256: T020_MASTER_STYLE_SHA256 },
      t014_approval: { path: T020_T014_APPROVAL_PATH, sha256: T020_T014_APPROVAL_SHA256 },
      risk_disclosure: { path: T020_V1_RISK_PATH, sha256: sha256T020(renderT020CanonicalJson(risk)), text_sha256: risk.disclosure_text_sha256 },
      provider_schema: { path: T020_V1_SCHEMA_PATH, sha256: sha256T020(renderT020CanonicalJson(schema)) },
      forensics: { path: T020_V1_FORENSICS_PATH, sha256: sha256T020(renderT020CanonicalJson(forensics)) },
      implementation_binding: { path: T020_V1_BINDING_PATH, sha256: sha256T020(renderT020CanonicalJson(binding)), files: binding.files },
    },
    provider_contract: {
      tool: "generate_image_batch", requested_model: T020_V1_REQUESTED_MODEL, expected_provider_reported_model_for_canary_and_drift: T020_V1_EXPECTED_MODEL,
      first_paid_batch_is_model_canary: true, canary_blocks_batch_id_on_drift: T020_V1_CANARY_BLOCKED_BATCH_ID,
      aspect_ratio_per_asset: true, aspect_homogeneous_batches: true, resolution: "1k", count_per_asset: 1, use_unlim: false,
      batch_max: T020_V1_BATCH_MAX, response_topology: "INDEXED_JOB_ONE_TO_ONE_PER_ASSET",
    },
    reference_binding: { role: "image", source_job_id: T020_MASTER_REFERENCE_JOB_ID, reference_id: T020_MASTER_REFERENCE_ID, revision: 1, source_sha256: T020_MASTER_REFERENCE_SHA256, lock_scope: "MEDIA_ONLY", reference_instruction: T020_REFERENCE_INSTRUCTION },
    prompt_contract: { core_prompt_preserved_verbatim: true, reference_instruction: T020_REFERENCE_INSTRUCTION, no_copy_boundary: T020_NO_COPY_BOUNDARY, deterministic_text_only: true },
    budget: {
      unit_cost_decimal: decimalT020(T020_V1_UNIT_COST_UNITS), unit_cost_units: T020_V1_UNIT_COST_UNITS, billing_uses_credits_exact_only: true,
      paid_request_count: T020_V1_ASSET_COUNT, paid_batch_count: T020_V1_BATCH_COUNT, paid_batch_sizes: [...T020_V1_BATCH_SIZES],
      total_credit_cap_decimal: decimalT020(T020_V1_TOTAL_CAP_UNITS), total_credit_cap_units: T020_V1_TOTAL_CAP_UNITS,
      legacy_committed_units: 0, automatic_paid_retry_reserve_decimal: "0.00",
      credit_expiry_date: T020_V1_CREDIT_EXPIRY_DATE, credit_expiry_hour_known: false,
    },
    retry_policy: {
      automatic_paid_retry_allowed: false, automatic_paid_retry_count: 0, ambiguous_or_partial_submission_retry_allowed: false,
      single_submission_per_batch: true, ambiguous_submission_windows: T020_V1_BATCH_COUNT,
      ambiguous_window_max_exposure_decimal: decimalT020(T020_V1_MAX_BATCH_EXPOSURE_UNITS),
      operator_recovery_only_for_durable_job_ids: true, operator_gated_resume_never_resubmits: true, fail_stop_scope: "BATCH",
    },
    recovery_policy: {
      local_root: T020_V1_LOCAL_ROOT, backup_root: T020_V1_BACKUP_ROOT, provider_native_unmodified: true, crop_or_resize_allowed: false,
      aspect_tolerance_ppm: T020_V1_ASPECT_TOLERANCE_PPM, aspect_ratio_source: "PER_ASSET_FROM_PINNED_CORE_MANIFEST",
      production_jobs_wait_input: "STDIN_ONLY", signed_urls_or_raw_errors_persisted: false,
    },
    immutable_forensics: forensics.immutable_sources,
    model_canary: { canary_batch_id: T020_V1_CANARY_BATCH_ID, expected_provider_reported_model: T020_V1_EXPECTED_MODEL, blocks_batch_id_on_drift: T020_V1_CANARY_BLOCKED_BATCH_ID, drift_still_costs_canary_batch_spend: true },
    approval_gate: {
      pending_disclosure_packet_path: T020_V1_PENDING_PATH, disclosure_presentation_path: T020_V1_PRESENTATION_PATH,
      controller_disclosure_attestation_path: T020_V1_CONTROLLER_DISCLOSURE_PATH, controller_approval_attestation_path: T020_V1_CONTROLLER_APPROVAL_PATH,
      approval_path: T020_V1_APPROVAL_PATH, status: "MISSING_NOT_AUTHORIZED", exact_phrase: T020_V1_EXACT_APPROVAL_PHRASE,
      prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true,
    },
    assets, batches,
  } as const;
}
export function renderT020Plan(plan: T020Plan): string { return renderT020CanonicalJson(plan); }
export function t020PlanSha256(plan: T020Plan): string { return sha256T020(renderT020Plan(plan)); }

/** Optional cross-check: recompute effective_prompt straight from the sha-pinned core plan. */
export function crossCheckT020EffectivePrompts(root: string, plan: T020Plan, indices: readonly number[]): number {
  const source = selectT020WorldAssets(root);
  let checked = 0;
  for (const index of indices) {
    const asset = plan.assets.find((item) => item.index === index);
    const origin = source[index];
    if (!asset || !origin || origin.id !== asset.id || origin.path !== asset.path || origin.aspect_ratio !== asset.aspect_ratio) throw new Error("T020 cross-check asset binding changed");
    const effective = `${asset.core_prompt}\n\nMaster-style reference instruction: ${T020_REFERENCE_INSTRUCTION}\n${T020_NO_COPY_BOUNDARY}`;
    if (effective !== asset.effective_prompt || sha256T020(effective) !== asset.effective_prompt_sha256 || sha256T020(canonical(asset.request)) !== asset.canonical_request_sha256 || asset.request.params.prompt !== asset.effective_prompt || asset.request.params.aspect_ratio !== asset.aspect_ratio) throw new Error("T020 cross-check effective prompt changed");
    checked += 1;
  }
  return checked;
}

/* ------------------------------------------------------- disclosure chain */

export interface T020BalanceObservation { credits: number; provider_observed_at: string }
export function parseT020BalanceFile(raw: unknown): T020BalanceObservation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("T020 balance file is invalid");
  const value = raw as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("credits") || !keys.includes("provider_observed_at") || typeof value.credits !== "number" || !Number.isFinite(value.credits) || value.credits < 0 || typeof value.provider_observed_at !== "string") throw new Error("T020 balance file is invalid");
  const units = Math.round(value.credits * 100);
  if (!Number.isSafeInteger(units) || Math.abs(value.credits * 100 - units) > 1e-9) throw new Error("T020 balance file credits are ambiguous");
  parseT020EvidenceTime(value.provider_observed_at, "T020 balance observation");
  return { credits: value.credits, provider_observed_at: value.provider_observed_at };
}
/** The observed balance must still cover the whole 81.00 cap at disclosure time. */
export function t020BalanceDisclosure(observed: T020BalanceObservation) {
  const observedUnits = Math.round(observed.credits * 100);
  return {
    observed_balance_decimal: decimalT020(observedUnits), observed_balance_units: observedUnits, provider_observed_at: observed.provider_observed_at,
    total_credit_cap_decimal: decimalT020(T020_V1_TOTAL_CAP_UNITS), projected_remainder_decimal: decimalT020(observedUnits - T020_V1_TOTAL_CAP_UNITS),
    covers_total_cap: observedUnits >= T020_V1_TOTAL_CAP_UNITS,
  } as const;
}

export function parseT020EvidenceTime(value: string, label: string): number { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(`${label} timestamp is not canonical UTC`); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is invalid`); return parsed; }
function exactEvidence(actual: unknown, expected: unknown, label: string): void { if (canonical(actual) !== canonical(expected)) throw new Error(`${label} changed or has unknown fields`); }
export function canonicalT020File<T>(root: string, path: string): { value: T; sha256: string } { const bytes = readRegularT020(root, path).toString("utf8"); const value = JSON.parse(bytes) as T; if (bytes !== renderT020CanonicalJson(value)) throw new Error(`T020 artifact is not canonical: ${path}`); return { value, sha256: sha256T020(bytes) }; }

export type T020Pending = ReturnType<typeof buildT020Pending>;
export function buildT020Pending(root: string, plan: T020Plan) {
  const risk = buildT020Risk(); const schema = buildT020Schema(); const forensics = buildT020Forensics(root); const binding = loadT020Binding(root);
  return {
    schema_version: 1, artifact_version: "t020-world-art-disclosure-presentation-v1-pending", status: "PENDING_PRESENTATION_NOT_AUTHORIZED", secret_free: true,
    plan_sha256: t020PlanSha256(plan), risk_disclosure_evidence_sha256: sha256T020(renderT020CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256,
    provider_schema_evidence_sha256: sha256T020(renderT020CanonicalJson(schema)), forensics_evidence_sha256: sha256T020(renderT020CanonicalJson(forensics)),
    core_plan_sha256: T020_CORE_PLAN_SHA256, master_style_sha256: T020_MASTER_STYLE_SHA256, t014_approval_sha256: T020_T014_APPROVAL_SHA256,
    implementation_binding_sha256: sha256T020(renderT020CanonicalJson(binding)), implementation_files: binding.files,
    exact_approval_phrase_required: T020_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T020_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T020_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true,
    scope: t020ApprovalScope(), authorized: false,
  } as const;
}

export type T020ControllerDisclosure = ReturnType<typeof buildT020ControllerDisclosure>;
export function buildT020ControllerDisclosure(root: string, plan: T020Plan, disclosedAt: string) {
  parseT020EvidenceTime(disclosedAt, "T020 disclosure");
  const pending = buildT020Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t020-world-art-controller-disclosure-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T020", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: disclosedAt, assistant_disclosure_text_sha256: sha256T020(T020_V1_RISK_TEXT), assistant_disclosure_was_presented_in_current_conversation: true, exact_scoped_approval_received_after_disclosure: false },
    bindings: { plan_sha256: pending.plan_sha256, pending_disclosure_packet_sha256: sha256T020(renderT020CanonicalJson(pending)), risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256, implementation_binding_sha256: pending.implementation_binding_sha256 },
    scope: t020ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT020ControllerDisclosure(value: unknown, root: string, plan: T020Plan): asserts value is T020ControllerDisclosure {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 controller disclosure is invalid");
  const at = (value as { event_sequence?: { assistant_disclosure_presented_at?: unknown } }).event_sequence?.assistant_disclosure_presented_at;
  if (typeof at !== "string") throw new Error("T020 disclosure timestamp missing");
  exactEvidence(value, buildT020ControllerDisclosure(root, plan, at), "T020 controller disclosure");
}

export type T020Presentation = ReturnType<typeof buildT020Presentation>;
export function buildT020Presentation(root: string, plan: T020Plan, balance: T020BalanceObservation | null) {
  const pending = buildT020Pending(root, plan);
  const controller = canonicalT020File<unknown>(root, T020_V1_CONTROLLER_DISCLOSURE_PATH);
  validateT020ControllerDisclosure(controller.value, root, plan);
  const disclosure = balance === null
    ? { balance_observation_present: false, covers_total_cap: null, balance_disclosure_incomplete: true } as const
    : { balance_observation_present: true, ...t020BalanceDisclosure(balance), balance_disclosure_incomplete: false } as const;
  return {
    schema_version: 1, evidence_version: "t020-world-art-disclosure-presentation-v1", secret_free: true,
    pending_packet_sha256: sha256T020(renderT020CanonicalJson(pending)), plan_sha256: pending.plan_sha256,
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256, risk_disclosure_text_ko: T020_V1_RISK_TEXT,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    core_plan_sha256: T020_CORE_PLAN_SHA256, master_style_sha256: T020_MASTER_STYLE_SHA256, t014_approval_sha256: T020_T014_APPROVAL_SHA256,
    controller_disclosure_attestation_sha256: controller.sha256, implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    disclosed_at: controller.value.event_sequence.assistant_disclosure_presented_at, source: "current user conversation",
    balance_disclosure: disclosure, scope: t020ApprovalScope(),
    exact_approval_phrase_required: T020_V1_EXACT_APPROVAL_PHRASE, recovery_operator_phrase: T020_V1_RECOVERY_OPERATOR_PHRASE,
    resume_operator_phrase: T020_V1_RESUME_OPERATOR_PHRASE, loss_acknowledgment_operator_phrase: T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
    operator_phrases_are_agent_satisfiable: true, prior_task_approval_inherited: false, committed_clean_runtime_binding_required: true, authorized: false,
  } as const;
}
function presentationBalance(value: unknown): T020BalanceObservation | null {
  const disclosure = (value as { balance_disclosure?: Record<string, unknown> } | null)?.balance_disclosure;
  if (!disclosure || typeof disclosure !== "object" || disclosure.balance_observation_present !== true) return null;
  const decimalValue = disclosure.observed_balance_decimal; const at = disclosure.provider_observed_at;
  if (typeof decimalValue !== "string" || !/^\d+\.\d{2}$/.test(decimalValue) || typeof at !== "string") throw new Error("T020 presentation balance is invalid");
  return { credits: Number(decimalValue), provider_observed_at: at };
}
export function validateT020Presentation(value: unknown, root: string, plan: T020Plan): asserts value is T020Presentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 presentation is invalid");
  exactEvidence(value, buildT020Presentation(root, plan, presentationBalance(value)), "T020 presentation");
}

export type T020ControllerApproval = ReturnType<typeof buildT020ControllerApproval>;
export function buildT020ControllerApproval(root: string, plan: T020Plan, presentation: T020Presentation, approvedAt: string, now = new Date()) {
  validateT020Presentation(presentation, root, plan);
  const disclosedMs = parseT020EvidenceTime(presentation.disclosed_at, "T020 disclosure");
  const approvedMs = parseT020EvidenceTime(approvedAt, "T020 approval");
  if (approvedMs <= disclosedMs || approvedMs - disclosedMs > 24 * 60 * 60 * 1000 || approvedMs > now.getTime()) throw new Error("T020 approval chronology is invalid");
  return {
    schema_version: 1, evidence_version: "t020-world-art-controller-approval-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION",
    goal_slug: "ship-fictor-track1-2026", task_key: "T020", issue_number: T020_ISSUE_NUMBER, issue_contract_sha256: T020_CONTRACT_SHA256,
    event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T020_V1_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: approvedAt, exact_scoped_approval_received_after_disclosure: true },
    bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T020(renderT020CanonicalJson(presentation)), risk_disclosure_evidence_sha256: presentation.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: presentation.risk_disclosure_text_sha256, provider_schema_evidence_sha256: presentation.provider_schema_evidence_sha256, forensics_evidence_sha256: presentation.forensics_evidence_sha256, implementation_binding_sha256: presentation.implementation_binding_sha256 },
    scope: t020ApprovalScope(), secret_free: true,
  } as const;
}
export function validateT020ControllerApproval(value: unknown, root: string, plan: T020Plan, presentation: T020Presentation, now = new Date()): asserts value is T020ControllerApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 controller approval is invalid");
  const at = (value as { event_sequence?: { exact_user_reply_received_at?: unknown } }).event_sequence?.exact_user_reply_received_at;
  if (typeof at !== "string") throw new Error("T020 approval timestamp missing");
  exactEvidence(value, buildT020ControllerApproval(root, plan, presentation, at, now), "T020 controller approval");
}

export type T020Approval = ReturnType<typeof buildT020Approval>;
export function buildT020Approval(root: string, plan: T020Plan, presentation: T020Presentation, now = new Date()) {
  validateT020Presentation(presentation, root, plan);
  const controller = canonicalT020File<unknown>(root, T020_V1_CONTROLLER_APPROVAL_PATH);
  validateT020ControllerApproval(controller.value, root, plan, presentation, now);
  const pending = buildT020Pending(root, plan);
  return {
    schema_version: 1, evidence_version: "t020-world-art-approval-v1", secret_free: true,
    decision: "APPROVE_T020_WORLD_ART_EXACTLY_54_ASSETS_81_00_CREDIT_CAP", source: "controller approval attestation",
    exact_user_quote: T020_V1_EXACT_APPROVAL_PHRASE, approved_at: controller.value.event_sequence.exact_user_reply_received_at, disclosed_at: presentation.disclosed_at,
    plan_sha256: pending.plan_sha256, disclosure_presentation_evidence_sha256: sha256T020(renderT020CanonicalJson(presentation)),
    risk_disclosure_evidence_sha256: pending.risk_disclosure_evidence_sha256, risk_disclosure_text_sha256: pending.risk_disclosure_text_sha256,
    provider_schema_evidence_sha256: pending.provider_schema_evidence_sha256, forensics_evidence_sha256: pending.forensics_evidence_sha256,
    controller_disclosure_attestation_sha256: presentation.controller_disclosure_attestation_sha256,
    controller_approval_attestation_path: T020_V1_CONTROLLER_APPROVAL_PATH, controller_approval_attestation_sha256: controller.sha256,
    implementation_binding_sha256: pending.implementation_binding_sha256, implementation_files: pending.implementation_files,
    core_plan_sha256: T020_CORE_PLAN_SHA256, master_style_sha256: T020_MASTER_STYLE_SHA256, t014_approval_sha256: T020_T014_APPROVAL_SHA256,
    balance_disclosure: presentation.balance_disclosure, scope: t020ApprovalScope(),
    prior_task_approval_inherited: false, acknowledges_prior_approvals_not_inherited: true, committed_clean_runtime_binding_required: true, automatic_paid_retry_count: 0,
  } as const;
}
export function validateT020Approval(value: unknown, root: string, plan: T020Plan, presentation: T020Presentation, now = new Date()): asserts value is T020Approval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("T020 approval is invalid");
  exactEvidence(value, buildT020Approval(root, plan, presentation, now), "T020 approval");
}

export function isT020Authorized(root: string, plan: T020Plan, now = new Date()): boolean {
  try {
    const presentation = canonicalT020File<unknown>(root, T020_V1_PRESENTATION_PATH);
    validateT020Presentation(presentation.value, root, plan);
    const controller = canonicalT020File<unknown>(root, T020_V1_CONTROLLER_APPROVAL_PATH);
    validateT020ControllerApproval(controller.value, root, plan, presentation.value, now);
    const approval = canonicalT020File<unknown>(root, T020_V1_APPROVAL_PATH);
    validateT020Approval(approval.value, root, plan, presentation.value, now);
    return true;
  } catch { return false; }
}
export function loadT020Authorization(root: string, plan: T020Plan, now = new Date()): { presentation: T020Presentation; approval: T020Approval } {
  const presentation = canonicalT020File<unknown>(root, T020_V1_PRESENTATION_PATH);
  validateT020Presentation(presentation.value, root, plan);
  const approval = canonicalT020File<unknown>(root, T020_V1_APPROVAL_PATH);
  validateT020Approval(approval.value, root, plan, presentation.value, now);
  return { presentation: presentation.value, approval: approval.value };
}
