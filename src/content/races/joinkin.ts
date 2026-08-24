import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";
import { PLAYABLE_GROUND_IDS } from "../grounds/factory";
import { PUBLIC_NAMES } from "../public-names";

export const JOINKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Joinkin",
  nameKo: PUBLIC_NAMES.races.Joinkin.ko,
  labelKo: PUBLIC_NAMES.races.Joinkin.ko,
  attribute: "JOIN",
  status: "ENABLED",
  enabled: true,
  groundIds: PLAYABLE_GROUND_IDS,
  policyId: "Joinkin",
});

export default JOINKIN_DESCRIPTOR;
