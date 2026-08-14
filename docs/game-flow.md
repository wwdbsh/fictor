# Track 1 literal run flow

T027의 공개 경계는 `createStillkinTrack1Controller({ storage, resolverContext })`다. 호출자는
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

controller는 node 진입 시 내부 CombatSetup으로 실제 ForgeRuntime `activeCombat`을 만든다. 전투 종료는
별도 `RESOLVE_COMBAT`가 아니다. terminal이 된 `APPLY_COMBAT` 한 dispatch 안에서 현재 binding과 enemy를
다시 확인하고, 즉석 빚기 재료 복구/결과 제거 이벤트를 포함해 HP를 회수한 뒤 `activeCombat=null`로
만들고 보상 또는 패배/심장/승리를 적용한다. Stillkin 방어 절반 잔존과 provisional 공명률 0.1을 쓴다.

## 보상과 이벤트

- 일반 보상은 `ore_still`, `still_01`, `still_02` 중 하나다.
- 엘리트 보상은 `tool_01`, `odd_02` 중 하나다.
- CACHE는 `still_03`, `still_04`를 함께 지급한다.
- WORKSHOP은 현재 node에 묶인 entitlement 하나를 지급한다. `USE_FREE_WORKSHOP`의 실제 빚기가 성공해야
  entitlement가 소모되며 fuel은 바뀌지 않고 `FREE_WORKSHOP_USED`가 기록된다. 일반
  `FORGE_WORKSHOP`은 fuel 1과 `FUEL_SPENT` 한 건을 유지한다.
- COLLAPSE는 persisted xorshift32 상태를 정확히 한 번 전진시킨다. 절반 확률 성공은 `still_05`, 실패는
  HP 5 피해이며 lethal이면 즉시 `RUN_LOST`다.
- FICTOR는 fuel 1을 지불하고 `still_04`, `tool_02`, `ore_burn|ore_still` 중 선택 하나를 받는다.
  fuel 부족, 중복 unique tool, 이미 아는 recipe, 잘못된 choice는 전체 후보를 폐기한다.
- RECORD는 `ore_still|still_01`, ODDITY는 `odd_06`, boss는 `heart__still`을 지급한다.

어떤 보상도 Tier2 또는 equipment를 직접 지급하지 않는다. 모든 profile/runtime/flow 변화와 반환 이벤트는
후보 상태에서 완성된 뒤 v2 envelope 저장이 성공해야 controller 상태가 된다. restart는 profile만 보존하고
새 runId, starter 30장, fuel 4, HP 30, route와 nonce sequence를 새로 만든다. `heartForge`는 항상 false다.
