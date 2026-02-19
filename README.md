# The Savior

불교 기반 심신 안정화 플랫폼 (`Cloudflare Pages + Functions + OpenAI API`) 입니다.

## 핵심 기능
- 1분 감정 체크 -> 3분 안정 루틴 생성
- AI 명상 코치 대화
- 저널 인사이트 생성
- 사용자 OpenAI API 키(BYOK) 우선 사용 + 서버 키 폴백
- OpenAI 장애/쿼터 시 기본 코칭 모드 자동 폴백
- AdSense 광고 슬롯 + 동의 배너
- 입력 글자수 카운터/결과 복사/세션 복원 UX
- 14일 회복 인사이트 대시보드 + 데이터 내보내기/초기화
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

## 권장 보안 환경변수 (Cloudflare Pages)
- `ALLOWED_ORIGINS`: API 허용 Origin 목록 (쉼표 구분)
  - 예: `https://the-savior-9z8.pages.dev,capacitor://localhost`
- `CHAT_RATE_LIMIT_MAX`: `/api/chat` 요청 허용량 (기본 20/분)
- `CHAT_RATE_LIMIT_WINDOW_MS`: `/api/chat` 레이트리밋 윈도우 (기본 `60000`)
- `KEYCHECK_RATE_LIMIT_MAX`: `/api/key-check` 요청 허용량 (기본 25/분)
- `KEYCHECK_RATE_LIMIT_WINDOW_MS`: `/api/key-check` 레이트리밋 윈도우 (기본 `60000`)
- `CONFIG_RATE_LIMIT_MAX`: `/api/config` 요청 허용량 (기본 120/분)
- `CONFIG_RATE_LIMIT_WINDOW_MS`: `/api/config` 레이트리밋 윈도우 (기본 `60000`)
- `HEALTH_RATE_LIMIT_MAX`: `/api/health` 요청 허용량 (기본 240/분)
- `HEALTH_RATE_LIMIT_WINDOW_MS`: `/api/health` 레이트리밋 윈도우 (기본 `60000`)
- `PUBLIC_API_BASE_URL`: 클라이언트가 참조할 API 기본 URL (선택)
- `ENABLE_CHAT_FALLBACK`: `false`로 설정 시 OpenAI 실패 시 자동 폴백 비활성화

## API 엔드포인트
- `GET /api/config`: 클라이언트 런타임 설정
- `POST /api/chat`: 체크인/코치/저널 생성
- `POST /api/key-check`: OpenAI 키 유효성 확인
- `GET /api/health`: 운영 헬스체크 상태

모든 API 응답은 `X-Request-Id` 헤더를 포함해 장애 추적에 사용할 수 있습니다.

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
- 사용자 API 키 저장 기본값은 세션 저장입니다(브라우저 종료 시 삭제).

## 검증
```bash
npm run check
npm test
```
