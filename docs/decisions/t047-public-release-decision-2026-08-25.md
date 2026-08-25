# T047 공개 release 결정 — 2026-08-25

## 결정

```text
decision_id: T047
decision_status: APPROVED_FOR_PUBLIC_RELEASE_OF_EXACT_T062_ARTIFACT
task_contract_sha256: 5830af15426806c64c6013b041d453ba161093fb53a794b87e885056d24b702b
approver: 상헌 님
authority: 프로젝트 소유자
owner_approval_at_utc: 2026-08-25T11:59:10Z
decision_recorded_at_utc: 2026-08-25T13:12:54Z
decision_recorded_at_kst: 2026-08-25T22:12:54+09:00
release_candidate: f434656cdf3fce0fa35e8598169da6b678cdf627
release_candidate_tree: 506dbdf94fbbf859d308e9eb5ab20f5673336122
manifest_check_at_t047: VERIFIED
manual_test_build_smoke_rerun: false
provider_or_image_generation_calls: 0
deploy_package_qa_or_form_mutations: 0
```

상헌 님의 submission-first amendment 승인을 아래 exact T062 production artifact의 공개 release에
결속한다. 승인 대상과 이후 release·deploy의 소스는 candidate
`f434656cdf3fce0fa35e8598169da6b678cdf627`다. T062 evidence head와 merge commit은 검증·종료
증거일 뿐 release candidate 또는 배포 소스가 아니다.

## T062 종료 증거와 artifact 결속

| 항목 | 값 |
| --- | --- |
| candidate Git tree SHA-1 | `506dbdf94fbbf859d308e9eb5ab20f5673336122` |
| T062 evidence head | `c85cfa735ea691a95dd2603f7b0f76ec45f48e11` |
| PR #120 merge commit | `67873bf9a3535afaca1c50393d6cc5e462c7cbc8` |
| PR #120 CI | `npm run verify` 2/2 success |
| Issue #112 | `complete` |
| 독립 review | `APPROVED`, blocker 0 |
| manifest SHA-256 | `31c0a4e6a739103f45061a1ced1af7e408359542954b5b0a00319ad5a0a50b7f` |
| `dist` tree SHA-256 | `43ee3cbcc3c5b3681890ba3082fb882b1b89dfb564003d1cd23dfb7746df1b0e` |
| production artifact | 628 files / 1,261,180,248 bytes / PNG 622 |

기계 권위는 [T062 production artifact manifest](../../assets/manifests/t062-production-artifact-v1.json),
사람이 읽는 감사 경계는 [T062 production 재감사](../legal/t062-production-reaudit-2026-08-25.md)다.
T047 기록 시 manifest checker는 `VERIFIED`이며 위 tuple과의 drift가 없다. 이번 결정 사이클은 이미
완료된 manual test, production build 또는 static smoke를 재실행하지 않았고 provider·이미지 생성·유료
호출, 배포·패키지·QA·신청서 입력 또는 전송도 수행하지 않았다.

## B-01~B-06 처분과 유지되는 경계

| gate | T047 처분 | 승인에 포함되지 않는 주장 |
| --- | --- | --- |
| B-01 | `OWNER_RELEASE_RISK_ACCEPTED_WITH_UNRESOLVED_GENERATION_TIME_RIGHTS_EVIDENCE`; release digest `a691621e04e44c1ee45d79722e83fbe1765c3f1e148b9740985fe60a6f81d632`, structural gap 0, substantive gap 6, historical `completionEligible=false` | 생성 당시 권리 검증 또는 법률 보증이 아니다. historical blocked audit을 PASS로 고쳐 쓰지 않는다. |
| B-02 | `PASS` | 승인된 동일 AI 표기의 범위를 넘어선 보증이 아니다. |
| B-03 | `PASS_WITH_RECORDED_RESIDUAL_RISK` | 상표 clearance 또는 비침해 보증이 아니다. |
| B-04 | `PASS` | 동결 artifact 밖의 후속 package나 배포 변경을 승인하지 않는다. |
| B-05 | `PASS` | production에는 PNG 622개만 포함되며 evidence-only 스타일 후보를 공개 대상으로 승계하지 않는다. |
| B-06 | `B06_OPERATIONALLY_CLOSED_WITH_UNKNOWN_CUTOFF_AND_NO_LATE_MUTATION_DEPENDENCY` | 정확한 cutoff, 마감 후 수정 가능성, 정책·법률·운영 보증이 아니다. |

이 결정은 공개 release 가능 여부에 대한 소유자 처분이다. 권리·상표·운영 불확실성을 해소했다는 판정,
법률 자문, gameplay·UX 직접 플레이 PASS 또는 공개 이후 무변경 보증으로 확대하지 않는다.

## 효력, 자동 무효화와 후속 gate

효력은 위 candidate, frozen path, release digest와 artifact bytes가 모두 exact equality를 유지하는 동안에만
유효하다. 다음 중 하나라도 발생하면 이 승인은 자동 무효화된다.

- candidate revision·tree 또는 frozen path의 변경
- release digest, manifest SHA-256, `dist` tree SHA-256, 파일 수·총 bytes·PNG 수 또는 개별 artifact
  bytes의 drift
- T062 complete 판정, Issue #112의 `ccp:complete`, PR #120의 merge·CI 2/2, 독립 review blocker 0,
  manifest 또는 evidence 결속 중 하나라도 철회·무효화되거나 더 이상 검증되지 않는 경우
- 상헌 님의 owner disposition 철회
- 적용 규정·행사 규칙·정책과의 충돌

T049는 promote 전에 candidate가 release/deploy 소스임과 위 tuple의 exact equality를 다시 확인해야 한다.
drift가 있으면 기존 승인을 승계하지 않고 중단하며, 새 amendment·production 재감사와 소유자 재승인을
거친다. 이번 T047 사이클은 배포·패키지·QA·신청서 입력·전송, 이미지 생성, provider 또는 유료 호출을
수행하지 않으며, 각 후속 Task에 이미 기록된 조건부 승인 범위를 새로 확대하지 않는다.
위 T062 종료 증거가 무효화되면 T049 이후 Task도 즉시 중단한다.

## 승계·철회와 rollback

철회 또는 상충하는 새 사실이 생기면 새 dated decision이 이 문서를 명시적으로 supersede해야 한다.
T049 시작 전 철회라면 promote를 시작하지 않는다. 공개 이후 철회라면 별도 rollback Task에서 공개
artifact·URL·제출 상태를 식별하고 가역 범위와 보존 증거를 검증한다. 이 문서만 revert해도 이미 수행된
외부 release나 제출은 취소되지 않으므로, 외부 상태를 문서 삭제로 되돌렸다고 표현하지 않는다.

Docs impact: required — submission-first 소유자 승인, exact T062 artifact, B-01~B-06의 잔여 위험,
후속 gate와 자동 무효화·supersession 규칙을 장기 결정 기록으로 남긴다.
