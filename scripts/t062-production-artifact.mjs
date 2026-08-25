import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";

export const T062_SCHEMA_VERSION = 1;
export const T062_MANIFEST_VERSION = "t062-production-artifact-v1";
export const T062_CANDIDATE_REVISION = "f434656cdf3fce0fa35e8598169da6b678cdf627";
export const T062_CONTRACT_SHA256 = "268d2edb64ce5ebab2b87982d6e93f71d4c9ff7a060de5795c69ff57f08888e1";
export const T062_MANIFEST_PATH = "assets/manifests/t062-production-artifact-v1.json";

const THIRD_PARTY_NOTICES_PATH = "THIRD_PARTY_NOTICES.txt";
const EVIDENCE_ONLY_CANDIDATES = Object.freeze([
  "assets/style/master-candidate-02.png",
  "assets/style/master-candidate-03.png",
  "assets/style/master-candidate-04.png",
]);
const TREE_ENCODING = 'sha256 + " " + bytes + " " + path + "\\n"';
const PRODUCTION_PNG_COUNT = 622;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Compare strings by Unicode scalar value, not locale or host collation. */
export function compareUnicodeCodepoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function validateEntryName(name) {
  if (
    name.length === 0
    || name === "."
    || name === ".."
    || name.includes("/")
    || name.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    throw new Error(`DIST_UNSAFE_ENTRY:${JSON.stringify(name)}`);
  }
}

function childWithinDist(distRoot, parent, name) {
  const absolute = resolve(parent, name);
  const fromDist = relative(distRoot, absolute);
  if (fromDist === "" || fromDist === ".." || fromDist.startsWith(`..${sep}`) || isAbsolute(fromDist)) {
    throw new Error(`DIST_PATH_TRAVERSAL:${name}`);
  }
  return absolute;
}

function extension(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function expectedPngCount(options) {
  const value = options?.expectedPngCount ?? PRODUCTION_PNG_COUNT;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_EXPECTED_PNG_COUNT");
  return value;
}

export function inventoryT062Dist(root, options) {
  const distRoot = resolve(root, "dist");
  if (!existsSync(distRoot)) throw new Error("DIST_MISSING");
  const rootStat = lstatSync(distRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("DIST_ROOT_NOT_REAL_DIRECTORY");

  const files = [];
  const seenPaths = new Set();
  const visit = (directory, prefix) => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareUnicodeCodepoints(left.name, right.name));
    for (const entry of entries) {
      validateEntryName(entry.name);
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (seenPaths.has(path)) throw new Error(`DIST_DUPLICATE_PATH:${path}`);
      seenPaths.add(path);

      const absolute = childWithinDist(distRoot, directory, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`DIST_SYMLINK_REJECTED:${path}`);
      if (stat.isDirectory()) {
        visit(absolute, path);
        continue;
      }
      if (!stat.isFile()) throw new Error(`DIST_NON_REGULAR_REJECTED:${path}`);

      const bytes = readFileSync(absolute);
      files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    }
  };
  visit(distRoot, "");
  files.sort((left, right) => compareUnicodeCodepoints(left.path, right.path));

  if (files.length === 0) throw new Error("DIST_EMPTY");
  if (!files.some(({ path }) => path === "index.html")) throw new Error("DIST_INDEX_MISSING");

  const lowerPaths = new Set(files.map(({ path }) => path.toLowerCase()));
  const evidenceOnlyCandidates = EVIDENCE_ONLY_CANDIDATES.map((path) => ({
    path,
    absent: !lowerPaths.has(path.toLowerCase()),
  }));
  const leakedCandidate = evidenceOnlyCandidates.find(({ absent }) => !absent);
  if (leakedCandidate) throw new Error(`EVIDENCE_ONLY_CANDIDATE_PRESENT:${leakedCandidate.path}`);

  const notice = files.find(({ path }) => path === THIRD_PARTY_NOTICES_PATH);
  if (!notice) throw new Error(`DIST_REQUIRED_FILE_MISSING:${THIRD_PARTY_NOTICES_PATH}`);

  const extensionCounts = {};
  for (const file of files) {
    const key = extension(file.path);
    extensionCounts[key] = (extensionCounts[key] ?? 0) + 1;
  }
  const orderedExtensionCounts = Object.fromEntries(
    Object.entries(extensionCounts).sort(([left], [right]) => compareUnicodeCodepoints(left, right)),
  );
  const pngCount = extensionCounts[".png"] ?? 0;
  const expected = expectedPngCount(options);
  if (pngCount !== expected) throw new Error(`DIST_PNG_COUNT_MISMATCH:expected=${expected}:actual=${pngCount}`);
  const treeBytes = files
    .map(({ path, bytes, sha256: digest }) => `${digest} ${bytes} ${path}\n`)
    .join("");

  return {
    files,
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    extension_counts: orderedExtensionCounts,
    png_count: pngCount,
    evidence_only_candidates: evidenceOnlyCandidates,
    third_party_notices: {
      path: notice.path,
      bytes: notice.bytes,
      sha256: notice.sha256,
    },
    dist_tree_encoding: TREE_ENCODING,
    dist_tree_sha256: sha256(Buffer.from(treeBytes, "utf8")),
  };
}

export function createT062Manifest(root, options) {
  const inventory = inventoryT062Dist(root, options);
  return {
    schema_version: T062_SCHEMA_VERSION,
    manifest_version: T062_MANIFEST_VERSION,
    task_key: "T062",
    contract_sha256: T062_CONTRACT_SHA256,
    candidate_revision: T062_CANDIDATE_REVISION,
    evidence_commit: null,
    evidence_commit_note: "The manifest binds dist bytes to candidate_revision; the later evidence commit is intentionally not represented as the candidate.",
    file_count: inventory.file_count,
    total_bytes: inventory.total_bytes,
    extension_counts: inventory.extension_counts,
    png_count: inventory.png_count,
    evidence_only_candidates: inventory.evidence_only_candidates,
    third_party_notices: inventory.third_party_notices,
    files: inventory.files,
    dist_tree_encoding: inventory.dist_tree_encoding,
    dist_tree_sha256: inventory.dist_tree_sha256,
  };
}

export function renderT062Manifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function manifestAbsolutePath(root) {
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, T062_MANIFEST_PATH);
  const fromRoot = relative(absoluteRoot, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error("MANIFEST_PATH_TRAVERSAL");
  }
  return absolute;
}

export function writeT062Manifest(root, options) {
  const bytes = renderT062Manifest(createT062Manifest(root, options));
  const path = manifestAbsolutePath(root);
  const temporaryPath = `${path}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const existingStat = lstatSync(path);
    if (existingStat.isSymbolicLink() || !existingStat.isFile()) {
      throw new Error(`MANIFEST_NOT_REGULAR:${T062_MANIFEST_PATH}`);
    }
    const existing = readFileSync(path, "utf8");
    if (existing !== bytes) throw new Error(`REBASELINE_REQUIRED:${T062_MANIFEST_PATH}`);
    return { status: "IDENTICAL", path: T062_MANIFEST_PATH, sha256: sha256(Buffer.from(bytes, "utf8")) };
  }

  if (existsSync(temporaryPath)) {
    const temporaryStat = lstatSync(temporaryPath);
    if (temporaryStat.isSymbolicLink() || !temporaryStat.isFile()) throw new Error("MANIFEST_TEMP_NOT_REGULAR");
    throw new Error("MANIFEST_TEMP_ALREADY_EXISTS");
  }

  let descriptor;
  let ownsTemporary = false;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o644);
    ownsTemporary = true;
    writeFileSync(descriptor, bytes, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    options?.beforePublish?.(temporaryPath);
    linkSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!ownsTemporary && existsSync(path)) {
      const existing = readFileSync(path, "utf8");
      if (existing === bytes) return { status: "IDENTICAL", path: T062_MANIFEST_PATH, sha256: sha256(Buffer.from(bytes, "utf8")) };
    }
    if (ownsTemporary && existsSync(temporaryPath)) unlinkSync(temporaryPath);
    if (existsSync(path)) {
      const existing = readFileSync(path, "utf8");
      if (existing === bytes) return { status: "IDENTICAL", path: T062_MANIFEST_PATH, sha256: sha256(Buffer.from(bytes, "utf8")) };
      throw new Error(`REBASELINE_REQUIRED:${T062_MANIFEST_PATH}`, { cause: error });
    }
    throw error;
  }
  unlinkSync(temporaryPath);
  return { status: "CREATED", path: T062_MANIFEST_PATH, sha256: sha256(Buffer.from(bytes, "utf8")) };
}

export function checkT062Manifest(root, options) {
  const path = manifestAbsolutePath(root);
  if (!existsSync(path)) throw new Error(`MANIFEST_MISSING:${T062_MANIFEST_PATH}`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`MANIFEST_NOT_REGULAR:${T062_MANIFEST_PATH}`);
  const expected = renderT062Manifest(createT062Manifest(root, options));
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) throw new Error("T062_DIST_BYTE_DRIFT");
  const manifest = JSON.parse(actual);
  return {
    status: "VERIFIED",
    path: T062_MANIFEST_PATH,
    manifest_sha256: sha256(Buffer.from(actual, "utf8")),
    dist_tree_sha256: manifest.dist_tree_sha256,
    file_count: manifest.file_count,
    total_bytes: manifest.total_bytes,
  };
}

function parseCli(argv) {
  const [command, ...args] = argv;
  if (command !== "write" && command !== "check") throw new Error("USAGE: t062-production-artifact.mjs write|check [--root PATH]");
  if (args.length === 0) return { command, root: process.cwd() };
  if (args.length !== 2 || args[0] !== "--root" || !args[1]) throw new Error("USAGE: t062-production-artifact.mjs write|check [--root PATH]");
  return { command, root: resolve(args[1]) };
}

function main() {
  const { command, root } = parseCli(process.argv.slice(2));
  const result = command === "write" ? writeT062Manifest(root) : checkT062Manifest(root);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
