import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";
import { inflateSync } from "node:zlib";

import type { AspectRatio } from "./types";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const DEFAULT_MAX_PNG_BYTES = 30 * 1024 * 1024;

export interface VerifiedFile {
  path: string;
  sha256: string;
  size: number;
  already_existed: boolean;
  width: number;
  height: number;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertRelativePosixPath(path: string): string[] {
  if (!path || path.includes("\0") || path.includes("\\") || isAbsolute(path) || win32.isAbsolute(path)) {
    throw new Error("UNSAFE_PATH");
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("UNSAFE_PATH");
  return parts;
}

function assertContained(root: string, target: string): void {
  const offset = relative(root, target);
  if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) throw new Error("UNSAFE_PATH");
}

function ensureSafeDirectory(root: string, parts: readonly string[]): string {
  mkdirSync(root, { recursive: true });
  let cursor = root;
  if (lstatSync(cursor).isSymbolicLink()) throw new Error("SYMLINK_TRAVERSAL");
  for (const part of parts) {
    cursor = resolve(cursor, part);
    assertContained(root, cursor);
    if (!existsSync(cursor)) mkdirSync(cursor);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error("SYMLINK_TRAVERSAL");
    if (!info.isDirectory()) throw new Error("UNSAFE_PATH");
  }
  return cursor;
}

export function safeResolve(rootPath: string, relativePath: string, createParents = false): string {
  const root = resolve(rootPath);
  const parts = assertRelativePosixPath(relativePath);
  const target = resolve(root, ...parts);
  assertContained(root, target);
  const parentParts = parts.slice(0, -1);
  if (createParents) ensureSafeDirectory(root, parentParts);
  else {
    let cursor = root;
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("SYMLINK_TRAVERSAL");
    for (const part of parentParts) {
      cursor = resolve(cursor, part);
      if (!existsSync(cursor)) break;
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("SYMLINK_TRAVERSAL");
    }
  }
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("SYMLINK_TRAVERSAL");
  return target;
}

export function inspectPng(bytes: Uint8Array, aspectRatio: AspectRatio, maxBytes = DEFAULT_MAX_PNG_BYTES) {
  if (bytes.byteLength === 0) throw new Error("EMPTY_FILE");
  if (bytes.byteLength > maxBytes) throw new Error("FILE_TOO_LARGE");
  const buffer = Buffer.from(bytes);
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("INVALID_PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let chunkIndex = 0;
  let sawIdat = false;
  let sawIend = false;
  const idatChunks: Buffer[] = [];
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw new Error("INVALID_PNG");
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length || length > maxBytes) throw new Error("INVALID_PNG");
    const typeBytes = buffer.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("INVALID_PNG");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBytes, data])) !== expectedCrc) throw new Error("INVALID_PNG");
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) throw new Error("INVALID_PNG");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (width === 0 || height === 0) throw new Error("INVALID_PNG");
    } else if (type === "IHDR") {
      throw new Error("INVALID_PNG");
    }
    if (type === "IDAT") {
      sawIdat = true;
      idatChunks.push(data);
    }
    if (type === "IEND") {
      if (length !== 0 || end !== buffer.length) throw new Error("INVALID_PNG");
      sawIend = true;
    } else if (sawIend) {
      throw new Error("INVALID_PNG");
    }
    offset = end;
    chunkIndex += 1;
  }
  if (!sawIdat || !sawIend || width === 0 || height === 0) throw new Error("INVALID_PNG");
  try {
    if (inflateSync(Buffer.concat(idatChunks), { maxOutputLength: Math.min(maxBytes * 8, 256 * 1024 * 1024) }).byteLength === 0) {
      throw new Error("INVALID_PNG");
    }
  } catch {
    throw new Error("INVALID_PNG");
  }
  const [expectedWidth, expectedHeight] = aspectRatio.split(":").map(Number);
  if (width * expectedHeight !== height * expectedWidth) throw new Error("ASPECT_MISMATCH");
  return { sha256: sha256Bytes(buffer), size: buffer.byteLength, width, height };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function atomicWriteVerifiedPng(
  rootPath: string,
  relativePath: string,
  bytes: Uint8Array,
  aspectRatio: AspectRatio,
  maxBytes = DEFAULT_MAX_PNG_BYTES,
): VerifiedFile {
  const checked = inspectPng(bytes, aspectRatio, maxBytes);
  const target = safeResolve(rootPath, relativePath, true);
  if (existsSync(target)) {
    const current = readFileSync(target);
    const currentHash = sha256Bytes(current);
    if (currentHash !== checked.sha256) throw new Error("EXISTING_FILE_CONFLICT");
    return { path: target, ...checked, already_existed: true };
  }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    try {
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lstatSync(target).isSymbolicLink()) throw new Error("SYMLINK_TRAVERSAL");
      const current = readFileSync(target);
      if (sha256Bytes(current) !== checked.sha256) throw new Error("EXISTING_FILE_CONFLICT");
    }
    unlinkSync(temporary);
    fsyncDirectory(dirname(target));
  } finally {
    rmSync(temporary, { force: true });
  }
  const disk = readFileSync(target);
  if (sha256Bytes(disk) !== checked.sha256 || disk.byteLength !== checked.size) throw new Error("LOCAL_VERIFY_FAILED");
  return { path: target, ...checked, already_existed: false };
}

export function verifyExistingPng(
  rootPath: string,
  relativePath: string,
  aspectRatio: AspectRatio,
  expectedSha256: string,
  maxBytes = DEFAULT_MAX_PNG_BYTES,
): VerifiedFile {
  const target = safeResolve(rootPath, relativePath);
  if (!existsSync(target)) throw new Error("LOCAL_VERIFY_FAILED");
  const checked = inspectPng(readFileSync(target), aspectRatio, maxBytes);
  if (checked.sha256 !== expectedSha256) throw new Error("LOCAL_VERIFY_FAILED");
  return { path: target, ...checked, already_existed: true };
}

export function backupVerifiedFile(
  localRoot: string,
  backupRoot: string,
  relativePath: string,
  expectedSha256: string,
  aspectRatio: AspectRatio,
  maxBytes = DEFAULT_MAX_PNG_BYTES,
): VerifiedFile {
  const local = resolve(localRoot);
  const backup = resolve(backupRoot);
  assertNonOverlappingRoots(local, backup);
  const sourcePath = safeResolve(local, relativePath);
  const source = readFileSync(sourcePath);
  const sourceInfo = inspectPng(source, aspectRatio, maxBytes);
  if (sourceInfo.sha256 !== expectedSha256) throw new Error("LOCAL_HASH_CHANGED");
  const result = atomicWriteVerifiedPng(backup, relativePath, source, aspectRatio, maxBytes);
  if (result.sha256 !== sourceInfo.sha256 || result.size !== sourceInfo.size) throw new Error("BACKUP_VERIFY_FAILED");
  return result;
}

export function assertNonOverlappingRoots(localRoot: string, backupRoot: string): void {
  const canonicalize = (path: string) => {
    let cursor = resolve(path);
    const suffix: string[] = [];
    while (!existsSync(cursor)) {
      const parent = dirname(cursor);
      if (parent === cursor) break;
      suffix.unshift(basename(cursor));
      cursor = parent;
    }
    return resolve(realpathSync(cursor), ...suffix);
  };
  const local = canonicalize(localRoot);
  const backup = canonicalize(backupRoot);
  const localToBackup = relative(local, backup);
  const backupToLocal = relative(backup, local);
  const contained = (offset: string) => offset === "" || (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset));
  if (contained(localToBackup) || contained(backupToLocal)) throw new Error("BACKUP_ROOT_NOT_DISTINCT");
}

export function atomicWriteJson(rootPath: string, relativePath: string, value: unknown): void {
  const target = safeResolve(rootPath, relativePath, true);
  const parent = dirname(target);
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(temporary, target);
    fsyncDirectory(parent);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export interface RunnerLock {
  path: string;
  release(): void;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function acquireRunnerLock(
  trustedRoot: string,
  relativePath: string,
  staleAfterMs = 15 * 60 * 1000,
): RunnerLock {
  const target = safeResolve(trustedRoot, relativePath, true);
  const claim = safeResolve(trustedRoot, `${relativePath}.claim`, true);
  let claimDescriptor: number;
  try {
    claimDescriptor = openSync(claim, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("RUNNER_LOCKED");
    throw error;
  }
  try {
    writeFileSync(claimDescriptor, JSON.stringify({ pid: process.pid, created_at_ms: Date.now() }), "utf8");
    fsyncSync(claimDescriptor);
  } finally {
    closeSync(claimDescriptor);
  }
  fsyncDirectory(dirname(claim));
  try {
    if (existsSync(target)) {
      const info = lstatSync(target);
      if (info.isSymbolicLink()) throw new Error("SYMLINK_TRAVERSAL");
      const originalInode = info.ino;
      const originalDevice = info.dev;
      const originalBytes = readFileSync(target, "utf8");
      let stale = Date.now() - info.mtimeMs > staleAfterMs;
      try {
        const data = JSON.parse(originalBytes) as { pid?: number; created_at_ms?: number };
        if (typeof data.pid === "number" && processExists(data.pid)) stale = false;
        else if (typeof data.created_at_ms === "number") stale = Date.now() - data.created_at_ms > staleAfterMs;
      } catch {
        // An unreadable lock can only be recovered after its filesystem age is stale.
      }
      if (!stale) throw new Error("RUNNER_LOCKED");
      const recheck = lstatSync(target);
      if (recheck.ino !== originalInode || recheck.dev !== originalDevice || readFileSync(target, "utf8") !== originalBytes) {
        throw new Error("RUNNER_LOCKED");
      }
      unlinkSync(target);
    }
    const descriptor = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const token = randomUUID();
    try {
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, created_at_ms: Date.now(), token }), "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    fsyncDirectory(dirname(target));
    return {
      path: target,
      release() {
        if (!existsSync(target)) return;
        try {
          const current = JSON.parse(readFileSync(target, "utf8")) as { token?: string };
          if (current.token === token) unlinkSync(target);
        } finally {
          if (existsSync(dirname(target))) fsyncDirectory(dirname(target));
        }
      },
    };
  } finally {
    if (existsSync(claim)) unlinkSync(claim);
    fsyncDirectory(dirname(claim));
  }
}

export function readFirstBytes(path: string, length: number): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    const buffer = Buffer.alloc(length);
    const count = readSync(descriptor, buffer, 0, length, 0);
    return buffer.subarray(0, count);
  } finally {
    closeSync(descriptor);
  }
}

export function fileSize(path: string): number {
  return statSync(path).size;
}
