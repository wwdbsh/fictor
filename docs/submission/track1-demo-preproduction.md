# Track 1 완성 프로젝트 데모 프리프로덕션

상태: `DRAFT_NON_SUBMITTABLE` / `PREPRODUCTION_ONLY`

공식 폼의 데모 URL은 optional이지만 FICTOR에서는 owner-required 품질 산출물로 취급합니다. 이 문서는 storyboard·script·shot checklist만 준비합니다. 지금은 capture·edit·upload·host/account 설정을 수행하지 않습니다.

## Final-only binding

최종 데모는 상헌 님의 직접 플레이테스트가 `NO_CHANGE_REQUIRED`로 닫히거나 그 결과의 bounded change Tasks가 모두 완료되고, T062가 재감사한 exact commit·production artifact를 T047이 공개 release로 승인한 뒤에만 제작합니다. 이후 gameplay·content·data·build config·lockfile·art byte가 바뀌면 기존 촬영 승인은 무효이며 플레이테스트와 T062부터 다시 확인합니다.

## Storyboard와 script

목표 길이: 75–90초. 음성은 필수가 아니며 아래 문구는 사람이 읽거나 자막으로 사용할 초안입니다. TTS나 새 음악을 만들지 않습니다.

| 구간 | 화면 | script draft |
| --- | --- | --- |
| 0–6초 | FICTOR 타이틀과 시작 화면 | `카드 두 장을 빚어, 전에 없던 한 장을 발견합니다.` |
| 6–16초 | 붙이와 터 선택, 첫 덱 확인 | `세 붙이는 서로 다른 규칙으로 여섯 터를 탐사합니다.` |
| 16–35초 | 전투에서 두 재료 선택 → 재료가 타고 결과가 뒤집히는 첫 발견 | `즉석 빚기는 전투 안에서 조합을 시험합니다. 발견한 결과와 recipe는 도감에 남습니다.` |
| 35–48초 | 도감의 발견 항목과 새 런 공방 빚기 | `다음 런에는 기억한 조합을 공방에서 영구 카드로 빚습니다.` |
| 48–66초 | 공명·적 행동·붙이 차이가 드러나는 짧은 전투 | `같은 카드도 붙이와 터의 공명에 따라 다른 선택을 요구합니다.` |
| 66–82초 | 최종 후보의 보스 핵심 기믹과 승리 화면 | `조합의 기록을 쌓아 옛 신을 넘어서는 것이 FICTOR의 한 런입니다.` |
| 82–90초 | 타이틀, stable play URL 안내 | `브라우저에서 바로 플레이할 수 있습니다.` |

## Shot checklist

- [ ] capture 대상 commit과 production artifact SHA-256이 T047 승인값과 정확히 같습니다.
- [ ] 새 브라우저 프로필에서 해상도·브라우저 zoom·오디오 레벨을 고정했습니다.
- [ ] 알림, 메뉴바 개인정보, 계정명, 이메일, token, secret, 로컬 절대 경로, 개발자 도구와 unrelated app이 보이지 않습니다.
- [ ] 첫 발견의 재료 소멸·결과 뒤집힘·이름 표시가 끊기지 않고 읽힙니다.
- [ ] 도감 기록과 다음 런 공방 연결이 실제 final candidate 동작과 일치합니다.
- [ ] 보스 장면은 final candidate의 실제 플레이이며 debug·치트·편집 오해를 만들지 않습니다.
- [ ] 기존 게임 아트·폰트·효과음만 사용하고 새 음악·TTS·generated media를 넣지 않습니다.
- [ ] 화면에 나타나는 모든 미디어의 권리와 공개 범위를 확인했습니다.
- [ ] 영상에 개인정보·credential·cookie·session·signed URL이 없습니다.
- [ ] host/account/visibility/cost/privacy/rights/stable-link 범위를 별도 T048 gate로 승인받았습니다.
- [ ] 업로드 후 로그아웃·시크릿 환경에서 stable URL 재생을 확인했습니다.
- [ ] video SHA-256, duration, resolution, codec, capture commit, artifact hash, URL과 확인 시각을 기록했습니다.
- [ ] 대용량 video binary를 git에 commit하지 않았습니다.
- [ ] 제출 문서·썸네일·영상이 production build inputs를 변경하지 않았습니다.

## 편집 경계

- clean cuts, crop, volume normalization, 권리 있는 자막과 간단한 title card만 허용합니다.
- 게임에 없는 기능, 연출, 프레임이나 결과를 합성하지 않습니다.
- T050의 실제 공개 URL 완주 QA와 데모 촬영은 별개입니다. 데모 성공을 QA PASS로 사용하지 않습니다.
- 최종 영상 파일과 외부 업로드는 별도 T048 승인 없이는 만들지 않습니다.

