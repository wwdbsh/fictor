import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runT015V3Preparation } from "./canonical-shard-1-recovery-v3-cli";
import { runT015V3JobsHandoff, runT015V3Ops, tombstoneT015V1PaidRoute } from "./canonical-shard-1-recovery-v3-ops";

const MAX_STDIN_BYTES = 2 * 1024 * 1024;
async function stdin(): Promise<string> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of process.stdin) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > MAX_STDIN_BYTES) throw new Error("T015 v3 stdin too large"); chunks.push(bytes); } return Buffer.concat(chunks).toString("utf8"); }
export async function runT015V3Controller(args: readonly string[], input?: string): Promise<Record<string, unknown>> { const domain = args[0]; const rest = args.slice(1); if (domain === "preparation") return runT015V3Preparation(rest); if (domain === "recovery") return rest[0] === "jobs-handoff" ? runT015V3JobsHandoff(rest, input ?? await stdin()) : runT015V3Ops(rest); if (domain === "v1-paid-tombstone") return tombstoneT015V1PaidRoute(); throw new Error("usage: T015 recovery-v3 controller <preparation|recovery|v1-paid-tombstone>"); }
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { try { console.log(JSON.stringify(await runT015V3Controller(process.argv.slice(2)))); } catch (error) { console.error(error instanceof Error ? error.message : "T015 v3 failed"); process.exitCode = 1; } }
