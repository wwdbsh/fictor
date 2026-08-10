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
npm run gen:data     # T002 무작성 scaffold 상태 출력
npm test             # Vitest 테스트
npm run typecheck    # TypeScript 검사
npm run build        # 타입 검사 후 dist/ 정적 빌드
npm run smoke:static # 기존 dist/를 실제 Chromium에서 검사
npm run verify       # 데이터 scaffold, 테스트, 빌드, 브라우저 smoke 전체 검증
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

`cards.generated.json`과 `equipment.generated.json`은 생성물이므로 직접 편집하지 않습니다. 현재 `npm run gen:data`는 **T002 scaffold**이며 구조화된 무작성 결과만 출력합니다. 실제 원본 데이터와 결정론적 생성기는 T004에서 이 scaffold를 교체합니다.

## 구현 문서

- [구현 지시서](fictor-codex-spec.md)
- [게임 설계서](game-design-doc.md)
