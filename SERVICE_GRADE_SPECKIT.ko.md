# the-savior Service-Grade SPECKIT

Last updated: 2026-03-08

## S - Scope
- 대상: Buddhist mind-body stabilization platform on Cloudflare Pages + Functions
- baseline 목표: calming UX, BYOK/fallback policy, runtime safety를 서비스 수준으로 고정

## P - Product Thesis
- the-savior는 예쁜 wellness landing page가 아니라 `daily stabilization service`여야 한다.
- 안전한 fallback, BYOK policy, session continuity가 핵심 운영 신뢰 요소다.

## E - Execution
- emotional check-in, coach, journal, recovery dashboard를 한 흐름으로 유지
- runtime key / fallback / health surface를 명확히 유지
- 이번 iteration에서 `/api/runtime-brief`, `/api/schema/coach-response`, first-screen runtime panel을 추가

## C - Criteria
- `npm run check`, `npm test` green
- README 첫 화면에서 가치와 보안 주의가 동시에 이해됨
- 첫 화면에서 BYOK, Ollama, fallback, response schema contract가 즉시 보임
- Cloudflare runtime CI가 main push에서 자동 실행됨

## K - Keep
- calm UX와 honest policy framing
- BYOK 우선 / server key 제한 정책

## I - Improve
- screenshot pack 및 mobile evidence 강화
- recovery trend export / retention narrative 강화
- crisis escalation evidence와 schema-driven QA 확장

## T - Trace
- `README.md`
- `functions/`
- `tests/`
- `public/`
- `.github/workflows/ci.yml`
