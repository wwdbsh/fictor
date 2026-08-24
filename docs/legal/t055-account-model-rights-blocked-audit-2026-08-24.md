# T055 생성 계정·모델 권리 blocked audit — 2026-08-24 KST

## 판정

`BLOCKED_WITH_SECRET_FREE_PARTIAL_EVIDENCE`다. T060 production AI PNG 622개의 경로·SHA-256 구조는
전부 결속됐지만, 생성 당시 계정 약관·Privacy와 요청·보고 모델의 공식 관계를 입증할 실질 증거가
없다. 따라서 `completionEligible=false`이며 T055, B-01, T047은 계속 blocked다.

이 audit은 법률 의견이나 공개·상업 이용 가능성의 보증이 아니다. 현재 로그인 세션, 현재 공개 문서,
현재 cookie 상태를 2026-08-11~14의 계정 동의 사실로 소급하지 않는다. 새 이미지 생성, 유료 provider
호출, AI PNG 제외·대체 구현은 수행하지 않았다.

## Acceptance Criteria 상태

| AC | 상태 | 근거 |
| --- | --- | --- |
| production inventory 정확히 622개, 경로·SHA-256 1회 등재 | `VERIFIED` | T022 621개 + T012 selected 후보 01 한 개. 후보 02–04 production 0. codepoint 정렬 path·SHA digest `a691621e04e44c1ee45d79722e83fbe1765c3f1e148b9740985fe60a6f81d632` |
| 622개 모두 생성 run·생성 시각·요청/보고 모델·계정 Terms/Privacy·supplemental policy에 1:1 연결 | `UNRESOLVED` | 로컬 provenance는 고정했으나 계정 UI와 직접 결속된 알려진 job은 T011·T016 각 1개뿐이다. 나머지 620개로 확대하지 않으며 과거 policy 증거도 없다. |
| 접근일·출처·revision·적용 범위·secret redaction 기록 | `PARTIAL / UNRESOLVED` | 2026-08-24 읽기 전용 접근과 redaction 경계는 기록했다. 생성 당시 revision·effective interval·acceptance는 UI에 보이지 않았다. |
| 필수 증거 누락 시 완료하지 않고 차단 유지 | `VERIFIED` | substantive gap 6, `completionEligible=false`, T055/B-01/T047 `BLOCKED` |

## Source register와 구조적 coverage

기계 권위는 다음 두 파일이다.

- `assets/evidence/t055-account-observed-v1.json`: 읽기 전용 계정 UI 관찰 allowlist
- `assets/manifests/t055-release-ai-rights-audit-v1.json`: 고정 source SHA, 622개 compact digest, coverage와 blocked 결정

622개 full-row manifest는 복제하지 않는다. validator가 고정 SHA의 T022 621개 row에
`public/assets/style/master-candidate-01.png`와 SHA-256
`3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3`를 더하고, 경로를 Unicode
codepoint 순으로 정렬해 `RELEASE_AI_PATH_SHA_V1`, LF, `path<TAB>sha256<LF>`로 digest를 재계산한다.
그 결과는 622 row, 중복 경로 0, 구조 gap 0이다. source task별 T022 수량은 T013 52, T015 332,
T016 157, T019 6, T020 54, T021 20이다.

## 읽기 전용 계정 관찰과 redaction 경계

로그인된 계정 UI에서 보인 자산 수는 685였다. 다음 두 local job만 동일 계정의 과거 자산과 직접
결속했다.

- T011 `e0f36c95-2e1b-4e38-9931-7e10e562f209`: UI Model `Nano Banana 2`, Created
  `August 11, 2026 at 7:17 PM`. UI가 timezone을 표시하지 않아 시각을 UTC로 변환하지 않는다.
- T016 `ccdeba78-06a5-4d3f-b3fa-8ab165353803`: UI의 `August 14, 2026` 자산 목록에서 확인했고,
  local forensic의 `forge__tool_01__tool_07`·보고 모델 `nano_banana_flash`와 일치했다.

계정 식별자, 사용자명·표시명, profile path, 이메일, cookie·token, signed download address,
screenshot·HTML·HAR·raw dump는 수집·저장하지 않았다. 저장한 것은 위 allowlist 사실뿐이며
`rawEvidenceStored=false`다. 로그인·MFA·약관 동의·설정 변경·다운로드·외부 전송은 없었다.

## 실질 권리 coverage와 잔여 gap

다음 6개 claim은 모두 `UNRESOLVED`다. `CURRENT_ONLY`, `INFERENCE`, `UNKNOWN`,
`USER_ACCEPTED_RISK`를 완료 근거로 바꾸지 않는다.

1. 622개 전부의 동일 계정 historical binding
2. 생성 당시 계정 적용 Terms revision과 effective interval
3. Terms acceptance 또는 early-consent timestamp
4. 생성 당시 적용 Privacy revision
5. 요청 `nano_banana_2`와 보고 `nano_banana_flash`의 공식 관계
6. 상위 제공자 supplemental policy의 622개 출력 적용 범위

구조적 coverage는 622/622, gap 0이다. 실질 권리 coverage는 verified 0, unresolved 6, gap 6이다.
현재 UI나 현재 공개 정책이 과거 사실을 증명하지 못하므로 이 차이를 합산해 “coverage 완료”로 쓰지 않는다.

## 재현과 다음 승인 가능 단계

```bash
npm run assets:rights:t055:check
npm run assets:rights:t055:assert-complete # 현재는 의도적으로 exit 1: T055_NOT_COMPLETE:6
npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts check
npm run assets:style:v2:evidence-check
npm run assets:master-style:check
```

다음 단계는 생성 당시 계정·provider policy 증거를 추가 확보하거나, 상헌 님이 AI PNG 제외·대체를
별도 Goal amendment로 승인하는 것이다. 어느 쪽도 이 T055 blocked audit이 자동 승인하지 않는다.
