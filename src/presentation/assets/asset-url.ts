const ASCII_CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_DECODE_PASSES = 4;

export interface AssetUrlContext {
  readonly origin: string;
  readonly basePath: string;
}

function decodedPathname(pathname: string): string | null {
  let decoded = pathname;
  try {
    for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }
  return decoded;
}

function normalizedContext(context: AssetUrlContext): { origin: string; assetPrefix: string; resolutionBase: string } | null {
  if (ASCII_CONTROL.test(context.origin) || ASCII_CONTROL.test(context.basePath) || context.basePath.includes("\\")) return null;
  try {
    const originUrl = new URL(context.origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return null;
    const baseUrl = new URL(context.basePath, `${originUrl.origin}/`);
    if (baseUrl.origin !== originUrl.origin || baseUrl.search || baseUrl.hash) return null;
    const decodedBase = decodedPathname(baseUrl.pathname);
    if (!decodedBase || ASCII_CONTROL.test(decodedBase) || decodedBase.includes("\\")) return null;
    const baseSegments = decodedBase.split("/");
    if (baseSegments.some((segment) => segment === "." || segment === "..")) return null;
    const basePath = decodedBase.endsWith("/") ? decodedBase : `${decodedBase}/`;
    return {
      origin: originUrl.origin,
      assetPrefix: `${basePath}assets/`,
      resolutionBase: `${originUrl.origin}${basePath}`,
    };
  } catch {
    return null;
  }
}

export function resolveCanonicalAssetPrefix(context: AssetUrlContext = currentAssetUrlContext()): string | null {
  return normalizedContext(context)?.assetPrefix ?? null;
}

export function currentAssetUrlContext(): AssetUrlContext {
  if (typeof window !== "undefined" && window.location.origin !== "null") {
    const pathname = window.location.pathname;
    const basePath = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
    return { origin: window.location.origin, basePath: basePath || "/" };
  }
  return { origin: "http://fictor.invalid", basePath: import.meta.env.BASE_URL || "/" };
}

/** Canonicalizes a candidate and permits only same-origin PNGs below this build's assets prefix. */
export function resolveSafeLocalAssetUrl(value: string, context: AssetUrlContext = currentAssetUrlContext()): string | null {
  if (!value || value.trim() !== value || ASCII_CONTROL.test(value) || value.includes("\\") || value.startsWith("//")) return null;
  const normalized = normalizedContext(context);
  if (!normalized) return null;

  try {
    const url = new URL(value, normalized.resolutionBase);
    if (url.origin !== normalized.origin || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
    const decodedPath = decodedPathname(url.pathname);
    if (!decodedPath || decodedPath.includes("%") || ASCII_CONTROL.test(decodedPath) || decodedPath.includes("\\")) return null;
    if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) return null;
    if (!url.pathname.startsWith(normalized.assetPrefix) || !decodedPath.startsWith(normalized.assetPrefix)) return null;
    if (!decodedPath.toLowerCase().endsWith(".png")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function isSafeLocalAssetUrl(value: string, context?: AssetUrlContext): boolean {
  return resolveSafeLocalAssetUrl(value, context) !== null;
}
