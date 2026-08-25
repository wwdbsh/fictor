# T062 submission-first production 재감사 — 2026-08-25 KST

## 판정

`LOCAL_PRODUCTION_EVIDENCE_PASS / FINALIZATION_REQUIRES_INDEPENDENT_REVIEW_AND_PR_CI`다.
exact candidate revision `f434656cdf3fce0fa35e8598169da6b678cdf627`의 게임·콘텐츠·데이터·build
config·lockfile·art bytes는 바꾸지 않았다. production build와 정적 완주 smoke는 PASS했고, 전체
`dist/` 628개 파일을 path·bytes·SHA-256으로 동결했다. T062는 독립 고위험 review blocker 0건과
evidence commit의 필수 PR CI 성공이 모두 관찰될 때만 `PASS`로 종료한다. 어느 조건도 문서만으로
미리 충족됐다고 간주하지 않는다.

이 재감사는 권리 검증, 법률 보증, gameplay·UX playtest PASS, `NO_CHANGE_REQUIRED`, 공개 release,
배포 또는 제출 승인이 아니다. T047 이후 단계는 T062가 위 closing rule로 완료되기 전에는 시작하지
않는다.

## exact candidate와 소유자 disposition

- candidate commit: `f434656cdf3fce0fa35e8598169da6b678cdf627`
- candidate Git tree: `506dbdf94fbbf859d308e9eb5ab20f5673336122`
- PR #119 검증 head `984f1c7608c1b08894a2dc8971cef1659b1169ec`의 Git tree도 위와 동일하다.
- submission-first 승인 시각: `2026-08-25T11:59:10Z`
- 직접 플레이 disposition:
  `OWNER_DIRECT_PLAY_NOT_PERFORMED_TIMEBOX_WAIVED_FOR_INITIAL_SUBMISSION`

상헌 님은 exact candidate를 직접 플레이하지 않았고 잔여 gameplay·UX 위험을 초기 제출의 timebox
위험으로 수용했다. 이를 직접 플레이 완료, gameplay PASS 또는 변경 불필요 판정으로 바꾸어 쓰지
않는다. 이후 frozen path byte가 바뀌면 이 승인과 T062 evidence는 무효가 된다.

## B-01~B-06 원장

| gate | 판정 | exact evidence와 경계 |
| --- | --- | --- |
| B-01 | `OWNER_RELEASE_RISK_ACCEPTED_WITH_UNRESOLVED_GENERATION_TIME_RIGHTS_EVIDENCE` | production AI PNG 622, release digest `a691621e04e44c1ee45d79722e83fbe1765c3f1e148b9740985fe60a6f81d632`, structural gap 0, substantive gap 6, historical `completionEligible=false`. 권리 검증·법률 보증 PASS가 아니다. |
| B-02 | `PASS` | 승인 문구 UTF-8 SHA-256 `1219abc0ea8e7621e93a0b802577aba7dd0288a57c010594fd81f6f911080644`. README, 게임 credit source, canonical 제출 설명, `ASSET_LICENSES.md`에 exact 문구가 존재한다. |
| B-03 | `PASS_WITH_RECORDED_RESIDUAL_RISK` | T057이 승인한 `FICTOR · 픽토르`와 종족·옛 신 명칭을 유지한다. 상표 clearance 또는 비침해 보증이 아니다. |
| B-04 | `PASS` | source와 production `THIRD_PARTY_NOTICES.txt`가 모두 115,480 bytes, SHA-256 `eb74e08cf7c0f51294ae2df39874ae9d11b22729615401aa5a4777f80e460703`이다. |
| B-05 | `PASS` | production PNG는 정확히 622개다. `master-candidate-02`~`04`는 evidence-only이며 `dist/`에 없다. |
| B-06 | `B06_OPERATIONALLY_CLOSED_WITH_UNKNOWN_CUTOFF_AND_NO_LATE_MUTATION_DEPENDENCY` | 정확한 cutoff와 마감 후 폼 수정·URL 교체를 UNKNOWN으로 유지한다. 정책 PASS·법률 보증·운영 보증이 아니다. |

T055 기계 검사는 `PASS_BLOCKED`를 그대로 반환했고, owner disposition 검사는
`PASS_OWNER_DISPOSITION`을 반환했다. 이는 historical blocked audit을 수정하지 않는다.

## production artifact byte freeze

기계 권위는
[`t062-production-artifact-v1.json`](../../assets/manifests/t062-production-artifact-v1.json)이다.
manifest는 candidate commit과 이후 evidence commit을 구분하며, evidence commit을 candidate로
표현하지 않는다.

| 항목 | 값 |
| --- | --- |
| manifest SHA-256 | `31c0a4e6a739103f45061a1ced1af7e408359542954b5b0a00319ad5a0a50b7f` |
| `dist_tree_sha256` | `43ee3cbcc3c5b3681890ba3082fb882b1b89dfb564003d1cd23dfb7746df1b0e` |
| tree row encoding | `sha256 + " " + bytes + " " + path + "\n"`, Unicode codepoint path order |
| file count / total bytes | `628` / `1,261,180,248` |
| extensions | CSS 1, HTML 1, JS 3, PNG 622, TXT 1 |
| style candidates 02–04 | 모두 absent |

정적 smoke 뒤 `node scripts/t062-production-artifact.mjs check`가 동일 file count, total bytes와
`dist_tree_sha256`을 확인했다. symlink·비정규 파일·안전하지 않은 경로·중복·PNG 수량 drift·미선택
후보 유입·manifest no-clobber 실패는 도구가 fail closed한다.

## 검증 기록

| 검사 | 결과 |
| --- | --- |
| T022 audit | PASS — audited 621, deterministic fallback 873, provider call 0 |
| style v2 evidence / selected master style | PASS — 후보 evidence 4, production selected 01 |
| T055 audit / owner disposition | `PASS_BLOCKED` / `PASS_OWNER_DISPOSITION` |
| T062 manifest 집중 테스트 | PASS — 1 file, 3 tests |
| 최초 local `npm test` 시도 | **판정 근거에서 제외** — 검증 보조가 자연 종료 전에 SIGINT로 중단해 exit code와 최종 reporter 결과가 없다. 중단 전 표시된 두 파일을 좁게 재검증했다. |
| 직접 관련 집중 재검증 | PASS — T031 audit 8/8, release-public-assets 8/8, 합계 16/16 |
| exact candidate tree의 PR #119 CI | PASS 2/2 — 검증 head와 merge candidate의 Git tree가 byte-identical |
| 최초 production build 시도 | FAIL — 새 audit test의 declaration 주석 위치 오류 2건. frozen candidate input 변경 없이 audit test import만 수정했다. |
| 직접 관련 TypeScript 확인 | PASS — `npx tsc --noEmit --pretty false` |
| 최종 production build | PASS — 91 modules transformed |
| static smoke | PASS — 시작·보상·공방·보스·완주·reload save; browser error, failed response, external/API/WebSocket request 모두 0; T022 PNG 621/621 HTTP 200·SHA 일치 |
| post-smoke manifest check | PASS — dist byte drift 0 |
| frozen path diff | PASS — `src`, `public`, `vite.config.ts`, `package.json`, `package-lock.json` candidate 대비 diff 0 |
| evidence PR CI 첫 시도 | FAIL 0/2 — gameplay 회귀가 아니라 T062에서 완료로 바꾼 checklist 두 문구를 이전 `[ ]` 상태로 기대한 content contract assertion 2개가 원인이었다. Ready·merge·T047은 계속 중단했다. |
| CI 실패 직접 관련 집중 검증 | PASS — AI disclosure/public names content contract 11/11. candidate·artifact bytes 변경 없이 assertion만 새 T062 checklist 문구에 동기화했다. |

중단된 local `npm test`를 PASS로 표현하지 않는다. T062 evidence commit의 PR CI가 `npm run verify`를
자연 종료해 성공해야 전체 regression acceptance가 닫힌다. repository CI가 push와 pull request에서
자동 실행되는 것은 로컬 명령 재실행으로 세지 않으며, 두 check가 같은 evidence commit을 검증해야 한다.

## 독립 review와 closing rule

독립 `ccp_reviewer`는 이 문서, manifest·도구·집중 테스트, 금지 경로 diff, B-01 exact-digest 경계,
B-02~B-05 PASS와 exact B-06 disposition, 실패 원자성과 위 검증 예외 기록을 검토했다. 결과는
blocker `0`, `APPROVED_PENDING_PR_CI`다. controlled local 실행에서는 regular manifest와 post-smoke
check가 확인됐다. hostile concurrent filesystem actor까지 threat model에 포함하면 manifest의
`lstat`→`read` 사이 TOCTOU를 `O_NOFOLLOW`·`fstat`로 더 강화할 수 있다는 non-blocking 의견은
기록하되, 현재 생성된 artifact의 T062 blocker나 원본 변경 사유로 확대하지 않는다.

최신 evidence commit의 필수 PR CI가 모두 성공하면 Issue #112를 `complete`로 닫을 수 있다. CI 실패,
artifact drift 또는 frozen path 변경이 발생하면 T047을 열지 않고 fail closed한다.

## rollback

T062 evidence-only 파일을 revert해도 candidate bytes는 변하지 않는다. 그러나 manifest, 독립 review
또는 CI 결속이 사라지므로 T062는 다시 미완료가 된다. 이후 gameplay·content·data·build config·
lockfile·art 변경, release digest 변화, owner disposition 철회 또는 규칙 충돌이 생기면 기존 release·
deploy 승인을 자동 승계하지 않고 새 amendment와 재감사를 요구한다.
