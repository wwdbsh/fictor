import { describe, expect, it } from "vitest";

import {
  applyBurnkinResonanceBreak,
  BURNKIN_POLICY,
  createCombatState,
  kindleBurnkinCard,
  payBurnkinHpForEnergy,
  reduceCombat,
} from "../../src/domain";
import { BURNKIN_TRACK1_RULES } from "../../src/application";
import { fixtureSetup } from "../domain/fixtures";

function actionState() {
  const setup = fixtureSetup();
  setup.rules.maxEnergy = 5;
  return reduceCombat(createCombatState(setup), { type: "START_TURN" }).state;
}

describe("Burnkin pure rules", () => {
  it("freezes the structural policy without claiming final balance", () => {
    expect(BURNKIN_POLICY).toEqual({
      id: "Burnkin",
      attribute: "BURN",
      passive: { id: "BLOOD_TO_ENERGY", labelKo: "피 태우기" },
      skill: { id: "KINDLE", labelKo: "지피기", target: "HAND_CARD_INSTANCE", destination: "EXILE" },
      resonance: { rateMultiplier: 2, breakEffect: "DIRECT_SELF_DAMAGE" },
    });
  });

  it("pays HP and grants energy atomically while keeping one HP alive", () => {
    for (let hp = 1; hp <= 8; hp += 1) {
      const state = actionState();
      state.player.hp = hp;
      state.player.maxHp = Math.max(state.player.maxHp, hp);
      state.player.energy = 0;
      const before = structuredClone(state);
      const result = payBurnkinHpForEnergy(state, BURNKIN_TRACK1_RULES);
      if (hp <= BURNKIN_TRACK1_RULES.hpToEnergy.hpCost) {
        expect(result).toMatchObject({ ok: false, reason: "INSUFFICIENT_HP" });
        expect(result.state).toEqual(before);
      } else {
        expect(result).toMatchObject({ ok: true });
        if (result.ok) {
          expect(result.state.player.hp).toBe(hp - BURNKIN_TRACK1_RULES.hpToEnergy.hpCost);
          expect(result.state.player.energy).toBe(BURNKIN_TRACK1_RULES.hpToEnergy.energyGain);
        }
      }
      expect(state).toEqual(before);
    }
  });

  it("rejects an energy-cap overflow without partially paying HP", () => {
    const state = actionState();
    state.player.energy = state.rules.maxEnergy;
    const before = structuredClone(state);
    expect(payBurnkinHpForEnergy(state, BURNKIN_TRACK1_RULES)).toMatchObject({
      ok: false,
      reason: "ENERGY_CAP_EXCEEDED",
      state: before,
    });
    expect(state).toEqual(before);
  });

  it("kindles exactly one hand card into exile and gains its cost", () => {
    const state = actionState();
    state.player.energy = 0;
    const instanceId = state.zones.hand[0];
    const cardId = state.instances.find((instance) => instance.instanceId === instanceId)!.cardId;
    const cost = state.cards.find((card) => card.cardId === cardId)!.cost!;
    const before = structuredClone(state);
    const result = kindleBurnkinCard(state, instanceId);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.state.player.energy).toBe(cost);
      expect(result.state.zones.hand).not.toContain(instanceId);
      expect(result.state.zones.exile).toContain(instanceId);
      expect(result.events[0]).toEqual({ type: "BURNKIN_CARD_KINDLED", instanceId, cardId, energyGained: cost });
    }
    expect(state).toEqual(before);
  });

  it("applies direct self-harm only on an attribute break and respects lethal boundary", () => {
    const state = actionState();
    state.player.hp = BURNKIN_TRACK1_RULES.resonanceBreakSelfDamage;
    const same = applyBurnkinResonanceBreak(state, "BURN", "BURN", BURNKIN_TRACK1_RULES);
    expect(same).toMatchObject({ ok: true, events: [] });
    const broken = applyBurnkinResonanceBreak(state, "BURN", "STILL", BURNKIN_TRACK1_RULES);
    expect(broken).toMatchObject({
      ok: true,
      state: { player: { hp: 0 }, status: "DEFEAT", phase: "TERMINAL" },
      events: [{ type: "BURNKIN_RESONANCE_BROKEN", from: "BURN", to: "STILL", remainingHp: 0 }],
    });
    expect(state.player.hp).toBe(BURNKIN_TRACK1_RULES.resonanceBreakSelfDamage);
  });

  it("rejects runtime resonance attributes outside the canonical union", () => {
    const state = actionState();
    const result = applyBurnkinResonanceBreak(state, "BURN", "NOT_AN_ATTRIBUTE", BURNKIN_TRACK1_RULES);
    expect(result).toMatchObject({ ok: false, reason: "INVALID_STATE", events: [] });
    expect(result.state).toEqual(state);
  });
});
