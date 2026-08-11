import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import type {
  AssetProvider,
  PlannedAsset,
  ProviderBatchRequest,
  ProviderJobQuery,
  ProviderSubmission,
} from "./types";

export interface FakeProviderOptions {
  failureAttempts?: Record<string, number>;
  pendingQueries?: Record<string, number>;
  supportsIdempotency?: boolean;
  payloads?: Record<string, Uint8Array>;
  initialBalanceDecimal?: string;
}

interface FakeJob {
  jobId: string;
  request: ProviderBatchRequest;
  failed: boolean;
  pendingQueriesRemaining: number;
  remoteRefs: Record<string, string>;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.byteLength);
  result.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(result, 4);
  Buffer.from(data).copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.byteLength);
  return result;
}

function fakePng(aspectRatio: PlannedAsset["aspect_ratio"], seed: string): Uint8Array {
  const [width, height] = aspectRatio.split(":").map(Number);
  const color = createHash("sha256").update(seed).digest().subarray(0, 3);
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  for (let row = 0; row < height; row += 1) {
    const start = row * (1 + width * 3);
    scanlines[start] = 0;
    for (let column = 0; column < width; column += 1) color.copy(scanlines, start + 1 + column * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function decimalToCents(value: string): number {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value)) throw new Error("INVALID_BALANCE");
  const [whole, fraction] = value.split(".");
  return Number(whole) * 100 + Number(fraction);
}

function centsToDecimal(value: number): string {
  const safe = Math.max(0, value);
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, "0")}`;
}

export class FakeAssetProvider implements AssetProvider {
  readonly name = "fake";
  readonly supports_idempotency: boolean;
  readonly submissions: Array<{
    batch_id: string;
    model: "nano_banana_2";
    use_unlim: false;
    asset_ids: string[];
    idempotency_key: string;
    job_id: string;
  }> = [];
  balanceCalls = 0;
  queryCalls = 0;
  downloadCalls = 0;
  private balanceCents: number;
  private readonly jobs = new Map<string, FakeJob>();
  private readonly jobsByKey = new Map<string, FakeJob>();
  private readonly attemptsByInitialBatch = new Map<string, number>();
  private readonly assetByRemoteRef = new Map<string, PlannedAsset>();
  private readonly options: FakeProviderOptions;

  constructor(options: FakeProviderOptions = {}) {
    this.options = options;
    this.supports_idempotency = options.supportsIdempotency ?? true;
    this.balanceCents = decimalToCents(options.initialBalanceDecimal ?? "965.00");
  }

  async balance(): Promise<string> {
    this.balanceCalls += 1;
    return centsToDecimal(this.balanceCents);
  }

  async submitBatch(request: ProviderBatchRequest, idempotencyKey: string): Promise<ProviderSubmission> {
    if (request.model !== "nano_banana_2" || request.use_unlim !== false) throw new Error("UNSAFE_PROVIDER_CONFIGURATION");
    if (request.assets.length < 1 || request.assets.length > 12) throw new Error("INVALID_BATCH_SIZE");
    if (this.supports_idempotency) {
      const existing = this.jobsByKey.get(idempotencyKey);
      if (existing) return { job_id: existing.jobId };
    }
    const initialBatchId = request.batch_id.replace(/-retry-\d+$/, "");
    const attempt = (this.attemptsByInitialBatch.get(initialBatchId) ?? 0) + 1;
    this.attemptsByInitialBatch.set(initialBatchId, attempt);
    const jobId = `fake-job-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`;
    const remoteRefs = Object.fromEntries(request.assets.map((asset) => {
      const remoteRef = `fake-ref-${createHash("sha256").update(`${jobId}\0${asset.id}`).digest("hex").slice(0, 24)}`;
      this.assetByRemoteRef.set(remoteRef, asset);
      return [asset.id, remoteRef];
    }));
    const job: FakeJob = {
      jobId,
      request,
      failed: attempt <= (this.options.failureAttempts?.[initialBatchId] ?? 0),
      pendingQueriesRemaining: this.options.pendingQueries?.[initialBatchId] ?? 0,
      remoteRefs,
    };
    this.jobs.set(jobId, job);
    this.jobsByKey.set(idempotencyKey, job);
    this.submissions.push({
      batch_id: request.batch_id,
      model: request.model,
      use_unlim: request.use_unlim,
      asset_ids: request.assets.map(({ id }) => id),
      idempotency_key: idempotencyKey,
      job_id: jobId,
    });
    this.balanceCents -= request.assets.length * 12;
    return { job_id: jobId };
  }

  async queryJob(jobId: string): Promise<ProviderJobQuery> {
    this.queryCalls += 1;
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("PROVIDER_FAILED");
    if (job.pendingQueriesRemaining > 0) {
      job.pendingQueriesRemaining -= 1;
      return { state: "PENDING" };
    }
    if (job.failed) return { state: "FAILED", error_code: "PROVIDER_FAILED" };
    return {
      state: "SUCCEEDED",
      assets: job.request.assets.map(({ id }) => ({ asset_id: id, remote_ref: job.remoteRefs[id] })),
    };
  }

  async queryByIdempotencyKey(idempotencyKey: string): Promise<ProviderSubmission | null> {
    if (!this.supports_idempotency) return null;
    const job = this.jobsByKey.get(idempotencyKey);
    return job ? { job_id: job.jobId } : null;
  }

  async download(remoteRef: string): Promise<Uint8Array> {
    this.downloadCalls += 1;
    const asset = this.assetByRemoteRef.get(remoteRef);
    if (!asset) throw new Error("DOWNLOAD_FAILED");
    return this.options.payloads?.[asset.id] ?? fakePng(asset.aspect_ratio, asset.id);
  }
}
