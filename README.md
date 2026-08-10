# fictor

OpenAI Game Builders Seoul 2026 출품을 위한 게임 프로젝트입니다.

## 참가 범위

- 브라우저에서 바로 실행되는 웹 빌드를 제출해야 합니다.
- 개발 과정에서 Codex를 사용해야 합니다. 런타임 OpenAI API 연동은 요구되지 않습니다.
- 팀은 3명 이하이며, 본선에는 대표자 1명이 참석합니다.
- Track 1 접수 기간은 2026-08-04–2026-08-26입니다. 공개 규정에 정확한 마감 시각은 안내되어 있지 않습니다.
- 기존 프로젝트를 활용할 수 있지만, 챌린지 기간에 새로 만든 범위를 제출 자료에 명시해야 합니다.

## 문서

- [공식 규칙 요약](docs/HACKATHON_RULES.md)
- [제출 체크리스트](docs/SUBMISSION_CHECKLIST.md)
- [Codex 사용 기록 템플릿](docs/CODEX_USAGE_LOG.md)
- [에셋·라이선스 기록 템플릿](docs/ASSET_LICENSES.md)

## 개발 환경

- Node.js 22.22.1 (`.nvmrc`)
- npm 10.9.4
- 지원 브라우저: ES2022를 지원하는 최신 Chrome, Edge, Firefox, Safari

```bash
nvm use
npm ci
```

## 명령어

```bash
npm run dev          # Vite 개발 서버
npm run gen:data     # canonical 카드 1,326개와 장비 상세 45개를 결정론적으로 생성
npm run gen:data:check # 커밋된 생성물이 원본·생성기와 byte 단위로 일치하는지 검사
npm run review:names  # 이름 검수 CSV 재생성 및 최초 PENDING 결정 파일 생성
npm run review:names:check # 이름 검수 산출물·결정 target freshness 검사
npm run review:names:check -- --require-closed # T006 최종 종료 게이트
npm test             # Vitest 테스트
npm run typecheck    # TypeScript 검사
npm run build        # 타입 검사 후 dist/ 정적 빌드
npm run smoke:static # 기존 dist/를 실제 Chromium에서 검사
npm run verify       # 생성물 freshness, 테스트, 빌드, 브라우저 smoke 전체 검증
```

개발 서버는 `npm run dev`로 실행합니다. 제출용 빌드는 `npm run build`로 만들며, 생성된 `dist/`는 별도 런타임 서버 없이 정적 파일 호스트에 배포할 수 있습니다. 로컬에서 정적 결과를 직접 확인하려면 `npx vite preview`처럼 정적 파일을 제공하는 도구를 사용할 수 있습니다.

이 애플리케이션은 런타임 서버, 외부 API, 로그인, 환경 변수 비밀값에 의존하지 않습니다. 이후 진행 저장은 브라우저 `localStorage`를 사용합니다.

GitHub Actions의 정적 브라우저 smoke는 격리된 호스팅 러너에서만 Chromium sandbox 비활성화를 명시적으로 허용합니다. 로컬 실행은 기본 Chromium sandbox를 유지하며, smoke 대상 서버는 `127.0.0.1` 임시 포트에만 열립니다.

## 코드 경계

`src/main.tsx`는 유일한 composition root입니다. 의존 방향은 다음과 같습니다.

```text
main (composition root)
  → presentation / application / concrete adapters
  → domain
```

- `domain`: 프레임워크 독립 게임 규칙과 타입. React, DOM, `localStorage`, 네트워크에 의존하지 않습니다.
- `data`: 사람이 작성하는 원본과 생성된 카탈로그의 접근 경계입니다.
- `application`: 도메인 규칙을 조율하는 유스케이스 경계입니다.
- `persistence`: `localStorage` 같은 구체 저장 어댑터 경계입니다.
- `presentation`: React 화면 경계입니다.
- `assets`: 정적 에셋 참조 경계입니다.

손으로 작성하는 데이터 원본은 `src/data/source/materials.json`(52), `laws.json`(21),
`resultClasses.json`(34) 세 파일뿐입니다. JSON Schema 객체, 재사용 가능한 의미 validator와 준비 상태
검사는 `src/data/schema/`, 카디널리티·canonical 쌍·참조·문체 검증은 `tests/data/`에 있습니다.
`npm test`로 함께 검증합니다. T004가 추가할 generated JSON은 이 세 source와 별도의 생성물입니다.
검증 코드는 52개 이름이나 21개 Law 표를 복제하지 않고 ID 생성 규칙과 source 간 관계만 검사합니다.

`src/data/generated/cards.generated.json`과 `equipment.generated.json`은 생성물이므로 직접 편집하지
않습니다. `npm run gen:data`는 세 원본의 schema·semantic 검증 뒤 고정 경로에 atomic write하고,
`npm run gen:data:check`는 파일을 쓰지 않은 채 stale·tamper 여부를 byte 단위로 검사합니다.

두 파일은 `schema_version: 1`, `generator_version: "canonical-v1"`, `count`, `items`와 두 SHA-256을
가진 envelope입니다. `source_hash`는 `materials → laws → resultClasses` 고정 순서의 canonical JSON,
`content_hash`는 각 `items` payload의 canonical JSON을 해시합니다. 타임스탬프와 난수는 없습니다.
`equipment.generated.json`은 메인 카드의 장비 45개를 참조하는 상세 view이며 별도 결과나 아트를
선언하지 않습니다.

이름 검수 규칙, v1 결정 archive, source 변경 뒤 rebaseline 절차와 T006 handoff는
[이름 검수 패키지 안내](docs/reviews/README.md)에 있습니다. 현재 target과 hash는 문서에 복사하지
않으며 [live 결정 파일](docs/reviews/name-review.decisions.json)과
`npm run review:names:check` 출력에서 확인합니다. live v2 결정은 새 검수의 `PENDING` 시작점이며
최종 승인을 뜻하지 않습니다.

## 구현 문서

- [구현 지시서](fictor-codex-spec.md)
- [게임 설계서](game-design-doc.md)
