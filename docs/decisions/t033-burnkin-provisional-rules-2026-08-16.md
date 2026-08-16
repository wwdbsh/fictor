# T033 Burnkin provisional execution packet

Status: `PROVISIONAL_T033_NOT_FINAL_BALANCE`

Contract: Issue #35 / `840ed0dcd20f76647f28e0bfc1f9fbf0ceae55f9f9fac5adb8744dea9c5dfae5`

T033은 Burnkin 규칙 구조를 기존 어름 수직 슬라이스에서 실행 가능하게 만든다. 상헌 님의 T032 GO는
T033 착수를 허용했지만 최종 밸런스 값을 승인하지 않았다. 따라서 아래 두 값은 테스트와 플레이 후보를
만들기 위한 controller-owned provisional 값이며 최종 밸런스가 아니다.

- 체력 1을 지불해 에너지 1을 얻는다. 지불 뒤 체력이 최소 1 남아야 한다.
- 공명이 다른 속성으로 끊기면 체력에 직접 1 피해를 받는다.

공명률은 새 독립 숫자가 아니라 T027 provisional 공명률의 정확한 2배다. 지피기는 별도 계수를 쓰지 않고
선택한 손패 카드의 확정 코스트를 그대로 에너지로 바꾼다. 에너지가 `maxEnergy`를 넘는 행동은 전체
거부한다. 시작 덱은 기존 provisional 30장 구조를 그대로 사용하되 `ore_burn`, `burn_01..05`를 각각
5장씩 넣어 점화 편중을 만든다.

이 packet은 `SAME_BONUS`, `COST_DIVISOR`, `power_coefficient`, `RESONANCE_RATE`의 최종 승인이나
사름의 터·Joinkin 구현을 포함하지 않는다. 후속 플레이에서 값이 바뀌면 이 문서와
`BURNKIN_TRACK1_CONFIG_HASH`를 함께 갱신하고 저장 호환 여부를 명시해야 한다.

## 원자성과 사망 경계

- 체력 지불, 에너지 증가, 지피기 카드 이동은 후보 전투 상태에서 모두 검증된 뒤 한 번에 저장된다.
- 체력이 부족하거나 에너지 상한을 넘거나 카드가 손에 없으면 HP·energy·zone·revision이 모두 그대로다.
- 공명 단절 피해로 HP가 0이 되면 같은 command에서 전투가 `DEFEAT/TERMINAL`이 되고 즉석 빚기 cleanup,
  런 패배, 저장까지 하나의 controller transaction으로 처리한다.
- Burnkin은 일반 block 잔존 `0/1`; Stillkin의 고유 `1/2 FLOOR`를 상속하지 않는다.

## 저장·선택 경계

Stillkin 기존 저장 키 `fictor.save.v2`와 기존 config/scenario hash는 변경하지 않는다. Burnkin은
`fictor.burnkin.save.v2`와 별도 config/scenario hash를 사용한다. 브라우저의 `fictor.race.v1`은 어느
controller를 열지 고르는 작은 선택 기록이며 게임 상태 권한은 각 controller envelope에 있다. 기존
Stillkin v2 사용자는 선택 기록이 없어도 Stillkin 런을 그대로 연다.

현재 두 envelope는 각각 profile을 포함하므로 발견 레시피와 심장은 종족 사이에 자동 공유되지 않는다.
종족을 바꿔도 어느 저장도 삭제하지 않지만, 전역 profile 통합은 이번 Task 범위 밖의 후속 저장 마이그레이션
과제다.
