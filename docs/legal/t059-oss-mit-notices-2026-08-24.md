# T059 배포 OSS MIT 고지 — 2026-08-24 KST

## 판정

`B-04 구현 PASS`다. 실제 배포 런타임에 포함되는 React 계열과 Vite의 lockfile 버전, 설치 원문
경로·SHA-256, MIT 블록을 하나의 별도 정적 파일 `public/THIRD_PARTY_NOTICES.txt`로 고정했다.
빌드 훅은 이 파일을 생성하지 않고 regular-file·symlink·byte hash를 확인한 뒤 staging과 `dist`에
그대로 복사한다. 최종 production `dist` 재감사와 전체 빌드·static smoke는 T062에서 한 번 수행한다.

## 고지 inventory

| package | package-lock 버전 | 설치 원문 경로 | 원문 SHA-256 | 고지 블록 |
| --- | --- | --- | --- | --- |
| `react` | `19.2.8` | `node_modules/react/LICENSE` | `da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93` | `react-mit-canonical-v1` |
| `react-dom` | `19.2.8` | `node_modules/react-dom/LICENSE` | `da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93` | `react-mit-canonical-v1` |
| `scheduler` | `0.27.0` | `node_modules/scheduler/LICENSE` | `da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93` | `react-mit-canonical-v1` |
| `vite` | `8.2.1` | `node_modules/vite/LICENSE.md` | `387dd7baa307083401a27c58c362c30832f5ba1dba84f10cc22c33401523f45c` | `vite-mit-full-v1` |

`package-lock.json` SHA-256은
`13471a5f8fefa27551d342f9c0d45863cad31677557f528d7039524ff4abe6c4`로 고정하며 이 Task에서
lockfile이나 package 버전을 변경하지 않았다. React·react-dom·scheduler는 설치 원문이 byte-identical한
1088-byte canonical MIT block 하나를 세 record에 명시적으로 매핑한다. Vite의 112425-byte
`LICENSE.md`는 별도 block으로 전체를 보존한다.

## 파일·검증 경계

- 유일한 법적 artifact는 `/THIRD_PARTY_NOTICES.txt`다. PNG allowlist의 622장 수량에는 포함하지 않는다.
- source → release staging → `dist` 경로와 SHA-256을 단계별로 대조하고 missing, tampered, symlink,
  non-regular file, unexpected legal file을 fail-closed로 거부한다.
- `style/master-candidate-02~04`는 기존 T060 evidence-only 경계를 유지한다.
- 정적 게임 화면에는 `제3자 라이선스 고지` native anchor가 race selection과 gameplay 각각의 상태에서
  정확히 하나만 표시된다. `BASE_URL` 하위 경로를 보존하고 새 탭·`tabindex`를 사용하지 않으며
  keyboard `:focus-visible`을 제공한다.

## 집중 증거

| 검사 | 결과 |
| --- | --- |
| `npx vitest run tests/legal/third-party-notices.test.ts --reporter=dot` | PASS |
| `npx vitest run tests/assets/release-public-assets.test.ts --reporter=dot` | PASS |
| `npx vitest run tests/races/race-selection.test.tsx --reporter=dot` | PASS (T059 link assertions 포함) |
| `npm run typecheck -- --pretty false` | PASS |
| 전체 `npm test` | 로컬 수동 실행하지 않음. PR #115의 저장소 자동 `verify` run 2개는 exact commit `74a4daf`에서 PASS |
| production build / `dist` inventory / static smoke | PR #115 자동 `verify`는 PASS. T062의 최종 exact-candidate 재검증과 B-01~B-06 재감사는 그대로 예약 |

## 범위 밖

이 기록은 dependency 업그레이드·교체, AI 에셋 권리·표기, T057 명칭, 공개 release·배포·제출을
결정하지 않는다. T062는 exact production artifact에서 고지 파일과 622 PNG, 미선택 후보 제외를
독립적으로 다시 확인해야 한다.
