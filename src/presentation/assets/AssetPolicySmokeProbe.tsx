import type { ComponentType } from "react";

import { AssetImage } from "./AssetImage";

export default function AssetPolicySmokeProbe() {
  const RuntimeAssetImage = AssetImage as unknown as ComponentType<Record<string, unknown>>;
  return (
    <div hidden data-asset-policy-probe="ready">
      <AssetImage assetRole="HAND" src={"ht\ntps://blocked.invalid/newline.png"} placeholderLabel="newline scheme" alt="" />
      <AssetImage assetRole="HAND" src="//blocked.invalid/protocol-relative.png" placeholderLabel="protocol relative" alt="" />
      <AssetImage assetRole="HAND" src={`${import.meta.env.BASE_URL}assets/%252525252e%252525252e/cards/ore_still.png`} placeholderLabel="encoded traversal" alt="" />
      <RuntimeAssetImage assetRole="HAND" src={`${import.meta.env.BASE_URL}assets/cards/ore_still.png`} srcset="//blocked.invalid/external-srcset.png 1x" placeholderLabel="external srcset" alt="" />
    </div>
  );
}
