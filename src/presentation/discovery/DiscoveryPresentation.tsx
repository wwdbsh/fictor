import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { Track1UiForgePresentation } from "../../application";
import { AssetImage } from "../assets";
import { useDiscoveryPhase, type DiscoveryClock } from "./use-discovery-phase";

const MODE_LABELS = {
  INSTANT: "즉석 빚기 · 전투 한정",
  WORKSHOP: "공방 빚기 · 덱 영구 편입",
} as const;

const PHASE_LABELS = {
  BURNING: "재료가 타고 있습니다",
  REVEALING: "새 도판이 드러납니다",
  PRINTING: "이름을 기록하고 있습니다",
  FINAL: "새 제법 발견",
} as const;

function ResultArt({ presentation }: { presentation: Track1UiForgePresentation }) {
  const { canonical } = presentation;
  return (
    <AssetImage
      assetRole="DISCOVERY_RESULT"
      src={canonical.result.artSrc}
      fallbackSrc={canonical.materials[0].artSrc}
      placeholderLabel={canonical.result.nameKo}
      alt={canonical.result.nameKo}
    />
  );
}

export function FirstDiscoveryOverlay({ presentation, onDismiss, clock }: { presentation: Track1UiForgePresentation; onDismiss: () => void; clock?: DiscoveryClock }) {
  const [phase, skip] = useDiscoveryPhase(presentation.presentationId, clock);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [presentation.presentationId]);
  useEffect(() => { if (phase === "FINAL") continueRef.current?.focus({ preventScroll: true }); }, [phase]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      skip();
      return;
    }
    if (event.key !== "Tab") return;
    const first = phase === "FINAL" ? continueRef.current : skipRef.current;
    const last = first;
    if (!first || !last || document.activeElement === headingRef.current || document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const { canonical } = presentation;
  const final = phase === "FINAL";
  return (
    <section
      className={`discovery-overlay phase-${phase.toLowerCase()}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="discovery-heading"
      data-presentation-id={presentation.presentationId}
      data-discovery-phase={phase}
      onKeyDown={onKeyDown}
    >
      <div className="discovery-record">
        <p className="discovery-phase-label" aria-live="polite">{PHASE_LABELS[phase]}</p>
        <h2 id="discovery-heading" ref={headingRef} tabIndex={-1}>{final ? "새 제법 발견" : "빚기 기록"}</h2>
        <div className="discovery-stage" aria-hidden={!final || undefined}>
          <div className="discovery-materials" aria-label="사용한 재료">
            {canonical.materials.map((material) => (
              <figure key={material.materialId}>
                <AssetImage assetRole="HAND" src={material.artSrc} placeholderLabel={material.nameKo} alt="" />
                <figcaption>{material.nameKo}</figcaption>
              </figure>
            ))}
            {presentation.thirdOverlay ? (
              <figure>
                <AssetImage assetRole="HAND" src={presentation.thirdOverlay.artSrc} placeholderLabel={presentation.thirdOverlay.nameKo} alt="" />
                <figcaption>{presentation.thirdOverlay.nameKo}</figcaption>
              </figure>
            ) : null}
          </div>
          <span className="discovery-forge-mark" aria-hidden="true">＋</span>
          <figure className="discovery-result">
            <div className="discovery-card-back" aria-hidden="true"><span>FICTOR</span></div>
            <ResultArt presentation={presentation} />
            <figcaption>
              <strong>{canonical.result.nameKo}</strong>
              <span>{canonical.result.effectLabelKo}</span>
              {canonical.result.artFallbackLabelKo ? <small>{canonical.result.artFallbackLabelKo}</small> : null}
            </figcaption>
          </figure>
        </div>
        {final ? (
          <div className="discovery-final-copy">
            <p>{canonical.materials[0].nameKo}과 {canonical.materials[1].nameKo}의 제법이 도감에 남았습니다.</p>
            {presentation.thirdOverlay ? <p>세 번째 공명 · {presentation.thirdOverlay.nameKo}</p> : null}
            <p>{MODE_LABELS[presentation.mode]}</p>
            <button ref={continueRef} type="button" className="action-button primary-cta" onClick={onDismiss}>계속</button>
          </div>
        ) : (
          <button ref={skipRef} type="button" className="discovery-skip" onClick={skip}>연출 건너뛰기</button>
        )}
      </div>
    </section>
  );
}

export function RepeatDiscoveryToast({ presentation, onDismiss }: { presentation: Track1UiForgePresentation; onDismiss: () => void }) {
  const { canonical } = presentation;
  return (
    <aside className="discovery-toast" role="status" data-presentation-id={presentation.presentationId}>
      <ResultArt presentation={presentation} />
      <div><strong>알고 있는 제법</strong><span>{canonical.result.nameKo}</span>{presentation.thirdOverlay ? <small>세 번째 공명 · {presentation.thirdOverlay.nameKo}</small> : null}<small>{MODE_LABELS[presentation.mode]}</small></div>
      <button type="button" onClick={onDismiss} aria-label={`${canonical.result.nameKo} 알림 닫기`}>닫기</button>
    </aside>
  );
}
