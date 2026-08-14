import { getEnabledGround, type GroundDescriptor } from "../../content";
import { STILLKIN_TRACK1_PROVISIONAL_CONFIG as CONFIG } from "./track1-config";

const EXPECTED_EVENT_TYPES = ["CACHE", "COLLAPSE", "FICTOR", "ODDITY", "RECORD", "WORKSHOP"] as const;

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

export function isStillkinTrack1GroundAuthorityValid(ground: GroundDescriptor | undefined): boolean {
  if (!ground || ground.id !== "GROUND_STILL" || ground.enabled !== true || ground.status !== "ENABLED" || ground.attribute !== "STILL") return false;
  if (JSON.stringify(ground.depths.map(({ depth }) => depth)) !== JSON.stringify([1, 2, 3])) return false;
  if (!ground.encounters) return false;

  const encounterNodes = CONFIG.route.filter((node) => node.kind === "ENCOUNTER");
  const normalIds = new Set(ground.encounters.normals.map(({ id }) => id));
  for (const node of encounterNodes) {
    if (node.encounterKind === "NORMAL" && (node.depth !== 1 || !normalIds.has(node.encounterId))) return false;
    if (node.encounterKind === "ELITE" && (node.depth !== 2 || node.encounterId !== ground.encounters.elite.id)) return false;
    if (node.encounterKind === "BOSS" && (node.depth !== 3 || node.encounterId !== ground.encounters.boss.id)) return false;
  }
  if (!encounterNodes.some(({ encounterKind }) => encounterKind === "NORMAL")
    || !encounterNodes.some(({ encounterKind }) => encounterKind === "ELITE")
    || !encounterNodes.some(({ encounterKind }) => encounterKind === "BOSS")) return false;

  const routeEventTypes = sorted(CONFIG.route.filter((node) => node.kind === "EVENT").map(({ eventType }) => eventType));
  const descriptorEventTypes = sorted(ground.events.map(({ type }) => type));
  if (JSON.stringify(routeEventTypes) !== JSON.stringify(EXPECTED_EVENT_TYPES)
    || JSON.stringify(descriptorEventTypes) !== JSON.stringify(EXPECTED_EVENT_TYPES)) return false;

  const boss = ground.encounters.boss;
  return boss.assetId === CONFIG.offers.heartId
    && boss.asset.id === CONFIG.offers.heartId
    && boss.reusesCardAssetId === CONFIG.offers.heartId
    && boss.assetPath === `/assets/cards/${CONFIG.offers.heartId}.png`
    && boss.asset.path === `/assets/cards/${CONFIG.offers.heartId}.png`;
}

export function assertStillkinTrack1GroundAuthority(): void {
  if (!isStillkinTrack1GroundAuthorityValid(getEnabledGround("GROUND_STILL"))) {
    throw new Error("Stillkin Track-1 content registry authority mismatch");
  }
}
