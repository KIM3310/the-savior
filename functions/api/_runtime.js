export const OLLAMA_MODEL_NAME = "llama3.2:latest";
export const READINESS_CONTRACT = "the-savior-runtime-brief-v1";
export const REVIEW_PACK_CONTRACT = "the-savior-review-pack-v1";
export const COACH_RESPONSE_SCHEMA = "the-savior-coach-response-v1";
export const RUNTIME_ROUTES = [
  "/api/health",
  "/api/config",
  "/api/key-check",
  "/api/chat",
  "/api/meta",
  "/api/runtime-brief",
  "/api/review-pack",
  "/api/schema/coach-response"
];

export function sanitizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

export function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "openai" || raw === "ollama") return raw;
  return "auto";
}

export function parseBoolFlag(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function hasEnabledServerApiKey(env) {
  return parseBoolFlag(env.ALLOW_SERVER_OPENAI_KEY) && Boolean(env.OPENAI_API_KEY);
}

export function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function isOllamaEnabled(env, requestUrl) {
  const flag = String(env.ENABLE_OLLAMA || "").trim().toLowerCase();
  if (flag) {
    return !["false", "0", "off", "no"].includes(flag);
  }

  try {
    return isLocalHostname(new URL(requestUrl).hostname);
  } catch {
    return false;
  }
}

export function buildCoachResponseSchema() {
  return {
    schema: COACH_RESPONSE_SCHEMA,
    required_fields: ["reply", "escalated", "mode", "provider"],
    fallback_fields: ["fallback", "fallbackReason"],
    operator_rules: [
      "Escalate immediately when crisis intent or self-harm risk is detected.",
      "Prefer BYOK at runtime; server-side OpenAI usage must stay explicitly enabled.",
      "Fallback responses must remain explicit when a live LLM path is unavailable."
    ]
  };
}

export function buildRuntimeDiagnostics({
  hasServerApiKey,
  monetizationReady,
  ollamaEnabled,
  providerPreference
}) {
  const llmReady = hasServerApiKey || ollamaEnabled;
  let runtimeMode = "runtime-key";
  if (hasServerApiKey) runtimeMode = "server-key";
  else if (ollamaEnabled && providerPreference !== "openai") runtimeMode = "ollama-local";

  return {
    runtimeMode,
    llmReady,
    monetizationReady,
    nextAction: llmReady
      ? "Call /api/runtime-brief or /api/chat to validate the active runtime path."
      : "Provide BYOK at runtime or enable local/server LLM support before launch."
  };
}

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
    operator_rules: [
      "Crisis keywords always override monetization or engagement goals.",
      "Do not imply therapy, diagnosis, or guaranteed outcomes.",
      "Use runtime API keys ephemerally unless the user explicitly stores them in-session."
    ],
    watchouts: [
      "If neither BYOK, server key, nor Ollama is available, only fallback coaching can run.",
      "AdSense state must never affect safety routing or crisis escalation."
    ],
    routes: RUNTIME_ROUTES,
    diagnostics,
    links: {
      health: "/api/health",
      config: "/api/config",
      meta: "/api/meta",
      runtime_brief: "/api/runtime-brief",
      review_pack: "/api/review-pack",
      coach_schema: "/api/schema/coach-response"
    }
  };
}

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
      "Reviewer pack for a Buddhist wellness copilot: safety escalation, BYOK/runtime posture, and monetization separation in one contract.",
    proof_bundle: {
      runtimeMode: diagnostics.runtimeMode || "runtime-key",
      llmReady: Boolean(diagnostics.llmReady),
      providerReady: Boolean(llm.canServeWithoutUserKey),
      adsenseConfigured: Boolean(monetization.adsenseConfigured),
      review_routes: [
        "/api/health",
        "/api/meta",
        "/api/runtime-brief",
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
      "Wellness coaching and monetization surfaces are separated so reviewers can inspect them independently.",
      "Operators should confirm that fallback mode still behaves safely when ads are configured."
    ],
    review_sequence: [
      "Open /api/health and /api/meta to confirm active provider posture and monetization configuration.",
      "Read /api/runtime-brief and /api/review-pack before enabling public traffic or demo sessions.",
      "Validate live chat plus fallback behavior only after safety and provider boundaries are understood."
    ],
    watchouts: [
      "A ready provider path does not by itself prove safe prompts, moderation, or escalation copy are correct.",
      "When neither BYOK, server key, nor Ollama is available, the service must stay visibly in fallback mode.",
      "Monetization readiness is operational metadata and must not leak into coach tone or decision logic."
    ],
    links: {
      health: "/api/health",
      meta: "/api/meta",
      runtime_brief: "/api/runtime-brief",
      review_pack: "/api/review-pack",
      coach_schema: "/api/schema/coach-response"
    }
  };
}
