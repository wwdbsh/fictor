import { describe, expect, it } from "vitest";

import { BROWSER_RUNTIME_PACKET } from "../../src/application";
import {
  advanceJoinkinResonance,
  createResonanceState,
  resolveForgeCard,
  resolveJoinkinForgeCard,
} from "../../src/domain";

describe("Joinkin two-stage forge and JOIN bridge", () => {
  it("is closed over every allowed base pair and explicit third without changing canonical identity", { timeout: 120_000 }, () => {
    const { materials, inputs } = BROWSER_RUNTIME_PACKET.resolverContext;
    for (let left = 0; left < materials.length; left += 1) {
      for (let right = left + 1; right < materials.length; right += 1) {
        const base = resolveForgeCard(materials[left], materials[right], inputs);
        if (base.branch === "EQUIPMENT") continue;
        for (let third = 0; third < materials.length; third += 1) {
          if (third === left || third === right) continue;
          const forward = resolveJoinkinForgeCard(materials[left], materials[right], materials[third], inputs);
          const reverse = resolveJoinkinForgeCard(materials[right], materials[left], materials[third], inputs);
          expect(forward.card).toEqual(base);
          expect(reverse).toEqual(forward);
          expect(forward.card.card_id).toBe(base.card_id);
          expect(forward.card.recipe_id).toBe(base.recipe_id);
          expect(forward.card.art).toBe(base.art);
          const raw = Array.isArray(materials[third].attribute) ? materials[third].attribute[0] : materials[third].attribute;
          expect(forward.overlay).toEqual({
            third_material_id: materials[third].id,
            resonance_attribute: raw === "NONE" ? null : raw,
          });
        }
      }
    }
  });

  it("rejects equipment bases and repeated material definitions", () => {
    const { materials, inputs } = BROWSER_RUNTIME_PACKET.resolverContext;
    const byId = (id: string) => materials.find((item) => item.id === id)!;
    expect(() => resolveJoinkinForgeCard(byId("tool_01"), byId("tool_02"), byId("ore_join"), inputs)).toThrow();
    expect(() => resolveJoinkinForgeCard(byId("ore_join"), byId("join_01"), byId("ore_join"), inputs)).toThrow();
  });

  it("implements the complete no-active/JOIN/repeated-JOIN/non-JOIN bridge matrix", () => {
    let state = { resonance: createResonanceState(), bridgeOpen: false };
    let step = advanceJoinkinResonance(state, "BURN");
    expect(step).toMatchObject({ effectiveAttribute: "BURN", state: { bridgeOpen: false, resonance: { activeAttribute: "BURN", streakByAttribute: { BURN: 1 } } } });
    state = step.state;
    step = advanceJoinkinResonance(state, "JOIN");
    expect(step).toMatchObject({ effectiveAttribute: "BURN", state: { bridgeOpen: true, resonance: { activeAttribute: "BURN", streakByAttribute: { BURN: 2 } } } });
    state = step.state;
    step = advanceJoinkinResonance(state, "JOIN");
    expect(step).toMatchObject({ effectiveAttribute: "BURN", state: { bridgeOpen: true, resonance: { activeAttribute: "BURN", streakByAttribute: { BURN: 3 } } } });
    step = advanceJoinkinResonance(step.state, "WASH");
    expect(step).toMatchObject({ effectiveAttribute: "WASH", state: { bridgeOpen: false, resonance: { activeAttribute: "WASH", streakByAttribute: { WASH: 4, BURN: 0 } } } });

    const opened = advanceJoinkinResonance({ resonance: createResonanceState(), bridgeOpen: false }, "JOIN");
    expect(opened).toMatchObject({ effectiveAttribute: "JOIN", state: { bridgeOpen: true, resonance: { activeAttribute: "JOIN", streakByAttribute: { JOIN: 1 } } } });
    expect(advanceJoinkinResonance(opened.state, "STILL")).toMatchObject({
      effectiveAttribute: "STILL",
      state: { bridgeOpen: false, resonance: { activeAttribute: "STILL", streakByAttribute: { STILL: 2, JOIN: 0 } } },
    });
  });
});
