# T019 신의 심장 카드 — 실행 기록 (2026-08-14)

Issue #21 / contract sha256 `7c5b1e3d94a2f60c8b3e7d51a9f4c02e6b8d3a175f9e2c48b06d1a73e5c9f284`.
준비 기록은 `t019-heart-cards-preparation-2026-08-14.md`.

## 1. 결론

신의 심장 카드 **6장 전부 확보, 사고 0건.**

| 항목 | 값 |
|---|---|
| 지출 | **9.00** (상한 정확 일치) |
| 잔액 | 252.90 → **243.90** |
| 유료 재시도 / 손실 / 재제출 / fail-stop | 0 / 0.00 / 0 / **0건** |
| 최종 `run_state` | **COMPLETE** (exact closure) |

T021에 이어 두 번째 무사고 실행이다. 배치가 하나뿐이라 노출이 상한 전체였던 만큼,
무사고로 끝난 것이 특히 다행한 결과다.

## 2. 배치 원장

| 배치 | 자산 | before | after | delta | job | 회수 | terminal |
|---|---|---|---|---|---|---|---|
| `heart-cards-001` | 6 | 252.90 | 243.90 | 9.00 | 6 | 6 | 없음 |

delta는 6 × 1.50으로 정확히 일치하고 `charged_job_count`도 6이다. 모델 canary 통과,
provider 계약 드리프트 0건.

## 3. 범위와 검증

여섯 터에 대응하는 심장 6장. 수용 기준이 대조를 요구한 세 가지를 실측 확인했다.

| id | attribute | composition | density | colors |
|---|---|---|---|---|
| `heart__still` | STILL | CELESTIAL | MAX | GOLD+TEAL |
| `heart__burn` | BURN | CELESTIAL | MAX | GOLD+VERMILION |
| `heart__scatter` | SCATTER | CELESTIAL | MAX | GOLD+SULPHUR |
| `heart__rot` | ROT | CELESTIAL | MAX | GOLD+ACID_GREEN |
| `heart__wash` | WASH | CELESTIAL | MAX | GOLD+ULTRAMARINE |
| `heart__join` | JOIN | CELESTIAL | MAX | GOLD+MAGENTA |

**보스 아트 겸용:** T020 계약대로 보스는 별도 세계 아트를 만들지 않고 이 6장을 재사용한다.
6장이 모두 확보되었으므로 여섯 터의 보스 표현도 함께 채워졌다.

**범위 밖:** 심장 빚기(HEART_FORGE) 36종은 예산 재배분으로 미생성이며 런타임 폴백 대상이다.

## 4. 공유 디렉터리 검증 — `public/assets/cards/`

이 실행은 다른 Task가 이미 소유한 디렉터리에 쓴 첫 사례다. 결과는 예측대로였고,
**주장이 아니라 git으로 확인했다.**

- 실행 후 `public/assets/cards/` = 390장 (기존 384 + 신규 6)
- `git status -- public/assets/cards/`: **수정·삭제 0건**, 신규 untracked 6건
- 6장 전부 `heart__` 접두사로 기존 이름과 겹치지 않음
- 백업은 `assets/backups/t019-heart-cards/cards/`에 Task 전용으로 분리

리뷰어의 사전 실측도 같은 결론이었다: `cards/heart__still.png`에 이물 PNG를 심고 실제 유료
경로를 구동하자 `FILE_CONFLICT`로 정지하고 회수 0, 원본 바이트 그대로였다. 가짜 canonical을
백업 루트에 심었을 때도 감사는 그것을 보지 않고 COMPLETE로 닫혔다.

**규칙(준비 문서 runbook에 기재):** 앞으로 같은 디렉터리를 공유하는 Task는 접두사 분리,
무클로버 저장, Task 전용 백업 루트 세 가지를 모두 만족해야 한다. 하나라도 빠지면 다른 Task의
산출물을 덮어쓸 수 있고 그 사고는 감사로 잡히지 않는다.

## 5. 불변식 준수

| 불변식 | 결과 |
|---|---|
| 배치당 제출 1회, 자동 유료 재시도 0 | ✅ |
| 배치 ≤ 12장 | ✅ 6장 |
| `use_unlim: false` | ✅ 6/6 |
| 과금은 `credits_exact`만 | ✅ delta 9.00 = 6 × 1.50 |
| 상한 준수 | ✅ 9.00 정확 일치 |
| 즉시 저장 + 무클로버 이중 저장 | ✅ 6/6 양쪽, sha256 일치 |
| 종횡비 | ✅ 전부 896×1200 = 4445ppm (허용 5000) |
| 모델 canary | ✅ 통과 |
| signed URL/host/raw error 미기록 | ✅ 전수 스캔 0건 |
| 기존 384장 불변 | ✅ git 기준 수정·삭제 0건 |

## 6. 최종 감사

```
run_state COMPLETE, exact_closure true
assets_recovered 6 / assets_planned 6
assets_not_delivered 0, assets_paid_and_lost 0
cap_used 9.00, closes_at_exact_cap true
```

독립 검증(저널을 믿지 않고 파일에서 직접 계산): 6/6 존재, public↔backup sha256 불일치 0,
저널 기록 sha와 불일치 0, 전부 896×1200 / 4445ppm.

contact sheet 링크 검증: index 링크 1개 정상 해석, 이미지 src 6개 중복 없이 전부 존재,
index에 `<img>` 없음. T021에서 고친 상수 파생 방식이 여기서도 그대로 작동했다.

## 7. 고정 샘플 육안 QA

`heart__join` 검수 통과 — CELESTIAL 구성, GOLD+MAGENTA, MAX 밀도, 기념비적 정면 구도.

## 8. 누적 예산

| 항목 | 값 |
|---|---|
| 실행 후 잔액 | **243.90** |
| 남은 계획 (T016) | 240.00 |
| **여유** | **3.90 — 그대로 유지** |

손실이 0이었으므로 공시에서 경고한 시나리오(배치 손실 → 여유 −5.10 → T016 축소)는 발생하지
않았다. **T016은 계획대로 수행 가능하다.** 다만 여유는 여전히 3.90이고 T016이 마지막 유료
Task이므로, 그 실행에서 배치 하나(최대 18.00)를 잃으면 곧바로 범위를 줄여야 한다.

## 9. 배운 것 — 스캐폴딩된 계열의 잔존 리터럴

이 사이클에서 가장 많은 시간을 쓴 결함은 로직이 아니라 **선행 Task에서 복사돼 남은 숫자와
명사**였다. 총 **11건**을 세 라운드에 걸쳐 제거했다.

| 라운드 | 발견자 | 건수 | 대표 사례 |
|---|---|---|---|
| 1 | 나 (빌드 중) | 3 | "20 assets" 파티션 오류, "20 event assets" 감사 오류, contact index 제목 "event art" |
| 2 | 리뷰어 + 나 | 6 | `checkT019BackupScope` 주석 3건, 예산 주석의 "18.00", ops의 T020 계보 주석 2건 |
| 3 | orchestrator diff-check + 나 | 5 | `cumulative_budget` 블록의 "18.00"(패킷 해시 대상), ops의 "does not close at 81.00", 테스트 이름 "closes at exactly 30.00 with all 20 assets" 등 |

**왜 반복해서 놓쳤는가.** 점진적 grep은 "찾아야겠다고 생각한 것"만 찾는다. 2라운드에서
같은 문장의 사본 두 개 중 하나만 고치고 "수정 완료"라고 보고한 것이 대표적이다 — 내가 보던
자리에서는 문자열이 사라졌기 때문이다.

**채택한 규칙(두 번 통과).** 선행 Task의 상수를 **열거해서 한 번에** grep한다
(18.00 / 30.00 / 72.00 / 81.00 / 54 / 48 / 20 / 12), 그다음 **명사로 다시** grep한다
(event art / world art / 배경 / 엘리트 / EPOCH 날짜). 계열의 모든 파일 — 소스, 테스트,
문서 — 을 대상으로, **리뷰 전에** 실행한다.

**가장 값진 표적은 사람에게 도달하는 문자열이다.** `throw new Error(...)` 메시지와 테스트
이름. 주변 코드가 옳기 때문에 눈이 미끄러지는 자리이고, 틀린 숫자가 실제로 해를 끼치는
자리다. 이번에 operator-facing throw 2건과 CI에 출력되는 테스트 이름 1건이 여기 해당했다.
가능한 곳은 숫자를 손으로 쓰지 않고 상수를 보간하도록 바꿨다.

이 규칙은 T016 브리프에 채택되었다.

**같은 사이클에서 한 번 더 걸렸다.** 마감 작업 중 전체 테스트가 460/461로 떨어졌다. 실패한
것은 내가 이 사이클에 직접 쓴 테스트였고, 내용은 "이 6장은 아직 디스크에 없다"였다. 실행 전에는
참이었고 실행이 파일을 쓰는 순간 거짓이 됐다 — **바로 이 문서가 경고하는 스냅샷 테스트 계열**이다.
검사해야 할 불변식은 "아직 없다"가 아니라 "이 6개 경로는 다른 어떤 manifest 자산과도 겹치지
않는다"였다. 그렇게 고쳤다.

교훈이 하나 더 붙는다. 규칙을 문서에 쓰는 것과 그 규칙을 지키는 것은 다른 일이고, 스냅샷
테스트는 *작성 시점에는 언제나 참*이기 때문에 리뷰에서도 통과한다. 잡아낸 것은 리뷰가 아니라
**상태를 바꾼 뒤 다시 돌린 전체 스위트**였다. 유료 실행 뒤에는 반드시 전체 스위트를 다시
돌릴 것 — 실행이 바꾼 세계가 테스트의 가정을 깨뜨렸는지는 그때만 드러난다.

## 10. 증거

- 저널(런타임, gitignore): `assets/runs/t019-heart-cards/operations-v1.json`
- 저널 포렌식 사본: `assets/evidence/t019-heart-cards-v1-final-journal-forensic.json` (`f363fb4e…`)
- 승인 체인 + 배치 operator 증거 일체 `assets/evidence/t019-heart-cards-*`
- 백업 사본은 저장소 정책상 커밋하지 않는다(T015·T020·T021과 동일).
