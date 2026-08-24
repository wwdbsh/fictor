import process from "node:process";

import { assertT055Complete, checkT055 } from "./t055-account-model-rights-audit";

export function runT055Cli(argv: readonly string[], root = process.cwd()): Record<string, unknown> {
  if (argv.length !== 1) throw new Error("Usage: t055-account-model-rights-audit-cli.ts <check|assert-complete>");
  if (argv[0] === "check") return { command: "check", ...checkT055(root) };
  if (argv[0] === "assert-complete") return assertT055Complete(root);
  throw new Error("Usage: t055-account-model-rights-audit-cli.ts <check|assert-complete>");
}

try {
  console.log(JSON.stringify(runT055Cli(process.argv.slice(2))));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
