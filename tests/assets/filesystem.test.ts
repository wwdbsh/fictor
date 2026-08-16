import { existsSync, mkdirSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import { createOwnedTempManager } from "../helpers/owned-temp";

import {
  DEFAULT_MAX_PNG_BYTES,
  acquireRunnerLock,
  atomicWriteJson,
  atomicWriteVerifiedPng,
  backupVerifiedFile,
  inspectPng,
  safeResolve,
} from "../../scripts/assets/filesystem";
import { redactError } from "../../scripts/assets/redaction";

const tempManager = createOwnedTempManager("filesystem");

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

function png(width = 3, height = 4, fill = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(height * (1 + width * 3));
  pixels.fill(fill);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("safe asset file recovery", () => {
  test("writes atomically, accepts the same hash, refuses a different hash, and verifies backup", () => {
    const root = tempManager.create("fictor-local-");
    const backup = tempManager.create("fictor-backup-");
    const first = atomicWriteVerifiedPng(root, "cards/a.png", png(), "3:4");
    expect(first.already_existed).toBe(false);
    expect(atomicWriteVerifiedPng(root, "cards/a.png", png(), "3:4").already_existed).toBe(true);
    expect(() => atomicWriteVerifiedPng(root, "cards/a.png", png(3, 4, 1), "3:4"))
      .toThrow("EXISTING_FILE_CONFLICT");
    const copied = backupVerifiedFile(root, backup, "cards/a.png", first.sha256, "3:4");
    expect(copied.sha256).toBe(first.sha256);
    expect(() => backupVerifiedFile(root, root, "cards/a.png", first.sha256, "3:4"))
      .toThrow("BACKUP_ROOT_NOT_DISTINCT");
    expect(() => backupVerifiedFile(root, resolve(root, "nested"), "cards/a.png", first.sha256, "3:4"))
      .toThrow("BACKUP_ROOT_NOT_DISTINCT");
    expect(() => backupVerifiedFile(resolve(backup, "nested"), backup, "cards/a.png", first.sha256, "3:4"))
      .toThrow("BACKUP_ROOT_NOT_DISTINCT");
    const alias = resolve(tempManager.create("fictor-alias-parent-"), "local-alias");
    symlinkSync(root, alias);
    expect(() => backupVerifiedFile(root, alias, "cards/a.png", first.sha256, "3:4"))
      .toThrow("BACKUP_ROOT_NOT_DISTINCT");
  });

  test("rejects traversal, absolute paths, NUL, symlinks, malformed PNG, wrong aspect, and oversized data", () => {
    const root = tempManager.create("fictor-safe-");
    const outside = tempManager.create("fictor-outside-");
    mkdirSync(resolve(root, "cards"));
    symlinkSync(outside, resolve(root, "cards/link"));
    for (const unsafe of ["../a.png", "/tmp/a.png", "cards\\a.png", "cards/\0a.png"]) {
      expect(() => safeResolve(root, unsafe)).toThrow("UNSAFE_PATH");
    }
    expect(() => safeResolve(root, "cards/link/a.png")).toThrow("SYMLINK_TRAVERSAL");
    expect(() => inspectPng(Buffer.from("not png"), "3:4")).toThrow("INVALID_PNG");
    expect(() => inspectPng(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "3:4")).toThrow("INVALID_PNG");
    expect(() => inspectPng(png().subarray(0, -1), "3:4")).toThrow("INVALID_PNG");
    const badCrc = Buffer.from(png());
    badCrc[badCrc.length - 1] ^= 1;
    expect(() => inspectPng(badCrc, "3:4")).toThrow("INVALID_PNG");
    expect(() => inspectPng(Buffer.concat([png(), Buffer.from([0])]), "3:4")).toThrow("INVALID_PNG");
    const invalidZlib = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", png().subarray(16, 29)),
      chunk("IDAT", Buffer.from("not-zlib", "utf8")),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect(() => inspectPng(invalidZlib, "3:4")).toThrow("INVALID_PNG");
    const truncatedScanlines = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", png().subarray(16, 29)),
      chunk("IDAT", deflateSync(Buffer.from([0]))),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect(truncatedScanlines).toHaveLength(66);
    expect(() => inspectPng(truncatedScanlines, "3:4")).toThrow("INVALID_PNG");
    const invalidFilterPayload = Buffer.alloc(4 * (1 + 3 * 3));
    invalidFilterPayload[0] = 5;
    const invalidFilter = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", png().subarray(16, 29)),
      chunk("IDAT", deflateSync(invalidFilterPayload)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect(() => inspectPng(invalidFilter, "3:4")).toThrow("INVALID_PNG");
    expect(() => inspectPng(png(4, 3), "3:4")).toThrow("ASPECT_MISMATCH");
    const providerNative = png(896, 1200);
    expect(() => inspectPng(providerNative, "3:4")).toThrow("ASPECT_MISMATCH");
    expect(inspectPng(providerNative, "3:4", DEFAULT_MAX_PNG_BYTES, 5_000)).toMatchObject({
      width: 896, height: 1200, aspect_error_ppm: 4445,
    });
    expect(() => inspectPng(providerNative, "3:4", DEFAULT_MAX_PNG_BYTES, 4_444)).toThrow("ASPECT_MISMATCH");
    expect(() => inspectPng(png(895, 1200), "3:4", DEFAULT_MAX_PNG_BYTES, 5_000)).toThrow("ASPECT_MISMATCH");
    expect(inspectPng(png(603, 800), "3:4", DEFAULT_MAX_PNG_BYTES, 5_000).aspect_error_ppm).toBe(5_000);
    expect(() => inspectPng(png(603, 800), "3:4", DEFAULT_MAX_PNG_BYTES, 4_999)).toThrow("ASPECT_MISMATCH");
    expect(() => inspectPng(Buffer.concat([png(), Buffer.alloc(20)]), "3:4", 30)).toThrow("FILE_TOO_LARGE");
  });

  test("enforces a single runner and only recovers a stale dead lock", () => {
    const root = tempManager.create("fictor-lock-");
    const path = resolve(root, "runner.lock");
    const first = acquireRunnerLock(root, "runner.lock", 100);
    expect(() => acquireRunnerLock(root, "runner.lock", 100)).toThrow("RUNNER_LOCKED");
    first.release();
    writeFileSync(path, JSON.stringify({ pid: 999_999_999, created_at_ms: 0 }), "utf8");
    utimesSync(path, new Date(0), new Date(0));
    writeFileSync(`${path}.claim`, JSON.stringify({ pid: 999_999_999 }), "utf8");
    expect(() => acquireRunnerLock(root, "runner.lock", 100)).toThrow("RUNNER_LOCKED");
    expect(existsSync(path)).toBe(true);
    unlinkSync(`${path}.claim`);
    const recovered = acquireRunnerLock(root, "runner.lock", 100);
    recovered.release();
  });

  test("control JSON and lock reject nested symlink ancestors without mutating outside", () => {
    const root = tempManager.create("fictor-control-");
    const outside = tempManager.create("fictor-control-outside-");
    mkdirSync(resolve(root, "nested"));
    symlinkSync(outside, resolve(root, "nested", "escape"));
    expect(() => atomicWriteJson(root, "nested/escape/ledger.json", { secret: false }))
      .toThrow("SYMLINK_TRAVERSAL");
    expect(() => acquireRunnerLock(root, "nested/escape/runner.lock"))
      .toThrow("SYMLINK_TRAVERSAL");
    expect(existsSync(resolve(outside, "ledger.json"))).toBe(false);
    expect(existsSync(resolve(outside, "runner.lock"))).toBe(false);
  });

  test("redaction never returns provider secrets", () => {
    const canary = "sk-secret-canary signed=https://example.invalid/token";
    const safe = redactError(new Error(canary));
    expect(JSON.stringify(safe)).not.toContain(canary);
    expect(safe).toEqual({ code: "UNKNOWN", message: "asset operation failed" });
  });
});
