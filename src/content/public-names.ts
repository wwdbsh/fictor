import { freeze } from "../freeze";

export const PUBLIC_NAMES = freeze({
  title: freeze({ en: "FICTOR", ko: "픽토르" } as const),
  races: freeze({
    Stillkin: freeze({ en: "Stillkin", ko: "어름붙이" } as const),
    Burnkin: freeze({ en: "Burnkin", ko: "사름붙이" } as const),
    Joinkin: freeze({ en: "Joinkin", ko: "이음붙이" } as const),
  } as const),
  elderGods: freeze({
    the_stilling: freeze({ en: "The Stilling", ko: "어름" } as const),
    the_burning: freeze({ en: "The Burning", ko: "사름" } as const),
    the_scattering: freeze({ en: "The Scattering", ko: "흩음" } as const),
    the_rotting: freeze({ en: "The Rotting", ko: "삭음" } as const),
    the_washing: freeze({ en: "The Washing", ko: "씻음" } as const),
    the_joining: freeze({ en: "The Joining", ko: "이음" } as const),
  } as const),
} as const);

export type PublicRaceId = keyof typeof PUBLIC_NAMES.races;
export type PublicRaceNameKo = (typeof PUBLIC_NAMES.races)[PublicRaceId]["ko"];
export type PublicElderGodId = keyof typeof PUBLIC_NAMES.elderGods;
export type PublicElderGodNameEn = (typeof PUBLIC_NAMES.elderGods)[PublicElderGodId]["en"];
