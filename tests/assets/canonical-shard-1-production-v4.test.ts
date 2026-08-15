import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, onTestFinished, test } from "vitest";

import {
  T015_V4_ADDITIONAL_CAP_UNITS, T015_V4_BINDING_PATH, T015_V4_CANARY_BATCH_ID, T015_V4_CANARY_BLOCKED_BATCH_ID, T015_V4_CORE_PLAN_PATH,
  T015_V4_EXACT_APPROVAL_PHRASE, T015_V4_JOURNAL_PATH, T015_V4_LEGACY_COMMITTED_UNITS, T015_V4_LEGACY_JOURNAL_PATH, T015_V4_LOCK_PATH,
  T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, T015_V4_MIGRATION_FAIL_STOP_BATCH_ID, T015_V4_PAID_BATCH_COUNT, T015_V4_PENDING_PATH,
  T015_V4_3_EXACT_APPROVAL_PHRASE, T015_V4_3_REMEDIATION_ASSET_COUNT, T015_V4_3_REMEDIATION_BATCH_ID, T015_V4_3_REMEDIATION_INDICES, T015_V4_ORIGINAL_JOURNAL_PATH,
  T015_V4_RECOVERY_OPERATOR_PHRASE, T015_V4_RESUME_OPERATOR_PHRASE, T015_V4_RISK_TEXT, T015_V4_TOTAL_CAP_UNITS,
  buildT015V4Plan, canonicalJsonT015, crossCheckT015V4EffectivePrompts, isT015V4Authorized, loadPinnedT015V2Plan, parseT015V4BalanceFile, renderT015CanonicalJson,
  sha256T015V4, t015V4LegacyDelta, type T015V4Approval, type T015V4Plan, type T015V4Presentation,
} from "../../scripts/assets/canonical-shard-1-production-v4";
import {
  acquireT015V4Lock, auditT015V4, buildInitialT015V4Journal, downloadT015V4, runT015V4JobsHandoffInternal, runT015V4OpsInternal, statusT015V4, t015V4CanaryVerified, t015V4GetCostRequest, t015V4LostIndices, validateT015V4Journal,
  type T015V4Context, type T015V4Dependencies, type T015V4Journal,
} from "../../scripts/assets/canonical-shard-1-production-v4-ops";
import { checkT015V4Preparation } from "../../scripts/assets/canonical-shard-1-production-v4-cli";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const ownerJournalPaths = [
  "assets/runs/t015-canonical-shard-1/operations-v1.json",
  "assets/runs/t015-canonical-shard-1/operations-v2.json",
  "assets/runs/t015-canonical-shard-1/operations-v3.json",
  T015_V4_ORIGINAL_JOURNAL_PATH,
  T015_V4_LEGACY_JOURNAL_PATH,
  T015_V4_JOURNAL_PATH,
] as const;
const ownerJournalsPresent = ownerJournalPaths.every((path) => existsSync(resolve(repositoryRoot, path)));
const ownerDescribe = describe.skipIf(!ownerJournalsPresent);
const EPOCH = Date.parse("2026-08-14T00:00:00.000Z");
const presentation = { evidence_version: "t015-v4-test-presentation" } as unknown as T015V4Presentation;
const approval = { evidence_version: "t015-v4-test-approval" } as unknown as T015V4Approval;
const START_UNITS = 50_000;

function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const name = Buffer.from(type); const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result; }
function png(width = 3, height = 4, fill = 0): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rowBytes = width * 3; const pixels = Buffer.alloc(height * (1 + rowBytes), fill);
  for (let row = 0; row < height; row += 1) pixels[row * (1 + rowBytes)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
function at(seconds: number): string { return new Date(EPOCH + seconds * 1000).toISOString(); }
/** Provider payloads are written inside the run root and referenced by repository-relative path. */
function json(root: string, name: string, value: unknown): string { writeFileSync(resolve(root, name), `${JSON.stringify(value)}\n`); return name; }
/** JSON.parse creates `__proto__` as an own key; Object.assign would hit the prototype setter. */
function withOwnProtoKey<T extends Record<string, unknown>>(value: T): T { Object.defineProperty(value, "__proto__", { value: { credits: 1 }, enumerable: true, configurable: true, writable: true }); return value; }
function summaryOf(statuses: readonly string[]) { const active = ["pending", "waiting", "queued", "in_progress", "ip_detect"]; const failed = ["failed", "canceled", "nsfw", "ip_detected"]; return { active: statuses.filter((status) => active.includes(status)).length, completed: statuses.filter((status) => status === "completed").length, errors: statuses.filter((status) => status === "lookup_failed").length, failed: statuses.filter((status) => failed.includes(status)).length, total: statuses.length }; }

let cachedPlan: T015V4Plan;
beforeAll(() => { if (ownerJournalsPresent) cachedPlan = buildT015V4Plan(repositoryRoot); });

test("reports the T015 v4 owner-journal trust boundary", () => {
  const boundary = { suite: "T015_V4_OWNER_ONLY", owner_journals_present: ownerJournalsPresent, disposition: ownerJournalsPresent ? "EXECUTED" : "SKIPPED_OWNER_EVIDENCE_ABSENT", required_paths: ownerJournalPaths };
  console.info(`T015_TRUST_BOUNDARY ${JSON.stringify(boundary)}`);
  expect(boundary.disposition).toBe(ownerJournalsPresent ? "EXECUTED" : "SKIPPED_OWNER_EVIDENCE_ABSENT");
});

interface Prepared { root: string; plan: T015V4Plan }
type TemporaryRootScope = "test" | "suite";
type RemoveTemporaryRoot = (root: string) => void;

const testTemporaryRoots = new Set<string>();
const suiteTemporaryRoots = new Set<string>();

function cleanupTemporaryRoots(roots: readonly string[], remove: RemoveTemporaryRoot): Error[] {
  const failures: Error[] = [];
  for (const root of roots) {
    try {
      remove(root);
    } catch (error) {
      failures.push(new Error(`Failed to clean temporary T015 test root: ${root}`, { cause: error }));
    }
  }
  return failures;
}

function cleanupRegisteredTemporaryRoots(roots: readonly string[]): Error[] {
  const failures = cleanupTemporaryRoots(roots, (root) => rmSync(root, { recursive: true, force: true }));
  for (const root of roots) {
    if (!existsSync(root)) {
      testTemporaryRoots.delete(root);
      suiteTemporaryRoots.delete(root);
    }
  }
  return failures;
}

function throwCleanupFailures(failures: readonly Error[]): void {
  if (failures.length > 0) throw new AggregateError(failures, "T015 temporary test cleanup failed");
}

function temporaryRoot(prefix: string, scope: TemporaryRootScope = "test"): string {
  const root = mkdtempSync(resolve(tmpdir(), prefix));
  const roots = scope === "suite" ? suiteTemporaryRoots : testTemporaryRoots;
  roots.add(root);
  if (scope === "test") {
    onTestFinished(() => throwCleanupFailures(cleanupRegisteredTemporaryRoots([root])));
  }
  return root;
}

afterAll(() => {
  throwCleanupFailures(cleanupRegisteredTemporaryRoots([...testTemporaryRoots, ...suiteTemporaryRoots]));
});

test("cleans owned temporary roots idempotently and continues after a removal failure", () => {
  const owned = temporaryRoot("fictor-t015-v4-cleanup-");
  expect(existsSync(owned)).toBe(true);
  expect(cleanupRegisteredTemporaryRoots([owned])).toEqual([]);
  expect(cleanupRegisteredTemporaryRoots([owned])).toEqual([]);
  expect(existsSync(owned)).toBe(false);

  const attempts: string[] = [];
  const failures = cleanupTemporaryRoots(["first", "second"], (root) => {
    attempts.push(root);
    if (root === "first") throw new Error("forced cleanup failure");
  });
  expect(attempts).toEqual(["first", "second"]);
  expect(failures).toHaveLength(1);
  expect(failures[0].message).toContain("first");
});

function fixture(startUnits = START_UNITS, scope: TemporaryRootScope = "test"): Prepared {
  const root = temporaryRoot("fictor-t015-v4-", scope);
  mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
  copyFileSync(resolve(repositoryRoot, T015_V4_CORE_PLAN_PATH), resolve(root, T015_V4_CORE_PLAN_PATH));
  const anchor = json(root, "initial-balance.json", { credits: startUnits / 100, provider_observed_at: at(-120) });
  runT015V4OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval);
  return { root, plan: cachedPlan };
}
function ops(prepared: Prepared, args: readonly string[]): Record<string, unknown> { return runT015V4OpsInternal(args, prepared.root, prepared.plan, presentation, approval); }
function journalOf(prepared: Prepared): T015V4Journal { return JSON.parse(readFileSync(resolve(prepared.root, T015_V4_JOURNAL_PATH), "utf8")) as T015V4Journal; }
function contextOf(prepared: Prepared): T015V4Context { return { root: prepared.root, plan: prepared.plan, presentation, approval }; }
/** Every fail-stop must leave a journal the reader still accepts. */
function assertJournalStillReadable(prepared: Prepared): Record<string, unknown> { const status = ops(prepared, ["status", "--observed-at", at(500_000)]); expect(readFileSync(resolve(prepared.root, T015_V4_JOURNAL_PATH), "utf8")).not.toMatch(/https?:\/\//); return status; }
function batchAssets(plan: T015V4Plan, batchIndex: number) { return plan.batches[batchIndex].asset_ids.map((id) => plan.assets.find((asset) => asset.id === id)!); }
function costItems(plan: T015V4Plan, batchIndex: number, base: number) { return batchAssets(plan, batchIndex).map((asset, offset) => ({ index: asset.index, request_sha256: sha256T015V4(canonicalJsonT015(t015V4GetCostRequest(asset.request))), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: at(base + 1 + offset) })); }
function jobId(plan: T015V4Plan, batchIndex: number, offset: number, salt = ""): string { return `${plan.batches[batchIndex].id}-job${salt}-${String(offset).padStart(2, "0")}`; }
function submissionResponse(plan: T015V4Plan, batchIndex: number, salt = "") { const assets = batchAssets(plan, batchIndex); return { submitted_count: assets.length, failed_count: 0, jobs: assets.map((asset, offset) => ({ index: asset.index, job_id: jobId(plan, batchIndex, offset, salt), status: "queued" })) }; }
function waitResponse(plan: T015V4Plan, batchIndex: number, statuses?: readonly string[], model = "nano_banana_flash", salt = "") {
  const assets = batchAssets(plan, batchIndex);
  const resolved = statuses ?? assets.map(() => "completed");
  return {
    all_terminal: true,
    jobs: assets.map((asset, offset) => {
      const status = resolved[offset];
      const job: Record<string, unknown> = { index: asset.index, job_id: jobId(plan, batchIndex, offset, salt), status, type: "image" };
      if (status === "completed") { job.model = model; job.result_url = `https://d111111abcdef8.cloudfront.net/${asset.index}.png`; }
      if (status === "lookup_failed") job.retryable = false;
      return job;
    }),
    summary: summaryOf(resolved),
  };
}
function deps(bytes = png()): T015V4Dependencies { return { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: "::ffff:18.65.3.2" }) }; }

function preflight(prepared: Prepared, batchIndex: number, beforeUnits: number, base: number): void {
  const batch = prepared.plan.batches[batchIndex];
  ops(prepared, ["preflight-request", "--batch", batch.id, "--observed-at", at(base)]);
  const cost = json(prepared.root, `cost-${batch.id}-${base}.json`, { costs: costItems(prepared.plan, batchIndex, base) });
  const balance = json(prepared.root, `balance-${batch.id}-${base}.json`, { credits: beforeUnits / 100, provider_observed_at: at(base + 1 + batch.size) });
  ops(prepared, ["preflight-result", "--batch", batch.id, "--cost-file", cost, "--balance-file", balance, "--observed-at", at(base + 30)]);
}
async function completeBatch(prepared: Prepared, batchIndex: number, beforeUnits: number, base = batchIndex * 3600, salt = ""): Promise<number> {
  const batch = prepared.plan.batches[batchIndex];
  preflight(prepared, batchIndex, beforeUnits, base);
  ops(prepared, ["prepare", "--batch", batch.id, "--observed-at", at(base + 40)]);
  ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, `submit-${batch.id}-${base}.json`, submissionResponse(prepared.plan, batchIndex, salt)), "--observed-at", at(base + 50)]);
  ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(base + 60)]);
  await runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 70)], JSON.stringify(waitResponse(prepared.plan, batchIndex, undefined, "nano_banana_flash", salt)), prepared.root, prepared.plan, presentation, approval, deps());
  const after = beforeUnits - batch.size * 150;
  ops(prepared, ["balance-after", "--batch", batch.id, "--file", json(prepared.root, `after-${batch.id}-${base}.json`, { credits: after / 100 }), "--observed-at", at(base + 80)]);
  return after;
}
/** Drives a batch to SUBMITTING so its paid envelope has escaped. */
function submitting(prepared: Prepared, batchIndex: number, beforeUnits: number, base: number): void {
  preflight(prepared, batchIndex, beforeUnits, base);
  ops(prepared, ["prepare", "--batch", prepared.plan.batches[batchIndex].id, "--observed-at", at(base + 40)]);
}

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 plan identity", () => {
  test("slices exactly CANONICAL 12..331 out of the byte-pinned v2 plan with unchanged request hashes", () => {
    const plan = buildT015V4Plan(repositoryRoot);
    const pinned = loadPinnedT015V2Plan(repositoryRoot);
    expect(plan.assets).toHaveLength(320);
    expect(plan.assets[0].index).toBe(12);
    expect(plan.assets.at(-1)!.index).toBe(331);
    for (const asset of plan.assets) {
      const source = pinned.assets[asset.index];
      expect(asset.id).toBe(source.id);
      expect(asset.canonical_request_sha256).toBe(source.canonical_request_sha256);
      expect(sha256T015V4(canonicalJsonT015(asset.request))).toBe(source.canonical_request_sha256);
      expect(asset.request.params.use_unlim).toBe(false);
    }
    expect(crossCheckT015V4EffectivePrompts(repositoryRoot, plan, [12, 100, 200, 331])).toBe(4);
  });

  test("keeps batch ids canonical-shard-1-002..028 with 12x26+8 sizes and a 480.00/498.00 budget", () => {
    const plan = buildT015V4Plan(repositoryRoot);
    expect(plan.batches).toHaveLength(28);
    expect(plan.batches.slice(0, 27).map(({ id }) => id)).toEqual(Array.from({ length: 27 }, (_, index) => `canonical-shard-1-${String(index + 2).padStart(3, "0")}`));
    expect(plan.batches.slice(0, 26).every(({ size }) => size === 12)).toBe(true);
    expect(plan.batches[26].size).toBe(8);
    expect(plan.batches.slice(0, 27).reduce((sum, batch) => sum + batch.size, 0)).toBe(320);
    // The 28th batch is the v4.3 one-shot remediation of the seven lost indices.
    expect(plan.batches.at(-1)).toMatchObject({ id: T015_V4_3_REMEDIATION_BATCH_ID, size: 7 });
    expect(plan.remediation).toMatchObject({ indices: [...T015_V4_3_REMEDIATION_INDICES], credit_decimal: "10.50", one_shot: true, retry_or_regeneration_allowed: false });
    expect(plan.budget.additional_credit_cap_units).toBe(48_000);
    expect(plan.budget.legacy_committed_units).toBe(1_800);
    expect(plan.budget.total_credit_cap_units).toBe(49_800);
    expect(plan.budget.additional_credit_cap_decimal).toBe("480.00");
    expect(plan.budget.total_credit_cap_decimal).toBe("498.00");
    expect(plan.approval_gate.prior_t015_v1_v2_or_v3_approval_inherited).toBe(false);
    expect(plan.legacy_recovery.assets).toHaveLength(12);
  });

  test("discloses every required v4 risk and records the fresh v4.3 authorization", () => {
    for (const fragment of ["27", "18.00", "재제출", "896x1200", "4444ppm", "5000ppm", "861.90", "legacy_delta_mismatch", "2026-08-17", "use_unlim:false", "nano_banana_flash", "CLOSED_WITH_LOSSES", T015_V4_CANARY_BLOCKED_BATCH_ID, T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, T015_V4_3_EXACT_APPROVAL_PHRASE]) expect(T015_V4_RISK_TEXT).toContain(fragment);
    // v4.2 must disclose both mid-run defects, the migration, 004's expected discharge, the
    // index that stays ungenerated under this approval, and the spend already committed.
    for (const fragment of ["RECOVERY_FAILED", "result_url", "migrate", T015_V4_LEGACY_JOURNAL_PATH, T015_V4_JOURNAL_PATH, T015_V4_MIGRATION_FAIL_STOP_BATCH_ID, "16.50", "0.00", "index 42", "480.00 중 52.50"]) expect(T015_V4_RISK_TEXT).toContain(fragment);
    // v4.3 must disclose the zero-loss closure gap, the seven indices, the 10.50 budget, and
    // that a failure inside the remediation batch is final under this approval.
    for (const fragment of ["313/320", "469.50", "10.50", T015_V4_3_REMEDIATION_BATCH_ID, "CLOSED_WITH_LOSSES", "재생성의 재생성은 없습니다", "최종 상실", "49(005)", "116(010)", "204(018)", "225와 227(019)", "263(022)"]) expect(T015_V4_RISK_TEXT).toContain(fragment);
    // The v4.3 scope authorises regeneration, which the v4 phrase never did.
    expect(T015_V4_3_EXACT_APPROVAL_PHRASE).not.toBe(T015_V4_EXACT_APPROVAL_PHRASE);
    expect(T015_V4_RISK_TEXT).not.toContain(T015_V4_EXACT_APPROVAL_PHRASE);
    const checked = checkT015V4Preparation(repositoryRoot);
    // The fresh v4.3 approval was controller-attested and committed on 2026-08-13
    // (assets/evidence/t015-canonical-shard-1-approval-v4.3.json), so the live gate is
    // authorized; the frozen pending packet stays authorized:false as the immutable
    // pre-approval record.
    expect(checked.authorized).toBe(true);
    expect(isT015V4Authorized(repositoryRoot, checked.plan)).toBe(true);
    expect(JSON.parse(readFileSync(resolve(repositoryRoot, T015_V4_PENDING_PATH), "utf8"))).toMatchObject({ authorized: false, exact_approval_phrase_required: T015_V4_3_EXACT_APPROVAL_PHRASE, prior_t015_v1_v2_or_v3_approval_inherited: false });
  });

  test("F1 regression trap: package.json bytes still match the v1 and v3 implementation bindings", () => {
    const actual = sha256T015V4(readFileSync(resolve(repositoryRoot, "package.json")));
    for (const path of ["assets/manifests/t015-implementation-binding-v1.json", "assets/manifests/t015-implementation-binding-v3.json", T015_V4_BINDING_PATH]) {
      const binding = JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as { files: Record<string, { path: string; sha256: string }> };
      expect(binding.files.package_json.sha256).toBe(actual);
    }
    expect(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")).not.toMatch(/canonical-shard-1-production-v4/);
  });

  test("surfaces the implied legacy delta and flags a mismatch away from 18.00", () => {
    expect(t015V4LegacyDelta(parseT015V4BalanceFile({ credits: 843.9, provider_observed_at: at(0) }))).toMatchObject({ implied_legacy_delta_decimal: "18.00", legacy_delta_mismatch: false });
    expect(t015V4LegacyDelta(parseT015V4BalanceFile({ credits: 840, provider_observed_at: at(0) }))).toMatchObject({ implied_legacy_delta_decimal: "21.90", legacy_delta_mismatch: true });
    expect(() => parseT015V4BalanceFile({ credits: 840, provider_observed_at: at(0), extra: 1 })).toThrow(/invalid/);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 paid state machine", () => {
  test("anchors the run on an absolute init balance and walks a batch to COMPLETE with an exact 12x1.50 delta", async () => {
    const prepared = fixture();
    expect(journalOf(prepared).initial_balance).toMatchObject({ normalized_decimal: "500.00" });
    const after = await completeBatch(prepared, 0, START_UNITS);
    expect(after).toBe(48_200);
    const journal = journalOf(prepared);
    const record = journal.batches[0];
    expect(record.state).toBe("COMPLETE");
    expect(record.transitions.map(({ state }) => state)).toEqual(["PREFLIGHT_REQUESTED", "PREFLIGHT_VERIFIED", "SUBMITTING", "SUBMITTED", "RECOVERY_OPEN", "RECOVERING", "RECOVERED", "COMPLETE"]);
    expect(record.balance_after).toMatchObject({ delta_units: 1_800, delta_decimal: "18.00", charged_job_count: 12 });
    expect(record.recoveries).toHaveLength(12);
    expect(journal.run_state).toBe("ACTIVE");
    expect(journal.fail_stop_batch_id).toBeNull();
    expect(t015V4CanaryVerified(journal)).toBe(true);
    const bytes = readFileSync(resolve(prepared.root, T015_V4_JOURNAL_PATH), "utf8");
    expect(bytes).not.toMatch(/https?:\/\//);
    expect(bytes).not.toMatch(/cloudfront|result_url|hostname/);
    expect(assertJournalStillReadable(prepared)).toMatchObject({ run_state: "ACTIVE", recovered_assets: 12, total_delta_units: 1_800, acknowledged_loss_units: 0, unaccounted_max_exposure_units: 0, model_canary_verified: true, full_run_completion_reachable: true });
  });

  test("refuses an init balance that cannot cover the 480.00 additional cap", () => {
    const root = temporaryRoot("fictor-t015-v4-anchor-");
    const anchor = json(root, "initial-balance.json", { credits: 479.99, provider_observed_at: at(-120) });
    expect(() => runT015V4OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval)).toThrow(/does not cover the 480.00 additional cap/);
  });

  test("fail-stops batch 002 when its preflight balance drifts from the absolute init anchor", () => {
    const prepared = fixture();
    ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    const cost = json(prepared.root, "cost.json", { costs: costItems(prepared.plan, 0, 0) });
    const balance = json(prepared.root, "balance.json", { credits: 499, provider_observed_at: at(13) });
    expect(() => ops(prepared, ["preflight-result", "--batch", T015_V4_CANARY_BATCH_ID, "--cost-file", cost, "--balance-file", balance, "--observed-at", at(30)])).toThrow(/BALANCE_CHANGED/);
    expect(journalOf(prepared).batches[0].terminals[0].facts).toMatchObject({ stage: "BALANCE_CHAIN", expected_anchor_decimal: "500.00", observed_decimal: "499.00" });
    assertJournalStillReadable(prepared);
  });

  test("writes durable SUBMITTING evidence before the paid envelope is returned", () => {
    const prepared = fixture();
    preflight(prepared, 0, START_UNITS, 0);
    const envelope = ops(prepared, ["prepare", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(40)]) as { requests: unknown[] };
    expect(envelope.requests).toHaveLength(12);
    expect(journalOf(prepared).batches[0]).toMatchObject({ state: "SUBMITTING", paid_request: { prepared_at: at(40) } });
  });

  test("opens batch 003 only after the 002 model canary reports nano_banana_flash", async () => {
    const prepared = fixture();
    expect(() => ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BLOCKED_BATCH_ID, "--observed-at", at(0)])).toThrow(/must progress exactly in order/);
    await completeBatch(prepared, 0, START_UNITS);
    expect(t015V4CanaryVerified(journalOf(prepared))).toBe(true);
    preflight(prepared, 1, 48_200, 3_600);
    expect(journalOf(prepared).batches[1].state).toBe("PREFLIGHT_VERIFIED");
  });

  test("resets a zero-spend preflight from both preflight states and refuses every other state", () => {
    const prepared = fixture();
    ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    expect(ops(prepared, ["reset", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(10)])).toMatchObject({ state: "PLANNED", resets: 1, from_state: "PREFLIGHT_REQUESTED", zero_spend: true });
    expect(journalOf(prepared).batches[0].preflight).toBeUndefined();
    preflight(prepared, 0, START_UNITS, 100);
    expect(ops(prepared, ["reset", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(200)])).toMatchObject({ state: "PLANNED", resets: 2, from_state: "PREFLIGHT_VERIFIED" });
    expect(journalOf(prepared).batches[0].resets.map(({ from_state }) => from_state)).toEqual(["PREFLIGHT_REQUESTED", "PREFLIGHT_VERIFIED"]);
    expect(() => ops(prepared, ["reset", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(300)])).toThrow(/only legal from PREFLIGHT_REQUESTED, PREFLIGHT_VERIFIED, or a zero-spend FAIL_STOP/);
    submitting(prepared, 0, START_UNITS, 400);
    expect(() => ops(prepared, ["reset", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(450)])).toThrow(/whose paid envelope escaped are never reopened or resubmitted/);
  });

  test.each([
    ["stale cost observation", (costs: Array<Record<string, unknown>>) => { costs[11].provider_observed_at = at(700); }, /PRICE_CHANGED/],
    ["non-monotonic cost observations", (costs: Array<Record<string, unknown>>) => { costs[5].provider_observed_at = at(2); }, /PRICE_CHANGED/],
    ["changed exact unit cost", (costs: Array<Record<string, unknown>>) => { costs[3].cost = { credits: 1, credits_exact: 2 }; }, /PRICE_CHANGED/],
    ["mismatched request hash", (costs: Array<Record<string, unknown>>) => { costs[2].request_sha256 = "0".repeat(64); }, /PRICE_CHANGED/],
    ["unknown cost field", (costs: Array<Record<string, unknown>>) => { costs[1].discount = 0; }, /UNKNOWN_PROVIDER_FIELD/],
    ["a prototype-polluting cost key", (costs: Array<Record<string, unknown>>) => { withOwnProtoKey(costs[0]); }, /UNKNOWN_PROVIDER_FIELD/],
  ] as const)("fail-stops the batch on %s and leaves a readable journal", (_name, mutate, expected) => {
    const prepared = fixture();
    ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    const costs = costItems(prepared.plan, 0, 0) as unknown as Array<Record<string, unknown>>;
    mutate(costs);
    const cost = json(prepared.root, "cost.json", { costs });
    const balance = json(prepared.root, "balance.json", { credits: 500, provider_observed_at: at(13) });
    expect(() => ops(prepared, ["preflight-result", "--batch", T015_V4_CANARY_BATCH_ID, "--cost-file", cost, "--balance-file", balance, "--observed-at", at(30)])).toThrow(expected);
    const journal = journalOf(prepared);
    expect(journal.run_state).toBe("FAIL_STOP");
    expect(journal.fail_stop_batch_id).toBe(T015_V4_CANARY_BATCH_ID);
    expect(journal.batches[0]).toMatchObject({ state: "FAIL_STOP" });
    expect(journal.batches[0].terminals[0]).toMatchObject({ scope: "BATCH", automatic_paid_retry: false, paid_retry_count: 0, no_resubmit: true });
    expect(assertJournalStillReadable(prepared)).toMatchObject({ run_state: "FAIL_STOP", unaccounted_max_exposure_units: 0 });
  });

  test("rejects a prototype-polluting balance payload and an absolute operator path", () => {
    const prepared = fixture();
    ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    const cost = json(prepared.root, "cost.json", { costs: costItems(prepared.plan, 0, 0) });
    const polluted = json(prepared.root, "balance.json", withOwnProtoKey({ credits: 500, provider_observed_at: at(13) }));
    expect(() => ops(prepared, ["preflight-result", "--batch", T015_V4_CANARY_BATCH_ID, "--cost-file", cost, "--balance-file", polluted, "--observed-at", at(30)])).toThrow(/UNKNOWN_PROVIDER_FIELD/);
    expect(journalOf(prepared).batches[0].terminals[0].facts).toMatchObject({ stage: "BALANCE_FIELDS" });
    const other = fixture();
    ops(other, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    expect(() => ops(other, ["preflight-result", "--batch", T015_V4_CANARY_BATCH_ID, "--cost-file", resolve(other.root, "cost.json"), "--balance-file", "balance.json", "--observed-at", at(30)])).toThrow(/--cost-file must be a repository-relative path/);
    expect(journalOf(other).batches[0].terminals).toHaveLength(0);
  });

  test("fail-stops when the reported balance no longer covers every remaining v4 batch", () => {
    const prepared = fixture(T015_V4_ADDITIONAL_CAP_UNITS);
    ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    const cost = json(prepared.root, "cost.json", { costs: costItems(prepared.plan, 0, 0) });
    const balance = json(prepared.root, "balance.json", { credits: 479.99, provider_observed_at: at(13) });
    expect(() => ops(prepared, ["preflight-result", "--batch", T015_V4_CANARY_BATCH_ID, "--cost-file", cost, "--balance-file", balance, "--observed-at", at(30)])).toThrow(/BALANCE_CHANGED/);
    expect(journalOf(prepared).batches[0].terminals[0].facts).toMatchObject({ stage: "BALANCE_CHAIN", observed_decimal: "479.99", minimum_remaining_decimal: "480.00" });
    assertJournalStillReadable(prepared);
  });

  test("fail-stops when the inter-batch balance chain breaks", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    const batch = prepared.plan.batches[1];
    ops(prepared, ["preflight-request", "--batch", batch.id, "--observed-at", at(3_600)]);
    const cost = json(prepared.root, "cost-chain.json", { costs: costItems(prepared.plan, 1, 3_600) });
    const balance = json(prepared.root, "balance-chain.json", { credits: 481.5, provider_observed_at: at(3_613) });
    expect(() => ops(prepared, ["preflight-result", "--batch", batch.id, "--cost-file", cost, "--balance-file", balance, "--observed-at", at(3_630)])).toThrow(/BALANCE_CHANGED/);
    expect(journalOf(prepared).batches[1].terminals[0].facts).toMatchObject({ stage: "BALANCE_CHAIN", expected_anchor_decimal: "482.00", observed_decimal: "481.50" });
    assertJournalStillReadable(prepared);
  });

  test("fail-stops an ambiguous submission without enumerable jobs and refuses to resume it undischarged", () => {
    const prepared = fixture();
    submitting(prepared, 0, START_UNITS, 0);
    expect(() => ops(prepared, ["ambiguous", "--batch", T015_V4_CANARY_BATCH_ID, "--reason", "TIMEOUT", "--observed-at", at(50)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    expect(journalOf(prepared).batches[0].terminals[0].facts).toMatchObject({ reason: "TIMEOUT", outcome: "UNKNOWN", jobs_enumerable: false, max_exposure_decimal: "18.00", discharge_required: true });
    expect(() => ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(60)])).toThrow(/zero-spend, fully recovered with balance verified, or loss-acknowledged/);
    expect(assertJournalStillReadable(prepared)).toMatchObject({ unaccounted_max_exposure_units: 1_800, unaccounted_max_exposure_decimal: "18.00", full_run_completion_reachable: false });
  });

  test.each([
    ["a missing job", (response: Record<string, unknown>) => { (response.jobs as unknown[]).pop(); response.submitted_count = 11; }, /PARTIAL_OR_MISMATCHED_BATCH_RESPONSE/, true],
    ["a duplicated job id", (response: Record<string, unknown>) => { (response.jobs as Array<Record<string, unknown>>)[1].job_id = (response.jobs as Array<Record<string, unknown>>)[0].job_id; }, /PARTIAL_OR_MISMATCHED_BATCH_RESPONSE/, true],
    ["an unknown top-level key", (response: Record<string, unknown>) => { response.queue = "fast"; }, /UNKNOWN_PROVIDER_FIELD/, false],
    ["a prototype-polluting top-level key", (response: Record<string, unknown>) => { withOwnProtoKey(response); }, /UNKNOWN_PROVIDER_FIELD/, false],
    ["an unknown per-job key", (response: Record<string, unknown>) => { (response.jobs as Array<Record<string, unknown>>)[2].eta = 5; }, /PARTIAL_OR_MISMATCHED_BATCH_RESPONSE/, true],
    ["an allowed-optional job field", (response: Record<string, unknown>) => { (response.jobs as Array<Record<string, unknown>>)[4].warning = "slow"; }, /PROVIDER_RESPONSE_SIGNAL/, true],
    ["a terminal-failed submit status", (response: Record<string, unknown>) => { (response.jobs as Array<Record<string, unknown>>)[7].status = "submission_failed"; }, /GENERATION_FAILED/, true],
  ] as const)("fail-stops the submission response on %s and leaves a readable journal", (_name, mutate, expected, expectSubmission) => {
    const prepared = fixture();
    submitting(prepared, 0, START_UNITS, 0);
    const response = submissionResponse(prepared.plan, 0) as unknown as Record<string, unknown>;
    mutate(response);
    expect(() => ops(prepared, ["response", "--batch", T015_V4_CANARY_BATCH_ID, "--file", json(prepared.root, "submit.json", response), "--observed-at", at(50)])).toThrow(expected);
    const journal = journalOf(prepared);
    expect(journal.run_state).toBe("FAIL_STOP");
    expect(journal.batches[0].terminals[0].scope).toBe("BATCH");
    expect(journal.batches[0].submission !== undefined).toBe(expectSubmission);
    assertJournalStillReadable(prepared);
  });

  test("fail-stops a batch that reuses a job id already claimed by an earlier batch", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    const batch = prepared.plan.batches[1];
    submitting(prepared, 1, 48_200, 3_600);
    const response = submissionResponse(prepared.plan, 1) as unknown as Record<string, unknown>;
    (response.jobs as Array<Record<string, unknown>>)[3].job_id = jobId(prepared.plan, 0, 3);
    expect(() => ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit-dup.json", response), "--observed-at", at(3_650)])).toThrow(/PARTIAL_OR_MISMATCHED_BATCH_RESPONSE/);
    const journal = journalOf(prepared);
    expect(journal.batches[1].submission!.jobs.map(({ job_id }) => job_id)).not.toContain(jobId(prepared.plan, 0, 3));
    expect(journal.batches[1].submission!.topology_valid).toBe(false);
    assertJournalStillReadable(prepared);
  });

  test("recovers every good completed asset before fail-stopping a batch with a failed generation", async () => {
    const prepared = fixture();
    submitting(prepared, 0, START_UNITS, 0);
    ops(prepared, ["response", "--batch", T015_V4_CANARY_BATCH_ID, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
    ops(prepared, ["recovery-open", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    const statuses = [...Array<string>(11).fill("completed"), "nsfw"];
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0, statuses)), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/GENERATION_FAILED/);
    const journal = journalOf(prepared);
    expect(journal.batches[0].recoveries).toHaveLength(11);
    expect(journal.batches[0].terminals.at(-1)!.facts).toMatchObject({ status: "nsfw", good_assets_recovered_first: 11, unrecoverable_confirmed_jobs: 1, discharge_required: true });
    expect(() => ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(90)])).toThrow(/unrecovered and undischarged/);
    expect(assertJournalStillReadable(prepared)).toMatchObject({ unaccounted_max_exposure_units: 150 });
  });

  test.each([
    ["model drift", async (prepared: Prepared) => runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0, undefined, "nano_banana_pro")), prepared.root, prepared.plan, presentation, approval, deps()), /MODEL_DRIFT/],
    ["a summary value mismatch", async (prepared: Prepared) => { const response = waitResponse(prepared.plan, 0) as unknown as Record<string, unknown>; response.summary = { total: 12, completed: 11, active: 1, errors: 0, failed: 0 }; return runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(70)], JSON.stringify(response), prepared.root, prepared.plan, presentation, approval, deps()); }, /UNKNOWN_PROVIDER_FIELD/],
    ["a transport peer that does not match the DNS pin", async (prepared: Prepared) => runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0)), prepared.root, prepared.plan, presentation, approval, { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes: png(), remoteAddress: "::ffff:18.65.3.3" }) }), /RECOVERY_FAILED/],
  ] as const)("fail-stops jobs-handoff on %s and leaves a readable journal", async (_name, run, expected) => {
    const prepared = fixture();
    submitting(prepared, 0, START_UNITS, 0);
    ops(prepared, ["response", "--batch", T015_V4_CANARY_BATCH_ID, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
    ops(prepared, ["recovery-open", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    await expect(run(prepared)).rejects.toThrow(expected);
    expect(journalOf(prepared).run_state).toBe("FAIL_STOP");
    assertJournalStillReadable(prepared);
  });

  test("journals the actual width and height when a paid PNG misses the 3:4 tolerance", async () => {
    const prepared = fixture();
    submitting(prepared, 0, START_UNITS, 0);
    ops(prepared, ["response", "--batch", T015_V4_CANARY_BATCH_ID, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
    ops(prepared, ["recovery-open", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0)), prepared.root, prepared.plan, presentation, approval, deps(png(5, 4)))).rejects.toThrow(/RECOVERY_FAILED/);
    expect(journalOf(prepared).batches[0].terminals[0].facts).toMatchObject({ reason: "PNG_DIMENSION_MISMATCH", actual_width: 5, actual_height: 4, expected_aspect_ratio: "3:4", aspect_tolerance_ppm: 5000 });
    assertJournalStillReadable(prepared);
  });

  test("fail-stops on a wrong balance-after delta, persists the observation, and rejects a second balance-after", async () => {
    const prepared = fixture();
    const batch = prepared.plan.batches[0];
    submitting(prepared, 0, START_UNITS, 0);
    ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
    ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    await runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0)), prepared.root, prepared.plan, presentation, approval, deps());
    expect(() => ops(prepared, ["balance-after", "--batch", batch.id, "--file", json(prepared.root, "after.json", { credits: 483 }), "--observed-at", at(80)])).toThrow(/BALANCE_CHANGED/);
    expect(journalOf(prepared).batches[0].terminals[0].facts).toMatchObject({ stage: "BALANCE_AFTER_DELTA", expected_delta_decimal: "18.00", observed_delta_units: 1_700, observed_delta_decimal: "17.00", observed_balance_decimal: "483.00" });
    assertJournalStillReadable(prepared);

    const clean = fixture();
    await completeBatch(clean, 0, START_UNITS);
    expect(() => ops(clean, ["balance-after", "--batch", clean.plan.batches[0].id, "--file", json(clean.root, "after-again.json", { credits: 482 }), "--observed-at", at(200)])).toThrow(/balance-after is already recorded/);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 zero-spend re-run and loss discharge", () => {
  test("BL-2: a zero-spend fail-stop resumes, resets, re-runs 002 to COMPLETE, and unblocks 003", async () => {
    const prepared = fixture();
    ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    const costs = costItems(prepared.plan, 0, 0) as unknown as Array<Record<string, unknown>>;
    costs[0].cost = { credits: 1, credits_exact: 3 };
    expect(() => ops(prepared, ["preflight-result", "--batch", T015_V4_CANARY_BATCH_ID, "--cost-file", json(prepared.root, "cost.json", { costs }), "--balance-file", json(prepared.root, "balance.json", { credits: 500, provider_observed_at: at(13) }), "--observed-at", at(30)])).toThrow(/PRICE_CHANGED/);
    expect(ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(40)])).toMatchObject({ run_state: "ACTIVE", disposition: "ZERO_SPEND", rerunnable: true, resubmitted: false });
    expect(ops(prepared, ["reset", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(50)])).toMatchObject({ state: "PLANNED", from_state: "FAIL_STOP", terminals_preserved: 1 });
    expect(journalOf(prepared).batches[0].terminals[0].code).toBe("PRICE_CHANGED");
    expect(await completeBatch(prepared, 0, START_UNITS, 3_600)).toBe(48_200);
    const journal = journalOf(prepared);
    expect(journal.batches[0].state).toBe("COMPLETE");
    expect(journal.batches[0].terminals).toHaveLength(1);
    expect(journal.batches[0].discharges[0]).toMatchObject({ kind: "ZERO_SPEND_RESET", acknowledged_loss_units: 0, observed_delta_units: 0 });
    expect(t015V4CanaryVerified(journal)).toBe(true);
    preflight(prepared, 1, 48_200, 7_200);
    expect(journalOf(prepared).batches[1].state).toBe("PREFLIGHT_VERIFIED");
    expect(statusT015V4(journalOf(prepared))).toMatchObject({ acknowledged_loss_units: 0, full_run_completion_reachable: true, total_delta_units: 1_800 });
  });

  test("never resets a batch whose paid envelope escaped, even after a resume", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    submitting(prepared, 1, 48_200, 3_600);
    expect(() => ops(prepared, ["ambiguous", "--batch", prepared.plan.batches[1].id, "--reason", "TRANSPORT_ERROR", "--observed-at", at(3_650)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    const loss = json(prepared.root, "loss.json", { credits: 464, provider_observed_at: at(3_700) });
    ops(prepared, ["acknowledge-loss", "--batch", prepared.plan.batches[1].id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", loss, "--observed-at", at(3_710)]);
    ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(3_720)]);
    expect(() => ops(prepared, ["reset", "--batch", prepared.plan.batches[1].id, "--observed-at", at(3_730)])).toThrow(/never reopened or resubmitted/);
    expect(() => ops(prepared, ["preflight-request", "--batch", prepared.plan.batches[1].id, "--observed-at", at(3_740)])).toThrow(/never reopened or resubmitted/);
  });

  test("discharges an ambiguous loss against the observed balance and re-anchors the chain", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    const failing = prepared.plan.batches[1];
    submitting(prepared, 1, 48_200, 3_600);
    expect(() => ops(prepared, ["ambiguous", "--batch", failing.id, "--reason", "TIMEOUT", "--observed-at", at(3_650)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    expect(() => ops(prepared, ["acknowledge-loss", "--batch", failing.id, "--operator-phrase", "T015 v4 손실 확인", "--balance-file", json(prepared.root, "loss.json", { credits: 464, provider_observed_at: at(3_700) }), "--observed-at", at(3_710)])).toThrow(/exact operator phrase/);
    const acknowledged = ops(prepared, ["acknowledge-loss", "--batch", failing.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: 464, provider_observed_at: at(3_700) }), "--observed-at", at(3_710)]);
    expect(acknowledged).toMatchObject({ terminal_code: "AMBIGUOUS_SUBMISSION", observed_delta_decimal: "18.00", recovered_decimal: "0.00", acknowledged_loss_decimal: "18.00", new_balance_anchor_decimal: "464.00", cap_used_decimal: "36.00", resubmitted: false, regenerated: false });
    expect(ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(3_720)])).toMatchObject({ run_state: "ACTIVE", disposition: "DISCHARGED_LOSS", rerunnable: false });
    // The post-loss observation becomes the anchor for the next batch's preflight.
    preflight(prepared, 2, 46_400, 7_200);
    expect(journalOf(prepared).batches[2].state).toBe("PREFLIGHT_VERIFIED");
    expect(statusT015V4(journalOf(prepared))).toMatchObject({ acknowledged_loss_units: 1_800, acknowledged_loss_decimal: "18.00", total_delta_units: 3_600, unaccounted_max_exposure_units: 0, full_run_completion_reachable: false });
  });

  test("charges only the unrecovered remainder when good assets were saved before the failure", async () => {
    const prepared = fixture();
    submitting(prepared, 0, START_UNITS, 0);
    ops(prepared, ["response", "--batch", T015_V4_CANARY_BATCH_ID, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
    ops(prepared, ["recovery-open", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0, [...Array<string>(11).fill("completed"), "nsfw"])), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/GENERATION_FAILED/);
    const acknowledged = ops(prepared, ["acknowledge-loss", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: 482, provider_observed_at: at(80) }), "--observed-at", at(90)]);
    expect(acknowledged).toMatchObject({ terminal_code: "GENERATION_FAILED", observed_delta_decimal: "18.00", recovered_decimal: "16.50", acknowledged_loss_decimal: "1.50" });
    expect(ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(100)])).toMatchObject({ disposition: "DISCHARGED_LOSS" });
  });

  test("NB-1: a discharged batch cannot be reopened, re-polled, or discharged a second time", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    const failing = prepared.plan.batches[1];
    submitting(prepared, 1, 48_200, 3_600);
    ops(prepared, ["response", "--batch", failing.id, "--file", json(prepared.root, "submit-b3.json", submissionResponse(prepared.plan, 1)), "--observed-at", at(3_650)]);
    ops(prepared, ["recovery-open", "--batch", failing.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(3_660)]);
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", failing.id, "--observed-at", at(3_670)], JSON.stringify(waitResponse(prepared.plan, 1, [...Array<string>(11).fill("completed"), "nsfw"])), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/GENERATION_FAILED/);
    const first = ops(prepared, ["acknowledge-loss", "--batch", failing.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: 464, provider_observed_at: at(3_680) }), "--observed-at", at(3_690)]);
    expect(first).toMatchObject({ observed_delta_decimal: "18.00", recovered_decimal: "16.50", acknowledged_loss_decimal: "1.50", cap_used_decimal: "36.00" });
    // Reopening the discharged batch is the route the double-booking took.
    expect(() => ops(prepared, ["recovery-open", "--batch", failing.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(3_700)])).toThrow(/loss-discharged batch is never reopened/);
    expect(() => ops(prepared, ["acknowledge-loss", "--batch", failing.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss2.json", { credits: 446, provider_observed_at: at(3_710) }), "--observed-at", at(3_720)])).toThrow(/already has an acknowledged loss/);
    const journal = journalOf(prepared);
    expect(journal.batches[1].discharges).toHaveLength(1);
    expect(statusT015V4(journal)).toMatchObject({ total_delta_units: 3_600, total_delta_decimal: "36.00", acknowledged_loss_decimal: "1.50" });
  });

  test("NB-1: the validator rejects a hand-edited journal that double-books a batch's spend", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    const failing = prepared.plan.batches[1];
    submitting(prepared, 1, 48_200, 3_600);
    expect(() => ops(prepared, ["ambiguous", "--batch", failing.id, "--reason", "TIMEOUT", "--observed-at", at(3_650)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    ops(prepared, ["acknowledge-loss", "--batch", failing.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: 464, provider_observed_at: at(3_700) }), "--observed-at", at(3_710)]);
    const crafted = journalOf(prepared);
    const record = crafted.batches[1];
    record.terminals.push({ ...record.terminals[0], observed_at: at(3_760) });
    record.discharges.push({ ...record.discharges[0], observed_at: at(3_770), terminals_discharged: 2, balance_after_loss: { credits: 446, normalized_decimal: "446.00", provider_observed_at: at(3_770) } });
    expect(() => validateT015V4Journal(crafted, prepared.plan, presentation, approval)).toThrow(/discharge/);
    expect(record.discharges.reduce((sum, discharge) => sum + discharge.observed_delta_units, 0)).toBeGreaterThan(1_800);
  });

  test("refuses a loss discharge for a zero-spend batch and for an out-of-range observation", async () => {
    const zero = fixture();
    ops(zero, ["preflight-request", "--batch", T015_V4_CANARY_BATCH_ID, "--observed-at", at(0)]);
    const costs = costItems(zero.plan, 0, 0) as unknown as Array<Record<string, unknown>>;
    costs[0].cost = { credits: 1, credits_exact: 3 };
    expect(() => ops(zero, ["preflight-result", "--batch", T015_V4_CANARY_BATCH_ID, "--cost-file", json(zero.root, "cost.json", { costs }), "--balance-file", json(zero.root, "balance.json", { credits: 500, provider_observed_at: at(13) }), "--observed-at", at(30)])).toThrow(/PRICE_CHANGED/);
    expect(() => ops(zero, ["acknowledge-loss", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(zero.root, "loss.json", { credits: 490, provider_observed_at: at(40) }), "--observed-at", at(50)])).toThrow(/zero-spend batches are reset and re-run/);

    const spent = fixture();
    submitting(spent, 0, START_UNITS, 0);
    expect(() => ops(spent, ["ambiguous", "--batch", T015_V4_CANARY_BATCH_ID, "--reason", "TIMEOUT", "--observed-at", at(50)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    expect(() => ops(spent, ["acknowledge-loss", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(spent.root, "loss.json", { credits: 400, provider_observed_at: at(60) }), "--observed-at", at(70)])).toThrow(/outside the 0..18.00 exposure/);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 operator-gated resume", () => {
  async function signalFailStop(): Promise<Prepared> {
    const prepared = fixture();
    const batch = prepared.plan.batches[0];
    submitting(prepared, 0, START_UNITS, 0);
    const response = submissionResponse(prepared.plan, 0) as unknown as Record<string, unknown>;
    (response.jobs as Array<Record<string, unknown>>)[4].warning = "slow";
    expect(() => ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit.json", response), "--observed-at", at(50)])).toThrow(/PROVIDER_RESPONSE_SIGNAL/);
    ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    await runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0)), prepared.root, prepared.plan, presentation, approval, deps());
    return prepared;
  }

  test("clears a fully recovered, balance-verified fail-stop and never reopens the failed batch", async () => {
    const prepared = await signalFailStop();
    const batch = prepared.plan.batches[0];
    expect(ops(prepared, ["balance-after", "--batch", batch.id, "--file", json(prepared.root, "after.json", { credits: 482 }), "--observed-at", at(80)])).toMatchObject({ state: "RECOVERED", run_state: "FAIL_STOP", delta_units: 1_800, charged_job_count: 12 });
    expect(ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(90)])).toMatchObject({ run_state: "ACTIVE", disposition: "FULLY_RECOVERED_BALANCE_VERIFIED", resubmitted: false, rerunnable: false, paid_retry_count: 0 });
    expect(journalOf(prepared).batches[0].state).toBe("RECOVERED");
    expect(() => ops(prepared, ["preflight-request", "--batch", batch.id, "--observed-at", at(100)])).toThrow(/never reopened or resubmitted/);
    expect(() => ops(prepared, ["prepare", "--batch", batch.id, "--observed-at", at(100)])).toThrow(/never reopened or resubmitted/);
    expect(t015V4CanaryVerified(journalOf(prepared))).toBe(true);
    preflight(prepared, 1, 48_200, 3_600);
    expect(journalOf(prepared).batches[1].state).toBe("PREFLIGHT_VERIFIED");
    expect(journalOf(prepared).batches[0].terminals[0].code).toBe("PROVIDER_RESPONSE_SIGNAL");
  });

  test("preserves every terminal and recovery gate as append-only forensics", async () => {
    const prepared = fixture();
    const batch = prepared.plan.batches[0];
    submitting(prepared, 0, START_UNITS, 0);
    const response = submissionResponse(prepared.plan, 0) as unknown as Record<string, unknown>;
    (response.jobs as Array<Record<string, unknown>>)[4].warning = "slow";
    expect(() => ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit.json", response), "--observed-at", at(50)])).toThrow(/PROVIDER_RESPONSE_SIGNAL/);
    ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    expect(ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(65)])).toMatchObject({ idempotent: true, original_terminal_preserved: "PROVIDER_RESPONSE_SIGNAL" });
    // A second download failure must append a terminal, never overwrite the first one.
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(70)], JSON.stringify(waitResponse(prepared.plan, 0)), prepared.root, prepared.plan, presentation, approval, { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => { throw new Error("transport"); } })).rejects.toThrow(/RECOVERY_FAILED/);
    const record = journalOf(prepared).batches[0];
    expect(record.terminals.map(({ code }) => code)).toEqual(["PROVIDER_RESPONSE_SIGNAL", "RECOVERY_FAILED"]);
    expect(record.recovery_gates).toHaveLength(1);
    expect(ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(80)])).toMatchObject({ original_terminal_preserved: "PROVIDER_RESPONSE_SIGNAL" });
    expect(journalOf(prepared).batches[0].recovery_gates).toHaveLength(2);
    assertJournalStillReadable(prepared);
  });

  test("rejects a resume without the exact phrase, without a fail-stop, or before balance verification", async () => {
    const clean = fixture();
    expect(() => ops(clean, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(10)])).toThrow(/requires a batch-scoped FAIL_STOP/);
    const prepared = await signalFailStop();
    expect(() => ops(prepared, ["resume", "--operator-phrase", "T015 v4 그냥 계속합니다.", "--observed-at", at(80)])).toThrow(/exact operator phrase/);
    expect(() => ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(80)])).toThrow(/zero-spend, fully recovered with balance verified, or loss-acknowledged/);
    expect(journalOf(prepared).run_state).toBe("FAIL_STOP");
    expect(journalOf(prepared).resumes).toHaveLength(0);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 secure download", () => {
  const pinned: T015V4Dependencies["resolve"] = async () => [{ address: "18.65.3.2", family: 4 }];
  const url = "https://d111111abcdef8.cloudfront.net/a.png";
  test("accepts a pinned 200 image/png with a matching content-length", async () => {
    const bytes = png();
    await expect(downloadT015V4(url, { resolve: pinned, fetch: async () => ({ status: 200, headers: { "content-type": "image/png", "content-length": String(bytes.length) }, bytes, remoteAddress: "18.65.3.2" }) })).resolves.toEqual(bytes);
  });
  test.each([
    ["a redirect loop past the hop limit", { status: 302, headers: { location: "https://d111111abcdef8.cloudfront.net/next.png" } as Record<string, string>, bytes: Buffer.alloc(0) }],
    ["a content-length that disagrees with the body", { status: 200, headers: { "content-type": "image/png", "content-length": "99999" }, bytes: png() }],
    ["a non image/png content type", { status: 200, headers: { "content-type": "text/html" }, bytes: png() }],
    ["an oversize body", { status: 200, headers: { "content-type": "image/png" }, bytes: Buffer.alloc(31 * 1024 * 1024) }],
    ["a non-200 status", { status: 404, headers: { "content-type": "image/png" }, bytes: png() }],
    ["a private resolver answer", null],
  ] as const)("rejects %s", async (_name, response) => {
    let hops = 0;
    const dependencies: T015V4Dependencies = response === null
      ? { resolve: async () => [{ address: "10.0.0.1", family: 4 }], fetch: async () => { throw new Error("must not fetch"); } }
      : { resolve: pinned, fetch: async () => { hops += 1; return { ...response, remoteAddress: "18.65.3.2" }; } };
    await expect(downloadT015V4(url, dependencies)).rejects.toThrow(/DOWNLOAD_FAILED/);
    if (response !== null && response.status === 302) expect(hops).toBe(4);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 runner lock and committed-clean scope", () => {
  test("takes over a stale lock atomically and never lets two callers hold it at once", () => {
    const root = temporaryRoot("fictor-t015-v4-lock-");
    mkdirSync(resolve(root, "assets/runs/t015-canonical-shard-1"), { recursive: true });
    const directory = resolve(root, `${T015_V4_LOCK_PATH}.d`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "holder.json"), JSON.stringify({ pid: 999_999_999, created_at_ms: Date.now() - 30 * 60 * 1000 }), { mode: 0o600 });
    const first = acquireT015V4Lock(root);
    expect(first.path).toBe(directory);
    for (let attempt = 0; attempt < 3; attempt += 1) expect(() => acquireT015V4Lock(root)).toThrow(/RUNNER_LOCKED/);
    first.release();
    const second = acquireT015V4Lock(root);
    expect(second.path).toBe(directory);
    second.release();
    first.release();
    expect(acquireT015V4Lock(root).path).toBe(directory);
  });

  test("verifies the committed-clean binding scope without git show", () => {
    const source = readFileSync(resolve(repositoryRoot, "scripts/assets/canonical-shard-1-production-v4-ops.ts"), "utf8");
    expect(source).not.toMatch(/"show"/);
    expect(source).toMatch(/maxBuffer: GIT_MAX_BUFFER/);
    expect(source.match(/execFileSync\(/g) ?? []).toHaveLength(3);
    expect(source).toMatch(/agent: false, autoSelectFamily: false/);
    expect(source).toMatch(/if \(command !== "status"\) assertT015V4CommittedClean/);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 final audit", () => {
  test("closes 320 paid plus 12 pinned v3 assets at exactly 480.00 + 18.00 = 498.00", async () => {
    const prepared = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T015_V4_PAID_BATCH_COUNT; index += 1) balance = await completeBatch(prepared, index, balance);
    expect(balance).toBe(START_UNITS - T015_V4_ADDITIONAL_CAP_UNITS);
    const journal = journalOf(prepared);
    expect(journal.run_state).toBe("COMPLETE");
    copyLegacyAssets(prepared);
    const audit = auditT015V4(contextOf(prepared), journal, at(200_000));
    expect(audit).toMatchObject({
      run_state: "COMPLETE", exact_closure: true, paid_assets_recovered: 320, paid_assets_lost: 0, legacy_assets: 12, total_assets_present: 332, total_assets_planned: 332, batches: 28, paid_batches: 27, lost_indices: [], all_paid_assets_delivered: true, closes_at_exact_cap: true,
      total_delta_units: T015_V4_ADDITIONAL_CAP_UNITS, total_delta_decimal: "480.00", acknowledged_loss_units: 0, acknowledged_loss_decimal: "0.00",
      cumulative_units: T015_V4_ADDITIONAL_CAP_UNITS + T015_V4_LEGACY_COMMITTED_UNITS, cumulative_decimal: "498.00", within_additional_cap: true, within_total_cap: true,
      paid_retry_count: 0, local_backup_verified: true, v3_recoveries_hash_matched: 12,
      excluded_canonical_paths_absent: true, excluded_checked_count: 994, contact_segments: 29, contact_index_eager_full_image_load: false, regenerated_lost_indices: false,
    });
    expect(T015_V4_ADDITIONAL_CAP_UNITS + T015_V4_LEGACY_COMMITTED_UNITS).toBe(T015_V4_TOTAL_CAP_UNITS);
    expect(readFileSync(resolve(prepared.root, "docs/asset-runs/contact-sheets/t015-canonical-shard-1-v4.html"), "utf8")).not.toMatch(/<img\b/i);
  }, 300_000);

  test("closes a run that lost one mid-run batch as CLOSED_WITH_LOSSES with exact loss accounting", async () => {
    const prepared = fixture();
    let balance = START_UNITS;
    balance = await completeBatch(prepared, 0, balance);
    const lost = prepared.plan.batches[1];
    submitting(prepared, 1, balance, 3_600);
    expect(() => ops(prepared, ["ambiguous", "--batch", lost.id, "--reason", "MISSING_DEFINITE_RESULT", "--observed-at", at(3_650)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    balance -= lost.size * 150;
    ops(prepared, ["acknowledge-loss", "--batch", lost.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: balance / 100, provider_observed_at: at(3_700) }), "--observed-at", at(3_710)]);
    ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(3_720)]);
    for (let index = 2; index < T015_V4_PAID_BATCH_COUNT; index += 1) balance = await completeBatch(prepared, index, balance);
    copyLegacyAssets(prepared);
    const audit = auditT015V4(contextOf(prepared), journalOf(prepared), at(200_000));
    expect(audit).toMatchObject({
      run_state: "CLOSED_WITH_LOSSES", exact_closure: false, paid_assets_recovered: 308, paid_assets_lost: 12, legacy_assets: 12, total_assets_present: 320,
      total_delta_units: T015_V4_ADDITIONAL_CAP_UNITS, total_delta_decimal: "480.00", acknowledged_loss_units: 1_800, acknowledged_loss_decimal: "18.00",
      cumulative_decimal: "498.00", within_additional_cap: true, within_total_cap: true, contact_segments: 29, regenerated_lost_indices: false,
    });
    expect((audit.batch_dispositions as Array<Record<string, unknown>>)[1]).toMatchObject({ batch_id: lost.id, disposition: "DISCHARGED_LOSS", recovered: 0, acknowledged_loss_decimal: "18.00" });
    expect(journalOf(prepared).run_state).toBe("CLOSED_WITH_LOSSES");
    expect(statusT015V4(journalOf(prepared))).toMatchObject({ run_state: "CLOSED_WITH_LOSSES", recovered_assets: 308, acknowledged_loss_decimal: "18.00", full_run_completion_reachable: false });
  }, 300_000);
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4 closure after a mid-run stop", () => {
  test("closes with losses while the untouched batches stay unstarted", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    const lost = prepared.plan.batches[1];
    submitting(prepared, 1, 48_200, 3_600);
    expect(() => ops(prepared, ["ambiguous", "--batch", lost.id, "--reason", "TRANSPORT_ERROR", "--observed-at", at(3_650)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    ops(prepared, ["acknowledge-loss", "--batch", lost.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: 464, provider_observed_at: at(3_700) }), "--observed-at", at(3_710)]);
    ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(3_720)]);
    copyLegacyAssets(prepared);
    const audit = auditT015V4(contextOf(prepared), journalOf(prepared), at(200_000));
    expect(audit).toMatchObject({
      run_state: "CLOSED_WITH_LOSSES", exact_closure: false, paid_assets_recovered: 12, paid_assets_lost: 308, legacy_assets: 12,
      unstarted_batches: 26, total_delta_decimal: "36.00", acknowledged_loss_decimal: "18.00", cumulative_decimal: "54.00", within_additional_cap: true, within_total_cap: true,
    });
    expect((audit.batch_dispositions as Array<Record<string, unknown>>)[2]).toMatchObject({ disposition: "UNSTARTED", recovered: 0 });
    expect(journalOf(prepared).run_state).toBe("CLOSED_WITH_LOSSES");
  });

  test("reports a healthy in-flight batch as still able to deliver everything", () => {
    const prepared = fixture();
    submitting(prepared, 0, START_UNITS, 0);
    expect(statusT015V4(journalOf(prepared))).toMatchObject({ full_run_completion_reachable: true, unaccounted_max_exposure_units: 0 });
    expect((statusT015V4(journalOf(prepared)).batches as Array<Record<string, unknown>>)[0]).toMatchObject({ state: "SUBMITTING", can_deliver_all_assets: true, disposition: "IN_PROGRESS" });
    expect((statusT015V4(journalOf(prepared)).batches as Array<Record<string, unknown>>)[5]).toMatchObject({ disposition: "UNSTARTED" });
  });
});

function copyLegacyAssets(prepared: Prepared): void {
  for (const legacy of prepared.plan.legacy_recovery.assets) {
    for (const root of ["public/assets", "assets/backups/t015-canonical-shard-1"]) {
      mkdirSync(resolve(prepared.root, root, legacy.path, ".."), { recursive: true });
      copyFileSync(resolve(repositoryRoot, "public/assets", legacy.path), resolve(prepared.root, root, legacy.path));
    }
  }
}

/* -------------------------------------------------- v4.2 defect regressions */

/**
 * Reproduces canonical-shard-1-004: a first poll the reader could not accept (zero-cost
 * RECOVERY_FAILED), then a successful re-poll of the same job ids that recovers 11 of 12 and
 * fail-stops on the twelfth. The failed job carries `model` exactly as the live provider sent it.
 */
async function supersededRecoveryFailure(prepared: Prepared, batchIndex: number, beforeUnits: number, base: number): Promise<void> {
  const batch = prepared.plan.batches[batchIndex];
  preflight(prepared, batchIndex, beforeUnits, base);
  ops(prepared, ["prepare", "--batch", batch.id, "--observed-at", at(base + 40)]);
  ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, `submit-${batch.id}.json`, submissionResponse(prepared.plan, batchIndex)), "--observed-at", at(base + 50)]);
  ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(base + 60)]);
  const unreadable = waitResponse(prepared.plan, batchIndex) as unknown as Record<string, unknown>;
  (unreadable.jobs as Array<Record<string, unknown>>)[0].type = "video";
  await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 70)], JSON.stringify(unreadable), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/RECOVERY_FAILED/);
  ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(base + 80)]);
  const repoll = waitResponse(prepared.plan, batchIndex, [...Array<string>(11).fill("completed"), "failed"]) as unknown as Record<string, unknown>;
  (repoll.jobs as Array<Record<string, unknown>>)[11].model = "nano_banana_flash";
  await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 90)], JSON.stringify(repoll), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/GENERATION_FAILED/);
}

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4.2 superseded RECOVERY_FAILED discharge", () => {
  test("D1 regression: 004's history discharges with loss 0.00 when the observed delta equals what was recovered", async () => {
    const prepared = fixture();
    await supersededRecoveryFailure(prepared, 0, START_UNITS, 0);
    const wedged = journalOf(prepared).batches[0];
    expect(wedged.terminals.map(({ code }) => code)).toEqual(["RECOVERY_FAILED", "GENERATION_FAILED"]);
    expect(wedged.recoveries).toHaveLength(11);
    expect(wedged.balance_after).toBeUndefined();
    expect(wedged.discharges).toHaveLength(0);
    // 11 x 1.50 charged, the failed job was never charged: the loss is exactly zero.
    const acknowledged = ops(prepared, ["acknowledge-loss", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: (START_UNITS - 1_650) / 100, provider_observed_at: at(100) }), "--observed-at", at(110)]);
    expect(acknowledged).toMatchObject({ terminal_code: "GENERATION_FAILED", observed_delta_decimal: "16.50", recovered_decimal: "16.50", acknowledged_loss_decimal: "0.00", cap_used_decimal: "16.50", resubmitted: false, regenerated: false });
    const discharge = journalOf(prepared).batches[0].discharges[0];
    expect(discharge).toMatchObject({ kind: "LOSS_ACKNOWLEDGED", terminals_discharged: 2, acknowledged_loss_units: 0, observed_delta_units: 1_650, recovered_units: 1_650 });
    expect(ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(120)])).toMatchObject({ run_state: "ACTIVE", disposition: "DISCHARGED_LOSS", rerunnable: false });
    // The run reopens, but a canary that only recovered 11 of 12 still never verified 003.
    expect(() => ops(prepared, ["preflight-request", "--batch", T015_V4_CANARY_BLOCKED_BATCH_ID, "--observed-at", at(130)])).toThrow(/is blocked until/);
    expect(statusT015V4(journalOf(prepared))).toMatchObject({ run_state: "ACTIVE", total_delta_decimal: "16.50", acknowledged_loss_decimal: "0.00", model_canary_verified: false });
  });

  test("a discharge still needs a real loss code among the terminals it covers", async () => {
    const prepared = fixture();
    await supersededRecoveryFailure(prepared, 0, START_UNITS, 0);
    ops(prepared, ["acknowledge-loss", "--batch", T015_V4_CANARY_BATCH_ID, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: (START_UNITS - 1_650) / 100, provider_observed_at: at(100) }), "--observed-at", at(110)]);
    // A hand-edited journal that books a discharge against the zero-cost terminal alone.
    const crafted = journalOf(prepared);
    crafted.batches[0].terminals = [crafted.batches[0].terminals[0]];
    crafted.batches[0].discharges[0].terminals_discharged = 1;
    expect(() => validateT015V4Journal(crafted, prepared.plan, presentation, approval)).toThrow(/discharge evidence changed/);
  });

  test("the writer still refuses a discharge whose last active terminal is not a loss code", async () => {
    const prepared = fixture();
    const batch = prepared.plan.batches[0];
    submitting(prepared, 0, START_UNITS, 0);
    ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
    ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    const unreadable = waitResponse(prepared.plan, 0) as unknown as Record<string, unknown>;
    (unreadable.jobs as Array<Record<string, unknown>>)[0].type = "video";
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(70)], JSON.stringify(unreadable), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/RECOVERY_FAILED/);
    expect(() => ops(prepared, ["acknowledge-loss", "--batch", batch.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: 482, provider_observed_at: at(80) }), "--observed-at", at(90)])).toThrow(/only discharges/);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4.2 jobs_wait topology tolerance", () => {
  test("D2 regression: a non-completed job may carry model and a stale result_url, and is never downloaded", async () => {
    const prepared = fixture();
    const batch = prepared.plan.batches[0];
    submitting(prepared, 0, START_UNITS, 0);
    ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
    ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    const payload = waitResponse(prepared.plan, 0, [...Array<string>(11).fill("completed"), "failed"]) as unknown as Record<string, unknown>;
    const failedJob = (payload.jobs as Array<Record<string, unknown>>)[11];
    failedJob.model = "nano_banana_flash";
    failedJob.result_url = "https://d111111abcdef8.cloudfront.net/stale.png";
    let downloads = 0;
    const counting: T015V4Dependencies = { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => { downloads += 1; return { status: 200, headers: { "content-type": "image/png" }, bytes: png(), remoteAddress: "::ffff:18.65.3.2" }; } };
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(70)], JSON.stringify(payload), prepared.root, prepared.plan, presentation, approval, counting)).rejects.toThrow(/GENERATION_FAILED/);
    // 11 completed jobs downloaded; the failed job's stale URL was never fetched.
    expect(downloads).toBe(11);
    const journal = journalOf(prepared);
    expect(journal.batches[0].recoveries).toHaveLength(11);
    expect(journal.batches[0].terminals.map(({ code }) => code)).toEqual(["GENERATION_FAILED"]);
    const poll = journal.batches[0].job_polls.at(-1)!.jobs.at(-1)!;
    expect(poll).toMatchObject({ status: "failed", model: "nano_banana_flash", download_available: false });
    expect(assertJournalStillReadable(prepared)).toMatchObject({ run_state: "FAIL_STOP" });
  });

  test("a completed job missing model or result_url is still refused, and a non-string model still fails topology", async () => {
    for (const mutate of [
      (job: Record<string, unknown>) => { delete job.model; },
      (job: Record<string, unknown>) => { delete job.result_url; },
    ]) {
      const prepared = fixture();
      const batch = prepared.plan.batches[0];
      submitting(prepared, 0, START_UNITS, 0);
      ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0)), "--observed-at", at(50)]);
      ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
      const payload = waitResponse(prepared.plan, 0) as unknown as Record<string, unknown>;
      mutate((payload.jobs as Array<Record<string, unknown>>)[3]);
      await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(70)], JSON.stringify(payload), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/RECOVERY_FAILED/);
      expect(journalOf(prepared).batches[0].recoveries).toHaveLength(0);
    }

    const typed = fixture();
    const batch = typed.plan.batches[0];
    submitting(typed, 0, START_UNITS, 0);
    ops(typed, ["response", "--batch", batch.id, "--file", json(typed.root, "submit.json", submissionResponse(typed.plan, 0)), "--observed-at", at(50)]);
    ops(typed, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(60)]);
    const payload = waitResponse(typed.plan, 0, [...Array<string>(11).fill("completed"), "failed"]) as unknown as Record<string, unknown>;
    (payload.jobs as Array<Record<string, unknown>>)[11].model = 7;
    await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(70)], JSON.stringify(payload), typed.root, typed.plan, presentation, approval, deps())).rejects.toThrow(/RECOVERY_FAILED/);
  });
});


/* ------------------------------------------- v4.3 remediation and closure */

const LEGACY_PINS = { plan_sha256: sha256T015V4("t015-v4.2-plan"), disclosure_presentation_evidence_sha256: sha256T015V4("t015-v4.2-presentation"), approval_evidence_sha256: sha256T015V4("t015-v4.2-approval") };
const V4_PIN = { operations_v4_path: T015_V4_ORIGINAL_JOURNAL_PATH, operations_v4_sha256: sha256T015V4("t015-v4.1-journal"), migrated_at: at(-30) };

/** Which offset inside which paid batch holds each disclosed lost index. Derived, not typed in. */
function lossPlan(plan: T015V4Plan): Map<number, number[]> {
  const byBatch = new Map<number, number[]>();
  for (const index of T015_V4_3_REMEDIATION_INDICES) {
    const batchIndex = plan.batches.findIndex((batch, position) => position < T015_V4_PAID_BATCH_COUNT && batch.asset_ids.includes(plan.assets.find((asset) => asset.index === index)!.id));
    const offset = plan.batches[batchIndex].asset_ids.indexOf(plan.assets.find((asset) => asset.index === index)!.id);
    byBatch.set(batchIndex, [...(byBatch.get(batchIndex) ?? []), offset]);
  }
  return byBatch;
}

/** Runs one batch that loses the given offsets, then discharges it at zero monetary loss. */
async function loseBatch(prepared: Prepared, batchIndex: number, beforeUnits: number, offsets: readonly number[]): Promise<number> {
  const batch = prepared.plan.batches[batchIndex];
  const base = batchIndex * 3_600;
  preflight(prepared, batchIndex, beforeUnits, base);
  ops(prepared, ["prepare", "--batch", batch.id, "--observed-at", at(base + 40)]);
  ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, `submit-${batch.id}.json`, submissionResponse(prepared.plan, batchIndex)), "--observed-at", at(base + 50)]);
  ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(base + 60)]);
  const statuses = batch.asset_ids.map((_, offset) => (offsets.includes(offset) ? "failed" : "completed"));
  const payload = waitResponse(prepared.plan, batchIndex, statuses) as unknown as Record<string, unknown>;
  // The live provider decorates failed jobs with a model; keep that in the fixture.
  for (const offset of offsets) (payload.jobs as Array<Record<string, unknown>>)[offset].model = "nano_banana_flash";
  await expect(runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 70)], JSON.stringify(payload), prepared.root, prepared.plan, presentation, approval, deps())).rejects.toThrow(/GENERATION_FAILED/);
  // The provider never charged the failed generations, so the discharge books 0.00.
  const after = beforeUnits - (batch.size - offsets.length) * 150;
  ops(prepared, ["acknowledge-loss", "--batch", batch.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, `loss-${batch.id}.json`, { credits: after / 100, provider_observed_at: at(base + 80) }), "--observed-at", at(base + 90)]);
  ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(base + 100)]);
  return after;
}

/**
 * The live run's shape: 27 paid batches settled, six of them discharged at zero monetary
 * loss, exactly the seven disclosed indices unrecovered, 313/320 delivered for 469.50.
 * Built once and copied per test — driving it costs about twenty seconds.
 */
let settledRootPromise: Promise<string> | undefined;
async function settledRun(): Promise<Prepared> {
  if (settledRootPromise === undefined) {
    settledRootPromise = (async () => {
      const built = fixture(START_UNITS, "suite");
      const losses = lossPlan(built.plan);
      let balance = START_UNITS;
      for (let index = 0; index < T015_V4_PAID_BATCH_COUNT; index += 1) {
        const offsets = losses.get(index);
        balance = offsets ? await loseBatch(built, index, balance, offsets) : await completeBatch(built, index, balance);
      }
      copyLegacyAssets(built);
      return built.root;
    })();
  }
  const settledRoot = await settledRootPromise;
  const root = temporaryRoot("fictor-t015-v43-");
  cpSync(settledRoot, root, { recursive: true });
  return { root, plan: cachedPlan };
}

/** Turns a settled v4.3-shaped root back into a v4.2-generation source journal. */
function supersede(prepared: Prepared): T015V4Journal {
  const current = journalOf(prepared);
  const source = {
    ...current, ...LEGACY_PINS,
    immutable_forensics: { ...current.immutable_forensics, ...V4_PIN },
    batches: current.batches.filter(({ batch_id }) => batch_id !== T015_V4_3_REMEDIATION_BATCH_ID),
  };
  writeFileSync(resolve(prepared.root, T015_V4_LEGACY_JOURNAL_PATH), renderT015CanonicalJson(source), { mode: 0o600 });
  rmSync(resolve(prepared.root, T015_V4_JOURNAL_PATH));
  return source as T015V4Journal;
}
function migrate(prepared: Prepared, observedAt: string): Record<string, unknown> {
  return ops(prepared, ["migrate", "--observed-at", observedAt, "--legacy-plan-sha256", LEGACY_PINS.plan_sha256, "--legacy-presentation-sha256", LEGACY_PINS.disclosure_presentation_evidence_sha256, "--legacy-approval-sha256", LEGACY_PINS.approval_evidence_sha256]);
}
/** Drives the remediation batch, failing the given offsets. Returns the post-batch balance. */
async function runRemediation(prepared: Prepared, beforeUnits: number, failedOffsets: readonly number[] = []): Promise<number> {
  const batchIndex = prepared.plan.batches.length - 1;
  const batch = prepared.plan.batches[batchIndex];
  const base = 100_800;
  preflight(prepared, batchIndex, beforeUnits, base);
  ops(prepared, ["prepare", "--batch", batch.id, "--observed-at", at(base + 40)]);
  ops(prepared, ["response", "--batch", batch.id, "--file", json(prepared.root, "submit-r01.json", submissionResponse(prepared.plan, batchIndex)), "--observed-at", at(base + 50)]);
  ops(prepared, ["recovery-open", "--batch", batch.id, "--operator-phrase", T015_V4_RECOVERY_OPERATOR_PHRASE, "--observed-at", at(base + 60)]);
  const statuses = batch.asset_ids.map((_, offset) => (failedOffsets.includes(offset) ? "failed" : "completed"));
  const payload = JSON.stringify(waitResponse(prepared.plan, batchIndex, statuses));
  const handoff = runT015V4JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 70)], payload, prepared.root, prepared.plan, presentation, approval, deps());
  const after = beforeUnits - (batch.size - failedOffsets.length) * 150;
  if (failedOffsets.length > 0) {
    await expect(handoff).rejects.toThrow(/GENERATION_FAILED/);
    ops(prepared, ["acknowledge-loss", "--batch", batch.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss-r01.json", { credits: after / 100, provider_observed_at: at(base + 80) }), "--observed-at", at(base + 90)]);
    ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(base + 100)]);
    return after;
  }
  await handoff;
  ops(prepared, ["balance-after", "--batch", batch.id, "--file", json(prepared.root, "after-r01.json", { credits: after / 100 }), "--observed-at", at(base + 80)]);
  return after;
}

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4.3 derived loss ledger", () => {
  test("derives exactly the seven disclosed indices from the settled journal", async () => {
    const prepared = await settledRun();
    const lost = t015V4LostIndices(journalOf(prepared));
    expect(lost.map(({ index }) => index)).toEqual([...T015_V4_3_REMEDIATION_INDICES]);
    expect(lost).toHaveLength(T015_V4_3_REMEDIATION_ASSET_COUNT);
    // Each lost index is attributed to the batch that paid for it and never delivered it.
    const byIndex = new Map(lost.map((entry) => [entry.index, entry.batch_id]));
    expect(byIndex.get(42)).toBe("canonical-shard-1-004");
    expect(byIndex.get(263)).toBe("canonical-shard-1-022");
    expect(new Set(lost.map(({ batch_id }) => batch_id)).size).toBe(6);
    // The plan's remediation batch is exactly those assets, with unchanged request hashes.
    expect(prepared.plan.batches.at(-1)!.asset_ids).toEqual(lost.map(({ asset_id }) => asset_id));
    for (const { asset_id } of lost) expect(prepared.plan.assets.find((asset) => asset.id === asset_id)!.canonical_request_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(statusT015V4(journalOf(prepared))).toMatchObject({ run_state: "ACTIVE", recovered_assets: 313, total_delta_decimal: "469.50", acknowledged_loss_decimal: "0.00" });
  }, 300_000);

  test("a recovered index leaves the ledger and an undischarged batch never enters it", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    expect(t015V4LostIndices(journalOf(prepared))).toEqual([]);
    submitting(prepared, 1, 48_200, 3_600);
    // Submitted but not yet discharged: nothing is lost until a discharge books it.
    expect(t015V4LostIndices(journalOf(prepared))).toEqual([]);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4.3 zero-loss closure", () => {
  test("D3 regression: a run with discharged batches and 0.00 monetary loss can close", async () => {
    const prepared = await settledRun();
    const journal = journalOf(prepared);
    expect(journal.run_state).toBe("ACTIVE");
    // The gap: every discharge booked 0.00 because the provider never charged the failures.
    expect(journal.batches.filter((record) => record.discharges.some(({ kind }) => kind === "LOSS_ACKNOWLEDGED"))).toHaveLength(6);
    expect(journal.batches.flatMap(({ discharges }) => discharges).every(({ acknowledged_loss_units }) => acknowledged_loss_units === 0)).toBe(true);
    // Closure is still refused while the approved remediation batch is owed.
    expect(() => auditT015V4(contextOf(prepared), journalOf(prepared), at(200_000))).toThrow(/will not close the run while the approved remediation batch/);
    // Abandoning the remediation is not silently possible, but discharging it is: once r01
    // has run, the same zero-loss run closes.
    await runRemediation(prepared, 3_050);
    const audit = auditT015V4(contextOf(prepared), journalOf(prepared), at(200_000));
    expect(audit).toMatchObject({ run_state: "CLOSED_WITH_LOSSES", exact_closure: false, acknowledged_loss_units: 0, acknowledged_loss_decimal: "0.00", discharged_batches: 6 });
    expect(journalOf(prepared).run_state).toBe("CLOSED_WITH_LOSSES");
  }, 300_000);

  test("the validator accepts a zero-loss CLOSED_WITH_LOSSES journal and still rejects one with nothing discharged", async () => {
    const prepared = await settledRun();
    await runRemediation(prepared, 3_050);
    auditT015V4(contextOf(prepared), journalOf(prepared), at(200_000));
    const closed = journalOf(prepared);
    expect(() => validateT015V4Journal(closed, prepared.plan, presentation, approval)).not.toThrow();
    // Strip the discharges and the same state is no longer a legal closure.
    const crafted = journalOf(prepared);
    for (const record of crafted.batches) record.discharges = record.discharges.filter(({ kind }) => kind !== "LOSS_ACKNOWLEDGED");
    expect(() => validateT015V4Journal(crafted, prepared.plan, presentation, approval)).toThrow(/T015 v4/);
  }, 300_000);
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4.3 remediation batch", () => {
  test("regenerates all seven indices and closes at exactly 480.00 + 18.00 = 498.00", async () => {
    const prepared = await settledRun();
    const before = statusT015V4(journalOf(prepared));
    expect(before).toMatchObject({ total_delta_units: 46_950, recovered_assets: 313 });
    const balance = await runRemediation(prepared, 3_050);
    expect(balance).toBe(2_000);
    const journal = journalOf(prepared);
    const record = journal.batches.at(-1)!;
    expect(record).toMatchObject({ batch_id: T015_V4_3_REMEDIATION_BATCH_ID, state: "COMPLETE" });
    expect(record.recoveries).toHaveLength(7);
    expect(record.balance_after).toMatchObject({ delta_units: 1_050, delta_decimal: "10.50", charged_job_count: 7 });
    // Exactly one submission of exactly seven requests, no paid retry.
    expect(record.submission!.jobs).toHaveLength(7);
    expect(journal.paid_retry_count).toBe(0);
    expect(t015V4LostIndices(journal)).toEqual([]);
    const audit = auditT015V4(contextOf(prepared), journalOf(prepared), at(200_000));
    expect(audit).toMatchObject({
      run_state: "CLOSED_WITH_LOSSES", paid_assets_recovered: 320, paid_assets_lost: 0, all_paid_assets_delivered: true, lost_indices: [],
      total_delta_units: T015_V4_ADDITIONAL_CAP_UNITS, total_delta_decimal: "480.00", cumulative_units: T015_V4_TOTAL_CAP_UNITS, cumulative_decimal: "498.00",
      closes_at_exact_cap: true, within_additional_cap: true, within_total_cap: true, acknowledged_loss_decimal: "0.00",
      remediation_batch_id: T015_V4_3_REMEDIATION_BATCH_ID, remediation_state: "COMPLETE", remediation_recovered: 7, total_assets_present: 332,
      regenerated_lost_indices: true, regenerated_index_count: 7,
    });
    expect(statusT015V4(journalOf(prepared))).toMatchObject({ recovered_assets: 320, remaining_assets: 0, total_delta_decimal: "480.00" });
  }, 300_000);

  test("a failure inside the remediation batch is final: the index stays lost and the run still closes", async () => {
    const prepared = await settledRun();
    // Offset 3 is index 204; it fails again and is never regenerated under this approval.
    const balance = await runRemediation(prepared, 3_050, [3]);
    expect(balance).toBe(2_150);
    const journal = journalOf(prepared);
    expect(journal.batches.at(-1)!.recoveries).toHaveLength(6);
    expect(t015V4LostIndices(journal).map(({ index }) => index)).toEqual([204]);
    const audit = auditT015V4(contextOf(prepared), journalOf(prepared), at(200_000));
    expect(audit).toMatchObject({
      run_state: "CLOSED_WITH_LOSSES", paid_assets_recovered: 319, paid_assets_lost: 1, all_paid_assets_delivered: false, lost_indices: [204],
      total_delta_units: 47_850, total_delta_decimal: "478.50", closes_at_exact_cap: false, acknowledged_loss_decimal: "0.00",
      remediation_batch_id: T015_V4_3_REMEDIATION_BATCH_ID, remediation_recovered: 6, discharged_batches: 7, regenerated_lost_indices: true, regenerated_index_count: 6,
    });
    expect((audit.lost_index_detail as Array<Record<string, unknown>>)[0]).toMatchObject({ index: 204, batch_id: T015_V4_3_REMEDIATION_BATCH_ID });
    // No second regeneration: the discharged remediation batch can never reopen.
    expect(() => ops(prepared, ["preflight-request", "--batch", T015_V4_3_REMEDIATION_BATCH_ID, "--observed-at", at(200_100)])).toThrow(/T015 v4/);
  }, 300_000);

  test("the remediation batch is refused until every paid batch has settled", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    expect(() => ops(prepared, ["preflight-request", "--batch", T015_V4_3_REMEDIATION_BATCH_ID, "--observed-at", at(3_600)])).toThrow(/must progress exactly in order/);
  });
});

ownerDescribe("[OWNER_ONLY:T015_V4_JOURNALS] T015 v4.3 journal migration", () => {
  test("imports every record verbatim, appends r01, and chains both migration pins", async () => {
    const prepared = await settledRun();
    const before = statusT015V4(journalOf(prepared));
    const source = supersede(prepared);
    expect(source.batches).toHaveLength(T015_V4_PAID_BATCH_COUNT);
    const sourceSha = sha256T015V4(readFileSync(resolve(prepared.root, T015_V4_LEGACY_JOURNAL_PATH)));
    const result = migrate(prepared, at(150_000));
    expect(result).toMatchObject({
      command: "migrate", source_path: T015_V4_LEGACY_JOURNAL_PATH, source_sha256: sourceSha, source_mutated: false, target_path: T015_V4_JOURNAL_PATH,
      batches: 28, complete_batches: 21, recovered_assets: 313, remediation_batch_id: T015_V4_3_REMEDIATION_BATCH_ID,
      remediation_indices: [...T015_V4_3_REMEDIATION_INDICES], remediation_credit_decimal: "10.50", remaining_cap_units: 1_050,
      cap_used_decimal: "469.50", resubmitted: false, regenerated: false,
    });
    const migrated = journalOf(prepared);
    const expectedHeader = buildInitialT015V4Journal(prepared.plan, presentation, approval, migrated.initial_balance);
    expect(migrated.plan_sha256).toBe(expectedHeader.plan_sha256);
    expect(migrated.plan_sha256).not.toBe(LEGACY_PINS.plan_sha256);
    // Both migration pins survive: the v4.1 one carried forward, the v4.2 one added.
    expect(migrated.immutable_forensics).toMatchObject({ ...V4_PIN, operations_v4_2_path: T015_V4_LEGACY_JOURNAL_PATH, operations_v4_2_sha256: sourceSha, migrated_v4_3_at: at(150_000) });
    expect(canonicalJsonT015(migrated.batches.slice(0, T015_V4_PAID_BATCH_COUNT))).toBe(canonicalJsonT015(source.batches));
    expect(canonicalJsonT015(migrated.resumes)).toBe(canonicalJsonT015(source.resumes));
    expect(migrated.batches.at(-1)).toMatchObject({ batch_id: T015_V4_3_REMEDIATION_BATCH_ID, state: "PLANNED", transitions: [], terminals: [], discharges: [], recoveries: [] });
    expect(statusT015V4(migrated)).toMatchObject({ total_delta_units: before.total_delta_units, recovered_assets: 313 });
    expect(sha256T015V4(readFileSync(resolve(prepared.root, T015_V4_LEGACY_JOURNAL_PATH)))).toBe(sourceSha);
  }, 300_000);

  test("refuses to clobber an existing target", async () => {
    const prepared = await settledRun();
    supersede(prepared);
    migrate(prepared, at(150_000));
    expect(() => migrate(prepared, at(150_100))).toThrow(/refuses to clobber/);
  }, 300_000);

  test("refuses a tampered source, a mismatched pin, and a source that is not the migrated v4.2 journal", async () => {
    const tampered = await settledRun();
    const source = { ...journalOf(tampered), ...LEGACY_PINS, immutable_forensics: { ...journalOf(tampered).immutable_forensics, ...V4_PIN }, batches: journalOf(tampered).batches.filter(({ batch_id }) => batch_id !== T015_V4_3_REMEDIATION_BATCH_ID) };
    source.batches[0].balance_after!.delta_units = 1_650;
    writeFileSync(resolve(tampered.root, T015_V4_LEGACY_JOURNAL_PATH), renderT015CanonicalJson(source), { mode: 0o600 });
    rmSync(resolve(tampered.root, T015_V4_JOURNAL_PATH));
    expect(() => migrate(tampered, at(150_000))).toThrow(/credit delta changed/);
    expect(existsSync(resolve(tampered.root, T015_V4_JOURNAL_PATH))).toBe(false);

    const unpinned = await settledRun();
    supersede(unpinned);
    expect(() => ops(unpinned, ["migrate", "--observed-at", at(150_000), "--legacy-plan-sha256", sha256T015V4("wrong"), "--legacy-presentation-sha256", LEGACY_PINS.disclosure_presentation_evidence_sha256, "--legacy-approval-sha256", LEGACY_PINS.approval_evidence_sha256])).toThrow(/journal header changed/);

    const unmigrated = await settledRun();
    const naive = journalOf(unmigrated);
    const withoutPin = { ...naive, ...LEGACY_PINS, batches: naive.batches.filter(({ batch_id }) => batch_id !== T015_V4_3_REMEDIATION_BATCH_ID) };
    writeFileSync(resolve(unmigrated.root, T015_V4_LEGACY_JOURNAL_PATH), renderT015CanonicalJson(withoutPin), { mode: 0o600 });
    rmSync(resolve(unmigrated.root, T015_V4_JOURNAL_PATH));
    expect(() => migrate(unmigrated, at(150_000))).toThrow(/must itself be the migrated v4.2 journal/);
  }, 300_000);

  test("refuses a source whose derived losses are not the disclosed remediation scope", async () => {
    const prepared = fixture();
    await completeBatch(prepared, 0, START_UNITS);
    const lost = prepared.plan.batches[1];
    submitting(prepared, 1, 48_200, 3_600);
    expect(() => ops(prepared, ["ambiguous", "--batch", lost.id, "--reason", "TIMEOUT", "--observed-at", at(3_650)])).toThrow(/AMBIGUOUS_SUBMISSION/);
    ops(prepared, ["acknowledge-loss", "--batch", lost.id, "--operator-phrase", T015_V4_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", json(prepared.root, "loss.json", { credits: 464, provider_observed_at: at(3_700) }), "--observed-at", at(3_710)]);
    ops(prepared, ["resume", "--operator-phrase", T015_V4_RESUME_OPERATOR_PHRASE, "--observed-at", at(3_720)]);
    supersede(prepared);
    expect(() => migrate(prepared, at(150_000))).toThrow(/do not match the disclosed remediation scope/);
  }, 300_000);
});
