import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * T059 keeps the legal surface as one generated, separately-addressable file.
 * The generator is the only place that reads installed package license bytes;
 * the Vite release hook only validates and copies the resulting artifact.
 */
export const THIRD_PARTY_NOTICE_RELATIVE_PATH = "THIRD_PARTY_NOTICES.txt" as const;
export const THIRD_PARTY_NOTICE_PUBLIC_PATH = `public/${THIRD_PARTY_NOTICE_RELATIVE_PATH}` as const;
export const THIRD_PARTY_NOTICE_FORMAT = "FICTOR-THIRD-PARTY-NOTICES/1" as const;
export const PACKAGE_LOCK_RELATIVE_PATH = "package-lock.json" as const;
export const PACKAGE_LOCK_SHA256 =
  "13471a5f8fefa27551d342f9c0d45863cad31677557f528d7039524ff4abe6c4" as const;

export const REACT_LICENSE_BLOCK_ID = "react-mit-canonical-v1" as const;
export const VITE_LICENSE_BLOCK_ID = "vite-mit-full-v1" as const;
export const REACT_LICENSE_SHA256 =
  "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93" as const;
export const VITE_LICENSE_SHA256 =
  "387dd7baa307083401a27c58c362c30832f5ba1dba84f10cc22c33401523f45c" as const;
export const REACT_LICENSE_SOURCE_BYTES = 1_088 as const;
export const VITE_LICENSE_SOURCE_BYTES = 112_425 as const;

/** Set after the first deterministic generation; it binds the shipped artifact. */
export const THIRD_PARTY_NOTICE_SHA256 =
  "eb74e08cf7c0f51294ae2df39874ae9d11b22729615401aa5a4777f80e460703" as const;
export const THIRD_PARTY_NOTICE_BYTES = 115_480 as const;

export interface ThirdPartyNoticePackage {
  readonly name: "react" | "react-dom" | "scheduler" | "vite";
  readonly version: string;
  readonly lockfilePackagePath: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly license: "MIT";
  readonly licenseBlock: typeof REACT_LICENSE_BLOCK_ID | typeof VITE_LICENSE_BLOCK_ID;
}

export interface ThirdPartyNoticeBlock {
  readonly id: typeof REACT_LICENSE_BLOCK_ID | typeof VITE_LICENSE_BLOCK_ID;
  readonly mappedPackages: readonly string[];
  readonly sourcePaths: readonly string[];
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly licenseText: Buffer;
}

export interface ThirdPartyNoticeDocument {
  readonly format: typeof THIRD_PARTY_NOTICE_FORMAT;
  readonly packageLockPath: typeof PACKAGE_LOCK_RELATIVE_PATH;
  readonly packageLockSha256: typeof PACKAGE_LOCK_SHA256;
  readonly packages: readonly ThirdPartyNoticePackage[];
  readonly blocks: readonly ThirdPartyNoticeBlock[];
}

interface PackageSpec {
  readonly name: ThirdPartyNoticePackage["name"];
  readonly lockfilePackagePath: string;
  readonly sourcePath: string;
  readonly expectedVersion: string;
  readonly expectedSourceSha256: string;
  readonly expectedSourceBytes: number;
  readonly licenseBlock: ThirdPartyNoticePackage["licenseBlock"];
}

const PACKAGE_SPECS: readonly PackageSpec[] = [
  {
    name: "react",
    lockfilePackagePath: "node_modules/react",
    sourcePath: "node_modules/react/LICENSE",
    expectedVersion: "19.2.8",
    expectedSourceSha256: REACT_LICENSE_SHA256,
    expectedSourceBytes: REACT_LICENSE_SOURCE_BYTES,
    licenseBlock: REACT_LICENSE_BLOCK_ID,
  },
  {
    name: "react-dom",
    lockfilePackagePath: "node_modules/react-dom",
    sourcePath: "node_modules/react-dom/LICENSE",
    expectedVersion: "19.2.8",
    expectedSourceSha256: REACT_LICENSE_SHA256,
    expectedSourceBytes: REACT_LICENSE_SOURCE_BYTES,
    licenseBlock: REACT_LICENSE_BLOCK_ID,
  },
  {
    name: "scheduler",
    lockfilePackagePath: "node_modules/scheduler",
    sourcePath: "node_modules/scheduler/LICENSE",
    expectedVersion: "0.27.0",
    expectedSourceSha256: REACT_LICENSE_SHA256,
    expectedSourceBytes: REACT_LICENSE_SOURCE_BYTES,
    licenseBlock: REACT_LICENSE_BLOCK_ID,
  },
  {
    name: "vite",
    lockfilePackagePath: "node_modules/vite",
    sourcePath: "node_modules/vite/LICENSE.md",
    expectedVersion: "8.2.1",
    expectedSourceSha256: VITE_LICENSE_SHA256,
    expectedSourceBytes: VITE_LICENSE_SOURCE_BYTES,
    licenseBlock: VITE_LICENSE_BLOCK_ID,
  },
] as const;

// Angle brackets are valid in copyright e-mail addresses and URLs in Vite's
// license, so placeholder detection is deliberately limited to sentinel
// words rather than a broad `<...>` pattern.
const PLACEHOLDER_PATTERN = /(?:TODO|TBD|PENDING|UNKNOWN|PLACEHOLDER|INSERT[_ -]?HERE)/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function failure(code: string, detail?: string): Error {
  const suffix = detail ? `:${detail.replace(/[\u0000-\u001f\u007f]/g, "?").slice(-160)}` : "";
  const error = new Error(`THIRD_PARTY_NOTICES_${code}${suffix}`);
  Object.defineProperty(error, "stack", { configurable: true, value: error.message });
  return error;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function repositoryPath(repositoryRoot: string, relativePath: string): string {
  return resolve(repositoryRoot, ...relativePath.split("/"));
}

function readRegularFile(repositoryRoot: string, relativePath: string, code: string): Buffer {
  const path = repositoryPath(repositoryRoot, relativePath);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw failure("MISSING_SOURCE", relativePath);
  }
  if (stat.isSymbolicLink()) throw failure("SYMLINK", relativePath);
  if (!stat.isFile()) throw failure("INVALID_ENTRY_TYPE", relativePath);
  try {
    return readFileSync(path);
  } catch {
    throw failure(code, relativePath);
  }
}

function assertLfAndText(bytes: Buffer, code: string): void {
  if (bytes.includes(0)) throw failure(code, "NUL");
  if (bytes.includes(13)) throw failure(code, "CRLF");
  if (!bytes.toString("utf8").endsWith("\n")) throw failure(code, "NO_FINAL_LF");
}

function assertNoPlaceholder(value: string, code: string): void {
  if (PLACEHOLDER_PATTERN.test(value)) throw failure(code);
}

function parsePackageLock(repositoryRoot: string): { readonly bytes: Buffer; readonly json: Record<string, unknown> } {
  const bytes = readRegularFile(repositoryRoot, PACKAGE_LOCK_RELATIVE_PATH, "READ_LOCKFILE");
  assertLfAndText(bytes, "INVALID_LOCKFILE_BYTES");
  if (sha256(bytes) !== PACKAGE_LOCK_SHA256) throw failure("LOCKFILE_HASH", sha256(bytes));
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw failure("INVALID_LOCKFILE_JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw failure("INVALID_LOCKFILE_JSON");
  return { bytes, json: parsed as Record<string, unknown> };
}

function lockPackageRecord(lock: Record<string, unknown>, path: string): Record<string, unknown> {
  const packages = lock.packages;
  if (typeof packages !== "object" || packages === null || Array.isArray(packages)) throw failure("INVALID_LOCKFILE_PACKAGES");
  const record = (packages as Record<string, unknown>)[path];
  if (typeof record !== "object" || record === null || Array.isArray(record)) throw failure("MISSING_LOCK_PACKAGE", path);
  return record as Record<string, unknown>;
}

function buildRecords(repositoryRoot: string): { readonly packages: readonly ThirdPartyNoticePackage[]; readonly blocks: readonly ThirdPartyNoticeBlock[] } {
  const { json: lock } = parsePackageLock(repositoryRoot);
  const packages: ThirdPartyNoticePackage[] = [];
  let reactLicense: Buffer | undefined;
  let viteLicense: Buffer | undefined;

  for (const spec of PACKAGE_SPECS) {
    const lockRecord = lockPackageRecord(lock, spec.lockfilePackagePath);
    if (lockRecord.version !== spec.expectedVersion) throw failure("LOCK_VERSION", `${spec.name}@${String(lockRecord.version)}`);
    if (lockRecord.license !== "MIT") throw failure("LOCK_LICENSE", spec.name);
    const source = readRegularFile(repositoryRoot, spec.sourcePath, "READ_LICENSE");
    assertLfAndText(source, "INVALID_LICENSE_BYTES");
    const actualHash = sha256(source);
    if (actualHash !== spec.expectedSourceSha256 || source.byteLength !== spec.expectedSourceBytes) {
      throw failure("SOURCE_HASH", spec.sourcePath);
    }
    if (spec.licenseBlock === REACT_LICENSE_BLOCK_ID) {
      if (!reactLicense) reactLicense = source;
      else if (!reactLicense.equals(source)) throw failure("CANONICAL_BLOCK_DRIFT", spec.sourcePath);
    } else {
      viteLicense = source;
    }
    packages.push({
      name: spec.name,
      version: spec.expectedVersion,
      lockfilePackagePath: spec.lockfilePackagePath,
      sourcePath: spec.sourcePath,
      sourceSha256: actualHash,
      sourceBytes: source.byteLength,
      license: "MIT",
      licenseBlock: spec.licenseBlock,
    });
  }
  if (!reactLicense || !viteLicense) throw failure("LICENSE_BLOCKS");
  const reactPackages = packages.filter(({ licenseBlock }) => licenseBlock === REACT_LICENSE_BLOCK_ID).map(({ name, version }) => `${name}@${version}`);
  const vitePackages = packages.filter(({ licenseBlock }) => licenseBlock === VITE_LICENSE_BLOCK_ID).map(({ name, version }) => `${name}@${version}`);
  return {
    packages,
    blocks: [
      {
        id: REACT_LICENSE_BLOCK_ID,
        mappedPackages: reactPackages,
        sourcePaths: packages.filter(({ licenseBlock }) => licenseBlock === REACT_LICENSE_BLOCK_ID).map(({ sourcePath }) => sourcePath),
        sourceSha256: REACT_LICENSE_SHA256,
        sourceBytes: REACT_LICENSE_SOURCE_BYTES,
        licenseText: reactLicense,
      },
      {
        id: VITE_LICENSE_BLOCK_ID,
        mappedPackages: vitePackages,
        sourcePaths: packages.filter(({ licenseBlock }) => licenseBlock === VITE_LICENSE_BLOCK_ID).map(({ sourcePath }) => sourcePath),
        sourceSha256: VITE_LICENSE_SHA256,
        sourceBytes: VITE_LICENSE_SOURCE_BYTES,
        licenseText: viteLicense,
      },
    ],
  };
}

function packageLines(record: ThirdPartyNoticePackage): string[] {
  return [
    "[package]",
    `name: ${record.name}`,
    `version: ${record.version}`,
    `license: ${record.license}`,
    `lockfile_package_path: ${record.lockfilePackagePath}`,
    `source_path: ${record.sourcePath}`,
    `source_sha256: ${record.sourceSha256}`,
    `source_bytes: ${record.sourceBytes}`,
    `license_block: ${record.licenseBlock}`,
    "[/package]",
  ];
}

function blockPrefix(block: ThirdPartyNoticeBlock): string[] {
  return [
    "[license_block]",
    `id: ${block.id}`,
    `mapped_packages: ${block.mappedPackages.join(",")}`,
    `source_paths: ${block.sourcePaths.join(",")}`,
    `source_sha256: ${block.sourceSha256}`,
    `source_bytes: ${block.sourceBytes}`,
    "BEGIN_LICENSE_TEXT",
  ];
}

/** Render the notice with LF separators while preserving source license bytes exactly. */
export function renderThirdPartyNotice(document: ThirdPartyNoticeDocument): Buffer {
  const header = [
    THIRD_PARTY_NOTICE_FORMAT,
    `package_lock_path: ${PACKAGE_LOCK_RELATIVE_PATH}`,
    `package_lock_sha256: ${document.packageLockSha256}`,
    `package_count: ${document.packages.length}`,
    `license_block_count: ${document.blocks.length}`,
    "",
  ].join("\n");
  const chunks: Buffer[] = [Buffer.from(`${header}\n`, "utf8")];
  for (const [index, record] of document.packages.entries()) {
    chunks.push(Buffer.from(`${packageLines(record).join("\n")}\n\n`, "utf8"));
    if (index === document.packages.length - 1) chunks.push(Buffer.from("\n", "utf8"));
  }
  for (const block of document.blocks) {
    chunks.push(Buffer.from(`${blockPrefix(block).join("\n")}\n`, "utf8"));
    chunks.push(block.licenseText);
    if (!block.licenseText.toString("utf8").endsWith("\n")) chunks.push(Buffer.from("\n", "utf8"));
    chunks.push(Buffer.from(`END_LICENSE_TEXT\n[/license_block]\n\n`, "utf8"));
  }
  return Buffer.concat(chunks);
}

/** Read installed dependencies and build the deterministic T059 document. */
export function buildThirdPartyNotice(repositoryRoot = resolve(import.meta.dirname, "../..")): Buffer {
  const { packages, blocks } = buildRecords(repositoryRoot);
  const document: ThirdPartyNoticeDocument = {
    format: THIRD_PARTY_NOTICE_FORMAT,
    packageLockPath: PACKAGE_LOCK_RELATIVE_PATH,
    packageLockSha256: PACKAGE_LOCK_SHA256,
    packages,
    blocks,
  };
  return renderThirdPartyNotice(document);
}

function parseFields(lines: readonly string[], start: number, endMarker: string): { readonly fields: Record<string, string>; readonly next: number } {
  const fields: Record<string, string> = {};
  let index = start;
  while (index < lines.length && lines[index] !== endMarker) {
    const line = lines[index];
    const separator = line.indexOf(": ");
    if (separator <= 0) throw failure("INVALID_NOTICE_FIELD", line);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 2);
    if (fields[key] !== undefined) throw failure("DUPLICATE_NOTICE_FIELD", key);
    fields[key] = value;
    index += 1;
  }
  if (lines[index] !== endMarker) throw failure("MISSING_NOTICE_MARKER", endMarker);
  return { fields, next: index + 1 };
}

/** Parse and validate the structural metadata without reading installed sources. */
export function parseThirdPartyNotice(bytes: Buffer): ThirdPartyNoticeDocument {
  assertLfAndText(bytes, "INVALID_NOTICE_BYTES");
  const text = bytes.toString("utf8");
  if (text.includes("\r") || text.includes("\0") || PLACEHOLDER_PATTERN.test(text)) throw failure("INVALID_NOTICE_BYTES");
  const lines = text.split("\n");
  if (lines.at(-1) !== "") throw failure("INVALID_NOTICE_BYTES", "FINAL_LF");
  if (lines[0] !== THIRD_PARTY_NOTICE_FORMAT) throw failure("FORMAT");
  const header = parseFields(lines, 1, "");
  if (header.fields.package_lock_path !== PACKAGE_LOCK_RELATIVE_PATH) throw failure("LOCK_PATH");
  if (header.fields.package_lock_sha256 !== PACKAGE_LOCK_SHA256) throw failure("LOCK_HASH");
  if (header.fields.package_count !== "4" || header.fields.license_block_count !== "2") throw failure("CARDINALITY");

  const packages: ThirdPartyNoticePackage[] = [];
  let index = header.next;
  for (let packageIndex = 0; packageIndex < 4; packageIndex += 1) {
    if (lines[index] !== "[package]") throw failure("PACKAGE_RECORDS");
    const parsed = parseFields(lines, index + 1, "[/package]");
    const fields = parsed.fields;
    const expected = PACKAGE_SPECS[packageIndex];
    if (fields.name !== expected.name || fields.version !== expected.expectedVersion || fields.license !== "MIT") throw failure("PACKAGE_RECORD", fields.name ?? "unknown");
    if (fields.lockfile_package_path !== expected.lockfilePackagePath || fields.source_path !== expected.sourcePath) throw failure("PACKAGE_PATH", fields.name);
    if (fields.source_sha256 !== expected.expectedSourceSha256 || fields.source_bytes !== String(expected.expectedSourceBytes)) throw failure("PACKAGE_SOURCE", fields.name);
    if (fields.license_block !== expected.licenseBlock) throw failure("PACKAGE_BLOCK", fields.name);
    packages.push({
      name: expected.name,
      version: expected.expectedVersion,
      lockfilePackagePath: expected.lockfilePackagePath,
      sourcePath: expected.sourcePath,
      sourceSha256: expected.expectedSourceSha256,
      sourceBytes: expected.expectedSourceBytes,
      license: "MIT",
      licenseBlock: expected.licenseBlock,
    });
    index = parsed.next;
    if (lines[index] !== "") throw failure("PACKAGE_SEPARATOR");
    index += 1;
  }
  if (lines[index] !== "") throw failure("BLOCK_SEPARATOR");
  index += 1;

  const blocks: ThirdPartyNoticeBlock[] = [];
  for (let blockIndex = 0; blockIndex < 2; blockIndex += 1) {
    if (lines[index] !== "[license_block]") throw failure("LICENSE_BLOCKS");
    const parsed = parseFields(lines, index + 1, "BEGIN_LICENSE_TEXT");
    const fields = parsed.fields;
    const expectedId = blockIndex === 0 ? REACT_LICENSE_BLOCK_ID : VITE_LICENSE_BLOCK_ID;
    const expectedPackages = packages.filter(({ licenseBlock }) => licenseBlock === expectedId).map(({ name, version }) => `${name}@${version}`);
    const expectedPaths = packages.filter(({ licenseBlock }) => licenseBlock === expectedId).map(({ sourcePath }) => sourcePath);
    const expectedHash = expectedId === REACT_LICENSE_BLOCK_ID ? REACT_LICENSE_SHA256 : VITE_LICENSE_SHA256;
    const expectedBytes = expectedId === REACT_LICENSE_BLOCK_ID ? REACT_LICENSE_SOURCE_BYTES : VITE_LICENSE_SOURCE_BYTES;
    if (fields.id !== expectedId) throw failure("LICENSE_BLOCK_ID", fields.id ?? "unknown");
    if (fields.mapped_packages !== expectedPackages.join(",")) throw failure("LICENSE_BLOCK_MAPPING", expectedId);
    if (fields.source_paths !== expectedPaths.join(",")) throw failure("LICENSE_BLOCK_PATHS", expectedId);
    if (fields.source_sha256 !== expectedHash || fields.source_bytes !== String(expectedBytes)) throw failure("LICENSE_BLOCK_SOURCE", expectedId);
    const textStart = parsed.next;
    let end = textStart;
    while (end < lines.length && lines[end] !== "END_LICENSE_TEXT") end += 1;
    if (end >= lines.length) throw failure("LICENSE_TEXT_MARKER", expectedId);
    const licenseText = Buffer.from(`${lines.slice(textStart, end).join("\n")}\n`, "utf8");
    if (licenseText.byteLength !== expectedBytes || sha256(licenseText) !== expectedHash) throw failure("LICENSE_TEXT_HASH", expectedId);
    if (lines[end + 1] !== "[/license_block]") throw failure("LICENSE_BLOCK_END", expectedId);
    blocks.push({ id: expectedId, mappedPackages: expectedPackages, sourcePaths: expectedPaths, sourceSha256: expectedHash, sourceBytes: expectedBytes, licenseText });
    index = end + 2;
    if (index < lines.length && lines[index] === "") index += 1;
  }
  if (index !== lines.length - 1) throw failure("UNEXPECTED_NOTICE_CONTENT");
  return { format: THIRD_PARTY_NOTICE_FORMAT, packageLockPath: PACKAGE_LOCK_RELATIVE_PATH, packageLockSha256: PACKAGE_LOCK_SHA256, packages, blocks };
}

/** Validate the exact static artifact, including its pinned artifact hash. */
export function validateThirdPartyNoticeBytes(bytes: Buffer): ThirdPartyNoticeDocument {
  if (sha256(bytes) !== THIRD_PARTY_NOTICE_SHA256) {
    throw failure("NOTICE_HASH", sha256(bytes));
  }
  return parseThirdPartyNotice(bytes);
}

/** Verify a notice file's path/type/bytes and, when available, installed source identity. */
export function verifyThirdPartyNoticeFile(
  noticePath: string,
  repositoryRoot = resolve(import.meta.dirname, "../.."),
  verifyInstalledSources = false,
): ThirdPartyNoticeDocument {
  let stat;
  try {
    stat = lstatSync(noticePath);
  } catch {
    throw failure("MISSING_NOTICE", noticePath);
  }
  if (stat.isSymbolicLink()) throw failure("SYMLINK", noticePath);
  if (!stat.isFile()) throw failure("INVALID_ENTRY_TYPE", noticePath);
  const bytes = readFileSync(noticePath);
  const parsed = validateThirdPartyNoticeBytes(bytes);
  if (verifyInstalledSources) {
    const expected = buildThirdPartyNotice(repositoryRoot);
    if (!expected.equals(bytes)) throw failure("GENERATED_BYTES_DRIFT", noticePath);
  }
  return parsed;
}

/** Generate the tracked artifact. Refuses a symlink or non-regular destination. */
export function writeThirdPartyNotice(repositoryRoot = resolve(import.meta.dirname, "../..")): void {
  const destination = repositoryPath(repositoryRoot, THIRD_PARTY_NOTICE_PUBLIC_PATH);
  try {
    const stat = lstatSync(destination);
    if (stat.isSymbolicLink()) throw failure("SYMLINK", THIRD_PARTY_NOTICE_PUBLIC_PATH);
    if (!stat.isFile()) throw failure("INVALID_ENTRY_TYPE", THIRD_PARTY_NOTICE_PUBLIC_PATH);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("THIRD_PARTY_NOTICES_")) throw error;
    // The parent public directory is tracked and should already exist. A
    // missing artifact is the only case where a new file is created.
  }
  writeFileSync(destination, buildThirdPartyNotice(repositoryRoot));
}

function cli(): void {
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const mode = process.argv[2];
  const destination = repositoryPath(repositoryRoot, THIRD_PARTY_NOTICE_PUBLIC_PATH);
  if (mode === "--write") {
    writeThirdPartyNotice(repositoryRoot);
    const bytes = readFileSync(destination);
    process.stdout.write(`wrote ${THIRD_PARTY_NOTICE_PUBLIC_PATH} sha256=${sha256(bytes)} bytes=${bytes.byteLength}\n`);
    return;
  }
  if (mode === "--check") {
    const generated = buildThirdPartyNotice(repositoryRoot);
    const actual = readFileSync(destination);
    if (!generated.equals(actual)) throw failure("GENERATED_BYTES_DRIFT", THIRD_PARTY_NOTICE_PUBLIC_PATH);
    parseThirdPartyNotice(actual);
    process.stdout.write(`ok ${THIRD_PARTY_NOTICE_PUBLIC_PATH} sha256=${sha256(actual)} bytes=${actual.byteLength}\n`);
    return;
  }
  process.stdout.write("usage: tsx scripts/legal/third-party-notices.ts --write|--check\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) cli();
