# T024 공유 빚기 런타임

`forge-runtime-state-v1` / `forge-runtime-engine-v1`은 공방 빚기와 전투 중 즉석 빚기를 하나의
`resolveForgeCard` 경계에 연결한다. 두 모드의 조합 의미는 완전히 같고 비용과 수명만 다르다. 런타임은
`resolverVersion: canonical-v1`과 64자리 `sourceHash`를 저장하며, 호출 때 주입한 최소 canonical source
projection의 버전·hash가 일치해야만 명령을 실행한다. generated catalog, 아트, result class 결과 또는
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

## 원자성, 저장, 확장 seam

state, command, context 공개 경계는 own data property allowlist를 한 번 snapshot한다. accessor, 상속·extra·
symbol/function, sparse 배열, cycle, 비유한·unsafe 수를 거부하며 검증 후 원본을 다시 읽지 않는다. nested
combat은 `decodeCombatState(...).value`만 채택한다. 모든 변경은 작업 snapshot에서 resolver를 정확히 한 번
호출하고 전체 postcondition을 재검증한 뒤 commit한다. 실패는 원본과 deep-equal인 detached state와 단일
`FORGE_REJECTED`이며 fuel, action, deck, ledger, sequence, discovery 어느 것도 부분 변경되지 않는다.

프로필 발견도 같은 revision transaction에 sorted unique snapshot으로 들어간다. application/persistence의
단일 writer가 `{revision, sourceHash}`를 비교해 localStorage CAS를 수행해야 한다. 브라우저 탭 동시 쓰기는
도메인 reducer만으로 봉쇄되지 않는 잔여 위험이다. schema/engine/resolver version 불일치는 fail-closed하고,
rollback은 이전 snapshot 전체 교체로 한다.

Joinkin의 추가 단계와 터별 무료 빚기는 이후 trusted additive command/effect seam이다. 현재 API에는 caller가
fuelCost, instanceId, 무료 여부를 주입할 수 없고, 공방 비용 1과 즉석 턴당 1회만 고정한다.
