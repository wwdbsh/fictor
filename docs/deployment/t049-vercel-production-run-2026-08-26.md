# T049 Vercel production run — 2026-08-26 KST

상태: `IN_PROGRESS` / `FAIL_CLOSED`

## 승인과 범위

- GitHub Issue `#51`의 승인된 T049 계약(`contract_hash` prefix `d4cbf319…`)과 submission-first amendment만 실행한다.
- Vercel Pro의 Git build를 사용해 exact candidate `f434656cdf3fce0fa35e8598169da6b678cdf627` 하나만 빌드한다.
- Vercel build artifact가 아래 T062 tuple과 byte-for-byte 동일할 때만 production으로 promote한다.
- T047은 이 exact T062 artifact에 한해서만 공개 release를 승인했다. 다른 revision, rebuild 결과 또는 수정 산출물에는 승인이 없다.
- 최적화, 파일 제외, source/config/lockfile/art/data 수정, 용량 회피 또는 build remediation은 이 Task 범위 밖이다.

## 불변 source + artifact tuple

| 항목 | 승인된 값 |
|---|---|
| Git source candidate | `f434656cdf3fce0fa35e8598169da6b678cdf627` |
| T062 `dist` tree SHA-256 | `43ee3cbcc3c5b3681890ba3082fb882b1b89dfb564003d1cd23dfb7746df1b0e` |
| T062 file count | `628` |
| T062 total bytes | `1,261,180,248` |
| release authority | T047 `APPROVED_FOR_PUBLIC_RELEASE_OF_EXACT_T062_ARTIFACT` |

기계 권위는 `assets/manifests/t062-production-artifact-v1.json`, 사람이 읽는 감사 경계는
`docs/legal/t062-production-reaudit-2026-08-25.md`, 공개 release 경계는
`docs/decisions/t047-public-release-decision-2026-08-25.md`다. 어느 값이라도 달라지거나 이 증거가
무효화되면 promote하지 않는다.

## Preflight

| 점검 | 관찰 상태 |
|---|---|
| Vercel Pro project | `project-702iz` |
| 초기 deployment count | `0` |
| 초기 Git integration | disconnected |
| 기존 production deployment/alias | 없음으로 관찰됨 |
| T047 exact-artifact 공개 승인 | 확인됨 |
| candidate와 T062 tuple | 위 값으로 동결 |

이 preflight는 빈 프로젝트의 초기 상태만 고정한다. 실제 연결, build, equality, promote 결과는 아래
실행 증거가 채워지기 전까지 완료로 간주하지 않는다.

## 정확한 실행 순서

1. project `project-702iz`가 여전히 deployment `0`, Git disconnected이며 예상하지 않은 alias가 없는지 재확인한다.
2. Git integration을 exact candidate 한 번의 Git build에만 연결한다.
3. 연결로 생성된 deployment가 하나뿐이고 source revision이 exact candidate인지 확인한다. 연결 자체가 deployment를 만들거나 noncandidate revision을 선택하면 즉시 중단한다.
4. exact candidate의 Git build 하나를 실행하고 Vercel build status와 용량 제한 결과를 기록한다.
5. 완성된 Vercel artifact의 path, byte length, file SHA-256을 T062 manifest와 대조하고 file count, total bytes, tree SHA-256을 재계산한다.
6. source SHA와 artifact equality가 모두 `PASS`인 경우에만 그 deployment를 production으로 promote한다.
7. production deployment와 current alias가 동일한 승인 deployment를 가리키는지 기록한다.
8. promote 직후 Git integration을 disconnect한다. evidence branch의 push 또는 merge보다 반드시 먼저 완료한다.
9. secret-free 최소 증거만 이 문서에 기록한다. 실패 시 promote하지 않고 rollback 필요 여부와 관찰 상태를 남긴다.

## Fail-closed matrix

| 조건 | 판정과 조치 |
|---|---|
| Vercel 용량 제한 발생 | `FAIL_CLOSED` — 최적화·파일 제외·재구성 없이 중단, promote 금지 |
| Git build 실패 | `FAIL_CLOSED` — 수정·재시도·대체 build 없이 중단, promote 금지 |
| source revision이 exact candidate가 아님 | `FAIL_CLOSED` — noncandidate deployment promote 금지, 연결 해제 후 기록 |
| file count, total bytes, path, file SHA 또는 tree SHA mismatch | `FAIL_CLOSED` — artifact 수정 없이 중단, promote 금지 |
| Git 연결이 자체 deployment를 생성함 | `FAIL_CLOSED` — 추가 build/promote 금지, 연결 해제 후 기록 |
| candidate 외 deployment가 생성되거나 발견됨 | `FAIL_CLOSED` — 대상 전환·삭제로 숨기지 않고 중단, 연결 해제 후 기록 |
| equality 검증이 불가능하거나 증거가 불완전함 | `FAIL_CLOSED` — `PENDING`을 `PASS`로 바꾸지 않고 promote 금지 |
| promote 후 alias가 승인 deployment를 가리키지 않음 | `FAIL_CLOSED` — 후속 QA/제출 금지, rollback 상태를 기록하고 별도 승인 요청 |
| promote 뒤 Git integration disconnect 실패 | `FAIL_CLOSED` — evidence branch push/merge 및 후속 Task 금지 |

## 실행 증거

| Evidence | 상태 | Secret-free 관찰값 |
|---|---|---|
| Vercel project identity | `PENDING` | `PENDING` |
| deployment identity | `PENDING` | `PENDING` |
| deployment source SHA | `PENDING` | `PENDING` |
| Git build status | `PENDING` | `PENDING` |
| T062 byte equality | `PENDING` | `PENDING` |
| production promotion | `PENDING` | `PENDING` |
| current production alias | `PENDING` | `PENDING` |
| Git integration disconnected | `PENDING` | `PENDING` |
| rollback / rollback need | `PENDING` | `PENDING` |

`PENDING`은 성공을 뜻하지 않는다. source SHA, build 성공, exact artifact equality가 각각 직접 확인되기
전에는 production promotion 행을 `PASS`로 바꿀 수 없다.

## Git integration 안전 경계

Git integration은 exact candidate build 한 번을 만들기 위한 임시 연결이다. 연결 직후 source revision과
deployment 수를 확인하며, 연결이 자동 deployment를 만들거나 candidate가 아닌 revision을 선택하면
fail closed한다. promote가 성공하면 integration을 즉시 disconnect하고, disconnect 증거를 확인하기
전에는 evidence branch를 push하거나 merge하지 않는다. integration을 evidence branch에 연결된 채로
두어 그 branch의 push가 새 deployment를 만들 수 있는 상태도 허용하지 않는다.

## 보안과 증거 최소화

- token, cookie, session identifier, authorization header, bypass secret, 환경 변수 값은 기록하지 않는다.
- provider 원문 응답이나 raw build log를 문서·Git·대화에 복사하지 않는다.
- 증거는 project/deployment의 공개 가능한 식별자, source SHA, 상태, artifact digest, alias와 시각처럼 판정에 필요한 최소값만 남긴다.
- bypass를 생성·사용하지 않으며 Vercel 외 provider 또는 별도 유료 호출을 하지 않는다.

## Docs impact

필수다. T049는 운영 상태 변경 Task이므로 exact source/artifact 결속, fail-closed 판정, promotion,
alias, Git disconnect와 rollback 필요 여부를 secret-free evidence로 남겨야 한다. 이 문서는 실행 중
scaffold이며 모든 필수 행이 판정될 때까지 완료 증거가 아니다. 코드, config, lockfile, art, data,
production artifact는 문서화를 이유로 변경하지 않는다.

## 명시적 유예

이번 Task에서는 T048 및 T050 이후의 패키지 제작, 공개 URL gameplay/404 QA, 신청서 입력·전송,
데모 capture/upload, 이미지 생성, non-Vercel provider 호출, 추가 유료 호출을 실행하지 않는다.
production URL이 생겨도 이들 후속 작업의 승인이 되지 않는다.

## 잔여 위험

- Vercel Pro가 1.26 GB artifact의 Git build 또는 deployment를 현재 제한 안에서 수용하는지는 실행 전 확정되지 않았다.
- Vercel이 제공하는 artifact 회수·목록화 방식이 T062 manifest와의 완전한 byte equality 증명을 지원하는지는 아직 확인되지 않았다.
- Git integration 연결이 예상하지 않은 자동 deployment를 만들 가능성이 있다. 발생 시 복구를 위해 범위를 넓히지 않고 fail closed한다.
- promote 뒤 alias 또는 disconnect가 기대 상태가 아니면 공개 상태가 생긴 채 Task가 중단될 수 있다. 이 경우 상태를 숨기지 않고 별도 rollback 판단을 요청한다.
