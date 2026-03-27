# AdSense 심사 준비 체크리스트

## 사이트 구조
- [x] 홈 + 소개 + 리소스 + 요금제 + 개인정보 + 약관 + 문의 페이지
- [x] 명확한 내비게이션
- [x] robots.txt / sitemap.xml / ads.txt 제공

## 콘텐츠 품질
- [x] 실제 사용자에게 도움이 되는 고유 콘텐츠
- [x] 자동 생성성/저품질 문구 최소화
- [x] 서비스 목적과 운영자 정보 명시

## 정책/투명성
- [x] 개인정보처리방침
- [x] 이용약관
- [x] 문의 채널
- [x] 광고 동의 배너(기본형)

## 광고 슬롯 구성
- [x] 상단/하단 광고 슬롯 사전 배치
- [x] 승인 전에는 빈 슬롯으로 표시
- [x] 승인 후 env 값 입력 시 활성화

## 심사 전 교체 필요 값
1. `public/ads.txt`의 `pub-XXXXXXXXXXXXXXXX`를 실제 Publisher ID로 교체
2. `ADSENSE_CLIENT`, `ADSENSE_SLOT_TOP`, `ADSENSE_SLOT_BOTTOM` 환경변수 설정
3. `contact@the-savior.app` 및 사업자 정보를 실제 정보로 교체
