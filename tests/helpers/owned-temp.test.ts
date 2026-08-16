import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { describe, expect, test, vi } from "vitest";

import { createOwnedTempManager } from "./owned-temp";

const manager = createOwnedTempManager("owned-temp-helper");

function isTempChild(path: string): boolean {
  const relativePath = relative(resolve(tmpdir()), resolve(path));
  return relativePath !== "" && !relativePath.startsWith("..") && !relativePath.includes(sep);
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function restoreMutation(target: string, moved: string, mode: string, wasMoved: boolean): void {
  if (!isTempChild(target) || !isTempChild(moved)) throw new Error("TEST_MUTATION_PATH_OUTSIDE_TMP");
  if (mode !== "missing" && pathExists(target)) {
    if (mode === "symlink" || mode === "type") unlinkSync(target);
    else rmSync(target, { recursive: true, force: true });
  }
  if (wasMoved && pathExists(moved) && !pathExists(target)) renameSync(moved, target);
}

function expectSafeAggregate(error: unknown, root: string): void {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  function visit(value: unknown): void {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Error) {
      parts.push(value.name, value.message, value.stack ?? "");
      if ("cause" in value) visit(value.cause);
    }
    if (value instanceof AggregateError) {
      for (const nested of value.errors) visit(nested);
    }
  }
  visit(error);
  const printed = parts.join("\n");
  expect(printed).not.toContain(root);
  expect(printed).not.toContain(resolve(tmpdir()));
  expect(printed).not.toContain(homedir());
}

describe("owned temporary roots", () => {
  test("validates containment and derives roots beneath the OS temp directory", () => {
    const root = manager.create("fictor-helper-containment-");
    expect(root.startsWith(`${resolve(tmpdir())}/`)).toBe(true);
    expect(root).not.toContain("/../");
    for (const invalid of [
      "fictor-helper",
      "fictor-helper-../",
      "fictor-helper-\\nested-",
      "fictor-helper-\0-",
      "/tmp/fictor-helper-",
    ]) {
      expect(() => manager.create(invalid)).toThrow("INVALID_OWNED_TEMP_PREFIX");
    }
  });

  test("cleans idempotently and emits path-free diagnostics", () => {
    const root = manager.create("fictor-helper-idempotent-");
    writeFileSync(resolve(root, "payload.txt"), "owned bytes");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(() => manager.cleanupSuite()).not.toThrow();
    expect(() => manager.cleanupSuite()).not.toThrow();
    expect(existsSync(root)).toBe(false);
    const report = JSON.parse(String(info.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(report).toMatchObject({ event: "FICTOR_TEMP_AUDIT", remaining_roots: 0, remaining_bytes: 0 });
    expect(JSON.stringify(report)).not.toContain(root);
    info.mockRestore();
  });

  test.each(["missing", "symlink", "identity", "type"])("refuses an unverified %s target and still attempts other roots", (mode) => {
    const target = manager.create(`fictor-helper-${mode}-`);
    const safe = manager.create(`fictor-helper-${mode}-safe-`);
    const moved = `${target}-moved`;
    let wasMoved = false;
    try {
      renameSync(target, moved);
      wasMoved = true;
      if (mode === "symlink") symlinkSync(moved, target);
      else if (mode === "identity") mkdirSync(target);
      else if (mode === "type") writeFileSync(target, "replacement");

      let failure: unknown;
      try {
        manager.cleanupSuite();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      expectSafeAggregate(failure, target);
      expect(existsSync(safe)).toBe(false);
    } finally {
      restoreMutation(target, moved, mode, wasMoved);
      manager.cleanupSuite();
    }
  });

  test("records scan failures while cleanup continues for every verified root", () => {
    const inaccessible = manager.create("fictor-helper-scan-failure-");
    const safe = manager.create("fictor-helper-scan-safe-");
    writeFileSync(resolve(inaccessible, "payload.txt"), "bytes");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let locked = false;
    try {
      chmodSync(inaccessible, 0o000);
      locked = true;
      let failure: unknown;
      try {
        manager.cleanupSuite();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      expectSafeAggregate(failure, inaccessible);
      expect(existsSync(safe)).toBe(false);
    } finally {
      if (locked && pathExists(inaccessible)) chmodSync(inaccessible, 0o700);
      try {
        manager.cleanupSuite();
      } finally {
        info.mockRestore();
      }
    }
    expect(existsSync(inaccessible)).toBe(false);
  });
});
