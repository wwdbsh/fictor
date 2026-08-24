import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const T055_OBSERVED_PATH = "assets/evidence/t055-account-observed-v1.json" as const;
export const T055_AUDIT_PATH = "assets/manifests/t055-release-ai-rights-audit-v1.json" as const;
export const T055_T022_PATH = "assets/manifests/t022-m2-assets-audit-v1.json" as const;
export const T055_SELECTED_STYLE_PATH = "public/assets/style/master-candidate-01.png" as const;
export const T055_SELECTED_STYLE_SHA256 =
  "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3" as const;
export const T055_RELEASE_DIGEST =
  "a691621e04e44c1ee45d79722e83fbe1765c3f1e148b9740985fe60a6f81d632" as const;
export const T055_RELEASE_DIGEST_ENCODING =
  "UTF8:RELEASE_AI_PATH_SHA_V1\n + codepoint-sorted(public_path + TAB + sha256 + LF)" as const;

const EXPECTED_SOURCE_TASK_COUNTS = { T013: 52, T015: 332, T016: 157, T019: 6, T020: 54, T021: 20 } as const;
const EVIDENCE_ONLY_PATHS = [
  "public/assets/style/master-candidate-02.png",
  "public/assets/style/master-candidate-03.png",
  "public/assets/style/master-candidate-04.png",
] as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_VALUE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/,
  /[?&](?:access_token|auth_token|token|signature|sig|x-amz-signature)=[^&\s]{8,}/i,
  /\/@[A-Za-z0-9_][A-Za-z0-9_.-]{2,}\b/,
] as const;

const EXPECTED_SUBSTANTIVE_CLAIMS = [
  {
    claim_id: "ALL_622_SAME_ACCOUNT_HISTORICAL_BINDING",
    status: "UNRESOLVED",
    reason: "두 개의 알려진 job만 동일 로그인 계정 UI와 결속되었으며 이를 나머지 620개에 확대하지 않는다.",
  },
  {
    claim_id: "GENERATION_TIME_ACCOUNT_TERMS_REVISION_EFFECTIVE_INTERVAL",
    status: "UNRESOLVED",
    reason: "계정 UI에 2026-08-11~14 생성 당시 적용 Terms revision과 effective interval이 표시되지 않았다.",
  },
  {
    claim_id: "GENERATION_TIME_TERMS_ACCEPTANCE_OR_EARLY_CONSENT_TIMESTAMP",
    status: "UNRESOLVED",
    reason: "계정 UI에 약관 acceptance 또는 early-consent timestamp가 표시되지 않았다.",
  },
  {
    claim_id: "GENERATION_TIME_APPLICABLE_PRIVACY_REVISION",
    status: "UNRESOLVED",
    reason: "계정 UI에 생성 당시 계정에 적용된 Privacy revision이 표시되지 않았다.",
  },
  {
    claim_id: "REQUEST_TO_REPORTED_MODEL_OFFICIAL_RELATIONSHIP",
    status: "UNRESOLVED",
    reason: "요청 nano_banana_2와 provider 보고 nano_banana_flash의 공식 관계를 설명하는 과거 적용 증거가 없다.",
  },
  {
    claim_id: "UPSTREAM_SUPPLEMENTAL_POLICY_COVERAGE",
    status: "UNRESOLVED",
    reason: "생성 당시 상위 제공자 supplemental policy가 622개 출력에 적용된 범위를 입증하는 증거가 없다.",
  },
] as const;

const EXPECTED_LOCAL_SOURCES = [
  [T055_T022_PATH, "1456506d259c95f3e68d8383b9fafe2ed026ffa260b9f82fc65960d5395a429b"],
  ["assets/manifests/master-style-v1.json", "b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d"],
  ["assets/evidence/t011-style-actual-run-v2.json", "1b633074376cdb8d93dfa738a7a0c5c85d05c74b9b184c29fc94331018859058"],
  ["assets/evidence/t013-materials-actual-run-v1.json", "722937487ecf6d4248c1ce6aa0fdec44cd730b3ddfbc4ca3a008762d6812d610"],
  ["assets/evidence/t015-canonical-shard-1-forensics-v4.json", "3c01a0749cda3ffacb56e198446603a4910efc1a26051d0acd22481cac0d877f"],
  ["assets/evidence/t016-canonical-cards-final-forensic-v1.json", "8aaaec756fbe9179f2ee179ad3eac351cf37e115aa0fb1481285dd2e13391532"],
  ["assets/evidence/t019-heart-cards-v1-final-journal-forensic.json", "f363fb4ef9f8779db153491dd60f9d088c97b438867a5ed878a5de5e71e5ad92"],
  ["assets/evidence/t020-world-art-v1-final-journal-forensic.json", "2f017a34afb7aadef6d0bd2ff93e30bc02e7c916fb36066225e78ce6b6e51636"],
  ["assets/evidence/t020-world-art-v2-final-journal-forensic.json", "8cd7e479ce35658f2062cb77097077439b359b31cb09cc5c454ca3536a122236"],
  ["assets/evidence/t021-event-art-v1-final-journal-forensic.json", "a41ca419f107a1e37f7bed063add9609713d688b82bc40c3ab0d1bbd877a52b1"],
  ["scripts/assets/release-public-assets.ts", "481775a7db42677c098980e7fbd63afb5cca0da177550eab7c3777e6cdc3a814"],
] as const;

type JsonRecord = Record<string, unknown>;

export interface T055Summary {
  readonly result: "PASS_BLOCKED";
  readonly release_assets: 622;
  readonly structural_gaps: 0;
  readonly substantive_gaps: 6;
  readonly completion_eligible: false;
  readonly raw_evidence_stored: false;
}

function fail(code: string, detail?: string): never {
  throw new Error(`T055_${code}${detail ? `:${detail}` : ""}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code: string): JsonRecord {
  if (!isRecord(value)) fail(code);
  return value;
}

function exactKeys(value: JsonRecord, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, actual.join(","));
}

function exact(value: unknown, expected: unknown, code: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(code);
}

function readJson(root: string, path: string): { readonly bytes: Buffer; readonly value: JsonRecord } {
  const bytes = readFileSync(resolve(root, path));
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { fail("INVALID_JSON", path); }
  return { bytes, value: record(parsed, `INVALID_OBJECT:${path}`) };
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function codepointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function findObjects(value: unknown, predicate: (entry: JsonRecord) => boolean, found: JsonRecord[] = []): JsonRecord[] {
  if (Array.isArray(value)) for (const child of value) findObjects(child, predicate, found);
  else if (isRecord(value)) {
    if (predicate(value)) found.push(value);
    for (const child of Object.values(value)) findObjects(child, predicate, found);
  }
  return found;
}

function assertNoForbiddenKeys(value: unknown): void {
  const forbidden = /^(?:username|name|profile_path|email|account_id|cookie|token|signed_url|url|html|har|raw_dump|screenshot)$/i;
  if (Array.isArray(value)) for (const child of value) assertNoForbiddenKeys(child);
  else if (isRecord(value)) for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) fail("FORBIDDEN_FIELD", key);
    assertNoForbiddenKeys(child);
  }
}

function assertNoForbiddenValues(value: unknown): void {
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value))) fail("FORBIDDEN_VALUE");
  } else if (Array.isArray(value)) {
    for (const child of value) assertNoForbiddenValues(child);
  } else if (isRecord(value)) {
    for (const child of Object.values(value)) assertNoForbiddenValues(child);
  }
}

export function validateT055Observed(value: unknown, root: string): void {
  const observed = record(value, "OBSERVED_OBJECT");
  assertNoForbiddenKeys(observed);
  assertNoForbiddenValues(observed);
  exactKeys(observed, ["schema_version", "evidence_version", "task_key", "issue_number", "observed_at", "observed_local_date", "timezone", "secret_free", "raw_evidence_stored", "access", "account_ui", "known_job_bindings", "redaction"], "OBSERVED_SCHEMA");
  exact([observed.schema_version, observed.evidence_version, observed.task_key, observed.issue_number], [1, "t055-account-observed-v1", "T055", 105], "OBSERVED_IDENTITY");
  if (typeof observed.observed_at !== "string" || !/^2026-08-24T\d{2}:\d{2}:\d{2}Z$/.test(observed.observed_at)) fail("OBSERVED_TIME");
  exact([observed.observed_local_date, observed.timezone, observed.secret_free, observed.raw_evidence_stored], ["2026-08-24", "Asia/Seoul", true, false], "OBSERVED_BOUNDARY");

  const access = record(observed.access, "ACCESS_OBJECT");
  exactKeys(access, ["mode", "account_state_changes", "provider_calls", "paid_calls", "downloads", "external_transfers"], "ACCESS_SCHEMA");
  exact(access, { mode: "AUTHENTICATED_READ_ONLY_UI", account_state_changes: 0, provider_calls: 0, paid_calls: 0, downloads: 0, external_transfers: 0 }, "ACCESS_VALUES");

  const account = record(observed.account_ui, "ACCOUNT_OBJECT");
  exactKeys(account, ["visible_asset_count", "account_identifier_stored", "policy_history_visible", "current_session_used_as_historical_acceptance_evidence"], "ACCOUNT_SCHEMA");
  exact(account, { visible_asset_count: 685, account_identifier_stored: false, policy_history_visible: false, current_session_used_as_historical_acceptance_evidence: false }, "ACCOUNT_VALUES");

  if (!Array.isArray(observed.known_job_bindings) || observed.known_job_bindings.length !== 2) fail("KNOWN_BINDING_COUNT");
  const [t011, t016] = observed.known_job_bindings.map((entry) => record(entry, "KNOWN_BINDING_OBJECT"));
  exactKeys(t011, ["task_key", "job_id", "local_source_path", "local_asset_id", "local_requested_model", "local_provider_reported_model", "account_ui_model_text", "account_ui_created_text", "account_ui_time_zone", "status"], "T011_BINDING_SCHEMA");
  exact(t011, {
    task_key: "T011", job_id: "e0f36c95-2e1b-4e38-9931-7e10e562f209", local_source_path: "assets/evidence/t011-style-actual-run-v2.json", local_asset_id: "style/master-candidate-01", local_requested_model: "nano_banana_2", local_provider_reported_model: "nano_banana_flash", account_ui_model_text: "Nano Banana 2", account_ui_created_text: "August 11, 2026 at 7:17 PM", account_ui_time_zone: "NOT_DISPLAYED", status: "VERIFIED",
  }, "T011_BINDING_VALUES");
  exactKeys(t016, ["task_key", "job_id", "local_source_path", "local_asset_id", "local_provider_reported_model", "account_ui_list_date_text", "account_ui_detail_fields_stored", "status"], "T016_BINDING_SCHEMA");
  exact(t016, {
    task_key: "T016", job_id: "ccdeba78-06a5-4d3f-b3fa-8ab165353803", local_source_path: "assets/evidence/t016-canonical-cards-final-forensic-v1.json", local_asset_id: "forge__tool_01__tool_07", local_provider_reported_model: "nano_banana_flash", account_ui_list_date_text: "August 14, 2026", account_ui_detail_fields_stored: false, status: "VERIFIED",
  }, "T016_BINDING_VALUES");

  const t011Local = readJson(root, "assets/evidence/t011-style-actual-run-v2.json").value;
  const t011Jobs = findObjects(t011Local, (entry) => entry.job_id === t011.job_id);
  if (t011Jobs.length !== 1) fail("T011_LOCAL_JOB_BINDING");
  exact([t011Jobs[0].candidate_id, t011Jobs[0].requested_model, t011Jobs[0].provider_reported_model], [t011.local_asset_id, t011.local_requested_model, t011.local_provider_reported_model], "T011_LOCAL_JOB_VALUES");
  const t016Local = readJson(root, "assets/evidence/t016-canonical-cards-final-forensic-v1.json").value;
  const t016Jobs = findObjects(t016Local, (entry) => entry.job_id === t016.job_id);
  if (t016Jobs.length !== 1) fail("T016_LOCAL_JOB_BINDING");
  exact([t016Jobs[0].asset_id, t016Jobs[0].model], [t016.local_asset_id, t016.local_provider_reported_model], "T016_LOCAL_JOB_VALUES");

  const redaction = record(observed.redaction, "REDACTION_OBJECT");
  exactKeys(redaction, ["allowlist_only", "excluded", "raw_capture_retained", "review_result"], "REDACTION_SCHEMA");
  exact(redaction, {
    allowlist_only: true,
    excluded: ["username", "display name", "profile path", "email", "account identifier", "cookie", "token", "signed download address", "screenshot", "HTML", "HAR", "raw dump"],
    raw_capture_retained: false,
    review_result: "SECRET_FREE_ALLOWLIST_ONLY",
  }, "REDACTION_VALUES");
}

function releaseRows(root: string): { rows: Array<[string, string]>; sourceTaskCounts: Record<string, number> } {
  const t022 = readJson(root, T055_T022_PATH).value;
  const scope = record(t022.scope, "T022_SCOPE");
  const assets = record(t022.assets, "T022_ASSETS");
  if (scope.audited_asset_count !== 621 || !Array.isArray(assets.records) || assets.records.length !== 621) fail("T022_COUNT");
  if (assets.list_sha256 !== "0f2eb33d2fbe0139a1d26e8b088822d6a4ec49c3a290fe0d863e1105e967127e") fail("T022_LIST_DIGEST");
  const rows: Array<[string, string]> = [];
  const sourceTaskCounts: Record<string, number> = {};
  for (const [index, item] of assets.records.entries()) {
    const row = record(item, `T022_ROW:${index}`);
    if (typeof row.public_path !== "string" || !row.public_path.startsWith("public/assets/") || !row.public_path.endsWith(".png")) fail("T022_PATH", String(index));
    if (typeof row.sha256 !== "string" || !SHA256_PATTERN.test(row.sha256)) fail("T022_SHA", String(index));
    if (typeof row.source_task !== "string") fail("T022_SOURCE_TASK", String(index));
    rows.push([row.public_path, row.sha256]);
    sourceTaskCounts[row.source_task] = (sourceTaskCounts[row.source_task] ?? 0) + 1;
  }
  rows.push([T055_SELECTED_STYLE_PATH, T055_SELECTED_STYLE_SHA256]);
  return { rows, sourceTaskCounts };
}

function verifyReleaseDigest(root: string): void {
  const { rows, sourceTaskCounts } = releaseRows(root);
  if (rows.length !== 622 || new Set(rows.map(([path]) => path)).size !== 622) fail("RELEASE_PATH_COVERAGE");
  if (new Set(rows.map((row) => row.join("\t"))).size !== 622) fail("RELEASE_ROW_COVERAGE");
  for (const path of EVIDENCE_ONLY_PATHS) if (rows.some(([releasePath]) => releasePath === path)) fail("NON_SELECTED_RELEASE", path);
  exact(sourceTaskCounts, EXPECTED_SOURCE_TASK_COUNTS, "SOURCE_TASK_COUNTS");
  const encoded = `RELEASE_AI_PATH_SHA_V1\n${rows.sort(([left], [right]) => codepointCompare(left, right)).map(([path, hash]) => `${path}\t${hash}`).join("\n")}\n`;
  if (sha256(encoded) !== T055_RELEASE_DIGEST) fail("RELEASE_DIGEST");
  if (sha256(readFileSync(resolve(root, T055_SELECTED_STYLE_PATH))) !== T055_SELECTED_STYLE_SHA256) fail("SELECTED_STYLE_BYTES");
}

function verifyLocalSources(root: string, sourceRegister: unknown): void {
  if (!Array.isArray(sourceRegister) || sourceRegister.length !== EXPECTED_LOCAL_SOURCES.length) fail("SOURCE_REGISTER_COUNT");
  const expected = EXPECTED_LOCAL_SOURCES.map(([path, hash]) => ({ path, sha256: hash, kind: path === T055_T022_PATH ? "RELEASE_INVENTORY" : path === "scripts/assets/release-public-assets.ts" ? "RELEASE_ALLOWLIST_IMPLEMENTATION" : "LOCAL_PROVENANCE" }));
  exact(sourceRegister, expected, "SOURCE_REGISTER_VALUES");
  for (const [path, hash] of EXPECTED_LOCAL_SOURCES) if (sha256(readFileSync(resolve(root, path))) !== hash) fail("SOURCE_HASH", path);
}

export function validateT055Audit(value: unknown, observedBytes: Uint8Array, root: string): T055Summary {
  const audit = record(value, "AUDIT_OBJECT");
  assertNoForbiddenKeys(audit);
  assertNoForbiddenValues(audit);
  exactKeys(audit, ["schema_version", "audit_version", "task_key", "issue_number", "contract_sha256", "recorded_at", "secret_free", "raw_evidence_stored", "observed_evidence", "source_register", "release_inventory", "coverage", "substantive_claims", "decision"], "AUDIT_SCHEMA");
  exact([audit.schema_version, audit.audit_version, audit.task_key, audit.issue_number, audit.contract_sha256], [1, "t055-release-ai-rights-audit-v1", "T055", 105, "c5cd05800a5fffd715aa7fc693c1e597de5e1b5672024680bff4ea0ca24f0db0"], "AUDIT_IDENTITY");
  exact([audit.recorded_at, audit.secret_free, audit.raw_evidence_stored], ["2026-08-24T02:37:04Z", true, false], "AUDIT_BOUNDARY");
  exact(audit.observed_evidence, { path: T055_OBSERVED_PATH, sha256: sha256(observedBytes) }, "OBSERVED_BINDING");
  verifyLocalSources(root, audit.source_register);

  const inventory = record(audit.release_inventory, "INVENTORY_OBJECT");
  exactKeys(inventory, ["t022_assets", "selected_style_assets", "production_assets", "evidence_only_candidates", "source_task_counts", "digest_encoding", "digest_sha256", "full_rows_replicated"], "INVENTORY_SCHEMA");
  exact(inventory, {
    t022_assets: 621,
    selected_style_assets: 1,
    production_assets: 622,
    evidence_only_candidates: [
      { path: EVIDENCE_ONLY_PATHS[0], production_count: 0 },
      { path: EVIDENCE_ONLY_PATHS[1], production_count: 0 },
      { path: EVIDENCE_ONLY_PATHS[2], production_count: 0 },
    ],
    source_task_counts: EXPECTED_SOURCE_TASK_COUNTS,
    digest_encoding: T055_RELEASE_DIGEST_ENCODING,
    digest_sha256: T055_RELEASE_DIGEST,
    full_rows_replicated: false,
  }, "INVENTORY_VALUES");
  verifyReleaseDigest(root);

  const coverage = record(audit.coverage, "COVERAGE_OBJECT");
  exactKeys(coverage, ["structural", "substantive"], "COVERAGE_SCHEMA");
  exact(coverage.structural, { status: "VERIFIED", release_assets: 622, path_sha_rows: 622, duplicate_paths: 0, duplicate_rows: 0, gaps: 0 }, "STRUCTURAL_COVERAGE");
  exact(coverage.substantive, { status: "UNRESOLVED", claims: 6, verified: 0, unresolved: 6, not_applicable: 0, gaps: 6 }, "SUBSTANTIVE_COVERAGE");

  if (!Array.isArray(audit.substantive_claims) || audit.substantive_claims.length !== EXPECTED_SUBSTANTIVE_CLAIMS.length) fail("CLAIM_COUNT");
  audit.substantive_claims.forEach((item, index) => {
    const claim = record(item, `CLAIM:${index}`);
    exactKeys(claim, ["claim_id", "status", "reason"], "CLAIM_SCHEMA");
  });
  exact(audit.substantive_claims, EXPECTED_SUBSTANTIVE_CLAIMS, "CLAIM_VALUES");

  exact(audit.decision, {
    completion_eligible: false,
    t055: "BLOCKED",
    b_01: "BLOCKED",
    t047: "BLOCKED",
    generation_or_paid_call_performed: false,
    exclusion_or_replacement_started: false,
    next_authorized_step: "OBTAIN_GENERATION_TIME_ACCOUNT_AND_PROVIDER_POLICY_EVIDENCE_OR_APPROVE_A_SEPARATE_GOAL_AMENDMENT",
  }, "DECISION");
  return { result: "PASS_BLOCKED", release_assets: 622, structural_gaps: 0, substantive_gaps: 6, completion_eligible: false, raw_evidence_stored: false };
}

export function checkT055(root = process.cwd()): T055Summary {
  const observed = readJson(root, T055_OBSERVED_PATH);
  validateT055Observed(observed.value, root);
  const audit = readJson(root, T055_AUDIT_PATH);
  return validateT055Audit(audit.value, observed.bytes, root);
}

export function assertT055Complete(root = process.cwd()): never {
  const summary = checkT055(root);
  fail("NOT_COMPLETE", String(summary.substantive_gaps));
}
