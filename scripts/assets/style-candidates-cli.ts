import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { safeResolve } from "./filesystem";
import {
  buildStyleCandidatesManifest,
  canGenerateRemotely,
  renderStyleCandidatesManifest,
  renderStyleContactSheetHtml,
  renderStyleProviderLedger,
} from "./style-candidates";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestRelativePath = "assets/manifests/style-candidates-v1.json";

function usage(): never {
  throw new Error("usage: assets:style <gen|check|contact-sheet --evidence RELATIVE_PATH --provider-ledger RELATIVE_PATH --output docs/asset-runs/contact-sheets/NAME.html --local-root PATH --backup-root PATH>");
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
}

function writeTextAtomically(relativePath: string, contents: string): string {
  const target = safeResolve(repositoryRoot, relativePath, true);
  const temporary = `${target}.tmp-${process.pid}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  return target;
}

export function assertContactSheetOutputPath(relativePath: string): void {
  if (!/^docs\/asset-runs\/contact-sheets\/[a-z0-9][a-z0-9_-]*\.html$/.test(relativePath)) {
    throw new Error("contact sheet output must be docs/asset-runs/contact-sheets/<safe-name>.html");
  }
}

export function writeContactSheetNoClobber(root: string, relativePath: string, contents: string): string {
  assertContactSheetOutputPath(relativePath);
  const target = safeResolve(root, relativePath, true);
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") === contents) return target;
    throw new Error("contact sheet output already exists with different content");
  }
  const temporary = `${target}.tmp-${process.pid}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    try {
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lstatSync(target).isSymbolicLink()) throw new Error("contact sheet output path is a symlink");
      if (readFileSync(target, "utf8") !== contents) throw new Error("contact sheet output already exists with different content");
    }
    unlinkSync(temporary);
  } finally {
    rmSync(temporary, { force: true });
  }
  return target;
}

function resolveRootOption(root: string, value: string): string {
  if (!value || value.includes("\0")) throw new Error("invalid asset root path");
  return isAbsolute(value) ? resolve(value) : safeResolve(root, value);
}

function checkedManifest() {
  const expected = buildStyleCandidatesManifest(repositoryRoot);
  const expectedBytes = renderStyleCandidatesManifest(expected);
  const path = safeResolve(repositoryRoot, manifestRelativePath);
  if (!existsSync(path) || readFileSync(path, "utf8") !== expectedBytes) {
    throw new Error("style candidate manifest is missing, stale, or edited; run npm run assets:style:gen");
  }
  return expected;
}

export function runStyleCandidatesCli(args: readonly string[]): Record<string, unknown> {
  const command = args[0];
  if (!command || !["gen", "check", "contact-sheet"].includes(command)) usage();
  if (command === "gen") {
    if (args.length !== 1) usage();
    const manifest = buildStyleCandidatesManifest(repositoryRoot);
    writeTextAtomically(manifestRelativePath, renderStyleCandidatesManifest(manifest));
    return { command, candidates: manifest.candidates.length, remote_generation_state: manifest.remote_generation_state };
  }
  if (command === "check") {
    if (args.length !== 1) usage();
    const manifest = checkedManifest();
    return { command, candidates: manifest.candidates.length, remote_generation_state: manifest.remote_generation_state };
  }
  const manifest = checkedManifest();
  if (!canGenerateRemotely(manifest)) throw new Error("contact sheet is blocked while remote generation is on HOLD");
  return runContactSheetAfterReadyGate(args, manifest, repositoryRoot);
}

function runContactSheetAfterReadyGate(
  args: readonly string[],
  manifest: ReturnType<typeof buildStyleCandidatesManifest>,
  root: string,
): Record<string, unknown> {
  if (!canGenerateRemotely(manifest)) throw new Error("contact sheet is blocked without a READY manifest");
  if (args.length !== 11 || args[0] !== "contact-sheet") usage();
  const allowed = new Set(["--evidence", "--provider-ledger", "--output", "--local-root", "--backup-root"]);
  for (let index = 1; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1] || args[index + 1].startsWith("--")) usage();
  }
  if (new Set(args.filter((value) => allowed.has(value))).size !== allowed.size) usage();
  const evidenceRelativePath = option(args, "--evidence");
  const providerLedgerRelativePath = option(args, "--provider-ledger");
  const outputRelativePath = option(args, "--output");
  const localRootOption = option(args, "--local-root");
  const backupRootOption = option(args, "--backup-root");
  if (!evidenceRelativePath || !providerLedgerRelativePath || !outputRelativePath || !localRootOption || !backupRootOption) usage();
  assertContactSheetOutputPath(outputRelativePath);
  const localRoot = resolveRootOption(root, localRootOption);
  const canonicalLocalRoot = resolve(root, "public/assets");
  if (localRoot !== canonicalLocalRoot) throw new Error("local root must be the repository public/assets directory");
  const backupRoot = resolveRootOption(root, backupRootOption);
  const evidence = JSON.parse(readFileSync(safeResolve(root, evidenceRelativePath), "utf8")) as unknown;
  const providerLedgerBytes = readFileSync(safeResolve(root, providerLedgerRelativePath), "utf8");
  const providerLedger = JSON.parse(providerLedgerBytes) as unknown;
  if (providerLedgerBytes !== renderStyleProviderLedger(providerLedger as Parameters<typeof renderStyleProviderLedger>[0])) {
    throw new Error("redacted provider ledger must use canonical JSON serialization");
  }
  const html = renderStyleContactSheetHtml(manifest, evidence, providerLedger, root, backupRoot);
  const outputPath = writeContactSheetNoClobber(root, outputRelativePath, html);
  return { command: "contact-sheet", candidates: manifest.candidates.length, output_path: outputPath };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    console.log(JSON.stringify(runStyleCandidatesCli(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "style candidate command failed");
    process.exitCode = 1;
  }
}
