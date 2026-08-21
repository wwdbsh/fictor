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

describe("T040 join ground content pack", () => {
  it("exposes the three approved depths and all seven encounters", () => {
    const ground = getGroundDescriptor("GROUND_JOIN");
    expect(ground).toMatchObject({
      id: "GROUND_JOIN",
      nameKo: "이음의 터",
      attribute: "JOIN",
      status: "ENABLED",
      enabled: true,
    });
    expect(ground?.depths.map(({ depth, label, assetId }) => [depth, label, assetId])).toEqual([
      [1, "붙기 시작한 것들", "background__join__depth_01"],
      [2, "구분 불가능한 덩어리", "background__join__depth_02"],
      [3, "하나의 거대한 유기체", "background__join__depth_03"],
    ]);
    expect(ground?.encounters?.normals.map(({ shape, labelKo, assetId }) => [shape, labelKo, assetId])).toEqual([
      ["SWARM", "엉킨 실", "enemy__join__swarm"],
      ["BULK", "붙은 손", "enemy__join__bulk"],
      ["SHELL", "자란 매듭", "enemy__join__shell"],
      ["REACH", "이어진 그림자", "enemy__join__reach"],
      ["MIMIC", "겹친 소리", "enemy__join__mimic"],
    ]);
    expect(ground?.encounters?.elite).toMatchObject({
      id: "elite__join__still",
      labelKo: "더 굳은 것",
      mechanicId: "HARDENED",
      mechanic: { id: "HARDENED", status: "PENDING_2026_08_21" },
      assetId: "elite__join__still",
    });
    expect(ground?.encounters?.boss).toMatchObject({
      id: "the_joining",
      name: "The Joining",
      labelKo: "이음, 아무것도 아니었던 신",
      mechanicId: "KNOT",
      mechanic: { id: "KNOT", status: "PENDING_2026_08_21" },
      assetId: "heart__join",
      reusesCardAssetId: "heart__join",
    });
    expect(ground?.rewards).toEqual({
      normal: { source: "NORMAL", allowedMaterialCategories: ["ORE", "GROUND_PRODUCT"], origin: "GROUND_JOIN" },
      elite: { source: "ELITE", allowedMaterialCategories: ["TOOL", "ODDITY"] },
      boss: { source: "BOSS", heartId: "heart__join" },
    });
  });

  it("maps all six event variations to recovered local art", () => {
    const events = getGroundDescriptor("GROUND_JOIN")?.events ?? [];
    expect(events.map(({ type, assetId }) => [type, assetId])).toEqual([
      ["CACHE", "event__cache__join"],
      ["WORKSHOP", "event__workshop"],
      ["COLLAPSE", "event__collapse"],
      ["FICTOR", "event__fictor"],
      ["RECORD", "event__record"],
      ["ODDITY", "event__oddity__join"],
    ]);
    for (const event of events) {
      expect(lookupAsset(event.assetId)).toEqual({ status: "FOUND", asset: event.asset });
      expect(existsSync(join(assetsRoot, event.assetPath.slice("/assets/".length)))).toBe(true);
    }
  });

  it("keeps explicit cardinality and three-race boss reachability", () => {
    expect(CONTENT_CARDINALITIES).toMatchObject({
      enabledGrounds: 6,
      enabledDepths: 18,
      enabledNormalEnemies: 30,
      enabledElites: 6,
      enabledBosses: 6,
      enabledEventVariations: 36,
      joinDepths: 3,
      joinNormalEnemies: 5,
      joinElites: 1,
      joinBosses: 1,
      joinEvents: 6,
    });
    const ground = getGroundDescriptor("GROUND_JOIN")!;
    const route = [
      ground.depths[0],
      ground.encounters!.normals[0],
      ground.depths[1],
      ground.encounters!.elite,
      ground.depths[2],
      ground.encounters!.boss,
    ];
    for (const race of listEnabledRaces()) {
      expect(race.groundIds, race.id).toContain("GROUND_JOIN");
      expect(route.map(({ assetId }) => lookupAsset(assetId).status), race.id).toEqual(Array(route.length).fill("FOUND"));
      expect(route.at(-1)).toMatchObject({ id: "the_joining", mechanicId: "KNOT" });
    }
  });
});
