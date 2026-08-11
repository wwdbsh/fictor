# Core asset pipeline

T008은 승인된 core 아트 1,494장의 **계획과 안전한 회수 기반**만 제공한다. 실제 Higgsfield/MCP
adapter와 유료 생성은 포함하지 않는다. 현재 실행 가능한 provider는 결정론적 PNG를 반환하는 fake뿐이다.

## 고정 물량과 비용

| 분류 | 구성 | 수량 |
|---|---|---:|
| 카드 | 재료 52 + canonical 1,326 + 신의 심장 6 + 심장 빚기 36 | 1,420 |
| 세계 | 배경 18 + 일반 적 30 + 엘리트 6 + 이벤트 20 | 74 |
| 합계 | 보스 신규 아트 0(심장 6장 재사용) | **1,494** |

단가는 문자열 decimal `0.12`, 합계는 `179.28`이다. 12장씩 전역으로만 채우면 이론상 125
배치지만, 재료 52장 생성 후 사람의 스타일 승인을 받아야 한다. 따라서 제출용 초기 plan은 재료
`12+12+12+12+4`의 5배치와 승인 후 1,442장의 121배치, 총 **126배치**다. 재시도 배치는 이
126개에 포함하지 않는다.

이벤트 20장은 공통 `CACHE`, `WORKSHOP`, `COLLAPSE`, `FICTOR`, `RECORD`, `ODDITY` 6장,
속성별 `CACHE` 6장, 속성별 `ODDITY` 6장, `COLLAPSE`의 `BURN`/`WASH` 변주 2장이다.

## 불변 plan

`assets/manifests/core-v1.plan.json`은 다음 명령으로만 재생성한다.

```bash
npm run gen:assets
npm run gen:assets:check
```

plan은 세 수기 원본과 canonical 카드 생성물의 SHA-256, 모든 asset의 id/path/aspect/prompt와 126개
초기 batch를 기록한다. 같은 입력으로 두 번 생성하면 byte가 같다. 수기 JSON 원본을 추가하지 않으며,
기존 `src/data/source/*`, generated catalog, 게임 runtime을 수정하지 않는다.

ID의 `<attr>`, `<shape>`, `<type>` 토큰은 기존 card id 관례에 맞춰 소문자로 정규화한다.

- `heart__<attr>`
- `heart_forge__<god_attr>__<target_attr>`
- `background__<attr>__depth_01..03`
- `enemy__<attr>__<shape>`
- `elite__<attr>__<adjacent>`
- `event__<type>[__<attr>]`

경로는 POSIX 상대경로 `cards/`, `backgrounds/`, `enemies/`, `events/` 아래 PNG다. 배경만
`16:9`, 나머지는 `3:4`다. 카드·적·이벤트 종이 톤은 asset id의 UTF-8 SHA-256 앞 4바이트를
unsigned big-endian으로 읽은 값 `% 4`이며 순서는 `CREAM`, `OCHRE`, `SCORCHED_BROWN`,
`BLUE_GREY`다. 배경은 터별 고정값을 우선한다: `STILL=BLUE_GREY`, `BURN=SCORCHED_BROWN`,
`SCATTER=CREAM`, `ROT=OCHRE`, `WASH=CREAM`, `JOIN=OCHRE`다.
촉매의 밀도는 새 enum을 만들지 않고 원재료 `material_id`와 `representation`을 prompt 입력에 남긴다.

## mutable run ledger

ledger는 plan과 별도이며 `assets/runs/` 아래에 둔다. 실행 단위는 asset 하나가 아니라 plan의
**batch(1~12장)와 provider job**이다. generation attempt 직전과 job 종료 직후 balance를 decimal
문자열로 checkpoint하고, 성공한 job이 반환한 asset별 opaque remote ref로 파일을 회수한다.

fake smoke에서 evidence를 주지 않으면 최초 재료 52개, 정확히 5개 batch만 처리한다. 사람이 결과를
확인한 뒤 evidence를 만들고 그 파일을 명시해야 나머지 121개 batch가 열린다.

```bash
npm run assets:fake -- --backup-root /별도/백업/경로 --run-id core-2026-08
npm run assets:approve-materials -- --backup-root /별도/백업/경로 --run-id core-2026-08 \
  --approved-by "reviewer-name" --approved-at "2026-08-11T14:00:00+09:00" \
  --approval-reference "review-ticket-or-note"
npm run assets:fake -- --approval-evidence material-approval.json \
  --backup-root /별도/백업/경로 --run-id core-2026-08
```

정상 상태는 아래 방향으로만 진행한다.

`PLANNED → SUBMITTING → SUBMITTED → REMOTE_SUCCEEDED → BALANCE_AFTER_VERIFIED → DOWNLOADING → LOCAL_VERIFIED → BACKING_UP → BACKUP_VERIFIED → COMPLETE`

remote terminal 실패는 `SUBMITTED → REMOTE_FAILED`에서 같은 job의 `balance_after`를 먼저
checkpoint한 뒤에만 `RETRY_PENDING` 또는 `TERMINAL_FAILED`로 바뀐다. 실행은 plan 순서를 엄격히
따르며 현재 batch가 `PENDING`, transient, incomplete, `AMBIGUOUS_SUBMISSION`이면 그 run에서 즉시
멈춘다. `COMPLETE` 또는 `TERMINAL_FAILED`만 다음 초기 batch로 진행할 수 있다.

provider batch submit 전에 `balance_before`, `SUBMITTING`, 결정론적 idempotency key를 원자
checkpoint한다. crash 후 provider가 idempotency/key 조회를 제공하지 않거나 조회가 실패하면
`AMBIGUOUS_SUBMISSION`으로 멈추고 자동 재제출하지 않는다. 신뢰 가능한 조회가 `null`이면 새
attempt가 아니라 같은 key/attempt로만 다시 submit한다.

새 generation attempt를 만드는 조건은 remote job의 명시적 terminal `FAILED`뿐이다. query transport,
download, local install, backup, balance-after 오류는 현재 job/state에 머물러 같은 결과로 재개한다.
최초 시도는 0, 재시도는 1..3으로 총 4회이며 네 번째 remote 실패는 `TERMINAL_FAILED`다. 재시도
batch id는 `<initial-id>-retry-N`이고 불변 plan에는 추가하지 않는다. 한 batch의 terminal 실패가
이후 초기 batch를 막지는 않지만, 하나라도 미완료면 전체 run은 성공이 아니다.

material approval evidence는 현재 plan SHA-256과 `run_id`, 정확한 첫 52 asset ID, 정확한 최초 5개
batch ID와 각 asset의 현재 `local_sha256`/`backup_sha256`에 묶인다. 다섯 batch와 실제 양쪽 파일이
모두 `COMPLETE`로 재검증되어야 만들거나 사용할 수 있다. `approved_by`, timezone이 명시된 엄격한
RFC 3339 `approved_at`, 비어 있지 않은 `approval_reference`도 사람이 명시해야 한다. evidence는 수기
canonical 원본이 아니며 ignored `assets/runs/<run-id>/material-approval.json`에 저장된다. 다른 run이나
다른 파일 바이트의 evidence와 boolean 승인 플래그는 허용하지 않는다.

## 회수 안전성

- 같은 디렉터리 임시 파일에 기록하고 file `fsync` → no-clobber install → parent directory `fsync` 순서로 확정한다.
- 기존 파일의 SHA-256이 같으면 성공으로 재개하고 다르면 덮어쓰지 않는다.
- 절대경로, `..`, NUL, 역슬래시와 symlink traversal을 거부한다.
- PNG signature, non-empty, 최대 크기, SHA-256, 첫 `IHDR(13)`, 양수 크기, bounded chunk/CRC,
  `IDAT`, terminal `IEND`, trailing byte 부재를 확인하고 IHDR aspect를 항상 검증한다.
- local/backup root는 어느 쪽도 다른 쪽을 포함할 수 없고, 복사 후 size와 SHA-256을 다시 검증한다.
- ledger에는 signed URL, header, token, 원문 provider error를 저장하지 않는다. error code는 allow-list로 축소한다.
- runner lock은 하나만 허용한다. sibling claim을 원자 획득한 실행만 죽은 process의 stale lock을
  inode/device/내용 재확인 뒤 회수할 수 있다. orphan claim은 자동 삭제하지 않고 fail closed하므로
  운영자가 실행 중인 runner가 없음을 확인한 뒤 해당 `.claim` 파일을 명시적으로 제거해야 한다.
- ledger load 시 plan의 batch/asset 집합, 상태, attempt 0..3 번호·ID·key, job/remote ancestry,
  COMPLETE의 동일 local/backup hash를 검증한다. `COMPLETE`/`BACKUP_VERIFIED` 재개 시에는 실제
  local·backup PNG를 다시 열어 aspect/size/SHA-256을 확인한다.

실제 remote adapter를 추가할 때에는 이 경계를 유지하고, provider의 idempotency/query 보장을 먼저
검증해야 한다. 그 전에는 `provider.ts`의 remote 미구현 표식을 제거하지 않는다.
