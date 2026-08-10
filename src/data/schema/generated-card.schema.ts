const materialId = { type: "string", pattern: "^[a-z][a-z0-9_]*$" } as const;
const hash = { type: "string", pattern: "^[0-9a-f]{64}$" } as const;
const density = {
  anyOf: [{ enum: ["MIN", "SPARSE", "MID", "DENSE", "MAX"] }, { type: "null" }],
} as const;

const generatedCardSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "card_id",
    "recipe_id",
    "material_ids",
    "branch",
    "result_class",
    "actor_id",
    "receptor_id",
    "name_ko",
    "effective_attributes",
    "combat_effect",
    "passive_effect_id",
    "drawback",
    "density",
    "density_status",
    "density_inputs",
    "balance_status",
    "stats",
    "art_key",
    "art",
  ],
  properties: {
    card_id: { type: "string", pattern: "^forge__[a-z][a-z0-9_]*__[a-z][a-z0-9_]*$" },
    recipe_id: { type: "string", pattern: "^[a-z][a-z0-9_]*\\|[a-z][a-z0-9_]*$" },
    material_ids: { type: "array", items: materialId, minItems: 2, maxItems: 2 },
    branch: { enum: ["LAW", "CATALYST", "EQUIPMENT"] },
    result_class: { type: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
    actor_id: materialId,
    receptor_id: materialId,
    name_ko: { type: "string", minLength: 1 },
    effective_attributes: {
      type: "array",
      items: { enum: ["STILL", "BURN", "SCATTER", "ROT", "WASH", "JOIN"] },
      minItems: 0,
      maxItems: 2,
    },
    combat_effect: {
      anyOf: [{ type: "string", pattern: "^[A-Z][A-Z0-9_]*$" }, { type: "null" }],
    },
    passive_effect_id: {
      anyOf: [{ type: "string", pattern: "^EQUIPMENT_[A-Z]+_[A-Z]+$" }, { type: "null" }],
    },
    drawback: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
    density,
    density_status: { enum: ["APPROVED", "DERIVED_FROM_MATERIAL"] },
    density_inputs: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["material_id", "representation"],
          properties: {
            material_id: materialId,
            representation: { enum: ["SOLID", "PHENOMENON"] },
          },
        },
        { type: "null" },
      ],
    },
    balance_status: { enum: ["PENDING_2026_08_21", "APPROVED", "NOT_APPLICABLE"] },
    stats: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["potency", "cost", "power"],
          properties: {
            potency: { anyOf: [{ type: "number" }, { type: "null" }] },
            cost: { anyOf: [{ type: "number" }, { type: "null" }] },
            power: { anyOf: [{ type: "number" }, { type: "null" }] },
          },
        },
        { type: "null" },
      ],
    },
    art_key: { type: "string", pattern: "^[A-Z][A-Z0-9_]*/[a-z][a-z0-9_]*_[a-z][a-z0-9_]*$" },
    art: { type: "string", pattern: "^cards/forge__[a-z][a-z0-9_]*__[a-z][a-z0-9_]*\\.png$" },
  },
  allOf: [
    {
      if: { properties: { branch: { const: "EQUIPMENT" } }, required: ["branch"] },
      then: {
        properties: {
          combat_effect: { type: "null" },
          passive_effect_id: { type: "string" },
          density_inputs: { type: "null" },
          balance_status: { const: "NOT_APPLICABLE" },
          stats: { type: "null" },
        },
      },
      else: {
        properties: {
          combat_effect: { type: "string" },
          passive_effect_id: { type: "null" },
          balance_status: { enum: ["PENDING_2026_08_21", "APPROVED"] },
          stats: { type: "object" },
        },
      },
    },
    {
      if: { properties: { balance_status: { const: "PENDING_2026_08_21" } } },
      then: {
        properties: {
          stats: {
            type: "object",
            properties: { potency: { type: "null" }, cost: { type: "null" }, power: { type: "null" } },
          },
        },
      },
    },
    {
      if: { properties: { balance_status: { const: "APPROVED" } } },
      then: {
        properties: {
          stats: {
            type: "object",
            properties: { potency: { type: "number" }, cost: { type: "number" }, power: { type: "number" } },
          },
        },
      },
    },
    {
      if: { properties: { density_status: { const: "DERIVED_FROM_MATERIAL" } } },
      then: { properties: { density: { type: "null" }, density_inputs: { type: "object" } } },
      else: { properties: { density: { enum: ["MIN", "SPARSE", "MID", "DENSE", "MAX"] }, density_inputs: { type: "null" } } },
    },
  ],
} as const;

const equipmentDetailSchema = {
  type: "object",
  additionalProperties: false,
  required: ["card_id", "recipe_id", "tool_ids", "domains", "passive_effect_id", "passive_effect_ko"],
  properties: {
    card_id: { type: "string", pattern: "^forge__tool_[0-9]{2}__tool_[0-9]{2}$" },
    recipe_id: { type: "string", pattern: "^tool_[0-9]{2}\\|tool_[0-9]{2}$" },
    tool_ids: { type: "array", items: materialId, minItems: 2, maxItems: 2 },
    domains: {
      type: "array",
      items: { enum: ["FORGE", "HAND", "DECK", "INFO", "SCALE", "ENERGY", "BALANCE", "KEEP", "ROUTE", "CARRY"] },
      minItems: 2,
      maxItems: 2,
    },
    passive_effect_id: { type: "string", pattern: "^EQUIPMENT_[A-Z]+_[A-Z]+$" },
    passive_effect_ko: { type: "string", minLength: 1 },
  },
} as const;

function envelopeSchema(itemSchema: object, count: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "generator_version", "source_hash", "content_hash", "count", "items"],
    properties: {
      schema_version: { const: 1 },
      generator_version: { const: "canonical-v1" },
      source_hash: hash,
      content_hash: hash,
      count: { const: count },
      items: { type: "array", minItems: count, maxItems: count, items: itemSchema },
    },
  } as const;
}

export const cardsEnvelopeSchema = envelopeSchema(generatedCardSchema, 1326);
export const equipmentEnvelopeSchema = envelopeSchema(equipmentDetailSchema, 45);
