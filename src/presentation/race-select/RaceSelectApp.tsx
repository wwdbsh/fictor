import { useEffect, useMemo, useRef, useState } from "react";

import type { PlayableTrack1RaceId, StillkinTrack1UiSession, Track1RaceSelection } from "../../application";
import { App } from "../App";
import { LegalNoticeLink } from "../legal/LegalNoticeLink";

export interface RaceSelectAppProps {
  readonly selection: Track1RaceSelection;
}

export function RaceSelectApp({ selection }: RaceSelectAppProps) {
  const [raceId, setRaceId] = useState<PlayableTrack1RaceId | null>(selection.initialRaceId);
  const [errorKo, setErrorKo] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const session = useMemo<StillkinTrack1UiSession | null>(() => raceId ? selection.createSession(raceId) : null, [raceId, selection]);
  const initialProjection = useMemo(() => session?.load() ?? null, [session]);
  useEffect(() => { if (!session || !initialProjection) headingRef.current?.focus({ preventScroll: true }); }, [session, initialProjection]);

  if (session && initialProjection) return <App session={session} initialProjection={initialProjection} onChangeRace={() => setRaceId(null)} />;

  const choose = (selected: PlayableTrack1RaceId) => {
    if (selection.select(selected)) {
      setErrorKo(null);
      setRaceId(selected);
    } else {
      setErrorKo("종족 선택을 로컬 저장소에 기록하지 못했습니다.");
    }
  };

  return (
    <main className="race-select-screen page-screen">
      <header><p>FICTOR · 픽토르</p><h1 ref={headingRef} tabIndex={-1}>붙이를 고르세요</h1><p>같은 어름의 터에서도 몸에 밴 규칙이 달라집니다.</p></header>
      <div className="race-select-grid">
        {selection.choices.map((race) => (
          <article key={race.raceId} className={`race-choice race-${race.attribute.toLowerCase()}`}>
            <p>{race.attribute}</p>
            <h2>{race.labelKo}</h2>
            <p>{race.summaryKo}</p>
            <button type="button" onClick={() => choose(race.raceId)}>{race.labelKo}로 시작</button>
          </article>
        ))}
      </div>
      {errorKo ? <p role="alert">{errorKo}</p> : null}
      <LegalNoticeLink baseUrl={selection.baseUrl} />
    </main>
  );
}
