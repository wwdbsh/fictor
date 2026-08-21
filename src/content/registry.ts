import { STILLKIN_DESCRIPTOR } from "./races/stillkin";
import { BURNKIN_DESCRIPTOR } from "./races/burnkin";
import { JOINKIN_DESCRIPTOR } from "./races/joinkin";
import { ICE_GROUND_DESCRIPTOR } from "./grounds/ice";
import { BURN_GROUND_DESCRIPTOR } from "./grounds/burn";
import { SCATTER_GROUND_DESCRIPTOR } from "./grounds/scatter";
import { ROT_GROUND_DESCRIPTOR } from "./grounds/rot";
import { freeze } from "../freeze";
import type {
  AssetLookup,
  AssetReference,
  ContentRegistry,
  GroundDescriptor,
  GroundId,
  RaceDescriptor,
  RaceId,
  RegistryLookup,
} from "./types";

const disabledRace = (
  id: Exclude<RaceId, "Stillkin" | "Burnkin" | "Joinkin">,
  nameKo: string,
  attribute: RaceDescriptor["attribute"],
): RaceDescriptor =>
  freeze({
    id,
    nameKo,
    labelKo: nameKo,
    attribute,
    status: "DISABLED",
    enabled: false,
    groundIds: freeze([]),
    policyId: null,
  });

const disabledGround = (
  id: Exclude<GroundId, "GROUND_STILL" | "GROUND_BURN" | "GROUND_SCATTER" | "GROUND_ROT">,
  nameKo: string,
  attribute: GroundDescriptor["attribute"],
): GroundDescriptor =>
  freeze({
    id,
    nameKo,
    labelKo: nameKo,
    attribute,
    status: "DISABLED",
    enabled: false,
    depths: freeze([]),
    encounters: null,
    rewards: null,
    events: freeze([]),
  });

const KNOWN_RACES: readonly RaceDescriptor[] = freeze([
  STILLKIN_DESCRIPTOR,
  BURNKIN_DESCRIPTOR,
  JOINKIN_DESCRIPTOR,
  disabledRace("Scatterkin", "흩음붙이", "SCATTER"),
  disabledRace("Rotkin", "삭음붙이", "ROT"),
  disabledRace("Washkin", "씻음붙이", "WASH"),
]);

const KNOWN_GROUNDS: readonly GroundDescriptor[] = freeze([
  ICE_GROUND_DESCRIPTOR,
  BURN_GROUND_DESCRIPTOR,
  SCATTER_GROUND_DESCRIPTOR,
  ROT_GROUND_DESCRIPTOR,
  disabledGround("GROUND_WASH", "씻음의 터", "WASH"),
  disabledGround("GROUND_JOIN", "이음의 터", "JOIN"),
]);

function createAssetAllowlist(): readonly AssetReference[] {
  const references = KNOWN_GROUNDS.flatMap((ground) => {
    const encounterAssets = ground.encounters === null ? [] : [
      ...ground.encounters.normals.map(({ asset }) => asset),
      ground.encounters.elite.asset,
      ground.encounters.boss.asset,
    ];
    return [
      ...ground.depths.map(({ asset }) => asset),
      ...encounterAssets,
      ...ground.events.map(({ asset }) => asset),
    ];
  });
  return freeze(Array.from(new Map(
    references.map((reference) => [reference.id, reference] as const),
  ).values()));
}

const ASSET_ALLOWLIST = /* @__PURE__ */ createAssetAllowlist();

const REGISTRY: ContentRegistry = freeze({ races: KNOWN_RACES, grounds: KNOWN_GROUNDS });

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return freeze(value.map((item) => cloneAndFreeze(item))) as T;
  }
  if (typeof value === "object" && value !== null) {
    const copy = {} as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) copy[key] = cloneAndFreeze(item);
    return freeze(copy) as T;
  }
  return value;
}

export const CONTENT_REGISTRY = cloneAndFreeze(REGISTRY);
export const contentRegistry = CONTENT_REGISTRY;
export const ASSET_PATH_ALLOWLIST = /* @__PURE__ */ cloneAndFreeze(ASSET_ALLOWLIST);
export const CONTENT_CARDINALITIES = /* @__PURE__ */ freeze({
  enabledRaces: 3,
  enabledGrounds: 4,
  enabledDepths: 12,
  enabledNormalEnemies: 20,
  enabledElites: 4,
  enabledBosses: 4,
  enabledEventVariations: 24,
  stillDepths: 3,
  stillNormalEnemies: 5,
  stillElites: 1,
  stillBosses: 1,
  stillEvents: 6,
  burnDepths: 3,
  burnNormalEnemies: 5,
  burnElites: 1,
  burnBosses: 1,
  burnEvents: 6,
  scatterDepths: 3,
  scatterNormalEnemies: 5,
  scatterElites: 1,
  scatterBosses: 1,
  scatterEvents: 6,
  rotDepths: 3,
  rotNormalEnemies: 5,
  rotElites: 1,
  rotBosses: 1,
  rotEvents: 6,
});
export const ENABLED_RACE_IDS = /* @__PURE__ */ freeze(["Stillkin", "Burnkin", "Joinkin"] as const);
export const ENABLED_GROUND_IDS = /* @__PURE__ */ freeze(["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER", "GROUND_ROT"] as const);

function lookup<T extends { id: string; enabled: boolean }>(
  values: readonly T[],
  id: unknown,
): RegistryLookup<T> {
  if (typeof id !== "string") return { status: "MISSING" };
  const value = values.find((candidate) => candidate.id === id);
  if (!value) return { status: "MISSING" };
  return { status: value.enabled ? "ENABLED" : "DISABLED", value: cloneAndFreeze(value) };
}

export function lookupRace(id: unknown): RegistryLookup<RaceDescriptor> {
  return lookup(CONTENT_REGISTRY.races, id);
}

export function lookupGround(id: unknown): RegistryLookup<GroundDescriptor> {
  return lookup(CONTENT_REGISTRY.grounds, id);
}

export function resolveRace(id: unknown): RegistryLookup<RaceDescriptor> {
  return lookupRace(id);
}

export function resolveGround(id: unknown): RegistryLookup<GroundDescriptor> {
  return lookupGround(id);
}

export function getRaceDescriptor(id: unknown): RaceDescriptor | undefined {
  const result = lookupRace(id);
  return result.status === "MISSING" ? undefined : result.value;
}

export function getGroundDescriptor(id: unknown): GroundDescriptor | undefined {
  const result = lookupGround(id);
  return result.status === "MISSING" ? undefined : result.value;
}

export function getEnabledRace(id: unknown): RaceDescriptor | undefined {
  const result = lookupRace(id);
  return result.status === "ENABLED" ? result.value : undefined;
}

export function getEnabledGround(id: unknown): GroundDescriptor | undefined {
  const result = lookupGround(id);
  return result.status === "ENABLED" ? result.value : undefined;
}

export function listEnabledRaces(): readonly RaceDescriptor[] {
  return cloneAndFreeze(CONTENT_REGISTRY.races.filter((race) => race.enabled));
}

export function listEnabledGrounds(): readonly GroundDescriptor[] {
  return cloneAndFreeze(CONTENT_REGISTRY.grounds.filter((ground) => ground.enabled));
}

export function lookupAsset(id: unknown): AssetLookup {
  if (typeof id !== "string") return { status: "MISSING" };
  const found = ASSET_PATH_ALLOWLIST.find((asset) => asset.id === id);
  return found ? { status: "FOUND", asset: cloneAndFreeze(found) } : { status: "MISSING" };
}

export function resolveAssetPath(id: unknown): string | undefined {
  return lookupAsset(id).asset?.path;
}

export function listKnownRaces(): readonly RaceDescriptor[] {
  return cloneAndFreeze(CONTENT_REGISTRY.races);
}

export function listKnownGrounds(): readonly GroundDescriptor[] {
  return cloneAndFreeze(CONTENT_REGISTRY.grounds);
}

export function getContentRegistry(): ContentRegistry {
  return cloneAndFreeze(CONTENT_REGISTRY);
}

export const getRegistry = getContentRegistry;

export { KNOWN_GROUNDS, KNOWN_RACES };
