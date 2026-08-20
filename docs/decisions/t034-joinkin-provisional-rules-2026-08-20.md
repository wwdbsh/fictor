# T034 Joinkin provisional execution packet

Status: `PROVISIONAL_T034_NOT_FINAL_BALANCE`

Contract: Issue #36 / `41895166ffdda0f6129a2806dee4b36b1e0eba5233a28f654affe2e76642e52e`

T034는 이음붙이의 구조를 기존 어름 Track 1에서 실행 가능하게 만든다. 이 결정은
`SAME_BONUS`, `COST_DIVISOR`, `power_coefficient`, `RESONANCE_RATE` 또는 적·카드 수치의 최종 승인이
아니다. 전투 수치는 T027의 provisional packet을 그대로 재사용한다.

## 세 장 빚기

- 첫 두 재료 A/B는 순서 없는 canonical pair다. `makeTier2(A,B)`가 만든 기존 card id, recipe id,
  이름, 효과, 아트를 그대로 쓴다.
- 세 번째 C는 별도 역할이다. C의 주 속성만 결과 인스턴스의 공명 속성을 덮는다. 도구의 `NONE`은
  기본 결과 공명을 보존한다. C는 도감 recipe나 새 카드 종류를 만들지 않는다.
- A/B가 모두 도구인 `EQUIPMENT` base, 중복 instance, 중복 material definition은 전체 거부한다.
- 즉석 빚기는 세 재료를 전투 동안 한 번씩 격리하고 결과를 전투 종료 때 제거한 뒤 세 재료를 한 번씩
  복구한다. 유료/무료 공방은 세 재료를 영구 소모하고 결과를 영구 편입한다. 무료 공방은 entitlement만
  한 번 쓰고 연료를 바꾸지 않는다.
- 모든 성공은 controller revision, ForgeRuntime revision, instance sequence, discovery, 비용, 저장 CAS를
  하나의 application transaction으로 처리한다. 중간 Tier2 instance는 어느 state/event에도 나타나지 않는다.

## 이어붙이기와 공명

`이어붙이기`는 Joinkin 전용이며 플레이어 행동 단계에서 기본 빚기 행동이 1 남았을 때만 1→2로 늘린다.
턴당 한 번이고 별도 에너지나 빚기 행동을 쓰지 않는다. 추가분은 `END_TURN`과 terminal에서 만료하며 다음
턴은 다시 1에서 시작한다. Stillkin/Burnkin 명령 경계는 이 명령을 원자적으로 거부한다.

JOIN 공명은 bridge다. 활성 속성이 없으면 JOIN이 streak 1을 열고, A 뒤의 JOIN은 A streak를 이어 bridge를
연다. 반복 JOIN도 같은 streak를 잇는다. 열린 bridge 뒤의 첫 non-JOIN B는 같은 streak의 다음 수가 되고
active 속성을 B로 바꾼 뒤 bridge를 닫는다. controller가 전투 계산 전에 유효 속성을 정하므로
`RESONANCE_ADVANCED`와 effective power가 같은 의미를 기록한다. 기본 전투 reducer와 다른 종족의 전이는
변경하지 않는다.

## 시작 덱, 저장, UI

시작 덱 30장은 `ore_join`, `join_01..05`를 순환해 만든 결속 재료 20장과 `tool_01..10` 한 장씩이다.
Joinkin은 `fictor.joinkin.save.v2`, `joinkin-track1-provisional-v1`, `joinkin-track1-ice-v1`을 사용한다.
Stillkin/Burnkin 저장 키와 config/scenario hash는 바꾸지 않는다. 세 번째 overlay와 grouped provenance는
Joinkin state에만 기록하고, 해당 필드가 없는 기존 pair save는 계속 decode한다.

UI는 기본 A/B 두 슬롯과 세 번째 공명 슬롯을 구분하며 C의 실제 overlay 또는 `기본 결과 공명 유지`를
preview와 영구 소모 확인 dialog에 표시한다. 도감은 계속 canonical 1,326개와 base recipe/art만 보여준다.
현재 종족별 profile은 분리되어 있어 발견 recipe와 심장을 자동 공유하지 않는다. Joinkin은 도구 10개를
모두 시작 소유하므로 어름 엘리트의 이미 소유한 도구 보상은 선택할 수 없고 함께 제시되는 기괴 산물을
선택해야 한다. 전역 profile 통합과 보상 후보 재구성은 T034 범위 밖이다.
