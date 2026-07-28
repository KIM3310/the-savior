# The Savior

## Live Demo

- [Open the public Cloudflare Pages demo](https://the-savior-9z8.pages.dev/)
- Scope: credential-free, synthetic-data demo for product reviewers and evaluators.

> **Curated supporting repo**
> This repository is kept as optional proof, but it no longer leads the portfolio.
> Current front door: **aix-pilot and doeon-kim-portfolio**.
> Reason: Wellness and consumer positioning are not strong enough for the main product or B2B story.

Buddhist-inspired mindfulness platform built on Cloudflare Pages + Functions + OpenAI API.

## System Overview

A calm consumer AI surface that tests whether journaling, reflection, and lightweight coaching can retain users without heavy infrastructure.

| Area | Details |
|---|---|
| Users | Wellness creators, small community operators, and solo users looking for low-friction reflection tools. |
| Technical path | Validate the demo, README, architecture notes, and quality gate before deeper workflow review. |
| System scope | Cloudflare Pages deployment, optional local or hosted AI adapters, journaling flows, and deterministic fallbacks. |
| Operating boundary | This is wellness software, not clinical care; sensitive user content needs clear privacy controls and optional local-only mode. |
| Evaluation path | Run the app locally or inspect the Pages deployment and fallback behavior without requiring external model keys. |

## Evaluation Path

- **Start here:** Try the check-in flow, then confirm fallback coaching works without a provider key.
- **Local demo:** Run `npm install && npm run dev`, then open `http://localhost:8788`.
- **Checks:** Run `npm run verify`; it covers syntax checks, lint, and Node tests.

## Service Launch Playbook

- [Service launch playbook](docs/service-launch-playbook.md) maps the repository to its product scope, operating gates, operating boundaries, and risk controls.

## Architecture Notes

- [Architecture guide](docs/architecture-evidence-map.md) summarizes the system scope, first files to inspect, runtime commands, and known boundaries.
- [Quality notes](docs/quality-gate.md) lists the local checks, CI surface, and release expectations for this repository.
- [Enterprise readiness notes](docs/enterprise-readiness.md) outlines security, data, operations, integration, and handoff expectations.
- [Repository positioning](docs/repository-positioning.md) explains why this repository is archived/supporting and where the current technical entry points live.

## Features
- 1-minute emotional check-in with 3-minute calming routine
- AI meditation coaching conversation
- Journal insight generation
- OpenAI, OpenRouter, Gemini, and Ollama provider support with explicit routing
- BYOK (bring your own key) with server key fallback
- Offline fallback coaching when no provider is available
- BYOK runtime posture + safety consent banner
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
- `OPENROUTER_API_KEY`: Server-side OpenRouter key
- `OPENROUTER_MODEL`: OpenRouter model name (default `mistralai/mistral-small-2603`)
- `GEMINI_API_KEY`: Server-side Gemini key
- `GEMINI_MODEL`: Gemini model name (default `gemini-2.5-flash`)
- `LLM_PROVIDER`: `auto | openrouter | openai | gemini | ollama` (default `auto`)
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
- `GET /api/architecture-pack` - Safety/runtime boundary summary
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
5. Provider resolution: explicit provider override, then OpenRouter server key, OpenAI BYOK/server key, Gemini server key, Ollama, or explicit offline fallback
6. LLM call with provider-specific timeouts
7. Error mapping to safe user-facing messages (keys never exposed)

## Tests
```bash
npm run check
npm test
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
- Default mode is BYOK or fallback only
- All error responses redact API key fragments
- User API keys stored in session storage only

## Cloud + AI Architecture

- [Cloud + AI architecture blueprint](docs/cloud-ai-architecture.md)
- [Machine-readable architecture manifest](docs/architecture/blueprint.json)
- Validation command: `python3 scripts/validate_architecture_blueprint.py`

## Enterprise Productization

- [Product operating model](docs/product-operating-model.md) defines the product scope, trust boundary, operating checks, and service path for this repository.

## System Architecture

- [System architecture](docs/system-architecture.md) maps the runtime boundary, data/control flow, cloud or local deployment surface, and operating assumptions for this repository.

## Service Architecture

- [Service architecture](docs/service-architecture.md) defines the cloud resources, account information, cost controls, and production guardrails needed to turn this repo into a scoped service without publishing public financial assumptions.

<!-- search-growth-readme:start -->

## Search And Service Surface

- Public entry: free static ritual experience
- Paid boundary: premium theme packs, private journal export, and supporter bundle
- Canonical URL: https://the-savior-9z8.pages.dev/
- Lead capture: https://kim3310-doeon-kim-portfolio.pages.dev/?offer=the-savior&inquiry=consumer-prototype-customization#private-inquiry
- Resource route: https://kim3310-doeon-kim-portfolio.pages.dev/resources/the-savior/
- Commercial route: https://kim3310-doeon-kim-portfolio.pages.dev/?offer=the-savior#service-offers
- Machine-readable offer: [docs/service-offer.json](docs/service-offer.json)
- Search growth implementation: [docs/search-growth-implementation.md](docs/search-growth-implementation.md)
- Revenue architecture: [docs/revenue-architecture.md](docs/revenue-architecture.md)

<!-- search-growth-readme:end -->

<!-- KIM3310:AD-DATA-PIVOT:START -->
## Free Resource, Advertising, and Aggregate Data

- [Public utility and architecture checklist](https://kim3310-doeon-kim-portfolio.pages.dev/resources/the-savior/)
- Revenue model: contextual advertising on the policy-eligible central resource page.
- Aggregate value: anonymous aggregate narrative-design topic interest and resource CTA counts
- Boundary: ads allowed only on public narrative-design pages; saved play state, personal notes, and result flows are ad-free
- Consent defaults off, DNT/GPC fail closed, and personal or sensitive data is never sold.
<!-- KIM3310:AD-DATA-PIVOT:END -->
