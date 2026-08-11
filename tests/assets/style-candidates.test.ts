import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import { assertContactSheetOutputPath, runStyleCandidatesCli } from "../../scripts/assets/style-candidates-cli";
import { atomicWriteVerifiedPng } from "../../scripts/assets/filesystem";
import {
  CORE_V1_SHA256,
  PREFLIGHT_EVIDENCE_PATH,
  PREFLIGHT_EVIDENCE_SHA256,
  buildStyleCandidatesManifest,
  canGenerateRemotely,
  preflightAllowsRemoteGeneration,
  renderStyleCandidatesManifest,
  renderStyleContactSheetHtml,
  styleManifestSha256,
  styleProviderLedgerSha256,
  validateStyleCompletionFiles,
  validateStyleCandidatesManifest,
  validateStyleCompletionEvidence,
  type PreflightGateName,
  type StyleCandidatesManifest,
  type StyleCompletionEvidence,
  type StyleProviderLedger,
} from "../../scripts/assets/style-candidates";

const repositoryRoot = resolve(import.meta.dirname, "../..");

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

function png(fill: number): Buffer {
  const width = 3;
  const height = 4;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(height * (1 + width * 3), fill);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validProviderLedger(manifest: StyleCandidatesManifest): StyleProviderLedger {
  const balances = ["945.9", "944.4", "942.9", "941.4", "939.9"];
  return {
    schema_version: 1,
    ledger_version: "style-provider-ledger-v1",
    manifest_sha256: styleManifestSha256(manifest),
    redacted: true,
    invocations: manifest.candidates.map((candidate, index) => {
      const minute = index * 4;
      const at = (offset: number) => `2026-08-11T10:${String(minute + offset).padStart(2, "0")}:00+09:00`;
      return {
        candidate_id: candidate.id,
        invocation_id: `invocation-style-${index + 1}`,
        tool: "generate_image",
        model: "nano_banana_2",
        use_unlim: false,
        canonical_request_sha256: candidate.canonical_request_sha256,
        provider_result_id: `provider-result-${index + 1}`,
        submitted_at: at(1),
        completed_at: at(2),
        balance_before: { decimal: balances[index], observed_at: at(0) },
        balance_after: { decimal: balances[index + 1], observed_at: at(3) },
      };
    }),
  };
}

function validEvidence(manifest: StyleCandidatesManifest, ledger: StyleProviderLedger): StyleCompletionEvidence {
  return {
    schema_version: 1,
    evidence_version: "style-candidates-completion-v1",
    complete: true,
    manifest_sha256: styleManifestSha256(manifest),
    provider_ledger_sha256: styleProviderLedgerSha256(ledger),
    actual_call_mode: "generate_image",
    balances: { before_decimal: "945.9", after_decimal: "939.9" },
    candidate_records: manifest.candidates.map((candidate, index) => {
      const hashDigit = String(index + 1);
      const hash = hashDigit.repeat(64);
      return {
        candidate_id: candidate.id,
        invocation_id: ledger.invocations[index].invocation_id,
        provider_result_id: ledger.invocations[index].provider_result_id,
        canonical_request_sha256: candidate.canonical_request_sha256,
        local_relative_path: candidate.path,
        backup_relative_path: candidate.path,
        local_sha256: hash,
        backup_sha256: hash,
        png_recovery: {
          format: "PNG",
          width: 768,
          height: 1024,
          size_bytes: 1000 + index,
          local_verified: true,
          backup_verified: true,
        },
      };
    }),
  };
}

function recoveredFixture(manifest: StyleCandidatesManifest) {
  const fixtureRepositoryRoot = mkdtempSync(resolve(tmpdir(), "fictor-style-repo-"));
  const localRoot = resolve(fixtureRepositoryRoot, "public/assets");
  const backupRoot = mkdtempSync(resolve(tmpdir(), "fictor-style-backup-"));
  const ledger = validProviderLedger(manifest);
  const evidence = validEvidence(manifest, ledger);
  const bytes = manifest.candidates.map((_, index) => png(index));
  manifest.candidates.forEach((candidate, index) => {
    const local = atomicWriteVerifiedPng(localRoot, candidate.path, bytes[index], "3:4");
    const backup = atomicWriteVerifiedPng(backupRoot, candidate.path, bytes[index], "3:4");
    const record = evidence.candidate_records[index];
    record.local_sha256 = local.sha256;
    record.backup_sha256 = backup.sha256;
    record.png_recovery.width = local.width;
    record.png_recovery.height = local.height;
    record.png_recovery.size_bytes = local.size;
  });
  return { fixtureRepositoryRoot, localRoot, backupRoot, ledger, evidence, bytes };
}

describe("T011 style candidate hold tooling", () => {
  test("builds byte-identically with exactly four isolated candidates and hashes", () => {
    const first = buildStyleCandidatesManifest(repositoryRoot);
    const second = buildStyleCandidatesManifest(repositoryRoot);
    expect(renderStyleCandidatesManifest(first)).toBe(renderStyleCandidatesManifest(second));
    expect(() => validateStyleCandidatesManifest(first)).not.toThrow();
    expect(first.candidates).toHaveLength(4);
    expect(new Set(first.candidates.map(({ id }) => id)).size).toBe(4);
    expect(new Set(first.candidates.map(({ path }) => path)).size).toBe(4);
    expect(new Set(first.candidates.map(({ prompt_sha256 }) => prompt_sha256)).size).toBe(4);
    expect(new Set(first.candidates.map(({ canonical_request_sha256 }) => canonical_request_sha256)).size).toBe(4);
    expect(first.candidates.every(({ purpose, core_asset_reuse }) => purpose === "STYLE_STUDY_ONLY" && !core_asset_reuse)).toBe(true);
  });

  test("does not intersect core-v1 and pins the unchanged core manifest SHA-256", async () => {
    const { createHash } = await import("node:crypto");
    const coreBytes = readFileSync(resolve(repositoryRoot, "assets/manifests/core-v1.plan.json"));
    expect(createHash("sha256").update(coreBytes).digest("hex")).toBe(CORE_V1_SHA256);
    const core = JSON.parse(coreBytes.toString("utf8")) as { assets: Array<{ id: string; path: string }> };
    const coreIds = new Set(core.assets.map(({ id }) => id));
    const corePaths = new Set(core.assets.map(({ path }) => path));
    const style = buildStyleCandidatesManifest(repositoryRoot);
    expect(style.candidates.filter(({ id }) => coreIds.has(id))).toHaveLength(0);
    expect(style.candidates.filter(({ path }) => corePaths.has(path))).toHaveLength(0);
    const preflightBytes = readFileSync(resolve(repositoryRoot, PREFLIGHT_EVIDENCE_PATH));
    expect(createHash("sha256").update(preflightBytes).digest("hex")).toBe(PREFLIGHT_EVIDENCE_SHA256);
    expect(Object.keys(style.preflight_gate_evidence).sort()).toEqual([
      "AUTO_PUBLISH_PRIVATE", "BALANCE", "COST", "MCP_SCHEMA", "MODEL_PROVIDER",
    ]);
  });

  test("rejects unsafe manifest mutations and hash tampering", () => {
    const manifest = buildStyleCandidatesManifest(repositoryRoot);
    const unsafeUnlimited = clone(manifest) as unknown as Record<string, unknown>;
    unsafeUnlimited.use_unlim = true;
    expect(() => validateStyleCandidatesManifest(unsafeUnlimited as unknown as StyleCandidatesManifest)).toThrow();

    const thirteen = clone(manifest);
    thirteen.candidates = Array.from({ length: 13 }, (_, index) => ({
      ...clone(manifest.candidates[0]),
      id: `style/unsafe-${index}`,
      path: `style/unsafe-${index}.png`,
    }));
    expect(() => validateStyleCandidatesManifest(thirteen)).toThrow();

    const wrongAspect = clone(manifest);
    (wrongAspect.candidates[0].request.aspect_ratio as string) = "16:9";
    expect(() => validateStyleCandidatesManifest(wrongAspect)).toThrow();

    const wrongResolution = clone(manifest);
    (wrongResolution.candidates[0].request.resolution as string) = "2k";
    expect(() => validateStyleCandidatesManifest(wrongResolution)).toThrow();

    const unapprovedReference = clone(manifest) as unknown as Record<string, unknown>;
    unapprovedReference.reference_policy = "APPROVED_EXTERNAL_REFERENCES_ONLY";
    unapprovedReference.references = [{ source: "references/example.png", sha256: "a".repeat(64), rights_status: "PENDING" }];
    expect(() => validateStyleCandidatesManifest(unapprovedReference as unknown as StyleCandidatesManifest)).toThrow();

    const promptHashTamper = clone(manifest);
    promptHashTamper.candidates[0].prompt_sha256 = "0".repeat(64);
    expect(() => validateStyleCandidatesManifest(promptHashTamper)).toThrow();

    const requestHashTamper = clone(manifest);
    requestHashTamper.candidates[0].canonical_request_sha256 = "0".repeat(64);
    expect(() => validateStyleCandidatesManifest(requestHashTamper)).toThrow();
  });

  test("keeps remote generation false when any gate is OPEN", () => {
    const manifest = buildStyleCandidatesManifest(repositoryRoot);
    expect(canGenerateRemotely(manifest)).toBe(false);
    const readyGates = clone(manifest.preflight_gates);
    for (const key of Object.keys(readyGates) as PreflightGateName[]) readyGates[key] = key === "COST" ? "PASS_BUT_CHANGED" : "PASS";
    expect(preflightAllowsRemoteGeneration(readyGates)).toBe(true);
    for (const key of Object.keys(readyGates) as PreflightGateName[]) {
      const oneOpen = clone(readyGates);
      oneOpen[key] = "OPEN";
      expect(preflightAllowsRemoteGeneration(oneOpen)).toBe(false);
    }

    const coerced = clone(manifest) as unknown as Record<string, unknown>;
    coerced.remote_generation_state = "READY_FOR_REMOTE_GENERATION";
    coerced.provider_limit = { status: "CONFIRMED", schema_max_batch_size: 1, note: "CURRENT_SCHEMA_ANNOTATION_OBSERVED" };
    coerced.submission_topology = "ONE_REQUEST_PER_CANDIDATE";
    const coercedGates = coerced.preflight_gates as Record<PreflightGateName, string>;
    for (const key of Object.keys(coercedGates) as PreflightGateName[]) coercedGates[key] = "PASS";
    const reused = clone(manifest.preflight_gate_evidence.MCP_SCHEMA!);
    coerced.preflight_gate_evidence = Object.fromEntries(
      (Object.keys(coercedGates) as PreflightGateName[]).map((key) => [key, clone(reused)]),
    );
    expect(canGenerateRemotely(coerced as unknown as StyleCandidatesManifest)).toBe(false);
    expect(() => validateStyleCandidatesManifest(coerced as unknown as StyleCandidatesManifest)).toThrow("HOLD-only");
  });

  test("rejects incomplete, duplicate, and mismatched completion evidence", () => {
    const manifest = buildStyleCandidatesManifest(repositoryRoot);
    const ledger = validProviderLedger(manifest);
    const missing = clone(validEvidence(manifest, ledger)) as unknown as Record<string, unknown>;
    delete missing.balances;
    expect(() => validateStyleCompletionEvidence(missing, manifest, ledger)).toThrow();

    const duplicate = clone(validEvidence(manifest, ledger));
    duplicate.candidate_records[1].candidate_id = duplicate.candidate_records[0].candidate_id;
    expect(() => validateStyleCompletionEvidence(duplicate, manifest, ledger)).toThrow();

    const duplicateInvocation = clone(validEvidence(manifest, ledger));
    duplicateInvocation.candidate_records[1].invocation_id = duplicateInvocation.candidate_records[0].invocation_id;
    expect(() => validateStyleCompletionEvidence(duplicateInvocation, manifest, ledger)).toThrow();

    const mismatch = clone(validEvidence(manifest, ledger));
    mismatch.candidate_records[0].backup_sha256 = "f".repeat(64);
    expect(() => validateStyleCompletionEvidence(mismatch, manifest, ledger)).toThrow();

    const wrongCost = clone(validEvidence(manifest, ledger));
    wrongCost.balances.after_decimal = "940.0";
    expect(() => validateStyleCompletionEvidence(wrongCost, manifest, ledger)).toThrow("6.00");

    expect(() => validateStyleCompletionEvidence(validEvidence(manifest, ledger), manifest, undefined)).toThrow("ledger");
    const tamperedLedger = clone(ledger);
    tamperedLedger.invocations[0].provider_result_id = "synthetic-result-only";
    expect(() => validateStyleCompletionEvidence(validEvidence(manifest, ledger), manifest, tamperedLedger)).toThrow();

    const wrongTool = clone(ledger) as unknown as { invocations: Array<Record<string, unknown>> };
    wrongTool.invocations[0].tool = "generate_image_batch";
    expect(() => validateStyleCompletionEvidence(validEvidence(manifest, ledger), manifest, wrongTool)).toThrow("canonical candidate request");

    const wrongCheckpoint = clone(ledger);
    wrongCheckpoint.invocations[0].balance_after.decimal = "944.5";
    expect(() => validateStyleCompletionEvidence(validEvidence(manifest, ledger), manifest, wrongCheckpoint)).toThrow("1.50");

    const missingTimestamp = clone(ledger) as unknown as { invocations: Array<Record<string, unknown>> };
    missingTimestamp.invocations[0].completed_at = "2026-08-11";
    expect(() => validateStyleCompletionEvidence(validEvidence(manifest, ledger), manifest, missingTimestamp)).toThrow("timestamps");
  });

  test("verifies actual local and backup PNGs and rejects missing or tampered files", () => {
    const manifest = buildStyleCandidatesManifest(repositoryRoot);
    const fixture = recoveredFixture(manifest);
    expect(() => validateStyleCompletionFiles(fixture.evidence, manifest, fixture.ledger, fixture.localRoot, fixture.backupRoot)).not.toThrow();

    const first = manifest.candidates[0];
    unlinkSync(resolve(fixture.localRoot, first.path));
    expect(() => validateStyleCompletionFiles(fixture.evidence, manifest, fixture.ledger, fixture.localRoot, fixture.backupRoot)).toThrow();
    writeFileSync(resolve(fixture.localRoot, first.path), fixture.bytes[0]);
    writeFileSync(resolve(fixture.backupRoot, first.path), png(99));
    expect(() => validateStyleCompletionFiles(fixture.evidence, manifest, fixture.ledger, fixture.localRoot, fixture.backupRoot)).toThrow();
    expect(() => validateStyleCompletionFiles(fixture.evidence, manifest, fixture.ledger, fixture.localRoot, fixture.localRoot)).toThrow("BACKUP_ROOT_NOT_DISTINCT");
  });

  test("keeps the exported renderer unreachable for the HOLD-only v1 revision", () => {
    const manifest = buildStyleCandidatesManifest(repositoryRoot);
    const fixture = recoveredFixture(manifest);
    expect(() => renderStyleContactSheetHtml(
      manifest,
      fixture.evidence,
      fixture.ledger,
      fixture.fixtureRepositoryRoot,
      fixture.backupRoot,
    )).toThrow("READY");
  });

  test("blocks the contact-sheet CLI on HOLD before reading evidence or writing output", () => {
    const output = "docs/asset-runs/contact-sheets/hold-must-not-write.html";
    expect(existsSync(resolve(repositoryRoot, output))).toBe(false);
    expect(() => runStyleCandidatesCli([
      "contact-sheet",
      "--evidence", "does-not-exist.json",
      "--provider-ledger", "does-not-exist-ledger.json",
      "--output", output,
      "--local-root", "public/assets",
      "--backup-root", resolve(tmpdir(), "does-not-exist-backup"),
    ])).toThrow("HOLD");
    expect(existsSync(resolve(repositoryRoot, output))).toBe(false);
  });

  test("allows only the dedicated contact sheet output directory", () => {
    expect(() => assertContactSheetOutputPath("docs/asset-runs/contact-sheets/style-review.html")).not.toThrow();
    expect(() => assertContactSheetOutputPath("package.json")).toThrow();
    expect(() => assertContactSheetOutputPath("docs/asset-runs/contact-sheets/../package.html")).toThrow();
  });
});
