import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";

import type {
  StillkinTrack1UiSession,
  Track1UiActionDescriptor,
  Track1UiCard,
  Track1UiForgeMaterial,
  Track1UiForgePresentation,
  Track1UiForgeReview,
  Track1UiProjection,
} from "../application";
import { PUBLIC_NAMES } from "../content/public-names";
import { AssetImage } from "./assets";
import { FirstDiscoveryOverlay, RepeatDiscoveryToast } from "./discovery";
import { CanonicalPreview } from "./forge/CanonicalPreview";
import { AiDisclosure } from "./legal/AiDisclosure";
import { LegalNoticeLink } from "./legal/LegalNoticeLink";

const AssetPolicySmokeProbe = lazy(() => import("./assets/AssetPolicySmokeProbe"));
const CodexSurface = lazy(() => import("./codex/CodexSurface"));

export interface AppProps {
  readonly session: StillkinTrack1UiSession;
  readonly initialProjection: Track1UiProjection;
  readonly onChangeRace?: () => void;
}

function Brand() {
  return <div className="brand" aria-label={`${PUBLIC_NAMES.title.en} · ${PUBLIC_NAMES.title.ko}`}>{PUBLIC_NAMES.title.en} <span>· {PUBLIC_NAMES.title.ko}</span></div>;
}

function BookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.2c2.9-.9 5.4-.4 8.5 1.5v13c-3.1-1.9-5.6-2.4-8.5-1.5zM20.5 5.2c-2.9-.9-5.4-.4-8.5 1.5v13c3.1-1.9 5.6-2.4 8.5-1.5z" /></svg>;
}

function ScreenHeader({ projection, baseUrl, onOpenCodex, onChangeRace, codexButtonRef }: { projection: Track1UiProjection; baseUrl: string; onOpenCodex: () => void; onChangeRace?: () => void; codexButtonRef: RefObject<HTMLButtonElement | null> }) {
  const saveLabel = projection.phase === "BLOCKED" ? "저장 차단" : projection.feedback?.tone === "ERROR" ? "변경 안 됨" : "저장됨";
  return (
    <header className="screen-header">
      <Brand />
      <p className="depth-label">{projection.headingKo}</p>
      <div className="header-actions">
        {onChangeRace ? <button type="button" className="race-change" onClick={onChangeRace} aria-label={`붙이 바꾸기 · 현재 ${projection.raceLabelKo}`}>{projection.raceLabelKo}</button> : null}
        <AiDisclosure />
        <LegalNoticeLink baseUrl={baseUrl} />
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

function FirstRunGuide({ projection }: { projection: Track1UiProjection }) {
  if (projection.codexDiscoveredCount !== 0) return null;
  const journey = projection.phase === "BETWEEN_NODES";
  if (!journey && projection.phase !== "IN_COMBAT") return null;
  const copy = journey
    ? "다음 기록으로 들어가 첫 전투를 시작합니다. 공방 빚기는 연료 1을 쓰며, 재료는 영구 소모되고 결과는 덱에 영구 편입됩니다."
    : `턴을 시작하고 손의 카드를 사용한 뒤 턴을 끝냅니다. 즉석 빚기는 재료 ${projection.raceId === "Joinkin" ? "세" : "두"} 장을 쓰며, 재료와 결과의 수명은 이번 전투뿐입니다. 전투가 끝나면 재료는 복구되고 결과는 사라집니다. 처음 발견한 제법은 도감에 영구 기록됩니다.`;
  return <aside className={`first-run-guide is-${journey ? "journey" : "combat"}`} aria-labelledby="first-run-guide-heading" aria-describedby="first-run-guide-description"><h2 id="first-run-guide-heading">첫 {journey ? "여정" : "전투"} 안내</h2><p id="first-run-guide-description">{copy}</p></aside>;
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

function ForgeReviewDialog({ review, session, busy, returnFocusRef, onCancel, onAction }: { review: Track1UiForgeReview; session: StillkinTrack1UiSession; busy: boolean; returnFocusRef: RefObject<HTMLButtonElement | null>; onCancel: () => void; onAction: (action: Track1UiActionDescriptor) => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [review]);
  const close = () => { onCancel(); queueMicrotask(() => returnFocusRef.current?.focus({ preventScroll: true })); };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const active = document.activeElement;
    if (event.shiftKey ? active === headingRef.current || active === cancelRef.current : active === headingRef.current || active === confirmRef.current) {
      event.preventDefault();
      (event.shiftKey ? confirmRef.current : cancelRef.current)?.focus();
    }
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const paidWorkshop = onClose !== undefined;
  useEffect(() => { if (paidWorkshop) headingRef.current?.focus({ preventScroll: true }); }, [paidWorkshop]);
  const preview = selected.length === requiredCount ? session.previewForge(mode, selected) : null;
  const toggle = (instanceId: string) => setSelected((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : current.length < requiredCount ? [...current, instanceId] : [...current.slice(1), instanceId]);
  const beginReview = () => { if (preview) setReview(session.reviewWorkshopForge(preview)); };
  return (
    <section className="forge-panel" aria-label={mode === "WORKSHOP_PAID" ? "공방 빚기" : "무료 공방 빚기"} onKeyDown={(event) => { if (onClose && !event.defaultPrevented && event.key === "Escape") { event.preventDefault(); onClose(); } }}>
      <div className="forge-panel-heading"><div><h2 ref={headingRef} tabIndex={onClose ? -1 : undefined}>공방 빚기</h2><p>{mode === "WORKSHOP_PAID" ? "연료 1 · 재료 영구 소모 · 결과 덱 편입" : "무료 공방 권리 · 재료 영구 소모 · 결과 덱 편입"}</p></div>{onClose ? <button type="button" className="surface-close" onClick={onClose} aria-label="공방 닫기">닫기</button> : null}</div>
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
  const forgeOpener = useRef<HTMLButtonElement>(null);
  const closeForge = () => { setForgeOpen(false); queueMicrotask(() => forgeOpener.current?.focus({ preventScroll: true })); };
  return (
    <section className="journey-screen page-screen art-screen">
      <AssetImage assetRole="STATIC_MANIFEST" className="screen-background" src={projection.backgroundSrc} placeholderLabel={`${PUBLIC_NAMES.elderGods.the_stilling.ko}의 터`} alt="" /><JourneyRail projection={projection} />
      {forgeOpen ? <ForgePanel mode="WORKSHOP_PAID" materials={projection.workshopMaterials} requiredCount={projection.raceId === "Joinkin" ? 3 : 2} session={session} busy={busy} onAction={onAction} onClose={closeForge} /> : null}
      <div className="journey-record" hidden={forgeOpen} inert={forgeOpen ? true : undefined}><p>고정된 여정의 다음 기록</p><h2>{projection.nextLabelKo}</h2><p>경로는 갈라지지 않습니다. {PUBLIC_NAMES.elderGods.the_stilling.ko}의 터를 더 깊이 기록합니다.</p><div className="journey-actions"><ActionButton action={projection.action} busy={busy} onAction={onAction} className="primary-cta" /><button ref={forgeOpener} type="button" className="action-button" onClick={() => setForgeOpen(true)} disabled={busy || !projection.paidWorkshopEnabled} aria-label={`공방 열기${projection.paidWorkshopDisabledReasonKo ? ` · ${projection.paidWorkshopDisabledReasonKo}` : ""}`}>공방 빚기 <small>연료 1 · 영구</small></button></div>{projection.paidWorkshopDisabledReasonKo ? <p className="forge-disabled-reason">{projection.paidWorkshopDisabledReasonKo}</p> : null}</div>
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
      <AssetImage assetRole="STATIC_MANIFEST" className="screen-background" src={projection.backgroundSrc} placeholderLabel={`${PUBLIC_NAMES.elderGods.the_stilling.ko}의 터`} alt="" />
      <div className="enemy-stage"><p className="intent-banner">다음 의도 · <strong>{projection.enemy.intentKo}{projection.enemy.intentAmount === null ? "" : ` ${projection.enemy.intentAmount}`}</strong></p><figure className="enemy-record"><AssetImage assetRole="STATIC_MANIFEST" src={projection.enemy.artSrc} placeholderLabel={projection.enemy.nameKo} alt={projection.enemy.nameKo} /><figcaption><strong>{projection.enemy.nameKo}</strong><span>체력 {projection.enemy.hp} / {projection.enemy.maxHp}</span><span>방어 {projection.enemy.block}</span></figcaption></figure></div>
      <div className="combat-instruction"><p>{selectionMode === "FORGE" ? `즉석 빚기 재료 ${requiredCount === 3 ? "세" : "두"} 장을 고르세요. ${requiredCount === 3 ? "앞의 두 칸이 기본 결과, 세 번째 칸이 공명 오버레이입니다." : "카드 사용과 선택은 분리됩니다."}` : selectionMode === "KINDLE" ? "소멸시켜 코스트만큼 에너지로 바꿀 카드 한 장을 고르세요." : projection.instructionKo}</p><div className="race-combat-actions"><button type="button" className="instant-mode-toggle" aria-pressed={selectionMode === "FORGE"} onClick={toggleForgeMode} disabled={busy || (selectionMode !== "FORGE" && !projection.instantForgeAvailable)} aria-label={`즉석 빚기 선택 모드${projection.instantForgeDisabledReasonKo && selectionMode !== "FORGE" ? ` · ${projection.instantForgeDisabledReasonKo}` : ""}`}>{selectionMode === "FORGE" ? "즉석 빚기 취소" : "즉석 빚기"}<small>행동 1회 · 전투 한정</small></button>{projection.raceId === "Burnkin" ? <>{projection.burnkinPassiveAction ? <ActionButton action={projection.burnkinPassiveAction} busy={busy} onAction={onAction} detailKo="체력 1 → 에너지 1" /> : null}<button type="button" className="instant-mode-toggle" aria-pressed={selectionMode === "KINDLE"} onClick={toggleKindleMode} disabled={busy || projection.hand.every((card) => !card.kindleAction || card.kindleAction.disabled)}>{selectionMode === "KINDLE" ? "지피기 취소" : "지피기"}<small>카드 소멸 · 코스트만큼 에너지</small></button></> : null}{projection.joinkinExtendAction ? <ActionButton action={projection.joinkinExtendAction} busy={busy} onAction={onAction} detailKo="턴당 1회 · 빚기 행동 +1" disabledReasonKo="이번 턴에는 사용할 수 없습니다" /> : null}</div></div>
      <div className="hand" aria-label="손패">{projection.hand.length > 0 ? projection.hand.map((card, index) => <CombatCard key={card.instanceId} card={card} handIndex={index} busy={busy} selectionMode={selectionMode} selected={selected.includes(card.instanceId)} onAction={onCardAction} onToggleForge={toggleCard} />) : <p className="empty-hand" role="note">손에 든 카드가 없습니다.</p>}</div>
      {selectionMode === "FORGE" ? <aside className="instant-preview">{preview ? <><CanonicalPreview canonical={preview.canonical} compact />{preview.thirdOverlay ? <p>세 번째 재료 · {preview.thirdOverlay.nameKo} · {preview.thirdOverlay.labelKo}</p> : null}<p>{preview.cost.labelKo} · {preview.lifetimeLabelKo}</p><button type="button" className="action-button primary-cta" onClick={executeInstant} disabled={busy || !instantAction}>즉석 빚기</button></> : <p role="status">{selected.length} / {requiredCount}장 선택</p>}</aside> : null}
      {projection.burnkinRulesKo ? <p className="burnkin-rules-note">{projection.burnkinRulesKo}</p> : null}
      {projection.joinkinRulesKo ? <p className="burnkin-rules-note">{projection.joinkinRulesKo}</p> : null}
      <aside className="combat-left-stats"><span>체력 {projection.stats.hp} / {projection.stats.maxHp}</span><span>방어 {projection.stats.block}</span><span>덱 {projection.drawCount}</span><span>버린 카드 {projection.discardCount}</span></aside>
      <aside className="combat-controls"><p>에너지 {projection.energy} / {projection.maxEnergy}</p>{projection.primaryAction ? <ActionButton action={projection.primaryAction} busy={busy} onAction={onAction} className="turn-action" /> : null}</aside>
    </section>
  );
}

function RewardScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "AWAITING_REWARD" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return <section className="reward-screen page-screen"><div className="reward-heading"><h2>전투에서 살아남았습니다.</h2><p>재료 하나를 골라 덱에 넣으세요.</p></div><div className="reward-grid">{projection.choices.map((choice) => <article className="reward-card" key={choice.choiceId}>{choice.artSrc ? <AssetImage assetRole="REWARD" src={choice.artSrc} placeholderLabel={choice.nameKo} alt="" /> : <div className="missing-art" aria-hidden="true" />}<h3>{choice.nameKo}</h3><p>{choice.kindLabelKo} · {PUBLIC_NAMES.elderGods.the_stilling.ko}</p><ActionButton action={choice.action} busy={busy} onAction={onAction} /></article>)}</div><StatsStrip projection={projection} /></section>;
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
        <ScreenHeader projection={projection} baseUrl={session.baseUrl} onOpenCodex={() => { if (!busy) { codexButton.current?.blur(); setCodexOpen(true); } }} onChangeRace={busy || underlayLocked ? undefined : onChangeRace} codexButtonRef={codexButton} />
        <h1 className="sr-only focus-heading" ref={heading} tabIndex={-1}>{projection.focusHeadingKo}</h1>
        <FirstRunGuide projection={projection} />
        {projection.phase === "BLOCKED" ? <BlockedScreen projection={projection} /> : null}
        {projection.phase === "BETWEEN_NODES" ? <JourneyScreen key={projection.screenKey} projection={projection} session={session} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "IN_COMBAT" ? <CombatScreen projection={projection} session={session} busy={busy} onAction={onAction} onCardAction={onCombatCardAction} /> : null}
        {projection.phase === "AWAITING_REWARD" ? <RewardScreen projection={projection} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "IN_EVENT" ? <EventScreen projection={projection} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "EVENT_RESOLVED" ? <EventResolvedScreen key={projection.screenKey} projection={projection} session={session} busy={busy} onAction={onAction} /> : null}
        {projection.phase === "RUN_WON" || projection.phase === "RUN_LOST" ? <TerminalScreen projection={projection} busy={busy} onAction={onAction} /> : null}
        <Feedback projection={projection} busy={busy} />
      </main>
      {codexOpen ? <Suspense fallback={<p className="codex-loading" role="status">도감을 여는 중입니다.</p>}><CodexSurface key={projection.screenKey} session={session} onClose={closeCodex} /></Suspense> : null}
      {forgePresentation?.discovery === "FIRST" ? <FirstDiscoveryOverlay key={forgePresentation.presentationId} presentation={forgePresentation} onDismiss={dismissForgePresentation} /> : null}
      {forgePresentation?.discovery === "REPEAT" ? <RepeatDiscoveryToast key={forgePresentation.presentationId} presentation={forgePresentation} onDismiss={dismissForgePresentation} /> : null}
      {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("t030-asset-policy-probe") === "1" ? <Suspense fallback={null}><AssetPolicySmokeProbe /></Suspense> : null}
    </>
  );
}
