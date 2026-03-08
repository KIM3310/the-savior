export const OLLAMA_MODEL_NAME = "llama3.2:latest";
export const READINESS_CONTRACT = "the-savior-runtime-brief-v1";
export const COACH_RESPONSE_SCHEMA = "the-savior-coach-response-v1";
export const RUNTIME_ROUTES = [
  "/api/health",
  "/api/config",
  "/api/key-check",
  "/api/chat",
  "/api/meta",
  "/api/runtime-brief",
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
      coach_schema: "/api/schema/coach-response"
    }
  };
}
