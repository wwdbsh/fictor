import type { ForgeResolverContextV1 } from "../../domain/forge-runtime";

export const BROWSER_RUNTIME_PACKET_SCHEMA_VERSION = "fictor-browser-runtime-packet-v1" as const;

export interface BrowserMaterialDisplay {
  readonly id: string;
  readonly nameKo: string;
  readonly art: string;
  readonly category: "ORE" | "GROUND_PRODUCT" | "TOOL" | "ODDITY";
  readonly attribute: string | readonly string[];
}

/**
 * A checked, browser-safe projection of the three canonical handwritten sources.
 * The resolver context is intentionally the exact minimal T027 input shape.
 */
export interface BrowserRuntimePacketV1 {
  readonly schemaVersion: typeof BROWSER_RUNTIME_PACKET_SCHEMA_VERSION;
  readonly sourceHash: string;
  readonly counts: {
    readonly materials: 52;
    readonly laws: 21;
    readonly resultClasses: 34;
  };
  readonly assetAvailability: {
    readonly manifestSha256: string;
    readonly canonicalCardCount: 489;
    /** Exact 52×52 material-index membership matrix, packed least-significant bit first. */
    readonly materialPairBitsetHex: string;
  };
  readonly resolverContext: ForgeResolverContextV1;
  readonly materialDisplay: readonly BrowserMaterialDisplay[];
}

export function browserPacketHasCanonicalArt(packet: BrowserRuntimePacketV1, materialIds: readonly [string, string]): boolean {
  const indexes = materialIds.map((id) => packet.resolverContext.materials.findIndex((material) => material.id === id)).sort((left, right) => left - right);
  if (indexes[0] < 0 || indexes[1] < 0) return false;
  const index = indexes[0] * packet.resolverContext.materials.length + indexes[1];
  const byte = Number.parseInt(packet.assetAvailability.materialPairBitsetHex.slice(Math.floor(index / 8) * 2, Math.floor(index / 8) * 2 + 2), 16);
  return Number.isFinite(byte) && (byte & (1 << (index % 8))) !== 0;
}
