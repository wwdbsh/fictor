import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FORGE_RUNTIME_RESOLVER_VERSION, FORGE_RUNTIME_SOURCE_HASH } from "../src/domain/forge-runtime";
import { calculateSourceHash } from "../src/data/generator/render-generated";
import type { Law, Material, ResultClass } from "../src/data/schema/contracts";

export const BROWSER_RUNTIME_PACKET_GENERATOR_VERSION = "browser-runtime-packet-v1" as const;

interface BrowserAssetAvailability {
  readonly manifestSha256: string;
  readonly canonicalCardIds: readonly string[];
}

function canonicalPairBitsetHex(materials: readonly Material[], canonicalCardIds: readonly string[]): string {
  const pairByCardId = new Map<string, readonly [number, number]>();
  for (let left = 0; left < materials.length; left += 1) {
    for (let right = left; right < materials.length; right += 1) {
      const ids = [materials[left].id, materials[right].id].sort();
      pairByCardId.set(`forge__${ids[0]}__${ids[1]}`, [left, right]);
    }
  }
  const bytes = new Uint8Array(Math.ceil((materials.length * materials.length) / 8));
  for (const cardId of canonicalCardIds) {
    const pair = pairByCardId.get(cardId);
    if (!pair) throw new Error(`browser packet canonical asset has no material pair: ${cardId}`);
    const index = pair[0] * materials.length + pair[1];
    bytes[Math.floor(index / 8)] |= 1 << (index % 8);
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

interface T022AssetManifest {
  readonly audit_version: string;
  readonly status: string;
  readonly scope: { readonly cards: { readonly canonical: number } };
  readonly assets: { readonly records: readonly { readonly id: string; readonly category: string; readonly public_path: string }[] };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readBrowserAssetAvailability(repositoryRoot: string): BrowserAssetAvailability {
  const manifestPath = resolve(repositoryRoot, "assets/manifests/t022-m2-assets-audit-v1.json");
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString("utf8")) as T022AssetManifest;
  if (manifest.audit_version !== "t022-m2-assets-audit-v1" || manifest.status !== "VERIFIED") throw new Error("browser packet requires the verified T022 asset manifest");
  const records = manifest.assets.records.filter(({ category }) => category === "CANONICAL");
  if (records.length !== manifest.scope.cards.canonical || records.length !== 489) throw new Error("browser packet canonical asset count must be 489");
  const canonicalCardIds = records.map(({ id, public_path }) => {
    if (public_path !== `public/assets/cards/${id}.png` || !existsSync(resolve(repositoryRoot, public_path))) throw new Error(`browser packet canonical asset is unavailable: ${id}`);
    return id;
  }).sort();
  if (new Set(canonicalCardIds).size !== canonicalCardIds.length) throw new Error("browser packet canonical asset ids must be unique");
  return { manifestSha256: createHash("sha256").update(bytes).digest("hex"), canonicalCardIds };
}

export function buildBrowserRuntimePacket(materials: readonly Material[], laws: readonly Law[], resultClasses: readonly ResultClass[], assetAvailability: BrowserAssetAvailability) {
  const sourceHash = calculateSourceHash([materials, laws, resultClasses]);
  if (sourceHash !== FORGE_RUNTIME_SOURCE_HASH) {
    throw new Error(`browser packet source hash mismatch: ${sourceHash}`);
  }
  if (materials.length !== 52 || laws.length !== 21 || resultClasses.length !== 34) {
    throw new Error("browser packet source counts must be 52/21/34");
  }

  const resolverMaterials = materials.map((item) => ({
    id: item.id,
    attribute: item.attribute,
    modifier_form: item.modifier_form,
    noun_form: item.noun_form,
    representation: item.representation,
    category: item.category,
    balance_status: item.balance_status,
    potency: item.potency,
    cost_base: item.cost_base,
    ...(item.category === "TOOL" ? { tool_domain: item.tool_domain } : {}),
  }));
  const resolverLaws = laws.map((item) => ({
    pair: item.pair,
    result_class: item.result_class,
    actor: item.actor,
    combat_effect: item.combat_effect,
    balance_status: item.balance_status,
    power_coefficient: item.power_coefficient,
    ...(item.drawback === undefined ? {} : { drawback: item.drawback }),
  }));
  const resolverResultClasses = resultClasses.map((item) => ({
    id: item.id,
    family: item.family,
    density: item.density,
    density_status: item.density_status,
    combat_effect: item.combat_effect,
    ...(item.equipment_interactions === undefined ? {} : { equipment_interactions: item.equipment_interactions }),
  }));

  return {
    schemaVersion: "fictor-browser-runtime-packet-v1" as const,
    sourceHash,
    counts: { materials: 52 as const, laws: 21 as const, resultClasses: 34 as const },
    assetAvailability: {
      manifestSha256: assetAvailability.manifestSha256,
      canonicalCardCount: 489 as const,
      materialPairBitsetHex: canonicalPairBitsetHex(materials, assetAvailability.canonicalCardIds),
    },
    resolverContext: {
      resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
      sourceHash: FORGE_RUNTIME_SOURCE_HASH,
      materials: resolverMaterials,
      inputs: { laws: resolverLaws, resultClasses: resolverResultClasses },
    },
    materialDisplay: materials.map((item) => ({
      id: item.id,
      nameKo: item.name_ko,
      art: item.art,
      category: item.category,
      attribute: item.attribute,
    })),
  };
}

export function renderBrowserRuntimePacket(packet: ReturnType<typeof buildBrowserRuntimePacket>): string {
  return [
    'import type { BrowserRuntimePacketV1 } from "./runtime-packet";',
    "",
    `export const BROWSER_RUNTIME_PACKET: BrowserRuntimePacketV1 = ${JSON.stringify(packet, null, 2)};`,
    "",
  ].join("\n");
}

export function runBrowserRuntimePacketGeneration(repositoryRoot: string, checkOnly: boolean) {
  const sourceRoot = resolve(repositoryRoot, "src/data/source");
  const outputPath = resolve(repositoryRoot, "src/application/browser/runtime-packet.generated.ts");
  const materials = readJson<Material[]>(resolve(sourceRoot, "materials.json"));
  const laws = readJson<Law[]>(resolve(sourceRoot, "laws.json"));
  const resultClasses = readJson<ResultClass[]>(resolve(sourceRoot, "resultClasses.json"));
  const assetAvailability = readBrowserAssetAvailability(repositoryRoot);
  const contents = renderBrowserRuntimePacket(buildBrowserRuntimePacket(materials, laws, resultClasses, assetAvailability));

  if (checkOnly) {
    let current: string;
    try { current = readFileSync(outputPath, "utf8"); } catch { throw new Error(`generated file is missing: ${outputPath}`); }
    if (current !== contents) throw new Error(`generated file is stale or tampered: ${outputPath}`);
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    try {
      writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "w" });
      renameSync(temporaryPath, outputPath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
  return { command: checkOnly ? "gen:browser-packet:check" : "gen:browser-packet", generatorVersion: BROWSER_RUNTIME_PACKET_GENERATOR_VERSION, packetFingerprint: packetHash(contents), counts: { materials: 52, laws: 21, resultClasses: 34 } };
}

function packetHash(contents: string): string {
  // This is an evidence label only; source freshness is bound by sourceHash above.
  let value = 0x811c9dc5;
  for (let index = 0; index < contents.length; index += 1) value = Math.imul(value ^ contents.charCodeAt(index), 0x01000193);
  return (value >>> 0).toString(16).padStart(8, "0");
}

function parseArguments(args: readonly string[]): boolean {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) throw new Error("usage: gen-browser-runtime-packet [--check]");
  return args[0] === "--check";
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(JSON.stringify(runBrowserRuntimePacketGeneration(repositoryRoot, parseArguments(process.argv.slice(2)))));
}
