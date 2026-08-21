# T044 승인 밸런스 적용 증거

상태: **최종 검증 및 독립 리뷰 승인 완료**

Task: T044 / Issue #46

승인 권한은 [`t043-approved-values-2026-08-21.json`](t043-approved-values-2026-08-21.json) 하나다.
파일 SHA-256은 `1b97e425bd857279f48470c2b59681b012935e6f7d45cf97e7c46b567a9ba086`이며
T044에서 수정하지 않았다.

## 적용 범위

- 전역 계수: `SAME_BONUS=1`, `COST_DIVISOR=3`, `RESONANCE_RATE=0.08`
- 재료 52개: 승인된 `potency`, `cost_base`, `balance_status=APPROVED`
- Law 21개: 승인된 속성쌍·`combat_effect`의 `power_coefficient`, `balance_status=APPROVED`
- 비장비 canonical 카드 1,281개: 기존 수식으로만 재계산하고 모두 `APPROVED`
- 장비 45개: item 의미는 유지하고 envelope의 source binding만 변경
- 브라우저 resolver packet과 Track 1 공명률: 같은 전역 상수를 참조

카드별 예외, 새 `combat_effect`, result class, 스키마, 알고리즘, 연료 규칙, 적/기본 재료 전투 literal,
provisional config 식별자·상태는 변경하지 않았다.

## 해시 전이

| 대상 | 이전 | T044 |
|---|---|---|
| canonical source / `FORGE_RUNTIME_SOURCE_HASH` | `7e05e02b3db844ccba7806067e196d0e4477ea4f7ce2c661440ea3820d87d720` | `be7a99ea52ecd92438ca8171e4d9d397ff68e56cc9ac59b6b33b9b78dc5446de` |
| cards content | `283054dfb4e97d4f3420d0711ff7affb0dd2afe9d6140b81c6e77ce71b2c2886` | `64be1dfff7c218620ab2aa69708331d59e928eecdacf089b50226af68fbae741` |
| cards file | `71eb299228432f906edc0423f6dc5b90ea546e886f0bf12e7a7ebac6ace6f84f` | `5f7511623cd1b1890da3dcb8fc85a09deb4909fb713b284805bed3d0962eea9b` |
| equipment content | `2d363142278173cd34d8dc40faa0fbeb3e918a818e2bedd407ee8084911a8aa7` | `2d363142278173cd34d8dc40faa0fbeb3e918a818e2bedd407ee8084911a8aa7` |
| equipment file | `cbe939c14cda4b63202644e9038482e1d218fa17b7077057bb97c7800448d61d` | `ad05a1d0384b67a417bc52e6b9f0f709c809c4d33e6888e2eee474a4646bcabb` |
| runtime minimal projection | `869c470001baddb984d16e1b059734e987d47a65baaa0ab2b7fba6cb58137a14` | `2f33edbd6c2ef0aa05a2a012cab42a2d230fcf1b330a1f53005c79c4743293b2` |

## 역사 증거와 fail-closed bridge

M1 기록과 이름 승인 파일은 현재 카탈로그로 재지정하지 않았다.

- `docs/milestones/m1-phase-0-data.json`: SHA-256
  `6dfea2df7af21df4ed991de63d3d331f356def10caec48a069c4a44394470f8a`
- `docs/reviews/name-review.decisions.json`: SHA-256
  `de7466939821bdf973c3431332234fcd6ad2fcfe82b49364da3ab0919be9f9cb`
- 현재 이름 1,326개 projection: `92a963544860dab6db3d9e3e8ccf8f33bdf6668e1b145a9eed0e19b0476b2e55`
- review rows / CSV: `abe566ce68c9f7abf1b094f88931227bf3fa6c5cd59d0aba52aaeee30f8ee328` /
  `53543dac48d591402890bc498463ce6353876efb558bc383822b9c2c0702b960`

`T044_BALANCE_REBIND` 검사는 과거 decision target과 bytes를 먼저 검증하고, 별도로 현재 이름 projection이
그 승인 이름과 동일한지 확인한다. 현재 M1을 새 source/catalog에 맞춰 갱신하거나 재승인했다고 표시하지
않는다. 고정된 T044 target 이외의 후속 source/catalog 변경은 자동 승계하지 않고 실패한다.

에셋 계획 `assets/manifests/core-v1.plan.json`도 downstream 유료 아트 승인에 묶인 역사 증거이므로 재생성하지
않았다. SHA-256 `54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f`의 계획과
현재 계산 계획이 `source_hashes`를 제외하고 canonical하게 완전히 같을 때만 `gen:assets:check`의
`T044_BALANCE_REBIND`가 통과한다. 과거 4개 source hash, T044 현재 4개 source hash, T043 승인 artifact와
빈 카드 예외·구조 변경 금지를 모두 별도로 고정한다. `gen`, `run-fake`, 승인 및 유료 실행 경로에는 이
bridge를 적용하지 않는다.

최종 Vitest에서 드러난 T013/T016 역사 검증도 같은 원칙으로 보정했다. T013 재료 계획
`assets/manifests/materials-v1.plan.json`은 SHA-256
`22cc0b976501b6d2f9fc0df5d584e891c214ec0c4da4797ddcbf8b98c86b7611` 그대로이며, 재료 source의
과거/현재 SHA-256 `c1ce53ac...7931` / `60726663...d8c`와 승인된 세 필드
(`balance_status`, `potency`, `cost_base`)를 뺀 안정 projection SHA-256
`2b57d9b7838a929fde8355495595b1974c500b72dcd14a1ed40628d4a895340d`를 모두 고정한다.
`assets:materials:v1:check`만 이 bridge를 사용하고 `gen`, disclosure/approval 및 paid ops는 기존 strict
source pin을 유지한다.

T016은 과거 구현 binding 자체가 contract/selection/preparation 코드를 고정하므로 그 파일을 수정하지
않았다. 별도 읽기 전용 T044 검사에서 selection / plan / pending / implementation binding SHA-256
`6eab6fe7...2c4c` / `e3925eb0...044e` / `ce1d656b...cd56` / `2489ab80...aa8`을 먼저 확인한다.
현재 재파생 selection은 과거 selection에서 `inputs.materials.sha256`만 다르고, 이를 뺀 selection
projection SHA-256은 `73dbf89632a7a12603426c7741c2eddbf92e2bafc61bbabcf973571e267b3fca`로 동일하다.
52개 재료의 비밸런스 projection, 선택된 160개 id·path·bucket, core prompt와 effective prompt도 모두
일치해야 한다. 과거 T016 gen/dry-run/disclosure/approval/production 경로는 strict 상태이며 과거 승인을
현재 source에 재지정하지 않는다.

## 문서 영향

`docs/save-schema.md`의 literal source hash를 갱신하고, T044 이전 저장의 fail-closed 무효화, 명시적 reset,
복구 불가능한 profile 손실과 코드 rollback 시 역방향 비호환 위험을 기록했다. T042 제안, T043 결정 문서와
승인 JSON은 역사 증거이므로 변경하지 않았다.

## 검증

- `npm run gen:data`: 1,326 cards / 45 equipment 생성, source hash `be7a99...46de`
- `npm run gen:data:check`: 결정론적 bytes 확인
- `npm run gen:assets:check`: immutable core plan을 `T044_BALANCE_REBIND`로 확인
- `npx tsx scripts/gen-browser-runtime-packet.ts --check`: 브라우저 packet freshness 확인
- `npm run review:names:check -- --require-closed`: `T044_BALANCE_REBIND`, 1,326행 closed 확인
- `npm run milestone:phase0:check`: immutable M1과 별도 T044 application projection 확인
- 집중 Vitest: T044 승인 bridge, source/generator/browser/runtime/persistence/race/reachability 회귀 확인

생성 결과는 cards file `5f7511...a9b`, equipment file `ad05a1...abb`, browser packet file
`47d791...a1e`이며 packet fingerprint는 `0b793546`이다. 첫 집중 Vitest 실행은 13개 파일 131개 중
117개가 통과하고 14개가 실패했다. 원인은 승인 상태로 바뀐 source expectation 2건, T044 current source
byte drift 미검출 1건, resolver tuning이 빠진 Track 1 test context 11건이었다. 해당 범위만 수정한 뒤 실패
suite와 직접 영향 application session을 재실행해 4개 파일 44개가 모두 통과했다. 별도로 T042 역사 시뮬레이션
회귀 4개도 모두 통과했다. 최종 verify에서 발견된 immutable core asset plan의 역사적 source binding은
`gen:assets:check`로 1,494개 에셋·126개 배치와 `T044_BALANCE_REBIND`를 확인했고, asset manifest 집중
테스트 7개가 모두 통과했다.

그 다음 전체 Vitest 시도에서 T013 19건은 승인된 재료 source hash 전이, T016 setup은 selection의
재료 input hash 전이 때문에 실패했다. 과거/현재 재료에서 승인된 세 필드만 제거한 canonical projection과
T016 selection에서 그 input hash만 제거한 projection을 비교한 결과 모두 byte-equivalent였고, art·path·id·
bucket drift는 없었다. 비밸런스 `art` 변조는 stable projection에서, 승인 필드의 미고정 변조는 current source
hash에서 각각 실패하는 tamper 회귀를 추가했다. 최초 보정 후 세 suite 73개 중 71개가 통과했고, 남은 2건은
격리된 T016 disclosure fixture가 의도와 달리 역사 selection을 strict 신규-plan 경로에 넣은 테스트 준비
문제였다. 해당 fixture에서만 현재 selection을 엄격 재파생한 뒤 T016 43개가 모두 통과했다. T013 check-only
명령도 역사 계획 SHA와 `T044_BALANCE_REBIND`를 확인했다.

Joinkin 실패는 공명 로직 결함이 아니었다. 기본 power 10과 승인된 `RESONANCE_RATE=0.08`에 기존 수식
`power × (1 + streak × rate)`를 적용하면 streak 1/2/3은 정확히 10.8/11.6/12.4다. 이전 11/12/13
expectation만 과거 0.10 값을 담고 있어 이를 갱신했다. 실패한 시도와 수정 결과를 포함하며, 전체 suite 성공을
주장한 시점은 보정 전이었다. 최종 후보에서는 `npm run verify`가 성공했고 Vitest 69개 파일·868개 테스트가
전부 통과했다. `tsc -b && vite build`와 정적 smoke도 성공했으며 Stillkin·Burnkin·Joinkin의 보스 승리와
재시작, 621개 요청 에셋의 HTTP 200·hash 일치, 브라우저 오류·실패 응답·외부 API/WebSocket 요청 0을
확인했다.

수동 spot play는 기존 저장을 지우지 않기 위해 별도 `localhost` origin의 새 프로필에서 수행했다. 사름붙이로
첫 전투에 진입해 기본 power 10 카드를 한 장 사용했을 때 적 체력이 `30 → 18.4`로 줄어 승인된 Burnkin
공명률 `0.16`의 첫 공격 `11.6`이 렌더링된 앱에 반영됨을 확인했고 콘솔 오류·경고는 0이었다. T044 이전
source hash의 기존 저장은 다른 origin에서 원본 bytes를 보존한 채 의도대로 fail-closed됐다.

독립 high-risk 리뷰는 차단 finding 없이 `APPROVED`였으며, 문서 영향·저장 무효화·rollback 비호환과
역사 원장의 check-only/read-only bridge 경계를 충족했다고 판정했다.

## 잔여 위험과 롤백

- 추가 다섯 터와 21개 효과 의미의 실제 런타임 구현은 이번 값 적용 범위 밖이다.
- 수치는 T043 승인 그대로이며 새 플레이테스트나 카드별 보정은 하지 않았다.
- source hash 변경으로 이전 저장은 자동 로드되지 않는다. reset 전 원본 bytes는 보존되지만 reset 후에는
  도감·심장·런을 복구할 수 없다.
- 코드 rollback은 T044 이후 저장을 읽지 못한다. 배포 rollback이 필요하면 저장 호환성 정책을 별도로
  결정해야 한다.
