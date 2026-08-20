import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASSET_PATH_ALLOWLIST,
  CONTENT_REGISTRY,
  getGroundDescriptor,
  getRaceDescriptor,
  listEnabledGrounds,
  listEnabledRaces,
  lookupGround,
  lookupRace,
  lookupAsset,
} from "../../src/content";

const assetsRoot = resolve(import.meta.dirname, "../../public/assets");

describe("playable races and content registry", () => {
  it("enables Stillkin, Burnkin, and Joinkin against the ice and burn grounds while distinguishing disabled and missing", () => {
    expect(listEnabledRaces().map((race) => race.id)).toEqual(["Stillkin", "Burnkin", "Joinkin"]);
    expect(listEnabledGrounds().map((ground) => ground.id)).toEqual(["GROUND_STILL", "GROUND_BURN"]);
    expect(lookupRace("Burnkin")).toMatchObject({ status: "ENABLED", value: { groundIds: ["GROUND_STILL", "GROUND_BURN"], policyId: "Burnkin" } });
    expect(lookupRace("Joinkin")).toMatchObject({ status: "ENABLED", value: { groundIds: ["GROUND_STILL", "GROUND_BURN"], policyId: "Joinkin" } });
    expect(lookupGround("GROUND_BURN").status).toBe("ENABLED");
    expect(lookupRace("Unknown").status).toBe("MISSING");
    expect(lookupGround("UNKNOWN").status).toBe("MISSING");
  });

  it("exposes exactly three ice depths with the frozen labels and assets", () => {
    const ground = getGroundDescriptor("GROUND_STILL");
    expect(ground?.depths.map((depth) => [depth.depth, depth.label, depth.assetId, depth.assetPath])).toEqual([
      [1, "서리 낀 들판", "background__still__depth_01", "/assets/backgrounds/background__still__depth_01.png"],
      [2, "얼어붙은 폭포와 계단", "background__still__depth_02", "/assets/backgrounds/background__still__depth_02.png"],
      [3, "완전히 정지한 거대 구조", "background__still__depth_03", "/assets/backgrounds/background__still__depth_03.png"],
    ]);
  });

  it("exposes exactly five normal shapes, one pressed-fire elite, and one reused-heart boss", () => {
    const encounters = getGroundDescriptor("GROUND_STILL")?.encounters;
    expect(encounters?.normals.map((enemy) => [enemy.shape, enemy.assetId])).toEqual([
      ["SWARM", "enemy__still__swarm"],
      ["BULK", "enemy__still__bulk"],
      ["SHELL", "enemy__still__shell"],
      ["REACH", "enemy__still__reach"],
      ["MIMIC", "enemy__still__mimic"],
    ]);
    expect(encounters?.elite).toMatchObject({
      mechanicId: "PRESSED_FIRE",
      mechanic: { id: "PRESSED_FIRE", status: "PENDING_2026_08_21" },
      assetId: "elite__still__burn",
    });
    expect(encounters?.boss).toMatchObject({
      name: "The Stilling",
      mechanicId: "TOTAL_STOP",
      mechanic: { id: "TOTAL_STOP", status: "PENDING_2026_08_21" },
      assetId: "heart__still",
      assetPath: "/assets/cards/heart__still.png",
      reusesCardAssetId: "heart__still",
    });
  });

  it("keeps the six event types and Still/generic art mapping exact", () => {
    const events = getGroundDescriptor("GROUND_STILL")?.events ?? [];
    expect(events.map((event) => [event.type, event.assetId, event.assetPath])).toEqual([
      ["CACHE", "event__cache__still", "/assets/events/event__cache__still.png"],
      ["WORKSHOP", "event__workshop", "/assets/events/event__workshop.png"],
      ["COLLAPSE", "event__collapse", "/assets/events/event__collapse.png"],
      ["FICTOR", "event__fictor", "/assets/events/event__fictor.png"],
      ["RECORD", "event__record", "/assets/events/event__record.png"],
      ["ODDITY", "event__oddity__still", "/assets/events/event__oddity__still.png"],
    ]);
  });

  it("contains a literal allowlist whose active assets exist locally", () => {
    expect(ASSET_PATH_ALLOWLIST).toHaveLength(29);
    for (const reference of ASSET_PATH_ALLOWLIST) {
      expect(reference.path).not.toMatch(/https?:|\.\.|\\/);
      expect(reference.path.startsWith("/assets/")).toBe(true);
      expect(existsSync(join(assetsRoot, reference.path.slice("/assets/".length)))).toBe(true);
      expect(lookupAsset(reference.id)).toEqual({ status: "FOUND", asset: reference });
    }
    expect(lookupAsset("../cards/heart__still.png").status).toBe("MISSING");
  });

  it("does not expose inactive content and protects nested registry data from mutation aliases", () => {
    expect(getRaceDescriptor("Burnkin")?.enabled).toBe(true);
    expect(getGroundDescriptor("GROUND_SCATTER")?.depths).toEqual([]);
    expect(Object.isFrozen(CONTENT_REGISTRY)).toBe(true);
    expect(Object.isFrozen(CONTENT_REGISTRY.grounds[0])).toBe(true);
    expect(Object.isFrozen(CONTENT_REGISTRY.grounds[0].depths[0])).toBe(true);

    const first = getGroundDescriptor("GROUND_STILL");
    const second = getGroundDescriptor("GROUND_STILL");
    expect(first).not.toBe(second);
    expect(() => {
      (first!.depths[0] as unknown as { label: string }).label = "변조";
    }).toThrow();
    expect(second?.depths[0].label).toBe("서리 낀 들판");
  });
});
