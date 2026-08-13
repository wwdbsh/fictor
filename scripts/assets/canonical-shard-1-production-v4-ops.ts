import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from "node:https";
import { isIP } from "node:net";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MAX_PNG_BYTES, assertNonOverlappingRoots, atomicWriteJson, atomicWriteVerifiedPng, backupVerifiedFile, safeResolve, verifyExistingPng, type VerifiedFile } from "./filesystem";
import { isPublicT015V3ResolvedAddress, transportPeerMatchesT015V3Pin } from "./canonical-shard-1-recovery-v3-ops";
import {
  T015_V4_ADDITIONAL_CAP_UNITS, T015_V4_ASPECT_TOLERANCE_PPM, T015_V4_BACKUP_ROOT, T015_V4_BINDING_PATH, T015_V4_CANARY_BATCH_ID, T015_V4_CANARY_BLOCKED_BATCH_ID,
  T015_V4_CONTACT_INDEX_PATH, T015_V4_CONTACT_SEGMENT_ROOT, T015_V4_CORE_PLAN_PATH, T015_V4_EXPECTED_MODEL, T015_V4_JOURNAL_PATH, T015_V4_LEGACY_COMMITTED_UNITS,
  T015_V4_LOCAL_ROOT, T015_V4_LOCK_PATH, T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, T015_V4_PAID_ASSET_COUNT, T015_V4_PAID_BATCH_COUNT, T015_V4_PLAN_PATH,
  T015_V4_RECOVERY_OPERATOR_PHRASE, T015_V4_RESUME_OPERATOR_PHRASE, T015_V4_TOTAL_ASSET_COUNT, T015_V4_TOTAL_CAP_UNITS, T015_V4_UNIT_COST_UNITS,
  buildT015V4Plan, canonicalJsonT015 as canonicalJson, decimalT015V4 as decimal, isT015V4Authorized, loadT015V4Authorization, loadT015V4Binding, renderT015CanonicalJson, renderT015V4Plan,
  sha256T015V4 as sha256, t015V4PlanSha256, type T015V4Approval, type T015V4Asset, type T015V4Plan, type T015V4Presentation,
} from "./canonical-shard-1-production-v4";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FRESHNESS_MS = 10 * 60 * 1000;
const MAX_STDIN_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const LOCK_STALE_MS = 15 * 60 * 1000;

export type T015V4BatchState = "PLANNED" | "PREFLIGHT_REQUESTED" | "PREFLIGHT_VERIFIED" | "SUBMITTING" | "SUBMITTED" | "RECOVERY_OPEN" | "RECOVERING" | "RECOVERED" | "COMPLETE" | "FAIL_STOP";
export type T015V4RunState = "ACTIVE" | "FAIL_STOP" | "COMPLETE" | "CLOSED_WITH_LOSSES";
export type T015V4TerminalCode = "PRICE_CHANGED" | "BALANCE_CHANGED" | "AMBIGUOUS_SUBMISSION" | "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE" | "PROVIDER_RESPONSE_SIGNAL" | "UNKNOWN_PROVIDER_FIELD" | "GENERATION_FAILED" | "MODEL_DRIFT" | "RECOVERY_FAILED" | "FILE_CONFLICT";
type SubmitStatus = "pending" | "waiting" | "queued" | "in_progress" | "ip_detect" | "completed" | "failed" | "canceled" | "nsfw" | "ip_detected" | "submission_failed";
type WaitStatus = "pending" | "waiting" | "queued" | "in_progress" | "ip_detect" | "completed" | "failed" | "canceled" | "nsfw" | "ip_detected" | "lookup_failed";
const SUBMIT_STATUSES: readonly SubmitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "submission_failed"];
const WAIT_STATUSES: readonly WaitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"];
const ACTIVE_WAIT_STATUSES: readonly WaitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect"];
const FAILED_WAIT_STATUSES: readonly WaitStatus[] = ["failed", "canceled", "nsfw", "ip_detected"];
const TERMINAL_SUBMIT_FAILURES: readonly SubmitStatus[] = ["failed", "canceled", "nsfw", "ip_detected", "submission_failed"];
const JOB_OPTIONAL_KEYS = ["adjustments", "error", "warning", "preset_recommendation"] as const;
// Only these terminal codes can leave provider credits spent with nothing to show for them.
export const T015_V4_LOSS_CODES: readonly T015V4TerminalCode[] = ["AMBIGUOUS_SUBMISSION", "GENERATION_FAILED", "MODEL_DRIFT", "BALANCE_CHANGED"];
const LEGAL_EDGES: Record<T015V4BatchState, readonly T015V4BatchState[]> = {
  PLANNED: ["PREFLIGHT_REQUESTED"],
  PREFLIGHT_REQUESTED: ["PREFLIGHT_VERIFIED", "PLANNED", "FAIL_STOP"],
  PREFLIGHT_VERIFIED: ["SUBMITTING", "PLANNED", "FAIL_STOP"],
  SUBMITTING: ["SUBMITTED", "FAIL_STOP"],
  SUBMITTED: ["RECOVERY_OPEN", "FAIL_STOP"],
  RECOVERY_OPEN: ["RECOVERING", "FAIL_STOP"],
  RECOVERING: ["RECOVERED", "FAIL_STOP"],
  RECOVERED: ["COMPLETE", "FAIL_STOP"],
  COMPLETE: [],
  // A zero-spend failure may be reset back to PLANNED and re-run; a batch whose paid
  // envelope escaped may only reopen for recovery and is never re-run.
  FAIL_STOP: ["RECOVERY_OPEN", "PLANNED"],
};

export interface T015V4ProviderJob { index: number; asset_id: string; job_id: string; status: SubmitStatus; canonical_request_sha256: string }
export interface T015V4Recovery { asset_id: string; provider_job_index: number; provider_job_id: string; source: "JOBS_HANDOFF_STDIN"; observed_at: string; local_relative_path: string; backup_relative_path: string; sha256: string; size_bytes: number; actual_width: number; actual_height: number; aspect_error_ppm: number; provider_native_unmodified: true }
export interface T015V4Terminal { code: T015V4TerminalCode; observed_at: string; facts: Record<string, unknown>; automatic_paid_retry: false; paid_retry_count: 0; no_resubmit: true; scope: "BATCH" }
export interface T015V4Balance { credits: number; normalized_decimal: string; provider_observed_at: string }
export interface T015V4Discharge {
  kind: "ZERO_SPEND_RESET" | "LOSS_ACKNOWLEDGED";
  observed_at: string;
  terminals_discharged: number;
  exact_operator_phrase_sha256: string | null;
  max_exposure_units: number;
  recovered_units: number;
  observed_delta_units: number;
  acknowledged_loss_units: number;
  acknowledged_loss_decimal: string;
  balance_after_loss: T015V4Balance | null;
  resubmitted: false;
}
export interface T015V4BatchRecord {
  batch_id: string;
  asset_ids: string[];
  state: T015V4BatchState;
  transitions: Array<{ state: T015V4BatchState; observed_at: string }>;
  resets: Array<{ from_state: "PREFLIGHT_REQUESTED" | "PREFLIGHT_VERIFIED" | "FAIL_STOP"; observed_at: string; zero_spend: true }>;
  preflight?: { requests: Array<{ index: number; params: T015V4Asset["request"]["params"] & { get_cost: true } }>; requests_sha256: string; requested_at: string; costs?: Array<{ index: number; request_sha256: string; credits: 1; credits_decimal: "1.00"; credits_exact: 1.5; credits_exact_decimal: "1.50"; provider_observed_at: string }>; balance?: T015V4Balance };
  paid_request?: { request_sha256: string; prepared_at: string };
  submission?: { observed_at: string; expected_count: number; submitted_count: number; failed_count: number; topology_valid: boolean; complete: boolean; missing_asset_ids: string[]; jobs: T015V4ProviderJob[] };
  recovery_gates: Array<{ opened_at: string; exact_operator_phrase_sha256: string; no_new_paid_submit: true }>;
  job_polls: Array<{ observed_at: string; all_terminal: boolean; jobs: Array<{ index: number; job_id: string; status: WaitStatus; model: string | null; download_available: boolean; lookup_retryable: boolean | null }> }>;
  recoveries: T015V4Recovery[];
  balance_after?: { credits: number; normalized_decimal: string; observed_at: string; delta_decimal: string; delta_units: number; charged_job_count: number };
  terminals: T015V4Terminal[];
  discharges: T015V4Discharge[];
}
export type T015V4ResumeDisposition = "ZERO_SPEND" | "FULLY_RECOVERED_BALANCE_VERIFIED" | "DISCHARGED_LOSS";
export interface T015V4Journal {
  schema_version: 4;
  journal_version: "t015-canonical-shard-1-operations-v4";
  redacted: true;
  plan_sha256: string;
  disclosure_presentation_evidence_sha256: string;
  approval_evidence_sha256: string;
  immutable_forensics: T015V4Plan["immutable_forensics"];
  run_state: T015V4RunState;
  fail_stop_batch_id: string | null;
  initial_balance: T015V4Balance;
  additional_credit_cap_units: typeof T015_V4_ADDITIONAL_CAP_UNITS;
  legacy_committed_units: typeof T015_V4_LEGACY_COMMITTED_UNITS;
  total_credit_cap_units: typeof T015_V4_TOTAL_CAP_UNITS;
  automatic_paid_retry_reserve_decimal: "0.00";
  paid_retry_count: 0;
  local_root: typeof T015_V4_LOCAL_ROOT;
  backup_root: typeof T015_V4_BACKUP_ROOT;
  expected_provider_reported_model: typeof T015_V4_EXPECTED_MODEL;
  resumes: Array<{ observed_at: string; failed_batch_id: string; terminal_index: number; disposition: T015V4ResumeDisposition; exact_operator_phrase_sha256: string; resubmitted: false }>;
  batches: T015V4BatchRecord[];
}
export interface T015V4Context { root: string; plan: T015V4Plan; presentation: T015V4Presentation; approval: T015V4Approval }

/* ------------------------------------------------------------- primitives */

function timestamp(value: string): string { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("invalid T015 v4 observed timestamp"); return value; }
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
// Operator-supplied provider payloads must live inside the repository so safeResolve can
// reject symlinks and traversal; a raw absolute path is refused before the journal moves.
function operatorPath(args: readonly string[], name: string): string { const value = option(args, name); if (isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error(`T015 v4 ${name} must be a repository-relative path`); return value; }
function exactKeys(value: Record<string, unknown>, required: readonly string[], allowed = required): void { if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("unknown or missing provider field"); }
export function decimalsT015V4(value: unknown, label: string): { value: number; units: number; decimal: string } {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`invalid ${label}`);
  const units = Math.round(value * 100);
  if (!Number.isSafeInteger(units) || Math.abs(value * 100 - units) > 1e-9) throw new Error(`ambiguous ${label}`);
  return { value, units, decimal: decimal(units) };
}
function assertWallClock(at: string, now: (() => Date) | undefined, floor?: string, freshnessMs?: number): void {
  const observed = Date.parse(timestamp(at));
  if (floor && observed < Date.parse(floor)) throw new Error("T015 v4 observed timestamp is not monotonic");
  if (now) { const current = now().getTime(); if (observed > current) throw new Error("T015 v4 observed timestamp is in the future"); if (freshnessMs !== undefined && current - observed > freshnessMs) throw new Error("T015 v4 observation is stale against the real clock"); }
}
function transition(record: T015V4BatchRecord, state: T015V4BatchState, at: string): void {
  if (!LEGAL_EDGES[record.state].includes(state)) throw new Error(`T015 v4 illegal batch transition ${record.state}->${state}`);
  record.state = state; record.transitions.push({ state, observed_at: timestamp(at) });
}
function sanitizeFacts(value: Record<string, unknown>): Record<string, unknown> { const text = JSON.stringify(value); if (/https?:\/\//i.test(text) || /result_url|thumbnail_url|raw_error|hostname/i.test(text)) return { redacted_reason: "SENSITIVE_PROVIDER_VALUE_REMOVED" }; return value; }
function assertRedactedJournal(journal: T015V4Journal): void { const text = JSON.stringify(journal); if (/https?:\/\//i.test(text) || /result_url|thumbnail_url|raw_error|hostname/i.test(text)) throw new Error("T015 v4 journal contains durable sensitive provider data"); }
// The plan is immutable for the life of a process, so its derived canonical forms and
// hashes are memoised per plan instance. Validation runs on every read AND every write,
// and re-serialising 320 prompt payloads each time would dominate a 27-batch run.
interface PlanIndex { assets: Map<string, T015V4Asset>; costRequestSha: Map<string, string>; preflight: Map<string, { requests: Array<{ index: number; params: T015V4Asset["request"]["params"] & { get_cost: true } }>; canonical: string; sha256: string }>; paid: Map<string, { canonical: string; sha256: string }> }
const planIndexes = new WeakMap<object, PlanIndex>();
function planIndex(plan: T015V4Plan): PlanIndex {
  let index = planIndexes.get(plan as unknown as object);
  if (!index) { index = { assets: new Map(plan.assets.map((asset) => [asset.id, asset])), costRequestSha: new Map(), preflight: new Map(), paid: new Map() }; planIndexes.set(plan as unknown as object, index); }
  return index;
}
function batchOf(plan: T015V4Plan, id: string) { const batch = plan.batches.find((item) => item.id === id); if (!batch) throw new Error("unknown T015 v4 batch"); return batch; }
function assetOf(plan: T015V4Plan, id: string): T015V4Asset { const asset = planIndex(plan).assets.get(id); if (!asset) throw new Error("unknown T015 v4 asset"); return asset; }
export function t015V4GetCostRequest(request: T015V4Asset["request"]) { return { index: request.index, params: { ...request.params, get_cost: true as const } }; }
const getCostRequest = t015V4GetCostRequest;
function costRequestSha256(plan: T015V4Plan, asset: T015V4Asset): string {
  const cache = planIndex(plan).costRequestSha;
  let value = cache.get(asset.id);
  if (value === undefined) { value = sha256(canonicalJson(getCostRequest(asset.request))); cache.set(asset.id, value); }
  return value;
}
function paidEnvelopeOf(plan: T015V4Plan, id: string) {
  const cache = planIndex(plan).paid;
  let value = cache.get(id);
  if (!value) { const canonical = canonicalJson({ requests: batchOf(plan, id).asset_ids.map((assetId) => assetOf(plan, assetId).request) }); value = { canonical, sha256: sha256(canonical) }; cache.set(id, value); }
  return value;
}
function paidEnvelope(plan: T015V4Plan, id: string) { return { requests: batchOf(plan, id).asset_ids.map((assetId) => assetOf(plan, assetId).request) }; }
function preflightEnvelopeOf(plan: T015V4Plan, id: string) {
  const cache = planIndex(plan).preflight;
  let value = cache.get(id);
  if (!value) {
    const requests = batchOf(plan, id).asset_ids.map((assetId) => getCostRequest(assetOf(plan, assetId).request));
    if (!requests.length) throw new Error("empty T015 v4 batch");
    const canonical = canonicalJson({ requests });
    value = { requests, canonical, sha256: sha256(canonical) };
    cache.set(id, value);
  }
  return value;
}
function preflightEnvelope(plan: T015V4Plan, id: string) { return { requests: copyPreflightRequests(preflightEnvelopeOf(plan, id).requests) }; }
type PreflightRequests = NonNullable<T015V4BatchRecord["preflight"]>["requests"];
function copyPreflightRequests(requests: PreflightRequests): PreflightRequests { return requests.map(({ index, params }) => ({ index, params: { ...params, medias: params.medias.map((media) => ({ ...media })) } })); }
// Memoised per array instance: one journal object is validated on every write inside a
// command, and re-serialising 12 prompt payloads each time dominated a 27-batch run.
const requestCanonicalCache = new WeakMap<object, string>();
function canonicalOfRequests(requests: PreflightRequests): string {
  let value = requestCanonicalCache.get(requests as unknown as object);
  if (value === undefined) { value = canonicalJson({ requests }); requestCanonicalCache.set(requests as unknown as object, value); }
  return value;
}
function pngHeaderDimensions(bytes: Uint8Array): { width: number; height: number } | null { const buffer = Buffer.from(bytes); if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null; return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }; }

/* ------------------------------------------------------------------- lock */

export interface T015V4Lock { path: string; release(): void }
function fsyncDirectory(path: string): void { const descriptor = openSync(path, constants.O_RDONLY); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } }
function processAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } }
function lockDirIsStale(holderPath: string, directory: string, staleAfterMs: number): boolean {
  let stale: boolean;
  try { stale = Date.now() - lstatSync(directory).mtimeMs > staleAfterMs; } catch { return false; }
  try {
    const data = JSON.parse(readFileSync(holderPath, "utf8")) as { pid?: number; created_at_ms?: number };
    if (typeof data.pid === "number" && processAlive(data.pid)) return false;
    if (typeof data.created_at_ms === "number") return Date.now() - data.created_at_ms > staleAfterMs;
  } catch { /* an unreadable holder can only be reclaimed once the directory is stale */ }
  return stale;
}
// mkdir is the atomic primitive: exactly one process can create the lock directory, and a
// stale one is taken over by an atomic rename, so two stealers can never both hold it and
// hand out two paid envelopes. A SIGKILL leaves only a stale directory, never a wedge.
export function acquireT015V4Lock(trustedRoot: string, relativePath = T015_V4_LOCK_PATH, staleAfterMs = LOCK_STALE_MS): T015V4Lock {
  const directory = safeResolve(trustedRoot, `${relativePath}.d`, true);
  const holderPath = resolve(directory, "holder.json");
  const token = randomUUID();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      mkdirSync(directory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw new Error(`T015 v4 cannot create the runner lock directory (${code ?? "unknown"}): ${directory}`);
      if (!lockDirIsStale(holderPath, directory, staleAfterMs)) throw new Error("RUNNER_LOCKED");
      try { const stale = `${directory}.stale-${randomUUID()}`; renameSync(directory, stale); rmSync(stale, { recursive: true, force: true }); }
      catch { /* another process won the takeover race; retry mkdir and lose cleanly */ }
      continue;
    }
    try {
      const descriptor = openSync(holderPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, created_at_ms: Date.now(), token }), "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
      fsyncDirectory(directory);
    } catch { rmSync(directory, { recursive: true, force: true }); throw new Error("RUNNER_LOCKED"); }
    return {
      path: directory,
      release() {
        try { if (!existsSync(holderPath)) return; const current = JSON.parse(readFileSync(holderPath, "utf8")) as { token?: string }; if (current.token === token) rmSync(directory, { recursive: true, force: true }); }
        catch { /* release must never throw over a finished operation */ }
      },
    };
  }
  throw new Error("RUNNER_LOCKED");
}

/* -------------------------------------------------------- committed clean */

export function assertT015V4CommittedClean(root: string): void {
  const binding = loadT015V4Binding(root);
  const paths = [...new Set([T015_V4_BINDING_PATH, T015_V4_PLAN_PATH, ...Object.values(binding.files).map(({ path }) => path)])];
  let status: string;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", ...paths], { cwd: root, stdio: "ignore", maxBuffer: GIT_MAX_BUFFER });
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...paths], { cwd: root, stdio: "ignore", maxBuffer: GIT_MAX_BUFFER });
    status = execFileSync("git", ["status", "--porcelain=v1", "--", ...paths], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: GIT_MAX_BUFFER });
  } catch { throw new Error("T015 v4 production binding is not committed-clean"); }
  if (status.trim() !== "") throw new Error("T015 v4 production binding scope is dirty or untracked");
}

/* -------------------------------------------------- batch-level accessors */

function zeroSpend(record: T015V4BatchRecord): boolean { return record.paid_request === undefined && record.submission === undefined; }
function confirmedJobs(record: T015V4BatchRecord): T015V4ProviderJob[] { return record.submission?.jobs ?? []; }
function unrecoveredConfirmed(record: T015V4BatchRecord): number { return confirmedJobs(record).filter((job) => !record.recoveries.some(({ asset_id }) => asset_id === job.asset_id)).length; }
function dischargedTerminalCount(record: T015V4BatchRecord): number { return record.discharges.at(-1)?.terminals_discharged ?? 0; }
export function t015V4ActiveTerminals(record: T015V4BatchRecord): T015V4Terminal[] { return record.terminals.slice(dischargedTerminalCount(record)); }
function hasActiveTerminal(record: T015V4BatchRecord): boolean { return t015V4ActiveTerminals(record).length > 0; }
function lossDischarged(record: T015V4BatchRecord): boolean { return record.discharges.some(({ kind }) => kind === "LOSS_ACKNOWLEDGED"); }
function latestResume(journal: T015V4Journal, record: T015V4BatchRecord) { return journal.resumes.filter(({ failed_batch_id, terminal_index }) => failed_batch_id === record.batch_id && terminal_index === record.terminals.length - 1).at(-1); }
function settled(journal: T015V4Journal, record: T015V4BatchRecord): boolean { if (record.state === "COMPLETE") return true; const resume = latestResume(journal, record); return resume !== undefined && resume.disposition !== "ZERO_SPEND"; }
// An untouched batch carries no evidence of any kind, so a run stopped after a loss can
// still be closed: nothing was requested, submitted, spent, or recovered for it.
function unstarted(record: T015V4BatchRecord): boolean { return record.state === "PLANNED" && record.transitions.length === 0 && record.terminals.length === 0 && record.discharges.length === 0 && record.preflight === undefined && zeroSpend(record) && record.recoveries.length === 0 && record.job_polls.length === 0 && record.recovery_gates.length === 0; }
function closable(journal: T015V4Journal): boolean { return journal.batches.every((record) => settled(journal, record) || unstarted(record)); }
// A batch whose paid envelope escaped, or whose loss was discharged, is never re-run.
function neverReopen(record: T015V4BatchRecord): boolean { return record.paid_request !== undefined || lossDischarged(record); }
function maxExposureUnits(record: T015V4BatchRecord): number { return (record.submission ? record.submission.jobs.length : record.asset_ids.length) * T015_V4_UNIT_COST_UNITS; }
function acknowledgedLossUnits(journal: T015V4Journal): number { return journal.batches.reduce((sum, record) => sum + record.discharges.reduce((batchSum, discharge) => batchSum + discharge.acknowledged_loss_units, 0), 0); }
function capUsedUnits(journal: T015V4Journal): number { return journal.batches.reduce((sum, record) => sum + (record.balance_after?.delta_units ?? 0) + record.discharges.reduce((batchSum, discharge) => batchSum + discharge.observed_delta_units, 0), 0); }
export function t015V4CanaryVerified(journal: T015V4Journal): boolean {
  const canary = journal.batches.find(({ batch_id }) => batch_id === T015_V4_CANARY_BATCH_ID);
  if (!canary?.submission) return false;
  return canary.job_polls.some((poll) => poll.jobs.length === canary.submission!.jobs.length && poll.jobs.length > 0 && poll.jobs.every(({ status, model }) => status === "completed" && model === T015_V4_EXPECTED_MODEL));
}
// The latest observed provider balance before a batch: an earlier batch's balance-after, a
// post-loss observation, or — for the very first batch — the absolute anchor taken at init.
function balanceAnchor(journal: T015V4Journal, index: number): T015V4Balance {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const record = journal.batches[cursor];
    const loss = record.discharges.at(-1)?.balance_after_loss;
    if (loss) return loss;
    if (record.balance_after) return { credits: record.balance_after.credits, normalized_decimal: record.balance_after.normalized_decimal, provider_observed_at: record.balance_after.observed_at };
  }
  return journal.initial_balance;
}
// Inclusive anchor: the batch's own post-loss observation wins, so measuring the same
// batch twice yields a zero delta instead of re-booking a spend that already happened.
function spendAnchor(journal: T015V4Journal, index: number): T015V4Balance {
  const record = journal.batches[index];
  const loss = record.discharges.at(-1)?.balance_after_loss;
  if (loss) return loss;
  if (record.balance_after) return { credits: record.balance_after.credits, normalized_decimal: record.balance_after.normalized_decimal, provider_observed_at: record.balance_after.observed_at };
  return balanceAnchor(journal, index);
}
// A batch can still deliver everything unless a loss was discharged or an undischarged
// terminal froze it short; a healthy in-flight batch counts as deliverable.
export function t015V4BatchCanDeliverAllAssets(record: T015V4BatchRecord): boolean {
  if (lossDischarged(record)) return false;
  return record.recoveries.length === record.asset_ids.length || !hasActiveTerminal(record) || record.paid_request === undefined;
}

/* --------------------------------------------------------------- journals */

export function buildInitialT015V4Journal(plan: T015V4Plan, presentation: T015V4Presentation, approval: T015V4Approval, initialBalance: T015V4Balance): T015V4Journal {
  return {
    schema_version: 4, journal_version: "t015-canonical-shard-1-operations-v4", redacted: true, plan_sha256: t015V4PlanSha256(plan),
    disclosure_presentation_evidence_sha256: sha256(renderT015CanonicalJson(presentation)), approval_evidence_sha256: sha256(renderT015CanonicalJson(approval)),
    immutable_forensics: plan.immutable_forensics, run_state: "ACTIVE", fail_stop_batch_id: null, initial_balance: initialBalance,
    additional_credit_cap_units: T015_V4_ADDITIONAL_CAP_UNITS, legacy_committed_units: T015_V4_LEGACY_COMMITTED_UNITS, total_credit_cap_units: T015_V4_TOTAL_CAP_UNITS,
    automatic_paid_retry_reserve_decimal: "0.00", paid_retry_count: 0, local_root: T015_V4_LOCAL_ROOT, backup_root: T015_V4_BACKUP_ROOT, expected_provider_reported_model: T015_V4_EXPECTED_MODEL,
    resumes: [], batches: plan.batches.map((batch) => ({ batch_id: batch.id, asset_ids: [...batch.asset_ids], state: "PLANNED", transitions: [], resets: [], recovery_gates: [], job_polls: [], recoveries: [], terminals: [], discharges: [] })),
  };
}

function assertStateConsistency(record: T015V4BatchRecord): void {
  const state = record.state;
  const hasPreflight = record.preflight !== undefined;
  const hasCosts = record.preflight?.costs !== undefined;
  const hasBalance = record.preflight?.balance !== undefined;
  if (hasCosts !== hasBalance) throw new Error("T015 v4 costs and balance must be paired");
  const bad =
    (state === "PLANNED" && (hasPreflight || record.paid_request || record.submission || record.recovery_gates.length > 0 || record.balance_after || record.recoveries.length > 0 || record.job_polls.length > 0 || hasActiveTerminal(record))) ||
    (state === "PREFLIGHT_REQUESTED" && (!hasPreflight || hasCosts || record.paid_request || record.submission)) ||
    (state === "PREFLIGHT_VERIFIED" && (!hasCosts || record.paid_request || record.submission)) ||
    (state === "SUBMITTING" && (!record.paid_request || record.submission)) ||
    (state === "SUBMITTED" && !record.submission) ||
    (["RECOVERY_OPEN", "RECOVERING", "RECOVERED"].includes(state) && (!record.submission || record.recovery_gates.length === 0)) ||
    (state === "COMPLETE" && (!record.balance_after || hasActiveTerminal(record) || record.recoveries.length !== record.asset_ids.length)) ||
    (record.balance_after !== undefined && !["RECOVERED", "COMPLETE"].includes(state)) ||
    (hasActiveTerminal(record) && !["FAIL_STOP", "RECOVERY_OPEN", "RECOVERING", "RECOVERED"].includes(state)) ||
    (record.recoveries.length > 0 && record.recovery_gates.length === 0) ||
    (lossDischarged(record) && record.balance_after !== undefined);
  if (bad) throw new Error(`T015 v4 batch state evidence changed: ${record.batch_id}`);
}

export function validateT015V4Journal(journal: T015V4Journal, plan: T015V4Plan, presentation: T015V4Presentation, approval: T015V4Approval, runtimeRoot?: string): void {
  const expected = buildInitialT015V4Journal(plan, presentation, approval, journal.initial_balance);
  if (journal.schema_version !== 4 || journal.journal_version !== expected.journal_version || journal.redacted !== true || journal.plan_sha256 !== expected.plan_sha256 || journal.disclosure_presentation_evidence_sha256 !== expected.disclosure_presentation_evidence_sha256 || journal.approval_evidence_sha256 !== expected.approval_evidence_sha256 || canonicalJson(journal.immutable_forensics) !== canonicalJson(expected.immutable_forensics) || journal.additional_credit_cap_units !== T015_V4_ADDITIONAL_CAP_UNITS || journal.legacy_committed_units !== T015_V4_LEGACY_COMMITTED_UNITS || journal.total_credit_cap_units !== T015_V4_TOTAL_CAP_UNITS || journal.automatic_paid_retry_reserve_decimal !== "0.00" || journal.paid_retry_count !== 0 || journal.local_root !== T015_V4_LOCAL_ROOT || journal.backup_root !== T015_V4_BACKUP_ROOT || journal.expected_provider_reported_model !== T015_V4_EXPECTED_MODEL || journal.batches.length !== T015_V4_PAID_BATCH_COUNT) throw new Error("T015 v4 journal header changed");
  assertRedactedJournal(journal);
  timestamp(journal.initial_balance.provider_observed_at);
  if (decimalsT015V4(journal.initial_balance.credits, "initial balance").decimal !== journal.initial_balance.normalized_decimal) throw new Error("T015 v4 initial balance anchor changed");
  const globalJobIds = new Set<string>();
  const globalRecovered = new Set<string>();
  journal.batches.forEach((record, batchIndex) => {
    const expectedBatch = plan.batches[batchIndex];
    if (record.batch_id !== expectedBatch.id || canonicalJson(record.asset_ids) !== canonicalJson(expectedBatch.asset_ids) || new Set(record.asset_ids).size !== record.asset_ids.length) throw new Error("T015 v4 journal batch binding changed");
    let cursor: T015V4BatchState = "PLANNED";
    const resetSources: T015V4BatchState[] = [];
    // Structural proof of "only zero-spend may re-run": once a SUBMITTING transition is in
    // the log the batch can never appear back at PLANNED, whatever a writer claims.
    let spendEscaped = false;
    record.transitions.forEach((item, index) => {
      timestamp(item.observed_at);
      if (index > 0 && Date.parse(item.observed_at) < Date.parse(record.transitions[index - 1].observed_at)) throw new Error("T015 v4 transition chronology changed");
      if (!LEGAL_EDGES[cursor].includes(item.state)) throw new Error("T015 v4 transition evidence changed");
      if (item.state === "SUBMITTING") spendEscaped = true;
      if (item.state === "PLANNED") { if (spendEscaped) throw new Error("T015 v4 a batch whose paid envelope escaped can never be reset"); resetSources.push(cursor); }
      cursor = item.state;
    });
    if (record.state !== cursor) throw new Error("T015 v4 batch state does not match its transition log");
    const resetTransitions = record.transitions.filter(({ state }) => state === "PLANNED");
    if (resetTransitions.length !== record.resets.length || record.resets.some((reset, index) => reset.observed_at !== resetTransitions[index].observed_at || reset.zero_spend !== true || reset.from_state !== resetSources[index])) throw new Error("T015 v4 reset evidence changed");
    assertStateConsistency(record);
    if (record.preflight) {
      const request = preflightEnvelopeOf(plan, record.batch_id);
      if (canonicalOfRequests(record.preflight.requests) !== request.canonical || record.preflight.requests_sha256 !== request.sha256) throw new Error("T015 v4 preflight requests changed");
      timestamp(record.preflight.requested_at);
      if (record.preflight.costs) {
        if (record.preflight.costs.length !== record.asset_ids.length) throw new Error("T015 v4 requires one exact cost per request");
        const seen = new Set<string>();
        record.preflight.costs.forEach((cost, index) => {
          const asset = assetOf(plan, record.asset_ids[index]);
          const previousAt = index === 0 ? record.preflight!.requested_at : record.preflight!.costs![index - 1].provider_observed_at;
          timestamp(cost.provider_observed_at);
          if (cost.index !== asset.index || cost.request_sha256 !== costRequestSha256(plan, asset) || cost.credits !== 1 || cost.credits_decimal !== "1.00" || cost.credits_exact !== 1.5 || cost.credits_exact_decimal !== "1.50" || seen.has(cost.provider_observed_at) || Date.parse(cost.provider_observed_at) <= Date.parse(previousAt) || Date.parse(cost.provider_observed_at) - Date.parse(record.preflight!.requested_at) > FRESHNESS_MS) throw new Error("T015 v4 invalid per-request preflight cost");
          seen.add(cost.provider_observed_at);
        });
      }
      if (record.preflight.balance) {
        timestamp(record.preflight.balance.provider_observed_at);
        const observed = decimalsT015V4(record.preflight.balance.credits, "journal balance");
        if (observed.decimal !== record.preflight.balance.normalized_decimal || Date.parse(record.preflight.balance.provider_observed_at) <= Date.parse(record.preflight.costs!.at(-1)!.provider_observed_at) || Date.parse(record.preflight.balance.provider_observed_at) - Date.parse(record.preflight.requested_at) > FRESHNESS_MS) throw new Error("T015 v4 invalid preflight balance");
        const remaining = plan.batches.slice(batchIndex).reduce((sum, batch) => sum + batch.size * T015_V4_UNIT_COST_UNITS, 0);
        if (observed.units < remaining) throw new Error("T015 v4 preflight balance no longer covers the remaining batches");
        if (balanceAnchor(journal, batchIndex).normalized_decimal !== record.preflight.balance.normalized_decimal) throw new Error("T015 v4 inter-batch balance chain changed");
      }
    }
    if (record.paid_request) { if (!record.preflight?.costs || !record.preflight.balance || record.paid_request.request_sha256 !== paidEnvelopeOf(plan, record.batch_id).sha256) throw new Error("T015 v4 paid envelope lacks exact preflight binding"); timestamp(record.paid_request.prepared_at); }
    if (record.submission) {
      const derivedComplete = record.submission.topology_valid && record.submission.jobs.length === record.asset_ids.length && record.submission.failed_count === 0;
      if (!record.paid_request || typeof record.submission.topology_valid !== "boolean" || record.submission.expected_count !== record.asset_ids.length || record.submission.submitted_count !== record.submission.jobs.length || record.submission.complete !== derivedComplete || canonicalJson(record.submission.missing_asset_ids) !== canonicalJson(record.asset_ids.filter((id) => !record.submission!.jobs.some(({ asset_id }) => asset_id === id)))) throw new Error("T015 v4 submission binding changed");
      record.submission.jobs.forEach((job) => {
        const asset = assetOf(plan, job.asset_id);
        if (job.index !== asset.index || job.canonical_request_sha256 !== asset.canonical_request_sha256 || !record.asset_ids.includes(job.asset_id) || globalJobIds.has(job.job_id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(job.job_id) || !SUBMIT_STATUSES.includes(job.status)) throw new Error("T015 v4 submitted job binding changed");
        globalJobIds.add(job.job_id);
      });
    }
    record.recovery_gates.forEach((gate, index) => { timestamp(gate.opened_at); if (!record.submission || gate.exact_operator_phrase_sha256 !== sha256(T015_V4_RECOVERY_OPERATOR_PHRASE) || gate.no_new_paid_submit !== true || (index > 0 && Date.parse(gate.opened_at) < Date.parse(record.recovery_gates[index - 1].opened_at))) throw new Error("T015 v4 recovery gate evidence changed"); });
    record.job_polls.forEach((poll) => {
      timestamp(poll.observed_at);
      if (!record.submission || poll.jobs.length !== record.submission.jobs.length || new Set(poll.jobs.map(({ index }) => index)).size !== poll.jobs.length) throw new Error("T015 v4 job poll binding changed");
      poll.jobs.forEach((job) => { if (!record.submission!.jobs.some((expectedJob) => expectedJob.index === job.index && expectedJob.job_id === job.job_id) || !WAIT_STATUSES.includes(job.status)) throw new Error("T015 v4 job poll binding changed"); });
    });
    record.recoveries.forEach((recovery) => {
      const asset = plan.assets.find(({ id }) => id === recovery.asset_id);
      const job = record.submission?.jobs.find(({ asset_id }) => asset_id === recovery.asset_id);
      if (!asset || !job || recovery.provider_job_index !== job.index || recovery.provider_job_id !== job.job_id || recovery.source !== "JOBS_HANDOFF_STDIN" || recovery.local_relative_path !== asset.path || recovery.backup_relative_path !== asset.path || recovery.provider_native_unmodified !== true || globalRecovered.has(asset.id) || !/^[a-f0-9]{64}$/.test(recovery.sha256) || !Number.isSafeInteger(recovery.size_bytes) || recovery.size_bytes < 1 || !Number.isSafeInteger(recovery.actual_width) || recovery.actual_width < 1 || !Number.isSafeInteger(recovery.actual_height) || recovery.actual_height < 1 || !Number.isSafeInteger(recovery.aspect_error_ppm) || recovery.aspect_error_ppm < 0 || recovery.aspect_error_ppm > T015_V4_ASPECT_TOLERANCE_PPM) throw new Error("T015 v4 recovery binding changed");
      globalRecovered.add(asset.id);
      if (runtimeRoot) {
        const local = verifyExistingPng(resolve(runtimeRoot, T015_V4_LOCAL_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
        const backup = verifyExistingPng(resolve(runtimeRoot, T015_V4_BACKUP_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
        if (local.size !== backup.size || local.width !== backup.width || local.height !== backup.height) throw new Error("T015 v4 local and backup differ");
      }
    });
    if (record.balance_after) {
      const chargedJobs = hasActiveTerminal(record) ? confirmedJobs(record).length : record.asset_ids.length;
      const expectedDelta = chargedJobs * T015_V4_UNIT_COST_UNITS;
      const after = decimalsT015V4(record.balance_after.credits, "journal balance after");
      if (record.balance_after.charged_job_count !== chargedJobs || record.balance_after.delta_units !== expectedDelta || record.balance_after.delta_decimal !== decimal(expectedDelta) || after.decimal !== record.balance_after.normalized_decimal || unrecoveredConfirmed(record) !== 0 || !record.preflight?.balance || decimalsT015V4(record.preflight.balance.credits, "journal balance before").units - after.units !== expectedDelta) throw new Error("T015 v4 batch credit delta changed");
    }
    record.terminals.forEach((terminal) => { timestamp(terminal.observed_at); if (terminal.automatic_paid_retry !== false || terminal.paid_retry_count !== 0 || terminal.no_resubmit !== true || terminal.scope !== "BATCH" || canonicalJson(terminal.facts) !== canonicalJson(sanitizeFacts(terminal.facts))) throw new Error("T015 v4 terminal retry policy changed"); });
    record.discharges.forEach((discharge, index) => {
      timestamp(discharge.observed_at);
      const previous = index === 0 ? 0 : record.discharges[index - 1].terminals_discharged;
      const recoveredCeiling = record.recoveries.length * T015_V4_UNIT_COST_UNITS;
      const shapeIsBad = discharge.resubmitted !== false || discharge.terminals_discharged <= previous || discharge.terminals_discharged > record.terminals.length || discharge.acknowledged_loss_units !== discharge.observed_delta_units - discharge.recovered_units || discharge.acknowledged_loss_units < 0 || discharge.acknowledged_loss_decimal !== decimal(discharge.acknowledged_loss_units) || discharge.observed_delta_units < 0 || discharge.max_exposure_units !== maxExposureUnits(record) || discharge.observed_delta_units > discharge.max_exposure_units || discharge.recovered_units < 0 || discharge.recovered_units > recoveredCeiling;
      const zeroSpendIsBad = discharge.kind === "ZERO_SPEND_RESET" && (discharge.observed_delta_units !== 0 || discharge.recovered_units !== 0 || discharge.balance_after_loss !== null || discharge.exact_operator_phrase_sha256 !== null || !record.resets.some(({ observed_at }) => observed_at === discharge.observed_at));
      // Every terminal this discharge covers must itself be a spend-losing code.
      const covered = record.terminals.slice(previous, discharge.terminals_discharged);
      const lossIsBad = discharge.kind === "LOSS_ACKNOWLEDGED" && (discharge.exact_operator_phrase_sha256 !== sha256(T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE) || discharge.balance_after_loss === null || decimalsT015V4(discharge.balance_after_loss.credits, "discharge balance").decimal !== discharge.balance_after_loss.normalized_decimal || record.balance_after !== undefined || covered.length === 0 || covered.some(({ code }) => !T015_V4_LOSS_CODES.includes(code)) || record.discharges.filter(({ kind }) => kind === "LOSS_ACKNOWLEDGED").length !== 1);
      if (shapeIsBad || zeroSpendIsBad || lossIsBad) throw new Error(`T015 v4 discharge evidence changed: ${record.batch_id}`);
    });
    // A batch can never book more spend than its own exposure, however the journal was written.
    if (record.discharges.reduce((sum, discharge) => sum + discharge.observed_delta_units, 0) > maxExposureUnits(record)) throw new Error(`T015 v4 discharged spend exceeds the batch exposure: ${record.batch_id}`);
  });
  journal.resumes.forEach((resume, index) => {
    timestamp(resume.observed_at);
    const failed = journal.batches.find(({ batch_id }) => batch_id === resume.failed_batch_id);
    if (!failed || resume.resubmitted !== false || resume.exact_operator_phrase_sha256 !== sha256(T015_V4_RESUME_OPERATOR_PHRASE) || !Number.isSafeInteger(resume.terminal_index) || resume.terminal_index < 0 || resume.terminal_index >= failed.terminals.length || journal.resumes.slice(0, index).some((other) => other.failed_batch_id === resume.failed_batch_id && other.terminal_index === resume.terminal_index)) throw new Error("T015 v4 resume evidence changed");
    if (index > 0 && Date.parse(resume.observed_at) < Date.parse(journal.resumes[index - 1].observed_at)) throw new Error("T015 v4 resume chronology changed");
    if (resume.disposition === "ZERO_SPEND" && !(zeroSpend(failed) || failed.resets.some((reset) => reset.from_state === "FAIL_STOP" && Date.parse(reset.observed_at) >= Date.parse(resume.observed_at)))) throw new Error("T015 v4 resume disposition changed");
    if (resume.disposition === "DISCHARGED_LOSS" && !failed.discharges.some(({ kind, terminals_discharged }) => kind === "LOSS_ACKNOWLEDGED" && terminals_discharged === resume.terminal_index + 1)) throw new Error("T015 v4 resume disposition changed");
    if (resume.disposition === "FULLY_RECOVERED_BALANCE_VERIFIED" && (unrecoveredConfirmed(failed) !== 0 || failed.balance_after === undefined)) throw new Error("T015 v4 resume disposition changed");
    if (resume.disposition === "DISCHARGED_LOSS" && failed.paid_request === undefined) throw new Error("T015 v4 resume disposition changed");
  });
  const firstUnsettled = journal.batches.findIndex((record) => !settled(journal, record));
  if (firstUnsettled >= 0 && journal.batches.slice(firstUnsettled + 1).some((record) => record.state !== "PLANNED" || record.terminals.length > 0)) throw new Error("T015 v4 batch order changed");
  // A batch is an unresolved failure until an operator resume covers its latest terminal,
  // whether that terminal was discharged (zero-spend reset, loss acknowledgment) or not.
  const unresolved = journal.batches.filter((record) => record.terminals.length > 0 && latestResume(journal, record) === undefined);
  const capUsed = capUsedUnits(journal);
  const losses = acknowledgedLossUnits(journal);
  const allClosable = closable(journal);
  const runStateIsBad =
    (journal.run_state === "ACTIVE" && (unresolved.length !== 0 || journal.fail_stop_batch_id !== null)) ||
    (journal.run_state === "FAIL_STOP" && (unresolved.length !== 1 || journal.fail_stop_batch_id !== unresolved[0].batch_id)) ||
    (journal.run_state === "COMPLETE" && (journal.fail_stop_batch_id !== null || losses !== 0 || journal.batches.some(({ state }) => state !== "COMPLETE") || globalRecovered.size !== T015_V4_PAID_ASSET_COUNT || capUsed !== T015_V4_ADDITIONAL_CAP_UNITS)) ||
    (journal.run_state === "CLOSED_WITH_LOSSES" && (journal.fail_stop_batch_id !== null || losses === 0 || !allClosable || unresolved.length !== 0));
  if (runStateIsBad) throw new Error("T015 v4 run-state evidence changed");
  if (capUsed > T015_V4_ADDITIONAL_CAP_UNITS) throw new Error("T015 v4 additional credit cap exceeded");
  if (capUsed + T015_V4_LEGACY_COMMITTED_UNITS > T015_V4_TOTAL_CAP_UNITS) throw new Error("T015 v4 total credit cap exceeded");
}

function journalPath(root: string): string { return safeResolve(root, T015_V4_JOURNAL_PATH); }
// Nothing is persisted that a later read would reject: the writer runs the reader's own
// structural validation first, so a paid journal can never be bricked mid-run. PNG
// re-verification stays on the read path because ingest verifies the bytes as it stores them.
function writeJournal(context: T015V4Context, journal: T015V4Journal): void {
  assertRedactedJournal(journal);
  validateT015V4Journal(journal, context.plan, context.presentation, context.approval);
  atomicWriteJson(context.root, T015_V4_JOURNAL_PATH, journal);
}
function readJournal(context: T015V4Context): T015V4Journal {
  const bytes = readFileSync(journalPath(context.root), "utf8");
  const parsed = JSON.parse(bytes) as T015V4Journal;
  if (bytes !== renderT015CanonicalJson(parsed)) throw new Error("T015 v4 journal is not canonical");
  validateT015V4Journal(parsed, context.plan, context.presentation, context.approval, context.root);
  return parsed;
}
function recordOf(journal: T015V4Journal, id: string) { const index = journal.batches.findIndex(({ batch_id }) => batch_id === id); if (index < 0) throw new Error("unknown T015 v4 batch"); return { record: journal.batches[index], index }; }
function assertOpenForWork(journal: T015V4Journal, index: number): void {
  if (journal.run_state !== "ACTIVE") throw new Error("T015 v4 run is not ACTIVE; an operator-gated resume is required");
  if (journal.batches.slice(0, index).some((record) => !settled(journal, record))) throw new Error("T015 v4 batches must progress exactly in order");
  if (journal.batches.slice(index + 1).some(({ state }) => state !== "PLANNED")) throw new Error("T015 v4 batches must progress exactly in order");
  if (neverReopen(journal.batches[index])) throw new Error("T015 v4 batches whose paid envelope escaped are never reopened or resubmitted");
}
function assertCanary(journal: T015V4Journal, id: string): void { if (id === T015_V4_CANARY_BLOCKED_BATCH_ID && !t015V4CanaryVerified(journal)) throw new Error(`T015 v4 batch ${T015_V4_CANARY_BLOCKED_BATCH_ID} is blocked until the ${T015_V4_CANARY_BATCH_ID} model canary reports ${T015_V4_EXPECTED_MODEL}`); }
function loadJson(root: string, relativePath: string): unknown { const absolute = safeResolve(root, relativePath); const info = lstatSync(absolute); if (info.isSymbolicLink() || !info.isFile()) throw new Error("T015 v4 provider input must be a regular file"); return JSON.parse(readFileSync(absolute, "utf8")); }
function persistFail(context: T015V4Context, journal: T015V4Journal, record: T015V4BatchRecord, code: T015V4TerminalCode, at: string, facts: Record<string, unknown>): never {
  // Terminals are append-only forensics; the first entry stays authoritative forever.
  record.terminals.push({ code, observed_at: timestamp(at), facts: sanitizeFacts(facts), automatic_paid_retry: false, paid_retry_count: 0, no_resubmit: true, scope: "BATCH" });
  if (record.state !== "FAIL_STOP") transition(record, "FAIL_STOP", at);
  journal.run_state = "FAIL_STOP";
  journal.fail_stop_batch_id = record.batch_id;
  writeJournal(context, journal);
  throw new Error(`${code}: T015 v4 batch fail-stop (${record.batch_id}); no paid retry or resubmit`);
}
function loadProviderJsonOrFail(context: T015V4Context, relativePath: string, journal: T015V4Journal, record: T015V4BatchRecord, code: T015V4TerminalCode, at: string, stage: string): unknown {
  try { return loadJson(context.root, relativePath); } catch { persistFail(context, journal, record, code, at, { stage, reason: "INVALID_OR_UNSAFE_JSON_INPUT" }); }
}
function parseBalanceFile(raw: unknown): { credits: number; units: number; decimal: string; provider_observed_at: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("T015 v4 balance observation is invalid");
  exactKeys(raw as Record<string, unknown>, ["credits", "provider_observed_at"]);
  const value = raw as { credits: unknown; provider_observed_at: unknown };
  if (typeof value.provider_observed_at !== "string") throw new Error("T015 v4 balance observation is invalid");
  const parsed = decimalsT015V4(value.credits, "balance");
  return { credits: parsed.value, units: parsed.units, decimal: parsed.decimal, provider_observed_at: timestamp(value.provider_observed_at) };
}

/* --------------------------------------------------------------- download */

export interface T015V4Address { address: string; family: 4 | 6 }
export interface T015V4FetchSpec { url: URL; hostname: string; servername: string; pinned: T015V4Address; signal: AbortSignal }
export interface T015V4Dependencies { resolve(hostname: string, signal: AbortSignal): Promise<readonly T015V4Address[]>; fetch(spec: T015V4FetchSpec): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer; remoteAddress: string }>; timeout_ms?: number }

type LookupArrayCallback = (error: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void;
type LookupLegacyCallback = (error: NodeJS.ErrnoException | null, address: string, family: number) => void;
function defaultFetch(spec: T015V4FetchSpec): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer; remoteAddress: string }> {
  // `autoSelectFamily` is a real Node 22 net option that @types/node does not surface on
  // https.RequestOptions, so the request options are typed explicitly rather than inlined.
  const options: HttpsRequestOptions & { autoSelectFamily: false } = {
    protocol: "https:", hostname: spec.hostname, path: `${spec.url.pathname}${spec.url.search}`, method: "GET", port: 443, servername: spec.servername,
    rejectUnauthorized: true, signal: spec.signal,
    // A fresh connection per request keeps the DNS pin authoritative for every download.
    agent: false, autoSelectFamily: false,
    lookup: (_hostname, lookupOptions, callback) => {
      // Node 22 calls lookup in array mode when `all` is set and in the legacy
      // 3-argument mode otherwise; both must answer with the pinned address only.
      if ((lookupOptions as { all?: boolean } | undefined)?.all === true) (callback as unknown as LookupArrayCallback)(null, [{ address: spec.pinned.address, family: spec.pinned.family }]);
      else (callback as unknown as LookupLegacyCallback)(null, spec.pinned.address, spec.pinned.family);
    },
  };
  return new Promise((resolvePromise, reject) => {
    const request = httpsRequest(options, (response) => {
      // The peer must be captured while the socket is live; it is gone by 'end'.
      const remoteAddress = response.socket?.remoteAddress ?? "";
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > DEFAULT_MAX_PNG_BYTES) request.destroy(new Error("FILE_TOO_LARGE")); else chunks.push(chunk); });
      response.on("end", () => resolvePromise({ status: response.statusCode ?? 0, headers: response.headers, bytes: Buffer.concat(chunks), remoteAddress }));
    });
    request.on("error", reject);
    request.end();
  });
}
const defaultDependencies: T015V4Dependencies = { resolve: async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 })), fetch: defaultFetch };
function approvedUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 16_384) throw new Error("DOWNLOAD_FAILED");
  const url = new URL(raw);
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(host) || !host.includes(".") || host === "localhost" || host.endsWith(".localhost") || !/^[a-z0-9.-]+$/i.test(host)) throw new Error("DOWNLOAD_FAILED");
  return url;
}
function withinDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("DOWNLOAD_FAILED"));
  return new Promise<T>((resolvePromise, reject) => { const abort = () => reject(new Error("DOWNLOAD_FAILED")); signal.addEventListener("abort", abort, { once: true }); promise.then((value) => { signal.removeEventListener("abort", abort); resolvePromise(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); }); });
}
export async function downloadT015V4(rawUrl: string, dependencies: T015V4Dependencies): Promise<Buffer> {
  let url = approvedUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), dependencies.timeout_ms ?? DOWNLOAD_TIMEOUT_MS);
    try {
      const addresses = await withinDeadline(dependencies.resolve(url.hostname, controller.signal), controller.signal);
      if (!addresses.length || addresses.some((address) => !isPublicT015V3ResolvedAddress(address))) throw new Error("DOWNLOAD_FAILED");
      const pinned = addresses[0];
      const response = await withinDeadline(dependencies.fetch({ url, hostname: url.hostname, servername: url.hostname, pinned, signal: controller.signal }), controller.signal);
      if (!transportPeerMatchesT015V3Pin(response.remoteAddress, pinned)) throw new Error("DOWNLOAD_FAILED");
      if ([301, 302, 303, 307, 308].includes(response.status)) { if (typeof response.headers.location !== "string" || redirects === MAX_REDIRECTS) throw new Error("DOWNLOAD_FAILED"); url = approvedUrl(new URL(response.headers.location, url).toString()); continue; }
      const type = response.headers["content-type"]?.toString().split(";", 1)[0].trim().toLowerCase();
      const length = response.headers["content-length"] === undefined ? null : Number(response.headers["content-length"]);
      if (response.status !== 200 || type !== "image/png" || response.bytes.length > DEFAULT_MAX_PNG_BYTES || (length !== null && (!Number.isSafeInteger(length) || length < 1 || length !== response.bytes.length))) throw new Error("DOWNLOAD_FAILED");
      return response.bytes;
    } finally { clearTimeout(timer); }
  }
  throw new Error("DOWNLOAD_FAILED");
}

/* ----------------------------------------------------------------- ingest */

function ingest(context: T015V4Context, journal: T015V4Journal, record: T015V4BatchRecord, job: T015V4ProviderJob, bytes: Buffer, at: string): void {
  const asset = assetOf(context.plan, job.asset_id);
  const dimensions = pngHeaderDimensions(bytes);
  let local: VerifiedFile;
  try {
    local = atomicWriteVerifiedPng(resolve(context.root, T015_V4_LOCAL_ROOT), asset.path, bytes, "3:4", DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
    const backup = backupVerifiedFile(resolve(context.root, T015_V4_LOCAL_ROOT), resolve(context.root, T015_V4_BACKUP_ROOT), asset.path, local.sha256, "3:4", DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
    if (local.sha256 !== backup.sha256 || local.size !== backup.size) throw new Error("EXISTING_FILE_CONFLICT");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflict = ["EXISTING_FILE_CONFLICT", "SYMLINK_TRAVERSAL", "BACKUP_VERIFY_FAILED", "LOCAL_HASH_CHANGED"].includes(message);
    const reason = message === "ASPECT_MISMATCH" ? "PNG_DIMENSION_MISMATCH" : conflict ? "FILE_CONFLICT" : "PNG_OR_ATOMIC_STORE_FAILED";
    persistFail(context, journal, record, conflict ? "FILE_CONFLICT" : "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason, actual_width: dimensions?.width ?? null, actual_height: dimensions?.height ?? null, expected_aspect_ratio: "3:4", aspect_tolerance_ppm: T015_V4_ASPECT_TOLERANCE_PPM });
  }
  record.recoveries.push({ asset_id: job.asset_id, provider_job_index: job.index, provider_job_id: job.job_id, source: "JOBS_HANDOFF_STDIN", observed_at: at, local_relative_path: asset.path, backup_relative_path: asset.path, sha256: local.sha256, size_bytes: local.size, actual_width: local.width, actual_height: local.height, aspect_error_ppm: local.aspect_error_ppm, provider_native_unmodified: true });
  if (record.state === "RECOVERY_OPEN") transition(record, "RECOVERING", at);
  if (record.state === "RECOVERING" && unrecoveredConfirmed(record) === 0) transition(record, "RECOVERED", at);
  // Durable per-asset journal write: a crash after this point never loses a paid asset.
  writeJournal(context, journal);
}

/* --------------------------------------------------------------- commands */

export function runT015V4OpsInternal(args: readonly string[], root: string, plan: T015V4Plan, presentation: T015V4Presentation, approval: T015V4Approval, now?: () => Date): Record<string, unknown> {
  const context: T015V4Context = { root, plan, presentation, approval };
  const command = args[0];
  const lock = acquireT015V4Lock(root);
  try {
    if (command === "init") {
      const at = timestamp(option(args, "--observed-at"));
      const balanceRelative = operatorPath(args, "--balance-file");
      if (existsSync(journalPath(root))) return { command, run_state: readJournal(context).run_state, idempotent: true };
      const anchor = parseBalanceFile(loadJson(root, balanceRelative));
      assertWallClock(anchor.provider_observed_at, now, undefined, FRESHNESS_MS);
      assertNonOverlappingRoots(resolve(root, T015_V4_LOCAL_ROOT), resolve(root, T015_V4_BACKUP_ROOT));
      if (anchor.units < T015_V4_ADDITIONAL_CAP_UNITS) throw new Error("T015 v4 initial balance does not cover the 480.00 additional cap");
      const initial = buildInitialT015V4Journal(plan, presentation, approval, { credits: anchor.credits, normalized_decimal: anchor.decimal, provider_observed_at: anchor.provider_observed_at });
      writeJournal(context, initial);
      return { command, run_state: "ACTIVE", observed_at: at, batches: T015_V4_PAID_BATCH_COUNT, paid_assets: T015_V4_PAID_ASSET_COUNT, initial_balance_decimal: anchor.decimal, additional_credit_cap_units: T015_V4_ADDITIONAL_CAP_UNITS, paid_retry_count: 0 };
    }
    const journal = readJournal(context);

    if (command === "preflight-request") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id);
      assertOpenForWork(journal, index); assertCanary(journal, id); assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "PLANNED") throw new Error("T015 v4 batch is not PLANNED");
      const request = preflightEnvelopeOf(plan, id);
      // Deep copy: the journal must never alias the memoised plan index.
      record.preflight = { requests: copyPreflightRequests(request.requests), requests_sha256: request.sha256, requested_at: at };
      transition(record, "PREFLIGHT_REQUESTED", at); writeJournal(context, journal);
      return request as unknown as Record<string, unknown>;
    }

    if (command === "preflight-result") {
      const id = option(args, "--batch"); const { record, index } = recordOf(journal, id);
      const costRelative = operatorPath(args, "--cost-file"); const balanceRelative = operatorPath(args, "--balance-file");
      assertOpenForWork(journal, index); assertCanary(journal, id);
      if (record.state !== "PREFLIGHT_REQUESTED" || !record.preflight) throw new Error("T015 v4 durable preflight request required");
      // --observed-at is the durable stamp for any fail-stop raised while grading this preflight.
      const fallbackAt = timestamp(option(args, "--observed-at"));
      assertWallClock(fallbackAt, now, record.preflight.requested_at);
      const costRaw = loadProviderJsonOrFail(context, costRelative, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, "GET_COST_JSON");
      const balanceRaw = loadProviderJsonOrFail(context, balanceRelative, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, "BALANCE_JSON");
      if (!costRaw || typeof costRaw !== "object" || Array.isArray(costRaw) || !balanceRaw || typeof balanceRaw !== "object" || Array.isArray(balanceRaw)) persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "PREFLIGHT" });
      try { exactKeys(balanceRaw as Record<string, unknown>, ["credits", "provider_observed_at"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "BALANCE_FIELDS" }); }
      try { exactKeys(costRaw as Record<string, unknown>, ["costs"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "GET_COST_FIELDS" }); }
      const costItems = (costRaw as { costs?: unknown }).costs;
      if (!Array.isArray(costItems) || costItems.length !== record.asset_ids.length) persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_COUNT" });
      const costs: NonNullable<T015V4BatchRecord["preflight"]>["costs"] = [];
      costItems.forEach((item, itemIndex) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_SHAPE", item_index: itemIndex });
        const value = item as Record<string, unknown>;
        try { exactKeys(value, ["index", "request_sha256", "cost", "provider_observed_at"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "PER_REQUEST_COST_FIELDS", item_index: itemIndex }); }
        const asset = assetOf(plan, record.asset_ids[itemIndex]);
        const expectedRequestSha = costRequestSha256(plan, asset);
        const costAt = typeof value.provider_observed_at === "string" ? value.provider_observed_at : fallbackAt;
        const floor = itemIndex === 0 ? record.preflight!.requested_at : costs[itemIndex - 1].provider_observed_at;
        try { assertWallClock(costAt, now, floor, FRESHNESS_MS); } catch { persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_TIME", item_index: itemIndex }); }
        if (value.index !== asset.index || value.request_sha256 !== expectedRequestSha || costs.some(({ provider_observed_at }) => provider_observed_at === costAt) || Date.parse(costAt) <= Date.parse(floor) || Date.parse(costAt) - Date.parse(record.preflight!.requested_at) > FRESHNESS_MS || !value.cost || typeof value.cost !== "object" || Array.isArray(value.cost)) persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_BINDING", item_index: itemIndex });
        try { exactKeys(value.cost as Record<string, unknown>, ["credits", "credits_exact"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", fallbackAt, { stage: "PER_REQUEST_COST_VALUE_FIELDS", item_index: itemIndex }); }
        let display; let exact;
        try { display = decimalsT015V4((value.cost as { credits?: unknown }).credits, "cost credits"); exact = decimalsT015V4((value.cost as { credits_exact?: unknown }).credits_exact, "cost credits_exact"); } catch { persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_NORMALIZATION", item_index: itemIndex }); }
        if (display.decimal !== "1.00" || exact.units !== T015_V4_UNIT_COST_UNITS) persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { item_index: itemIndex, observed_display_decimal: display.decimal, observed_exact_decimal: exact.decimal });
        costs.push({ index: asset.index, request_sha256: expectedRequestSha, credits: 1, credits_decimal: "1.00", credits_exact: 1.5, credits_exact_decimal: "1.50", provider_observed_at: costAt });
      });
      const balanceAtRaw = (balanceRaw as { provider_observed_at?: unknown }).provider_observed_at;
      const balanceAt = typeof balanceAtRaw === "string" ? balanceAtRaw : fallbackAt;
      try { assertWallClock(balanceAt, now, costs.at(-1)!.provider_observed_at, FRESHNESS_MS); } catch { persistFail(context, journal, record, "BALANCE_CHANGED", fallbackAt, { stage: "OBSERVATION_TIME" }); }
      if (Date.parse(balanceAt) <= Date.parse(costs.at(-1)!.provider_observed_at) || Date.parse(balanceAt) - Date.parse(record.preflight.requested_at) > FRESHNESS_MS) persistFail(context, journal, record, "BALANCE_CHANGED", fallbackAt, { stage: "OBSERVATION_ORDER" });
      let balance;
      try { balance = decimalsT015V4((balanceRaw as { credits?: unknown }).credits, "balance"); } catch { persistFail(context, journal, record, "BALANCE_CHANGED", balanceAt, { stage: "NORMALIZATION" }); }
      const anchor = balanceAnchor(journal, index);
      const remaining = plan.batches.slice(index).reduce((sum, batch) => sum + batch.size * T015_V4_UNIT_COST_UNITS, 0);
      if (balance.units < remaining || anchor.normalized_decimal !== balance.decimal) persistFail(context, journal, record, "BALANCE_CHANGED", balanceAt, { stage: "BALANCE_CHAIN", expected_anchor_decimal: anchor.normalized_decimal, observed_decimal: balance.decimal, minimum_remaining_decimal: decimal(remaining) });
      record.preflight.costs = costs;
      record.preflight.balance = { credits: balance.value, normalized_decimal: balance.decimal, provider_observed_at: balanceAt };
      transition(record, "PREFLIGHT_VERIFIED", balanceAt); writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, verified_costs: costs.length, balance_decimal: balance.decimal, minimum_remaining_decimal: decimal(remaining) };
    }

    if (command === "reset") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id);
      assertOpenForWork(journal, index); assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (!["PREFLIGHT_REQUESTED", "PREFLIGHT_VERIFIED", "FAIL_STOP"].includes(record.state)) throw new Error("T015 v4 reset is only legal from PREFLIGHT_REQUESTED, PREFLIGHT_VERIFIED, or a zero-spend FAIL_STOP");
      if (!zeroSpend(record) || record.recoveries.length > 0 || record.job_polls.length > 0) throw new Error("T015 v4 reset is only legal for zero-spend states");
      const from = record.state as "PREFLIGHT_REQUESTED" | "PREFLIGHT_VERIFIED" | "FAIL_STOP";
      if (from === "FAIL_STOP" && !hasActiveTerminal(record)) throw new Error("T015 v4 reset from FAIL_STOP requires an undischarged terminal");
      if (hasActiveTerminal(record)) record.discharges.push({ kind: "ZERO_SPEND_RESET", observed_at: at, terminals_discharged: record.terminals.length, exact_operator_phrase_sha256: null, max_exposure_units: maxExposureUnits(record), recovered_units: 0, observed_delta_units: 0, acknowledged_loss_units: 0, acknowledged_loss_decimal: decimal(0), balance_after_loss: null, resubmitted: false });
      record.resets.push({ from_state: from, observed_at: at, zero_spend: true });
      delete record.preflight;
      // Terminals stay in history; the batch simply becomes runnable again at zero cost.
      transition(record, "PLANNED", at); writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, resets: record.resets.length, from_state: from, zero_spend: true, terminals_preserved: record.terminals.length, paid_retry_count: 0 };
    }

    if (command === "prepare") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id);
      assertOpenForWork(journal, index); assertCanary(journal, id);
      assertWallClock(at, now, record.preflight?.balance?.provider_observed_at, FRESHNESS_MS);
      if (record.state !== "PREFLIGHT_VERIFIED" || !record.preflight?.costs || record.preflight.costs.length !== record.asset_ids.length || !record.preflight.balance || Date.parse(at) < Date.parse(record.preflight.balance.provider_observed_at) || Date.parse(at) - Date.parse(record.preflight.balance.provider_observed_at) > FRESHNESS_MS) throw new Error("fresh per-request T015 v4 preflight required");
      const envelope = paidEnvelope(plan, id);
      record.paid_request = { request_sha256: paidEnvelopeOf(plan, id).sha256, prepared_at: at };
      // Durable SUBMITTING evidence must exist before the operator can see the envelope.
      transition(record, "SUBMITTING", at); writeJournal(context, journal);
      return envelope as unknown as Record<string, unknown>;
    }

    if (command === "ambiguous") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const reason = option(args, "--reason"); const { record } = recordOf(journal, id);
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "SUBMITTING" || !["TIMEOUT", "TRANSPORT_ERROR", "MISSING_DEFINITE_RESULT"].includes(reason)) throw new Error("invalid T015 v4 ambiguous transition");
      persistFail(context, journal, record, "AMBIGUOUS_SUBMISSION", at, { reason, outcome: "UNKNOWN", max_exposure_units: maxExposureUnits(record), max_exposure_decimal: decimal(maxExposureUnits(record)), jobs_enumerable: false, discharge_required: true, paid_retry: 0 });
    }

    if (command === "response") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record } = recordOf(journal, id);
      const fileRelative = operatorPath(args, "--file");
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "SUBMITTING") throw new Error("durable T015 v4 SUBMITTING state required");
      const raw = loadProviderJsonOrFail(context, fileRelative, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, "SUBMISSION_JSON");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) persistFail(context, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, { response_shape: "INVALID" });
      const response = raw as Record<string, unknown>;
      try { exactKeys(response, ["submitted_count", "failed_count", "jobs"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "SUBMISSION_RESPONSE" }); }
      const validCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
      const jobsRaw = Array.isArray(response.jobs) ? response.jobs : [];
      const jobs: T015V4ProviderJob[] = []; const signals: Array<{ index: number; fields: string[] }> = [];
      let topology = validCount(response.submitted_count) && validCount(response.failed_count) && response.submitted_count === jobsRaw.length;
      // Job IDs already claimed by an earlier batch can never be persisted: the reader
      // enforces global uniqueness, so a collision fails the batch instead of the journal.
      const claimed = new Set(journal.batches.filter(({ batch_id }) => batch_id !== id).flatMap((other) => other.submission?.jobs.map(({ job_id }) => job_id) ?? []));
      const seenIds = new Set<string>(); const seenIndices = new Set<number>();
      jobsRaw.forEach((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) { topology = false; return; }
        const value = item as Record<string, unknown>;
        try { exactKeys(value, ["index", "job_id", "status"], ["index", "job_id", "status", ...JOB_OPTIONAL_KEYS]); } catch { topology = false; return; }
        const asset = plan.assets.find(({ index }) => index === value.index);
        const jobId = typeof value.job_id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value.job_id) ? value.job_id : null;
        const status = value.status as SubmitStatus;
        if (!asset || !record.asset_ids.includes(asset.id) || !jobId || claimed.has(jobId) || seenIds.has(jobId) || seenIndices.has(asset.index) || !SUBMIT_STATUSES.includes(status)) { topology = false; return; }
        seenIds.add(jobId); seenIndices.add(asset.index);
        jobs.push({ index: asset.index, asset_id: asset.id, job_id: jobId, status, canonical_request_sha256: asset.canonical_request_sha256 });
        const present = JOB_OPTIONAL_KEYS.filter((key) => key in value);
        if (present.length) signals.push({ index: asset.index, fields: [...present] });
      });
      jobs.sort((a, b) => a.index - b.index);
      const missing = record.asset_ids.filter((assetId) => !jobs.some(({ asset_id }) => asset_id === assetId));
      const failedCount = validCount(response.failed_count) ? response.failed_count as number : record.asset_ids.length;
      record.submission = { observed_at: at, expected_count: record.asset_ids.length, submitted_count: jobs.length, failed_count: failedCount, topology_valid: topology, complete: topology && jobs.length === record.asset_ids.length && failedCount === 0, missing_asset_ids: missing, jobs };
      transition(record, "SUBMITTED", at);
      if (!record.submission.complete) persistFail(context, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, { expected: record.asset_ids.length, submitted_count: response.submitted_count, failed_count: response.failed_count, missing_asset_ids: missing, definite_job_count: jobs.length, topology_valid: topology, recovery_only_for_definite_jobs: jobs.length > 0 });
      if (signals.length) persistFail(context, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { signals, definite_job_ids_preserved: true, recovery_only_for_definite_jobs: true });
      const failed = jobs.find(({ status }) => TERMINAL_SUBMIT_FAILURES.includes(status));
      if (failed) persistFail(context, journal, record, "GENERATION_FAILED", at, { index: failed.index, asset_id: failed.asset_id, status: failed.status, recovery_only_for_definite_jobs: true });
      writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, jobs: jobs.length, new_paid_submit: false };
    }

    if (command === "recovery-open") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const phrase = option(args, "--operator-phrase"); const { record } = recordOf(journal, id);
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (phrase === T015_V4_RECOVERY_OPERATOR_PHRASE && !lossDischarged(record) && ["RECOVERY_OPEN", "RECOVERING"].includes(record.state) && record.recovery_gates.length > 0 && record.submission?.jobs.length) return { command, batch_id: id, state: record.state, jobs: record.submission.jobs.length, new_paid_submit: false, idempotent: true, original_terminal_preserved: record.terminals.length > 0 ? record.terminals[0].code : null };
      if (lossDischarged(record)) throw new Error("T015 v4 a loss-discharged batch is never reopened");
      if (phrase !== T015_V4_RECOVERY_OPERATOR_PHRASE || !["SUBMITTED", "FAIL_STOP"].includes(record.state) || !record.submission || record.submission.jobs.length === 0) throw new Error("operator-gated T015 v4 recovery requires the exact phrase and durable job IDs");
      record.recovery_gates.push({ opened_at: at, exact_operator_phrase_sha256: sha256(phrase), no_new_paid_submit: true });
      transition(record, "RECOVERY_OPEN", at); writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, jobs: record.submission.jobs.length, gates: record.recovery_gates.length, new_paid_submit: false, original_terminal_preserved: record.terminals.length > 0 ? record.terminals[0].code : null, operator_phrase_is_agent_satisfiable: true };
    }

    if (command === "jobs-request") {
      const { record } = recordOf(journal, option(args, "--batch"));
      if (!["RECOVERY_OPEN", "RECOVERING"].includes(record.state) || !record.submission || record.recovery_gates.length === 0) throw new Error("T015 v4 recovery-open gate is required");
      return { jobs: record.submission.jobs.map(({ index, job_id }) => ({ index, job_id })), new_paid_submit: false, paid_retry_count: 0 };
    }

    if (command === "balance-after") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record } = recordOf(journal, id);
      const fileRelative = operatorPath(args, "--file");
      if (record.balance_after) throw new Error("T015 v4 balance-after is already recorded for this batch");
      if (record.state !== "RECOVERED" || !record.preflight?.balance) throw new Error("T015 v4 complete stdin recovery is required before balance-after");
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      const chargedJobs = hasActiveTerminal(record) ? confirmedJobs(record).length : record.asset_ids.length;
      if (unrecoveredConfirmed(record) !== 0 || record.recoveries.length !== chargedJobs) throw new Error("T015 v4 balance-after requires every confirmed job recovered");
      const raw = loadProviderJsonOrFail(context, fileRelative, journal, record, "BALANCE_CHANGED", at, "BALANCE_AFTER_JSON");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER" });
      try { exactKeys(raw as Record<string, unknown>, ["credits"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "BALANCE_AFTER" }); }
      let after; try { after = decimalsT015V4((raw as { credits?: unknown }).credits, "balance after"); } catch { persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER_NORMALIZATION" }); }
      const before = decimalsT015V4(record.preflight.balance.credits, "balance before");
      const delta = before.units - after.units;
      const expected = chargedJobs * T015_V4_UNIT_COST_UNITS;
      // The observation itself is persisted in the terminal facts so a later
      // acknowledge-loss can reconcile against what the provider actually reported.
      if (delta !== expected) persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER_DELTA", expected_delta_decimal: decimal(expected), observed_delta_units: delta, observed_delta_decimal: decimal(delta), observed_balance_decimal: after.decimal, observed_balance_credits: after.value, provider_observed_at: at });
      record.balance_after = { credits: after.value, normalized_decimal: after.decimal, observed_at: at, delta_decimal: decimal(delta), delta_units: delta, charged_job_count: chargedJobs };
      if (!hasActiveTerminal(record)) { transition(record, "COMPLETE", at); if (journal.batches.every(({ state }) => state === "COMPLETE")) journal.run_state = "COMPLETE"; }
      writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, run_state: journal.run_state, delta_units: delta, delta_decimal: decimal(delta), charged_job_count: chargedJobs };
    }

    if (command === "acknowledge-loss") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const phrase = option(args, "--operator-phrase");
      const balanceRelative = operatorPath(args, "--balance-file");
      if (phrase !== T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE) throw new Error("T015 v4 loss acknowledgment requires the exact operator phrase");
      const { record, index } = recordOf(journal, id);
      // One loss discharge per batch, checked before anything else so a re-opened or
      // re-polled batch can never book the same spend twice.
      if (lossDischarged(record)) throw new Error("T015 v4 this batch already has an acknowledged loss; a batch is discharged exactly once");
      const active = t015V4ActiveTerminals(record);
      if (active.length === 0) throw new Error("T015 v4 loss acknowledgment requires an undischarged terminal");
      if (zeroSpend(record)) throw new Error("T015 v4 zero-spend batches are reset and re-run, never discharged as a loss");
      if (!T015_V4_LOSS_CODES.includes(active.at(-1)!.code)) throw new Error(`T015 v4 loss acknowledgment only discharges ${T015_V4_LOSS_CODES.join("|")}`);
      if (record.balance_after) throw new Error("T015 v4 a balance-verified batch has no unexplained loss to discharge");
      if (!record.preflight?.balance) throw new Error("T015 v4 loss acknowledgment requires the durable pre-submit balance");
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      const observation = parseBalanceFile(loadJson(root, balanceRelative));
      assertWallClock(observation.provider_observed_at, now, record.preflight.balance.provider_observed_at);
      // Measured against the live spend anchor, not the pre-submit balance, so a repeat
      // measurement of an already-discharged batch can only ever yield a zero delta.
      const before = decimalsT015V4(spendAnchor(journal, index).credits, "balance before");
      const observedDelta = before.units - observation.units;
      const exposure = maxExposureUnits(record);
      if (observedDelta < 0 || observedDelta > exposure) throw new Error(`T015 v4 observed loss delta ${decimal(observedDelta)} is outside the 0..${decimal(exposure)} exposure of this batch`);
      const recoveredUnits = Math.min(record.recoveries.length * T015_V4_UNIT_COST_UNITS, observedDelta);
      const loss = observedDelta - recoveredUnits;
      record.discharges.push({ kind: "LOSS_ACKNOWLEDGED", observed_at: at, terminals_discharged: record.terminals.length, exact_operator_phrase_sha256: sha256(phrase), max_exposure_units: exposure, recovered_units: recoveredUnits, observed_delta_units: observedDelta, acknowledged_loss_units: loss, acknowledged_loss_decimal: decimal(loss), balance_after_loss: { credits: observation.credits, normalized_decimal: observation.decimal, provider_observed_at: observation.provider_observed_at }, resubmitted: false });
      writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, run_state: journal.run_state, terminal_code: active.at(-1)!.code, observed_delta_decimal: decimal(observedDelta), recovered_decimal: decimal(recoveredUnits), acknowledged_loss_decimal: decimal(loss), new_balance_anchor_decimal: observation.decimal, cap_used_decimal: decimal(capUsedUnits(journal)), resubmitted: false, regenerated: false };
    }

    if (command === "resume") {
      const at = timestamp(option(args, "--observed-at")); const phrase = option(args, "--operator-phrase");
      if (phrase !== T015_V4_RESUME_OPERATOR_PHRASE) throw new Error("T015 v4 resume requires the exact operator phrase");
      if (journal.run_state !== "FAIL_STOP" || journal.fail_stop_batch_id === null) throw new Error("T015 v4 resume requires a batch-scoped FAIL_STOP");
      if (journal.paid_retry_count !== 0) throw new Error("T015 v4 resume requires paid_retry_count 0");
      const { record: failed } = recordOf(journal, journal.fail_stop_batch_id);
      if (journal.batches.some((record) => !lossDischarged(record) && unrecoveredConfirmed(record) !== 0)) throw new Error("T015 v4 resume is refused while any confirmed job is unrecovered and undischarged");
      const disposition: T015V4ResumeDisposition | null =
        zeroSpend(failed) ? "ZERO_SPEND"
          : failed.discharges.some(({ kind, terminals_discharged }) => kind === "LOSS_ACKNOWLEDGED" && terminals_discharged === failed.terminals.length) ? "DISCHARGED_LOSS"
            : (unrecoveredConfirmed(failed) === 0 && failed.balance_after !== undefined) ? "FULLY_RECOVERED_BALANCE_VERIFIED" : null;
      if (disposition === null) throw new Error("T015 v4 resume requires the failed batch to be zero-spend, fully recovered with balance verified, or loss-acknowledged");
      assertWallClock(at, now, journal.resumes.at(-1)?.observed_at);
      journal.resumes.push({ observed_at: at, failed_batch_id: failed.batch_id, terminal_index: failed.terminals.length - 1, disposition, exact_operator_phrase_sha256: sha256(phrase), resubmitted: false });
      journal.run_state = "ACTIVE";
      journal.fail_stop_batch_id = null;
      writeJournal(context, journal);
      return { command, run_state: journal.run_state, resumed_batch_id: failed.batch_id, disposition, resubmitted: false, rerunnable: disposition === "ZERO_SPEND", paid_retry_count: 0, operator_phrase_is_agent_satisfiable: true };
    }

    if (command === "status") return statusT015V4(journal);
    if (command === "audit") return auditT015V4(context, journal, option(args, "--observed-at"));
    throw new Error("usage: T015 v4 production <init|preflight-request|preflight-result|reset|prepare|response|ambiguous|recovery-open|jobs-request|jobs-handoff|balance-after|acknowledge-loss|resume|status|audit>");
  } finally { lock.release(); }
}

/* ----------------------------------------------------------------- status */

export function statusT015V4(journal: T015V4Journal): Record<string, unknown> {
  const capUsed = capUsedUnits(journal);
  const losses = acknowledgedLossUnits(journal);
  const recovered = journal.batches.reduce((sum, record) => sum + record.recoveries.length, 0);
  const unaccounted = journal.batches.reduce((sum, record) => sum + (hasActiveTerminal(record) && !zeroSpend(record) ? Math.max(0, maxExposureUnits(record) - record.recoveries.length * T015_V4_UNIT_COST_UNITS) : 0), 0);
  // Reachability is read off the real gates, never assumed: every batch must still be able
  // to deliver all of its assets, no loss may already be booked, the 002 canary must still
  // be passable, and any open fail-stop must be clearable without acknowledging a loss.
  const canary = journal.batches.find(({ batch_id }) => batch_id === T015_V4_CANARY_BATCH_ID);
  const failed = journal.fail_stop_batch_id === null ? undefined : journal.batches.find(({ batch_id }) => batch_id === journal.fail_stop_batch_id);
  const canaryReachable = t015V4CanaryVerified(journal) || (canary !== undefined && t015V4BatchCanDeliverAllAssets(canary));
  const failStopClearableWithoutLoss = failed === undefined || zeroSpend(failed) || (unrecoveredConfirmed(failed) === 0 && failed.balance_after !== undefined);
  const reachable = journal.batches.every((record) => t015V4BatchCanDeliverAllAssets(record)) && journal.run_state !== "CLOSED_WITH_LOSSES" && losses === 0 && canaryReachable && failStopClearableWithoutLoss;
  return {
    command: "status", run_state: journal.run_state, fail_stop_batch_id: journal.fail_stop_batch_id,
    batches: journal.batches.map((record) => ({
      batch_id: record.batch_id, state: record.state, recovered: record.recoveries.length,
      terminal_code: record.terminals.length > 0 ? record.terminals[0].code : null, active_terminal_code: t015V4ActiveTerminals(record).at(-1)?.code ?? null,
      disposition: record.state === "COMPLETE" ? "COMPLETE" : unstarted(record) ? "UNSTARTED" : latestResume(journal, record)?.disposition ?? (hasActiveTerminal(record) ? "UNRESOLVED_FAIL_STOP" : "IN_PROGRESS"),
      discharge_possible: hasActiveTerminal(record) && (zeroSpend(record) ? "ZERO_SPEND_RESET" : T015_V4_LOSS_CODES.includes(t015V4ActiveTerminals(record).at(-1)!.code) ? "LOSS_ACKNOWLEDGMENT" : "NONE"),
      rerunnable: !neverReopen(record), can_deliver_all_assets: t015V4BatchCanDeliverAllAssets(record),
      acknowledged_loss_decimal: decimal(record.discharges.reduce((sum, discharge) => sum + discharge.acknowledged_loss_units, 0)),
    })),
    recovered_assets: recovered, remaining_assets: T015_V4_PAID_ASSET_COUNT - recovered,
    total_delta_units: capUsed, total_delta_decimal: decimal(capUsed), acknowledged_loss_units: losses, acknowledged_loss_decimal: decimal(losses),
    unaccounted_max_exposure_units: unaccounted, unaccounted_max_exposure_decimal: decimal(unaccounted),
    additional_credit_cap_units: T015_V4_ADDITIONAL_CAP_UNITS, cumulative_units_including_legacy: capUsed + T015_V4_LEGACY_COMMITTED_UNITS, total_credit_cap_units: T015_V4_TOTAL_CAP_UNITS,
    paid_retry_count: 0, resumes: journal.resumes.length, model_canary_verified: t015V4CanaryVerified(journal), full_run_completion_reachable: reachable,
  };
}

/* ------------------------------------------------------------ jobs-handoff */

export async function runT015V4JobsHandoffInternal(args: readonly string[], stdinJson: string, root: string, plan: T015V4Plan, presentation: T015V4Presentation, approval: T015V4Approval, dependencies: T015V4Dependencies = defaultDependencies, now?: () => Date): Promise<Record<string, unknown>> {
  if (Buffer.byteLength(stdinJson) > MAX_STDIN_BYTES) throw new Error("T015 v4 jobs-handoff stdin too large");
  const context: T015V4Context = { root, plan, presentation, approval };
  const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at"));
  const lock = acquireT015V4Lock(root);
  try {
    const journal = readJournal(context);
    const { record } = recordOf(journal, id);
    if (!["RECOVERY_OPEN", "RECOVERING"].includes(record.state) || !record.submission) throw new Error("T015 v4 recovery-open gate is required");
    assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
    let value: unknown;
    try { value = JSON.parse(stdinJson) as unknown; } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_JSON" }); }
    if (!value || typeof value !== "object" || Array.isArray(value)) persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT" });
    const response = value as Record<string, unknown>;
    try { exactKeys(response, ["all_terminal", "jobs", "summary"], ["all_terminal", "jobs", "summary", "poll_after_seconds", "timed_out", "aborted"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT" }); }
    if (typeof response.all_terminal !== "boolean" || !Array.isArray(response.jobs) || !response.summary || typeof response.summary !== "object" || Array.isArray(response.summary) || ("timed_out" in response && typeof response.timed_out !== "boolean") || ("aborted" in response && typeof response.aborted !== "boolean") || ("poll_after_seconds" in response && (typeof response.poll_after_seconds !== "number" || !Number.isFinite(response.poll_after_seconds) || response.poll_after_seconds < 0))) persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_TYPES" });
    if (response.timed_out === true || response.aborted === true) persistFail(context, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT_INTERRUPTED", timed_out: response.timed_out === true, aborted: response.aborted === true });
    const transient = new Map<string, string>();
    const redacted: T015V4BatchRecord["job_polls"][number]["jobs"] = [];
    let topology = response.jobs.length === record.submission.jobs.length;
    const seenIndices = new Set<number>(); const seenJobIds = new Set<string>();
    (response.jobs as unknown[]).forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) { topology = false; return; }
      const job = item as Record<string, unknown>;
      try { exactKeys(job, ["index", "job_id", "status", "type"], ["index", "job_id", "status", "type", "model", "result_url", "retryable"]); } catch { topology = false; return; }
      const expected = record.submission!.jobs.find(({ index, job_id }) => index === job.index && job_id === job.job_id);
      const status = job.status as WaitStatus;
      if (!expected || !WAIT_STATUSES.includes(status) || job.type !== "image" || seenIndices.has(expected.index) || seenJobIds.has(expected.job_id)) { topology = false; return; }
      seenIndices.add(expected.index); seenJobIds.add(expected.job_id);
      const model = typeof job.model === "string" ? job.model : null;
      const url = typeof job.result_url === "string" ? job.result_url : null;
      if (url) transient.set(expected.asset_id, url);
      const hasRetryable = "retryable" in job;
      if ((status === "completed") !== (url !== null) || (status === "completed") !== (model !== null) || (status === "lookup_failed") !== hasRetryable || (hasRetryable && typeof job.retryable !== "boolean")) topology = false;
      redacted.push({ index: expected.index, job_id: expected.job_id, status, model, download_available: url !== null, lookup_retryable: hasRetryable && typeof job.retryable === "boolean" ? job.retryable : null });
    });
    redacted.sort((a, b) => a.index - b.index);
    if (!topology || redacted.length !== record.submission.jobs.length) persistFail(context, journal, record, "RECOVERY_FAILED", at, { stage: "JOBS_WAIT_TOPOLOGY", definite_job_count: redacted.length });
    const derivedSummary = { active: redacted.filter(({ status }) => ACTIVE_WAIT_STATUSES.includes(status)).length, completed: redacted.filter(({ status }) => status === "completed").length, errors: redacted.filter(({ status }) => status === "lookup_failed").length, failed: redacted.filter(({ status }) => FAILED_WAIT_STATUSES.includes(status)).length, total: redacted.length };
    const summary = response.summary as Record<string, unknown>;
    try { exactKeys(summary, ["active", "completed", "errors", "failed", "total"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_SUMMARY_FIELDS" }); }
    // Value equality, not key order: canonicalJson sorts keys before comparing.
    if (Object.values(summary).some((count) => !Number.isSafeInteger(count) || (count as number) < 0) || canonicalJson(summary) !== canonicalJson(derivedSummary)) persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_SUMMARY_MISMATCH" });
    const derivedAllTerminal = redacted.every(({ status }) => !ACTIVE_WAIT_STATUSES.includes(status));
    if (response.all_terminal !== derivedAllTerminal) persistFail(context, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT_TERMINAL_CONTRADICTION" });
    record.job_polls.push({ observed_at: at, all_terminal: response.all_terminal as boolean, jobs: redacted });
    const permanentLookup = redacted.find(({ status, lookup_retryable }) => status === "lookup_failed" && lookup_retryable !== true);
    if (permanentLookup) persistFail(context, journal, record, "GENERATION_FAILED", at, { index: permanentLookup.index, status: permanentLookup.status, retryable: permanentLookup.lookup_retryable });
    if (redacted.some(({ status, lookup_retryable }) => status === "lookup_failed" && lookup_retryable === true) || response.all_terminal !== true) { writeJournal(context, journal); return { command: "jobs-handoff", batch_id: id, state: record.state, repoll_same_jobs_only: true, new_paid_submit: false }; }
    const drift = redacted.find(({ status, model }) => status === "completed" && model !== T015_V4_EXPECTED_MODEL);
    if (drift) persistFail(context, journal, record, "MODEL_DRIFT", at, { batch_canary: id === T015_V4_CANARY_BATCH_ID, index: drift.index, expected_model: T015_V4_EXPECTED_MODEL, observed_model: drift.model, batch_3_blocked_on_model_drift: id === T015_V4_CANARY_BATCH_ID, spend_not_recovered: true });
    const generationFailure = redacted.find(({ status }) => status !== "completed");
    writeJournal(context, journal);
    // Every good completed asset is downloaded and journalled before any fail-stop.
    for (const job of record.submission.jobs) {
      if (record.recoveries.some(({ asset_id }) => asset_id === job.asset_id)) continue;
      const url = transient.get(job.asset_id);
      if (!url) { if (generationFailure) continue; persistFail(context, journal, record, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "MISSING_RESULT_URL" }); }
      let bytes: Buffer;
      try { bytes = await downloadT015V4(url!, dependencies); } catch { persistFail(context, journal, record, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "SECURE_DOWNLOAD_FAILED" }); }
      ingest(context, journal, record, job, bytes, at);
    }
    if (generationFailure) persistFail(context, journal, record, "GENERATION_FAILED", at, { index: generationFailure.index, status: generationFailure.status, good_assets_recovered_first: record.recoveries.length, unrecoverable_confirmed_jobs: unrecoveredConfirmed(record), discharge_required: true });
    writeJournal(context, journal);
    return { command: "jobs-handoff", batch_id: id, state: record.state, recovered: record.recoveries.length, new_paid_submit: false, paid_retry_count: 0 };
  } finally { lock.release(); }
}

/* ------------------------------------------------------------------ audit */

function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function writeContactNoClobber(root: string, path: string, bytes: string): void { const target = safeResolve(root, path, true); if (existsSync(target)) { if (readFileSync(target, "utf8") !== bytes) throw new Error("T015 v4 contact no-clobber conflict"); return; } writeFileSync(target, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 }); }
export function writeT015V4ContactSegments(root: string, plan: T015V4Plan, recoveredIds: ReadonlySet<string>): Array<{ segment: string; path: string; image_count: number; sha256: string }> {
  const groups: Array<{ label: string; assets: Array<{ id: string; path: string }> }> = [
    { label: "legacy-000", assets: plan.legacy_recovery.assets.map(({ id, path }) => ({ id, path })) },
    ...plan.batches.map((batch) => ({ label: batch.id, assets: batch.asset_ids.filter((assetId) => recoveredIds.has(assetId)).map((assetId) => { const asset = assetOf(plan, assetId); return { id: asset.id, path: asset.path }; }) })),
  ];
  const results = groups.map((group, index) => {
    const cards = group.assets.map((asset) => `<figure><img loading="lazy" src="../../../../public/assets/${escapeHtml(asset.path)}" alt="${escapeHtml(asset.id)}"><figcaption>${escapeHtml(asset.id)}</figcaption></figure>`).join("\n");
    const path = `${T015_V4_CONTACT_SEGMENT_ROOT}/segment-${String(index + 1).padStart(3, "0")}.html`;
    const bytes = `<!doctype html><meta charset="utf-8"><title>T015 v4 ${escapeHtml(group.label)}</title><main>${cards}</main>\n`;
    if (group.assets.length > 12) throw new Error("T015 v4 contact segment exceeds 12 images");
    writeContactNoClobber(root, path, bytes);
    return { segment: group.label, path, image_count: group.assets.length, sha256: sha256(bytes) };
  });
  const links = results.map(({ segment }, index) => `<li><a href="t015-canonical-shard-1-v4/segment-${String(index + 1).padStart(3, "0")}.html">${escapeHtml(segment)}</a></li>`).join("\n");
  const total = results.reduce((sum, { image_count }) => sum + image_count, 0);
  const indexBytes = `<!doctype html><meta charset="utf-8"><title>T015 CANONICAL shard 1 v4</title><h1>T015 CANONICAL 0..331</h1><p>${total} recovered assets; ${results.length} lazy-loaded segments of at most 12 images.</p><ol>${links}</ol>\n`;
  if (/<img\b/i.test(indexBytes)) throw new Error("T015 v4 contact index eagerly loads images");
  writeContactNoClobber(root, T015_V4_CONTACT_INDEX_PATH, indexBytes);
  return results;
}
export function checkExcludedT015V4CanonicalPaths(root: string): { checked_count: number; public_present_count: 0; backup_present_count: 0; all_absent: true } {
  const core = JSON.parse(readFileSync(resolve(root, T015_V4_CORE_PLAN_PATH), "utf8")) as { assets: Array<{ category: string; path: string }> };
  const excluded = core.assets.filter(({ category }) => category === "CANONICAL").slice(T015_V4_TOTAL_ASSET_COUNT);
  const publicPresent = excluded.filter(({ path }) => existsSync(safeResolve(resolve(root, T015_V4_LOCAL_ROOT), path)));
  const backupPresent = excluded.filter(({ path }) => existsSync(safeResolve(resolve(root, T015_V4_BACKUP_ROOT), path)));
  if (excluded.length !== 994 || publicPresent.length > 0 || backupPresent.length > 0) throw new Error("T015 v4 excluded CANONICAL path exists or scope changed");
  return { checked_count: excluded.length, public_present_count: 0, backup_present_count: 0, all_absent: true };
}
export function auditT015V4(context: T015V4Context, journal: T015V4Journal, observedAt: string): Record<string, unknown> {
  timestamp(observedAt);
  const { root, plan } = context;
  const losses = acknowledgedLossUnits(journal);
  if (journal.run_state === "ACTIVE" && closable(journal) && losses > 0) { journal.run_state = "CLOSED_WITH_LOSSES"; writeJournal(context, journal); }
  if (journal.run_state !== "COMPLETE" && journal.run_state !== "CLOSED_WITH_LOSSES") throw new Error("T015 v4 audit requires every batch settled or unstarted: COMPLETE, or discharged and closed with losses");
  const exact = journal.run_state === "COMPLETE";
  const recoveries = journal.batches.flatMap(({ recoveries: items }) => items);
  const recoveredIds = new Set(recoveries.map(({ asset_id }) => asset_id));
  if (recoveredIds.size !== recoveries.length) throw new Error("T015 v4 audit found a duplicated recovery");
  if (exact && recoveries.length !== T015_V4_PAID_ASSET_COUNT) throw new Error("T015 v4 exact audit requires all 320 recovered paid assets");
  for (const recovery of recoveries) {
    const local = verifyExistingPng(resolve(root, T015_V4_LOCAL_ROOT), recovery.local_relative_path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
    const backup = verifyExistingPng(resolve(root, T015_V4_BACKUP_ROOT), recovery.backup_relative_path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
    if (local.sha256 !== backup.sha256 || local.size !== backup.size) throw new Error("T015 v4 local and backup differ");
  }
  for (const legacy of plan.legacy_recovery.assets) {
    const local = verifyExistingPng(resolve(root, T015_V4_LOCAL_ROOT), legacy.path, "3:4", legacy.sha256, DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
    const backup = verifyExistingPng(resolve(root, T015_V4_BACKUP_ROOT), legacy.path, "3:4", legacy.sha256, DEFAULT_MAX_PNG_BYTES, T015_V4_ASPECT_TOLERANCE_PPM);
    if (local.sha256 !== backup.sha256 || local.size !== backup.size || local.width !== legacy.actual_width || local.height !== legacy.actual_height) throw new Error("T015 v4 pinned v3 recovery no longer matches the plan");
  }
  const capUsed = capUsedUnits(journal);
  if (capUsed > T015_V4_ADDITIONAL_CAP_UNITS || capUsed + T015_V4_LEGACY_COMMITTED_UNITS > T015_V4_TOTAL_CAP_UNITS) throw new Error("T015 v4 credit accounting exceeds the approved cap");
  if (exact && (capUsed !== T015_V4_ADDITIONAL_CAP_UNITS || capUsed + T015_V4_LEGACY_COMMITTED_UNITS !== T015_V4_TOTAL_CAP_UNITS || losses !== 0)) throw new Error("T015 v4 exact audit does not close at 480.00 + 18.00 = 498.00");
  const excluded = checkExcludedT015V4CanonicalPaths(root);
  const segments = writeT015V4ContactSegments(root, plan, recoveredIds);
  return {
    command: "audit", observed_at: observedAt, run_state: journal.run_state, exact_closure: exact,
    paid_assets_recovered: recoveries.length, paid_assets_planned: T015_V4_PAID_ASSET_COUNT, paid_assets_lost: T015_V4_PAID_ASSET_COUNT - recoveries.length,
    legacy_assets: plan.legacy_recovery.assets.length, total_assets_present: recoveries.length + plan.legacy_recovery.assets.length, total_assets_planned: T015_V4_TOTAL_ASSET_COUNT,
    batches: T015_V4_PAID_BATCH_COUNT, unstarted_batches: journal.batches.filter((record) => unstarted(record)).length, total_delta_units: capUsed, total_delta_decimal: decimal(capUsed),
    acknowledged_loss_units: losses, acknowledged_loss_decimal: decimal(losses),
    cumulative_units: capUsed + T015_V4_LEGACY_COMMITTED_UNITS, cumulative_decimal: decimal(capUsed + T015_V4_LEGACY_COMMITTED_UNITS),
    within_additional_cap: capUsed <= T015_V4_ADDITIONAL_CAP_UNITS, within_total_cap: capUsed + T015_V4_LEGACY_COMMITTED_UNITS <= T015_V4_TOTAL_CAP_UNITS,
    batch_dispositions: journal.batches.map((record) => ({ batch_id: record.batch_id, state: record.state, recovered: record.recoveries.length, disposition: record.state === "COMPLETE" ? "COMPLETE" : unstarted(record) ? "UNSTARTED" : latestResume(journal, record)?.disposition ?? "UNRESOLVED", acknowledged_loss_decimal: decimal(record.discharges.reduce((sum, discharge) => sum + discharge.acknowledged_loss_units, 0)) })),
    paid_retry_count: 0, local_backup_verified: true, v3_recoveries_hash_matched: plan.legacy_recovery.assets.length,
    excluded_canonical_paths_absent: excluded.all_absent, excluded_checked_count: excluded.checked_count,
    contact_segments: segments.length, contact_index_eager_full_image_load: false, regenerated_lost_indices: false,
  };
}

/* ------------------------------------------------------------- production */

function productionContext(command: string, now = () => new Date()): T015V4Context {
  const plan = buildT015V4Plan(repositoryRoot);
  const bytes = readFileSync(resolve(repositoryRoot, T015_V4_PLAN_PATH), "utf8");
  if (bytes !== renderT015V4Plan(plan)) throw new Error("T015 v4 bound plan changed");
  if (!isT015V4Authorized(repositoryRoot, plan, now())) throw new Error("T015 v4 exact scoped approval is missing; prior approvals are not inherited");
  // `status` mutates nothing, so a dirty working tree must not hide the run's state.
  if (command !== "status") assertT015V4CommittedClean(repositoryRoot);
  return { root: repositoryRoot, plan, ...loadT015V4Authorization(repositoryRoot, plan, now()) };
}
export function runT015V4Ops(args: readonly string[]): Record<string, unknown> { const now = () => new Date(); const context = productionContext(args[0] ?? "", now); return runT015V4OpsInternal(args, context.root, context.plan, context.presentation, context.approval, now); }
export function runT015V4JobsHandoff(args: readonly string[], stdinJson: string): Promise<Record<string, unknown>> { const now = () => new Date(); const context = productionContext("jobs-handoff", now); return runT015V4JobsHandoffInternal(args, stdinJson, context.root, context.plan, context.presentation, context.approval, defaultDependencies, now); }
