import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";

import type {
  StillkinTrack1UiSession,
  Track1UiActionDescriptor,
  Track1UiCard,
  Track1UiCodexEntry,
  Track1UiForgeCanonicalPreview,
  Track1UiForgeMaterial,
  Track1UiForgePresentation,
  Track1UiForgeReview,
  Track1UiProjection,
} from "../application";
import { AssetImage } from "./assets";
import { FirstDiscoveryOverlay, RepeatDiscoveryToast } from "./discovery";

export interface AppProps {
  readonly session: StillkinTrack1UiSession;
  readonly initialProjection: Track1UiProjection;
  readonly onChangeRace?: () => void;
}

function Brand() {
  return <div className="brand" aria-label="FICTOR 픽토르">FICTOR <span>· 픽토르</span></div>;
}

function BookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.2c2.9-.9 5.4-.4 8.5 1.5v13c-3.1-1.9-5.6-2.4-8.5-1.5zM20.5 5.2c-2.9-.9-5.4-.4-8.5 1.5v13c3.1-1.9 5.6-2.4 8.5-1.5z" /></svg>;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={direction === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>;
}

const CODEX_MODE_LABELS = { INSTANT: "즉석 빚기", WORKSHOP: "공방 빚기" } as const;

function ScreenHeader({ projection, onOpenCodex, onChangeRace, codexButtonRef }: { projection: Track1UiProjection; onOpenCodex: () => void; onChangeRace?: () => void; codexButtonRef: RefObject<HTMLButtonElement | null> }) {
  const saveLabel = projection.phase === "BLOCKED" ? "저장 차단" : projection.feedback?.tone === "ERROR" ? "변경 안 됨" : "저장됨";
  return (
    <header className="screen-header">
      <Brand />
      <p className="depth-label">{projection.headingKo}</p>
      <div className="header-actions">
        {onChangeRace ? <button type="button" className="race-change" onClick={onChangeRace} aria-label={`붙이 바꾸기 · 현재 ${projection.raceLabelKo}`}>{projection.raceLabelKo}</button> : null}
        {projection.phase !== "BLOCKED" ? (
          <button ref={codexButtonRef} type="button" className="codex-open" onClick={onOpenCodex} aria-label={`도감 열기 · 발견 ${projection.codexDiscoveredCount} / 1326`}>
            <BookIcon /><span>도감 {projection.codexDiscoveredCount}</span>
          </button>
        ) : null}
        <p className="save-indicator" aria-label="로컬 저장 상태">◉ {saveLabel}</p>
      </div>
    </header>
  );
}

function Feedback({ projection, busy }: { projection: Track1UiProjection; busy: boolean }) {
  if (projection.phase === "BLOCKED") return null;
  if (busy) return <p className="feedback is-busy" role="status">기록을 적용하는 중입니다.</p>;
  if (!projection.feedback) return <p className="feedback" aria-hidden="true">상태 기록 영역</p>;
  return <p className={`feedback ${projection.feedback.tone === "ERROR" ? "is-error" : ""}`} role={projection.feedback.tone === "ERROR" ? "alert" : "status"}>{projection.feedback.messageKo}</p>;
}

function AssetPolicySmokeProbe() {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("t030-asset-policy-probe") !== "1") return null;
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

function ActionButton({ action, busy, onAction, className = "", detailKo, disabledReasonKo }: { action: Track1UiActionDescriptor; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void; className?: string; detailKo?: string; disabledReasonKo?: string }) {
  const accessibleLabel = [action.labelKo, detailKo, action.disabled ? disabledReasonKo : undefined].filter(Boolean).join(" · ");
  return (
    <button type="button" className={`action-button ${className}`} disabled={busy || action.disabled} onClick={() => onAction(action)} data-action-kind={action.kind} aria-label={accessibleLabel || undefined}>
      <span>{action.labelKo}</span>{detailKo ? <small>{detailKo}</small> : null}
    </button>
  );
}

function JourneyRail({ projection }: { projection: Track1UiProjection }) {
  return <ol className="journey-rail" aria-label="고정된 런 여정">{projection.journey.map((node) => <li key={node.nodeId} className={`journey-node is-${node.status.toLowerCase()}`}><span className="journey-mark" aria-hidden="true" /><span>깊이 {node.depth}</span><small>{node.labelKo}</small></li>)}</ol>;
}

function StatsStrip({ projection }: { projection: Track1UiProjection }) {
  return <dl className="stats-strip"><div><dt>체력</dt><dd>{projection.stats.hp} / {projection.stats.maxHp}</dd></div><div><dt>방어</dt><dd>{projection.stats.block}</dd></div><div><dt>연료</dt><dd>{projection.stats.fuel}</dd></div><div><dt>덱</dt><dd>{projection.stats.deckCount}장</dd></div></dl>;
}

function CanonicalPreview({ canonical, compact = false }: { canonical: Track1UiForgeCanonicalPreview; compact?: boolean }) {
  return (
    <section className={`canonical-preview ${compact ? "is-compact" : ""}`} aria-label={`레시피 ${canonical.result.nameKo}`}>
      <div className="preview-materials">
        {canonical.materials.map((material, index) => <figure key={material.materialId}><AssetImage assetRole="HAND" src={material.artSrc} placeholderLabel={material.nameKo} alt="" /><figcaption>{material.nameKo}</figcaption>{index === 0 ? <span aria-hidden="true">＋</span> : null}</figure>)}
      </div>
      <span className="preview-equals" aria-hidden="true">＝</span>
      <figure className="preview-result"><AssetImage assetRole="DISCOVERY_RESULT" src={canonical.result.artSrc} fallbackSrc={canonical.materials[0].artSrc} placeholderLabel={canonical.result.nameKo} alt="" /><figcaption><strong>{canonical.result.nameKo}</strong><span>{canonical.result.effectLabelKo}</span>{canonical.result.artFallbackLabelKo ? <small>{canonical.result.artFallbackLabelKo}</small> : null}</figcaption></figure>
      <p className="preview-recipe"><span>레시피</span> {canonical.materials[0].nameKo} + {canonical.materials[1].nameKo} = <strong>{canonical.result.nameKo}</strong></p>
    </section>
  );
}

function ForgeReviewDialog({ review, session, busy, returnFocusRef, onCancel, onAction }: { review: Track1UiForgeReview; session: StillkinTrack1UiSession; busy: boolean; returnFocusRef: RefObject<HTMLButtonElement | null>; onCancel: () => void; onAction: (action: Track1UiActionDescriptor) => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [review]);
  const close = () => { onCancel(); queueMicrotask(() => returnFocusRef.current?.focus({ preventScroll: true })); };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelRef.current) { event.preventDefault(); confirmRef.current?.focus(); }
    else if (!event.shiftKey && document.activeElement === confirmRef.current) { event.preventDefault(); cancelRef.current?.focus(); }
  };
  const confirm = () => {
    const action = session.confirmForgeReview(review);
    if (!action) { close(); return; }
    onCancel();
    onAction(action);
  };
  const preview = review.preview;
  return (
    <div className="dialog-backdrop">
      <div className="forge-dialog" role="dialog" aria-modal="true" aria-labelledby="forge-dialog-heading" onKeyDown={onKeyDown}>
        <h2 id="forge-dialog-heading" ref={headingRef} tabIndex={-1}>{review.headingKo}</h2>
        <p className="dialog-warning">{review.warningKo}</p>
        <dl><div><dt>영구 소모 재료 1</dt><dd>{preview.canonical.materials[0].nameKo}</dd></div><div><dt>영구 소모 재료 2</dt><dd>{preview.canonical.materials[1].nameKo}</dd></div>{preview.thirdOverlay ? <div><dt>영구 소모 세 번째 재료</dt><dd>{preview.thirdOverlay.nameKo} · {preview.thirdOverlay.labelKo}</dd></div> : null}<div><dt>결과</dt><dd>{preview.canonical.result.nameKo} · 덱 영구 편입</dd></div><div><dt>연료</dt><dd>{preview.cost.fuelBefore} → {preview.cost.fuelAfter}</dd></div></dl>
        <div className="dialog-actions"><button ref={cancelRef} type="button" className="action-button" onClick={close} disabled={busy}>취소</button><button ref={confirmRef} type="button" className="action-button primary-cta" onClick={confirm} disabled={busy}>영구 소모 확인</button></div>
      </div>
    </div>
  );
}

function ForgePanel({ mode, materials, requiredCount, session, busy, onAction, onClose }: { mode: "WORKSHOP_PAID" | "WORKSHOP_FREE"; materials: readonly Track1UiForgeMaterial[]; requiredCount: 2 | 3; session: StillkinTrack1UiSession; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void; onClose?: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<Track1UiForgeReview | null>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const preview = selected.length === requiredCount ? session.previewForge(mode, selected) : null;
  const toggle = (instanceId: string) => setSelected((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : current.length < requiredCount ? [...current, instanceId] : [...current.slice(1), instanceId]);
  const beginReview = () => { if (preview) setReview(session.reviewWorkshopForge(preview)); };
  return (
    <section className="forge-panel" aria-label={mode === "WORKSHOP_PAID" ? "공방 빚기" : "무료 공방 빚기"}>
      <div className="forge-panel-heading"><div><h2>공방 빚기</h2><p>{mode === "WORKSHOP_PAID" ? "연료 1 · 재료 영구 소모 · 결과 덱 편입" : "무료 공방 권리 · 재료 영구 소모 · 결과 덱 편입"}</p></div>{onClose ? <button type="button" className="surface-close" onClick={onClose} aria-label="공방 닫기">닫기</button> : null}</div>
      <div className="forge-panel-body">
        <div><p className="selection-count" role="status">선택한 재료 {selected.length} / {requiredCount}</p><ol className="forge-slots" aria-label="빚기 재료 슬롯">{Array.from({ length: requiredCount }, (_, index) => <li key={index}><strong>{index < 2 ? `기본 재료 ${index === 0 ? "A" : "B"}` : "세 번째 공명 재료"}</strong><span>{materials.find(({ instanceId }) => instanceId === selected[index])?.nameKo ?? "비어 있음"}</span></li>)}</ol><div className="workshop-materials" aria-label="공방 재료 선택">{materials.map((material) => <button key={material.instanceId} type="button" data-material-card-id={material.cardId} aria-pressed={selected.includes(material.instanceId)} onClick={() => toggle(material.instanceId)} disabled={busy}><AssetImage assetRole="HAND" src={material.artSrc} placeholderLabel={material.nameKo} alt="" /><span>{material.nameKo}</span></button>)}</div></div>
        <div className="forge-preview-column">{preview ? <><CanonicalPreview canonical={preview.canonical} compact />{preview.thirdOverlay ? <p className="forge-terms">세 번째 재료 · {preview.thirdOverlay.nameKo} · {preview.thirdOverlay.labelKo}</p> : null}<p className="forge-terms">{preview.cost.labelKo} · {preview.lifetimeLabelKo}</p>{preview.disabledReasonKo ? <p className="inline-error" role="alert">{preview.disabledReasonKo}</p> : null}<button ref={reviewButton} type="button" className="action-button primary-cta" onClick={beginReview} disabled={busy || !preview.executable}>최종 확인으로</button></> : <p className="forge-empty">서로 다른 재료 {requiredCount === 3 ? "세" : "두"} 장을 고르면 정식 결과를 미리 봅니다.</p>}</div>
      </div>
      {review ? <ForgeReviewDialog review={review} session={session} busy={busy} returnFocusRef={reviewButton} onCancel={() => setReview(null)} onAction={onAction} /> : null}
    </section>
  );
}

function BlockedScreen({ projection }: { projection: Extract<Track1UiProjection, { phase: "BLOCKED" }> }) {
  return <section className="blocked-screen page-screen"><div className="blocked-record" role="alert"><p className="record-symbol" aria-hidden="true">×</p><h2>저장 기록을 보존했습니다</h2><p>손상되었거나 지원하지 않는 기록은 자동으로 지우지 않습니다.</p><ul>{projection.issuesKo.map((issue) => <li key={issue}>{issue}</li>)}</ul><p>원본 기록을 확인한 뒤 브라우저 저장소를 직접 정리해 주세요.</p></div></section>;
}

function JourneyScreen({ projection, session, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "BETWEEN_NODES" }>; session: StillkinTrack1UiSession; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  const [forgeOpen, setForgeOpen] = useState(false);
  return (
    <section className="journey-screen page-screen art-screen">
      <AssetImage assetRole="STATIC_MANIFEST" className="screen-background" src={projection.backgroundSrc} placeholderLabel="어름의 터" alt="" /><JourneyRail projection={projection} />
      {forgeOpen ? <ForgePanel mode="WORKSHOP_PAID" materials={projection.workshopMaterials} requiredCount={projection.raceId === "Joinkin" ? 3 : 2} session={session} busy={busy} onAction={onAction} onClose={() => setForgeOpen(false)} /> : <div className="journey-record"><p>고정된 여정의 다음 기록</p><h2>{projection.nextLabelKo}</h2><p>경로는 갈라지지 않습니다. 어름의 터를 더 깊이 기록합니다.</p><div className="journey-actions"><ActionButton action={projection.action} busy={busy} onAction={onAction} className="primary-cta" /><button type="button" className="action-button" onClick={() => setForgeOpen(true)} disabled={busy || !projection.paidWorkshopEnabled} aria-label={`공방 열기${projection.paidWorkshopDisabledReasonKo ? ` · ${projection.paidWorkshopDisabledReasonKo}` : ""}`}>공방 빚기 <small>연료 1 · 영구</small></button></div>{projection.paidWorkshopDisabledReasonKo ? <p className="forge-disabled-reason">{projection.paidWorkshopDisabledReasonKo}</p> : null}</div>}
      <StatsStrip projection={projection} />
    </section>
  );
}

function CombatCard({ card, handIndex, busy, selectionMode, selected, onAction, onToggleForge }: { card: Track1UiCard; handIndex: number; busy: boolean; selectionMode: "FORGE" | "KINDLE" | null; selected: boolean; onAction: (action: Track1UiActionDescriptor, handIndex: number) => void; onToggleForge: (instanceId: string) => void }) {
  const content: ReactNode = <><span className="card-cost">{card.cost ?? "—"}</span><strong>{card.nameKo}</strong><AssetImage assetRole="HAND" src={card.artSrc} placeholderLabel={card.nameKo} alt="" />{card.artFallbackLabelKo ? <span className="card-art-note">{card.artFallbackLabelKo}</span> : null}<span className="card-rule">{card.effectLabelKo}</span><span className="card-power">{card.power ?? "—"}</span></>;
  if (selectionMode === "FORGE") return <button type="button" className="combat-card" disabled={busy || !card.forgeSelectable} onClick={() => onToggleForge(card.instanceId)} aria-pressed={selected} aria-label={`${card.nameKo} 즉석 빚기 재료 ${selected ? "선택 해제" : "선택"}`} data-card-instance-id={card.instanceId} data-card-id={card.cardId} data-hand-index={handIndex}>{content}</button>;
  if (selectionMode === "KINDLE") return <button type="button" className="combat-card" disabled={busy || !card.kindleAction || card.kindleAction.disabled} onClick={() => card.kindleAction && onAction(card.kindleAction, handIndex)} aria-label={`${card.nameKo} 지피기`} data-card-instance-id={card.instanceId} data-card-id={card.cardId} data-hand-index={handIndex}>{content}</button>;
  return card.action ? <button type="button" className="combat-card" disabled={busy || card.action.disabled} onClick={() => onAction(card.action!, handIndex)} aria-label={card.action.labelKo} data-card-instance-id={card.instanceId} data-card-id={card.cardId} data-hand-index={handIndex}>{content}</button> : <article className="combat-card">{content}</article>;
}

function CombatScreen({ projection, session, busy, onAction, onCardAction }: { projection: Extract<Track1UiProjection, { phase: "IN_COMBAT" }>; session: StillkinTrack1UiSession; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void; onCardAction: (action: Track1UiActionDescriptor, handIndex: number) => void }) {
  const [selectionMode, setSelectionMode] = useState<"FORGE" | "KINDLE" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { setSelected((current) => current.filter((id) => projection.hand.some((card) => card.instanceId === id && card.forgeSelectable))); }, [projection.screenKey, projection.hand]);
  const toggleForgeMode = () => { setSelectionMode((current) => current === "FORGE" ? null : "FORGE"); setSelected([]); };
  const toggleKindleMode = () => { setSelectionMode((current) => current === "KINDLE" ? null : "KINDLE"); setSelected([]); };
  const requiredCount = projection.raceId === "Joinkin" ? 3 : 2;
  const toggleCard = (instanceId: string) => setSelected((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : current.length < requiredCount ? [...current, instanceId] : [...current.slice(1), instanceId]);
  const preview = selected.length === requiredCount ? session.previewForge("INSTANT", selected) : null;
  const instantAction = preview ? session.describeInstantForgeAction(preview) : null;
  const executeInstant = () => { if (instantAction) { setSelectionMode(null); setSelected([]); onAction(instantAction); } };
  return (
    <section className="combat-screen page-screen art-screen">
      <AssetImage assetRole="STATIC_MANIFEST" className="screen-background" src={projection.backgroundSrc} placeholderLabel="어름의 터" alt="" />
      <div className="enemy-stage"><p className="intent-banner">다음 의도 · <strong>{projection.enemy.intentKo}{projection.enemy.intentAmount === null ? "" : ` ${projection.enemy.intentAmount}`}</strong></p><figure className="enemy-record"><AssetImage assetRole="STATIC_MANIFEST" src={projection.enemy.artSrc} placeholderLabel={projection.enemy.nameKo} alt={projection.enemy.nameKo} /><figcaption><strong>{projection.enemy.nameKo}</strong><span>체력 {projection.enemy.hp} / {projection.enemy.maxHp}</span><span>방어 {projection.enemy.block}</span></figcaption></figure></div>
      <div className="combat-instruction"><p>{selectionMode === "FORGE" ? `즉석 빚기 재료 ${requiredCount === 3 ? "세" : "두"} 장을 고르세요. ${requiredCount === 3 ? "앞의 두 칸이 기본 결과, 세 번째 칸이 공명 오버레이입니다." : "카드 사용과 선택은 분리됩니다."}` : selectionMode === "KINDLE" ? "소멸시켜 코스트만큼 에너지로 바꿀 카드 한 장을 고르세요." : projection.instructionKo}</p><div className="race-combat-actions"><button type="button" className="instant-mode-toggle" aria-pressed={selectionMode === "FORGE"} onClick={toggleForgeMode} disabled={busy || (selectionMode !== "FORGE" && !projection.instantForgeAvailable)} aria-label={`즉석 빚기 선택 모드${projection.instantForgeDisabledReasonKo && selectionMode !== "FORGE" ? ` · ${projection.instantForgeDisabledReasonKo}` : ""}`}>{selectionMode === "FORGE" ? "즉석 빚기 취소" : "즉석 빚기"}<small>행동 1회 · 전투 한정</small></button>{projection.raceId === "Burnkin" ? <>{projection.burnkinPassiveAction ? <ActionButton action={projection.burnkinPassiveAction} busy={busy} onAction={onAction} detailKo="체력 1 → 에너지 1" /> : null}<button type="button" className="instant-mode-toggle" aria-pressed={selectionMode === "KINDLE"} onClick={toggleKindleMode} disabled={busy || projection.hand.every((card) => !card.kindleAction || card.kindleAction.disabled)}>{selectionMode === "KINDLE" ? "지피기 취소" : "지피기"}<small>카드 소멸 · 코스트만큼 에너지</small></button></> : null}{projection.joinkinExtendAction ? <ActionButton action={projection.joinkinExtendAction} busy={busy} onAction={onAction} detailKo="턴당 1회 · 빚기 행동 +1" disabledReasonKo="이번 턴에는 사용할 수 없습니다" /> : null}</div></div>
      <div className="hand" aria-label="손패">{projection.hand.length > 0 ? projection.hand.map((card, index) => <CombatCard key={card.instanceId} card={card} handIndex={index} busy={busy} selectionMode={selectionMode} selected={selected.includes(card.instanceId)} onAction={onCardAction} onToggleForge={toggleCard} />) : <p className="empty-hand">손에 든 카드가 없습니다.</p>}</div>
      {selectionMode === "FORGE" ? <aside className="instant-preview">{preview ? <><CanonicalPreview canonical={preview.canonical} compact />{preview.thirdOverlay ? <p>세 번째 재료 · {preview.thirdOverlay.nameKo} · {preview.thirdOverlay.labelKo}</p> : null}<p>{preview.cost.labelKo} · {preview.lifetimeLabelKo}</p><button type="button" className="action-button primary-cta" onClick={executeInstant} disabled={busy || !instantAction}>즉석 빚기</button></> : <p role="status">{selected.length} / {requiredCount}장 선택</p>}</aside> : null}
      {projection.burnkinRulesKo ? <p className="burnkin-rules-note">{projection.burnkinRulesKo}</p> : null}
      {projection.joinkinRulesKo ? <p className="burnkin-rules-note">{projection.joinkinRulesKo}</p> : null}
      <aside className="combat-left-stats"><span>체력 {projection.stats.hp} / {projection.stats.maxHp}</span><span>방어 {projection.stats.block}</span><span>덱 {projection.drawCount}</span><span>버린 카드 {projection.discardCount}</span></aside>
      <aside className="combat-controls"><p>에너지 {projection.energy} / {projection.maxEnergy}</p>{projection.primaryAction ? <ActionButton action={projection.primaryAction} busy={busy} onAction={onAction} className="turn-action" /> : null}</aside>
    </section>
  );
}

function RewardScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "AWAITING_REWARD" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return <section className="reward-screen page-screen"><div className="reward-heading"><h2>전투에서 살아남았습니다.</h2><p>재료 하나를 골라 덱에 넣으세요.</p></div><div className="reward-grid">{projection.choices.map((choice) => <article className="reward-card" key={choice.choiceId}>{choice.artSrc ? <AssetImage assetRole="REWARD" src={choice.artSrc} placeholderLabel={choice.nameKo} alt="" /> : <div className="missing-art" aria-hidden="true" />}<h3>{choice.nameKo}</h3><p>{choice.kindLabelKo} · 어름</p><ActionButton action={choice.action} busy={busy} onAction={onAction} /></article>)}</div><StatsStrip projection={projection} /></section>;
}

function EventScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "IN_EVENT" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return <section className="event-screen page-screen"><JourneyRail projection={projection} /><div className="open-record"><figure><AssetImage assetRole="STATIC_MANIFEST" src={projection.artSrc} placeholderLabel={projection.titleKo} alt="" /></figure><div className="event-copy"><div className="event-title-row"><h2>{projection.titleKo}</h2><span>연료 {projection.stats.fuel}</span></div><p>{projection.descriptionKo}</p><div className="event-choices">{projection.choices.map((choice) => <ActionButton key={choice.choiceId} action={choice.action} busy={busy} onAction={onAction} className="event-choice" detailKo={projection.eventType === "FICTOR" ? (choice.price === 0 ? "연료 없음" : `연료 ${choice.price}`) : undefined} disabledReasonKo={projection.eventType === "FICTOR" ? "연료 부족" : undefined} />)}</div></div></div><StatsStrip projection={projection} /></section>;
}

function EventResolvedScreen({ projection, session, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "EVENT_RESOLVED" }>; session: StillkinTrack1UiSession; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return <section className="event-screen resolved-screen page-screen"><JourneyRail projection={projection} />{projection.workshopMaterials.length > 0 ? <ForgePanel mode="WORKSHOP_FREE" materials={projection.workshopMaterials} requiredCount={projection.raceId === "Joinkin" ? 3 : 2} session={session} busy={busy} onAction={onAction} /> : <div className="open-record"><figure><AssetImage assetRole="STATIC_MANIFEST" src={projection.artSrc} placeholderLabel={projection.titleKo} alt="" /></figure><div className="event-copy"><h2>{projection.titleKo}</h2><p>이 사건의 결과를 기록했습니다.</p>{projection.leaveAction ? <ActionButton action={projection.leaveAction} busy={busy} onAction={onAction} className="primary-cta" /> : null}</div></div>}<StatsStrip projection={projection} /></section>;
}

function TerminalScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "RUN_WON" | "RUN_LOST" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return <section className={`terminal-screen page-screen ${projection.phase === "RUN_WON" ? "is-won" : "is-lost"}`}><AssetImage assetRole="STATIC_MANIFEST" src={projection.artSrc} placeholderLabel={projection.headingKo} alt="" /><div><h2>{projection.headingKo}</h2><p>{projection.messageKo}</p><ActionButton action={projection.action} busy={busy} onAction={onAction} className="primary-cta" /></div></section>;
}

function CodexDetail({ entry }: { entry: Track1UiCodexEntry | null }) {
  if (!entry?.preview) return <div className="codex-detail-empty"><p>발견한 기록을 선택하면 정식 레시피가 펼쳐집니다.</p></div>;
  return <aside className="codex-detail"><p>No. {String(entry.ordinal).padStart(4, "0")}</p><h3>{entry.preview.result.nameKo}</h3><CanonicalPreview canonical={entry.preview} compact /><div className="available-modes"><strong>빚을 수 있는 방식</strong>{entry.availableModes?.map((mode) => <span key={mode}>{CODEX_MODE_LABELS[mode]}</span>)}<small>어느 방식으로 빚어도 하나의 도감 기록으로 남습니다.</small></div></aside>;
}

function CodexSurface({ session, onClose }: { session: StillkinTrack1UiSession; onClose: () => void }) {
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
    <section ref={surfaceRef} className="codex-surface" role="dialog" aria-modal="true" aria-labelledby="codex-heading" onKeyDown={onKeyDown}>
      <div className="codex-heading"><div><h2 id="codex-heading" ref={headingRef} tabIndex={-1}>도감</h2><p>발견한 기록 {codex.discoveredCount} / {codex.total}</p></div><button type="button" className="surface-close" onClick={onClose}>도감 닫기</button></div>
      <div className="codex-book"><div className="codex-list"><h3>기록 {page * codex.pageSize + 1}–{Math.min((page + 1) * codex.pageSize, codex.total)}</h3><div className="codex-grid">{visible.map((entry) => entry.discovered && entry.preview ? <button key={entry.entryKey} type="button" className="codex-entry is-discovered" aria-pressed={selectedKey === entry.entryKey} onClick={() => setSelectedKey(entry.entryKey)}><span>No. {String(entry.ordinal).padStart(4, "0")}</span><AssetImage assetRole="DISCOVERY_RESULT" src={entry.preview.result.artSrc} fallbackSrc={entry.preview.materials[0].artSrc} placeholderLabel={entry.preview.result.nameKo} alt="" /><strong>{entry.preview.result.nameKo}</strong></button> : <article key={entry.entryKey} className="codex-entry is-masked" aria-label={`No. ${String(entry.ordinal).padStart(4, "0")} 미발견`}><span>No. {String(entry.ordinal).padStart(4, "0")}</span><div aria-hidden="true">?</div><strong>미발견</strong></article>)}</div><nav className="codex-pagination" aria-label="도감 페이지"><button type="button" onClick={() => { setPage((value) => Math.max(0, value - 1)); setSelectedKey(null); }} disabled={page === 0} aria-label="이전 도감 페이지"><ChevronIcon direction="left" /></button><span>{page + 1} / {pageCount}</span><button type="button" onClick={() => { setPage((value) => Math.min(pageCount - 1, value + 1)); setSelectedKey(null); }} disabled={page === pageCount - 1} aria-label="다음 도감 페이지"><ChevronIcon direction="right" /></button></nav></div><CodexDetail entry={selected} /></div>
    </section>
  );
}

export function App({ session, initialProjection, onChangeRace }: AppProps) {
  const [projection, setProjection] = useState(initialProjection);
  const [pendingAction, setPendingAction] = useState<Track1UiActionDescriptor | null>(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [forgePresentation, setForgePresentation] = useState<Track1UiForgePresentation | null>(null);
  const processedAction = useRef<Track1UiActionDescriptor | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const shell = useRef<HTMLElement>(null);
  const codexButton = useRef<HTMLButtonElement>(null);
  const combatFocusRequest = useRef<{ focusKey: string; handIndex: number } | null>(null);
  const presentationReturnFocus = useRef<HTMLElement | null>(null);
  const restorePresentationFocus = useRef(false);

  useEffect(() => {
    if (!pendingAction || processedAction.current === pendingAction) return;
    processedAction.current = pendingAction;
    const result = session.dispatch(pendingAction);
    setProjection(result.projection);
    if (result.forgePresentation) setForgePresentation(result.forgePresentation);
    setPendingAction(null);
  }, [pendingAction, session]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [projection.focusKey]);
  useEffect(() => {
    const request = combatFocusRequest.current;
    if (!request) return;
    combatFocusRequest.current = null;
    if (projection.phase !== "IN_COMBAT" || projection.focusKey !== request.focusKey) return;
    const nextCard = shell.current?.querySelector<HTMLButtonElement>(`button.combat-card[data-hand-index="${request.handIndex}"]:not(:disabled)`);
    const endTurn = shell.current?.querySelector<HTMLButtonElement>('button[data-action-kind="END_TURN"]:not(:disabled)');
    (nextCard ?? endTurn)?.focus({ preventScroll: true });
  }, [projection]);
  useEffect(() => {
    if (forgePresentation || !restorePresentationFocus.current) return;
    restorePresentationFocus.current = false;
    const target = presentationReturnFocus.current;
    presentationReturnFocus.current = null;
    (target?.isConnected ? target : heading.current)?.focus({ preventScroll: true });
  }, [forgePresentation]);
  const closeCodex = () => { setCodexOpen(false); queueMicrotask(() => codexButton.current?.focus({ preventScroll: true })); };
  const rememberPresentationFocus = () => { presentationReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  const onAction = (action: Track1UiActionDescriptor) => { if (!pendingAction && !codexOpen && forgePresentation?.discovery !== "FIRST") { rememberPresentationFocus(); setPendingAction(action); } };
  const onCombatCardAction = (action: Track1UiActionDescriptor, handIndex: number) => { if (pendingAction || codexOpen || forgePresentation?.discovery === "FIRST") return; rememberPresentationFocus(); combatFocusRequest.current = { focusKey: projection.focusKey, handIndex }; setPendingAction(action); };
  const dismissForgePresentation = () => { restorePresentationFocus.current = true; setForgePresentation(null); };
  const busy = pendingAction !== null;
  const firstDiscoveryOpen = forgePresentation?.discovery === "FIRST";
  const underlayLocked = codexOpen || firstDiscoveryOpen;

  return (
    <>
      <main ref={shell} className={`game-shell phase-${projection.phase.toLowerCase()}`} aria-busy={busy} aria-hidden={underlayLocked ? true : undefined} inert={underlayLocked ? true : undefined} data-screen-key={projection.screenKey}>
        <ScreenHeader projection={projection} onOpenCodex={() => { if (!busy) { codexButton.current?.blur(); setCodexOpen(true); } }} onChangeRace={busy || underlayLocked ? undefined : onChangeRace} codexButtonRef={codexButton} />
        <h1 className="sr-only focus-heading" ref={heading} tabIndex={-1}>{projection.focusHeadingKo}</h1>
        {projection.phase === "BLOCKED" ? <BlockedScreen projection={projection} /> : null}
        {projection.phase === "BETWEEN_NODES" ? <JourneyScreen key={projection.screenKey} projection={projection} session={session} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "IN_COMBAT" ? <CombatScreen projection={projection} session={session} busy={busy} onAction={onAction} onCardAction={onCombatCardAction} /> : null}
        {projection.phase === "AWAITING_REWARD" ? <RewardScreen projection={projection} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "IN_EVENT" ? <EventScreen projection={projection} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "EVENT_RESOLVED" ? <EventResolvedScreen key={projection.screenKey} projection={projection} session={session} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "RUN_WON" || projection.phase === "RUN_LOST" ? <TerminalScreen projection={projection} busy={busy} onAction={onAction} /> : null}
        <Feedback projection={projection} busy={busy} />
      </main>
      {codexOpen ? <CodexSurface key={projection.screenKey} session={session} onClose={closeCodex} /> : null}
      {forgePresentation?.discovery === "FIRST" ? <FirstDiscoveryOverlay key={forgePresentation.presentationId} presentation={forgePresentation} onDismiss={dismissForgePresentation} /> : null}
      {forgePresentation?.discovery === "REPEAT" ? <RepeatDiscoveryToast key={forgePresentation.presentationId} presentation={forgePresentation} onDismiss={dismissForgePresentation} /> : null}
      <AssetPolicySmokeProbe />
    </>
  );
}
