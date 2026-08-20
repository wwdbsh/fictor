# T024 공유 빚기 런타임

`forge-runtime-state-v1` / `forge-runtime-engine-v1`은 공방 빚기와 전투 중 즉석 빚기를 하나의
`resolveForgeCard` 경계에 연결한다. 두 모드의 조합 의미는 완전히 같고 비용과 수명만 다르다. 런타임은
`resolverVersion: canonical-v1`과 공식 `sourceHash`를 저장하며, 호출 때 주입한 최소 canonical source
projection의 버전·hash가 일치해야만 명령을 실행한다. 이 두 caller 필드의 자기 일치만 신뢰하지 않고,
`{materials, inputs}`를 key 정렬 canonical JSON으로 직렬화한 UTF-8 SHA-256도 내부의 검수된 digest와
일치시킨다. 따라서 공식 hash를 붙인 가짜 ID·속성·법칙·result class도 context decode에서 거부된다.
generated catalog, 아트, result class 결과 또는
unstable 경로는 런타임 상태에 저장하지 않는다.

## 권위와 수명

`run.ownedInstances`와 `run.deck`이 영구 권위다. 모든 owned instance는 영구 deck에 정확히 한 번 있으며,
active combat은 그중 플레이 가능한 subset만 같은 instance/card id로 투영한다. 새로 빚은 장비나 아직
전투 정의로 투영할 수 없는 카드는 enrollment에서 빠질 수 있다.

공방 빚기는 전투가 없을 때만 가능하다. 선택한 두 영구 재료를 owned/deck에서 영구 제거하고 고정 연료
1을 쓴 뒤 결과 instance를 owned와 deck 바닥에 추가한다. 즉석 빚기는 ongoing `PLAYER_ACTION`에서 턴당
1회만 가능하다. 손의 재료 둘을 nested combat instance/hand에서 격리 ledger로 옮기고, 결과는
ephemeral ref로만 기록한다. **T024의 ephemeral 결과 lifecycle overlay는 아직 플레이 가능한 전투 카드가
아니다.** 가짜 `CardDefinition`이나 효과를 만들지 않는다.

terminal 전환과 명시적 cleanup은 ephemeral location이 HAND/DECK/DISCARD/EXILE/EQUIPMENT 중 무엇이든
모든 ref를 제거한다. 그 다음 격리 ledger 순서대로 영구 재료를 nested combat instances와 deck 바닥에
정확히 한 번 복구한다. 원래 영구 deck은 전투 동안 바뀌지 않으므로 장기 복구 권위가 보존된다. terminal
combat은 증거와 replay 대조를 위해 남기며 close-combat 명령은 두지 않는다. 이미 ledger가 빈 cleanup은
revision이나 event를 만들지 않는 멱등 성공이다.

기본 즉석 action budget은 `0 | 1`이고 항상 nested combat turn과 같은 `forgeActionTurn`에 묶인다. ongoing
`PLAYER_ACTION`에서만 양수일 수 있으며 `END_TURN`과 모든 terminal 전환에서 0으로 만료된다. 성공한 다음
`START_TURN`만 새 turn의 기본 1회를 부여한다. Joinkin의 검증된 2 예외는 아래 T034 절의 현재-turn skill
authority가 있을 때만 유효하므로 persisted 값 조작으로 횟수를 늘릴 수 없다.

## 원자성, 저장, 확장 seam

state, command, context 공개 경계는 own data property allowlist를 한 번 snapshot한다. accessor, 상속·extra·
symbol/function, sparse 배열, cycle, 비유한·unsafe 수를 거부하며 검증 후 원본을 다시 읽지 않는다. nested
combat은 `decodeCombatState(...).value`만 채택한다. 모든 변경은 작업 snapshot에서 resolver를 정확히 한 번
호출하고 전체 postcondition을 재검증한 뒤 commit한다. 실패는 원본과 deep-equal인 detached state와 단일
`FORGE_REJECTED`이며 fuel, action, deck, ledger, sequence, discovery 어느 것도 부분 변경되지 않는다.
단, `APPLY_COMBAT`에 들어간 정상 형태의 nested 명령을 combat reducer가 거부한 경우에는 combat 경계의
단일 `COMMAND_REJECTED`를 그대로 반환하며, 이 경우도 runtime state와 action budget은 바뀌지 않는다.

프로필 발견도 같은 revision transaction에 sorted unique snapshot으로 들어간다. application/persistence의
단일 writer가 `{revision, sourceHash}`를 비교해 localStorage CAS를 수행해야 한다. 브라우저 탭 동시 쓰기는
도메인 reducer만으로 봉쇄되지 않는 잔여 위험이다. schema/engine/resolver version 불일치는 fail-closed하고,
rollback은 이전 snapshot 전체 교체로 한다.

공식 canonical source 또는 최소 projection이 바뀌면 version/source hash/projection digest를 함께 명시적으로
재검수해 rebind해야 한다. caller가 새 hash를 임의로 제시하는 방식의 자동 승격은 허용하지 않는다.

## T034 Joinkin grouped provenance

T034는 기존 pair 명령을 바꾸지 않고 `FORGE_INSTANT_THREE`와 `FORGE_WORKSHOP_THREE`를 additive하게 연결한다.
첫 두 instance가 canonical pair이고 세 번째 instance는 명시적 C다. resolver는
`resolveForgeCard(A,B)` 뒤 `applyThird(base,C)`만 수행한다. 결과 card/recipe/art/effect는 base와 exact
동일하며 중간 결과 instance, catalog 밖 id 또는 새 discovery key는 없다. A/B tool+tool과 세 instance 또는
definition 중복은 mutation 전에 거부한다.

즉석 ledger는 legacy pair의 암묵적 1:2 순서를 계속 읽으면서, 새 결과에는 `PAIR | JOINKIN_THREE` grouped
provenance를 선택적으로 기록한다. Joinkin group은 base instance 둘, C instance/id와 C 주 속성 overlay를
함께 묶는다. cleanup은 group 크기에 따라 정확히 2장 또는 3장을 복구한다. 영구 결과의 C overlay는
`run.joinkinThirdOverlays`에 instance별로 저장한다. strict boundary는 group/격리 순서/card id/recipe를
대조하고 application load authority가 canonical material definition에서 C 속성을 다시 파생해 tamper를
거부한다. 필드가 없는 기존 Stillkin/Burnkin pair save는 legacy 형식으로 계속 유효하다.

무료 공방은 application이 동일 workshop reducer의 고정 비용을 내부 payment snapshot에서 처리하고 원래
연료를 복구한 뒤 `FREE_WORKSHOP_USED`로 투영한다. caller가 fuel/free boolean을 전달하는 seam은 없고,
entitlement 소비와 단일 flow/runtime revision 및 localStorage CAS가 같은 controller transaction에 있다.

Joinkin의 `이어붙이기`는 active combat의 action budget을 검증된 1에서 2로 한 번만 올린다. 2는 현재 turn과
`joinkinSkillUsedTurn` authority가 일치할 때만 decode되며 END/terminal에서 0으로 만료한다. 다른 종족은
controller 명령을 받지 않는다. 터별 다른 무료 빚기 정책은 여전히 후속 seam이다.
