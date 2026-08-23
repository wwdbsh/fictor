import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { createOwnedTempManager } from "../helpers/owned-temp";

import {
  EVIDENCE_ONLY_PUBLIC_PATHS,
  releasePublicAssetsPlugin,
  stageReleasePublicAssets,
  verifyReleaseDist,
  type ReleasePublicAssetsOptions,
} from "../../scripts/assets/release-public-assets";

const tempManager = createOwnedTempManager("release-public-assets");

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

interface Fixture {
  readonly root: string;
  readonly publicRoot: string;
  readonly manifestPath: string;
  readonly options: ReleasePublicAssetsOptions;
  readonly production: readonly { readonly path: string; readonly bytes: Buffer }[];
}

function makeFixture(): Fixture {
  const root = tempManager.create("fictor-release-fixture-");
  const publicRoot = join(root, "public");
  const manifestPath = join(root, "assets/manifests/t022.json");
  const production = [
    { path: "assets/cards/one.png", bytes: Buffer.from("one") },
    { path: "assets/cards/two.png", bytes: Buffer.from("two") },
  ] as const;
  for (const asset of production) {
    const path = join(publicRoot, asset.path);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, asset.bytes);
  }
  const selectedPath = join(publicRoot, "assets/style/master-candidate-01.png");
  mkdirSync(resolve(selectedPath, ".."), { recursive: true });
  writeFileSync(selectedPath, "selected");
  const legalNotice = Buffer.from("fixture third-party notice\n");
  writeFileSync(join(publicRoot, "THIRD_PARTY_NOTICES.txt"), legalNotice);
  for (const evidencePath of EVIDENCE_ONLY_PUBLIC_PATHS) {
    const path = join(root, evidencePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, `evidence:${evidencePath}`);
  }
  const records = production.map((asset, index) => ({
    id: `fixture-${index + 1}`,
    public_path: `public/${asset.path}`,
    sha256: sha256(asset.bytes),
    bytes: asset.bytes.length,
  }));
  mkdirSync(resolve(manifestPath, ".."), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify({ scope: { audited_asset_count: records.length }, assets: { records } }),
  );
  return {
    root,
    publicRoot,
    manifestPath,
    production,
    options: {
      repositoryRoot: root,
      publicRoot,
      manifestPath,
      selectedStyleSha256: sha256("selected"),
      legalNoticeSha256: sha256(legalNotice),
      legalNoticeBytes: legalNotice.length,
      expectedT022AssetCount: records.length,
      expectedProductionCount: records.length + 1,
    },
  };
}

describe("T060 release public allowlist", () => {
  test("stages the pinned production notice through semantic validation", async () => {
    const staged = await stageReleasePublicAssets();
    try {
      expect(staged.inventory.productionCount).toBe(622);
      expect(staged.inventory.legalNotice.relativePath).toBe("THIRD_PARTY_NOTICES.txt");
      expect(readFileSync(join(staged.stageRoot, staged.inventory.legalNotice.relativePath))).toEqual(
        readFileSync(join(resolve(import.meta.dirname, "../.."), staged.inventory.legalNotice.publicPath)),
      );
    } finally {
      await staged.cleanup();
    }
  }, 15_000);

  test("stages exactly the production allowlist and excludes candidates 02–04", async () => {
    const fixture = makeFixture();
    const staged = await stageReleasePublicAssets(fixture.options);
    try {
      expect(staged.inventory.productionCount).toBe(3);
      expect(staged.inventory.evidenceOnlyCount).toBe(3);
      expect(existsSync(join(staged.stageRoot, "assets/cards/one.png"))).toBe(true);
      expect(existsSync(join(staged.stageRoot, "assets/cards/two.png"))).toBe(true);
      expect(existsSync(join(staged.stageRoot, "assets/style/master-candidate-01.png"))).toBe(true);
      for (const path of EVIDENCE_ONLY_PUBLIC_PATHS) {
        expect(existsSync(join(staged.stageRoot, path.slice("public/".length)))).toBe(false);
      }
      expect(readFileSync(join(staged.stageRoot, "THIRD_PARTY_NOTICES.txt"), "utf8")).toBe("fixture third-party notice\n");
    } finally {
      await staged.cleanup();
    }
    expect(existsSync(staged.stageRoot)).toBe(false);
  });

  test("rejects an unexpected public file before hashing or staging", async () => {
    const fixture = makeFixture();
    const extra = join(fixture.publicRoot, "assets/cards/unexpected.png");
    writeFileSync(extra, "unexpected");
    await expect(stageReleasePublicAssets(fixture.options)).rejects.toThrow(/UNEXPECTED_TREE_ENTRY/);
  });

  test("rejects symlinks and non-canonical manifest paths", async () => {
    const linked = makeFixture();
    const target = join(linked.publicRoot, "assets/cards/one.png");
    const replacement = join(linked.publicRoot, "assets/cards/one-link.png");
    symlinkSync(target, replacement);
    await expect(stageReleasePublicAssets(linked.options)).rejects.toThrow(/UNEXPECTED_TREE_ENTRY|SYMLINK/);

    for (const publicPath of [
      "public/assets/cards/../outside.png",
      "/tmp/outside.png",
      "public/assets/cards/with\0nul.png",
    ]) {
      const fixture = makeFixture();
      const manifest = {
        scope: { audited_asset_count: fixture.production.length },
        assets: {
          records: fixture.production.map((asset, index) => ({
            id: `fixture-${index + 1}`,
            public_path: index === 0 ? publicPath : `public/${asset.path}`,
            sha256: sha256(asset.bytes),
            bytes: asset.bytes.length,
          })),
        },
      };
      writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
      await expect(stageReleasePublicAssets(fixture.options)).rejects.toThrow(
        /TRAVERSAL_PATH|ABSOLUTE_PATH|NUL_PATH/,
      );
    }
  });

  test("rejects source hash drift and a pre-existing destination", async () => {
    const drift = makeFixture();
    writeFileSync(join(drift.publicRoot, "assets/cards/one.png"), "drifted");
    await expect(stageReleasePublicAssets(drift.options)).rejects.toThrow(/SOURCE_(HASH|SIZE)_DRIFT/);

    const collision = makeFixture();
    const stageRoot = tempManager.create("fictor-release-stage-");
    writeFileSync(join(stageRoot, "collision.txt"), "occupied");
    await expect(stageReleasePublicAssets({ ...collision.options, stageRoot })).rejects.toThrow(
      /DESTINATION_COLLISION/,
    );
  });

  test("fails closed for missing, tampered, symlinked, or unexpected legal files", async () => {
    const missing = makeFixture();
    unlinkSync(join(missing.publicRoot, "THIRD_PARTY_NOTICES.txt"));
    await expect(stageReleasePublicAssets(missing.options)).rejects.toThrow(/MISSING_(LEGAL_NOTICE|TREE_ENTRY)/);

    const tampered = makeFixture();
    writeFileSync(join(tampered.publicRoot, "THIRD_PARTY_NOTICES.txt"), "tampered\n");
    await expect(stageReleasePublicAssets(tampered.options)).rejects.toThrow(/LEGAL_(HASH|SIZE)_DRIFT/);

    const linked = makeFixture();
    const legalPath = join(linked.publicRoot, "THIRD_PARTY_NOTICES.txt");
    unlinkSync(legalPath);
    symlinkSync(join(linked.publicRoot, "assets/cards/one.png"), legalPath);
    await expect(stageReleasePublicAssets(linked.options)).rejects.toThrow(/SYMLINK/);

    const unexpected = makeFixture();
    writeFileSync(join(unexpected.publicRoot, "NOTICE.txt"), "unexpected legal file\n");
    await expect(stageReleasePublicAssets(unexpected.options)).rejects.toThrow(/UNEXPECTED_TREE_ENTRY/);

    const distFixture = makeFixture();
    const staged = await stageReleasePublicAssets(distFixture.options);
    const distRoot = tempManager.create("fictor-release-legal-dist-");
    try {
      for (const asset of staged.inventory.assets) {
        const destination = join(distRoot, asset.relativePath);
        mkdirSync(resolve(destination, ".."), { recursive: true });
        writeFileSync(destination, readFileSync(join(staged.stageRoot, asset.relativePath)));
      }
      const legalDestination = join(distRoot, staged.inventory.legalNotice.relativePath);
      mkdirSync(resolve(legalDestination, ".."), { recursive: true });
      writeFileSync(legalDestination, readFileSync(join(staged.stageRoot, staged.inventory.legalNotice.relativePath)));
      writeFileSync(join(distRoot, "OTHER_LICENSES.txt"), "unexpected legal file\n");
      await expect(verifyReleaseDist(distRoot, staged.inventory)).rejects.toThrow(/DIST_UNEXPECTED_LEGAL_FILE/);
    } finally {
      await staged.cleanup();
    }
  });

  test("dist verification accepts exact hashes and rejects an evidence candidate", async () => {
    const fixture = makeFixture();
    const staged = await stageReleasePublicAssets(fixture.options);
    const distRoot = tempManager.create("fictor-release-dist-");
    try {
      for (const asset of staged.inventory.assets) {
        const source = join(staged.stageRoot, asset.relativePath);
        const destination = join(distRoot, asset.relativePath);
        mkdirSync(resolve(destination, ".."), { recursive: true });
        writeFileSync(destination, readFileSync(source));
      }
      const legalDestination = join(distRoot, staged.inventory.legalNotice.relativePath);
      mkdirSync(resolve(legalDestination, ".."), { recursive: true });
      writeFileSync(legalDestination, readFileSync(join(staged.stageRoot, staged.inventory.legalNotice.relativePath)));
      await expect(verifyReleaseDist(distRoot, staged.inventory)).resolves.toBeUndefined();
      const evidence = join(distRoot, EVIDENCE_ONLY_PUBLIC_PATHS[0].slice("public/".length));
      mkdirSync(resolve(evidence, ".."), { recursive: true });
      writeFileSync(evidence, "must-not-ship");
      await expect(verifyReleaseDist(distRoot, staged.inventory)).rejects.toThrow(/DIST_EVIDENCE_ONLY/);
    } finally {
      await staged.cleanup();
    }
  });

  test("keeps dev public behavior and stages only for build", async () => {
    const fixture = makeFixture();
    const plugin = releasePublicAssetsPlugin(fixture.options);
    if (typeof plugin.config !== "function" || typeof plugin.closeBundle !== "function") {
      throw new Error("release plugin hooks are missing");
    }
    const config = plugin.config as (
      value: Record<string, unknown>,
      env: { readonly command: "serve" | "build"; readonly mode: string },
    ) => Promise<Record<string, unknown> | undefined>;
    expect(await config({}, { command: "serve", mode: "development" })).toBeUndefined();
    const buildConfig = await config({}, { command: "build", mode: "production" });
    const stageRoot = buildConfig?.publicDir;
    expect(typeof stageRoot).toBe("string");
    await (plugin.closeBundle as () => Promise<void>)();
    expect(existsSync(stageRoot as string)).toBe(false);
  });
});
