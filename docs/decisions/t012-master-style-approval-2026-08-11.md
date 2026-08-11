# T012 마스터 스타일 승인 결정 — 2026-08-11

## 결정

상헌 님은 `2026-08-11T12:05:07.373Z`에 정확히 **“후보 1 채택”**이라고 결정했다. 따라서 T011의
`style/master-candidate-01` 한 장만 FICTOR의 로컬 마스터 매체 참조로 승인한다. 후보 2–4는
`NOT_SELECTED`이며 섞어 쓰지 않는다.

결정 계약 SHA-256은
`33a89a7632127a88b4176f71ab05fc72447d1a779e04024a650f67ffb1869d5c`, canonical 결정 manifest는
`assets/manifests/master-style-v1.json` (SHA-256
`b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d`)이다.

## 선택 증거 결속

| 항목 | 값 |
|---|---|
| T011 v2 manifest | `67b84dcab57f5197112fb81c3134afc329f55f0b4580030e6a05c044cfce27bf` |
| T011 actual-run evidence | `1b633074376cdb8d93dfa738a7a0c5c85d05c74b9b184c29fc94331018859058` |
| T011 contact sheet | `5bfb09cbd4684d7833299d19f276fc04bf01322433f798fa78385322d920ee29` |
| candidate / path | `style/master-candidate-01` / `style/master-candidate-01.png` |
| 원본 PNG | `3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3`, 1,618,931 bytes |
| 원본 크기 | target `3:4`, 실제 `896x1200`, 오차 `4445ppm`, provider-native bytes 무변형 |
| 모델 | 요청 `nano_banana_2`, provider 보고 `nano_banana_flash` (alias라고 추정하지 않음) |
| job | `e0f36c95-2e1b-4e38-9931-7e10e562f209` |
| immutable core-v1 | `54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f` |

로컬 reference element는 `fictor-copperplate-media-master`, revision `1`, kind
`LOCAL_MASTER_IMAGE`다. provider media/reference ID는 모두 `null`이고 상태는 `NOT_REGISTERED`다.
업로드·provider binding·crop·resize는 T013으로 미룬다. 다른 bytes를 사용하려면 새 binding revision과
상헌 님의 재승인이 모두 필요하다.

## 잠금 범위

`MEDIA_ONLY`로 다음 시각 언어만 고정한다.

- 17세기 동판화 관찰 도판, 가는 윤곽선
- 형태를 따르는 절제된 평행 해칭
- 종이가 드러나는 하이라이트를 남긴 제한적 교차 해칭
- 면 채움보다 선이 이끄는 명암, 작은 크기에서도 선명한 실루엣
- 미세한 고색 질감

참조 지시는 다음 한 문장으로 고정한다.

> Use this local master image as a MEDIA_ONLY reference for 17th-century copperplate line treatment; do not copy its subject, geometry, pose, composition, whitespace, colors, paper tone, density, representation, or aspect ratio.

피사체, 난형 몸체, 구멍, 팔다리·발·개수·자세·기하, 중앙 배치와 여백을 포함한 asset-class별 구도,
마젠타, 크림 종이, 속성 accent color, density tier, 네 paper tone, `SOLID`/`PHENOMENON`, 카드 `3:4`와
풍경 `16:9`는 계속 변주해야 한다. 후보 1의 다리 수가 prompt와 다른 점은 기록하지만 매체 스타일 승인과
무관하며 복제 대상이 아니다.

금지 항목은 후보 2–4 혼합, plate border/frame/mat/shadow, text/logo/brand/people/UI/watermark,
photoreal/3D/painterly/full-color drift, thumbnail 실루엣을 무너뜨리는 과밀 해칭, 재승인 없는 reference
revision 변경이다.

## 다음 단계

T012는 로컬 결정 기록만 만들며 이미지 생성·업로드를 수행하지 않았다. T013은 이 revision에 맞는
provider reference 역할·schema와 현재 비용·예산 계획이 준비될 때까지 `BLOCKED`다.

또한 T011의 사용자 승인·위험 수용은 **정확히 스타일 후보 4장에만** 적용되며 T013의 재료 52장으로
승계되지 않는다. 현재 52장은 `NOT_AUTHORIZED`다. T013 authorization을 열려면 새 manifest revision에서
다음 둘 중 하나를 충족해야 한다.

1. T013 재료 52장 범위의 T010 policy revision을 승인하고 T011 preflight를 해당 범위로 전부 다시 검증한다.
   재검증 항목은 계정 적용 Terms/Privacy, Google supplemental terms와 provider 조건, 학습 사용과 MCP
   privacy opt-out, reference 입력 권리, 공개 기본값과 attribution, 정확한 credit 만료 시각·시간대, 현재
   model·가격·balance, `use_unlim=false`, 현재 batch limit/topology, 생성 직후 local 및 별도 backup 회수다.
2. 현재 관찰 위험을 먼저 공개한 뒤 **정확히 T013 재료 52장에 한정된** 새 사용자 위험 승인을 받는다.

두 경로는 현재 모두 `NOT_SATISFIED`이며 authorization 결과도 `false`다. provider reference schema와 현재
cost/budget 조건은 어느 경로에서도 별도로 충족해야 한다. 이 결정은 T013 실행 승인이나 재료 52장 생성
승인이 아니다.

검증 명령:

```bash
npm run assets:master-style:check
```
