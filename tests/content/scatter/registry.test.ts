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

describe("T037 scatter ground content pack", () => {
  it("exposes the three approved depths and all seven encounters", () => {
    const ground = getGroundDescriptor("GROUND_SCATTER");
    expect(ground).toMatchObject({
      id: "GROUND_SCATTER",
      nameKo: "흩음의 터",
      attribute: "SCATTER",
      status: "ENABLED",
      enabled: true,
    });
    expect(ground?.depths.map(({ depth, label, assetId }) => [depth, label, assetId])).toEqual([
      [1, "먼지 자욱한 분지", "background__scatter__depth_01"],
      [2, "떠 있는 바위 군", "background__scatter__depth_02"],
      [3, "지면이 아예 없는 공중", "background__scatter__depth_03"],
    ]);
    expect(ground?.encounters?.normals.map(({ shape, labelKo, assetId }) => [shape, labelKo, assetId])).toEqual([
      ["SWARM", "가벼운 뼈", "enemy__scatter__swarm"],
      ["BULK", "흩날리는 씨", "enemy__scatter__bulk"],
      ["SHELL", "벗겨진 껍데기", "enemy__scatter__shell"],
      ["REACH", "뜬 먼지", "enemy__scatter__reach"],
      ["MIMIC", "마른 바람", "enemy__scatter__mimic"],
    ]);
    expect(ground?.encounters?.elite).toMatchObject({
      id: "elite__scatter__rot",
      mechanicId: "SPREADING",
      mechanic: { id: "SPREADING", status: "PENDING_2026_08_21" },
      assetId: "elite__scatter__rot",
    });
    expect(ground?.encounters?.boss).toMatchObject({
      id: "the_scattering",
      name: "The Scattering",
      labelKo: "흩음, 붙잡히지 않은 신",
      mechanicId: "DISPERSAL",
      mechanic: { id: "DISPERSAL", status: "PENDING_2026_08_21" },
      assetId: "heart__scatter",
      reusesCardAssetId: "heart__scatter",
    });
    expect(ground?.rewards).toEqual({
      normal: { source: "NORMAL", allowedMaterialCategories: ["ORE", "GROUND_PRODUCT"], origin: "GROUND_SCATTER" },
      elite: { source: "ELITE", allowedMaterialCategories: ["TOOL", "ODDITY"] },
      boss: { source: "BOSS", heartId: "heart__scatter" },
    });
  });

  it("maps all six event variations to recovered local art", () => {
    const events = getGroundDescriptor("GROUND_SCATTER")?.events ?? [];
    expect(events.map(({ type, assetId }) => [type, assetId])).toEqual([
      ["CACHE", "event__cache__scatter"],
      ["WORKSHOP", "event__workshop"],
      ["COLLAPSE", "event__collapse"],
      ["FICTOR", "event__fictor"],
      ["RECORD", "event__record"],
      ["ODDITY", "event__oddity__scatter"],
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
      scatterDepths: 3,
      scatterNormalEnemies: 5,
      scatterElites: 1,
      scatterBosses: 1,
      scatterEvents: 6,
    });
    const ground = getGroundDescriptor("GROUND_SCATTER")!;
    const route = [
      ground.depths[0],
      ground.encounters!.normals[0],
      ground.depths[1],
      ground.encounters!.elite,
      ground.depths[2],
      ground.encounters!.boss,
    ];
    for (const race of listEnabledRaces()) {
      expect(race.groundIds, race.id).toContain("GROUND_SCATTER");
      expect(route.map(({ assetId }) => lookupAsset(assetId).status), race.id).toEqual(Array(route.length).fill("FOUND"));
      expect(route.at(-1)).toMatchObject({ id: "the_scattering", mechanicId: "DISPERSAL" });
    }
  });
});
