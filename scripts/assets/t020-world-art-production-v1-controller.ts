import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runT020Preparation } from "./t020-world-art-production-v1-cli";
import { runT020JobsHandoff, runT020Ops } from "./t020-world-art-production-v1-ops";

const MAX_STDIN_BYTES = 2 * 1024 * 1024;
async function stdin(): Promise<string> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of process.stdin) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > MAX_STDIN_BYTES) throw new Error("T020 stdin too large"); chunks.push(bytes); } return Buffer.concat(chunks).toString("utf8"); }
export async function runT020Controller(args: readonly string[], input?: string): Promise<Record<string, unknown>> {
  const domain = args[0];
  const rest = args.slice(1);
  if (domain === "preparation") return runT020Preparation(rest);
  if (domain === "production") return rest[0] === "jobs-handoff" ? runT020JobsHandoff(rest, input ?? await stdin()) : runT020Ops(rest);
  throw new Error("usage: t020-world-art controller <preparation|production>");
}
// Execution entry is this file run directly with `npx tsx`, never an npm script: package.json
// bytes must stay out of the T020 implementation binding.
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { try { console.log(JSON.stringify(await runT020Controller(process.argv.slice(2)))); } catch (error) { console.error(error instanceof Error ? error.message : "T020 failed"); process.exitCode = 1; } }
