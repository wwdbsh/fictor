import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";

import { atomicWriteVerifiedPng, inspectPng, safeResolve, verifyExistingPng } from "./filesystem";
import type { AspectRatio } from "./types";

export const T022_CONTRACT_SHA256 = "1d1d68b20896583bbd88c66c5df3d62971be820d8419ffbd6905e4f38be0185c" as const;
export const T022_VERIFIED_AT = "2026-08-14T06:31:20.000Z" as const;
export const T022_VERIFY_BY = "2026-08-17T23:59:59.999+09:00" as const;
export const T022_MANIFEST_PATH = "assets/manifests/t022-m2-assets-audit-v1.json" as const;
export const T022_MILESTONE_PATH = "docs/milestones/m2-assets.json" as const;
export const T022_T016_FORENSIC_PATH = "assets/evidence/t016-canonical-cards-final-forensic-v1.json" as const;
/** Filled after the first audited record; check mode refuses any other manifest bytes. */
export const T022_EXPECTED_MANIFEST_SHA256 = "1456506d259c95f3e68d8383b9fafe2ed026ffa260b9f82fc65960d5395a429b" as const;

export const T022_FAILED_IDS = [
  "forge__odd_01__ore_scatter",
  "forge__ore_rot__tool_03",
  "forge__ore_rot__wash_01",
] as const;

const SOURCE_PATHS = [
  "assets/manifests/core-v1.plan.json",
  "assets/manifests/materials-v1.plan.json",
  "assets/manifests/canonical-shard-1-v1.plan.json",
  "assets/manifests/t016-canonical-selection-v1.json",
  "assets/manifests/t019-heart-cards-v1.plan.json",
  "assets/manifests/t020-world-art-v1.plan.json",
  "assets/manifests/t020-world-art-v2.plan.json",
  "assets/manifests/t021-event-art-v1.plan.json",
  "assets/manifests/style-candidates-v2.json",
  "assets/evidence/t016-canonical-cards-final-forensic-v1.json",
  "assets/evidence/t019-heart-cards-v1-final-journal-forensic.json",
  "assets/evidence/t020-world-art-v1-final-journal-forensic.json",
  "assets/evidence/t020-world-art-v2-final-journal-forensic.json",
  "assets/evidence/t021-event-art-v1-final-journal-forensic.json",
] as const;

export type T022Category = "MATERIAL" | "CANONICAL" | "HEART" | "BACKGROUND" | "ENEMY" | "ELITE" | "EVENT";

export interface T022ExpectedAsset {
  id: string;
  category: T022Category;
  source_task: "T013" | "T015" | "T016" | "T019" | "T020" | "T021";
  path: string;
  aspect_ratio: AspectRatio;
  backup_root: string;
}

export interface T022AssetRecord {
  id: string;
  category: T022Category;
  source_task: T022ExpectedAsset["source_task"];
  public_path: string;
  backup_root: string;
  backup_path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  aspect_ratio: AspectRatio;
  aspect_error_ppm: number;
}

export interface T022FallbackRecord {
  id: string;
  category: "CANONICAL" | "HEART_FORGE";
  path: string;
  reason: "UNGENERATED_AFTER_M2_BOUNDED_CAP" | "UNGENERATED_HEART_FORGE_RUNTIME_FALLBACK" | "NO_REGENERATION_T022";
}

interface PlanAsset {
  index?: number;
  id: string;
  category?: string;
  path: string;
  aspect_ratio?: AspectRatio;
  request?: { params?: { aspect_ratio?: AspectRatio; use_unlim?: boolean } };
  canonical_request_sha256?: string;
}

interface SourceHash { path: string; sha256: string }
interface EvidenceHash { path: string; sha256: string }

export interface T022BatchLedger {
  task: "T020" | "T021" | "T019" | "T016";
  batch_id: string;
  submitted: number;
  charged: number;
  recovered: number;
  uncharged_failures: string[];
  spend_decimal: string;
  balance_before_decimal: string;
  balance_after_decimal: string;
  unit_cost_source: "credits_exact";
  use_unlim: false;
  paid_retry_count: 0;
  final_state: string;
  models: ["nano_banana_flash"];
  recovery_sha256: string[];
  source_evidence: EvidenceHash[];
}

export interface T022Manifest {
  schema_version: 1;
  audit_version: "t022-m2-assets-audit-v1";
  contract_sha256: typeof T022_CONTRACT_SHA256;
  verified_at: string;
  verify_by: typeof T022_VERIFY_BY;
  status: "VERIFIED";
  scope: {
    repository_png_count: 625;
    audited_asset_count: 621;
    out_of_scope_style_count: 4;
    cards: { total: 547; material: 52; canonical: 489; heart: 6 };
    world: { total: 74; background: 18; enemy: 30; elite: 6; event: 20 };
  };
  source_files: SourceHash[];
  assets: { list_encoding: string; list_sha256: string; records: T022AssetRecord[] };
  fallback: { count: 873; canonical: 837; heart_forge: 36; list_encoding: string; list_sha256: string; records: T022FallbackRecord[] };
  forbidden_regeneration: { state: "NO_REGENERATION_T022"; ids: string[] };
  integrity: { missing: 0; damaged: 0; public_backup_mismatch: 0; duplicate_ids: 0; duplicate_paths: 0; duplicate_content_hashes: 0; unexpected_backup_entries: 0 };
  backup_status: {
    status: "VERIFIED_LOCALLY_AT";
    verified_at: string;
    public_backup_pairs: 621;
    isolated_restore_reads: 621;
    presence_reverified_in_ci: false;
    trust_boundary: string;
  };
  provider: { t022_generation_calls: 0; t022_spend_decimal: "0.00"; regeneration_of_failed_ids: false };
  generation_cap_window: {
    name: "M2_AFTER_T015_ENDING_BALANCE_363_90";
    cap_decimal: "360.00";
    spend_decimal: "355.50";
    balance_start_decimal: "363.90";
    balance_end_decimal: "8.40";
    task_spend: { T020: "81.00"; T021: "30.00"; T019: "9.00"; T016: "235.50" };
    batches: 22;
    submitted: 240;
    charged: 237;
    recovered: 237;
    uncharged_failures: 3;
    credits_exact_only: true;
    use_unlim: false;
    paid_retry_count: 0;
    ledger: T022BatchLedger[];
  };
}

export interface T022Milestone {
  schema_version: 1;
  milestone_id: "M2";
  phase: "PHASE_0_5_ASSETS";
  task_key: "T022";
  status: "VERIFIED";
  contract_sha256: typeof T022_CONTRACT_SHA256;
  verified_at: string;
  audit_manifest_path: typeof T022_MANIFEST_PATH;
  audit_manifest_file_sha256: string;
  counts: { audited: 621; repository_png: 625; style_out_of_scope: 4; fallback: 873 };
  trust_boundary: { public_bytes_reverified_in_ci: true; backup_presence_reverified_in_ci: false; backup_status: "VERIFIED_LOCALLY_AT" };
}

function readJson<T>(root: string, path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
}

export function sha256T022(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function renderT022Json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertExactDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("INVALID_VERIFIED_AT");
  if (Date.parse(value) > Date.parse(T022_VERIFY_BY)) throw new Error("VERIFIED_AFTER_DEADLINE");
}

function assertUniqueExpected(assets: readonly T022ExpectedAsset[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new Error(`DUPLICATE_ID:${asset.id}`);
    if (paths.has(asset.path)) throw new Error(`DUPLICATE_PATH:${asset.path}`);
    ids.add(asset.id);
    paths.add(asset.path);
  }
}

function selectPlanAssets(root: string, path: string): PlanAsset[] {
  const value = readJson<{ assets: PlanAsset[] }>(root, path);
  if (!Array.isArray(value.assets)) throw new Error(`INVALID_SOURCE:${path}`);
  return value.assets;
}

function expected(asset: PlanAsset, source_task: T022ExpectedAsset["source_task"], backup_root: string, categoryOverride?: T022Category): T022ExpectedAsset {
  const aspect = asset.aspect_ratio ?? asset.request?.params?.aspect_ratio;
  const category = categoryOverride ?? asset.category;
  if (!asset.id || !asset.path || !category || !aspect || !["3:4", "16:9"].includes(aspect)) throw new Error(`INVALID_ASSET:${asset.id}`);
  return { id: asset.id, category: category as T022Category, source_task, path: asset.path, aspect_ratio: aspect, backup_root };
}

export function buildT022ExpectedInventory(root: string): T022ExpectedAsset[] {
  const materials = selectPlanAssets(root, "assets/manifests/materials-v1.plan.json").map((asset) => expected(asset, "T013", "assets/backups/t013-materials", "MATERIAL"));
  const t015 = selectPlanAssets(root, "assets/manifests/canonical-shard-1-v1.plan.json").map((asset) => expected(asset, "T015", "assets/backups/t015-canonical-shard-1", "CANONICAL"));
  const selected = readJson<{ selected: Array<{ manifest_index: number; id: string; path: string }> }>(root, "assets/manifests/t016-canonical-selection-v1.json").selected;
  const core = selectPlanAssets(root, "assets/manifests/core-v1.plan.json");
  const canonicalCore = core.filter(({ category }) => category === "CANONICAL");
  const failed = new Set<string>(T022_FAILED_IDS);
  const t016 = selected.filter(({ id }) => !failed.has(id)).map(({ manifest_index, id, path }) => {
    const source = canonicalCore[manifest_index];
    if (!source || source.id !== id || source.path !== path || source.category !== "CANONICAL") throw new Error(`T016_SELECTION_DRIFT:${id}`);
    return expected(source, "T016", "assets/backups/t016-canonical-cards");
  });
  const hearts = selectPlanAssets(root, "assets/manifests/t019-heart-cards-v1.plan.json").map((asset) => expected(asset, "T019", "assets/backups/t019-heart-cards"));
  const worldV1 = selectPlanAssets(root, "assets/manifests/t020-world-art-v1.plan.json");
  const worldV2Ids = new Set(selectPlanAssets(root, "assets/manifests/t020-world-art-v2.plan.json").map(({ id }) => id));
  if (worldV1.slice(0, 6).some(({ id }) => worldV2Ids.has(id)) || worldV1.slice(6).some(({ id }) => !worldV2Ids.has(id))) throw new Error("T020_OWNER_ROUTING_DRIFT");
  const world = worldV1.map((asset) => expected(asset, "T020", "assets/backups/t020-world-art"));
  const events = selectPlanAssets(root, "assets/manifests/t021-event-art-v1.plan.json").map((asset) => expected(asset, "T021", "assets/backups/t021-event-art"));
  const result = [...materials, ...t015, ...t016, ...hearts, ...world, ...events];
  assertUniqueExpected(result);
  const counts = result.reduce<Record<string, number>>((all, { category }) => ({ ...all, [category]: (all[category] ?? 0) + 1 }), {});
  if (result.length !== 621 || counts.MATERIAL !== 52 || counts.CANONICAL !== 489 || counts.HEART !== 6 || counts.BACKGROUND !== 18 || counts.ENEMY !== 30 || counts.ELITE !== 6 || counts.EVENT !== 20) throw new Error(`SCOPE_COUNT_DRIFT:${JSON.stringify(counts)}`);
  return result;
}

export function buildT022Fallback(root: string, inventory = buildT022ExpectedInventory(root)): T022FallbackRecord[] {
  const made = new Set(inventory.filter(({ category }) => category === "CANONICAL").map(({ id }) => id));
  const failed = new Set<string>(T022_FAILED_IDS);
  const core = selectPlanAssets(root, "assets/manifests/core-v1.plan.json");
  const records: T022FallbackRecord[] = [];
  for (const asset of core) {
    if (asset.category === "CANONICAL" && !made.has(asset.id)) {
      records.push({ id: asset.id, category: "CANONICAL", path: `public/assets/${asset.path}`, reason: failed.has(asset.id) ? "NO_REGENERATION_T022" : "UNGENERATED_AFTER_M2_BOUNDED_CAP" });
    }
  }
  for (const asset of core) {
    if (asset.category === "HEART_FORGE") records.push({ id: asset.id, category: "HEART_FORGE", path: `public/assets/${asset.path}`, reason: "UNGENERATED_HEART_FORGE_RUNTIME_FALLBACK" });
  }
  if (records.length !== 873 || records.filter(({ category }) => category === "CANONICAL").length !== 837 || records.filter(({ category }) => category === "HEART_FORGE").length !== 36) throw new Error("FALLBACK_COUNT_DRIFT");
  if (T022_FAILED_IDS.some((id) => records.find((record) => record.id === id)?.reason !== "NO_REGENERATION_T022")) throw new Error("FORBIDDEN_REGENERATION_DRIFT");
  return records;
}

export function assertT022NoForbiddenRegeneration(ids: readonly string[]): void {
  const forbidden = ids.filter((id) => (T022_FAILED_IDS as readonly string[]).includes(id));
  if (forbidden.length > 0) throw new Error(`NO_REGENERATION_T022:${forbidden.join(",")}`);
}

function tolerance(asset: T022ExpectedAsset): number {
  return asset.aspect_ratio === "16:9" ? 12_500 : 5_000;
}

function scanRoot(root: string): Array<{ path: string; type: "file" | "directory" | "symlink" | "other" }> {
  if (!existsSync(root)) throw new Error(`MISSING_ROOT:${root}`);
  if (lstatSync(root).isSymbolicLink()) throw new Error(`SYMLINK:${root}`);
  const result: Array<{ path: string; type: "file" | "directory" | "symlink" | "other" }> = [];
  const visit = (absolute: string) => {
    for (const name of readdirSync(absolute)) {
      const child = resolve(absolute, name);
      const offset = relative(root, child).split(sep).join("/");
      const info = lstatSync(child);
      if (info.isSymbolicLink()) result.push({ path: offset, type: "symlink" });
      else if (info.isDirectory()) { result.push({ path: offset, type: "directory" }); visit(child); }
      else if (info.isFile()) result.push({ path: offset, type: "file" });
      else result.push({ path: offset, type: "other" });
    }
  };
  visit(root);
  return result;
}

export interface T022AuditOptions { verifyBackups: boolean; isolatedRestoreRead?: boolean; verifyPublicScope?: boolean }

export function auditT022Inventory(root: string, assets: readonly T022ExpectedAsset[], options: T022AuditOptions): T022AssetRecord[] {
  assertUniqueExpected(assets);
  const expectedByBackup = new Map<string, Set<string>>();
  for (const asset of assets) {
    const paths = expectedByBackup.get(asset.backup_root) ?? new Set<string>();
    paths.add(asset.path);
    expectedByBackup.set(asset.backup_root, paths);
  }
  if (options.verifyBackups) {
    for (const [backupRoot, paths] of expectedByBackup) {
      const entries = scanRoot(resolve(root, backupRoot));
      const bad = entries.filter((entry) => entry.type === "symlink" || entry.type === "other" || (entry.type === "file" && !paths.has(entry.path)));
      if (bad.length > 0) throw new Error(`UNEXPECTED_BACKUP_ENTRY:${backupRoot}/${bad[0].path}:${bad[0].type}`);
      const actualFiles = new Set(entries.filter(({ type }) => type === "file").map(({ path }) => path));
      for (const path of paths) if (!actualFiles.has(path)) throw new Error(`MISSING_BACKUP:${backupRoot}/${path}`);
    }
  }
  if (options.verifyPublicScope) {
    const style = readJson<{ candidates: Array<{ path: string }> }>(root, "assets/manifests/style-candidates-v2.json").candidates.map(({ path }) => path);
    const allowed = new Set([...assets.map(({ path }) => path), ...style]);
    const entries = scanRoot(resolve(root, "public/assets"));
    const files = entries.filter(({ type }) => type === "file");
    const bad = entries.filter((entry) => entry.type === "symlink" || entry.type === "other" || (entry.type === "file" && !allowed.has(entry.path)));
    if (bad.length > 0) throw new Error(`UNEXPECTED_PUBLIC_ENTRY:${bad[0].path}:${bad[0].type}`);
    if (files.length !== 625 || style.length !== 4 || style.some((path) => !files.some((file) => file.path === path))) throw new Error("PUBLIC_SCOPE_COUNT_DRIFT");
  }
  const contentHashes = new Set<string>();
  const records: T022AssetRecord[] = [];
  const restoreRoot = options.verifyBackups && options.isolatedRestoreRead ? mkdtempSync(resolve(tmpdir(), "fictor-t022-restore-")) : undefined;
  try {
    for (const asset of assets) {
      const publicBytes = readFileSync(safeResolve(resolve(root, "public/assets"), asset.path));
      const checked = inspectPng(publicBytes, asset.aspect_ratio, undefined, tolerance(asset));
      if (contentHashes.has(checked.sha256)) throw new Error(`DUPLICATE_CONTENT:${asset.id}:${checked.sha256}`);
      contentHashes.add(checked.sha256);
      if (options.verifyBackups) {
        const backup = verifyExistingPng(resolve(root, asset.backup_root), asset.path, asset.aspect_ratio, checked.sha256, undefined, tolerance(asset));
        if (backup.size !== checked.size || backup.width !== checked.width || backup.height !== checked.height) throw new Error(`BACKUP_MISMATCH:${asset.id}`);
        if (restoreRoot) {
          const restored = atomicWriteVerifiedPng(restoreRoot, asset.path, readFileSync(safeResolve(resolve(root, asset.backup_root), asset.path)), asset.aspect_ratio, undefined, tolerance(asset));
          verifyExistingPng(restoreRoot, asset.path, asset.aspect_ratio, checked.sha256, undefined, tolerance(asset));
          rmSync(restored.path);
        }
      }
      records.push({
        id: asset.id, category: asset.category, source_task: asset.source_task,
        public_path: `public/assets/${asset.path}`, backup_root: asset.backup_root, backup_path: asset.path,
        sha256: checked.sha256, bytes: checked.size, width: checked.width, height: checked.height,
        aspect_ratio: asset.aspect_ratio, aspect_error_ppm: checked.aspect_error_ppm,
      });
    }
  } finally {
    if (restoreRoot) rmSync(restoreRoot, { recursive: true, force: true });
  }
  return records;
}

function listHash(records: readonly unknown[]): string {
  return sha256T022(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function evidence(root: string, paths: readonly string[]): EvidenceHash[] {
  return paths.map((path) => ({ path, sha256: sha256T022(readFileSync(resolve(root, path))) }));
}

function decimal(units: number): string {
  return `${Math.floor(units / 100)}.${String(units % 100).padStart(2, "0")}`;
}

type T022FinalStatus = "completed" | "failed";

interface T022NormalizedJob {
  index: number;
  asset_id: string;
  job_id: string;
  canonical_request_sha256: string;
  request_use_unlim: false;
  final_status: T022FinalStatus;
  model: string;
  recovery_sha256: string | null;
}

interface T022NormalizedBatch {
  task: T022BatchLedger["task"];
  batch_id: string;
  final_state: string;
  all_terminal: true;
  submitted: number;
  charged: number;
  recovered: number;
  balance_before_decimal: string;
  balance_after_decimal: string;
  spend_decimal: string;
  paid_retry_count: number;
  use_unlim: false;
  jobs: T022NormalizedJob[];
}

export interface T022T016Forensic {
  schema_version: 1;
  evidence_version: "t016-canonical-cards-final-forensic-v1";
  verified_at: typeof T022_VERIFIED_AT;
  source_journal_path: "assets/runs/t016-canonical-cards/operations-v1.json";
  source_journal_sha256: string;
  sanitization: "ALLOWLIST_ONLY_SCAN_PASSED";
  run_state: string;
  expected_model: string;
  paid_retry_count: number;
  use_unlim: false;
  batches_sha256: string;
  batches: T022NormalizedBatch[];
  totals: { batches: number; submitted: number; charged: number; recovered: number; uncharged_failures: number; spend_decimal: string; balance_start_decimal: string; balance_end_decimal: string };
}

interface RawJournal {
  run_state: string;
  paid_retry_count: number;
  redacted: boolean;
  expected_provider_reported_model: string;
  initial_balance: { normalized_decimal: string };
  batches: Array<{
    batch_id: string; state: string; asset_ids: string[];
    submission: null | { submitted_count: number; jobs: Array<{ index: number; asset_id: string; job_id: string; canonical_request_sha256: string }> };
    job_polls: Array<{ all_terminal: boolean; jobs: Array<{ index: number; job_id: string; status: string; model: string | null }> }>;
    recoveries: Array<{ asset_id: string; provider_job_index: number; provider_job_id: string; sha256: string }>;
    discharges: Array<{ observed_delta_units: number; balance_after_loss: { normalized_decimal: string } }>;
    balance_after: null | { normalized_decimal: string; delta_units: number; charged_job_count: number };
  }>;
  legacy_recovery?: { recoveries: Array<{ asset_id: string; provider_job_index: number; provider_job_id: string; sha256: string }> };
}

const FORENSIC_FORBIDDEN = /https?:\/\/|result_url|thumbnail_url|raw_error|hostname|authorization|bearer|api[_-]?key|access[_-]?key|session[_-]?token|signed[_-]?url|cookie|email/i;

export function assertT022ForensicSafe(value: unknown): void {
  if (FORENSIC_FORBIDDEN.test(JSON.stringify(value))) throw new Error("FORENSIC_SENSITIVE_VALUE");
}

function planByIndex(root: string, planPath: string): Map<number, PlanAsset> {
  const assets = selectPlanAssets(root, planPath);
  return new Map(assets.map((asset, offset) => [asset.index ?? offset, asset]));
}

function normalizeJournalBatches(
  root: string,
  task: T022BatchLedger["task"],
  journal: RawJournal,
  planPath: string,
  options: { onlySubmitted?: boolean; recoveryOverride?: Map<string, RawJournal["batches"][number]["recoveries"]> } = {},
): T022NormalizedBatch[] {
  if (journal.redacted !== true || journal.paid_retry_count !== 0 || !journal.expected_provider_reported_model) throw new Error(`FINAL_FORENSIC_HEADER_DRIFT:${task}`);
  const plans = planByIndex(root, planPath);
  let before = journal.initial_balance.normalized_decimal;
  const batches: T022NormalizedBatch[] = [];
  for (const record of journal.batches) {
    if (!record.submission) { if (options.onlySubmitted !== false) continue; throw new Error(`MISSING_FINAL_SUBMISSION:${record.batch_id}`); }
    const finalPollRecord = record.job_polls.at(-1);
    if (!finalPollRecord || finalPollRecord.all_terminal !== true) throw new Error(`NON_TERMINAL_FINAL_POLL:${record.batch_id}`);
    const finalPoll = finalPollRecord.jobs;
    const recoveries = options.recoveryOverride?.get(record.batch_id) ?? record.recoveries;
    const recoveryByIndex = new Map(recoveries.map((item) => [item.provider_job_index, item]));
    const pollByIndex = new Map(finalPoll.map((item) => [item.index, item]));
    const jobs = record.submission.jobs.map((job): T022NormalizedJob => {
      const plan = plans.get(job.index);
      const poll = pollByIndex.get(job.index);
      const recovery = recoveryByIndex.get(job.index);
      if (!plan || plan.id !== job.asset_id || plan.canonical_request_sha256 !== job.canonical_request_sha256 || plan.request?.params?.use_unlim !== false) throw new Error(`FINAL_FORENSIC_PLAN_BINDING_DRIFT:${job.asset_id}`);
      if (!poll || poll.job_id !== job.job_id || poll.model !== journal.expected_provider_reported_model) throw new Error(`FINAL_FORENSIC_JOB_BINDING_DRIFT:${job.asset_id}`);
      if (poll.status !== "completed" && poll.status !== "failed") throw new Error(`NON_TERMINAL_FINAL_STATUS:${job.asset_id}`);
      if ((poll.status === "completed") !== Boolean(recovery) || (recovery && (recovery.asset_id !== job.asset_id || recovery.provider_job_id !== job.job_id))) throw new Error(`FINAL_FORENSIC_RECOVERY_DRIFT:${job.asset_id}`);
      return { index: job.index, asset_id: job.asset_id, job_id: job.job_id, canonical_request_sha256: job.canonical_request_sha256, request_use_unlim: false, final_status: poll.status, model: poll.model, recovery_sha256: recovery?.sha256 ?? null };
    });
    if (record.submission.submitted_count !== jobs.length) throw new Error(`FINAL_FORENSIC_SUBMISSION_DRIFT:${record.batch_id}`);
    const discharge = record.discharges.at(-1);
    const after = record.balance_after?.normalized_decimal ?? discharge?.balance_after_loss.normalized_decimal;
    const deltaUnits = record.balance_after?.delta_units ?? discharge?.observed_delta_units;
    const charged = record.balance_after?.charged_job_count ?? (deltaUnits === undefined ? undefined : deltaUnits / 150);
    if (!after || charged === undefined || !Number.isInteger(charged)) throw new Error(`FINAL_FORENSIC_BALANCE_DRIFT:${record.batch_id}`);
    const recovered = jobs.filter(({ recovery_sha256 }) => recovery_sha256 !== null).length;
    batches.push({ task, batch_id: record.batch_id, final_state: record.state, all_terminal: true, submitted: jobs.length, charged, recovered, balance_before_decimal: before, balance_after_decimal: after, spend_decimal: decimal(charged * 150), paid_retry_count: journal.paid_retry_count, use_unlim: false, jobs });
    before = after;
  }
  return batches;
}

export function buildT022T016Forensic(root: string): T022T016Forensic {
  const journalPath = "assets/runs/t016-canonical-cards/operations-v1.json" as const;
  const journalBytes = readFileSync(resolve(root, journalPath));
  const journal = JSON.parse(journalBytes.toString("utf8")) as RawJournal;
  const batches = normalizeJournalBatches(root, "T016", journal, "assets/manifests/t016-canonical-cards-v1.plan.json");
  const submitted = batches.reduce((sum, batch) => sum + batch.submitted, 0);
  const charged = batches.reduce((sum, batch) => sum + batch.charged, 0);
  const recovered = batches.reduce((sum, batch) => sum + batch.recovered, 0);
  const failures = batches.flatMap(({ jobs }) => jobs.filter(({ final_status }) => final_status === "failed").map(({ asset_id }) => asset_id));
  if (batches.length !== 14 || submitted !== 160 || charged !== 157 || recovered !== 157 || JSON.stringify(failures) !== JSON.stringify(T022_FAILED_IDS) || journal.run_state !== "CLOSED_WITH_LOSSES" || journal.expected_provider_reported_model !== "nano_banana_flash") throw new Error("T016_FINAL_FORENSIC_CONTRACT_DRIFT");
  const value: T022T016Forensic = {
    schema_version: 1, evidence_version: "t016-canonical-cards-final-forensic-v1", verified_at: T022_VERIFIED_AT,
    source_journal_path: journalPath, source_journal_sha256: sha256T022(journalBytes), sanitization: "ALLOWLIST_ONLY_SCAN_PASSED",
    run_state: journal.run_state, expected_model: journal.expected_provider_reported_model, paid_retry_count: journal.paid_retry_count, use_unlim: false,
    batches_sha256: listHash(batches), batches,
    totals: { batches: batches.length, submitted, charged, recovered, uncharged_failures: failures.length, spend_decimal: decimal(charged * 150), balance_start_decimal: batches[0].balance_before_decimal, balance_end_decimal: batches.at(-1)!.balance_after_decimal },
  };
  assertT022ForensicSafe(value);
  return value;
}

export function validateT022T016Forensic(value: T022T016Forensic, root?: string): T022NormalizedBatch[] {
  assertT022ForensicSafe(value);
  if (value.schema_version !== 1 || value.evidence_version !== "t016-canonical-cards-final-forensic-v1" || value.verified_at !== T022_VERIFIED_AT || value.sanitization !== "ALLOWLIST_ONLY_SCAN_PASSED" || value.run_state !== "CLOSED_WITH_LOSSES" || value.expected_model !== "nano_banana_flash" || value.paid_retry_count !== 0 || value.use_unlim !== false) throw new Error("T016_FORENSIC_HEADER_DRIFT");
  if (value.batches_sha256 !== listHash(value.batches)) throw new Error("T016_FORENSIC_LIST_HASH_DRIFT");
  let before = value.batches[0]?.balance_before_decimal;
  const seenIds = new Set<string>();
  const seenJobs = new Set<string>();
  const plans = root ? planByIndex(root, "assets/manifests/t016-canonical-cards-v1.plan.json") : undefined;
  for (const batch of value.batches) {
    if (batch.balance_before_decimal !== before || batch.all_terminal !== true || batch.use_unlim !== false || batch.paid_retry_count !== 0 || batch.jobs.length !== batch.submitted || batch.jobs.filter(({ recovery_sha256 }) => recovery_sha256 !== null).length !== batch.recovered || batch.spend_decimal !== decimal(batch.charged * 150)) throw new Error(`T016_FORENSIC_BATCH_DRIFT:${batch.batch_id}`);
    if (Math.round((Number(batch.balance_before_decimal) - Number(batch.balance_after_decimal)) * 100) !== batch.charged * 150) throw new Error(`T016_FORENSIC_BALANCE_DRIFT:${batch.batch_id}`);
    const expectedState = ["canonical-selected-003", "canonical-selected-008"].includes(batch.batch_id) ? "FAIL_STOP" : "COMPLETE";
    if (batch.final_state !== expectedState) throw new Error(`T016_FORENSIC_STATE_DRIFT:${batch.batch_id}`);
    const responseJobs = root ? readJson<{ jobs: Array<{ index: number; job_id: string }> }>(root, `assets/evidence/t016-canonical-cards-b${Number(batch.batch_id.slice(-3))}-response.json`).jobs : undefined;
    for (const job of batch.jobs) {
      if (seenIds.has(job.asset_id) || seenJobs.has(job.job_id) || job.request_use_unlim !== false || job.model !== value.expected_model || !/^[a-f0-9]{64}$/.test(job.canonical_request_sha256) || (job.recovery_sha256 !== null && !/^[a-f0-9]{64}$/.test(job.recovery_sha256)) || (job.final_status !== "completed" && job.final_status !== "failed") || ((job.final_status === "completed") !== (job.recovery_sha256 !== null))) throw new Error(`T016_FORENSIC_JOB_DRIFT:${job.asset_id}`);
      if (root) {
        const plan = plans!.get(job.index);
        const response = responseJobs!.find(({ index }) => index === job.index);
        if (!plan || plan.id !== job.asset_id || plan.canonical_request_sha256 !== job.canonical_request_sha256 || plan.request?.params?.use_unlim !== false || !response || response.job_id !== job.job_id) throw new Error(`T016_FORENSIC_BINDING_DRIFT:${job.asset_id}`);
        if (job.recovery_sha256 !== null && sha256T022(readFileSync(safeResolve(resolve(root, "public/assets"), plan.path))) !== job.recovery_sha256) throw new Error(`T016_FORENSIC_RECOVERY_SHA_DRIFT:${job.asset_id}`);
      }
      seenIds.add(job.asset_id); seenJobs.add(job.job_id);
    }
    before = batch.balance_after_decimal;
  }
  const submitted = value.batches.reduce((sum, batch) => sum + batch.submitted, 0);
  const charged = value.batches.reduce((sum, batch) => sum + batch.charged, 0);
  const recovered = value.batches.reduce((sum, batch) => sum + batch.recovered, 0);
  const failures = value.batches.flatMap(({ jobs }) => jobs.filter(({ final_status }) => final_status === "failed").map(({ asset_id }) => asset_id));
  const totals = { batches: value.batches.length, submitted, charged, recovered, uncharged_failures: failures.length, spend_decimal: decimal(charged * 150), balance_start_decimal: value.batches[0]?.balance_before_decimal, balance_end_decimal: value.batches.at(-1)?.balance_after_decimal };
  if (JSON.stringify(totals) !== JSON.stringify(value.totals) || value.batches.length !== 14 || submitted !== 160 || charged !== 157 || recovered !== 157 || JSON.stringify(failures) !== JSON.stringify(T022_FAILED_IDS) || value.totals.balance_start_decimal !== "243.90" || value.totals.balance_end_decimal !== "8.40") throw new Error("T016_FORENSIC_TOTAL_DRIFT");
  return value.batches;
}

function parseCredits(root: string, path: string): number {
  const credits = readJson<{ credits: number }>(root, path).credits;
  if (!Number.isFinite(credits)) throw new Error(`INVALID_BALANCE:${path}`);
  return Math.round(credits * 100);
}

export function buildT022Ledger(root: string): T022BatchLedger[] {
  const t020v1Path = "assets/evidence/t020-world-art-v1-final-journal-forensic.json";
  const t020v2Path = "assets/evidence/t020-world-art-v2-final-journal-forensic.json";
  const t021Path = "assets/evidence/t021-event-art-v1-final-journal-forensic.json";
  const t019Path = "assets/evidence/t019-heart-cards-v1-final-journal-forensic.json";
  const t020v1 = readJson<RawJournal>(root, t020v1Path);
  const t020v2 = readJson<RawJournal>(root, t020v2Path);
  const legacy = t020v2.legacy_recovery?.recoveries;
  if (!legacy || legacy.length !== 6) throw new Error("T020_LEGACY_FINAL_FORENSIC_DRIFT");
  const t016Forensic = readJson<T022T016Forensic>(root, T022_T016_FORENSIC_PATH);
  const normalized: T022NormalizedBatch[] = [
    ...normalizeJournalBatches(root, "T020", t020v1, "assets/manifests/t020-world-art-v1.plan.json", { recoveryOverride: new Map([["world-art-001", legacy]]) }),
    ...normalizeJournalBatches(root, "T020", t020v2, "assets/manifests/t020-world-art-v2.plan.json"),
    ...normalizeJournalBatches(root, "T021", readJson<RawJournal>(root, t021Path), "assets/manifests/t021-event-art-v1.plan.json"),
    ...normalizeJournalBatches(root, "T019", readJson<RawJournal>(root, t019Path), "assets/manifests/t019-heart-cards-v1.plan.json"),
    ...validateT022T016Forensic(t016Forensic, root),
  ];
  const taskForensic: Record<T022BatchLedger["task"], string> = { T020: t020v2Path, T021: t021Path, T019: t019Path, T016: T022_T016_FORENSIC_PATH };
  return normalized.map((finalBatch) => {
    let prefix: string;
    let suffixV1 = "";
    let loss = false;
    if (finalBatch.batch_id === "world-art-001") { prefix = "assets/evidence/t020-world-art-b1"; suffixV1 = "-v1"; loss = true; }
    else if (finalBatch.batch_id.startsWith("world-art-v2-")) prefix = `assets/evidence/t020-world-art-v2-b${Number(finalBatch.batch_id.slice(-3))}`;
    else if (finalBatch.batch_id.startsWith("event-art-")) prefix = `assets/evidence/t021-event-art-b${Number(finalBatch.batch_id.slice(-3))}`;
    else if (finalBatch.batch_id === "heart-cards-001") prefix = "assets/evidence/t019-heart-cards-b1";
    else if (finalBatch.batch_id.startsWith("canonical-selected-")) { prefix = `assets/evidence/t016-canonical-cards-b${Number(finalBatch.batch_id.slice(-3))}`; loss = finalBatch.jobs.some(({ final_status }) => final_status === "failed"); }
    else throw new Error(`UNKNOWN_FINAL_BATCH:${finalBatch.batch_id}`);
    const costsPath = `${prefix}-costs${suffixV1}.json`;
    const beforePath = `${prefix}-preflight-balance${suffixV1}.json`;
    const responsePath = `${prefix}-response${suffixV1}.json`;
    const afterPath = loss ? `${prefix}-loss-balance${suffixV1}.json` : `${prefix}-balance-after.json`;
    const costs = readJson<{ costs: Array<{ cost: { credits_exact: number }; index: number }> }>(root, costsPath).costs;
    const response = readJson<{ submitted_count: number; jobs: Array<{ index: number }> }>(root, responsePath);
    if (costs.length !== finalBatch.submitted || costs.some(({ cost }) => cost.credits_exact !== 1.5)) throw new Error(`COST_EVIDENCE_DRIFT:${finalBatch.batch_id}`);
    if (response.submitted_count !== finalBatch.submitted || response.jobs.length !== finalBatch.submitted) throw new Error(`SUBMISSION_EVIDENCE_DRIFT:${finalBatch.batch_id}`);
    if (decimal(parseCredits(root, beforePath)) !== finalBatch.balance_before_decimal || decimal(parseCredits(root, afterPath)) !== finalBatch.balance_after_decimal) throw new Error(`BALANCE_EVIDENCE_DRIFT:${finalBatch.batch_id}`);
    if (Math.round((Number(finalBatch.balance_before_decimal) - Number(finalBatch.balance_after_decimal)) * 100) !== finalBatch.charged * 150) throw new Error(`CHARGE_EVIDENCE_DRIFT:${finalBatch.batch_id}`);
    const failures = finalBatch.jobs.filter(({ final_status }) => final_status === "failed").map(({ asset_id }) => asset_id);
    const models = [...new Set(finalBatch.jobs.map(({ model }) => model))];
    if (models.length !== 1 || models[0] !== "nano_banana_flash" || finalBatch.paid_retry_count !== 0 || finalBatch.use_unlim !== false) throw new Error(`FINAL_POLICY_EVIDENCE_DRIFT:${finalBatch.batch_id}`);
    const forensicPaths = finalBatch.batch_id === "world-art-001" ? [t020v1Path, t020v2Path] : [taskForensic[finalBatch.task]];
    return {
      task: finalBatch.task, batch_id: finalBatch.batch_id, submitted: finalBatch.submitted, charged: finalBatch.charged, recovered: finalBatch.recovered,
      uncharged_failures: failures, spend_decimal: finalBatch.spend_decimal, balance_before_decimal: finalBatch.balance_before_decimal, balance_after_decimal: finalBatch.balance_after_decimal,
      unit_cost_source: "credits_exact", use_unlim: false, paid_retry_count: 0, final_state: finalBatch.final_state, models: ["nano_banana_flash"],
      recovery_sha256: finalBatch.jobs.flatMap(({ recovery_sha256 }) => recovery_sha256 ? [recovery_sha256] : []),
      source_evidence: evidence(root, [...forensicPaths, costsPath, beforePath, responsePath, afterPath]),
    };
  });
}

export function buildT022Manifest(root: string, verifiedAt: string, verifyBackups: boolean): T022Manifest {
  assertExactDate(verifiedAt);
  const inventory = buildT022ExpectedInventory(root);
  const records = auditT022Inventory(root, inventory, { verifyBackups, isolatedRestoreRead: verifyBackups, verifyPublicScope: true });
  const fallback = buildT022Fallback(root, inventory);
  const ledger = buildT022Ledger(root);
  const sums = ledger.reduce((all, batch) => ({ submitted: all.submitted + batch.submitted, charged: all.charged + batch.charged, recovered: all.recovered + batch.recovered, failed: all.failed + batch.uncharged_failures.length, spend: all.spend + Math.round(Number(batch.spend_decimal) * 100) }), { submitted: 0, charged: 0, recovered: 0, failed: 0, spend: 0 });
  const taskUnits = ledger.reduce<Record<T022BatchLedger["task"], number>>((all, batch) => ({ ...all, [batch.task]: all[batch.task] + Math.round(Number(batch.spend_decimal) * 100) }), { T020: 0, T021: 0, T019: 0, T016: 0 });
  const failureIds = ledger.flatMap(({ uncharged_failures }) => uncharged_failures);
  const continuity = ledger.slice(1).every((batch, index) => batch.balance_before_decimal === ledger[index].balance_after_decimal);
  const publicHashes = new Set(records.map(({ sha256 }) => sha256));
  const recoveryHashes = ledger.flatMap(({ recovery_sha256 }) => recovery_sha256);
  if (ledger.length !== 22 || sums.submitted !== 240 || sums.charged !== 237 || sums.recovered !== 237 || sums.failed !== 3 || sums.spend !== 35_550 || recoveryHashes.length !== 237 || recoveryHashes.some((hash) => !publicHashes.has(hash)) || ledger[0]?.balance_before_decimal !== "363.90" || ledger.at(-1)?.balance_after_decimal !== "8.40" || !continuity || JSON.stringify(failureIds) !== JSON.stringify(T022_FAILED_IDS) || taskUnits.T020 !== 8_100 || taskUnits.T021 !== 3_000 || taskUnits.T019 !== 900 || taskUnits.T016 !== 23_550 || ledger.some(({ use_unlim, paid_retry_count, models }) => use_unlim !== false || paid_retry_count !== 0 || models[0] !== "nano_banana_flash")) throw new Error("LEDGER_CONTRACT_DRIFT");
  const taskSpend = { T020: decimal(taskUnits.T020), T021: decimal(taskUnits.T021), T019: decimal(taskUnits.T019), T016: decimal(taskUnits.T016) } as T022Manifest["generation_cap_window"]["task_spend"];
  return {
    schema_version: 1, audit_version: "t022-m2-assets-audit-v1", contract_sha256: T022_CONTRACT_SHA256,
    verified_at: verifiedAt, verify_by: T022_VERIFY_BY, status: "VERIFIED",
    scope: { repository_png_count: 625, audited_asset_count: 621, out_of_scope_style_count: 4, cards: { total: 547, material: 52, canonical: 489, heart: 6 }, world: { total: 74, background: 18, enemy: 30, elite: 6, event: 20 } },
    source_files: SOURCE_PATHS.map((path) => ({ path, sha256: sha256T022(readFileSync(resolve(root, path))) })),
    assets: { list_encoding: "ORDERED_JSON_RECORDS_JOINED_BY_LF_WITH_TRAILING_LF", list_sha256: listHash(records), records },
    fallback: { count: 873, canonical: 837, heart_forge: 36, list_encoding: "ORDERED_JSON_RECORDS_JOINED_BY_LF_WITH_TRAILING_LF", list_sha256: listHash(fallback), records: fallback },
    forbidden_regeneration: { state: "NO_REGENERATION_T022", ids: [...T022_FAILED_IDS] },
    integrity: { missing: 0, damaged: 0, public_backup_mismatch: 0, duplicate_ids: 0, duplicate_paths: 0, duplicate_content_hashes: 0, unexpected_backup_entries: 0 },
    backup_status: { status: "VERIFIED_LOCALLY_AT", verified_at: verifiedAt, public_backup_pairs: 621, isolated_restore_reads: 621, presence_reverified_in_ci: false, trust_boundary: "Backup presence and isolated restore-read were verified only on the recording workstation at verified_at; CI re-verifies tracked public bytes and metadata but does not claim ignored backup presence." },
    provider: { t022_generation_calls: 0, t022_spend_decimal: "0.00", regeneration_of_failed_ids: false },
    generation_cap_window: { name: "M2_AFTER_T015_ENDING_BALANCE_363_90", cap_decimal: "360.00", spend_decimal: decimal(sums.spend) as "355.50", balance_start_decimal: ledger[0].balance_before_decimal as "363.90", balance_end_decimal: ledger.at(-1)!.balance_after_decimal as "8.40", task_spend: taskSpend, batches: ledger.length as 22, submitted: sums.submitted as 240, charged: sums.charged as 237, recovered: sums.recovered as 237, uncharged_failures: sums.failed as 3, credits_exact_only: true, use_unlim: false, paid_retry_count: 0, ledger },
  };
}

export function buildT022Milestone(manifestBytes: string, manifest: T022Manifest): T022Milestone {
  return {
    schema_version: 1, milestone_id: "M2", phase: "PHASE_0_5_ASSETS", task_key: "T022", status: "VERIFIED",
    contract_sha256: T022_CONTRACT_SHA256, verified_at: manifest.verified_at, audit_manifest_path: T022_MANIFEST_PATH,
    audit_manifest_file_sha256: sha256T022(manifestBytes), counts: { audited: 621, repository_png: 625, style_out_of_scope: 4, fallback: 873 },
    trust_boundary: { public_bytes_reverified_in_ci: true, backup_presence_reverified_in_ci: false, backup_status: "VERIFIED_LOCALLY_AT" },
  };
}

export function writeT022NoClobber(root: string, path: string, bytes: string): "CREATED" | "IDENTICAL" {
  const state = checkT022NoClobber(root, path, bytes);
  if (state === "IDENTICAL") return state;
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { encoding: "utf8", flag: "wx" });
  return "CREATED";
}

export function checkT022NoClobber(root: string, path: string, bytes: string): "CREATE" | "IDENTICAL" {
  const target = resolve(root, path);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`REBASELINE_REQUIRED:${path}`);
    if (readFileSync(target, "utf8") !== bytes) throw new Error(`REBASELINE_REQUIRED:${path}`);
    return "IDENTICAL";
  }
  return "CREATE";
}

function comparableForCheck(manifest: T022Manifest): T022Manifest {
  return { ...manifest, backup_status: { ...manifest.backup_status, presence_reverified_in_ci: false } };
}

export function checkT022Recorded(root: string): { audited: 621; fallback: 873; backup_presence_reverified: false; manifest_sha256: string } {
  const manifestBytes = readFileSync(resolve(root, T022_MANIFEST_PATH), "utf8");
  const manifest = JSON.parse(manifestBytes) as T022Manifest;
  const milestone = readJson<T022Milestone>(root, T022_MILESTONE_PATH);
  if (manifest.contract_sha256 !== T022_CONTRACT_SHA256 || manifest.verified_at !== T022_VERIFIED_AT) throw new Error("TAMPERED_T022_MANIFEST_HEADER");
  const expected = buildT022Manifest(root, manifest.verified_at, false);
  const manifestSha = sha256T022(manifestBytes);
  verifyT022RecordedBytes(manifestBytes, milestone, expected, T022_EXPECTED_MANIFEST_SHA256);
  return { audited: 621, fallback: 873, backup_presence_reverified: false, manifest_sha256: manifestSha };
}

export function verifyT022RecordedBytes(
  manifestBytes: string,
  milestone: T022Milestone,
  expected: T022Manifest,
  pinnedManifestSha256: string,
): void {
  const manifest = JSON.parse(manifestBytes) as T022Manifest;
  if (manifest.assets.list_sha256 !== listHash(manifest.assets.records) || manifest.fallback.list_sha256 !== listHash(manifest.fallback.records)) throw new Error("TAMPERED_T022_INTERNAL_HASH");
  if (renderT022Json(comparableForCheck(manifest)) !== renderT022Json(comparableForCheck(expected))) throw new Error("TAMPERED_T022_MANIFEST");
  const expectedMilestone = buildT022Milestone(manifestBytes, manifest);
  if (renderT022Json(milestone) !== renderT022Json(expectedMilestone)) throw new Error("TAMPERED_T022_MILESTONE");
  if (pinnedManifestSha256 !== "PENDING_T022_RECORD" && sha256T022(manifestBytes) !== pinnedManifestSha256) throw new Error("TAMPERED_T022_MANIFEST_AND_MILESTONE");
}
