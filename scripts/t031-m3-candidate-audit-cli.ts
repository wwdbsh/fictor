import process from "node:process";

import {
  auditT031Candidate,
  checkT031,
  recordT031,
  renderT031Json,
} from "./t031-m3-candidate-audit";

function valueAfter(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`MISSING_ARGUMENT:${name}`);
  return value;
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  const root = process.cwd();
  if (command === "audit") {
    if (args.length !== 0) throw new Error("USAGE: audit");
    process.stdout.write(renderT031Json(auditT031Candidate(root)));
    return;
  }
  if (command === "record") {
    const expected = ["--commands", "--known-issues", "--manual-evidence"];
    if (args.length !== 6 || args.filter((value) => value.startsWith("--")).some((value) => !expected.includes(value))) throw new Error("USAGE: record --commands PATH --known-issues PATH --manual-evidence PATH");
    process.stdout.write(renderT031Json(recordT031(root, {
      commandsPath: valueAfter(args, "--commands"),
      knownIssuesPath: valueAfter(args, "--known-issues"),
      manualEvidencePath: valueAfter(args, "--manual-evidence"),
    })));
    return;
  }
  if (command === "check") {
    if (args.length !== 0) throw new Error("USAGE: check");
    process.stdout.write(renderT031Json(checkT031(root)));
    return;
  }
  throw new Error("USAGE: audit | record --commands PATH --known-issues PATH --manual-evidence PATH | check");
}

try { main(); } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
