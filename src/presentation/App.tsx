import { useEffect, useRef, useState, type ReactNode } from "react";

import type {
  StillkinTrack1UiSession,
  Track1UiActionDescriptor,
  Track1UiCard,
  Track1UiProjection,
} from "../application";

export interface AppProps {
  readonly session: StillkinTrack1UiSession;
  readonly initialProjection: Track1UiProjection;
}

function Brand() {
  return <div className="brand" aria-label="FICTOR 픽토르">FICTOR <span>· 픽토르</span></div>;
}

function ScreenHeader({ projection }: { projection: Track1UiProjection }) {
  const saveLabel = projection.phase === "BLOCKED" ? "저장 차단" : projection.feedback?.tone === "ERROR" ? "변경 안 됨" : "저장됨";
  return (
    <header className="screen-header">
      <Brand />
      <p className="depth-label">{projection.headingKo}</p>
      <p className="save-indicator" aria-label="로컬 저장 상태">◉ {saveLabel}</p>
    </header>
  );
}

function Feedback({ projection, busy }: { projection: Track1UiProjection; busy: boolean }) {
  if (projection.phase === "BLOCKED") return null;
  if (busy) return <p className="feedback is-busy" role="status">기록을 적용하는 중입니다.</p>;
  if (!projection.feedback) return <p className="feedback" aria-hidden="true">상태 기록 영역</p>;
  return (
    <p className={`feedback ${projection.feedback.tone === "ERROR" ? "is-error" : ""}`} role={projection.feedback.tone === "ERROR" ? "alert" : "status"}>
      {projection.feedback.messageKo}
    </p>
  );
}

function ActionButton({ action, busy, onAction, className = "", detailKo, disabledReasonKo }: { action: Track1UiActionDescriptor; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void; className?: string; detailKo?: string; disabledReasonKo?: string }) {
  const accessibleLabel = [action.labelKo, detailKo, action.disabled ? disabledReasonKo : undefined].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className={`action-button ${className}`}
      disabled={busy || action.disabled}
      onClick={() => onAction(action)}
      data-action-kind={action.kind}
      aria-label={accessibleLabel || undefined}
    >
      <span>{action.labelKo}</span>
      {detailKo && <small>{detailKo}</small>}
    </button>
  );
}

function JourneyRail({ projection }: { projection: Track1UiProjection }) {
  return (
    <ol className="journey-rail" aria-label="고정된 런 여정">
      {projection.journey.map((node) => (
        <li key={node.nodeId} className={`journey-node is-${node.status.toLowerCase()}`}>
          <span className="journey-mark" aria-hidden="true" />
          <span>깊이 {node.depth}</span>
          <small>{node.labelKo}</small>
        </li>
      ))}
    </ol>
  );
}

function StatsStrip({ projection }: { projection: Track1UiProjection }) {
  return (
    <dl className="stats-strip">
      <div><dt>체력</dt><dd>{projection.stats.hp} / {projection.stats.maxHp}</dd></div>
      <div><dt>방어</dt><dd>{projection.stats.block}</dd></div>
      <div><dt>연료</dt><dd>{projection.stats.fuel}</dd></div>
      <div><dt>덱</dt><dd>{projection.stats.deckCount}장</dd></div>
    </dl>
  );
}

function BlockedScreen({ projection }: { projection: Extract<Track1UiProjection, { phase: "BLOCKED" }> }) {
  return (
    <section className="blocked-screen page-screen">
      <div className="blocked-record" role="alert">
        <p className="record-symbol" aria-hidden="true">×</p>
        <h2>저장 기록을 보존했습니다</h2>
        <p>손상되었거나 지원하지 않는 기록은 자동으로 지우지 않습니다.</p>
        <ul>{projection.issuesKo.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        <p>원본 기록을 확인한 뒤 브라우저 저장소를 직접 정리해 주세요.</p>
      </div>
    </section>
  );
}

function JourneyScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "BETWEEN_NODES" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return (
    <section className="journey-screen page-screen art-screen">
      <img className="screen-background" src={projection.backgroundSrc} alt="" />
      <JourneyRail projection={projection} />
      <div className="journey-record">
        <p>고정된 여정의 다음 기록</p>
        <h2>{projection.nextLabelKo}</h2>
        <p>경로는 갈라지지 않습니다. 어름의 터를 더 깊이 기록합니다.</p>
        <ActionButton action={projection.action} busy={busy} onAction={onAction} className="primary-cta" />
      </div>
      <StatsStrip projection={projection} />
    </section>
  );
}

function CombatCard({ card, handIndex, busy, onAction }: { card: Track1UiCard; handIndex: number; busy: boolean; onAction: (action: Track1UiActionDescriptor, handIndex: number) => void }) {
  const content: ReactNode = (
    <>
      <span className="card-cost">{card.cost ?? "—"}</span>
      <strong>{card.nameKo}</strong>
      <img src={card.artSrc} alt="" />
      {card.artFallbackLabelKo && <span className="card-art-note">{card.artFallbackLabelKo}</span>}
      <span className="card-rule">{card.effectLabelKo}</span>
      <span className="card-power">{card.power ?? "—"}</span>
    </>
  );
  return card.action ? (
    <button
      type="button"
      className="combat-card"
      disabled={busy || card.action.disabled}
      onClick={() => onAction(card.action!, handIndex)}
      aria-label={card.action.labelKo}
      data-card-instance-id={card.instanceId}
      data-card-id={card.cardId}
      data-hand-index={handIndex}
    >
      {content}
    </button>
  ) : <article className="combat-card">{content}</article>;
}

function CombatScreen({ projection, busy, onAction, onCardAction }: { projection: Extract<Track1UiProjection, { phase: "IN_COMBAT" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void; onCardAction: (action: Track1UiActionDescriptor, handIndex: number) => void }) {
  return (
    <section className="combat-screen page-screen art-screen">
      <img className="screen-background" src={projection.backgroundSrc} alt="" />
      <div className="enemy-stage">
        <p className="intent-banner">다음 의도 · <strong>{projection.enemy.intentKo}{projection.enemy.intentAmount === null ? "" : ` ${projection.enemy.intentAmount}`}</strong></p>
        <figure className="enemy-record">
          <img src={projection.enemy.artSrc} alt={projection.enemy.nameKo} />
          <figcaption>
            <strong>{projection.enemy.nameKo}</strong>
            <span>체력 {projection.enemy.hp} / {projection.enemy.maxHp}</span>
            <span>방어 {projection.enemy.block}</span>
          </figcaption>
        </figure>
      </div>
      <p className="combat-instruction">{projection.instructionKo}</p>
      <div className="hand" aria-label="손패">
        {projection.hand.length > 0 ? projection.hand.map((card, index) => <CombatCard key={card.instanceId} card={card} handIndex={index} busy={busy} onAction={onCardAction} />) : <p className="empty-hand">손에 든 카드가 없습니다.</p>}
      </div>
      <aside className="combat-left-stats">
        <span>체력 {projection.stats.hp} / {projection.stats.maxHp}</span>
        <span>방어 {projection.stats.block}</span>
        <span>덱 {projection.drawCount}</span>
        <span>버린 카드 {projection.discardCount}</span>
      </aside>
      <aside className="combat-controls">
        <p>에너지 {projection.energy} / {projection.maxEnergy}</p>
        {projection.primaryAction && <ActionButton action={projection.primaryAction} busy={busy} onAction={onAction} className="turn-action" />}
      </aside>
    </section>
  );
}

function RewardScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "AWAITING_REWARD" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return (
    <section className="reward-screen page-screen">
      <div className="reward-heading">
        <h2>전투에서 살아남았습니다.</h2>
        <p>재료 하나를 골라 덱에 넣으세요.</p>
      </div>
      <div className="reward-grid">
        {projection.choices.map((choice) => (
          <article className="reward-card" key={choice.choiceId}>
            {choice.artSrc ? <img src={choice.artSrc} alt="" /> : <div className="missing-art" aria-hidden="true" />}
            <h3>{choice.nameKo}</h3>
            <p>{choice.kindLabelKo} · 어름</p>
            <ActionButton action={choice.action} busy={busy} onAction={onAction} />
          </article>
        ))}
      </div>
      <StatsStrip projection={projection} />
    </section>
  );
}

function EventScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "IN_EVENT" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return (
    <section className="event-screen page-screen">
      <JourneyRail projection={projection} />
      <div className="open-record">
        <figure><img src={projection.artSrc} alt="" /></figure>
        <div className="event-copy">
          <div className="event-title-row"><h2>{projection.titleKo}</h2><span>연료 {projection.stats.fuel}</span></div>
          <p>{projection.descriptionKo}</p>
          <div className="event-choices">
            {projection.choices.map((choice) => (
              <ActionButton
                key={choice.choiceId}
                action={choice.action}
                busy={busy}
                onAction={onAction}
                className="event-choice"
                detailKo={projection.eventType === "FICTOR" ? (choice.price === 0 ? "연료 없음" : `연료 ${choice.price}`) : undefined}
                disabledReasonKo={projection.eventType === "FICTOR" ? "연료 부족" : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <StatsStrip projection={projection} />
    </section>
  );
}

function EventResolvedScreen({ projection, session, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "EVENT_RESOLVED" }>; session: StillkinTrack1UiSession; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected([]), [projection.screenKey]);
  const workshopAction = session.describeWorkshopAction(selected);
  const toggle = (instanceId: string) => setSelected((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : current.length < 2 ? [...current, instanceId] : [current[1], instanceId]);
  return (
    <section className="event-screen resolved-screen page-screen">
      <JourneyRail projection={projection} />
      <div className="open-record">
        <figure><img src={projection.artSrc} alt="" /></figure>
        <div className="event-copy">
          <h2>{projection.titleKo}</h2>
          {projection.workshopMaterials.length > 0 ? (
            <>
              <p>서로 다른 재료 두 장을 골라 연료 없이 빚으세요.</p>
              <div className="workshop-materials" aria-label="공방 재료 선택">
                {projection.workshopMaterials.map((material) => (
                  <button key={material.instanceId} type="button" data-material-card-id={material.cardId} aria-pressed={selected.includes(material.instanceId)} onClick={() => toggle(material.instanceId)} disabled={busy}>
                    <img src={material.artSrc} alt="" /><span>{material.nameKo}</span>
                  </button>
                ))}
              </div>
              <p className="selection-count" role="status">{selected.length} / 2장 선택</p>
              {selected.length === 2 && !workshopAction && <p className="inline-error" role="alert">서로 다른 재료를 골라야 합니다.</p>}
              <button type="button" className="action-button primary-cta" disabled={busy || !workshopAction} onClick={() => workshopAction && onAction(workshopAction)}>두 재료 빚기</button>
            </>
          ) : (
            <>
              <p>이 사건의 결과를 기록했습니다.</p>
              {projection.leaveAction && <ActionButton action={projection.leaveAction} busy={busy} onAction={onAction} className="primary-cta" />}
            </>
          )}
        </div>
      </div>
      <StatsStrip projection={projection} />
    </section>
  );
}

function TerminalScreen({ projection, busy, onAction }: { projection: Extract<Track1UiProjection, { phase: "RUN_WON" | "RUN_LOST" }>; busy: boolean; onAction: (action: Track1UiActionDescriptor) => void }) {
  return (
    <section className={`terminal-screen page-screen ${projection.phase === "RUN_WON" ? "is-won" : "is-lost"}`}>
      <img src={projection.artSrc} alt="" />
      <div>
        <h2>{projection.headingKo}</h2>
        <p>{projection.messageKo}</p>
        <ActionButton action={projection.action} busy={busy} onAction={onAction} className="primary-cta" />
      </div>
    </section>
  );
}

export function App({ session, initialProjection }: AppProps) {
  const [projection, setProjection] = useState(initialProjection);
  const [pendingAction, setPendingAction] = useState<Track1UiActionDescriptor | null>(null);
  const processedAction = useRef<Track1UiActionDescriptor | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const shell = useRef<HTMLElement>(null);
  const combatFocusRequest = useRef<{ focusKey: string; handIndex: number } | null>(null);

  useEffect(() => {
    if (!pendingAction || processedAction.current === pendingAction) return;
    processedAction.current = pendingAction;
    const result = session.dispatch(pendingAction);
    setProjection(result.projection);
    setPendingAction(null);
  }, [pendingAction, session]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [projection.focusKey]);

  useEffect(() => {
    const request = combatFocusRequest.current;
    if (!request) return;
    combatFocusRequest.current = null;
    if (projection.phase !== "IN_COMBAT" || projection.focusKey !== request.focusKey) return;
    const nextCard = shell.current?.querySelector<HTMLButtonElement>(`button.combat-card[data-hand-index="${request.handIndex}"]:not(:disabled)`);
    const endTurn = shell.current?.querySelector<HTMLButtonElement>('button[data-action-kind="END_TURN"]:not(:disabled)');
    (nextCard ?? endTurn)?.focus({ preventScroll: true });
  }, [projection]);

  const onAction = (action: Track1UiActionDescriptor) => {
    if (!pendingAction) setPendingAction(action);
  };
  const onCombatCardAction = (action: Track1UiActionDescriptor, handIndex: number) => {
    if (pendingAction) return;
    combatFocusRequest.current = { focusKey: projection.focusKey, handIndex };
    setPendingAction(action);
  };
  const busy = pendingAction !== null;

  return (
    <main ref={shell} className={`game-shell phase-${projection.phase.toLowerCase()}`} aria-busy={busy} data-screen-key={projection.screenKey}>
      <ScreenHeader projection={projection} />
      <h1 className="sr-only focus-heading" ref={heading} tabIndex={-1}>{projection.focusHeadingKo}</h1>
      {projection.phase === "BLOCKED" && <BlockedScreen projection={projection} />}
      {projection.phase === "BETWEEN_NODES" && <JourneyScreen projection={projection} busy={busy} onAction={onAction} />}
      {projection.phase === "IN_COMBAT" && <CombatScreen projection={projection} busy={busy} onAction={onAction} onCardAction={onCombatCardAction} />}
      {projection.phase === "AWAITING_REWARD" && <RewardScreen projection={projection} busy={busy} onAction={onAction} />}
      {projection.phase === "IN_EVENT" && <EventScreen projection={projection} busy={busy} onAction={onAction} />}
      {projection.phase === "EVENT_RESOLVED" && <EventResolvedScreen projection={projection} session={session} busy={busy} onAction={onAction} />}
      {(projection.phase === "RUN_WON" || projection.phase === "RUN_LOST") && <TerminalScreen projection={projection} busy={busy} onAction={onAction} />}
      <Feedback projection={projection} busy={busy} />
    </main>
  );
}
