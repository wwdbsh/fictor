import { lookup as dnsLookup } from "node:dns/promises";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
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
  T015_V1_APPROVAL_PATH,
  T015_V1_APPROVAL_SHA256,
  T015_V1_BINDING_PATH,
  T015_V1_BINDING_SHA256,
  T015_V1_CONTROLLER_APPROVAL_PATH,
  T015_V1_CONTROLLER_APPROVAL_SHA256,
  T015_V1_CONTROLLER_DISCLOSURE_PATH,
  T015_V1_CONTROLLER_DISCLOSURE_SHA256,
  T015_V1_JOB_ID_LIST_SHA256,
  T015_V1_JOURNAL_PATH,
  T015_V1_JOURNAL_SHA256,
  T015_V1_PLAN_PATH,
  T015_V1_PLAN_SHA256,
  T015_V1_PRESENTATION_PATH,
  T015_V1_PRESENTATION_SHA256,
  T015_V1_RISK_PATH,
  T015_V1_RISK_SHA256,
  T015_V1_SCHEMA_PATH,
  T015_V1_SCHEMA_SHA256,
  T015_V2_PLAN_PATH,
  buildT015V1ForensicMigrationEvidence,
  buildT015V2CanonicalShardPlan,
  canonicalJsonT015 as canonicalJson,
  renderT015CanonicalJson,
  renderT015V2Plan,
  sha256T015,
  t015V2PlanSha256,
  type T015V2CanonicalShardPlan,
} from "./canonical-shard-1-v1-continuation-v2";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const T015_V2_RUN_ROOT = "assets/runs/t015-canonical-shard-1" as const;
export const T015_V2_JOURNAL_PATH = `${T015_V2_RUN_ROOT}/operations-v2.json` as const;
const LOCK_PATH = `${T015_V2_RUN_ROOT}/operations-v2.lock`;
const LOCAL_ROOT = "public/assets";
const BACKUP_ROOT = "assets/backups/t015-canonical-shard-1";
const MAX_STDIN_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const EXPECTED_MODEL = "nano_banana_flash";
const TERMINAL_STATUSES = ["completed", "failed", "canceled", "nsfw", "ip_detected", "lookup_failed"] as const;
type WaitStatus = "pending" | "waiting" | "queued" | "in_progress" | "ip_detect" | "completed" | "failed" | "canceled" | "nsfw" | "ip_detected" | "lookup_failed";
const WAIT_STATUSES: readonly WaitStatus[] = ["pending", "waiting", "queued", "in_progress", "ip_detect", ...TERMINAL_STATUSES];

interface LegacyJob { index: number; asset_id: string; job_id: string; canonical_request_sha256: string }
export interface T015V2Recovery {
  asset_id: string;
  provider_job_index: number;
  provider_job_id: string;
  source: "LEGACY_JOBS_WAIT_STDIN";
  observed_at: string;
  local_relative_path: string;
  backup_relative_path: string;
  sha256: string;
  size_bytes: number;
  actual_width: number;
  actual_height: number;
  aspect_error_ppm: number;
  provider_native_unmodified: true;
}
interface RedactedPollJob { index: number; job_id: string; status: WaitStatus; model: string | null; type: "image"; download_available: boolean; lookup_retryable: boolean | null; provider_failure_detail_present: false }
export interface T015V2OperationsJournal {
  schema_version: 2;
  journal_version: "t015-canonical-shard-1-operations-v2";
  redacted: true;
  plan_sha256: string;
  legacy_forensic_evidence_sha256: string;
  immutable_legacy_journal: { path: typeof T015_V1_JOURNAL_PATH; sha256: string; preserved_failure_code: "PROVIDER_RESPONSE_SIGNAL"; preserved_recovery_failure_count: 1; source_mutated: false };
  run_state: "RECOVERY_ONLY" | "FAIL_STOP" | "HOLD_FOR_FRESH_CONTINUATION_APPROVAL" | "ACTIVE" | "COMPLETE";
  accounting: { unit_cost_decimal: "1.50"; legacy_cap_committed_decimal: "18.00"; legacy_provider_balance_delta_verified: false; additional_credit_cap_decimal: "480.00"; total_credit_cap_decimal: "498.00"; automatic_paid_retry_reserve_decimal: "0.00"; paid_retry_count: 0 };
  local_root: typeof LOCAL_ROOT;
  backup_root: typeof BACKUP_ROOT;
  legacy_recovery: {
    batch_id: "canonical-shard-1-001";
    asset_ids: string[];
    jobs: LegacyJob[];
    migrated_at: string;
    exact_job_id_list_sha256: string;
    new_paid_submit_allowed: false;
    polls: Array<{ observed_at: string; all_terminal: boolean; timed_out: boolean; aborted: boolean; jobs: RedactedPollJob[] }>;
    recoveries: T015V2Recovery[];
    failures: Array<{ code: "PROVIDER_RESPONSE_SIGNAL" | "UNKNOWN_PROVIDER_FIELD" | "GENERATION_FAILED" | "MODEL_DRIFT" | "RECOVERY_FAILED" | "FILE_CONFLICT"; observed_at: string; facts: Record<string, unknown>; legacy_failure_preserved: true; automatic_paid_retry: false; paid_retry_count: 0; no_resubmit: true }>;
  };
  continuation: { authorization: null | { plan_sha256: string; presentation_sha256: string; approval_sha256: string }; batches: Array<{ batch_id: string; asset_ids: string[]; state: "PLANNED" }>; new_paid_request_count: 320; additional_credit_cap_decimal: "480.00" };
}

interface LegacyJournalShape {
  schema_version: number;
  journal_version: string;
  redacted: boolean;
  plan_sha256: string;
  run_state: string;
  initial_credit_cap_decimal: string;
  automatic_paid_retry_reserve_decimal: string;
  paid_retry_count: number;
  batches: Array<{
    batch_id: string; asset_ids: string[]; state: string;
    submission?: { expected_count: number; submitted_count: number; failed_count: number; complete: boolean; missing_asset_ids: string[]; jobs: Array<{ index: number; asset_id: string; job_id: string; canonical_request_sha256: string }> };
    terminal?: unknown; recovery_gate?: { no_new_paid_submit?: unknown };
    job_polls: Array<{ jobs: Array<{ status: string; model: string | null; download_available: boolean; provider_failure_detail_present: boolean }> }>;
    recoveries: unknown[];
    recovery_failures: Array<{ code: string; facts: Record<string, unknown>; paid_retry_count: number; no_resubmit: boolean }>;
  }>;
}

function timestamp(value: string): string { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("invalid T015 v2 observed timestamp"); return value; }
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
function exactKeys(value: Record<string, unknown>, required: readonly string[], allowed = required): void { if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("unknown or missing provider field"); }
function assertSafeSerialized(value: unknown): void { const serialized = JSON.stringify(value); if (/https?:\/\//i.test(serialized) || /result_url|thumbnail_url|raw_error/i.test(serialized)) throw new Error("T015 v2 journal contains sensitive provider data"); }
function sanitizeFacts(value: Record<string, unknown>): Record<string, unknown> { const serialized = JSON.stringify(value); return /https?:\/\//i.test(serialized) || /result_url|thumbnail_url|raw_error/i.test(serialized) ? { redacted_reason: "SENSITIVE_PROVIDER_VALUE_REMOVED" } : value; }
function assertWallClock(at: string, now?: () => Date, floor?: string): void { const observed = Date.parse(timestamp(at)); if (floor && observed < Date.parse(floor)) throw new Error("T015 v2 observed timestamp is not monotonic"); if (now && observed > now().getTime()) throw new Error("T015 v2 observed timestamp is in the future"); }

const LEGACY_HASHES = [
  [T015_V1_PLAN_PATH, T015_V1_PLAN_SHA256], [T015_V1_BINDING_PATH, T015_V1_BINDING_SHA256], [T015_V1_RISK_PATH, T015_V1_RISK_SHA256], [T015_V1_SCHEMA_PATH, T015_V1_SCHEMA_SHA256], [T015_V1_PRESENTATION_PATH, T015_V1_PRESENTATION_SHA256], [T015_V1_APPROVAL_PATH, T015_V1_APPROVAL_SHA256], [T015_V1_CONTROLLER_DISCLOSURE_PATH, T015_V1_CONTROLLER_DISCLOSURE_SHA256], [T015_V1_CONTROLLER_APPROVAL_PATH, T015_V1_CONTROLLER_APPROVAL_SHA256],
] as const;
export interface T015V2LegacySourcePins { journal_sha256: string; exact_job_id_list_sha256: string }
const PRODUCTION_LEGACY_PINS: T015V2LegacySourcePins = { journal_sha256: T015_V1_JOURNAL_SHA256, exact_job_id_list_sha256: T015_V1_JOB_ID_LIST_SHA256 };
function readPinned(root: string, path: string, expected: string): Buffer { const target = safeResolve(root, path); const info = lstatSync(target); if (info.isSymbolicLink() || !info.isFile()) throw new Error(`T015 v2 pinned source is not a regular file: ${path}`); const bytes = readFileSync(target); if (sha256T015(bytes) !== expected) throw new Error(`T015 v2 pinned source changed: ${path}`); return bytes; }
function readLegacyJournal(root: string, plan: T015V2CanonicalShardPlan, pins: T015V2LegacySourcePins): LegacyJournalShape {
  if (!/^[a-f0-9]{64}$/.test(pins.journal_sha256) || !/^[a-f0-9]{64}$/.test(pins.exact_job_id_list_sha256)) throw new Error("T015 v2 invalid legacy source pins");
  for (const [path, hash] of LEGACY_HASHES) readPinned(root, path, hash);
  const bytes = readPinned(root, T015_V1_JOURNAL_PATH, pins.journal_sha256); const journal = JSON.parse(bytes.toString("utf8")) as LegacyJournalShape;
  if (bytes.toString("utf8") !== renderT015CanonicalJson(journal) || /https?:\/\//i.test(bytes.toString("utf8")) || /result_url|thumbnail_url|raw_error/i.test(bytes.toString("utf8"))) throw new Error("T015 v1 journal is not canonical and redacted");
  const first = journal.batches[0]; const submission = first?.submission; const poll = first?.job_polls?.[0]; const failure = first?.recovery_failures?.[0];
  if (journal.schema_version !== 1 || journal.journal_version !== "t015-canonical-shard-1-operations-v1" || journal.redacted !== true || journal.plan_sha256 !== T015_V1_PLAN_SHA256 || journal.run_state !== "FAIL_STOP" || journal.initial_credit_cap_decimal !== "498.00" || journal.automatic_paid_retry_reserve_decimal !== "0.00" || journal.paid_retry_count !== 0 || journal.batches.length !== 28 || first.batch_id !== "canonical-shard-1-001" || first.state !== "RECOVERY_ONLY" || first.terminal !== undefined || first.recovery_gate?.no_new_paid_submit !== true || !submission || submission.expected_count !== 12 || submission.submitted_count !== 12 || submission.failed_count !== 0 || submission.complete !== true || submission.missing_asset_ids.length !== 0 || submission.jobs.length !== 12 || first.job_polls.length !== 1 || poll.jobs.length !== 12 || poll.jobs.some((job) => job.status !== "completed" || job.model !== EXPECTED_MODEL || job.download_available !== true || job.provider_failure_detail_present !== false) || first.recoveries.length !== 0 || first.recovery_failures.length !== 1 || failure.code !== "PROVIDER_RESPONSE_SIGNAL" || failure.facts.stage !== "JOBS_WAIT" || failure.paid_retry_count !== 0 || failure.no_resubmit !== true || journal.batches.slice(1).some((batch) => batch.state !== "PLANNED")) throw new Error("T015 v1 forensic migration invariants changed");
  const legacyBatch = plan.legacy_recovery.batch;
  if (canonicalJson(first.asset_ids) !== canonicalJson(legacyBatch.asset_ids) || canonicalJson(submission.jobs.map(({ asset_id }) => asset_id)) !== canonicalJson(legacyBatch.asset_ids)) throw new Error("T015 v1 legacy asset binding changed");
  submission.jobs.forEach((job) => { const asset = plan.assets[job.index]; if (!asset || job.asset_id !== asset.id || job.canonical_request_sha256 !== asset.canonical_request_sha256 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(job.job_id)) throw new Error("T015 v1 legacy job binding changed"); });
  if (new Set(submission.jobs.map(({ job_id }) => job_id)).size !== 12 || sha256T015(`${submission.jobs.map(({ job_id }) => job_id).join("\n")}\n`) !== pins.exact_job_id_list_sha256) throw new Error("T015 v1 exact job ID set changed");
  return journal;
}

export function buildInitialT015V2Journal(root: string, plan: T015V2CanonicalShardPlan, migratedAt: string, pins: T015V2LegacySourcePins = PRODUCTION_LEGACY_PINS): T015V2OperationsJournal {
  const legacy = readLegacyJournal(root, plan, pins); const submission = legacy.batches[0].submission!; const forensics = buildT015V1ForensicMigrationEvidence();
  return {
    schema_version: 2, journal_version: "t015-canonical-shard-1-operations-v2", redacted: true, plan_sha256: t015V2PlanSha256(plan), legacy_forensic_evidence_sha256: sha256T015(renderT015CanonicalJson(forensics)), immutable_legacy_journal: { path: T015_V1_JOURNAL_PATH, sha256: pins.journal_sha256, preserved_failure_code: "PROVIDER_RESPONSE_SIGNAL", preserved_recovery_failure_count: 1, source_mutated: false }, run_state: "RECOVERY_ONLY",
    accounting: { unit_cost_decimal: "1.50", legacy_cap_committed_decimal: "18.00", legacy_provider_balance_delta_verified: false, additional_credit_cap_decimal: "480.00", total_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00", paid_retry_count: 0 }, local_root: LOCAL_ROOT, backup_root: BACKUP_ROOT,
    legacy_recovery: { batch_id: "canonical-shard-1-001", asset_ids: [...legacy.batches[0].asset_ids], jobs: submission.jobs.map(({ index, asset_id, job_id, canonical_request_sha256 }) => ({ index, asset_id, job_id, canonical_request_sha256 })), migrated_at: timestamp(migratedAt), exact_job_id_list_sha256: pins.exact_job_id_list_sha256, new_paid_submit_allowed: false, polls: [], recoveries: [], failures: [] },
    continuation: { authorization: null, batches: plan.batches.map((batch) => ({ batch_id: batch.id, asset_ids: [...batch.asset_ids], state: "PLANNED" })), new_paid_request_count: 320, additional_credit_cap_decimal: "480.00" },
  };
}

export function validateT015V2Journal(journal: T015V2OperationsJournal, root: string, plan: T015V2CanonicalShardPlan, pins: T015V2LegacySourcePins = PRODUCTION_LEGACY_PINS): void {
  readLegacyJournal(root, plan, pins); assertSafeSerialized(journal); const baseline = buildInitialT015V2Journal(root, plan, journal.legacy_recovery.migrated_at, pins);
  if (journal.schema_version !== 2 || journal.journal_version !== baseline.journal_version || journal.redacted !== true || journal.plan_sha256 !== baseline.plan_sha256 || canonicalJson(journal.immutable_legacy_journal) !== canonicalJson(baseline.immutable_legacy_journal) || canonicalJson(journal.accounting) !== canonicalJson(baseline.accounting) || journal.local_root !== LOCAL_ROOT || journal.backup_root !== BACKUP_ROOT || canonicalJson(journal.legacy_recovery.asset_ids) !== canonicalJson(baseline.legacy_recovery.asset_ids) || canonicalJson(journal.legacy_recovery.jobs) !== canonicalJson(baseline.legacy_recovery.jobs) || journal.legacy_recovery.exact_job_id_list_sha256 !== pins.exact_job_id_list_sha256 || journal.legacy_recovery.new_paid_submit_allowed !== false || journal.continuation.authorization !== null || canonicalJson(journal.continuation) !== canonicalJson(baseline.continuation)) throw new Error("T015 v2 journal binding changed");
  timestamp(journal.legacy_recovery.migrated_at); const jobs = journal.legacy_recovery.jobs;
  journal.legacy_recovery.polls.forEach((poll, pollIndex) => { timestamp(poll.observed_at); const floor = pollIndex === 0 ? journal.legacy_recovery.migrated_at : journal.legacy_recovery.polls[pollIndex - 1].observed_at; if (Date.parse(poll.observed_at) < Date.parse(floor) || poll.jobs.length !== jobs.length || new Set(poll.jobs.map(({ job_id }) => job_id)).size !== jobs.length || poll.jobs.some((job) => job.type !== "image" || job.provider_failure_detail_present !== false || !jobs.some((expected) => expected.index === job.index && expected.job_id === job.job_id) || !WAIT_STATUSES.includes(job.status))) throw new Error("T015 v2 poll binding changed"); });
  const recovered = new Set<string>(); journal.legacy_recovery.recoveries.forEach((recovery) => { timestamp(recovery.observed_at); const job = jobs.find(({ asset_id }) => asset_id === recovery.asset_id); const asset = plan.assets.find(({ id }) => id === recovery.asset_id); if (!job || !asset || recovered.has(asset.id) || recovery.provider_job_index !== job.index || recovery.provider_job_id !== job.job_id || recovery.source !== "LEGACY_JOBS_WAIT_STDIN" || recovery.local_relative_path !== asset.path || recovery.backup_relative_path !== asset.path || recovery.provider_native_unmodified !== true || !/^[a-f0-9]{64}$/.test(recovery.sha256) || !Number.isSafeInteger(recovery.size_bytes) || recovery.size_bytes < 1 || recovery.aspect_error_ppm < 0 || recovery.aspect_error_ppm > 5000) throw new Error("T015 v2 recovery binding changed"); const local = verifyExistingPng(resolve(root, LOCAL_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5000); const backup = verifyExistingPng(resolve(root, BACKUP_ROOT), asset.path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, 5000); if (local.size !== backup.size) throw new Error("T015 v2 local and backup differ"); recovered.add(asset.id); });
  journal.legacy_recovery.failures.forEach((failure, index) => { timestamp(failure.observed_at); const floor = index === 0 ? journal.legacy_recovery.migrated_at : journal.legacy_recovery.failures[index - 1].observed_at; if (Date.parse(failure.observed_at) < Date.parse(floor) || failure.legacy_failure_preserved !== true || failure.automatic_paid_retry !== false || failure.paid_retry_count !== 0 || failure.no_resubmit !== true || canonicalJson(failure.facts) !== canonicalJson(sanitizeFacts(failure.facts))) throw new Error("T015 v2 failure binding changed"); });
  const complete = recovered.size === 12; if ((complete && journal.run_state !== "HOLD_FOR_FRESH_CONTINUATION_APPROVAL") || (!complete && !["RECOVERY_ONLY", "FAIL_STOP"].includes(journal.run_state))) throw new Error("T015 v2 run state changed");
}

function journalPath(root: string): string { return safeResolve(root, T015_V2_JOURNAL_PATH); }
function writeJournal(root: string, journal: T015V2OperationsJournal): void { assertSafeSerialized(journal); atomicWriteJson(root, T015_V2_JOURNAL_PATH, journal); }
function readJournal(root: string, plan: T015V2CanonicalShardPlan, pins: T015V2LegacySourcePins): T015V2OperationsJournal { const bytes = readFileSync(journalPath(root), "utf8"); const value = JSON.parse(bytes) as T015V2OperationsJournal; if (bytes !== renderT015CanonicalJson(value)) throw new Error("T015 v2 journal is not canonical"); validateT015V2Journal(value, root, plan, pins); return value; }
function persistFailure(root: string, journal: T015V2OperationsJournal, code: T015V2OperationsJournal["legacy_recovery"]["failures"][number]["code"], at: string, facts: Record<string, unknown>): never { journal.legacy_recovery.failures.push({ code, observed_at: timestamp(at), facts: sanitizeFacts(facts), legacy_failure_preserved: true, automatic_paid_retry: false, paid_retry_count: 0, no_resubmit: true }); journal.run_state = "FAIL_STOP"; writeJournal(root, journal); throw new Error(`${code}: T015 v2 recovery fail-stop; exact legacy jobs preserved; no paid submit or retry`); }

export interface T015V2ResolvedAddress { address: string; family: 4 | 6 }
export interface T015V2PinnedFetchSpecification { url: URL; hostname: string; servername: string; pinned: T015V2ResolvedAddress; signal: AbortSignal }
export interface T015V2DownloadDependencies { resolve(hostname: string, signal: AbortSignal): Promise<readonly T015V2ResolvedAddress[]>; fetch(spec: T015V2PinnedFetchSpecification): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer; remoteAddress: string }>; timeout_ms?: number }
function ipv4Bytes(address: string): number[] | null { if (isIP(address) !== 4) return null; const bytes = address.split(".").map(Number); return bytes.length === 4 && bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255) ? bytes : null; }
function ipv6Words(address: string): number[] | null { if (isIP(address) !== 6 || address.includes("%")) return null; let normalized = address.toLowerCase(); if (normalized.includes(".")) { const lastColon = normalized.lastIndexOf(":"); const tail = ipv4Bytes(normalized.slice(lastColon + 1)); if (lastColon < 0 || !tail) return null; normalized = `${normalized.slice(0, lastColon + 1)}${((tail[0] << 8) | tail[1]).toString(16)}:${((tail[2] << 8) | tail[3]).toString(16)}`; } const halves = normalized.split("::"); if (halves.length > 2) return null; const parseHalf = (half: string): number[] | null => { if (half === "") return []; const items = half.split(":"); return items.some((item) => !/^[a-f0-9]{1,4}$/.test(item)) ? null : items.map((item) => Number.parseInt(item, 16)); }; const left = parseHalf(halves[0]); const right = parseHalf(halves[1] ?? ""); if (!left || !right) return null; if (halves.length === 1) return left.length === 8 ? left : null; const omitted = 8 - left.length - right.length; return omitted >= 1 ? [...left, ...Array<number>(omitted).fill(0), ...right] : null; }
export function isPublicT015V2ResolvedAddress(item: T015V2ResolvedAddress): boolean { if (item.family === 4) { const bytes = ipv4Bytes(item.address); if (!bytes) return false; const [a, b, c] = bytes; return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 31 && c === 196) || (a === 192 && b === 52 && c === 193) || (a === 192 && b === 88 && c === 99) || (a === 192 && b === 175 && c === 48) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)); } if (item.family !== 6) return false; const words = ipv6Words(item.address); if (!words || (words[0] & 0xe000) !== 0x2000) return false; const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff; const special = words[0] === 0x2001 && words[1] <= 0x01ff; return !mapped && !special && words[0] !== 0x2002 && words[0] !== 0x3fff; }
function canonicalAddressBytes(address: string): number[] | null { const v4 = ipv4Bytes(address); if (v4) return v4; const v6 = ipv6Words(address); return v6 ? v6.flatMap((word) => [word >>> 8, word & 0xff]) : null; }
function sameAddress(left: string, right: string): boolean { const a = canonicalAddressBytes(left); const b = canonicalAddressBytes(right); return a !== null && b !== null && a.length === b.length && a.every((byte, index) => byte === b[index]); }
function approvedUrl(raw: unknown): URL { if (typeof raw !== "string" || raw.length > 16_384) throw new Error("DOWNLOAD_FAILED"); const url = new URL(raw); const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname; if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(host) || !host.includes(".") || host === "localhost" || host.endsWith(".localhost") || !/^[a-z0-9.-]+$/i.test(host)) throw new Error("DOWNLOAD_FAILED"); return url; }
function defaultFetch(spec: T015V2PinnedFetchSpecification): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer; remoteAddress: string }> { return new Promise((resolvePromise, reject) => { const request = httpsRequest({ protocol: "https:", hostname: spec.hostname, path: `${spec.url.pathname}${spec.url.search}`, method: "GET", port: 443, servername: spec.servername, rejectUnauthorized: true, signal: spec.signal, lookup: (_hostname, _options, callback) => callback(null, spec.pinned.address, spec.pinned.family) }, (response) => { const chunks: Buffer[] = []; let size = 0; response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > DEFAULT_MAX_PNG_BYTES) request.destroy(new Error("FILE_TOO_LARGE")); else chunks.push(chunk); }); response.on("end", () => resolvePromise({ status: response.statusCode ?? 0, headers: response.headers, bytes: Buffer.concat(chunks), remoteAddress: response.socket.remoteAddress ?? "" })); }); request.on("error", reject); request.end(); }); }
const defaultDependencies: T015V2DownloadDependencies = { resolve: async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((item) => ({ address: item.address, family: item.family as 4 | 6 })), fetch: defaultFetch };
function withinDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> { if (signal.aborted) return Promise.reject(new Error("DOWNLOAD_FAILED")); return new Promise<T>((resolvePromise, reject) => { const abort = () => reject(new Error("DOWNLOAD_FAILED")); signal.addEventListener("abort", abort, { once: true }); promise.then((value) => { signal.removeEventListener("abort", abort); resolvePromise(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); }); }); }
async function download(rawUrl: string, dependencies: T015V2DownloadDependencies): Promise<Buffer> { let url = approvedUrl(rawUrl); for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), dependencies.timeout_ms ?? DOWNLOAD_TIMEOUT_MS); try { const addresses = await withinDeadline(dependencies.resolve(url.hostname, controller.signal), controller.signal); if (!addresses.length || addresses.some((item) => !isPublicT015V2ResolvedAddress(item))) throw new Error("DOWNLOAD_FAILED"); const pinned = addresses[0]; const response = await withinDeadline(dependencies.fetch({ url, hostname: url.hostname, servername: url.hostname, pinned, signal: controller.signal }), controller.signal); if (!sameAddress(response.remoteAddress, pinned.address)) throw new Error("DOWNLOAD_FAILED"); if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.location; if (typeof location !== "string" || redirects === MAX_REDIRECTS) throw new Error("DOWNLOAD_FAILED"); url = approvedUrl(new URL(location, url).toString()); continue; } const contentLength = response.headers["content-length"] === undefined ? null : Number(response.headers["content-length"]); if (response.status !== 200 || response.headers["content-type"]?.toString().split(";", 1)[0].trim().toLowerCase() !== "image/png" || response.bytes.length > DEFAULT_MAX_PNG_BYTES || (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength !== response.bytes.length))) throw new Error("DOWNLOAD_FAILED"); return response.bytes; } finally { clearTimeout(timeout); } } throw new Error("DOWNLOAD_FAILED"); }

function ingest(root: string, journal: T015V2OperationsJournal, plan: T015V2CanonicalShardPlan, assetId: string, bytes: Buffer, at: string): void {
  const asset = plan.assets.find(({ id }) => id === assetId); const job = journal.legacy_recovery.jobs.find(({ asset_id }) => asset_id === assetId); if (!asset || !job) throw new Error("INVALID_BINDING");
  const local = atomicWriteVerifiedPng(resolve(root, LOCAL_ROOT), asset.path, bytes, "3:4", DEFAULT_MAX_PNG_BYTES, 5000); const backup = backupVerifiedFile(resolve(root, LOCAL_ROOT), resolve(root, BACKUP_ROOT), asset.path, local.sha256, "3:4", DEFAULT_MAX_PNG_BYTES, 5000); if (local.sha256 !== backup.sha256 || local.size !== backup.size) throw new Error("FILE_CONFLICT");
  journal.legacy_recovery.recoveries.push({ asset_id: asset.id, provider_job_index: job.index, provider_job_id: job.job_id, source: "LEGACY_JOBS_WAIT_STDIN", observed_at: at, local_relative_path: asset.path, backup_relative_path: asset.path, sha256: local.sha256, size_bytes: local.size, actual_width: local.width, actual_height: local.height, aspect_error_ppm: local.aspect_error_ppm, provider_native_unmodified: true });
}

export function runT015V2RecoveryOpsInternal(args: readonly string[], root: string, plan: T015V2CanonicalShardPlan, now?: () => Date, pins: T015V2LegacySourcePins = PRODUCTION_LEGACY_PINS): Record<string, unknown> {
  const command = args[0]; const lock = acquireRunnerLock(root, LOCK_PATH);
  try {
    if (command === "migrate") { if (args.length !== 3 || args[1] !== "--observed-at") throw new Error("usage: recovery-v2 migrate --observed-at <timestamp>"); const at = timestamp(args[2]); assertWallClock(at, now); if (existsSync(journalPath(root))) return { command, state: readJournal(root, plan, pins).run_state, idempotent: true, legacy_jobs: 12, new_paid_submit: false }; assertNonOverlappingRoots(resolve(root, LOCAL_ROOT), resolve(root, BACKUP_ROOT)); const journal = buildInitialT015V2Journal(root, plan, at, pins); writeJournal(root, journal); readLegacyJournal(root, plan, pins); return { command, state: journal.run_state, legacy_jobs: 12, legacy_journal_sha256: pins.journal_sha256, new_paid_submit: false, paid_retry_count: 0 }; }
    const journal = readJournal(root, plan, pins);
    if (command === "jobs-request") { if (args.length !== 1 || !["RECOVERY_ONLY", "FAIL_STOP"].includes(journal.run_state)) throw new Error("T015 v2 legacy recovery is not open"); return { jobs: journal.legacy_recovery.jobs.map(({ index, job_id }) => ({ index, job_id })), exact_job_id_list_sha256: pins.exact_job_id_list_sha256, new_paid_submit: false, paid_retry_count: 0 }; }
    if (command === "status") { return { command, state: journal.run_state, legacy_jobs: 12, recovered: journal.legacy_recovery.recoveries.length, recovery_failures: journal.legacy_recovery.failures.length, legacy_failure_preserved: true, legacy_cap_committed_decimal: "18.00", legacy_provider_balance_delta_verified: false, new_paid_locked: journal.continuation.authorization === null, additional_credit_cap_decimal: "480.00", total_credit_cap_decimal: "498.00", paid_retry_count: 0 }; }
    throw new Error("usage: recovery-v2 <migrate|jobs-request|status|jobs-handoff>");
  } finally { lock.release(); }
}

export async function runT015V2JobsHandoffInternal(args: readonly string[], stdinJson: string, root: string, plan: T015V2CanonicalShardPlan, dependencies: T015V2DownloadDependencies = defaultDependencies, now?: () => Date, pins: T015V2LegacySourcePins = PRODUCTION_LEGACY_PINS): Promise<Record<string, unknown>> {
  if (args.length !== 3 || args[0] !== "jobs-handoff" || args[1] !== "--observed-at") throw new Error("usage: recovery-v2 jobs-handoff --observed-at <timestamp>"); if (Buffer.byteLength(stdinJson) > MAX_STDIN_BYTES) throw new Error("T015 v2 jobs-handoff stdin too large"); const at = timestamp(args[2]); const lock = acquireRunnerLock(root, LOCK_PATH);
  try {
    const journal = readJournal(root, plan, pins); if (!["RECOVERY_ONLY", "FAIL_STOP"].includes(journal.run_state)) throw new Error("T015 v2 legacy recovery is not open"); const floors = [journal.legacy_recovery.migrated_at, journal.legacy_recovery.polls.at(-1)?.observed_at, journal.legacy_recovery.failures.at(-1)?.observed_at].filter((value): value is string => value !== undefined); const floor = floors.sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1)!; assertWallClock(at, now, floor);
    let raw: unknown; try { raw = JSON.parse(stdinJson) as unknown; } catch { persistFailure(root, journal, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_JSON" }); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) persistFailure(root, journal, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT" }); const response = raw as Record<string, unknown>;
    try { exactKeys(response, ["all_terminal", "jobs", "summary"], ["all_terminal", "jobs", "summary", "poll_after_seconds", "timed_out", "aborted"]); } catch { persistFailure(root, journal, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_TOP_LEVEL_FIELDS" }); }
    if (typeof response.all_terminal !== "boolean" || !Array.isArray(response.jobs) || !response.summary || typeof response.summary !== "object" || Array.isArray(response.summary) || ("timed_out" in response && typeof response.timed_out !== "boolean") || ("aborted" in response && typeof response.aborted !== "boolean") || ("poll_after_seconds" in response && (typeof response.poll_after_seconds !== "number" || !Number.isFinite(response.poll_after_seconds) || response.poll_after_seconds < 0))) persistFailure(root, journal, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_TYPES" });
    if (response.timed_out === true || response.aborted === true) persistFailure(root, journal, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT_INTERRUPTED", timed_out: response.timed_out === true, aborted: response.aborted === true });
    const urls = new Map<string, string>(); const redacted: RedactedPollJob[] = []; const seen = new Set<string>(); let topology = response.jobs.length === journal.legacy_recovery.jobs.length;
    (response.jobs as unknown[]).forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) { topology = false; return; } const job = item as Record<string, unknown>;
      try { exactKeys(job, ["index", "job_id", "status", "type"], ["index", "job_id", "status", "type", "model", "result_url", "retryable"]); } catch { topology = false; return; }
      const expected = journal.legacy_recovery.jobs.find(({ index, job_id }) => index === job.index && job_id === job.job_id); const status = job.status as WaitStatus; if (!expected || seen.has(expected.job_id) || !WAIT_STATUSES.includes(status) || job.type !== "image") { topology = false; return; } seen.add(expected.job_id);
      const retryable = "retryable" in job ? job.retryable : null; if ((status === "lookup_failed") !== (typeof retryable === "boolean")) { topology = false; return; }
      const model = typeof job.model === "string" ? job.model : null; const url = typeof job.result_url === "string" ? job.result_url : null; if ((status === "completed") !== (url !== null) || (status === "completed" && model === null) || (status !== "completed" && "result_url" in job) || (status !== "completed" && "model" in job)) { topology = false; return; } if (url) urls.set(expected.asset_id, url);
      redacted.push({ index: expected.index, job_id: expected.job_id, status, model, type: "image", download_available: url !== null, lookup_retryable: typeof retryable === "boolean" ? retryable : null, provider_failure_detail_present: false });
    }); redacted.sort((left, right) => left.index - right.index);
    if (!topology || redacted.length !== 12) persistFailure(root, journal, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_JOB_FIELDS_OR_TOPOLOGY", definite_job_count: redacted.length });
    const active = ["pending", "waiting", "queued", "in_progress", "ip_detect"]; const failed = ["failed", "canceled", "nsfw", "ip_detected"]; const derivedSummary = { active: redacted.filter((job) => active.includes(job.status)).length, completed: redacted.filter((job) => job.status === "completed").length, errors: redacted.filter((job) => job.status === "lookup_failed").length, failed: redacted.filter((job) => failed.includes(job.status)).length, total: redacted.length }; const summary = response.summary as Record<string, unknown>;
    try { exactKeys(summary, ["active", "completed", "errors", "failed", "total"]); } catch { persistFailure(root, journal, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_SUMMARY_FIELDS" }); }
    if (Object.values(summary).some((value) => !Number.isSafeInteger(value) || (value as number) < 0) || canonicalJson(summary) !== canonicalJson(derivedSummary)) persistFailure(root, journal, "UNKNOWN_PROVIDER_FIELD", at, { stage: "JOBS_WAIT_SUMMARY_MISMATCH" });
    const allTerminal = redacted.every((job) => (TERMINAL_STATUSES as readonly string[]).includes(job.status)); if (response.all_terminal !== allTerminal) persistFailure(root, journal, "PROVIDER_RESPONSE_SIGNAL", at, { stage: "JOBS_WAIT_TERMINAL_CONTRADICTION" });
    journal.legacy_recovery.polls.push({ observed_at: at, all_terminal: response.all_terminal as boolean, timed_out: false, aborted: false, jobs: redacted }); journal.run_state = "RECOVERY_ONLY"; writeJournal(root, journal);
    if (redacted.some((job) => job.status === "lookup_failed" && job.lookup_retryable === true) || response.all_terminal !== true) return { command: "jobs-handoff", state: journal.run_state, repoll_same_jobs_only: true, new_paid_submit: false, paid_retry_count: 0 };
    const generatedFailure = redacted.find((job) => job.status !== "completed"); if (generatedFailure) persistFailure(root, journal, "GENERATION_FAILED", at, { index: generatedFailure.index, status: generatedFailure.status }); const drift = redacted.find((job) => job.model !== EXPECTED_MODEL); if (drift) persistFailure(root, journal, "MODEL_DRIFT", at, { index: drift.index, expected_model: EXPECTED_MODEL, observed_model: drift.model });
    for (const job of journal.legacy_recovery.jobs) {
      if (journal.legacy_recovery.recoveries.some(({ asset_id }) => asset_id === job.asset_id)) continue; const url = urls.get(job.asset_id); if (!url) persistFailure(root, journal, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "MISSING_RESULT_URL" }); let bytes: Buffer; try { bytes = await download(url, dependencies); } catch { persistFailure(root, journal, "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "SECURE_DOWNLOAD_FAILED" }); }
      try { ingest(root, journal, plan, job.asset_id, bytes, at); writeJournal(root, journal); } catch (error) { persistFailure(root, journal, error instanceof Error && error.message === "FILE_CONFLICT" ? "FILE_CONFLICT" : "RECOVERY_FAILED", at, { asset_id: job.asset_id, reason: "PNG_OR_ATOMIC_STORE_FAILED" }); }
    }
    journal.run_state = "HOLD_FOR_FRESH_CONTINUATION_APPROVAL"; writeJournal(root, journal); readLegacyJournal(root, plan, pins); return { command: "jobs-handoff", state: journal.run_state, recovered: 12, legacy_failure_preserved: true, legacy_cap_committed_decimal: "18.00", legacy_provider_balance_delta_verified: false, new_paid_locked: true, new_paid_submit: false, paid_retry_count: 0 };
  } finally { lock.release(); }
}

function assertProductionBound(root: string): T015V2CanonicalShardPlan {
  const plan = buildT015V2CanonicalShardPlan(root); if (plan.state !== "HOLD_FOR_FRESH_CONTINUATION_APPROVAL") throw new Error("T015 v2 plan state changed");
  const target = resolve(root, T015_V2_PLAN_PATH); if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile() || readFileSync(target, "utf8") !== renderT015V2Plan(plan)) throw new Error("T015 v2 bound plan changed");
  return plan;
}
export function runT015V2RecoveryOps(args: readonly string[]): Record<string, unknown> { const plan = assertProductionBound(repositoryRoot); return runT015V2RecoveryOpsInternal(args, repositoryRoot, plan, () => new Date()); }
export async function runT015V2JobsHandoff(args: readonly string[], stdinJson: string): Promise<Record<string, unknown>> { const plan = assertProductionBound(repositoryRoot); return runT015V2JobsHandoffInternal(args, stdinJson, repositoryRoot, plan, defaultDependencies, () => new Date()); }
