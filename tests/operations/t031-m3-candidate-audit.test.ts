import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { createOwnedTempManager } from "../helpers/owned-temp";

import {
  T031_MANIFEST_PATH,
  T031_MILESTONE_PATH,
  auditT031Candidate,
  checkT031,
  recordT031,
  renderT031Json,
} from "../../scripts/t031-m3-candidate-audit";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const tempManager = createOwnedTempManager("t031-m3-candidate-audit");

function write(root: string, path: string, bytes: string | Buffer): void {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), bytes);
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function smokeSummary() {
  return {
    command: "smoke:static",
    browserErrors: 0,
    failedResponses: 0,
    externalRequests: 0,
    apiRequests: 0,
    webSocketRequests: 0,
    browserImageRequests: 26,
    performanceBudgets: { initialRequests: 1, initialAssetBytes: 2_296_255, javascriptBytes: 378_776, cssBytes: 28_028, noncurrentInitialAssets: 0 },
    corePath: "fixture vertical slice",
    staticAssets: { verified: 621, notFound: 0 },
    lossRestart: { lossPhase: "RUN_LOST", restartPhase: "BETWEEN_NODES", starter: { hp: 30, fuel: 4, deck: 30, firstNode: "d1-normal-swarm" } },
    workshopInvariants: { free: { fuelBefore: 4, fuelAfter: 4 }, paid: { fuelBefore: 4, fuelAfter: 3, duplicateDiscoveries: 0 } },
    rewardRestrictions: { normal: [{}, {}, {}], elite: [{}, {}], forgeOrEquipmentDirect: 0 },
    boss: { heartId: "heart__still", phase: "RUN_WON", restartPhase: "BETWEEN_NODES" },
  };
}

function fixture(source = "export const safe = true;\n") {
  const root = tempManager.create("fictor-t031-");
  git(root, ["init", "-q"]);
  copyFileSync(resolve(repositoryRoot, "package.json"), resolve(root, "package.json"));
  write(root, ".gitignore", "dist/\n");
  git(root, ["add", "package.json", ".gitignore"]);
  git(root, ["-c", "user.name=T031 Test", "-c", "user.email=t031@example.invalid", "commit", "-qm", "base"]);
  write(root, "src/safe.ts", source);
  git(root, ["add", "src/safe.ts"]);
  git(root, ["-c", "user.name=T031 Test", "-c", "user.email=t031@example.invalid", "commit", "-qm", "candidate"]);
  write(root, "dist/index.html", "<!doctype html><title>FICTOR</title>\n");
  write(root, "dist/assets/app.js", "console.log('fictor');\n");

  const commandNames = [
    ["clean_install", "npm ci"],
    ["generate_data", "npm run gen:data"],
    ["generated_diff", "git diff --exit-code -- src/data/generated"],
    ["data_check", "npm run gen:data:check"],
    ["t022_audit", "npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts check"],
    ["tests", "npm test"],
    ["typecheck", "npm run typecheck"],
    ["build", "npm run build"],
    ["smoke", "npm run smoke:static"],
  ] as const;
  const commands = commandNames.map(([id, command], index) => {
    const logPath = `docs/milestones/evidence/t031/${id}.log`;
    write(root, logPath, id === "smoke" ? `${JSON.stringify(smokeSummary())}\n` : id === "generated_diff" ? "" : `${id} passed\n`);
    const startedSecond = String(index * 2).padStart(2, "0");
    const finishedSecond = String(index * 2 + 1).padStart(2, "0");
    return { id, command, log_path: logPath, exit_code: 0, started_at: `2026-08-15T00:00:${startedSecond}.000Z`, finished_at: `2026-08-15T00:00:${finishedSecond}.000Z` };
  });
  const commandsPath = "docs/milestones/evidence/t031/commands.json";
  const knownIssuesPath = "docs/milestones/evidence/t031/known-issues.json";
  const manualEvidencePath = "docs/milestones/evidence/t031/manual-evidence.json";
  const videoPath = "docs/playtests/t031/manual.webm";
  write(root, commandsPath, renderT031Json({ schema_version: 1, commands }));
  write(root, knownIssuesPath, renderT031Json({ schema_version: 1, issues: [
    { id: "T015_OWNER_JOURNALS", status: "OPEN", summary_ko: "소유자 저널은 clean clone에 없다.", mitigation_ko: "owner-only skip과 T022 tracked 감사를 분리한다." },
    { id: "T027_PROVISIONAL_BALANCE", status: "ACCEPTED_RISK", summary_ko: "밸런스는 잠정값이다.", mitigation_ko: "8월 21일 플레이 뒤 조정한다." },
  ] }));
  write(root, videoPath, Buffer.from("real test fixture video bytes"));
  write(root, manualEvidencePath, renderT031Json({
    schema_version: 1,
    completed_at: "2026-08-15T01:00:00.000Z",
    executor: { kind: "CODEX", label: "Codex fixture executor" },
    qa_environment: { browser_name: "Chromium", browser_version: "fixture-1", os_name: "macOS", os_version: "fixture-1", viewport_css_px: "1440x900", reduced_motion: false },
    recording: { captured_by: "CODEX", capture_tool: "Browser recording fixture", started_at: "2026-08-15T00:30:00.000Z", finished_at: "2026-08-15T00:59:00.000Z", continuous: true, provenance_notes_ko: "Codex가 Browser를 조작하고 fixture 녹화를 생성했다." },
    video_path: videoPath,
    checklist: ["LOSS_RESTART", "INSTANT_LIFETIME", "WORKSHOP_CANONICAL", "REWARD_RESTRICTIONS", "BOSS_VICTORY_RESTART"].map((id) => ({ id, status: "PASS", notes_ko: `${id} 화면 확인` })),
    notes_ko: "테스트 fixture 수동 증거다.",
  }));
  return { root, paths: { commandsPath, knownIssuesPath, manualEvidencePath } };
}

describe("T031 candidate audit and immutable evidence boundary", () => {
  test("audits deterministically and records with explicit no-clobber semantics", () => {
    const prepared = fixture();
    const audit = auditT031Candidate(prepared.root);
    expect(audit).toMatchObject({ writes_performed: false, secret_audit: { secret_pattern_findings: 0, browser_network_primitive_findings: 0 }, dist: { file_count: 2 } });
    expect(recordT031(prepared.root, prepared.paths)).toMatchObject({ manifest: "CREATED", milestone: "CREATED" });
    expect(JSON.parse(readFileSync(resolve(prepared.root, T031_MILESTONE_PATH), "utf8"))).toMatchObject({ status: "VERIFIED", release_or_submission_performed: false });
    const manifest = JSON.parse(readFileSync(resolve(prepared.root, T031_MANIFEST_PATH), "utf8"));
    expect(manifest.commands.records.map(({ id }: { id: string }) => id)).toEqual(["clean_install", "generate_data", "generated_diff", "data_check", "t022_audit", "tests", "typecheck", "build", "smoke"]);
    expect(manifest.manual_evidence).toMatchObject({ executor: { kind: "CODEX" }, recording: { captured_by: "CODEX", continuous: true }, qa_environment: { browser_name: "Chromium", viewport_css_px: "1440x900" } });
    expect(recordT031(prepared.root, prepared.paths)).toMatchObject({ manifest: "IDENTICAL", milestone: "IDENTICAL" });
    expect(checkT031(prepared.root)).toMatchObject({ evidence_boundary: "CANDIDATE_WORKTREE", dist_tree_sha256: audit.dist.tree_sha256 });
    const known = JSON.parse(readFileSync(resolve(prepared.root, prepared.paths.knownIssuesPath), "utf8"));
    known.issues[0].mitigation_ko = "다른 바이트";
    write(prepared.root, prepared.paths.knownIssuesPath, renderT031Json(known));
    expect(() => recordT031(prepared.root, prepared.paths)).toThrow(`REBASELINE_REQUIRED:${T031_MANIFEST_PATH}`);
  });

  test("verifies an evidence Commit B only when it is the direct child of candidate Commit A", () => {
    const prepared = fixture();
    recordT031(prepared.root, prepared.paths);
    git(prepared.root, ["add", "-f", "docs", "assets"]);
    git(prepared.root, ["-c", "user.name=T031 Test", "-c", "user.email=t031@example.invalid", "commit", "-qm", "evidence"]);
    expect(checkT031(prepared.root)).toMatchObject({ evidence_boundary: "DIRECT_CHILD_EVIDENCE_COMMIT" });
  });

  test("rejects manifest and milestone tampering", () => {
    const prepared = fixture();
    recordT031(prepared.root, prepared.paths);
    const manifest = JSON.parse(readFileSync(resolve(prepared.root, T031_MANIFEST_PATH), "utf8"));
    manifest.recorded_at = "2026-08-15T02:00:00.000Z";
    write(prepared.root, T031_MANIFEST_PATH, renderT031Json(manifest));
    expect(() => checkT031(prepared.root)).toThrow("TAMPERED_T031_MANIFEST");

    const second = fixture();
    recordT031(second.root, second.paths);
    const milestone = JSON.parse(readFileSync(resolve(second.root, T031_MILESTONE_PATH), "utf8"));
    milestone.dist_tree_sha256 = "0".repeat(64);
    write(second.root, T031_MILESTONE_PATH, renderT031Json(milestone));
    expect(() => checkT031(second.root)).toThrow("TAMPERED_T031_MILESTONE");
  });

  test("rolls back only the first output created by this invocation when the second target races", () => {
    const prepared = fixture();
    const racedBytes = "different concurrent milestone bytes\n";
    expect(() => recordT031(prepared.root, prepared.paths, (path, index) => {
      if (index === 1) write(prepared.root, path, racedBytes);
    })).toThrow(`REBASELINE_REQUIRED:${T031_MILESTONE_PATH}`);
    expect(existsSync(resolve(prepared.root, T031_MANIFEST_PATH))).toBe(false);
    expect(readFileSync(resolve(prepared.root, T031_MILESTONE_PATH), "utf8")).toBe(racedBytes);
  });

  test("rejects traversal and symlinked evidence inputs", () => {
    const prepared = fixture();
    expect(() => recordT031(prepared.root, { ...prepared.paths, commandsPath: "../commands.json" })).toThrow(/UNSAFE_PATH|PATH_TRAVERSAL/);
    const linkPath = "docs/milestones/evidence/t031/commands-link.json";
    symlinkSync(resolve(prepared.root, prepared.paths.commandsPath), resolve(prepared.root, linkPath));
    expect(() => recordT031(prepared.root, { ...prepared.paths, commandsPath: linkPath })).toThrow("SYMLINK_REJECTED");
  });

  test("rejects secret patterns, source maps, and browser network primitives", () => {
    const fakeToken = ["sk", "abcdefghijklmnopqrstuvwxyz"].join("-");
    const secret = fixture(`export const credential = '${fakeToken}';\n`);
    expect(() => auditT031Candidate(secret.root)).toThrow("SECRET_PATTERN_REJECTED");
    const network = fixture("export const request = () => fetch('/api');\n");
    expect(() => auditT031Candidate(network.root)).toThrow("BROWSER_NETWORK_PRIMITIVE_REJECTED");
    const sourceMap = fixture();
    write(sourceMap.root, "dist/assets/app.js.map", "{}\n");
    expect(() => auditT031Candidate(sourceMap.root)).toThrow("SOURCE_MAP_REJECTED");
    const evidenceSecret = fixture();
    const fakeEvidenceToken = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
    write(evidenceSecret.root, "docs/milestones/evidence/t031/build.log", `${fakeEvidenceToken}\n`);
    expect(() => recordT031(evidenceSecret.root, evidenceSecret.paths)).toThrow("EVIDENCE_SECRET_PATTERN_REJECTED");
  });

  test("requires exact command schema and the separately mandatory tracked T022 command", () => {
    const prepared = fixture();
    const commands = JSON.parse(readFileSync(resolve(prepared.root, prepared.paths.commandsPath), "utf8"));
    commands.commands = commands.commands.filter(({ id }: { id: string }) => id !== "t022_audit");
    write(prepared.root, prepared.paths.commandsPath, renderT031Json(commands));
    expect(() => recordT031(prepared.root, prepared.paths)).toThrow(/COMMAND_INPUT_SCHEMA|COMMAND_SET_INCOMPLETE/);
  });

  test("requires command-to-command chronology and evidence completion after the final command", () => {
    const overlapping = fixture();
    const overlappingCommands = JSON.parse(readFileSync(resolve(overlapping.root, overlapping.paths.commandsPath), "utf8"));
    overlappingCommands.commands[5].started_at = overlappingCommands.commands[4].started_at;
    write(overlapping.root, overlapping.paths.commandsPath, renderT031Json(overlappingCommands));
    expect(() => recordT031(overlapping.root, overlapping.paths)).toThrow("COMMAND_SEQUENCE_OVERLAP:t022_audit:tests");

    const earlyCompletion = fixture();
    const lateCommands = JSON.parse(readFileSync(resolve(earlyCompletion.root, earlyCompletion.paths.commandsPath), "utf8"));
    lateCommands.commands[8].started_at = "2026-08-15T01:01:00.000Z";
    lateCommands.commands[8].finished_at = "2026-08-15T01:02:00.000Z";
    write(earlyCompletion.root, earlyCompletion.paths.commandsPath, renderT031Json(lateCommands));
    expect(() => recordT031(earlyCompletion.root, earlyCompletion.paths)).toThrow("EVIDENCE_COMPLETION_BEFORE_COMMANDS");
  });
});
