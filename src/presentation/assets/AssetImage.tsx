import { useEffect, useState } from "react";

import { currentAssetUrlContext, resolveSafeLocalAssetUrl } from "./asset-url";
import { track1AssetRecordForUrl, track1DynamicAssetPolicy, type Track1DynamicAssetSlot } from "./track1-asset-manifest";

type ImageAttempt = "PRIMARY" | "FALLBACK" | "PLACEHOLDER";
export type AssetImageRole = "STATIC_MANIFEST" | Track1DynamicAssetSlot;

type CommonAssetImageProps = {
  readonly src: string;
  readonly placeholderLabel: string;
  readonly alt?: string;
  readonly className?: string;
  readonly id?: string;
  readonly title?: string;
  readonly loading?: "eager" | "lazy";
  readonly decoding?: "async" | "auto" | "sync";
  readonly width?: number | string;
  readonly height?: number | string;
};

type StaticAssetImageProps = CommonAssetImageProps & {
  readonly assetRole: "STATIC_MANIFEST";
  readonly fallbackSrc?: never;
};

type NoFallbackDynamicAssetImageProps = CommonAssetImageProps & {
  readonly assetRole: "HAND" | "REWARD";
  readonly fallbackSrc?: never;
};

type DiscoveryResultAssetImageProps = CommonAssetImageProps & {
  readonly assetRole: "DISCOVERY_RESULT";
  readonly fallbackSrc?: string | null;
};

export type AssetImageProps = StaticAssetImageProps | NoFallbackDynamicAssetImageProps | DiscoveryResultAssetImageProps;

function placeholder(className: string | undefined, placeholderLabel: string, alt: string, assetRole: unknown) {
  return (
    <span
      className={["asset-placeholder", className].filter(Boolean).join(" ")}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-asset-placeholder={placeholderLabel}
      data-asset-role={typeof assetRole === "string" ? assetRole.toLowerCase() : "unbound"}
    >
      <span aria-hidden="true">도판 없음</span>
      <strong aria-hidden="true">{placeholderLabel}</strong>
    </span>
  );
}

/** Enforces the declared Track 1 slot policy before any URL can reach img src. */
export function AssetImage(props: AssetImageProps) {
  const {
    src,
    placeholderLabel,
    alt = "",
    className,
    assetRole,
    fallbackSrc = null,
    id,
    title,
    loading,
    decoding,
    width,
    height,
  } = props;
  const context = currentAssetUrlContext();
  const resolvedPrimary = resolveSafeLocalAssetUrl(src, context);
  const dynamicPolicy = track1DynamicAssetPolicy(assetRole);
  const validRole = assetRole === "STATIC_MANIFEST" || dynamicPolicy !== null;
  const staticRecord = assetRole === "STATIC_MANIFEST" && resolvedPrimary
    ? track1AssetRecordForUrl(resolvedPrimary, context)
    : null;
  const safePrimarySrc = validRole && (assetRole !== "STATIC_MANIFEST" || staticRecord) ? resolvedPrimary : null;
  const resolvedFallback = typeof fallbackSrc === "string" ? resolveSafeLocalAssetUrl(fallbackSrc, context) : null;
  const safeFallbackSrc = dynamicPolicy?.fallback === "FIRST_MATERIAL_THEN_NAMED_CSS_PLACEHOLDER" && resolvedFallback && resolvedFallback !== safePrimarySrc
    ? resolvedFallback
    : null;
  const identity = `${String(assetRole)}\u0000${src}\u0000${fallbackSrc ?? ""}`;
  const initialAttempt: ImageAttempt = safePrimarySrc ? "PRIMARY" : safeFallbackSrc ? "FALLBACK" : "PLACEHOLDER";
  const [attemptState, setAttemptState] = useState<{ identity: string; attempt: ImageAttempt }>(() => ({ identity, attempt: initialAttempt }));
  const attempt = attemptState.identity === identity ? attemptState.attempt : initialAttempt;

  useEffect(() => {
    setAttemptState({ identity, attempt: initialAttempt });
  }, [identity, initialAttempt]);

  if (attempt === "PLACEHOLDER") return placeholder(className, placeholderLabel, alt, assetRole);

  const effectiveSrc = attempt === "PRIMARY" ? safePrimarySrc! : safeFallbackSrc!;
  const record = track1AssetRecordForUrl(effectiveSrc, context);
  return (
    <img
      id={id}
      title={title}
      loading={loading}
      decoding={decoding}
      width={width}
      height={height}
      className={className}
      src={effectiveSrc}
      alt={alt}
      data-asset-attempt={attempt.toLowerCase()}
      data-asset-role={String(assetRole).toLowerCase()}
      data-track1-asset-id={record?.id}
      onError={() => {
        setAttemptState((current) => {
          if (current.identity !== identity) return current;
          if (current.attempt === "PRIMARY" && safeFallbackSrc) return { identity, attempt: "FALLBACK" };
          return { identity, attempt: "PLACEHOLDER" };
        });
      }}
    />
  );
}
