export const resultClassCollectionSchema = {
  $id: "fictor.result-classes",
  type: "array",
  minItems: 34,
  maxItems: 34,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "name_ko",
      "family",
      "composition",
      "colors",
      "density",
      "density_status",
      "density_rule",
      "combat_effect",
      "combat_effect_status",
      "combat_effect_rule",
    ],
    properties: {
      id: { type: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
      name_ko: { type: "string", minLength: 1 },
      family: { enum: ["CROSS", "SAME", "CATALYST", "EQUIPMENT", "HEART"] },
      composition: { enum: ["SPECIMEN", "CUTAWAY", "PROCESS", "SEQUENCE", "CELESTIAL", "MAP"] },
      colors: {
        type: "array",
        items: {
          enum: [
            "TEAL",
            "VERMILION",
            "SULPHUR",
            "ACID_GREEN",
            "ULTRAMARINE",
            "MAGENTA",
            "GOLD",
            "ACHROMATIC",
            "METALLIC",
          ],
        },
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
      },
      density: {
        anyOf: [{ enum: ["MIN", "SPARSE", "MID", "DENSE", "MAX"] }, { type: "null" }],
      },
      density_status: { enum: ["APPROVED", "DERIVED_FROM_MATERIAL"] },
      density_rule: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
      combat_effect: {
        anyOf: [{ type: "string", pattern: "^[A-Z][A-Z0-9_]*$" }, { type: "null" }],
      },
      combat_effect_status: { enum: ["APPROVED", "DERIVED_PER_RECIPE", "ATTRIBUTE_MAXIMUM_RULE"] },
      combat_effect_rule: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
    },
    allOf: [
      {
        if: { properties: { density_status: { const: "APPROVED" } } },
        then: {
          properties: {
            density: { enum: ["MIN", "SPARSE", "MID", "DENSE", "MAX"] },
            density_rule: { type: "null" },
          },
        },
        else: {
          properties: {
            density: { type: "null" },
            density_rule: { type: "string", minLength: 1 },
          },
        },
      },
      {
        if: { properties: { combat_effect_status: { const: "APPROVED" } } },
        then: {
          properties: {
            combat_effect: { type: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
            combat_effect_rule: { type: "null" },
          },
        },
        else: {
          properties: {
            combat_effect: { type: "null" },
            combat_effect_rule: { type: "string", minLength: 1 },
          },
        },
      },
    ],
  },
} as const;
