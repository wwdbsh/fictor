import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, onTestFinished } from "vitest";

export type TemporaryRootScope = "test" | "suite";

interface TemporaryRootIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface TemporaryRootRecord {
  readonly path: string;
  readonly prefix: string;
  readonly scope: TemporaryRootScope;
  readonly identity: TemporaryRootIdentity;
  cleaned: boolean;
}

export interface OwnedTempDiagnostics {
  readonly event: "FICTOR_TEMP_AUDIT";
  readonly suite: string;
  readonly created_roots: number;
  readonly cleaned_roots: number;
  readonly remaining_roots: number;
  readonly remaining_bytes: number;
  readonly max_observed_root_count: number;
  readonly max_observed_root_bytes: number;
  readonly max_observed_total_bytes: number;
  readonly cleanup_failures: number;
  readonly diagnostic_failures: number;
  readonly created_prefixes: Readonly<Record<string, number>>;
}

export interface OwnedTempManager {
  create(prefix: string, scope?: TemporaryRootScope): string;
  cleanupSuite(): void;
  diagnostics(): OwnedTempDiagnostics;
}

function validatePrefix(prefix: string): void {
  if (!/^fictor-[A-Za-z0-9][A-Za-z0-9_-]*-$/.test(prefix) || prefix.includes("..")) {
    throw safeError("INVALID_OWNED_TEMP_PREFIX");
  }
}

function safeBasename(path: string): string {
  const value = basename(path);
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : "root";
}

function safeErrorCode(error: unknown): string {
  try {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
    }
  } catch {
    // Error inspection itself must never create a second unsafe error.
  }
  return "UNKNOWN";
}

function safeError(message: string): Error {
  const error = new Error(message);
  // Error stacks include the absolute source path. Keep printable diagnostics
  // limited to the contract-safe message, including nested AggregateErrors.
  Object.defineProperty(error, "stack", { configurable: true, value: message });
  return error;
}

function filesystemFailure(operation: string, path: string, error: unknown): Error {
  return safeError(`OWNED_TEMP_${operation}:${safeBasename(path)}:${safeErrorCode(error)}`);
}

function contractFailure(operation: string, path: string, reason: string): Error {
  return safeError(`OWNED_TEMP_${operation}:${safeBasename(path)}:${reason}`);
}

function safeSuiteLabel(suite: string): string {
  const value = safeBasename(suite);
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function captureIdentity(path: string): TemporaryRootIdentity {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw filesystemFailure("CAPTURE", path, error);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw contractFailure("CAPTURE", path, "TYPE");
  return { dev: stat.dev, ino: stat.ino };
}

function verifyIdentity(record: TemporaryRootRecord): void {
  let stat;
  try {
    stat = lstatSync(record.path);
  } catch (error) {
    throw filesystemFailure("VERIFY", record.path, error);
  }
  if (stat.isSymbolicLink()) throw contractFailure("VERIFY", record.path, "SYMLINK");
  if (!stat.isDirectory()) throw contractFailure("VERIFY", record.path, "TYPE");
  if (stat.dev !== record.identity.dev || stat.ino !== record.identity.ino) {
    throw contractFailure("VERIFY", record.path, "IDENTITY");
  }
}

interface ByteScan {
  readonly bytes: number;
  readonly failures: readonly Error[];
}

function scanBytes(path: string): ByteScan {
  const failures: Error[] = [];
  function visit(current: string): number {
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      failures.push(filesystemFailure("SCAN", path, error));
      return 0;
    }
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory() || stat.isSymbolicLink()) return 0;

    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      failures.push(filesystemFailure("SCAN", path, error));
      return 0;
    }
    return entries.reduce((total, entry) => total + visit(join(current, entry.name)), 0);
  }
  return { bytes: visit(path), failures };
}

function aggregateFailures(failures: readonly Error[], suite: string): void {
  if (failures.length === 0) return;
  const aggregate = new AggregateError(failures, `${safeSuiteLabel(suite)} temporary test cleanup failed`);
  Object.defineProperty(aggregate, "stack", {
    configurable: true,
    value: aggregate.message,
  });
  throw aggregate;
}

/**
 * Creates a per-test-file owner. The manager derives every root under the
 * current OS temporary directory and registers its own suite cleanup hook.
 */
export function createOwnedTempManager(suite: string): OwnedTempManager {
  const safeSuite = safeSuiteLabel(suite);
  const records = new Map<string, TemporaryRootRecord>();
  const createdPrefixes = new Map<string, number>();
  const diagnosticErrors: Error[] = [];
  const pendingDiagnosticErrors: Error[] = [];
  let maxObservedRootCount = 0;
  let maxObservedRootBytes = 0;
  let maxObservedTotalBytes = 0;
  let cleanupFailures = 0;

  function observe(): void {
    const active = [...records.values()].filter((record) => !record.cleaned && existsSync(record.path));
    maxObservedRootCount = Math.max(maxObservedRootCount, active.length);
    let total = 0;
    for (const record of active) {
      const scan = scanBytes(record.path);
      total += scan.bytes;
      maxObservedRootBytes = Math.max(maxObservedRootBytes, scan.bytes);
      diagnosticErrors.push(...scan.failures);
      pendingDiagnosticErrors.push(...scan.failures);
    }
    maxObservedTotalBytes = Math.max(maxObservedTotalBytes, total);
  }

  function cleanupRoots(paths: readonly string[]): Error[] {
    observe();
    const failures: Error[] = [];
    for (const path of paths) {
      const record = records.get(path);
      if (!record || record.cleaned) continue;
      try {
        verifyIdentity(record);
        try {
          rmSync(record.path, { recursive: true, force: true });
        } catch (error) {
          throw filesystemFailure("REMOVE", record.path, error);
        }
        if (existsSync(record.path)) throw contractFailure("REMOVE", record.path, "REMAINS");
        record.cleaned = true;
      } catch (error) {
        cleanupFailures += 1;
        failures.push(
          error instanceof Error && error.message.startsWith("OWNED_TEMP_")
            ? error
            : filesystemFailure("CLEANUP", record.path, error),
        );
      }
    }
    observe();
    return failures;
  }

  function cleanupTestRoot(path: string): void {
    const failures = cleanupRoots([path]);
    const diagnosticFailures = pendingDiagnosticErrors.splice(0);
    aggregateFailures([...diagnosticFailures, ...failures], safeSuite);
  }

  function create(prefix: string, scope: TemporaryRootScope = "test"): string {
    validatePrefix(prefix);
    const requestedPath = resolve(tmpdir(), prefix);
    let path: string;
    try {
      path = mkdtempSync(requestedPath);
    } catch (error) {
      throw filesystemFailure("CREATE", requestedPath, error);
    }
    const identity = captureIdentity(path);
    const record: TemporaryRootRecord = { path, prefix, scope, identity, cleaned: false };
    records.set(path, record);
    createdPrefixes.set(prefix, (createdPrefixes.get(prefix) ?? 0) + 1);
    observe();
    if (scope === "test") onTestFinished(() => cleanupTestRoot(path));
    return path;
  }

  function diagnostics(): OwnedTempDiagnostics {
    observe();
    const remainingRecords = [...records.values()].filter((record) => !record.cleaned && existsSync(record.path));
    return {
      event: "FICTOR_TEMP_AUDIT",
      suite: safeSuite,
      created_roots: records.size,
      cleaned_roots: [...records.values()].filter((record) => record.cleaned).length,
      remaining_roots: remainingRecords.length,
      remaining_bytes: remainingRecords.reduce((total, record) => {
        const scan = scanBytes(record.path);
        diagnosticErrors.push(...scan.failures);
        pendingDiagnosticErrors.push(...scan.failures);
        return total + scan.bytes;
      }, 0),
      max_observed_root_count: maxObservedRootCount,
      max_observed_root_bytes: maxObservedRootBytes,
      max_observed_total_bytes: maxObservedTotalBytes,
      cleanup_failures: cleanupFailures,
      diagnostic_failures: diagnosticErrors.length,
      created_prefixes: Object.fromEntries([...createdPrefixes.entries()].sort(([left], [right]) => left.localeCompare(right))),
    };
  }

  function cleanupSuite(): void {
    const failures = cleanupRoots([...records.keys()]);
    const report = diagnostics();
    const diagnosticFailures = pendingDiagnosticErrors.splice(0);
    console.info(JSON.stringify(report));
    aggregateFailures([...diagnosticFailures, ...failures], safeSuite);
  }

  const manager = { create, cleanupSuite, diagnostics };
  afterAll(() => manager.cleanupSuite());
  return manager;
}
