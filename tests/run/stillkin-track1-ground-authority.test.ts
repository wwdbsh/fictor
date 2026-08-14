import { describe, expect, it } from "vitest";

import { getEnabledGround } from "../../src/content";
import {
  assertStillkinTrack1GroundAuthority,
  isStillkinTrack1GroundAuthorityValid,
} from "../../src/application/run/track1-ground-authority";

function descriptor(): any {
  return JSON.parse(JSON.stringify(getEnabledGround("GROUND_STILL")));
}

describe("Stillkin Track-1 content registry authority", () => {
  it("binds controller authority to the live enabled GROUND_STILL descriptor", () => {
    expect(isStillkinTrack1GroundAuthorityValid(getEnabledGround("GROUND_STILL"))).toBe(true);
    expect(() => assertStillkinTrack1GroundAuthority()).not.toThrow();
  });

  it("fails closed for disabled, missing, route, event, depth, and boss-heart descriptor drift", () => {
    expect(isStillkinTrack1GroundAuthorityValid(undefined)).toBe(false);
    const mutations: Array<(ground: any) => void> = [
      (ground) => { ground.enabled = false; },
      (ground) => { ground.depths.pop(); },
      (ground) => { ground.encounters.normals[0].id = "enemy__drift"; },
      (ground) => { ground.encounters.elite.id = "elite__drift"; },
      (ground) => { ground.encounters.boss.id = "boss__drift"; },
      (ground) => { ground.events.pop(); },
      (ground) => { ground.encounters.boss.reusesCardAssetId = "heart__drift"; },
      (ground) => { ground.encounters.boss.asset.id = "heart__drift"; },
    ];
    for (const mutate of mutations) {
      const ground = descriptor();
      mutate(ground);
      expect(isStillkinTrack1GroundAuthorityValid(ground)).toBe(false);
    }
  });
});
