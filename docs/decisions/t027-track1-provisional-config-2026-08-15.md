# T027 Track-1 provisional config — 2026-08-15

상태: `PROVISIONAL_USER_DIRECTION_2026_08_15`

literal 요청 경계 hash: `dcbd69c50f569efe75e5a0c72550dc4aa6ef76e1f9964199f010b9078792ed99`

- config hash: `6a740cfa39d3f340041f524836a51f8296fb87382890c997926ee8305d70aa94`
- scenario hash: `07e2ad9be7f84dc1e3682aa81e2cec3c98e8f3192abfa01210938391f64ce913`

이 값들은 2026-08-21 최종 밸런스 gate를 앞당겨 승인한 값도, 개별 exact value에 대한 사용자 승인도
아니다. 2026-08-15의 “literal T027를 지금 진행” 방향 아래 controller가 선택한 provisional execution
packet이다. 코드의 단일 원본은 `STILLKIN_TRACK1_PROVISIONAL_CONFIG`이고, scenario/config hash가
save와 snapshot에 기록된다.

| 항목 | 값 |
|---|---|
| 시작 fuel / HP | 4 / 30 |
| 유료 공방 / FICTOR | fuel 1 / fuel 1 |
| CACHE | `still_03`, `still_04` |
| COLLAPSE | xorshift32 1회, 성공 1/2 `still_05`, 실패 HP -5 |
| RECORD / ODDITY / heart | `ore_still\|still_01` / `odd_06` / `heart__still` |
| 전투 | energy 3, draw 4, resonance 0.1, material cost 1/power 10 |
| 일반 | HP 30, attack 3 |
| 엘리트 | HP 45, charge/charge/release 7 |
| 보스 | HP 60, TOTAL_STOP block 15 / attack 5 |

시작 덱은 `ore_still`, `still_01` … `still_05` 각각 5장, 총 30장이다. unique tool은 없다.
모든 provisional card definition은 기존 shared `DELAYED_EXPLOSION` effect program 하나를 재사용한다.
카드별 고유 능력은 만들지 않는다. Stillkin의 block retention 1/2 정책을 그대로 적용한다.

route와 choice는 `docs/game-flow.md`에 기록한다. `heartForge`는 이 계약에서도 false다.
