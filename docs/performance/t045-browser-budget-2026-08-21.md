# T045 브라우저 성능 예산

- Issue: #47
- 기록일: 2026-08-21
- 정적 mount: `/fictor-test/`
- 실행 명령: `npm run build` 뒤 `npm run smoke:static`

## 고정 예산

| 항목 | hard budget | 최소 목표 여유 | 이전 관찰(T030, 2026-08-15) | T045 최종 관찰 |
|---|---:|---:|---:|---:|
| production JavaScript raw bytes | ≤ 409,600 | ≥ 2,048 bytes | 378,776 (30,824 여유) | PENDING |
| production CSS raw bytes | ≤ 32,768 | ≥ 2,048 bytes | 28,028 (4,740 여유) | PENDING |
| 선택된 fresh profile 초기 image request | 정확히 1 | 해당 없음 | 1 | PENDING |
| 선택 전 race 화면 image request | 정확히 0 | 해당 없음 | 미측정 | PENDING |
| 초기 non-current asset request | 0 | 해당 없음 | 0 | PENDING |
| image preload/modulepreload | 0 | 해당 없음 | 미측정 | PENDING |

예산은 README의 브라우저 지원 범위를 줄이지 않는다. JavaScript와 CSS는 `dist/index.html`이 직접 참조하는
현재 entrypoint의 raw byte 합계이며 gzip 추정치나 stale bundle을 사용하지 않는다.

## 도감 렌더·메모리 경계

smoke는 앱이 먼저 만든 canonical v2 저장을 사용한다. 생성 카탈로그에 존재하는 정렬된 recipe ID 96개를
프로필에 넣고 앱의 decoder가 정상 `IN_COMBAT` 투영으로 다시 연 경우에만 high-discovery 측정을 진행한다.
차단 화면이나 복구 투영이 나오면 측정값으로 인정하지 않고 실패한다.

| 항목 | 판정 |
|---|---:|
| page 1 mounted Codex img | ≤ 48 |
| page 2 mounted Codex img | ≤ 48 |
| page 1→2 누적 Codex image request | ≤ 96 |
| Codex 닫은 뒤 Codex DOM img | 0 |
| 발견 thumbnail 속성 | `loading="lazy"`, `decoding="async"` |
| 현재 화면·FIRST discovery 이미지 | lazy 아님 |

CDP `HeapProfiler.collectGarbage` 뒤 `Runtime.getHeapUsage`의 `usedSize`와 `totalSize`도 JSON 증거에 기록하지만,
헤드리스 Chromium의 heap 값은 환경 편차가 커 hard gate로 사용하지 않는다. 메모리 관찰은 회귀 비교용이며,
mount·request·preload 수가 강제 예산이다.

## 최종 증거 자리

| 값 | 관찰 |
|---|---|
| JavaScript bytes / margin | PENDING |
| CSS bytes / margin | PENDING |
| fresh race / selected profile images | PENDING |
| Codex page 1 / page 2 / cumulative requests | PENDING |
| close DOM / preload | PENDING |
| heap after GC (`usedSize`, `totalSize`) | PENDING — observation only |

이 문서의 PENDING 값은 완료 주장이 아니다. 최종 후보의 build와 smoke를 각각 한 번 실행한 JSON 결과로
채우고, 2 KiB 여유 또는 지원 브라우저 차단 조건이 깨지면 병합하지 않는다.
