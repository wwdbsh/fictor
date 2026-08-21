# T043 최종 밸런스 수치 승인

상태: **승인됨 — 미적용**

Task: T043 / Issue #45

계약 해시: `6c8c4fad0e74d50f24d72ba5b3627165fdbefba6c128afbf02e6b7441533cd2a`

상헌 님은 2026-08-21(Asia/Seoul)에 직접 메시지 `A를 최종값으로 승인합니다`로 T042 권장안 A를
최종 수치 집합으로 승인했다. 이 결정의 기계 판독 가능한 전체 21개 Law와 52개 재료 값은
[`../balance/t043-approved-values-2026-08-21.json`](../balance/t043-approved-values-2026-08-21.json)에 있다.

## 근거와 출처

- 원자료: [`../playtests/t042/balance-playtest-raw.json`](../playtests/t042/balance-playtest-raw.json)의
  `/report/proposals/recommended`
- T042 완료 revision: `f75cd45291260d9ca1d1c557e7ac20773378412f`
- T042 evidence SHA-256: `175a9b464e03a2286e38bb236fcc54e1468f855f29a9d2c31f4c1a8867bbe8e3`
- 승인 선택지: `Option A`
- 승인 범위: 세 전역 계수, 21개 Law의 `power_coefficient`, 52개 재료의 `potency`·`cost_base`

## 승인된 전역 계수

| 계수 | 최종값 |
|---|---:|
| `SAME_BONUS` | 1 |
| `COST_DIVISOR` | 3 |
| `RESONANCE_RATE` | 0.08 |

## 승인된 재료 규칙

| 재료군 | 개수 | `potency` | `cost_base` |
|---|---:|---:|---:|
| `ore_{still,burn,scatter,rot,wash,join}` | 6 | 1 | 1 |
| `{still,burn,scat,rot,wash,join}_{01,02}` | 12 | 1 | 1 |
| `{still,burn,scat,rot,wash,join}_{03,04}` | 12 | 2 | 1 |
| `{still,burn,scat,rot,wash,join}_05` | 6 | 3 | 2 |
| `tool_01..10` | 10 | 1 | 0 |
| `odd_01..06` | 6 | 3 | 2 |

21개 Law의 속성쌍, `combat_effect`, 정확한 `power_coefficient`와 52개 재료별 값은 JSON 기록을
완전한 기준으로 삼는다. 카드별 예외는 없고 조합·효과·비용 공식 등 구조 변경도 승인하지 않았다.

## 예상 영향

- 장비를 제외한 일반 Tier2 1,281장의 potency 범위는 2~7, 중앙값은 4다.
- power 범위는 1.5~14, 중앙값은 4, p90은 8이다.
- 비용 분포는 1코스트 633장, 2코스트 641장, 3코스트 7장이다. 3에너지 턴에서 발견 카드를
  같은 턴에 사용할 여지를 유지한다.
- 공명률 0.08에서 중앙 power 4의 streak 5 결과는 Stillkin/Joinkin 5.6, Burnkin 7.2다.

## 수용한 잔여 위험

- 실제 런타임 완주는 세 종족의 `GROUND_STILL` 3회뿐이다. 다른 15개 종족×터 조합은 구조 검증만 됐다.
- 방어·회피·지속 피해·상태 제어와 동일 속성 drawback은 실제 효과 의미로 플레이되지 않았다.
- 사람 플레이 검증이 없으며, 도구 `cost_base: 0`의 악용 가능성과 첫 전투가 너무 짧아 빚기를 사용하지
  못할 가능성이 남아 있다.
- 세 런 모두 연료 4에서 유료 공방 1회 뒤 3으로 끝났으므로, 연료 4의 체감 희소성은 검증되지 않았다.

## T044 적용 경계

T043은 승인과 결정 기록만 완료한다. 이 문서와 JSON의 값은 아직 코드, `materials.json`, `laws.json`,
생성 JSON, 런타임 또는 테스트에 적용되지 않았다. 해당 적용과 재생성·검증은 T044의 별도 범위다.

Docs impact: required — 이 문서는 최종 승인 판단·근거·잔여 위험·적용 경계를 보존하고,
`docs/balance/t043-approved-values-2026-08-21.json`은 T044가 대조할 정확한 승인값을 보존한다.
