import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";
import { PLAYABLE_GROUND_IDS } from "../grounds/factory";

export const STILLKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Stillkin",
  nameKo: "어름붙이",
  labelKo: "어름붙이",
  attribute: "STILL",
  status: "ENABLED",
  enabled: true,
  groundIds: PLAYABLE_GROUND_IDS,
  policyId: "Stillkin",
});

export default STILLKIN_DESCRIPTOR;
