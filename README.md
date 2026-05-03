# The Savior

Buddhist-inspired mindfulness platform built on Cloudflare Pages + Functions + OpenAI API.

## Features
- 1-minute emotional check-in with 3-minute calming routine
- AI meditation coaching conversation
- Journal insight generation
- OpenAI / Ollama provider support with automatic switching
- BYOK (bring your own key) with server key fallback
- Offline fallback coaching when no provider is available
- AdSense ad slots + consent banner
- 14-day recovery insight dashboard with data export
- Capacitor-based iOS/Android packaging

## Quick Start
```bash
npm install
npm run dev
```

Open `http://localhost:8788` in your browser.

### Local Setup (Ollama)
```bash
ollama serve
ollama pull llama3.2:latest
npm run dev:ollama
```

## Environment Variables (Cloudflare Pages)
- `OPENAI_API_KEY`: Server OpenAI key (off by default, needs `ALLOW_SERVER_OPENAI_KEY=true`)
- `ALLOW_SERVER_OPENAI_KEY`: Enable server key usage
- `LLM_PROVIDER`: `auto | openai | ollama` (default `auto`)
- `ENABLE_OLLAMA`: `true/false`
- `OLLAMA_BASE_URL`: Ollama API address (default `http://127.0.0.1:11434`)
- `OLLAMA_MODEL`: Ollama model name (default `llama3.2:latest`)

See full list of rate limit and security env vars in the source.

## API Endpoints
- `GET /api/config` - Client runtime config
- `POST /api/chat` - Check-in / coach / journal generation
- `POST /api/key-check` - OpenAI key validation
- `GET /api/health` - Health check
- `GET /api/meta` - Provider/rate-limit metadata
- `GET /api/runtime-brief` - Operator readiness brief
- `GET /api/review-pack` - Safety/revenue boundary summary
- `GET /api/progress-trends` - Coaching trend snapshot
- `GET /api/escalation-readiness` - Crisis escalation readiness
- `GET /api/schema/coach-response` - Coach response schema

## Architecture

```
the-savior/
  public/          # Static frontend (SPA)
  functions/api/   # Cloudflare Pages Functions (serverless)
  tests/           # Node.js tests
  ios/ android/    # Capacitor native shells
```

### Request flow (POST /api/chat)

1. CORS check against allowed origins
2. Rate limiting (per-IP sliding window)
3. Input validation (size, content-type, sanitization)
4. Crisis keyword detection - returns hotline resources immediately if matched
5. Provider resolution: BYOK key > server key > Ollama > offline fallback
6. LLM call with provider-specific timeouts
7. Error mapping to safe user-facing messages (keys never exposed)

## Tests
```bash
npm run check
npm test
# 37 passing, 0 failing
```

## Deploy
```bash
npm run deploy
```

## Mobile
```bash
npm run mobile:add:ios
npm run mobile:add:android
npm run mobile:sync
```

## Security Notes
- Never commit API keys
- Default mode is zero-cost (BYOK or fallback only)
- All error responses redact API key fragments
- User API keys stored in session storage only

## Cloud + AI Architecture

This repository includes a neutral cloud and AI engineering blueprint that maps the current proof surface to runtime boundaries, data contracts, model-risk controls, deployment posture, and validation hooks.

- [Cloud + AI architecture blueprint](docs/cloud-ai-architecture.md)
- [Machine-readable architecture manifest](architecture/blueprint.json)
- Validation command: `python3 scripts/validate_architecture_blueprint.py`
