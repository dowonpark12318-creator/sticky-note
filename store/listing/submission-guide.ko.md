# Corner Note — Microsoft Store 등록 순서

자료 기준: 앱 1.5.0 / 패키지 1.5.0.0. 앱 가격은 **무료**, 지원 연락처는 **dowonpark12318@gmail.com**입니다. 이 문서는 입력과 심사 준비를 돕는 자료이며, Store에 제출하거나 공개한 결과가 아닙니다.

## 1. 제품과 패키지 확인

1. [Partner Center의 Apps & Games](https://aka.ms/submitwindowsapp)에 로그인하고, 이미 예약한 제품을 엽니다.
2. **Product management → Product identity**에서 아래 값이 일치하는지 확인합니다.

   | 항목 | 값 |
   | --- | --- |
   | Package/Identity/Name | `DowonPark.CornerNote` |
   | Package/Identity/Publisher | `CN=B3FCB264-7CC2-48BC-8B90-21070B7AFBD4` |
   | Package/Properties/PublisherDisplayName | `Dowon Park` |

3. **Start your submission / 새 제출 만들기**를 선택합니다.
4. **Packages**에서 `CornerNote-Store-x64.msix`를 업로드합니다. [검증된 1.5.0 제출용 파일](https://github.com/dowonpark12318-creator/sticky-note/releases/download/windows-test-15-1/CornerNote-Store-x64.msix)과 [체크섬](https://github.com/dowonpark12318-creator/sticky-note/releases/download/windows-test-15-1/CornerNote-Store-x64.msix.sha256)을 사용할 수 있습니다. 최종 빌드를 바꾸면 그 파일을 다시 검증·업로드합니다.
5. 업로드 분석 결과의 패키지 이름·게시자·버전·아키텍처와 경고를 확인합니다. 제출용 MSIX는 Microsoft가 심사 후 배포용으로 서명합니다. `CornerNote-Development-x64.msix`와 포터블 ZIP은 제출용 패키지로 선택하지 않습니다.

**Store에 보일 제품 이름은 Partner Center에서 이미 예약한 이름을 선택합니다.** 자료에 제안된 `Corner Note`나 번역된 앱 이름이 자동으로 예약되는 것은 아닙니다. `DowonPark.CornerNote`는 패키지 식별자이며 표시 이름과 별개입니다.

## 2. 가격·대상·속성 입력

1. **Pricing and availability**에서 가격을 **Free / 무료**로 설정합니다. API 사용료는 앱 가격이 아니라 외부 OpenAI 계정에 발생하는 별도 요금입니다.
2. 배포 국가와 공개 시점은 게시자가 선택합니다. 자료를 준비했다는 이유만으로 모든 국가에 배포하거나 즉시 공개하지 않습니다. 적용되는 국가별 사업자·소비자 정보도 화면에서 확인합니다.
3. **Properties**에서 카테고리를 **Productivity / 생산성**, 대상 기기를 **Desktop**으로 선택합니다. 패키지는 **Windows 10 빌드 19041 이상 / Windows 11, x64**입니다. Xbox·모바일·Holographic이나 별도 ARM64 네이티브 빌드를 지원한다고 표시하지 않습니다.
4. 시스템 요구사항은 키보드와 포인터로 메모를 입력·이동·조절할 수 있는 PC를 기준으로 적습니다. 검증하지 않은 최소 RAM·저장 공간 수치를 임의로 만들지 않습니다.
5. **개인정보에 접근·수집·전송하는가?**에는 **Yes / 예**로 표시하고 정책을 제공합니다. 로컬 메모와 API 키에 접근하며, 사용자가 번역을 요청하면 선택한 글 등이 외부 서비스로 전송됩니다. 개발자 서버가 없다는 사실을 근거로 모두 `No`로 표시하지 않습니다.
6. **This product incorporates generative AI features**를 선택합니다. OpenAI API를 통한 실시간 AI 번역이 포함됩니다.
7. `declarations.json`의 근거를 보면서 나머지 선언을 검토합니다. 접근성 전면 검증·별도 드라이브 설치·Windows 자동 백업/복원은 확인하지 않았으므로 검증 완료로 주장하지 않습니다. 앱 내 구매 기능은 없지만 외부 유료 API 의존성이 있으므로 외부 결제 관련 문항의 실제 문구를 확인하고 요금 안내를 유지합니다.

## 3. 지원과 개인정보처리방침 입력

- **지원 연락처:** `dowonpark12318@gmail.com`.
- **지원 페이지:** [영문 지원](https://github.com/dowonpark12318-creator/sticky-note/blob/codex/windows-test-build/store/listing/support.en.md), [한국어 지원](https://github.com/dowonpark12318-creator/sticky-note/blob/codex/windows-test-build/store/listing/support.ko.md).
- **개인정보처리방침:** [영문 정책](https://github.com/dowonpark12318-creator/sticky-note/blob/codex/windows-test-build/store/listing/privacy/privacy-policy.en.md), [한국어 정책](https://github.com/dowonpark12318-creator/sticky-note/blob/codex/windows-test-build/store/listing/privacy/privacy-policy.ko.md).

공개 자료를 올린 뒤 각 URL을 로그아웃 상태의 브라우저에서 열어 로그인 없이 본문을 읽을 수 있는지 확인합니다. 링크가 공개되기 전에는 제출을 완료하지 않습니다. 영어 정책 URL은 다른 표시 언어의 등록 페이지에도 사용할 수 있으며, 앱 UI가 10개 언어라는 사실과 정책 번역 언어를 혼동하지 않습니다.

설정 화면에 정책 텍스트를 직접 입력하는 옵션이 있더라도 로컬 저장·선택한 글의 OpenAI 전송·API 키 보관·지원 메일 처리·사용자 제어·신고 연락처 설명을 빠뜨리지 않습니다. Microsoft의 정책이 이 앱의 자체 개인정보처리방침을 대신하지 않습니다.

## 4. 10개 언어의 스토어 소개 입력

**Store listings → Add/remove languages**에서 다음 언어를 추가합니다. Portal은 중립 언어 코드를 국가별 항목으로 표시할 수 있으므로 해당 언어에 맞는 항목을 선택합니다.

| 자료 코드 | 표시 언어 |
| --- | --- |
| `ko-KR` | 한국어 |
| `en-US` | 영어 |
| `ja-JP` | 일본어 |
| `zh-Hans` | 중국어 간체 |
| `zh-Hant` | 중국어 번체 |
| `es` | 스페인어 |
| `fr` | 프랑스어 |
| `de` | 독일어 |
| `pt` | 포르투갈어 |
| `it` | 이탈리아어 |

각 언어에서 `locales/<코드>.md` 또는 JSON의 해당 항목을 사용합니다.

1. **Product name:** 실제 예약한 이름을 드롭다운에서 선택합니다. 현지화 이름을 쓰려면 먼저 그 이름도 예약해야 합니다.
2. **Description:** 설명문을 일반 텍스트로 붙여 넣습니다. 최대 10,000자입니다.
3. **Short description:** 짧은 소개를 붙여 넣습니다. 자료는 주요 표시 구간인 270자 이내를 목표로 준비합니다.
4. **Product features:** 특징을 항목별로 넣습니다. 항목당 최대 200자, 최대 20개이며 별도의 글머리표 문자는 붙이지 않습니다.
5. **What's new in this version:** **Store 첫 제출은 비워 둡니다.** 앱 버전이 1.5.0이어도 Store 첫 출시라면 업데이트로 취급해 채울 필요가 없습니다. 향후 업데이트용 문안은 별도로 보관합니다.
6. AI가 선택 기능이라는 점, 개인 OpenAI API 키 및 별도 API 요금이 필요하다는 점, 실시간 생성형 AI를 쓴다는 설명을 유지합니다.

## 5. 스크린샷과 아이콘 업로드

언어별 `assets/screenshots/<코드>/`의 다음 PNG를 **Desktop** 스크린샷으로 순서대로 업로드하고 해당 언어의 캡션을 넣습니다.

| 파일 | 보여 주는 내용 |
| --- | --- |
| `01-writing.png` | 메모 작성과 색상 |
| `02-overlapping-notes.png` | 겹쳐 놓은 여러 메모 |
| `03-folding-guide.png` | 앱의 접기 안내 화면 |
| `04-ai-settings.png` | 개인 API 키를 연결하는 AI 설정 |

실제 배포 묶음의 스크린샷과 생성 기록을 확인한 뒤 사용합니다. 각 파일은 **PNG, Desktop 최소 1366 × 768, 50MB 이하**, 캡션은 **200자 이하**여야 합니다. 스크린샷에 없는 번역 결과·OS 기능·인증 상태를 캡션으로 주장하지 않습니다. 4개 스크린샷은 권장 개수이며 Portal은 최대 10개 Desktop 스크린샷을 받습니다. 각 언어의 등록 페이지에 이미지를 따로 업로드합니다.

앱 타일 아이콘은 자료에 포함된 **300 × 300 PNG**를 사용합니다. 파일명과 생성 경로는 자료 묶음의 파일 목록에서 확인합니다. 앱이 지원하지 않는 Xbox의 필수 아트 항목을 채울 필요는 없습니다. 등록 이미지는 실제 앱 화면을 유지하며 추가 마케팅 문구나 별도 로고를 스크린샷 위에 덧붙이지 않습니다.

## 6. 연령 등급과 심사 안내

1. **Age ratings**에서 실제 **IARC 설문**을 완료합니다. 이 자료는 `3+`, PEGI, ESRB 등의 등급을 발급하지 않았습니다.
2. 도박·광고·앱 자체의 구매/보상 기능은 없습니다. 메모는 로컬에 작성되며 앱 내 소셜 게시·채팅·공유 서비스는 없습니다. 다만 사용자 입력과 실시간 AI 번역, 외부 서버 전송이 있으므로 관련 질문은 화면에 나온 정의에 맞춰 답합니다. 모든 문항을 일괄 `No`로 표시하지 않습니다.
3. **Notes for certification**에는 `certification-notes.en.md`의 심사용 본문을 사용합니다. 안내의 게시자용 확인 항목은 먼저 완료합니다.
4. 실제 OpenAI 응답·요금·취소 동작을 별도로 확인하고, 심사팀이 AI 접근 정보를 요구하면 비공개 적절한 심사 경로로 제한된 테스트 자격증명을 마련합니다. 실제 키를 이 자료나 Git·공개 ZIP·스크린샷에 넣지 않습니다.
5. 최종 제출 패키지에 대해 **Windows App Certification Kit**를 실행하고 해당되는 실패를 해결합니다. 기존 CI 통과를 WACK 통과나 Microsoft 승인으로 바꾸어 적지 않습니다.

## 7. 제출 전 마지막 확인

`readiness.md`의 확인표를 사용합니다. 이름·가격·설명·연락처·정책 URL·스크린샷·AI 선언·IARC 결과·심사 접근 정보·최종 패키지 검증을 모두 확인한 뒤 **Submit to the Store**를 선택합니다. 실제 제출과 공개는 Partner Center에서 진행하며, 이 자료 묶음이 자동으로 제출하지 않습니다.

공식 기준: [Store 등록 정보](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info) · [스크린샷과 아이콘](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images) · [제품 선언](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/product-declarations) · [연령 등급](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/age-ratings) · [Store 정책](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies).
