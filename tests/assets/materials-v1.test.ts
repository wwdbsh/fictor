import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, test, vi } from "vitest";

import { acquireRunnerLock } from "../../scripts/assets/filesystem";
import {
  buildInitialT013Journal,
  buildT013ActualEvidence,
  redactT013JobsWaitResponse,
  renderT013ContactSheetHtml,
  runT013JobsHandoffForTest,
  runT013Ops,
  runT013OpsForTest,
  runT013ProductionOpsForTest,
  validateT013Journal,
  type T013LiveJobsWaitResponse,
  type T013OperationsJournal,
} from "../../scripts/assets/materials-v1-ops-cli";
import {
  T013_CONTRACT_SHA256,
  T013_CORE_PLAN_SHA256,
  T013_EXACT_APPROVAL_PHRASE,
  T013_MASTER_STYLE_SHA256,
  T013_MATERIALS_SHA256,
  T013_PLAN_PATH,
  T013_RISK_DISCLOSURE_TEXT,
  T013_RISK_PATH,
  T013_SCHEMA_EVIDENCE_PATH,
  buildT013ApprovalEvidence,
  buildT013DisclosurePresentationEvidence,
  buildT013MaterialsPlan,
  buildT013ProviderSchemaEvidence,
  buildT013RiskDisclosure,
  isT013Authorized,
  renderCanonicalJson,
  renderT013MaterialsPlan,
  validateT013ApprovalEvidence,
  validateT013DisclosurePresentationEvidence,
  validateT013MaterialsPlan,
  type T013ApprovalEvidence,
  type T013DisclosurePresentationEvidence,
  type T013MaterialsPlan,
} from "../../scripts/assets/materials-v1";
import { canonicalJson } from "../../scripts/assets/style-candidates";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const TEST_PUBLIC_ADDRESS = "93.184.216.34";

interface TestPinnedRequest {
  url: URL;
  hostname: string;
  servername: string;
  pinned_address: string;
  family: 4 | 6;
  method: "GET";
  headers: { accept: "image/png" };
  timeout_ms: number;
  signal: AbortSignal;
}

interface TestPinnedResponse {
  status_code: number;
  headers: Record<string, string | string[] | undefined>;
  remote_address: string | null;
  body: AsyncIterable<Uint8Array> | null;
  destroy: () => void;
}

function asyncBytes(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

function pngResponse(
  request: TestPinnedRequest,
  bytes = png(),
  overrides: Partial<Omit<TestPinnedResponse, "body">> & { body?: AsyncIterable<Uint8Array> | null } = {},
): TestPinnedResponse {
  return {
    status_code: 200,
    headers: { "content-type": "image/png", "content-length": String(bytes.length) },
    remote_address: request.pinned_address,
    body: asyncBytes(bytes),
    destroy: () => undefined,
    ...overrides,
  };
}

const publicResolver = async () => [{ address: TEST_PUBLIC_ADDRESS, family: 4 as const }];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function png(fill = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(3, 0);
  header.writeUInt32BE(4, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(4 * (1 + 3 * 3));
  for (let row = 0; row < 4; row += 1) pixels.fill(fill & 0xff, row * 10 + 1, row * 10 + 10);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderCanonicalJson(value));
}

function regularFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && !entry.isSymbolicLink()) result.push(child);
    }
  };
  visit(root);
  return result;
}

function fixture() {
  const plan = buildT013MaterialsPlan(repositoryRoot);
  const risk = buildT013RiskDisclosure();
  const now = new Date("2026-08-11T13:10:00.000Z");
  const presentation = buildT013DisclosurePresentationEvidence(plan, risk, "2026-08-11T13:00:00.000Z", now);
  const approval = buildT013ApprovalEvidence(plan, risk, presentation, T013_EXACT_APPROVAL_PHRASE, "2026-08-11T13:01:00.000Z", now);
  const root = mkdtempSync(resolve(tmpdir(), "fictor-t013-"));
  return { plan, risk, presentation, approval, root };
}

function at(baseMs: number, seconds: number): string {
  return new Date(baseMs + seconds * 1000).toISOString();
}

function validGenerateResponse(plan: T013MaterialsPlan, batchIndex: number): Record<string, unknown> {
  const assets = plan.batches[batchIndex].asset_ids.map((id) => plan.assets.find((asset) => asset.id === id)!);
  return {
    submitted_count: assets.length,
    failed_count: 0,
    jobs: assets.map((asset) => ({ index: asset.index, job_id: `job-${asset.index}`, status: "queued" })),
  };
}

function validLiveJobs(plan: T013MaterialsPlan, batchIndex: number): T013LiveJobsWaitResponse {
  const assets = plan.batches[batchIndex].asset_ids.map((id) => plan.assets.find((asset) => asset.id === id)!);
  return {
    all_terminal: true,
    jobs: assets.map((asset) => ({ index: asset.index, job_id: `job-${asset.index}`, status: "completed", model: "nano_banana_flash", result_url: `https://assets.example.com/${asset.index}?signed=secret`, thumbnail_url: `https://assets.example.com/thumb/${asset.index}`, retryable: false, type: "image" })),
    summary: { completed: assets.length, failed: 0 },
    poll_after_seconds: 0,
    timed_out: false,
    aborted: false,
  };
}

function runPreflightAndPrepare(
  root: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  batchIndex: number,
  balanceBefore: number,
  baseMs: number,
) {
  const batchId = plan.batches[batchIndex].id;
  const request = runT013OpsForTest(["preflight-request", "--batch", batchId, "--observed-at", at(baseMs, 0)], root, plan, presentation, approval);
  writeJson(root, `inbox/cost-${batchIndex}.json`, { cost: { credits: 1, credits_exact: 1.5 } });
  writeJson(root, `inbox/balance-${batchIndex}.json`, { credits: balanceBefore / 100 });
  runT013OpsForTest([
    "preflight-result", "--batch", batchId,
    "--cost-file", `inbox/cost-${batchIndex}.json`, "--balance-file", `inbox/balance-${batchIndex}.json`,
    "--provider-observed-at", at(baseMs, 30), "--balance-observed-at", at(baseMs, 31),
  ], root, plan, presentation, approval);
  const paid = runT013OpsForTest(["prepare", "--batch", batchId, "--observed-at", at(baseMs, 40)], root, plan, presentation, approval);
  return { request, paid };
}

function submitAndCompleteJobs(
  root: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  batchIndex: number,
  baseMs: number,
) {
  const batchId = plan.batches[batchIndex].id;
  writeJson(root, `inbox/generate-${batchIndex}.json`, validGenerateResponse(plan, batchIndex));
  runT013OpsForTest(["response", "--batch", batchId, "--file", `inbox/generate-${batchIndex}.json`, "--provider-observed-at", at(baseMs, 50)], root, plan, presentation, approval);
  const jobsRequest = runT013OpsForTest(["jobs-request", "--batch", batchId], root, plan, presentation, approval);
  const redacted = redactT013JobsWaitResponse(validLiveJobs(plan, batchIndex), at(baseMs, 60));
  writeJson(root, `inbox/jobs-${batchIndex}.json`, redacted.observation);
  runT013OpsForTest(["jobs", "--batch", batchId, "--file", `inbox/jobs-${batchIndex}.json`], root, plan, presentation, approval);
  return { ...redacted, jobsRequest };
}

async function submitAndHandoffJobs(
  root: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  batchIndex: number,
  baseMs: number,
) {
  const batchId = plan.batches[batchIndex].id;
  writeJson(root, `inbox/generate-${batchIndex}.json`, validGenerateResponse(plan, batchIndex));
  runT013OpsForTest(["response", "--batch", batchId, "--file", `inbox/generate-${batchIndex}.json`, "--provider-observed-at", at(baseMs, 50)], root, plan, presentation, approval);
  const jobsRequest = runT013OpsForTest(["jobs-request", "--batch", batchId], root, plan, presentation, approval);
  const temporaryRoot = resolve(root, `temporary-${batchIndex}`);
  mkdirSync(temporaryRoot);
  let nowOffset = 70;
  const transport = vi.fn(async (request: TestPinnedRequest) => pngResponse(request));
  const result = await runT013JobsHandoffForTest(
    ["jobs-handoff", "--batch", batchId, "--provider-observed-at", at(baseMs, 60)],
    JSON.stringify(validLiveJobs(plan, batchIndex)), root, plan, presentation, approval,
    {
      resolve_hostname: publicResolver,
      https_transport: transport,
      temporary_root: temporaryRoot,
      now: () => new Date(at(baseMs, nowOffset++)),
    },
  );
  return { jobsRequest, result, transport };
}

describe("T013 materials-v1 local preparation", () => {
  test("pins exact sources, live schema, 52 requests, batch sizes, and deterministic request hashes", () => {
    const first = buildT013MaterialsPlan(repositoryRoot);
    const second = buildT013MaterialsPlan(repositoryRoot);
    expect(renderT013MaterialsPlan(first)).toBe(renderT013MaterialsPlan(second));
    expect(readFileSync(resolve(repositoryRoot, T013_PLAN_PATH), "utf8")).toBe(renderT013MaterialsPlan(first));
    expect(readFileSync(resolve(repositoryRoot, T013_RISK_PATH), "utf8")).toBe(renderCanonicalJson(buildT013RiskDisclosure()));
    expect(readFileSync(resolve(repositoryRoot, T013_SCHEMA_EVIDENCE_PATH), "utf8")).toBe(renderCanonicalJson(buildT013ProviderSchemaEvidence()));
    expect(first.issue_contract_sha256).toBe(T013_CONTRACT_SHA256);
    expect(buildT013ProviderSchemaEvidence().generate_image_batch.response_shape).toContain("warning?");
    expect(buildT013ProviderSchemaEvidence().generate_image_batch.statuses).toContain("submission_failed");
    expect(buildT013ProviderSchemaEvidence().jobs_wait.statuses).toContain("lookup_failed");
    expect(buildT013ProviderSchemaEvidence().jobs_wait.statuses).not.toContain("submission_failed");
    expect(buildT013ProviderSchemaEvidence().jobs_wait).toMatchObject({
      observed_download_host_allowlist: [],
      download_network_policy: "GENERIC_HTTPS_HOSTNAME_DEFAULT_443_ALL_DNS_ANSWERS_PUBLIC_PINNED_ORIGINAL_TLS_IDENTITY_NO_PROXY",
      redirect_policy: "MAX_3_EACH_HOP_URL_DNS_PIN_REVALIDATED",
      completion_provenance: "ONLY_JOBS_HANDOFF_STDIN_JOB_BOUND_RECOVERIES",
      diagnostic_command_policy: "JOBS_FILE_AND_INGEST_INPUT_PNG_TEST_INTERNAL_ONLY_NOT_PRODUCTION",
    });
    expect(first.recovery_policy).toMatchObject({
      production_jobs_wait_input: "STDIN_ONLY",
      production_diagnostic_file_commands_allowed: false,
      completion_requires_jobs_handoff_provenance: true,
      observed_download_host_allowlist: [],
    });
    const preparationDoc = readFileSync(resolve(repositoryRoot, "docs/asset-runs/t013-materials-local-preparation-2026-08-11.md"), "utf8");
    expect(preparationDoc).toContain(`> ${T013_RISK_DISCLOSURE_TEXT}`);
    expect(first.sources).toMatchObject({ materials: { sha256: T013_MATERIALS_SHA256 }, core_plan: { sha256: T013_CORE_PLAN_SHA256 }, master_style: { sha256: T013_MASTER_STYLE_SHA256 } });
    expect(first.assets).toHaveLength(52);
    expect(first.batches.map(({ size }) => size)).toEqual([12, 12, 12, 12, 4]);
    for (const asset of first.assets) {
      expect(asset.request).toEqual({ index: asset.index, params: { model: "nano_banana_2", aspect_ratio: "3:4", resolution: "1k", prompt: asset.effective_prompt, use_unlim: false, count: 1, medias: [{ role: "image", value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }] } });
      expect(asset.canonical_request_sha256).toBe(sha256(canonicalJson(asset.request)));
      expect(asset.effective_prompt.startsWith(asset.core_prompt)).toBe(true);
    }
  });

  test("rejects plan, request, batch, reference, and recovery-policy drift", () => {
    const plan = buildT013MaterialsPlan(repositoryRoot);
    const mutations: Array<(value: any) => void> = [
      (value) => { value.issue_contract_sha256 = "0".repeat(64); },
      (value) => { value.assets.pop(); },
      (value) => { value.assets[0].request.params.use_unlim = true; },
      (value) => { value.assets[0].request.params.medias[0].value = "invented"; },
      (value) => { value.batches[0].asset_ids.reverse(); },
      (value) => { value.reference_binding.revision = 2; },
      (value) => { value.recovery_policy.aspect_tolerance_ppm = 5001; },
    ];
    for (const mutate of mutations) {
      const changed = clone(plan) as any;
      mutate(changed);
      expect(() => validateT013MaterialsPlan(changed, repositoryRoot)).toThrow("Issue 15 contract");
    }
  });

  test("allows only the exact positive phrase strictly after a real disclosure record", () => {
    const { plan, risk, presentation, approval, root } = fixture();
    const now = new Date("2026-08-11T13:10:00.000Z");
    expect(() => validateT013DisclosurePresentationEvidence(presentation, plan, risk, now)).not.toThrow();
    expect(() => validateT013ApprovalEvidence(approval, plan, risk, presentation, now)).not.toThrow();
    for (const quote of ["승인하지 않습니다.", "진행해도 될 것 같습니다.", `${T013_EXACT_APPROVAL_PHRASE} 아마도`]) {
      expect(() => buildT013ApprovalEvidence(plan, risk, presentation, quote, "2026-08-11T13:01:00.000Z", now)).toThrow("exact positive");
    }
    expect(() => buildT013ApprovalEvidence(plan, risk, presentation, T013_EXACT_APPROVAL_PHRASE, "2026-08-11T12:59:59.000Z", now)).toThrow("strictly after");
    expect(() => buildT013ApprovalEvidence(plan, risk, presentation, T013_EXACT_APPROVAL_PHRASE, "2026-08-12T13:01:00.001Z", new Date("2026-08-12T13:02:00.000Z"))).toThrow("24-hour");
    expect(() => buildT013ApprovalEvidence(plan, risk, presentation, T013_EXACT_APPROVAL_PHRASE, "2026-08-11T13:11:00.000Z", now)).toThrow("future");
    expect(() => buildT013DisclosurePresentationEvidence(plan, risk, "2026-08-11T13:11:00.000Z", now)).toThrow("future");
    expect(() => buildT013DisclosurePresentationEvidence(plan, risk, "2026-08-11T12:00:00.000Z", now)).toThrow("15-minute");
    expect(isT013Authorized(root, plan)).toBe(false);
  });

  test("rejects diagnostic file commands on the production-equivalent surface before file access", () => {
    const { plan, presentation, approval, root } = fixture();
    const missingJobs = "inbox/never-created-jobs.json";
    const missingPng = "never-created-input.png";
    expect(() => runT013ProductionOpsForTest(
      ["jobs", "--batch", "materials-001", "--file", missingJobs],
      root, plan, presentation, approval,
    )).toThrow("diagnostic-only command");
    expect(() => runT013ProductionOpsForTest(
      ["ingest", "--batch", "materials-001", "--asset", "ore_still", "--input-png", missingPng, "--observed-at", "2026-08-11T14:00:00.000Z"],
      root, plan, presentation, approval,
    )).toThrow("diagnostic-only command");
    expect(() => runT013Ops(["jobs", "--batch", "materials-001", "--file", missingJobs])).toThrow("diagnostic-only command");
    expect(() => runT013Ops(["ingest", "--batch", "materials-001", "--asset", "ore_still", "--input-png", missingPng, "--observed-at", "2026-08-11T14:00:00.000Z"])).toThrow("diagnostic-only command");
  });

  test("diagnostic jobs and manual ingest cannot create COMPLETE evidence", () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
    submitAndCompleteJobs(root, plan, presentation, approval, 0, base);
    const input = resolve(root, "fixture.png");
    writeFileSync(input, png());
    for (const [position, assetId] of plan.batches[0].asset_ids.entries()) {
      runT013OpsForTest(["ingest", "--batch", "materials-001", "--asset", assetId, "--input-png", input, "--observed-at", at(base, 70 + position)], root, plan, presentation, approval);
    }
    expect(() => runT013OpsForTest(
      ["balance-after", "--batch", "materials-001", "--file", "inbox/never-created-balance.json", "--provider-observed-at", at(base, 90)],
      root, plan, presentation, approval,
    )).toThrow("jobs-handoff provenance");
    const journal = JSON.parse(readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8")) as T013OperationsJournal;
    expect(journal.batches[0].state).toBe("RECOVERED");
    expect(journal.batches[0].job_polls[0].observation_source).toBe("DIAGNOSTIC_REDACTED_FILE");
    expect(journal.batches[0].recoveries.every(({ recovery_source }) => recovery_source === "DIAGNOSTIC_MANUAL_INPUT")).toBe(true);
    expect(() => buildT013ActualEvidence(journal, plan)).toThrow("jobs-handoff provenance");
  });

  test("durably separates exact get_cost/balance preflight from directly callable paid prepare", () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    const { request, paid } = runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
    expect(Object.keys(request)).toEqual(["params"]);
    expect(Object.keys(request.params as Record<string, unknown>).sort()).toEqual(["aspect_ratio", "count", "get_cost", "medias", "model", "prompt", "resolution", "use_unlim"]);
    expect((request.params as Record<string, unknown>).get_cost).toBe(true);
    expect((request.params as Record<string, unknown>).prompt).toBe(plan.assets[0].effective_prompt);
    expect(Object.keys(paid)).toEqual(["requests"]);
    const first = (paid.requests as Array<Record<string, unknown>>)[0];
    expect(Object.keys(first)).toEqual(["index", "params"]);
    expect(Object.keys(first.params as Record<string, unknown>).sort()).toEqual(["aspect_ratio", "count", "medias", "model", "prompt", "resolution", "use_unlim"]);
    const journal = JSON.parse(readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8")) as T013OperationsJournal;
    expect(journal.batches[0].transitions.map(({ state }) => state)).toEqual(["PREFLIGHT_REQUESTED", "PREFLIGHT_VERIFIED", "SUBMITTING"]);
    expect(journal.batches[0].preflight?.request_sha256).toBe(sha256(canonicalJson(request)));
  });

  test("persists changed numeric cost as terminal evidence and rejects invented get_cost fields", () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runT013OpsForTest(["preflight-request", "--batch", "materials-001", "--observed-at", at(base, 0)], root, plan, presentation, approval);
    writeJson(root, "inbox/cost.json", { cost: { credits: 1.51, credits_exact: 1.51 } });
    writeJson(root, "inbox/balance.json", { credits: 100 });
    const args = ["preflight-result", "--batch", "materials-001", "--cost-file", "inbox/cost.json", "--balance-file", "inbox/balance.json", "--provider-observed-at", at(base, 30), "--balance-observed-at", at(base, 31)];
    expect(() => runT013OpsForTest(args, root, plan, presentation, approval)).toThrow("PRICE_CHANGED");
    const journal = JSON.parse(readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8")) as T013OperationsJournal;
    expect(journal.run_state).toBe("FAIL_STOP");
    expect(journal.batches[0].terminal).toMatchObject({ automatic_retry: false, facts: { observed_cost: { credits: 1.51, credits_exact: 1.51 } } });
    expect(() => runT013OpsForTest(args, root, plan, presentation, approval)).toThrow("terminal or complete");

    const second = fixture();
    runT013OpsForTest(["init"], second.root, second.plan, second.presentation, second.approval);
    runT013OpsForTest(["preflight-request", "--batch", "materials-001", "--observed-at", at(base, 0)], second.root, second.plan, second.presentation, second.approval);
    writeJson(second.root, "inbox/cost.json", { cost: { credits: 1.5, credits_exact: 1.5 }, job_created: false });
    writeJson(second.root, "inbox/balance.json", { credits: 100 });
    expect(() => runT013OpsForTest(args, second.root, second.plan, second.presentation, second.approval)).toThrow("fields changed");
  });

  test("derives submitted jobs by provider index and fail-stops partial counts without resubmit", () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
    const response = validGenerateResponse(plan, 0) as { submitted_count: number; failed_count: number; jobs: unknown[] };
    response.submitted_count -= 1;
    response.jobs.pop();
    writeJson(root, "inbox/partial.json", response);
    expect(() => runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/partial.json", "--provider-observed-at", at(base, 50)], root, plan, presentation, approval)).toThrow("PARTIAL_OR_MISMATCHED");
    const journal = JSON.parse(readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8")) as T013OperationsJournal;
    expect(journal.batches[0].terminal?.facts).toMatchObject({ submitted_count: 11, failed_count: 0, observed_job_count: 11 });

    const duplicate = fixture();
    runT013OpsForTest(["init"], duplicate.root, duplicate.plan, duplicate.presentation, duplicate.approval);
    runPreflightAndPrepare(duplicate.root, duplicate.plan, duplicate.presentation, duplicate.approval, 0, 10000, base);
    const duplicateResponse = validGenerateResponse(duplicate.plan, 0) as { submitted_count: number; failed_count: number; jobs: Array<{ index: number; job_id: string; status: string }> };
    duplicateResponse.jobs[1].index = duplicateResponse.jobs[0].index;
    writeJson(duplicate.root, "inbox/duplicate.json", duplicateResponse);
    expect(() => runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/duplicate.json", "--provider-observed-at", at(base, 50)], duplicate.root, duplicate.plan, duplicate.presentation, duplicate.approval)).toThrow("PARTIAL_OR_MISMATCHED");
  });

  test("redacts actual optional generate job fields, preserves definite paid jobs, and fail-stops conservatively", () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
    const response = validGenerateResponse(plan, 0) as { jobs: Array<Record<string, unknown>> };
    Object.assign(response.jobs[0], {
      adjustments: { hidden: "raw-adjustment" },
      error: { message: "raw-provider-secret" },
      warning: "raw-provider-warning",
      preset_recommendation: "raw-provider-preset",
    });
    writeJson(root, "inbox/generate-signals.json", response);
    expect(() => runT013OpsForTest([
      "response", "--batch", "materials-001", "--file", "inbox/generate-signals.json", "--provider-observed-at", at(base, 50),
    ], root, plan, presentation, approval)).toThrow("PROVIDER_RESPONSE_SIGNAL");
    const journalText = readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
    const journal = JSON.parse(journalText) as T013OperationsJournal;
    expect(journal.batches[0].submission?.jobs).toHaveLength(12);
    expect(() => validateT013Journal(journal, plan, presentation, approval, root)).not.toThrow();
    expect(journal.batches[0].terminal?.facts).toMatchObject({
      definite_job_ids_preserved: true,
      benign_warning_allowlist: [],
      provider_job_signals: [{
        index: 0,
        job_id: "job-0",
        adjustments_present: true,
        error_present: true,
        warning_present: true,
        preset_recommendation_present: true,
      }],
    });
    for (const secret of ["raw-adjustment", "raw-provider-secret", "raw-provider-warning", "raw-provider-preset"]) {
      expect(journalText).not.toContain(secret);
    }
  });

  test("adapts exact jobs_wait envelopes, strips sensitive fields, and fail-stops failures/model drift", () => {
    const live = validLiveJobs(buildT013MaterialsPlan(repositoryRoot), 0);
    const redacted = redactT013JobsWaitResponse(live, "2026-08-11T14:01:00.000Z");
    expect(redacted.transient_downloads).toHaveLength(12);
    expect(JSON.stringify(redacted.observation)).not.toContain("https://");
    expect(JSON.stringify(redacted.observation)).not.toContain("result_url");
    expect(JSON.stringify(redacted.observation)).not.toContain("thumbnail_url");
    expect(JSON.stringify(redacted.observation)).not.toContain("error");
    const inProgress = validLiveJobs(buildT013MaterialsPlan(repositoryRoot), 0);
    inProgress.all_terminal = false;
    inProgress.jobs[0] = { index: 0, job_id: "job-0", status: "in_progress", retryable: true, type: "image" };
    expect(redactT013JobsWaitResponse(inProgress, "2026-08-11T14:00:59.000Z").observation.jobs[0]).toMatchObject({ status: "in_progress", model: null, download_available: false, permanent_lookup_failure: false });
    inProgress.jobs[0] = { index: 0, job_id: "job-0", status: "lookup_failed", error: { message: "provider detail" }, retryable: false, type: "lookup" };
    const permanent = redactT013JobsWaitResponse(inProgress, "2026-08-11T14:00:59.500Z").observation;
    expect(permanent.jobs[0].permanent_lookup_failure).toBe(true);
    expect(permanent.jobs[0].lookup_retryable).toBe(false);
    expect(JSON.stringify(permanent)).not.toContain("provider detail");
    expect(() => redactT013JobsWaitResponse({ ...live, unknown: true }, "2026-08-11T14:01:00.000Z")).toThrow("fields changed");
    for (const mode of ["FAILED", "MODEL", "PERMANENT"] as const) {
      const { plan, presentation, approval, root } = fixture();
      runT013OpsForTest(["init"], root, plan, presentation, approval);
      const base = Date.parse("2026-08-11T14:00:00.000Z");
      runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
      writeJson(root, "inbox/generate.json", validGenerateResponse(plan, 0));
      runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/generate.json", "--provider-observed-at", at(base, 50)], root, plan, presentation, approval);
      expect(runT013OpsForTest(["jobs-request", "--batch", "materials-001"], root, plan, presentation, approval)).toEqual({ jobs: plan.batches[0].asset_ids.map((id) => { const asset = plan.assets.find((item) => item.id === id)!; return { index: asset.index, job_id: `job-${asset.index}` }; }) });
      const observation = redactT013JobsWaitResponse(validLiveJobs(plan, 0), at(base, 60)).observation;
      if (mode === "FAILED") { observation.jobs[0].status = "failed"; observation.jobs[0].download_available = false; }
      else if (mode === "MODEL") observation.jobs[0].model = "drift";
      else {
        observation.jobs[0].status = "lookup_failed";
        observation.jobs[0].model = null;
        observation.jobs[0].download_available = false;
        observation.jobs[0].permanent_lookup_failure = true;
        observation.jobs[0].lookup_retryable = false;
      }
      writeJson(root, "inbox/jobs.json", observation);
      expect(() => runT013OpsForTest(["jobs", "--batch", "materials-001", "--file", "inbox/jobs.json"], root, plan, presentation, approval)).toThrow(mode === "MODEL" ? "MODEL_DRIFT" : "GENERATION_FAILED");
      const journalText = readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
      const terminalJournal = JSON.parse(journalText) as T013OperationsJournal;
      expect(() => validateT013Journal(terminalJournal, plan, presentation, approval, root)).not.toThrow();
      expect(journalText).not.toContain("https://");
      expect(journalText).not.toContain("result_url");
    }
  });

  test("rejects localhost, numeric IP, IPv6, mapped IPv6, and malformed result hosts at the wire boundary", () => {
    const base = validLiveJobs(buildT013MaterialsPlan(repositoryRoot), 0);
    const unsafeUrls = [
      "https://localhost/result.png",
      "https://worker.localhost/result.png",
      "https://127.0.0.1/result.png",
      "https://93.184.216.34/result.png",
      "https://2130706433/result.png",
      "https://0x7f000001/result.png",
      "https://0177.0.0.1/result.png",
      "https://127.1/result.png",
      "https://169.254.169.254/latest/meta-data/result.png",
      "https://[::1]/result.png",
      "https://[::ffff:127.0.0.1]/result.png",
      "https://single-label/result.png",
      "https://bad_host.example/result.png",
      "https://cdn.example:8443/result.png",
    ];
    for (const resultUrl of unsafeUrls) {
      const live = clone(base);
      live.jobs[0].result_url = resultUrl;
      expect(() => redactT013JobsWaitResponse(live, "2026-08-11T14:01:00.000Z")).toThrow("result_url");
    }
    const defaultPort = clone(base);
    defaultPort.jobs[0].result_url = "https://cdn.example:443/result.png";
    expect(() => redactT013JobsWaitResponse(defaultPort, "2026-08-11T14:01:00.000Z")).not.toThrow();
  });

  test("keeps retryable lookup_failed on the same paid job and fail-stops false or missing retryability", async () => {
    const retryable = fixture();
    runT013OpsForTest(["init"], retryable.root, retryable.plan, retryable.presentation, retryable.approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runPreflightAndPrepare(retryable.root, retryable.plan, retryable.presentation, retryable.approval, 0, 10000, base);
    writeJson(retryable.root, "inbox/generate.json", validGenerateResponse(retryable.plan, 0));
    runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/generate.json", "--provider-observed-at", at(base, 50)], retryable.root, retryable.plan, retryable.presentation, retryable.approval);
    const retryableLive = validLiveJobs(retryable.plan, 0);
    retryableLive.jobs[0] = { index: 0, job_id: "job-0", status: "lookup_failed", error: { message: "lookup-secret" }, retryable: true, type: "lookup" };
    const transportSpy = vi.fn(async (request: TestPinnedRequest) => pngResponse(request));
    const temporaryRoot = resolve(retryable.root, "temporary");
    mkdirSync(temporaryRoot);
    await expect(runT013JobsHandoffForTest(
      ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 60), "--file", "forbidden.json"],
      JSON.stringify(retryableLive), retryable.root, retryable.plan, retryable.presentation, retryable.approval,
      { resolve_hostname: publicResolver, https_transport: transportSpy, temporary_root: temporaryRoot, now: () => new Date(at(base, 70)) },
    )).rejects.toThrow("stdin-only");
    const result = await runT013JobsHandoffForTest(
      ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 60)],
      JSON.stringify(retryableLive), retryable.root, retryable.plan, retryable.presentation, retryable.approval,
      { resolve_hostname: publicResolver, https_transport: transportSpy, temporary_root: temporaryRoot, now: () => new Date(at(base, 70)) },
    );
    expect(result).toMatchObject({ state: "SUBMITTED", same_job_repoll_required: true, retryable_lookup_jobs: 1, downloaded: 11, recovered: 11 });
    expect(transportSpy).toHaveBeenCalledTimes(11);
    const sameJobs = runT013OpsForTest(["jobs-request", "--batch", "materials-001"], retryable.root, retryable.plan, retryable.presentation, retryable.approval);
    expect(sameJobs).toEqual({ jobs: retryable.plan.batches[0].asset_ids.map((id) => { const asset = retryable.plan.assets.find((item) => item.id === id)!; return { index: asset.index, job_id: `job-${asset.index}` }; }) });
    const retryableJournal = readFileSync(resolve(retryable.root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
    expect(retryableJournal).not.toContain("lookup-secret");
    expect(retryableJournal).not.toContain("https://");
    const completed = await runT013JobsHandoffForTest(
      ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 80)],
      JSON.stringify(validLiveJobs(retryable.plan, 0)), retryable.root, retryable.plan, retryable.presentation, retryable.approval,
      { resolve_hostname: publicResolver, https_transport: transportSpy, temporary_root: temporaryRoot, now: () => new Date(at(base, 90)) },
    );
    expect(completed).toMatchObject({ state: "RECOVERED", downloaded: 1, recovered: 12 });
    expect(transportSpy).toHaveBeenCalledTimes(12);
    const completedJournal = JSON.parse(readFileSync(resolve(retryable.root, "assets/runs/t013-materials/operations-v1.json"), "utf8")) as T013OperationsJournal;
    expect(completedJournal.batches[0].transitions.map(({ state }) => state)).toEqual(["PREFLIGHT_REQUESTED", "PREFLIGHT_VERIFIED", "SUBMITTING", "SUBMITTED", "JOBS_VERIFIED", "RECOVERING", "RECOVERED"]);
    expect(() => validateT013Journal(completedJournal, retryable.plan, retryable.presentation, retryable.approval, retryable.root)).not.toThrow();

    for (const retryability of [false, undefined] as const) {
      const current = fixture();
      runT013OpsForTest(["init"], current.root, current.plan, current.presentation, current.approval);
      runPreflightAndPrepare(current.root, current.plan, current.presentation, current.approval, 0, 10000, base);
      writeJson(current.root, "inbox/generate.json", validGenerateResponse(current.plan, 0));
      runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/generate.json", "--provider-observed-at", at(base, 50)], current.root, current.plan, current.presentation, current.approval);
      const live = validLiveJobs(current.plan, 0);
      live.jobs[0] = { index: 0, job_id: "job-0", status: "lookup_failed", error: { message: "terminal-lookup-secret" }, type: "lookup", ...(retryability === undefined ? {} : { retryable: retryability }) };
      await expect(runT013JobsHandoffForTest(
        ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 60)],
        JSON.stringify(live), current.root, current.plan, current.presentation, current.approval,
        { resolve_hostname: publicResolver, https_transport: transportSpy, temporary_root: temporaryRoot, now: () => new Date(at(base, 70)) },
      )).rejects.toThrow("GENERATION_FAILED");
      const journalText = readFileSync(resolve(current.root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
      const journal = JSON.parse(journalText) as T013OperationsJournal;
      expect(journal.run_state).toBe("FAIL_STOP");
      expect(journal.batches[0].terminal?.facts).toMatchObject({
        lookup_retryability: retryability === false ? "NON_RETRYABLE" : "MISSING_AMBIGUOUS",
        same_job_repoll_allowed: false,
        automatic_resubmit_allowed: false,
      });
      expect(journalText).not.toContain("terminal-lookup-secret");
      expect(journalText).not.toContain("https://");
    }
  });

  test("stdin handoff downloads and atomically ingests completed jobs without leaking URLs", async () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
    writeJson(root, "inbox/generate.json", validGenerateResponse(plan, 0));
    runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/generate.json", "--provider-observed-at", at(base, 50)], root, plan, presentation, approval);
    const live = validLiveJobs(plan, 0);
    live.jobs.forEach((job) => {
      job.result_url = `https://download.example.com/result-${job.index}.png?signed=never-persist-${job.index}`;
      job.thumbnail_url = `https://download.example.com/thumb-${job.index}.png?token=never-persist`;
    });
    const resultUrlByIndex = new Map(live.jobs.map(({ index, result_url }) => [index, result_url]));
    live.jobs.reverse();
    const fetched: string[] = [];
    const pinnedRequests: TestPinnedRequest[] = [];
    const expectedBytes = new Map<number, Buffer>();
    const transport = vi.fn(async (request: TestPinnedRequest) => {
      const url = request.url.toString();
      fetched.push(url);
      pinnedRequests.push(request);
      const match = /result-(\d+)\.png/.exec(url);
      if (!match) return pngResponse(request, png(), { status_code: 404, body: null });
      const index = Number(match[1]);
      const bytes = png(index + 1);
      expectedBytes.set(index, bytes);
      return pngResponse(request, bytes);
    });
    const temporaryRoot = resolve(root, "temporary");
    mkdirSync(temporaryRoot);
    let nowOffset = 70;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await runT013JobsHandoffForTest(
        ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 60)],
        JSON.stringify(live), root, plan, presentation, approval,
        { resolve_hostname: publicResolver, https_transport: transport, temporary_root: temporaryRoot, now: () => new Date(at(base, nowOffset++)) },
      );
      expect(result).toMatchObject({ command: "jobs-handoff", state: "RECOVERED", downloaded: 12, recovered: 12 });
      expect(JSON.stringify(result)).not.toContain("https://");
      expect(JSON.stringify(result)).not.toContain("never-persist");
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
    expect(fetched).toEqual(plan.batches[0].asset_ids.map((id) => {
      const asset = plan.assets.find((item) => item.id === id)!;
      return resultUrlByIndex.get(asset.index);
    }));
    expect(pinnedRequests.every(({ hostname, servername, pinned_address, family, method, signal, headers }) =>
      hostname === "download.example.com" && servername === hostname && pinned_address === TEST_PUBLIC_ADDRESS && family === 4 &&
      method === "GET" && signal instanceof AbortSignal && headers.accept === "image/png"
    )).toBe(true);
    for (const assetId of plan.batches[0].asset_ids) {
      const asset = plan.assets.find(({ id }) => id === assetId)!;
      const expected = expectedBytes.get(asset.index)!;
      const localPath = resolve(root, "public/assets", asset.path);
      const backupPath = resolve(root, "assets/backups/t013-materials", asset.path);
      expect(statSync(localPath).isFile()).toBe(true);
      expect(readFileSync(localPath)).toEqual(expected);
      expect(readFileSync(backupPath)).toEqual(expected);
    }
    expect(readdirSync(temporaryRoot)).toEqual([]);
    const journalText = readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
    const journal = JSON.parse(journalText) as T013OperationsJournal;
    expect(journal.batches[0].recoveries.map(({ asset_id }) => asset_id)).toEqual(plan.batches[0].asset_ids);
    expect(journal.batches[0].job_polls).toEqual([
      expect.objectContaining({ observation_source: "JOBS_HANDOFF_STDIN" }),
    ]);
    expect(journal.batches[0].recoveries.every((recovery) =>
      recovery.recovery_source === "JOBS_HANDOFF_STDIN" &&
      recovery.provider_job_id === `job-${recovery.provider_job_index}`
    )).toBe(true);
    for (const path of regularFiles(root)) {
      const text = readFileSync(path).toString("utf8");
      expect(text).not.toContain("https://download.example.com");
      expect(text).not.toContain("never-persist");
      expect(text).not.toContain("result_url");
      expect(text).not.toContain("thumbnail_url");
    }
  });

  test("accepts a public IPv6 answer while pinning the address and original TLS identity", async () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
    writeJson(root, "inbox/generate.json", validGenerateResponse(plan, 0));
    runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/generate.json", "--provider-observed-at", at(base, 50)], root, plan, presentation, approval);
    const live = validLiveJobs(plan, 0);
    live.all_terminal = false;
    live.summary = { completed: 1, in_progress: 11 };
    live.jobs[0].result_url = "https://ipv6-cdn.example.com/result.png?secret=never-persist-v6";
    for (let index = 1; index < live.jobs.length; index += 1) {
      live.jobs[index] = { index, job_id: `job-${index}`, status: "in_progress", type: "image" };
    }
    const requests: TestPinnedRequest[] = [];
    const transport = vi.fn(async (request: TestPinnedRequest) => {
      requests.push(request);
      return pngResponse(request, png(), { remote_address: "2606:4700:4700:0:0:0:0:1111" });
    });
    const temporaryRoot = resolve(root, "temporary");
    mkdirSync(temporaryRoot);
    const result = await runT013JobsHandoffForTest(
      ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 60)],
      JSON.stringify(live), root, plan, presentation, approval,
      {
        resolve_hostname: async () => [{ address: "2606:4700:4700::1111", family: 6 }],
        https_transport: transport,
        temporary_root: temporaryRoot,
        now: () => new Date(at(base, 70)),
      },
    );
    expect(result).toMatchObject({ state: "SUBMITTED", downloaded: 1, recovered: 1 });
    expect(requests).toEqual([
      expect.objectContaining({
        hostname: "ipv6-cdn.example.com",
        servername: "ipv6-cdn.example.com",
        pinned_address: "2606:4700:4700::1111",
        family: 6,
      }),
    ]);
    const journalText = readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
    expect(journalText).not.toContain("ipv6-cdn.example.com");
    expect(journalText).not.toContain("never-persist-v6");
  });

  test("fail-closes private, mixed, empty, rebinding, and redirect DNS paths without URL leakage", async () => {
    const cases: Array<{
      name: string;
      hostname: string;
      resolveHostname: (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
      transport?: (request: TestPinnedRequest) => Promise<TestPinnedResponse>;
      reason: string;
      expectedTransportCalls: number;
    }> = [
      {
        name: "private",
        hostname: "private.example",
        resolveHostname: async () => [{ address: "10.0.0.7", family: 4 }],
        reason: "DNS_ADDRESS_REJECTED",
        expectedTransportCalls: 0,
      },
      {
        name: "mixed",
        hostname: "mixed.example",
        resolveHostname: async () => [
          { address: TEST_PUBLIC_ADDRESS, family: 4 },
          { address: "169.254.169.254", family: 4 },
        ],
        reason: "DNS_ADDRESS_REJECTED",
        expectedTransportCalls: 0,
      },
      {
        name: "private-ipv6",
        hostname: "private-v6.example",
        resolveHostname: async () => [{ address: "fd00::7", family: 6 }],
        reason: "DNS_ADDRESS_REJECTED",
        expectedTransportCalls: 0,
      },
      {
        name: "mapped-ipv6",
        hostname: "mapped-v6.example",
        resolveHostname: async () => [{ address: "::ffff:127.0.0.1", family: 6 }],
        reason: "DNS_ADDRESS_REJECTED",
        expectedTransportCalls: 0,
      },
      {
        name: "link-local-ipv6",
        hostname: "link-v6.example",
        resolveHostname: async () => [{ address: "fe80::1", family: 6 }],
        reason: "DNS_ADDRESS_REJECTED",
        expectedTransportCalls: 0,
      },
      {
        name: "empty",
        hostname: "empty.example",
        resolveHostname: async () => [],
        reason: "DNS_RESOLUTION_REJECTED",
        expectedTransportCalls: 0,
      },
      {
        name: "error",
        hostname: "error.example",
        resolveHostname: async () => { throw new Error("resolver-secret"); },
        reason: "DNS_RESOLUTION_REJECTED",
        expectedTransportCalls: 0,
      },
      {
        name: "rebinding",
        hostname: "rebind.example",
        resolveHostname: publicResolver,
        transport: async (request) => pngResponse(request, png(), { remote_address: "127.0.0.1" }),
        reason: "PINNED_ADDRESS_MISMATCH",
        expectedTransportCalls: 1,
      },
      {
        name: "redirect-private",
        hostname: "redirect.example",
        resolveHostname: publicResolver,
        transport: async (request) => pngResponse(request, png(), {
          status_code: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data/redirect-secret" },
          body: null,
        }),
        reason: "REDIRECT_TARGET_REJECTED",
        expectedTransportCalls: 1,
      },
      {
        name: "redirect-private-dns",
        hostname: "redirect-dns.example",
        resolveHostname: async (hostname) => hostname === "redirect-target.example"
          ? [{ address: "10.8.0.9", family: 4 }]
          : [{ address: TEST_PUBLIC_ADDRESS, family: 4 }],
        transport: async (request) => pngResponse(request, png(), {
          status_code: 307,
          headers: { location: "https://redirect-target.example/result.png?redirect-secret=never-persist" },
          body: null,
        }),
        reason: "DNS_ADDRESS_REJECTED",
        expectedTransportCalls: 1,
      },
    ];

    for (const current of cases) {
      const { plan, presentation, approval, root } = fixture();
      runT013OpsForTest(["init"], root, plan, presentation, approval);
      const base = Date.parse("2026-08-11T14:00:00.000Z");
      runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
      writeJson(root, "inbox/generate.json", validGenerateResponse(plan, 0));
      runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/generate.json", "--provider-observed-at", at(base, 50)], root, plan, presentation, approval);
      const live = validLiveJobs(plan, 0);
      live.jobs[0].result_url = `https://${current.hostname}/result.png?secret=never-persist-${current.name}`;
      const transport = vi.fn(current.transport ?? (async (request: TestPinnedRequest) => pngResponse(request)));
      const temporaryRoot = resolve(root, "temporary");
      mkdirSync(temporaryRoot);
      let rejection: Error | undefined;
      try {
        await runT013JobsHandoffForTest(
          ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 60)],
          JSON.stringify(live), root, plan, presentation, approval,
          {
            resolve_hostname: current.resolveHostname,
            https_transport: transport,
            temporary_root: temporaryRoot,
            now: () => new Date(at(base, 70)),
          },
        );
      } catch (error) {
        rejection = error as Error;
      }
      expect(rejection?.message).toContain("RECOVERY_FAILED");
      expect(rejection?.message).not.toContain(current.hostname);
      expect(rejection?.message).not.toContain("never-persist");
      expect(transport).toHaveBeenCalledTimes(current.expectedTransportCalls);
      const journalText = readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
      const journal = JSON.parse(journalText) as T013OperationsJournal;
      expect(journal.batches[0].terminal?.facts).toMatchObject({ reason_code: current.reason });
      expect(journalText).not.toContain(current.hostname);
      expect(journalText).not.toContain("never-persist");
      expect(journalText).not.toContain("resolver-secret");
      expect(readdirSync(temporaryRoot)).toEqual([]);
    }
  });

  test("handoff enforces declared PNG size and records only a safe download failure", async () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const base = Date.parse("2026-08-11T14:00:00.000Z");
    runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
    writeJson(root, "inbox/generate.json", validGenerateResponse(plan, 0));
    runT013OpsForTest(["response", "--batch", "materials-001", "--file", "inbox/generate.json", "--provider-observed-at", at(base, 50)], root, plan, presentation, approval);
    const live = validLiveJobs(plan, 0);
    live.jobs[0].result_url = "https://download.example.com/oversize.png?secret=never-persist-size";
    const temporaryRoot = resolve(root, "temporary");
    mkdirSync(temporaryRoot);
    let rejection: Error | undefined;
    try {
      await runT013JobsHandoffForTest(
        ["jobs-handoff", "--batch", "materials-001", "--provider-observed-at", at(base, 60)],
        JSON.stringify(live), root, plan, presentation, approval,
        {
          resolve_hostname: publicResolver,
          https_transport: async (request: TestPinnedRequest) => pngResponse(request, png(), { headers: { "content-type": "image/png", "content-length": "999999999" } }),
          temporary_root: temporaryRoot,
          now: () => new Date(at(base, 70)),
        },
      );
    } catch (error) {
      rejection = error as Error;
    }
    expect(rejection?.message).toContain("RECOVERY_FAILED");
    expect(rejection?.message).not.toContain("download.example.com");
    expect(rejection?.message).not.toContain("never-persist-size");
    const journalText = readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8");
    const journal = JSON.parse(journalText) as T013OperationsJournal;
    expect(journal.batches[0].terminal?.facts).toMatchObject({ reason_code: "CONTENT_LENGTH_INVALID", http_status: null });
    expect(() => validateT013Journal(journal, plan, presentation, approval, root)).not.toThrow();
    expect(journalText).not.toContain("download.example.com");
    expect(journalText).not.toContain("never-persist-size");
    expect(readdirSync(temporaryRoot)).toEqual([]);
  });

  test("fail-stops invalid recovery and exact balance delta", async () => {
    for (const mode of ["PNG", "BALANCE"] as const) {
      const { plan, presentation, approval, root } = fixture();
      runT013OpsForTest(["init"], root, plan, presentation, approval);
      const base = Date.parse("2026-08-11T14:00:00.000Z");
      runPreflightAndPrepare(root, plan, presentation, approval, 0, 10000, base);
      if (mode === "PNG") {
        submitAndCompleteJobs(root, plan, presentation, approval, 0, base);
        writeFileSync(resolve(root, "not-png"), "bad");
        expect(() => runT013OpsForTest(["ingest", "--batch", "materials-001", "--asset", plan.batches[0].asset_ids[0], "--input-png", "not-png", "--observed-at", at(base, 70)], root, plan, presentation, approval)).toThrow("RECOVERY_FAILED");
      } else {
        await submitAndHandoffJobs(root, plan, presentation, approval, 0, base);
        writeJson(root, "inbox/balance-after.json", { credits: 81.99 });
        expect(() => runT013OpsForTest(["balance-after", "--batch", "materials-001", "--file", "inbox/balance-after.json", "--provider-observed-at", at(base, 90)], root, plan, presentation, approval)).toThrow("AMBIGUOUS_BALANCE");
      }
    }
  });

  test("accepts only a production-equivalent full handoff history and gates evidence/contact on all 52", async () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const balances = [10000, 8200, 6400, 4600, 2800, 2200];
    for (let batchIndex = 0; batchIndex < 5; batchIndex += 1) {
      const base = Date.parse("2026-08-11T14:00:00.000Z") + batchIndex * 20 * 60 * 1000;
      runPreflightAndPrepare(root, plan, presentation, approval, batchIndex, balances[batchIndex], base);
      await submitAndHandoffJobs(root, plan, presentation, approval, batchIndex, base);
      const after = balances[batchIndex + 1];
      writeJson(root, `inbox/balance-after-${batchIndex}.json`, { credits: after / 100 });
      runT013OpsForTest(["balance-after", "--batch", plan.batches[batchIndex].id, "--file", `inbox/balance-after-${batchIndex}.json`, "--provider-observed-at", at(base, 90)], root, plan, presentation, approval);
    }
    const journal = JSON.parse(readFileSync(resolve(root, "assets/runs/t013-materials/operations-v1.json"), "utf8")) as T013OperationsJournal;
    expect(() => validateT013Journal(journal, plan, presentation, approval, root)).not.toThrow();
    expect((buildT013ActualEvidence(journal, plan).asset_order as string[])).toHaveLength(52);
    const html = renderT013ContactSheetHtml(journal, plan, presentation, approval, root);
    expect((html.match(/<figure>/g) ?? [])).toHaveLength(52);
    const shortcut = clone(journal);
    shortcut.batches.forEach((batch) => { batch.transitions = [{ state: "COMPLETE", observed_at: "2026-08-11T14:00:00.000Z" }]; });
    expect(() => validateT013Journal(shortcut, plan, presentation, approval, root)).toThrow("transition sequence");
    const badPaid = clone(journal);
    badPaid.batches[0].paid_request!.request.requests[0].params.count = 2 as 1;
    expect(() => validateT013Journal(badPaid, plan, presentation, approval, root)).toThrow("paid request envelope");
    const badPoll = clone(journal);
    badPoll.batches[0].job_polls.at(-1)!.jobs[0].status = "pending";
    badPoll.batches[0].job_polls.at(-1)!.jobs[0].download_available = false;
    expect(() => validateT013Journal(badPoll, plan, presentation, approval, root)).toThrow("all_terminal");
    const failedPoll = clone(journal);
    failedPoll.batches[0].job_polls.at(-1)!.jobs[0].status = "canceled";
    failedPoll.batches[0].job_polls.at(-1)!.jobs[0].download_available = false;
    failedPoll.batches[0].job_polls.at(-1)!.all_terminal = false;
    expect(() => validateT013Journal(failedPoll, plan, presentation, approval, root)).toThrow("terminal failure");
    const lookupFailure = clone(journal);
    lookupFailure.batches[0].job_polls.at(-1)!.jobs[0].status = "lookup_failed";
    lookupFailure.batches[0].job_polls.at(-1)!.jobs[0].model = null;
    lookupFailure.batches[0].job_polls.at(-1)!.jobs[0].download_available = false;
    lookupFailure.batches[0].job_polls.at(-1)!.jobs[0].permanent_lookup_failure = true;
    lookupFailure.batches[0].job_polls.at(-1)!.jobs[0].lookup_retryable = false;
    expect(() => validateT013Journal(lookupFailure, plan, presentation, approval, root)).toThrow("terminal failure");
    const driftPoll = clone(journal);
    driftPoll.batches[0].job_polls.at(-1)!.jobs[0].model = "other-model";
    expect(() => validateT013Journal(driftPoll, plan, presentation, approval, root)).toThrow("model drift");
    const stalePreflight = clone(journal);
    stalePreflight.batches[0].preflight!.result!.provider_observed_at = at(Date.parse(stalePreflight.batches[0].preflight!.requested_at), 601);
    expect(() => validateT013Journal(stalePreflight, plan, presentation, approval, root)).toThrow("stale");
    const badBalanceChain = clone(journal);
    badBalanceChain.batches[1].preflight!.balance!.normalized_decimal = "81.99";
    expect(() => validateT013Journal(badBalanceChain, plan, presentation, approval, root)).toThrow();
    const badRecoveryOrder = clone(journal);
    badRecoveryOrder.batches[0].recoveries.reverse();
    expect(() => validateT013Journal(badRecoveryOrder, plan, presentation, approval, root)).toThrow();
    const forgedPollSource = clone(journal);
    forgedPollSource.batches[0].job_polls[0].observation_source = "DIAGNOSTIC_REDACTED_FILE";
    expect(() => validateT013Journal(forgedPollSource, plan, presentation, approval, root)).toThrow("handoff provenance");
    expect(() => buildT013ActualEvidence(forgedPollSource, plan)).toThrow("handoff provenance");
    const forgedRecoverySource = clone(journal);
    forgedRecoverySource.batches[0].recoveries[0].recovery_source = "DIAGNOSTIC_MANUAL_INPUT";
    expect(() => validateT013Journal(forgedRecoverySource, plan, presentation, approval, root)).toThrow("handoff provenance");
    const forgedJobBinding = clone(journal);
    forgedJobBinding.batches[0].recoveries[0].provider_job_id = "job-forged";
    expect(() => validateT013Journal(forgedJobBinding, plan, presentation, approval, root)).toThrow("binding");
    expect(runT013OpsForTest(["evidence"], root, plan, presentation, approval)).toMatchObject({ assets: 52 });
    expect(runT013OpsForTest(["contact-sheet"], root, plan, presentation, approval)).toMatchObject({ assets: 52 });
    expect(runT013OpsForTest(["contact-sheet"], root, plan, presentation, approval)).toMatchObject({ assets: 52 });
    const contactPath = resolve(root, "docs/asset-runs/contact-sheets/t013-materials-v1.html");
    unlinkSync(contactPath);
    symlinkSync(resolve(root, "assets/evidence/t013-materials-actual-run-v1.json"), contactPath);
    expect(() => runT013OpsForTest(["contact-sheet"], root, plan, presentation, approval)).toThrow(/SYMLINK|symlink/);
  }, 15_000);

  test("honors the operations lock", () => {
    const { plan, presentation, approval, root } = fixture();
    runT013OpsForTest(["init"], root, plan, presentation, approval);
    const lock = acquireRunnerLock(root, "assets/runs/t013-materials/operations-v1.lock");
    try {
      expect(() => runT013OpsForTest(["preflight-request", "--batch", "materials-001", "--observed-at", "2026-08-11T14:00:00.000Z"], root, plan, presentation, approval)).toThrow("RUNNER_LOCKED");
    } finally {
      lock.release();
    }
  });
});
