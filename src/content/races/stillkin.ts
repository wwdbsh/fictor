import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";
import { PLAYABLE_GROUND_IDS } from "../grounds/factory";
import { PUBLIC_NAMES } from "../public-names";

export const STILLKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Stillkin",
  nameKo: PUBLIC_NAMES.races.Stillkin.ko,
  labelKo: PUBLIC_NAMES.races.Stillkin.ko,
  attribute: "STILL",
  status: "ENABLED",
  enabled: true,
  groundIds: PLAYABLE_GROUND_IDS,
  policyId: "Stillkin",
});

export default STILLKIN_DESCRIPTOR;
