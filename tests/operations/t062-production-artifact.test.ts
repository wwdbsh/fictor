import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { createOwnedTempManager } from "../helpers/owned-temp";

// @ts-expect-error The production CLI intentionally remains a plain Node ESM module.
import * as t062Artifact from "../../scripts/t062-production-artifact.mjs";

const {
  T062_CANDIDATE_REVISION,
  T062_CONTRACT_SHA256,
  T062_MANIFEST_PATH,
  checkT062Manifest,
  compareUnicodeCodepoints,
  createT062Manifest,
  writeT062Manifest,
} = t062Artifact;

const tempManager = createOwnedTempManager("t062-production-artifact");
const fixtureOptions = { expectedPngCount: 1 };

function write(root: string, path: string, bytes: string | Buffer): void {
  const absolute = resolve(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
}

function fixture(): string {
  const root = tempManager.create("fictor-t062-");
  write(root, "dist/index.html", "<!doctype html>\n");
  write(root, "dist/THIRD_PARTY_NOTICES.txt", "MIT notice\n");
  write(root, "dist/assets/app.js", "console.log('fictor');\n");
  write(root, "dist/assets/card.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  write(root, "dist/\u{10000}.txt", "astral\n");
  write(root, "dist/\uE000.txt", "bmp private-use\n");
  return root;
}

describe("T062 production artifact byte freeze", () => {
  test("writes and checks a deterministic, codepoint-sorted full dist manifest", () => {
    const root = fixture();
    expect(compareUnicodeCodepoints("\u{10000}", "\uE000")).toBeGreaterThan(0);

    expect(() => createT062Manifest(root)).toThrow("DIST_PNG_COUNT_MISMATCH:expected=622:actual=1");
    const first = createT062Manifest(root, fixtureOptions);
    const second = createT062Manifest(root, fixtureOptions);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      schema_version: 1,
      manifest_version: "t062-production-artifact-v1",
      candidate_revision: T062_CANDIDATE_REVISION,
      contract_sha256: T062_CONTRACT_SHA256,
      evidence_commit: null,
      file_count: 6,
      png_count: 1,
      extension_counts: { ".html": 1, ".js": 1, ".png": 1, ".txt": 3 },
      evidence_only_candidates: [
        { path: "assets/style/master-candidate-02.png", absent: true },
        { path: "assets/style/master-candidate-03.png", absent: true },
        { path: "assets/style/master-candidate-04.png", absent: true },
      ],
    });
    expect(first.files.map(({ path }: { path: string }) => path)).toEqual([
      "THIRD_PARTY_NOTICES.txt",
      "assets/app.js",
      "assets/card.png",
      "index.html",
      "\uE000.txt",
      "\u{10000}.txt",
    ]);
    const noticeBytes = Buffer.from("MIT notice\n");
    expect(first.third_party_notices).toMatchObject({ path: "THIRD_PARTY_NOTICES.txt", bytes: noticeBytes.length });
    const exactTreeEncoding = first.files
      .map(({ path, bytes, sha256 }: { path: string; bytes: number; sha256: string }) => `${sha256} ${bytes} ${path}\n`)
      .join("");
    expect(first.dist_tree_encoding).toBe('sha256 + " " + bytes + " " + path + "\\n"');
    expect(first.dist_tree_sha256).toBe(createHash("sha256").update(exactTreeEncoding, "utf8").digest("hex"));

    expect(writeT062Manifest(root, fixtureOptions)).toMatchObject({ status: "CREATED", path: T062_MANIFEST_PATH });
    expect(writeT062Manifest(root, fixtureOptions)).toMatchObject({ status: "IDENTICAL" });
    expect(checkT062Manifest(root, fixtureOptions)).toMatchObject({ status: "VERIFIED", dist_tree_sha256: first.dist_tree_sha256 });
    const persisted = JSON.parse(readFileSync(resolve(root, T062_MANIFEST_PATH), "utf8"));
    expect(persisted).toEqual(first);

    write(root, "dist/assets/app.js", "console.log('changed');\n");
    expect(() => checkT062Manifest(root, fixtureOptions)).toThrow("T062_DIST_BYTE_DRIFT");
    expect(() => writeT062Manifest(root, fixtureOptions)).toThrow(`REBASELINE_REQUIRED:${T062_MANIFEST_PATH}`);
  });

  test("fails closed on evidence-only candidates, symlinks, and missing notices", () => {
    const leaked = fixture();
    write(leaked, "dist/assets/style/master-candidate-02.png", "leak");
    expect(() => createT062Manifest(leaked, fixtureOptions)).toThrow("EVIDENCE_ONLY_CANDIDATE_PRESENT");

    const linked = fixture();
    symlinkSync(resolve(linked, "dist/index.html"), resolve(linked, "dist/link.html"));
    expect(() => createT062Manifest(linked, fixtureOptions)).toThrow("DIST_SYMLINK_REJECTED");

    const nested = fixture();
    mkdirSync(resolve(nested, "dist/nested"));
    write(nested, "dist/nested/regular.txt", "regular child\n");
    expect(createT062Manifest(nested, fixtureOptions).file_count).toBe(7);

    const missingNotice = fixture();
    rmSync(resolve(missingNotice, "dist/THIRD_PARTY_NOTICES.txt"));
    expect(() => createT062Manifest(missingNotice, fixtureOptions)).toThrow("DIST_REQUIRED_FILE_MISSING");
  });

  test("never exposes a partial target when publication fails", () => {
    const root = fixture();
    expect(() => writeT062Manifest(root, {
      ...fixtureOptions,
      beforePublish: () => { throw new Error("SIMULATED_PUBLISH_FAILURE"); },
    })).toThrow("SIMULATED_PUBLISH_FAILURE");
    expect(existsSync(resolve(root, T062_MANIFEST_PATH))).toBe(false);
    expect(existsSync(resolve(root, `${T062_MANIFEST_PATH}.tmp`))).toBe(false);

    const linkedRoot = fixture();
    const externalManifest = resolve(linkedRoot, "external-manifest.json");
    writeFileSync(externalManifest, "{}\n");
    mkdirSync(dirname(resolve(linkedRoot, T062_MANIFEST_PATH)), { recursive: true });
    symlinkSync(externalManifest, resolve(linkedRoot, T062_MANIFEST_PATH));
    expect(() => writeT062Manifest(linkedRoot, fixtureOptions)).toThrow(
      `MANIFEST_NOT_REGULAR:${T062_MANIFEST_PATH}`,
    );
  });
});
