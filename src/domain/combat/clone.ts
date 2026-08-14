import type {
  AmountExpression,
  AtomicOperation,
  CombatCommand,
  CombatEvent,
  CombatSetup,
  CombatState,
  CombatTarget,
  EffectProgram,
  EnemyIntent,
  OperationTarget,
} from "./types";

function cloneTarget<T extends CombatTarget | OperationTarget>(target: T): T {
  return { ...target };
}

function cloneAmount(amount: AmountExpression): AmountExpression {
  return { ...amount };
}

export function cloneOperation(operation: AtomicOperation): AtomicOperation {
  return { ...operation, target: cloneTarget(operation.target), amount: cloneAmount(operation.amount) };
}

function cloneIntent(intent: EnemyIntent): EnemyIntent {
  return {
    ...intent,
    program: { operations: intent.program.operations.map(cloneOperation) },
  };
}

function cloneProgram(program: EffectProgram): EffectProgram {
  return {
    ...program,
    targetRule: { ...program.targetRule },
    operations: program.operations.map(cloneOperation),
  };
}

export function cloneCombatState(state: CombatState): CombatState {
  return {
    ...state,
    rules: { ...state.rules, blockRetention: { ...state.rules.blockRetention } },
    player: { ...state.player },
    enemy: { ...state.enemy, intents: state.enemy.intents.map(cloneIntent) },
    cards: state.cards.map((card) => ({ ...card })),
    instances: state.instances.map((instance) => ({ ...instance })),
    programs: state.programs.map(cloneProgram),
    zones: {
      deck: [...state.zones.deck],
      hand: [...state.zones.hand],
      discard: [...state.zones.discard],
      exile: [...state.zones.exile],
    },
    resonance: {
      activeAttribute: state.resonance.activeAttribute,
      streakByAttribute: { ...state.resonance.streakByAttribute },
    },
  };
}

export function cloneCombatSetup(setup: CombatSetup): CombatSetup {
  return {
    ...setup,
    rules: { ...setup.rules, blockRetention: { ...setup.rules.blockRetention } },
    player: { ...setup.player },
    enemy: { ...setup.enemy, intents: setup.enemy.intents.map(cloneIntent) },
    cards: setup.cards.map((card) => ({ ...card })),
    instances: setup.instances.map((instance) => ({ ...instance })),
    deck: [...setup.deck],
    programs: setup.programs.map(cloneProgram),
  };
}

export function cloneCommand(command: CombatCommand): CombatCommand {
  return command.type === "PLAY_CARD"
    ? { ...command, target: command.target === null ? null : cloneTarget(command.target) }
    : { ...command };
}

export function cloneEvents(events: readonly CombatEvent[]): CombatEvent[] {
  return events.map((event) => {
    if (event.type === "DISCARD_SHUFFLED" || event.type === "HAND_DISCARDED") {
      return { ...event, instanceIds: [...event.instanceIds] };
    }
    if (event.type === "OPERATION_APPLIED") return { ...event, target: cloneTarget(event.target) };
    return { ...event };
  });
}
