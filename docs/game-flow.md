# Track 1 literal run flow

## T033 종족 선택과 Burnkin

새 브라우저 프로필은 enabled content registry의 `Stillkin`과 `Burnkin` 중 하나를 먼저 고른다. 기존
`fictor.save.v2`가 있고 선택 기록이 없는 사용자는 Stillkin 런을 그대로 열어 저장 호환을 유지한다.
Burnkin도 새 터를 만들지 않고 동일한 어름의 터 9-node route를 완주한다.

Burnkin 시작 덱은 BURN 재료 6종을 5장씩 넣은 30장이다. 전투 중 `피 태우기`는 체력 지불과 에너지
증가를 원자적으로 적용하고, `지피기`는 손패 한 장을 exile로 옮긴 뒤 그 카드 코스트만큼 에너지를
얻는다. 공명률은 같은 provisional base의 정확한 2배이며 active attribute가 바뀌면 direct self-damage를
받는다. 단절 피해가 lethal이면 같은 controller dispatch에서 terminal 판정과 즉석 결과 cleanup까지
끝낸다. exact provisional 값과 비승인 범위는
[T033 결정 기록](decisions/t033-burnkin-provisional-rules-2026-08-16.md)에 둔다.

Track 1 공개 경계는 종족별 factory 또는 `createTrack1Controller({ storage, resolverContext }, raceId)`다. 호출자는
`load`, `snapshot`, `dispatch`만 사용하며, 시나리오 본문·런/ForgeRuntime 상태·소유 도구 목록·전투
결과·공방 성공 여부를 제출할 수 없다. 과거 `run-flow-state-v1` reducer와 game-session 조합기는
rollback을 위한 deep module에 남지만 application root에서는 노출하지 않는다.

모든 공개 command는 own data property만 허용하는 descriptor snapshot을 한 번 만든 뒤 처리한다.
접근자, Proxy 반사 실패, symbol key, sparse 배열, 순환 참조와 추가 키는 거부한다. command 결과와
`snapshot()`은 깊은 복사본이므로 controller 권한 객체와 별칭을 만들지 않는다. run command에는
`expectedRevision`과 `runId`, 전투 command에는 추가로 `nodeId`, `encounterId`, `encounterNonce`가
필요하다. 이전 run/encounter 토큰과 종료 전투의 재사용은 상태 변경 없이 거부된다.

## 고정된 provisional 계약

`stillkin-track1-provisional-v1`은 2026-08-15의 “literal T027를 지금 진행” 방향 아래 controller가
선택한 provisional execution packet이며 상태는 `PROVISIONAL_USER_DIRECTION_2026_08_15`다. 이 표기는
개별 exact value에 대한 사용자 승인이나 최종 밸런스 승인을 뜻하지 않는다. 값과 해시는
[결정 기록](decisions/t027-track1-provisional-config-2026-08-15.md)에 중앙화되어 있다.

route는 다음 순서로 고정된다.

`d1 normal swarm → CACHE → WORKSHOP → d2 elite → COLLAPSE → FICTOR → RECORD → d3 ODDITY → boss`

controller 생성 시 content registry의 실제 `getEnabledGround("GROUND_STILL")`을 조회한다. enabled 상태,
depth 1/2/3, normal/elite/boss route ID와 종류, 여섯 event type, boss와 `heart__still` 재사용 asset 결속이
config와 정확히 일치하지 않으면 시작·load 전에 fail-closed한다. 호출자가 registry authority를 주입할 수는 없다.

controller는 node 진입 시 내부 CombatSetup으로 실제 ForgeRuntime `activeCombat`을 만든다. 전투 종료는
별도 `RESOLVE_COMBAT`가 아니다. terminal이 된 `APPLY_COMBAT` 한 dispatch 안에서 현재 binding과 enemy를
다시 확인하고, 즉석 빚기 재료 복구/결과 제거 이벤트를 포함해 HP를 회수한 뒤 `activeCombat=null`로
만들고 보상 또는 패배/심장/승리를 적용한다. Stillkin 방어 절반 잔존과 provisional 공명률 0.1을 쓴다.

전투 card projection은 raw material 52종과 canonical forge 결과를 구분한다. raw material/tool/oddity는
config의 provisional baseline `DELAYED_EXPLOSION`, cost 1, power 10, STILL projection을 사용한다. canonical
LAW/CATALYST 결과는 recipe pair를 resolver context에서 다시 `resolveForgeCard`하여 canonical
`combat_effect`와 첫 `effective_attribute`를 보존한다. `DELAYED_EXPLOSION`만 기존 shared damage program을
사용하고 나머지 20 effect는 다른 피해 효과로 재분류하지 않으며, T023 registry body가 구현될 때까지
shared no-op(`targetRule: NONE`, `operations: []`)으로 정직하게 표시한다. EQUIPMENT 결과는 runtime의
owned/deck에는 보존하지만 passive 전투 계약이 없으므로 combat cards/instances/deck/enrollment에서 제외한다.

즉석 빚기의 LAW/CATALYST 결과는 ledger event만 만드는 overlay가 아니라 같은 dispatch에서 canonical
card/program definition과 ephemeral instance를 실제 combat hand에 등록한다. 이후 play/draw/discard/exile
이동마다 ledger location이 실제 단일 zone과 일치해야 하며 v2 reload도 이 결속을 다시 검증한다. 전투 종료
cleanup은 represented 결과를 모든 zone/instance에서 제거하고 더 이상 참조되지 않는 card/program도 정리한
뒤 격리했던 두 재료를 정확히 한 번 복구한다. 즉석 EQUIPMENT는 passive combat body가 없으므로 실제
instance를 만들지 않고 `EQUIPMENT` ledger/event overlay로만 남겼다가 같은 cleanup에서 제거한다.

## 보상과 이벤트

- 일반 보상은 `ore_still`, `still_01`, `still_02` 중 하나다.
- 엘리트 보상은 `tool_01`, `odd_02` 중 하나다.
- CACHE는 `still_03`, `still_04`를 함께 지급한다.
- WORKSHOP은 현재 node에 묶인 entitlement 하나를 지급한다. `USE_FREE_WORKSHOP`의 실제 빚기가 성공해야
  entitlement가 소모되며 fuel은 바뀌지 않고 `FREE_WORKSHOP_USED`가 기록된다. 일반
  `FORGE_WORKSHOP`은 fuel 1과 `FUEL_SPENT` 한 건을 유지한다.
- COLLAPSE는 persisted xorshift32 상태를 정확히 한 번 전진시킨다. 절반 확률 성공은 `still_05`, 실패는
  HP 5 피해이며 lethal이면 즉시 `RUN_LOST`다.
- FICTOR는 fuel 1을 지불하고 `still_04`, `tool_02`, `ore_burn|ore_still` 중 선택 하나를 받거나, fuel 0에서도
  `fictor-skip`으로 아무것도 받지 않고 진행할 수 있다.
  fuel 부족, 중복 unique tool, 이미 아는 recipe, 잘못된 choice는 전체 후보를 폐기한다.
- RECORD는 `ore_still|still_01`, ODDITY는 `odd_06`, boss는 `heart__still`을 지급한다.

어떤 보상도 Tier2 또는 equipment를 직접 지급하지 않는다. 모든 profile/runtime/flow 변화와 반환 이벤트는
후보 상태에서 완성된 뒤 v2 envelope 저장이 성공해야 controller 상태가 된다. restart는 profile만 보존하고
새 runId, starter 30장, fuel 4, HP 30, route와 nonce sequence를 새로 만든다. `heartForge`는 항상 false다.

## T029 브라우저 빚기·도감 경계

브라우저 UI는 T027 controller를 우회하지 않는다. `createStillkinTrack1UiSession`이 현재 snapshot의
instance id만 받아 즉석/유료 공방/무료 공방 후보를 만들고, 세 모드 모두 browser runtime packet과
`resolveForgeCard`를 거치는 하나의 canonical preview builder를 사용한다. 정렬된 recipe/card/name/effect와
T022 489장 availability bitset 기반 art fallback은 모드와 입력 순서에 관계없이 같다. 차이는 즉석의
`행동 1회 + 전투 한정`과 공방의 `연료 1 또는 무료 entitlement + 영구`뿐이다.

즉석 빚기는 ongoing `PLAYER_ACTION`의 현재 손에 있는 raw material, 서로 다른 definition 두 장만
선택한다. React는 명시적인 선택 모드에서만 카드 클릭을 재료 선택으로 해석하므로 카드 사용과 충돌하지
않는다. 일반 결과는 같은 손에 나타난다. 도구 두 장의 `EQUIPMENT` 결과는 손에 놓이지 않고 전투 동안만
보유된다는 별도 feedback을 표시한다. terminal cleanup feedback은 어느 branch든 결과 제거와 두 재료의
deck 복구를 함께 알린다.

유료 공방은 `BETWEEN_NODES`, 무료 공방은 해당 `WORKSHOP` entitlement가 남은 `EVENT_RESOLVED`에서만
열린다. 선택/preview/review는 어떤 dispatch나 localStorage write도 하지 않는다. review capability와
실행 action은 application 내부 WeakMap에 묶이고, 사용자가 dialog의 영구 소모·결과·연료 전후를 확인한 뒤
confirm한 순간에만 executable descriptor가 생성된다. authority는 revision뿐 아니라 runId, focus key,
screen key를 함께 묶으므로 취소·위조 capability·화면이 바뀐 stale review와 새 run에서 우연히 같은
revision이 된 old-run review도 명령을 만들 수 없다. caller가 fuel/free boolean을 전달하는 seam은 없다.

도감 surface는 browser session의 현재 profile snapshot에서 발견 여부만 읽고, 페이지·선택·열림 상태는
React-local이다. 52C2 1,326개 canonical record는 application module에서 한 번 결정론적으로 파생하며,
48개씩 lexical 순서로 표시한다. 미발견 항목은 recipe/material/result를 모두 가리고 이미지 URL도 요청하지
않는다. 발견 항목의 `availableModes`와 `빚을 수 있는 방식` 표시는 영구 저장하지 않는 역사적 provenance가
아니라 같은 recipe key를 빚을 수 있는 두 canonical 방식이다. 어느 방식에서 발견해도 항목은 하나뿐이다.
도감을 열면 현재 projection의 screen key로 snapshot을 새로 만들며, 열린 동안 game underlay 전체가
`inert`/`aria-hidden`이 된다. Tab은 modal 내부에서 순환하므로 도감 뒤 action은 dispatch될 수 없다.

Track 1의 `heartForge`는 계속 `false`이며 심장 빚기 선택지나 action은 브라우저 facade와 UI에 없다.
