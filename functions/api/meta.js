import { checkRateLimit, getRequestId, resolveCors } from "./_security.js";

const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  allowHeaders: "Content-Type"
};
const OLLAMA_MODEL_NAME = "llama3.2:latest";

function sanitizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "openai" || raw === "ollama") return raw;
  return "auto";
}

function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isOllamaEnabled(env, requestUrl) {
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

function buildMetaDiagnostics({
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
      ? "Call /api/chat or /api/config to validate the active runtime path."
      : "Provide BYOK at runtime or enable local/server LLM support before launch."
  };
}

function jsonResponse(payload, status = 200, { corsHeaders = {}, extraHeaders = {}, cacheControl = "no-store" } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      ...corsHeaders,
      ...extraHeaders
    }
  });
}

export async function onRequestOptions(context) {
  const requestId = getRequestId(context.request);
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    return new Response(null, {
      status: 403,
      headers: {
        Allow: "GET, OPTIONS",
        "X-Request-Id": requestId,
        ...cors.headers
      }
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "X-Request-Id": requestId,
      ...cors.headers
    }
  });
}

export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    return jsonResponse({ error: "허용되지 않은 요청 출처입니다." }, 403, {
      corsHeaders: cors.headers,
      extraHeaders: { "X-Request-Id": requestId }
    });
  }

  const rate = checkRateLimit(context.request, context.env, {
    scope: "meta",
    limitDefault: 120,
    limitEnvName: "META_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "META_RATE_LIMIT_WINDOW_MS"
  });
  if (!rate.allowed) {
    return jsonResponse(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      429,
      {
        corsHeaders: cors.headers,
        extraHeaders: {
          ...rate.headers,
          "X-Request-Id": requestId
        }
      }
    );
  }

  const requestOrigin = sanitizeBaseUrl(new URL(context.request.url).origin);
  const configuredBaseUrl = sanitizeBaseUrl(context.env.PUBLIC_API_BASE_URL || "");
  const providerPreference = normalizeProvider(context.env.LLM_PROVIDER || "");
  const hasServerApiKey = Boolean(context.env.OPENAI_API_KEY);
  const ollamaEnabled = isOllamaEnabled(context.env, context.request.url);
  const monetizationReady = Boolean(String(context.env.ADSENSE_CLIENT || "").trim());
  const diagnostics = buildMetaDiagnostics({
    hasServerApiKey,
    monetizationReady,
    ollamaEnabled,
    providerPreference
  });

  return jsonResponse(
    {
      status: "ok",
      service: "the-savior",
      generatedAt: new Date().toISOString(),
      build: {
        branch: context.env.CF_PAGES_BRANCH || "",
        commit: String(context.env.CF_PAGES_COMMIT_SHA || "").slice(0, 8)
      },
      llm: {
        providerPreference,
        hasServerApiKey,
        ollamaEnabled,
        ollamaModel: String(context.env.OLLAMA_MODEL || OLLAMA_MODEL_NAME).trim() || OLLAMA_MODEL_NAME
      },
      api: {
        publicBaseUrl: configuredBaseUrl || requestOrigin,
        routes: ["/api/health", "/api/config", "/api/key-check", "/api/chat", "/api/meta"]
      },
      monetization: {
        adsenseConfigured: monetizationReady,
        slotsConfigured: {
          top: Boolean(String(context.env.ADSENSE_SLOT_TOP || "").trim()),
          bottom: Boolean(String(context.env.ADSENSE_SLOT_BOTTOM || "").trim())
        }
      },
      diagnostics,
      ops_contract: {
        schema: "ops-envelope-v1",
        version: 1,
        required_fields: ["service", "status", "diagnostics.nextAction"]
      },
      rateLimits: {
        health: {
          limit: String(context.env.HEALTH_RATE_LIMIT_MAX || "240"),
          windowMs: String(context.env.HEALTH_RATE_LIMIT_WINDOW_MS || "60000")
        },
        config: {
          limit: String(context.env.CONFIG_RATE_LIMIT_MAX || "120"),
          windowMs: String(context.env.CONFIG_RATE_LIMIT_WINDOW_MS || "60000")
        },
        meta: {
          limit: String(context.env.META_RATE_LIMIT_MAX || "120"),
          windowMs: String(context.env.META_RATE_LIMIT_WINDOW_MS || "60000")
        }
      }
    },
    200,
    {
      corsHeaders: cors.headers,
      extraHeaders: {
        ...rate.headers,
        "X-Request-Id": requestId
      }
    }
  );
}
