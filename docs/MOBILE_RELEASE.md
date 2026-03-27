# iOS / Android 출시 준비 (TestFlight + Internal/Closed)

## 0) 전제
- 웹 서비스가 Cloudflare Pages에 먼저 배포되어 있어야 함.
- `public/runtime-config.js`의 `apiBaseUrl`에 배포 도메인을 설정.
  - 예: `https://the-savior-9z8.pages.dev`
- macOS에서는 아래 도구가 필요:
  - Xcode 설치
  - CocoaPods 설치 (`brew install cocoapods`)
  - Xcode 개발자 경로 설정 (`sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`)

## 1) Capacitor 세팅
```bash
cd /Users/kim/the-savior
npm install
npm run mobile:add:ios
npm run mobile:add:android
npm run mobile:sync
```

## 2) iOS (TestFlight)
1. `npm run mobile:open:ios`로 Xcode 프로젝트 오픈
2. Bundle Identifier/Signing Team 설정
3. App Icon, Launch Screen, Privacy Manifest 점검
4. `Product > Archive` 후 App Store Connect 업로드
5. TestFlight Internal/External 테스터 배포

## 3) Android (Internal/Closed)
1. `npm run mobile:open:android`로 Android Studio 오픈
2. `Build > Generate Signed Bundle/APK`에서 AAB 생성
3. Google Play Console에 업로드
4. Internal testing 또는 Closed testing 트랙 배포

## 4) 앱 심사 유의사항
- 로그인/결제/개인정보 정책 URL이 앱 내에서 접근 가능해야 함.
- 의료 대체 표현 금지 문구 유지.
- 고위험 사용자 안내 문구(1393/988/119/911) 유지.
- 앱 설명에 "웰니스/자기관리 도구"임을 명확히 기재.

## 5) 빌드 환경 트러블슈팅
- iOS `pod install` 실패 시:
  - `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`
  - `cd ios/App && pod install`
  - sudo 권한이 없으면 명령 앞에 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`를 붙여 실행
- Android SDK 오류(`SDK location not found`) 시:
  - Android Studio 설치 후 SDK 다운로드
  - `android/local.properties.example`를 복사해 `android/local.properties` 생성
    - `sdk.dir=/Users/<your-user>/Library/Android/sdk`
  - 또는 `ANDROID_HOME`/`ANDROID_SDK_ROOT` 환경변수 설정
