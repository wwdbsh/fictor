import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONTENT_CARDINALITIES,
  createContentRegistryView,
  getContentRegistry,
  listEnabledGrounds,
  listEnabledRaces,
  lookupAsset,
} from "../../src/content";
import laws from "../../src/data/source/laws.json";
import type { BossMechanicId, EliteMechanicId, GroundId } from "../../src/content";

const assetsRoot = resolve(import.meta.dirname, "../../public/assets");
const eventTypes = ["CACHE", "WORKSHOP", "COLLAPSE", "FICTOR", "RECORD", "ODDITY"] as const;
const shapes = ["SWARM", "BULK", "SHELL", "REACH", "MIMIC"] as const;
const expectedGrounds: readonly {
  id: GroundId;
  attribute: "STILL" | "BURN" | "SCATTER" | "ROT" | "WASH" | "JOIN";
  adjacentAttribute: "STILL" | "BURN" | "SCATTER" | "ROT" | "WASH" | "JOIN";
  elite: EliteMechanicId;
  boss: BossMechanicId;
}[] = [
  { id: "GROUND_STILL", attribute: "STILL", adjacentAttribute: "BURN", elite: "PRESSED_FIRE", boss: "TOTAL_STOP" },
  { id: "GROUND_BURN", attribute: "BURN", adjacentAttribute: "SCATTER", elite: "BLAST", boss: "BURNOUT" },
  { id: "GROUND_SCATTER", attribute: "SCATTER", adjacentAttribute: "ROT", elite: "SPREADING", boss: "DISPERSAL" },
  { id: "GROUND_ROT", attribute: "ROT", adjacentAttribute: "WASH", elite: "NEUTRALIZED", boss: "SELF_EATING" },
  { id: "GROUND_WASH", attribute: "WASH", adjacentAttribute: "JOIN", elite: "CLARIFIED", boss: "EMPTIED" },
  { id: "GROUND_JOIN", attribute: "JOIN", adjacentAttribute: "STILL", elite: "HARDENED", boss: "KNOT" },
];

const lawByPair = new Map(laws.map((law) => [[...law.pair].sort().join("|"), law.result_class]));

describe("T041 M5 integrated content reachability", () => {
  it("keeps the 6-ground cardinality and law-backed encounter inventory exact", () => {
    expect(CONTENT_CARDINALITIES).toMatchObject({
      enabledRaces: 3,
      enabledGrounds: 6,
      enabledDepths: 18,
      enabledNormalEnemies: 30,
      enabledElites: 6,
      enabledBosses: 6,
      enabledEventVariations: 36,
    });

    const grounds = listEnabledGrounds();
    const normalEnemies = grounds.flatMap(({ encounters }) => encounters?.normals ?? []);
    const elites = grounds.flatMap(({ encounters }) => encounters ? [encounters.elite] : []);
    const bosses = grounds.flatMap(({ encounters }) => encounters ? [encounters.boss] : []);
    const eventVariations = grounds.flatMap((ground) => ground.events.map(({ type }) => `${ground.id}|${type}`));
    expect(grounds.map(({ id }) => id)).toEqual(expectedGrounds.map(({ id }) => id));
    expect(grounds.flatMap(({ depths }) => depths)).toHaveLength(18);
    expect(normalEnemies).toHaveLength(30);
    expect(new Set(normalEnemies.map(({ id }) => id)).size).toBe(30);
    expect(elites).toHaveLength(6);
    expect(new Set(elites.map(({ id }) => id)).size).toBe(6);
    expect(bosses).toHaveLength(6);
    expect(new Set(bosses.map(({ id }) => id)).size).toBe(6);
    expect(eventVariations).toHaveLength(36);
    expect(new Set(eventVariations).size).toBe(36);

    for (const expected of expectedGrounds) {
      const ground = grounds.find(({ id }) => id === expected.id)!;
      expect(ground.depths.map(({ depth }) => depth), expected.id).toEqual([1, 2, 3]);
      expect(ground.encounters?.normals.map(({ shape }) => shape), expected.id).toEqual(shapes);
      expect(ground.events.map(({ type }) => type), expected.id).toEqual(eventTypes);
      expect(ground.encounters?.elite.mechanicId, expected.id).toBe(expected.elite);
      expect(ground.encounters?.boss.mechanicId, expected.id).toBe(expected.boss);
      expect(lawByPair.get([expected.attribute, expected.adjacentAttribute].sort().join("|")), expected.id).toBe(expected.elite);
      expect(lawByPair.get([expected.attribute, expected.attribute].join("|")), expected.id).toBe(expected.boss);
    }
  });

  it("reaches every boss through all 18 race-ground content routes with local assets", () => {
    const races = listEnabledRaces();
    const grounds = listEnabledGrounds();
    const matrix = races.flatMap((race) => grounds.map((ground) => ({ race, ground })));
    expect(matrix).toHaveLength(18);

    for (const { race, ground } of matrix) {
      expect(race.groundIds, `${race.id}/${ground.id}`).toContain(ground.id);
      expect(ground.encounters, `${race.id}/${ground.id}`).not.toBeNull();
      const routeAssets = [
        ...ground.depths.map(({ asset }) => asset),
        ...ground.encounters!.normals.map(({ asset }) => asset),
        ground.encounters!.elite.asset,
        ground.encounters!.boss.asset,
        ...ground.events.map(({ asset }) => asset),
      ];
      for (const asset of routeAssets) {
        expect(lookupAsset(asset.id), `${race.id}/${ground.id}/${asset.id}`).toEqual({ status: "FOUND", asset });
        expect(existsSync(join(assetsRoot, asset.path.slice("/assets/".length))), asset.path).toBe(true);
      }
      expect(ground.encounters!.boss.reusesCardAssetId, `${race.id}/${ground.id}`).toBe(ground.rewards!.boss.heartId);
    }
  });

  it("disables an incomplete ground without mutating canonical state and restores from an empty view", () => {
    const canonical = getContentRegistry();
    const disabled = createContentRegistryView(["GROUND_JOIN"]);
    expect(disabled.grounds.find(({ id }) => id === "GROUND_JOIN")).toMatchObject({ status: "DISABLED", enabled: false });
    expect(disabled.races.filter(({ enabled }) => enabled).every(({ groundIds }) => !groundIds.includes("GROUND_JOIN"))).toBe(true);
    expect(getContentRegistry()).toEqual(canonical);
    expect(createContentRegistryView()).toEqual(canonical);
    expect(Object.isFrozen(disabled)).toBe(true);
    expect(Object.isFrozen(disabled.grounds.find(({ id }) => id === "GROUND_JOIN"))).toBe(true);
    expect(() => createContentRegistryView(["GROUND_JOIN", "GROUND_JOIN"])).toThrow("Duplicate disabled ground id");
    expect(() => createContentRegistryView(["GROUND_UNKNOWN" as GroundId])).toThrow("Unknown ground id");
  });
});
