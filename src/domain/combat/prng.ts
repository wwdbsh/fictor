import type { CombatEvent, CombatState } from "./types";

const UINT32_RANGE = 0x1_0000_0000;
const STATE_INCREMENT = 0x9e37_79b9;

export interface Uint32Result {
  state: number;
  value: number;
}

export function nextUint32(state: number): Uint32Result {
  const nextState = (state + STATE_INCREMENT) >>> 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0_aaad) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a_2d97) >>> 0;
  mixed = (mixed ^ (mixed >>> 15)) >>> 0;
  return { state: nextState, value: mixed };
}

export function nextBoundedUint32(state: number, upperExclusive: number): Uint32Result {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0 || upperExclusive > UINT32_RANGE) {
    throw new RangeError("upperExclusive must be an integer in 1..2^32");
  }
  const acceptedRange = Math.floor(UINT32_RANGE / upperExclusive) * upperExclusive;
  let nextState = state;
  while (true) {
    const next = nextUint32(nextState);
    nextState = next.state;
    if (next.value < acceptedRange) {
      const bucket = Math.floor(next.value / upperExclusive);
      return { state: nextState, value: next.value - bucket * upperExclusive };
    }
  }
}

export function shuffleInstanceIds(
  instanceIds: readonly string[],
  randomState: number,
): { instanceIds: string[]; randomState: number } {
  const shuffled = instanceIds.slice();
  let state = randomState;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const next = nextBoundedUint32(state, index + 1);
    state = next.state;
    const held = shuffled[index];
    shuffled[index] = shuffled[next.value];
    shuffled[next.value] = held;
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
      events.push({ type: "DISCARD_SHUFFLED", instanceIds: shuffled.instanceIds.slice() });
    }
    const instanceId = state.zones.deck.shift();
    if (instanceId === undefined) return;
    state.zones.hand.push(instanceId);
    events.push({ type: "CARD_DRAWN", instanceId });
  }
}
