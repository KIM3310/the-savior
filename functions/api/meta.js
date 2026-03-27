/**
 * Meta endpoint for The Savior.
 *
 * Returns comprehensive runtime metadata including LLM posture,
 * API routes, monetization state, diagnostics, and rate-limit config.
 *
 * @module api/meta
 */

import { createLogger } from "./_logger.js";
import { jsonResponse } from "./_response.js";
import {
  buildCoachResponseSchema,
  buildRuntimeDiagnostics,
  hasEnabledServerApiKey,
  isOllamaEnabled,
  normalizeProvider,
  READINESS_CONTRACT,
  RUNTIME_ROUTES,
  sanitizeBaseUrl
} from "./_runtime.js";
import { checkRateLimit, getRequestId, resolveCors } from "./_security.js";

/** @type {{ methods: string, allowHeaders: string }} */
const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  allowHeaders: "Content-Type"
};

/**
 * Handle CORS preflight for the meta endpoint.
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
 * GET handler for /api/meta.
 *
 * Returns full runtime metadata: LLM config, API routes, monetization,
 * diagnostics, contracts, and rate-limit configuration.
 *
 * @param {{ request: Request, env: Record<string, string> }} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  const log = createLogger({ requestId, scope: "meta", env: context.env });
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    log.warn("CORS origin blocked");
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
    log.warn("rate limit exceeded");
    return jsonResponse({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429, {
      corsHeaders: cors.headers,
      extraHeaders: {
        ...rate.headers,
        "X-Request-Id": requestId
      }
    });
  }

  const requestOrigin = sanitizeBaseUrl(new URL(context.request.url).origin);
  const configuredBaseUrl = sanitizeBaseUrl(context.env.PUBLIC_API_BASE_URL || "");
  const providerPreference = normalizeProvider(context.env.LLM_PROVIDER || "");
  const hasServerApiKey = hasEnabledServerApiKey(context.env);
  const ollamaEnabled = isOllamaEnabled(context.env, context.request.url);
  const monetizationReady = Boolean(String(context.env.ADSENSE_CLIENT || "").trim());
  const diagnostics = buildRuntimeDiagnostics({
    hasServerApiKey,
    monetizationReady,
    ollamaEnabled,
    providerPreference
  });

  log.info("meta served", { mode: diagnostics.runtimeMode });

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
        ollamaModel: String(context.env.OLLAMA_MODEL || "").trim() || "llama3.2:latest"
      },
      api: {
        publicBaseUrl: configuredBaseUrl || requestOrigin,
        routes: RUNTIME_ROUTES
      },
      monetization: {
        adsenseConfigured: monetizationReady,
        slotsConfigured: {
          top: Boolean(String(context.env.ADSENSE_SLOT_TOP || "").trim()),
          bottom: Boolean(String(context.env.ADSENSE_SLOT_BOTTOM || "").trim())
        }
      },
      diagnostics,
      readiness_contract: READINESS_CONTRACT,
      review_pack_contract: "the-savior-review-pack-v1",
      report_contract: buildCoachResponseSchema(),
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
