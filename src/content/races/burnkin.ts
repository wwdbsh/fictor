import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";

export const BURNKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Burnkin",
  nameKo: "사름붙이",
  labelKo: "사름붙이",
  attribute: "BURN",
  status: "ENABLED",
  enabled: true,
  groundIds: freeze(["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER", "GROUND_ROT"] as const),
  policyId: "Burnkin",
});

export default BURNKIN_DESCRIPTOR;
