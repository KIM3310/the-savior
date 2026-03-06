import { checkRateLimit, getRequestId, resolveCors } from "./_security.js";

const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  allowHeaders: "Content-Type"
};

function parseBoolFlag(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function hasEnabledServerApiKey(env) {
  return parseBoolFlag(env.ALLOW_SERVER_OPENAI_KEY) && Boolean(env.OPENAI_API_KEY);
}

function buildHealthDiagnostics(env) {
  const providerReady = hasEnabledServerApiKey(env);
  return {
    llmMode: providerReady ? "server-key" : "runtime-key-or-local",
    providerReady,
    nextAction: providerReady
      ? "Call /api/chat to validate the live counseling flow."
      : "Provide a runtime API key via /api/key-check or enable ALLOW_SERVER_OPENAI_KEY."
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
    return jsonResponse({ status: "forbidden" }, 403, {
      corsHeaders: cors.headers,
      extraHeaders: { "X-Request-Id": requestId }
    });
  }

  const rate = checkRateLimit(context.request, context.env, {
    scope: "health",
    limitDefault: 240,
    limitEnvName: "HEALTH_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "HEALTH_RATE_LIMIT_WINDOW_MS"
  });
  if (!rate.allowed) {
    return jsonResponse(
      {
        status: "rate_limited"
      },
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

  const diagnostics = buildHealthDiagnostics(context.env);

  return jsonResponse(
    {
      status: "ok",
      service: "the-savior",
      now: new Date().toISOString(),
      hasServerApiKey: hasEnabledServerApiKey(context.env),
      diagnostics,
      ops_contract: {
        schema: "ops-envelope-v1",
        version: 1,
        required_fields: ["service", "status", "diagnostics.nextAction"]
      },
      build: {
        branch: context.env.CF_PAGES_BRANCH || "",
        commit: String(context.env.CF_PAGES_COMMIT_SHA || "").slice(0, 8)
      },
      links: {
        config: "/api/config",
        meta: "/api/meta"
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
