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
  readonly resolverContext: ForgeResolverContextV1;
  readonly materialDisplay: readonly BrowserMaterialDisplay[];
}
