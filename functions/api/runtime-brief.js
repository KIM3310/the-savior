/**
 * Runtime brief endpoint for The Savior.
 *
 * Returns the complete runtime-brief payload including provider posture,
 * review flow, operator rules, and proof assets.
 *
 * @module api/runtime-brief
 */

import { createLogger } from "./_logger.js";
import { jsonResponse } from "./_response.js";
import { buildRuntimeBrief } from "./_runtime.js";
import { checkRateLimit, getRequestId, resolveCors } from "./_security.js";

/** @type {{ methods: string, allowHeaders: string }} */
const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  allowHeaders: "Content-Type"
};

/**
 * Handle CORS preflight for the runtime-brief endpoint.
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
 * GET handler for /api/runtime-brief.
 *
 * Returns comprehensive runtime posture, schema contracts,
 * review flow, watchouts, and proof assets.
 *
 * @param {{ request: Request, env: Record<string, string> }} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  const log = createLogger({ requestId, scope: "runtime-brief", env: context.env });
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    log.warn("CORS origin blocked");
    return jsonResponse({ error: "허용되지 않은 요청 출처입니다." }, 403, {
      corsHeaders: cors.headers,
      extraHeaders: { "X-Request-Id": requestId }
    });
  }

  const rate = checkRateLimit(context.request, context.env, {
    scope: "runtime-brief",
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

  log.info("runtime status served");

  return jsonResponse(buildRuntimeBrief(context.env, context.request.url), 200, {
    corsHeaders: cors.headers,
    extraHeaders: {
      ...rate.headers,
      "X-Request-Id": requestId
    }
  });
}
