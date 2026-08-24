import process from "node:process";

import { assertT055Complete, assertT055OwnerDisposition, checkT055 } from "./t055-account-model-rights-audit";

const USAGE = "Usage: t055-account-model-rights-audit-cli.ts <check|assert-complete|assert-owner-disposition>";

export function runT055Cli(argv: readonly string[], root = process.cwd()): Record<string, unknown> {
  if (argv.length !== 1) throw new Error(USAGE);
  if (argv[0] === "check") return { command: "check", ...checkT055(root) };
  if (argv[0] === "assert-complete") return assertT055Complete(root);
  if (argv[0] === "assert-owner-disposition") return { command: "assert-owner-disposition", ...assertT055OwnerDisposition(root) };
  throw new Error(USAGE);
}

try {
  console.log(JSON.stringify(runT055Cli(process.argv.slice(2))));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
