# The Savior

불교 기반 심신 안정화 플랫폼 (`Cloudflare Pages + Functions + OpenAI API`) 입니다.

## 핵심 기능
- 1분 감정 체크 -> 3분 안정 루틴 생성
- AI 명상 코치 대화
- 저널 인사이트 생성
- 사용자 OpenAI API 키(BYOK) 우선 사용 + 서버 키 폴백
- AdSense 광고 슬롯 + 동의 배너
- 정책 페이지(Privacy/Terms/Contact) 포함
- Capacitor 기반 iOS/Android 앱 패키징 가능

## 로컬 실행
```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:8788` 접속.

## 필수 환경변수 (Cloudflare Pages)
- `OPENAI_API_KEY`: OpenAI 서버 키(선택, 사용자 키 없을 때 폴백)
- `ADSENSE_CLIENT`: 예) `ca-pub-xxxxxxxxxxxxxxxx` (선택)
- `ADSENSE_SLOT_TOP`: 상단 슬롯 ID (선택)
- `ADSENSE_SLOT_BOTTOM`: 하단 슬롯 ID (선택)

## 배포
```bash
npm run deploy
```

상세 배포 절차는 `docs/CLOUDFLARE_DEPLOY.md` 참조.

## 모바일 패키징
```bash
npm run mobile:add:ios
npm run mobile:add:android
npm run mobile:sync
```

상세 절차는 `docs/MOBILE_RELEASE.md` 참조.
`iOS`는 Xcode + CocoaPods + `xcode-select` 설정이 선행되어야 합니다.
`Android`는 JDK 17 + Android SDK 설정이 선행되어야 합니다.

## 보안 주의
- API 키를 코드/깃에 절대 커밋하지 마세요.
- `OPENAI_API_KEY`는 Cloudflare Secrets로만 주입하세요.
- 키 노출이 의심되면 즉시 폐기(Rotate) 후 새 키를 발급하세요.
