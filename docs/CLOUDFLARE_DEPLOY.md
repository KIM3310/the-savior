# Cloudflare Pages 배포 가이드

## 1) 프로젝트 생성
```bash
cd /Users/kim/the-savior
npm install
npx wrangler pages project create the-savior
```

## 2) 시크릿/환경변수 설정
```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name the-savior
```

대시보드 또는 CLI에서 아래 환경변수 추가:
- `STRIPE_PAYMENT_LINK`
- `ADSENSE_CLIENT`
- `ADSENSE_SLOT_TOP`
- `ADSENSE_SLOT_BOTTOM`

## 3) 배포
```bash
npm run deploy
```

## 4) 커스텀 도메인 연결
- Cloudflare Pages > Custom domains에서 연결
- SSL 자동 활성화 확인

## 5) 확인
- `/api/config` 응답 확인
- 홈 체크인/코치/저널 기능 동작 확인
- 정책 페이지 접근 확인
