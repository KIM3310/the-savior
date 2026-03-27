/**
 * Configuration endpoint for The Savior.
 *
 * Returns runtime configuration (provider posture, monetization,
 * build info) to the front-end client.
 *
 * @module api/config
 */

import { createLogger } from "./_logger.js";
import { jsonResponse } from "./_response.js";
import { checkRateLimit, getRequestId, resolveCors } from "./_security.js";

/** @type {{ methods: string, allowHeaders: string }} */
const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  allowHeaders: "Content-Type"
};

/** @type {string} */
const OLLAMA_MODEL_NAME = "llama3.2:latest";

/**
 * Sanitize a base URL: trim whitespace and strip trailing slashes.
 *
 * @param {unknown} value - Raw URL string.
 * @returns {string}
 */
function sanitizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

/**
 * Normalize a provider preference string.
 *
 * @param {unknown} value
 * @returns {"openai" | "ollama" | "auto"}
 */
function normalizeProvider(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "openai" || raw === "ollama") return raw;
  return "auto";
}

/**
 * Parse a boolean-like flag.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function parseBoolFlag(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Check whether a server-side OpenAI API key is enabled.
 *
 * @param {Record<string, string>} env
 * @returns {boolean}
 */
function hasEnabledServerApiKey(env) {
  return parseBoolFlag(env.ALLOW_SERVER_OPENAI_KEY) && Boolean(env.OPENAI_API_KEY);
}

/**
 * Determine whether a hostname refers to the local machine.
 *
 * @param {unknown} hostname
 * @returns {boolean}
 */
function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Determine whether Ollama is enabled.
 *
 * @param {Record<string, string>} env
 * @param {string} requestUrl
 * @returns {boolean}
 */
function isOllamaEnabled(env, requestUrl) {
  const flag = String(env.ENABLE_OLLAMA || "")
    .trim()
    .toLowerCase();
  if (flag) {
    return flag !== "false" && flag !== "0" && flag !== "off" && flag !== "no";
  }

  try {
    return isLocalHostname(new URL(requestUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Handle CORS preflight for the config endpoint.
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
 * GET handler for /api/config.
 *
 * Returns client-facing runtime configuration including provider posture,
 * Ollama status, monetization slots, and build metadata.
 *
 * @param {{ request: Request, env: Record<string, string> }} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  const log = createLogger({ requestId, scope: "config", env: context.env });
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    log.warn("CORS origin blocked");
    return jsonResponse({ error: "허용되지 않은 요청 출처입니다." }, 403, {
      corsHeaders: cors.headers,
      extraHeaders: { "X-Request-Id": requestId }
    });
  }

  const rate = checkRateLimit(context.request, context.env, {
    scope: "config",
    limitDefault: 120,
    limitEnvName: "CONFIG_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "CONFIG_RATE_LIMIT_WINDOW_MS"
  });
  if (!rate.allowed) {
    log.warn("rate limit exceeded", { remaining: rate.remaining });
    return jsonResponse({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429, {
      corsHeaders: cors.headers,
      extraHeaders: {
        ...rate.headers,
        "X-Request-Id": requestId
      }
    });
  }

  const hasServerApiKey = hasEnabledServerApiKey(context.env);
  const llmProviderPreference = normalizeProvider(context.env.LLM_PROVIDER || "");
  const ollamaEnabled = isOllamaEnabled(context.env, context.request.url);
  const ollamaModel = String(context.env.OLLAMA_MODEL || OLLAMA_MODEL_NAME).trim() || OLLAMA_MODEL_NAME;
  const adsenseClient = context.env.ADSENSE_CLIENT || "";
  const adsenseSlotTop = context.env.ADSENSE_SLOT_TOP || "";
  const adsenseSlotBottom = context.env.ADSENSE_SLOT_BOTTOM || "";
  const configuredBaseUrl = sanitizeBaseUrl(context.env.PUBLIC_API_BASE_URL || "");
  const requestOrigin = sanitizeBaseUrl(new URL(context.request.url).origin);

  log.info("config served", { provider: llmProviderPreference, ollamaEnabled });

  return jsonResponse(
    {
      hasServerApiKey,
      llmProviderPreference,
      ollamaEnabled,
      ollamaModel,
      apiBaseUrl: configuredBaseUrl || requestOrigin,
      adsenseClient,
      adsenseSlots: {
        top: adsenseSlotTop,
        bottom: adsenseSlotBottom
      },
      generatedAt: new Date().toISOString(),
      build: {
        branch: context.env.CF_PAGES_BRANCH || "",
        commit: String(context.env.CF_PAGES_COMMIT_SHA || "").slice(0, 8)
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
