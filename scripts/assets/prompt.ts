import { createHash } from "node:crypto";

import { PAPER_TONES, type AssetPromptInputs, type PaperTone } from "./types";

const CARD_STYLE =
  "Antique copperplate engraving plate, 17th century manuscript style, fine cross-hatching and line work, aged paper, single centered subject, strong readable silhouette at small size.";
const LANDSCAPE_STYLE =
  "Antique copperplate landscape engraving, 17th century topographical plate style, cross-hatching, atmospheric perspective, aged paper, wide vista.";

export function paperToneForId(id: string): PaperTone {
  const digest = createHash("sha256").update(id, "utf8").digest();
  const value = digest.readUInt32BE(0);
  return PAPER_TONES[value % PAPER_TONES.length];
}

function stableFields(inputs: AssetPromptInputs): string[] {
  const fields = [
    `composition=${inputs.composition}`,
    `subject=${inputs.subject}`,
    `colors=${inputs.colors.join("+")}`,
    `density=${inputs.density}`,
    `paper=${inputs.paper}`,
  ];
  if (inputs.representation) fields.push(`representation=${inputs.representation}`);
  if (inputs.material_inputs) {
    fields.push(
      `material_inputs=${inputs.material_inputs
        .map(({ material_id, representation }) => `${material_id}:${representation}`)
        .join(",")}`,
    );
  }
  if (inputs.attribute) fields.push(`attribute=${inputs.attribute}`);
  if (inputs.secondary_attribute) fields.push(`secondary_attribute=${inputs.secondary_attribute}`);
  if (inputs.depth !== undefined) fields.push(`depth=${inputs.depth}`);
  if (inputs.event_type) fields.push(`event_type=${inputs.event_type}`);
  if (inputs.shape) fields.push(`shape=${inputs.shape}`);
  return fields;
}

export function buildCardPrompt(inputs: AssetPromptInputs): string {
  const representation =
    inputs.representation === "PHENOMENON"
      ? "Depict the phenomenon directly with swirl lines, rays, dotted paths, or diffusion arrows; do not put it in a container or turn it into an object."
      : "Depict a tangible object with a clear physical silhouette.";
  return `${CARD_STYLE} ${stableFields(inputs).join("; ")}. ${representation} No text, lettering, border, UI, or watermark.`;
}

export function buildWorldPrompt(inputs: AssetPromptInputs, landscape = false): string {
  const style = landscape ? LANDSCAPE_STYLE : CARD_STYLE;
  return `${style} ${stableFields(inputs).join("; ")}. No text, lettering, border, UI, or watermark.`;
}
