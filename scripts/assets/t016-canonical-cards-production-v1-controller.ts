import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runT016Preparation } from "./t016-canonical-cards-production-v1-cli";
import { runT016JobsHandoff, runT016Ops } from "./t016-canonical-cards-production-v1-ops";

const MAX_STDIN_BYTES = 2 * 1024 * 1024;
async function stdin(): Promise<string> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of process.stdin) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > MAX_STDIN_BYTES) throw new Error("T016 stdin too large"); chunks.push(bytes); } return Buffer.concat(chunks).toString("utf8"); }
export async function runT016Controller(args: readonly string[], input?: string): Promise<Record<string, unknown>> {
  const domain = args[0];
  const rest = args.slice(1);
  if (domain === "preparation") return runT016Preparation(rest);
  if (domain === "production") return rest[0] === "jobs-handoff" ? runT016JobsHandoff(rest, input ?? await stdin()) : runT016Ops(rest);
  throw new Error("usage: t016-canonical-cards controller <preparation|production>");
}
// Execution entry is this file run directly with `npx tsx`, never an npm script: package.json
// bytes must stay out of the T016 implementation binding.
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { try { console.log(JSON.stringify(await runT016Controller(process.argv.slice(2)))); } catch (error) { console.error(error instanceof Error ? error.message : "T016 failed"); process.exitCode = 1; } }
