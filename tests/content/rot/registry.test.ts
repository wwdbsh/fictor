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

describe("T038 rot ground content pack", () => {
  it("exposes the three approved depths and all seven encounters", () => {
    const ground = getGroundDescriptor("GROUND_ROT");
    expect(ground).toMatchObject({
      id: "GROUND_ROT",
      nameKo: "삭음의 터",
      attribute: "ROT",
      status: "ENABLED",
      enabled: true,
    });
    expect(ground?.depths.map(({ depth, label, assetId }) => [depth, label, assetId])).toEqual([
      [1, "주저앉은 지표", "background__rot__depth_01"],
      [2, "겹겹이 무너진 층", "background__rot__depth_02"],
      [3, "바닥이 계속 내려앉는 곳", "background__rot__depth_03"],
    ]);
    expect(ground?.encounters?.normals.map(({ shape, labelKo, assetId }) => [shape, labelKo, assetId])).toEqual([
      ["SWARM", "딱지", "enemy__rot__swarm"],
      ["BULK", "무른 뿌리", "enemy__rot__bulk"],
      ["SHELL", "곰팡이 꽃", "enemy__rot__shell"],
      ["REACH", "번지는 얼룩", "enemy__rot__reach"],
      ["MIMIC", "내려앉은 냄새", "enemy__rot__mimic"],
    ]);
    expect(ground?.encounters?.elite).toMatchObject({
      id: "elite__rot__wash",
      mechanicId: "NEUTRALIZED",
      mechanic: { id: "NEUTRALIZED", status: "PENDING_2026_08_21" },
      assetId: "elite__rot__wash",
    });
    expect(ground?.encounters?.boss).toMatchObject({
      id: "the_rotting",
      name: "The Rotting",
      labelKo: "삭음, 스스로를 먹은 신",
      mechanicId: "SELF_EATING",
      mechanic: { id: "SELF_EATING", status: "PENDING_2026_08_21" },
      assetId: "heart__rot",
      reusesCardAssetId: "heart__rot",
    });
    expect(ground?.rewards).toEqual({
      normal: { source: "NORMAL", allowedMaterialCategories: ["ORE", "GROUND_PRODUCT"], origin: "GROUND_ROT" },
      elite: { source: "ELITE", allowedMaterialCategories: ["TOOL", "ODDITY"] },
      boss: { source: "BOSS", heartId: "heart__rot" },
    });
  });

  it("maps all six event variations to recovered local art", () => {
    const events = getGroundDescriptor("GROUND_ROT")?.events ?? [];
    expect(events.map(({ type, assetId }) => [type, assetId])).toEqual([
      ["CACHE", "event__cache__rot"],
      ["WORKSHOP", "event__workshop"],
      ["COLLAPSE", "event__collapse"],
      ["FICTOR", "event__fictor"],
      ["RECORD", "event__record"],
      ["ODDITY", "event__oddity__rot"],
    ]);
    for (const event of events) {
      expect(lookupAsset(event.assetId)).toEqual({ status: "FOUND", asset: event.asset });
      expect(existsSync(join(assetsRoot, event.assetPath.slice("/assets/".length)))).toBe(true);
    }
  });

  it("keeps explicit cardinality and three-race boss reachability", () => {
    expect(CONTENT_CARDINALITIES).toMatchObject({
      enabledGrounds: 4,
      enabledDepths: 12,
      enabledNormalEnemies: 20,
      enabledElites: 4,
      enabledBosses: 4,
      enabledEventVariations: 24,
      rotDepths: 3,
      rotNormalEnemies: 5,
      rotElites: 1,
      rotBosses: 1,
      rotEvents: 6,
    });
    const ground = getGroundDescriptor("GROUND_ROT")!;
    const route = [
      ground.depths[0],
      ground.encounters!.normals[0],
      ground.depths[1],
      ground.encounters!.elite,
      ground.depths[2],
      ground.encounters!.boss,
    ];
    for (const race of listEnabledRaces()) {
      expect(race.groundIds, race.id).toContain("GROUND_ROT");
      expect(route.map(({ assetId }) => lookupAsset(assetId).status), race.id).toEqual(Array(route.length).fill("FOUND"));
      expect(route.at(-1)).toMatchObject({ id: "the_rotting", mechanicId: "SELF_EATING" });
    }
  });
});
