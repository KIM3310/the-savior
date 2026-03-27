/**
 * Health-check endpoint for The Savior.
 *
 * Returns service status, LLM posture, diagnostics, and links to
 * other operational routes.
 *
 * @module api/health
 */

import { createLogger } from "./_logger.js";
import { jsonResponse } from "./_response.js";
import { buildRuntimeBrief, hasEnabledServerApiKey, READINESS_CONTRACT, RUNTIME_ROUTES } from "./_runtime.js";
import { checkRateLimit, getRequestId, resolveCors } from "./_security.js";

/** @type {{ methods: string, allowHeaders: string }} */
const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  allowHeaders: "Content-Type"
};

/**
 * Handle CORS preflight for the health endpoint.
 *
 * @param {{ request: Request, env: Record<string, string> }} context
 * @returns {Promise<Response>}
 */
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

/**
 * GET handler for /api/health.
 *
 * Returns service health including LLM mode, provider readiness,
 * route list, contracts, and diagnostic next actions.
 *
 * @param {{ request: Request, env: Record<string, string> }} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  const log = createLogger({ requestId, scope: "health", env: context.env });
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    log.warn("CORS origin blocked");
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
    log.warn("rate limit exceeded");
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

  const runtimeBrief = buildRuntimeBrief(context.env, context.request.url);
  const diagnostics = {
    llmMode: runtimeBrief.diagnostics.runtimeMode,
    providerReady: runtimeBrief.llm.canServeWithoutUserKey || hasEnabledServerApiKey(context.env),
    nextAction: runtimeBrief.diagnostics.llmReady
      ? "Call /api/chat to validate the live counseling flow."
      : "Provide a runtime API key via /api/key-check or enable ALLOW_SERVER_OPENAI_KEY."
  };

  log.info("health check", { mode: diagnostics.llmMode, ready: diagnostics.providerReady });

  return jsonResponse(
    {
      status: "ok",
      service: "the-savior",
      now: new Date().toISOString(),
      hasServerApiKey: hasEnabledServerApiKey(context.env),
      diagnostics,
      readiness_contract: READINESS_CONTRACT,
      report_contract: runtimeBrief.report_contract,
      capabilities: [
        "byok-runtime-key",
        "server-key-guardrail",
        "ollama-local",
        "fallback-coach",
        "review-pack-surface",
        "progress-trends-surface"
      ],
      routes: RUNTIME_ROUTES,
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
        meta: "/api/meta",
        runtime_brief: "/api/runtime-brief",
        escalation_readiness: "/api/escalation-readiness",
        progress_trends: "/api/progress-trends",
        review_pack: "/api/review-pack",
        coach_schema: "/api/schema/coach-response"
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
