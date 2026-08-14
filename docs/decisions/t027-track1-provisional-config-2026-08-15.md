# T027 Track-1 provisional config — 2026-08-15

상태: `PROVISIONAL_USER_DIRECTION_2026_08_15`

literal 요청 경계 hash: `dcbd69c50f569efe75e5a0c72550dc4aa6ef76e1f9964199f010b9078792ed99`

- config hash: `c166cc64b046b60df984302e0c98d73175371e09a5d67f7fe0888256c374171a`
- scenario hash: `1154579a0e310305853639986e53144089a562b2f1bb829d0dbfe37b689a0b9e`

이 값들은 2026-08-21 최종 밸런스 gate를 앞당겨 승인한 값도, 개별 exact value에 대한 사용자 승인도
아니다. 2026-08-15의 “literal T027를 지금 진행” 방향 아래 controller가 선택한 provisional execution
packet이다. 코드의 단일 원본은 `STILLKIN_TRACK1_PROVISIONAL_CONFIG`이고, scenario/config hash가
save와 snapshot에 기록된다.

| 항목 | 값 |
|---|---|
| 시작 fuel / HP | 4 / 30 |
| 유료 공방 / FICTOR | fuel 1 / 유료 choice fuel 1, `fictor-skip` fuel 0 |
| CACHE | `still_03`, `still_04` |
| COLLAPSE | xorshift32 1회, 성공 1/2 `still_05`, 실패 HP -5 |
| RECORD / ODDITY / heart | `ore_still\|still_01` / `odd_06` / `heart__still` |
| 전투 | energy 3, draw 4, resonance 0.1, baseline/forge cost 1·power 10 |
| 일반 | HP 30, attack 3 |
| 엘리트 | HP 45, charge/charge/release 7 |
| 보스 | HP 60, TOTAL_STOP block 15 / attack 5 |

시작 덱은 `ore_still`, `still_01` … `still_05` 각각 5장, 총 30장이다. unique tool은 없다.
raw material 52종은 config에 명시된 provisional baseline `DELAYED_EXPLOSION`/STILL을 사용한다. canonical
LAW/CATALYST forge 결과는 resolver의 exact `combat_effect`와 첫 `effective_attribute`를 보존한다.
`DELAYED_EXPLOSION`은 기존 shared damage program을 사용하고, 나머지 20 effect body는 T023 registry 구현
전까지 shared no-op으로 남긴다. 다른 effect를 damage로 재분류하지 않는다. EQUIPMENT 결과는 owned/deck에
남지만 passive 전투 계약 전에는 combat enrollment에서 제외한다. Stillkin block retention 1/2를 적용한다.

controller는 public caller input이 아닌 enabled content registry의 `GROUND_STILL` descriptor를 실제 조회해
depth, route encounter 종류/ID, 여섯 event type, boss-heart asset 관계를 config와 교차 검증한다.

route와 choice는 `docs/game-flow.md`에 기록한다. `heartForge`는 이 계약에서도 false다.
