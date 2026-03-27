/**
 * Escalation readiness endpoint for The Savior.
 *
 * Returns crisis escalation posture, guardrails, and reviewer actions
 * to confirm safety gating before public traffic.
 *
 * @module api/escalation-readiness
 */

import { createLogger } from "./_logger.js";
import { jsonResponse } from "./_response.js";
import { buildEscalationReadiness } from "./_runtime.js";
import { checkRateLimit, getRequestId, resolveCors } from "./_security.js";

/** @type {{ methods: string, allowHeaders: string }} */
const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  allowHeaders: "Content-Type"
};

/**
 * Handle CORS preflight for the escalation-readiness endpoint.
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
 * GET handler for /api/escalation-readiness.
 *
 * Returns escalation posture including crisis gating mode,
 * guardrails, and reviewer actions.
 *
 * @param {{ request: Request, env: Record<string, string> }} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  const log = createLogger({ requestId, scope: "escalation-readiness", env: context.env });
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    log.warn("CORS origin blocked");
    return jsonResponse({ error: "허용되지 않은 요청 출처입니다." }, 403, {
      corsHeaders: cors.headers,
      extraHeaders: { "X-Request-Id": requestId }
    });
  }

  const rate = checkRateLimit(context.request, context.env, {
    scope: "escalation-readiness",
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

  log.info("escalation readiness served");

  return jsonResponse(buildEscalationReadiness(context.env, context.request.url), 200, {
    corsHeaders: cors.headers,
    extraHeaders: {
      ...rate.headers,
      "X-Request-Id": requestId
    }
  });
}
