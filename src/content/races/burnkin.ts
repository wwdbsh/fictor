import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";
import { PLAYABLE_GROUND_IDS } from "../grounds/factory";
import { PUBLIC_NAMES } from "../public-names";

export const BURNKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Burnkin",
  nameKo: PUBLIC_NAMES.races.Burnkin.ko,
  labelKo: PUBLIC_NAMES.races.Burnkin.ko,
  attribute: "BURN",
  status: "ENABLED",
  enabled: true,
  groundIds: PLAYABLE_GROUND_IDS,
  policyId: "Burnkin",
});

export default BURNKIN_DESCRIPTOR;
