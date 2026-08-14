# T023 전투·기본 공명 엔진

## 범위와 상태 기계

이 모듈은 React, 브라우저 API, Node API, canonical 데이터 import 없이 동작하는 순수 TypeScript 경계다.
`createCombatState(setup)`과 `reduceCombat(state, command)`가 공개 진입점이다. 유효한 state boundary에서
reducer는 새 상태와 직렬화 가능한 ordered event 배열을 반환하며, malformed state는 아래의 명시적인
null-state boundary failure로 반환한다.

```text
TURN_READY --START_TURN--> START_TURN --energy/draw--> PLAYER_ACTION
PLAYER_ACTION --PLAY_CARD--> PLAYER_ACTION
PLAYER_ACTION --END_TURN--> END_TURN --enemy intent--> TURN_READY
                                      \--lethal--> TERMINAL (VICTORY | DEFEAT)
```

초기 turn은 0이고 성공한 `START_TURN`만 turn을 1 올린다. 시작 처리는 에너지를 `maxEnergy`로
재설정한 뒤 `drawCount`장 뽑는다. 종료 처리는 다음 순서로 고정한다.

1. 손패 전체를 discard로 이동한다.
2. 적 block을 0으로 만료한다.
3. 현재 intent의 실제 program을 전부 실행한다.
4. 양측 HP를 함께 판정한다.
5. 계속 중일 때만 플레이어 block을 잔존시키고 intent를 회전한다.
6. `TURN_READY`로 돌아간다.

카드 program도 모든 operation을 실행하고 카드를 지정 zone으로 이동한 뒤 양측 HP를 함께 판정한다.
따라서 한 program 안의 자해 후 회복 같은 순서는 중간 사망으로 잘리지 않는다. 동시 사망은 필수
`terminalPolicy` (`DEFEAT_FIRST` 또는 `VICTORY_FIRST`)로만 결정한다. terminal 상태에서는 모든 명령을
거부하므로 적 행동이나 intent 회전이 추가로 발생하지 않는다. lethal 판정은 state의 status와 phase를
함께 바꾼 뒤 `COMBAT_ENDED`, `PHASE_CHANGED(TERMINAL)` 순으로 event를 낸다. validator는 `ONGOING`과
`TERMINAL`의 조합 및 terminal status와 비-terminal phase의 조합을 모두 거부한다.

## 수치와 밸런스 주입

엔진에는 플레이 수치 기본값이 없다. setup이 HP, block, 카드 cost/power, deck, 적 intent와 함께 다음
rules를 모두 주입해야 한다.

- `maxEnergy`, `drawCount`
- `resonanceRate` (`number | null`)
- `blockRetention`
- `terminalPolicy`

block 잔존은 `{ numerator, denominator, rounding: "FLOOR" }`로 직렬화한다. factor는 0..1이며
`floor(block * numerator / denominator)`만 허용한다. T023의 완전 만료는 `0/1`, T026의 절반 잔존은
`1/2`로 표현할 수 있다. 부동소수 반올림 규칙이나 종족별 상수는 엔진에 숨겨 두지 않는다.

count, 확정 cost, energy, seed와 index는 안전한 정수여야 한다. HP, block, 확정 power, rate와 operation amount는
유한·비음수이고 안전 범위를 벗어나지 않아야 한다. 공명률이 `null`이거나 계산이 overflow이면 수치
효과의 카드 플레이 전체를 거부한다. 계산 결과를 반올림하지 않는다. 아직 밸런스가 승인되지 않은
canonical projection은 card cost/power를 `null`로 보존할 수 있다. 이는 유효한 setup/state이지만 해당
카드는 `INVALID_CARD_NUMERIC`으로 플레이할 수 없다. `NaN`, 음수, 무한대는 boundary 자체가 거부한다.

## 기본 공명과 카드 projection

공명 상태는 `activeAttribute | null`과 여섯 속성의 `streakByAttribute`만 저장한다. 현재 streak는
active 속성에서 파생한다. 첫 성공 플레이는 streak 1이고, 같은 속성이면 1 증가한다. 다른 속성이면
모든 streak를 0으로 만든 뒤 새 속성을 1로 설정한다. 첫 카드도
`power * (1 + 1 * resonanceRate)`를 적용한다.

canonical 카드의 `effective_attributes` 배열에서 단일 속성을 추론하지 않는다. composition adapter가
명시적인 `CardDefinition.resonanceAttribute` projection을 공급해야 한다. 이 adapter의 정책은 T023에서
아직 미해결이며, 필드가 `null`이거나 유효하지 않으면 플레이가 fail-closed된다. 종족별 공명 변주는
T026의 별도 seam이며 기본 상태 구조에 섞지 않는다.

## 21효과 dispatch와 operation

`COMBAT_EFFECT_IDS`와 `CombatEffectId`가 `laws.json`의 정확한 21개 id runtime 경계를 소유한다. registry는
`EffectProgram[]`이며 effect id가 유일해야 한다. 일부 program만 제공하는 것은 유효하지만, 해당 effect의
program이 없으면 플레이 시 `EFFECT_PROGRAM_UNAVAILABLE`로 거부한다. 카드 id별 분기, 함수 callback,
operation callback은 없다.

각 program은 target 요구/허용 범위, 플레이 카드의 `DISCARD | EXILE` 목적지, 공통 atomic operation 배열만
가진다. interpreter가 damage, block, heal을 동일하게 처리한다. 테스트 fixture는 이 operation으로 합성
damage/block/exile 사례를 정의한다. **21개 production 효과의 의미와 밸런스는 구현 완료가 아니며 이
registry에 아직 주입되지 않았다.** T023은 dispatch 경계와 원자 실행만 제공한다.

카드는 `cardId` 정의와 `instanceId` 인스턴스를 분리한다. 같은 `cardId` 인스턴스가 여러 장 존재할 수
있지만 `instanceId`는 유일하다. deck, hand, discard, exile은 instance id만 저장하고 모든 인스턴스는 정확히
한 zone에 있어야 한다. `validateCombatState`는 T024 persistence가 역직렬화 결과를 원자 교체하기 전에 이
불변식을 검증하는 공개 seam이다.

## 적 intent와 대상

intent는 stable unique `intentId`, 한국어 label, `ATTACK | DEFEND | SPECIAL` telegraph,
nullable `displayAmount`, 실제 `program.operations`를 분리한다. 화면 표시 숫자는 실행 의미가 아니다.
`SPECIAL`도 동일 operation 배열을 사용하므로 roster나 AI 의미를 현재 API에 고정하지 않고 operation
union을 이후 additive하게 확장할 수 있다.

대상은 `{ kind: "PLAYER" }` 또는 `{ kind: "ENEMY", enemyId }`의 판별 union이다. 카드 program은 target이
없는지, 필수인지와 허용 대상을 선언한다. operation은 고정 대상 또는 그 검증된 선택 대상만 참조한다.
optional raw string target은 사용하지 않는다.

## draw, PRNG, replay

deck 배열의 index 0이 top이다. 초기 deck 순서는 그대로 보존한다. 필요한 draw 중 deck이 비었을 때만
discard 전체를 한 번 shuffle하여 새 deck으로 만들며, 둘 다 비면 조용히 멈춘다. shuffle은 고정
`fictor-splitmix32-fisher-yates-v2` uint32 PRNG와 Fisher–Yates를 사용한다. state increment 뒤 avalanche로
output을 섞고, bounded 값은 2^32 구간의 불완전한 꼬리를 rejection한 뒤 산출하므로 low-bit parity나
modulo bias를 shuffle index에 전달하지 않는다. 전역 상태나 외부 entropy는 없다.

replay는 다음 버전을 기록한다.

- state schema: `combat-state-v2`
- replay schema: `combat-replay-v2`
- engine: `combat-engine-v2`
- PRNG: `fictor-splitmix32-fisher-yates-v2`
- hash: `fnv1a32-v1`

초기 setup/state, 명령, 매 step의 state/events를 모두 저장한다. canonical serializer는 object key를
재귀 정렬하며 배열 순서는 보존한다. FNV-1a32 hash는 결정론 회귀 탐지용이지 보안·무결성 서명이 아니다.

## 불변식, rollback, 후속 seam

입력 setup/state/command와 반환 state/events/replay 사이에는 mutable alias가 없다. 명령은 state 검증,
대상·에너지·공명 계산, program 전체 실행을 작업 복사본에서 마친 뒤에만 성공 결과를 반환한다. 어느
operation에서든 검증 또는 overflow가 실패하면 원본과 deep-equal인 새 상태와 단일 rejection event를
반환한다. 이 rollback 규칙이 T024의 저장 교체와 replay 재현의 기반이다.

공개 boundary는 타입 표기만 신뢰하지 않는다. setup/state/command와 모든 nested record는 정확한 own data
property allowlist를 가져야 하며 `Object.prototype` 또는 null prototype만 허용한다. 배열은
`Array.prototype`, dense index와 `length`만 허용한다. 상속 필드, accessor, symbol, extra callback/function,
sparse array와 array custom property는 거부한다. null-prototype record는 허용하지만 canonical clone은
ordinary 안전 객체로 만든다. descriptor를 통해 검증·복사하므로 getter를 실행하지 않는다.

malformed state의 `reduceCombat` 결과는 `{ state: null, events: [INVALID_STATE/UNKNOWN] }`인 별도 boundary
failure다. invalid state를 clone하지 않는다. state가 유효하고 command만 malformed이면 canonical state의
deep-equal 복사와 `INVALID_COMMAND/UNKNOWN` event를 반환한다. unknown command는 `END_TURN`으로 fallthrough하지
않는다. malformed setup은 `CombatValidationError`, malformed replay command 배열은
`CombatReplayValidationError`를 던진다. 둘 다 typed fail-closed 오류다.

root domain API는 create/reduce/validate/replay, versions/constants와 공개 types만 노출한다. PRNG vectors,
bounded sampler, canonical serializer와 FNV 구현은 회귀 테스트 가능한 internal module이지만 제품 API는 아니다.

T024는 `validateCombatState`와 version 필드로 atomic persistence를 연결한다. T026은 injected rules의
block retention과 공명 adapter/정책을 확장한다. 즉석/공방 빚기 수명, UI, 종족 변주, enemy roster/AI,
production 21효과 의미와 최종 밸런스 수치는 이 문서와 T023 구현 범위 밖이다.
