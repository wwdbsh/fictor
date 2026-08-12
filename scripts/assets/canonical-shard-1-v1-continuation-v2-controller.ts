import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runT015V2PreparationCli } from "./canonical-shard-1-v1-continuation-v2-cli";
import { runT015V2JobsHandoff, runT015V2RecoveryOps } from "./canonical-shard-1-v1-continuation-v2-ops-cli";

const MAX_STDIN_BYTES = 2 * 1024 * 1024;
async function readStdin(): Promise<string> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of process.stdin) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > MAX_STDIN_BYTES) throw new Error("T015 v2 controller stdin too large"); chunks.push(bytes); } return Buffer.concat(chunks).toString("utf8"); }
export async function runT015V2Controller(args: readonly string[], stdinJson?: string): Promise<Record<string, unknown>> { const domain = args[0]; const commandArgs = args.slice(1); if (domain === "preparation") return runT015V2PreparationCli(commandArgs); if (domain === "recovery") return commandArgs[0] === "jobs-handoff" ? runT015V2JobsHandoff(commandArgs, stdinJson ?? await readStdin()) : runT015V2RecoveryOps(commandArgs); throw new Error("usage: T015 continuation-v2 controller <preparation|recovery> <command>"); }
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { try { console.log(JSON.stringify(await runT015V2Controller(process.argv.slice(2)))); } catch (error) { console.error(error instanceof Error ? error.message : "T015 continuation-v2 controller failed"); process.exitCode = 1; } }

