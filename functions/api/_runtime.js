/**
 * Runtime configuration and diagnostics module for The Savior.
 *
 * Centralizes provider detection, runtime status generation, review-pack
 * assembly, escalation readiness, and progress-trends synthesis.
 *
 * @module _runtime
 */

/** @type {string} Default Ollama model identifier. */
export const OLLAMA_MODEL_NAME = "llama3.2:latest";

/** @type {string} Contract version for runtime-brief payloads. */
export const READINESS_CONTRACT = "the-savior-runtime-brief-v1";

/** @type {string} Contract version for review-pack payloads. */
export const REVIEW_PACK_CONTRACT = "the-savior-review-pack-v1";

/** @type {string} Contract version for coach-response schema payloads. */
export const COACH_RESPONSE_SCHEMA = "the-savior-coach-response-v1";

/** @type {string[]} All registered API routes. */
export const RUNTIME_ROUTES = [
  "/api/health",
  "/api/config",
  "/api/key-check",
  "/api/chat",
  "/api/meta",
  "/api/runtime-brief",
  "/api/escalation-readiness",
  "/api/progress-trends",
  "/api/review-pack",
  "/api/schema/coach-response"
];

/**
 * Sanitize a base URL: trim whitespace and strip trailing slashes.
 *
 * @param {unknown} value - Raw URL string.
 * @returns {string} Cleaned URL or empty string.
 */
export function sanitizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

/**
 * Normalize a provider preference string to one of the known values.
 *
 * @param {unknown} value - Raw provider string (e.g. from env or payload).
 * @returns {"openai" | "ollama" | "gemini" | "auto"}
 */
export function normalizeProvider(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "openai" || raw === "ollama" || raw === "gemini") return raw;
  return "auto";
}

/**
 * Parse a boolean-like flag from environment variables.
 * Recognizes "1", "true", "yes", "on" as truthy; everything else as falsy.
 *
 * @param {unknown} value - Raw flag value.
 * @returns {boolean}
 */
export function parseBoolFlag(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Check whether a server-side OpenAI API key is enabled and present.
 *
 * @param {Record<string, string>} env - Environment bindings.
 * @returns {boolean} True when ALLOW_SERVER_OPENAI_KEY is truthy and OPENAI_API_KEY is set.
 */
export function hasEnabledServerApiKey(env) {
  return (parseBoolFlag(env.ALLOW_SERVER_OPENAI_KEY) && Boolean(env.OPENAI_API_KEY)) || Boolean(env.GEMINI_API_KEY);
}

/**
 * Determine whether a hostname refers to the local machine.
 *
 * @param {unknown} hostname - Hostname to check.
 * @returns {boolean}
 */
export function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Determine whether the Ollama local-model provider is enabled.
 *
 * Checks the ENABLE_OLLAMA env var first; if not set, infers from whether
 * the request is coming from a local hostname.
 *
 * @param {Record<string, string>} env - Environment bindings.
 * @param {string} requestUrl - Full request URL.
 * @returns {boolean}
 */
export function isOllamaEnabled(env, requestUrl) {
  const flag = String(env.ENABLE_OLLAMA || "")
    .trim()
    .toLowerCase();
  if (flag) {
    return !["false", "0", "off", "no"].includes(flag);
  }

  try {
    return isLocalHostname(new URL(requestUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Build the coach-response JSON schema contract.
 *
 * @returns {{ schema: string, required_fields: string[], fallback_fields: string[], optional_fields: string[], operator_rules: string[] }}
 */
export function buildCoachResponseSchema() {
  return {
    schema: COACH_RESPONSE_SCHEMA,
    required_fields: ["reply", "escalated", "mode", "provider"],
    fallback_fields: ["fallback", "fallbackReason"],
    optional_fields: ["resources", "next_steps"],
    operator_rules: [
      "Escalate immediately when crisis intent or self-harm risk is detected.",
      "Prefer BYOK at runtime; any server-side LLM key must stay explicitly enabled and reviewable.",
      "Fallback responses must remain explicit when a live LLM path is unavailable."
    ]
  };
}

/**
 * @typedef {Object} RuntimeDiagnostics
 * @property {string} runtimeMode - Current runtime mode ("server-key", "ollama-local", or "runtime-key").
 * @property {boolean} llmReady - Whether any LLM path is available.
 * @property {boolean} monetizationReady - Whether AdSense is configured.
 * @property {string} nextAction - Human-readable next action for the operator.
 */

/**
 * Build runtime diagnostics from the current environment state.
 *
 * @param {Object} params
 * @param {boolean} params.hasServerApiKey - Whether a server-side API key is enabled.
 * @param {boolean} params.monetizationReady - Whether AdSense client ID is configured.
 * @param {boolean} params.ollamaEnabled - Whether Ollama is available.
 * @param {string} params.providerPreference - Normalized provider preference.
 * @returns {RuntimeDiagnostics}
 */
export function buildRuntimeDiagnostics({ hasServerApiKey, monetizationReady, ollamaEnabled, providerPreference }) {
  const llmReady = hasServerApiKey || ollamaEnabled;
  let runtimeMode = "runtime-key";
  if (hasServerApiKey) runtimeMode = "server-key";
  else if (ollamaEnabled && providerPreference !== "openai" && providerPreference !== "gemini")
    runtimeMode = "ollama-local";

  return {
    runtimeMode,
    llmReady,
    monetizationReady,
    nextAction: llmReady
      ? "Call /api/runtime-brief or /api/chat to validate the active runtime path."
      : "Provide BYOK at runtime or enable local/server LLM support before launch."
  };
}

/**
 * Build the full runtime-brief payload used by /api/runtime-brief and other routes.
 *
 * @param {Record<string, string>} env - Environment bindings.
 * @param {string} requestUrl - Full request URL.
 * @returns {Record<string, unknown>} Complete runtime-brief JSON payload.
 */
export function buildRuntimeBrief(env, requestUrl) {
  const providerPreference = normalizeProvider(env.LLM_PROVIDER || "");
  const hasServerApiKey = hasEnabledServerApiKey(env);
  const ollamaEnabled = isOllamaEnabled(env, requestUrl);
  const monetizationReady = Boolean(String(env.ADSENSE_CLIENT || "").trim());
  const diagnostics = buildRuntimeDiagnostics({
    hasServerApiKey,
    monetizationReady,
    ollamaEnabled,
    providerPreference
  });

  return {
    status: "ok",
    service: "the-savior",
    generated_at: new Date().toISOString(),
    readiness_contract: READINESS_CONTRACT,
    headline: "BYOK-first Buddhist wellness copilot with explicit fallback and local Ollama recovery paths.",
    report_contract: buildCoachResponseSchema(),
    llm: {
      providerPreference,
      runtimeMode: diagnostics.runtimeMode,
      hasServerApiKey,
      hasServerGeminiKey: Boolean(String(env.GEMINI_API_KEY || "").trim()),
      geminiModel: String(env.GEMINI_MODEL || "").trim() || "gemini-2.5-flash",
      ollamaEnabled,
      ollamaModel: String(env.OLLAMA_MODEL || OLLAMA_MODEL_NAME).trim() || OLLAMA_MODEL_NAME,
      byokPreferred: true,
      canServeWithoutUserKey: hasServerApiKey || ollamaEnabled
    },
    monetization: {
      adsenseConfigured: monetizationReady,
      slotsConfigured: {
        top: Boolean(String(env.ADSENSE_SLOT_TOP || "").trim()),
        bottom: Boolean(String(env.ADSENSE_SLOT_BOTTOM || "").trim())
      }
    },
    review_flow: [
      "Check config and health before opening the coaching surface to external traffic.",
      "Validate BYOK or server-key posture before enabling live OpenAI responses.",
      "Keep fallback mode visible so operators can distinguish scripted coaching from live LLM output."
    ],
    two_minute_review: [
      "Open /api/health and /api/meta to confirm provider posture, monetization state, and route coverage.",
      "Open /api/runtime-brief to verify runtime mode, schema contract, and fallback behavior.",
      "Open /api/review-pack and confirm safety boundary versus revenue boundary before public traffic.",
      "Validate live chat plus fallback copy only after BYOK, server-key, or Ollama posture is understood."
    ],
    operator_rules: [
      "Crisis keywords always override monetization or engagement goals.",
      "Do not imply therapy, diagnosis, or guaranteed outcomes.",
      "Use runtime API keys ephemerally unless the user explicitly stores them in-session."
    ],
    watchouts: [
      "If neither BYOK, server key, nor Ollama is available, only fallback coaching can run.",
      "AdSense state must never affect safety routing or crisis escalation."
    ],
    proof_assets: [
      {
        label: "Health Route",
        path: "/api/health",
        why: "Shows active provider posture, LLM readiness, and next operator action."
      },
      {
        label: "Runtime Brief",
        path: "/api/runtime-brief",
        why: "Pins runtime mode, schema contract, review flow, and watchouts."
      },
      {
        label: "Escalation Readiness",
        path: "/api/escalation-readiness",
        why: "Makes crisis escalation posture and fallback guardrails explicit before public traffic."
      },
      {
        label: "Review Pack",
        path: "/api/review-pack",
        why: "Packages safety boundary, revenue boundary, and operator sequence in one payload."
      },
      {
        label: "Progress Trends",
        path: "/api/progress-trends",
        why: "Shows coaching cadence, fallback/runtime posture, and escalation trend deltas over recent sessions."
      },
      {
        label: "Coach Schema",
        path: "/api/schema/coach-response",
        why: "Locks the expected coach response contract before a public demo."
      }
    ],
    routes: RUNTIME_ROUTES,
    diagnostics,
    links: {
      health: "/api/health",
      config: "/api/config",
      meta: "/api/meta",
      runtime_brief: "/api/runtime-brief",
      escalation_readiness: "/api/escalation-readiness",
      progress_trends: "/api/progress-trends",
      review_pack: "/api/review-pack",
      coach_schema: "/api/schema/coach-response"
    }
  };
}

/**
 * Build the review-pack payload used by /api/review-pack.
 *
 * Wraps the runtime status with safety/revenue boundaries and operator sequence.
 *
 * @param {Record<string, string>} env - Environment bindings.
 * @param {string} requestUrl - Full request URL.
 * @returns {Record<string, unknown>} Complete review-pack JSON payload.
 */
export function buildReviewPack(env, requestUrl) {
  const runtimeBrief = buildRuntimeBrief(env, requestUrl);
  const diagnostics = runtimeBrief.diagnostics || {};
  const llm = runtimeBrief.llm || {};
  const monetization = runtimeBrief.monetization || {};

  return {
    status: "ok",
    service: "the-savior",
    generated_at: new Date().toISOString(),
    readiness_contract: REVIEW_PACK_CONTRACT,
    headline:
      "Operator pack for a Buddhist wellness copilot: safety escalation, BYOK/runtime posture, and monetization separation in one contract.",
    proof_bundle: {
      runtimeMode: diagnostics.runtimeMode || "runtime-key",
      llmReady: Boolean(diagnostics.llmReady),
      providerReady: Boolean(llm.canServeWithoutUserKey),
      adsenseConfigured: Boolean(monetization.adsenseConfigured),
      review_routes: [
        "/api/health",
        "/api/meta",
        "/api/runtime-brief",
        "/api/escalation-readiness",
        "/api/progress-trends",
        "/api/review-pack",
        "/api/schema/coach-response"
      ]
    },
    safety_boundary: [
      "Crisis or self-harm signals override engagement and monetization concerns.",
      "Fallback coaching must remain explicit when no live LLM path is available.",
      "BYOK and server-key paths are runtime choices, not hidden defaults."
    ],
    revenue_boundary: [
      "AdSense state must never influence crisis routing or coach response content.",
      "Wellness coaching and monetization surfaces are separated so operators can inspect them independently.",
      "Operators should confirm that fallback mode still behaves safely when ads are configured."
    ],
    review_sequence: [
      "Open /api/health and /api/meta to confirm active provider posture and monetization configuration.",
      "Read /api/runtime-brief and /api/review-pack before enabling public traffic or demo sessions.",
      "Validate live chat plus fallback behavior only after safety and provider boundaries are understood."
    ],
    two_minute_review: [
      "Open /api/health, /api/meta, and /api/runtime-brief to confirm provider and fallback posture.",
      "Open /api/review-pack to check safety escalation and revenue separation before public traffic.",
      "Compare live and fallback behavior only after schema, provider, and monetization state are understood.",
      "Treat crisis escalation as a precondition, not a post-demo check."
    ],
    watchouts: [
      "A ready provider path does not by itself prove safe prompts, moderation, or escalation copy are correct.",
      "When neither BYOK, server key, nor Ollama is available, the service must stay visibly in fallback mode.",
      "Monetization readiness is operational metadata and must not leak into coach tone or decision logic."
    ],
    proof_assets: [
      {
        label: "Health Route",
        path: "/api/health",
        why: "Confirms provider readiness, llm mode, and next action."
      },
      {
        label: "Runtime Brief",
        path: "/api/runtime-brief",
        why: "Summarizes runtime posture and fallback boundaries before a demo."
      },
      {
        label: "Escalation Readiness",
        path: "/api/escalation-readiness",
        why: "Pins crisis gating, fallback visibility, and operator actions in one surface."
      },
      {
        label: "Review Pack",
        path: "/api/review-pack",
        why: "Packages safety and revenue boundaries for operator handoff."
      },
      {
        label: "Progress Trends",
        path: "/api/progress-trends",
        why: "Tracks fallback/runtime mode and escalation posture across recent coaching snapshots."
      },
      {
        label: "Coach Schema",
        path: "/api/schema/coach-response",
        why: "Pins the expected coach response contract for live and fallback paths."
      }
    ],
    links: {
      health: "/api/health",
      meta: "/api/meta",
      runtime_brief: "/api/runtime-brief",
      escalation_readiness: "/api/escalation-readiness",
      progress_trends: "/api/progress-trends",
      review_pack: "/api/review-pack",
      coach_schema: "/api/schema/coach-response"
    }
  };
}

/**
 * Build the escalation-readiness payload used by /api/escalation-readiness.
 *
 * @param {Record<string, string>} env - Environment bindings.
 * @param {string} requestUrl - Full request URL.
 * @returns {Record<string, unknown>} Complete escalation-readiness JSON payload.
 */
export function buildEscalationReadiness(env, requestUrl) {
  const runtimeBrief = buildRuntimeBrief(env, requestUrl);
  const runtimeMode = runtimeBrief.diagnostics?.runtimeMode || "runtime-key";
  const liveReady = Boolean(runtimeBrief.diagnostics?.llmReady);
  return {
    status: "ok",
    service: "the-savior",
    generated_at: new Date().toISOString(),
    contract_version: "the-savior-escalation-readiness-v1",
    summary: {
      runtime_mode: runtimeMode,
      llm_ready: liveReady,
      monetization_ready: Boolean(runtimeBrief.monetization?.adsenseConfigured),
      fallback_visible: true,
      escalation_gate: "crisis-keyword-override"
    },
    guardrails: [
      "Crisis or self-harm signals always override monetization and engagement flows.",
      "Fallback coaching must stay explicit when no live LLM path is available.",
      "Operators should inspect escalation readiness before inviting public review traffic."
    ],
    reviewer_actions: [
      "Read this route before treating the public coach surface as launch-ready.",
      "Verify live versus fallback posture, then compare with /api/review-pack.",
      "Keep escalation copy reviewable whenever provider settings change."
    ],
    links: {
      health: "/api/health",
      runtime_brief: "/api/runtime-brief",
      escalation_readiness: "/api/escalation-readiness",
      progress_trends: "/api/progress-trends",
      review_pack: "/api/review-pack"
    }
  };
}

/**
 * Build the progress-trends payload used by /api/progress-trends.
 *
 * Returns synthetic coaching session snapshots for operator consumption.
 *
 * @param {Record<string, string>} env - Environment bindings.
 * @param {string} requestUrl - Full request URL.
 * @returns {Record<string, unknown>} Complete progress-trends JSON payload.
 */
export function buildProgressTrends(env, requestUrl) {
  const runtimeBrief = buildRuntimeBrief(env, requestUrl);
  const runtimeMode = runtimeBrief.diagnostics?.runtimeMode || "runtime-key";
  const items = [
    {
      session_id: "sess-001",
      mood_delta: 1,
      fallback: runtimeMode === "runtime-key",
      escalation: false,
      cadence: "daily"
    },
    { session_id: "sess-002", mood_delta: 2, fallback: false, escalation: false, cadence: "daily" },
    {
      session_id: "sess-003",
      mood_delta: -1,
      fallback: runtimeMode !== "server-key",
      escalation: true,
      cadence: "recovery"
    }
  ];
  return {
    status: "ok",
    service: "the-savior",
    generated_at: new Date().toISOString(),
    contract_version: "the-savior-progress-trends-v1",
    summary: {
      sessions: items.length,
      fallback_sessions: items.filter((item) => item.fallback).length,
      escalations: items.filter((item) => item.escalation).length,
      runtime_mode: runtimeMode
    },
    items,
    review_actions: [
      "Compare recent coaching cadence before claiming sustained user progress.",
      "Keep fallback/runtime posture visible when reviewing session improvements.",
      "Escalation spikes should be reviewed before public wellness claims."
    ],
    links: {
      health: "/api/health",
      runtime_brief: "/api/runtime-brief",
      progress_trends: "/api/progress-trends",
      review_pack: "/api/review-pack"
    }
  };
}
