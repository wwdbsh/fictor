import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";
import { PLAYABLE_GROUND_IDS } from "../grounds/factory";

export const BURNKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Burnkin",
  nameKo: "사름붙이",
  labelKo: "사름붙이",
  attribute: "BURN",
  status: "ENABLED",
  enabled: true,
  groundIds: PLAYABLE_GROUND_IDS,
  policyId: "Burnkin",
});

export default BURNKIN_DESCRIPTOR;
