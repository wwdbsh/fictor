# FICTOR · 픽토르

`FICTOR · 픽토르`는 OpenAI Game Builders Seoul 2026 출품을 위한 조합 기반 로그라이크 덱빌더입니다.

공개 종족 명칭은 `Stillkin · 어름붙이`, `Burnkin · 사름붙이`, `Joinkin · 이음붙이`입니다. 옛 신 명칭은 `The Stilling · 어름`, `The Burning · 사름`, `The Scattering · 흩음`, `The Rotting · 삭음`, `The Washing · 씻음`, `The Joining · 이음`입니다. 명칭 유지와 잔여 위험 수용은 [T057 공개 명칭 결정](docs/decisions/t057-public-naming-decision-2026-08-24.md)에 기록했습니다.

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
- [T045 첫 사용자·접근성 QA](docs/qa/t045-first-user-accessibility-2026-08-21.md)
- [T045 브라우저 성능 예산](docs/performance/t045-browser-budget-2026-08-21.md)
- [T057 공개 명칭 결정](docs/decisions/t057-public-naming-decision-2026-08-24.md)

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
npm run milestone:phase0:check # 불변 M1 Phase 0 데이터 기준선 전체 대응 검사
npm test             # Vitest 테스트
npm run typecheck    # TypeScript 검사
npm run build        # 타입 검사 후 dist/ 정적 빌드
npm run smoke:static # 기존 dist/를 실제 Chromium에서 검사
npm run verify       # 생성물 freshness, 테스트, 빌드, 브라우저 smoke 전체 검증
npx tsx scripts/t031-m3-candidate-audit-cli.ts audit # T031 dist/secret 후보 감사(읽기 전용)
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
`npm run review:names:check` 출력에서 확인합니다. live v2 결정은 전 행 검수와 flagged 8건의 명시적
승인을 담은 `APPROVED` 종료 상태입니다.

M1 Phase 0의 최종 데이터와 승인 대응은 [불변 데이터 마일스톤](docs/milestones/README.md)에
고정되어 있습니다. `npm run milestone:phase0:check`는 기록된 경로·수량·hash뿐 아니라 실제 source,
재생성 catalog, CSV ID·이름, effective 승인 상태 1,326건을 쓰기 없이 함께 검증합니다.

T031 M3 후보는 [마일스톤 문서](docs/milestones/README.md)의 candidate Commit A → evidence Commit B
신뢰 경계를 따릅니다. 실제 수동 완주 영상이 없는 candidate는 완료 증거로 기록하지 않습니다.

### macOS 테스트 임시 디렉터리 복구

테스트 임시 root의 소유권은 [`tests/helpers/owned-temp.ts`](tests/helpers/owned-temp.ts)가 관리합니다.
대상 테스트는 `fictor-...-` prefix를 가진 root만 현재 OS 임시 디렉터리 아래에서 만들고, test-owned root는
`onTestFinished`, suite-owned root는 `afterAll`에서 정리합니다. 정리 전에는 생성 시점의 directory/device/inode
identity를 다시 확인하며, symlink·타입 변경·identity 불일치가 있으면 해당 root를 삭제하지 않고 전체 실패로
집계합니다. 테스트 출력에는 절대경로 없는 `FICTOR_TEMP_AUDIT` JSON이 남고, 정상 불변식은
테스트 PASS, `created_roots === cleaned_roots`, `remaining_roots: 0`, `remaining_bytes: 0`,
`cleanup_failures: 0`, `diagnostic_failures: 0`입니다.

임시 root 회귀 검증은 항상 새로 만든 격리 `TMPDIR`에서 실행하십시오. 기존 macOS `$TMPDIR`에서 전체 suite를
실행하거나 광역 `fictor-*` glob으로 삭제하지 마십시오. 현재 `$TMPDIR`의 baseline을 조사·삭제하는 절차는 코드
수정 및 실제 임시 디렉터리 검증이 끝난 뒤 별도 승인된 작업으로만 수행합니다.

T015 v4 회귀 테스트는 macOS 사용자 임시 디렉터리에 테스트 전용 fixture를 만들고 테스트 종료 시
자동 삭제합니다. 강제 종료 뒤 잔여물을 확인할 때는 먼저 모든 Vitest 프로세스가 끝났는지 확인한 다음,
정확한 T015 접두사만 미리 출력합니다.

```bash
pgrep -fl 'vitest|canonical-shard-1-production-v4'
fictor_tmp_root="$(getconf DARWIN_USER_TEMP_DIR)"
find "$fictor_tmp_root" -maxdepth 1 -type d \( \
  -name 'fictor-t015-v4-*' -o \
  -name 'fictor-t015-v4-anchor-*' -o \
  -name 'fictor-t015-v4-lock-*' -o \
  -name 'fictor-t015-v43-*' \
\) -print
```

출력은 조사 전용이며 삭제를 수행하지 않습니다. 실제 정리는 별도로 검토된 도구에서만 수행해야 하며,
고정된 exact manifest의 path/device/inode/mtime 재확인, symlink·일반 디렉터리 확인, `lsof` 성공 및
열린 handle 0 확인을 모두 통과해야 합니다. 하나라도 불일치하면 전체 abort하며, 실시간 광역 glob 삭제는
금지합니다. 이 절차는 `/private/tmp`, `fictor-t028-*`, `showcase-capture`, 저장소의 `assets/runs` 또는
`assets/backups`를 정리하지 않습니다.

## 구현 문서

- [구현 지시서](fictor-codex-spec.md)
- [게임 설계서](game-design-doc.md)
