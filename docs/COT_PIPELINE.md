# CoT-Style Execution Pipeline (No Hidden Reasoning Exposure)

The Savior의 AI 응답은 내부적으로 다음 단계를 거쳐 생성됩니다.

1. Input Sanitization
- 길이 제한, 제어문자 제거, 히스토리 정제

2. Risk Check
- 자해/극단적 신호 정규식 탐지
- 탐지 시 모델 호출 없이 즉시 위기 안내 반환

3. Intent Routing
- `checkin` / `coach` / `journal` 모드 분기

4. Prompt Assembly
- 모드별 시스템 지침 + 사용자 입력 결합

5. Response Generation
- OpenAI Responses API 호출

6. Output Guard
- 빈 응답/오류 처리
- 사용자에게 안전하고 실행 가능한 문장으로 반환

이 방식은 단계적 추론 구조를 구현하지만, 모델의 내부 chain-of-thought를 노출하지 않습니다.
