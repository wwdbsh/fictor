import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

import {
  THIRD_PARTY_NOTICE_PUBLIC_PATH,
  THIRD_PARTY_NOTICE_RELATIVE_PATH,
  THIRD_PARTY_NOTICE_BYTES,
  THIRD_PARTY_NOTICE_SHA256,
  validateThirdPartyNoticeBytes,
} from "../legal/third-party-notices";

/**
 * The release public tree is deliberately an allowlist.  The T022 audit is
 * the source of truth for the 621 ordinary PNGs; the approved T012 style
 * candidate is bound separately to its immutable selection hash.
 */
export const T022_MANIFEST_RELATIVE_PATH = "assets/manifests/t022-m2-assets-audit-v1.json" as const;
export const T022_AUDITED_ASSET_COUNT = 621 as const;
export const RELEASE_PNG_COUNT = 622 as const;
export const SELECTED_STYLE_PUBLIC_PATH = "public/assets/style/master-candidate-01.png" as const;
export const SELECTED_STYLE_RELATIVE_PATH = "assets/style/master-candidate-01.png" as const;
export const SELECTED_STYLE_SHA256 =
  "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3" as const;
export const EVIDENCE_ONLY_PUBLIC_PATHS = [
  "public/assets/style/master-candidate-02.png",
  "public/assets/style/master-candidate-03.png",
  "public/assets/style/master-candidate-04.png",
] as const;
export const EVIDENCE_ONLY_RELATIVE_PATHS = EVIDENCE_ONLY_PUBLIC_PATHS.map((path) => path.slice("public/".length));
export const RELEASE_LEGAL_NOTICE_PUBLIC_PATH = THIRD_PARTY_NOTICE_PUBLIC_PATH;
export const RELEASE_LEGAL_NOTICE_RELATIVE_PATH = THIRD_PARTY_NOTICE_RELATIVE_PATH;
export const RELEASE_LEGAL_NOTICE_SHA256 = THIRD_PARTY_NOTICE_SHA256;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PUBLIC_PREFIX = "public/";

export interface ReleasePublicAsset {
  readonly id: string;
  readonly publicPath: string;
  readonly relativePath: string;
  readonly sourcePath: string;
  readonly sha256: string;
  readonly bytes?: number;
}

export interface ReleaseLegalNotice {
  readonly publicPath: string;
  readonly relativePath: string;
  readonly sourcePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ReleasePublicInventory {
  readonly assets: readonly ReleasePublicAsset[];
  readonly legalNotice: ReleaseLegalNotice;
  readonly productionPaths: readonly string[];
  readonly evidenceOnlyPaths: readonly string[];
  readonly productionCount: number;
  readonly evidenceOnlyCount: number;
}

export interface ReleasePublicAssetsOptions {
  /** Repository root. Defaults to the current project root. */
  readonly repositoryRoot?: string;
  /** Public source root. Defaults to `<repositoryRoot>/public`. */
  readonly publicRoot?: string;
  /** Tracked T022 manifest path. Defaults to the pinned repository path. */
  readonly manifestPath?: string;
  /** Test-only/isolated fixture override for the selected style path. */
  readonly selectedStylePublicPath?: string;
  /** Test-only/isolated fixture override for the selected style hash. */
  readonly selectedStyleSha256?: string;
  /** Test-only/isolated fixture override for the evidence-only paths. */
  readonly evidenceOnlyPublicPaths?: readonly string[];
  /** Test-only/isolated fixture override for the T022 record count. */
  readonly expectedT022AssetCount?: number;
  /** Test-only/isolated fixture override for the final production count. */
  readonly expectedProductionCount?: number;
  /** Test-only destination used by focused tests; normal builds use mkdtemp. */
  readonly stageRoot?: string;
  /** Test-only parent used for owned mkdtemp staging. */
  readonly stageParent?: string;
  /** Test-only override for the single legal artifact path. */
  readonly legalNoticePublicPath?: string;
  /** Test-only override for the legal artifact hash. */
  readonly legalNoticeSha256?: string;
  /** Test-only override for the legal artifact byte count. */
  readonly legalNoticeBytes?: number;
}

export interface StagedReleasePublicAssets {
  readonly stageRoot: string;
  readonly inventory: ReleasePublicInventory;
  readonly owned: boolean;
  readonly cleanup: () => Promise<void>;
}

interface RawManifestRecord {
  readonly id?: unknown;
  readonly public_path?: unknown;
  readonly sha256?: unknown;
  readonly bytes?: unknown;
}

interface RawManifest {
  readonly scope?: { readonly audited_asset_count?: unknown };
  readonly assets?: { readonly records?: unknown };
}

interface OwnedStageIdentity {
  readonly dev: number;
  readonly ino: number;
}

function fail(code: string, detail?: string): Error {
  const suffix = detail ? `:${detail}` : "";
  const error = new Error(`RELEASE_PUBLIC_ASSETS_${code}${suffix}`);
  Object.defineProperty(error, "stack", { configurable: true, value: error.message });
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safePathDetail(value: string): string {
  // Do not echo NULs or control characters into diagnostics.
  return value.replace(/[\u0000-\u001f\u007f]/g, "?").slice(-160);
}

function pathError(code: string, value: string): Error {
  return fail(code, safePathDetail(value));
}

function assertRegularHash(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw fail(code);
}

/**
 * Validate a repository-relative public path without ever normalizing an
 * unsafe path into a different destination.  Backslashes are rejected so a
 * manifest cannot have host-dependent Windows/POSIX meaning.
 */
export function validateReleasePublicPath(value: unknown, field = "public_path"): string {
  if (typeof value !== "string") throw fail("INVALID_MANIFEST_PATH", field);
  if (value.includes("\0")) throw pathError("NUL_PATH", value);
  if (/^[\\/]/.test(value) || /^[A-Za-z]:/.test(value)) {
    throw pathError("ABSOLUTE_PATH", value);
  }
  if (value.includes("\\")) throw pathError("INVALID_MANIFEST_PATH", value);
  if (!value.startsWith(PUBLIC_PREFIX)) throw pathError("INVALID_MANIFEST_PATH", value);
  if (!value.endsWith(".png")) throw pathError("INVALID_MANIFEST_PATH", value);

  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw pathError(segments.includes("..") ? "TRAVERSAL_PATH" : "INVALID_MANIFEST_PATH", value);
  }
  const normalized = posix.normalize(value);
  if (normalized !== value || normalized.startsWith("../") || normalized === "..") {
    throw pathError("TRAVERSAL_PATH", value);
  }
  return value.slice(PUBLIC_PREFIX.length);
}

/** Validate the one non-PNG release file without allowing path aliases. */
export function validateReleaseLegalNoticePath(value: unknown, field = "legal_notice_path"): string {
  if (typeof value !== "string") throw fail("INVALID_LEGAL_PATH", field);
  if (value.includes("\0")) throw pathError("NUL_PATH", value);
  if (/^[\\/]/.test(value) || /^[A-Za-z]:/.test(value)) throw pathError("ABSOLUTE_PATH", value);
  if (value.includes("\\") || !value.startsWith(PUBLIC_PREFIX) || !value.endsWith(".txt")) {
    throw pathError("INVALID_LEGAL_PATH", value);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw pathError(segments.includes("..") ? "TRAVERSAL_PATH" : "INVALID_LEGAL_PATH", value);
  }
  const normalized = posix.normalize(value);
  if (normalized !== value || normalized.startsWith("../") || normalized === "..") throw pathError("TRAVERSAL_PATH", value);
  return value.slice(PUBLIC_PREFIX.length);
}

function resolveExpectedPath(root: string, relativePath: string): string {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, ...relativePath.split("/"));
  const rootWithSeparator = absoluteRoot.endsWith(sep) ? absoluteRoot : `${absoluteRoot}${sep}`;
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(rootWithSeparator)) {
    throw pathError("TRAVERSAL_PATH", relativePath);
  }
  return absolutePath;
}

function parseManifestBytes(bytes: Uint8Array): RawManifest {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (!isRecord(parsed)) throw fail("INVALID_MANIFEST");
    return parsed as RawManifest;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("RELEASE_PUBLIC_ASSETS_")) throw error;
    throw fail("INVALID_MANIFEST");
  }
}

function buildInventoryFromManifest(
  manifest: RawManifest,
  options: Required<Pick<ReleasePublicAssetsOptions, "repositoryRoot" | "publicRoot">> &
    ReleasePublicAssetsOptions,
): ReleasePublicInventory {
  const records = manifest.assets?.records;
  if (!Array.isArray(records)) throw fail("INVALID_MANIFEST_RECORDS");
  const expectedT022Count = options.expectedT022AssetCount ?? T022_AUDITED_ASSET_COUNT;
  if (records.length !== expectedT022Count) throw fail("T022_COUNT", String(records.length));
  if (
    manifest.scope?.audited_asset_count !== undefined &&
    manifest.scope.audited_asset_count !== records.length
  ) {
    throw fail("T022_SCOPE_COUNT");
  }

  const assets: ReleasePublicAsset[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  const evidenceOnlyPaths = (options.evidenceOnlyPublicPaths ?? EVIDENCE_ONLY_PUBLIC_PATHS).map((path) => {
    const relativePath = validateReleasePublicPath(path, "evidence_only_path");
    return relativePath;
  });
  if (new Set(evidenceOnlyPaths).size !== evidenceOnlyPaths.length) throw fail("DUPLICATE_EVIDENCE_PATH");

  for (const [index, value] of records.entries()) {
    if (!isRecord(value)) throw fail("INVALID_MANIFEST_RECORD", String(index));
    const record = value as RawManifestRecord;
    if (typeof record.id !== "string" || record.id.length === 0 || record.id.includes("\0")) {
      throw fail("INVALID_MANIFEST_ID", String(index));
    }
    if (ids.has(record.id)) throw fail("DUPLICATE_ID", safePathDetail(record.id));
    ids.add(record.id);
    const relativePath = validateReleasePublicPath(record.public_path, "public_path");
    if (paths.has(relativePath)) throw pathError("DUPLICATE_PATH", relativePath);
    if (evidenceOnlyPaths.includes(relativePath)) throw pathError("DESTINATION_COLLISION", relativePath);
    paths.add(relativePath);
    assertRegularHash(record.sha256, "INVALID_SOURCE_HASH");
    if (record.bytes !== undefined && (typeof record.bytes !== "number" || !Number.isSafeInteger(record.bytes) || record.bytes < 0)) {
      throw fail("INVALID_SOURCE_BYTES", String(index));
    }
    assets.push({
      id: record.id,
      publicPath: record.public_path as string,
      relativePath,
      sourcePath: resolveExpectedPath(options.publicRoot, relativePath),
      sha256: record.sha256,
      ...(record.bytes === undefined ? {} : { bytes: record.bytes }),
    });
  }

  const selectedPublicPath = options.selectedStylePublicPath ?? SELECTED_STYLE_PUBLIC_PATH;
  const selectedRelativePath = validateReleasePublicPath(selectedPublicPath, "selected_style_path");
  assertRegularHash(options.selectedStyleSha256 ?? SELECTED_STYLE_SHA256, "INVALID_SELECTED_STYLE_HASH");
  if (paths.has(selectedRelativePath)) throw pathError("DESTINATION_COLLISION", selectedRelativePath);
  if (evidenceOnlyPaths.includes(selectedRelativePath)) throw pathError("DESTINATION_COLLISION", selectedRelativePath);

  assets.push({
    id: "style/master-candidate-01",
    publicPath: selectedPublicPath,
    relativePath: selectedRelativePath,
    sourcePath: resolveExpectedPath(options.publicRoot, selectedRelativePath),
    sha256: options.selectedStyleSha256 ?? SELECTED_STYLE_SHA256,
  });

  const legalPublicPath = options.legalNoticePublicPath ?? RELEASE_LEGAL_NOTICE_PUBLIC_PATH;
  const legalRelativePath = validateReleaseLegalNoticePath(legalPublicPath);
  const legalSha256 = options.legalNoticeSha256 ?? RELEASE_LEGAL_NOTICE_SHA256;
  assertRegularHash(legalSha256, "INVALID_LEGAL_HASH");
  if (paths.has(legalRelativePath) || evidenceOnlyPaths.includes(legalRelativePath)) {
    throw pathError("DESTINATION_COLLISION", legalRelativePath);
  }
  const legalBytes = options.legalNoticeBytes ?? THIRD_PARTY_NOTICE_BYTES;
  if (!Number.isSafeInteger(legalBytes) || legalBytes < 1) throw fail("INVALID_LEGAL_BYTES");
  const legalNotice: ReleaseLegalNotice = {
    publicPath: legalPublicPath,
    relativePath: legalRelativePath,
    sourcePath: resolveExpectedPath(options.publicRoot, legalRelativePath),
    sha256: legalSha256,
    bytes: legalBytes,
  };

  const sortedAssets = [...assets].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const productionPaths = sortedAssets.map(({ relativePath }) => relativePath);
  const expectedProductionCount = options.expectedProductionCount ?? RELEASE_PNG_COUNT;
  if (sortedAssets.length !== expectedProductionCount) throw fail("PRODUCTION_COUNT", String(sortedAssets.length));
  return {
    assets: sortedAssets,
    legalNotice,
    productionPaths,
    evidenceOnlyPaths: [...evidenceOnlyPaths].sort((a, b) => a.localeCompare(b)),
    productionCount: sortedAssets.length,
    evidenceOnlyCount: evidenceOnlyPaths.length,
  };
}

/** Build the deterministic production inventory without touching PNG bytes. */
export async function buildReleaseInventory(options: ReleasePublicAssetsOptions = {}): Promise<ReleasePublicInventory> {
  const repositoryRoot = options.repositoryRoot
    ? resolve(options.repositoryRoot)
    : resolve(import.meta.dirname, "../..");
  const publicRoot = resolve(options.publicRoot ?? join(repositoryRoot, "public"));
  const manifestPath = resolve(options.manifestPath ?? join(repositoryRoot, T022_MANIFEST_RELATIVE_PATH));
  let bytes: Uint8Array;
  try {
    const stat = await lstat(manifestPath);
    if (stat.isSymbolicLink()) throw fail("SYMLINK", "manifest");
    if (!stat.isFile()) throw fail("INVALID_ENTRY_TYPE", "manifest");
    bytes = await readFile(manifestPath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("RELEASE_PUBLIC_ASSETS_")) throw error;
    throw fail("MISSING_MANIFEST");
  }
  const manifest = parseManifestBytes(bytes);
  return buildInventoryFromManifest(manifest, {
    ...options,
    repositoryRoot,
    publicRoot,
  });
}

async function assertDirectory(path: string, code: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    throw fail("MISSING_PUBLIC_ROOT");
  }
  if (stat.isSymbolicLink()) throw fail("SYMLINK", code);
  if (!stat.isDirectory()) throw fail("INVALID_ENTRY_TYPE", code);
}

function hasAllowedPrefix(path: string, allowedPaths: ReadonlySet<string>): boolean {
  for (const expected of allowedPaths) {
    if (expected === path || expected.startsWith(`${path}/`)) return true;
  }
  return false;
}

interface TreeScanOptions {
  readonly expectedFiles: ReadonlyMap<string, unknown>;
  readonly evidenceOnlyPaths: ReadonlySet<string>;
  readonly hashExpectedFiles: boolean;
  readonly rootCode: string;
}

interface TreeScanResult {
  readonly files: readonly string[];
}

async function scanExactTree(root: string, options: TreeScanOptions): Promise<TreeScanResult> {
  await assertDirectory(root, options.rootCode);
  const seenFiles = new Set<string>();

  async function visit(current: string, currentRelative: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      throw fail("READ_DIRECTORY", currentRelative || options.rootCode);
    }
    for (const entry of entries) {
      const childRelative = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;
      // Names from the filesystem are also treated as path input. This keeps
      // a hostile fixture from obtaining host-dependent traversal semantics.
      if (childRelative.includes("\0") || childRelative.includes("\\")) throw pathError("INVALID_TREE_PATH", childRelative);
      const child = join(current, entry.name);
      let stat;
      try {
        stat = await lstat(child);
      } catch {
        throw fail("MISSING_TREE_ENTRY", childRelative);
      }
      if (stat.isSymbolicLink()) throw pathError("SYMLINK", childRelative);
      if (stat.isDirectory()) {
        if (!hasAllowedPrefix(childRelative, new Set([...options.expectedFiles.keys(), ...options.evidenceOnlyPaths]))) {
          throw pathError("UNEXPECTED_TREE_ENTRY", childRelative);
        }
        await visit(child, childRelative);
        continue;
      }
      if (!stat.isFile()) throw pathError("INVALID_ENTRY_TYPE", childRelative);
      if (options.expectedFiles.has(childRelative)) {
        if (seenFiles.has(childRelative)) throw pathError("DUPLICATE_PATH", childRelative);
        seenFiles.add(childRelative);
        continue;
      }
      if (options.evidenceOnlyPaths.has(childRelative)) {
        // Evidence-only candidates are deliberately lstat'd but never opened,
        // hashed, or copied by the production selection path.
        continue;
      }
      throw pathError("UNEXPECTED_TREE_ENTRY", childRelative);
    }
  }

  await visit(root, "");
  const expected = [...options.expectedFiles.keys()];
  for (const path of expected) if (!seenFiles.has(path)) throw pathError("MISSING_TREE_ENTRY", path);
  return { files: [...seenFiles].sort((a, b) => a.localeCompare(b)) };
}

async function verifyEvidencePaths(publicRoot: string, paths: readonly string[]): Promise<void> {
  for (const relativePath of paths) {
    const absolutePath = resolveExpectedPath(publicRoot, relativePath);
    let stat;
    try {
      stat = await lstat(absolutePath);
    } catch {
      throw pathError("MISSING_EVIDENCE_PATH", relativePath);
    }
    if (stat.isSymbolicLink()) throw pathError("SYMLINK", relativePath);
    if (!stat.isFile()) throw pathError("INVALID_ENTRY_TYPE", relativePath);
  }
}

async function hashFile(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    const stream = createReadStream(path);
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      hash.update(buffer);
    }
  } catch {
    throw fail("READ_PNG", safePathDetail(path));
  }
  return { sha256: hash.digest("hex"), bytes };
}

async function verifySourceAsset(asset: ReleasePublicAsset): Promise<void> {
  let stat;
  try {
    stat = await lstat(asset.sourcePath);
  } catch {
    throw pathError("MISSING_SOURCE", asset.relativePath);
  }
  if (stat.isSymbolicLink()) throw pathError("SYMLINK", asset.relativePath);
  if (!stat.isFile()) throw pathError("INVALID_ENTRY_TYPE", asset.relativePath);
  const actual = await hashFile(asset.sourcePath);
  if (asset.bytes !== undefined && actual.bytes !== asset.bytes) throw pathError("SOURCE_SIZE_DRIFT", asset.relativePath);
  if (actual.sha256 !== asset.sha256) throw pathError("SOURCE_HASH_DRIFT", asset.relativePath);
}

async function verifyLegalNoticeSource(asset: ReleaseLegalNotice): Promise<void> {
  let stat;
  try {
    stat = await lstat(asset.sourcePath);
  } catch {
    throw pathError("MISSING_LEGAL_NOTICE", asset.relativePath);
  }
  if (stat.isSymbolicLink()) throw pathError("SYMLINK", asset.relativePath);
  if (!stat.isFile()) throw pathError("INVALID_ENTRY_TYPE", asset.relativePath);
  const actual = await hashFile(asset.sourcePath);
  if (actual.bytes !== asset.bytes) throw pathError("LEGAL_SIZE_DRIFT", asset.relativePath);
  if (actual.sha256 !== asset.sha256) throw pathError("LEGAL_HASH_DRIFT", asset.relativePath);
  // Production uses the generated T059 artifact. Isolated tests may provide
  // a fixture hash/size, in which case the PNG staging contract remains the
  // only concern and the fixture need not carry the full 115 KiB license.
  if (asset.publicPath === RELEASE_LEGAL_NOTICE_PUBLIC_PATH && asset.sha256 === RELEASE_LEGAL_NOTICE_SHA256) {
    try {
      validateThirdPartyNoticeBytes(await readFile(asset.sourcePath));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("THIRD_PARTY_NOTICES_")) {
        throw fail("LEGAL_NOTICE_INVALID", error.message);
      }
      throw error;
    }
  }
}

async function verifyStagedAsset(stageRoot: string, asset: ReleasePublicAsset): Promise<void> {
  const stagePath = resolveExpectedPath(stageRoot, asset.relativePath);
  let stat;
  try {
    stat = await lstat(stagePath);
  } catch {
    throw pathError("MISSING_STAGED_ENTRY", asset.relativePath);
  }
  if (stat.isSymbolicLink()) throw pathError("SYMLINK", asset.relativePath);
  if (!stat.isFile()) throw pathError("INVALID_ENTRY_TYPE", asset.relativePath);
  const actual = await hashFile(stagePath);
  if (asset.bytes !== undefined && actual.bytes !== asset.bytes) throw pathError("STAGED_SIZE_DRIFT", asset.relativePath);
  if (actual.sha256 !== asset.sha256) throw pathError("STAGED_HASH_DRIFT", asset.relativePath);
}

async function verifyStagedLegalNotice(stageRoot: string, asset: ReleaseLegalNotice): Promise<void> {
  const stagePath = resolveExpectedPath(stageRoot, asset.relativePath);
  let stat;
  try {
    stat = await lstat(stagePath);
  } catch {
    throw pathError("MISSING_STAGED_LEGAL_NOTICE", asset.relativePath);
  }
  if (stat.isSymbolicLink()) throw pathError("SYMLINK", asset.relativePath);
  if (!stat.isFile()) throw pathError("INVALID_ENTRY_TYPE", asset.relativePath);
  const actual = await hashFile(stagePath);
  if (actual.bytes !== asset.bytes) throw pathError("STAGED_LEGAL_SIZE_DRIFT", asset.relativePath);
  if (actual.sha256 !== asset.sha256) throw pathError("STAGED_LEGAL_HASH_DRIFT", asset.relativePath);
}

async function captureStageIdentity(path: string): Promise<OwnedStageIdentity> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw fail("SYMLINK", "stage");
  if (!stat.isDirectory()) throw fail("INVALID_ENTRY_TYPE", "stage");
  return { dev: stat.dev, ino: stat.ino };
}

async function cleanupOwnedStage(path: string, identity: OwnedStageIdentity): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) throw fail("STAGE_IDENTITY_CHANGED");
  if (!stat.isDirectory() || stat.dev !== identity.dev || stat.ino !== identity.ino) {
    throw fail("STAGE_IDENTITY_CHANGED");
  }
  await rm(path, { recursive: true, force: true });
}

async function ensureEmptyStageRoot(path: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    await mkdir(path, { recursive: false });
    return;
  }
  if (stat.isSymbolicLink()) throw fail("SYMLINK", "stage");
  if (!stat.isDirectory()) throw fail("INVALID_ENTRY_TYPE", "stage");
  const entries = await readdir(path);
  if (entries.length > 0) throw fail("DESTINATION_COLLISION", "stage");
}

/**
 * Verify the source tree, stream-copy the exact allowlist, then verify every
 * staged path and hash before returning it to Vite. Candidate 02–04 are only
 * metadata-scanned as evidence paths and are never opened by this function.
 */
export async function stageReleasePublicAssets(
  options: ReleasePublicAssetsOptions = {},
): Promise<StagedReleasePublicAssets> {
  const repositoryRoot = options.repositoryRoot
    ? resolve(options.repositoryRoot)
    : resolve(import.meta.dirname, "../..");
  const publicRoot = resolve(options.publicRoot ?? join(repositoryRoot, "public"));
  const inventory = await buildReleaseInventory({ ...options, repositoryRoot, publicRoot });
  const expectedFiles = new Map<string, unknown>(inventory.assets.map((asset) => [asset.relativePath, asset]));
  expectedFiles.set(inventory.legalNotice.relativePath, inventory.legalNotice);
  const evidenceOnly = new Set(inventory.evidenceOnlyPaths);
  await scanExactTree(publicRoot, {
    expectedFiles,
    evidenceOnlyPaths: evidenceOnly,
    hashExpectedFiles: false,
    rootCode: "public",
  });
  await verifyEvidencePaths(publicRoot, inventory.evidenceOnlyPaths);

  for (const asset of inventory.assets) await verifySourceAsset(asset);
  await verifyLegalNoticeSource(inventory.legalNotice);

  const suppliedStage = options.stageRoot !== undefined;
  let stageRoot: string;
  let owned = false;
  let identity: OwnedStageIdentity;
  if (suppliedStage) {
    stageRoot = resolve(options.stageRoot!);
    await ensureEmptyStageRoot(stageRoot);
    identity = await captureStageIdentity(stageRoot);
  } else {
    const parent = resolve(options.stageParent ?? tmpdir());
    await assertDirectory(parent, "stage_parent");
    stageRoot = await mkdtemp(join(parent, "fictor-release-public-"));
    identity = await captureStageIdentity(stageRoot);
    owned = true;
  }

  const cleanup = async (): Promise<void> => {
    if (owned) await cleanupOwnedStage(stageRoot, identity);
  };

  try {
    for (const asset of inventory.assets) {
      let sourceStat;
      try {
        sourceStat = await lstat(asset.sourcePath);
      } catch {
        throw pathError("MISSING_SOURCE", asset.relativePath);
      }
      if (sourceStat.isSymbolicLink()) throw pathError("SYMLINK", asset.relativePath);
      if (!sourceStat.isFile()) throw pathError("INVALID_ENTRY_TYPE", asset.relativePath);
      const destination = resolveExpectedPath(stageRoot, asset.relativePath);
      try {
        await lstat(destination);
        throw pathError("DESTINATION_COLLISION", asset.relativePath);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("RELEASE_PUBLIC_ASSETS_DESTINATION_COLLISION")) throw error;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw fail("DESTINATION_STAT", asset.relativePath);
      }
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(asset.sourcePath, destination);
    }
    const legalDestination = resolveExpectedPath(stageRoot, inventory.legalNotice.relativePath);
    try {
      await lstat(legalDestination);
      throw pathError("DESTINATION_COLLISION", inventory.legalNotice.relativePath);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("RELEASE_PUBLIC_ASSETS_DESTINATION_COLLISION")) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw fail("DESTINATION_STAT", inventory.legalNotice.relativePath);
    }
    await mkdir(dirname(legalDestination), { recursive: true });
    await copyFile(inventory.legalNotice.sourcePath, legalDestination);

    const stagedMap = new Map<string, unknown>(inventory.assets.map((asset) => [asset.relativePath, asset]));
    stagedMap.set(inventory.legalNotice.relativePath, inventory.legalNotice);
    await scanExactTree(stageRoot, {
      expectedFiles: stagedMap,
      evidenceOnlyPaths: new Set(),
      hashExpectedFiles: true,
      rootCode: "stage",
    });
    for (const asset of inventory.assets) await verifyStagedAsset(stageRoot, asset);
    await verifyStagedLegalNotice(stageRoot, inventory.legalNotice);
    return { stageRoot, inventory, owned, cleanup };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "RELEASE_PUBLIC_ASSETS_STAGE_FAILED");
    }
    throw error;
  }
}

function isUnexpectedLegalArtifactPath(relativePath: string, expectedLegalPath: string): boolean {
  if (relativePath === expectedLegalPath) return false;
  const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1).toLowerCase();
  return basename.endsWith(".txt") || /^(?:third[-_ ]party[-_ ]notice(?:s)?|notice(?:s)?|license(?:s)?|copying)(?:[._-].*)?$/.test(basename);
}

async function verifyReleaseOutputTree(distRoot: string, inventory: ReleasePublicInventory): Promise<void> {
  const expected = new Map(inventory.assets.map((asset) => [asset.relativePath, asset]));
  const seen = new Set<string>();
  let legalSeen = false;
  await assertDirectory(distRoot, "dist");

  async function visit(current: string, currentRelative: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;
      const child = join(current, entry.name);
      const stat = await lstat(child);
      if (stat.isSymbolicLink()) throw pathError("DIST_SYMLINK", childRelative);
      if (stat.isDirectory()) {
        await visit(child, childRelative);
        continue;
      }
      if (!stat.isFile()) throw pathError("DIST_ENTRY_TYPE", childRelative);
      if (childRelative === inventory.legalNotice.relativePath) {
        if (legalSeen) throw pathError("DIST_DUPLICATE_LEGAL_NOTICE", childRelative);
        legalSeen = true;
        const actual = await hashFile(child);
        if (actual.bytes !== inventory.legalNotice.bytes) throw pathError("DIST_LEGAL_SIZE_DRIFT", childRelative);
        if (actual.sha256 !== inventory.legalNotice.sha256) throw pathError("DIST_LEGAL_HASH_DRIFT", childRelative);
        continue;
      }
      if (isUnexpectedLegalArtifactPath(childRelative, inventory.legalNotice.relativePath)) {
        throw pathError("DIST_UNEXPECTED_LEGAL_FILE", childRelative);
      }
      if (!childRelative.endsWith(".png")) continue;
      if (inventory.evidenceOnlyPaths.includes(childRelative)) throw pathError("DIST_EVIDENCE_ONLY", childRelative);
      const asset = expected.get(childRelative);
      if (!asset) throw pathError("DIST_UNEXPECTED_PNG", childRelative);
      if (seen.has(childRelative)) throw pathError("DIST_DUPLICATE_PATH", childRelative);
      seen.add(childRelative);
      const actual = await hashFile(child);
      if (asset.bytes !== undefined && actual.bytes !== asset.bytes) throw pathError("DIST_SIZE_DRIFT", childRelative);
      if (actual.sha256 !== asset.sha256) throw pathError("DIST_HASH_DRIFT", childRelative);
    }
  }
  await visit(distRoot, "");
  for (const asset of inventory.assets) if (!seen.has(asset.relativePath)) throw pathError("DIST_MISSING_PNG", asset.relativePath);
  if (!legalSeen) throw pathError("DIST_MISSING_LEGAL_NOTICE", inventory.legalNotice.relativePath);
  if (seen.size !== RELEASE_PNG_COUNT && seen.size !== inventory.productionCount) {
    throw fail("DIST_PNG_COUNT", String(seen.size));
  }
}

/** Deterministic verification entry point for an already-written dist tree. */
export async function verifyReleaseDist(
  distRoot: string,
  inventory: ReleasePublicInventory,
): Promise<void> {
  await verifyReleaseOutputTree(resolve(distRoot), inventory);
}

/**
 * Vite integration. Serve mode leaves Vite's normal `public/` behavior
 * untouched. Build mode stages the allowlist before Vite resolves `publicDir`,
 * verifies dist in closeBundle, and cleans its unique staging directory on
 * both successful and failed builds.
 */
export function releasePublicAssetsPlugin(options: ReleasePublicAssetsOptions = {}): Plugin {
  let staged: StagedReleasePublicAssets | undefined;
  let resolvedConfig: ResolvedConfig | undefined;
  let buildFailed = false;
  let cleaned = false;

  async function cleanup(): Promise<void> {
    if (cleaned || !staged) return;
    cleaned = true;
    await staged.cleanup();
  }

  return {
    name: "fictor-release-public-assets",
    enforce: "pre",
    async config(_config, env) {
      if (env.command !== "build") return;
      staged = await stageReleasePublicAssets(options);
      return { publicDir: staged.stageRoot };
    },
    configResolved(config) {
      resolvedConfig = config;
    },
    async buildEnd(error) {
      if (error) {
        buildFailed = true;
        await cleanup();
      }
    },
    async closeBundle() {
      try {
        if (staged && resolvedConfig && !buildFailed) {
          const outputRoot = resolve(resolvedConfig.root, resolvedConfig.build.outDir);
          await verifyReleaseDist(outputRoot, staged.inventory);
        }
      } finally {
        await cleanup();
      }
    },
  };
}
