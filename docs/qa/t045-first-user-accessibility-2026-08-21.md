# T045 첫 사용자·접근성 QA

- Issue: #47
- 기록일: 2026-08-21
- 대상: 정적 Track 1 데스크톱 빌드
- 지원 범위: README에 선언한 최신 Chrome, Edge, Firefox, Safari를 그대로 유지한다.

## 첫 사용자 경로

격리된 빈 `localStorage`에서 다음 순서를 확인한다.

1. 붙이 선택 화면은 이미지를 요청하지 않고 H1에 초기 초점을 둔다.
2. 붙이를 고르면 현재 깊이 배경 한 장만 보이며, 첫 여정 안내가 다음 기록과 유료 공방의 `연료 1 · 재료 영구 소모 · 결과 덱 편입`을 설명한다.
3. 유료 공방을 연 정확한 버튼에서 panel H2로 초점이 이동한다. 닫기와 Escape는 모두 그 버튼으로 초점을 되돌린다.
4. 첫 전투 안내가 턴 시작, 카드 사용, 턴 종료를 설명한다. Stillkin/Burnkin은 재료 두 장, Joinkin은 세 장을 안내하고 즉석 결과와 재료의 전투 한정 수명 및 첫 도감 기록을 설명한다.
5. reduced motion에서 FIRST 발견은 완전한 FINAL 정보와 이름 있는 계속 버튼을 제공한다. 도감은 발견 1건과 이름 있는 닫기·페이지 컨트롤을 제공한다.
6. 저장 차단은 `alert`, 저장 실패 feedback은 `alert`, 빈 손패와 빈 도감은 `note`로 의미를 잃지 않는다.

자동 회귀는 `tests/App.test.tsx`, `tests/races/race-selection.test.tsx`,
`tests/presentation/accessibility-contrast.test.ts`와 `scripts/smoke-static.mjs`에 있다.

## 브라우저 지원 판정표

| 브라우저 | T045 최종 후보 상태 | 요구 증거 | 병합 판정 |
|---|---|---|---|
| Chrome/Chromium | PENDING — 최종 smoke 전 | fresh profile, keyboard/focus, reduced motion, FIRST→도감, network/console | 실행 PASS 뒤에만 VERIFIED |
| Edge | UNVERIFIED | 동일 수동 경로와 console/network 캡처 | 명시적 merge blocker |
| Firefox | UNVERIFIED | 동일 수동 경로와 console/network 캡처 | 명시적 merge blocker |
| Safari | UNVERIFIED | 동일 수동 경로와 console/network 캡처 | 명시적 merge blocker |

2026-08-15 T030의 Chromium smoke PASS는 이전 기준선이며 T045 최종 후보의 실행을 대신하지 않는다.
최종 검증자는 Chrome/Chromium 행을 실제 명령 결과와 관찰 시각으로 갱신해야 한다. Edge, Firefox,
Safari를 검증하지 않은 채 지원 대상에서 제거하거나 지원 완료로 바꾸지 않는다.

## 수동 확인 기록

| 항목 | 관찰값 | 상태 |
|---|---|---|
| Chrome/Chromium 최종 smoke | 최종 후보에서 기록 | PENDING |
| 키보드-only 첫 발견 | 최종 후보에서 기록 | PENDING |
| reduced motion FIRST FINAL | 자동 smoke 포함, 최종 실행값 기록 | PENDING |
| Edge | 미실행 | BLOCKER |
| Firefox | 미실행 | BLOCKER |
| Safari | 미실행 | BLOCKER |

자동 검증이 PASS해도 보조기기별 읽기 순서와 실제 브라우저 렌더링 차이를 모두 증명하지는 않는다.
미실행 브라우저는 잔여 위험이 아니라 명시적인 병합 차단 항목으로 유지한다.
