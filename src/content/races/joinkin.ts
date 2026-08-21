import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";
import { PLAYABLE_GROUND_IDS } from "../grounds/factory";

export const JOINKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Joinkin",
  nameKo: "이음붙이",
  labelKo: "이음붙이",
  attribute: "JOIN",
  status: "ENABLED",
  enabled: true,
  groundIds: PLAYABLE_GROUND_IDS,
  policyId: "Joinkin",
});

export default JOINKIN_DESCRIPTOR;
