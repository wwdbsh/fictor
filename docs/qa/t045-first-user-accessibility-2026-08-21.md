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
| Chrome/Chromium | VERIFIED — 2026-08-21 | fresh profile, keyboard/focus, reduced motion, FIRST→도감, network/console | PASS |
| Edge | UNVERIFIED — 사용자 호환성 가정 승인 | 동일 수동 경로와 console/network 캡처 | 이번 T045 병합에서 면제 |
| Firefox | UNVERIFIED — 사용자 호환성 가정 승인 | 동일 수동 경로와 console/network 캡처 | 이번 T045 병합에서 면제 |
| Safari | UNVERIFIED — 사용자 호환성 가정 승인 | 동일 수동 경로와 console/network 캡처 | 이번 T045 병합에서 면제 |

2026-08-15 T030의 Chromium smoke PASS는 이전 기준선이며 T045 최종 후보의 실행을 대신하지 않는다.
Chrome 자동 경로는 Chrome for Testing(Puppeteer 25.5.0), 수동 가시 경로는 macOS 26.5.2의
Google Chrome 151.0.7922.172, 1679×1143 CSS px, DPR 1에서 2026-08-21T19:04:47+09:00에 확인했다.
Edge, Firefox, Safari는 검증하지 않았으며 지원 완료로 표기하지 않는다. 2026-08-21 상헌 님이 세 브라우저가
동작한다고 가정하고 병합하라고 명시적으로 승인했으므로, 지원 범위는 유지하되 이번 T045의 수동 증거
gate만 면제한다.

## 수동 확인 기록

| 항목 | 관찰값 | 상태 |
|---|---|---|
| Chrome/Chromium 최종 smoke | fresh race image 0, selected profile image 1, FIRST→도감, console/network 오류 0 | PASS |
| 키보드 첫 경로·공방 focus | H1→Tab→붙이 선택, 공방 H2 진입, Escape 뒤 정확한 opener 복귀 | PASS |
| reduced motion FIRST FINAL | headless Chrome에서 즉시 FINAL과 이름 있는 계속 버튼 확인 | PASS |
| 가시 layout | 첫 여정 guide와 journey rail overlap `false`, 첫 전투 guide가 적·행동 control을 가리지 않음 | PASS |
| Edge | 미실행 | USER-ACCEPTED ASSUMPTION |
| Firefox | 미실행 | USER-ACCEPTED ASSUMPTION |
| Safari | 미실행 | USER-ACCEPTED ASSUMPTION |

자동 검증이 PASS해도 보조기기별 읽기 순서와 실제 브라우저 렌더링 차이를 모두 증명하지는 않는다.
미실행 세 브라우저는 병합 차단에서 해제됐지만 검증 공백과 release risk로 계속 기록한다.
