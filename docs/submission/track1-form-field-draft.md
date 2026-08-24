# Track 1 폼 필드 초안

상태: `DRAFT_NON_SUBMITTABLE`

이 문서는 라이브 폼에 복사하기 전 검토할 repository-safe manifest입니다. 폼 접근·입력·전송을 수행했다는 증거가 아니며, 개인정보 값·동의 값·화면·network payload·cookie·session·token을 저장하지 않습니다.

## 필드 분류

- `REPO_SAFE_STATIC`: 프로젝트가 관리하며 저장소에서 검토할 수 있는 정확한 문구
- `FINAL_CANDIDATE_BOUND`: T047 exact artifact 또는 최종 공개 파일·URL이 생긴 뒤에만 채울 값
- `OWNER_LIVE_ENTRY`: 상헌 님이 제출 시 라이브 폼에 직접 입력하며 저장소에는 값을 남기지 않는 항목

## Project-controlled fields

| 필드 | 분류 | exact draft 또는 source | 제한·현재 판정 |
| --- | --- | --- | --- |
| 게임 제목 | `REPO_SAFE_STATIC` | `FICTOR · 픽토르` — canonical source: `src/content/public-names.ts` | 80자 이하; 12 Unicode code points |
| 게임 소개 | `REPO_SAFE_STATIC` | `카드 2장을 빚어 새 카드를 발견하는 조합 기반 로그라이크 덱빌더입니다. 세 붙이의 규칙으로 어름의 터 3단계를 공략합니다. 카드와 세계 아트는 Higgsfield의 생성형 AI 모델을 활용해 제작했으며, 프롬프트 설계·선별·편집은 FICTOR 제작 과정에서 수행했습니다.` — canonical source: `docs/submission/track1-description.ko.json#description_ko` | 200자 이하; 152 Unicode code points |
| 플레이 URL | `FINAL_CANDIDATE_BOUND` | `UNSET` — T049가 T062 exact artifact를 배포한 stable public URL | required; 로그인·설치 없이 접근 가능해야 함 |
| 썸네일 | `FINAL_CANDIDATE_BOUND` | `UNSET` — T048이 T047 exact artifact에서 만든 file path·SHA-256 | required; JPEG/PNG, 16:9, 10MB 이하 목표 |
| 데모 URL | `FINAL_CANDIDATE_BOUND` | `UNSET` — T048이 완성 프로젝트를 capture·upload한 stable URL | 공식 폼에서는 optional이나 프로젝트 소유자가 요구하는 품질 산출물 |
| Codex 활용 서술 | `REPO_SAFE_STATIC` | 아래 exact draft | 5,000자 이하; 320 Unicode code points |

설명 문구는 여기서 임의 수정하지 않습니다. canonical JSON이 바뀌면 이 manifest 복사본의 byte·문자 수를 다시 대조합니다.

## Codex 활용 서술 exact draft

> FICTOR는 Codex와 함께 TypeScript/React 정적 웹 게임으로 개발했습니다. Codex는 52개 재료와 21개 법칙에서 1,326개 canonical 조합을 결정론적으로 생성하는 데이터 파이프라인, 즉석·공방 빚기가 같은 recipe resolver를 공유하는 전투 규칙, 도감과 localStorage 저장, 정적 빌드 검증을 구현·점검했습니다. 사람은 두 카드를 빚어 발견하는 핵심 경험, 세계관과 명칭, 밸런스 경계, 공개 위험 수용 여부를 결정했고 직접 플레이테스트로 최종 후보를 확정합니다. 서버나 런타임 OpenAI API는 사용하지 않습니다.

이 문구는 제출용 draft이며 최종 후보의 실제 구현·검증 기록과 대조한 뒤 T048에서 고정합니다.

## Final-candidate binding

T051 승인은 다음 tuple 전체에 결속합니다. 하나라도 바뀌면 다시 승인받습니다.

```text
game_url
game_revision
production_artifact_sha256
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

- [x] 필드 분류와 repository-safe static 초안을 작성했습니다.
- [x] 현재 알려진 maxlength를 draft 문자 수와 대조했습니다.
- [ ] exact final candidate와 플레이 URL이 고정됐습니다.
- [ ] 썸네일과 완성 프로젝트 데모가 제작·검증됐습니다.
- [ ] T051 exact tuple 승인을 받았습니다.
- [ ] 라이브 폼에 입력·전송했습니다.
