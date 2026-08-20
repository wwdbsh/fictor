import { STILLKIN_DESCRIPTOR } from "./races/stillkin";
import { BURNKIN_DESCRIPTOR } from "./races/burnkin";
import { JOINKIN_DESCRIPTOR } from "./races/joinkin";
import { ICE_GROUND_DESCRIPTOR } from "./grounds/ice";
import { BURN_GROUND_DESCRIPTOR } from "./grounds/burn";
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
  Object.freeze({
    id,
    nameKo,
    labelKo: nameKo,
    attribute,
    status: "DISABLED",
    enabled: false,
    groundIds: Object.freeze([]),
    policyId: null,
  });

const disabledGround = (
  id: Exclude<GroundId, "GROUND_STILL" | "GROUND_BURN">,
  nameKo: string,
  attribute: GroundDescriptor["attribute"],
): GroundDescriptor =>
  Object.freeze({
    id,
    nameKo,
    labelKo: nameKo,
    attribute,
    status: "DISABLED",
    enabled: false,
    depths: Object.freeze([]),
    encounters: null,
    rewards: null,
    events: Object.freeze([]),
  });

const KNOWN_RACES: readonly RaceDescriptor[] = Object.freeze([
  STILLKIN_DESCRIPTOR,
  BURNKIN_DESCRIPTOR,
  JOINKIN_DESCRIPTOR,
  disabledRace("Scatterkin", "흩음붙이", "SCATTER"),
  disabledRace("Rotkin", "삭음붙이", "ROT"),
  disabledRace("Washkin", "씻음붙이", "WASH"),
]);

const KNOWN_GROUNDS: readonly GroundDescriptor[] = Object.freeze([
  ICE_GROUND_DESCRIPTOR,
  BURN_GROUND_DESCRIPTOR,
  disabledGround("GROUND_SCATTER", "흩음의 터", "SCATTER"),
  disabledGround("GROUND_ROT", "삭음의 터", "ROT"),
  disabledGround("GROUND_WASH", "씻음의 터", "WASH"),
  disabledGround("GROUND_JOIN", "이음의 터", "JOIN"),
]);

const ASSET_ALLOWLIST: readonly AssetReference[] = Object.freeze([
  { id: "background__still__depth_01", path: "/assets/backgrounds/background__still__depth_01.png" },
  { id: "background__still__depth_02", path: "/assets/backgrounds/background__still__depth_02.png" },
  { id: "background__still__depth_03", path: "/assets/backgrounds/background__still__depth_03.png" },
  { id: "enemy__still__swarm", path: "/assets/enemies/enemy__still__swarm.png" },
  { id: "enemy__still__bulk", path: "/assets/enemies/enemy__still__bulk.png" },
  { id: "enemy__still__shell", path: "/assets/enemies/enemy__still__shell.png" },
  { id: "enemy__still__reach", path: "/assets/enemies/enemy__still__reach.png" },
  { id: "enemy__still__mimic", path: "/assets/enemies/enemy__still__mimic.png" },
  { id: "elite__still__burn", path: "/assets/enemies/elite__still__burn.png" },
  { id: "heart__still", path: "/assets/cards/heart__still.png" },
  { id: "event__cache__still", path: "/assets/events/event__cache__still.png" },
  { id: "event__workshop", path: "/assets/events/event__workshop.png" },
  { id: "event__collapse", path: "/assets/events/event__collapse.png" },
  { id: "event__fictor", path: "/assets/events/event__fictor.png" },
  { id: "event__record", path: "/assets/events/event__record.png" },
  { id: "event__oddity__still", path: "/assets/events/event__oddity__still.png" },
  { id: "background__burn__depth_01", path: "/assets/backgrounds/background__burn__depth_01.png" },
  { id: "background__burn__depth_02", path: "/assets/backgrounds/background__burn__depth_02.png" },
  { id: "background__burn__depth_03", path: "/assets/backgrounds/background__burn__depth_03.png" },
  { id: "enemy__burn__swarm", path: "/assets/enemies/enemy__burn__swarm.png" },
  { id: "enemy__burn__bulk", path: "/assets/enemies/enemy__burn__bulk.png" },
  { id: "enemy__burn__shell", path: "/assets/enemies/enemy__burn__shell.png" },
  { id: "enemy__burn__reach", path: "/assets/enemies/enemy__burn__reach.png" },
  { id: "enemy__burn__mimic", path: "/assets/enemies/enemy__burn__mimic.png" },
  { id: "elite__burn__scatter", path: "/assets/enemies/elite__burn__scatter.png" },
  { id: "heart__burn", path: "/assets/cards/heart__burn.png" },
  { id: "event__cache__burn", path: "/assets/events/event__cache__burn.png" },
  { id: "event__collapse__burn", path: "/assets/events/event__collapse__burn.png" },
  { id: "event__oddity__burn", path: "/assets/events/event__oddity__burn.png" },
].map((reference) => Object.freeze(reference)));

const REGISTRY: ContentRegistry = Object.freeze({ races: KNOWN_RACES, grounds: KNOWN_GROUNDS });

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item))) as T;
  }
  if (typeof value === "object" && value !== null) {
    const copy = {} as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) copy[key] = cloneAndFreeze(item);
    return Object.freeze(copy) as T;
  }
  return value;
}

export const CONTENT_REGISTRY = cloneAndFreeze(REGISTRY);
export const contentRegistry = CONTENT_REGISTRY;
export const ASSET_PATH_ALLOWLIST = cloneAndFreeze(ASSET_ALLOWLIST);
export const CONTENT_CARDINALITIES = Object.freeze({
  enabledRaces: 3,
  enabledGrounds: 2,
  enabledDepths: 6,
  enabledNormalEnemies: 10,
  enabledElites: 2,
  enabledBosses: 2,
  enabledEventVariations: 12,
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
});
export const ENABLED_RACE_IDS = Object.freeze(["Stillkin", "Burnkin", "Joinkin"] as const);
export const ENABLED_GROUND_IDS = Object.freeze(["GROUND_STILL", "GROUND_BURN"] as const);

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
