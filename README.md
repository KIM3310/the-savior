# The Savior

불교 기반 심신 안정화 플랫폼 (`Cloudflare Pages + Functions + OpenAI API`) 입니다.

## 포트폴리오 포지셔닝
- 이 저장소는 감정 안정화 제품의 데모/리뷰 표면이며, 항상 live 백엔드가 붙어 있다고 가정하면 안 됩니다.
- 핵심 증거는 `runtime brief`, `review pack`, 안전/수익 경계 표면과 fallback 동작 명시입니다.


## 커리어 시그널
- **AI 엔지니어 관점:** provider 전환, fallback, BYOK, runtime brief/review pack이 함께 보입니다.
- **솔루션/클라우드 아키텍트 관점:** Pages + Functions + optional native packaging이라는 제품 경계가 분명합니다.
- **프리세일즈/세일즈 관점:** 사용자 가치와 운영 경계를 같은 데모 표면에서 설명할 수 있습니다.

## 핵심 기능
- 1분 감정 체크 -> 3분 안정 루틴 생성
- AI 명상 코치 대화
- 저널 인사이트 생성
- OpenAI/Ollama(provider 자동/강제 전환) 지원
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

## 로컬 실행 (Ollama)
```bash
ollama serve
ollama pull llama3.2:latest
npm run dev:ollama
```

- 기본 Ollama 주소: `http://127.0.0.1:11434`
- `npm run dev:ollama`는 `.dev.vars`가 없으면 `.dev.vars.example`을 자동 복사합니다.
- 다른 모델/주소를 쓰려면 `.dev.vars` 값을 수정하세요.

## 필수 환경변수 (Cloudflare Pages)
- `OPENAI_API_KEY`: OpenAI 서버 키(기본 비활성, `ALLOW_SERVER_OPENAI_KEY=true`일 때만 사용)
- `ALLOW_SERVER_OPENAI_KEY`: `true`일 때만 서버 키 사용 허용(기본값: 비활성)
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
- `LLM_PROVIDER`: `auto | openai | ollama` (기본 `auto`)
- `ENABLE_OLLAMA`: `true/false` (미설정 시 로컬 요청에서는 자동 활성화)
- `OLLAMA_BASE_URL`: Ollama API 주소 (기본 `http://127.0.0.1:11434`)
- `OLLAMA_MODEL`: Ollama 모델명 (기본 `llama3.2:latest`)

## API 엔드포인트
- `GET /api/config`: 클라이언트 런타임 설정
- `POST /api/chat`: 체크인/코치/저널 생성
- `POST /api/key-check`: OpenAI 키 유효성 확인
- `GET /api/health`: 운영 헬스체크 상태
- `GET /api/meta`: LLM/광고/레이트리밋 메타데이터
- `GET /api/runtime-brief`: operator readiness brief
- `GET /api/review-pack`: safety/revenue boundary review pack
- `GET /api/schema/coach-response`: 코치 응답 계약 스키마

모든 API 응답은 `X-Request-Id` 헤더를 포함해 장애 추적에 사용할 수 있습니다.

## Service-Grade Surfaces
- 첫 화면에서 `Operator Readiness Brief`와 `Executive Review Pack`이 BYOK, Ollama, fallback, safety/revenue boundary를 바로 보여줍니다.
- `/api/health`, `/api/meta`, `/api/runtime-brief`, `/api/review-pack`, `/api/schema/coach-response` 조합으로 리뷰어가 운영 posture를 빠르게 확인할 수 있습니다.
- fallback 모드와 위기 대응 경계가 런타임 surface와 테스트에서 명시적으로 드러납니다.

## Review Flow
- `/api/health`와 `/api/meta`로 provider posture, monetization state, route coverage를 확인합니다.
- `/api/runtime-brief`에서 runtime mode, schema contract, fallback behavior를 확인합니다.
- `/api/review-pack`에서 safety boundary와 revenue boundary를 public traffic 전에 분리해 읽습니다.
- live chat과 fallback copy 검증은 provider posture를 이해한 뒤에만 진행합니다.

## Proof Assets
- `Health Route` -> `/api/health`
- `Runtime Brief` -> `/api/runtime-brief`
- `Review Pack` -> `/api/review-pack`
- `Coach Schema` -> `/api/schema/coach-response`

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
- 서버 과금 방지를 위해 기본 운영은 `x-user-openai-key`(BYOK) 또는 fallback만 사용합니다.
- `OPENAI_API_KEY`를 쓰더라도 `ALLOW_SERVER_OPENAI_KEY=true`를 함께 설정한 경우에만 실제 호출됩니다.
- 키 노출이 의심되면 즉시 폐기(Rotate) 후 새 키를 발급하세요.
- 사용자 API 키 저장 기본값은 세션 저장입니다(브라우저 종료 시 삭제).

## 검증
```bash
npm run check
npm test
```

## Local Verification
```bash
npm install
npm run check
npm run test
```

## Repository Hygiene
- Keep runtime artifacts out of commits (`.codex_runs/`, cache folders, temporary venvs).
- Prefer running verification commands above before opening a PR.
