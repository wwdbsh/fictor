import Ajv, { type ErrorObject } from "ajv";

import type { Law, Material, ResultClass } from "./contracts";
import { lawCollectionSchema } from "./law.schema";
import { materialCollectionSchema } from "./material.schema";
import { resultClassCollectionSchema } from "./result-class.schema";

export interface SourceData {
  materials: Material[];
  laws: Law[];
  resultClasses: ResultClass[];
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

const ajv = new Ajv({ allErrors: true, strict: true });
const validateMaterials = ajv.compile(materialCollectionSchema);
const validateLaws = ajv.compile(lawCollectionSchema);
const validateResultClasses = ajv.compile(resultClassCollectionSchema);

export function validateSourceSchemas(source: unknown): SchemaValidationResult {
  if (typeof source !== "object" || source === null) {
    return {
      valid: false,
      errors: [
        {
          instancePath: "",
          schemaPath: "#/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        },
      ],
    };
  }

  const candidate = source as Partial<SourceData>;
  const checks = [
    validateMaterials(candidate.materials),
    validateLaws(candidate.laws),
    validateResultClasses(candidate.resultClasses),
  ];
  const errors = [
    ...(validateMaterials.errors ?? []),
    ...(validateLaws.errors ?? []),
    ...(validateResultClasses.errors ?? []),
  ];

  return { valid: checks.every(Boolean), errors };
}
