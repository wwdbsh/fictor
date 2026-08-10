import { ATTRIBUTES } from "./contracts";

const baseAttributes = ATTRIBUTES.filter((attribute) => attribute !== "NONE");

export const materialCollectionSchema = {
  $id: "fictor.materials",
  type: "array",
  minItems: 52,
  maxItems: 52,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "name_ko",
      "attribute",
      "modifier_form",
      "noun_form",
      "representation",
      "category",
      "origin",
      "rarity",
      "rarity_status",
      "balance_status",
      "potency",
      "cost_base",
      "art",
    ],
    properties: {
      id: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
      name_ko: { type: "string", minLength: 1 },
      attribute: {
        oneOf: [
          { enum: ATTRIBUTES },
          {
            type: "array",
            items: { enum: baseAttributes },
            minItems: 2,
            maxItems: 2,
            uniqueItems: true,
          },
        ],
      },
      modifier_form: { type: "string", minLength: 1 },
      noun_form: { type: "string", minLength: 1 },
      representation: { enum: ["SOLID", "PHENOMENON"] },
      category: { enum: ["ORE", "GROUND_PRODUCT", "TOOL", "ODDITY"] },
      origin: {
        enum: [
          "GROUND_STILL",
          "GROUND_BURN",
          "GROUND_SCATTER",
          "GROUND_ROT",
          "GROUND_WASH",
          "GROUND_JOIN",
          "NONE",
        ],
      },
      rarity: {
        anyOf: [{ enum: ["COMMON", "UNCOMMON", "RARE", "EQUIPMENT", "LEGENDARY"] }, { type: "null" }],
      },
      rarity_status: { enum: ["APPROVED", "PENDING_DEPTH_CLASSIFICATION"] },
      balance_status: { enum: ["PENDING_2026_08_21", "APPROVED"] },
      potency: { anyOf: [{ type: "integer", minimum: 1, maximum: 3 }, { type: "null" }] },
      cost_base: { anyOf: [{ type: "integer", minimum: 0, maximum: 2 }, { type: "null" }] },
      art: { type: "string", pattern: "^cards/[a-z][a-z0-9_]*\\.png$" },
    },
    allOf: [
      {
        if: { properties: { balance_status: { const: "PENDING_2026_08_21" } } },
        then: { properties: { potency: { type: "null" }, cost_base: { type: "null" } } },
        else: {
          properties: {
            potency: { type: "integer", minimum: 1, maximum: 3 },
            cost_base: { type: "integer", minimum: 0, maximum: 2 },
          },
        },
      },
      {
        if: { properties: { rarity_status: { const: "PENDING_DEPTH_CLASSIFICATION" } } },
        then: { properties: { rarity: { type: "null" } } },
        else: { properties: { rarity: { enum: ["COMMON", "UNCOMMON", "RARE", "EQUIPMENT", "LEGENDARY"] } } },
      },
    ],
  },
} as const;
