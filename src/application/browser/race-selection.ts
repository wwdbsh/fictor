import { listEnabledRaces } from "../../content";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../../persistence";
import { createStillkinTrack1UiSession } from "./stillkin-track1-ui-session";
import type { StillkinTrack1UiSession } from "./ui-types";

export const FICTOR_RACE_SELECTION_KEY = "fictor.race.v1" as const;
export type PlayableTrack1RaceId = "Stillkin" | "Burnkin";

export interface Track1RaceSelectionChoice {
  readonly raceId: PlayableTrack1RaceId;
  readonly labelKo: "어름붙이" | "사름붙이";
  readonly attribute: "STILL" | "BURN";
  readonly summaryKo: string;
}

export interface Track1RaceSelection {
  readonly initialRaceId: PlayableTrack1RaceId | null;
  readonly choices: readonly Track1RaceSelectionChoice[];
  select(raceId: PlayableTrack1RaceId): boolean;
  createSession(raceId: PlayableTrack1RaceId): StillkinTrack1UiSession;
}

export interface Track1RaceSelectionOptions {
  readonly storage: StorageLike;
  readonly baseUrl: string;
}

function selectedRace(storage: StorageLike): PlayableTrack1RaceId | null {
  try {
    const selected = storage.getItem(FICTOR_RACE_SELECTION_KEY);
    if (selected === "Stillkin" || selected === "Burnkin") return selected;
    if (selected === null && storage.getItem(FICTOR_SAVE_V2_KEY) !== null) return "Stillkin";
  } catch { /* Selection stays unbound until an explicit successful choice. */ }
  return null;
}

export function createTrack1RaceSelection(options: Track1RaceSelectionOptions): Track1RaceSelection {
  const choices = listEnabledRaces().flatMap((race): Track1RaceSelectionChoice[] => {
    if (race.id === "Stillkin") return [{ raceId: "Stillkin", labelKo: "어름붙이", attribute: "STILL", summaryKo: "방어를 붙잡고 공명을 잊지 않습니다." }];
    if (race.id === "Burnkin") return [{ raceId: "Burnkin", labelKo: "사름붙이", attribute: "BURN", summaryKo: "체력과 카드를 태워 속도를 얻습니다." }];
    return [];
  });
  return Object.freeze({
    initialRaceId: selectedRace(options.storage),
    choices: Object.freeze(choices.map((choice) => Object.freeze(choice))),
    select(raceId: PlayableTrack1RaceId) {
      if (!choices.some((choice) => choice.raceId === raceId)) return false;
      try { options.storage.setItem(FICTOR_RACE_SELECTION_KEY, raceId); return true; } catch { return false; }
    },
    createSession(raceId: PlayableTrack1RaceId) {
      if (!choices.some((choice) => choice.raceId === raceId)) throw new TypeError("race is not enabled");
      return createStillkinTrack1UiSession({ storage: options.storage, baseUrl: options.baseUrl, raceId });
    },
  });
}
