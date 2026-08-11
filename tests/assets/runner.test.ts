import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { FakeAssetProvider } from "../../scripts/assets/fake-provider";
import { buildPlanManifest } from "../../scripts/assets/manifest";
import {
  AssetRunner,
  type AssetRecoveryStore,
  createMaterialApprovalEvidence,
  createRunLedger,
  type LedgerStore,
  validateRunId,
} from "../../scripts/assets/runner";
import type { AssetPlanManifest, AssetProvider, PlannedAsset, ProviderBatchRequest, ProviderJobQuery, ProviderSubmission, RunLedger } from "../../scripts/assets/types";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const approvalMetadata = {
  approved_by: "human-reviewer",
  approved_at: "2026-08-11T13:30:00+09:00",
  approval_reference: "material-style-review-001",
};

function plan(): AssetPlanManifest {
  return buildPlanManifest(repositoryRoot);
}

function runPaths(label: string) {
  const root = mkdtempSync(resolve(tmpdir(), `fictor-run-${label}-`));
  return {
    root,
    controlRoot: resolve(root, "control"),
    ledgerRelativePath: "ledger.json",
    localRoot: resolve(root, "local"),
    backupRoot: resolve(root, "backup"),
    lockRelativePath: "runner.lock",
  };
}

class MemoryLedgerStore implements LedgerStore {
  value: RunLedger | null = null;
  load() { return this.value ? structuredClone(this.value) : null; }
  save(ledger: RunLedger) { this.value = ledger; }
}

class MemoryRecoveryStore implements AssetRecoveryStore {
  readonly local = new Map<string, string>();
  readonly backupFiles = new Map<string, string>();
  failBackupOnce = false;
  failWriteOnce = false;
  write(asset: PlannedAsset, bytes: Uint8Array) {
    if (this.failWriteOnce) { this.failWriteOnce = false; throw new Error("LOCAL_VERIFY_FAILED"); }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = this.local.get(asset.path);
    if (existing && existing !== sha256) throw new Error("EXISTING_FILE_CONFLICT");
    this.local.set(asset.path, sha256);
    return { sha256 };
  }
  backup(asset: PlannedAsset, expectedSha256: string) {
    if (this.failBackupOnce) { this.failBackupOnce = false; throw new Error("BACKUP_VERIFY_FAILED"); }
    if (this.local.get(asset.path) !== expectedSha256) throw new Error("LOCAL_HASH_CHANGED");
    this.backupFiles.set(asset.path, expectedSha256);
    return { sha256: expectedSha256 };
  }
  verify(asset: PlannedAsset, location: "local" | "backup", expectedSha256: string) {
    const actual = location === "local" ? this.local.get(asset.path) : this.backupFiles.get(asset.path);
    if (actual !== expectedSha256) throw new Error("LOCAL_VERIFY_FAILED");
  }
}

function options(label: string, assetPlan: AssetPlanManifest, provider: AssetProvider) {
  return {
    plan: assetPlan,
    provider,
    ...runPaths(label),
    runId: label,
    ledgerStore: new MemoryLedgerStore(),
    recoveryStore: new MemoryRecoveryStore(),
  };
}

describe("batch/job asset runner", () => {
  test("submits exactly five <=12 batches before durable approval, then resumes the remaining 121", async () => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider();
    const shared = options("approval", assetPlan, provider);
    const gated = await new AssetRunner(shared).run();
    expect(provider.submissions).toHaveLength(5);
    expect(provider.submissions.every(({ asset_ids }) => asset_ids.length >= 1 && asset_ids.length <= 12)).toBe(true);
    expect(provider.submissions.flatMap(({ asset_ids }) => asset_ids)).toHaveLength(52);
    expect(Object.values(gated.batches).filter(({ state }) => state === "COMPLETE")).toHaveLength(5);
    const evidence = createMaterialApprovalEvidence(assetPlan, gated, approvalMetadata);
    expect(evidence.plan_sha256).toBe(gated.plan_sha256);
    expect(evidence.run_id).toBe("approval");
    expect(evidence.material_asset_ids).toEqual(assetPlan.assets.slice(0, 52).map(({ id }) => id));
    expect(evidence.asset_hashes).toHaveLength(52);
    expect(evidence.asset_hashes.every(({ local_sha256, backup_sha256 }) =>
      local_sha256 === backup_sha256 && /^[a-f0-9]{64}$/.test(local_sha256))).toBe(true);

    const complete = await new AssetRunner({ ...shared, approvalEvidence: evidence }).run();
    expect(provider.submissions).toHaveLength(126);
    expect(provider.submissions.every(({ model, use_unlim }) => model === "nano_banana_2" && use_unlim === false)).toBe(true);
    expect(provider.submissions.map(({ batch_id }) => batch_id)).toEqual(assetPlan.batches.map(({ id }) => id));
    expect(complete.successful).toBe(true);
    expect(provider.balanceCalls).toBe(252);
  }, 30_000);

  test("records balance before and after every completed job", async () => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider({ initialBalanceDecimal: "965.00" });
    const ledger = await new AssetRunner(options("balances", assetPlan, provider)).run();
    for (const batch of assetPlan.batches.slice(0, 5)) {
      const attempt = ledger.batches[batch.id].attempts[0];
      expect(attempt.balance_before).toMatch(/^\d+\.\d{2}$/);
      expect(attempt.balance_after).toMatch(/^\d+\.\d{2}$/);
    }
    expect(ledger.batches["initial-001"].attempts[0].balance_before).toBe("965.00");
    expect(ledger.batches["initial-001"].attempts[0].balance_after).toBe("963.56");
  });

  test("fake provider rejects unsafe model or unlimited requests", async () => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider();
    const base = {
      batch_id: "initial-001",
      model: "nano_banana_2",
      use_unlim: false,
      assets: assetPlan.assets.slice(0, 1),
    };
    await expect(provider.submitBatch({ ...base, model: "unsafe" } as unknown as ProviderBatchRequest, "key-a"))
      .rejects.toThrow("UNSAFE_PROVIDER_CONFIGURATION");
    await expect(provider.submitBatch({ ...base, use_unlim: true } as unknown as ProviderBatchRequest, "key-b"))
      .rejects.toThrow("UNSAFE_PROVIDER_CONFIGURATION");
    expect(provider.submissions).toHaveLength(0);
  });

  test("rejects malformed recovered job ids and duplicate successful remote refs", async () => {
    const assetPlan = plan();
    class InvalidRecoveredJobProvider extends FakeAssetProvider {
      override async submitBatch(): Promise<ProviderSubmission> { throw new Error("lost submit response"); }
      override async queryByIdempotencyKey(): Promise<ProviderSubmission> { return { job_id: "../unsafe-job" }; }
    }
    const invalidJob = new InvalidRecoveredJobProvider();
    const invalidShared = options("invalidjob", assetPlan, invalidJob);
    const ambiguous = await new AssetRunner(invalidShared).run();
    expect(ambiguous.batches["initial-001"].state).toBe("AMBIGUOUS_SUBMISSION");
    const balanceCalls = invalidJob.balanceCalls;
    await new AssetRunner(invalidShared).run();
    expect(invalidJob.balanceCalls).toBe(balanceCalls);

    class DuplicateRemoteProvider extends FakeAssetProvider {
      override async queryJob(jobId: string): Promise<ProviderJobQuery> {
        const result = await super.queryJob(jobId);
        if (result.state !== "SUCCEEDED") return result;
        return { state: "SUCCEEDED", assets: result.assets.map(({ asset_id }) => ({ asset_id, remote_ref: "fake-ref-duplicate" })) };
      }
    }
    const duplicate = new DuplicateRemoteProvider();
    const duplicateShared = options("duplicateref", assetPlan, duplicate);
    const rejected = await new AssetRunner(duplicateShared).run();
    expect(rejected.batches["initial-001"].state).toBe("SUBMITTED");
    expect(duplicate.submissions).toHaveLength(1);
    expect(duplicate.downloadCalls).toBe(0);
  });

  test.each([
    [3, "COMPLETE"],
    [4, "TERMINAL_FAILED"],
  ] as const)("remote failures use attempts 0..3 only (failures=%s)", async (failures, expectedState) => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider({ failureAttempts: { "initial-001": failures } });
    const ledger = await new AssetRunner(options(`retry${failures}`, assetPlan, provider)).run();
    const first = ledger.batches["initial-001"];
    expect(first.state).toBe(expectedState);
    expect(first.attempts.map(({ attempt }) => attempt)).toEqual([0, 1, 2, 3]);
    expect(first.attempts.map(({ batch_id }) => batch_id)).toEqual([
      "initial-001", "initial-001-retry-1", "initial-001-retry-2", "initial-001-retry-3",
    ]);
    expect(first.attempts.every(({ balance_before, balance_after }) => Boolean(balance_before && balance_after))).toBe(true);
    expect(ledger.batches["initial-002"].state).toBe("COMPLETE");
    expect(ledger.successful).toBe(false);
  });

  test("query transport failure resumes the same job without a generation retry", async () => {
    const assetPlan = plan();
    class QueryOnceProvider extends FakeAssetProvider {
      thrown = false;
      override async queryJob(jobId: string) {
        if (!this.thrown) { this.thrown = true; throw new Error("secret query transport"); }
        return super.queryJob(jobId);
      }
    }
    const provider = new QueryOnceProvider();
    const shared = options("querytransient", assetPlan, provider);
    await new AssetRunner(shared).run();
    expect(provider.submissions).toHaveLength(1);
    const resumed = await new AssetRunner(shared).run();
    expect(resumed.batches["initial-001"].state).toBe("COMPLETE");
    expect(resumed.batches["initial-001"].attempts).toHaveLength(1);
    expect(provider.submissions).toHaveLength(5);
    expect(provider.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);
    expect(JSON.stringify(shared.ledgerStore.value)).not.toContain("secret query transport");
  });

  test("balance-after transport failure remains remote-complete and does not resubmit", async () => {
    const assetPlan = plan();
    class BalanceOnceProvider extends FakeAssetProvider {
      override async balance() {
        if (this.balanceCalls === 1) { this.balanceCalls += 1; throw new Error("balance token canary"); }
        return super.balance();
      }
    }
    const provider = new BalanceOnceProvider();
    const shared = options("balancetransient", assetPlan, provider);
    const first = await new AssetRunner(shared).run();
    expect(first.batches["initial-001"].state).toBe("REMOTE_SUCCEEDED");
    expect(provider.submissions).toHaveLength(1);
    const resumed = await new AssetRunner(shared).run();
    expect(resumed.batches["initial-001"].state).toBe("COMPLETE");
    expect(resumed.batches["initial-001"].attempts).toHaveLength(1);
    expect(provider.submissions).toHaveLength(5);
    expect(provider.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);
  });

  test("balance-before transport failure creates no attempt and later uses one submission", async () => {
    const assetPlan = plan();
    class BalanceBeforeOnceProvider extends FakeAssetProvider {
      thrown = false;
      override async balance() {
        if (!this.thrown) { this.thrown = true; throw new Error("balance transport"); }
        return super.balance();
      }
    }
    const provider = new BalanceBeforeOnceProvider();
    const shared = options("balancebefore", assetPlan, provider);
    const first = await new AssetRunner(shared).run();
    expect(first.batches["initial-001"].state).toBe("PLANNED");
    expect(first.batches["initial-001"].attempts).toHaveLength(0);
    await new AssetRunner(shared).run();
    expect(provider.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);
  });

  test("download and backup transients resume the same remote results", async () => {
    const assetPlan = plan();
    class DownloadOnceProvider extends FakeAssetProvider {
      thrown = false;
      override async download(remoteRef: string) {
        if (!this.thrown) { this.thrown = true; throw new Error("download signed url canary"); }
        return super.download(remoteRef);
      }
    }
    const provider = new DownloadOnceProvider();
    const shared = options("downloadtransient", assetPlan, provider);
    await new AssetRunner(shared).run();
    expect(provider.submissions).toHaveLength(1);
    const resumed = await new AssetRunner(shared).run();
    expect(resumed.batches["initial-001"].attempts).toHaveLength(1);
    expect(provider.submissions).toHaveLength(5);
    expect(provider.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);

    const providerLocal = new FakeAssetProvider();
    const sharedLocal = options("localtransient", assetPlan, providerLocal);
    sharedLocal.recoveryStore.failWriteOnce = true;
    await new AssetRunner(sharedLocal).run();
    await new AssetRunner(sharedLocal).run();
    expect(providerLocal.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);

    const provider2 = new FakeAssetProvider();
    const shared2 = options("backuptransient", assetPlan, provider2);
    shared2.recoveryStore.failBackupOnce = true;
    await new AssetRunner(shared2).run();
    expect(provider2.submissions).toHaveLength(1);
    const resumed2 = await new AssetRunner(shared2).run();
    expect(resumed2.batches["initial-001"].attempts).toHaveLength(1);
    expect(provider2.submissions).toHaveLength(5);
    expect(provider2.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);
  });

  test("a pending job halts sequential submission until the same job completes", async () => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider({ pendingQueries: { "initial-001": 1 } });
    const shared = options("pending", assetPlan, provider);
    const first = await new AssetRunner(shared).run();
    expect(first.batches["initial-001"].state).toBe("SUBMITTED");
    expect(first.batches["initial-002"].state).toBe("PLANNED");
    expect(provider.submissions).toHaveLength(1);
    const jobId = first.batches["initial-001"].attempts[0].job_id;

    const resumed = await new AssetRunner(shared).run();
    expect(resumed.batches["initial-001"].state).toBe("COMPLETE");
    expect(resumed.batches["initial-001"].attempts[0].job_id).toBe(jobId);
    expect(provider.submissions).toHaveLength(5);
    expect(provider.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);
  });

  test("failed-job balance-after transient keeps the same job before retrying", async () => {
    const assetPlan = plan();
    class FailedBalanceOnceProvider extends FakeAssetProvider {
      override async balance() {
        if (this.balanceCalls === 1) {
          this.balanceCalls += 1;
          throw new Error("balance-after credential canary");
        }
        return super.balance();
      }
    }
    const provider = new FailedBalanceOnceProvider({ failureAttempts: { "initial-001": 1 } });
    const shared = options("failedbalance", assetPlan, provider);
    const first = await new AssetRunner(shared).run();
    expect(first.batches["initial-001"].state).toBe("REMOTE_FAILED");
    expect(first.batches["initial-001"].attempts).toHaveLength(1);
    expect(first.batches["initial-001"].attempts[0].balance_after).toBeUndefined();
    expect(provider.submissions).toHaveLength(1);
    const failedJob = first.batches["initial-001"].attempts[0].job_id;

    const resumed = await new AssetRunner(shared).run();
    const attempts = resumed.batches["initial-001"].attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts[0].job_id).toBe(failedJob);
    expect(attempts.every(({ balance_before, balance_after }) => Boolean(balance_before && balance_after))).toBe(true);
    expect(provider.submissions.filter(({ batch_id }) => batch_id.startsWith("initial-001"))).toHaveLength(2);
    expect(JSON.stringify(shared.ledgerStore.value)).not.toContain("credential canary");
  });

  test("partial batch resume revalidates completed sibling assets before provider activity", async () => {
    const assetPlan = plan();
    class SecondDownloadOnceProvider extends FakeAssetProvider {
      thrown = false;
      override async download(remoteRef: string) {
        if (!this.thrown && this.downloadCalls === 1) {
          this.thrown = true;
          throw new Error("DOWNLOAD_FAILED");
        }
        return super.download(remoteRef);
      }
    }
    const provider = new SecondDownloadOnceProvider();
    const shared = options("partialverify", assetPlan, provider);
    const first = await new AssetRunner(shared).run();
    const batch = first.batches["initial-001"];
    const firstAssetId = assetPlan.batches[0].asset_ids[0];
    const secondAssetId = assetPlan.batches[0].asset_ids[1];
    expect(batch.state).toBe("DOWNLOADING");
    expect(batch.assets[firstAssetId].state).toBe("COMPLETE");
    expect(batch.assets[secondAssetId].state).toBe("DOWNLOADING");
    shared.recoveryStore.local.set(assetPlan.assets[0].path, "0".repeat(64));
    const providerActivity = {
      submissions: provider.submissions.length,
      balance: provider.balanceCalls,
      query: provider.queryCalls,
      download: provider.downloadCalls,
    };
    await expect(new AssetRunner(shared).run()).rejects.toThrow("LOCAL_VERIFY_FAILED");
    expect(provider.submissions).toHaveLength(providerActivity.submissions);
    expect(provider.balanceCalls).toBe(providerActivity.balance);
    expect(provider.queryCalls).toBe(providerActivity.query);
    expect(provider.downloadCalls).toBe(providerActivity.download);
  });

  test("unqueryable submit transport becomes ambiguous and never auto-resubmits", async () => {
    const assetPlan = plan();
    class AmbiguousProvider extends FakeAssetProvider {
      override readonly supports_idempotency = false;
      override async submitBatch(): Promise<ProviderSubmission> { throw new Error("secret submit response"); }
    }
    const provider = new AmbiguousProvider();
    const shared = options("ambiguous", assetPlan, provider);
    const first = await new AssetRunner(shared).run();
    expect(first.batches["initial-001"].state).toBe("AMBIGUOUS_SUBMISSION");
    expect(first.batches["initial-001"].attempts).toHaveLength(1);
    const balanceCalls = provider.balanceCalls;
    const resumed = await new AssetRunner(shared).run();
    expect(resumed.batches["initial-001"].attempts).toHaveLength(1);
    expect(provider.balanceCalls).toBe(balanceCalls);
    expect(JSON.stringify(shared.ledgerStore.value)).not.toContain("secret submit response");
  });

  test("submit transport recovery reuses the exact attempt/key before and after remote acceptance", async () => {
    const assetPlan = plan();
    class SubmitBeforeProvider extends FakeAssetProvider {
      calls = 0;
      override async submitBatch(request: ProviderBatchRequest, key: string): Promise<ProviderSubmission> {
        this.calls += 1;
        if (this.calls === 1) throw new Error("submit transport");
        return super.submitBatch(request, key);
      }
    }
    const before = new SubmitBeforeProvider();
    const shared = options("submitbefore", assetPlan, before);
    await new AssetRunner(shared).run();
    const firstKey = shared.ledgerStore.value!.batches["initial-001"].attempts[0].idempotency_key;
    await new AssetRunner(shared).run();
    expect(before.submissions).toHaveLength(5);
    expect(before.submissions.find(({ batch_id }) => batch_id === "initial-001")?.idempotency_key).toBe(firstKey);

    class SubmitAfterProvider extends FakeAssetProvider {
      thrown = false;
      override async submitBatch(request: ProviderBatchRequest, key: string): Promise<ProviderSubmission> {
        const result = await super.submitBatch(request, key);
        if (!this.thrown) { this.thrown = true; throw new Error("lost response"); }
        return result;
      }
    }
    const after = new SubmitAfterProvider();
    const shared2 = options("submitafter", assetPlan, after);
    await new AssetRunner(shared2).run();
    expect(after.submissions).toHaveLength(5);
    expect(after.submissions[0].asset_ids).toHaveLength(12);
  });

  test.each(["SUBMITTING", "SUBMITTED", "REMOTE_SUCCEEDED", "BALANCE_AFTER_VERIFIED", "DOWNLOADING", "LOCAL_VERIFIED", "BACKING_UP", "BACKUP_VERIFIED", "COMPLETE"] as const)(
    "crash checkpoint %s resumes without duplicate generation",
    async (crashState) => {
      const assetPlan = plan();
      const provider = new FakeAssetProvider();
      const shared = options(`crash${crashState.toLowerCase()}`, assetPlan, provider);
      let crashed = false;
      await expect(new AssetRunner({
        ...shared,
        afterCheckpoint(batchId, state) {
          if (!crashed && batchId === "initial-001" && state === crashState) {
            crashed = true;
            throw new Error("simulated crash");
          }
        },
      }).run()).rejects.toThrow("simulated crash");
      const resumed = await new AssetRunner(shared).run();
      expect(resumed.batches["initial-001"].state).toBe("COMPLETE");
      expect(resumed.batches["initial-001"].attempts).toHaveLength(1);
      expect(provider.submissions.filter(({ batch_id }) => batch_id === "initial-001")).toHaveLength(1);
    },
    15_000,
  );

  test("rejects unsafe plans and run ids before balance/provider calls", async () => {
    const mutations: Array<(value: AssetPlanManifest) => void> = [
      (value) => { value.model = "other" as "nano_banana_2"; },
      (value) => { value.use_unlim = true as false; },
      (value) => { value.assets[0].category = "EVENT"; },
      (value) => { value.approval_gate.after_asset_count = 51 as 52; },
      (value) => { value.batches[0].phase = "CORE_AFTER_APPROVAL"; },
      (value) => { value.assets[0].path = "../escape.png"; },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const unsafe = structuredClone(plan());
      mutate(unsafe);
      const provider = new FakeAssetProvider();
      await expect(new AssetRunner(options(`unsafe${index}`, unsafe, provider)).run()).rejects.toThrow();
      expect(provider.balanceCalls).toBe(0);
      expect(provider.submissions).toHaveLength(0);
    }
    for (const id of ["../bad", "a/b", ".", "bad\0id", "-leading", "x".repeat(65)]) {
      expect(() => validateRunId(id)).toThrow("INVALID_RUN_ID");
    }
  });

  test("rejects forged ledger states before provider calls", async () => {
    const assetPlan = plan();
    const cases: Array<(ledger: RunLedger) => void> = [
      (ledger) => { delete ledger.batches["initial-126"]; },
      (ledger) => { ledger.batches["initial-001"].state = "COMPLETE"; },
      (ledger) => { ledger.batches["initial-001"].state = "UNKNOWN" as "PLANNED"; },
      (ledger) => { ledger.batches["initial-001"].attempts = [{
        attempt: 1, batch_id: "bad", idempotency_key: "bad", state: "SUBMITTING", balance_before: "1.00",
      }]; },
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const paths = runPaths(`ledger${index}`);
      const ledger = createRunLedger(assetPlan, `ledger${index}`);
      cases[index](ledger);
      const ledgerStore = new MemoryLedgerStore();
      ledgerStore.save(ledger);
      const provider = new FakeAssetProvider();
      await expect(new AssetRunner({
        plan: assetPlan,
        provider,
        ...paths,
        runId: `ledger${index}`,
        ledgerStore,
        recoveryStore: new MemoryRecoveryStore(),
      }).run()).rejects.toThrow("INVALID_LEDGER");
      expect(provider.balanceCalls).toBe(0);
    }
  });

  test("rejects a recovery remote ref that does not match its current job result", async () => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider();
    const shared = options("remoteref", assetPlan, provider);
    const gated = await new AssetRunner(shared).run();
    const firstBatch = gated.batches["initial-001"];
    const firstAssetId = assetPlan.batches[0].asset_ids[0];
    firstBatch.assets[firstAssetId].remote_ref = "forged-remote-ref";
    shared.ledgerStore.save(gated);
    const activity = { balance: provider.balanceCalls, submissions: provider.submissions.length };
    await expect(new AssetRunner(shared).run()).rejects.toThrow("INVALID_LEDGER");
    expect(provider.balanceCalls).toBe(activity.balance);
    expect(provider.submissions).toHaveLength(activity.submissions);
  });

  test("forged approval and corrupt COMPLETE files fail closed without provider calls", async () => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider();
    const shared = options("evidence", assetPlan, provider);
    const gated = await new AssetRunner(shared).run();
    const evidence = createMaterialApprovalEvidence(assetPlan, gated, approvalMetadata);
    const calls = provider.balanceCalls;
    const forgeries = [
      (value: typeof evidence) => { value.material_asset_ids[0] = "wrong"; },
      (value: typeof evidence) => { value.run_id = "different-run"; },
      (value: typeof evidence) => { value.asset_hashes[0].local_sha256 = "0".repeat(64); },
    ];
    for (const forge of forgeries) {
      const forged = structuredClone(evidence);
      forge(forged);
      await expect(new AssetRunner({ ...shared, approvalEvidence: forged }).run()).rejects.toThrow("INVALID_APPROVAL_EVIDENCE");
      expect(provider.balanceCalls).toBe(calls);
    }
    expect(() => createMaterialApprovalEvidence(assetPlan, gated, {
      ...approvalMetadata,
      approved_at: "2026-02-30T12:00:00+09:00",
    })).toThrow("INVALID_APPROVAL_METADATA");
    shared.recoveryStore.local.set(assetPlan.assets[0].path, "0".repeat(64));
    await expect(new AssetRunner(shared).run()).rejects.toThrow("LOCAL_VERIFY_FAILED");
    expect(provider.balanceCalls).toBe(calls);
  });

  test("production filesystem store revalidates COMPLETE files on resume", async () => {
    const assetPlan = plan();
    const provider = new FakeAssetProvider();
    const paths = runPaths("filestore");
    const base = { plan: assetPlan, provider, ...paths, runId: "filestore" };
    let stopped = false;
    await expect(new AssetRunner({
      ...base,
      afterCheckpoint(batchId, state) {
        if (!stopped && batchId === "initial-001" && state === "COMPLETE") {
          stopped = true;
          throw new Error("stop after first durable batch");
        }
      },
    }).run()).rejects.toThrow("stop after first durable batch");
    await new AssetRunner(base).run();
    expect(provider.submissions).toHaveLength(5);
    writeFileSync(resolve(paths.localRoot, assetPlan.assets[0].path), "corrupt", "utf8");
    const calls = provider.balanceCalls;
    await expect(new AssetRunner(base).run()).rejects.toThrow();
    expect(provider.balanceCalls).toBe(calls);
  }, 15_000);
});
