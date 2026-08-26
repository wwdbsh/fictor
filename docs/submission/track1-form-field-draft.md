# Track 1 폼 필드 초안

상태: `READY_FOR_T050_QA_AND_T051_APPROVAL`

이 문서는 라이브 폼에 복사하기 전 검토할 repository-safe manifest입니다. 폼 접근·입력·전송을 수행했다는 증거가 아니며, 개인정보 값·동의 값·화면·network payload·cookie·session·token을 저장하지 않습니다.

## 필드 분류

- `REPO_SAFE_STATIC`: 프로젝트가 관리하며 저장소에서 검토할 수 있는 정확한 문구
- `FINAL_CANDIDATE_BOUND`: T047 exact artifact 또는 최종 공개 파일·URL이 생긴 뒤에만 채울 값
- `OWNER_LIVE_ENTRY`: 상헌 님이 제출 시 라이브 폼에 직접 입력하며 저장소에는 값을 남기지 않는 항목

## Project-controlled fields

| 필드 | 분류 | exact draft 또는 source | 제한·현재 판정 |
| --- | --- | --- | --- |
| 게임 제목 | `REPO_SAFE_STATIC` | `FICTOR · 픽토르` — canonical source: `src/content/public-names.ts` | 12 Unicode code points, 19 UTF-8 bytes, SHA-256 `777eefc392dba8d7b8613d6dcd5bb17ecd6ae9ac1e84b2fd865df2f1f3ae9f24`; 80자 이하 |
| 게임 소개 | `REPO_SAFE_STATIC` | `카드 2장을 빚어 새 카드를 발견하는 조합 기반 로그라이크 덱빌더입니다. 세 붙이의 규칙으로 어름의 터 3단계를 공략합니다. 카드와 세계 아트는 Higgsfield의 생성형 AI 모델을 활용해 제작했으며, 프롬프트 설계·선별·편집은 FICTOR 제작 과정에서 수행했습니다.` — canonical source: `docs/submission/track1-description.ko.json#description_ko` | 152 Unicode code points, 344 UTF-8 bytes, SHA-256 `72db82afa86602ecb9a0629312915cad4551bb7b297c0aaa03903ebc59108987`; 200자 이하 |
| 플레이 URL | `FINAL_CANDIDATE_BOUND` | `https://project-702iz-sandy.vercel.app/` | required; `PLAYABLE_URL_BOUND_T050_QA_NOT_RUN` |
| 썸네일 | `FINAL_CANDIDATE_BOUND` | `docs/submission/track1-thumbnail.png` — SHA-256 `85ff9c858e85a52b1e7d7d80cad632c5a16a0d6eebf56996650160657bad36ac` | PNG, 1280×720, 16:9, 1,966,209 bytes |
| 데모 URL | `FINAL_CANDIDATE_BOUND` | empty string (0 Unicode code points, 0 UTF-8 bytes) | optional; `DEMO_OPTIONAL_NOT_SUBMITTED_TIMEBOX_DEFERRED` |
| Codex 활용 서술 | `REPO_SAFE_STATIC` | 아래 exact value | 319 Unicode code points, 642 UTF-8 bytes, SHA-256 `e0f7af59959d57673fd124994b602d4aa998133f061eebdeda6fff39dae77b56`; 5,000자 이하 |

설명 문구는 여기서 임의 수정하지 않습니다. canonical JSON이 바뀌면 이 manifest 복사본의 byte·문자 수를 다시 대조합니다.

## Codex 활용 서술 exact value

> FICTOR는 Codex와 함께 TypeScript/React 정적 웹 게임으로 개발했습니다. Codex는 52개 재료와 21개 법칙에서 1,326개 canonical 조합을 결정론적으로 생성하는 데이터 파이프라인, 즉석·공방 빚기가 같은 recipe resolver를 공유하는 전투 규칙, 도감과 localStorage 저장, 정적 빌드 검증을 구현·점검했습니다. 사람은 두 카드를 빚어 발견하는 핵심 경험, 세계관과 명칭, 밸런스 경계, 공개 위험 수용 여부를 결정하고 최종 공개·제출 승인 경계를 관리했습니다. 서버나 런타임 OpenAI API는 사용하지 않습니다.

이 문구는 T048 제출 패키지의 exact value입니다. 실제 라이브 폼 반영은 T051 승인 뒤 별도 Task에서만 수행합니다.

## Final candidate와 challenge scope

| 항목 | exact value |
| --- | --- |
| repository base | `fd92ae54cf792e77e03431f743573b1669e674b3` |
| game candidate revision | `f434656cdf3fce0fa35e8598169da6b678cdf627` |
| production deployment | `dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC` |
| production artifact tree SHA-256 | `43ee3cbcc3c5b3681890ba3082fb882b1b89dfb564003d1cd23dfb7746df1b0e` |
| production artifact inventory | 628 files, 1,261,180,248 bytes |
| first tracked commit | `3fa3e69597e51c305ecbe24b570fe80a4a465b7f` / `2026-08-10T20:12:57+09:00` |

챌린지 기간 신규 범위는 위 first tracked commit부터 저장소 이력으로 입증됩니다. 그 이전의 pre-repository 기획 범위와 시점은 이 저장소만으로 입증하지 않습니다.

## 썸네일 provenance

- source: `public/assets/backgrounds/background__still__depth_01.png`
- source manifest: `assets/manifests/t022-m2-assets-audit-v1.json`
- source SHA-256: `7a67c4cc17bafcedd522ffa45273e3420b539289509d7756a7127e89d491a0be`
- transform: crop only, `crop=1280:720:48:24`; scale·repaint·새 이미지 생성 없음
- tool: `ffmpeg version 8.1.2`, metadata stripped, bitexact flags, single-threaded PNG encoder
- result: `docs/submission/track1-thumbnail.png`, 1280×720, SHA-256 `85ff9c858e85a52b1e7d7d80cad632c5a16a0d6eebf56996650160657bad36ac`

## Final-candidate binding

T051 승인은 다음 tuple 전체에 결속합니다. 하나라도 바뀌면 다시 승인받습니다.

```text
game_url
game_candidate_revision
production_artifact_tree_sha256
demo_url
demo_video_sha256
thumbnail_sha256
title_text_sha256
description_text_sha256
codex_narrative_sha256
submission_package_sha256
```

## Owner live entry

아래 값은 모두 `OWNER_LIVE_ENTRY`입니다. 저장소에는 상태와 분류만 남기며 값·화면·payload를 기록하지 않습니다.

- Google login/account
- 국가와 생년월일
- 신청자 이름·팀 정보·대표자 정보
- 이메일·전화번호 등 연락처
- 본선 참석 응답
- 약관·개인정보·홍보 사용 등 동의 checkbox
- 라이브 폼이 추가로 요구하는 개인 식별 값

## 현재 gate

- [x] 필드 분류와 repository-safe exact value를 작성했습니다.
- [x] 현재 알려진 maxlength를 exact value의 문자 수와 대조했습니다.
- [x] exact final candidate와 플레이 URL을 T049/T062 증거에 결속했습니다. URL QA는 T050에서 수행합니다.
- [x] 기존 production 에셋의 crop-only 썸네일을 제작·검증했습니다.
- [x] optional 데모는 빈 값과 `DEMO_OPTIONAL_NOT_SUBMITTED_TIMEBOX_DEFERRED` disposition으로 고정했습니다.
- [x] PII-free 제출 패키지 manifest와 detached SHA-256을 만들었습니다.
- [ ] T051 exact tuple 승인을 받았습니다.
- [ ] 라이브 폼에 입력·전송했습니다.
