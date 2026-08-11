import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import {
  buildInitialStyleV2OperationsJournal,
  buildStyleV2ActualRunEvidence,
  buildStyleV2CompletionEvidence,
  renderStyleV2ContactSheetHtml,
  runStyleV2ContactSheetAfterReadyGate,
  runStyleV2CliForTest,
  validateStyleV2OperationsJournal,
  validateStyleV2ActualRunEvidence,
  type StyleV2OperationsJournal,
} from "../../scripts/assets/style-candidates-v2-cli";
import {
  STYLE_V1_MANIFEST_SHA256,
  STYLE_V2_APPROVAL_PATH,
  STYLE_V2_APPROVAL_SHA256,
  buildStyleCandidatesV2Manifest,
  isStyleV2GenerationReady,
  renderStyleCandidatesV2Manifest,
  validateStyleV2ApprovalEvidence,
  validateStyleCandidatesV2Manifest,
  type StyleCandidatesV2Manifest,
} from "../../scripts/assets/style-candidates-v2";
import { buildStyleCandidatesManifest, canGenerateRemotely } from "../../scripts/assets/style-candidates";
import { DEFAULT_MAX_PNG_BYTES, atomicWriteJson, atomicWriteVerifiedPng } from "../../scripts/assets/filesystem";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function png(fill: number, width = 3, height = 4): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(height * (1 + width * 3), fill))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function completedJournal(manifest: StyleCandidatesV2Manifest): StyleV2OperationsJournal {
  const journal = buildInitialStyleV2OperationsJournal(manifest);
  const balances = ["945.9", "944.4", "942.9", "941.4", "939.9"];
  journal.records.forEach((record, index) => {
    const minute = index * 10;
    const at = (offset: number) => `2026-08-11T1${index}:${String(minute + offset).padStart(2, "0")}:00+09:00`;
    record.preflight = {
      tool: "generate_image",
      get_cost: true,
      job_created: false,
      unit_cost_decimal: "1.50",
      balance_before_decimal: balances[index],
      cost_observed_at: at(0),
      balance_observed_at: at(0),
      observed_at: at(0),
      paid_request_sha256: manifest.requests[index].paid_request_sha256,
      preflight_request_sha256: manifest.requests[index].preflight_request_sha256,
    };
    record.provider = {
      invocation_id: `invocation-style-${index + 1}`,
      provider_result_id: `provider-result-${index + 1}`,
      paid_request_sha256: manifest.requests[index].paid_request_sha256,
      tool: "generate_image",
      requested_model: "nano_banana_2",
      provider_reported_model: "nano_banana_flash",
      use_unlim: false,
      get_cost: false,
      submitted_at: at(1),
      completed_at: at(2),
    };
    record.recovery = {
      local_relative_path: manifest.candidates[index].path,
      backup_relative_path: manifest.candidates[index].path,
      sha256: String(index + 1).repeat(64),
      size_bytes: 1000 + index,
      target_aspect_ratio: "3:4",
      actual_width: 896,
      actual_height: 1200,
      aspect_error_ppm: 4445,
      provider_native_unmodified: true,
    };
    record.balance_after = { decimal: balances[index + 1], observed_at: at(6) };
    record.transitions = [
      { state: "SUBMITTING", observed_at: at(0) },
      { state: "SUBMITTED", observed_at: at(1) },
      { state: "RESULT_ID_RECORDED", observed_at: at(2) },
      { state: "LOCAL_VERIFIED", observed_at: at(3) },
      { state: "BACKUP_VERIFIED", observed_at: at(4) },
      { state: "BALANCE_AFTER_VERIFIED", observed_at: at(6) },
      { state: "COMPLETE", observed_at: at(6) },
    ];
    record.state = "COMPLETE";
  });
  journal.run_state = "COMPLETE";
  return journal;
}

describe("T011 limited READY style-candidates-v2", () => {
  test("is deterministic, pins v1 and approval evidence, and contains only four single paid calls", () => {
    const first = buildStyleCandidatesV2Manifest(repositoryRoot);
    const second = buildStyleCandidatesV2Manifest(repositoryRoot);
    expect(renderStyleCandidatesV2Manifest(first)).toBe(renderStyleCandidatesV2Manifest(second));
    expect(readFileSync(resolve(repositoryRoot, "assets/manifests/style-candidates-v2.json"), "utf8"))
      .toBe(renderStyleCandidatesV2Manifest(first));
    expect(first.predecessor.sha256).toBe(STYLE_V1_MANIFEST_SHA256);
    expect(createHash("sha256").update(readFileSync(resolve(repositoryRoot, STYLE_V2_APPROVAL_PATH))).digest("hex"))
      .toBe(STYLE_V2_APPROVAL_SHA256);
    const approvalEvidence = JSON.parse(readFileSync(resolve(repositoryRoot, STYLE_V2_APPROVAL_PATH), "utf8")) as Record<string, unknown>;
    expect(() => validateStyleV2ApprovalEvidence(approvalEvidence)).not.toThrow();
    const blanketWaiver = clone(approvalEvidence) as { approval: Record<string, unknown> };
    blanketWaiver.approval.interpretation = "BLANKET_WAIVER";
    expect(() => validateStyleV2ApprovalEvidence(blanketWaiver)).toThrow("scope changed");
    const chronologyTamper = clone(approvalEvidence) as { chronology: Array<Record<string, unknown>> };
    chronologyTamper.chronology[1].disclosed_plan_sha256 = "0".repeat(64);
    expect(() => validateStyleV2ApprovalEvidence(chronologyTamper)).toThrow("disclosed limited plan");
    expect(first.candidates).toEqual(buildStyleCandidatesManifest(repositoryRoot).candidates);
    expect(first.requests).toHaveLength(4);
    for (const [index, request] of first.requests.entries()) {
      expect(request.candidate_id).toBe(first.candidates[index].id);
      expect(request.paid_request).toEqual({ ...first.candidates[index].request, get_cost: false });
      expect(request.preflight_request).toEqual({ ...request.paid_request, get_cost: true });
      expect(request.paid_request.count).toBe(1);
      expect(request.paid_request.use_unlim).toBe(false);
    }
    expect(first.scope).toEqual({ candidate_count: 4, material_generation_allowed: false, bulk_generation_allowed: false });
    expect(first.budget.total_cap_decimal).toBe("6.00");
    expect(first.gates.SUPPORT_QUESTIONS.status).toBe("USER_ACCEPTED_RISK");
    expect(first.gates.BATCH_LIMIT.status).toBe("NOT_APPLICABLE_COUNT1_ONLY");
    expect(isStyleV2GenerationReady(first, repositoryRoot)).toBe(true);
  });

  test("keeps v1 HOLD-only and rejects v2 coercion, gate reuse, request tamper, and scope escape", () => {
    expect(canGenerateRemotely(buildStyleCandidatesManifest(repositoryRoot))).toBe(false);
    const manifest = buildStyleCandidatesV2Manifest(repositoryRoot);
    const cases: StyleCandidatesV2Manifest[] = [];

    const reused = clone(manifest);
    reused.gates.ACCOUNT_PRIVACY_REVISION.evidence.observation_id = reused.gates.MCP_SCHEMA.evidence.observation_id;
    cases.push(reused);

    const status = clone(manifest);
    (status.gates.SUPPORT_QUESTIONS.status as string) = "PASS";
    cases.push(status);

    const unlimited = clone(manifest);
    (unlimited.requests[0].paid_request.use_unlim as boolean) = true;
    cases.push(unlimited);

    const paidAsPreflight = clone(manifest);
    (paidAsPreflight.requests[0].paid_request.get_cost as boolean) = true;
    cases.push(paidAsPreflight);

    const batch = clone(manifest);
    (batch.batch_calls_allowed as boolean) = true;
    cases.push(batch);

    const material = clone(manifest);
    (material.scope.material_generation_allowed as boolean) = true;
    cases.push(material);

    const approvalHash = clone(manifest);
    approvalHash.approval.sha256 = "0".repeat(64) as typeof approvalHash.approval.sha256;
    cases.push(approvalHash);

    for (const candidate of cases) {
      expect(isStyleV2GenerationReady(candidate, repositoryRoot)).toBe(false);
      expect(() => validateStyleCandidatesV2Manifest(candidate, repositoryRoot)).toThrow();
    }
  });

  test("binds the journal to every invocation, request, balance, backup ordering, and the 6.00 cap", () => {
    const manifest = buildStyleCandidatesV2Manifest(repositoryRoot);
    const valid = completedJournal(manifest);
    expect(() => validateStyleV2OperationsJournal(valid, manifest)).not.toThrow();

    const duplicateResult = clone(valid);
    duplicateResult.records[1].provider!.provider_result_id = duplicateResult.records[0].provider!.provider_result_id;
    expect(() => validateStyleV2OperationsJournal(duplicateResult, manifest)).toThrow("duplicate");

    const requestTamper = clone(valid);
    requestTamper.records[0].provider!.paid_request_sha256 = "0".repeat(64);
    expect(() => validateStyleV2OperationsJournal(requestTamper, manifest)).toThrow("provider metadata");

    const requestedModelTamper = clone(valid);
    (requestedModelTamper.records[0].provider!.requested_model as string) = "nano_banana_flash";
    expect(() => validateStyleV2OperationsJournal(requestedModelTamper, manifest)).toThrow("provider metadata");

    const reportedModelTamper = clone(valid);
    reportedModelTamper.records[0].provider!.provider_reported_model = "nano banana flash";
    expect(() => validateStyleV2OperationsJournal(reportedModelTamper, manifest)).toThrow("reported model");

    const syntheticOnly = clone(valid);
    delete syntheticOnly.records[0].preflight;
    expect(() => validateStyleV2OperationsJournal(syntheticOnly, manifest)).toThrow("preflight");

    const rawField = clone(valid) as unknown as { records: Array<Record<string, unknown>> };
    rawField.records[0].signed_url = "https://forbidden.invalid/result";
    expect(() => validateStyleV2OperationsJournal(rawField as unknown as StyleV2OperationsJournal, manifest)).toThrow("fields changed");

    const submittedWithoutProvider = clone(valid);
    const submitted = submittedWithoutProvider.records[0];
    submitted.state = "SUBMITTED";
    submitted.transitions = submitted.transitions.slice(0, 2);
    delete submitted.provider;
    delete submitted.recovery;
    delete submitted.balance_after;
    submittedWithoutProvider.records = [submitted, ...buildInitialStyleV2OperationsJournal(manifest).records.slice(1)];
    submittedWithoutProvider.run_state = "ACTIVE";
    expect(() => validateStyleV2OperationsJournal(submittedWithoutProvider, manifest)).toThrow("provider evidence");

    const wrongDelta = clone(valid);
    wrongDelta.records[0].balance_after!.decimal = "944.5";
    expect(() => validateStyleV2OperationsJournal(wrongDelta, manifest)).toThrow("balance-after");

    const capTamper = clone(valid);
    (capTamper.credit_cap_decimal as string) = "6.01";
    expect(() => validateStyleV2OperationsJournal(capTamper, manifest)).toThrow("journal");

    const nextBeforeBackup = clone(valid);
    const beforeBackup = nextBeforeBackup.records[0].transitions[3].observed_at;
    nextBeforeBackup.records[1].preflight!.cost_observed_at = beforeBackup;
    nextBeforeBackup.records[1].preflight!.balance_observed_at = beforeBackup;
    nextBeforeBackup.records[1].preflight!.observed_at = beforeBackup;
    nextBeforeBackup.records[1].transitions[0].observed_at = beforeBackup;
    expect(() => validateStyleV2OperationsJournal(nextBeforeBackup, manifest)).toThrow("backup");

    const wrongPath = clone(valid);
    wrongPath.records[0].recovery!.backup_relative_path = "style/not-the-candidate.png";
    expect(() => validateStyleV2OperationsJournal(wrongPath, manifest)).toThrow("recovery");

    const aspectTamper = clone(valid);
    aspectTamper.records[0].recovery!.aspect_error_ppm = 5_001;
    expect(() => validateStyleV2OperationsJournal(aspectTamper, manifest)).toThrow("recovery");

    const nativeFlagTamper = clone(valid);
    (nativeFlagTamper.records[0].recovery!.provider_native_unmodified as boolean) = false;
    expect(() => validateStyleV2OperationsJournal(nativeFlagTamper, manifest)).toThrow("recovery");
  });

  test("renders only complete real PNG evidence and enforces CLI output allowlist, symlink, no-clobber, and idempotence", () => {
    const manifest = buildStyleCandidatesV2Manifest(repositoryRoot);
    const root = mkdtempSync(resolve(tmpdir(), "fictor-style-v2-contact-"));
    const journal = completedJournal(manifest);
    manifest.candidates.forEach((candidate, index) => {
      const bytes = png(index, 299, 400);
      const local = atomicWriteVerifiedPng(resolve(root, "public/assets"), candidate.path, bytes, "3:4", DEFAULT_MAX_PNG_BYTES, 5_000);
      const backup = atomicWriteVerifiedPng(resolve(root, "assets/backups/t011-style"), candidate.path, bytes, "3:4", DEFAULT_MAX_PNG_BYTES, 5_000);
      expect(backup.sha256).toBe(local.sha256);
      journal.records[index].recovery = {
        local_relative_path: candidate.path,
        backup_relative_path: candidate.path,
        sha256: local.sha256,
        size_bytes: local.size,
        target_aspect_ratio: "3:4",
        actual_width: local.width,
        actual_height: local.height,
        aspect_error_ppm: local.aspect_error_ppm,
        provider_native_unmodified: true,
      };
    });
    const completion = buildStyleV2CompletionEvidence(journal, manifest);
    expect(completion.expected_provider_reported_model).toBe("nano_banana_flash");
    expect(completion.candidate_records[0].provider).toMatchObject({
      requested_model: "nano_banana_2", provider_reported_model: "nano_banana_flash",
    });
    atomicWriteJson(root, "assets/runs/t011-style/operations-v2.json", journal);
    atomicWriteJson(root, "assets/runs/t011-style/completion-v2.json", completion);
    const args = ["contact-sheet", "--output", "docs/asset-runs/contact-sheets/t011-style-candidates-v2.html"];
    const first = runStyleV2ContactSheetAfterReadyGate(args, manifest, journal, completion, root);
    const html = readFileSync(first.output_path as string, "utf8");
    expect((html.match(/<figure>/g) ?? [])).toHaveLength(4);
    expect((html.match(/<img src="\.\.\/\.\.\/\.\.\/public\/assets\/style\/master-candidate-/g) ?? [])).toHaveLength(4);
    expect((html.match(/<span class="qa">QA:/g) ?? [])).toHaveLength(4);
    expect(html).not.toContain("https://");
    expect(html).not.toContain("<img src=\"/");
    expect(resolve(dirname(first.output_path as string), "../../../public/assets/style/master-candidate-01.png"))
      .toBe(resolve(root, "public/assets/style/master-candidate-01.png"));

    const actualRunEvidence = buildStyleV2ActualRunEvidence(manifest, journal, completion, root);
    expect(actualRunEvidence).toMatchObject({
      secret_free: true,
      totals: { candidate_count: 4, balance_before_decimal: "945.9", balance_after_decimal: "939.9", credits_consumed_decimal: "6.00" },
    });
    expect((actualRunEvidence.candidates as Array<Record<string, unknown>>)[3]).toMatchObject({
      visual_qa: { flags: ["STRONG_FRAMED_SHEET_MAT_SHADOW_DESPITE_NO_BORDER_PROMPT"] },
    });
    expect(() => validateStyleV2ActualRunEvidence(actualRunEvidence, manifest, journal, completion, root)).not.toThrow();
    const tamperedActualRun = clone(actualRunEvidence) as { totals: Record<string, unknown> };
    tamperedActualRun.totals.credits_consumed_decimal = "5.99";
    expect(() => validateStyleV2ActualRunEvidence(tamperedActualRun, manifest, journal, completion, root)).toThrow("actual-run evidence");

    const second = runStyleV2ContactSheetAfterReadyGate(args, manifest, journal, completion, root);
    expect(second.output_path).toBe(first.output_path);
    expect(readFileSync(first.output_path as string, "utf8")).toBe(html);
    writeFileSync(first.output_path as string, "different", "utf8");
    expect(() => runStyleV2ContactSheetAfterReadyGate(args, manifest, journal, completion, root)).toThrow("different content");
    expect(() => runStyleV2ContactSheetAfterReadyGate(
      ["contact-sheet", "--output", "package.json"], manifest, journal, completion, root,
    )).toThrow("contact sheet output");
    const unsafeAssetPath = clone(manifest);
    unsafeAssetPath.candidates[0].path = "../outside.png";
    expect(() => runStyleV2ContactSheetAfterReadyGate(args, unsafeAssetPath, journal, completion, root)).toThrow("READY");

    const symlinkRoot = mkdtempSync(resolve(tmpdir(), "fictor-style-v2-symlink-"));
    manifest.candidates.forEach((candidate, index) => {
      const bytes = png(index, 299, 400);
      atomicWriteVerifiedPng(resolve(symlinkRoot, "public/assets"), candidate.path, bytes, "3:4", DEFAULT_MAX_PNG_BYTES, 5_000);
      atomicWriteVerifiedPng(resolve(symlinkRoot, "assets/backups/t011-style"), candidate.path, bytes, "3:4", DEFAULT_MAX_PNG_BYTES, 5_000);
    });
    mkdirSync(resolve(symlinkRoot, "docs/asset-runs/contact-sheets"), { recursive: true });
    const outside = resolve(symlinkRoot, "outside.html");
    writeFileSync(outside, "outside", "utf8");
    symlinkSync(outside, resolve(symlinkRoot, "docs/asset-runs/contact-sheets/symlink.html"));
    expect(() => runStyleV2ContactSheetAfterReadyGate(
      ["contact-sheet", "--output", "docs/asset-runs/contact-sheets/symlink.html"], manifest, journal, completion, symlinkRoot,
    )).toThrow("SYMLINK_TRAVERSAL");

    const incomplete = buildInitialStyleV2OperationsJournal(manifest);
    expect(() => renderStyleV2ContactSheetHtml(manifest, incomplete, {})).toThrow("COMPLETE");
    const tamperedCompletion = clone(completion);
    tamperedCompletion.candidate_records[0].provider.provider_result_id = "tampered-result-id";
    expect(() => renderStyleV2ContactSheetHtml(manifest, journal, tamperedCompletion)).toThrow("completion evidence");
  });

  test("atomically records job-created, price, and balance anomalies and refuses every reload retry", () => {
    const candidateId = "style/master-candidate-01";
    const journalAt = (root: string) => JSON.parse(readFileSync(resolve(root, "assets/runs/t011-style/operations-v2.json"), "utf8")) as StyleV2OperationsJournal;
    const now = () => new Date().toISOString();
    const prepareArgs = (unitCost: string, jobCreated: "true" | "false") => {
      const observedAt = now();
      return [
        "prepare", "--candidate-id", candidateId, "--unit-cost", unitCost, "--job-created", jobCreated,
        "--balance-before", "945.9", "--cost-observed-at", observedAt, "--balance-observed-at", observedAt,
      ];
    };

    const jobRoot = mkdtempSync(resolve(tmpdir(), "fictor-style-v2-job-anomaly-"));
    runStyleV2CliForTest(["init"], jobRoot);
    expect(() => runStyleV2CliForTest(prepareArgs("1.50", "true"), jobRoot)).toThrow("created a job");
    const jobJournal = journalAt(jobRoot);
    expect(jobJournal.run_state).toBe("FAIL_STOP");
    expect(jobJournal.records[0].state).toBe("UNEXPECTED_JOB_CREATED");
    expect(jobJournal.records[0].terminal_observation).toMatchObject({
      code: "UNEXPECTED_PREFLIGHT_JOB_CREATED", actual_job_created: true, actual_unit_cost_decimal: "1.50",
      actual_balance_before_decimal: "945.9", credit_cap_decimal: "6.00", cumulative_authorized_cost_decimal: "1.50",
    });
    expect(() => runStyleV2CliForTest(prepareArgs("1.50", "false"), jobRoot)).toThrow("fail-stopped");

    const priceRoot = mkdtempSync(resolve(tmpdir(), "fictor-style-v2-price-anomaly-"));
    runStyleV2CliForTest(["init"], priceRoot);
    expect(() => runStyleV2CliForTest(prepareArgs("1.75", "false"), priceRoot)).toThrow("unit price changed");
    const priceJournal = journalAt(priceRoot);
    expect(priceJournal.run_state).toBe("FAIL_STOP");
    expect(priceJournal.records[0].terminal_observation).toMatchObject({
      code: "PRICE_CHANGED", actual_job_created: false, actual_unit_cost_decimal: "1.75",
      actual_balance_before_decimal: "945.9", credit_cap_decimal: "6.00", cumulative_authorized_cost_decimal: "1.50",
    });
    expect(() => runStyleV2CliForTest(prepareArgs("1.50", "false"), priceRoot)).toThrow("fail-stopped");

    const driftRoot = mkdtempSync(resolve(tmpdir(), "fictor-style-v2-model-drift-"));
    runStyleV2CliForTest(["init"], driftRoot);
    runStyleV2CliForTest(prepareArgs("1.50", "false"), driftRoot);
    const driftAt = now();
    expect(() => runStyleV2CliForTest([
      "result", "--candidate-id", candidateId, "--invocation-id", "invocation-model-drift-01",
      "--provider-result-id", "provider-result-model-drift-01", "--provider-reported-model", "nano_banana_other",
      "--submitted-at", driftAt, "--completed-at", driftAt,
    ], driftRoot)).toThrow("model drifted");
    const driftJournal = journalAt(driftRoot);
    expect(driftJournal.run_state).toBe("FAIL_STOP");
    expect(driftJournal.records[0].state).toBe("MODEL_DRIFT");
    expect(driftJournal.records[0].provider).toMatchObject({
      requested_model: "nano_banana_2", provider_reported_model: "nano_banana_other",
    });
    expect(driftJournal.records[0].terminal_observation).toMatchObject({
      code: "MODEL_DRIFT", requested_model: "nano_banana_2",
      expected_provider_reported_model: "nano_banana_flash", actual_provider_reported_model: "nano_banana_other",
      credit_cap_decimal: "6.00", cumulative_authorized_cost_decimal: "1.50",
    });
    expect(() => runStyleV2CliForTest([
      "result", "--candidate-id", candidateId, "--invocation-id", "invocation-model-drift-01",
      "--provider-result-id", "provider-result-model-drift-01", "--provider-reported-model", "nano_banana_flash",
      "--submitted-at", driftAt, "--completed-at", driftAt,
    ], driftRoot)).toThrow("fail-stopped");

    const balanceRoot = mkdtempSync(resolve(tmpdir(), "fictor-style-v2-balance-anomaly-"));
    runStyleV2CliForTest(["init"], balanceRoot);
    const preparedAt = now();
    runStyleV2CliForTest([
      "prepare", "--candidate-id", candidateId, "--unit-cost", "1.50", "--job-created", "false",
      "--balance-before", "945.9", "--cost-observed-at", preparedAt, "--balance-observed-at", preparedAt,
    ], balanceRoot);
    const providerAt = now();
    expect(() => runStyleV2CliForTest([
      "result", "--candidate-id", candidateId, "--invocation-id", "invocation-anomaly-01",
      "--provider-result-id", "provider-result-anomaly-01", "--submitted-at", providerAt, "--completed-at", providerAt,
    ], balanceRoot)).toThrow("usage");
    expect(journalAt(balanceRoot).records[0].state).toBe("SUBMITTING");
    runStyleV2CliForTest([
      "result", "--candidate-id", candidateId, "--invocation-id", "invocation-anomaly-01",
      "--provider-result-id", "provider-result-anomaly-01", "--provider-reported-model", "nano_banana_flash",
      "--submitted-at", providerAt, "--completed-at", providerAt,
    ], balanceRoot);
    const input = resolve(balanceRoot, "downloaded.png");
    writeFileSync(input, png(1));
    runStyleV2CliForTest(["ingest", "--candidate-id", candidateId, "--input-png", input], balanceRoot);
    const balanceObservedAt = now();
    expect(() => runStyleV2CliForTest([
      "balance-after", "--candidate-id", candidateId, "--balance-after", "944.5", "--observed-at", balanceObservedAt,
    ], balanceRoot)).toThrow("balance delta");
    const balanceJournal = journalAt(balanceRoot);
    expect(balanceJournal.run_state).toBe("FAIL_STOP");
    expect(balanceJournal.records[0].terminal_observation).toMatchObject({
      code: "AMBIGUOUS_BALANCE", actual_balance_before_decimal: "945.9", actual_balance_after_decimal: "944.5",
      actual_delta_decimal: "1.4", credit_cap_decimal: "6.00", cumulative_authorized_cost_decimal: "1.50",
    });
    expect(() => runStyleV2CliForTest([
      "balance-after", "--candidate-id", candidateId, "--balance-after", "944.4", "--observed-at", now(),
    ], balanceRoot)).toThrow("fail-stopped");
  });
});
