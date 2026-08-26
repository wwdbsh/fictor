# T049 Vercel production run — 2026-08-26 KST

상태: `COMPLETE` / `PASS_WITH_RECOVERED_INCIDENT`

## 승인과 범위

- GitHub Issue `#51`의 승인된 T049 계약(`contract_hash` prefix `d4cbf319…`)과 submission-first amendment만 실행한다.
- Vercel Pro의 Git build를 사용하며 build source로는 exact candidate
  `f434656cdf3fce0fa35e8598169da6b678cdf627`만 허용한다.
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

이 preflight는 빈 프로젝트의 초기 상태를 고정한다. 실행 중 Preview/Production target 판정 차이로
중단·삭제한 exact-candidate deployment가 있었으며, 아래 운영 이력에 숨김없이 기록한다.
따라서 전체 실행은 recovered protocol incident를 포함한 PASS다. equality-before-promotion gate를
충족한 대상은 최종 staged Production deployment 하나뿐이며, 앞선 deployment에는 release 승인을
소급 적용하지 않는다.

## 실제 운영 이력

1. Git integration을 `wwdbsh/fictor`에 연결하고 remote ref
   `ccp/t049-candidate-f434656`가 exact candidate를 가리키는지 확인했다.
2. Vercel의 manual deploy dialog에서 Preview로 표시된 exact-SHA 요청이 실제로는 Production으로
   분류되어 canonical domain까지 자동 할당됐다. 해당 deployment는 equality나 promote의 대상으로
   사용하지 않고 즉시 삭제했으며, Overview에서 다시 `No Production Deployment`를 확인했다.
3. branch-ref 요청도 Production으로 분류되어 build 중 취소했다. 같은 target 판정 실패가 두 번
   반복되어 blind retry를 중단하고 Control Plane frontier 검토를 수행했다.
4. Production Branch Tracking을 evidence branch로 격리한 뒤 exact candidate branch의 Preview Git
   deployment `dpl_2chvA3mN9NR5i2KhNFLMK9JYThTP`를 생성했다. source SHA와 Preview target을 확인하고
   T062 628개 파일 전수 equality를 통과시켰다.
5. Vercel의 Preview `Force Promote`는 Production 환경에서 새로 build한다는 확인 문구 때문에
   검증한 artifact identity를 보존하지 못한다고 판정해 실행하지 않았다.
6. Production custom-domain auto-assignment를 끄고 Production Branch Tracking을 exact candidate
   branch로 바꿨다. exact candidate Production Git deployment
   `dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC`가 `READY` / `Staged`가 되었고 custom-domain assignment는
   `Skipped`였다.
7. 이 staged Production deployment 자체에서 Resources `628`을 확인했다. unique deployment URL로
   비-HTML 627개(`1,261,179,712` bytes)의 길이와 SHA-256을 전수 대조했고 mismatch는 0이었다.
   CDN이 변환하는 `index.html`은 Dashboard Output 원본 15줄에 terminal newline을 복원해
   `536` bytes와 SHA-256 `75e9734531d71c53b114acc37f9376cd0917d3729812a36c96bd05f42fc4f694`가
   일치함을 확인했다. 따라서 628개, `1,261,180,248` bytes, deterministic manifest tree SHA-256
   `43ee3cbcc3c5b3681890ba3082fb882b1b89dfb564003d1cd23dfb7746df1b0e`가 모두 동일하다.
8. promote 직전 Overview에서 `No Production Deployment`를 재확인했다. staged deployment의
   `Promote` dialog가 새 build 없이 동일 deployment를 `project-702iz-sandy.vercel.app`에 alias한다고
   표시한 뒤에만 버튼을 한 번 실행했다.
9. Overview의 Current deployment 링크가 같은 ID `EASQhMvfgBVw3U2sXSCuPLV5QtrC`, source SHA가 exact
   candidate임을 확인했다. 곧바로 Git integration을 disconnect했고 성공 toast와 disconnected UI를
   확인했다. Production auto-assignment는 `Enabled`로 복구했다. disconnect 뒤 branch-tracking 입력은
   UI에서 제공되지 않아 재연결하지 않았다.

## 시각과 실행 권한

- staged Production build 생성 시각: `2026-08-26 09:59:48 KST`(deployment detail의 절대 시각).
- production promote 시각: `2026-08-26 약 10:09 KST`. Activity UI가 `2026-08-26 10:17 KST`
  관찰 시 `8m`로 표시했으며 초 단위 절대 시각은 제공하지 않아 근삿값으로 기록한다.
- 실행 주체: Vercel의 인증된 `wwdbsh` 세션, `Sangheon Lee's projects` Pro team의
  `project-702iz`. UI가 deployment 생성, project setting 변경, promote 및 Git disconnect를 허용했다.
  Activity는 promote를 `You promoted dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC`로 기록한다.
- 세부 role 이름(Owner/Admin/Member)은 관찰 화면에 표시되지 않아 추정하지 않는다. 실행 권한 증거는
  인증된 team/project context와 각 mutation의 성공 UI/activity 기록으로 제한한다.

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
| Vercel project identity | `PASS` | Pro team `sangheon-lees-projects-6b4448fb`, project `project-702iz` / `prj_P8JmssUXa41wo5MLGhLH0lG00iNh` |
| staged deployment identity | `PASS` | `dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC` |
| deployment source SHA | `PASS` | `f434656cdf3fce0fa35e8598169da6b678cdf627` |
| Git build status | `PASS` | `READY`, Production, `Staged`, duration `59s`, custom-domain assignment `Skipped` |
| build / promote time | `PASS_WITH_LIMITATION` | build `2026-08-26 09:59:48 KST`; promote `약 10:09 KST`(Activity relative time, seconds unavailable) |
| authenticated authority | `PASS_WITH_LIMITATION` | authenticated `wwdbsh` in Pro team/project; required controls permitted, detailed role label not exposed |
| T062 byte equality | `PASS` | 628/628 files, 1,261,180,248 bytes, per-file SHA mismatch 0, tree SHA-256 `43ee3cbc…b1b0e` |
| production promotion | `PASS` | 동일 staged deployment의 non-rebuild `Promote`를 equality 뒤 한 번 실행 |
| current production alias | `PASS` | `project-702iz-sandy.vercel.app` → `dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC` |
| Git integration disconnected | `PASS` | promote/Current identity 확인 직후 disconnect 성공; evidence push 전 완료 |
| deployment protection | `PASS` | hash window에만 Vercel Authentication 비활성화; bypass secret 없이 즉시 재활성화 |
| rollback / rollback need | `PASS_WITH_LIMITATION` | 초기 project에 직전 정상 Production이 없어 rollback 대상 없음; 현재 상태 정상이라 rollback 불필요 |

## Git integration 안전 경계

Git integration은 exact candidate Git build를 만들기 위한 임시 연결이었다. Vercel target semantics가
dialog와 다르게 동작한 두 시도는 승인 artifact로 간주하지 않았고, 반복 실패 뒤 frontier 검토 없이는
추가 진행하지 않았다. 최종 promote 뒤 integration을 즉시 disconnect했으며, 이 문서를 포함한 evidence
branch push는 disconnect 성공 확인 뒤에만 수행한다. 연결을 evidence branch에 둔 채 push가 새
deployment를 만들 수 있는 상태는 남기지 않았다.

## 보안과 증거 최소화

- token, cookie, session identifier, authorization header, bypass secret, 환경 변수 값은 기록하지 않는다.
- provider 원문 응답이나 raw build log를 문서·Git·대화에 복사하지 않는다.
- 증거는 project/deployment의 공개 가능한 식별자, source SHA, 상태, artifact digest, alias와 시각처럼 판정에 필요한 최소값만 남긴다.
- bypass를 생성·사용하지 않으며 Vercel 외 provider 또는 별도 유료 호출을 하지 않는다.

## Docs impact

필수다. exact source/artifact 결속, target 판정 실패와 frontier 전환, staged Production equality,
동일-deployment promotion, alias, Git disconnect와 rollback 한계를 secret-free evidence로 남겼다.
코드, config, lockfile, art, data, production artifact는 변경하지 않았다.

## 명시적 유예

이번 Task에서는 T048 및 T050 이후의 패키지 제작, 공개 URL gameplay/404 QA, 신청서 입력·전송,
데모 capture/upload, 이미지 생성, non-Vercel provider 호출, 추가 유료 호출을 실행하지 않는다.
production URL이 생겨도 이들 후속 작업의 승인이 되지 않는다.

## 잔여 위험

- 초기 project에 직전 정상 Production이 없었으므로 rollback dry-run 대상이 없다. rollback이 필요해지면
  이번 Task에서 임의로 삭제·재배포하지 않고 별도 승인을 받아야 한다.
- Production Branch Tracking은 disconnect 전 exact candidate branch로 격리했으며, disconnect 뒤 해당
  입력이 UI에서 사라졌다. Git integration은 disconnected이므로 현재 push-trigger 위험은 없다.
- canonical 공개 URL의 gameplay/404/runtime-request QA는 사용자 지시에 따라 이번 Task에서 실행하지
  않았고 T050 이후 범위로 남는다.
- exact candidate remote branch는 감사 가능한 source ref로 남겨 두었다. 삭제는 이번 Task에서 승인된
  destructive cleanup이 아니므로 수행하지 않았다.
