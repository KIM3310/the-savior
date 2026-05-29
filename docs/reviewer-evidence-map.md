# Review Guide - The Savior

Updated: 2026-05-30

Use this page as the short path through the repository. It keeps the review grounded in the code, docs, commands, and boundaries that are already present.

## Summary

| Field | Notes |
|---|---|
| Lane | B2C wellness and ads funnel |
| Core idea | Cloudflare Pages mindfulness app with journaling, coaching, fallbacks, ads, and mobile packaging path. |
| Primary reader | Wellness creators, small communities, and users seeking low-friction reflection tools. |
| Stack | TypeScript/JavaScript, Cloudflare |

## Open First

1. Start with the README fast path and architecture section.
2. Open `docs/monetization-playbook.md` only when reviewing the product or service angle.
3. Check the commands below before making claims about quality.
4. Skim the CI workflows and fixture data before deeper implementation review.
5. Read the boundaries section before presenting the project externally.

## Checks

| Purpose | Command |
|---|---|
| Full local gate | `npm run verify` |
| Test suite | `npm test` |
| Lint | `npm run lint` |

## CI

- .github/workflows/architecture-blueprint.yml
- .github/workflows/ci.yml
- .github/workflows/dependency-review.yml
- .github/workflows/repository-health.yml
- .github/workflows/repository-surface.yml
- .github/workflows/secret-scan.yml

## Evidence

- package scripts and web/runtime checks
- edge deployment configuration
- npm run verify passes
- Fallback works without keys
- Privacy boundary is visible

## Commercial Notes

| Possible offer | Working price assumption |
|---|---|
| Freemium wellness app | Ads + consent |
| Paid guided packs | $4-$12 paid packs |
| Creator/community templates | $5-$10/month sync/community |

## Boundaries

- Not clinical care
- Sensitive content privacy
- Escalation/safety copy required

## Useful Metrics

- Routine completion
- Pack conversion
- Retention
