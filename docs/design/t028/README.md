# T028 전투·런 진행 UI 구현 기록

## 계약과 불변식

- Issue: #30, contract SHA-256 `74f90b4bf90b1d71d644ee0e616f6d6136a2b240d8d25f7847922f4fdc29a317`
- 게임 상태의 유일한 authority는 T027 `createStillkinTrack1Controller`다.
- presentation은 application의 `Track1UiProjection`과 opaque `Track1UiActionDescriptor`만 사용한다. `expectedRevision`, `runId`, encounter binding은 application facade가 채운다.
- 실패한 dispatch의 snapshot은 채택하지 않는다. 성공한 dispatch의 snapshot만 다음 UI projection의 입력이 된다.
- corrupt/unsupported/write-blocked save는 자동 삭제하지 않고 blocking UI로 표시한다.
- 독립 빚기·도감 UI는 제외한다. `WORKSHOP` entitlement 정산에 필요한 서로 다른 재료 2장 선택기만 `EVENT_RESOLVED`에 둔다.
- config/hash/save schema는 변경하지 않는다. `package.json`도 T015 immutable binding SHA `a1e0807b75b2a18c3d927f107993c1d683daae49949ed2ecd0478d89252c3b1b`를 보존한다.

## 승인된 콘셉트와 구현 캡처

| 상태 | 승인 콘셉트 | 1536×1024 구현 캡처 |
|---|---|---|
| 전투 | `combat-concept.png` | `combat-render.png` |
| 보상 | `reward-concept.png` | `reward-render.png` |
| 이벤트 | `event-concept.png` | `event-render.png` |

1024px 미만 적층은 `combat-render-900.png`(900×1000 full-page)로 확인했다.

## 구현 디자인 시스템

- 색: 냉청색 배경 `#c9dde3`, 짙은 청록 잉크 `#103641`, 상아 카드 `#eee8d9`, 녹슨 주황 CTA `#a74417`.
- 서체: 제목·기록·버튼은 Georgia → `Noto Serif KR` → 바탕체 fallback. 상태문은 system UI.
- 컨테이너: 전투는 landscape art 위 HUD와 손패, 보상은 열린 여백 위 3장 선택, 이벤트는 좌측 실제 art/우측 선택지의 펼친 기록지.
- 컨트롤: 모든 상호작용은 native `button`, 최소 높이 44px, `:focus-visible` teal outline, 상태는 `role=status`, 실패·blocking은 `role=alert`.
- 모션: 카드 hover/focus의 짧은 상승만 사용하고 `prefers-reduced-motion`에서 사실상 제거한다.
- 반응형: 1024px 미만에서는 전투 HUD·손패·통계를 세로 적층하고 손패/보상은 가로 scroll, 이벤트 기록지는 단일 열로 전환한다.

## 화면별 허용 카피와 기능

- 공통: `FICTOR · 픽토르`, `어름의 터 · 깊이 N / 3`, 저장 상태.
- 전투: controller가 제공한 적 의도, 체력·방어·에너지·덱·버린 카드, controller card name/수치, `턴 시작`, `턴 종료`.
- 보상: `전투에서 살아남았습니다.`, `재료 하나를 골라 덱에 넣으세요.`, 실제 reward choice 이름.
- 이벤트: canonical event명과 controller-bound choice. FICTOR의 `아무것도 고르지 않고 떠나기`는 0 연료 경로다.
- 공방 예외: `서로 다른 재료 두 장을 골라 연료 없이 빚으세요.`, `두 재료 빚기`.
- 종료: 승리/패배 기록과 `새 런`.

## Browser runtime packet

`scripts/gen-browser-runtime-packet.ts`는 handwritten source 3개를 읽어 `src/application/browser/runtime-packet.generated.ts`를 결정론적으로 만든다. packet은 T027 resolver에 필요한 exact 52 materials/21 laws/34 result classes 최소 projection과 UI material display를 포함한다. source hash가 `FORGE_RUNTIME_SOURCE_HASH`와 다르면 생성 자체가 실패한다.

T015 binding 때문에 npm script는 추가하지 않았다. freshness 명령은 다음과 같다.

```bash
npx tsx scripts/gen-browser-runtime-packet.ts --check
```

## Fidelity ledger

| 비교 지점 | 콘셉트 근거 | 구현 결과 | 판정/의도적 차이 |
|---|---|---|---|
| 팔레트 | 냉청색 기록지, 청록 ink, 상아 card, rust CTA | 네 핵심 token을 전 상태에 공유 | 일치 |
| 전투 구조 | 상단 intent, 중앙 enemy, 하단 hand, 양쪽 HUD | 같은 시선 순서와 HUD 배치를 유지 | 일치 |
| 보상 구조 | 중앙 3장 선택, 하단 stats/status | controller의 실제 3개 reward를 같은 구조로 표시 | 일치 |
| 이벤트 구조 | journey rail, 펼친 기록지, 좌 art/우 choice | 9개 고정 node rail과 실제 event art/choice를 표시 | 기능 밀도만 실제 route에 맞춤 |
| typography/control | 큰 세리프 heading, 판형 button | serif hierarchy와 44px native button을 유지 | 일치 |
| asset 처리 | engraving background/card/enemy/event | 현재 화면의 실제 `public/assets`만 `<img>`로 요청 | 일치; concept 속 가상 art는 사용하지 않음 |
| 반응형 | 데스크톱 중심, 작은 폭 적층 요구 | 900px 캡처에서 enemy→hand→stats→turn 순으로 적층 | 일치 |
| 카피 | concept의 시각 예시 문구 | controller의 실제 card/enemy/choice와 공식 용어 사용 | 의도적 차이: 임의 카드 의미·수치를 만들지 않음 |

Above-the-fold diff: 브랜드, 깊이, 핵심 상태 제목/의도, 기본 CTA의 계층은 유지했다. concept에 있던 `새 런 R`, 시계, 설정 아이콘, `Space` 표시는 실제 T027 action이 아닌 장식/shortcut이므로 추가하지 않았다. 실제 card name·수치·reward/event copy는 controller projection으로 교체했다.

## 시각·상호작용 검증

- in-app Browser 도구는 현재 실행 환경에 callable surface가 없고 catalog의 skill 경로도 설치본과 일치하지 않아 Puppeteer Chromium fallback을 사용했다.
- `node scripts/capture-t028-ui.mjs http://127.0.0.1:5173/`로 1536×1024 전투/보상/FICTOR와 900×1000 전투를 캡처했다.
- 승인 콘셉트 3장과 최신 구현 캡처 4장을 같은 QA pass에서 `view_image(original)`로 확인했다.
- 점검 항목: copy hierarchy, layout anatomy, serif scale, 네 color tokens, 실제 asset framing, control geometry, 900px stacking, 상태 전환 focus.
- 실제 core path는 first combat → reward → cache → free workshop material picker → elite encounter까지 자동 smoke와 integration test로 확인했다.
- material mismatch로 수정한 항목: relative Vite base가 CSS custom-property URL에서 `assets/assets`로 해석되던 문제를 실제 `<img src>` background로 바꿔 subpath-safe하게 만들었다.

현재 승인 콘셉트의 container model, palette, typography hierarchy, asset treatment와 핵심 상호작용을 충실히 검증했다. 남은 의도적 차이는 controller 실제 데이터/기존 production asset을 우선한 부분뿐이다.
