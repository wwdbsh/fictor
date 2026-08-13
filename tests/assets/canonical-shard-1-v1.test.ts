import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import {
  T015_EXACT_APPROVAL_PHRASE,
  T015_CONTROLLER_APPROVAL_ATTESTATION_PATH,
  T015_ID_LIST_SHA256,
  T015_PLAN_PATH,
  T015_RECOVERY_OPERATOR_PHRASE,
  T015_RUNTIME_FILE_PATHS,
  buildT015ApprovalEvidence,
  buildT015CanonicalShardPlan,
  buildT015DisclosurePresentationEvidence,
  buildT015ProviderSchemaEvidence,
  buildT015RiskDisclosure,
  canonicalJsonT015 as canonicalJson,
  isT015Authorized,
  loadT015ControllerAttestation,
  loadT015ImplementationBinding,
  renderT015CanonicalJson,
  renderT015Plan,
  sha256T015,
  validateT015CanonicalShardPlan,
  type T015ApprovalEvidence,
  type T015CanonicalShardPlan,
  type T015DisclosurePresentationEvidence,
} from "../../scripts/assets/canonical-shard-1-v1";
import {
  T015_JOURNAL_PATH,
  buildInitialT015Journal,
  buildT015ActualEvidence,
  checkExcludedT015CanonicalPaths,
  isPublicT015ResolvedAddress,
  runT015JobsHandoffInternal,
  runT015OpsInternal,
  validateT015Journal,
  writeT015NoClobberJsonForTest,
  type T015DownloadDependencies,
  type T015OperationsJournal,
} from "../../scripts/assets/canonical-shard-1-v1-ops-cli";
import {
  T015_V1_JOURNAL_PATH,
  T015_V2_APPROVAL_PATH,
  T015_V2_EXACT_APPROVAL_PHRASE,
  T015_V2_PLAN_PATH,
  buildT015V1ForensicMigrationEvidence,
  buildT015V2CanonicalShardPlan,
  buildT015V2DisclosurePacket,
  buildT015V2ProviderSchemaEvidence,
  buildT015V2RiskDisclosure,
  isT015V2Authorized,
  renderT015V2Plan,
} from "../../scripts/assets/canonical-shard-1-v1-continuation-v2";
import {
  T015_V2_JOURNAL_PATH,
  runT015V2JobsHandoffInternal,
  runT015V2RecoveryOpsInternal,
  validateT015V2Journal,
  type T015V2DownloadDependencies,
  type T015V2LegacySourcePins,
  type T015V2OperationsJournal,
} from "../../scripts/assets/canonical-shard-1-v1-continuation-v2-ops-cli";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const typeBytes = Buffer.from(type); const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); typeBytes.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length); return result; }
function png(fill = 0): Buffer { const header = Buffer.alloc(13); header.writeUInt32BE(3, 0); header.writeUInt32BE(4, 4); header[8] = 8; header[9] = 2; const pixels = Buffer.alloc(4 * 10, fill); return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]); }
function json(root: string, name: string, value: unknown): string { const path = resolve(root, name); writeFileSync(path, `${JSON.stringify(value)}\n`); return path; }
function jobsSummary(statuses: readonly string[]) { const active = ["pending", "waiting", "queued", "in_progress", "ip_detect"]; const failed = ["failed", "canceled", "nsfw", "ip_detected"]; return { active: statuses.filter((status) => active.includes(status)).length, completed: statuses.filter((status) => status === "completed").length, errors: statuses.filter((status) => status === "lookup_failed").length, failed: statuses.filter((status) => failed.includes(status)).length, total: statuses.length }; }

let authorizationRoot: string | undefined;
const T015_FIXTURE_SOURCES = ["assets/manifests/core-v1.plan.json", "assets/manifests/master-style-v1.json", "assets/manifests/material-style-approval-v1.json", "assets/manifests/t015-implementation-binding-v1.json", "assets/evidence/t015-controller-disclosure-attestation-v1.json", ...Object.values(T015_RUNTIME_FILE_PATHS)];
function copyFixtureSources(root: string): void { for (const path of T015_FIXTURE_SOURCES) { mkdirSync(resolve(root, path, ".."), { recursive: true }); copyFileSync(resolve(repositoryRoot, path), resolve(root, path)); } }
function fixture(): { plan: T015CanonicalShardPlan; presentation: T015DisclosurePresentationEvidence; approval: T015ApprovalEvidence } {
  if (!authorizationRoot) {
    authorizationRoot = mkdtempSync(resolve(tmpdir(), "fictor-t015-authorization-"));
    copyFixtureSources(authorizationRoot);
  }
  const plan = buildT015CanonicalShardPlan(authorizationRoot); const risk = buildT015RiskDisclosure(); const schema = buildT015ProviderSchemaEvidence();
  const presentation = buildT015DisclosurePresentationEvidence(authorizationRoot, plan, risk, schema);
  const approvalAttestation = { schema_version: 1, evidence_version: "t015-controller-approval-attestation-v1", attester: "USER_CREATED_CONTROL_PLANE_MAIN_SESSION", goal_slug: "ship-fictor-track1-2026", task_key: "T015", issue_number: 17, issue_contract_sha256: plan.issue_contract_sha256, event_sequence: { assistant_disclosure_presented_at: presentation.disclosed_at, exact_user_reply_ko: T015_EXACT_APPROVAL_PHRASE, exact_user_reply_received_at: "2026-08-12T03:02:00.000Z", exact_scoped_approval_received_after_disclosure: true }, bindings: { plan_sha256: presentation.plan_sha256, disclosure_presentation_evidence_sha256: sha256T015(renderT015CanonicalJson(presentation)), risk_disclosure_evidence_sha256: sha256T015(renderT015CanonicalJson(risk)), risk_disclosure_text_sha256: risk.disclosure_text_sha256, provider_schema_evidence_sha256: sha256T015(renderT015CanonicalJson(schema)), implementation_binding_sha256: plan.sources.implementation_binding.sha256 }, scope: { category: "CANONICAL", slice: "0..331", asset_count: 332, initial_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00", t016_or_other_assets_allowed: false }, secret_free: true };
  mkdirSync(resolve(authorizationRoot, T015_CONTROLLER_APPROVAL_ATTESTATION_PATH, ".."), { recursive: true }); writeFileSync(resolve(authorizationRoot, T015_CONTROLLER_APPROVAL_ATTESTATION_PATH), renderT015CanonicalJson(approvalAttestation));
  const approval = buildT015ApprovalEvidence(authorizationRoot, plan, risk, schema, presentation, new Date("2026-08-12T03:03:00.000Z"));
  return { plan, presentation, approval };
}

function prepareFirst(root: string, fixtureValue = fixture()) {
  const { plan, presentation, approval } = fixtureValue; const batch = plan.batches[0];
  runT015OpsInternal(["init"], root, plan, presentation, approval);
  const preflight = runT015OpsInternal(["preflight-request", "--batch", batch.id, "--observed-at", "2026-08-12T03:03:00.000Z"], root, plan, presentation, approval) as { requests: unknown[] };
  const cost = json(root, "cost.json", { costs: batch.asset_ids.map((id, itemIndex) => ({ index: plan.assets.find((asset) => asset.id === id)!.index, request_sha256: sha256T015(canonicalJson(preflight.requests[itemIndex])), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: `2026-08-12T03:03:${String(itemIndex + 1).padStart(2, "0")}.000Z` })) }); const balance = json(root, "balance.json", { credits: 861.9, provider_observed_at: "2026-08-12T03:03:13.000Z" });
  runT015OpsInternal(["preflight-result", "--batch", batch.id, "--cost-file", cost, "--balance-file", balance], root, plan, presentation, approval);
  const envelope = runT015OpsInternal(["prepare", "--batch", batch.id, "--observed-at", "2026-08-12T03:06:00.000Z"], root, plan, presentation, approval);
  return { ...fixtureValue, batch, envelope };
}

function submitFirst(root: string, fixtureValue = fixture()) {
  const prepared = prepareFirst(root, fixtureValue); const jobs = prepared.batch.asset_ids.map((id) => { const asset = prepared.plan.assets.find((item) => item.id === id)!; return { index: asset.index, job_id: `job-${asset.index}`, status: "queued" }; });
  const response = json(root, "response.json", { submitted_count: jobs.length, failed_count: 0, jobs });
  runT015OpsInternal(["response", "--batch", prepared.batch.id, "--file", response, "--observed-at", "2026-08-12T03:07:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval);
  runT015OpsInternal(["recovery-open", "--batch", prepared.batch.id, "--operator-phrase", T015_RECOVERY_OPERATOR_PHRASE, "--observed-at", "2026-08-12T03:08:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval);
  return { ...prepared, jobs };
}

const T015_V1_FORENSIC_FILES = [
  "assets/manifests/canonical-shard-1-v1.plan.json",
  "assets/manifests/t015-implementation-binding-v1.json",
  "assets/evidence/t015-canonical-shard-1-risk-disclosure-v1.json",
  "assets/evidence/t015-higgsfield-schema-v1.json",
  "assets/evidence/t015-canonical-shard-1-disclosure-presentation-v1.json",
  "assets/evidence/t015-forensic-approval-v1.json",
  "assets/evidence/t015-controller-disclosure-attestation-v1.json",
  "assets/evidence/t015-forensic-controller-approval-attestation-v1.json",
] as const;

function v2RecoveryFixture(): { root: string; plan: ReturnType<typeof buildT015V2CanonicalShardPlan>; pins: T015V2LegacySourcePins; jobs: Array<{ index: number; job_id: string; status: "queued" }> } {
  const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-v2-recovery-"));
  for (const path of T015_V1_FORENSIC_FILES) { mkdirSync(resolve(root, path, ".."), { recursive: true }); copyFileSync(resolve(repositoryRoot, path), resolve(root, path)); }
  const legacyFixture = fixture(); const legacy = buildInitialT015Journal(legacyFixture.plan, legacyFixture.presentation, legacyFixture.approval); const record = legacy.batches[0]; const jobs = legacyFixture.plan.batches[0].asset_ids.map((assetId) => { const asset = legacyFixture.plan.assets.find(({ id }) => id === assetId)!; return { index: asset.index, job_id: `v2-job-${asset.index}`, status: "queued" as const }; });
  record.state = "RECOVERY_ONLY"; record.submission = { observed_at: "2026-08-12T07:27:00.000Z", expected_count: 12, submitted_count: 12, failed_count: 0, complete: true, missing_asset_ids: [], jobs: jobs.map((job) => { const asset = legacyFixture.plan.assets[job.index]; return { ...job, asset_id: asset.id, canonical_request_sha256: asset.canonical_request_sha256 }; }) }; record.recovery_gate = { opened_at: "2026-08-12T07:28:00.000Z", exact_operator_phrase_sha256: sha256T015(T015_RECOVERY_OPERATOR_PHRASE), no_new_paid_submit: true }; record.job_polls = [{ observed_at: "2026-08-12T07:29:00.000Z", all_terminal: true, timed_out: false, aborted: false, jobs: record.submission.jobs.map((job) => ({ index: job.index, job_id: job.job_id, status: "completed", model: "nano_banana_flash", download_available: true, lookup_retryable: null, provider_failure_detail_present: false })) }]; record.recovery_failures = [{ code: "PROVIDER_RESPONSE_SIGNAL", observed_at: "2026-08-12T07:29:00.000Z", facts: { stage: "JOBS_WAIT", definite_job_ids_preserved: true }, original_terminal_code: null, recovery_only_preserved: true, automatic_paid_retry: false, paid_retry_count: 0, no_resubmit: true }]; record.transitions = [{ state: "SUBMITTED", observed_at: "2026-08-12T07:27:00.000Z" }, { state: "RECOVERY_ONLY", observed_at: "2026-08-12T07:28:00.000Z" }]; legacy.run_state = "FAIL_STOP";
  const bytes = renderT015CanonicalJson(legacy); mkdirSync(resolve(root, T015_V1_JOURNAL_PATH, ".."), { recursive: true }); writeFileSync(resolve(root, T015_V1_JOURNAL_PATH), bytes); const pins = { journal_sha256: sha256T015(bytes), exact_job_id_list_sha256: sha256T015(`${jobs.map(({ job_id }) => job_id).join("\n")}\n`) };
  return { root, plan: buildT015V2CanonicalShardPlan(repositoryRoot), pins, jobs };
}

describe("T015 CANONICAL shard 1 preparation", () => {
  test("pins the deterministic 332-card selection, boundaries, batches, requests, and budget", () => {
    const plan = buildT015CanonicalShardPlan(repositoryRoot); validateT015CanonicalShardPlan(plan, repositoryRoot);
    expect(plan.assets).toHaveLength(332); expect(new Set(plan.assets.map(({ id }) => id))).toHaveLength(332);
    expect(plan.assets[0].id).toBe("forge__burn_01__burn_02"); expect(plan.assets[331].id).toBe("forge__join_02__wash_01"); expect(plan.assets.some(({ id }) => id === "forge__join_02__wash_02")).toBe(false);
    expect(sha256T015(`${plan.assets.map(({ id }) => id).join("\n")}\n`)).toBe(T015_ID_LIST_SHA256);
    expect(plan.batches.map(({ size }) => size)).toEqual([...Array(27).fill(12), 8]); expect(plan.budget.initial_credit_cap_decimal).toBe("498.00");
    expect(plan.assets.every(({ request }) => request.params.model === "nano_banana_2" && request.params.use_unlim === false && request.params.count === 1 && request.params.medias[0].role === "image")).toBe(true);
    expect(readFileSync(resolve(repositoryRoot, T015_PLAN_PATH), "utf8")).toBe(renderT015Plan(plan));
  });

  test("builds deterministically from only pinned sources in a clean temporary checkout root", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-clean-"));
    copyFixtureSources(root);
    expect(renderT015Plan(buildT015CanonicalShardPlan(root))).toBe(renderT015Plan(buildT015CanonicalShardPlan(repositoryRoot)));
  });

  test("records all unresolved risk and provider observations without inventing an exact observation timestamp", () => {
    const text = buildT015RiskDisclosure().disclosure_text_ko; for (const term of ["Terms/Privacy", "Google supplemental", "학습", "opt-out", "reference", "공개", "498.00", "모호", "부분", "nano_banana_flash", "signed URL", "1.2GB", "T016", "hearts", "world"]) expect(text).toContain(term);
    const schema = buildT015ProviderSchemaEvidence(); expect(schema.observation_window_utc).toBe("2026-08-12 around 02:38Z"); expect(schema.batch.observed_contract_max_requests).toBe(12); expect(schema.account.observed_balance_decimal).toBe("861.90");
  });

  test("requires the root-created post-disclosure approval attestation and binds every approval input", () => {
    const { plan, presentation, approval } = fixture(); expect(approval.plan_sha256).toBe(presentation.plan_sha256); expect(approval.provider_schema_evidence_sha256).toBe(presentation.provider_schema_evidence_sha256); expect(approval.t014_approval_sha256).toBe(presentation.t014_approval_sha256);
    expect(approval.controller_approval_attestation_path).toBe(T015_CONTROLLER_APPROVAL_ATTESTATION_PATH); expect(approval.controller_approval_attestation_sha256).toMatch(/^[a-f0-9]{64}$/);
    const absentRoot = mkdtempSync(resolve(tmpdir(), "fictor-t015-absent-approval-")); copyFixtureSources(absentRoot); const absentPlan = buildT015CanonicalShardPlan(absentRoot); expect(() => buildT015ApprovalEvidence(absentRoot, absentPlan, buildT015RiskDisclosure(), buildT015ProviderSchemaEvidence(), buildT015DisclosurePresentationEvidence(absentRoot, absentPlan, buildT015RiskDisclosure(), buildT015ProviderSchemaEvidence()), new Date("2026-08-12T03:03:00.000Z"))).toThrow(); expect(isT015Authorized(absentRoot, absentPlan)).toBe(false);
    const falseRoot = mkdtempSync(resolve(tmpdir(), "fictor-t015-false-approval-")); copyFixtureSources(falseRoot); const falsePlan = buildT015CanonicalShardPlan(falseRoot); const risk = buildT015RiskDisclosure(); const schema = buildT015ProviderSchemaEvidence(); const falsePresentation = buildT015DisclosurePresentationEvidence(falseRoot, falsePlan, risk, schema);
    const falseAttestation = JSON.parse(readFileSync(resolve(authorizationRoot!, T015_CONTROLLER_APPROVAL_ATTESTATION_PATH), "utf8")); falseAttestation.event_sequence.exact_scoped_approval_received_after_disclosure = false; mkdirSync(resolve(falseRoot, T015_CONTROLLER_APPROVAL_ATTESTATION_PATH, ".."), { recursive: true }); writeFileSync(resolve(falseRoot, T015_CONTROLLER_APPROVAL_ATTESTATION_PATH), renderT015CanonicalJson(falseAttestation));
    expect(() => buildT015ApprovalEvidence(falseRoot, falsePlan, risk, schema, falsePresentation, new Date("2026-08-12T03:03:00.000Z"))).toThrow("not affirmative");
  });

  test("uses only the pinned controller disclosure event and implementation bytes", () => {
    const { plan, presentation, approval } = fixture();
    const attestation = loadT015ControllerAttestation(repositoryRoot); const implementation = loadT015ImplementationBinding(repositoryRoot);
    expect(attestation.event_sequence.assistant_disclosure_presented_at).toBe("2026-08-12T03:01:17.021Z");
    expect(attestation.event_sequence.exact_scoped_approval_received_after_disclosure).toBe(false);
    expect(presentation.disclosed_at).toBe(attestation.event_sequence.assistant_disclosure_presented_at);
    expect(presentation.controller_attestation_sha256).toBe("21922b6a484287fafea50161e31f29303c0b375f4a61d21970c744f599b570ae");
    expect(approval.implementation_binding_sha256).toBe(plan.sources.implementation_binding.sha256);
    expect(implementation.files.ops.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(implementation.files)).toEqual(["controller", "plan_builder", "ops", "cli", "filesystem", "filesystem_types", "schema_contracts", "package_json", "package_lock"]); expect(JSON.stringify(implementation)).not.toContain("style-candidates");
  });

  test("requires one exact cost result for every request", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-costs-")); const { plan, presentation, approval } = fixture(); const batch = plan.batches[0];
    runT015OpsInternal(["init"], root, plan, presentation, approval);
    const preflight = runT015OpsInternal(["preflight-request", "--batch", batch.id, "--observed-at", "2026-08-12T03:03:00.000Z"], root, plan, presentation, approval) as { requests: unknown[] };
    const cost = json(root, "cost.json", { costs: batch.asset_ids.slice(0, 11).map((id, itemIndex) => ({ index: plan.assets.find((asset) => asset.id === id)!.index, request_sha256: sha256T015(canonicalJson(preflight.requests[itemIndex])), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: `2026-08-12T03:03:${String(itemIndex + 1).padStart(2, "0")}.000Z` })) });
    const balance = json(root, "balance.json", { credits: 861.9, provider_observed_at: "2026-08-12T03:03:13.000Z" });
    expect(() => runT015OpsInternal(["preflight-result", "--batch", batch.id, "--cost-file", cost, "--balance-file", balance], root, plan, presentation, approval)).toThrow("PRICE_CHANGED");
  });

  test("rejects duplicate per-request provider timestamps before paid prepare", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-cost-time-")); const { plan, presentation, approval } = fixture(); const batch = plan.batches[0]; runT015OpsInternal(["init"], root, plan, presentation, approval);
    const preflight = runT015OpsInternal(["preflight-request", "--batch", batch.id, "--observed-at", "2026-08-12T03:03:00.000Z"], root, plan, presentation, approval) as { requests: unknown[] };
    const cost = json(root, "cost.json", { costs: batch.asset_ids.map((id, itemIndex) => ({ index: plan.assets.find((asset) => asset.id === id)!.index, request_sha256: sha256T015(canonicalJson(preflight.requests[itemIndex])), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: "2026-08-12T03:03:01.000Z" })) }); const balance = json(root, "balance.json", { credits: 861.9, provider_observed_at: "2026-08-12T03:03:13.000Z" });
    expect(() => runT015OpsInternal(["preflight-result", "--batch", batch.id, "--cost-file", cost, "--balance-file", balance], root, plan, presentation, approval)).toThrow("PRICE_CHANGED");
  });

  test.each(["display tamper", "unknown field"] as const)("rejects get_cost %s while billing remains bound to credits_exact", (mode) => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-cost-shape-")); const { plan, presentation, approval } = fixture(); const batch = plan.batches[0]; runT015OpsInternal(["init"], root, plan, presentation, approval); const preflight = runT015OpsInternal(["preflight-request", "--batch", batch.id, "--observed-at", "2026-08-12T03:03:00.000Z"], root, plan, presentation, approval) as { requests: unknown[] };
    const costs = batch.asset_ids.map((id, itemIndex) => ({ index: plan.assets.find((asset) => asset.id === id)!.index, request_sha256: sha256T015(canonicalJson(preflight.requests[itemIndex])), cost: { credits: itemIndex === 0 && mode === "display tamper" ? 1.5 : 1, credits_exact: 1.5, ...(itemIndex === 0 && mode === "unknown field" ? { currency: "credits" } : {}) }, provider_observed_at: `2026-08-12T03:03:${String(itemIndex + 1).padStart(2, "0")}.000Z` })); const cost = json(root, "cost.json", { costs }); const balance = json(root, "balance.json", { credits: 861.9, provider_observed_at: "2026-08-12T03:03:13.000Z" });
    expect(() => runT015OpsInternal(["preflight-result", "--batch", batch.id, "--cost-file", cost, "--balance-file", balance], root, plan, presentation, approval)).toThrow(mode === "display tamper" ? "PRICE_CHANGED" : "UNKNOWN_PROVIDER_FIELD");
  });

  test("authorization fails closed without creating a journal in an isolated root lacking approval artifacts", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-no-approval-init-")); copyFixtureSources(root); const plan = buildT015CanonicalShardPlan(root); expect(isT015Authorized(root, plan)).toBe(false); expect(() => readFileSync(resolve(root, T015_JOURNAL_PATH))).toThrow();
  });

  test("makes SUBMITTING durable, emits one exact batch envelope, and never offers a retry", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-")); const prepared = prepareFirst(root); expect((prepared.envelope.requests as unknown[]).length).toBe(12);
    const journal = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal; expect(journal.batches[0].state).toBe("SUBMITTING"); expect(journal.paid_retry_count).toBe(0); expect(journal.batches[0].preflight?.costs?.every((cost) => cost.credits === 1 && cost.credits_decimal === "1.00" && cost.credits_exact === 1.5 && cost.credits_exact_decimal === "1.50")).toBe(true); expect(journal.batches[0].preflight?.costs).toHaveLength(12);
    expect(() => runT015OpsInternal(["prepare", "--batch", prepared.batch.id, "--observed-at", "2026-08-12T03:06:01.000Z"], root, prepared.plan, prepared.presentation, prepared.approval)).toThrow();
    expect(() => runT015OpsInternal(["ambiguous", "--batch", prepared.batch.id, "--reason", "TIMEOUT", "--observed-at", "2026-08-12T03:07:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval)).toThrow("no paid retry");
    const stopped = readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8"); expect(stopped).not.toMatch(/https?:\/\//); expect(JSON.parse(stopped).run_state).toBe("FAIL_STOP");
  });

  test("persists definite job IDs but fail-stops partial and optional-signal responses", () => {
    for (const mode of ["partial", "signal"] as const) {
      const root = mkdtempSync(resolve(tmpdir(), `fictor-t015-${mode}-`)); const prepared = prepareFirst(root); const assets = prepared.plan.assets.slice(0, mode === "partial" ? 11 : 12);
      const jobs = assets.map((asset) => ({ index: asset.index, job_id: `job-${asset.index}`, status: "queued", ...(mode === "signal" && asset.index === 0 ? { warning: "opaque" } : {}) })); const response = json(root, "response.json", { submitted_count: jobs.length, failed_count: 0, jobs });
      expect(() => runT015OpsInternal(["response", "--batch", prepared.batch.id, "--file", response, "--observed-at", "2026-08-12T03:07:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval)).toThrow("fail-stop");
      const journal = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal; expect(journal.paid_retry_count).toBe(0); if (mode === "signal") expect(journal.batches[0].submission?.jobs).toHaveLength(12);
    }
  });

  test("allows recovery-only polling of definite partial-submit jobs but can never complete the batch", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-partial-recovery-")); const prepared = prepareFirst(root); const definiteAssets = prepared.plan.assets.slice(0, 3);
    const jobs = definiteAssets.map((asset) => ({ index: asset.index, job_id: `partial-${asset.index}`, status: "queued" }));
    const responsePath = json(root, "partial.json", { submitted_count: 3, failed_count: 9, jobs });
    expect(() => runT015OpsInternal(["response", "--batch", prepared.batch.id, "--file", responsePath, "--observed-at", "2026-08-12T03:07:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval)).toThrow("PARTIAL_OR_MISMATCHED");
    const opened = runT015OpsInternal(["recovery-open", "--batch", prepared.batch.id, "--operator-phrase", T015_RECOVERY_OPERATOR_PHRASE, "--observed-at", "2026-08-12T03:08:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval);
    expect(opened.jobs).toBe(3); expect(opened.new_paid_submit).toBe(false);
    const bytes = png(); const wait = { all_terminal: true, jobs: jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(3).fill("completed")) };
    const deps: T015DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async ({ pinned }) => ({ status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: pinned.address }) };
    const result = await runT015JobsHandoffInternal(["jobs-handoff", "--batch", prepared.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(wait), root, prepared.plan, prepared.presentation, prepared.approval, deps);
    expect(result.state).toBe("RECOVERING");
    const journal = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal;
    expect(journal.run_state).toBe("FAIL_STOP"); expect(journal.batches[0].submission?.missing_asset_ids).toHaveLength(9); expect(journal.batches[0].recoveries).toHaveLength(3);
  });

  test.each(["timeout", "download"] as const)("preserves the original partial terminal and definite jobs across %s recovery failure and reload", async (mode) => {
    const root = mkdtempSync(resolve(tmpdir(), `fictor-t015-partial-${mode}-`)); const prepared = prepareFirst(root); const assets = prepared.plan.assets.slice(0, 3); const jobs = assets.map((asset) => ({ index: asset.index, job_id: `partial-${asset.index}`, status: "queued" })); const responsePath = json(root, "partial.json", { submitted_count: 3, failed_count: 9, jobs });
    expect(() => runT015OpsInternal(["response", "--batch", prepared.batch.id, "--file", responsePath, "--observed-at", "2026-08-12T03:07:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval)).toThrow("PARTIAL_OR_MISMATCHED");
    runT015OpsInternal(["recovery-open", "--batch", prepared.batch.id, "--operator-phrase", T015_RECOVERY_OPERATOR_PHRASE, "--observed-at", "2026-08-12T03:08:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval);
    const wait = mode === "timeout" ? { all_terminal: false, jobs: [], summary: jobsSummary([]), timed_out: true } : { all_terminal: true, jobs: jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(3).fill("completed")) };
    const dependencies: T015DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async () => { throw new Error("offline download failure"); } };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", prepared.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(wait), root, prepared.plan, prepared.presentation, prepared.approval, dependencies)).rejects.toThrow(mode === "timeout" ? "PROVIDER_RESPONSE_SIGNAL" : "RECOVERY_FAILED");
    const reopened = runT015OpsInternal(["recovery-open", "--batch", prepared.batch.id, "--operator-phrase", T015_RECOVERY_OPERATOR_PHRASE, "--observed-at", "2026-08-12T03:10:00.000Z"], root, prepared.plan, prepared.presentation, prepared.approval); expect(reopened.idempotent).toBe(true);
    const request = runT015OpsInternal(["jobs-request", "--batch", prepared.batch.id], root, prepared.plan, prepared.presentation, prepared.approval); expect(request.jobs).toHaveLength(3);
    const journal = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal; validateT015Journal(journal, prepared.plan, prepared.presentation, prepared.approval); expect(journal.batches[0].terminal?.code).toBe("PARTIAL_OR_MISMATCHED_BATCH_RESPONSE"); expect(journal.batches[0].submission?.jobs).toHaveLength(3); expect(journal.batches[0].recovery_failures).toHaveLength(1); expect(journal.batches[0].recovery_failures[0].original_terminal_code).toBe("PARTIAL_OR_MISMATCHED_BATCH_RESPONSE"); expect(journal.paid_retry_count).toBe(0);
  });

  test.each(["timeout", "download", "model-drift"] as const)("keeps a complete submission reloadable and recovery-only after %s failure", async (mode) => {
    const root = mkdtempSync(resolve(tmpdir(), `fictor-t015-complete-${mode}-`)); const submitted = submitFirst(root);
    const wait = mode === "timeout"
      ? { all_terminal: false, jobs: [], summary: jobsSummary([]), timed_out: true }
      : { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: mode === "model-drift" ? "unexpected" : "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    let fetchCalls = 0; const dependencies: T015DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async () => { fetchCalls += 1; throw new Error("offline download failure"); } };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(wait), root, submitted.plan, submitted.presentation, submitted.approval, dependencies)).rejects.toThrow(mode === "timeout" ? "PROVIDER_RESPONSE_SIGNAL" : mode === "model-drift" ? "MODEL_DRIFT" : "RECOVERY_FAILED");
    expect(fetchCalls).toBe(mode === "download" ? 1 : 0);
    const journal = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal; validateT015Journal(journal, submitted.plan, submitted.presentation, submitted.approval); const record = journal.batches[0]; expect(journal.run_state).toBe("FAIL_STOP"); expect(record.state).toBe("RECOVERY_ONLY"); expect(record.terminal).toBeUndefined(); expect(record.submission?.jobs).toHaveLength(12); expect(record.recovery_failures).toHaveLength(1); expect(record.recovery_failures[0].original_terminal_code).toBeNull(); expect(record.recovery_failures[0].recovery_only_preserved).toBe(true); expect(journal.paid_retry_count).toBe(0);
    const reopened = runT015OpsInternal(["recovery-open", "--batch", submitted.batch.id, "--operator-phrase", T015_RECOVERY_OPERATOR_PHRASE, "--observed-at", "2026-08-12T03:10:00.000Z"], root, submitted.plan, submitted.presentation, submitted.approval); expect(reopened.idempotent).toBe(true); expect(reopened.new_paid_submit).toBe(false);
    const jobs = runT015OpsInternal(["jobs-request", "--batch", submitted.batch.id], root, submitted.plan, submitted.presentation, submitted.approval); expect(jobs.jobs).toEqual(submitted.jobs.map(({ index, job_id }) => ({ index, job_id }))); expect(jobs.new_paid_submit).toBe(false);
    expect(() => runT015OpsInternal(["prepare", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:11:00.000Z"], root, submitted.plan, submitted.presentation, submitted.approval)).toThrow();
    const reloaded = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal; validateT015Journal(reloaded, submitted.plan, submitted.presentation, submitted.approval); expect(reloaded.batches[0].submission?.jobs).toHaveLength(12); expect(reloaded.paid_retry_count).toBe(0);
  });

  test.each([
    { name: "summary mismatch", mutate: (value: any) => { value.summary = { completed: 11, failed: 1 }; } },
    { name: "summary total tamper", mutate: (value: any) => { value.summary.total = 11; } },
    { name: "summary unknown field", mutate: (value: any) => { value.summary.queued = 0; } },
    { name: "timed out contradiction", mutate: (value: any) => { value.timed_out = true; } },
    { name: "all-terminal contradiction", mutate: (value: any) => { value.all_terminal = false; } },
    { name: "invalid poll_after", mutate: (value: any) => { value.poll_after_seconds = Number.POSITIVE_INFINITY; } },
  ])("rejects jobs_wait $name before fetch", async ({ mutate }) => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-jobs-schema-")); const submitted = submitFirst(root); const response: any = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) }; mutate(response);
    let fetchCalls = 0; const deps: T015DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async () => { fetchCalls += 1; throw new Error("must not fetch"); } };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps)).rejects.toThrow();
    expect(fetchCalls).toBe(0);
  });

  test.each([
    { name: "active", statuses: ["queued", ...Array(11).fill("completed")], summary: { active: 1, completed: 11, errors: 0, failed: 0, total: 12 }, allTerminal: false },
    { name: "lookup error", statuses: ["lookup_failed", ...Array(11).fill("completed")], summary: { active: 0, completed: 11, errors: 1, failed: 0, total: 12 }, allTerminal: true },
  ])("accepts actual jobs_wait $name summary semantics and repolls the same jobs", async ({ statuses, summary, allTerminal }) => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-actual-summary-")); const submitted = submitFirst(root); const response = { all_terminal: allTerminal, jobs: submitted.jobs.map((job, index) => statuses[index] === "completed" ? { ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` } : { ...job, status: statuses[index], ...(statuses[index] === "lookup_failed" ? { retryable: true } : {}) }), summary };
    let fetchCalls = 0; const dependencies: T015DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async () => { fetchCalls += 1; throw new Error("must not fetch while repolling"); } };
    const result = await runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, dependencies); expect(result.repoll_same_jobs_only).toBe(true); expect(result.new_paid_submit).toBe(false); expect(fetchCalls).toBe(0);
    const journal = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal; validateT015Journal(journal, submitted.plan, submitted.presentation, submitted.approval); expect(journal.batches[0].job_polls.at(-1)?.jobs).toHaveLength(12);
  });

  test("includes DNS resolution in the per-hop deadline and never fetches after timeout", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-dns-timeout-")); const submitted = submitFirst(root); const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    let fetchCalls = 0;
    const deps: T015DownloadDependencies = { timeout_ms: 5, resolve: async (_hostname, signal) => new Promise((resolvePromise) => signal.addEventListener("abort", () => resolvePromise([{ address: "93.184.216.34", family: 4 }]), { once: true })), fetch: async () => { fetchCalls += 1; throw new Error("must not fetch"); } };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps)).rejects.toThrow("RECOVERY_FAILED");
    expect(fetchCalls).toBe(0);
  });

  test("revalidates DNS and peer identity on every redirect hop", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-redirect-")); const submitted = submitFirst(root); const bytes = png(); const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://one.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    const resolved: string[] = [];
    const deps: T015DownloadDependencies = { resolve: async (hostname) => { resolved.push(hostname); return [{ address: "93.184.216.34", family: 4 }]; }, fetch: async ({ hostname, pinned }) => hostname === "one.example.com" ? { status: 302, headers: { location: "https://two.example.com/result.png" }, bytes: Buffer.alloc(0), remoteAddress: pinned.address } : { status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: pinned.address } };
    const result = await runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps);
    expect(result.state).toBe("RECOVERED"); expect(resolved.filter((host) => host === "one.example.com")).toHaveLength(12); expect(resolved.filter((host) => host === "two.example.com")).toHaveLength(12);
  });

  test.each(["peer", "content-type", "oversize", "abort"] as const)("fail-stops secure download on %s violation", async (mode) => {
    const root = mkdtempSync(resolve(tmpdir(), `fictor-t015-download-${mode}-`)); const submitted = submitFirst(root); const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    const deps: T015DownloadDependencies = {
      timeout_ms: 5,
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      fetch: async ({ pinned, signal }) => {
        if (mode === "abort") return new Promise((resolvePromise) => signal.addEventListener("abort", () => resolvePromise({ status: 200, headers: { "content-type": "image/png" }, bytes: png(), remoteAddress: pinned.address }), { once: true }));
        return { status: 200, headers: { "content-type": mode === "content-type" ? "text/html" : "image/png" }, bytes: mode === "oversize" ? Buffer.alloc(30 * 1024 * 1024 + 1) : png(), remoteAddress: mode === "peer" ? "8.8.8.8" : pinned.address };
      },
    };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps)).rejects.toThrow("RECOVERY_FAILED");
  });

  test("rejects future and stale production-clock preflight observations", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-clock-")); const { plan, presentation, approval } = fixture(); const now = () => new Date("2026-08-12T04:00:00.000Z"); runT015OpsInternal(["init"], root, plan, presentation, approval, false, now);
    expect(() => runT015OpsInternal(["preflight-request", "--batch", plan.batches[0].id, "--observed-at", "2026-08-12T04:00:01.000Z"], root, plan, presentation, approval, false, now)).toThrow("future");
    const preflight = runT015OpsInternal(["preflight-request", "--batch", plan.batches[0].id, "--observed-at", "2026-08-12T03:00:00.000Z"], root, plan, presentation, approval, false, now) as { requests: unknown[] };
    const cost = json(root, "stale-cost.json", { costs: plan.batches[0].asset_ids.map((id, itemIndex) => ({ index: plan.assets.find((asset) => asset.id === id)!.index, request_sha256: sha256T015(canonicalJson(preflight.requests[itemIndex])), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: `2026-08-12T03:01:${String(itemIndex).padStart(2, "0")}.000Z` })) }); const balance = json(root, "stale-balance.json", { credits: 861.9, provider_observed_at: "2026-08-12T03:02:00.000Z" });
    expect(() => runT015OpsInternal(["preflight-result", "--batch", plan.batches[0].id, "--cost-file", cost, "--balance-file", balance], root, plan, presentation, approval, false, now)).toThrow(/stale|PRICE_CHANGED/);
  });

  test("opens recovery only for durable IDs and blocks batch 2 on canary model drift", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-drift-")); const submitted = submitFirst(root); const jobsRequest = runT015OpsInternal(["jobs-request", "--batch", submitted.batch.id], root, submitted.plan, submitted.presentation, submitted.approval); expect(jobsRequest.new_paid_submit).toBe(false);
    const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "unexpected", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval)).rejects.toThrow("MODEL_DRIFT");
    const stopped = JSON.parse(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")) as T015OperationsJournal; expect(stopped.run_state).toBe("FAIL_STOP"); expect(stopped.batches[1].state).toBe("PLANNED");
  });

  test("redacts stdin URLs, rejects private DNS, and does not submit a replacement", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-ssrf-")); const submitted = submitFirst(root); const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}?secret=x` })), summary: jobsSummary(Array(12).fill("completed")) };
    const deps: T015DownloadDependencies = { resolve: async () => [{ address: "127.0.0.1", family: 4 }], fetch: async () => { throw new Error("must not fetch"); } };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps)).rejects.toThrow("no paid retry");
    const journal = readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8"); expect(journal).not.toContain("cdn.example.com"); expect(journal).not.toContain("secret=x"); expect(JSON.parse(journal).paid_retry_count).toBe(0);
  });

  test("classifies private, reserved, and every IPv4-mapped IPv6 form fail-closed", () => {
    const rejected: Array<{ address: string; family: 4 | 6 }> = [
      { address: "10.0.0.1", family: 4 }, { address: "127.0.0.1", family: 4 }, { address: "169.254.169.254", family: 4 },
      { address: "172.31.255.255", family: 4 }, { address: "192.168.1.1", family: 4 }, { address: "100.64.0.1", family: 4 },
      { address: "192.0.0.1", family: 4 }, { address: "192.31.196.1", family: 4 }, { address: "192.52.193.1", family: 4 },
      { address: "192.88.99.1", family: 4 }, { address: "192.175.48.1", family: 4 }, { address: "198.18.0.1", family: 4 },
      { address: "198.51.100.1", family: 4 }, { address: "203.0.113.1", family: 4 }, { address: "224.0.0.1", family: 4 },
      { address: "::1", family: 6 }, { address: "fc00::1", family: 6 }, { address: "fe80::1", family: 6 }, { address: "ff02::1", family: 6 },
      { address: "2001::1", family: 6 }, { address: "2001:db8::1", family: 6 }, { address: "2002::1", family: 6 }, { address: "3fff::1", family: 6 },
      { address: "::ffff:127.0.0.1", family: 6 }, { address: "::ffff:10.0.0.1", family: 6 }, { address: "::ffff:169.254.169.254", family: 6 },
      { address: "0:0:0:0:0:ffff:7f00:1", family: 6 }, { address: "::ffff:7f00:1", family: 6 }, { address: "::ffff:93.184.216.34", family: 6 },
      { address: "93.184.216.34", family: 6 },
    ];
    expect(rejected.filter(isPublicT015ResolvedAddress)).toEqual([]);
    expect(isPublicT015ResolvedAddress({ address: "93.184.216.34", family: 4 })).toBe(true);
    expect(isPublicT015ResolvedAddress({ address: "8.8.8.8", family: 4 })).toBe(true);
    expect(isPublicT015ResolvedAddress({ address: "2606:4700:4700::1111", family: 6 })).toBe(true);
    expect(isPublicT015ResolvedAddress({ address: "2404:6800:4004:80a::200e", family: 6 })).toBe(true);
  });

  test.each([
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "0:0:0:0:0:ffff:7f00:1",
    "::ffff:7f00:1",
    "::ffff:93.184.216.34",
  ])("never reaches fetch for mapped IPv6 resolver result %s", async (address) => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-mapped-")); const submitted = submitFirst(root); const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    let fetchCalls = 0;
    const deps: T015DownloadDependencies = { resolve: async () => [{ address, family: 6 }], fetch: async () => { fetchCalls += 1; throw new Error("mapped address must never reach fetch"); } };
    await expect(runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps)).rejects.toThrow("RECOVERY_FAILED");
    expect(fetchCalls).toBe(0);
  });

  test("recovers provider-native PNGs atomically to distinct local and backup roots", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-recovery-")); const submitted = submitFirst(root); const bytes = png(); const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    const deps: T015DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async ({ hostname, servername, pinned }) => { expect(hostname).toBe("cdn.example.com"); expect(servername).toBe(hostname); expect(pinned).toEqual({ address: "93.184.216.34", family: 4 }); return { status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: pinned.address }; } };
    const result = await runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps); expect(result.state).toBe("RECOVERED");
    for (const id of submitted.batch.asset_ids) { const path = submitted.plan.assets.find((asset) => asset.id === id)!.path; expect(readFileSync(resolve(root, "public/assets", path))).toEqual(bytes); expect(readFileSync(resolve(root, "assets/backups/t015-canonical-shard-1", path))).toEqual(bytes); }
    expect(readFileSync(resolve(root, T015_JOURNAL_PATH), "utf8")).not.toContain("cdn.example.com");
  });

  test("accepts a public IPv6 pin, preserves hostname/SNI, and canonicalizes peer spelling", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-ipv6-")); const submitted = submitFirst(root); const bytes = png(); const response = { all_terminal: true, jobs: submitted.jobs.map((job) => ({ ...job, status: "completed", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) };
    let fetchCalls = 0;
    const deps: T015DownloadDependencies = {
      resolve: async () => [{ address: "2606:4700:4700:0:0:0:0:1111", family: 6 }],
      fetch: async ({ hostname, servername, pinned }) => { fetchCalls += 1; expect(hostname).toBe("cdn.example.com"); expect(servername).toBe(hostname); expect(pinned.family).toBe(6); return { status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: "2606:4700:4700::1111" }; },
    };
    const result = await runT015JobsHandoffInternal(["jobs-handoff", "--batch", submitted.batch.id, "--observed-at", "2026-08-12T03:09:00.000Z"], JSON.stringify(response), root, submitted.plan, submitted.presentation, submitted.approval, deps);
    expect(result.state).toBe("RECOVERED"); expect(fetchCalls).toBe(12);
  });

  test("validates a complete 332-binding offline journal and exact 498.00 evidence", () => {
    const { plan, presentation, approval } = fixture(); const journal = buildInitialT015Journal(plan, presentation, approval); let balance = 86_190;
    journal.batches.forEach((record, batchIndex) => {
      const batch = plan.batches[batchIndex]; const before = balance; const after = before - batch.size * 150; const at = `2026-08-12T${String(4 + Math.floor(batchIndex / 6)).padStart(2, "0")}:${String((batchIndex % 6) * 10).padStart(2, "0")}:00.000Z`; const plus = (seconds: number) => new Date(Date.parse(at) + seconds * 1000).toISOString();
      const preflightRequest = { requests: batch.asset_ids.map((id) => { const request = plan.assets.find((asset) => asset.id === id)!.request; return { index: request.index, params: { ...request.params, get_cost: true as const } }; }) };
      record.preflight = { requests: preflightRequest.requests, requests_sha256: sha256T015(canonicalJson(preflightRequest)), requested_at: at, costs: batch.asset_ids.map((id, itemIndex) => { const asset = plan.assets.find((item) => item.id === id)!; return { index: asset.index, request_sha256: sha256T015(canonicalJson(preflightRequest.requests[itemIndex])), credits: 1, credits_decimal: "1.00", credits_exact: 1.5, credits_exact_decimal: "1.50", provider_observed_at: plus(itemIndex + 1) }; }), balance: { credits: before / 100, normalized_decimal: (before / 100).toFixed(2), provider_observed_at: plus(batch.size + 1) } };
      const paidRequest = { requests: batch.asset_ids.map((id) => plan.assets.find((asset) => asset.id === id)!.request) };
      const preparedAt = plus(batch.size + 2); const submittedAt = plus(batch.size + 3); const recoveryOpenedAt = plus(batch.size + 4); const recoveredAt = plus(batch.size + 5); const completedAt = plus(batch.size + 6);
      record.paid_request = { request_sha256: sha256T015(canonicalJson(paidRequest)), prepared_at: preparedAt }; record.submission = { observed_at: submittedAt, expected_count: batch.size, submitted_count: batch.size, failed_count: 0, complete: true, missing_asset_ids: [], jobs: batch.asset_ids.map((id) => { const asset = plan.assets.find((item) => item.id === id)!; return { index: asset.index, asset_id: id, job_id: `job-${asset.index}`, status: "completed", canonical_request_sha256: asset.canonical_request_sha256 }; }) };
      record.recovery_gate = { opened_at: recoveryOpenedAt, exact_operator_phrase_sha256: sha256T015(T015_RECOVERY_OPERATOR_PHRASE), no_new_paid_submit: true }; record.recoveries = record.submission.jobs.map((job) => { const asset = plan.assets[job.index]; return { asset_id: asset.id, provider_job_index: job.index, provider_job_id: job.job_id, source: "JOBS_HANDOFF_STDIN", observed_at: recoveredAt, local_relative_path: asset.path, backup_relative_path: asset.path, sha256: sha256T015(asset.id), size_bytes: 100, actual_width: 768, actual_height: 1024, aspect_error_ppm: 0, provider_native_unmodified: true }; });
      record.balance_after = { credits: after / 100, normalized_decimal: (after / 100).toFixed(2), observed_at: completedAt, delta_decimal: (batch.size * 1.5).toFixed(2) }; record.state = "COMPLETE"; balance = after;
      record.transitions = [{ state: "PREFLIGHT_REQUESTED", observed_at: at }, { state: "PREFLIGHT_VERIFIED", observed_at: plus(batch.size + 1) }, { state: "SUBMITTING", observed_at: preparedAt }, { state: "SUBMITTED", observed_at: submittedAt }, { state: "RECOVERY_ONLY", observed_at: recoveryOpenedAt }, { state: "RECOVERING", observed_at: recoveredAt }, { state: "RECOVERED", observed_at: recoveredAt }, { state: "COMPLETE", observed_at: completedAt }];
    }); journal.run_state = "COMPLETE"; validateT015Journal(journal, plan, presentation, approval); expect(journal.batches[0].preflight?.costs).toHaveLength(12); expect(journal.batches.at(-1)?.preflight?.costs).toHaveLength(8); const evidence = buildT015ActualEvidence(journal, plan); expect(evidence.asset_count).toBe(332); expect(evidence.total_credit_delta_decimal).toBe("498.00"); expect(evidence.excluded_first_id_present).toBe(false);
  });

  test("checks every CANONICAL index 332+ path in public and backup", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-excluded-"));
    expect(checkExcludedT015CanonicalPaths(root, "2026-08-12T04:00:00.000Z")).toEqual({ checked_at: "2026-08-12T04:00:00.000Z", checked_count: 994, public_present_count: 0, backup_present_count: 0, all_absent: true });
    const excludedPath = "cards/forge__join_02__wash_02.png"; mkdirSync(resolve(root, "public/assets/cards"), { recursive: true }); writeFileSync(resolve(root, "public/assets", excludedPath), png());
    expect(() => checkExcludedT015CanonicalPaths(root, "2026-08-12T04:00:01.000Z")).toThrow("excluded CANONICAL path exists");
    const symlinkRoot = mkdtempSync(resolve(tmpdir(), "fictor-t015-excluded-link-")); mkdirSync(resolve(symlinkRoot, "public/assets/cards"), { recursive: true }); symlinkSync(resolve(root, "public/assets", excludedPath), resolve(symlinkRoot, "public/assets", excludedPath));
    expect(() => checkExcludedT015CanonicalPaths(symlinkRoot, "2026-08-12T04:00:02.000Z")).toThrow();
  });

  test("writes evidence with atomic no-clobber and rejects conflict or symlink targets", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t015-evidence-"));
    writeT015NoClobberJsonForTest(root, "evidence/actual.json", { value: 1 });
    writeT015NoClobberJsonForTest(root, "evidence/actual.json", { value: 1 });
    expect(() => writeT015NoClobberJsonForTest(root, "evidence/actual.json", { value: 2 })).toThrow("no-clobber conflict");
    const linked = mkdtempSync(resolve(tmpdir(), "fictor-t015-evidence-link-")); mkdirSync(resolve(linked, "evidence")); symlinkSync(resolve(root, "evidence/actual.json"), resolve(linked, "evidence/actual.json"));
    expect(() => writeT015NoClobberJsonForTest(linked, "evidence/actual.json", { value: 1 })).toThrow("SYMLINK_TRAVERSAL");
  });

  describe("T015 immutable v1 to recovery-only v2 migration", () => {
    test("pins the old failure while splitting 12 recovered plus 320 fresh-paid assets under the original 498 cap", () => {
      const plan = buildT015V2CanonicalShardPlan(repositoryRoot); const risk = buildT015V2RiskDisclosure(); const schema = buildT015V2ProviderSchemaEvidence(); const packet = buildT015V2DisclosurePacket(repositoryRoot, plan, risk, schema); const forensics = buildT015V1ForensicMigrationEvidence();
      expect(plan.assets).toHaveLength(332); expect(plan.legacy_recovery.batch.size).toBe(12); expect(plan.batches).toHaveLength(27); expect(plan.batches.reduce((sum, batch) => sum + batch.size, 0)).toBe(320); expect(plan.budget.legacy_cap_committed_decimal).toBe("18.00"); expect(plan.budget.legacy_provider_balance_delta_verified).toBe(false); expect(plan.budget.additional_credit_cap_decimal).toBe("480.00"); expect(plan.budget.total_credit_cap_decimal).toBe("498.00"); expect(Number(plan.budget.legacy_cap_committed_decimal) + Number(plan.budget.additional_credit_cap_decimal)).toBe(498);
      expect(plan.approval_gate.prior_t015_v1_approval_inherited).toBe(false); expect(packet.authorized).toBe(false); expect(packet.prior_t015_v1_approval_inherited).toBe(false); expect(isT015V2Authorized(repositoryRoot, plan)).toBe(false); expect(T015_V2_EXACT_APPROVAL_PHRASE).toContain("12..331"); expect(T015_V2_EXACT_APPROVAL_PHRASE).toContain("480.00"); expect(T015_V2_EXACT_APPROVAL_PHRASE).toContain("이미 사용 18.00");
      expect(forensics.legacy.journal.sha256).toBe("81d7ab7abdadbf86ee420953690550b62621910907fd9bb11cd8ccb19cf0d6f5"); expect(forensics.observed.preserved_failure_code).toBe("PROVIDER_RESPONSE_SIGNAL"); expect(forensics.observed.recovery_count).toBe(0); expect(forensics.observed.provider_balance_delta_verified).toBe(false); expect(forensics.migration_policy.mutate_legacy_journal).toBe(false); expect(readFileSync(resolve(repositoryRoot, T015_V2_PLAN_PATH), "utf8")).toBe(renderT015V2Plan(plan));
      const oldApprovalRoot = mkdtempSync(resolve(tmpdir(), "fictor-t015-v2-old-approval-")); copyFixtureSources(oldApprovalRoot); mkdirSync(resolve(oldApprovalRoot, T015_V2_APPROVAL_PATH, ".."), { recursive: true }); copyFileSync(resolve(repositoryRoot, "assets/evidence/t015-forensic-approval-v1.json"), resolve(oldApprovalRoot, T015_V2_APPROVAL_PATH)); expect(isT015V2Authorized(oldApprovalRoot, plan)).toBe(false);
    });

    test("migrates the exact durable jobs into a separate reloadable journal without touching v1", () => {
      const prepared = v2RecoveryFixture(); const legacyBefore = readFileSync(resolve(prepared.root, T015_V1_JOURNAL_PATH)); const migrated = runT015V2RecoveryOpsInternal(["migrate", "--observed-at", "2026-08-12T08:00:00.000Z"], prepared.root, prepared.plan, undefined, prepared.pins); expect(migrated.state).toBe("RECOVERY_ONLY"); expect(migrated.new_paid_submit).toBe(false); expect(migrated.paid_retry_count).toBe(0);
      const request = runT015V2RecoveryOpsInternal(["jobs-request"], prepared.root, prepared.plan, undefined, prepared.pins); expect(request.jobs).toEqual(prepared.jobs.map(({ index, job_id }) => ({ index, job_id }))); expect(request.new_paid_submit).toBe(false);
      const again = runT015V2RecoveryOpsInternal(["migrate", "--observed-at", "2026-08-12T08:00:01.000Z"], prepared.root, prepared.plan, undefined, prepared.pins); expect(again.idempotent).toBe(true); expect(readFileSync(resolve(prepared.root, T015_V1_JOURNAL_PATH))).toEqual(legacyBefore);
      const journal = JSON.parse(readFileSync(resolve(prepared.root, T015_V2_JOURNAL_PATH), "utf8")) as T015V2OperationsJournal; validateT015V2Journal(journal, prepared.root, prepared.plan, prepared.pins); expect(journal.immutable_legacy_journal.source_mutated).toBe(false); expect(journal.accounting.legacy_cap_committed_decimal).toBe("18.00"); expect(journal.accounting.legacy_provider_balance_delta_verified).toBe(false); expect(journal.continuation.authorization).toBeNull(); expect(journal.continuation.batches).toHaveLength(27);
    });

    test("accepts actual-shaped type=image jobs and atomically recovers all 12 while retaining the old failure", async () => {
      const prepared = v2RecoveryFixture(); runT015V2RecoveryOpsInternal(["migrate", "--observed-at", "2026-08-12T08:00:00.000Z"], prepared.root, prepared.plan, undefined, prepared.pins); const bytes = png(); const response = { all_terminal: true, jobs: prepared.jobs.map((job) => ({ ...job, status: "completed", type: "image", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")), poll_after_seconds: 0, timed_out: false, aborted: false };
      const dependencies: T015V2DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async ({ pinned }) => ({ status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: pinned.address }) };
      const result = await runT015V2JobsHandoffInternal(["jobs-handoff", "--observed-at", "2026-08-12T08:01:00.000Z"], JSON.stringify(response), prepared.root, prepared.plan, dependencies, undefined, prepared.pins); expect(result.state).toBe("HOLD_FOR_FRESH_CONTINUATION_APPROVAL"); expect(result.recovered).toBe(12); expect(result.legacy_failure_preserved).toBe(true); expect(result.new_paid_locked).toBe(true); expect(result.new_paid_submit).toBe(false);
      const journalBytes = readFileSync(resolve(prepared.root, T015_V2_JOURNAL_PATH), "utf8"); expect(journalBytes).not.toMatch(/https?:\/\//); expect(journalBytes).not.toContain("result_url"); expect(journalBytes).not.toContain("raw_error"); const journal = JSON.parse(journalBytes) as T015V2OperationsJournal; validateT015V2Journal(journal, prepared.root, prepared.plan, prepared.pins); expect(journal.legacy_recovery.recoveries).toHaveLength(12); expect(journal.legacy_recovery.failures).toHaveLength(0); expect(journal.immutable_legacy_journal.preserved_failure_code).toBe("PROVIDER_RESPONSE_SIGNAL"); expect(journal.continuation.authorization).toBeNull();
      for (const recovery of journal.legacy_recovery.recoveries) { expect(readFileSync(resolve(prepared.root, "public/assets", recovery.local_relative_path))).toEqual(bytes); expect(readFileSync(resolve(prepared.root, "assets/backups/t015-canonical-shard-1", recovery.backup_relative_path))).toEqual(bytes); }
    });

    test.each([
      { name: "missing type", mutate: (job: any) => { delete job.type; } },
      { name: "wrong type", mutate: (job: any) => { job.type = "video"; } },
      { name: "null type", mutate: (job: any) => { job.type = null; } },
      { name: "provider error", mutate: (job: any) => { job.error = "opaque"; } },
      { name: "thumbnail", mutate: (job: any) => { job.thumbnail_url = "https://thumb.example.com/x.png"; } },
      { name: "unknown optional", mutate: (job: any) => { job.warning = "opaque"; } },
      { name: "retryable on completed", mutate: (job: any) => { job.retryable = false; } },
    ])("fail-stops actual-shaped jobs_wait $name before fetch and remains reloadable", async ({ mutate }) => {
      const prepared = v2RecoveryFixture(); runT015V2RecoveryOpsInternal(["migrate", "--observed-at", "2026-08-12T08:00:00.000Z"], prepared.root, prepared.plan, undefined, prepared.pins); const response: any = { all_terminal: true, jobs: prepared.jobs.map((job) => ({ ...job, status: "completed", type: "image", model: "nano_banana_flash", result_url: `https://cdn.example.com/${job.index}.png` })), summary: jobsSummary(Array(12).fill("completed")) }; mutate(response.jobs[0]); let fetchCalls = 0; const dependencies: T015V2DownloadDependencies = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: async () => { fetchCalls += 1; throw new Error("must not fetch"); } };
      await expect(runT015V2JobsHandoffInternal(["jobs-handoff", "--observed-at", "2026-08-12T08:01:00.000Z"], JSON.stringify(response), prepared.root, prepared.plan, dependencies, undefined, prepared.pins)).rejects.toThrow(/UNKNOWN_PROVIDER_FIELD|fail-stop/); expect(fetchCalls).toBe(0); const journal = JSON.parse(readFileSync(resolve(prepared.root, T015_V2_JOURNAL_PATH), "utf8")) as T015V2OperationsJournal; validateT015V2Journal(journal, prepared.root, prepared.plan, prepared.pins); expect(journal.run_state).toBe("FAIL_STOP"); expect(journal.legacy_recovery.jobs).toHaveLength(12); expect(journal.legacy_recovery.recoveries).toHaveLength(0); expect(journal.accounting.paid_retry_count).toBe(0); const request = runT015V2RecoveryOpsInternal(["jobs-request"], prepared.root, prepared.plan, undefined, prepared.pins); expect(request.jobs).toHaveLength(12); expect(request.new_paid_submit).toBe(false);
    });

    test("rejects any legacy journal or exact-job-set tamper after migration", () => {
      const prepared = v2RecoveryFixture(); runT015V2RecoveryOpsInternal(["migrate", "--observed-at", "2026-08-12T08:00:00.000Z"], prepared.root, prepared.plan, undefined, prepared.pins); const legacy = JSON.parse(readFileSync(resolve(prepared.root, T015_V1_JOURNAL_PATH), "utf8")); legacy.batches[0].submission.jobs[0].job_id = "tampered"; writeFileSync(resolve(prepared.root, T015_V1_JOURNAL_PATH), renderT015CanonicalJson(legacy)); expect(() => runT015V2RecoveryOpsInternal(["status"], prepared.root, prepared.plan, undefined, prepared.pins)).toThrow("pinned source changed");
      const fresh = v2RecoveryFixture(); const wrongPins = { ...fresh.pins, exact_job_id_list_sha256: "0".repeat(64) }; expect(() => runT015V2RecoveryOpsInternal(["migrate", "--observed-at", "2026-08-12T08:00:00.000Z"], fresh.root, fresh.plan, undefined, wrongPins)).toThrow("exact job ID set changed");
    });
  });
});
