# T029 빚기·도감 UI 구현 기록

## 계약과 trust boundary

- Issue: #31, contract SHA-256 `a37295fe237f16ed3e4fea87a696d5271d38e23efa881e04a426a5b5d686e73e`
- 승인 시각 가이드: `forge-codex-concept.png` (1536×1024). 실제 화면은 T028의 냉청색 기록지/상아 카드/청록 ink/rust CTA token을 확장한다.
- 유일한 상태 authority는 T027 `createStillkinTrack1Controller`다. UI는 controller command, revision, run/encounter binding, fuel/free 값을 만들지 않는다.
- application facade는 현재 snapshot의 instance id만 받는다. 즉석은 현재 hand raw materials, 유료 공방은 `BETWEEN_NODES` owned raw materials, 무료 공방은 현재 `WORKSHOP` entitlement의 owned raw materials만 허용하며 동일 definition은 거부한다.
- 공방 preview와 review는 inert capability다. dialog confirm 시점에만 내부 WeakMap command에 연결된 opaque action descriptor가 생긴다. WeakMap authority는 revision/runId/focus key/screen key를 모두 확인하므로 새 run의 같은 revision에서도 old-run review는 실패한다. 취소는 dispatch와 write가 모두 0이다.
- `heartForge=false`를 유지하며 심장 빚기 affordance는 없다.
- T027/controller, `src/domain/forge-runtime`, persistence codec/schema, Track 1 config/hash/route, source/generated JSON, generated runtime packet, `package.json`은 변경하지 않았다.

## canonical preview와 도감

`src/application/browser/forge-codex-preview.ts`가 browser runtime packet의 52 materials와
`resolveForgeCard`로 52C2=1,326 records를 module initialization에서 한 번 만든다. 즉석/유료/무료/역순
pair와 도감이 같은 builder를 사용하므로 recipe id, card id, 재료 순서, 이름, effect id, branch, 결과 art가
동일하다. full generated catalog JSON을 browser graph에 import하지 않는다.

결과 art는 URL을 만들기 전에 T022의 exact material-pair bitset을 조회한다. canonical art가 없는 경우
lexical 첫 재료의 실제 도판으로 바꾸고 `재료 도판` 표식을 붙이므로 missing canonical URL의 404 요청이
발생하지 않는다. 미발견 도감 항목은 preview와 recipe id를 projection에서 `null`로 가리고 image를 렌더하지
않는다.

도감의 `availableModes`는 별도 저장 provenance가 아니라 같은 recipe를 빚을 수 있는 `즉석 빚기`/`공방
빚기` 두 방식이다. profile schema에는 recipe key 하나만 남으므로 동일 recipe를 어느 방식으로 다시 빚어도
항목은 하나다. surface open/close, 48개 pagination, 선택은 모두 React-local이다.

## 상호작용과 접근성

- 전투: `즉석 빚기` 선택 모드를 명시적으로 켜며 selectable raw material button에 `aria-pressed`를 쓴다. 선택 모드 밖 card click은 기존 play action이다.
- 즉석 장비: 도구 두 장의 결과는 손에 놓이지 않고 전투 동안만 보유된다고 알리며, cleanup 때 결과 제거와 재료 복구를 함께 알린다.
- 공방: 유료/무료가 같은 `ForgePanel`과 canonical preview를 사용한다. paid는 연료 0에서 disabled, free entitlement는 연료 0에서도 실행 가능하다.
- 확인 dialog: `role=dialog`, 연결된 heading, heading initial focus, native cancel/confirm, Escape 취소, 두 action 사이 Tab loop, 취소 후 review trigger focus return을 제공한다.
- 도감: native open/close/entry/page buttons, SVG chevron, heading initial focus, 내부 Tab loop, Escape close 후 header trigger focus return을 제공한다. 열린 동안 game underlay는 `inert`/`aria-hidden`이며 현재 screen key마다 snapshot을 remount한다.
- 반응형: 1536 desktop open-book, 900 stacked panel, 390 single-column/3-column Codex grid를 사용한다.

## Fidelity ledger

| 비교 지점 | concept evidence | 구현 판정 |
|---|---|---|
| container model | 왼쪽 공방 기록지 + 오른쪽 열린 도감 | 기존 게임 화면 위 각각 집중 surface로 분리. 동시 노출 대신 실제 플레이 흐름과 작은 화면을 보존한 의도적 차이 |
| recipe anatomy | 재료 2장, 등호, 정식 결과, 고정 레시피 | 공통 `CanonicalPreview`가 실제 재료/결과 art와 이름으로 동일 anatomy 구현 |
| 비용·수명 | 즉석 행동/복구/소멸, 공방 연료/영구 소모/덱 편입 | preview, CTA, 최종 dialog에 모두 명시 |
| irreversible confirm | 공방 CTA 아래 최종 확인 | 별도 modal에서 재료 둘·결과·연료 전후를 다시 제시하고 confirm 때만 descriptor 생성 |
| 도감 밀도 | discovered/masked grid + 우측 detail | 48개 page, masked URL 미요청, discovered 선택 detail로 구현 |
| palette/type | 청록 ink, 상아 paper, rust CTA, serif 기록체 | T028 token과 control typography를 그대로 재사용 |
| asset treatment | 실제 판화 카드 | T022 availability를 먼저 판정하고 실제 200 asset 또는 재료 fallback만 렌더 |
| responsive | 데스크톱 책 구조, 좁은 폭 필요 | 900px stacked, 390px single-column과 3-column masked grid |
| 금지 affordance | concept에 heart forge 없음 | `heartForge=false`, UI/action 없음 |

Above-the-fold copy는 concept의 핵심 용어 `공방`, `즉석 빚기`, `공방 빚기`, `도감`, 비용·수명 문구만
사용했다. concept의 `골드`, 장식 설정/가방 icon과 승인되지 않은 행동 수치는 실제 T027 authority가 아니므로
추가하지 않았다. concept의 97개 예시 기록 대신 canonical 총 1,326개와 실제 발견 수를 표시한다.

## 검증 기록

2026-08-15에 Browser plugin의 Chrome extension instance로 로컬 Vite 화면을 직접 열어 검증했다.

- 1536×900: [`forge-render.png`](forge-render.png), [`forge-dialog-render.png`](forge-dialog-render.png),
  [`codex-render.png`](codex-render.png). 공방 선택/preview, 최종 dialog, 48개 masked page를 확인했다.
- 900×900: [`codex-900-render.png`](codex-900-render.png). 6열 grid와 아래 detail 배치, 문서 폭
  `scrollWidth=900`을 확인했다.
- 390×844: [`forge-390-render.png`](forge-390-render.png), [`codex-390-render.png`](codex-390-render.png).
  공방 단일 열, 도감 3열, 문서 폭 `scrollWidth=390`을 확인했다.
- dialog를 연 직후 active element는 연결된 `H2`였고 취소 후 `최종 확인으로` 버튼으로 focus가 돌아왔다.
  도감 heading에도 초기 focus가 갔고 닫은 뒤 header의 도감 버튼으로 focus가 돌아왔다.
- 승인 concept와 최신 1536 공방/도감 render를 같은 QA pass에서 `view_image(original)`로 비교했다. 핵심
  구성·palette·recipe anatomy·masked grid는 일치하며, 동시 open-book 대신 독립 surface를 쓴 차이는 위
  fidelity ledger의 의도적 차이와 일치한다.

최종 command 결과는 작업 handoff에 exact output으로 기록한다. `package.json` SHA-256은 T015 binding인
`a1e0807b75b2a18c3d927f107993c1d683daae49949ed2ecd0478d89252c3b1b`을 유지한다.
