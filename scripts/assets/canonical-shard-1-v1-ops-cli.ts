import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { dirname, isAbsolute, resolve } from "node:path";
import { execFileSync } from "node:child_process";
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
  T015_ACTUAL_PATH,
  T015_APPROVAL_PATH,
  T015_CONTROLLER_APPROVAL_ATTESTATION_PATH,
  T015_CONTROLLER_ATTESTATION_PATH,
  T015_CORE_PLAN_PATH,
  T015_EXACT_APPROVAL_PHRASE,
  T015_IMPLEMENTATION_BINDING_PATH,
  T015_MASTER_STYLE_PATH,
  T015_PLAN_PATH,
  T015_PRESENTATION_PATH,
  T015_RECOVERY_OPERATOR_PHRASE,
  T015_RISK_PATH,
  T015_RUNTIME_FILE_PATHS,
  T015_SCHEMA_PATH,
  T015_T014_APPROVAL_PATH,
  buildT015CanonicalShardPlan,
  buildT015ProviderSchemaEvidence,
  buildT015RiskDisclosure,
  isT015Authorized,
  canonicalJsonT015 as canonicalJson,
  renderT015CanonicalJson,
  renderT015Plan,
  sha256T015,
  t015PlanSha256,
  validateT015ApprovalEvidence,
  validateT015DisclosurePresentationEvidence,
  type T015ApprovalEvidence,
  type T015CanonicalShardPlan,
  type T015DisclosurePresentationEvidence,
} from "./canonical-shard-1-v1";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const T015_RUN_ROOT = "assets/runs/t015-canonical-shard-1" as const;
export const T015_JOURNAL_PATH = `${T015_RUN_ROOT}/operations-v1.json` as const;
const LOCK_PATH = `${T015_RUN_ROOT}/operations-v1.lock`;
const LOCAL_ROOT = "public/assets";
const BACKUP_ROOT = "assets/backups/t015-canonical-shard-1";
const CONTACT_INDEX_PATH = "docs/asset-runs/contact-sheets/t015-canonical-shard-1-v1.html";
const CONTACT_SEGMENT_ROOT = "docs/asset-runs/contact-sheets/t015-canonical-shard-1-v1";
const EXPECTED_MODEL = "nano_banana_flash";
const FRESHNESS_MS = 10 * 60 * 1000;
const MAX_STDIN_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

type BatchState = "PLANNED" | "PREFLIGHT_REQUESTED" | "PREFLIGHT_VERIFIED" | "SUBMITTING" | "SUBMITTED" | "RECOVERY_ONLY" | "RECOVERING" | "RECOVERED" | "COMPLETE" | "FAIL_STOP";
type TerminalCode = "PRICE_CHANGED" | "BALANCE_CHANGED" | "AMBIGUOUS_SUBMISSION" | "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE" | "PROVIDER_RESPONSE_SIGNAL" | "UNKNOWN_PROVIDER_FIELD" | "GENERATION_FAILED" | "MODEL_DRIFT" | "RECOVERY_FAILED" | "FILE_CONFLICT";
type SubmitStatus = "pending" | "waiting" | "queued" | "in_progress" | "ip_detect" | "completed" | "failed" | "canceled" | "nsfw" | "ip_detected" | "submission_failed";
type WaitStatus = "pending" | "waiting" | "queued" | "in_progress" | "ip_detect" | "completed" | "failed" | "canceled" | "nsfw" | "ip_detected" | "lookup_failed";
const SUBMIT_STATUSES: readonly SubmitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "submission_failed"];
const WAIT_STATUSES: readonly WaitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"];

export interface T015ProviderJob { index: number; asset_id: string; job_id: string; status: SubmitStatus; canonical_request_sha256: string }
export interface T015Recovery { asset_id: string; provider_job_index: number; provider_job_id: string; source: "JOBS_HANDOFF_STDIN" | "DIAGNOSTIC_OFFLINE_FIXTURE"; observed_at: string; local_relative_path: string; backup_relative_path: string; sha256: string; size_bytes: number; actual_width: number; actual_height: number; aspect_error_ppm: number; provider_native_unmodified: true }
export interface T015BatchRecord {
  batch_id: string;
  asset_ids: string[];
  state: BatchState;
  transitions: Array<{ state: BatchState; observed_at: string }>;
  preflight?: { requests: Array<{ index: number; params: T015CanonicalShardPlan["assets"][number]["request"]["params"] & { get_cost: true } }>; requests_sha256: string; requested_at: string; costs?: Array<{ index: number; request_sha256: string; credits: number; credits_exact: 1.5; normalized_decimal: "1.50"; provider_observed_at: string }>; balance?: { credits: number; normalized_decimal: string; provider_observed_at: string } };
  paid_request?: { request_sha256: string; prepared_at: string };
  submission?: { observed_at: string; expected_count: number; submitted_count: number; failed_count: number; complete: boolean; missing_asset_ids: string[]; jobs: T015ProviderJob[] };
  recovery_gate?: { opened_at: string; exact_operator_phrase_sha256: string; no_new_paid_submit: true };
  job_polls: Array<{ observed_at: string; all_terminal: boolean; timed_out: boolean; aborted: boolean; jobs: Array<{ index: number; job_id: string; status: WaitStatus; model: string | null; download_available: boolean; lookup_retryable: boolean | null; provider_failure_detail_present: boolean }> }>;
  recoveries: T015Recovery[];
  balance_after?: { credits: number; normalized_decimal: string; observed_at: string; delta_decimal: string };
  terminal?: { code: TerminalCode; observed_at: string; facts: Record<string, unknown>; automatic_paid_retry: false; paid_retry_count: 0; no_resubmit: true };
  recovery_failures: Array<{ code: "RECOVERY_FAILED" | "PROVIDER_RESPONSE_SIGNAL" | "UNKNOWN_PROVIDER_FIELD" | "GENERATION_FAILED" | "MODEL_DRIFT" | "FILE_CONFLICT"; observed_at: string; facts: Record<string, unknown>; original_terminal_code: TerminalCode | null; recovery_only_preserved: true; automatic_paid_retry: false; paid_retry_count: 0; no_resubmit: true }>;
}

export interface T015OperationsJournal {
  schema_version: 1;
  journal_version: "t015-canonical-shard-1-operations-v1";
  redacted: true;
  plan_sha256: string;
  disclosure_presentation_evidence_sha256: string;
  approval_evidence_sha256: string;
  provider_schema_evidence_sha256: string;
  t014_approval_sha256: "72f5e863806cdee5b7638d8bb1cd9f1fab2c20feb6aeae3c53ba7ef6be872c96";
  run_state: "ACTIVE" | "FAIL_STOP" | "COMPLETE";
  initial_credit_cap_decimal: "498.00";
  automatic_paid_retry_reserve_decimal: "0.00";
  paid_retry_count: 0;
  local_root: "public/assets";
  backup_root: "assets/backups/t015-canonical-shard-1";
  expected_provider_reported_model: "nano_banana_flash";
  batches: T015BatchRecord[];
}

function timestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("invalid observed timestamp");
  return value;
}
function option(args: readonly string[], name: string): string { const i = args.indexOf(name); const value = i < 0 ? undefined : args[i + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
function exactKeys(value: Record<string, unknown>, required: readonly string[], allowed = required): void { if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("unknown or missing provider field"); }
function decimals(value: unknown, label: string): { value: number; units: number; decimal: string } {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`invalid ${label}`);
  const units = Math.round(value * 100);
  if (!Number.isSafeInteger(units) || Math.abs(value * 100 - units) > 1e-9) throw new Error(`ambiguous ${label}`);
  return { value, units, decimal: `${Math.floor(units / 100)}.${String(units % 100).padStart(2, "0")}` };
}
function decimal(units: number): string { const sign = units < 0 ? "-" : ""; const n = Math.abs(units); return `${sign}${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`; }
function batchOf(plan: T015CanonicalShardPlan, id: string) { const batch = plan.batches.find((item) => item.id === id); if (!batch) throw new Error("unknown T015 batch"); return batch; }
function paidEnvelope(plan: T015CanonicalShardPlan, id: string) { const batch = batchOf(plan, id); return { requests: batch.asset_ids.map((assetId) => plan.assets.find((asset) => asset.id === assetId)!.request) }; }
function getCostRequest(request: T015CanonicalShardPlan["assets"][number]["request"]) { return { index: request.index, params: { ...request.params, get_cost: true as const } }; }
function preflightEnvelope(plan: T015CanonicalShardPlan, id: string) { const requests = paidEnvelope(plan, id).requests; if (!requests.length) throw new Error("empty T015 batch"); return { requests: requests.map(getCostRequest) }; }
function assertWallClock(at: string, now: (() => Date) | undefined, floor?: string, freshnessMs?: number): void {
  const observed = Date.parse(timestamp(at));
  if (floor && observed < Date.parse(floor)) throw new Error("T015 observed timestamp is not monotonic");
  if (now) {
    const current = now().getTime();
    if (observed > current) throw new Error("T015 observed timestamp is in the future");
    if (freshnessMs !== undefined && current - observed > freshnessMs) throw new Error("T015 observation is stale against the real clock");
  }
}
function transition(record: T015BatchRecord, state: BatchState, at: string): void { record.state = state; record.transitions.push({ state, observed_at: timestamp(at) }); }
function sanitizeFacts(value: Record<string, unknown>): Record<string, unknown> { const text = JSON.stringify(value); if (/https?:\/\//i.test(text) || /result_url|thumbnail_url|raw_error/i.test(text)) return { redacted_reason: "SENSITIVE_PROVIDER_VALUE_REMOVED" }; return value; }
function failStop(journal: T015OperationsJournal, record: T015BatchRecord, code: TerminalCode, at: string, facts: Record<string, unknown>): never {
  record.terminal = { code, observed_at: timestamp(at), facts: sanitizeFacts(facts), automatic_paid_retry: false, paid_retry_count: 0, no_resubmit: true };
  transition(record, "FAIL_STOP", at); journal.run_state = "FAIL_STOP"; throw new Error(`${code}: T015 fail-stop; no paid retry or resubmit`);
}

export function buildInitialT015Journal(plan: T015CanonicalShardPlan, presentation: T015DisclosurePresentationEvidence, approval: T015ApprovalEvidence): T015OperationsJournal {
  return { schema_version: 1, journal_version: "t015-canonical-shard-1-operations-v1", redacted: true, plan_sha256: t015PlanSha256(plan), disclosure_presentation_evidence_sha256: sha256T015(renderT015CanonicalJson(presentation)), approval_evidence_sha256: sha256T015(renderT015CanonicalJson(approval)), provider_schema_evidence_sha256: sha256T015(renderT015CanonicalJson(buildT015ProviderSchemaEvidence())), t014_approval_sha256: "72f5e863806cdee5b7638d8bb1cd9f1fab2c20feb6aeae3c53ba7ef6be872c96", run_state: "ACTIVE", initial_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00", paid_retry_count: 0, local_root: LOCAL_ROOT, backup_root: BACKUP_ROOT, expected_provider_reported_model: EXPECTED_MODEL, batches: plan.batches.map((batch) => ({ batch_id: batch.id, asset_ids: [...batch.asset_ids], state: "PLANNED", transitions: [], job_polls: [], recoveries: [], recovery_failures: [] })) };
}

function assertSafeJournalSerialization(journal: T015OperationsJournal): void {
  const serialized = JSON.stringify(journal);
  if (/https?:\/\//i.test(serialized) || /result_url|thumbnail_url|raw_error/i.test(serialized)) throw new Error("T015 journal contains durable sensitive provider data");
}

function expectedTransitions(record: T015BatchRecord): T015BatchRecord["transitions"] {
  const result: T015BatchRecord["transitions"] = [];
  if (record.preflight) result.push({ state: "PREFLIGHT_REQUESTED", observed_at: record.preflight.requested_at });
  if (record.preflight?.costs && record.preflight.balance) result.push({ state: "PREFLIGHT_VERIFIED", observed_at: record.preflight.balance.provider_observed_at });
  if (record.paid_request) result.push({ state: "SUBMITTING", observed_at: record.paid_request.prepared_at });
  if (record.submission) result.push({ state: "SUBMITTED", observed_at: record.submission.observed_at });
  if (record.terminal) result.push({ state: "FAIL_STOP", observed_at: record.terminal.observed_at });
  if (record.recovery_gate) result.push({ state: "RECOVERY_ONLY", observed_at: record.recovery_gate.opened_at });
  if (record.recoveries.length > 0) result.push({ state: "RECOVERING", observed_at: record.recoveries[0].observed_at });
  if (record.recoveries.length === record.asset_ids.length && record.recoveries.length > 0) result.push({ state: "RECOVERED", observed_at: record.recoveries.at(-1)!.observed_at });
  if (record.balance_after) result.push({ state: "COMPLETE", observed_at: record.balance_after.observed_at });
  return result;
}

export function validateT015Journal(journal: T015OperationsJournal, plan: T015CanonicalShardPlan, presentation: T015DisclosurePresentationEvidence, approval: T015ApprovalEvidence, runtimeRoot?: string): void {
  const expected = buildInitialT015Journal(plan, presentation, approval);
  if (journal.schema_version !== 1 || journal.journal_version !== expected.journal_version || journal.redacted !== true || journal.plan_sha256 !== expected.plan_sha256 || journal.disclosure_presentation_evidence_sha256 !== expected.disclosure_presentation_evidence_sha256 || journal.approval_evidence_sha256 !== expected.approval_evidence_sha256 || journal.provider_schema_evidence_sha256 !== expected.provider_schema_evidence_sha256 || journal.t014_approval_sha256 !== expected.t014_approval_sha256 || journal.initial_credit_cap_decimal !== "498.00" || journal.automatic_paid_retry_reserve_decimal !== "0.00" || journal.paid_retry_count !== 0 || journal.local_root !== LOCAL_ROOT || journal.backup_root !== BACKUP_ROOT || journal.expected_provider_reported_model !== EXPECTED_MODEL || journal.batches.length !== 28) throw new Error("T015 journal header changed");
  assertSafeJournalSerialization(journal);
  let totalDelta = 0;
  const globalJobs = new Set<string>();
  const globalRecovered = new Set<string>();
  journal.batches.forEach((record, batchIndex) => {
    const expectedBatch = plan.batches[batchIndex];
    if (record.batch_id !== expectedBatch.id || canonicalJson(record.asset_ids) !== canonicalJson(expectedBatch.asset_ids) || new Set(record.asset_ids).size !== record.asset_ids.length) throw new Error("T015 journal batch binding changed");
    record.transitions.forEach((item, index) => { timestamp(item.observed_at); if (index > 0 && Date.parse(item.observed_at) < Date.parse(record.transitions[index - 1].observed_at)) throw new Error("T015 transition chronology changed"); });
    const transitions = expectedTransitions(record);
    if (canonicalJson(record.transitions) !== canonicalJson(transitions) || record.state !== (transitions.at(-1)?.state ?? "PLANNED")) throw new Error("T015 transition evidence changed");
    if (record.preflight) {
      const expectedRequest = preflightEnvelope(plan, record.batch_id);
      if (canonicalJson({ requests: record.preflight.requests }) !== canonicalJson(expectedRequest) || record.preflight.requests_sha256 !== sha256T015(canonicalJson(expectedRequest))) throw new Error("T015 preflight requests changed");
      timestamp(record.preflight.requested_at);
      if ((record.preflight.costs === undefined) !== (record.preflight.balance === undefined)) throw new Error("T015 costs and balance must be paired");
      if (record.preflight.costs) {
        if (record.preflight.costs.length !== record.asset_ids.length) throw new Error("T015 requires one exact cost per request");
        const seenCostTimestamps = new Set<string>();
        record.preflight.costs.forEach((cost, index) => {
          const asset = plan.assets.find(({ id }) => id === record.asset_ids[index])!;
          const expectedRequestSha = sha256T015(canonicalJson(getCostRequest(asset.request)));
          timestamp(cost.provider_observed_at);
          const previousAt = index === 0 ? record.preflight!.requested_at : record.preflight!.costs![index - 1].provider_observed_at;
          if (cost.index !== asset.index || cost.request_sha256 !== expectedRequestSha || cost.credits_exact !== 1.5 || cost.normalized_decimal !== "1.50" || decimals(cost.credits, "journal cost").decimal !== "1.50" || seenCostTimestamps.has(cost.provider_observed_at) || Date.parse(cost.provider_observed_at) <= Date.parse(previousAt) || Date.parse(cost.provider_observed_at) - Date.parse(record.preflight!.requested_at) > FRESHNESS_MS) throw new Error("T015 invalid per-request preflight cost");
          seenCostTimestamps.add(cost.provider_observed_at);
        });
      }
      if (record.preflight.balance) {
        timestamp(record.preflight.balance.provider_observed_at);
        if (decimals(record.preflight.balance.credits, "journal balance").decimal !== record.preflight.balance.normalized_decimal || Date.parse(record.preflight.balance.provider_observed_at) <= Date.parse(record.preflight.costs!.at(-1)!.provider_observed_at) || Date.parse(record.preflight.balance.provider_observed_at) - Date.parse(record.preflight.requested_at) > FRESHNESS_MS) throw new Error("T015 invalid preflight balance");
      }
    }
    if (record.paid_request) {
      if (!record.preflight?.costs || !record.preflight.balance || record.paid_request.request_sha256 !== sha256T015(canonicalJson(paidEnvelope(plan, record.batch_id)))) throw new Error("T015 paid envelope lacks exact preflight binding");
      timestamp(record.paid_request.prepared_at);
    }
    if (record.submission) {
      if (!record.paid_request || record.submission.expected_count !== record.asset_ids.length || record.submission.submitted_count !== record.submission.jobs.length || record.submission.complete !== (record.submission.jobs.length === record.asset_ids.length && record.submission.failed_count === 0) || canonicalJson(record.submission.missing_asset_ids) !== canonicalJson(record.asset_ids.filter((id) => !record.submission!.jobs.some(({ asset_id }) => asset_id === id)))) throw new Error("T015 submission binding changed");
      record.submission.jobs.forEach((job) => {
        const asset = plan.assets.find(({ id }) => id === job.asset_id)!;
        if (job.index !== asset.index || job.asset_id !== asset.id || job.canonical_request_sha256 !== asset.canonical_request_sha256 || globalJobs.has(job.job_id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(job.job_id) || !SUBMIT_STATUSES.includes(job.status)) throw new Error("T015 submitted job binding changed");
        globalJobs.add(job.job_id);
      });
    }
    if (record.recovery_gate && !record.submission) throw new Error("T015 recovery gate has no durable job IDs");
    record.job_polls.forEach((poll) => {
      timestamp(poll.observed_at);
      if (!record.submission || poll.jobs.length !== record.submission.jobs.length || new Set(poll.jobs.map(({ index }) => index)).size !== poll.jobs.length || new Set(poll.jobs.map(({ job_id }) => job_id)).size !== poll.jobs.length) throw new Error("T015 job poll binding changed");
      poll.jobs.forEach((job) => { if (!record.submission!.jobs.some((expectedJob) => expectedJob.index === job.index && expectedJob.job_id === job.job_id) || !WAIT_STATUSES.includes(job.status)) throw new Error("T015 job poll binding changed"); });
    });
    record.recoveries.forEach((recovery) => {
      const asset = plan.assets.find(({ id }) => id === recovery.asset_id);
      const job = record.submission?.jobs.find(({ asset_id }) => asset_id === recovery.asset_id);
      if (!asset || !job || recovery.provider_job_index !== job.index || recovery.provider_job_id !== job.job_id || recovery.local_relative_path !== asset.path || recovery.backup_relative_path !== asset.path || recovery.provider_native_unmodified !== true || globalRecovered.has(asset.id) || !/^[a-f0-9]{64}$/.test(recovery.sha256) || !Number.isSafeInteger(recovery.size_bytes) || recovery.size_bytes < 1 || !Number.isSafeInteger(recovery.actual_width) || recovery.actual_width < 1 || !Number.isSafeInteger(recovery.actual_height) || recovery.actual_height < 1 || !Number.isSafeInteger(recovery.aspect_error_ppm) || recovery.aspect_error_ppm < 0 || recovery.aspect_error_ppm > 5000) throw new Error("T015 recovery binding changed");
      globalRecovered.add(asset.id);
      if (runtimeRoot) {
        const local = verifyExistingPng(resolve(runtimeRoot, LOCAL_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5000);
        const backup = verifyExistingPng(resolve(runtimeRoot, BACKUP_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5000);
        if (local.size !== backup.size || local.width !== backup.width || local.height !== backup.height) throw new Error("T015 local and backup differ");
      }
    });
    if (record.balance_after) {
      if (record.recoveries.length !== record.asset_ids.length) throw new Error("T015 balance-after before full recovery");
      const expectedDelta = record.asset_ids.length * 150;
      const observedDelta = Number(record.balance_after.delta_decimal.replace(".", ""));
      const after = decimals(record.balance_after.credits, "journal balance after");
      if (observedDelta !== expectedDelta || after.decimal !== record.balance_after.normalized_decimal || !record.preflight?.balance || decimals(record.preflight.balance.credits, "journal balance before").units - after.units !== expectedDelta) throw new Error("T015 batch credit delta changed");
      totalDelta += observedDelta;
    }
    if (batchIndex > 0 && record.preflight?.balance && journal.batches[batchIndex - 1].balance_after?.normalized_decimal !== record.preflight.balance.normalized_decimal) throw new Error("T015 inter-batch balance chain changed");
    if (record.terminal && (record.terminal.automatic_paid_retry !== false || record.terminal.paid_retry_count !== 0 || record.terminal.no_resubmit !== true)) throw new Error("T015 terminal retry policy changed");
    record.recovery_failures.forEach((failure, failureIndex) => {
      timestamp(failure.observed_at);
      const floor = failureIndex === 0 ? record.recovery_gate?.opened_at : record.recovery_failures[failureIndex - 1].observed_at;
      if (!record.recovery_gate || !record.submission || failure.original_terminal_code !== (record.terminal?.code ?? null) || failure.recovery_only_preserved !== true || failure.automatic_paid_retry !== false || failure.paid_retry_count !== 0 || failure.no_resubmit !== true || (floor && Date.parse(failure.observed_at) < Date.parse(floor)) || canonicalJson(failure.facts) !== canonicalJson(sanitizeFacts(failure.facts))) throw new Error("T015 recovery failure evidence changed");
    });
  });
  const firstIncomplete = journal.batches.findIndex(({ state }) => state !== "COMPLETE");
  if (journal.run_state === "ACTIVE" && firstIncomplete >= 0 && journal.batches.slice(firstIncomplete + 1).some(({ state }) => state !== "PLANNED")) throw new Error("T015 batch order changed");
  const failedBatchCount = journal.batches.filter(({ terminal, recovery_failures }) => terminal !== undefined || recovery_failures.length > 0).length;
  if ((journal.run_state === "ACTIVE" && (firstIncomplete < 0 || failedBatchCount !== 0)) || (journal.run_state === "FAIL_STOP" && failedBatchCount !== 1) || (journal.run_state === "COMPLETE" && failedBatchCount !== 0)) throw new Error("T015 run-state evidence changed");
  if (totalDelta > 49_800) throw new Error("T015 credit cap exceeded");
  if (journal.run_state === "COMPLETE" && (journal.batches.some(({ state, recoveries }) => state !== "COMPLETE" || recoveries.some(({ source }) => source !== "JOBS_HANDOFF_STDIN")) || globalRecovered.size !== 332 || totalDelta !== 49_800)) throw new Error("T015 completion invariants failed");
  if (journal.run_state === "FAIL_STOP" && !journal.batches.some(({ terminal, recovery_failures }) => terminal !== undefined || recovery_failures.length > 0)) throw new Error("T015 fail-stop lacks durable failure evidence");
}

function journalPath(root: string): string { return safeResolve(root, T015_JOURNAL_PATH); }
function writeJournal(root: string, journal: T015OperationsJournal): void { assertSafeJournalSerialization(journal); atomicWriteJson(root, T015_JOURNAL_PATH, journal); }
function writeJsonNoClobber(root: string, path: string, value: unknown): void {
  const target = safeResolve(root, path, true);
  const bytes = renderT015CanonicalJson(value);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 evidence no-clobber conflict");
    return;
  }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { writeFileSync(descriptor, bytes, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 evidence no-clobber race conflict");
    }
    unlinkSync(temporary);
  } finally { rmSync(temporary, { force: true }); }
}
export function writeT015NoClobberJsonForTest(root: string, path: string, value: unknown): void { writeJsonNoClobber(root, path, value); }
function readJournal(root: string, plan: T015CanonicalShardPlan, presentation: T015DisclosurePresentationEvidence, approval: T015ApprovalEvidence): T015OperationsJournal {
  const bytes = readFileSync(journalPath(root), "utf8"); const parsed = JSON.parse(bytes) as T015OperationsJournal;
  if (bytes !== renderT015CanonicalJson(parsed)) throw new Error("T015 journal is not canonical");
  validateT015Journal(parsed, plan, presentation, approval, root); return parsed;
}
function recordOf(journal: T015OperationsJournal, id: string) { const index = journal.batches.findIndex(({ batch_id }) => batch_id === id); if (index < 0) throw new Error("unknown T015 batch"); return { record: journal.batches[index], index }; }
function assertOrder(journal: T015OperationsJournal, index: number): void { if (journal.run_state !== "ACTIVE" || journal.batches.slice(0, index).some(({ state }) => state !== "COMPLETE") || journal.batches.slice(index + 1).some(({ state }) => state !== "PLANNED")) throw new Error("T015 batches must progress exactly in order"); }
function loadJson(root: string, path: string): unknown { const absolute = isAbsolute(path) ? resolve(path) : safeResolve(root, path); const info = lstatSync(absolute); if (info.isSymbolicLink() || !info.isFile()) throw new Error("T015 provider input must be a regular file"); return JSON.parse(readFileSync(absolute, "utf8")); }
function persistFail(root: string, journal: T015OperationsJournal, record: T015BatchRecord, code: TerminalCode, at: string, facts: Record<string, unknown>): never { try { failStop(journal, record, code, at, facts); } finally { writeJournal(root, journal); } }
function persistRecoveryFail(root: string, journal: T015OperationsJournal, record: T015BatchRecord, code: "RECOVERY_FAILED" | "PROVIDER_RESPONSE_SIGNAL" | "UNKNOWN_PROVIDER_FIELD" | "GENERATION_FAILED" | "MODEL_DRIFT" | "FILE_CONFLICT", at: string, facts: Record<string, unknown>): never {
  if (!record.recovery_gate || !record.submission) persistFail(root, journal, record, code, at, facts);
  record.recovery_failures.push({ code, observed_at: timestamp(at), facts: sanitizeFacts(facts), original_terminal_code: record.terminal?.code ?? null, recovery_only_preserved: true, automatic_paid_retry: false, paid_retry_count: 0, no_resubmit: true });
  journal.run_state = "FAIL_STOP";
  writeJournal(root, journal);
  throw new Error(`${code}: T015 recovery fail-stop; recovery-only job binding preserved; no paid retry or resubmit`);
}
function loadProviderJsonOrFail(root: string, path: string, journal: T015OperationsJournal, record: T015BatchRecord, code: TerminalCode, at: string, stage: string): unknown {
  try { return loadJson(root, path); } catch { persistFail(root, journal, record, code, at, { stage, reason: "INVALID_OR_UNSAFE_JSON_INPUT" }); }
}

function validateApprovalBindings(root: string, plan: T015CanonicalShardPlan, presentation: T015DisclosurePresentationEvidence, approval: T015ApprovalEvidence): void {
  const risk = buildT015RiskDisclosure(); const schema = buildT015ProviderSchemaEvidence();
  const bindingRoot = root === repositoryRoot ? root : repositoryRoot;
  validateT015DisclosurePresentationEvidence(presentation, bindingRoot, plan, risk, schema);
  if (root === repositoryRoot) validateT015ApprovalEvidence(approval, root, plan, risk, schema, presentation);
  else if (approval.plan_sha256 !== t015PlanSha256(plan) || approval.disclosure_presentation_evidence_sha256 !== sha256T015(renderT015CanonicalJson(presentation)) || approval.risk_disclosure_evidence_sha256 !== sha256T015(renderT015CanonicalJson(risk)) || approval.provider_schema_evidence_sha256 !== sha256T015(renderT015CanonicalJson(schema)) || approval.controller_approval_attestation_path !== T015_CONTROLLER_APPROVAL_ATTESTATION_PATH || !/^[a-f0-9]{64}$/.test(approval.controller_approval_attestation_sha256) || approval.implementation_binding_sha256 !== plan.sources.implementation_binding.sha256 || approval.source !== "controller approval attestation") throw new Error("T015 diagnostic approval binding changed");
  if (approval.exact_user_quote !== T015_EXACT_APPROVAL_PHRASE) throw new Error("T015 exact approval missing");
}

const T015_CLEAN_SCOPE = [...Object.values(T015_RUNTIME_FILE_PATHS), T015_IMPLEMENTATION_BINDING_PATH, T015_PLAN_PATH, T015_RISK_PATH, T015_SCHEMA_PATH, T015_CONTROLLER_ATTESTATION_PATH, T015_CONTROLLER_APPROVAL_ATTESTATION_PATH, T015_PRESENTATION_PATH, T015_APPROVAL_PATH, T015_CORE_PLAN_PATH, T015_MASTER_STYLE_PATH, T015_T014_APPROVAL_PATH] as const;

export function assertT015ProductionImplementationClean(root = repositoryRoot): void {
  buildT015CanonicalShardPlan(root);
  let status: string;
  try { status = execFileSync("git", ["status", "--porcelain=v1", "--", ...T015_CLEAN_SCOPE], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { throw new Error("T015 production cannot verify clean implementation scope"); }
  if (status.trim() !== "") throw new Error("T015 production implementation scope is dirty or untracked");
}

export function runT015OpsInternal(args: readonly string[], root: string, plan: T015CanonicalShardPlan, presentation: T015DisclosurePresentationEvidence, approval: T015ApprovalEvidence, diagnostic = false, now?: () => Date): Record<string, unknown> {
  validateApprovalBindings(root, plan, presentation, approval);
  const command = args[0];
  if (command === "init") {
    if (args.length !== 1) throw new Error("usage: init");
    const lock = acquireRunnerLock(root, LOCK_PATH);
    try {
      if (existsSync(journalPath(root))) return { command, state: readJournal(root, plan, presentation, approval).run_state, idempotent: true };
      assertNonOverlappingRoots(resolve(root, LOCAL_ROOT), resolve(root, BACKUP_ROOT));
      const initial = buildInitialT015Journal(plan, presentation, approval);
      atomicWriteJson(root, T015_JOURNAL_PATH, initial);
      return { command, state: "ACTIVE", batches: 28 };
    } finally { lock.release(); }
  }
  const lock = acquireRunnerLock(root, LOCK_PATH);
  try {
    const journal = readJournal(root, plan, presentation, approval);
    if (command === "preflight-request") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id); assertOrder(journal, index);
      assertWallClock(at, now);
      if (record.state !== "PLANNED") throw new Error("T015 batch is not PLANNED");
      const request = preflightEnvelope(plan, id); record.preflight = { requests: request.requests, requests_sha256: sha256T015(canonicalJson(request)), requested_at: at }; transition(record, "PREFLIGHT_REQUESTED", at); writeJournal(root, journal); return request as unknown as Record<string, unknown>;
    }
    if (command === "preflight-result") {
      const id = option(args, "--batch"); const { record, index } = recordOf(journal, id); assertOrder(journal, index);
      if (record.state !== "PREFLIGHT_REQUESTED" || !record.preflight) throw new Error("T015 durable preflight request required");
      const fallbackAt = now?.().toISOString() ?? record.preflight.requested_at;
      const costRaw = loadProviderJsonOrFail(root, option(args, "--cost-file"), journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, "GET_COST_JSON"); const balanceRaw = loadProviderJsonOrFail(root, option(args, "--balance-file"), journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, "BALANCE_JSON");
      if (!costRaw || typeof costRaw !== "object" || Array.isArray(costRaw) || !balanceRaw || typeof balanceRaw !== "object" || Array.isArray(balanceRaw)) persistFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "PREFLIGHT" });
      try { exactKeys(balanceRaw as Record<string, unknown>, ["credits", "provider_observed_at"]); } catch { persistFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "PREFLIGHT" }); }
      try { exactKeys(costRaw as Record<string, unknown>, ["costs"]); } catch { persistFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "GET_COST" }); }
      const costItems = (costRaw as { costs?: unknown }).costs;
      if (!Array.isArray(costItems) || costItems.length !== record.asset_ids.length) persistFail(root, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_COUNT" });
      const costs: NonNullable<T015BatchRecord["preflight"]>["costs"] = [];
      costItems.forEach((item, itemIndex) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) persistFail(root, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_SHAPE", item_index: itemIndex });
        const value = item as Record<string, unknown>;
        try { exactKeys(value, ["index", "request_sha256", "cost", "provider_observed_at"]); } catch { persistFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "PER_REQUEST_COST_FIELDS", item_index: itemIndex }); }
        const asset = plan.assets.find(({ id }) => id === record.asset_ids[itemIndex])!;
        const expectedRequestSha = sha256T015(canonicalJson(getCostRequest(asset.request)));
        const costAt = typeof value.provider_observed_at === "string" ? value.provider_observed_at : fallbackAt;
        try { assertWallClock(costAt, now, itemIndex === 0 ? record.preflight!.requested_at : costs[itemIndex - 1].provider_observed_at, FRESHNESS_MS); } catch { persistFail(root, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_TIME", item_index: itemIndex }); }
        if (value.index !== asset.index || value.request_sha256 !== expectedRequestSha || costs.some(({ provider_observed_at }) => provider_observed_at === costAt) || Date.parse(costAt) <= Date.parse(itemIndex === 0 ? record.preflight!.requested_at : costs[itemIndex - 1].provider_observed_at) || Date.parse(costAt) - Date.parse(record.preflight!.requested_at) > FRESHNESS_MS || !value.cost || typeof value.cost !== "object" || Array.isArray(value.cost)) persistFail(root, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_BINDING", item_index: itemIndex });
        try { exactKeys(value.cost as Record<string, unknown>, ["credits", "credits_exact"]); } catch { persistFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "PER_REQUEST_COST_VALUE_FIELDS", item_index: itemIndex }); }
        let display; let exact;
        try { display = decimals((value.cost as { credits?: unknown }).credits, "cost credits"); exact = decimals((value.cost as { credits_exact?: unknown }).credits_exact, "cost credits_exact"); } catch { persistFail(root, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_NORMALIZATION", item_index: itemIndex }); }
        if (display.decimal !== "1.50" || exact.decimal !== "1.50") persistFail(root, journal, record, "PRICE_CHANGED", fallbackAt, { item_index: itemIndex, observed_display_decimal: display.decimal, observed_exact_decimal: exact.decimal });
        costs.push({ index: asset.index, request_sha256: expectedRequestSha, credits: display.value, credits_exact: 1.5, normalized_decimal: "1.50", provider_observed_at: costAt });
      });
      const balanceAtRaw = (balanceRaw as { provider_observed_at?: unknown }).provider_observed_at;
      const balanceAt = typeof balanceAtRaw === "string" ? balanceAtRaw : fallbackAt;
      try { assertWallClock(balanceAt, now, costs.at(-1)!.provider_observed_at, FRESHNESS_MS); } catch { persistFail(root, journal, record, "BALANCE_CHANGED", fallbackAt, { stage: "OBSERVATION_TIME" }); }
      if (Date.parse(balanceAt) <= Date.parse(costs.at(-1)!.provider_observed_at) || Date.parse(balanceAt) - Date.parse(record.preflight.requested_at) > FRESHNESS_MS) persistFail(root, journal, record, "BALANCE_CHANGED", fallbackAt, { stage: "OBSERVATION_ORDER" });
      let balance;
      try { balance = decimals((balanceRaw as { credits?: unknown }).credits, "balance"); } catch { persistFail(root, journal, record, "BALANCE_CHANGED", balanceAt, { stage: "NORMALIZATION" }); }
      const previous = index === 0 ? undefined : journal.batches[index - 1].balance_after;
      const remainingCost = plan.batches.slice(index).reduce((sum, item) => sum + item.size * 150, 0);
      if (balance.units < remainingCost || (previous && previous.normalized_decimal !== balance.decimal)) persistFail(root, journal, record, "BALANCE_CHANGED", balanceAt, { expected_previous_decimal: previous?.normalized_decimal ?? null, observed_decimal: balance.decimal, minimum_remaining_decimal: decimal(remainingCost) });
      record.preflight.costs = costs; record.preflight.balance = { credits: balance.value, normalized_decimal: balance.decimal, provider_observed_at: balanceAt }; transition(record, "PREFLIGHT_VERIFIED", balanceAt); writeJournal(root, journal); return { command, batch_id: id, state: record.state, verified_costs: costs.length };
    }
    if (command === "prepare") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id); assertOrder(journal, index);
      assertWallClock(at, now, record.preflight?.balance?.provider_observed_at, FRESHNESS_MS);
      if (record.state !== "PREFLIGHT_VERIFIED" || !record.preflight?.costs || record.preflight.costs.length !== record.asset_ids.length || !record.preflight.balance || Date.parse(at) < Date.parse(record.preflight.balance.provider_observed_at) || Date.parse(at) - Date.parse(record.preflight.balance.provider_observed_at) > FRESHNESS_MS) throw new Error("fresh per-request T015 preflight required");
      const envelope = paidEnvelope(plan, id); record.paid_request = { request_sha256: sha256T015(canonicalJson(envelope)), prepared_at: at }; transition(record, "SUBMITTING", at); writeJournal(root, journal); return envelope as unknown as Record<string, unknown>;
    }
    if (command === "ambiguous") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const reason = option(args, "--reason"); const { record } = recordOf(journal, id);
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "SUBMITTING" || !["TIMEOUT", "TRANSPORT_ERROR", "MISSING_DEFINITE_RESULT"].includes(reason)) throw new Error("invalid T015 ambiguous transition");
      persistFail(root, journal, record, "AMBIGUOUS_SUBMISSION", at, { reason, outcome: "UNKNOWN", paid_retry: 0 });
    }
    if (command === "response") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record } = recordOf(journal, id);
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "SUBMITTING") throw new Error("durable T015 SUBMITTING state required");
      const raw = loadProviderJsonOrFail(root, option(args, "--file"), journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, "SUBMISSION_JSON"); if (!raw || typeof raw !== "object" || Array.isArray(raw)) persistFail(root, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, { response_shape: "INVALID" });
      const response = raw as Record<string, unknown>; try { exactKeys(response, ["submitted_count", "failed_count", "jobs"]); } catch { persistFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "SUBMISSION_RESPONSE" }); }
      const validCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
      const jobsRaw = Array.isArray(response.jobs) ? response.jobs : []; const jobs: T015ProviderJob[] = []; const signals: Array<{ index: number; fields: string[] }> = []; let topology = validCount(response.submitted_count) && validCount(response.failed_count) && response.submitted_count === jobsRaw.length;
      const seenIds = new Set<string>(); const seenIndices = new Set<number>();
      jobsRaw.forEach((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) { topology = false; return; }
        const value = item as Record<string, unknown>; const allowed = ["index", "job_id", "status", "adjustments", "error", "warning", "preset_recommendation"];
        try { exactKeys(value, ["index", "job_id", "status"], allowed); } catch { topology = false; return; }
        const asset = plan.assets.find(({ index }) => index === value.index); const jobId = typeof value.job_id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value.job_id) ? value.job_id : null; const status = value.status as SubmitStatus;
        if (!asset || !record.asset_ids.includes(asset.id) || !jobId || seenIds.has(jobId) || seenIndices.has(asset.index) || !SUBMIT_STATUSES.includes(status)) { topology = false; return; }
        seenIds.add(jobId); seenIndices.add(asset.index); jobs.push({ index: asset.index, asset_id: asset.id, job_id: jobId, status, canonical_request_sha256: asset.canonical_request_sha256 });
        const present = ["adjustments", "error", "warning", "preset_recommendation"].filter((key) => key in value);
        if (present.length) signals.push({ index: asset.index, fields: present });
      });
      jobs.sort((a, b) => a.index - b.index);
      const missing = record.asset_ids.filter((assetId) => !jobs.some(({ asset_id }) => asset_id === assetId));
      record.submission = { observed_at: at, expected_count: record.asset_ids.length, submitted_count: jobs.length, failed_count: validCount(response.failed_count) ? response.failed_count as number : record.asset_ids.length, complete: topology && jobs.length === record.asset_ids.length && response.failed_count === 0, missing_asset_ids: missing, jobs }; transition(record, "SUBMITTED", at);
      if (!record.submission.complete) persistFail(root, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, { expected: record.asset_ids.length, submitted_count: response.submitted_count, failed_count: response.failed_count, definite_jobs: jobs.map(({ index, asset_id, job_id, status }) => ({ index, asset_id, job_id, status })), missing_asset_ids: missing, recovery_only_for_definite_jobs: jobs.length > 0 });
      if (signals.length) persistFail(root, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { signals, definite_job_ids_preserved: true });
      const failed = jobs.find(({ status }) => ["failed", "canceled", "nsfw", "ip_detected", "submission_failed"].includes(status)); if (failed) persistFail(root, journal, record, "GENERATION_FAILED", at, { index: failed.index, asset_id: failed.asset_id, job_id: failed.job_id, status: failed.status });
      writeJournal(root, journal); return { command, batch_id: id, state: record.state, jobs: jobs.length };
    }
    if (command === "recovery-open") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const phrase = option(args, "--operator-phrase"); const { record } = recordOf(journal, id);
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (phrase === T015_RECOVERY_OPERATOR_PHRASE && ["RECOVERY_ONLY", "RECOVERING"].includes(record.state) && record.recovery_gate && record.submission?.jobs.length) return { command, batch_id: id, state: record.state, jobs: record.submission.jobs.length, new_paid_submit: false, idempotent: true, original_terminal_preserved: record.terminal !== undefined };
      if (phrase !== T015_RECOVERY_OPERATOR_PHRASE || !["SUBMITTED", "FAIL_STOP"].includes(record.state) || !record.submission || record.submission.jobs.length === 0) throw new Error("operator-gated recovery requires exact phrase and durable job IDs");
      record.recovery_gate = { opened_at: at, exact_operator_phrase_sha256: sha256T015(phrase), no_new_paid_submit: true }; transition(record, "RECOVERY_ONLY", at); writeJournal(root, journal); return { command, batch_id: id, state: record.state, jobs: record.submission.jobs.length, new_paid_submit: false };
    }
    if (command === "jobs-request") {
      const { record } = recordOf(journal, option(args, "--batch")); if (!["RECOVERY_ONLY", "RECOVERING"].includes(record.state) || !record.submission || !record.recovery_gate) throw new Error("T015 recovery-only gate is required");
      return { jobs: record.submission.jobs.map(({ index, job_id }) => ({ index, job_id })), new_paid_submit: false };
    }
    if (command === "balance-after") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record } = recordOf(journal, id); if (record.state !== "RECOVERED" || !record.preflight?.balance || record.recoveries.some(({ source }) => source !== "JOBS_HANDOFF_STDIN")) throw new Error("T015 complete stdin recovery required before balance-after");
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      const raw = loadProviderJsonOrFail(root, option(args, "--file"), journal, record, "BALANCE_CHANGED", at, "BALANCE_AFTER_JSON"); if (!raw || typeof raw !== "object" || Array.isArray(raw)) persistFail(root, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER" });
      try { exactKeys(raw as Record<string, unknown>, ["credits"]); } catch { persistFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "BALANCE_AFTER" }); }
      let after; try { after = decimals((raw as { credits?: unknown }).credits, "balance after"); } catch { persistFail(root, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER" }); }
      const before = decimals(record.preflight.balance.credits, "balance before"); const delta = before.units - after.units; const expected = record.asset_ids.length * 150;
      if (delta !== expected) persistFail(root, journal, record, "BALANCE_CHANGED", at, { expected_delta_decimal: decimal(expected), observed_delta_decimal: decimal(delta) });
      record.balance_after = { credits: after.value, normalized_decimal: after.decimal, observed_at: at, delta_decimal: decimal(delta) }; transition(record, "COMPLETE", at); if (journal.batches.every(({ state }) => state === "COMPLETE")) journal.run_state = "COMPLETE"; writeJournal(root, journal); return { command, batch_id: id, state: record.state, run_state: journal.run_state };
    }
    if (command === "evidence" || command === "audit" || command === "contact-index") {
      validateT015Journal(journal, plan, presentation, approval, root); if (journal.run_state !== "COMPLETE") throw new Error("T015 completion is required");
      let checkedAt: string;
      if (command === "evidence") { checkedAt = timestamp(option(args, "--checked-at")); assertWallClock(checkedAt, now, journal.batches.at(-1)?.balance_after?.observed_at); writeContactIndex(root, journal, plan); }
      else { const existing = JSON.parse(readFileSync(safeResolve(root, T015_ACTUAL_PATH), "utf8")) as { excluded_scope_check?: { checked_at?: unknown } }; if (typeof existing.excluded_scope_check?.checked_at !== "string") throw new Error("T015 actual evidence exclusion timestamp missing"); checkedAt = existing.excluded_scope_check.checked_at; }
      const evidence = buildT015ActualEvidence(journal, plan, root, checkedAt);
      if (command === "evidence") { writeJsonNoClobber(root, T015_ACTUAL_PATH, evidence); return { command, path: T015_ACTUAL_PATH, sha256: sha256T015(renderT015CanonicalJson(evidence)), assets: 332, contact_segments: 28 }; }
      const evidencePath = safeResolve(root, T015_ACTUAL_PATH); if (!existsSync(evidencePath) || readFileSync(evidencePath, "utf8") !== renderT015CanonicalJson(evidence)) throw new Error("exact T015 actual evidence required");
      if (command === "audit") return { command, state: "COMPLETE", assets: 332, batches: 28, total_delta_decimal: "498.00", paid_retries: 0, excluded_id_present: false, local_backup_verified: true, stdin_recovery_bindings: 332 };
      return { command, path: CONTACT_INDEX_PATH, segments: 28, eager_full_image_load: false };
    }
    if (diagnostic && command === "fixture-ingest") {
      const id = option(args, "--batch"); const assetId = option(args, "--asset"); const input = option(args, "--input-png"); const at = timestamp(option(args, "--observed-at")); const { record } = recordOf(journal, id); if (!record.submission) throw new Error("fixture requires submission");
      ingestDownloaded(root, journal, record, plan, assetId, isAbsolute(input) ? resolve(input) : safeResolve(root, input), at, "DIAGNOSTIC_OFFLINE_FIXTURE"); writeJournal(root, journal); return { command, asset_id: assetId };
    }
    throw new Error("usage: T015 ops <init|preflight-request|preflight-result|prepare|response|ambiguous|recovery-open|jobs-request|jobs-handoff|balance-after|evidence|audit|contact-index>");
  } finally { lock.release(); }
}

function ingestDownloaded(root: string, journal: T015OperationsJournal, record: T015BatchRecord, plan: T015CanonicalShardPlan, assetId: string, inputPath: string, at: string, source: T015Recovery["source"], preserveOriginalTerminal = false): void {
  const asset = plan.assets.find(({ id }) => id === assetId); const job = record.submission?.jobs.find(({ asset_id }) => asset_id === assetId);
  if (!asset || !job || record.recoveries.some(({ asset_id }) => asset_id === assetId) || lstatSync(inputPath).isSymbolicLink() || !lstatSync(inputPath).isFile()) {
    if (preserveOriginalTerminal && record.terminal) throw new Error("INVALID_BINDING_OR_INPUT");
    failStop(journal, record, "RECOVERY_FAILED", at, { asset_id: assetId, reason: "INVALID_BINDING_OR_INPUT" });
  }
  try {
    const local = atomicWriteVerifiedPng(resolve(root, LOCAL_ROOT), asset.path, readFileSync(inputPath), "3:4", DEFAULT_MAX_PNG_BYTES, 5000);
    const backup = backupVerifiedFile(resolve(root, LOCAL_ROOT), resolve(root, BACKUP_ROOT), asset.path, local.sha256, "3:4", DEFAULT_MAX_PNG_BYTES, 5000);
    if (local.sha256 !== backup.sha256 || local.size !== backup.size) throw new Error("EXISTING_FILE_CONFLICT");
    record.recoveries.push({ asset_id: assetId, provider_job_index: job.index, provider_job_id: job.job_id, source, observed_at: at, local_relative_path: asset.path, backup_relative_path: asset.path, sha256: local.sha256, size_bytes: local.size, actual_width: local.width, actual_height: local.height, aspect_error_ppm: local.aspect_error_ppm, provider_native_unmodified: true });
    if (record.state === "RECOVERY_ONLY") transition(record, "RECOVERING", at); if (record.recoveries.length === record.asset_ids.length) transition(record, "RECOVERED", at);
  } catch (error) {
    if (preserveOriginalTerminal && record.terminal) throw error;
    failStop(journal, record, "RECOVERY_FAILED", at, { asset_id: assetId, reason: error instanceof Error && ["EXISTING_FILE_CONFLICT", "SYMLINK_TRAVERSAL"].includes(error.message) ? "FILE_CONFLICT" : "PNG_OR_ATOMIC_STORE_FAILED" });
  }
}

export function buildT015ActualEvidence(journal: T015OperationsJournal, plan: T015CanonicalShardPlan, runtimeRoot?: string, checkedAt = "1970-01-01T00:00:00.000Z"): Record<string, unknown> {
  if (journal.run_state !== "COMPLETE") throw new Error("T015 run is not complete");
  const assets = journal.batches.flatMap((batch) => batch.recoveries.map((recovery) => ({ ...recovery, canonical_request_sha256: plan.assets.find(({ id }) => id === recovery.asset_id)!.canonical_request_sha256 })));
  const excludedScopeCheck = runtimeRoot ? checkExcludedT015CanonicalPaths(runtimeRoot, checkedAt) : { checked_at: checkedAt, checked_count: 994, public_present_count: 0, backup_present_count: 0, all_absent: true };
  return { schema_version: 1, evidence_version: "t015-canonical-shard-1-actual-run-v1", secret_free: true, plan_sha256: journal.plan_sha256, category: "CANONICAL", slice: "0..331", assets, asset_count: assets.length, batch_count: 28, request_job_recovery_binding_count: assets.length, local_backup_hashes_equal: true, provider_native_unmodified: true, total_credit_delta_decimal: journal.batches.reduce((sum, batch) => sum + Number(batch.balance_after!.delta_decimal), 0).toFixed(2), paid_retry_count: 0, excluded_first_id: "forge__join_02__wash_02", excluded_first_id_present: assets.some(({ asset_id }) => asset_id === "forge__join_02__wash_02"), excluded_scope_check: excludedScopeCheck, contact_index: runtimeRoot ? readContactManifest(runtimeRoot, plan) : { status: "REQUIRED_FOR_PRODUCTION_EVIDENCE", segmented: true, lazy_loaded: true, expected_segment_count: 28 }, audit: { exact_request_job_recovery_bindings: assets.length, local_backup_hashes_equal: true, total_credit_delta_decimal: "498.00", paid_retry_count: 0, no_index_332_or_later: excludedScopeCheck.all_absent } };
}

export function checkExcludedT015CanonicalPaths(root: string, checkedAt: string): { checked_at: string; checked_count: number; public_present_count: 0; backup_present_count: 0; all_absent: true } {
  timestamp(checkedAt);
  const core = JSON.parse(readFileSync(resolve(repositoryRoot, "assets/manifests/core-v1.plan.json"), "utf8")) as { assets: Array<{ category: string; path: string }> };
  const excluded = core.assets.filter(({ category }) => category === "CANONICAL").slice(332);
  const publicPresent = excluded.filter(({ path }) => existsSync(safeResolve(resolve(root, LOCAL_ROOT), path)));
  const backupPresent = excluded.filter(({ path }) => existsSync(safeResolve(resolve(root, BACKUP_ROOT), path)));
  if (excluded.length !== 994 || publicPresent.length > 0 || backupPresent.length > 0) throw new Error("T015 excluded CANONICAL path exists or scope changed");
  return { checked_at: checkedAt, checked_count: excluded.length, public_present_count: 0, backup_present_count: 0, all_absent: true };
}

function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function writeContactIndex(root: string, journal: T015OperationsJournal, plan: T015CanonicalShardPlan): void {
  // Contact output is intentionally segmented: no page references more than 12 PNGs.
  const fs = requireFs();
  journal.batches.forEach((batch, index) => {
    const cards = batch.asset_ids.map((id) => plan.assets.find((asset) => asset.id === id)!).map((asset) => `<figure><img loading="lazy" src="../../../../public/assets/${escapeHtml(asset.path)}" alt="${escapeHtml(asset.id)}"><figcaption>${escapeHtml(asset.id)}</figcaption></figure>`).join("\n");
    fs(`${CONTACT_SEGMENT_ROOT}/batch-${String(index + 1).padStart(3, "0")}.html`, `<!doctype html><meta charset="utf-8"><title>T015 batch ${index + 1}</title><main>${cards}</main>\n`);
  });
  const links = plan.batches.map((batch, index) => `<li><a href="t015-canonical-shard-1-v1/batch-${String(index + 1).padStart(3, "0")}.html">${escapeHtml(batch.id)} (${batch.size})</a></li>`).join("\n");
  fs(CONTACT_INDEX_PATH, `<!doctype html><meta charset="utf-8"><title>T015 CANONICAL shard 1</title><h1>T015 CANONICAL 0..331</h1><p>332 assets; segmented into 28 lazy-loaded batch pages.</p><ol>${links}</ol>\n`);
  function requireFs(): (path: string, bytes: string) => void { return (path, bytes) => { const target = safeResolve(root, path, true); if (existsSync(target)) { if (readFileSync(target, "utf8") !== bytes) throw new Error("T015 contact no-clobber conflict"); return; } writeFileSync(target, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 }); }; }
}

function readContactManifest(root: string, plan: T015CanonicalShardPlan): Record<string, unknown> {
  const indexBytes = readFileSync(safeResolve(root, CONTACT_INDEX_PATH), "utf8");
  if (/<img\b/i.test(indexBytes)) throw new Error("T015 contact index eagerly loads images");
  const segments = plan.batches.map((batch, index) => {
    const path = `${CONTACT_SEGMENT_ROOT}/batch-${String(index + 1).padStart(3, "0")}.html`;
    const bytes = readFileSync(safeResolve(root, path), "utf8");
    const imageCount = (bytes.match(/<img\b/g) ?? []).length;
    const lazyCount = (bytes.match(/loading="lazy"/g) ?? []).length;
    if (imageCount !== batch.size || lazyCount !== imageCount || imageCount > 12) throw new Error("T015 contact segment loading policy changed");
    return { batch_id: batch.id, path, sha256: sha256T015(bytes), image_count: imageCount };
  });
  return { path: CONTACT_INDEX_PATH, sha256: sha256T015(indexBytes), segmented: true, lazy_loaded: true, eager_full_image_load: false, segment_count: segments.length, segments };
}

export interface T015ResolvedAddress { address: string; family: 4 | 6 }
export interface T015PinnedFetchSpecification { url: URL; hostname: string; servername: string; pinned: T015ResolvedAddress; signal: AbortSignal }
export interface T015DownloadDependencies { resolve(hostname: string, signal: AbortSignal): Promise<readonly T015ResolvedAddress[]>; fetch(spec: T015PinnedFetchSpecification): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer; remoteAddress: string }>; timeout_ms?: number }

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

export function isPublicT015ResolvedAddress(item: T015ResolvedAddress): boolean {
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
function approvedUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 16_384) throw new Error("DOWNLOAD_FAILED"); const url = new URL(raw);
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(host) || !host.includes(".") || host === "localhost" || host.endsWith(".localhost") || !/^[a-z0-9.-]+$/i.test(host)) throw new Error("DOWNLOAD_FAILED"); return url;
}
function defaultFetch(spec: T015PinnedFetchSpecification): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer; remoteAddress: string }> {
  return new Promise((resolvePromise, reject) => {
    const request = httpsRequest({ protocol: "https:", hostname: spec.hostname, path: `${spec.url.pathname}${spec.url.search}`, method: "GET", port: 443, servername: spec.servername, rejectUnauthorized: true, signal: spec.signal, lookup: (_hostname, _options, callback) => callback(null, spec.pinned.address, spec.pinned.family) }, (response) => {
      const chunks: Buffer[] = []; let size = 0; response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > DEFAULT_MAX_PNG_BYTES) request.destroy(new Error("FILE_TOO_LARGE")); else chunks.push(chunk); }); response.on("end", () => resolvePromise({ status: response.statusCode ?? 0, headers: response.headers, bytes: Buffer.concat(chunks), remoteAddress: response.socket.remoteAddress ?? "" }));
    }); request.on("error", reject); request.end();
  });
}
const defaultDependencies: T015DownloadDependencies = { resolve: async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((item) => ({ address: item.address, family: item.family as 4 | 6 })), fetch: defaultFetch };

function withinHopDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("DOWNLOAD_FAILED"));
  return new Promise<T>((resolvePromise, reject) => {
    const abort = () => reject(new Error("DOWNLOAD_FAILED"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { signal.removeEventListener("abort", abort); resolvePromise(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

async function download(rawUrl: string, dependencies: T015DownloadDependencies): Promise<Buffer> {
  let url = approvedUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), dependencies.timeout_ms ?? DOWNLOAD_TIMEOUT_MS);
    try {
      const addresses = await withinHopDeadline(dependencies.resolve(url.hostname, controller.signal), controller.signal); if (!addresses.length || addresses.some((item) => !isPublicT015ResolvedAddress(item))) throw new Error("DOWNLOAD_FAILED"); const pinned = addresses[0];
      const response = await withinHopDeadline(dependencies.fetch({ url, hostname: url.hostname, servername: url.hostname, pinned, signal: controller.signal }), controller.signal); if (!sameNetworkAddress(response.remoteAddress, pinned.address)) throw new Error("DOWNLOAD_FAILED");
      if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.location; if (typeof location !== "string" || redirects === MAX_REDIRECTS) throw new Error("DOWNLOAD_FAILED"); url = approvedUrl(new URL(location, url).toString()); continue; }
      const contentLength = response.headers["content-length"] === undefined ? null : Number(response.headers["content-length"]);
      if (response.status !== 200 || response.headers["content-type"]?.toString().split(";", 1)[0].trim().toLowerCase() !== "image/png" || response.bytes.length > DEFAULT_MAX_PNG_BYTES || (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength !== response.bytes.length))) throw new Error("DOWNLOAD_FAILED"); return response.bytes;
    } finally { clearTimeout(timeout); }
  }
  throw new Error("DOWNLOAD_FAILED");
}

export async function runT015JobsHandoffInternal(args: readonly string[], stdinJson: string, root: string, plan: T015CanonicalShardPlan, presentation: T015DisclosurePresentationEvidence, approval: T015ApprovalEvidence, dependencies: T015DownloadDependencies = defaultDependencies, now?: () => Date): Promise<Record<string, unknown>> {
  validateApprovalBindings(root, plan, presentation, approval); if (Buffer.byteLength(stdinJson) > MAX_STDIN_BYTES) throw new Error("T015 jobs-handoff stdin too large");
  const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at"));
  const lock = acquireRunnerLock(root, LOCK_PATH);
  try {
    const journal = readJournal(root, plan, presentation, approval); const { record } = recordOf(journal, id); if (record.state !== "RECOVERY_ONLY" && record.state !== "RECOVERING") throw new Error("T015 recovery-only gate required"); if (!record.submission) throw new Error("T015 durable jobs required");
    assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
    let value: unknown;
    try { value = JSON.parse(stdinJson) as unknown; } catch { persistRecoveryFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_JSON" }); }
    if (!value || typeof value !== "object" || Array.isArray(value)) persistRecoveryFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT" }); const response = value as Record<string, unknown>;
    try { exactKeys(response, ["all_terminal", "jobs", "summary"], ["all_terminal", "jobs", "summary", "poll_after_seconds", "timed_out", "aborted"]); } catch { persistRecoveryFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT" }); }
    if (typeof response.all_terminal !== "boolean" || !Array.isArray(response.jobs) || !response.summary || typeof response.summary !== "object" || Array.isArray(response.summary) || ("timed_out" in response && typeof response.timed_out !== "boolean") || ("aborted" in response && typeof response.aborted !== "boolean") || ("poll_after_seconds" in response && (typeof response.poll_after_seconds !== "number" || !Number.isFinite(response.poll_after_seconds) || response.poll_after_seconds < 0))) persistRecoveryFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_TYPES" });
    if (response.timed_out === true || response.aborted === true) persistRecoveryFail(root, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT_INTERRUPTED", timed_out: response.timed_out === true, aborted: response.aborted === true });
    const transient = new Map<string, string>(); const redacted: T015BatchRecord["job_polls"][number]["jobs"] = []; let topology = response.jobs.length === record.submission.jobs.length; const seenIndices = new Set<number>(); const seenJobIds = new Set<string>(); let providerSignal = false;
    (response.jobs as unknown[]).forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) { topology = false; return; } const job = item as Record<string, unknown>;
      try { exactKeys(job, ["index", "job_id", "status"], ["index", "job_id", "status", "model", "result_url", "thumbnail_url", "error", "retryable", "type"]); } catch { topology = false; return; }
      const expected = record.submission!.jobs.find(({ index, job_id }) => index === job.index && job_id === job.job_id); const status = job.status as WaitStatus; if (!expected || !WAIT_STATUSES.includes(status) || seenIndices.has(expected.index) || seenJobIds.has(expected.job_id)) { topology = false; return; }
      seenIndices.add(expected.index); seenJobIds.add(expected.job_id);
      const model = typeof job.model === "string" ? job.model : null; const url = typeof job.result_url === "string" ? job.result_url : null; if (url) transient.set(expected.asset_id, url);
      if ((status === "completed") !== (url !== null) || (status === "completed" && model === null)) topology = false;
      if ("error" in job || "type" in job || (status !== "lookup_failed" && "retryable" in job)) providerSignal = true;
      redacted.push({ index: expected.index, job_id: expected.job_id, status, model, download_available: url !== null, lookup_retryable: typeof job.retryable === "boolean" ? job.retryable : null, provider_failure_detail_present: "error" in job });
    }); redacted.sort((a, b) => a.index - b.index);
    if (!topology || redacted.length !== record.submission.jobs.length) persistRecoveryFail(root, journal, record, "RECOVERY_FAILED", at, { stage: "JOBS_WAIT_TOPOLOGY", definite_job_count: redacted.length });
    const derivedSummary = Object.fromEntries([...WAIT_STATUSES].filter((status) => redacted.some((job) => job.status === status)).map((status) => [status, redacted.filter((job) => job.status === status).length]));
    const summary = response.summary as Record<string, unknown>;
    if (Object.values(summary).some((count) => !Number.isSafeInteger(count) || (count as number) < 0) || canonicalJson(summary) !== canonicalJson(derivedSummary)) persistRecoveryFail(root, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_SUMMARY_MISMATCH" });
    const derivedAllTerminal = redacted.every((job) => ["completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"].includes(job.status));
    if (response.all_terminal !== derivedAllTerminal) persistRecoveryFail(root, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT_TERMINAL_CONTRADICTION" });
    record.job_polls.push({ observed_at: at, all_terminal: response.all_terminal as boolean, timed_out: response.timed_out === true, aborted: response.aborted === true, jobs: redacted });
    if (providerSignal) persistRecoveryFail(root, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT", definite_job_ids_preserved: true });
    const permanentLookup = redacted.find((job) => job.status === "lookup_failed" && job.lookup_retryable !== true); if (permanentLookup) persistRecoveryFail(root, journal, record, "GENERATION_FAILED", at, { index: permanentLookup.index, status: permanentLookup.status, retryable: permanentLookup.lookup_retryable });
    if (redacted.some((job) => job.status === "lookup_failed" && job.lookup_retryable === true) || response.all_terminal !== true) { writeJournal(root, journal); return { command: "jobs-handoff", batch_id: id, state: record.state, repoll_same_jobs_only: true, new_paid_submit: false }; }
    const failed = redacted.find((job) => job.status !== "completed"); if (failed) persistRecoveryFail(root, journal, record, "GENERATION_FAILED", at, { index: failed.index, status: failed.status, provider_failure_detail_present: failed.provider_failure_detail_present });
    const drift = redacted.find((job) => job.model !== EXPECTED_MODEL); if (drift) persistRecoveryFail(root, journal, record, "MODEL_DRIFT", at, { batch_canary: plan.batches[0].id === id, index: drift.index, expected_model: EXPECTED_MODEL, observed_model: drift.model, batch_2_blocked: true });
    for (const job of record.submission.jobs) {
      if (record.recoveries.some(({ asset_id }) => asset_id === job.asset_id)) continue; const url = transient.get(job.asset_id); if (!url) persistRecoveryFail(root, journal, record, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "MISSING_RESULT_URL" });
      let bytes: Buffer; try { bytes = await download(url, dependencies); } catch { persistRecoveryFail(root, journal, record, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "SECURE_DOWNLOAD_FAILED" }); }
      const temporaryRoot = resolve(root, T015_RUN_ROOT); const tempRelative = `handoff-${id}-${job.index}.png`; const temporaryPath = safeResolve(temporaryRoot, tempRelative, true);
      try { writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 }); ingestDownloaded(root, journal, record, plan, job.asset_id, temporaryPath, at, "JOBS_HANDOFF_STDIN", true); }
      catch { persistRecoveryFail(root, journal, record, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "PNG_OR_ATOMIC_STORE_FAILED" }); }
      finally { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); }
    }
    writeJournal(root, journal); return { command: "jobs-handoff", batch_id: id, state: record.state, recovered: record.recoveries.length, new_paid_submit: false };
  } finally { lock.release(); }
}

function loadProductionAuthorization(plan: T015CanonicalShardPlan): { presentation: T015DisclosurePresentationEvidence; approval: T015ApprovalEvidence } {
  if (!isT015Authorized(repositoryRoot, plan)) throw new Error("T015 exact scoped approval is missing; no journal or paid operation allowed");
  return { presentation: JSON.parse(readFileSync(resolve(repositoryRoot, T015_PRESENTATION_PATH), "utf8")) as T015DisclosurePresentationEvidence, approval: JSON.parse(readFileSync(resolve(repositoryRoot, T015_APPROVAL_PATH), "utf8")) as T015ApprovalEvidence };
}

export function runT015Ops(args: readonly string[]): Record<string, unknown> { assertT015ProductionImplementationClean(); const plan = buildT015CanonicalShardPlan(repositoryRoot); const auth = loadProductionAuthorization(plan); return runT015OpsInternal(args, repositoryRoot, plan, auth.presentation, auth.approval, false, () => new Date()); }
export async function runT015JobsHandoff(args: readonly string[], stdinJson: string): Promise<Record<string, unknown>> { assertT015ProductionImplementationClean(); const plan = buildT015CanonicalShardPlan(repositoryRoot); const auth = loadProductionAuthorization(plan); return runT015JobsHandoffInternal(args, stdinJson, repositoryRoot, plan, auth.presentation, auth.approval, defaultDependencies, () => new Date()); }

async function readStdin(): Promise<string> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of process.stdin) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > MAX_STDIN_BYTES) throw new Error("T015 jobs-handoff stdin too large"); chunks.push(bytes); } return Buffer.concat(chunks).toString("utf8"); }
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { const args = process.argv.slice(2); const result = args[0] === "jobs-handoff" ? await runT015JobsHandoff(args, await readStdin()) : runT015Ops(args); console.log(JSON.stringify(result)); }
  catch (error) { console.error(error instanceof Error ? error.message : "T015 operations failed"); process.exitCode = 1; }
}
