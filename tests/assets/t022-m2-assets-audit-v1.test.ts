import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { beforeAll, describe, expect, test } from "vitest";

import { createOwnedTempManager } from "../helpers/owned-temp";

import {
  T022_FAILED_IDS,
  T022_MANIFEST_PATH,
  T022_MILESTONE_PATH,
  T022_VERIFIED_AT,
  assertT022NoForbiddenRegeneration,
  auditT022Inventory,
  buildT022ExpectedInventory,
  buildT022Fallback,
  buildT022Ledger,
  buildT022Manifest,
  buildT022Milestone,
  buildT022T016Forensic,
  checkT022Recorded,
  renderT022Json,
  sha256T022,
  validateT022T016Forensic,
  verifyT022RecordedBytes,
  writeT022NoClobber,
  type T022ExpectedAsset,
  type T022Manifest,
  type T022T016Forensic,
} from "../../scripts/assets/t022-m2-assets-audit-v1";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const tempManager = createOwnedTempManager("t022-m2-assets-audit-v1");

function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const name = Buffer.from(type); const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result; }
function png(width = 3, height = 4, fill = 0): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const row = width * 3; const pixels = Buffer.alloc(height * (1 + row), fill); for (let y = 0; y < height; y += 1) pixels[y * (1 + row)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

function fixture(two = false): { root: string; assets: T022ExpectedAsset[] } {
  const root = tempManager.create("fictor-t022-test-");
  const backup = "assets/backups/owner";
  const assets: T022ExpectedAsset[] = [{ id: "one", category: "MATERIAL", source_task: "T013", path: "cards/one.png", aspect_ratio: "3:4", backup_root: backup }];
  if (two) assets.push({ id: "two", category: "CANONICAL", source_task: "T015", path: "cards/two.png", aspect_ratio: "3:4", backup_root: backup });
  mkdirSync(resolve(root, "public/assets/cards"), { recursive: true }); mkdirSync(resolve(root, backup, "cards"), { recursive: true });
  assets.forEach((asset, index) => { const bytes = png(3, 4, index + 1); writeFileSync(resolve(root, "public/assets", asset.path), bytes); writeFileSync(resolve(root, backup, asset.path), bytes); });
  return { root, assets };
}

let expectedInventory: T022ExpectedAsset[];
let expectedFallback: ReturnType<typeof buildT022Fallback>;
let expectedLedger: ReturnType<typeof buildT022Ledger>;
beforeAll(() => { expectedInventory = buildT022ExpectedInventory(repositoryRoot); expectedFallback = buildT022Fallback(repositoryRoot, expectedInventory); expectedLedger = buildT022Ledger(repositoryRoot); });

describe("T022 deterministic scope", () => {
  test("routes the exact 621 assets to six owners and distinguishes the four style PNGs", () => {
    expect(expectedInventory).toHaveLength(621);
    expect(Object.fromEntries([...new Set(expectedInventory.map(({ source_task }) => source_task))].map((task) => [task, expectedInventory.filter(({ source_task }) => source_task === task).length]))).toEqual({ T013: 52, T015: 332, T016: 157, T019: 6, T020: 54, T021: 20 });
    expect(new Set(expectedInventory.map(({ id }) => id)).size).toBe(621);
    expect(new Set(expectedInventory.map(({ path }) => path)).size).toBe(621);
  });

  test("orders 837 canonical and 36 heart-forge fallback records and tombstones all three failures", () => {
    expect(expectedFallback).toHaveLength(873);
    expect(expectedFallback.filter(({ category }) => category === "CANONICAL")).toHaveLength(837);
    expect(expectedFallback.filter(({ category }) => category === "HEART_FORGE")).toHaveLength(36);
    for (const id of T022_FAILED_IDS) expect(expectedFallback.find((record) => record.id === id)?.reason).toBe("NO_REGENERATION_T022");
    expect(() => assertT022NoForbiddenRegeneration([T022_FAILED_IDS[0]])).toThrow(/NO_REGENERATION_T022/);
  });

  test("normalizes the 22-batch cap ledger from tracked evidence", () => {
    expect(expectedLedger).toHaveLength(22);
    expect(expectedLedger.reduce((sum, batch) => sum + batch.submitted, 0)).toBe(240);
    expect(expectedLedger.reduce((sum, batch) => sum + batch.charged, 0)).toBe(237);
    expect(expectedLedger.reduce((sum, batch) => sum + batch.recovered, 0)).toBe(237);
    expect(expectedLedger.flatMap(({ uncharged_failures }) => uncharged_failures)).toEqual([...T022_FAILED_IDS]);
    expect(expectedLedger[0]).toMatchObject({ balance_before_decimal: "363.90", spend_decimal: "9.00", use_unlim: false, paid_retry_count: 0 });
    expect(expectedLedger.at(-1)?.balance_after_decimal).toBe("8.40");
  });

  test.each([
    ["request index", (value: T022T016Forensic) => { value.batches[0].jobs[0].index = 999; }],
    ["asset binding", (value: T022T016Forensic) => { value.batches[0].jobs[0].asset_id = "tampered_asset"; }],
    ["job binding", (value: T022T016Forensic) => { value.batches[0].jobs[0].job_id = "tampered-job-id"; }],
    ["final state", (value: T022T016Forensic) => { value.batches[0].final_state = "FAIL_STOP"; }],
    ["all terminal", (value: T022T016Forensic) => { (value.batches[0] as unknown as { all_terminal: boolean }).all_terminal = false; }],
    ["failed status to pending", (value: T022T016Forensic) => { (value.batches[2].jobs.find(({ final_status }) => final_status === "failed") as unknown as { final_status: string }).final_status = "pending"; }],
    ["recovery SHA", (value: T022T016Forensic) => { value.batches[0].jobs[0].recovery_sha256 = "a".repeat(64); }],
    ["recovered", (value: T022T016Forensic) => { value.batches[0].recovered -= 1; }],
    ["failure id", (value: T022T016Forensic) => { value.batches[2].jobs.find(({ final_status }) => final_status !== "completed")!.asset_id = "tampered_failure"; }],
    ["balance", (value: T022T016Forensic) => { value.batches[0].balance_after_decimal = "224.90"; }],
    ["charge", (value: T022T016Forensic) => { value.batches[0].charged -= 1; }],
    ["use_unlim", (value: T022T016Forensic) => { (value.batches[0] as unknown as { use_unlim: boolean }).use_unlim = true; }],
    ["paid retry", (value: T022T016Forensic) => { value.batches[0].paid_retry_count = 1; }],
    ["model", (value: T022T016Forensic) => { value.batches[0].jobs[0].model = "tampered_model"; }],
  ] as const)("rejects semantic forensic tampering: %s", (_label, mutate) => {
    const value = JSON.parse(readFileSync(resolve(repositoryRoot, "assets/evidence/t016-canonical-cards-final-forensic-v1.json"), "utf8")) as T022T016Forensic;
    mutate(value);
    value.batches_sha256 = sha256T022(`${value.batches.map((batch) => JSON.stringify(batch)).join("\n")}\n`);
    expect(() => validateT022T016Forensic(value, repositoryRoot)).toThrow(/T016_FORENSIC/);
  });

  test("the local ignored journal normalizes to the tracked allowlist evidence without exposing it", () => {
    const journal = resolve(repositoryRoot, "assets/runs/t016-canonical-cards/operations-v1.json");
    if (!existsSync(journal)) return;
    expect(renderT022Json(buildT022T016Forensic(repositoryRoot))).toBe(readFileSync(resolve(repositoryRoot, "assets/evidence/t016-canonical-cards-final-forensic-v1.json"), "utf8"));
  });
});

describe("T022 targeted PNG and owner-root audit", () => {
  test("validates an isolated restore-read without mutating public bytes", () => {
    const { root, assets } = fixture(); const before = sha256T022(readFileSync(resolve(root, "public/assets/cards/one.png")));
    expect(auditT022Inventory(root, assets, { verifyBackups: true, isolatedRestoreRead: true })).toHaveLength(1);
    expect(sha256T022(readFileSync(resolve(root, "public/assets/cards/one.png")))).toBe(before);
  });

  test.each(["magic", "crc"])("rejects corrupt PNG %s", (kind) => {
    const { root, assets } = fixture(); const path = resolve(root, "public/assets/cards/one.png"); const bytes = Buffer.from(readFileSync(path));
    if (kind === "magic") bytes[0] = 0; else bytes[20] ^= 1; writeFileSync(path, bytes);
    expect(() => auditT022Inventory(root, assets, { verifyBackups: true })).toThrow(/INVALID_PNG/);
  });

  test("rejects a missing public file and an out-of-ratio PNG", () => {
    const missing = fixture(); expect(() => auditT022Inventory(missing.root, [{ ...missing.assets[0], path: "cards/missing.png" }], { verifyBackups: false })).toThrow();
    const aspect = fixture(); writeFileSync(resolve(aspect.root, "public/assets/cards/one.png"), png(4, 4));
    expect(() => auditT022Inventory(aspect.root, aspect.assets, { verifyBackups: false })).toThrow(/ASPECT_MISMATCH/);
  });

  test("rejects backup mismatch, unexpected files, and symlinks", () => {
    const mismatch = fixture(); writeFileSync(resolve(mismatch.root, "assets/backups/owner/cards/one.png"), png(3, 4, 99));
    expect(() => auditT022Inventory(mismatch.root, mismatch.assets, { verifyBackups: true })).toThrow(/LOCAL_VERIFY_FAILED/);
    const unexpected = fixture(); writeFileSync(resolve(unexpected.root, "assets/backups/owner/cards/extra.png"), png());
    expect(() => auditT022Inventory(unexpected.root, unexpected.assets, { verifyBackups: true })).toThrow(/UNEXPECTED_BACKUP_ENTRY/);
    const linked = fixture(); symlinkSync(resolve(linked.root, "assets/backups/owner/cards/one.png"), resolve(linked.root, "assets/backups/owner/cards/link.png"));
    expect(() => auditT022Inventory(linked.root, linked.assets, { verifyBackups: true })).toThrow(/UNEXPECTED_BACKUP_ENTRY/);
  });

  test("rejects duplicate ids, paths, and image content hashes", () => {
    const base = fixture(); expect(() => auditT022Inventory(base.root, [base.assets[0], { ...base.assets[0], path: "cards/two.png" }], { verifyBackups: false })).toThrow(/DUPLICATE_ID/);
    expect(() => auditT022Inventory(base.root, [base.assets[0], { ...base.assets[0], id: "two" }], { verifyBackups: false })).toThrow(/DUPLICATE_PATH/);
    const content = fixture(true); const first = readFileSync(resolve(content.root, "public/assets/cards/one.png")); writeFileSync(resolve(content.root, "public/assets/cards/two.png"), first); writeFileSync(resolve(content.root, "assets/backups/owner/cards/two.png"), first);
    expect(() => auditT022Inventory(content.root, content.assets, { verifyBackups: true })).toThrow(/DUPLICATE_CONTENT/);
  });
});

describe("T022 immutable record and check", () => {
  test("no-clobber creates missing bytes, accepts identical bytes, and refuses a different rebaseline", () => {
    const root = tempManager.create("fictor-t022-record-");
    expect(writeT022NoClobber(root, "out.json", "one\n")).toBe("CREATED");
    expect(writeT022NoClobber(root, "out.json", "one\n")).toBe("IDENTICAL");
    expect(() => writeT022NoClobber(root, "out.json", "two\n")).toThrow(/REBASELINE_REQUIRED/);
    expect(readFileSync(resolve(root, "out.json"), "utf8")).toBe("one\n");
  });

  test("rejects a tampered manifest even when its milestone hash is coordinated", () => {
    const fixtureManifest = { schema_version: 1, audit_version: "t022-m2-assets-audit-v1", contract_sha256: "x", verified_at: T022_VERIFIED_AT, verify_by: "x", status: "VERIFIED", scope: {}, source_files: [], assets: { list_encoding: "x", list_sha256: sha256T022("\n"), records: [] }, fallback: { count: 873, canonical: 837, heart_forge: 36, list_encoding: "x", list_sha256: sha256T022("\n"), records: [] }, forbidden_regeneration: { state: "NO_REGENERATION_T022", ids: [] }, integrity: {}, backup_status: { presence_reverified_in_ci: false }, provider: {}, generation_cap_window: {} } as unknown as T022Manifest;
    const originalBytes = renderT022Json(fixtureManifest); const originalMilestone = buildT022Milestone(originalBytes, fixtureManifest);
    const tampered = structuredClone(fixtureManifest); tampered.status = "VERIFIED"; (tampered.scope as { audited_asset_count: number }).audited_asset_count = 620;
    const tamperedBytes = renderT022Json(tampered); const coordinated = buildT022Milestone(tamperedBytes, tampered);
    expect(() => verifyT022RecordedBytes(tamperedBytes, coordinated, fixtureManifest, sha256T022(originalBytes))).toThrow(/TAMPERED_T022_MANIFEST/);
    expect(() => verifyT022RecordedBytes(originalBytes, { ...originalMilestone, audit_manifest_file_sha256: "0".repeat(64) }, fixtureManifest, sha256T022(originalBytes))).toThrow(/TAMPERED_T022_MILESTONE/);
  });

  test("the tracked real-repository record is a read-only deterministic check", () => {
    expect(existsSync(resolve(repositoryRoot, T022_MANIFEST_PATH))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, T022_MILESTONE_PATH))).toBe(true);
    const before = createHash("sha256").update(readFileSync(resolve(repositoryRoot, T022_MANIFEST_PATH))).digest("hex");
    expect(checkT022Recorded(repositoryRoot)).toMatchObject({ audited: 621, fallback: 873, backup_presence_reverified: false });
    expect(createHash("sha256").update(readFileSync(resolve(repositoryRoot, T022_MANIFEST_PATH))).digest("hex")).toBe(before);
  }, 60_000);
});
