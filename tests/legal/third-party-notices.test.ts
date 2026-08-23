import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { createOwnedTempManager } from "../helpers/owned-temp";
import {
  PACKAGE_LOCK_SHA256,
  REACT_LICENSE_BLOCK_ID,
  REACT_LICENSE_SHA256,
  THIRD_PARTY_NOTICE_BYTES,
  THIRD_PARTY_NOTICE_PUBLIC_PATH,
  THIRD_PARTY_NOTICE_SHA256,
  VITE_LICENSE_BLOCK_ID,
  VITE_LICENSE_SHA256,
  parseThirdPartyNotice,
  validateThirdPartyNoticeBytes,
  verifyThirdPartyNoticeFile,
} from "../../scripts/legal/third-party-notices";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const noticePath = resolve(repositoryRoot, THIRD_PARTY_NOTICE_PUBLIC_PATH);
const tempManager = createOwnedTempManager("third-party-notices");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("T059 third-party notice", () => {
  test("locks the four deployed packages to the unchanged package-lock and two exact blocks", () => {
    const bytes = readFileSync(noticePath);
    expect(bytes.byteLength).toBe(THIRD_PARTY_NOTICE_BYTES);
    expect(sha256(bytes)).toBe(THIRD_PARTY_NOTICE_SHA256);
    const document = verifyThirdPartyNoticeFile(noticePath, repositoryRoot, true);
    expect(document.packageLockSha256).toBe(PACKAGE_LOCK_SHA256);
    expect(document.packages.map(({ name, version }) => `${name}@${version}`)).toEqual([
      "react@19.2.8",
      "react-dom@19.2.8",
      "scheduler@0.27.0",
      "vite@8.2.1",
    ]);
    expect(document.packages.map(({ sourcePath, sourceSha256 }) => [sourcePath, sourceSha256])).toEqual([
      ["node_modules/react/LICENSE", REACT_LICENSE_SHA256],
      ["node_modules/react-dom/LICENSE", REACT_LICENSE_SHA256],
      ["node_modules/scheduler/LICENSE", REACT_LICENSE_SHA256],
      ["node_modules/vite/LICENSE.md", VITE_LICENSE_SHA256],
    ]);
    expect(document.blocks.map(({ id }) => id)).toEqual([REACT_LICENSE_BLOCK_ID, VITE_LICENSE_BLOCK_ID]);
    expect(document.blocks[0].mappedPackages).toEqual(["react@19.2.8", "react-dom@19.2.8", "scheduler@0.27.0"]);
    expect(document.blocks[0].licenseText.equals(readFileSync(resolve(repositoryRoot, "node_modules/react/LICENSE")))).toBe(true);
    expect(document.blocks[1].licenseText.equals(readFileSync(resolve(repositoryRoot, "node_modules/vite/LICENSE.md")))).toBe(true);
    expect(parseThirdPartyNotice(bytes).blocks).toHaveLength(2);
  });

  test("fails closed on notice tampering, symlink identity, and metadata placeholders", () => {
    const root = tempManager.create("fictor-notice-fixture-");
    const tampered = join(root, "tampered.txt");
    const bytes = Buffer.from(readFileSync(noticePath));
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(tampered, bytes);
    expect(() => verifyThirdPartyNoticeFile(tampered, repositoryRoot)).toThrow(/NOTICE_HASH|INVALID_NOTICE/);

    const linked = join(root, "linked.txt");
    symlinkSync(noticePath, linked);
    expect(() => verifyThirdPartyNoticeFile(linked, repositoryRoot)).toThrow(/SYMLINK/);

    const placeholder = Buffer.from(readFileSync(noticePath).toString("utf8").replace("package_count: 4", "package_count: PENDING"));
    expect(() => validateThirdPartyNoticeBytes(placeholder)).toThrow(/INVALID_NOTICE|CARDINALITY|NOTICE_HASH/);

    // The source path is a regular file and the installed source check binds
    // each record to the exact bytes, rather than trusting metadata alone.
    expect(readFileSync(noticePath).includes(Buffer.from("source_path: node_modules/vite/LICENSE.md"))).toBe(true);
    expect(readFileSync(noticePath).includes(Buffer.from("source_sha256: "+VITE_LICENSE_SHA256))).toBe(true);
    mkdirSync(join(root, "nested"), { recursive: true });
    copyFileSync(noticePath, join(root, "nested", "copy.txt"));
  });
});
