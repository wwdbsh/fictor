import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { StillkinTrack1UiSession, Track1UiCodexEntry } from "../../application";
import { AssetImage } from "../assets";
import { CanonicalPreview } from "../forge/CanonicalPreview";

const CODEX_MODE_LABELS = { INSTANT: "즉석 빚기", WORKSHOP: "공방 빚기" } as const;

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={direction === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>;
}

function CodexDetail({ entry }: { entry: Track1UiCodexEntry | null }) {
  if (!entry?.preview) return <div className="codex-detail-empty"><p>발견한 기록을 선택하면 정식 레시피가 펼쳐집니다.</p></div>;
  return <aside className="codex-detail"><p>No. {String(entry.ordinal).padStart(4, "0")}</p><h3>{entry.preview.result.nameKo}</h3><CanonicalPreview canonical={entry.preview} compact /><div className="available-modes"><strong>빚을 수 있는 방식</strong>{entry.availableModes?.map((mode) => <span key={mode}>{CODEX_MODE_LABELS[mode]}</span>)}<small>어느 방식으로 빚어도 하나의 도감 기록으로 남습니다.</small></div></aside>;
}

export default function CodexSurface({ session, onClose }: { session: StillkinTrack1UiSession; onClose: () => void }) {
  const [codex] = useState(() => session.codexSnapshot());
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(surfaceRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? [])
      .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) { event.preventDefault(); headingRef.current?.focus(); return; }
    if (document.activeElement === headingRef.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const pageCount = Math.ceil(codex.total / codex.pageSize);
  const visible = codex.entries.slice(page * codex.pageSize, (page + 1) * codex.pageSize);
  const selected = codex.entries.find(({ entryKey }) => entryKey === selectedKey) ?? null;
  return (
    <section ref={surfaceRef} className="codex-surface" role="dialog" aria-modal="true" aria-labelledby="codex-heading" aria-describedby="codex-summary" onKeyDown={onKeyDown}>
      <div className="codex-heading"><div><h2 id="codex-heading" ref={headingRef} tabIndex={-1}>도감</h2><p id="codex-summary">발견한 기록 {codex.discoveredCount} / {codex.total}</p>{codex.discoveredCount === 0 ? <p className="codex-empty" role="note">아직 발견한 기록이 없습니다. 전투나 공방에서 처음 빚은 제법이 여기에 남습니다.</p> : null}</div><button type="button" className="surface-close" onClick={onClose}>도감 닫기</button></div>
      <div className="codex-book"><div className="codex-list"><h3>기록 {page * codex.pageSize + 1}–{Math.min((page + 1) * codex.pageSize, codex.total)}</h3><div className="codex-grid">{visible.map((entry) => entry.discovered && entry.preview ? <button key={entry.entryKey} type="button" className="codex-entry is-discovered" aria-pressed={selectedKey === entry.entryKey} onClick={() => setSelectedKey(entry.entryKey)}><span>No. {String(entry.ordinal).padStart(4, "0")}</span><AssetImage assetRole="DISCOVERY_RESULT" src={entry.preview.result.artSrc} fallbackSrc={entry.preview.materials[0].artSrc} placeholderLabel={entry.preview.result.nameKo} alt="" loading="lazy" decoding="async" /><strong>{entry.preview.result.nameKo}</strong></button> : <article key={entry.entryKey} className="codex-entry is-masked" aria-label={`No. ${String(entry.ordinal).padStart(4, "0")} 미발견`}><span>No. {String(entry.ordinal).padStart(4, "0")}</span><div aria-hidden="true">?</div><strong>미발견</strong></article>)}</div><nav className="codex-pagination" aria-label="도감 페이지"><button type="button" onClick={() => { setPage((value) => Math.max(0, value - 1)); setSelectedKey(null); }} disabled={page === 0} aria-label="이전 도감 페이지"><ChevronIcon direction="left" /></button><span>{page + 1} / {pageCount}</span><button type="button" onClick={() => { setPage((value) => Math.min(pageCount - 1, value + 1)); setSelectedKey(null); }} disabled={page === pageCount - 1} aria-label="다음 도감 페이지"><ChevronIcon direction="right" /></button></nav></div><CodexDetail entry={selected} /></div>
    </section>
  );
}
