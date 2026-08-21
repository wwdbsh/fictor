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

describe("T039 wash ground content pack", () => {
  it("exposes the three approved depths and all seven encounters", () => {
    const ground = getGroundDescriptor("GROUND_WASH");
    expect(ground).toMatchObject({
      id: "GROUND_WASH",
      nameKo: "씻음의 터",
      attribute: "WASH",
      status: "ENABLED",
      enabled: true,
    });
    expect(ground?.depths.map(({ depth, label, assetId }) => [depth, label, assetId])).toEqual([
      [1, "닳은 돌밭", "background__wash__depth_01"],
      [2, "매끈하게 파인 수로", "background__wash__depth_02"],
      [3, "완전한 공백", "background__wash__depth_03"],
    ]);
    expect(ground?.encounters?.normals.map(({ shape, labelKo, assetId }) => [shape, labelKo, assetId])).toEqual([
      ["SWARM", "맑은 눈물", "enemy__wash__swarm"],
      ["BULK", "닳은 돌", "enemy__wash__bulk"],
      ["SHELL", "빈 껍질", "enemy__wash__shell"],
      ["REACH", "지워진 자국", "enemy__wash__reach"],
      ["MIMIC", "가라앉은 앙금", "enemy__wash__mimic"],
    ]);
    expect(ground?.encounters?.elite).toMatchObject({
      id: "elite__wash__join",
      mechanicId: "CLARIFIED",
      mechanic: { id: "CLARIFIED", status: "PENDING_2026_08_21" },
      assetId: "elite__wash__join",
    });
    expect(ground?.encounters?.boss).toMatchObject({
      id: "the_washing",
      name: "The Washing",
      labelKo: "씻음, 흔적을 지운 신",
      mechanicId: "EMPTIED",
      mechanic: { id: "EMPTIED", status: "PENDING_2026_08_21" },
      assetId: "heart__wash",
      reusesCardAssetId: "heart__wash",
    });
    expect(ground?.rewards).toEqual({
      normal: { source: "NORMAL", allowedMaterialCategories: ["ORE", "GROUND_PRODUCT"], origin: "GROUND_WASH" },
      elite: { source: "ELITE", allowedMaterialCategories: ["TOOL", "ODDITY"] },
      boss: { source: "BOSS", heartId: "heart__wash" },
    });
  });

  it("maps all six event variations to recovered local art", () => {
    const events = getGroundDescriptor("GROUND_WASH")?.events ?? [];
    expect(events.map(({ type, assetId }) => [type, assetId])).toEqual([
      ["CACHE", "event__cache__wash"],
      ["WORKSHOP", "event__workshop"],
      ["COLLAPSE", "event__collapse__wash"],
      ["FICTOR", "event__fictor"],
      ["RECORD", "event__record"],
      ["ODDITY", "event__oddity__wash"],
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
      washDepths: 3,
      washNormalEnemies: 5,
      washElites: 1,
      washBosses: 1,
      washEvents: 6,
    });
    const ground = getGroundDescriptor("GROUND_WASH")!;
    const route = [
      ground.depths[0],
      ground.encounters!.normals[0],
      ground.depths[1],
      ground.encounters!.elite,
      ground.depths[2],
      ground.encounters!.boss,
    ];
    for (const race of listEnabledRaces()) {
      expect(race.groundIds, race.id).toContain("GROUND_WASH");
      expect(route.map(({ assetId }) => lookupAsset(assetId).status), race.id).toEqual(Array(route.length).fill("FOUND"));
      expect(route.at(-1)).toMatchObject({ id: "the_washing", mechanicId: "EMPTIED" });
    }
  });
});
