import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  acquireRunnerLock,
  assertNonOverlappingRoots,
  atomicWriteJson,
  atomicWriteVerifiedPng,
  backupVerifiedFile,
  safeResolve,
  verifyExistingPng,
} from "./filesystem";
import { planSha256, validatePlanManifest } from "./manifest";
import { redactError } from "./redaction";
import {
  ASSET_PLAN_VERSION,
  BATCH_RUN_STATES,
  type AssetPlanManifest,
  type AssetProvider,
  type AssetRecoveryRecord,
  type BatchAttempt,
  type BatchRunRecord,
  type MaterialApprovalEvidence,
  type PlannedAsset,
  type PlannedBatch,
  type RunLedger,
} from "./types";

export const MAX_ATTEMPTS = 4;
const DECIMAL = /^(0|[1-9]\d*)\.\d{2}$/;
const REMOTE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ASSET_RECOVERY_STATES = new Set(["PLANNED", "DOWNLOADING", "LOCAL_VERIFIED", "BACKING_UP", "COMPLETE"]);

class CheckpointInterruption extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : "checkpoint interrupted");
  }
}

function rethrowCheckpointInterruption(error: unknown): void {
  if (error instanceof CheckpointInterruption) throw error;
}

export interface AssetRunnerOptions {
  plan: AssetPlanManifest;
  provider: AssetProvider;
  controlRoot: string;
  ledgerRelativePath: string;
  localRoot: string;
  backupRoot: string;
  lockRelativePath: string;
  runId: string;
  approvalEvidence?: MaterialApprovalEvidence;
  staleLockAfterMs?: number;
  maxPngBytes?: number;
  recoveryStore?: AssetRecoveryStore;
  ledgerStore?: LedgerStore;
  afterCheckpoint?: (batchId: string, state: BatchRunRecord["state"]) => void;
}

export interface AssetRecoveryStore {
  write(asset: PlannedAsset, bytes: Uint8Array): { sha256: string };
  backup(asset: PlannedAsset, expectedSha256: string): { sha256: string };
  verify(asset: PlannedAsset, location: "local" | "backup", expectedSha256: string): void;
}

export interface LedgerStore {
  load(): RunLedger | null;
  save(ledger: RunLedger): void;
}

export interface ApprovalMetadata {
  approved_by: string;
  approved_at: string;
  approval_reference: string;
}

class FileLedgerStore implements LedgerStore {
  constructor(private readonly root: string, private readonly relativePath: string) {}
  load(): RunLedger | null {
    const path = safeResolve(this.root, this.relativePath);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as RunLedger : null;
  }
  save(ledger: RunLedger): void {
    atomicWriteJson(this.root, this.relativePath, ledger);
  }
}

class FileRecoveryStore implements AssetRecoveryStore {
  constructor(private readonly options: AssetRunnerOptions) {}

  write(asset: PlannedAsset, bytes: Uint8Array) {
    return atomicWriteVerifiedPng(
      this.options.localRoot,
      asset.path,
      bytes,
      asset.aspect_ratio,
      this.options.maxPngBytes,
    );
  }

  backup(asset: PlannedAsset, expectedSha256: string) {
    return backupVerifiedFile(
      this.options.localRoot,
      this.options.backupRoot,
      asset.path,
      expectedSha256,
      asset.aspect_ratio,
      this.options.maxPngBytes,
    );
  }

  verify(asset: PlannedAsset, location: "local" | "backup", expectedSha256: string): void {
    verifyExistingPng(
      location === "local" ? this.options.localRoot : this.options.backupRoot,
      asset.path,
      asset.aspect_ratio,
      expectedSha256,
      this.options.maxPngBytes,
    );
  }
}

export function validateRunId(runId: string): void {
  if (!RUN_ID.test(runId) || runId === "." || runId === ".." || runId.includes("\0")) throw new Error("INVALID_RUN_ID");
}

function makeIdempotencyKey(planHash: string, runId: string, initialBatchId: string, attempt: number): string {
  return createHash("sha256")
    .update(`${ASSET_PLAN_VERSION}\0${planHash}\0${runId}\0${initialBatchId}\0${attempt}`, "utf8")
    .digest("hex");
}

function retryBatchId(initialBatchId: string, attempt: number): string {
  return attempt === 0 ? initialBatchId : `${initialBatchId}-retry-${attempt}`;
}

function assetRecords(batch: PlannedBatch): Record<string, AssetRecoveryRecord> {
  return Object.fromEntries(batch.asset_ids.map((assetId) => [assetId, { asset_id: assetId, state: "PLANNED" }]));
}

export function createRunLedger(plan: AssetPlanManifest, runId: string): RunLedger {
  validateRunId(runId);
  return {
    schema_version: 1,
    plan_version: ASSET_PLAN_VERSION,
    plan_sha256: planSha256(plan),
    run_id: runId,
    batches: Object.fromEntries(plan.batches.map((batch) => [batch.id, {
      initial_batch_id: batch.id,
      phase: batch.phase,
      state: "PLANNED",
      attempts: [],
      assets: assetRecords(batch),
    }])),
    successful: false,
  };
}

function currentAttempt(record: BatchRunRecord): BatchAttempt | undefined {
  return record.attempts.at(-1);
}

function expectedAssetIds(planBatch: PlannedBatch): Set<string> {
  return new Set(planBatch.asset_ids);
}

export function validateRunLedger(plan: AssetPlanManifest, ledger: RunLedger, runId: string): void {
  if (ledger.schema_version !== 1 || ledger.plan_version !== ASSET_PLAN_VERSION) throw new Error("INVALID_LEDGER");
  if (ledger.plan_sha256 !== planSha256(plan) || ledger.run_id !== runId) throw new Error("INVALID_LEDGER");
  const planBatchIds = plan.batches.map(({ id }) => id);
  if (Object.keys(ledger.batches).length !== planBatchIds.length || planBatchIds.some((id) => !ledger.batches[id])) {
    throw new Error("INVALID_LEDGER");
  }
  const seenJobIds = new Set<string>();
  const seenIdempotencyKeys = new Set<string>();
  const seenRemoteRefs = new Set<string>();
  for (const planBatch of plan.batches) {
    const record = ledger.batches[planBatch.id];
    if (record.initial_batch_id !== planBatch.id || record.phase !== planBatch.phase || !BATCH_RUN_STATES.includes(record.state)) {
      throw new Error("INVALID_LEDGER");
    }
    const expectedAssets = expectedAssetIds(planBatch);
    if (Object.keys(record.assets).length !== expectedAssets.size || Object.keys(record.assets).some((id) => !expectedAssets.has(id))) {
      throw new Error("INVALID_LEDGER");
    }
    if (record.attempts.length > MAX_ATTEMPTS) throw new Error("INVALID_LEDGER");
    record.attempts.forEach((attempt, index) => {
      if (attempt.attempt !== index || attempt.batch_id !== retryBatchId(planBatch.id, index) ||
          attempt.idempotency_key !== makeIdempotencyKey(ledger.plan_sha256, runId, planBatch.id, index) ||
          !BATCH_RUN_STATES.includes(attempt.state) || !DECIMAL.test(attempt.balance_before ?? "")) {
        throw new Error("INVALID_LEDGER");
      }
      if (seenIdempotencyKeys.has(attempt.idempotency_key)) throw new Error("INVALID_LEDGER");
      seenIdempotencyKeys.add(attempt.idempotency_key);
      if (attempt.job_id !== undefined) {
        if (!REMOTE_REF.test(attempt.job_id) || seenJobIds.has(attempt.job_id)) throw new Error("INVALID_LEDGER");
        seenJobIds.add(attempt.job_id);
      }
      if (index < record.attempts.length - 1 && attempt.state !== "RETRY_PENDING") throw new Error("INVALID_LEDGER");
      if (attempt.balance_after !== undefined && !DECIMAL.test(attempt.balance_after)) throw new Error("INVALID_LEDGER");
      if (attempt.remote_assets) {
        if (Object.keys(attempt.remote_assets).length !== expectedAssets.size ||
            Object.entries(attempt.remote_assets).some(([id, ref]) => !expectedAssets.has(id) || !REMOTE_REF.test(ref)) ||
            new Set(Object.values(attempt.remote_assets)).size !== expectedAssets.size) {
          throw new Error("INVALID_LEDGER");
        }
        for (const remoteRef of Object.values(attempt.remote_assets)) {
          if (seenRemoteRefs.has(remoteRef)) throw new Error("INVALID_LEDGER");
          seenRemoteRefs.add(remoteRef);
        }
      }
      if (!["SUBMITTING", "AMBIGUOUS_SUBMISSION"].includes(attempt.state) && !attempt.job_id) throw new Error("INVALID_LEDGER");
      if (["REMOTE_SUCCEEDED", "BALANCE_AFTER_VERIFIED", "DOWNLOADING", "LOCAL_VERIFIED", "BACKING_UP", "BACKUP_VERIFIED", "COMPLETE"].includes(attempt.state) && !attempt.remote_assets) {
        throw new Error("INVALID_LEDGER");
      }
      if (["BALANCE_AFTER_VERIFIED", "DOWNLOADING", "LOCAL_VERIFIED", "BACKING_UP", "BACKUP_VERIFIED", "COMPLETE"].includes(attempt.state) && !attempt.balance_after) {
        throw new Error("INVALID_LEDGER");
      }
      if (["RETRY_PENDING", "TERMINAL_FAILED"].includes(attempt.state) && !attempt.balance_after) throw new Error("INVALID_LEDGER");
      if (["REMOTE_FAILED", "RETRY_PENDING", "TERMINAL_FAILED"].includes(attempt.state) && !attempt.error_code) {
        throw new Error("INVALID_LEDGER");
      }
      if (attempt.error_code !== undefined && redactError(new Error(attempt.error_code)).code !== attempt.error_code) {
        throw new Error("INVALID_LEDGER");
      }
    });
    if (record.state === "PLANNED" && record.attempts.length !== 0) throw new Error("INVALID_LEDGER");
    if (record.state !== "PLANNED" && record.attempts.length === 0) throw new Error("INVALID_LEDGER");
    if (record.attempts.length > 0 && currentAttempt(record)!.state !== record.state) throw new Error("INVALID_LEDGER");
    if (record.error_code !== undefined && redactError(new Error(record.error_code)).code !== record.error_code) throw new Error("INVALID_LEDGER");
    for (const [assetId, asset] of Object.entries(record.assets)) {
      if (asset.asset_id !== assetId || !ASSET_RECOVERY_STATES.has(asset.state)) throw new Error("INVALID_LEDGER");
      if (asset.remote_ref !== undefined && !REMOTE_REF.test(asset.remote_ref)) throw new Error("INVALID_LEDGER");
      const currentRemoteRef = currentAttempt(record)?.remote_assets?.[assetId];
      if (asset.remote_ref !== undefined && asset.remote_ref !== currentRemoteRef) throw new Error("INVALID_LEDGER");
      if (currentRemoteRef !== undefined && asset.remote_ref !== currentRemoteRef) throw new Error("INVALID_LEDGER");
      if (asset.state !== "PLANNED" && !asset.remote_ref) throw new Error("INVALID_LEDGER");
      if (asset.state === "PLANNED" &&
          (asset.local_sha256 !== undefined || asset.backup_sha256 !== undefined)) {
        throw new Error("INVALID_LEDGER");
      }
      if (asset.state === "DOWNLOADING" &&
          (asset.local_sha256 !== undefined || asset.backup_sha256 !== undefined)) {
        throw new Error("INVALID_LEDGER");
      }
      if (["LOCAL_VERIFIED", "BACKING_UP", "COMPLETE"].includes(asset.state) && !/^[a-f0-9]{64}$/.test(asset.local_sha256 ?? "")) {
        throw new Error("INVALID_LEDGER");
      }
      if (["LOCAL_VERIFIED", "BACKING_UP"].includes(asset.state) && asset.backup_sha256 !== undefined) {
        throw new Error("INVALID_LEDGER");
      }
      if (asset.state === "COMPLETE" &&
          (!asset.remote_ref || !/^[a-f0-9]{64}$/.test(asset.local_sha256 ?? "") || asset.local_sha256 !== asset.backup_sha256)) {
        throw new Error("INVALID_LEDGER");
      }
    }
    if (record.state === "COMPLETE" || record.state === "BACKUP_VERIFIED") {
      const attempt = currentAttempt(record);
      if (!attempt?.job_id || !attempt.balance_after || !attempt.remote_assets ||
          Object.values(record.assets).some(({ state }) => state !== "COMPLETE")) {
        throw new Error("INVALID_LEDGER");
      }
    }
  }
  const complete = Object.values(ledger.batches).every(({ state }) => state === "COMPLETE");
  if (ledger.successful !== complete) throw new Error("INVALID_LEDGER");
}

export function readOrCreateLedger(
  plan: AssetPlanManifest,
  trustedRoot: string,
  relativePath: string,
  runId: string,
): RunLedger {
  const path = safeResolve(trustedRoot, relativePath);
  const ledger = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8")) as RunLedger
    : createRunLedger(plan, runId);
  validateRunLedger(plan, ledger, runId);
  return ledger;
}

function validateApprovalMetadata(metadata: ApprovalMetadata): void {
  const match = typeof metadata.approved_at === "string"
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(metadata.approved_at)
    : null;
  const values = match?.slice(1).map((value) => value === undefined || value === "+" || value === "-" ? value : Number(value));
  const year = values?.[0] as number | undefined;
  const month = values?.[1] as number | undefined;
  const day = values?.[2] as number | undefined;
  const hour = values?.[3] as number | undefined;
  const minute = values?.[4] as number | undefined;
  const second = values?.[5] as number | undefined;
  const offsetHour = values?.[7] as number | undefined;
  const offsetMinute = values?.[8] as number | undefined;
  const leapYear = year !== undefined && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const daysInMonth = month === undefined ? 0 : [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (typeof metadata.approved_by !== "string" || typeof metadata.approval_reference !== "string" ||
      !metadata.approved_by.trim() || !metadata.approval_reference.trim() ||
      metadata.approved_by.includes("\0") || metadata.approval_reference.includes("\0") ||
      !match || month! < 1 || month! > 12 || day! < 1 || day! > daysInMonth ||
      hour! > 23 || minute! > 59 || second! > 59 ||
      (offsetHour !== undefined && (offsetHour > 23 || offsetMinute! > 59)) ||
      !Number.isFinite(Date.parse(metadata.approved_at))) {
    throw new Error("INVALID_APPROVAL_METADATA");
  }
}

function materialBatches(plan: AssetPlanManifest) {
  return plan.batches.filter(({ phase }) => phase === "MATERIAL_APPROVAL");
}

export function createMaterialApprovalEvidence(
  plan: AssetPlanManifest,
  ledger: RunLedger,
  metadata: ApprovalMetadata,
): MaterialApprovalEvidence {
  validateApprovalMetadata(metadata);
  validateRunLedger(plan, ledger, ledger.run_id);
  const batches = materialBatches(plan);
  if (batches.length !== 5 || batches.some(({ id }) => ledger.batches[id].state !== "COMPLETE")) {
    throw new Error("MATERIAL_BATCHES_INCOMPLETE");
  }
  const materialAssetIds = batches.flatMap(({ asset_ids }) => asset_ids);
  return {
    schema_version: 1,
    plan_sha256: planSha256(plan),
    run_id: ledger.run_id,
    material_batch_ids: batches.map(({ id }) => id),
    material_asset_ids: materialAssetIds,
    asset_hashes: materialAssetIds.map((assetId) => {
      const batch = batches.find(({ asset_ids }) => asset_ids.includes(assetId))!;
      const recovery = ledger.batches[batch.id].assets[assetId];
      return { asset_id: assetId, local_sha256: recovery.local_sha256!, backup_sha256: recovery.backup_sha256! };
    }),
    ...metadata,
    approved: true,
  };
}

export function validateMaterialApprovalEvidence(
  plan: AssetPlanManifest,
  ledger: RunLedger,
  evidence: MaterialApprovalEvidence,
): void {
  const expected = createMaterialApprovalEvidence(plan, ledger, {
    approved_by: evidence.approved_by,
    approved_at: evidence.approved_at,
    approval_reference: evidence.approval_reference,
  });
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "undefined";
  };
  if (canonical(evidence) !== canonical(expected)) throw new Error("INVALID_APPROVAL_EVIDENCE");
}

export function verifyMaterialApprovalFiles(
  plan: AssetPlanManifest,
  ledger: RunLedger,
  localRoot: string,
  backupRoot: string,
  maxPngBytes?: number,
): void {
  assertNonOverlappingRoots(localRoot, backupRoot);
  const materialAssetIds = materialBatches(plan).flatMap(({ asset_ids }) => asset_ids);
  for (const assetId of materialAssetIds) {
    const asset = plan.assets.find(({ id }) => id === assetId);
    const batch = plan.batches.find(({ asset_ids }) => asset_ids.includes(assetId));
    if (!asset || !batch) throw new Error("INVALID_APPROVAL_EVIDENCE");
    const recovery = ledger.batches[batch.id].assets[assetId];
    verifyExistingPng(localRoot, asset.path, asset.aspect_ratio, recovery.local_sha256!, maxPngBytes);
    verifyExistingPng(backupRoot, asset.path, asset.aspect_ratio, recovery.backup_sha256!, maxPngBytes);
  }
}

export class AssetRunner {
  private readonly options: AssetRunnerOptions;
  private readonly recoveryStore: AssetRecoveryStore;
  private readonly ledgerStore: LedgerStore;
  private ledger!: RunLedger;

  constructor(options: AssetRunnerOptions) {
    this.options = options;
    this.recoveryStore = options.recoveryStore ?? new FileRecoveryStore(options);
    this.ledgerStore = options.ledgerStore ?? new FileLedgerStore(options.controlRoot, options.ledgerRelativePath);
  }

  private checkpoint(record: BatchRunRecord, state: BatchRunRecord["state"]): void {
    record.state = state;
    const attempt = currentAttempt(record);
    if (attempt) attempt.state = state;
    record.error_code = undefined;
    this.ledger.successful = Object.values(this.ledger.batches).every(({ state: itemState }) => itemState === "COMPLETE");
    this.ledgerStore.save(this.ledger);
    try {
      this.options.afterCheckpoint?.(record.initial_batch_id, state);
    } catch (error) {
      throw new CheckpointInterruption(error);
    }
  }

  private recordTransient(record: BatchRunRecord, error: unknown): void {
    record.error_code = redactError(error).code;
    const attempt = currentAttempt(record);
    if (attempt && record.state !== "REMOTE_FAILED") attempt.error_code = record.error_code;
    this.ledger.successful = false;
    this.ledgerStore.save(this.ledger);
  }

  private asset(id: string): PlannedAsset {
    const asset = this.options.plan.assets.find((item) => item.id === id);
    if (!asset) throw new Error("INVALID_PLAN");
    return asset;
  }

  private async startAttempt(planBatch: PlannedBatch, record: BatchRunRecord): Promise<BatchAttempt | null> {
    const attemptNumber = record.attempts.length;
    if (attemptNumber >= MAX_ATTEMPTS) throw new Error("INVALID_LEDGER");
    let balanceBefore: string;
    try {
      balanceBefore = await this.options.provider.balance();
      if (!DECIMAL.test(balanceBefore)) throw new Error("INVALID_BALANCE");
    } catch (error) {
      this.recordTransient(record, error);
      return null;
    }
    const attempt: BatchAttempt = {
      attempt: attemptNumber,
      batch_id: retryBatchId(planBatch.id, attemptNumber),
      idempotency_key: makeIdempotencyKey(this.ledger.plan_sha256, this.options.runId, planBatch.id, attemptNumber),
      state: "SUBMITTING",
      balance_before: balanceBefore,
    };
    record.attempts.push(attempt);
    this.checkpoint(record, "SUBMITTING");
    return attempt;
  }

  private request(planBatch: PlannedBatch, attempt: BatchAttempt) {
    return {
      batch_id: attempt.batch_id,
      model: "nano_banana_2" as const,
      use_unlim: false as const,
      assets: planBatch.asset_ids.map((id) => this.asset(id)),
    };
  }

  private jobIdIsUnique(jobId: string, owner: BatchAttempt): boolean {
    return Object.values(this.ledger.batches).every(({ attempts }) =>
      attempts.every((attempt) => attempt === owner || attempt.job_id !== jobId));
  }

  private async submit(planBatch: PlannedBatch, record: BatchRunRecord, attempt: BatchAttempt): Promise<boolean> {
    try {
      const result = await this.options.provider.submitBatch(this.request(planBatch, attempt), attempt.idempotency_key);
      if (!REMOTE_REF.test(result.job_id) || !this.jobIdIsUnique(result.job_id, attempt)) throw new Error("PROVIDER_FAILED");
      attempt.job_id = result.job_id;
      this.checkpoint(record, "SUBMITTED");
      return true;
    } catch (error) {
      rethrowCheckpointInterruption(error);
      if (!this.options.provider.supports_idempotency || !this.options.provider.queryByIdempotencyKey) {
        this.checkpoint(record, "AMBIGUOUS_SUBMISSION");
        return false;
      }
      let recovered;
      try {
        recovered = await this.options.provider.queryByIdempotencyKey(attempt.idempotency_key);
      } catch {
        this.checkpoint(record, "AMBIGUOUS_SUBMISSION");
        return false;
      }
      if (recovered) {
        if (!REMOTE_REF.test(recovered.job_id) || !this.jobIdIsUnique(recovered.job_id, attempt)) {
          this.checkpoint(record, "AMBIGUOUS_SUBMISSION");
          return false;
        }
        attempt.job_id = recovered.job_id;
        this.checkpoint(record, "SUBMITTED");
        return true;
      }
      this.recordTransient(record, error);
      return false;
    }
  }

  private async recoverSubmitting(planBatch: PlannedBatch, record: BatchRunRecord, attempt: BatchAttempt): Promise<boolean> {
    if (!this.options.provider.supports_idempotency || !this.options.provider.queryByIdempotencyKey) {
      this.checkpoint(record, "AMBIGUOUS_SUBMISSION");
      return false;
    }
    let recovered;
    try {
      recovered = await this.options.provider.queryByIdempotencyKey(attempt.idempotency_key);
    } catch {
      this.checkpoint(record, "AMBIGUOUS_SUBMISSION");
      return false;
    }
    if (recovered) {
      if (!REMOTE_REF.test(recovered.job_id) || !this.jobIdIsUnique(recovered.job_id, attempt)) {
        this.checkpoint(record, "AMBIGUOUS_SUBMISSION");
        return false;
      }
      attempt.job_id = recovered.job_id;
      this.checkpoint(record, "SUBMITTED");
      return true;
    }
    return this.submit(planBatch, record, attempt);
  }

  private remoteFailure(record: BatchRunRecord, errorCode: string): void {
    const attempt = currentAttempt(record)!;
    attempt.error_code = redactError(new Error(errorCode)).code;
    if (attempt.attempt < MAX_ATTEMPTS - 1) this.checkpoint(record, "RETRY_PENDING");
    else this.checkpoint(record, "TERMINAL_FAILED");
  }

  private async finishFailedBalanceAfter(record: BatchRunRecord): Promise<boolean> {
    try {
      const balance = await this.options.provider.balance();
      if (!DECIMAL.test(balance)) throw new Error("INVALID_BALANCE");
      currentAttempt(record)!.balance_after = balance;
      this.remoteFailure(record, currentAttempt(record)!.error_code ?? "PROVIDER_FAILED");
      return true;
    } catch (error) {
      rethrowCheckpointInterruption(error);
      this.recordTransient(record, error);
      return false;
    }
  }

  private acceptRemoteAssets(planBatch: PlannedBatch, record: BatchRunRecord, assets: Array<{ asset_id: string; remote_ref: string }>): boolean {
    const expected = expectedAssetIds(planBatch);
    const owner = currentAttempt(record)!;
    const reservedRemoteRefs = new Set(Object.values(this.ledger.batches).flatMap(({ attempts }) =>
      attempts.filter((attempt) => attempt !== owner).flatMap((attempt) => Object.values(attempt.remote_assets ?? {}))));
    if (assets.length !== expected.size || new Set(assets.map(({ asset_id }) => asset_id)).size !== expected.size ||
        new Set(assets.map(({ remote_ref }) => remote_ref)).size !== expected.size ||
        assets.some(({ asset_id, remote_ref }) =>
          !expected.has(asset_id) || !REMOTE_REF.test(remote_ref) || reservedRemoteRefs.has(remote_ref))) {
      this.recordTransient(record, new Error("PROVIDER_FAILED"));
      return false;
    }
    const attempt = currentAttempt(record)!;
    attempt.remote_assets = Object.fromEntries(assets.map(({ asset_id, remote_ref }) => [asset_id, remote_ref]));
    for (const { asset_id, remote_ref } of assets) record.assets[asset_id].remote_ref = remote_ref;
    this.checkpoint(record, "REMOTE_SUCCEEDED");
    return true;
  }

  private async finishBalanceAfter(record: BatchRunRecord): Promise<boolean> {
    try {
      const balance = await this.options.provider.balance();
      if (!DECIMAL.test(balance)) throw new Error("INVALID_BALANCE");
      currentAttempt(record)!.balance_after = balance;
      this.checkpoint(record, "BALANCE_AFTER_VERIFIED");
      return true;
    } catch (error) {
      rethrowCheckpointInterruption(error);
      this.recordTransient(record, error);
      return false;
    }
  }

  private async recoverAsset(asset: PlannedAsset, record: BatchRunRecord, recovery: AssetRecoveryRecord): Promise<void> {
    if (recovery.state === "COMPLETE") return;
    if (recovery.state === "PLANNED") {
      recovery.state = "DOWNLOADING";
      this.checkpoint(record, "DOWNLOADING");
    }
    if (recovery.state === "DOWNLOADING") {
      try {
        const bytes = await this.options.provider.download(recovery.remote_ref!);
        const local = this.recoveryStore.write(asset, bytes);
        recovery.local_sha256 = local.sha256;
        recovery.state = "LOCAL_VERIFIED";
        this.checkpoint(record, "LOCAL_VERIFIED");
      } catch (error) {
        rethrowCheckpointInterruption(error);
        this.recordTransient(record, error);
        return;
      }
    }
    if (recovery.state === "LOCAL_VERIFIED") {
      recovery.state = "BACKING_UP";
      this.checkpoint(record, "BACKING_UP");
    }
    if (recovery.state === "BACKING_UP") {
      try {
        const backup = this.recoveryStore.backup(asset, recovery.local_sha256!);
        recovery.backup_sha256 = backup.sha256;
        recovery.state = "COMPLETE";
        this.checkpoint(record, "BACKING_UP");
      } catch (error) {
        rethrowCheckpointInterruption(error);
        this.recordTransient(record, error);
      }
    }
  }

  private async advanceBatch(planBatch: PlannedBatch, record: BatchRunRecord): Promise<void> {
    if (["COMPLETE", "TERMINAL_FAILED", "AMBIGUOUS_SUBMISSION"].includes(record.state)) return;
    let attempt = currentAttempt(record);
    if (record.state === "PLANNED" || record.state === "RETRY_PENDING") {
      attempt = await this.startAttempt(planBatch, record) ?? undefined;
      if (!attempt) return;
    }
    if (record.state === "SUBMITTING" && !(await this.recoverSubmitting(planBatch, record, attempt!))) return;
    if (record.state === "SUBMITTED") {
      if (!attempt?.job_id) {
        this.checkpoint(record, "AMBIGUOUS_SUBMISSION");
        return;
      }
      let remote;
      try {
        remote = await this.options.provider.queryJob(attempt.job_id);
      } catch (error) {
        this.recordTransient(record, error);
        return;
      }
      if (remote.state === "PENDING") return;
      if (remote.state === "FAILED") {
        currentAttempt(record)!.error_code = redactError(new Error(remote.error_code)).code;
        this.checkpoint(record, "REMOTE_FAILED");
      } else {
        if (!this.acceptRemoteAssets(planBatch, record, remote.assets)) return;
      }
    }
    if (record.state === "REMOTE_FAILED" && !(await this.finishFailedBalanceAfter(record))) return;
    if (["RETRY_PENDING", "TERMINAL_FAILED"].includes(record.state)) return;
    if (record.state === "REMOTE_SUCCEEDED" && !(await this.finishBalanceAfter(record))) return;
    if (["BALANCE_AFTER_VERIFIED", "DOWNLOADING", "LOCAL_VERIFIED", "BACKING_UP", "BACKUP_VERIFIED"].includes(record.state)) {
      for (const assetId of planBatch.asset_ids) await this.recoverAsset(this.asset(assetId), record, record.assets[assetId]);
      if (Object.values(record.assets).every(({ state }) => state === "COMPLETE")) {
        for (const assetId of planBatch.asset_ids) {
          const asset = this.asset(assetId);
          const recovery = record.assets[assetId];
          this.recoveryStore.verify(asset, "local", recovery.local_sha256!);
          this.recoveryStore.verify(asset, "backup", recovery.backup_sha256!);
        }
        this.checkpoint(record, "BACKUP_VERIFIED");
        this.checkpoint(record, "COMPLETE");
      } else if (Object.values(record.assets).some(({ state }) => state === "DOWNLOADING" || state === "PLANNED")) {
        this.checkpoint(record, "DOWNLOADING");
      } else if (Object.values(record.assets).some(({ state }) => state === "LOCAL_VERIFIED")) {
        this.checkpoint(record, "LOCAL_VERIFIED");
      } else {
        this.checkpoint(record, "BACKING_UP");
      }
    }
  }

  private verifyCompletedFiles(): void {
    for (const planBatch of this.options.plan.batches) {
      const record = this.ledger.batches[planBatch.id];
      for (const assetId of planBatch.asset_ids) {
        const asset = this.asset(assetId);
        const recovery = record.assets[assetId];
        if (recovery.state !== "COMPLETE") continue;
        this.recoveryStore.verify(asset, "local", recovery.local_sha256!);
        this.recoveryStore.verify(asset, "backup", recovery.backup_sha256!);
      }
    }
  }

  async run(): Promise<RunLedger> {
    validatePlanManifest(this.options.plan);
    validateRunId(this.options.runId);
    assertNonOverlappingRoots(this.options.localRoot, this.options.backupRoot);
    const lock = acquireRunnerLock(
      this.options.controlRoot,
      this.options.lockRelativePath,
      this.options.staleLockAfterMs,
    );
    try {
      this.ledger = this.ledgerStore.load() ?? createRunLedger(this.options.plan, this.options.runId);
      validateRunLedger(this.options.plan, this.ledger, this.options.runId);
      this.verifyCompletedFiles();
      if (this.options.approvalEvidence) {
        validateMaterialApprovalEvidence(this.options.plan, this.ledger, this.options.approvalEvidence);
      }
      for (const planBatch of this.options.plan.batches) {
        if (planBatch.phase === "CORE_AFTER_APPROVAL" && !this.options.approvalEvidence) continue;
        const record = this.ledger.batches[planBatch.id];
        do {
          await this.advanceBatch(planBatch, record);
        } while (record.state === "RETRY_PENDING");
        if (record.state !== "COMPLETE" && record.state !== "TERMINAL_FAILED") break;
      }
      this.ledger.successful = Object.values(this.ledger.batches).every(({ state }) => state === "COMPLETE");
      this.ledgerStore.save(this.ledger);
      return this.ledger;
    } finally {
      lock.release();
    }
  }
}
