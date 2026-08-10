import { ATTRIBUTE_ORDER } from "./contracts";

export const lawCollectionSchema = {
  $id: "fictor.laws",
  type: "array",
  minItems: 21,
  maxItems: 21,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "pair",
      "result_class",
      "result_name_ko",
      "actor",
      "law_text_ko",
      "combat_effect",
      "balance_status",
      "power_coefficient",
    ],
    properties: {
      pair: {
        type: "array",
        items: { enum: ATTRIBUTE_ORDER },
        minItems: 2,
        maxItems: 2,
      },
      result_class: { type: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
      result_name_ko: { type: "string", minLength: 1 },
      actor: { enum: ATTRIBUTE_ORDER },
      law_text_ko: { type: "string", minLength: 1 },
      combat_effect: { type: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
      balance_status: { enum: ["PENDING_2026_08_21", "APPROVED"] },
      power_coefficient: {
        anyOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "null" }],
      },
      drawback: { type: "string", minLength: 1 },
    },
    allOf: [
      {
        if: { properties: { balance_status: { const: "PENDING_2026_08_21" } } },
        then: { properties: { power_coefficient: { type: "null" } } },
        else: { properties: { power_coefficient: { type: "number", exclusiveMinimum: 0 } } },
      },
    ],
  },
} as const;
