# T016 canonical 선별 카드 — 유료 실행 준비 기록 (2026-08-14)

Issue #18 / contract sha256 `ecdba1e3f0a94c7b25d8e61f3ab07c9d4e82f5163b0da97e4c1852f6bd390a7e`.
이 문서는 **준비 단계**만 기록한다. provider 호출 0건, 공시·승인 체인은 `pending approval`.
**계획의 마지막 유료 Task이며, 지금까지 중 가장 큰 실행이다.**

## 1. 선별 — 이 사이클의 실제 결정

고정 원본 `assets/manifests/core-v1.plan.json` (sha256 `54e3af3f…3fd0c`).
canonical 조합은 전부 1,326개, T015가 앞의 332개를 이미 만들었으므로 후보는 **994개**.
그중 **160개**를 고른다.

**계약이 요구한 것은 노출 빈도 점수였고, 그 데이터는 저장소에 없다.** Phase A에서 확인한
사실만 적는다.

| 필요한 입력 | 저장소 상태 |
|---|---|
| 3종족 정의·시작 덱 | 없음 |
| 터별 재료 드랍 풀 | 없음 |
| 재료 `potency`, `cost_base` | 52개 **전부** null |
| 재료 `rarity` | 52개 중 30개 null (`PENDING_DEPTH_CLASSIFICATION`) |
| 재료 `balance_status` | 52개 전부 `PENDING_2026_08_21` |

rarity만으로 점수를 만들면 후보 994개 중 **763개(76.8%)** 가 신호 없는 재료를 최소 하나
포함하고 257개는 양쪽 다 신호가 없다. 그리고 balance 확정일 **2026-08-21 > credits 만료
2026-08-17** 이므로 기다리는 선택지는 산술적으로 닫혀 있다. 가중치를 지어내지 않았다.

**채택: 커버리지 선별 (Option C).** 후보를 재료 origin 쌍 기준 35개 버킷으로 나누고 160석을
버킷 크기에 비례해 **정수 최대잉여법**으로 배분한 뒤, 버킷 내부는 manifest 순서로 채운다.
잉여 동률은 그 버킷의 첫 후보가 manifest에 등장하는 위치로 정한다(전순서라 재현 가능).
부동소수점은 쓰지 않는다 — 반올림 모드에 따라 결과가 달라지는 규칙은 재현 가능하지 않고,
이 규칙의 출력이 곧 결제 대상이다.

**기각한 대안 (산출물에 이유와 함께 기록).**

| 대안 | 기각 사유 |
|---|---|
| A. manifest 순서로 앞 160개 | 중립처럼 보이지만 join_03/04/05가 각 44회, join_01은 0회. **BURN 그룹 재료 6종 중 burn_01~05는 0회이고 그룹 전체 등장 4회가 전부 ore_burn 하나를 통해서만 발생** — 여섯 터가 대칭인 게임에서 BURN 터가 재료 한 종으로만 대표된다(BURN 카드 4장). 채택 규칙에서는 BURN 6장, 44회 편중 소멸 |
| B. 실제 빈도 데이터 확정까지 대기 | 2026-08-21 > 2026-08-17, 날짜로 봉쇄됨 |

**결과.** 35개 버킷 중 **34개**가 최소 한 석을 받는다(무석 버킷은 `BURN x JOIN` 하나).
출신별 대표 수는 BURN 6 / JOIN 28 / ODDITY 43 / ROT 43 / SCATTER 43 / STILL 43 / TOOL 71 /
WASH 43 (카드 한 장이 두 출신에 기여하므로 합은 320 = 160 × 2).

**BURN이 낮은 것은 규칙이 만든 편향이 아니다.** T015가 BURN 조합을 이미 대부분 가져가서 남은
후보에 BURN 쌍이 적다 — 데이터에 내재한 비대칭이고, 규칙은 그것을 만들지도 감추지도 않는다.

**이 선별이 보장하지 않는 것도 공시에 적었다.** 보장은 **그룹 단위**이고 **쌍(버킷) 단위가
아니다.** `BURN x JOIN` 버킷은 후보가 4개뿐이라 비례 배분에서 0석을 받는다 — BURN 재료와
JOIN 재료를 함께 쓴 카드는 이번 160장에 한 장도 없다. 승인자가 나중에 발견할 일이 아니라
공시 (v)에서 미리 읽어야 하는 사실이다.

**산출물:** `assets/manifests/t016-canonical-selection-v1.json`
- artifact sha256 `6eab6fe7b563973a82eff3f98447eced4c3b462f360c4e6d048afb8f735e2c4c`
- selection list sha256 `d161c90456757ca5f00957b563fd80ace2b3e9a19a0fa5d03e61675e37d264f0`
- 첫 id `forge__join_02__wash_02`, 끝 id `forge__tool_01__tool_08`
- `selection_kind: "COVERAGE_NOT_FREQUENCY"` 를 산출물 표면에 기록
- 두 해시(artifact/list)는 **packet과 presentation에도 직접 실린다** — 승인자가 무엇에
  동의하는지 확인하려고 다른 파일을 열 필요가 없어야 한다

산출물 재생성 명령은 `preparation selection-gen`이다. 설계 단계에서 한 번 손으로 만들어졌던
탓에 이 Task에서 가장 계약-결정적인 파일에 재현 경로가 없었다 — 리뷰 후 추가했고, 빈 루트에서
재생성하면 커밋된 바이트와 정확히 일치한다(테스트가 확인한다).

산출물은 고정 manifest와 materials에서 **매 로드마다 다시 파생**되어 바이트 비교된다.
따라서 산출물만 손대는 조작(개수·형식이 전부 유효한 id 한 개 교체)도 통과하지 못한다.
선별 모듈 자체도 implementation binding에 고정되므로, 승인 후 규칙을 고치면 binding →
plan sha → packet이 전부 바뀐다. 승인을 조용히 다른 160장으로 돌릴 수 없다.

## 2. 배치·경제

- **160장 = 12장 × 13배치 + 4장 1배치 = 14배치.** 전부 3:4 (994 후보 전수 확인)
- 상한 **240.00** (1.50 × 160), 자동 유료 재시도 예산 0
- 모호 제출 구간 14회, **한 구간 최대 노출 18.00**
- 종횡비는 **3:4 5,000ppm만 선언**, 미선언 종횡비는 조회 시 예외
- 누적 예산: 잔액 243.90 − 상한 240.00 = **여유 3.90**, 후속 유료 Task **없음**

**마지막 Task라서 달라지는 것.** 이전 Task들의 공시는 "손실이 나면 다음 Task 범위를 줄인다"
였다. 여기엔 다음이 없다. 배치 하나(12장, 18.00)를 잃으면 그 12장은 이 승인으로 다시 만들지
않고 실행은 **148장으로 마감**된다. 일반화하면 **잃은 1.50마다 카드 한 장**이 준다. 여유
3.90은 가장 작은 손실 단위(4장 배치 6.00)조차 메우지 못한다 — 계획 필드
`headroom_covers_smallest_batch_loss: false` 가 그것을 명시한다.

## 3. 파생 산출물과 해시

| 항목 | 값 |
|---|---|
| plan | `assets/manifests/t016-canonical-cards-v1.plan.json` |
| selection artifact sha256 | `6eab6fe7b563973a82eff3f98447eced4c3b462f360c4e6d048afb8f735e2c4c` |
| selection list sha256 | `d161c90456757ca5f00957b563fd80ace2b3e9a19a0fa5d03e61675e37d264f0` |
| plan sha256 | `e3925eb033eb852ac8f1e7f8765991ae749a9c508c8aee48601d58bd4a61044e` |
| pending packet sha256 | `ce1d656be34cecb0b2e75a10120271fa2798a6f7aba4ade0cc9e92980323cd56` |
| implementation binding sha256 | `2489ab80ff53d58e7958804dd6af7f751879772bb3d92e282b89497e46a9daa8` (11 files) |
| 승인 문구 | `T016 canonical 선별 카드 160장 생성을 승인한다. 한도 240.00 크레딧.` |

런타임: `scripts/assets/t016-canonical-cards-production-v1{,-ops,-cli,-controller}.ts` +
`scripts/assets/t016-canonical-selection-v1.ts`.
진입점은 npm 스크립트가 아니라
`npx tsx scripts/assets/t016-canonical-cards-production-v1-controller.ts`.

## 4. 운영 runbook 주의사항

명령 형식·순서는 T020/T021/T019와 동일하다(`init` → 배치마다 `preflight-request` →
`preflight-result` → `prepare`(첫 지출) → `response` → `recovery-open` → `jobs-handoff` →
`balance-after` → 마지막에 `audit`). **배치가 14개이므로 그 루프를 14번 돈다.**

**네 주인을 가진 디렉터리 — `public/assets/cards/`.** T019가 두 주인 사례를 열었고 여기는
넷이다: T015의 canonical 332장, T013의 재료 52장, T019의 심장 6장, 그리고 이번 160장(현재
디스크 390장). T019 준비 문서가 정한 세 조건을 그대로 확인했다.

- **이름 분리** — 이번 160장은 전부 선별 산출물에 고정된 새 경로이며, 기존 390장의 경로
  집합과 교집합이 없다(테스트가 manifest 전체와 대조한다).
- **무클로버 저장** — 같은 경로에 내용이 다른 파일이 있으면 정지한다.
- **Task 전용 백업 루트** — `assets/backups/t016-canonical-cards/`. 감사 시 계획 밖 경로가
  거기 있으면 실패하며, 여기서 "계획 밖"에는 **선별되지 않은 canonical 834장도 포함**된다.

## 5. 이번 사이클에 적용한 두 규칙

**(a) 선행 Task 상수 2패스 grep, 리뷰 전에 두 번.** T019에서 채택한 규칙이다. 두 번 돌렸고
잔존 리터럴 **13건**을 리뷰 전에 제거했다. 분류하면:

| 유형 | 건수 | 대표 |
|---|---|---|
| operator에게 도달하는 throw 메시지 | 3 | "requires all 20 event assets", "is not the full 20", "does not close at 81.00" → 전부 상수 보간으로 교체 |
| 감사/증거 필드명 | 2 | `boss_world_art_generated`, `event_art_generated` → `unselected_canonical_generated` 등 |
| 사람이 읽는 HTML 제목 | 1 | contact index `<title>T016 event art` |
| 주석의 숫자·명사 | 6 | "54 assets", "81.00/54-asset", "the 20 event assets" 등 |
| 공시 본문의 숫자 | 1 | `(x)` 절 "T015의 카드 384장" |

숫자를 손으로 쓴 자리는 가능한 한 상수 보간으로 바꿨다.

**세 건은 병합된 T021 코드에 지금도 남아 있다** (`t021-…-ops.ts:81`, `:499`, `:1078`).
셋 다 T019가 자기 사본에서는 고쳤지만 T021은 T020에서 스캐폴드된 뒤 병합돼 수정이 닿지
않았다. `:1078`은 **30.00 Task가 실패 시 "does not close at 81.00"이라고 말하는**
operator-facing throw다. T021의 소스 sha는 COMPLETE 저널을 고정하므로 제자리 수정은 불가능
하다 — 별도 보고했다.

**공시 본문 1건은 T019에서 상속된 사실 오류였다.** T019 공시는 `cards/`에 "T015가 만든 카드
384장"이 있다고 썼다. 실제 384장은 T015의 canonical 332장 + T013의 재료 52장이고, T019
실행 후 390장이 됐다. 그대로 복사했다면 이번 공시는 두 번 틀렸을 것이다(주인 오귀속 + 총계).
승인자가 읽는 문장이므로 실측으로 다시 세어 네 주인과 390장으로 고쳤다.

**(b) 유료 실행 후 전체 스위트 재실행.** 실행이 세계를 바꾼 뒤에만 드러나는 스냅샷 가정이
있는지는 그때만 확인된다. 이번 스위트는 그 계열을 처음부터 피하도록 작성했다(예: "이 경로들은
아직 없다"가 아니라 "이 경로 집합은 다른 어떤 manifest 자산과도 겹치지 않는다").
