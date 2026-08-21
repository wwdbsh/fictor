import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONTENT_CARDINALITIES,
  getGroundDescriptor,
  listEnabledRaces,
  lookupAsset,
} from "../../../src/content";

const assetsRoot = resolve(import.meta.dirname, "../../../public/assets");

describe("T036 burn ground content pack", () => {
  it("exposes the three approved depths and all seven encounters", () => {
    const ground = getGroundDescriptor("GROUND_BURN");
    expect(ground).toMatchObject({
      id: "GROUND_BURN",
      nameKo: "사름의 터",
      attribute: "BURN",
      status: "ENABLED",
      enabled: true,
    });
    expect(ground?.depths.map(({ depth, label, assetId }) => [depth, label, assetId])).toEqual([
      [1, "식은 재밭", "background__burn__depth_01"],
      [2, "균열 사이로 보이는 불빛", "background__burn__depth_02"],
      [3, "꺼지지 않는 화심", "background__burn__depth_03"],
    ]);
    expect(ground?.encounters?.normals.map(({ shape, labelKo, assetId }) => [shape, labelKo, assetId])).toEqual([
      ["SWARM", "달군 잉걸", "enemy__burn__swarm"],
      ["BULK", "그을린 심지", "enemy__burn__bulk"],
      ["SHELL", "눌어붙은 재", "enemy__burn__shell"],
      ["REACH", "뜨거운 열", "enemy__burn__reach"],
      ["MIMIC", "불붙은 불티", "enemy__burn__mimic"],
    ]);
    expect(ground?.encounters?.elite).toMatchObject({
      id: "elite__burn__scatter",
      mechanicId: "BLAST",
      mechanic: { id: "BLAST", status: "PENDING_2026_08_21" },
      assetId: "elite__burn__scatter",
    });
    expect(ground?.encounters?.boss).toMatchObject({
      id: "the_burning",
      name: "The Burning",
      labelKo: "사름, 꺼지지 못한 신",
      mechanicId: "BURNOUT",
      mechanic: { id: "BURNOUT", status: "PENDING_2026_08_21" },
      assetId: "heart__burn",
      reusesCardAssetId: "heart__burn",
    });
    expect(ground?.rewards).toEqual({
      normal: { source: "NORMAL", allowedMaterialCategories: ["ORE", "GROUND_PRODUCT"], origin: "GROUND_BURN" },
      elite: { source: "ELITE", allowedMaterialCategories: ["TOOL", "ODDITY"] },
      boss: { source: "BOSS", heartId: "heart__burn" },
    });
  });

  it("maps all six event variations to recovered local art", () => {
    const events = getGroundDescriptor("GROUND_BURN")?.events ?? [];
    expect(events.map(({ type, assetId }) => [type, assetId])).toEqual([
      ["CACHE", "event__cache__burn"],
      ["WORKSHOP", "event__workshop"],
      ["COLLAPSE", "event__collapse__burn"],
      ["FICTOR", "event__fictor"],
      ["RECORD", "event__record"],
      ["ODDITY", "event__oddity__burn"],
    ]);
    for (const event of events) {
      expect(lookupAsset(event.assetId)).toEqual({ status: "FOUND", asset: event.asset });
      expect(existsSync(join(assetsRoot, event.assetPath.slice("/assets/".length)))).toBe(true);
    }
  });

  it("keeps explicit cardinality and three-race boss reachability", () => {
    expect(CONTENT_CARDINALITIES).toMatchObject({
      enabledGrounds: 5,
      enabledDepths: 15,
      enabledNormalEnemies: 25,
      enabledElites: 5,
      enabledBosses: 5,
      enabledEventVariations: 30,
      burnDepths: 3,
      burnNormalEnemies: 5,
      burnElites: 1,
      burnBosses: 1,
      burnEvents: 6,
    });
    const ground = getGroundDescriptor("GROUND_BURN")!;
    const route = [
      ground.depths[0],
      ground.encounters!.normals[0],
      ground.depths[1],
      ground.encounters!.elite,
      ground.depths[2],
      ground.encounters!.boss,
    ];
    for (const race of listEnabledRaces()) {
      expect(race.groundIds, race.id).toContain("GROUND_BURN");
      expect(route.map(({ assetId }) => lookupAsset(assetId).status), race.id).toEqual(Array(route.length).fill("FOUND"));
      expect(route.at(-1)).toMatchObject({ id: "the_burning", mechanicId: "BURNOUT" });
    }
  });
});
