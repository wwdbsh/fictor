import type {
  AmountExpression,
  AtomicOperation,
  BlockRetentionPolicy,
  CardDefinition,
  CardInstance,
  CombatCommand,
  CombatEvent,
  CombatRules,
  CombatSetup,
  CombatState,
  CombatTarget,
  EffectProgram,
  EnemyIntent,
  OperationTarget,
  TargetRule,
} from "./types";

function own<T>(object: object, key: PropertyKey): T {
  return Object.getOwnPropertyDescriptor(object, key)!.value as T;
}

function ownArray<T, U>(array: readonly T[], clone: (value: T) => U): U[] {
  const length = own<number>(array, "length");
  const result: U[] = [];
  for (let index = 0; index < length; index += 1) result.push(clone(own<T>(array, String(index))));
  return result;
}

function cloneStrings(values: readonly string[]): string[] {
  return ownArray(values, (value) => value);
}

function cloneTarget<T extends CombatTarget | OperationTarget>(target: T): T {
  const kind = own<T["kind"]>(target, "kind");
  if (kind === "ENEMY") return { kind: "ENEMY", enemyId: own<string>(target, "enemyId") } as T;
  if (kind === "SELECTED") return { kind: "SELECTED" } as T;
  return { kind: "PLAYER" } as T;
}

function cloneAmount(amount: AmountExpression): AmountExpression {
  const kind = own<AmountExpression["kind"]>(amount, "kind");
  return kind === "FIXED"
    ? { kind: "FIXED", amount: own<number>(amount, "amount") }
    : { kind: "EFFECT_POWER", multiplier: own<number>(amount, "multiplier") };
}

export function cloneOperation(operation: AtomicOperation): AtomicOperation {
  const kind = own<AtomicOperation["kind"]>(operation, "kind");
  const target = cloneTarget(own<OperationTarget>(operation, "target"));
  const amount = cloneAmount(own<AmountExpression>(operation, "amount"));
  switch (kind) {
    case "DAMAGE": return { kind: "DAMAGE", target, amount };
    case "GAIN_BLOCK": return { kind: "GAIN_BLOCK", target, amount };
    case "HEAL": return { kind: "HEAL", target, amount };
  }
}

function cloneTargetRule(rule: TargetRule): TargetRule {
  const kind = own<TargetRule["kind"]>(rule, "kind");
  return kind === "NONE"
    ? { kind: "NONE" }
    : { kind: "REQUIRED", allowed: own<"PLAYER" | "ENEMY" | "EITHER">(rule, "allowed") };
}

function cloneIntent(intent: EnemyIntent): EnemyIntent {
  const program = own<EnemyIntent["program"]>(intent, "program");
  return {
    intentId: own<string>(intent, "intentId"),
    labelKo: own<string>(intent, "labelKo"),
    telegraph: own<EnemyIntent["telegraph"]>(intent, "telegraph"),
    displayAmount: own<number | null>(intent, "displayAmount"),
    program: { operations: ownArray(own<AtomicOperation[]>(program, "operations"), cloneOperation) },
  };
}

function cloneProgram(program: EffectProgram): EffectProgram {
  return {
    effectId: own<EffectProgram["effectId"]>(program, "effectId"),
    targetRule: cloneTargetRule(own<TargetRule>(program, "targetRule")),
    playedCardDestination: own<EffectProgram["playedCardDestination"]>(program, "playedCardDestination"),
    operations: ownArray(own<AtomicOperation[]>(program, "operations"), cloneOperation),
  };
}

function cloneCard(card: CardDefinition): CardDefinition {
  return {
    cardId: own<string>(card, "cardId"),
    effectId: own<CardDefinition["effectId"]>(card, "effectId"),
    cost: own<number | null>(card, "cost"),
    power: own<number | null>(card, "power"),
    resonanceAttribute: own<CardDefinition["resonanceAttribute"]>(card, "resonanceAttribute"),
  };
}

function cloneInstance(instance: CardInstance): CardInstance {
  return { instanceId: own<string>(instance, "instanceId"), cardId: own<string>(instance, "cardId") };
}

function cloneRetention(policy: BlockRetentionPolicy): BlockRetentionPolicy {
  return {
    numerator: own<number>(policy, "numerator"),
    denominator: own<number>(policy, "denominator"),
    rounding: "FLOOR",
  };
}

function cloneRules(rules: CombatRules): CombatRules {
  return {
    maxEnergy: own<number>(rules, "maxEnergy"),
    drawCount: own<number>(rules, "drawCount"),
    resonanceRate: own<number | null>(rules, "resonanceRate"),
    blockRetention: cloneRetention(own<BlockRetentionPolicy>(rules, "blockRetention")),
    terminalPolicy: own<CombatRules["terminalPolicy"]>(rules, "terminalPolicy"),
  };
}

export function cloneCombatState(state: CombatState): CombatState {
  const player = own<CombatState["player"]>(state, "player");
  const enemy = own<CombatState["enemy"]>(state, "enemy");
  const zones = own<CombatState["zones"]>(state, "zones");
  const resonance = own<CombatState["resonance"]>(state, "resonance");
  const streaks = own<CombatState["resonance"]["streakByAttribute"]>(resonance, "streakByAttribute");
  return {
    schemaVersion: own<CombatState["schemaVersion"]>(state, "schemaVersion"),
    engineVersion: own<CombatState["engineVersion"]>(state, "engineVersion"),
    prngVersion: own<CombatState["prngVersion"]>(state, "prngVersion"),
    phase: own<CombatState["phase"]>(state, "phase"),
    status: own<CombatState["status"]>(state, "status"),
    turn: own<number>(state, "turn"),
    randomState: own<number>(state, "randomState"),
    rules: cloneRules(own<CombatRules>(state, "rules")),
    player: {
      hp: own<number>(player, "hp"), maxHp: own<number>(player, "maxHp"),
      block: own<number>(player, "block"), energy: own<number>(player, "energy"),
    },
    enemy: {
      hp: own<number>(enemy, "hp"), maxHp: own<number>(enemy, "maxHp"), block: own<number>(enemy, "block"),
      enemyId: own<string>(enemy, "enemyId"),
      intents: ownArray(own<EnemyIntent[]>(enemy, "intents"), cloneIntent),
      currentIntentIndex: own<number>(enemy, "currentIntentIndex"),
    },
    cards: ownArray(own<CardDefinition[]>(state, "cards"), cloneCard),
    instances: ownArray(own<CardInstance[]>(state, "instances"), cloneInstance),
    programs: ownArray(own<EffectProgram[]>(state, "programs"), cloneProgram),
    zones: {
      deck: cloneStrings(own<string[]>(zones, "deck")), hand: cloneStrings(own<string[]>(zones, "hand")),
      discard: cloneStrings(own<string[]>(zones, "discard")), exile: cloneStrings(own<string[]>(zones, "exile")),
    },
    resonance: {
      activeAttribute: own<CombatState["resonance"]["activeAttribute"]>(resonance, "activeAttribute"),
      streakByAttribute: {
        STILL: own<number>(streaks, "STILL"), BURN: own<number>(streaks, "BURN"),
        SCATTER: own<number>(streaks, "SCATTER"), ROT: own<number>(streaks, "ROT"),
        WASH: own<number>(streaks, "WASH"), JOIN: own<number>(streaks, "JOIN"),
      },
    },
  };
}

export function cloneCombatSetup(setup: CombatSetup): CombatSetup {
  const player = own<CombatSetup["player"]>(setup, "player");
  const enemy = own<CombatSetup["enemy"]>(setup, "enemy");
  return {
    seed: own<number>(setup, "seed"),
    rules: cloneRules(own<CombatRules>(setup, "rules")),
    player: { hp: own<number>(player, "hp"), maxHp: own<number>(player, "maxHp"), block: own<number>(player, "block") },
    enemy: {
      hp: own<number>(enemy, "hp"), maxHp: own<number>(enemy, "maxHp"), block: own<number>(enemy, "block"),
      enemyId: own<string>(enemy, "enemyId"), intents: ownArray(own<EnemyIntent[]>(enemy, "intents"), cloneIntent),
      initialIntentIndex: own<number>(enemy, "initialIntentIndex"),
    },
    cards: ownArray(own<CardDefinition[]>(setup, "cards"), cloneCard),
    instances: ownArray(own<CardInstance[]>(setup, "instances"), cloneInstance),
    deck: cloneStrings(own<string[]>(setup, "deck")),
    programs: ownArray(own<EffectProgram[]>(setup, "programs"), cloneProgram),
  };
}

export function cloneCommand(command: CombatCommand): CombatCommand {
  const type = own<CombatCommand["type"]>(command, "type");
  switch (type) {
    case "START_TURN": return { type: "START_TURN" };
    case "END_TURN": return { type: "END_TURN" };
    case "PLAY_CARD": {
      const target = own<CombatTarget | null>(command, "target");
      return { type: "PLAY_CARD", instanceId: own<string>(command, "instanceId"), target: target === null ? null : cloneTarget(target) };
    }
    default: throw new Error("Invalid combat command during canonicalization");
  }
}

export function cloneEvents(events: readonly CombatEvent[]): CombatEvent[] {
  return events.map((event): CombatEvent => {
    switch (event.type) {
      case "COMMAND_REJECTED": return { type: event.type, command: event.command, reason: event.reason };
      case "PHASE_CHANGED": return { type: event.type, phase: event.phase };
      case "TURN_STARTED": return { type: event.type, turn: event.turn, energy: event.energy };
      case "DISCARD_SHUFFLED": return { type: event.type, instanceIds: event.instanceIds.slice() };
      case "CARD_DRAWN": return { type: event.type, instanceId: event.instanceId };
      case "ENERGY_SPENT": return { type: event.type, amount: event.amount, remaining: event.remaining };
      case "RESONANCE_ADVANCED": return { type: event.type, attribute: event.attribute, streak: event.streak };
      case "CARD_PLAYED": return { type: event.type, instanceId: event.instanceId, cardId: event.cardId, effectId: event.effectId, effectivePower: event.effectivePower };
      case "OPERATION_APPLIED": return { type: event.type, source: event.source, operation: event.operation, target: cloneTarget(event.target), amount: event.amount };
      case "CARD_MOVED": return { type: event.type, instanceId: event.instanceId, from: "HAND", to: event.to };
      case "HAND_DISCARDED": return { type: event.type, instanceIds: event.instanceIds.slice() };
      case "ENEMY_BLOCK_EXPIRED": return { type: event.type, amount: event.amount };
      case "ENEMY_INTENT_EXECUTED": return { type: event.type, intentId: event.intentId };
      case "PLAYER_BLOCK_RETAINED": return { type: event.type, before: event.before, after: event.after };
      case "ENEMY_INTENT_ROTATED": return { type: event.type, intentId: event.intentId };
      case "COMBAT_ENDED": return { type: event.type, status: event.status };
      case "TURN_ENDED": return { type: event.type, turn: event.turn };
    }
  });
}
