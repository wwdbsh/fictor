# T011 스타일 후보 — 제한 READY v2 운영 기록

## 승인과 범위

2026-08-11 KST에 상헌 님은 먼저 support 문의 없이 진행할 수 있다고 판단해 제한 경로 진행을
요청했습니다. 이어 assistant가 공개 약관의 상업 이용 근거, training/improvement 사용 가능성,
계정 적용 revision의 불명확성, reference·민감 입력 없이 순차 단건 4회·상한 6.00·재료/bulk 제외라는
계획을 고지하고 확인을 요청했습니다. 그 직후 상헌 님은 “크레딧 사용하는 것은 문제 없어... 마음껏
사용해도 돼”라고 답했습니다. v2는 이 답변을 앞선 고지 계획에 대한 문맥상 승인으로만 해석하며,
blanket waiver로 해석하지 않습니다. 이 승인은 `style-candidates-v2`의 동일한 스타일 후보 **정확히
4개**에만 T010 HOLD를 대체합니다.
재료 52장, core 1,494장, batch 및 다른 생성에는 적용되지 않습니다.

- v1은 historical immutable `HOLD_FOR_CLARIFICATION`입니다.
- v2는 `generate_image` 1회 × 4, 각 `count=1`, `nano_banana_2`, `3:4`, `1k`,
  `use_unlim=false`, 유료 요청 `get_cost=false`로 제한됩니다.
- 후보별 단가는 매번 `get_cost=true`로 다시 확인하며 기대값은 정확히 1.50, 총 상한은 6.00입니다.
- 공개 Terms의 output 소유권·상업 이용 관련 조항은 제한 근거로만 기록했습니다. 계정 적용 revision,
  Privacy revision, Google supplemental terms, MCP opt-out 및 정확한 만료 시각은 검증 완료로 주장하지
  않고 `USER_ACCEPTED_RISK`입니다. training/improvement 사용 가능성은 인지했습니다.
- 외부 reference, 사람, 브랜드, 로고, 민감 입력은 없습니다. 기본 공개 설정 관찰은 private입니다.
- support 질문은 이 4개 실행에만 waived이며 질문 초안은 보내지 않았습니다.

Secret-free 승인 evidence:
[`t011-limited-ready-approval-v2.json`](../../assets/evidence/t011-limited-ready-approval-v2.json),
SHA-256 `f96fafb18e8e8a24978adc2529fb34462e7285331e0c5706b8c9b3e6032fa018`.

READY manifest:
[`style-candidates-v2.json`](../../assets/manifests/style-candidates-v2.json),
SHA-256 `67b84dcab57f5197112fb81c3134afc329f55f0b4580030e6a05c044cfce27bf`.

준비 완료 시점에는 실제 유료 MCP generation, job, PNG, journal, backup 및 소비 크레딧이 모두
0이었습니다. 이후 GO 뒤 후보 01의 canonical 요청은 정확히 한 번 호출됐고 definite completed job
`e0f36c95-2e1b-4e38-9931-7e10e562f209`가 관찰됐습니다. 요청 모델은 manifest에 결속된
`nano_banana_2`였지만 provider result/show-generation의 내부 보고 식별자는
`nano_banana_flash`였습니다. 두 값을 별도 provenance로 보존하며, 이 관찰만으로 두 식별자가 공식
alias이거나 동일 모델이라고 주장하지 않습니다. 당시 PNG는 즉시 임시 파일로 회수됐으나 ingest 전이었고,
provider-native 크기는 896×1200이었습니다. target 3:4 대비 상대 오차는 ceil 기준 4,445ppm으로,
초기 strict 검증은 `ASPECT_MISMATCH`로 중단됐고 local/backup 파일은 생기지 않았습니다. v2 ingest만
최대 5,000ppm(0.5%)을 허용해 원본 byte를 변형 없이 보존합니다. 이 시점까지 재시도나 다음 후보 호출은
없었습니다. validator 수정·재검증 뒤 C1을 원본 byte 그대로 ingest했고, 이후 C2–C4도 같은 순차 계약으로
완료했습니다.

## 실제 완료 증거

4개 후보는 모두 `COMPLETE`이며 balance chain은 `945.9 → 944.4 → 942.9 → 941.4 → 939.9`, 총
차감은 정확히 6.00 credits입니다. 모든 호출은 requested model `nano_banana_2`, provider-reported
identifier `nano_banana_flash`, `use_unlim=false`, `count=1`이었습니다.

| 후보 | job ID | balance 전→후 | PNG SHA-256 |
| --- | --- | --- | --- |
| 01 | `e0f36c95-2e1b-4e38-9931-7e10e562f209` | 945.9→944.4 | `3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3` |
| 02 | `2186c857-2ec6-4261-886d-b9044307d55d` | 944.4→942.9 | `d8cb1bb1e5864eefdf543b8b371b0d8242b1aa8294b53a888ca0d064b668abd1` |
| 03 | `a7e75048-cd94-47ef-89d7-0297f46a2f2a` | 942.9→941.4 | `d04e65e15ab75c94a55b6929e74fe40b17b429ff166584ff2f572d4606b09a8f` |
| 04 | `6a8379a3-5337-425f-8496-e84810ae769f` | 941.4→939.9 | `071859618b0b8a6630950e920de00bb9e65d8a412eca24378379446388fae0be` |

Tracked secret-free evidence는
[`t011-style-actual-run-v2.json`](../../assets/evidence/t011-style-actual-run-v2.json), SHA-256
`1b633074376cdb8d93dfa738a7a0c5c85d05c74b9b184c29fc94331018859058`입니다. 이 파일은 manifest
`67b84d…`, ignored redacted journal `52c954…`, ignored completion `147b26…`, tracked contact sheet
`5bfb09…`를 full SHA-256으로 결속하며 `npm run assets:style:v2:evidence-check`로 실제 local/backup
PNG까지 다시 검증합니다.

Visual QA 결과는 네 후보 모두 text/logo/brand/person이 없었습니다. C1은 border가 없지만 prompt와
limb count가 다릅니다. C2는 희미한 plate edge, C3는 뚜렷한 plate border, C4는 강한 framed-sheet /
mat / shadow artifact가 있어 no-border prompt 이탈 플래그를 남겼습니다. 비교 연락표는
[`t011-style-candidates-v2.html`](contact-sheets/t011-style-candidates-v2.html)이며 docs 위치에서 직접 열어도
동작하도록 `../../../public/assets/...` 상대경로만 사용합니다.

## 고정 저장소와 상태

- local: `public/assets/style/master-candidate-01..04.png`
- backup: ignored `assets/backups/t011-style/style/master-candidate-01..04.png`
- journal/lock: ignored `assets/runs/t011-style/operations-v2.{json,lock}`
- completion: ignored `assets/runs/t011-style/completion-v2.json`
- 상태:
  `PLANNED → SUBMITTING → SUBMITTED → RESULT_ID_RECORDED → LOCAL_VERIFIED → BACKUP_VERIFIED → BALANCE_AFTER_VERIFIED → COMPLETE`
- 확정적인 provider 응답이 없으면 `AMBIGUOUS_SUBMISSION`, 가격이 1.50이 아니면 `PRICE_CHANGED`,
  balance 차감이 정확히 1.50이 아니면 `AMBIGUOUS_BALANCE`로 fail-stop합니다. 자동 재호출하지 않습니다.

operations journal은 `redacted=true`인 provider ledger 역할을 함께 합니다. allow-list field 외의 signed
URL, token, account/email/session 식별자, raw response/error 필드는 validator가 거부합니다.

## 후보별 실행 절차

먼저 준비물과 ignored journal을 검증·초기화합니다.

```bash
npm run assets:style:v2:check
npm run assets:style:v2:ops -- init
```

아래 `<candidate-id>`는 순서대로 `style/master-candidate-01`부터 `-04`까지입니다. 매 후보마다 다음
절차를 완전히 끝낸 뒤에만 다음 후보로 갑니다.

1. 가격 조회용 canonical request를 출력합니다.

   ```bash
   npm run assets:style:v2:ops -- preflight-request --candidate-id <candidate-id>
   ```

2. 출력된 `preflight_request` 그대로 `generate_image`를 호출합니다. 이 요청은 `get_cost=true`이고 job을
   만들지 않아야 합니다. 별도로 `balance`를 조회합니다. 응답 원문·signed URL·계정 식별자는 저장하지
   않고, 단가·job 생성 여부·balance와 각각의 RFC3339 관찰 시각만 보관합니다.

3. 단가가 정확히 `1.50`, job 생성이 `false`일 때만 journal을 `SUBMITTING`으로 원자 기록하고 유료
   canonical request를 출력합니다.

   ```bash
   npm run assets:style:v2:ops -- prepare \
     --candidate-id <candidate-id> \
     --unit-cost 1.50 \
     --job-created false \
     --balance-before <decimal> \
     --cost-observed-at <RFC3339> \
     --balance-observed-at <RFC3339>
   ```

4. 출력된 `paid_request` 그대로 `generate_image`를 **한 번** 호출합니다. `get_cost=false`, `count=1`,
   `use_unlim=false`인지 다시 확인합니다. definite success이면 secret-free invocation/result 식별자와
   제출·완료 시각을 기록합니다. C1 관찰 뒤 이번 run의 expected provider-reported identifier는
   `nano_banana_flash`입니다. 이후 다른 식별자가 보고되면 실제 provider record와 drift 값을 보존하고
   `MODEL_DRIFT / FAIL_STOP`하며 자동 재호출하지 않습니다.

   ```bash
   npm run assets:style:v2:ops -- result \
     --candidate-id <candidate-id> \
     --invocation-id <opaque-invocation-id> \
     --provider-result-id <opaque-provider-result-id> \
     --provider-reported-model <exact-provider-reported-identifier> \
     --submitted-at <RFC3339> \
     --completed-at <RFC3339>
   ```

   응답이 timeout/transport 오류 등으로 모호하면 재호출하지 말고 즉시 멈춥니다.

   ```bash
   npm run assets:style:v2:ops -- ambiguous \
     --candidate-id <candidate-id> --observed-at <RFC3339> \
     --reason-code <TIMEOUT|TRANSPORT_ERROR|MISSING_DEFINITE_RESULT>
   ```

5. 성공 응답의 PNG를 임시 로컬 파일로 받은 즉시 ingest합니다. 도구는 PNG 전체 scanline 구조와 3:4를
   decode 검증하고 canonical local 및 별도 backup에 atomic no-clobber 저장한 뒤 양쪽 SHA/size를
   확인합니다. signed URL은 journal에 넣지 않습니다.

   ```bash
   npm run assets:style:v2:ops -- ingest \
     --candidate-id <candidate-id> --input-png </absolute/path/to/downloaded.png>
   ```

6. 새 `balance`를 조회하고 exact 1.50 차감을 기록합니다. 이 단계가 `COMPLETE`가 되기 전에는 다음
   후보 `prepare`가 거부됩니다.

   ```bash
   npm run assets:style:v2:ops -- balance-after \
     --candidate-id <candidate-id> \
     --balance-after <decimal> --observed-at <RFC3339>
   ```

네 후보 완료 뒤 실제 local/backup PNG를 다시 전부 열어 완료 evidence를 만듭니다.

```bash
npm run assets:style:v2:ops -- complete
```

완료 evidence와 provider journal이 canonical JSON이고 실제 local/backup PNG가 다시 모두 검증된 뒤에만
비교 연락표를 만들 수 있습니다. 출력 경로는 전용 allow-list만 허용하고, symlink를 거부하며, 같은
byte 재실행은 성공하고 다른 기존 byte는 덮어쓰지 않습니다.

```bash
npm run assets:style:v2:contact-sheet -- \
  --output docs/asset-runs/contact-sheets/t011-style-v2.html
```

## 완료 evidence 계약

completion은 v2 manifest SHA와 journal SHA, 후보 4개의 정확한 순서·ID를 기록합니다. 각 record는
`preflight`의 `get_cost=true`, job 미생성, fresh 단가/잔액 관찰 시각, paid/preflight request SHA;
`provider`의 invocation/result ID, `generate_image`, request SHA에 묶인 `requested_model`, provider가
실제로 보고한 별도 `provider_reported_model`, `use_unlim=false`, `get_cost=false`, paid request SHA,
제출/완료 시각; `balance_after`; canonical local/backup 상대경로, 동일 PNG SHA-256, byte size,
target aspect `3:4`, 실제 width/height, 계산된 `aspect_error_ppm`, `provider_native_unmodified=true`를
포함합니다. 식별자는 네 호출에서 각각 유일해야 하고 후보와 1:1이어야 합니다.

다음 제출 전에는 직전 후보가 `COMPLETE`여야 하며 backup PNG를 실제로 다시 검증합니다. 각 가격·잔액
관찰은 command 실행 시점 기준 15분 이내여야 합니다. cumulative 비용은 6.00을 넘을 수 없습니다.
completion은 같은 byte 재실행만 허용하고 다른 기존 파일이나 symlink는 덮어쓰지 않습니다.
`get_cost`가 job을 만들면 실제 `job_created=true`·단가·balance, 가격이 바뀌면 실제 단가, balance
차감이 다르면 실제 종료 balance와 계산 delta를 cap 귀속 정보와 함께 terminal record에 원자 저장한
뒤 `FAIL_STOP`합니다. reload 뒤 동일 후보의 `prepare`/`balance-after` 재호출은 거부됩니다.
