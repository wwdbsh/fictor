import type { CombatEvent, CombatState } from "./types";

export function nextUint32(state: number): { state: number; value: number } {
  const next = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
  return { state: next, value: next };
}

export function shuffleInstanceIds(
  instanceIds: readonly string[],
  randomState: number,
): { instanceIds: string[]; randomState: number } {
  const shuffled = [...instanceIds];
  let state = randomState;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const next = nextUint32(state);
    state = next.state;
    const swapIndex = next.value % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return { instanceIds: shuffled, randomState: state };
}

export function drawCards(state: CombatState, count: number, events: CombatEvent[]): void {
  for (let drawn = 0; drawn < count; drawn += 1) {
    if (state.zones.deck.length === 0 && state.zones.discard.length > 0) {
      const shuffled = shuffleInstanceIds(state.zones.discard, state.randomState);
      state.zones.deck = shuffled.instanceIds;
      state.zones.discard = [];
      state.randomState = shuffled.randomState;
      events.push({ type: "DISCARD_SHUFFLED", instanceIds: [...shuffled.instanceIds] });
    }
    const instanceId = state.zones.deck.shift();
    if (instanceId === undefined) return;
    state.zones.hand.push(instanceId);
    events.push({ type: "CARD_DRAWN", instanceId });
  }
}
