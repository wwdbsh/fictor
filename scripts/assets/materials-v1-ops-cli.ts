import { createHash, randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MAX_PNG_BYTES,
  acquireRunnerLock,
  assertNonOverlappingRoots,
  atomicWriteJson,
  atomicWriteVerifiedPng,
  backupVerifiedFile,
  safeResolve,
  verifyExistingPng,
} from "./filesystem";
import {
  T013_APPROVAL_PATH,
  T013_DISCLOSURE_PRESENTATION_PATH,
  T013_PLAN_PATH,
  T013_RISK_PATH,
  T013_SCHEMA_EVIDENCE_PATH,
  buildT013MaterialsPlan,
  buildT013ProviderSchemaEvidence,
  buildT013RiskDisclosure,
  isT013Authorized,
  renderCanonicalJson,
  renderT013MaterialsPlan,
  t013PlanSha256,
  validateT013ApprovalEvidence,
  validateT013DisclosurePresentationEvidence,
  type T013ApprovalEvidence,
  type T013DisclosurePresentationEvidence,
  type T013MaterialsPlan,
} from "./materials-v1";
import { canonicalJson } from "./style-candidates";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RUN_ROOT = "assets/runs/t013-materials";
const JOURNAL_PATH = `${RUN_ROOT}/operations-v1.json`;
const LOCK_PATH = `${RUN_ROOT}/operations-v1.lock`;
const ACTUAL_EVIDENCE_PATH = "assets/evidence/t013-materials-actual-run-v1.json";
const CONTACT_SHEET_PATH = "docs/asset-runs/contact-sheets/t013-materials-v1.html";
const LOCAL_ROOT = "public/assets";
const BACKUP_ROOT = "assets/backups/t013-materials";
const EXPECTED_REPORTED_MODEL = "nano_banana_flash";
const PREFLIGHT_FRESHNESS_MS = 10 * 60 * 1000;
const MAX_JOBS_WAIT_STDIN_BYTES = 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30 * 1000;
const MAX_DOWNLOAD_REDIRECTS = 3;

type T013JobsObservationSource = "JOBS_HANDOFF_STDIN" | "DIAGNOSTIC_REDACTED_FILE";
type T013RecoverySource = "JOBS_HANDOFF_STDIN" | "DIAGNOSTIC_MANUAL_INPUT";
type T013OpsSurface = "PRODUCTION" | "DIAGNOSTIC_TEST_ONLY";

type BatchState =
  | "PLANNED"
  | "PREFLIGHT_REQUESTED"
  | "PREFLIGHT_VERIFIED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "JOBS_VERIFIED"
  | "RECOVERING"
  | "RECOVERED"
  | "COMPLETE"
  | "FAIL_STOP";

type TerminalCode =
  | "PRICE_CHANGED"
  | "AMBIGUOUS_SUBMISSION"
  | "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE"
  | "JOB_RESPONSE_INVALID"
  | "PROVIDER_RESPONSE_SIGNAL"
  | "GENERATION_FAILED"
  | "MODEL_DRIFT"
  | "RECOVERY_FAILED"
  | "AMBIGUOUS_BALANCE";

interface PaidEnvelope {
  requests: T013MaterialsPlan["assets"][number]["request"][];
}

interface PreflightEnvelope {
  params: T013MaterialsPlan["assets"][number]["request"]["params"] & { get_cost: true };
}

const BATCH_SUBMIT_STATUSES = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "submission_failed"] as const;
type BatchSubmitStatus = (typeof BATCH_SUBMIT_STATUSES)[number];
const FAILED_BATCH_SUBMIT_STATUSES = new Set<BatchSubmitStatus>(["failed", "canceled", "nsfw", "ip_detected", "submission_failed"]);

const JOBS_WAIT_STATUSES = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"] as const;
type JobsWaitStatus = (typeof JOBS_WAIT_STATUSES)[number];
const FAILED_JOBS_WAIT_STATUSES = new Set<JobsWaitStatus>(["failed", "canceled", "nsfw", "ip_detected"]);

interface ProviderJobRecord {
  index: number;
  asset_id: string;
  job_id: string;
  status: BatchSubmitStatus;
  canonical_request_sha256: string;
}

interface RecoveryRecord {
  asset_id: string;
  provider_job_index: number;
  provider_job_id: string;
  recovery_source: T013RecoverySource;
  observed_at: string;
  local_relative_path: string;
  backup_relative_path: string;
  sha256: string;
  size_bytes: number;
  target_aspect_ratio: "3:4";
  actual_width: number;
  actual_height: number;
  aspect_error_ppm: number;
  provider_native_unmodified: true;
}

export interface T013RedactedJobsObservation {
  observation_source: T013JobsObservationSource;
  provider_observed_at: string;
  all_terminal: boolean;
  timed_out: boolean;
  aborted: boolean;
  jobs: Array<{
    index: number;
    job_id: string;
    status: JobsWaitStatus;
    model: string | null;
    download_available: boolean;
    permanent_lookup_failure: boolean;
    lookup_retryable: boolean | null;
    provider_failure_detail_present: boolean;
  }>;
}

type T013AdaptedJobsObservation = Omit<T013RedactedJobsObservation, "observation_source">;

export interface T013LiveJobsWaitResponse {
  all_terminal: boolean;
  jobs: Array<{
    index: number;
    job_id: string;
    status: JobsWaitStatus;
    model?: string;
    result_url?: string | null;
    thumbnail_url?: string | null;
    error?: unknown;
    retryable?: boolean;
    type?: string;
  }>;
  summary: Record<string, number>;
  poll_after_seconds?: number;
  timed_out?: boolean;
  aborted?: boolean;
}

export interface T013BatchRecord {
  batch_id: string;
  asset_ids: string[];
  state: BatchState;
  transitions: Array<{ state: BatchState; observed_at: string }>;
  preflight?: {
    request: PreflightEnvelope;
    request_sha256: string;
    requested_at: string;
    result?: {
      cost: { credits: number; credits_exact: 1.5; normalized_decimal: "1.50" };
      no_job_submission_observation: "DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED";
      provider_observed_at: string;
    };
    balance?: { credits: number; normalized_decimal: string; provider_observed_at: string };
  };
  paid_request?: { request: PaidEnvelope; request_sha256: string; prepared_at: string };
  submission?: {
    provider_observed_at: string;
    submitted_count: number;
    failed_count: 0;
    jobs: ProviderJobRecord[];
  };
  job_polls: T013RedactedJobsObservation[];
  jobs_verified_at?: string;
  recoveries: RecoveryRecord[];
  balance_after?: { credits: number; normalized_decimal: string; provider_observed_at: string; delta_decimal: string };
  terminal?: {
    code: TerminalCode;
    observed_at: string;
    facts: Record<string, unknown>;
    automatic_retry: false;
    new_scoped_approval_required_for_retry: true;
  };
}

export interface T013OperationsJournal {
  schema_version: 1;
  journal_version: "t013-materials-operations-v1";
  redacted: true;
  plan_sha256: string;
  disclosure_presentation_evidence_sha256: string;
  approval_evidence_sha256: string;
  run_state: "ACTIVE" | "FAIL_STOP" | "COMPLETE";
  initial_credit_cap_decimal: "78.00";
  automatic_paid_retry_reserve_decimal: "0.00";
  local_root: "public/assets";
  backup_root: "assets/backups/t013-materials";
  expected_provider_reported_model: "nano_banana_flash";
  batches: T013BatchRecord[];
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} fields changed`);
}

function allowedKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !(key in value))) throw new Error(`${label} fields changed`);
}

function providerIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) throw new Error(`invalid ${label}`);
  return value;
}

function providerModel(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("invalid provider model");
  return value;
}

function validateOpaqueProviderValue(value: unknown, label: string): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`invalid ${label}`);
  }
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > 64 * 1024) throw new Error(`invalid ${label}`);
}

function parseSyntacticallyApprovedHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 16 * 1024) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hostname.length === 0 || url.hostname.length > 253 || url.hostname.endsWith(".")) return null;
    const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
    if (isIP(hostname) !== 0 || !hostname.includes(".") || hostname === "localhost" || hostname.endsWith(".localhost") ||
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(hostname)) return null;
    if (url.port !== "") return null;
    return url;
  } catch {
    return null;
  }
}

function isHttpsUrl(value: unknown): value is string {
  return parseSyntacticallyApprovedHttpsUrl(value) !== null;
}

function decimalUnits(value: string): number {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) throw new Error("invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  const units = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(units)) throw new Error("invalid decimal");
  return units;
}

function decimalFromUnits(units: number): string {
  if (!Number.isSafeInteger(units)) throw new Error("invalid decimal units");
  const sign = units < 0 ? "-" : "";
  const absolute = Math.abs(units);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function normalizeProviderCredits(value: unknown, label: string): { value: number; units: number; decimal: string } {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number`);
  const units = Math.round(value * 100);
  if (!Number.isSafeInteger(units) || Math.abs(value * 100 - units) > 1e-9) throw new Error(`${label} cannot be represented exactly to two decimal places`);
  return { value, units, decimal: decimalFromUnits(units) };
}

function timestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("invalid observed_at timestamp");
  }
  return value;
}

function assertAtOrAfter(current: string, previous: string | undefined, label: string): void {
  timestamp(current);
  if (previous && Date.parse(current) < Date.parse(previous)) throw new Error(`${label} timestamp is out of order`);
}

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing ${name}`);
  return value;
}

function assertT013OpsSurfaceCommand(args: readonly string[], surface: T013OpsSurface): void {
  if (surface === "PRODUCTION" && (args[0] === "jobs" || args[0] === "ingest")) {
    throw new Error("T013 production surface rejects diagnostic-only command; use jobs-handoff stdin");
  }
}

function assertIsolatedTestRoot(runtimeRoot: string): string {
  const isolatedRoot = resolve(runtimeRoot);
  if (isolatedRoot === repositoryRoot || realpathSync(isolatedRoot) === realpathSync(repositoryRoot)) throw new Error("T013 test runtime root must be isolated");
  return isolatedRoot;
}

function planBatch(plan: T013MaterialsPlan, batchId: string) {
  const batch = plan.batches.find(({ id }) => id === batchId);
  if (!batch) throw new Error("unknown T013 plan batch");
  return batch;
}

function paidEnvelope(plan: T013MaterialsPlan, batchId: string): PaidEnvelope {
  const batch = planBatch(plan, batchId);
  return {
    requests: batch.asset_ids.map((assetId) => {
      const asset = plan.assets.find(({ id }) => id === assetId);
      if (!asset) throw new Error("T013 plan batch references an unknown asset");
      return asset.request;
    }),
  };
}

function preflightEnvelope(plan: T013MaterialsPlan, batchId: string): PreflightEnvelope {
  const representative = paidEnvelope(plan, batchId).requests[0];
  if (!representative) throw new Error("T013 batch has no representative asset");
  return { params: { ...representative.params, get_cost: true } };
}

function pricingSignature(params: T013MaterialsPlan["assets"][number]["request"]["params"]): string {
  return canonicalJson({
    model: params.model,
    aspect_ratio: params.aspect_ratio,
    resolution: params.resolution,
    count: params.count,
    use_unlim: params.use_unlim,
    medias: params.medias,
  });
}

function assertBatchPricingInvariant(plan: T013MaterialsPlan, batchId: string): void {
  const requests = paidEnvelope(plan, batchId).requests;
  const representative = requests[0];
  if (!representative) throw new Error("T013 batch has no representative asset");
  const signature = pricingSignature(representative.params);
  if (requests.some(({ params }) => pricingSignature(params) !== signature)) {
    throw new Error("T013 batch cost-affecting params differ from representative get_cost request");
  }
}

function batchFor(journal: T013OperationsJournal, batchId: string): { record: T013BatchRecord; index: number } {
  const index = journal.batches.findIndex(({ batch_id }) => batch_id === batchId);
  if (index < 0) throw new Error("unknown T013 batch");
  return { record: journal.batches[index], index };
}

function transition(record: T013BatchRecord, state: BatchState, observedAt: string): void {
  record.state = state;
  record.transitions.push({ state, observed_at: timestamp(observedAt) });
}

function terminal(journal: T013OperationsJournal, record: T013BatchRecord, code: TerminalCode, observedAt: string, facts: Record<string, unknown>): never {
  record.terminal = { code, observed_at: timestamp(observedAt), facts, automatic_retry: false, new_scoped_approval_required_for_retry: true };
  transition(record, "FAIL_STOP", observedAt);
  journal.run_state = "FAIL_STOP";
  throw new Error(`${code}: T013 fail-stop; no automatic retry`);
}

function assertProgressOrder(journal: T013OperationsJournal, index: number): void {
  if (journal.run_state !== "ACTIVE") throw new Error("T013 journal is terminal or complete");
  if (journal.batches.slice(0, index).some(({ state }) => state !== "COMPLETE")) throw new Error("previous T013 batch is not complete");
  if (journal.batches.slice(index + 1).some(({ state }) => state !== "PLANNED")) throw new Error("later T013 batch progressed out of order");
}

function canonicalEvidenceSha(value: unknown): string {
  return sha256(renderCanonicalJson(value));
}

export function buildInitialT013Journal(
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
): T013OperationsJournal {
  return {
    schema_version: 1,
    journal_version: "t013-materials-operations-v1",
    redacted: true,
    plan_sha256: t013PlanSha256(plan),
    disclosure_presentation_evidence_sha256: canonicalEvidenceSha(presentation),
    approval_evidence_sha256: canonicalEvidenceSha(approval),
    run_state: "ACTIVE",
    initial_credit_cap_decimal: "78.00",
    automatic_paid_retry_reserve_decimal: "0.00",
    local_root: LOCAL_ROOT,
    backup_root: BACKUP_ROOT,
    expected_provider_reported_model: EXPECTED_REPORTED_MODEL,
    batches: plan.batches.map((batch) => ({
      batch_id: batch.id,
      asset_ids: [...batch.asset_ids],
      state: "PLANNED",
      transitions: [],
      job_polls: [],
      recoveries: [],
    })),
  };
}

function expectedTransitions(record: T013BatchRecord): Array<{ state: BatchState; observed_at: string }> {
  const transitions: Array<{ state: BatchState; observed_at: string }> = [];
  if (record.preflight) transitions.push({ state: "PREFLIGHT_REQUESTED", observed_at: record.preflight.requested_at });
  if (record.preflight?.result && record.preflight.balance) transitions.push({ state: "PREFLIGHT_VERIFIED", observed_at: record.preflight.balance.provider_observed_at });
  if (record.paid_request) transitions.push({ state: "SUBMITTING", observed_at: record.paid_request.prepared_at });
  if (record.submission) transitions.push({ state: "SUBMITTED", observed_at: record.submission.provider_observed_at });
  if (record.jobs_verified_at) transitions.push({ state: "JOBS_VERIFIED", observed_at: record.jobs_verified_at });
  if (record.jobs_verified_at && record.recoveries.length > 0) {
    const firstRecoveryAt = record.recoveries[0].observed_at;
    const recoveringAt = Date.parse(firstRecoveryAt) < Date.parse(record.jobs_verified_at) ? record.jobs_verified_at : firstRecoveryAt;
    transitions.push({ state: "RECOVERING", observed_at: recoveringAt });
    if (record.recoveries.length === record.asset_ids.length) {
      const lastRecoveryAt = record.recoveries.at(-1)!.observed_at;
      transitions.push({ state: "RECOVERED", observed_at: Date.parse(lastRecoveryAt) < Date.parse(record.jobs_verified_at) ? record.jobs_verified_at : lastRecoveryAt });
    }
  }
  if (record.balance_after) transitions.push({ state: "COMPLETE", observed_at: record.balance_after.provider_observed_at });
  if (record.terminal) transitions.push({ state: "FAIL_STOP", observed_at: record.terminal.observed_at });
  return transitions;
}

function validatePreflight(record: T013BatchRecord, plan: T013MaterialsPlan): void {
  if (!record.preflight) return;
  assertBatchPricingInvariant(plan, record.batch_id);
  const expected = preflightEnvelope(plan, record.batch_id);
  if (canonicalJson(record.preflight.request) !== canonicalJson(expected) || record.preflight.request_sha256 !== sha256(canonicalJson(expected))) {
    throw new Error("T013 preflight request envelope changed");
  }
  timestamp(record.preflight.requested_at);
  if ((record.preflight.result === undefined) !== (record.preflight.balance === undefined)) throw new Error("T013 preflight result and balance must be paired");
  if (record.preflight.result) {
    const result = record.preflight.result;
    normalizeProviderCredits(result.cost.credits, "T013 preflight display credits");
    if (result.cost.credits_exact !== 1.5 || result.cost.normalized_decimal !== "1.50" || result.no_job_submission_observation !== "DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED") throw new Error("T013 preflight unit cost changed");
    timestamp(result.provider_observed_at);
    assertAtOrAfter(result.provider_observed_at, record.preflight.requested_at, "preflight result");
    if (Date.parse(result.provider_observed_at) - Date.parse(record.preflight.requested_at) > PREFLIGHT_FRESHNESS_MS) throw new Error("T013 preflight cost is stale");
  }
  if (record.preflight.balance) {
    const balance = record.preflight.balance;
    if (normalizeProviderCredits(balance.credits, "T013 preflight balance").decimal !== balance.normalized_decimal) throw new Error("T013 preflight balance representations differ");
    timestamp(balance.provider_observed_at);
    assertAtOrAfter(balance.provider_observed_at, record.preflight.result?.provider_observed_at ?? record.preflight.requested_at, "preflight balance");
    if (Date.parse(balance.provider_observed_at) - Date.parse(record.preflight.requested_at) > PREFLIGHT_FRESHNESS_MS) throw new Error("T013 preflight balance is stale");
  }
}

function validateSubmission(record: T013BatchRecord, plan: T013MaterialsPlan): void {
  const expectedPaid = paidEnvelope(plan, record.batch_id);
  if (record.paid_request && (canonicalJson(record.paid_request.request) !== canonicalJson(expectedPaid) || record.paid_request.request_sha256 !== sha256(canonicalJson(expectedPaid)))) {
    throw new Error("T013 paid request envelope changed");
  }
  if (record.paid_request) timestamp(record.paid_request.prepared_at);
  if (!record.submission) return;
  if (!record.paid_request) throw new Error("T013 submission lacks paid request");
  if (record.submission.submitted_count !== record.asset_ids.length || record.submission.failed_count !== 0 || record.submission.jobs.length !== record.asset_ids.length) {
    throw new Error("T013 submitted response counts changed");
  }
  timestamp(record.submission.provider_observed_at);
  assertAtOrAfter(record.submission.provider_observed_at, record.paid_request.prepared_at, "T013 submission");
  const jobIds = new Set<string>();
  record.submission.jobs.forEach((job, position) => {
    const asset = plan.assets.find(({ id }) => id === record.asset_ids[position]);
    if (!asset || job.index !== asset.index || job.asset_id !== asset.id || !BATCH_SUBMIT_STATUSES.includes(job.status) ||
        job.canonical_request_sha256 !== asset.canonical_request_sha256 || providerIdentifier(job.job_id, "submitted job_id") !== job.job_id || jobIds.has(job.job_id)) {
      throw new Error("T013 submitted job topology changed");
    }
    if (FAILED_BATCH_SUBMIT_STATUSES.has(job.status) && record.state !== "FAIL_STOP") throw new Error("T013 failed submission status escaped fail-stop");
    jobIds.add(job.job_id);
  });
}

function validatePolls(record: T013BatchRecord): void {
  let previousAt = record.submission?.provider_observed_at;
  const previousStatus = new Map<number, BatchSubmitStatus | JobsWaitStatus>(record.submission?.jobs.map(({ index, status }) => [index, status]) ?? []);
  for (const poll of record.job_polls) {
    exactKeys(poll as unknown as Record<string, unknown>, ["observation_source", "provider_observed_at", "all_terminal", "timed_out", "aborted", "jobs"], "T013 jobs_wait journal observation");
    if (!["JOBS_HANDOFF_STDIN", "DIAGNOSTIC_REDACTED_FILE"].includes(poll.observation_source)) throw new Error("T013 jobs_wait observation source changed");
    timestamp(poll.provider_observed_at);
    assertAtOrAfter(poll.provider_observed_at, previousAt, "jobs_wait poll");
    previousAt = poll.provider_observed_at;
    if (!record.submission || poll.jobs.length !== record.submission.jobs.length) throw new Error("T013 jobs_wait poll topology changed");
    poll.jobs.forEach((job, position) => {
      exactKeys(job as unknown as Record<string, unknown>, ["index", "job_id", "status", "model", "download_available", "permanent_lookup_failure", "lookup_retryable", "provider_failure_detail_present"], "T013 jobs_wait journal job");
      const submitted = record.submission?.jobs[position];
      if (!submitted || job.index !== submitted.index || job.job_id !== submitted.job_id || !JOBS_WAIT_STATUSES.includes(job.status) || typeof job.download_available !== "boolean" ||
          typeof job.permanent_lookup_failure !== "boolean" || (job.lookup_retryable !== null && typeof job.lookup_retryable !== "boolean") || typeof job.provider_failure_detail_present !== "boolean") {
        throw new Error("T013 jobs_wait poll identity changed");
      }
      if ((job.status === "lookup_failed") !== (job.lookup_retryable !== null || job.permanent_lookup_failure) ||
          (job.status === "lookup_failed" && job.permanent_lookup_failure !== (job.lookup_retryable !== true)) ||
          (job.status !== "lookup_failed" && (job.lookup_retryable !== null || job.permanent_lookup_failure))) {
        throw new Error("T013 lookup_failed classification changed");
      }
      const terminalFailure = FAILED_JOBS_WAIT_STATUSES.has(job.status) || job.permanent_lookup_failure;
      const modelDrift = job.model !== null && job.model !== EXPECTED_REPORTED_MODEL;
      if ((terminalFailure || modelDrift) && record.state !== "FAIL_STOP") throw new Error("T013 jobs_wait poll contains terminal failure or model drift");
      if ((job.status === "completed") !== job.download_available) throw new Error("T013 jobs_wait download availability changed");
      if (job.status === "completed" && job.model !== EXPECTED_REPORTED_MODEL && record.state !== "FAIL_STOP") throw new Error("T013 completed job lacks expected model");
      if (previousStatus.get(job.index) === "completed" && job.status !== "completed" && record.state !== "FAIL_STOP") throw new Error("T013 provider job status regressed after completion");
      previousStatus.set(job.index, job.status);
    });
    if (poll.aborted && record.state !== "FAIL_STOP") throw new Error("T013 jobs_wait poll aborted");
    const retryableLookup = poll.jobs.some(({ status, lookup_retryable }) => status === "lookup_failed" && lookup_retryable === true);
    const providerTerminal = poll.jobs.every(({ status, permanent_lookup_failure }) => status === "completed" || FAILED_JOBS_WAIT_STATUSES.has(status) || permanent_lookup_failure);
    if (!retryableLookup && poll.all_terminal !== providerTerminal && record.state !== "FAIL_STOP") throw new Error("T013 jobs_wait all_terminal changed");
  }
  if (["JOBS_VERIFIED", "RECOVERING", "RECOVERED", "COMPLETE"].includes(record.state)) {
    const last = record.job_polls.at(-1);
    if (!last || !last.all_terminal || last.timed_out || last.aborted || !last.jobs.every(({ status, model, download_available, permanent_lookup_failure }) => status === "completed" && model === EXPECTED_REPORTED_MODEL && download_available && !permanent_lookup_failure)) {
      throw new Error("T013 last jobs_wait poll is not fully successful");
    }
  }
  if (record.jobs_verified_at) {
    const last = record.job_polls.at(-1);
    if (!last || record.jobs_verified_at !== last.provider_observed_at) throw new Error("T013 jobs verified timestamp changed");
  }
}

function validateRecoveries(record: T013BatchRecord, plan: T013MaterialsPlan, runtimeRoot?: string): void {
  if (record.recoveries.length > record.asset_ids.length) throw new Error("T013 recovery count changed");
  const seenAssets = new Set<string>();
  record.recoveries.forEach((recovery, position) => {
    exactKeys(recovery as unknown as Record<string, unknown>, ["asset_id", "provider_job_index", "provider_job_id", "recovery_source", "observed_at", "local_relative_path", "backup_relative_path", "sha256", "size_bytes", "target_aspect_ratio", "actual_width", "actual_height", "aspect_error_ppm", "provider_native_unmodified"], "T013 recovery journal record");
    const asset = plan.assets.find(({ id }) => id === recovery.asset_id);
    const submitted = record.submission?.jobs.find(({ asset_id }) => asset_id === recovery.asset_id);
    if (!asset || !record.asset_ids.includes(asset.id) || !submitted || seenAssets.has(asset.id) || recovery.provider_job_index !== submitted.index ||
        recovery.provider_job_id !== submitted.job_id || !["JOBS_HANDOFF_STDIN", "DIAGNOSTIC_MANUAL_INPUT"].includes(recovery.recovery_source) ||
        recovery.local_relative_path !== asset.path || recovery.backup_relative_path !== asset.path || recovery.target_aspect_ratio !== "3:4" || recovery.provider_native_unmodified !== true || !/^[a-f0-9]{64}$/.test(recovery.sha256)) {
      throw new Error("T013 recovery order or binding changed");
    }
    seenAssets.add(asset.id);
    timestamp(recovery.observed_at);
    const previous = position === 0 ? record.submission?.provider_observed_at : record.recoveries[position - 1]?.observed_at;
    assertAtOrAfter(recovery.observed_at, previous, "T013 recovery");
    const requiredPollSource: T013JobsObservationSource = recovery.recovery_source === "JOBS_HANDOFF_STDIN" ? "JOBS_HANDOFF_STDIN" : "DIAGNOSTIC_REDACTED_FILE";
    const completedPoll = record.job_polls.find((poll) => poll.observation_source === requiredPollSource &&
      Date.parse(poll.provider_observed_at) <= Date.parse(recovery.observed_at) &&
      poll.jobs.some((job) => job.index === submitted.index && job.job_id === submitted.job_id && job.status === "completed" && job.download_available));
    if (!completedPoll) throw new Error("T013 recovery lacks a completed jobs_wait observation");
    if (runtimeRoot) {
      const local = verifyExistingPng(resolve(runtimeRoot, LOCAL_ROOT), recovery.local_relative_path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5000);
      const backup = verifyExistingPng(resolve(runtimeRoot, BACKUP_ROOT), recovery.backup_relative_path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5000);
      if (local.size !== backup.size || local.size !== recovery.size_bytes || local.width !== recovery.actual_width || local.height !== recovery.actual_height || local.aspect_error_ppm !== recovery.aspect_error_ppm) {
        throw new Error("T013 recovered PNG evidence mismatch");
      }
    }
  });
}

function hasProductionHandoffProvenance(record: T013BatchRecord): boolean {
  return record.job_polls.length > 0 && record.job_polls.every(({ observation_source }) => observation_source === "JOBS_HANDOFF_STDIN") &&
    record.recoveries.length === record.asset_ids.length && record.recoveries.every(({ recovery_source }) => recovery_source === "JOBS_HANDOFF_STDIN");
}

function assertProductionHandoffProvenance(record: T013BatchRecord): void {
  if (!hasProductionHandoffProvenance(record)) throw new Error("T013 completion requires jobs-handoff provenance");
}

export function validateT013Journal(
  journal: T013OperationsJournal,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  runtimeRoot?: string,
): void {
  validateT013DisclosurePresentationEvidence(presentation, plan, buildT013RiskDisclosure());
  validateT013ApprovalEvidence(approval, plan, buildT013RiskDisclosure(), presentation);
  if (journal.schema_version !== 1 || journal.journal_version !== "t013-materials-operations-v1" || journal.redacted !== true ||
      journal.plan_sha256 !== t013PlanSha256(plan) || journal.disclosure_presentation_evidence_sha256 !== canonicalEvidenceSha(presentation) ||
      journal.approval_evidence_sha256 !== canonicalEvidenceSha(approval) || journal.initial_credit_cap_decimal !== "78.00" ||
      journal.automatic_paid_retry_reserve_decimal !== "0.00" || journal.local_root !== LOCAL_ROOT || journal.backup_root !== BACKUP_ROOT ||
      journal.expected_provider_reported_model !== EXPECTED_REPORTED_MODEL || journal.batches.length !== 5 ||
      /https?:\/\//i.test(JSON.stringify(journal))) {
    throw new Error("invalid or unsafe T013 journal envelope");
  }
  let sawIncomplete = false;
  let totalDelta = 0;
  journal.batches.forEach((record, batchIndex) => {
    const expectedBatch = plan.batches[batchIndex];
    if (record.batch_id !== expectedBatch.id || JSON.stringify(record.asset_ids) !== JSON.stringify(expectedBatch.asset_ids) || !Array.isArray(record.transitions) || !Array.isArray(record.job_polls) || !Array.isArray(record.recoveries)) {
      throw new Error("T013 journal batch identity changed");
    }
    if (sawIncomplete && record.state !== "PLANNED") throw new Error("T013 journal batch order changed");
    if (record.state !== "COMPLETE") sawIncomplete = true;
    const expectedHistory = expectedTransitions(record);
    if (JSON.stringify(record.transitions) !== JSON.stringify(expectedHistory) || (record.state === "PLANNED" ? record.transitions.length !== 0 : record.transitions.at(-1)?.state !== record.state)) {
      throw new Error("T013 transition sequence changed");
    }
    record.transitions.forEach((item, index) => {
      timestamp(item.observed_at);
      if (index > 0 && Date.parse(item.observed_at) < Date.parse(record.transitions[index - 1].observed_at)) throw new Error("T013 transition timestamps changed order");
    });
    validatePreflight(record, plan);
    if (record.paid_request && (!record.preflight?.result || !record.preflight.balance)) throw new Error("T013 paid request lacks verified preflight");
    if (record.paid_request && record.preflight?.result && record.preflight.balance) {
      const freshest = Math.max(Date.parse(record.preflight.result.provider_observed_at), Date.parse(record.preflight.balance.provider_observed_at));
      if (Date.parse(record.paid_request.prepared_at) < freshest || Date.parse(record.paid_request.prepared_at) - freshest > PREFLIGHT_FRESHNESS_MS) throw new Error("T013 paid request used stale preflight");
    }
    if (record.jobs_verified_at && !record.submission) throw new Error("T013 jobs verified without submission");
    validateSubmission(record, plan);
    validatePolls(record);
    if (record.state === "COMPLETE") assertProductionHandoffProvenance(record);
    validateRecoveries(record, plan, runtimeRoot);
    if (record.balance_after) {
      if (!record.preflight?.balance || record.recoveries.length !== record.asset_ids.length) throw new Error("T013 balance recorded before complete recovery");
      assertAtOrAfter(record.balance_after.provider_observed_at, record.recoveries.at(-1)?.observed_at, "T013 balance-after");
      const delta = decimalUnits(record.preflight.balance.normalized_decimal) - decimalUnits(record.balance_after.normalized_decimal);
      const expectedDelta = record.asset_ids.length * 150;
      if (delta !== expectedDelta || record.balance_after.delta_decimal !== decimalFromUnits(delta) || normalizeProviderCredits(record.balance_after.credits, "T013 balance-after").decimal !== record.balance_after.normalized_decimal) {
        throw new Error("T013 batch balance evidence mismatch");
      }
      totalDelta += delta;
    }
    if (batchIndex > 0 && record.preflight?.balance && journal.batches[batchIndex - 1].balance_after?.normalized_decimal !== record.preflight.balance.normalized_decimal) {
      throw new Error("T013 batch-to-batch balance chain changed");
    }
    if (record.terminal) {
      timestamp(record.terminal.observed_at);
      if (record.balance_after) throw new Error("T013 terminal evidence cannot follow COMPLETE");
      const prior = record.transitions.at(-2)?.observed_at;
      assertAtOrAfter(record.terminal.observed_at, prior, "T013 terminal");
      if (record.state !== "FAIL_STOP") throw new Error("T013 terminal evidence exists outside FAIL_STOP");
    } else if (record.state === "FAIL_STOP") {
      throw new Error("T013 FAIL_STOP lacks terminal evidence");
    }
  });
  if (totalDelta > 7800) throw new Error("T013 total credit cap exceeded");
  const terminalBatches = journal.batches.filter(({ state, terminal: detail }) => state === "FAIL_STOP" && detail);
  if (journal.run_state === "FAIL_STOP" && terminalBatches.length !== 1) throw new Error("T013 fail-stop lacks singular terminal evidence");
  if (journal.run_state !== "FAIL_STOP" && terminalBatches.length > 0) throw new Error("T013 terminal batch conflicts with run_state");
  if (journal.run_state === "COMPLETE") {
    if (journal.batches.some(({ state }) => state !== "COMPLETE") || totalDelta !== 7800) throw new Error("T013 complete journal is incomplete");
  } else if (journal.batches.every(({ state }) => state === "COMPLETE")) {
    throw new Error("T013 run_state does not match completed batches");
  }
}

export function redactT013JobsWaitResponse(
  value: unknown,
  providerObservedAt: string,
): { observation: T013AdaptedJobsObservation; transient_downloads: Array<{ index: number; job_id: string; result_url: string }> } {
  timestamp(providerObservedAt);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid live jobs_wait response");
  const envelope = value as Record<string, unknown>;
  allowedKeys(envelope, ["all_terminal", "jobs", "summary", "poll_after_seconds", "timed_out", "aborted"], ["all_terminal", "jobs", "summary"], "live jobs_wait response");
  if (typeof envelope.all_terminal !== "boolean" || !Array.isArray(envelope.jobs) || !envelope.summary || typeof envelope.summary !== "object" || Array.isArray(envelope.summary) ||
      Object.values(envelope.summary as Record<string, unknown>).some((item) => typeof item !== "number" || !Number.isFinite(item)) ||
      (envelope.poll_after_seconds !== undefined && (typeof envelope.poll_after_seconds !== "number" || !Number.isFinite(envelope.poll_after_seconds) || envelope.poll_after_seconds < 0)) ||
      (envelope.timed_out !== undefined && typeof envelope.timed_out !== "boolean") || (envelope.aborted !== undefined && typeof envelope.aborted !== "boolean")) {
    throw new Error("invalid live jobs_wait envelope values");
  }
  const transient: Array<{ index: number; job_id: string; result_url: string }> = [];
  const jobs = envelope.jobs.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid live jobs_wait job");
    const job = item as Record<string, unknown>;
    allowedKeys(job, ["index", "job_id", "status", "model", "result_url", "thumbnail_url", "error", "retryable", "type"], ["index", "job_id", "status"], "live jobs_wait job");
    if (!Number.isSafeInteger(job.index) || !JOBS_WAIT_STATUSES.includes(job.status as JobsWaitStatus) ||
        (job.retryable !== undefined && typeof job.retryable !== "boolean") ||
        (job.type !== undefined && (typeof job.type !== "string" || job.type.length === 0 || job.type.length > 128)) ||
        (job.thumbnail_url !== undefined && job.thumbnail_url !== null && !isHttpsUrl(job.thumbnail_url))) {
      throw new Error("invalid live jobs_wait job values");
    }
    const jobId = providerIdentifier(job.job_id, "live jobs_wait job_id");
    const model = job.model === undefined ? null : providerModel(job.model);
    if (job.error !== undefined) validateOpaqueProviderValue(job.error, "live jobs_wait error");
    const status = job.status as JobsWaitStatus;
    const completed = job.status === "completed";
    if (completed) {
      if (!isHttpsUrl(job.result_url)) throw new Error("completed jobs_wait job requires transient result_url");
      transient.push({ index: job.index as number, job_id: jobId, result_url: job.result_url });
    } else if (job.result_url !== undefined && job.result_url !== null) {
      throw new Error("non-completed jobs_wait job must not have result_url");
    }
    const lookupRetryable = status === "lookup_failed" ? (typeof job.retryable === "boolean" ? job.retryable : null) : null;
    const permanentLookupFailure = status === "lookup_failed" && lookupRetryable !== true;
    return {
      index: job.index as number,
      job_id: jobId,
      status,
      model,
      download_available: completed,
      permanent_lookup_failure: permanentLookupFailure,
      lookup_retryable: lookupRetryable,
      provider_failure_detail_present: job.error !== undefined && job.error !== null,
    };
  });
  return {
    observation: {
      provider_observed_at: providerObservedAt,
      all_terminal: envelope.all_terminal,
      timed_out: envelope.timed_out === true,
      aborted: envelope.aborted === true,
      jobs,
    },
    transient_downloads: transient,
  };
}

interface RedactedGenerateJobSignals {
  index: number;
  job_id: string;
  adjustments_present: boolean;
  error_present: boolean;
  warning_present: boolean;
  preset_recommendation_present: boolean;
}

function redactGenerateJobSignals(job: Record<string, unknown>, index: number, jobId: string): RedactedGenerateJobSignals {
  for (const field of ["adjustments", "error", "warning", "preset_recommendation"] as const) {
    if (field in job) validateOpaqueProviderValue(job[field], `generate job ${field}`);
  }
  return {
    index,
    job_id: jobId,
    adjustments_present: job.adjustments !== undefined && job.adjustments !== null,
    error_present: job.error !== undefined && job.error !== null,
    warning_present: job.warning !== undefined && job.warning !== null,
    preset_recommendation_present: job.preset_recommendation !== undefined && job.preset_recommendation !== null,
  };
}

function hasProviderSignal(signal: RedactedGenerateJobSignals): boolean {
  return signal.adjustments_present || signal.error_present || signal.warning_present || signal.preset_recommendation_present;
}

function writeJournal(runtimeRoot: string, journal: T013OperationsJournal): void {
  atomicWriteJson(runtimeRoot, JOURNAL_PATH, journal);
}

function readJournal(
  runtimeRoot: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
): T013OperationsJournal {
  const path = safeResolve(runtimeRoot, JOURNAL_PATH);
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw new Error("T013 journal is missing or unsafe");
  const bytes = readFileSync(path, "utf8");
  const parsed = JSON.parse(bytes) as T013OperationsJournal;
  if (bytes !== renderCanonicalJson(parsed)) throw new Error("T013 journal is not canonical JSON");
  validateT013Journal(parsed, plan, presentation, approval, runtimeRoot);
  return parsed;
}

function writeTerminal(runtimeRoot: string, journal: T013OperationsJournal, record: T013BatchRecord, code: TerminalCode, observedAt: string, facts: Record<string, unknown>): never {
  try {
    terminal(journal, record, code, observedAt, facts);
  } catch (error) {
    writeJournal(runtimeRoot, journal);
    throw error;
  }
}

function loadJsonInput(runtimeRoot: string, path: string): unknown {
  const absolute = isAbsolute(path) ? resolve(path) : safeResolve(runtimeRoot, path);
  const info = lstatSync(absolute);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("T013 input must be a regular file");
  return JSON.parse(readFileSync(absolute, "utf8")) as unknown;
}

function noClobberText(runtimeRoot: string, relativePath: string, bytes: string): void {
  const target = safeResolve(runtimeRoot, relativePath, true);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) throw new Error("tracked T013 output path is a symlink");
    if (readFileSync(target, "utf8") !== bytes) throw new Error("tracked T013 output already exists with different bytes");
    return;
  }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(descriptor, bytes, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    try {
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lstatSync(target).isSymbolicLink()) throw new Error("tracked T013 output path is a symlink");
      if (readFileSync(target, "utf8") !== bytes) throw new Error("tracked T013 output already exists with different bytes");
    }
    unlinkSync(temporary);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function noClobberJson(runtimeRoot: string, relativePath: string, value: unknown): void {
  noClobberText(runtimeRoot, relativePath, renderCanonicalJson(value));
}

export function buildT013ActualEvidence(journal: T013OperationsJournal, plan: T013MaterialsPlan): Record<string, unknown> {
  const jobs = journal.batches.flatMap((batch) => batch.submission?.jobs ?? []);
  const recoveries = journal.batches.flatMap(({ recoveries: items }) => items);
  if (journal.batches.some((record) => !hasProductionHandoffProvenance(record))) throw new Error("T013 evidence requires jobs-handoff provenance");
  if (journal.run_state !== "COMPLETE" || journal.batches.some(({ state, preflight, submission, balance_after }) => state !== "COMPLETE" || !preflight?.result || !preflight.balance || !submission || !balance_after) ||
      jobs.length !== 52 || new Set(jobs.map(({ asset_id }) => asset_id)).size !== 52 || recoveries.length !== 52 || new Set(recoveries.map(({ asset_id }) => asset_id)).size !== 52) {
    throw new Error("all 52 T013 materials must be COMPLETE before evidence");
  }
  return {
    schema_version: 1,
    evidence_version: "t013-materials-actual-run-v1",
    secret_free: true,
    plan_sha256: journal.plan_sha256,
    disclosure_presentation_evidence_sha256: journal.disclosure_presentation_evidence_sha256,
    approval_evidence_sha256: journal.approval_evidence_sha256,
    total_assets: 52,
    initial_credit_cap_decimal: "78.00",
    automatic_paid_retry_reserve_decimal: "0.00",
    batches: journal.batches.map((batch) => ({
      batch_id: batch.batch_id,
      preflight: batch.preflight,
      paid_request: batch.paid_request,
      submission: batch.submission,
      job_polls: batch.job_polls,
      recoveries: batch.recoveries,
      balance_after: batch.balance_after,
    })),
    asset_order: plan.assets.map(({ id }) => id),
  };
}

function renderContactSheetValidated(journal: T013OperationsJournal, plan: T013MaterialsPlan): string {
  const recoveryById = new Map(journal.batches.flatMap(({ recoveries }) => recoveries).map((item) => [item.asset_id, item]));
  const cards = plan.assets.map((asset) => {
    const recovery = recoveryById.get(asset.id);
    if (!recovery) throw new Error("T013 contact sheet requires 52 recoveries");
    return `    <figure><img src="../../../public/assets/${asset.path}" alt="${asset.id}"><figcaption><code>${asset.id}</code><code>${recovery.sha256}</code><span>${recovery.actual_width}×${recovery.actual_height}; ${recovery.aspect_error_ppm}ppm</span></figcaption></figure>`;
  }).join("\n");
  return `<!doctype html>\n<html lang="ko">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T013 materials</title><style>body{margin:0;padding:2rem;background:#ece4cf;color:#281f22;font-family:system-ui,sans-serif}header,main{max-width:90rem;margin:auto}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}figure{margin:0;padding:.5rem;background:#f6efd9;border:1px solid #7d6672}img{display:block;width:100%;height:auto}figcaption{display:grid;gap:.25rem;margin-top:.4rem;font-size:.7rem;overflow-wrap:anywhere}@media(max-width:800px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}</style></head>\n<body><header><h1>T013 재료 52장</h1><p>완료 journal, provider job, balance, local/backup PNG 검증을 통과한 연락표입니다.</p></header><main>\n${cards}\n</main></body></html>\n`;
}

export function renderT013ContactSheetHtml(
  journal: T013OperationsJournal,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  runtimeRoot: string,
): string {
  validateT013Journal(journal, plan, presentation, approval, runtimeRoot);
  if (journal.run_state !== "COMPLETE") throw new Error("all 52 T013 materials must be COMPLETE before contact sheet");
  return renderContactSheetValidated(journal, plan);
}

function applyT013JobsObservation(
  runtimeRoot: string,
  journal: T013OperationsJournal,
  record: T013BatchRecord,
  batchId: string,
  observation: T013AdaptedJobsObservation,
  command: "jobs" | "jobs-handoff",
  observationSource: T013JobsObservationSource,
): Record<string, unknown> {
  if (record.state !== "SUBMITTED" || !record.submission) throw new Error(`T013 ${command} requires SUBMITTED state`);
  if (/https?:\/\//i.test(JSON.stringify(observation))) throw new Error("result_url must remain transient and must not enter the journal");
  timestamp(observation.provider_observed_at);
  exactKeys(observation as unknown as Record<string, unknown>, ["provider_observed_at", "all_terminal", "timed_out", "aborted", "jobs"], "redacted jobs_wait observation");
  if (typeof observation.all_terminal !== "boolean" || typeof observation.timed_out !== "boolean" || typeof observation.aborted !== "boolean") {
    throw new Error("invalid redacted jobs_wait envelope flags");
  }
  assertAtOrAfter(observation.provider_observed_at, record.job_polls.at(-1)?.provider_observed_at ?? record.submission.provider_observed_at, "jobs_wait observation");
  if (!Array.isArray(observation.jobs) || observation.jobs.length !== record.submission.jobs.length) {
    writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", observation.provider_observed_at, {
      expected_count: record.submission.jobs.length,
      observed_count: Array.isArray(observation.jobs) ? observation.jobs.length : 0,
    });
  }
  const safeJobs: T013RedactedJobsObservation["jobs"] = [];
  const submittedByIndex = new Map(record.submission.jobs.map((job) => [job.index, job]));
  const seenIndices = new Set<number>();
  for (const [position, item] of observation.jobs.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", observation.provider_observed_at, { position });
    }
    exactKeys(item as unknown as Record<string, unknown>, ["index", "job_id", "status", "model", "download_available", "permanent_lookup_failure", "lookup_retryable", "provider_failure_detail_present"], "redacted jobs_wait job");
    const submitted = submittedByIndex.get(item.index);
    const lookupClassificationValid = item.status === "lookup_failed"
      ? item.permanent_lookup_failure === (item.lookup_retryable !== true)
      : item.lookup_retryable === null && item.permanent_lookup_failure === false;
    if (!submitted || seenIndices.has(item.index) || item.job_id !== submitted.job_id || !JOBS_WAIT_STATUSES.includes(item.status) ||
        (item.model !== null && providerModel(item.model) !== item.model) || typeof item.download_available !== "boolean" ||
        typeof item.permanent_lookup_failure !== "boolean" || (item.lookup_retryable !== null && typeof item.lookup_retryable !== "boolean") ||
        typeof item.provider_failure_detail_present !== "boolean" || !lookupClassificationValid || ((item.status === "completed") !== item.download_available)) {
      writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", observation.provider_observed_at, { position, index: item.index });
    }
    seenIndices.add(item.index);
    safeJobs.push({ ...item });
  }
  safeJobs.sort((left, right) => left.index - right.index);
  const safeObservation: T013RedactedJobsObservation = {
    observation_source: observationSource,
    provider_observed_at: observation.provider_observed_at,
    all_terminal: observation.all_terminal,
    timed_out: observation.timed_out,
    aborted: observation.aborted,
    jobs: safeJobs,
  };
  const previousStatus = new Map<number, BatchSubmitStatus | JobsWaitStatus>(record.submission.jobs.map(({ index, status }) => [index, status]));
  for (const priorPoll of record.job_polls) {
    for (const priorJob of priorPoll.jobs) previousStatus.set(priorJob.index, priorJob.status);
  }
  const regressed = safeJobs.find((job) => previousStatus.get(job.index) === "completed" && job.status !== "completed");
  record.job_polls.push(safeObservation);
  if (regressed) {
    writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", observation.provider_observed_at, {
      stage: "JOBS_WAIT_STATUS_REGRESSION",
      index: regressed.index,
      job_id: regressed.job_id,
      previous_status: "completed",
      observed_status: regressed.status,
    });
  }
  const failed = safeJobs.find(({ status, permanent_lookup_failure }) => FAILED_JOBS_WAIT_STATUSES.has(status) || permanent_lookup_failure);
  if (observation.aborted || failed) {
    const lookupRetryability = failed?.status === "lookup_failed"
      ? failed.lookup_retryable === false ? "NON_RETRYABLE" : "MISSING_AMBIGUOUS"
      : "NOT_APPLICABLE";
    writeTerminal(runtimeRoot, journal, record, "GENERATION_FAILED", observation.provider_observed_at, {
      index: failed?.index ?? null,
      job_id: failed?.job_id ?? null,
      provider_status: failed?.status ?? null,
      lookup_retryability: lookupRetryability,
      provider_failure_detail_present: failed?.provider_failure_detail_present ?? false,
      aborted: observation.aborted,
      same_job_repoll_allowed: false,
      automatic_resubmit_allowed: false,
      retry_attempt: 0,
      retry_limit: 3,
    });
  }
  const drift = safeJobs.find(({ model }) => model !== null && model !== EXPECTED_REPORTED_MODEL);
  if (drift) {
    writeTerminal(runtimeRoot, journal, record, "MODEL_DRIFT", observation.provider_observed_at, {
      index: drift.index,
      job_id: drift.job_id,
      requested_model: "nano_banana_2",
      expected_provider_reported_model: EXPECTED_REPORTED_MODEL,
      actual_provider_reported_model: drift.model,
    });
  }
  const retryableLookup = safeJobs.some(({ status, lookup_retryable }) => status === "lookup_failed" && lookup_retryable === true);
  const providerTerminal = safeJobs.every(({ status, permanent_lookup_failure }) => status === "completed" || FAILED_JOBS_WAIT_STATUSES.has(status) || permanent_lookup_failure);
  if (!retryableLookup && observation.all_terminal !== providerTerminal) {
    writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", observation.provider_observed_at, {
      provider_all_terminal: observation.all_terminal,
      derived_all_terminal: providerTerminal,
    });
  }
  const allCompleted = safeJobs.every(({ status, model, download_available }) => status === "completed" && model === EXPECTED_REPORTED_MODEL && download_available);
  if (!allCompleted || observation.timed_out) {
    writeJournal(runtimeRoot, journal);
    return {
      command,
      batch_id: batchId,
      state: record.state,
      pending_jobs: safeJobs.filter(({ status }) => status !== "completed").length,
      retryable_lookup_jobs: safeJobs.filter(({ status, lookup_retryable }) => status === "lookup_failed" && lookup_retryable === true).length,
      same_job_repoll_required: retryableLookup,
      timed_out: observation.timed_out,
    };
  }
  record.jobs_verified_at = observation.provider_observed_at;
  transition(record, "JOBS_VERIFIED", observation.provider_observed_at);
  if (record.recoveries.length > 0) {
    transition(record, "RECOVERING", observation.provider_observed_at);
    if (record.recoveries.length === record.asset_ids.length) transition(record, "RECOVERED", observation.provider_observed_at);
  }
  writeJournal(runtimeRoot, journal);
  return { command, batch_id: batchId, state: record.state, completed_jobs: safeJobs.length };
}

function ingestT013Asset(
  runtimeRoot: string,
  journal: T013OperationsJournal,
  record: T013BatchRecord,
  plan: T013MaterialsPlan,
  assetId: string,
  inputPath: string,
  observedAt: string,
  recoverySource: T013RecoverySource,
  redactFailureReason = false,
  allowPollingRecovery = false,
): Record<string, unknown> {
  const allowedStates: BatchState[] = allowPollingRecovery ? ["SUBMITTED", "JOBS_VERIFIED", "RECOVERING"] : ["JOBS_VERIFIED", "RECOVERING"];
  if (!allowedStates.includes(record.state) || !record.asset_ids.includes(assetId)) throw new Error("T013 asset is not ready for ingest");
  assertAtOrAfter(observedAt, record.job_polls.at(-1)?.provider_observed_at, "ingest");
  if (record.recoveries.some(({ asset_id }) => asset_id === assetId)) throw new Error("T013 asset was already ingested");
  if (!allowPollingRecovery && assetId !== record.asset_ids[record.recoveries.length]) throw new Error("T013 assets must be ingested once in response order");
  const submitted = record.submission?.jobs.find(({ asset_id }) => asset_id === assetId);
  const requiredPollSource: T013JobsObservationSource = recoverySource === "JOBS_HANDOFF_STDIN" ? "JOBS_HANDOFF_STDIN" : "DIAGNOSTIC_REDACTED_FILE";
  if (!submitted || !record.job_polls.some((poll) => poll.observation_source === requiredPollSource &&
      Date.parse(poll.provider_observed_at) <= Date.parse(observedAt) && poll.jobs.some((job) =>
        job.index === submitted.index && job.job_id === submitted.job_id && job.status === "completed" && job.download_available))) {
    throw new Error("T013 recovery lacks matching completed job provenance");
  }
  const info = lstatSync(inputPath);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("input PNG must be a regular file");
  const asset = plan.assets.find(({ id }) => id === assetId)!;
  try {
    const local = atomicWriteVerifiedPng(resolve(runtimeRoot, LOCAL_ROOT), asset.path, readFileSync(inputPath), "3:4", DEFAULT_MAX_PNG_BYTES, 5000);
    const backup = backupVerifiedFile(resolve(runtimeRoot, LOCAL_ROOT), resolve(runtimeRoot, BACKUP_ROOT), asset.path, local.sha256, "3:4", DEFAULT_MAX_PNG_BYTES, 5000);
    if (local.sha256 !== backup.sha256 || local.size !== backup.size || local.width !== backup.width || local.height !== backup.height || local.aspect_error_ppm !== backup.aspect_error_ppm) throw new Error("backup mismatch");
    record.recoveries.push({ asset_id: assetId, provider_job_index: submitted.index, provider_job_id: submitted.job_id, recovery_source: recoverySource, observed_at: observedAt, local_relative_path: asset.path, backup_relative_path: asset.path, sha256: local.sha256, size_bytes: local.size, target_aspect_ratio: "3:4", actual_width: local.width, actual_height: local.height, aspect_error_ppm: local.aspect_error_ppm, provider_native_unmodified: true });
  } catch (error) {
    writeTerminal(runtimeRoot, journal, record, "RECOVERY_FAILED", observedAt, redactFailureReason
      ? { asset_id: assetId, reason_code: "PNG_VALIDATION_OR_ATOMIC_STORE_FAILED" }
      : { asset_id: assetId, reason: error instanceof Error ? error.message : "recovery failure" });
  }
  if (record.jobs_verified_at && record.state === "JOBS_VERIFIED") transition(record, "RECOVERING", observedAt);
  if (record.jobs_verified_at && record.recoveries.length === record.asset_ids.length && record.state !== "RECOVERED") transition(record, "RECOVERED", observedAt);
  writeJournal(runtimeRoot, journal);
  return { command: "ingest", batch_id: record.batch_id, asset_id: assetId, state: record.state, recovered: record.recoveries.length };
}

function runInternal(
  args: readonly string[],
  runtimeRoot: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  surface: T013OpsSurface,
): Record<string, unknown> {
  assertT013OpsSurfaceCommand(args, surface);
  validateT013DisclosurePresentationEvidence(presentation, plan, buildT013RiskDisclosure());
  validateT013ApprovalEvidence(approval, plan, buildT013RiskDisclosure(), presentation);
  const command = args[0];
  if (command === "init") {
    if (args.length !== 1) throw new Error("usage: init");
    const initLock = acquireRunnerLock(runtimeRoot, LOCK_PATH);
    try {
      const target = safeResolve(runtimeRoot, JOURNAL_PATH, true);
      const initial = buildInitialT013Journal(plan, presentation, approval);
      if (existsSync(target)) return { command, state: readJournal(runtimeRoot, plan, presentation, approval).run_state, idempotent: true };
      assertNonOverlappingRoots(resolve(runtimeRoot, LOCAL_ROOT), resolve(runtimeRoot, BACKUP_ROOT));
      noClobberJson(runtimeRoot, JOURNAL_PATH, initial);
      return { command, state: initial.run_state, batches: 5 };
    } finally {
      initLock.release();
    }
  }
  const lock = acquireRunnerLock(runtimeRoot, LOCK_PATH);
  try {
    const journal = readJournal(runtimeRoot, plan, presentation, approval);
    if (command === "preflight-request") {
      const batchId = option(args, "--batch");
      const observedAt = timestamp(option(args, "--observed-at"));
      const { record, index } = batchFor(journal, batchId);
      assertProgressOrder(journal, index);
      if (record.state !== "PLANNED") throw new Error("T013 batch is not PLANNED; no repeated preflight");
      assertBatchPricingInvariant(plan, batchId);
      const request = preflightEnvelope(plan, batchId);
      record.preflight = { request, request_sha256: sha256(canonicalJson(request)), requested_at: observedAt };
      transition(record, "PREFLIGHT_REQUESTED", observedAt);
      writeJournal(runtimeRoot, journal);
      return request as unknown as Record<string, unknown>;
    }
    if (command === "preflight-result") {
      const batchId = option(args, "--batch");
      const providerObservedAt = timestamp(option(args, "--provider-observed-at"));
      const balanceObservedAt = timestamp(option(args, "--balance-observed-at"));
      const { record, index } = batchFor(journal, batchId);
      assertProgressOrder(journal, index);
      if (record.state !== "PREFLIGHT_REQUESTED" || !record.preflight) throw new Error("T013 preflight request must be durable before its result");
      assertAtOrAfter(providerObservedAt, record.preflight.requested_at, "preflight result");
      assertAtOrAfter(balanceObservedAt, record.preflight.requested_at, "balance result");
      assertAtOrAfter(balanceObservedAt, providerObservedAt, "balance result");
      if (Date.parse(providerObservedAt) - Date.parse(record.preflight.requested_at) > PREFLIGHT_FRESHNESS_MS || Date.parse(balanceObservedAt) - Date.parse(record.preflight.requested_at) > PREFLIGHT_FRESHNESS_MS) {
        throw new Error("T013 preflight observation is stale");
      }
      const costValue = loadJsonInput(runtimeRoot, option(args, "--cost-file"));
      const balanceValue = loadJsonInput(runtimeRoot, option(args, "--balance-file"));
      if (!costValue || typeof costValue !== "object" || Array.isArray(costValue)) throw new Error("invalid get_cost result");
      if (!balanceValue || typeof balanceValue !== "object" || Array.isArray(balanceValue)) throw new Error("invalid balance result");
      const costRecord = costValue as Record<string, unknown>;
      const balanceRecord = balanceValue as Record<string, unknown>;
      exactKeys(costRecord, ["cost"], "get_cost result");
      exactKeys(balanceRecord, ["credits"], "balance result");
      const cost = costRecord.cost as Record<string, unknown> | undefined;
      if (!cost) throw new Error("get_cost fields missing");
      exactKeys(cost, ["credits", "credits_exact"], "get_cost credits");
      const observedCost = { credits: cost.credits, credits_exact: cost.credits_exact };
      let costCredits: ReturnType<typeof normalizeProviderCredits>;
      let costExact: ReturnType<typeof normalizeProviderCredits>;
      try {
        costCredits = normalizeProviderCredits(cost.credits, "get_cost credits");
        costExact = normalizeProviderCredits(cost.credits_exact, "get_cost credits_exact");
      } catch {
        writeTerminal(runtimeRoot, journal, record, "PRICE_CHANGED", providerObservedAt, { observed_cost: observedCost });
      }
      if (costExact.decimal !== "1.50") writeTerminal(runtimeRoot, journal, record, "PRICE_CHANGED", providerObservedAt, { observed_cost: observedCost, normalized_display_credits: costCredits.decimal, normalized_credits_exact: costExact.decimal });
      let balance: ReturnType<typeof normalizeProviderCredits>;
      try {
        balance = normalizeProviderCredits(balanceRecord.credits, "balance credits");
      } catch {
        writeTerminal(runtimeRoot, journal, record, "AMBIGUOUS_BALANCE", balanceObservedAt, { observed_balance_credits: balanceRecord.credits });
      }
      const minimum = record.asset_ids.length * 150;
      if (balance.units < minimum) writeTerminal(runtimeRoot, journal, record, "AMBIGUOUS_BALANCE", balanceObservedAt, { actual_balance_decimal: balance.decimal, minimum_batch_cost_decimal: decimalFromUnits(minimum) });
      if (index > 0 && journal.batches[index - 1].balance_after?.normalized_decimal !== balance.decimal) {
        writeTerminal(runtimeRoot, journal, record, "AMBIGUOUS_BALANCE", balanceObservedAt, { expected_balance_decimal: journal.batches[index - 1].balance_after?.normalized_decimal, actual_balance_decimal: balance.decimal });
      }
      record.preflight.result = { cost: { credits: costCredits.value, credits_exact: 1.5, normalized_decimal: "1.50" }, no_job_submission_observation: "DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED", provider_observed_at: providerObservedAt };
      record.preflight.balance = { credits: balance.value, normalized_decimal: balance.decimal, provider_observed_at: balanceObservedAt };
      transition(record, "PREFLIGHT_VERIFIED", balanceObservedAt);
      writeJournal(runtimeRoot, journal);
      return { command, batch_id: batchId, state: record.state, request_sha256: record.preflight.request_sha256 };
    }
    if (command === "prepare") {
      const batchId = option(args, "--batch");
      const observedAt = timestamp(option(args, "--observed-at"));
      const { record, index } = batchFor(journal, batchId);
      assertProgressOrder(journal, index);
      if (record.state !== "PREFLIGHT_VERIFIED" || !record.preflight?.result || !record.preflight.balance) throw new Error("fresh verified T013 preflight is required before paid prepare");
      const freshest = Math.max(Date.parse(record.preflight.result.provider_observed_at), Date.parse(record.preflight.balance.provider_observed_at));
      if (Date.parse(observedAt) < freshest || Date.parse(observedAt) - freshest > PREFLIGHT_FRESHNESS_MS) throw new Error("T013 paid prepare requires a fresh preflight");
      const request = paidEnvelope(plan, batchId);
      record.paid_request = { request, request_sha256: sha256(canonicalJson(request)), prepared_at: observedAt };
      transition(record, "SUBMITTING", observedAt);
      writeJournal(runtimeRoot, journal);
      return request as unknown as Record<string, unknown>;
    }
    if (command === "ambiguous") {
      const batchId = option(args, "--batch");
      const observedAt = timestamp(option(args, "--observed-at"));
      const reason = option(args, "--reason");
      const { record } = batchFor(journal, batchId);
      if (record.state !== "SUBMITTING") throw new Error("only SUBMITTING can be marked ambiguous");
      if (!["TIMEOUT", "TRANSPORT_ERROR", "MISSING_DEFINITE_RESULT"].includes(reason)) throw new Error("ambiguous reason must be a redacted reason code");
      writeTerminal(runtimeRoot, journal, record, "AMBIGUOUS_SUBMISSION", observedAt, { reason, actual_outcome: "UNKNOWN" });
    }
    if (command === "response") {
      const batchId = option(args, "--batch");
      const providerObservedAt = timestamp(option(args, "--provider-observed-at"));
      const { record } = batchFor(journal, batchId);
      if (record.state !== "SUBMITTING") throw new Error("T013 generate response requires durable SUBMITTING state");
      assertAtOrAfter(providerObservedAt, record.transitions.at(-1)?.observed_at, "generate response");
      const value = loadJsonInput(runtimeRoot, option(args, "--file"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid generate_image_batch response");
      const response = value as Record<string, unknown>;
      exactKeys(response, ["submitted_count", "failed_count", "jobs"], "generate_image_batch response");
      const rawJobs = Array.isArray(response.jobs) ? response.jobs : [];
      const expectedAssets = record.asset_ids.map((id) => plan.assets.find((asset) => asset.id === id)!);
      const validCounts = response.submitted_count === expectedAssets.length && response.failed_count === 0 && rawJobs.length === expectedAssets.length;
      const seen = new Set<string>();
      const seenIndices = new Set<number>();
      let validTopology = true;
      let validSignalShapes = true;
      const jobs: ProviderJobRecord[] = [];
      const signals: RedactedGenerateJobSignals[] = [];
      rawJobs.forEach((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) { validTopology = false; return; }
        const job = item as Record<string, unknown>;
        try {
          allowedKeys(job, ["index", "job_id", "status", "adjustments", "error", "warning", "preset_recommendation"], ["index", "job_id", "status"], "generate job");
        } catch {
          validTopology = false;
        }
        const asset = expectedAssets.find(({ index }) => index === job.index);
        let jobId: string | undefined;
        try { jobId = providerIdentifier(job.job_id, "generate job_id"); } catch { validTopology = false; }
        const status = job.status as BatchSubmitStatus;
        if (!asset || seenIndices.has(job.index as number) || !jobId || !BATCH_SUBMIT_STATUSES.includes(status) || seen.has(jobId)) validTopology = false;
        if (Number.isSafeInteger(job.index)) seenIndices.add(job.index as number);
        if (jobId) seen.add(jobId);
        if (asset && jobId && BATCH_SUBMIT_STATUSES.includes(status)) {
          jobs.push({ index: asset.index, asset_id: asset.id, job_id: jobId, status, canonical_request_sha256: asset.canonical_request_sha256 });
          try {
            signals.push(redactGenerateJobSignals(job, asset.index, jobId));
          } catch {
            validSignalShapes = false;
          }
        }
      });
      jobs.sort((left, right) => left.index - right.index);
      signals.sort((left, right) => left.index - right.index);
      if (!validCounts || !validTopology || jobs.length !== expectedAssets.length) {
        writeTerminal(runtimeRoot, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", providerObservedAt, {
          expected_count: expectedAssets.length,
          submitted_count: response.submitted_count,
          failed_count: response.failed_count,
          observed_job_count: rawJobs.length,
          definite_jobs: jobs.map(({ index, asset_id, job_id, status }) => ({ index, asset_id, job_id, status })),
        });
      }
      record.submission = { provider_observed_at: providerObservedAt, submitted_count: expectedAssets.length, failed_count: 0, jobs };
      transition(record, "SUBMITTED", providerObservedAt);
      if (!validSignalShapes) {
        writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", providerObservedAt, { stage: "GENERATE_JOB_OPTIONAL_FIELDS", definite_job_count: jobs.length });
      }
      const observedSignals = signals.filter(hasProviderSignal);
      if (observedSignals.length > 0) {
        writeTerminal(runtimeRoot, journal, record, "PROVIDER_RESPONSE_SIGNAL", providerObservedAt, {
          provider_job_signals: observedSignals,
          benign_warning_allowlist: [],
          definite_job_ids_preserved: true,
        });
      }
      const failed = jobs.find(({ status }) => FAILED_BATCH_SUBMIT_STATUSES.has(status));
      if (failed) {
        writeTerminal(runtimeRoot, journal, record, "GENERATION_FAILED", providerObservedAt, {
          index: failed.index,
          asset_id: failed.asset_id,
          job_id: failed.job_id,
          provider_status: failed.status,
          definite_job_ids_preserved: true,
          retry_attempt: 0,
          retry_limit: 3,
        });
      }
      writeJournal(runtimeRoot, journal);
      return { command, batch_id: batchId, state: record.state, jobs: jobs.length };
    }
    if (command === "jobs") {
      const batchId = option(args, "--batch");
      const { record } = batchFor(journal, batchId);
      const value = loadJsonInput(runtimeRoot, option(args, "--file"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid redacted jobs_wait observation");
      const observation = value as unknown as T013AdaptedJobsObservation;
      return applyT013JobsObservation(runtimeRoot, journal, record, batchId, observation, "jobs", "DIAGNOSTIC_REDACTED_FILE");
    }
    if (command === "jobs-request") {
      const batchId = option(args, "--batch");
      const { record } = batchFor(journal, batchId);
      if (record.state !== "SUBMITTED" || !record.submission) throw new Error("T013 jobs-request requires SUBMITTED state");
      return { jobs: record.submission.jobs.map(({ index, job_id }) => ({ index, job_id })) };
    }
    if (command === "ingest") {
      const batchId = option(args, "--batch");
      const assetId = option(args, "--asset");
      const input = option(args, "--input-png");
      const observedAt = timestamp(option(args, "--observed-at"));
      const { record } = batchFor(journal, batchId);
      const inputPath = isAbsolute(input) ? resolve(input) : safeResolve(runtimeRoot, input);
      return ingestT013Asset(runtimeRoot, journal, record, plan, assetId, inputPath, observedAt, "DIAGNOSTIC_MANUAL_INPUT");
    }
    if (command === "balance-after") {
      const batchId = option(args, "--batch");
      const providerObservedAt = timestamp(option(args, "--provider-observed-at"));
      const { record } = batchFor(journal, batchId);
      if (record.state !== "RECOVERED" || !record.preflight?.balance) throw new Error("T013 batch must be fully recovered before balance-after");
      assertProductionHandoffProvenance(record);
      assertAtOrAfter(providerObservedAt, record.recoveries.at(-1)?.observed_at, "balance-after");
      const value = loadJsonInput(runtimeRoot, option(args, "--file"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid balance-after response");
      const envelope = value as Record<string, unknown>;
      exactKeys(envelope, ["credits"], "balance-after response");
      let balance: ReturnType<typeof normalizeProviderCredits>;
      try {
        balance = normalizeProviderCredits(envelope.credits, "balance-after credits");
      } catch {
        writeTerminal(runtimeRoot, journal, record, "AMBIGUOUS_BALANCE", providerObservedAt, { observed_balance_credits: envelope.credits });
      }
      const delta = decimalUnits(record.preflight.balance.normalized_decimal) - balance.units;
      const expected = record.asset_ids.length * 150;
      if (delta !== expected) writeTerminal(runtimeRoot, journal, record, "AMBIGUOUS_BALANCE", providerObservedAt, { balance_before_decimal: record.preflight.balance.normalized_decimal, actual_balance_after_decimal: balance.decimal, actual_delta_decimal: decimalFromUnits(delta), expected_delta_decimal: decimalFromUnits(expected) });
      record.balance_after = { credits: balance.value, normalized_decimal: balance.decimal, provider_observed_at: providerObservedAt, delta_decimal: decimalFromUnits(delta) };
      transition(record, "COMPLETE", providerObservedAt);
      if (journal.batches.every(({ state }) => state === "COMPLETE")) journal.run_state = "COMPLETE";
      writeJournal(runtimeRoot, journal);
      return { command, batch_id: batchId, state: record.state, run_state: journal.run_state };
    }
    if (command === "evidence") {
      if (args.length !== 1) throw new Error("usage: evidence");
      validateT013Journal(journal, plan, presentation, approval, runtimeRoot);
      const evidence = buildT013ActualEvidence(journal, plan);
      noClobberJson(runtimeRoot, ACTUAL_EVIDENCE_PATH, evidence);
      return { command, path: ACTUAL_EVIDENCE_PATH, sha256: sha256(renderCanonicalJson(evidence)), assets: 52 };
    }
    if (command === "contact-sheet") {
      if (args.length !== 1) throw new Error("usage: contact-sheet");
      validateT013Journal(journal, plan, presentation, approval, runtimeRoot);
      const evidencePath = safeResolve(runtimeRoot, ACTUAL_EVIDENCE_PATH);
      if (!existsSync(evidencePath) || readFileSync(evidencePath, "utf8") !== renderCanonicalJson(buildT013ActualEvidence(journal, plan))) throw new Error("tracked T013 actual evidence is required before contact sheet");
      const html = renderT013ContactSheetHtml(journal, plan, presentation, approval, runtimeRoot);
      noClobberText(runtimeRoot, CONTACT_SHEET_PATH, html);
      return { command, path: CONTACT_SHEET_PATH, sha256: sha256(html), assets: 52 };
    }
    throw new Error(surface === "PRODUCTION"
      ? "usage: assets:materials:v1:ops <init|preflight-request|preflight-result|prepare|response|ambiguous|jobs-request|jobs-handoff|balance-after|evidence|contact-sheet>"
      : "usage: internal T013 test ops <init|preflight-request|preflight-result|prepare|response|ambiguous|jobs-request|jobs|ingest|balance-after|evidence|contact-sheet>");
  } finally {
    lock.release();
  }
}

export interface T013ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface T013PinnedHttpsRequest {
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

export interface T013PinnedHttpsResponse {
  status_code: number;
  headers: Record<string, string | string[] | undefined>;
  remote_address: string | null;
  body: AsyncIterable<Uint8Array> | null;
  destroy: () => void;
}

type T013Resolver = (hostname: string) => Promise<readonly T013ResolvedAddress[]>;
type T013HttpsTransport = (request: T013PinnedHttpsRequest) => Promise<T013PinnedHttpsResponse>;

export interface T013HandoffDependencies {
  resolve_hostname?: T013Resolver;
  https_transport?: T013HttpsTransport;
  now?: () => Date;
  temporary_root?: string;
}

class T013DownloadFailure extends Error {
  constructor(
    readonly reasonCode: "URL_REJECTED" | "DNS_RESOLUTION_REJECTED" | "DNS_ADDRESS_REJECTED" | "TRANSPORT_ERROR" | "DOWNLOAD_TIMEOUT" | "PINNED_ADDRESS_MISMATCH" | "REDIRECT_TARGET_REJECTED" | "REDIRECT_LIMIT" | "HTTP_STATUS" | "CONTENT_LENGTH_INVALID" | "CONTENT_TYPE_INVALID" | "BODY_MISSING" | "SIZE_LIMIT" | "EMPTY_BODY" | "TEMP_WRITE_FAILED",
    readonly httpStatus: number | null = null,
  ) {
    super(reasonCode);
  }
}

function parseJobsHandoffArgs(args: readonly string[]): { batchId: string; providerObservedAt: string } {
  if (args.length !== 5 || args[0] !== "jobs-handoff") {
    throw new Error("usage: jobs-handoff --batch <batch-id> --provider-observed-at <ISO timestamp>; actual jobs_wait JSON is stdin-only");
  }
  const allowed = new Set(["--batch", "--provider-observed-at"]);
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    if (!allowed.has(flag) || seen.has(flag) || args[index + 1] === undefined || args[index + 1].startsWith("--")) {
      throw new Error("usage: jobs-handoff --batch <batch-id> --provider-observed-at <ISO timestamp>; actual jobs_wait JSON is stdin-only");
    }
    seen.add(flag);
  }
  return { batchId: option(args, "--batch"), providerObservedAt: timestamp(option(args, "--provider-observed-at")) };
}

function parseJobsWaitStdin(stdinJson: string): unknown {
  const size = Buffer.byteLength(stdinJson, "utf8");
  if (size === 0 || size > MAX_JOBS_WAIT_STDIN_BYTES) throw new Error("invalid or oversized jobs_wait stdin JSON");
  try {
    return JSON.parse(stdinJson) as unknown;
  } catch {
    throw new Error("invalid jobs_wait stdin JSON");
  }
}

function ipv4Bytes(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  const bytes = address.split(".").map(Number);
  return bytes.length === 4 && bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255) ? bytes : null;
}

function ipv6Words(address: string): number[] | null {
  if (isIP(address) !== 6 || address.includes("%")) return null;
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const tail = ipv4Bytes(normalized.slice(lastColon + 1));
    if (lastColon < 0 || !tail) return null;
    normalized = `${normalized.slice(0, lastColon + 1)}${((tail[0] << 8) | tail[1]).toString(16)}:${((tail[2] << 8) | tail[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] | null => {
    if (half === "") return [];
    const items = half.split(":");
    if (items.some((item) => !/^[a-f0-9]{1,4}$/.test(item))) return null;
    return items.map((item) => Number.parseInt(item, 16));
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const omitted = 8 - left.length - right.length;
  return omitted >= 1 ? [...left, ...Array<number>(omitted).fill(0), ...right] : null;
}

function isPublicResolvedAddress(item: T013ResolvedAddress): boolean {
  if (item.family === 4) {
    const bytes = ipv4Bytes(item.address);
    if (!bytes) return false;
    const [a, b, c] = bytes;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 31 && c === 196) || (a === 192 && b === 52 && c === 193) ||
      (a === 192 && b === 88 && c === 99) || (a === 192 && b === 175 && c === 48) ||
      (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (item.family !== 6) return false;
  const words = ipv6Words(item.address);
  if (!words || (words[0] & 0xe000) !== 0x2000) return false;
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const ietfSpecial = words[0] === 0x2001 && words[1] <= 0x01ff;
  const documentation = words[0] === 0x2001 && words[1] === 0x0db8;
  const sixToFour = words[0] === 0x2002;
  const documentationV2 = words[0] === 0x3fff;
  return !ipv4Mapped && !ietfSpecial && !documentation && !sixToFour && !documentationV2;
}

function canonicalAddressBytes(address: string): number[] | null {
  const v4 = ipv4Bytes(address);
  if (v4) return v4;
  const v6 = ipv6Words(address);
  if (!v6) return null;
  return v6.flatMap((word) => [word >>> 8, word & 0xff]);
}

function sameNetworkAddress(left: string, right: string): boolean {
  const leftBytes = canonicalAddressBytes(left);
  const rightBytes = canonicalAddressBytes(right);
  return leftBytes !== null && rightBytes !== null && leftBytes.length === rightBytes.length && leftBytes.every((byte, index) => byte === rightBytes[index]);
}

async function withDownloadAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new T013DownloadFailure("DOWNLOAD_TIMEOUT");
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const onAbort = (): void => rejectPromise(new T013DownloadFailure("DOWNLOAD_TIMEOUT"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolvePromise(value); },
      (error: unknown) => { signal.removeEventListener("abort", onAbort); rejectPromise(error); },
    );
  });
}

async function defaultT013Resolver(hostname: string): Promise<readonly T013ResolvedAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => {
    if (family !== 4 && family !== 6) throw new Error("unexpected DNS address family");
    return { address, family };
  });
}

async function resolveAndPinPublicAddress(hostname: string, resolver: T013Resolver, signal: AbortSignal): Promise<T013ResolvedAddress> {
  let resolved: readonly T013ResolvedAddress[];
  try {
    resolved = await withDownloadAbort(Promise.resolve(resolver(hostname)), signal);
  } catch (error) {
    if (error instanceof T013DownloadFailure) throw error;
    throw new T013DownloadFailure("DNS_RESOLUTION_REJECTED");
  }
  if (!Array.isArray(resolved) || resolved.length === 0 || resolved.length > 64) throw new T013DownloadFailure("DNS_RESOLUTION_REJECTED");
  if (resolved.some((item) => !item || (item.family !== 4 && item.family !== 6) || !isPublicResolvedAddress(item))) {
    throw new T013DownloadFailure("DNS_ADDRESS_REJECTED");
  }
  return { address: resolved[0].address, family: resolved[0].family };
}

function defaultT013HttpsTransport(specification: T013PinnedHttpsRequest): Promise<T013PinnedHttpsResponse> {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpsRequest(specification.url, {
      method: specification.method,
      headers: specification.headers,
      agent: false,
      servername: specification.servername,
      rejectUnauthorized: true,
      signal: specification.signal,
      lookup: (_hostname, options, callback) => {
        if (_hostname.toLowerCase() !== specification.hostname) {
          const error = Object.assign(new Error("pinned lookup hostname mismatch"), { code: "ENOTFOUND" });
          (callback as (error: NodeJS.ErrnoException) => void)(error);
          return;
        }
        if (typeof options === "object" && options.all) {
          (callback as (error: NodeJS.ErrnoException | null, addresses: T013ResolvedAddress[]) => void)(null, [{ address: specification.pinned_address, family: specification.family }]);
        } else {
          (callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(null, specification.pinned_address, specification.family);
        }
      },
    }, (response) => {
      resolvePromise({
        status_code: response.statusCode ?? 0,
        headers: response.headers as IncomingHttpHeaders,
        remote_address: response.socket.remoteAddress ?? null,
        body: response,
        destroy: () => response.destroy(),
      });
    });
    request.setTimeout(specification.timeout_ms, () => request.destroy());
    request.once("error", () => rejectPromise(new T013DownloadFailure(specification.signal.aborted ? "DOWNLOAD_TIMEOUT" : "TRANSPORT_ERROR")));
    request.end();
  });
}

function singleHeader(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  if (entry === undefined) return null;
  return typeof entry === "string" ? entry : entry.length === 1 ? entry[0] : null;
}

async function downloadResultToFile(
  resultUrl: string,
  destination: string,
  resolver: T013Resolver,
  transport: T013HttpsTransport,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    let currentUrl = parseSyntacticallyApprovedHttpsUrl(resultUrl);
    if (!currentUrl) throw new T013DownloadFailure("URL_REJECTED");
    for (let redirectCount = 0; ; redirectCount += 1) {
      const hostname = currentUrl.hostname.toLowerCase();
      const pinned = await resolveAndPinPublicAddress(hostname, resolver, controller.signal);
      let response: T013PinnedHttpsResponse;
      try {
        response = await withDownloadAbort(Promise.resolve(transport({
          url: new URL(currentUrl.toString()),
          hostname,
          servername: hostname,
          pinned_address: pinned.address,
          family: pinned.family,
          method: "GET",
          headers: { accept: "image/png" },
          timeout_ms: DOWNLOAD_TIMEOUT_MS,
          signal: controller.signal,
        })), controller.signal);
      } catch (error) {
        if (error instanceof T013DownloadFailure) throw error;
        throw new T013DownloadFailure(controller.signal.aborted ? "DOWNLOAD_TIMEOUT" : "TRANSPORT_ERROR");
      }
      if (!sameNetworkAddress(pinned.address, response.remote_address ?? "")) {
        response.destroy();
        throw new T013DownloadFailure("PINNED_ADDRESS_MISMATCH");
      }
      if ([301, 302, 303, 307, 308].includes(response.status_code)) {
        response.destroy();
        if (redirectCount >= MAX_DOWNLOAD_REDIRECTS) throw new T013DownloadFailure("REDIRECT_LIMIT", response.status_code);
        const location = singleHeader(response.headers, "location");
        let redirectUrl: URL | null = null;
        try {
          redirectUrl = location === null ? null : parseSyntacticallyApprovedHttpsUrl(new URL(location, currentUrl).toString());
        } catch {
          redirectUrl = null;
        }
        if (!redirectUrl) throw new T013DownloadFailure("REDIRECT_TARGET_REJECTED", response.status_code);
        currentUrl = redirectUrl;
        continue;
      }
      if (response.status_code !== 200) {
        response.destroy();
        throw new T013DownloadFailure("HTTP_STATUS", Number.isInteger(response.status_code) ? response.status_code : null);
      }
      const contentLength = singleHeader(response.headers, "content-length");
      if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > DEFAULT_MAX_PNG_BYTES)) {
        response.destroy();
        throw new T013DownloadFailure("CONTENT_LENGTH_INVALID");
      }
      const contentType = singleHeader(response.headers, "content-type");
      if (contentType !== null && contentType.split(";", 1)[0].trim().toLowerCase() !== "image/png") {
        response.destroy();
        throw new T013DownloadFailure("CONTENT_TYPE_INVALID");
      }
      if (!response.body) {
        response.destroy();
        throw new T013DownloadFailure("BODY_MISSING");
      }
      const iterator = response.body[Symbol.asyncIterator]();
      let total = 0;
      while (true) {
        let next: IteratorResult<Uint8Array>;
        try {
          next = await withDownloadAbort(iterator.next(), controller.signal);
        } catch (error) {
          response.destroy();
          throw error;
        }
        const { done, value } = next;
        if (done) break;
        if (!(value instanceof Uint8Array)) {
          response.destroy();
          throw new T013DownloadFailure("TRANSPORT_ERROR");
        }
        total += value.byteLength;
        if (total > DEFAULT_MAX_PNG_BYTES) {
          response.destroy();
          throw new T013DownloadFailure("SIZE_LIMIT");
        }
        writeFileSync(descriptor, value);
      }
      if (total === 0) throw new T013DownloadFailure("EMPTY_BODY");
      fsyncSync(descriptor);
      break;
    }
  } catch (error) {
    if (error instanceof T013DownloadFailure) throw error;
    throw new T013DownloadFailure(controller.signal.aborted ? "DOWNLOAD_TIMEOUT" : "TEMP_WRITE_FAILED");
  } finally {
    clearTimeout(timeout);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function safeNowAtOrAfter(now: () => Date, floor: string): string {
  const candidate = now().toISOString();
  return Date.parse(candidate) >= Date.parse(floor) ? candidate : floor;
}

async function runT013JobsHandoffInternal(
  args: readonly string[],
  stdinJson: string,
  runtimeRoot: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  dependencies: T013HandoffDependencies = {},
): Promise<Record<string, unknown>> {
  validateT013DisclosurePresentationEvidence(presentation, plan, buildT013RiskDisclosure());
  validateT013ApprovalEvidence(approval, plan, buildT013RiskDisclosure(), presentation);
  const { batchId, providerObservedAt } = parseJobsHandoffArgs(args);
  const resolver = dependencies.resolve_hostname ?? defaultT013Resolver;
  const transport = dependencies.https_transport ?? defaultT013HttpsTransport;
  const now = dependencies.now ?? (() => new Date());
  const temporaryRoot = resolve(dependencies.temporary_root ?? tmpdir());
  const lock = acquireRunnerLock(runtimeRoot, LOCK_PATH);
  try {
    const journal = readJournal(runtimeRoot, plan, presentation, approval);
    const { record } = batchFor(journal, batchId);
    if (record.state !== "SUBMITTED" || !record.submission) throw new Error("T013 jobs-handoff requires SUBMITTED state");
    let adapted: ReturnType<typeof redactT013JobsWaitResponse>;
    try {
      adapted = redactT013JobsWaitResponse(parseJobsWaitStdin(stdinJson), providerObservedAt);
    } catch {
      writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", providerObservedAt, {
        stage: "JOBS_WAIT_STDIN_ADAPTER",
        reason_code: "INVALID_OR_UNSAFE_WIRE_RESPONSE",
      });
    }
    let progress: Record<string, unknown>;
    try {
      progress = applyT013JobsObservation(runtimeRoot, journal, record, batchId, adapted.observation, "jobs-handoff", "JOBS_HANDOFF_STDIN");
    } catch (error) {
      if ((record as T013BatchRecord).state === "FAIL_STOP") throw error;
      writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", providerObservedAt, {
        stage: "JOBS_WAIT_TOPOLOGY",
        reason_code: "IDENTITY_OR_STATE_MISMATCH",
      });
    }
    const downloadByIdentity = new Map(adapted.transient_downloads.map((item) => [`${item.index}\u0000${item.job_id}`, item.result_url]));
    const completedJobs = adapted.observation.jobs.filter(({ status }) => status === "completed");
    if (downloadByIdentity.size !== completedJobs.length) {
      writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", providerObservedAt, {
        stage: "TRANSIENT_DOWNLOAD_TOPOLOGY",
        expected_count: completedJobs.length,
        observed_count: downloadByIdentity.size,
      });
    }
    let downloaded = 0;
    for (const submitted of record.submission.jobs) {
      const resultUrl = downloadByIdentity.get(`${submitted.index}\u0000${submitted.job_id}`);
      const observedJob = adapted.observation.jobs.find(({ index }) => index === submitted.index);
      if (observedJob?.status !== "completed") continue;
      if (!resultUrl) {
        writeTerminal(runtimeRoot, journal, record, "JOB_RESPONSE_INVALID", providerObservedAt, {
          stage: "TRANSIENT_DOWNLOAD_IDENTITY",
          index: submitted.index,
          job_id: submitted.job_id,
        });
      }
      if (record.recoveries.some(({ asset_id }) => asset_id === submitted.asset_id)) continue;
      let temporaryDirectory: string | undefined;
      try {
        temporaryDirectory = mkdtempSync(resolve(temporaryRoot, "fictor-t013-download-"));
        const temporaryPng = resolve(temporaryDirectory, "result.png");
        await downloadResultToFile(resultUrl, temporaryPng, resolver, transport);
        const recoveredAt = safeNowAtOrAfter(now, providerObservedAt);
        ingestT013Asset(runtimeRoot, journal, record, plan, submitted.asset_id, temporaryPng, recoveredAt, "JOBS_HANDOFF_STDIN", true, true);
        downloaded += 1;
      } catch (error) {
        if ((record as T013BatchRecord).state === "FAIL_STOP") throw error;
        const failure = error instanceof T013DownloadFailure ? error : new T013DownloadFailure("TEMP_WRITE_FAILED");
        writeTerminal(runtimeRoot, journal, record, "RECOVERY_FAILED", safeNowAtOrAfter(now, providerObservedAt), {
          asset_id: submitted.asset_id,
          index: submitted.index,
          job_id: submitted.job_id,
          reason_code: failure.reasonCode,
          http_status: failure.httpStatus,
        });
      } finally {
        if (temporaryDirectory !== undefined) rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    }
    return { ...progress, command: "jobs-handoff", batch_id: batchId, state: record.state, downloaded, recovered: record.recoveries.length };
  } finally {
    lock.release();
  }
}

function loadProductionAuthorization(plan: T013MaterialsPlan): { presentation: T013DisclosurePresentationEvidence; approval: T013ApprovalEvidence } {
  if (!isT013Authorized(repositoryRoot, plan)) throw new Error("T013 remote operations disabled: validated scoped approval evidence is missing");
  const presentation = JSON.parse(readFileSync(resolve(repositoryRoot, T013_DISCLOSURE_PRESENTATION_PATH), "utf8")) as T013DisclosurePresentationEvidence;
  const approval = JSON.parse(readFileSync(resolve(repositoryRoot, T013_APPROVAL_PATH), "utf8")) as T013ApprovalEvidence;
  validateT013DisclosurePresentationEvidence(presentation, plan, buildT013RiskDisclosure());
  validateT013ApprovalEvidence(approval, plan, buildT013RiskDisclosure(), presentation);
  return { presentation, approval };
}

export function runT013Ops(args: readonly string[]): Record<string, unknown> {
  assertT013OpsSurfaceCommand(args, "PRODUCTION");
  const plan = buildT013MaterialsPlan(repositoryRoot);
  if (readFileSync(resolve(repositoryRoot, T013_PLAN_PATH), "utf8") !== renderT013MaterialsPlan(plan) ||
      readFileSync(resolve(repositoryRoot, T013_RISK_PATH), "utf8") !== renderCanonicalJson(buildT013RiskDisclosure()) ||
      readFileSync(resolve(repositoryRoot, T013_SCHEMA_EVIDENCE_PATH), "utf8") !== renderCanonicalJson(buildT013ProviderSchemaEvidence())) {
    throw new Error("T013 tracked plan, risk, or provider schema evidence changed");
  }
  const { presentation, approval } = loadProductionAuthorization(plan);
  return runInternal(args, repositoryRoot, plan, presentation, approval, "PRODUCTION");
}

export async function runT013JobsHandoff(args: readonly string[], stdinJson: string): Promise<Record<string, unknown>> {
  const plan = buildT013MaterialsPlan(repositoryRoot);
  if (readFileSync(resolve(repositoryRoot, T013_PLAN_PATH), "utf8") !== renderT013MaterialsPlan(plan) ||
      readFileSync(resolve(repositoryRoot, T013_RISK_PATH), "utf8") !== renderCanonicalJson(buildT013RiskDisclosure()) ||
      readFileSync(resolve(repositoryRoot, T013_SCHEMA_EVIDENCE_PATH), "utf8") !== renderCanonicalJson(buildT013ProviderSchemaEvidence())) {
    throw new Error("T013 tracked plan, risk, or provider schema evidence changed");
  }
  const { presentation, approval } = loadProductionAuthorization(plan);
  return runT013JobsHandoffInternal(args, stdinJson, repositoryRoot, plan, presentation, approval);
}

/** @internal Filesystem-isolated diagnostic seam; jobs/file and ingest/input-png are never production-reachable. */
export function runT013OpsForTest(
  args: readonly string[],
  runtimeRoot: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
): Record<string, unknown> {
  return runInternal(args, assertIsolatedTestRoot(runtimeRoot), plan, presentation, approval, "DIAGNOSTIC_TEST_ONLY");
}

/** @internal Filesystem-isolated production-surface parity seam for command-gate tests. */
export function runT013ProductionOpsForTest(
  args: readonly string[],
  runtimeRoot: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
): Record<string, unknown> {
  return runInternal(args, assertIsolatedTestRoot(runtimeRoot), plan, presentation, approval, "PRODUCTION");
}

/** @internal Filesystem-isolated handoff seam; callers must inject resolver and HTTPS transport to keep tests offline. */
export async function runT013JobsHandoffForTest(
  args: readonly string[],
  stdinJson: string,
  runtimeRoot: string,
  plan: T013MaterialsPlan,
  presentation: T013DisclosurePresentationEvidence,
  approval: T013ApprovalEvidence,
  dependencies: T013HandoffDependencies,
): Promise<Record<string, unknown>> {
  const isolatedRoot = assertIsolatedTestRoot(runtimeRoot);
  if (!dependencies.resolve_hostname || !dependencies.https_transport) throw new Error("T013 handoff tests must inject resolver and HTTPS transport");
  return runT013JobsHandoffInternal(args, stdinJson, isolatedRoot, plan, presentation, approval, dependencies);
}

async function readJobsWaitStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("jobs-handoff requires actual jobs_wait JSON on stdin");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_JOBS_WAIT_STDIN_BYTES) throw new Error("jobs_wait stdin JSON exceeds the size limit");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const main = async (): Promise<void> => {
    try {
      const args = process.argv.slice(2);
      const result = args[0] === "jobs-handoff"
        ? await runT013JobsHandoff(args, await readJobsWaitStdin())
        : runT013Ops(args);
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "T013 ops failed");
      process.exitCode = 1;
    }
  };
  void main();
}
