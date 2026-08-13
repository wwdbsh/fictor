import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MAX_PNG_BYTES, assertNonOverlappingRoots, atomicWriteJson, atomicWriteVerifiedPng, backupVerifiedFile, safeResolve, verifyExistingPng, type VerifiedFile } from "./filesystem";
import type { AspectRatio } from "./types";
import { providerDefaultFetch, providerResolve } from "./provider-transport";
// Lock, secure download, and the cost-request shape are T020's audited implementations,
// imported rather than copied; both T020 files are pinned in the T021 binding.
import { acquireT020Lock, decimalsT020, downloadT020, isPublicT020ResolvedAddress, t020GetCostRequest, type T020Dependencies } from "./t020-world-art-production-v1-ops";
import {
  T021_CORE_PLAN_PATH, T021_CORE_PLAN_SHA256, T021_V1_ASSET_COUNT, T021_V1_BACKUP_ROOT, T021_V1_BATCH_COUNT, T021_V1_BINDING_PATH,
  T021_V1_CANARY_BATCH_ID, T021_V1_CANARY_BLOCKED_BATCH_ID, T021_V1_CONTACT_INDEX_PATH, T021_V1_CONTACT_SEGMENT_DIR,
  T021_V1_CONTACT_SEGMENT_ROOT, T021_V1_EXPECTED_MODEL, T021_V1_JOURNAL_PATH, T021_V1_LOCAL_ROOT, T021_V1_LOCK_PATH,
  T021_V1_LOSS_ACKNOWLEDGMENT_PHRASE, T021_V1_PLAN_PATH, T021_V1_RECOVERY_OPERATOR_PHRASE, T021_V1_RESUME_OPERATOR_PHRASE,
  T021_V1_TOTAL_CAP_UNITS, T021_V1_UNIT_COST_UNITS, buildT021Plan, canonicalJsonT021 as canonicalJson, decimalT021 as decimal,
  isT021Authorized, loadT021Authorization, loadT021Binding, readPinnedT021, renderT021CanonicalJson, renderT021Plan,
  sha256T021 as sha256, t021AspectTolerancePpm, t021PlanSha256,
  type T021Approval, type T021Asset, type T021Plan, type T021Presentation,
} from "./t021-event-art-production-v1";

/* T020 primitives under T021 names, so this module reads in one vocabulary. */
export const acquireT021Lock = acquireT020Lock;
export const downloadT021 = downloadT020;
export const isPublicT021ResolvedAddress = isPublicT020ResolvedAddress;
export type T021Dependencies = T020Dependencies;
/** Shared transport — no fourth copy of the Node 22 fetch corrections. */
const defaultDependencies: T021Dependencies = { resolve: async (hostname) => providerResolve(hostname), fetch: (spec) => providerDefaultFetch(spec, DEFAULT_MAX_PNG_BYTES) };

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FRESHNESS_MS = 10 * 60 * 1000;
const MAX_STDIN_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
/** Node 22: execFileSync without an explicit maxBuffer raises ENOBUFS on large manifests. */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const LOCK_STALE_MS = 15 * 60 * 1000;
/** Floor before a same-host holder with a dead PID may be reclaimed. */
const RECLAIM_GRACE_MS = 60 * 1000;

export type T021BatchState = "PLANNED" | "PREFLIGHT_REQUESTED" | "PREFLIGHT_VERIFIED" | "SUBMITTING" | "SUBMITTED" | "RECOVERY_OPEN" | "RECOVERING" | "RECOVERED" | "COMPLETE" | "FAIL_STOP";
export type T021RunState = "ACTIVE" | "FAIL_STOP" | "COMPLETE" | "CLOSED_WITH_LOSSES";
export type T021TerminalCode = "PRICE_CHANGED" | "BALANCE_CHANGED" | "AMBIGUOUS_SUBMISSION" | "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE" | "PROVIDER_RESPONSE_SIGNAL" | "UNKNOWN_PROVIDER_FIELD" | "GENERATION_FAILED" | "MODEL_DRIFT" | "ASPECT_MISMATCH" | "PAYLOAD_UNUSABLE" | "RECOVERY_FAILED" | "FILE_CONFLICT";
type SubmitStatus = "pending" | "waiting" | "queued" | "in_progress" | "ip_detect" | "completed" | "failed" | "canceled" | "nsfw" | "ip_detected" | "submission_failed";
type WaitStatus = "pending" | "waiting" | "queued" | "in_progress" | "ip_detect" | "completed" | "failed" | "canceled" | "nsfw" | "ip_detected" | "lookup_failed";
const SUBMIT_STATUSES: readonly SubmitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "submission_failed"];
const WAIT_STATUSES: readonly WaitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect", "completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"];
const ACTIVE_WAIT_STATUSES: readonly WaitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect"];
const FAILED_WAIT_STATUSES: readonly WaitStatus[] = ["failed", "canceled", "nsfw", "ip_detected"];
const TERMINAL_SUBMIT_FAILURES: readonly SubmitStatus[] = ["failed", "canceled", "nsfw", "ip_detected", "submission_failed"];
const JOB_OPTIONAL_KEYS = ["adjustments", "error", "warning", "preset_recommendation"] as const;
/** Local storage refused the bytes; the provider is not at fault but the image was billed. */
const LOCAL_STORE_CONFLICT_MESSAGES: readonly string[] = ["EXISTING_FILE_CONFLICT", "SYMLINK_TRAVERSAL", "BACKUP_VERIFY_FAILED", "LOCAL_HASH_CHANGED", "LOCAL_VERIFY_FAILED"];
/** The provider billed us and handed back bytes that are not a usable PNG. */
const PROVIDER_PAYLOAD_MESSAGES: readonly string[] = ["INVALID_PNG", "FILE_TOO_LARGE", "EMPTY_FILE"];
/**
 * Terminal codes that typically leave provider credits spent with nothing to show for them.
 * PURELY DOCUMENTARY: nothing branches on this list. Both of the questions it used to answer
 * are now answered by facts instead — `t021Dischargeable` asks whether a paid envelope escaped,
 * and COMPLETE asks whether the assets landed and the money matched. Every attempt to decide
 * either question from a terminal's name produced a wedge, because the name describes how a
 * batch stopped, not what it cost or delivered.
 */
export const T021_SPEND_LOSS_CODES: readonly T021TerminalCode[] = ["AMBIGUOUS_SUBMISSION", "GENERATION_FAILED", "MODEL_DRIFT", "ASPECT_MISMATCH", "PAYLOAD_UNUSABLE", "BALANCE_CHANGED"];
/**
 * Drift in the provider's own contract, as opposed to a one-off failure: the model it ran is
 * not the approved one, or the geometry it returned is outside tolerance. Either means the
 * thing that was approved is not the thing being bought, so no later batch may be submitted
 * under this approval — not even after the operator discharges the loss and resumes. The
 * loss is still bookable, so the run can close honestly as CLOSED_WITH_LOSSES.
 */
export const T021_CONTRACT_DRIFT_CODES: readonly T021TerminalCode[] = ["MODEL_DRIFT", "ASPECT_MISMATCH"];
/**
 * A RECOVERY_FAILED terminal books no spend of its own: it records only that a poll could not
 * be read. It is the one code a later fact can supersede — once every confirmed job for the
 * batch has actually landed, the observation "the poll could not be read" has been answered by
 * the assets themselves, and the terminal goes inactive (see `t021ActiveTerminals`).
 *
 * Without that rule a single transient download blip left a fully recovered, exactly-billed
 * batch stuck short of COMPLETE with no command able to clear it, which made a 100%-successful
 * 54-asset run permanently un-closable and un-auditable.
 *
 * Note the deliberately narrow membership: codes that mean "the provider billed us for bytes
 * we cannot use" (ASPECT_MISMATCH, PAYLOAD_UNUSABLE) are NOT superseded by anything.
 */
export const T021_SUPERSEDED_TERMINAL_CODES: readonly T021TerminalCode[] = ["RECOVERY_FAILED"];
const LEGAL_EDGES: Record<T021BatchState, readonly T021BatchState[]> = {
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

export interface T021ProviderJob { index: number; asset_id: string; job_id: string; status: SubmitStatus; canonical_request_sha256: string }
export interface T021Recovery { asset_id: string; provider_job_index: number; provider_job_id: string; source: "JOBS_HANDOFF_STDIN"; observed_at: string; local_relative_path: string; backup_relative_path: string; aspect_ratio: AspectRatio; sha256: string; size_bytes: number; actual_width: number; actual_height: number; aspect_error_ppm: number; provider_native_unmodified: true }
export interface T021Terminal { code: T021TerminalCode; observed_at: string; facts: Record<string, unknown>; automatic_paid_retry: false; paid_retry_count: 0; no_resubmit: true; scope: "BATCH" }
export interface T021Balance { credits: number; normalized_decimal: string; provider_observed_at: string }
export interface T021Discharge {
  kind: "ZERO_SPEND_RESET" | "LOSS_ACKNOWLEDGED";
  observed_at: string;
  terminals_discharged: number;
  exact_operator_phrase_sha256: string | null;
  max_exposure_units: number;
  recovered_units: number;
  observed_delta_units: number;
  acknowledged_loss_units: number;
  acknowledged_loss_decimal: string;
  balance_after_loss: T021Balance | null;
  resubmitted: false;
}
export interface T021BatchRecord {
  batch_id: string;
  asset_ids: string[];
  aspect_ratio: AspectRatio;
  state: T021BatchState;
  transitions: Array<{ state: T021BatchState; observed_at: string }>;
  resets: Array<{ from_state: "PREFLIGHT_REQUESTED" | "PREFLIGHT_VERIFIED" | "FAIL_STOP"; observed_at: string; zero_spend: true }>;
  preflight?: { requests: Array<{ index: number; params: T021Asset["request"]["params"] & { get_cost: true } }>; requests_sha256: string; requested_at: string; costs?: Array<{ index: number; request_sha256: string; credits: 1; credits_decimal: "1.00"; credits_exact: 1.5; credits_exact_decimal: "1.50"; provider_observed_at: string }>; balance?: T021Balance };
  paid_request?: { request_sha256: string; prepared_at: string };
  submission?: { observed_at: string; expected_count: number; submitted_count: number; failed_count: number; topology_valid: boolean; complete: boolean; missing_asset_ids: string[]; jobs: T021ProviderJob[] };
  recovery_gates: Array<{ opened_at: string; exact_operator_phrase_sha256: string; no_new_paid_submit: true }>;
  job_polls: Array<{ observed_at: string; all_terminal: boolean; jobs: Array<{ index: number; job_id: string; status: WaitStatus; model: string | null; download_available: boolean; lookup_retryable: boolean | null }> }>;
  recoveries: T021Recovery[];
  balance_after?: { credits: number; normalized_decimal: string; observed_at: string; provider_observed_at: string; delta_decimal: string; delta_units: number; charged_job_count: number };
  terminals: T021Terminal[];
  discharges: T021Discharge[];
}
export type T021ResumeDisposition = "ZERO_SPEND" | "FULLY_RECOVERED_BALANCE_VERIFIED" | "DISCHARGED_LOSS";
export interface T021Journal {
  schema_version: 1;
  journal_version: "t021-event-art-operations-v1";
  redacted: true;
  plan_sha256: string;
  disclosure_presentation_evidence_sha256: string;
  approval_evidence_sha256: string;
  immutable_forensics: T021Plan["immutable_forensics"];
  run_state: T021RunState;
  fail_stop_batch_id: string | null;
  initial_balance: T021Balance;
  /** T021 is a clean start: the total cap is the whole budget, with no legacy component. */
  total_credit_cap_units: typeof T021_V1_TOTAL_CAP_UNITS;
  automatic_paid_retry_reserve_decimal: "0.00";
  paid_retry_count: 0;
  local_root: typeof T021_V1_LOCAL_ROOT;
  backup_root: typeof T021_V1_BACKUP_ROOT;
  expected_provider_reported_model: typeof T021_V1_EXPECTED_MODEL;
  resumes: Array<{ observed_at: string; failed_batch_id: string; terminal_index: number; disposition: T021ResumeDisposition; exact_operator_phrase_sha256: string; resubmitted: false }>;
  /** The six images v1 already paid for, recovered here at zero additional cost. */
  batches: T021BatchRecord[];
}
export interface T021Context { root: string; plan: T021Plan; presentation: T021Presentation; approval: T021Approval }

/* ------------------------------------------------------------- primitives */

function timestamp(value: string): string { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("invalid T021 observed timestamp"); return value; }
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
// Operator-supplied provider payloads must live inside the repository so safeResolve can
// reject symlinks and traversal; a raw absolute path is refused before the journal moves.
function operatorPath(args: readonly string[], name: string): string { const value = option(args, name); if (isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error(`T021 ${name} must be a repository-relative path`); return value; }
function exactKeys(value: Record<string, unknown>, required: readonly string[], allowed = required): void { if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("unknown or missing provider field"); }
function assertWallClock(at: string, now: (() => Date) | undefined, floor?: string, freshnessMs?: number): void {
  const observed = Date.parse(timestamp(at));
  if (floor && observed < Date.parse(floor)) throw new Error("T021 observed timestamp is not monotonic");
  if (now) { const current = now().getTime(); if (observed > current) throw new Error("T021 observed timestamp is in the future"); if (freshnessMs !== undefined && current - observed > freshnessMs) throw new Error("T021 observation is stale against the real clock"); }
}
function transition(record: T021BatchRecord, state: T021BatchState, at: string): void {
  if (!LEGAL_EDGES[record.state].includes(state)) throw new Error(`T021 illegal batch transition ${record.state}->${state}`);
  record.state = state; record.transitions.push({ state, observed_at: timestamp(at) });
}
function sanitizeFacts(value: Record<string, unknown>): Record<string, unknown> { const text = JSON.stringify(value); if (/https?:\/\//i.test(text) || /result_url|thumbnail_url|raw_error|hostname/i.test(text)) return { redacted_reason: "SENSITIVE_PROVIDER_VALUE_REMOVED" }; return value; }
function assertRedactedJournal(journal: T021Journal): void { const text = JSON.stringify(journal); if (/https?:\/\//i.test(text) || /result_url|thumbnail_url|raw_error|hostname/i.test(text)) throw new Error("T021 journal contains durable sensitive provider data"); }
// The plan is immutable for the life of a process, so its derived canonical forms and hashes
// are memoised per plan instance: validation runs on every read AND every write.
interface PlanIndex { assets: Map<string, T021Asset>; costRequestSha: Map<string, string>; preflight: Map<string, { requests: Array<{ index: number; params: T021Asset["request"]["params"] & { get_cost: true } }>; canonical: string; sha256: string }>; paid: Map<string, { canonical: string; sha256: string }> }
const planIndexes = new WeakMap<object, PlanIndex>();
function planIndex(plan: T021Plan): PlanIndex {
  let index = planIndexes.get(plan as unknown as object);
  if (!index) { index = { assets: new Map(plan.assets.map((asset) => [asset.id, asset])), costRequestSha: new Map(), preflight: new Map(), paid: new Map() }; planIndexes.set(plan as unknown as object, index); }
  return index;
}
function batchOf(plan: T021Plan, id: string) { const batch = plan.batches.find((item) => item.id === id); if (!batch) throw new Error("unknown T021 batch"); return batch; }
function assetOf(plan: T021Plan, id: string): T021Asset { const asset = planIndex(plan).assets.get(id); if (!asset) throw new Error("unknown T021 asset"); return asset; }
/** Aspect is per asset in T020, never a run-wide constant. */
function aspectOf(plan: T021Plan, assetId: string): AspectRatio { return assetOf(plan, assetId).aspect_ratio; }
const getCostRequest = t020GetCostRequest;
function costRequestSha256(plan: T021Plan, asset: T021Asset): string {
  const cache = planIndex(plan).costRequestSha;
  let value = cache.get(asset.id);
  if (value === undefined) { value = sha256(canonicalJson(getCostRequest(asset.request))); cache.set(asset.id, value); }
  return value;
}
function paidEnvelopeOf(plan: T021Plan, id: string) {
  const cache = planIndex(plan).paid;
  let value = cache.get(id);
  if (!value) { const canonical = canonicalJson({ requests: batchOf(plan, id).asset_ids.map((assetId) => assetOf(plan, assetId).request) }); value = { canonical, sha256: sha256(canonical) }; cache.set(id, value); }
  return value;
}
function paidEnvelope(plan: T021Plan, id: string) { const batch = batchOf(plan, id); return { batch_id: batch.id, aspect_ratio: batch.aspect_ratio, requests: batch.asset_ids.map((assetId) => assetOf(plan, assetId).request) }; }
function preflightEnvelopeOf(plan: T021Plan, id: string) {
  const cache = planIndex(plan).preflight;
  let value = cache.get(id);
  if (!value) {
    const requests = batchOf(plan, id).asset_ids.map((assetId) => getCostRequest(assetOf(plan, assetId).request));
    if (!requests.length) throw new Error("empty T021 batch");
    const canonical = canonicalJson({ requests });
    value = { requests, canonical, sha256: sha256(canonical) };
    cache.set(id, value);
  }
  return value;
}
function preflightEnvelope(plan: T021Plan, id: string) { const batch = batchOf(plan, id); return { batch_id: batch.id, aspect_ratio: batch.aspect_ratio, requests: copyPreflightRequests(preflightEnvelopeOf(plan, id).requests) }; }
type PreflightRequests = NonNullable<T021BatchRecord["preflight"]>["requests"];
function copyPreflightRequests(requests: PreflightRequests): PreflightRequests { return requests.map(({ index, params }) => ({ index, params: { ...params, medias: params.medias.map((media) => ({ ...media })) } })); }
const requestCanonicalCache = new WeakMap<object, string>();
function canonicalOfRequests(requests: PreflightRequests): string {
  let value = requestCanonicalCache.get(requests as unknown as object);
  if (value === undefined) { value = canonicalJson({ requests }); requestCanonicalCache.set(requests as unknown as object, value); }
  return value;
}
function pngHeaderDimensions(bytes: Uint8Array): { width: number; height: number } | null { const buffer = Buffer.from(bytes); if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null; return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }; }

/* -------------------------------------------------------- committed clean */

export function assertT021CommittedClean(root: string): void {
  const binding = loadT021Binding(root);
  const paths = [...new Set([T021_V1_BINDING_PATH, T021_V1_PLAN_PATH, ...Object.values(binding.files).map(({ path }) => path)])];
  let status: string;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", ...paths], { cwd: root, stdio: "ignore", maxBuffer: GIT_MAX_BUFFER });
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...paths], { cwd: root, stdio: "ignore", maxBuffer: GIT_MAX_BUFFER });
    status = execFileSync("git", ["status", "--porcelain=v1", "--", ...paths], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: GIT_MAX_BUFFER });
  } catch { throw new Error("T021 production binding is not committed-clean"); }
  if (status.trim() !== "") throw new Error("T021 production binding scope is dirty or untracked");
}

/* -------------------------------------------------- batch-level accessors */

function zeroSpend(record: T021BatchRecord): boolean { return record.paid_request === undefined && record.submission === undefined; }
function confirmedJobs(record: T021BatchRecord): T021ProviderJob[] { return record.submission?.jobs ?? []; }
function unrecoveredConfirmed(record: T021BatchRecord): number { return confirmedJobs(record).filter((job) => !record.recoveries.some(({ asset_id }) => asset_id === job.asset_id)).length; }
function dischargedTerminalCount(record: T021BatchRecord): number { return record.discharges.at(-1)?.terminals_discharged ?? 0; }
export function t021ActiveTerminals(record: T021BatchRecord): T021Terminal[] {
  const undischarged = record.terminals.slice(dischargedTerminalCount(record));
  // Fact beats observation: if every job the provider confirmed has since been recovered,
  // a "the poll could not be read" terminal has been answered and no longer blocks the batch.
  const answered = record.submission !== undefined && record.submission.jobs.length > 0 && unrecoveredConfirmed(record) === 0;
  return answered ? undischarged.filter(({ code }) => !T021_SUPERSEDED_TERMINAL_CODES.includes(code)) : undischarged;
}
/**
 * Whether this batch's stop can be discharged as a loss. The question is never what the
 * terminal is called, only whether money left the building: once a paid envelope escaped,
 * every way the batch can stop leaves spend that the ledger has to be able to book. A batch
 * that never submitted is reset and re-run instead, at no cost.
 */
export function t021Dischargeable(record: T021BatchRecord): boolean {
  return !zeroSpend(record) && !lossDischarged(record) && record.balance_after === undefined && t021ActiveTerminals(record).length > 0;
}
function hasActiveTerminal(record: T021BatchRecord): boolean { return t021ActiveTerminals(record).length > 0; }
function lossDischarged(record: T021BatchRecord): boolean { return record.discharges.some(({ kind }) => kind === "LOSS_ACKNOWLEDGED"); }
/**
 * The authoritative per-asset loss ledger, derived from the journal alone: for every batch
 * that booked a loss discharge, the confirmed jobs whose asset never landed anywhere.
 */
export function t021LostAssets(journal: T021Journal): Array<{ index: number; asset_id: string; batch_id: string }> {
  const recovered = new Set(journal.batches.flatMap(({ recoveries }) => recoveries.map(({ asset_id }) => asset_id)));
  const byAsset = new Map<string, { index: number; asset_id: string; batch_id: string }>();
  for (const record of journal.batches) {
    if (!lossDischarged(record)) continue;
    for (const { index, asset_id } of record.submission?.jobs ?? []) if (!recovered.has(asset_id)) byAsset.set(asset_id, { index, asset_id, batch_id: record.batch_id });
  }
  return [...byAsset.values()].sort((first, second) => first.index - second.index);
}
function latestResume(journal: T021Journal, record: T021BatchRecord) { return journal.resumes.filter(({ failed_batch_id, terminal_index }) => failed_batch_id === record.batch_id && terminal_index === record.terminals.length - 1).at(-1); }
function settled(journal: T021Journal, record: T021BatchRecord): boolean { if (record.state === "COMPLETE") return true; const resume = latestResume(journal, record); return resume !== undefined && resume.disposition !== "ZERO_SPEND"; }
// An untouched batch carries no evidence of any kind, so a run stopped after a loss can
// still be closed: nothing was requested, submitted, spent, or recovered for it.
function unstarted(record: T021BatchRecord): boolean { return record.state === "PLANNED" && record.transitions.length === 0 && record.terminals.length === 0 && record.discharges.length === 0 && record.preflight === undefined && zeroSpend(record) && record.recoveries.length === 0 && record.job_polls.length === 0 && record.recovery_gates.length === 0; }
function closable(journal: T021Journal): boolean { return journal.batches.every((record) => settled(journal, record) || unstarted(record)); }
// A batch whose paid envelope escaped, or whose loss was discharged, is never re-run.
function neverReopen(record: T021BatchRecord): boolean { return record.paid_request !== undefined || lossDischarged(record); }
function maxExposureUnits(record: T021BatchRecord): number { return (record.submission ? record.submission.jobs.length : record.asset_ids.length) * T021_V1_UNIT_COST_UNITS; }
function acknowledgedLossUnits(journal: T021Journal): number { return journal.batches.reduce((sum, record) => sum + record.discharges.reduce((batchSum, discharge) => batchSum + discharge.acknowledged_loss_units, 0), 0); }
function capUsedUnits(journal: T021Journal): number { return journal.batches.reduce((sum, record) => sum + (record.balance_after?.delta_units ?? 0) + record.discharges.reduce((batchSum, discharge) => batchSum + discharge.observed_delta_units, 0), 0); }
/**
 * Every batch is its own model-identity canary: a batch is model-verified only once a single
 * poll shows all of its jobs completed and reporting the expected provider model.
 */
export function t021BatchModelVerified(record: T021BatchRecord): boolean {
  if (!record.submission) return false;
  return record.job_polls.some((poll) => poll.jobs.length === record.submission!.jobs.length && poll.jobs.length > 0 && poll.jobs.every(({ status, model }) => status === "completed" && model === T021_V1_EXPECTED_MODEL));
}
export function t021CanaryVerified(journal: T021Journal): boolean {
  const canary = journal.batches.find(({ batch_id }) => batch_id === T021_V1_CANARY_BATCH_ID);
  return canary !== undefined && t021BatchModelVerified(canary);
}
/** Every batch that observed provider-contract drift, with the code that proved it. */
export function t021ContractDriftBatches(journal: T021Journal): Array<{ batch_id: string; code: T021TerminalCode }> {
  return journal.batches.flatMap((record) => record.terminals.filter(({ code }) => T021_CONTRACT_DRIFT_CODES.includes(code)).map(({ code }) => ({ batch_id: record.batch_id, code })));
}
// The latest observed provider balance before a batch: an earlier batch's balance-after, a
// post-loss observation, or — for the very first batch — the absolute anchor taken at init.
function balanceAnchor(journal: T021Journal, index: number): T021Balance {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const record = journal.batches[cursor];
    const loss = record.discharges.at(-1)?.balance_after_loss;
    if (loss) return loss;
    if (record.balance_after) return { credits: record.balance_after.credits, normalized_decimal: record.balance_after.normalized_decimal, provider_observed_at: record.balance_after.provider_observed_at };
  }
  return journal.initial_balance;
}
// Inclusive anchor: the batch's own post-loss observation wins, so measuring the same batch
// twice yields a zero delta instead of re-booking a spend that already happened.
function spendAnchor(journal: T021Journal, index: number): T021Balance {
  const record = journal.batches[index];
  const loss = record.discharges.at(-1)?.balance_after_loss;
  if (loss) return loss;
  if (record.balance_after) return { credits: record.balance_after.credits, normalized_decimal: record.balance_after.normalized_decimal, provider_observed_at: record.balance_after.provider_observed_at };
  return balanceAnchor(journal, index);
}
export function t021BatchCanDeliverAllAssets(record: T021BatchRecord): boolean {
  if (lossDischarged(record)) return false;
  return record.recoveries.length === record.asset_ids.length || !hasActiveTerminal(record) || record.paid_request === undefined;
}
/** Credits still owed to the remaining batches, starting at `index` inclusive. */
function remainingUnits(plan: T021Plan, index: number): number { return plan.batches.slice(index).reduce((sum, batch) => sum + batch.size * T021_V1_UNIT_COST_UNITS, 0); }

/* --------------------------------------------------------------- journals */

export function buildInitialT021Journal(plan: T021Plan, presentation: T021Presentation, approval: T021Approval, initialBalance: T021Balance): T021Journal {
  return {
    schema_version: 1, journal_version: "t021-event-art-operations-v1", redacted: true, plan_sha256: t021PlanSha256(plan),
    disclosure_presentation_evidence_sha256: sha256(renderT021CanonicalJson(presentation)), approval_evidence_sha256: sha256(renderT021CanonicalJson(approval)),
    immutable_forensics: plan.immutable_forensics, run_state: "ACTIVE", fail_stop_batch_id: null, initial_balance: initialBalance,
    total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS, automatic_paid_retry_reserve_decimal: "0.00", paid_retry_count: 0,
    local_root: T021_V1_LOCAL_ROOT, backup_root: T021_V1_BACKUP_ROOT, expected_provider_reported_model: T021_V1_EXPECTED_MODEL,
    resumes: [],
    batches: plan.batches.map((batch) => ({ batch_id: batch.id, asset_ids: [...batch.asset_ids], aspect_ratio: batch.aspect_ratio, state: "PLANNED", transitions: [], resets: [], recovery_gates: [], job_polls: [], recoveries: [], terminals: [], discharges: [] })),
  };
}

function assertStateConsistency(record: T021BatchRecord): void {
  const state = record.state;
  const hasPreflight = record.preflight !== undefined;
  const hasCosts = record.preflight?.costs !== undefined;
  const hasBalance = record.preflight?.balance !== undefined;
  if (hasCosts !== hasBalance) throw new Error("T021 costs and balance must be paired");
  const bad =
    (state === "PLANNED" && (hasPreflight || record.paid_request || record.submission || record.recovery_gates.length > 0 || record.balance_after || record.recoveries.length > 0 || record.job_polls.length > 0 || hasActiveTerminal(record))) ||
    (state === "PREFLIGHT_REQUESTED" && (!hasPreflight || hasCosts || record.paid_request || record.submission)) ||
    (state === "PREFLIGHT_VERIFIED" && (!hasCosts || record.paid_request || record.submission)) ||
    (state === "SUBMITTING" && (!record.paid_request || record.submission)) ||
    (state === "SUBMITTED" && !record.submission) ||
    (["RECOVERY_OPEN", "RECOVERING", "RECOVERED"].includes(state) && (!record.submission || record.recovery_gates.length === 0)) ||
    (state === "COMPLETE" && (!record.balance_after || record.recoveries.length !== record.asset_ids.length || record.balance_after.delta_units !== record.asset_ids.length * T021_V1_UNIT_COST_UNITS)) ||
    (record.balance_after !== undefined && !["RECOVERED", "COMPLETE"].includes(state)) ||
    (hasActiveTerminal(record) && !["FAIL_STOP", "RECOVERY_OPEN", "RECOVERING", "RECOVERED", "COMPLETE"].includes(state)) ||
    (record.recoveries.length > 0 && record.recovery_gates.length === 0) ||
    (lossDischarged(record) && record.balance_after !== undefined);
  if (bad) throw new Error(`T021 batch state evidence changed: ${record.batch_id}`);
}

export function validateT021Journal(journal: T021Journal, plan: T021Plan, presentation: T021Presentation, approval: T021Approval, runtimeRoot?: string): void {
  const expected = buildInitialT021Journal(plan, presentation, approval, journal.initial_balance);
  if (canonicalJson(journal.immutable_forensics) !== canonicalJson(expected.immutable_forensics)) throw new Error("T021 journal header changed");
  if (journal.schema_version !== 1 || journal.journal_version !== expected.journal_version || journal.redacted !== true || journal.plan_sha256 !== expected.plan_sha256 || journal.disclosure_presentation_evidence_sha256 !== expected.disclosure_presentation_evidence_sha256 || journal.approval_evidence_sha256 !== expected.approval_evidence_sha256 || journal.total_credit_cap_units !== T021_V1_TOTAL_CAP_UNITS || journal.automatic_paid_retry_reserve_decimal !== "0.00" || journal.paid_retry_count !== 0 || journal.local_root !== T021_V1_LOCAL_ROOT || journal.backup_root !== T021_V1_BACKUP_ROOT || journal.expected_provider_reported_model !== T021_V1_EXPECTED_MODEL || journal.batches.length !== plan.batches.length) throw new Error("T021 journal header changed");
  assertRedactedJournal(journal);
  timestamp(journal.initial_balance.provider_observed_at);
  if (decimalsT020(journal.initial_balance.credits, "initial balance").decimal !== journal.initial_balance.normalized_decimal) throw new Error("T021 initial balance anchor changed");
  const globalJobIds = new Set<string>();
  const globalRecovered = new Set<string>();
  journal.batches.forEach((record, batchIndex) => {
    const expectedBatch = plan.batches[batchIndex];
    if (record.batch_id !== expectedBatch.id || record.aspect_ratio !== expectedBatch.aspect_ratio || canonicalJson(record.asset_ids) !== canonicalJson(expectedBatch.asset_ids) || new Set(record.asset_ids).size !== record.asset_ids.length) throw new Error("T021 journal batch binding changed");
    // Aspect homogeneity is re-proved from the plan on every read, not trusted from the journal.
    if (record.asset_ids.some((assetId) => aspectOf(plan, assetId) !== record.aspect_ratio)) throw new Error(`T021 batch is not aspect-homogeneous: ${record.batch_id}`);
    let cursor: T021BatchState = "PLANNED";
    const resetSources: T021BatchState[] = [];
    // Structural proof of "only zero-spend may re-run": once a SUBMITTING transition is in
    // the log the batch can never appear back at PLANNED, whatever a writer claims.
    let spendEscaped = false;
    record.transitions.forEach((item, index) => {
      timestamp(item.observed_at);
      if (index > 0 && Date.parse(item.observed_at) < Date.parse(record.transitions[index - 1].observed_at)) throw new Error("T021 transition chronology changed");
      if (!LEGAL_EDGES[cursor].includes(item.state)) throw new Error("T021 transition evidence changed");
      if (item.state === "SUBMITTING") spendEscaped = true;
      if (item.state === "PLANNED") { if (spendEscaped) throw new Error("T021 a batch whose paid envelope escaped can never be reset"); resetSources.push(cursor); }
      cursor = item.state;
    });
    if (record.state !== cursor) throw new Error("T021 batch state does not match its transition log");
    const resetTransitions = record.transitions.filter(({ state }) => state === "PLANNED");
    if (resetTransitions.length !== record.resets.length || record.resets.some((reset, index) => reset.observed_at !== resetTransitions[index].observed_at || reset.zero_spend !== true || reset.from_state !== resetSources[index])) throw new Error("T021 reset evidence changed");
    assertStateConsistency(record);
    if (record.preflight) {
      const request = preflightEnvelopeOf(plan, record.batch_id);
      if (canonicalOfRequests(record.preflight.requests) !== request.canonical || record.preflight.requests_sha256 !== request.sha256) throw new Error("T021 preflight requests changed");
      timestamp(record.preflight.requested_at);
      if (record.preflight.costs) {
        if (record.preflight.costs.length !== record.asset_ids.length) throw new Error("T021 requires one exact cost per request");
        const seen = new Set<string>();
        record.preflight.costs.forEach((cost, index) => {
          const asset = assetOf(plan, record.asset_ids[index]);
          const previousAt = index === 0 ? record.preflight!.requested_at : record.preflight!.costs![index - 1].provider_observed_at;
          timestamp(cost.provider_observed_at);
          if (cost.index !== asset.index || cost.request_sha256 !== costRequestSha256(plan, asset) || cost.credits !== 1 || cost.credits_decimal !== "1.00" || cost.credits_exact !== 1.5 || cost.credits_exact_decimal !== "1.50" || seen.has(cost.provider_observed_at) || Date.parse(cost.provider_observed_at) <= Date.parse(previousAt) || Date.parse(cost.provider_observed_at) - Date.parse(record.preflight!.requested_at) > FRESHNESS_MS) throw new Error("T021 invalid per-request preflight cost");
          seen.add(cost.provider_observed_at);
        });
      }
      if (record.preflight.balance) {
        timestamp(record.preflight.balance.provider_observed_at);
        const observed = decimalsT020(record.preflight.balance.credits, "journal balance");
        if (observed.decimal !== record.preflight.balance.normalized_decimal || Date.parse(record.preflight.balance.provider_observed_at) <= Date.parse(record.preflight.costs!.at(-1)!.provider_observed_at) || Date.parse(record.preflight.balance.provider_observed_at) - Date.parse(record.preflight.requested_at) > FRESHNESS_MS) throw new Error("T021 invalid preflight balance");
        if (observed.units < remainingUnits(plan, batchIndex)) throw new Error("T021 preflight balance no longer covers the remaining batches");
        if (balanceAnchor(journal, batchIndex).normalized_decimal !== record.preflight.balance.normalized_decimal) throw new Error("T021 inter-batch balance chain changed");
      }
    }
    if (record.paid_request) { if (!record.preflight?.costs || !record.preflight.balance || record.paid_request.request_sha256 !== paidEnvelopeOf(plan, record.batch_id).sha256) throw new Error("T021 paid envelope lacks exact preflight binding"); timestamp(record.paid_request.prepared_at); }
    if (record.submission) {
      const derivedComplete = record.submission.topology_valid && record.submission.jobs.length === record.asset_ids.length && record.submission.failed_count === 0;
      if (!record.paid_request || typeof record.submission.topology_valid !== "boolean" || record.submission.expected_count !== record.asset_ids.length || record.submission.submitted_count !== record.submission.jobs.length || record.submission.complete !== derivedComplete || canonicalJson(record.submission.missing_asset_ids) !== canonicalJson(record.asset_ids.filter((id) => !record.submission!.jobs.some(({ asset_id }) => asset_id === id)))) throw new Error("T021 submission binding changed");
      record.submission.jobs.forEach((job) => {
        const asset = assetOf(plan, job.asset_id);
        if (job.index !== asset.index || job.canonical_request_sha256 !== asset.canonical_request_sha256 || !record.asset_ids.includes(job.asset_id) || globalJobIds.has(job.job_id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(job.job_id) || !SUBMIT_STATUSES.includes(job.status)) throw new Error("T021 submitted job binding changed");
        globalJobIds.add(job.job_id);
      });
    }
    record.recovery_gates.forEach((gate, index) => { timestamp(gate.opened_at); if (!record.submission || gate.exact_operator_phrase_sha256 !== sha256(T021_V1_RECOVERY_OPERATOR_PHRASE) || gate.no_new_paid_submit !== true || (index > 0 && Date.parse(gate.opened_at) < Date.parse(record.recovery_gates[index - 1].opened_at))) throw new Error("T021 recovery gate evidence changed"); });
    record.job_polls.forEach((poll) => {
      timestamp(poll.observed_at);
      if (!record.submission || poll.jobs.length !== record.submission.jobs.length || new Set(poll.jobs.map(({ index }) => index)).size !== poll.jobs.length) throw new Error("T021 job poll binding changed");
      poll.jobs.forEach((job) => { if (!record.submission!.jobs.some((expectedJob) => expectedJob.index === job.index && expectedJob.job_id === job.job_id) || !WAIT_STATUSES.includes(job.status)) throw new Error("T021 job poll binding changed"); });
    });
    record.recoveries.forEach((recovery) => {
      const asset = plan.assets.find(({ id }) => id === recovery.asset_id);
      const job = record.submission?.jobs.find(({ asset_id }) => asset_id === recovery.asset_id);
      if (!asset || !job || recovery.provider_job_index !== job.index || recovery.provider_job_id !== job.job_id || recovery.source !== "JOBS_HANDOFF_STDIN" || recovery.local_relative_path !== asset.path || recovery.backup_relative_path !== asset.path || recovery.aspect_ratio !== asset.aspect_ratio || recovery.provider_native_unmodified !== true || globalRecovered.has(asset.id) || !/^[a-f0-9]{64}$/.test(recovery.sha256) || !Number.isSafeInteger(recovery.size_bytes) || recovery.size_bytes < 1 || !Number.isSafeInteger(recovery.actual_width) || recovery.actual_width < 1 || !Number.isSafeInteger(recovery.actual_height) || recovery.actual_height < 1 || !Number.isSafeInteger(recovery.aspect_error_ppm) || recovery.aspect_error_ppm < 0 || recovery.aspect_error_ppm > t021AspectTolerancePpm(asset.aspect_ratio)) throw new Error("T021 recovery binding changed");
      globalRecovered.add(asset.id);
      if (runtimeRoot) {
        const local = verifyExistingPng(resolve(runtimeRoot, T021_V1_LOCAL_ROOT), asset.path, asset.aspect_ratio, recovery.sha256, DEFAULT_MAX_PNG_BYTES, t021AspectTolerancePpm(asset.aspect_ratio));
        const backup = verifyExistingPng(resolve(runtimeRoot, T021_V1_BACKUP_ROOT), asset.path, asset.aspect_ratio, recovery.sha256, DEFAULT_MAX_PNG_BYTES, t021AspectTolerancePpm(asset.aspect_ratio));
        if (local.size !== backup.size || local.width !== backup.width || local.height !== backup.height) throw new Error("T021 local and backup differ");
      }
    });
    if (record.balance_after) {
      const chargedJobs = hasActiveTerminal(record) ? confirmedJobs(record).length : record.asset_ids.length;
      const expectedDelta = chargedJobs * T021_V1_UNIT_COST_UNITS;
      const after = decimalsT020(record.balance_after.credits, "journal balance after");
      timestamp(record.balance_after.observed_at); timestamp(record.balance_after.provider_observed_at);
      // The provider observation must sit after the pre-submit reading and no later than the
      // journal stamp, so the anchor every later batch compares against is a real reading.
      if (!record.preflight?.balance || Date.parse(record.balance_after.provider_observed_at) < Date.parse(record.preflight.balance.provider_observed_at) || Date.parse(record.balance_after.observed_at) < Date.parse(record.balance_after.provider_observed_at)) throw new Error("T021 balance-after observation chronology changed");
      if (record.balance_after.charged_job_count !== chargedJobs || record.balance_after.delta_units !== expectedDelta || record.balance_after.delta_decimal !== decimal(expectedDelta) || after.decimal !== record.balance_after.normalized_decimal || unrecoveredConfirmed(record) !== 0 || !record.preflight?.balance || decimalsT020(record.preflight.balance.credits, "journal balance before").units - after.units !== expectedDelta) throw new Error("T021 batch credit delta changed");
    }
    record.terminals.forEach((terminal) => { timestamp(terminal.observed_at); if (terminal.automatic_paid_retry !== false || terminal.paid_retry_count !== 0 || terminal.no_resubmit !== true || terminal.scope !== "BATCH" || canonicalJson(terminal.facts) !== canonicalJson(sanitizeFacts(terminal.facts))) throw new Error("T021 terminal retry policy changed"); });
    record.discharges.forEach((discharge, index) => {
      timestamp(discharge.observed_at);
      const previous = index === 0 ? 0 : record.discharges[index - 1].terminals_discharged;
      const recoveredCeiling = record.recoveries.length * T021_V1_UNIT_COST_UNITS;
      const shapeIsBad = discharge.resubmitted !== false || discharge.terminals_discharged <= previous || discharge.terminals_discharged > record.terminals.length || discharge.acknowledged_loss_units !== discharge.observed_delta_units - discharge.recovered_units || discharge.acknowledged_loss_units < 0 || discharge.acknowledged_loss_decimal !== decimal(discharge.acknowledged_loss_units) || discharge.observed_delta_units < 0 || discharge.max_exposure_units !== maxExposureUnits(record) || discharge.observed_delta_units > discharge.max_exposure_units || discharge.recovered_units < 0 || discharge.recovered_units > recoveredCeiling;
      const zeroSpendIsBad = discharge.kind === "ZERO_SPEND_RESET" && (discharge.observed_delta_units !== 0 || discharge.recovered_units !== 0 || discharge.balance_after_loss !== null || discharge.exact_operator_phrase_sha256 !== null || !record.resets.some(({ observed_at }) => observed_at === discharge.observed_at));
      // A discharge must cover at least one terminal and may only be booked against a batch
      // whose paid envelope actually escaped. The reader and the writer agree exactly: the
      // command applies the same rule, so no journal the command produces can be rejected on
      // read, and no journal the reader accepts describes a discharge the command would refuse.
      const covered = record.terminals.slice(previous, discharge.terminals_discharged);
      const coverageIsBad = covered.length === 0 || zeroSpend(record);
      const lossIsBad = discharge.kind === "LOSS_ACKNOWLEDGED" && (discharge.exact_operator_phrase_sha256 !== sha256(T021_V1_LOSS_ACKNOWLEDGMENT_PHRASE) || discharge.balance_after_loss === null || decimalsT020(discharge.balance_after_loss.credits, "discharge balance").decimal !== discharge.balance_after_loss.normalized_decimal || record.balance_after !== undefined || coverageIsBad || record.discharges.filter(({ kind }) => kind === "LOSS_ACKNOWLEDGED").length !== 1);
      if (shapeIsBad || zeroSpendIsBad || lossIsBad) throw new Error(`T021 discharge evidence changed: ${record.batch_id}`);
    });
    // A batch can never book more spend than its own exposure, however the journal was written.
    if (record.discharges.reduce((sum, discharge) => sum + discharge.observed_delta_units, 0) > maxExposureUnits(record)) throw new Error(`T021 discharged spend exceeds the batch exposure: ${record.batch_id}`);
  });
  journal.resumes.forEach((resume, index) => {
    timestamp(resume.observed_at);
    const failed = journal.batches.find(({ batch_id }) => batch_id === resume.failed_batch_id);
    if (!failed || resume.resubmitted !== false || resume.exact_operator_phrase_sha256 !== sha256(T021_V1_RESUME_OPERATOR_PHRASE) || !Number.isSafeInteger(resume.terminal_index) || resume.terminal_index < 0 || resume.terminal_index >= failed.terminals.length || journal.resumes.slice(0, index).some((other) => other.failed_batch_id === resume.failed_batch_id && other.terminal_index === resume.terminal_index)) throw new Error("T021 resume evidence changed");
    if (index > 0 && Date.parse(resume.observed_at) < Date.parse(journal.resumes[index - 1].observed_at)) throw new Error("T021 resume chronology changed");
    if (resume.disposition === "ZERO_SPEND" && !(zeroSpend(failed) || failed.resets.some((reset) => reset.from_state === "FAIL_STOP" && Date.parse(reset.observed_at) >= Date.parse(resume.observed_at)))) throw new Error("T021 resume disposition changed");
    if (resume.disposition === "DISCHARGED_LOSS" && !failed.discharges.some(({ kind, terminals_discharged }) => kind === "LOSS_ACKNOWLEDGED" && terminals_discharged === resume.terminal_index + 1)) throw new Error("T021 resume disposition changed");
    if (resume.disposition === "FULLY_RECOVERED_BALANCE_VERIFIED" && (unrecoveredConfirmed(failed) !== 0 || failed.balance_after === undefined)) throw new Error("T021 resume disposition changed");
    if (resume.disposition === "DISCHARGED_LOSS" && failed.paid_request === undefined) throw new Error("T021 resume disposition changed");
  });
  const firstUnsettled = journal.batches.findIndex((record) => !settled(journal, record));
  if (firstUnsettled >= 0 && journal.batches.slice(firstUnsettled + 1).some((record) => record.state !== "PLANNED" || record.terminals.length > 0)) throw new Error("T021 batch order changed");
  const unresolved = journal.batches.filter((record) => record.terminals.length > 0 && latestResume(journal, record) === undefined);
  const capUsed = capUsedUnits(journal);
  const losses = acknowledgedLossUnits(journal);
  const runStateIsBad =
    (journal.run_state === "ACTIVE" && (unresolved.length !== 0 || journal.fail_stop_batch_id !== null)) ||
    (journal.run_state === "FAIL_STOP" && (unresolved.length !== 1 || journal.fail_stop_batch_id !== unresolved[0].batch_id)) ||
    (journal.run_state === "COMPLETE" && (journal.fail_stop_batch_id !== null || losses !== 0 || journal.batches.some(({ state }) => state !== "COMPLETE") || globalRecovered.size !== T021_V1_ASSET_COUNT || capUsed !== T021_V1_TOTAL_CAP_UNITS)) ||
    // A discharged batch is what makes an exact 81.00/54-asset close impossible, not the
    // money: a provider that never charged the failed generations books a 0.00 discharge.
    (journal.run_state === "CLOSED_WITH_LOSSES" && (journal.fail_stop_batch_id !== null || !journal.batches.some((record) => lossDischarged(record)) || !closable(journal) || unresolved.length !== 0));
  if (runStateIsBad) throw new Error("T021 run-state evidence changed");
  if (capUsed > T021_V1_TOTAL_CAP_UNITS) throw new Error("T021 total credit cap exceeded");
}

function journalPath(root: string): string { return safeResolve(root, T021_V1_JOURNAL_PATH); }
// Nothing is persisted that a later read would reject: the writer runs the reader's own
// structural validation first, so a paid journal can never be bricked mid-run.
function writeJournal(context: T021Context, journal: T021Journal): void {
  assertRedactedJournal(journal);
  validateT021Journal(journal, context.plan, context.presentation, context.approval);
  atomicWriteJson(context.root, T021_V1_JOURNAL_PATH, journal);
}
function readJournal(context: T021Context): T021Journal {
  const bytes = readFileSync(journalPath(context.root), "utf8");
  const parsed = JSON.parse(bytes) as T021Journal;
  if (bytes !== renderT021CanonicalJson(parsed)) throw new Error("T021 journal is not canonical");
  validateT021Journal(parsed, context.plan, context.presentation, context.approval, context.root);
  return parsed;
}
function recordOf(journal: T021Journal, id: string) { const index = journal.batches.findIndex(({ batch_id }) => batch_id === id); if (index < 0) throw new Error("unknown T021 batch"); return { record: journal.batches[index], index }; }
function assertOpenForWork(journal: T021Journal, index: number): void {
  if (journal.run_state !== "ACTIVE") throw new Error("T021 run is not ACTIVE; an operator-gated resume is required");
  if (journal.batches.slice(0, index).some((record) => !settled(journal, record))) throw new Error("T021 batches must progress exactly in order");
  if (journal.batches.slice(index + 1).some(({ state }) => state !== "PLANNED")) throw new Error("T021 batches must progress exactly in order");
  if (neverReopen(journal.batches[index])) throw new Error("T021 batches whose paid envelope escaped are never reopened or resubmitted");
}
/**
 * Two independent gates guard every batch after the first, and they read different evidence
 * so a batch-1 failure stays diagnosable: model identity is read off the `model` field, and
 * aspect is read off the delivered pixel dimensions.
 *
 * The model gate is clearable — a batch the operator explicitly discharged never produced a
 * model observation, and the discharge plus resume phrases are the recorded way past it.
 * The aspect gate is NOT clearable: an out-of-tolerance delivery was billed and means the
 * provider's geometry contract changed, so it needs a new disclosure and a new approval.
 */
function assertCanary(journal: T021Journal, index: number): void {
  const drift = t021ContractDriftBatches(journal);
  if (drift.length > 0) throw new Error(`T021 batch ${journal.batches[index].batch_id} is permanently blocked by provider-contract drift (${drift.map(({ batch_id, code }) => `${batch_id}:${code}`).join(", ")}); no operator phrase in this approval reopens it and a new disclosure and approval are required`);
  if (index === 0) return;
  // No drift on record, so the only remaining question is whether the previous batch actually
  // proved the model. A batch the operator discharged never produced a model observation at
  // all (an ambiguous submission enumerates nothing), and that discharge is the recorded,
  // phrase-gated way past it.
  const previous = journal.batches[index - 1];
  if (t021BatchModelVerified(previous) || lossDischarged(previous)) return;
  throw new Error(`T021 batch ${journal.batches[index].batch_id} is blocked until batch ${previous.batch_id} reports ${T021_V1_EXPECTED_MODEL} on every completed job`);
}
function loadJson(root: string, relativePath: string): unknown { const absolute = safeResolve(root, relativePath); const info = lstatSync(absolute); if (info.isSymbolicLink() || !info.isFile()) throw new Error("T021 provider input must be a regular file"); return JSON.parse(readFileSync(absolute, "utf8")); }
function persistFail(context: T021Context, journal: T021Journal, record: T021BatchRecord, code: T021TerminalCode, at: string, facts: Record<string, unknown>): never {
  // Terminals are append-only forensics; the first entry stays authoritative forever.
  record.terminals.push({ code, observed_at: timestamp(at), facts: sanitizeFacts(facts), automatic_paid_retry: false, paid_retry_count: 0, no_resubmit: true, scope: "BATCH" });
  if (record.state !== "FAIL_STOP") transition(record, "FAIL_STOP", at);
  journal.run_state = "FAIL_STOP";
  journal.fail_stop_batch_id = record.batch_id;
  writeJournal(context, journal);
  throw new Error(`${code}: T021 batch fail-stop (${record.batch_id}); no paid retry or resubmit`);
}
function loadProviderJsonOrFail(context: T021Context, relativePath: string, journal: T021Journal, record: T021BatchRecord, code: T021TerminalCode, at: string, stage: string): unknown {
  try { return loadJson(context.root, relativePath); } catch { persistFail(context, journal, record, code, at, { stage, reason: "INVALID_OR_UNSAFE_JSON_INPUT" }); }
}
function parseBalanceFile(raw: unknown): { credits: number; units: number; decimal: string; provider_observed_at: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("T021 balance observation is invalid");
  exactKeys(raw as Record<string, unknown>, ["credits", "provider_observed_at"]);
  const value = raw as { credits: unknown; provider_observed_at: unknown };
  if (typeof value.provider_observed_at !== "string") throw new Error("T021 balance observation is invalid");
  const parsed = decimalsT020(value.credits, "balance");
  return { credits: parsed.value, units: parsed.units, decimal: parsed.decimal, provider_observed_at: timestamp(value.provider_observed_at) };
}

/* ----------------------------------------------------------------- ingest */

function ingest(context: T021Context, journal: T021Journal, record: T021BatchRecord, job: T021ProviderJob, bytes: Buffer, at: string): void {
  const asset = assetOf(context.plan, job.asset_id);
  const aspect = asset.aspect_ratio;
  // Tolerance is per aspect: 3:4 stays at 5000, 16:9 is 12500 to clear the provider's 32-px
  // dimension grid, whose worst case at ~1MP is about 11364 ppm.
  const tolerance = t021AspectTolerancePpm(aspect);
  const dimensions = pngHeaderDimensions(bytes);
  let local: VerifiedFile;
  try {
    local = atomicWriteVerifiedPng(resolve(context.root, T021_V1_LOCAL_ROOT), asset.path, bytes, aspect, DEFAULT_MAX_PNG_BYTES, tolerance);
    const backup = backupVerifiedFile(resolve(context.root, T021_V1_LOCAL_ROOT), resolve(context.root, T021_V1_BACKUP_ROOT), asset.path, local.sha256, aspect, DEFAULT_MAX_PNG_BYTES, tolerance);
    if (local.sha256 !== backup.sha256 || local.size !== backup.size) throw new Error("EXISTING_FILE_CONFLICT");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Everything reaching this point concerns a job the provider already billed, so nothing
    // here may be coded as the no-charge, supersedable RECOVERY_FAILED. The three classes are
    // distinguished because they mean different things about who is at fault and what a
    // re-poll could achieve.
    const conflict = LOCAL_STORE_CONFLICT_MESSAGES.includes(message);
    const unusable = PROVIDER_PAYLOAD_MESSAGES.includes(message);
    const mismatch = message === "ASPECT_MISMATCH";
    const reason = mismatch ? "PNG_DIMENSION_MISMATCH" : conflict ? "FILE_CONFLICT" : unusable ? "PROVIDER_PAYLOAD_UNUSABLE" : "PNG_OR_ATOMIC_STORE_FAILED";
    const code: T021TerminalCode = mismatch ? "ASPECT_MISMATCH" : conflict ? "FILE_CONFLICT" : "PAYLOAD_UNUSABLE";
    persistFail(context, journal, record, code, at, { asset_id: job.asset_id, reason, store_error: message === "" ? "UNKNOWN" : message, actual_width: dimensions?.width ?? null, actual_height: dimensions?.height ?? null, expected_aspect_ratio: aspect, aspect_tolerance_ppm: tolerance });
  }
  record.recoveries.push({ asset_id: job.asset_id, provider_job_index: job.index, provider_job_id: job.job_id, source: "JOBS_HANDOFF_STDIN", observed_at: at, local_relative_path: asset.path, backup_relative_path: asset.path, aspect_ratio: aspect, sha256: local.sha256, size_bytes: local.size, actual_width: local.width, actual_height: local.height, aspect_error_ppm: local.aspect_error_ppm, provider_native_unmodified: true });
  if (record.state === "RECOVERY_OPEN") transition(record, "RECOVERING", at);
  if (record.state === "RECOVERING" && unrecoveredConfirmed(record) === 0) transition(record, "RECOVERED", at);
  // Durable per-asset journal write: a crash after this point never loses a paid asset.
  writeJournal(context, journal);
}

/* --------------------------------------------------------------- commands */

export function runT021OpsInternal(args: readonly string[], root: string, plan: T021Plan, presentation: T021Presentation, approval: T021Approval, now?: () => Date): Record<string, unknown> {
  const context: T021Context = { root, plan, presentation, approval };
  const command = args[0];
  const lock = acquireT021Lock(root);
  try {
    if (command === "init") {
      const at = timestamp(option(args, "--observed-at"));
      const balanceRelative = operatorPath(args, "--balance-file");
      if (existsSync(journalPath(root))) return { command, run_state: readJournal(context).run_state, idempotent: true };
      const anchor = parseBalanceFile(loadJson(root, balanceRelative));
      assertWallClock(anchor.provider_observed_at, now, undefined, FRESHNESS_MS);
      assertNonOverlappingRoots(resolve(root, T021_V1_LOCAL_ROOT), resolve(root, T021_V1_BACKUP_ROOT));
      if (anchor.units < T021_V1_TOTAL_CAP_UNITS) throw new Error(`T021 initial balance does not cover the ${decimal(T021_V1_TOTAL_CAP_UNITS)} cap`);
      const initial = buildInitialT021Journal(plan, presentation, approval, { credits: anchor.credits, normalized_decimal: anchor.decimal, provider_observed_at: anchor.provider_observed_at });
      writeJournal(context, initial);
      return { command, run_state: "ACTIVE", observed_at: at, batches: plan.batches.length, paid_assets: T021_V1_ASSET_COUNT, initial_balance_decimal: anchor.decimal, total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS, paid_retry_count: 0 };
    }
    const journal = readJournal(context);

    if (command === "preflight-request") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id);
      assertOpenForWork(journal, index); assertCanary(journal, index); assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "PLANNED") throw new Error("T021 batch is not PLANNED");
      const request = preflightEnvelopeOf(plan, id);
      // Deep copy: the journal must never alias the memoised plan index.
      record.preflight = { requests: copyPreflightRequests(request.requests), requests_sha256: request.sha256, requested_at: at };
      transition(record, "PREFLIGHT_REQUESTED", at); writeJournal(context, journal);
      return preflightEnvelope(plan, id) as unknown as Record<string, unknown>;
    }

    if (command === "preflight-result") {
      const id = option(args, "--batch"); const { record, index } = recordOf(journal, id);
      const costRelative = operatorPath(args, "--cost-file"); const balanceRelative = operatorPath(args, "--balance-file");
      assertOpenForWork(journal, index); assertCanary(journal, index);
      if (record.state !== "PREFLIGHT_REQUESTED" || !record.preflight) throw new Error("T021 durable preflight request required");
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
      const costs: NonNullable<T021BatchRecord["preflight"]>["costs"] = [];
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
        try { display = decimalsT020((value.cost as { credits?: unknown }).credits, "cost credits"); exact = decimalsT020((value.cost as { credits_exact?: unknown }).credits_exact, "cost credits_exact"); } catch { persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { stage: "PER_REQUEST_COST_NORMALIZATION", item_index: itemIndex }); }
        // Billing is credits_exact only; the display value is recorded but never used for cap math.
        if (display.decimal !== "1.00" || exact.units !== T021_V1_UNIT_COST_UNITS) persistFail(context, journal, record, "PRICE_CHANGED", fallbackAt, { item_index: itemIndex, observed_display_decimal: display.decimal, observed_exact_decimal: exact.decimal });
        costs.push({ index: asset.index, request_sha256: expectedRequestSha, credits: 1, credits_decimal: "1.00", credits_exact: 1.5, credits_exact_decimal: "1.50", provider_observed_at: costAt });
      });
      const balanceAtRaw = (balanceRaw as { provider_observed_at?: unknown }).provider_observed_at;
      const balanceAt = typeof balanceAtRaw === "string" ? balanceAtRaw : fallbackAt;
      try { assertWallClock(balanceAt, now, costs.at(-1)!.provider_observed_at, FRESHNESS_MS); } catch { persistFail(context, journal, record, "BALANCE_CHANGED", fallbackAt, { stage: "OBSERVATION_TIME" }); }
      if (Date.parse(balanceAt) <= Date.parse(costs.at(-1)!.provider_observed_at) || Date.parse(balanceAt) - Date.parse(record.preflight.requested_at) > FRESHNESS_MS) persistFail(context, journal, record, "BALANCE_CHANGED", fallbackAt, { stage: "OBSERVATION_ORDER" });
      let balance;
      try { balance = decimalsT020((balanceRaw as { credits?: unknown }).credits, "balance"); } catch { persistFail(context, journal, record, "BALANCE_CHANGED", balanceAt, { stage: "NORMALIZATION" }); }
      const anchor = balanceAnchor(journal, index);
      const remaining = remainingUnits(plan, index);
      if (balance.units < remaining || anchor.normalized_decimal !== balance.decimal) persistFail(context, journal, record, "BALANCE_CHANGED", balanceAt, { stage: "BALANCE_CHAIN", expected_anchor_decimal: anchor.normalized_decimal, observed_decimal: balance.decimal, minimum_remaining_decimal: decimal(remaining) });
      record.preflight.costs = costs;
      record.preflight.balance = { credits: balance.value, normalized_decimal: balance.decimal, provider_observed_at: balanceAt };
      transition(record, "PREFLIGHT_VERIFIED", balanceAt); writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, verified_costs: costs.length, balance_decimal: balance.decimal, minimum_remaining_decimal: decimal(remaining) };
    }

    if (command === "reset") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id);
      assertOpenForWork(journal, index); assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (!["PREFLIGHT_REQUESTED", "PREFLIGHT_VERIFIED", "FAIL_STOP"].includes(record.state)) throw new Error("T021 reset is only legal from PREFLIGHT_REQUESTED, PREFLIGHT_VERIFIED, or a zero-spend FAIL_STOP");
      if (!zeroSpend(record) || record.recoveries.length > 0 || record.job_polls.length > 0) throw new Error("T021 reset is only legal for zero-spend states");
      const from = record.state as "PREFLIGHT_REQUESTED" | "PREFLIGHT_VERIFIED" | "FAIL_STOP";
      if (from === "FAIL_STOP" && !hasActiveTerminal(record)) throw new Error("T021 reset from FAIL_STOP requires an undischarged terminal");
      if (hasActiveTerminal(record)) record.discharges.push({ kind: "ZERO_SPEND_RESET", observed_at: at, terminals_discharged: record.terminals.length, exact_operator_phrase_sha256: null, max_exposure_units: maxExposureUnits(record), recovered_units: 0, observed_delta_units: 0, acknowledged_loss_units: 0, acknowledged_loss_decimal: decimal(0), balance_after_loss: null, resubmitted: false });
      record.resets.push({ from_state: from, observed_at: at, zero_spend: true });
      delete record.preflight;
      // Terminals stay in history; the batch simply becomes runnable again at zero cost.
      transition(record, "PLANNED", at); writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, resets: record.resets.length, from_state: from, zero_spend: true, terminals_preserved: record.terminals.length, paid_retry_count: 0 };
    }

    if (command === "prepare") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record, index } = recordOf(journal, id);
      assertOpenForWork(journal, index); assertCanary(journal, index);
      assertWallClock(at, now, record.preflight?.balance?.provider_observed_at, FRESHNESS_MS);
      if (record.state !== "PREFLIGHT_VERIFIED" || !record.preflight?.costs || record.preflight.costs.length !== record.asset_ids.length || !record.preflight.balance || Date.parse(at) < Date.parse(record.preflight.balance.provider_observed_at) || Date.parse(at) - Date.parse(record.preflight.balance.provider_observed_at) > FRESHNESS_MS) throw new Error("fresh per-request T021 preflight required");
      const envelope = paidEnvelope(plan, id);
      record.paid_request = { request_sha256: paidEnvelopeOf(plan, id).sha256, prepared_at: at };
      // Durable SUBMITTING evidence must exist before the operator can see the envelope.
      transition(record, "SUBMITTING", at); writeJournal(context, journal);
      return envelope as unknown as Record<string, unknown>;
    }

    if (command === "ambiguous") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const reason = option(args, "--reason"); const { record } = recordOf(journal, id);
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "SUBMITTING" || !["TIMEOUT", "TRANSPORT_ERROR", "MISSING_DEFINITE_RESULT"].includes(reason)) throw new Error("invalid T021 ambiguous transition");
      persistFail(context, journal, record, "AMBIGUOUS_SUBMISSION", at, { reason, outcome: "UNKNOWN", max_exposure_units: maxExposureUnits(record), max_exposure_decimal: decimal(maxExposureUnits(record)), jobs_enumerable: false, discharge_required: true, paid_retry: 0 });
    }

    if (command === "response") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record } = recordOf(journal, id);
      const fileRelative = operatorPath(args, "--file");
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      if (record.state !== "SUBMITTING") throw new Error("durable T021 SUBMITTING state required");
      const raw = loadProviderJsonOrFail(context, fileRelative, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, "SUBMISSION_JSON");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) persistFail(context, journal, record, "PARTIAL_OR_MISMATCHED_BATCH_RESPONSE", at, { response_shape: "INVALID" });
      const response = raw as Record<string, unknown>;
      try { exactKeys(response, ["submitted_count", "failed_count", "jobs"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "SUBMISSION_RESPONSE" }); }
      const validCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
      const jobsRaw = Array.isArray(response.jobs) ? response.jobs : [];
      const jobs: T021ProviderJob[] = []; const signals: Array<{ index: number; fields: string[] }> = [];
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
      if (phrase === T021_V1_RECOVERY_OPERATOR_PHRASE && !lossDischarged(record) && ["RECOVERY_OPEN", "RECOVERING"].includes(record.state) && record.recovery_gates.length > 0 && record.submission?.jobs.length) return { command, batch_id: id, state: record.state, jobs: record.submission.jobs.length, new_paid_submit: false, idempotent: true, original_terminal_preserved: record.terminals.length > 0 ? record.terminals[0].code : null };
      if (lossDischarged(record)) throw new Error("T021 a loss-discharged batch is never reopened");
      if (phrase !== T021_V1_RECOVERY_OPERATOR_PHRASE || !["SUBMITTED", "FAIL_STOP"].includes(record.state) || !record.submission || record.submission.jobs.length === 0) throw new Error("operator-gated T021 recovery requires the exact phrase and durable job IDs");
      record.recovery_gates.push({ opened_at: at, exact_operator_phrase_sha256: sha256(phrase), no_new_paid_submit: true });
      transition(record, "RECOVERY_OPEN", at); writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, jobs: record.submission.jobs.length, gates: record.recovery_gates.length, new_paid_submit: false, original_terminal_preserved: record.terminals.length > 0 ? record.terminals[0].code : null, operator_phrase_is_agent_satisfiable: true };
    }

    if (command === "jobs-request") {
      const { record } = recordOf(journal, option(args, "--batch"));
      if (!["RECOVERY_OPEN", "RECOVERING"].includes(record.state) || !record.submission || record.recovery_gates.length === 0) throw new Error("T021 recovery-open gate is required");
      return { jobs: record.submission.jobs.map(({ index, job_id }) => ({ index, job_id })), new_paid_submit: false, paid_retry_count: 0 };
    }

    if (command === "balance-after") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const { record } = recordOf(journal, id);
      const fileRelative = operatorPath(args, "--file");
      if (record.balance_after) throw new Error("T021 balance-after is already recorded for this batch");
      if (record.state !== "RECOVERED" || !record.preflight?.balance) throw new Error("T021 complete stdin recovery is required before balance-after");
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      const chargedJobs = hasActiveTerminal(record) ? confirmedJobs(record).length : record.asset_ids.length;
      if (unrecoveredConfirmed(record) !== 0 || record.recoveries.length !== chargedJobs) throw new Error("T021 balance-after requires every confirmed job recovered");
      const raw = loadProviderJsonOrFail(context, fileRelative, journal, record, "BALANCE_CHANGED", at, "BALANCE_AFTER_JSON");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER" });
      // Same declared balance contract as every other reading: two keys exactly, a real
      // provider timestamp, 10-minute freshness, strictly after the pre-submit observation.
      // This value anchors every later batch's preflight and any later loss math, so it may
      // not be a bare, undated number.
      try { exactKeys(raw as Record<string, unknown>, ["credits", "provider_observed_at"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "BALANCE_AFTER" }); }
      let observation; try { observation = parseBalanceFile(raw); } catch { persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER_NORMALIZATION" }); }
      try { assertWallClock(observation.provider_observed_at, now, record.preflight.balance.provider_observed_at, FRESHNESS_MS); } catch { persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER_OBSERVATION_TIME" }); }
      if (Date.parse(observation.provider_observed_at) <= Date.parse(record.preflight.balance.provider_observed_at) || Date.parse(at) < Date.parse(observation.provider_observed_at)) persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER_OBSERVATION_ORDER" });
      const after = { value: observation.credits, units: observation.units, decimal: observation.decimal };
      const before = decimalsT020(record.preflight.balance.credits, "balance before");
      const delta = before.units - after.units;
      const expected = chargedJobs * T021_V1_UNIT_COST_UNITS;
      // The observation itself is persisted in the terminal facts so a later
      // acknowledge-loss can reconcile against what the provider actually reported.
      if (delta !== expected) persistFail(context, journal, record, "BALANCE_CHANGED", at, { stage: "BALANCE_AFTER_DELTA", expected_delta_decimal: decimal(expected), observed_delta_units: delta, observed_delta_decimal: decimal(delta), observed_balance_decimal: after.decimal, observed_balance_credits: after.value, provider_observed_at: at });
      record.balance_after = { credits: after.value, normalized_decimal: after.decimal, observed_at: at, provider_observed_at: observation.provider_observed_at, delta_decimal: decimal(delta), delta_units: delta, charged_job_count: chargedJobs };
      // COMPLETE is a statement about facts, not about history. A batch is complete when every
      // planned asset is on disk in both roots and the provider charged exactly for them; the
      // terminals that happened along the way stay in the journal as forensics either way.
      //
      // Gating on "no active terminal" meant any non-supersedable terminal on an otherwise
      // perfect batch — a documented optional `warning` key raising PROVIDER_RESPONSE_SIGNAL is
      // enough — barred COMPLETE forever, and recording balance-after then foreclosed discharge
      // too. Delivery and money are the only things COMPLETE actually claims.
      const fullyDelivered = record.recoveries.length === record.asset_ids.length && delta === record.asset_ids.length * T021_V1_UNIT_COST_UNITS;
      if (fullyDelivered) {
        transition(record, "COMPLETE", at);
        // A fail-stop still needs its operator-gated resume: that is what clears
        // fail_stop_batch_id, and a run may not close itself out from under one.
        if (journal.run_state === "ACTIVE" && journal.fail_stop_batch_id === null && journal.batches.every(({ state }) => state === "COMPLETE")) journal.run_state = "COMPLETE";
      }
      writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, run_state: journal.run_state, delta_units: delta, delta_decimal: decimal(delta), charged_job_count: chargedJobs, fully_delivered: fullyDelivered, terminals_preserved: record.terminals.length };
    }

    if (command === "acknowledge-loss") {
      const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at")); const phrase = option(args, "--operator-phrase");
      const balanceRelative = operatorPath(args, "--balance-file");
      if (phrase !== T021_V1_LOSS_ACKNOWLEDGMENT_PHRASE) throw new Error("T021 loss acknowledgment requires the exact operator phrase");
      const { record, index } = recordOf(journal, id);
      // One loss discharge per batch, checked before anything else so a re-opened or
      // re-polled batch can never book the same spend twice.
      if (lossDischarged(record)) throw new Error("T021 this batch already has an acknowledged loss; a batch is discharged exactly once");
      const active = t021ActiveTerminals(record);
      if (active.length === 0) throw new Error("T021 loss acknowledgment requires an undischarged terminal");
      if (zeroSpend(record)) throw new Error("T021 zero-spend batches are reset and re-run, never discharged as a loss");
      if (record.balance_after) throw new Error("T021 a balance-verified batch has no unexplained loss to discharge");
      // Deliberately NOT gated on the terminal code. Every terminal raised after `prepare`
      // sits on top of real spend, so refusing to discharge one because of its name was an
      // absorbing state: the money could not be booked and the run could not be resumed.
      if (!t021Dischargeable(record)) throw new Error("T021 loss acknowledgment requires a batch whose paid envelope escaped and that still has an undischarged terminal");
      if (!record.preflight?.balance) throw new Error("T021 loss acknowledgment requires the durable pre-submit balance");
      assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
      const observation = parseBalanceFile(loadJson(root, balanceRelative));
      assertWallClock(observation.provider_observed_at, now, record.preflight.balance.provider_observed_at);
      // Measured against the live spend anchor, not the pre-submit balance, so a repeat
      // measurement of an already-discharged batch can only ever yield a zero delta.
      const before = decimalsT020(spendAnchor(journal, index).credits, "balance before");
      const observedDelta = before.units - observation.units;
      const exposure = maxExposureUnits(record);
      if (observedDelta < 0 || observedDelta > exposure) throw new Error(`T021 observed loss delta ${decimal(observedDelta)} is outside the 0..${decimal(exposure)} exposure of this batch`);
      const recoveredUnits = Math.min(record.recoveries.length * T021_V1_UNIT_COST_UNITS, observedDelta);
      const loss = observedDelta - recoveredUnits;
      record.discharges.push({ kind: "LOSS_ACKNOWLEDGED", observed_at: at, terminals_discharged: record.terminals.length, exact_operator_phrase_sha256: sha256(phrase), max_exposure_units: exposure, recovered_units: recoveredUnits, observed_delta_units: observedDelta, acknowledged_loss_units: loss, acknowledged_loss_decimal: decimal(loss), balance_after_loss: { credits: observation.credits, normalized_decimal: observation.decimal, provider_observed_at: observation.provider_observed_at }, resubmitted: false });
      writeJournal(context, journal);
      return { command, batch_id: id, state: record.state, run_state: journal.run_state, terminal_code: active.at(-1)!.code, observed_delta_decimal: decimal(observedDelta), recovered_decimal: decimal(recoveredUnits), acknowledged_loss_decimal: decimal(loss), new_balance_anchor_decimal: observation.decimal, cap_used_decimal: decimal(capUsedUnits(journal)), resubmitted: false, regenerated: false };
    }

    if (command === "resume") {
      const at = timestamp(option(args, "--observed-at")); const phrase = option(args, "--operator-phrase");
      if (phrase !== T021_V1_RESUME_OPERATOR_PHRASE) throw new Error("T021 resume requires the exact operator phrase");
      if (journal.run_state !== "FAIL_STOP" || journal.fail_stop_batch_id === null) throw new Error("T021 resume requires a batch-scoped FAIL_STOP");
      if (journal.paid_retry_count !== 0) throw new Error("T021 resume requires paid_retry_count 0");
      const { record: failed } = recordOf(journal, journal.fail_stop_batch_id);
      if (journal.batches.some((record) => !lossDischarged(record) && unrecoveredConfirmed(record) !== 0)) throw new Error("T021 resume is refused while any confirmed job is unrecovered and undischarged");
      const disposition: T021ResumeDisposition | null =
        zeroSpend(failed) ? "ZERO_SPEND"
          : failed.discharges.some(({ kind, terminals_discharged }) => kind === "LOSS_ACKNOWLEDGED" && terminals_discharged === failed.terminals.length) ? "DISCHARGED_LOSS"
            : (unrecoveredConfirmed(failed) === 0 && failed.balance_after !== undefined) ? "FULLY_RECOVERED_BALANCE_VERIFIED" : null;
      if (disposition === null) throw new Error("T021 resume requires the failed batch to be zero-spend, fully recovered with balance verified, or loss-acknowledged");
      assertWallClock(at, now, journal.resumes.at(-1)?.observed_at);
      journal.resumes.push({ observed_at: at, failed_batch_id: failed.batch_id, terminal_index: failed.terminals.length - 1, disposition, exact_operator_phrase_sha256: sha256(phrase), resubmitted: false });
      journal.run_state = "ACTIVE";
      journal.fail_stop_batch_id = null;
      writeJournal(context, journal);
      return { command, run_state: journal.run_state, resumed_batch_id: failed.batch_id, disposition, resubmitted: false, rerunnable: disposition === "ZERO_SPEND", paid_retry_count: 0, operator_phrase_is_agent_satisfiable: true };
    }

    if (command === "status") return statusT021(journal);
    if (command === "audit") return auditT021(context, journal, option(args, "--observed-at"));
    throw new Error("usage: T021 production <init|preflight-request|preflight-result|reset|prepare|response|ambiguous|recovery-open|jobs-request|jobs-handoff|balance-after|acknowledge-loss|resume|status|audit>");
  } finally { lock.release(); }
}

/* ----------------------------------------------------------------- status */

export function statusT021(journal: T021Journal): Record<string, unknown> {
  const capUsed = capUsedUnits(journal);
  const losses = acknowledgedLossUnits(journal);
  const recovered = journal.batches.reduce((sum, record) => sum + record.recoveries.length, 0);
  const unaccounted = journal.batches.reduce((sum, record) => sum + (hasActiveTerminal(record) && !zeroSpend(record) ? Math.max(0, maxExposureUnits(record) - record.recoveries.length * T021_V1_UNIT_COST_UNITS) : 0), 0);
  // Reachability is read off the real gates, never assumed: every batch must still be able to
  // deliver all of its assets, no loss may already be booked, the canary must still be
  // passable, and any open fail-stop must be clearable without acknowledging a loss.
  const canary = journal.batches.find(({ batch_id }) => batch_id === T021_V1_CANARY_BATCH_ID);
  const failed = journal.fail_stop_batch_id === null ? undefined : journal.batches.find(({ batch_id }) => batch_id === journal.fail_stop_batch_id);
  const canaryReachable = t021CanaryVerified(journal) || (canary !== undefined && t021BatchCanDeliverAllAssets(canary));
  const failStopClearableWithoutLoss = failed === undefined || zeroSpend(failed) || (unrecoveredConfirmed(failed) === 0 && failed.balance_after !== undefined);
  // Contract drift is unclearable under this approval, so it kills reachability outright.
  const drift = t021ContractDriftBatches(journal);
  const reachable = journal.batches.every((record) => t021BatchCanDeliverAllAssets(record)) && journal.run_state !== "CLOSED_WITH_LOSSES" && losses === 0 && canaryReachable && failStopClearableWithoutLoss && drift.length === 0;
  return {
    command: "status", run_state: journal.run_state, fail_stop_batch_id: journal.fail_stop_batch_id,
    batches: journal.batches.map((record) => ({
      batch_id: record.batch_id, aspect_ratio: record.aspect_ratio, state: record.state, recovered: record.recoveries.length,
      model_verified: t021BatchModelVerified(record),
      terminal_code: record.terminals.length > 0 ? record.terminals[0].code : null, active_terminal_code: t021ActiveTerminals(record).at(-1)?.code ?? null,
      disposition: record.state === "COMPLETE" ? "COMPLETE" : unstarted(record) ? "UNSTARTED" : latestResume(journal, record)?.disposition ?? (hasActiveTerminal(record) ? "UNRESOLVED_FAIL_STOP" : "IN_PROGRESS"),
      // Reported from the predicate the command actually applies, so status can never tell an
      // operator that discharge is unavailable when acknowledge-loss would have succeeded.
      discharge_possible: zeroSpend(record) && hasActiveTerminal(record) ? "ZERO_SPEND_RESET" : t021Dischargeable(record) ? "LOSS_ACKNOWLEDGMENT" : "NONE",
      rerunnable: !neverReopen(record), can_deliver_all_assets: t021BatchCanDeliverAllAssets(record),
      acknowledged_loss_decimal: decimal(record.discharges.reduce((sum, discharge) => sum + discharge.acknowledged_loss_units, 0)),
    })),
    recovered_assets: recovered, remaining_assets: T021_V1_ASSET_COUNT - recovered,
    total_delta_units: capUsed, total_delta_decimal: decimal(capUsed), acknowledged_loss_units: losses, acknowledged_loss_decimal: decimal(losses),
    unaccounted_max_exposure_units: unaccounted, unaccounted_max_exposure_decimal: decimal(unaccounted),
    total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS, total_credit_cap_decimal: decimal(T021_V1_TOTAL_CAP_UNITS),
    paid_retry_count: 0, resumes: journal.resumes.length, model_canary_verified: t021CanaryVerified(journal),
    model_verified_batches: journal.batches.filter((record) => t021BatchModelVerified(record)).length,
    contract_drift: drift, contract_drift_blocks_all_later_batches: drift.length > 0,
    full_run_completion_reachable: reachable,
  };
}

/* ------------------------------------------------------------ jobs-handoff */

export async function runT021JobsHandoffInternal(args: readonly string[], stdinJson: string, root: string, plan: T021Plan, presentation: T021Presentation, approval: T021Approval, dependencies: T021Dependencies = defaultDependencies, now?: () => Date): Promise<Record<string, unknown>> {
  if (Buffer.byteLength(stdinJson) > MAX_STDIN_BYTES) throw new Error("T021 jobs-handoff stdin too large");
  const context: T021Context = { root, plan, presentation, approval };
  const id = option(args, "--batch"); const at = timestamp(option(args, "--observed-at"));
  const lock = acquireT021Lock(root);
  try {
    const journal = readJournal(context);
    const { record } = recordOf(journal, id);
    if (!["RECOVERY_OPEN", "RECOVERING"].includes(record.state) || !record.submission) throw new Error("T021 recovery-open gate is required");
    assertWallClock(at, now, record.transitions.at(-1)?.observed_at);
    let value: unknown;
    try { value = JSON.parse(stdinJson) as unknown; } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_JSON" }); }
    if (!value || typeof value !== "object" || Array.isArray(value)) persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT" });
    const response = value as Record<string, unknown>;
    try { exactKeys(response, ["all_terminal", "jobs", "summary"], ["all_terminal", "jobs", "summary", "poll_after_seconds", "timed_out", "aborted"]); } catch { persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT" }); }
    if (typeof response.all_terminal !== "boolean" || !Array.isArray(response.jobs) || !response.summary || typeof response.summary !== "object" || Array.isArray(response.summary) || ("timed_out" in response && typeof response.timed_out !== "boolean") || ("aborted" in response && typeof response.aborted !== "boolean") || ("poll_after_seconds" in response && (typeof response.poll_after_seconds !== "number" || !Number.isFinite(response.poll_after_seconds) || response.poll_after_seconds < 0))) persistFail(context, journal, record, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_TYPES" });
    if (response.timed_out === true || response.aborted === true) persistFail(context, journal, record, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT_INTERRUPTED", timed_out: response.timed_out === true, aborted: response.aborted === true });
    const transient = new Map<string, string>();
    const redacted: T021BatchRecord["job_polls"][number]["jobs"] = [];
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
      // The live provider decorates non-completed jobs with `model` (and may carry a stale
      // `result_url`). Both are tolerated there and type-checked when present; only a
      // completed job is required to carry them, and only a completed job is ever downloaded.
      const hasModel = "model" in job;
      const hasUrl = "result_url" in job;
      const model = typeof job.model === "string" ? job.model : null;
      const url = typeof job.result_url === "string" ? job.result_url : null;
      const completed = status === "completed";
      const hasRetryable = "retryable" in job;
      if ((hasModel && model === null) || (hasUrl && url === null) || (completed && (model === null || url === null)) || (status === "lookup_failed") !== hasRetryable || (hasRetryable && typeof job.retryable !== "boolean")) topology = false;
      if (completed && url !== null) transient.set(expected.asset_id, url);
      redacted.push({ index: expected.index, job_id: expected.job_id, status, model, download_available: completed && url !== null, lookup_retryable: hasRetryable && typeof job.retryable === "boolean" ? job.retryable : null });
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
    const drift = redacted.find(({ status, model }) => status === "completed" && model !== T021_V1_EXPECTED_MODEL);
    if (drift) persistFail(context, journal, record, "MODEL_DRIFT", at, { batch_canary: id === T021_V1_CANARY_BATCH_ID, index: drift.index, expected_model: T021_V1_EXPECTED_MODEL, observed_model: drift.model, next_batch_blocked_on_model_drift: id === T021_V1_CANARY_BATCH_ID, spend_not_recovered: true });
    const generationFailure = redacted.find(({ status }) => status !== "completed");
    writeJournal(context, journal);
    // Every good completed asset is downloaded and journalled before any fail-stop.
    for (const job of record.submission.jobs) {
      if (record.recoveries.some(({ asset_id }) => asset_id === job.asset_id)) continue;
      const url = transient.get(job.asset_id);
      if (!url) { if (generationFailure) continue; persistFail(context, journal, record, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "MISSING_RESULT_URL" }); }
      let bytes: Buffer;
      try { bytes = await downloadT021(url!, dependencies); } catch { persistFail(context, journal, record, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "SECURE_DOWNLOAD_FAILED" }); }
      ingest(context, journal, record, job, bytes, at);
    }
    if (generationFailure) persistFail(context, journal, record, "GENERATION_FAILED", at, { index: generationFailure.index, status: generationFailure.status, good_assets_recovered_first: record.recoveries.length, unrecoverable_confirmed_jobs: unrecoveredConfirmed(record), discharge_required: true });
    writeJournal(context, journal);
    return { command: "jobs-handoff", batch_id: id, state: record.state, recovered: record.recoveries.length, new_paid_submit: false, paid_retry_count: 0 };
  } finally { lock.release(); }
}

/* ------------------------------------------------------------------ audit */

function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function writeContactNoClobber(root: string, path: string, bytes: string): void { const target = safeResolve(root, path, true); if (existsSync(target)) { if (readFileSync(target, "utf8") !== bytes) throw new Error("T021 contact no-clobber conflict"); return; } writeFileSync(target, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 }); }
export function writeT021ContactSegments(root: string, plan: T021Plan, recoveredIds: ReadonlySet<string>): Array<{ segment: string; path: string; aspect_ratio: string; image_count: number; sha256: string }> {
  const groups = plan.batches.map((batch) => ({ label: batch.id, aspect_ratio: batch.aspect_ratio, assets: batch.asset_ids.filter((assetId) => recoveredIds.has(assetId)).map((assetId) => { const asset = assetOf(plan, assetId); return { id: asset.id, path: asset.path }; }) }));
  const results = groups.map((group, index) => {
    const cards = group.assets.map((asset) => `<figure><img loading="lazy" src="../../../../${escapeHtml(T021_V1_LOCAL_ROOT)}/${escapeHtml(asset.path)}" alt="${escapeHtml(asset.id)}"><figcaption>${escapeHtml(asset.id)}</figcaption></figure>`).join("\n");
    const path = `${T021_V1_CONTACT_SEGMENT_ROOT}/segment-${String(index + 1).padStart(3, "0")}.html`;
    const bytes = `<!doctype html><meta charset="utf-8"><title>T021 ${escapeHtml(group.label)} (${escapeHtml(group.aspect_ratio)})</title><main>${cards}</main>\n`;
    if (group.assets.length > 12) throw new Error("T021 contact segment exceeds 12 images");
    writeContactNoClobber(root, path, bytes);
    return { segment: group.label, path, aspect_ratio: group.aspect_ratio, image_count: group.assets.length, sha256: sha256(bytes) };
  });
  // Carry-over fix from T020 v2, whose link template hardcoded another version's directory
  // while segments were written to its own — an index of broken links that could not be
  // corrected afterwards without invalidating a completed run. Both sides derive from the
  // same constant here, so they cannot drift.
  const links = results.map(({ segment, aspect_ratio }, index) => `<li><a href="${T021_V1_CONTACT_SEGMENT_DIR}/segment-${String(index + 1).padStart(3, "0")}.html">${escapeHtml(segment)} (${escapeHtml(aspect_ratio)})</a></li>`).join("\n");
  const total = results.reduce((sum, { image_count }) => sum + image_count, 0);
  const indexBytes = `<!doctype html><meta charset="utf-8"><title>T021 event art</title><h1>T021 event art</h1><p>${total} recovered assets; ${results.length} lazy-loaded segments of at most 12 images.</p><ol>${links}</ol>\n`;
  if (/<img\b/i.test(indexBytes)) throw new Error("T021 contact index eagerly loads images");
  writeContactNoClobber(root, T021_V1_CONTACT_INDEX_PATH, indexBytes);
  return results;
}
/**
 * The T021 backup root is exclusive to this task's 54 assets. Event art (T021), hearts, and
 * cards must never appear under it, and nothing outside the plan may either.
 */
export function checkT021BackupScope(root: string, plan: T021Plan): { checked_count: number; out_of_scope_present_count: 0; all_absent: true } {
  // Pinned, like every other consumer: the out-of-scope enumeration must come from the sha
  // the plan was derived against, not from whatever the working tree happens to hold.
  const core = JSON.parse(readPinnedT021(root, T021_CORE_PLAN_PATH, T021_CORE_PLAN_SHA256).toString("utf8")) as { assets: Array<{ id: string; category: string; path: string }> };
  // In scope for the T021 backup root: exactly the 20 event assets. Anything else appearing
  // there means another task wrote into this run's tree.
  const planned = new Set(plan.assets.map(({ path }) => path));
  if (planned.size !== T021_V1_ASSET_COUNT) throw new Error("T021 in-scope path set is not the full 20");
  const outOfScope = core.assets.filter(({ path }) => !planned.has(path));
  const present = outOfScope.filter(({ path }) => existsSync(safeResolve(resolve(root, T021_V1_BACKUP_ROOT), path)));
  if (outOfScope.length !== core.assets.length - planned.size || present.length > 0) throw new Error("T021 out-of-scope asset exists under the T021 backup root");
  return { checked_count: outOfScope.length, out_of_scope_present_count: 0, all_absent: true };
}
export function auditT021(context: T021Context, journal: T021Journal, observedAt: string): Record<string, unknown> {
  timestamp(observedAt);
  const { root, plan } = context;
  const losses = acknowledgedLossUnits(journal);
  const discharged = journal.batches.filter((record) => lossDischarged(record));
  if (journal.run_state === "ACTIVE" && closable(journal)) {
    // A batch that fail-stopped and then delivered everything reaches COMPLETE, but the run
    // that resumed past it is left ACTIVE; promote it here rather than stranding a finished
    // run. The exact-closure conditions are checked first so the write can never be rejected.
    const delivered = journal.batches.reduce((sum, record) => sum + record.recoveries.length, 0);
    if (journal.batches.every(({ state }) => state === "COMPLETE") && losses === 0 && delivered === T021_V1_ASSET_COUNT && capUsedUnits(journal) === T021_V1_TOTAL_CAP_UNITS) {
      journal.run_state = "COMPLETE";
      writeJournal(context, journal);
    } else if (discharged.length > 0) {
      journal.run_state = "CLOSED_WITH_LOSSES";
      writeJournal(context, journal);
    }
  }
  if (journal.run_state !== "COMPLETE" && journal.run_state !== "CLOSED_WITH_LOSSES") throw new Error("T021 audit requires every batch settled or unstarted: COMPLETE, or discharged and closed with losses");
  const exact = journal.run_state === "COMPLETE";
  const recoveries = journal.batches.flatMap(({ recoveries: items }) => items);
  const recoveredIds = new Set(recoveries.map(({ asset_id }) => asset_id));
  if (recoveredIds.size !== recoveries.length) throw new Error("T021 audit found a duplicated recovery");
  if (exact && recoveries.length !== T021_V1_ASSET_COUNT) throw new Error("T021 exact audit requires all 20 event assets");
  const byAspect: Record<string, number> = {};
  for (const recovery of recoveries) {
    const asset = plan.assets.find(({ id }) => id === recovery.asset_id);
    if (!asset || asset.aspect_ratio !== recovery.aspect_ratio) throw new Error("T021 audit aspect binding changed");
    const local = verifyExistingPng(resolve(root, T021_V1_LOCAL_ROOT), recovery.local_relative_path, asset.aspect_ratio, recovery.sha256, DEFAULT_MAX_PNG_BYTES, t021AspectTolerancePpm(asset.aspect_ratio));
    const backup = verifyExistingPng(resolve(root, T021_V1_BACKUP_ROOT), recovery.backup_relative_path, asset.aspect_ratio, recovery.sha256, DEFAULT_MAX_PNG_BYTES, t021AspectTolerancePpm(asset.aspect_ratio));
    if (local.sha256 !== backup.sha256 || local.size !== backup.size) throw new Error("T021 local and backup differ");
    byAspect[asset.aspect_ratio] = (byAspect[asset.aspect_ratio] ?? 0) + 1;
  }
  const capUsed = capUsedUnits(journal);
  if (capUsed > T021_V1_TOTAL_CAP_UNITS) throw new Error("T021 credit accounting exceeds the approved cap");
  if (exact && (capUsed !== T021_V1_TOTAL_CAP_UNITS || losses !== 0)) throw new Error("T021 exact audit does not close at 81.00");
  const lost = t021LostAssets(journal);
  if (lost.some(({ asset_id }) => recoveredIds.has(asset_id)) || lost.length + recoveries.length > T021_V1_ASSET_COUNT) throw new Error("T021 per-asset loss ledger disagrees with the recovered set");
  const scope = checkT021BackupScope(root, plan);
  const segments = writeT021ContactSegments(root, plan, recoveredIds);
  return {
    command: "audit", observed_at: observedAt, run_state: journal.run_state, exact_closure: exact,
    // Split deliberately: "not delivered" counts everything still missing, including batches
    // that were never attempted; "paid and lost" counts only assets the provider actually
    // billed and never handed over. Reporting one number for both overstated the loss.
    assets_recovered: recoveries.length, assets_planned: T021_V1_ASSET_COUNT,
    recovered_by_event_type: plan.assets.filter(({ id }) => recoveredIds.has(id)).reduce<Record<string, number>>((counts, { event_type }) => ({ ...counts, [event_type]: (counts[event_type] ?? 0) + 1 }), {}),
    total_assets_delivered: recoveries.length + 0, total_assets_planned: T021_V1_ASSET_COUNT,
    assets_not_delivered: T021_V1_ASSET_COUNT - recoveries.length - 0,
    assets_paid_and_lost: lost.length,
    recovered_by_aspect_ratio: byAspect,
    batches: journal.batches.length, paid_batches: T021_V1_BATCH_COUNT, unstarted_batches: journal.batches.filter((record) => unstarted(record)).length,
    total_delta_units: capUsed, total_delta_decimal: decimal(capUsed), discharged_batches: discharged.length,
    lost_assets: lost.map(({ asset_id }) => asset_id), lost_asset_detail: lost,
    all_assets_delivered: recoveries.length === T021_V1_ASSET_COUNT,
    closes_at_exact_cap: capUsed === T021_V1_TOTAL_CAP_UNITS, acknowledged_loss_units: losses, acknowledged_loss_decimal: decimal(losses),
    total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS, within_total_cap: capUsed <= T021_V1_TOTAL_CAP_UNITS,
    batch_dispositions: journal.batches.map((record) => ({ batch_id: record.batch_id, aspect_ratio: record.aspect_ratio, state: record.state, recovered: record.recoveries.length, disposition: record.state === "COMPLETE" ? "COMPLETE" : unstarted(record) ? "UNSTARTED" : latestResume(journal, record)?.disposition ?? "UNRESOLVED", acknowledged_loss_decimal: decimal(record.discharges.reduce((sum, discharge) => sum + discharge.acknowledged_loss_units, 0)) })),
    model_verified_batches: journal.batches.filter((record) => t021BatchModelVerified(record)).length,
    contract_drift: t021ContractDriftBatches(journal),
    paid_retry_count: 0, local_backup_verified: true, boss_world_art_generated: false, event_art_generated: false,
    out_of_scope_backup_paths_absent: scope.all_absent, out_of_scope_checked_count: scope.checked_count,
    contact_segments: segments.length, contact_index_eager_full_image_load: false,
  };
}

/* ------------------------------------------------------------- production */

/**
 * The two gates every production command passes: a valid approval chain for this exact plan,
 * and a committed-clean binding scope. `root` is a parameter so both can be driven in a test
 * against a throwaway tree — otherwise nothing would catch their removal.
 */
export function productionContextT021(command: string, now = () => new Date(), root: string = repositoryRoot): T021Context {
  const plan = buildT021Plan(root);
  const bytes = readFileSync(resolve(root, T021_V1_PLAN_PATH), "utf8");
  if (bytes !== renderT021Plan(plan)) throw new Error("T021 bound plan changed");
  if (!isT021Authorized(root, plan, now())) throw new Error("T021 exact scoped approval is missing; prior approvals are not inherited");
  // `status` mutates nothing, so a dirty working tree must not hide the run's state.
  if (command !== "status") assertT021CommittedClean(root);
  return { root, plan, ...loadT021Authorization(root, plan, now()) };
}
const productionContext = productionContextT021;
export function runT021Ops(args: readonly string[], root: string = repositoryRoot): Record<string, unknown> { const now = () => new Date(); const context = productionContext(args[0] ?? "", now, root); return runT021OpsInternal(args, context.root, context.plan, context.presentation, context.approval, now); }
export function runT021JobsHandoff(args: readonly string[], stdinJson: string, root: string = repositoryRoot): Promise<Record<string, unknown>> { const now = () => new Date(); const context = productionContext("jobs-handoff", now, root); return runT021JobsHandoffInternal(args, stdinJson, context.root, context.plan, context.presentation, context.approval, undefined, now); }
