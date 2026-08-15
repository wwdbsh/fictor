import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { T030_TRACK1_ASSET_MANIFEST, track1AssetRecordForUrl, track1DynamicAssetPolicy, type AssetUrlContext, type Track1DynamicAssetPolicy } from "../../src/presentation/assets";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("Track 1 visible asset manifest", () => {
  it("is a small source-pinned projection of exact T022 records without importing audit JSON", () => {
    const auditBytes = readFileSync(resolve(repositoryRoot, "assets/manifests/t022-m2-assets-audit-v1.json"));
    const audit = JSON.parse(auditBytes.toString("utf8"));
    expect(createHash("sha256").update(auditBytes).digest("hex")).toBe(T030_TRACK1_ASSET_MANIFEST.t022ManifestSha256);
    expect(audit.contract_sha256).toBe(T030_TRACK1_ASSET_MANIFEST.t022ContractSha256);
    expect(T030_TRACK1_ASSET_MANIFEST.assets).toHaveLength(13);
    expect(T030_TRACK1_ASSET_MANIFEST.dynamicSlots).toEqual([
      { slot: "HAND", authority: "T029_BROWSER_RUNTIME_PACKET", requestedPngPolicy: "T022_PRESENT_OR_EXPLICIT_FALLBACK", fallback: "NAMED_CSS_PLACEHOLDER" },
      { slot: "REWARD", authority: "T029_BROWSER_RUNTIME_PACKET", requestedPngPolicy: "T022_PRESENT_OR_EXPLICIT_FALLBACK", fallback: "NAMED_CSS_PLACEHOLDER" },
      { slot: "DISCOVERY_RESULT", authority: "T029_BROWSER_RUNTIME_PACKET", requestedPngPolicy: "T022_PRESENT_OR_EXPLICIT_FALLBACK", fallback: "FIRST_MATERIAL_THEN_NAMED_CSS_PLACEHOLDER" },
    ]);
    expect(Object.isFrozen(T030_TRACK1_ASSET_MANIFEST.dynamicSlots)).toBe(true);
    expect(T030_TRACK1_ASSET_MANIFEST.dynamicSlots.every(Object.isFrozen)).toBe(true);

    const auditedByPath = new Map(audit.assets.records.map((record: { public_path: string }) => [record.public_path.replace(/^public\/assets\//, ""), record]));
    for (const asset of T030_TRACK1_ASSET_MANIFEST.assets) {
      expect(auditedByPath.get(asset.path)).toMatchObject({ id: asset.id, sha256: asset.sha256, bytes: asset.bytes });
      expect(statSync(resolve(repositoryRoot, "public/assets", asset.path)).size).toBe(asset.bytes);
    }
    const nestedContext: AssetUrlContext = { origin: "https://fictor.test", basePath: "/nested/fictor/" };
    expect(track1AssetRecordForUrl("/nested/fictor/assets/backgrounds/background__still__depth_01.png?cache=1", nestedContext)?.id).toBe("background__still__depth_01");
    expect(track1AssetRecordForUrl("/nested/fictor/assets/nested/fictor/assets/backgrounds/background__still__depth_01.png", nestedContext)).toBeNull();
    expect(track1AssetRecordForUrl("https://example.invalid/nested/fictor/assets/cards/ore_still.png", nestedContext)).toBeNull();
  });

  it("fails dynamic policy lookup closed on authority, PNG rule, fallback, or cardinality drift", () => {
    const valid = track1DynamicAssetPolicy("DISCOVERY_RESULT");
    expect(valid).toEqual(T030_TRACK1_ASSET_MANIFEST.dynamicSlots[2]);
    const drift = (overrides: Record<string, unknown>) => [{ ...valid!, ...overrides }] as unknown as readonly Track1DynamicAssetPolicy[];
    expect(track1DynamicAssetPolicy("DISCOVERY_RESULT", drift({ authority: "OTHER" }))).toBeNull();
    expect(track1DynamicAssetPolicy("DISCOVERY_RESULT", drift({ requestedPngPolicy: "ANY_PNG" }))).toBeNull();
    expect(track1DynamicAssetPolicy("DISCOVERY_RESULT", drift({ fallback: "NAMED_CSS_PLACEHOLDER" }))).toBeNull();
    expect(track1DynamicAssetPolicy("DISCOVERY_RESULT", [valid!, valid!])).toBeNull();
    expect(track1DynamicAssetPolicy("UNBOUND")).toBeNull();
  });

  it("binds every production AssetImage caller to an explicit static or dynamic role", () => {
    const sources = [
      readFileSync(resolve(repositoryRoot, "src/presentation/App.tsx"), "utf8"),
      readFileSync(resolve(repositoryRoot, "src/presentation/discovery/DiscoveryPresentation.tsx"), "utf8"),
    ].join("\n");
    const calls = [...sources.matchAll(/<AssetImage\b[^>]*>/gs)].map((match) => match[0]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((call) => !/\bassetRole="(?:STATIC_MANIFEST|HAND|REWARD|DISCOVERY_RESULT)"/.test(call))).toEqual([]);
    expect(new Set(calls.flatMap((call) => call.match(/assetRole="([A-Z_]+)"/)?.slice(1) ?? []))).toEqual(new Set(["STATIC_MANIFEST", "HAND", "REWARD", "DISCOVERY_RESULT"]));
  });
});
