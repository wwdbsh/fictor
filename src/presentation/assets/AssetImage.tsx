import { useEffect, useState, type ImgHTMLAttributes } from "react";

import { isSafeLocalAssetUrl } from "./asset-url";
import { track1AssetRecordForUrl } from "./track1-asset-manifest";

type ImageAttempt = "PRIMARY" | "FALLBACK" | "PLACEHOLDER";

export interface AssetImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  readonly src: string;
  readonly fallbackSrc?: string | null;
  readonly placeholderLabel: string;
}

/** Loads the requested art, permits one fallback request, then renders a named CSS placeholder. */
export function AssetImage({ src, fallbackSrc = null, placeholderLabel, alt = "", className, ...imageProps }: AssetImageProps) {
  const identity = `${src}\u0000${fallbackSrc ?? ""}`;
  const safePrimarySrc = isSafeLocalAssetUrl(src) ? src : null;
  const safeFallbackSrc = fallbackSrc && isSafeLocalAssetUrl(fallbackSrc) && fallbackSrc !== safePrimarySrc ? fallbackSrc : null;
  const initialAttempt: ImageAttempt = safePrimarySrc ? "PRIMARY" : safeFallbackSrc ? "FALLBACK" : "PLACEHOLDER";
  const [attemptState, setAttemptState] = useState<{ identity: string; attempt: ImageAttempt }>(() => ({ identity, attempt: initialAttempt }));
  const attempt = attemptState.identity === identity ? attemptState.attempt : initialAttempt;

  useEffect(() => {
    setAttemptState({ identity, attempt: initialAttempt });
  }, [identity, initialAttempt]);

  if (attempt === "PLACEHOLDER") {
    return (
      <span
        className={["asset-placeholder", className].filter(Boolean).join(" ")}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-asset-placeholder={placeholderLabel}
      >
        <span aria-hidden="true">도판 없음</span>
        <strong aria-hidden="true">{placeholderLabel}</strong>
      </span>
    );
  }

  const effectiveSrc = attempt === "PRIMARY" ? safePrimarySrc! : safeFallbackSrc!;
  const record = track1AssetRecordForUrl(effectiveSrc);
  return (
    <img
      {...imageProps}
      className={className}
      src={effectiveSrc}
      alt={alt}
      data-asset-attempt={attempt.toLowerCase()}
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
