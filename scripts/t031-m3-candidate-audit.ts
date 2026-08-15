import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const T031_CONTRACT_SHA256 = "82f1de075d2ee7fc83e0bb841cb1ab73f158989a867d7e435bcf3488fd9b809c" as const;
export const T031_PACKAGE_JSON_SHA256 = "a1e0807b75b2a18c3d927f107993c1d683daae49949ed2ecd0478d89252c3b1b" as const;
export const T031_MANIFEST_PATH = "assets/manifests/t031-m3-candidate-audit-v1.json" as const;
export const T031_MILESTONE_PATH = "docs/milestones/m3-vertical-slice.json" as const;

const COMMANDS = Object.freeze({
  clean_install: "npm ci",
  generate_data: "npm run gen:data",
  generated_diff: "git diff --exit-code -- src/data/generated",
  data_check: "npm run gen:data:check",
  t022_audit: "npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts check",
  tests: "npm test",
  typecheck: "npm run typecheck",
  build: "npm run build",
  smoke: "npm run smoke:static",
});
const MANUAL_CHECKS = Object.freeze([
  "LOSS_RESTART",
  "INSTANT_LIFETIME",
  "WORKSHOP_CANONICAL",
  "REWARD_RESTRICTIONS",
  "BOSS_VICTORY_RESTART",
]);
const REQUIRED_KNOWN_ISSUES = Object.freeze(["T015_OWNER_JOURNALS", "T027_PROVISIONAL_BALANCE"]);
const TEXT_EXTENSIONS = new Set(["", ".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const SECRET_PATTERNS = [
  new RegExp("-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}"),
  /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|client[_-]?secret)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
];
const BROWSER_NETWORK_PATTERNS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\.sendBeacon\s*\(/,
  /\bWebTransport\b/,
];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordInputPaths = { commandsPath: string; knownIssuesPath: string; manualEvidencePath: string };
type DistRecord = { path: string; bytes: number; sha256: string };

export interface T031RecordResult {
  manifest: Record<string, unknown>;
  milestone: Record<string, unknown>;
  manifestBytes: string;
  milestoneBytes: string;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_CANONICAL_NUMBER");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") throw new Error("NON_CANONICAL_VALUE");
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonical(object[key])])) as { [key: string]: Json };
}

export function renderT031Json(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

function exact(value: unknown, keys: readonly string[], code: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) throw new Error(code);
}

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(code);
  return value;
}

function iso(value: unknown, code: string): string {
  const result = text(value, code);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error(code);
  return result;
}

export function safeT031Path(root: string, input: unknown, mustExist = true): string {
  const path = text(input, "UNSAFE_PATH");
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..") || /[\u0000-\u001f]/.test(path)) throw new Error("UNSAFE_PATH");
  const absolute = resolve(root, path);
  const fromRoot = relative(resolve(root), absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error("PATH_TRAVERSAL");
  let cursor = resolve(root);
  for (const part of path.split("/")) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) {
      if (mustExist) throw new Error(`MISSING_INPUT:${path}`);
      break;
    }
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${path}`);
  }
  if (mustExist && !lstatSync(absolute).isFile()) throw new Error(`NOT_REGULAR_FILE:${path}`);
  return absolute;
}

function relativeT031Path(root: string, input: string): string {
  safeT031Path(root, input);
  return input;
}

function readJson(root: string, path: string): { bytes: string; value: unknown } {
  const bytes = readFileSync(safeT031Path(root, path), "utf8");
  try { return { bytes, value: JSON.parse(bytes) as unknown }; } catch { throw new Error(`INVALID_JSON:${path}`); }
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function gitBytes(root: string, revision: string, path: string): Buffer {
  return execFileSync("git", ["show", `${revision}:${path}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
}

function candidateBinding(root: string, candidateRevision: string) {
  if (!/^[0-9a-f]{40}$/.test(candidateRevision)) throw new Error("INVALID_CANDIDATE_REVISION");
  const resolvedRevision = git(root, ["rev-parse", `${candidateRevision}^{commit}`]);
  if (resolvedRevision !== candidateRevision) throw new Error("NON_EXACT_CANDIDATE_REVISION");
  const parent = git(root, ["rev-parse", `${candidateRevision}^`]);
  const tree = git(root, ["show", "-s", "--format=%T", candidateRevision]);
  const packageSha = sha256(gitBytes(root, candidateRevision, "package.json"));
  if (packageSha !== T031_PACKAGE_JSON_SHA256) throw new Error("PACKAGE_SHA_CHANGED");
  return { revision: candidateRevision, parent_revision: parent, tree_sha1: tree, package_json_sha256: packageSha };
}

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function scanSecrets(root: string, candidateRevision: string, distRecords: readonly DistRecord[]) {
  const tracked = git(root, ["ls-tree", "-r", "--name-only", candidateRevision]).split("\n").filter(Boolean);
  const envFiles = tracked.filter((path) => path.split("/").at(-1)?.startsWith(".env"));
  const sourceMaps = [...tracked.filter((path) => path.endsWith(".map")), ...distRecords.filter(({ path }) => path.endsWith(".map")).map(({ path }) => `dist/${path}`)];
  if (envFiles.length > 0) throw new Error(`ENV_FILE_REJECTED:${envFiles.join(",")}`);
  if (sourceMaps.length > 0) throw new Error(`SOURCE_MAP_REJECTED:${sourceMaps.join(",")}`);
  const findings: string[] = [];
  const networkFindings: string[] = [];
  for (const path of tracked) {
    if (!TEXT_EXTENSIONS.has(extension(path))) continue;
    const bytes = gitBytes(root, candidateRevision, path);
    const content = bytes.toString("utf8");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) findings.push(path);
    if (/^src\/.*\.(?:[cm]?[jt]sx?)$/.test(path) && BROWSER_NETWORK_PATTERNS.some((pattern) => pattern.test(content))) networkFindings.push(path);
  }
  for (const record of distRecords) {
    if (!TEXT_EXTENSIONS.has(extension(record.path))) continue;
    const bytes = readFileSync(safeT031Path(root, `dist/${record.path}`));
    const content = bytes.toString("utf8");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) findings.push(`dist/${record.path}`);
  }
  if (findings.length > 0) throw new Error(`SECRET_PATTERN_REJECTED:${findings.join(",")}`);
  if (networkFindings.length > 0) throw new Error(`BROWSER_NETWORK_PRIMITIVE_REJECTED:${networkFindings.join(",")}`);
  return {
    env_files: 0,
    source_maps: 0,
    secret_pattern_findings: 0,
    browser_network_primitive_findings: 0,
    reviewed_browser_network_allowlist: [] as string[],
    scanned_candidate_text_files: tracked.filter((path) => TEXT_EXTENSIONS.has(extension(path))).length,
    scanned_dist_text_files: distRecords.filter(({ path }) => TEXT_EXTENSIONS.has(extension(path))).length,
  };
}

export function auditT031Dist(root: string): { files: DistRecord[]; file_count: number; total_bytes: number; tree_sha256: string } {
  const distRoot = resolve(root, "dist");
  if (!existsSync(distRoot) || !lstatSync(distRoot).isDirectory() || lstatSync(distRoot).isSymbolicLink()) throw new Error("DIST_MISSING_OR_UNSAFE");
  const files: DistRecord[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (entry.name === "." || entry.name === ".." || entry.name.includes("\\") || /[\u0000-\u001f]/.test(entry.name)) throw new Error("UNSAFE_DIST_ENTRY");
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`DIST_SYMLINK_REJECTED:${relativePath}`);
      if (entry.isDirectory()) visit(absolute, relativePath);
      else if (entry.isFile()) {
        const bytes = readFileSync(absolute);
        files.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error(`DIST_NON_REGULAR_REJECTED:${relativePath}`);
    }
  };
  visit(distRoot, "");
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  if (files.length === 0 || !files.some(({ path }) => path === "index.html")) throw new Error("DIST_INDEX_MISSING");
  const treeBytes = files.map(({ path, bytes, sha256: digest }) => `${digest} ${bytes} ${path}\n`).join("");
  return { files, file_count: files.length, total_bytes: files.reduce((sum, file) => sum + file.bytes, 0), tree_sha256: sha256(treeBytes) };
}

function parseCommands(root: string, path: string) {
  const input = readJson(root, path);
  exact(input.value, ["schema_version", "commands"], "COMMAND_INPUT_SCHEMA");
  if (input.value.schema_version !== 1 || !Array.isArray(input.value.commands) || input.value.commands.length !== Object.keys(COMMANDS).length) throw new Error("COMMAND_INPUT_SCHEMA");
  const seen = new Set<string>();
  const commands = input.value.commands.map((raw) => {
    exact(raw, ["id", "command", "log_path", "exit_code", "started_at", "finished_at"], "COMMAND_RECORD_SCHEMA");
    const id = text(raw.id, "COMMAND_ID");
    const expected = COMMANDS[id as keyof typeof COMMANDS];
    if (!expected || seen.has(id) || raw.command !== expected || raw.exit_code !== 0) throw new Error(`COMMAND_NOT_VERIFIED:${id}`);
    seen.add(id);
    const logPath = relativeT031Path(root, text(raw.log_path, "COMMAND_LOG_PATH"));
    const startedAt = iso(raw.started_at, "COMMAND_STARTED_AT");
    const finishedAt = iso(raw.finished_at, "COMMAND_FINISHED_AT");
    if (Date.parse(finishedAt) < Date.parse(startedAt)) throw new Error(`COMMAND_TIME_ORDER:${id}`);
    const logBytes = readFileSync(safeT031Path(root, logPath));
    return { id, command: expected, log_path: logPath, log_bytes: logBytes.length, log_sha256: sha256(logBytes), exit_code: 0, started_at: startedAt, finished_at: finishedAt };
  });
  if (Object.keys(COMMANDS).some((id) => !seen.has(id))) throw new Error("COMMAND_SET_INCOMPLETE");
  commands.sort((a, b) => Object.keys(COMMANDS).indexOf(a.id) - Object.keys(COMMANDS).indexOf(b.id));
  for (let index = 1; index < commands.length; index += 1) {
    if (Date.parse(commands[index].started_at) < Date.parse(commands[index - 1].finished_at)) {
      throw new Error(`COMMAND_SEQUENCE_OVERLAP:${commands[index - 1].id}:${commands[index].id}`);
    }
  }
  return { input_path: path, input_sha256: sha256(input.bytes), records: commands };
}

function smokeSummary(root: string, commands: ReturnType<typeof parseCommands>) {
  const smoke = commands.records.find(({ id }) => id === "smoke");
  if (!smoke) throw new Error("SMOKE_COMMAND_MISSING");
  const lines = readFileSync(safeT031Path(root, smoke.log_path), "utf8").split(/\r?\n/).filter(Boolean);
  let summary: unknown = null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { const candidate = JSON.parse(lines[index]) as unknown; if (candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).command === "smoke:static") { summary = candidate; break; } } catch { /* npm log lines are not JSON */ }
  }
  if (!summary || typeof summary !== "object") throw new Error("SMOKE_SUMMARY_MISSING");
  const value = summary as Record<string, any>;
  if (value.browserErrors !== 0 || value.failedResponses !== 0 || value.externalRequests !== 0 || value.apiRequests !== 0 || value.webSocketRequests !== 0
    || value.staticAssets?.verified !== 621 || value.staticAssets?.notFound !== 0
    || value.lossRestart?.lossPhase !== "RUN_LOST" || value.lossRestart?.restartPhase !== "BETWEEN_NODES"
    || value.lossRestart?.starter?.hp !== 30 || value.lossRestart?.starter?.fuel !== 4 || value.lossRestart?.starter?.deck !== 30 || value.lossRestart?.starter?.firstNode !== "d1-normal-swarm"
    || value.workshopInvariants?.free?.fuelBefore !== 4 || value.workshopInvariants?.free?.fuelAfter !== 4
    || value.workshopInvariants?.paid?.fuelBefore !== 4 || value.workshopInvariants?.paid?.fuelAfter !== 3 || value.workshopInvariants?.paid?.duplicateDiscoveries !== 0
    || value.rewardRestrictions?.normal?.length !== 3 || value.rewardRestrictions?.elite?.length !== 2 || value.rewardRestrictions?.forgeOrEquipmentDirect !== 0
    || value.boss?.heartId !== "heart__still" || value.boss?.phase !== "RUN_WON" || value.boss?.restartPhase !== "BETWEEN_NODES"
    || value.performanceBudgets?.initialRequests !== 1 || value.performanceBudgets?.noncurrentInitialAssets !== 0
    || !Number.isSafeInteger(value.performanceBudgets?.javascriptBytes) || value.performanceBudgets.javascriptBytes > 409_600
    || !Number.isSafeInteger(value.performanceBudgets?.cssBytes) || value.performanceBudgets.cssBytes > 32_768) throw new Error("SMOKE_INVARIANTS_FAILED");
  return {
    log_path: smoke.log_path,
    log_sha256: smoke.log_sha256,
    summary_sha256: sha256(renderT031Json(summary)),
    network: { browser_errors: 0, failed_responses: 0, external_requests: 0, api_requests: 0, web_socket_requests: 0, static_png_verified: 621, not_found: 0 },
    performance_budgets: value.performanceBudgets,
    core_path: value.corePath,
    assertions: { loss_restart: true, starter: "HP30_FUEL4_DECK30_FIRST_NODE", instant_lifetime: true, workshop_modes: true, reward_restrictions: true, boss_heart_victory_restart: true },
  };
}

function parseKnownIssues(root: string, path: string) {
  const input = readJson(root, path);
  exact(input.value, ["schema_version", "issues"], "KNOWN_ISSUES_SCHEMA");
  if (input.value.schema_version !== 1 || !Array.isArray(input.value.issues)) throw new Error("KNOWN_ISSUES_SCHEMA");
  const seen = new Set<string>();
  const issues = input.value.issues.map((raw) => {
    exact(raw, ["id", "status", "summary_ko", "mitigation_ko"], "KNOWN_ISSUE_SCHEMA");
    const id = text(raw.id, "KNOWN_ISSUE_ID");
    if (seen.has(id) || !["OPEN", "ACCEPTED_RISK"].includes(String(raw.status))) throw new Error("KNOWN_ISSUE_INVALID");
    seen.add(id);
    return { id, status: raw.status as "OPEN" | "ACCEPTED_RISK", summary_ko: text(raw.summary_ko, "KNOWN_ISSUE_SUMMARY"), mitigation_ko: text(raw.mitigation_ko, "KNOWN_ISSUE_MITIGATION") };
  });
  if (REQUIRED_KNOWN_ISSUES.some((id) => !seen.has(id))) throw new Error("KNOWN_ISSUES_REQUIRED_BOUNDARY_MISSING");
  return { input_path: path, input_sha256: sha256(input.bytes), issues };
}

function parseManualEvidence(root: string, path: string) {
  const input = readJson(root, path);
  exact(input.value, ["schema_version", "completed_at", "executor", "qa_environment", "recording", "video_path", "checklist", "notes_ko"], "MANUAL_EVIDENCE_SCHEMA");
  if (input.value.schema_version !== 1 || !Array.isArray(input.value.checklist) || input.value.checklist.length !== MANUAL_CHECKS.length) throw new Error("MANUAL_EVIDENCE_SCHEMA");
  const completedAt = iso(input.value.completed_at, "MANUAL_COMPLETED_AT");
  exact(input.value.executor, ["kind", "label"], "MANUAL_EXECUTOR_SCHEMA");
  if (!["CODEX", "HUMAN", "OTHER"].includes(String(input.value.executor.kind))) throw new Error("MANUAL_EXECUTOR_KIND");
  const executor = { kind: input.value.executor.kind as "CODEX" | "HUMAN" | "OTHER", label: text(input.value.executor.label, "MANUAL_EXECUTOR_LABEL") };
  exact(input.value.qa_environment, ["browser_name", "browser_version", "os_name", "os_version", "viewport_css_px", "reduced_motion"], "MANUAL_QA_ENVIRONMENT_SCHEMA");
  if (typeof input.value.qa_environment.reduced_motion !== "boolean") throw new Error("MANUAL_QA_ENVIRONMENT_SCHEMA");
  const qaEnvironment = {
    browser_name: text(input.value.qa_environment.browser_name, "MANUAL_BROWSER_NAME"),
    browser_version: text(input.value.qa_environment.browser_version, "MANUAL_BROWSER_VERSION"),
    os_name: text(input.value.qa_environment.os_name, "MANUAL_OS_NAME"),
    os_version: text(input.value.qa_environment.os_version, "MANUAL_OS_VERSION"),
    viewport_css_px: text(input.value.qa_environment.viewport_css_px, "MANUAL_VIEWPORT"),
    reduced_motion: input.value.qa_environment.reduced_motion,
  };
  exact(input.value.recording, ["captured_by", "capture_tool", "started_at", "finished_at", "continuous", "provenance_notes_ko"], "MANUAL_RECORDING_SCHEMA");
  if (!["CODEX", "HUMAN", "OTHER"].includes(String(input.value.recording.captured_by)) || typeof input.value.recording.continuous !== "boolean") throw new Error("MANUAL_RECORDING_SCHEMA");
  const recordingStartedAt = iso(input.value.recording.started_at, "MANUAL_RECORDING_STARTED_AT");
  const recordingFinishedAt = iso(input.value.recording.finished_at, "MANUAL_RECORDING_FINISHED_AT");
  if (Date.parse(recordingFinishedAt) < Date.parse(recordingStartedAt)) throw new Error("MANUAL_RECORDING_TIME_ORDER");
  const recording = {
    captured_by: input.value.recording.captured_by as "CODEX" | "HUMAN" | "OTHER",
    capture_tool: text(input.value.recording.capture_tool, "MANUAL_CAPTURE_TOOL"),
    started_at: recordingStartedAt,
    finished_at: recordingFinishedAt,
    continuous: input.value.recording.continuous,
    provenance_notes_ko: text(input.value.recording.provenance_notes_ko, "MANUAL_RECORDING_PROVENANCE"),
  };
  if (Date.parse(completedAt) < Date.parse(recording.finished_at)) throw new Error("MANUAL_COMPLETION_BEFORE_RECORDING_FINISHED");
  const videoPath = relativeT031Path(root, text(input.value.video_path, "MANUAL_VIDEO_PATH"));
  const videoBytes = readFileSync(safeT031Path(root, videoPath));
  if (videoBytes.length === 0) throw new Error("MANUAL_VIDEO_EMPTY");
  const seen = new Set<string>();
  const checklist = input.value.checklist.map((raw) => {
    exact(raw, ["id", "status", "notes_ko"], "MANUAL_CHECK_SCHEMA");
    const id = text(raw.id, "MANUAL_CHECK_ID");
    if (!MANUAL_CHECKS.includes(id) || seen.has(id) || raw.status !== "PASS") throw new Error(`MANUAL_CHECK_NOT_PASSED:${id}`);
    seen.add(id);
    return { id, status: "PASS" as const, notes_ko: text(raw.notes_ko, "MANUAL_CHECK_NOTES") };
  });
  if (MANUAL_CHECKS.some((id) => !seen.has(id))) throw new Error("MANUAL_CHECK_SET_INCOMPLETE");
  return { input_path: path, input_sha256: sha256(input.bytes), completed_at: completedAt, executor, qa_environment: qaEnvironment, recording, video_path: videoPath, video_bytes: videoBytes.length, video_sha256: sha256(videoBytes), checklist, notes_ko: text(input.value.notes_ko, "MANUAL_NOTES") };
}

function sectionHashes(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, section]) => [key, sha256(renderT031Json(section))]));
}

function scanEvidenceSecrets(root: string, paths: readonly string[]) {
  const unique = [...new Set(paths)];
  const envFiles = unique.filter((path) => path.split("/").at(-1)?.startsWith(".env"));
  if (envFiles.length > 0) throw new Error(`EVIDENCE_ENV_FILE_REJECTED:${envFiles.join(",")}`);
  const findings = unique.filter((path) => {
    const content = readFileSync(safeT031Path(root, path), "utf8");
    return SECRET_PATTERNS.some((pattern) => pattern.test(content));
  });
  if (findings.length > 0) throw new Error(`EVIDENCE_SECRET_PATTERN_REJECTED:${findings.join(",")}`);
  return { evidence_secret_pattern_findings: 0, scanned_evidence_text_files: unique.length };
}

export function buildT031Record(root: string, paths: RecordInputPaths, candidateRevision = git(root, ["rev-parse", "HEAD"])): T031RecordResult {
  const commandsPath = relativeT031Path(root, paths.commandsPath);
  const knownIssuesPath = relativeT031Path(root, paths.knownIssuesPath);
  const manualEvidencePath = relativeT031Path(root, paths.manualEvidencePath);
  const candidate = candidateBinding(root, candidateRevision);
  const dist = auditT031Dist(root);
  const commands = parseCommands(root, commandsPath);
  const smoke = smokeSummary(root, commands);
  const knownIssues = parseKnownIssues(root, knownIssuesPath);
  const manualEvidence = parseManualEvidence(root, manualEvidencePath);
  const lastCommand = commands.records.at(-1);
  if (!lastCommand || Date.parse(manualEvidence.completed_at) < Date.parse(lastCommand.finished_at)) {
    throw new Error("EVIDENCE_COMPLETION_BEFORE_COMMANDS");
  }
  const secretAudit = {
    ...scanSecrets(root, candidateRevision, dist.files),
    ...scanEvidenceSecrets(root, [commandsPath, ...commands.records.map(({ log_path }) => log_path), knownIssuesPath, manualEvidencePath]),
  };
  const sections = { candidate, dist, commands, smoke, secret_audit: secretAudit, known_issues: knownIssues, manual_evidence: manualEvidence };
  const manifest = {
    schema_version: 1,
    manifest_version: "t031-m3-candidate-audit-v1",
    task_key: "T031",
    milestone_id: "M3_VERTICAL_SLICE",
    contract_sha256: T031_CONTRACT_SHA256,
    recorded_at: manualEvidence.completed_at,
    ...sections,
    section_sha256: sectionHashes(sections),
  };
  const manifestBytes = renderT031Json(manifest);
  const milestone = {
    schema_version: 1,
    milestone_id: "M3_VERTICAL_SLICE",
    task_key: "T031",
    status: "VERIFIED",
    contract_sha256: T031_CONTRACT_SHA256,
    recorded_at: manualEvidence.completed_at,
    candidate_revision: candidate.revision,
    candidate_parent_revision: candidate.parent_revision,
    candidate_tree_sha1: candidate.tree_sha1,
    dist_tree_sha256: dist.tree_sha256,
    audit_manifest_path: T031_MANIFEST_PATH,
    audit_manifest_file_sha256: sha256(manifestBytes),
    manual_video_path: manualEvidence.video_path,
    manual_video_sha256: manualEvidence.video_sha256,
    known_issue_count: knownIssues.issues.length,
    release_or_submission_performed: false,
  };
  return { manifest, milestone, manifestBytes, milestoneBytes: renderT031Json(milestone) };
}

function noClobberState(root: string, path: string, bytes: string): "CREATE" | "IDENTICAL" {
  const absolute = safeT031Path(root, path, false);
  if (!existsSync(absolute)) return "CREATE";
  if (lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile()) throw new Error(`UNSAFE_RECORD_TARGET:${path}`);
  if (readFileSync(absolute, "utf8") !== bytes) throw new Error(`REBASELINE_REQUIRED:${path}`);
  return "IDENTICAL";
}

type InstallHook = (path: string, index: number) => void;

function installT031Records(root: string, records: readonly { path: string; bytes: string }[], beforeInstall?: InstallHook): Array<"CREATED" | "IDENTICAL"> {
  const initial = records.map(({ path, bytes }) => noClobberState(root, path, bytes));
  const created: Array<{ path: string; bytes: string }> = [];
  const results: Array<"CREATED" | "IDENTICAL"> = [];
  try {
    for (let index = 0; index < records.length; index += 1) {
      const { path, bytes } = records[index];
      if (initial[index] === "IDENTICAL") { results.push("IDENTICAL"); continue; }
      beforeInstall?.(path, index);
      const absolute = safeT031Path(root, path, false);
      mkdirSync(dirname(absolute), { recursive: true });
      try {
        writeFileSync(absolute, bytes, { encoding: "utf8", flag: "wx" });
        created.push({ path, bytes });
        results.push("CREATED");
      } catch (error) {
        if (noClobberState(root, path, bytes) === "IDENTICAL") { results.push("IDENTICAL"); continue; }
        throw error;
      }
    }
    return results;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const { path, bytes } of created.reverse()) {
      try {
        const absolute = safeT031Path(root, path, false);
        if (existsSync(absolute) && lstatSync(absolute).isFile() && !lstatSync(absolute).isSymbolicLink() && readFileSync(absolute, "utf8") === bytes) unlinkSync(absolute);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], "T031_RECORD_INSTALL_AND_ROLLBACK_FAILED");
    throw error;
  }
}

export function recordT031(root: string, paths: RecordInputPaths, beforeInstall?: InstallHook): { manifest: "CREATED" | "IDENTICAL"; milestone: "CREATED" | "IDENTICAL"; candidate_revision: string } {
  const built = buildT031Record(root, paths);
  const [manifest, milestone] = installT031Records(root, [
    { path: T031_MANIFEST_PATH, bytes: built.manifestBytes },
    { path: T031_MILESTONE_PATH, bytes: built.milestoneBytes },
  ], beforeInstall);
  return { manifest, milestone, candidate_revision: String((built.manifest.candidate as Record<string, unknown>).revision) };
}

function assertEvidenceCommitBoundary(root: string, manifest: Record<string, any>): void {
  const current = git(root, ["rev-parse", "HEAD"]);
  const candidate = String(manifest.candidate.revision);
  if (current === candidate) return;
  const currentParent = git(root, ["rev-parse", "HEAD^"]);
  if (currentParent !== candidate) throw new Error("EVIDENCE_COMMIT_NOT_DIRECT_CHILD_OF_CANDIDATE");
  const allowed = new Set([
    T031_MANIFEST_PATH,
    T031_MILESTONE_PATH,
    manifest.commands.input_path,
    ...manifest.commands.records.map((record: Record<string, unknown>) => String(record.log_path)),
    manifest.known_issues.input_path,
    manifest.manual_evidence.input_path,
    manifest.manual_evidence.video_path,
  ]);
  const changed = git(root, ["diff", "--name-only", candidate, current]).split("\n").filter(Boolean);
  const unexpected = changed.filter((path) => !allowed.has(path));
  if (unexpected.length > 0) throw new Error(`EVIDENCE_COMMIT_SCOPE_CHANGED:${unexpected.join(",")}`);
  for (const path of allowed) {
    if (!git(root, ["ls-files", "--error-unmatch", path])) throw new Error(`EVIDENCE_INPUT_NOT_TRACKED:${path}`);
    if (git(root, ["diff", "--name-only", "HEAD", "--", path])) throw new Error(`EVIDENCE_INPUT_DIRTY:${path}`);
  }
}

export function checkT031(root: string): { candidate_revision: string; dist_tree_sha256: string; manifest_sha256: string; evidence_boundary: "CANDIDATE_WORKTREE" | "DIRECT_CHILD_EVIDENCE_COMMIT" } {
  const manifestRead = readJson(root, T031_MANIFEST_PATH);
  const milestoneRead = readJson(root, T031_MILESTONE_PATH);
  exact(manifestRead.value, ["schema_version", "manifest_version", "task_key", "milestone_id", "contract_sha256", "recorded_at", "candidate", "dist", "commands", "smoke", "secret_audit", "known_issues", "manual_evidence", "section_sha256"], "T031_MANIFEST_SCHEMA");
  exact(milestoneRead.value, ["schema_version", "milestone_id", "task_key", "status", "contract_sha256", "recorded_at", "candidate_revision", "candidate_parent_revision", "candidate_tree_sha1", "dist_tree_sha256", "audit_manifest_path", "audit_manifest_file_sha256", "manual_video_path", "manual_video_sha256", "known_issue_count", "release_or_submission_performed"], "T031_MILESTONE_SCHEMA");
  const manifest = manifestRead.value as Record<string, any>;
  if (manifest.schema_version !== 1 || manifest.manifest_version !== "t031-m3-candidate-audit-v1" || manifest.contract_sha256 !== T031_CONTRACT_SHA256) throw new Error("T031_MANIFEST_HEADER");
  if ((milestoneRead.value as Record<string, unknown>).status !== "VERIFIED" || (milestoneRead.value as Record<string, unknown>).release_or_submission_performed !== false) throw new Error("T031_MILESTONE_HEADER");
  assertEvidenceCommitBoundary(root, manifest);
  const built = buildT031Record(root, {
    commandsPath: String(manifest.commands.input_path),
    knownIssuesPath: String(manifest.known_issues.input_path),
    manualEvidencePath: String(manifest.manual_evidence.input_path),
  }, String(manifest.candidate.revision));
  if (manifestRead.bytes !== built.manifestBytes) throw new Error("TAMPERED_T031_MANIFEST");
  if (milestoneRead.bytes !== built.milestoneBytes) throw new Error("TAMPERED_T031_MILESTONE");
  return {
    candidate_revision: String(manifest.candidate.revision),
    dist_tree_sha256: String(manifest.dist.tree_sha256),
    manifest_sha256: sha256(manifestRead.bytes),
    evidence_boundary: git(root, ["rev-parse", "HEAD"]) === manifest.candidate.revision ? "CANDIDATE_WORKTREE" : "DIRECT_CHILD_EVIDENCE_COMMIT",
  };
}

export function auditT031Candidate(root: string) {
  const candidate = candidateBinding(root, git(root, ["rev-parse", "HEAD"]));
  const dist = auditT031Dist(root);
  const secretAudit = scanSecrets(root, candidate.revision, dist.files);
  return { schema_version: 1, task_key: "T031", contract_sha256: T031_CONTRACT_SHA256, candidate, dist, secret_audit: secretAudit, writes_performed: false };
}
