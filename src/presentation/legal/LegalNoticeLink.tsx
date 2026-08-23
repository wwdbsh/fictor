const LEGAL_NOTICE_FILENAME = "THIRD_PARTY_NOTICES.txt" as const;
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/** Resolve the separately shipped notice below the current Vite base path. */
export function legalNoticeHref(baseUrl: string): string {
  const base = baseUrl.trim() || "./";
  if (CONTROL_OR_BACKSLASH.test(base) || base.includes("//")) return `./${LEGAL_NOTICE_FILENAME}`;
  return `${base.endsWith("/") ? base : `${base}/`}${LEGAL_NOTICE_FILENAME}`;
}

/** Shared native anchor used by both the pre-run and in-game surfaces. */
export function LegalNoticeLink({ baseUrl }: { readonly baseUrl: string }) {
  return (
    <a className="legal-notice-link" data-legal-notice-link="true" href={legalNoticeHref(baseUrl)} aria-label="제3자 라이선스 고지">
      제3자 라이선스 고지
    </a>
  );
}

