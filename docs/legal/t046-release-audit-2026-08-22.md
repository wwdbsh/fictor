# T046 공개 직전 권리·명칭·제출 감사 — 2026-08-22

## 문서 메타데이터

| 항목 | 값 |
| --- | --- |
| Task / Issue | `T046` / `#48` |
| 계약 SHA-256 | `c1088ca8b75f453c3828bf4956780f6827bdd3666b97f1c64f760635a26d0531` |
| 조사 cutoff·접근일 | 2026-08-22 KST (`+09:00`) |
| 기준 소스 revision | merge commit `e0012fdcddb9e2b440db081d90cfa73876aafc93` (T045) |
| 상태 | `AUDIT_COMPLETE_WITH_BLOCKERS` |
| 다음 gate | T047 — 상헌 님의 공개 권리·명칭·AI 표기 결정 |

이 문서는 공개 1차 출처와 로컬 산출물을 대조한 시점 감사다. 법률 자문, 상표 클리어런스 의견,
공개 승인 또는 제출 승인이 아니다. 사실은 관찰 근거가 있는 값, 추론은 그 사실에서 제한적으로 도출한
값, 미확인은 공개 전 닫아야 할 질문으로 분리한다.

## 결론

현재 후보는 **공개 불가**다. 실제 정적 산출물의 AI PNG 625장 전체가 계정 적용 약관·모델 추가 정책
미확인 때문에 비면제 blocker이며, AI 표기 4개 공개 위치가 아직 구현되지 않았다. `FICTOR` 동일 표장의
활성 등록, 배포 번들의 오픈소스 고지 누락, 선택하지 않은 스타일 후보 3장의 배포 포함, 정확한 제출
cutoff·마감 뒤 수정 가능 여부도 T047 또는 공개 전 후속 구현에서 해결해야 한다.

## 실제 빌드·에셋 inventory

T045 merge commit의 기존 `dist/`를 읽기 전용으로 감사했다. 빌드를 다시 만들지 않았다.

| 범주 | `public/` PNG | `dist/` PNG | 근거·상태 |
| --- | ---: | ---: | --- |
| 카드 | 547 | 547 | 재료 52 + canonical 489 + 신의 심장 6; T022 감사 범위 |
| 배경 | 18 | 18 | T022 감사 범위 |
| 적·엘리트 | 36 | 36 | 일반 적 30 + 엘리트 6; T022 감사 범위 |
| 이벤트 | 20 | 20 | T022 감사 범위 |
| 스타일 후보 | 4 | 4 | T011 v2 증거 범위; T022 범위 밖 |
| **합계** | **625** | **625** | T022 621 + 스타일 4 |

- `style/master-candidate-01`은 `SELECTED`다. 후보 02–04는 `NOT_SELECTED`지만 `public` 복사 규칙 때문에
  현재 모두 `dist`에 있다. T047은 이 세 파일의 공개 포함을 명시적으로 결정해야 한다.
- 결정론적 런타임 폴백은 873개다(canonical 미생성 837 + `HEART_FORGE` 36). 이는 PNG 파일이나 새
  외부 에셋이 아니다.
- T022의 `NO_RIGHTS_STATUS_CHANGE`는 그대로다. 바이트·복구·hash 감사가 기존 조건부 권리를 상업 이용
  승인으로 격상하지 않는다.
- `dist`에는 번들 폰트, 오디오, 비디오가 0개다. CSS는 `Georgia`, `Noto Serif KR`, `Batang`,
  `system-ui`, generic serif/sans-serif만 요청하며, 사용자 시스템에 있는 글꼴로 fallback한다.
- 저장소 작성 데이터와 FICTOR 고유 코드는 외부 에셋이 아니다. 생성 카드 JSON은 작성 원본과 결정론적
  생성기의 산출물이지 제3자 데이터셋이 아니다.
- T045 산출물은 630 files, 1,266,270,321 bytes다. T031과 같은
  `<sha256> <bytes> <relative-path>\n` 정렬 목록 방식의 `dist` tree SHA-256은
  `c0076e9a0e311fd7922dfd787b59876173ea80d41e98f1a09270e8bf4247313a`다.

## 배포 오픈소스

`package-lock.json` SHA-256은
`13471a5f8fefa27551d342f9c0d45863cad31677557f528d7039524ff4abe6c4`이며 설치 의존성의 권위 있는
버전 원장이다.

| 실제 배포 코드 | 버전 | 라이선스 | 로컬 원문·SHA-256 | 배포 고지 상태 |
| --- | --- | --- | --- | --- |
| React | 19.2.8 | MIT | `node_modules/react/LICENSE` / `da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93` | 누락 |
| react-dom | 19.2.8 | MIT | 같은 React LICENSE SHA-256 | 누락 |
| scheduler | 0.27.0 | MIT | 같은 React LICENSE SHA-256 | 누락 |
| Vite modulepreload polyfill | Vite 8.2.1 | MIT | `node_modules/vite/LICENSE.md` / `387dd7baa307083401a27c58c362c30832f5ba1dba84f10cc22c33401523f45c` | 누락 |

`dist`에는 제3자 `LICENSE`, `NOTICE`, `COPYING` 파일이 없고 minified JS에도 보존된 license header가 없다.
MIT 고지를 배포물에 보존하지 않은 현재 상태는 release blocker다. T047은 처리 방식을 승인하고, 공개 전
후속 구현은 실제 정적 산출물에 제3자 고지 파일 또는 동등하게 접근 가능한 고지를 포함한 뒤 재감사해야
한다. Vite와 테스트·빌드용 나머지 패키지는 `package-lock.json`에 기록되지만 독립 라이브러리 파일로
`dist`에 복사되지 않는다. 이 분류는 개발 도구 의무를 없앤다는 뜻이 아니라 이번 public artifact의
배포 inventory 경계를 뜻한다.

## Higgsfield·AI 생성물

### 확인된 현재 공개 자료

- [Higgsfield Terms of Use Agreement](https://higgsfield.ai/terms-of-use-agreement)는
  2026-07-26 updated로 표시된다. 기존 이용자에게는 2026-08-27 또는 더 이른 동의 시 적용된다고
  고지한다.
- 현행 Terms §4.4는 출력의 commercial use를 허용하는 방향의 조건을 둔다. §5.5는 관련 법령이
  요구할 때 AI 생성 사실을 고지하고 provider provenance를 훼손하지 않도록 하며, §11.7은 출력을
  사람 생성물이라고 표시하지 말고 법령상 필요한 고지를 하도록 한다.
- [공식 Help Center의 소유·상업 이용 안내](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially)는
  2026-08-02 현재 attribution이 필요 없고 commercial use가 허용된다고 안내한다.
- [Privacy Policy](https://higgsfield.ai/privacy-policy)는 입력·출력 처리 조건을 별도로 둔다.

### 미확인과 판정

이미지는 2026-08-11–14에 생성됐다. 그 시점 계정에 실제 적용된 Terms revision, 조기 동의 여부와
Privacy revision을 확인하지 못했다. 요청 모델 `nano_banana_2`와 provider 보고 모델
`nano_banana_flash`의 관계 및 상위 provider supplemental policy도 확인하지 못했다. 현재 Help Center의
요약을 과거 생성 시점의 권리로 소급하지 않는다. 따라서 **스타일 4장을 포함한 배포 AI PNG 625장
전부가 공개 비면제 blocker**다.

## AI 표기 일관성

T009/T010의 기존 문구는 다음과 같다.

> 카드와 세계 아트는 Higgsfield의 생성형 AI 모델을 활용해 제작했으며, 프롬프트 설계·선별·편집은 FICTOR 제작 과정에서 수행했습니다.

이는 이번 공개 release에 승인된 문구가 아니라 **T047 판단용 초안**이다. `FICTOR` 타이틀 결정과 함께
승인되거나 승인된 새 타이틀로 치환돼야 한다. 요청/보고 모델 불일치가 닫히기 전에는 모델명을 문구에
넣지 않는다. T047 승인 뒤 게임 크레딧, README, 제출 설명, `docs/ASSET_LICENSES.md`의 네 위치에 같은
최종 문구를 적용해야 한다. 현재 `src/`, `README.md`, `dist/`에는 해당 AI 표기가 없으며, 이번 문서
Task에서 UI나 README에 적용하지 않았다.

## 명칭 스크리닝

### 고정된 공개 명칭 목록

| 종류 | 이번 감사의 고정 문자열 | 판정 |
| --- | --- | --- |
| 타이틀 | `FICTOR`, `픽토르` | T047 decision blocker |
| 조어 종족 | `STILLKIN`, `BURNKIN`, `JOINKIN` | KIPRIS exact quick search 0; 제한 검색 통과만 의미 |
| 옛 신 영문명 | `The Stilling`, `The Burning`, `The Scattering`, `The Rotting`, `The Washing`, `The Joining` | 일반 단어 조합이라 quick search가 noisy함; 유사·지정상품 clearance 미완료 |
| 옛 신·종족 한국어명 | `어름`, `사름`, `흩음`, `삭음`, `씻음`, `이음`, `어름붙이`, `사름붙이`, `이음붙이` | 저장소 노출 목록 고정; 정식 clearance 미완료 |
| 일반 게임 용어 | `옛 신`, `조각`, `빚기`, `도감`, `신의 심장`, `터`, `공명` | 넓고 noisy한 일반·신화 표현; 클리어런스 미완료 |

2026-08-22 current quick search 관찰은 다음과 같다.

- USPTO Wordmark `FICTOR`: live registered 3건. serial `79167034`, registration `4868924`, IC009,
  DWS SRL의 활성 표장은 goods가 “Computer software for design of three-dimensional objects”다.
  IC020과 IC028에도 활성 `FICTOR` 표장이 있다.
- KIPRIS quick search `FICTOR`: 4 results. exact `FICTOR` registration `1251481`, IC09, DWS SRL은
  active다.
- KIPRIS quick search `픽토르`: 2 results지만 IC16·IC25이고 abandoned/expired다.
- KIPRIS quick search에 각 문자열 `STILLKIN`, `BURNKIN`, `JOINKIN`을 넣었을 때 각각 0 results.

이는 exact·quick 데이터베이스 screening이다. 유사·음성 표장, 지정상품 전체, common-law 사용, 게임
스토어, 앱 이름, 도메인 검색과 법률 판단은 완료하지 않았다. 따라서 `FICTOR` 유지나 변경 어느 쪽도
이번 감사가 승인하지 않으며 T047의 명시적 결정 없이는 공개할 수 없다.

## 행사 규정·실제 제출 폼

[공식 행사 페이지](https://openaigame2026.com/)와
[한국어 참가 약관](https://openaigame2026.com/ko/terms)을 2026-08-22 KST에 재확인했다. 접수 기간은
2026-08-04–08-26이며 약관은 2026-08-03 시행으로 표시된다.

| 실제 폼 관찰 | 요구·제한 |
| --- | --- |
| 게임 제목 | required; DOM `maxlength=80` |
| 게임 소개 | required; 200자 |
| 플레이 URL | required |
| 썸네일 | required; file accept는 JPEG/PNG. 16:9와 최대 10MB는 UI의 recommendation |
| 데모 URL | optional |
| Codex 활용 서술 | optional; DOM `maxlength=5000` |
| 신청 정보 | Google login/account, 국가, 생년월일, 신청자·팀·연락처, 본선 참석, 동의 항목 필요 |

폼의 개인정보는 제출자가 라이브 폼에 직접 입력한다. 값, 화면 캡처, 네트워크 payload를 저장소나 공개
증거에 캡처·커밋하지 않는다.

공식 페이지 countdown 구현의 `data-target=2026-08-27T00:00:00+09:00`는 8월 26일 KST 종료를
시사한다는 **추론**일 뿐이다. 공개 페이지·약관은 정확한 cutoff나 마감 뒤 수정 가능 여부를 보증하지
않는다. 운영진 또는 실제 제출 상태를 공개 전 재확인한다.

## 공개 blocker 원장과 T047 handoff

| ID | blocker | 종료 증거 |
| --- | --- | --- |
| B-01 | AI PNG 625장의 생성 당시 계정 약관·Privacy·모델 supplemental policy 미확인 | 당시 적용 revision·동의 및 모델 권리 증거, 또는 해당 PNG 전량의 공개 산출물 제외·대체 증거 |
| B-02 | 게임·README·제출 설명·ASSET_LICENSES의 승인된 동일 AI 표기 미구현 | T047 승인 문구와 네 위치 byte 대조 |
| B-03 | `FICTOR` 동일 표장 활성 등록과 확대 명칭 조사 미완료 | T047의 유지/변경 결정과 필요한 추가 조사·수용 기록 |
| B-04 | 배포 OSS MIT license/NOTICE 미포함 | 새 production artifact의 고지 파일/표면 및 번들 대조 |
| B-05 | `NOT_SELECTED` 스타일 후보 02–04도 현재 dist-copied | 제거 또는 공개 포함을 승인한 결정과 새 inventory |
| B-06 | 정확한 제출 cutoff·마감 뒤 수정 가능 여부 미확인 | 운영진/라이브 폼의 dated evidence |

T047은 위 상태를 법적 확실성으로 바꾸는 단계가 아니다. blocker 해소 증거와 잔여 위험을 바탕으로 공개
가능 또는 보류를 상헌 님이 결정하는 gate다. 구현이 필요한 항목은 승인 뒤 별도 범위에서 수정하고 새
정적 산출물을 다시 감사한다.

## 검증 evidence·commands

이번 Task는 문서-only다. T045의 `npm test`, production build, static smoke를 재실행하지 않았고, 이미
병합된 T045 `dist`와 hash를 inventory-read했다. 다음 읽기 전용 검사를 수행했거나 후속 verifier가
그대로 재실행할 수 있다.

```bash
npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts check
npm run assets:style:v2:evidence-check
find public/assets -type f -name '*.png' | wc -l
find dist/assets -type f -name '*.png' | wc -l
find public/assets/{cards,backgrounds,enemies,events,style} -type f -name '*.png'
shasum -a 256 package-lock.json node_modules/react/LICENSE node_modules/react-dom/LICENSE \
  node_modules/scheduler/LICENSE node_modules/vite/LICENSE.md
find dist -type f \( -iname '*license*' -o -iname '*notice*' -o -iname '*copying*' \)
rg -ni '생성형 AI|Higgsfield|AI 모델' src README.md dist
```

스타일 v2 evidence check는 PASS했다(후보 4, evidence SHA-256
`1b633074376cdb8d93dfa738a7a0c5c85d05c74b9b184c29fc94331018859058`). T022 check는 이 구현 단계에서
실행하지 않았고 후속 verifier가 실행해 결과를 PR evidence에 남긴다. 두 명령 모두 외부 호출·생성 없이
tracked evidence와 bytes를 검증한다.

## 문서 영향·rollback

영향은 이 감사 문서, `docs/ASSET_LICENSES.md`, `docs/HACKATHON_RULES.md`,
`docs/SUBMISSION_CHECKLIST.md`에 한정된다. 코드, UI, README, 에셋, 생성 JSON, lockfile과 기존 권리 상태를
바꾸지 않는다. 잘못된 사실은 새 dated audit에서 source·접근일·변경 이유를 기록해 supersede한다. 이
Task 자체를 되돌릴 때는 해당 네 문서 변경만 `git revert`하며, 에셋이나 과거 provenance를 삭제하지 않는다.
