import {
  COMBAT_EFFECT_IDS,
  type AtomicOperation,
  type CardDefinition,
  type CardInstance,
  type CombatEffectId,
  type CombatSetup,
  type EffectProgram,
  type EnemyIntent,
} from "../../src/domain";

export const enemyId = "enemy_fixture";

export function fixed(amount: number) {
  return { kind: "FIXED" as const, amount };
}

export function power(multiplier = 1) {
  return { kind: "EFFECT_POWER" as const, multiplier };
}

export function damageEnemy(amount = power()): AtomicOperation {
  return { kind: "DAMAGE", target: { kind: "SELECTED" }, amount };
}

export function attackIntent(intentId = "intent_attack", amount = 3): EnemyIntent {
  return {
    intentId,
    labelKo: "내리치기",
    telegraph: "ATTACK",
    displayAmount: amount,
    program: {
      operations: [{ kind: "DAMAGE", target: { kind: "PLAYER" }, amount: fixed(amount) }],
    },
  };
}

export function card(
  cardId: string,
  effectId: CombatEffectId,
  overrides: Partial<CardDefinition> = {},
): CardDefinition {
  return {
    cardId,
    effectId,
    cost: 1,
    power: 10,
    resonanceAttribute: "STILL",
    ...overrides,
  };
}

export function instance(instanceId: string, cardId: string): CardInstance {
  return { instanceId, cardId };
}

export function program(
  effectId: CombatEffectId,
  operations: AtomicOperation[] = [damageEnemy()],
  overrides: Partial<EffectProgram> = {},
): EffectProgram {
  return {
    effectId,
    targetRule: { kind: "REQUIRED", allowed: "ENEMY" },
    playedCardDestination: "DISCARD",
    operations,
    ...overrides,
  };
}

export function fixtureSetup(overrides: Partial<CombatSetup> = {}): CombatSetup {
  const cards = [
    card("card_a", "DELAYED_EXPLOSION"),
    card("card_a_duplicate", "DELAYED_EXPLOSION"),
    card("card_b", "SLOW_TARGET", { resonanceAttribute: "BURN", power: 5 }),
    card("card_guard", "PERMANENT_BLOCK", { power: 4 }),
  ];
  const instances = [
    instance("instance_a1", "card_a"),
    instance("instance_a2", "card_a_duplicate"),
    instance("instance_b", "card_b"),
    instance("instance_guard", "card_guard"),
  ];
  const programs = [
    program("DELAYED_EXPLOSION"),
    program("SLOW_TARGET"),
    program(
      "PERMANENT_BLOCK",
      [{ kind: "GAIN_BLOCK", target: { kind: "PLAYER" }, amount: power() }],
      { targetRule: { kind: "NONE" } },
    ),
  ];
  return {
    seed: 1234,
    rules: {
      maxEnergy: 3,
      drawCount: 4,
      resonanceRate: 0.1,
      blockRetention: { numerator: 0, denominator: 1, rounding: "FLOOR" },
      terminalPolicy: "DEFEAT_FIRST",
    },
    player: { hp: 30, maxHp: 30, block: 0 },
    enemy: {
      enemyId,
      hp: 40,
      maxHp: 40,
      block: 0,
      intents: [attackIntent(), attackIntent("intent_attack_2", 4)],
      initialIntentIndex: 0,
    },
    cards,
    instances,
    deck: instances.map(({ instanceId }) => instanceId),
    programs,
    ...overrides,
  };
}

export function setupForEveryEffect(): CombatSetup {
  const cards = COMBAT_EFFECT_IDS.map((effectId, index) =>
    card(`unrelated_card_${index}`, effectId, { cost: 0, power: index + 1 }),
  );
  const instances = cards.map((definition, index) =>
    instance(`effect_instance_${index}`, definition.cardId),
  );
  return fixtureSetup({
    rules: { ...fixtureSetup().rules, maxEnergy: 0, drawCount: 1 },
    cards,
    instances,
    deck: instances.map(({ instanceId }) => instanceId),
    programs: COMBAT_EFFECT_IDS.map((effectId) =>
      program(effectId, [], {
        targetRule: { kind: "NONE" },
      }),
    ),
  });
}

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
