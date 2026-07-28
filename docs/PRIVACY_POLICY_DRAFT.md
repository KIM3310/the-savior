# Privacy Policy Draft

Updated: 2026-07-28

This repository-specific draft covers `KIM3310/the-savior`. It is not legal advice and is not final until the owner supplies the legal entity name, contact channel, jurisdiction, processor list, retention schedule, and review approval. The public policy page is an implementation disclosure; it does not replace that legal review.

## Current implementation disclosure baseline

The active application processes wellness text when a user invokes AI features. The policy must therefore describe the implemented browser storage and provider routing accurately while the remaining owner and legal inputs are completed.

## Implemented browser storage

- `sessionStorage`: the user's OpenAI BYOK key, up to eight recent chat messages, and current check-in/journal result snapshots. These values are session-scoped.
- `localStorage`: check-in metadata (date, mood, stress, fallback flag; capped at 180 entries), activity counts, streak dates, and optional-feature consent.
- A legacy local API-key value is migrated once into `sessionStorage` and then removed from `localStorage`.
- The in-app export and reset controls expose and delete these browser-held values.
- Full journal text and free-form check-in notes are not copied into the long-lived check-in history.

## Implemented provider matrix

| Route | Credential source | Data boundary |
| --- | --- | --- |
| OpenAI | User BYOK header or explicitly enabled server key | Prompt and recent context are sent to OpenAI; the application does not persist the user key in a database or log it. |
| OpenRouter | Server environment secret | Prompt and recent context pass through OpenRouter to the selected model provider. |
| Gemini | Server environment secret | Prompt and recent context are sent to Google Gemini. |
| Ollama | Operator-configured endpoint | Prompt and recent context are sent to the configured local or private Ollama endpoint. |
| deterministic fallback | No external provider credential | Predefined safety-oriented output is returned without an external model call. |

Crisis signals are handled before provider resolution and return static hand-off guidance. Provider and hosting companies may apply their own logging and retention terms, so those terms must be linked or summarized before a formal commercial launch.

## Additional data categories to review before launch

- Contact details submitted through email or a future private form.
- Analytics identifiers, cookies, IP addresses, and browser/device metadata.
- Provider-side prompt, response, abuse-monitoring, and diagnostic records.
- Payment/order metadata if a hosted checkout or invoice is later enabled.

## Draft commitments

- Collect only the minimum data needed for the stated purpose.
- Keep customer data out of public GitHub issues.
- Do not request secrets, tokens, credentials, or regulated data in public channels.
- Keep browser export and reset behavior aligned with the public privacy page.
- Define server/provider retention, deletion, access control, incident response, and subprocessors before production use.
- Provide a private contact channel for access, deletion, correction, and support requests before accepting customer data.

## Owner inputs required before final publication

- Legal entity / operator name: `Owner input required`
- Privacy contact email or private form: `Owner input required`
- Jurisdiction and governing law: `Owner input required`
- Hosting and provider retention periods: `Owner input required`
- Subprocessors / hosting / analytics / payment providers: `Owner input required`
- Cookie/analytics disclosure: `Owner input required`
- Data deletion/export process owner: `Owner input required`

## Sources used for drafting

- FTC Privacy and Security: https://www.ftc.gov/business-guidance/privacy-security
- FTC Protecting Personal Information: https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business
