import { resolveCanonicalAssetPrefix, resolveSafeLocalAssetUrl, type AssetUrlContext } from "./asset-url";

export type Track1DynamicAssetSlot = "HAND" | "REWARD" | "DISCOVERY_RESULT";
export type Track1DynamicAssetFallback = "NAMED_CSS_PLACEHOLDER" | "FIRST_MATERIAL_THEN_NAMED_CSS_PLACEHOLDER";

export interface Track1DynamicAssetPolicy {
  readonly slot: Track1DynamicAssetSlot;
  readonly authority: "T029_BROWSER_RUNTIME_PACKET";
  readonly requestedPngPolicy: "T022_PRESENT_OR_EXPLICIT_FALLBACK";
  readonly fallback: Track1DynamicAssetFallback;
}

const dynamicSlots: readonly Track1DynamicAssetPolicy[] = Object.freeze([
  Object.freeze({ slot: "HAND", authority: "T029_BROWSER_RUNTIME_PACKET", requestedPngPolicy: "T022_PRESENT_OR_EXPLICIT_FALLBACK", fallback: "NAMED_CSS_PLACEHOLDER" }),
  Object.freeze({ slot: "REWARD", authority: "T029_BROWSER_RUNTIME_PACKET", requestedPngPolicy: "T022_PRESENT_OR_EXPLICIT_FALLBACK", fallback: "NAMED_CSS_PLACEHOLDER" }),
  Object.freeze({ slot: "DISCOVERY_RESULT", authority: "T029_BROWSER_RUNTIME_PACKET", requestedPngPolicy: "T022_PRESENT_OR_EXPLICIT_FALLBACK", fallback: "FIRST_MATERIAL_THEN_NAMED_CSS_PLACEHOLDER" }),
]);

export const T030_TRACK1_ASSET_MANIFEST = Object.freeze({
  schemaVersion: "fictor-track1-visible-assets-v1",
  t022ContractSha256: "1d1d68b20896583bbd88c66c5df3d62971be820d8419ffbd6905e4f38be0185c",
  t022ManifestSha256: "1456506d259c95f3e68d8383b9fafe2ed026ffa260b9f82fc65960d5395a429b",
  dynamicSlots,
  assets: Object.freeze([
    Object.freeze({ id: "ore_still", path: "cards/ore_still.png", sha256: "33a2dcae1c8c3dfc27fe5fc869f24fceab94ba4c23a297feef20781f2c65edb5", bytes: 1_678_253 }),
    Object.freeze({ id: "heart__still", path: "cards/heart__still.png", sha256: "2a079532f0610de1af117422a32c7d33a24bd0c55758c48db94e724911e98995", bytes: 2_451_768 }),
    Object.freeze({ id: "background__still__depth_01", path: "backgrounds/background__still__depth_01.png", sha256: "7a67c4cc17bafcedd522ffa45273e3420b539289509d7756a7127e89d491a0be", bytes: 2_296_255 }),
    Object.freeze({ id: "background__still__depth_02", path: "backgrounds/background__still__depth_02.png", sha256: "dd072455909d2e5f6c8b84d31ce36bdf1f4a007abdd39c9736dd2966e95d89c2", bytes: 2_621_788 }),
    Object.freeze({ id: "background__still__depth_03", path: "backgrounds/background__still__depth_03.png", sha256: "ad00e85febef89e2a5229bbf72bcb0c10920c7ce56e4a3f5d4a332afc19acf4d", bytes: 2_295_908 }),
    Object.freeze({ id: "enemy__still__swarm", path: "enemies/enemy__still__swarm.png", sha256: "5d864fd06ed8a0a5e0e6b7150d01a303cba931de295a388e062642cbe67e3442", bytes: 2_034_875 }),
    Object.freeze({ id: "elite__still__burn", path: "enemies/elite__still__burn.png", sha256: "486d5ef2e6550e4386c46d24df959290dd3c8117d8ede306af45374044f8dcad", bytes: 2_122_207 }),
    Object.freeze({ id: "event__workshop", path: "events/event__workshop.png", sha256: "0de206c5fe3ce95909d3711fdafc324a223227892ba5d0187ac0e2554c526028", bytes: 2_173_162 }),
    Object.freeze({ id: "event__collapse", path: "events/event__collapse.png", sha256: "4c8cb202bfe0c082105811eb54ab6e71477b0b20689924daf31af61487fb7c94", bytes: 1_739_882 }),
    Object.freeze({ id: "event__fictor", path: "events/event__fictor.png", sha256: "fdac21b47a93d9c24991a69951badf642fa5a811ae7548760d9f0d378c94cb5d", bytes: 3_003_886 }),
    Object.freeze({ id: "event__record", path: "events/event__record.png", sha256: "c30dec9acce3a0ed1a4b2a1f1f5085c4739c7c6f0638466127ef33c69b896357", bytes: 1_697_247 }),
    Object.freeze({ id: "event__cache__still", path: "events/event__cache__still.png", sha256: "b2ce5f357726f0271b1a6a78c838bb8baebb1bc11165a45453205f85b1f07f5b", bytes: 2_430_152 }),
    Object.freeze({ id: "event__oddity__still", path: "events/event__oddity__still.png", sha256: "e34908ba1c3ef84db6a2e898fcc34f04f0bd66b86442bfd232ad6aa2d5a98609", bytes: 2_165_378 }),
  ]),
});

export type Track1AssetRecord = (typeof T030_TRACK1_ASSET_MANIFEST.assets)[number];

const expectedFallbackBySlot: Readonly<Record<Track1DynamicAssetSlot, Track1DynamicAssetFallback>> = Object.freeze({
  HAND: "NAMED_CSS_PLACEHOLDER",
  REWARD: "NAMED_CSS_PLACEHOLDER",
  DISCOVERY_RESULT: "FIRST_MATERIAL_THEN_NAMED_CSS_PLACEHOLDER",
});

export function track1DynamicAssetPolicy(slot: unknown, policies: readonly Track1DynamicAssetPolicy[] = T030_TRACK1_ASSET_MANIFEST.dynamicSlots): Track1DynamicAssetPolicy | null {
  if (slot !== "HAND" && slot !== "REWARD" && slot !== "DISCOVERY_RESULT") return null;
  const matches = policies.filter((policy) => policy.slot === slot);
  if (matches.length !== 1) return null;
  const policy = matches[0];
  if (
    policy.authority !== "T029_BROWSER_RUNTIME_PACKET" ||
    policy.requestedPngPolicy !== "T022_PRESENT_OR_EXPLICIT_FALLBACK" ||
    policy.fallback !== expectedFallbackBySlot[slot]
  ) return null;
  return policy;
}

export function track1AssetRecordForUrl(src: string, context?: AssetUrlContext): Track1AssetRecord | null {
  const safeUrl = resolveSafeLocalAssetUrl(src, context);
  const assetPrefix = resolveCanonicalAssetPrefix(context);
  if (!safeUrl || !assetPrefix) return null;
  const pathname = safeUrl.split(/[?#]/, 1)[0];
  return T030_TRACK1_ASSET_MANIFEST.assets.find(({ path }) => pathname === `${assetPrefix}${path}`) ?? null;
}
