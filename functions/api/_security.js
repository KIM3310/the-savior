/**
 * Security utilities for The Savior API.
 *
 * Provides CORS resolution, rate limiting, request validation, and
 * request-ID propagation for all API routes.
 *
 * @module _security
 */

/** @type {string[]} Origins allowed during local development. */
const DEV_ALLOWED_ORIGINS = [
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "capacitor://localhost",
  "ionic://localhost"
];

/** @type {string[]} Public front-door origins for deployed pages surfaces. */
const PUBLIC_ALLOWED_ORIGINS = ["https://the-savior-9z8.pages.dev"];

/** @type {string} Global key for the in-memory rate-limit store. */
const RATE_STORE_KEY = "__THE_SAVIOR_RATE_STORE__";

/** @type {Map<string, {count: number, resetAt: number}>} */
const RATE_STORE = globalThis[RATE_STORE_KEY] || new Map();
if (!globalThis[RATE_STORE_KEY]) {
  globalThis[RATE_STORE_KEY] = RATE_STORE;
}

/**
 * Error thrown when a request fails validation (bad payload, wrong content-type, etc.).
 * Carries an HTTP status code for direct use in the response.
 */
export class RequestValidationError extends Error {
  /**
   * @param {string} message - Human-readable error description (Korean).
   * @param {number} [status=400] - HTTP status code.
   */
  constructor(message, status = 400) {
    super(message);
    /** @type {string} */
    this.name = "RequestValidationError";
    /** @type {number} */
    this.status = status;
  }
}

/**
 * Normalize an origin string: trim whitespace and strip trailing slashes.
 *
 * @param {unknown} value - Raw origin value.
 * @returns {string} Cleaned origin, or empty string if invalid.
 */
function normalizeOrigin(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

/**
 * Parse a string as a positive integer, clamped to [min, max].
 * Returns the fallback when the value is not a finite number.
 *
 * @param {unknown} value - Raw value (env var, header, etc.).
 * @param {number} fallback - Default when parsing fails.
 * @param {number} min - Lower bound (inclusive).
 * @param {number} max - Upper bound (inclusive).
 * @returns {number}
 */
function parsePositiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

/**
 * Return the UTF-8 byte length of a string.
 *
 * @param {string} value
 * @returns {number}
 */
function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

/**
 * Validate and normalize an incoming X-Request-Id header value.
 * Returns empty string for invalid or missing IDs.
 *
 * @param {unknown} value - Raw header value.
 * @returns {string} Normalized request ID or empty string.
 */
function normalizeRequestId(value) {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";
  if (candidate.length > 80) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(candidate)) return "";
  return candidate;
}

/**
 * Extract or generate a request correlation ID.
 *
 * Prefers a valid incoming `x-request-id` header; falls back to
 * `crypto.randomUUID()` or a timestamp-based ID.
 *
 * @param {Request} request - Incoming HTTP request.
 * @returns {string} Request ID suitable for logging and response headers.
 */
export function getRequestId(request) {
  const incoming = normalizeRequestId(request.headers.get("x-request-id") || "");
  if (incoming) return incoming;
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Read and validate a JSON request body.
 *
 * Enforces content-type, byte-size limits, and object-shape requirements.
 * Throws {@link RequestValidationError} on any violation.
 *
 * @param {Request} request - Incoming HTTP request.
 * @param {Object} [options]
 * @param {number} [options.maxBytes=12000] - Maximum allowed body size in bytes.
 * @returns {Promise<Record<string, unknown>>} Parsed JSON payload (guaranteed to be a plain object).
 * @throws {RequestValidationError} On content-type mismatch, oversized body, empty body, or non-object JSON.
 */
export async function readJsonBody(request, { maxBytes = 12_000 } = {}) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new RequestValidationError("요청 Content-Type은 application/json 이어야 합니다.", 415);
  }

  const contentLengthRaw = request.headers.get("content-length");
  const contentLength = Number.parseInt(String(contentLengthRaw || ""), 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestValidationError("요청 본문 크기가 제한을 초과했습니다.", 413);
  }

  const raw = await request.text();
  if (!raw.trim()) {
    throw new RequestValidationError("요청 본문이 비어 있습니다.", 400);
  }

  if (byteLength(raw) > maxBytes) {
    throw new RequestValidationError("요청 본문 크기가 제한을 초과했습니다.", 413);
  }

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new RequestValidationError("요청 형식이 올바르지 않습니다.", 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RequestValidationError("요청 형식이 올바르지 않습니다.", 400);
  }

  return payload;
}

/**
 * Determine the set of allowed origins for CORS.
 *
 * Resolution order:
 * 1. If `ALLOWED_ORIGINS` is a comma-separated list, use that list.
 * 2. Always include known public and development origins.
 * 3. Ignore wildcard entries so the default trust boundary stays explicit.
 *
 * @param {Request} request
 * @param {Record<string, string>} env
 * @returns {Set<string>}
 */
function readAllowedOrigins(_request, env) {
  const raw = typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : "";
  const explicitOrigins = raw
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin) => origin && origin !== "*");

  const allowedOrigins = new Set(explicitOrigins);
  for (const origin of PUBLIC_ALLOWED_ORIGINS) {
    allowedOrigins.add(normalizeOrigin(origin));
  }
  for (const origin of DEV_ALLOWED_ORIGINS) {
    allowedOrigins.add(normalizeOrigin(origin));
  }
  return allowedOrigins;
}

/**
 * Resolve CORS headers for a request.
 *
 * @param {Request} request - Incoming HTTP request.
 * @param {Record<string, string>} env - Environment bindings.
 * @param {Object} options - CORS configuration.
 * @param {string} options.methods - Allowed HTTP methods (e.g. "GET, OPTIONS").
 * @param {string} options.allowHeaders - Allowed request headers.
 * @returns {{ allowed: boolean, headers: Record<string, string> }}
 */
export function resolveCors(request, env, { methods, allowHeaders }) {
  const requestOrigin = normalizeOrigin(request.headers.get("Origin") || "");
  const origins = readAllowedOrigins(request, env);
  const originAllowed = !requestOrigin || origins.has(requestOrigin);

  /** @type {Record<string, string>} */
  const headers = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": allowHeaders,
    Vary: "Origin"
  };

  if (requestOrigin && origins.has(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  }

  return {
    allowed: originAllowed,
    headers
  };
}

/**
 * Extract the client IP address for rate-limiting purposes.
 * Prefers CF-Connecting-IP, falls back to X-Forwarded-For, then "unknown".
 *
 * @param {Request} request
 * @returns {string} Client IP or "unknown".
 */
function getClientIdentifier(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const forwardedIp = forwarded.split(",")[0].trim();
  const cfIp = request.headers.get("cf-connecting-ip") || "";
  const ip = cfIp || forwardedIp || "unknown";
  return ip;
}

/**
 * Remove expired entries from the in-memory rate-limit store.
 *
 * @param {number} now - Current timestamp in milliseconds.
 */
function cleanupRateStore(now) {
  for (const [key, bucket] of RATE_STORE.entries()) {
    if (!bucket || typeof bucket.resetAt !== "number" || bucket.resetAt <= now) {
      RATE_STORE.delete(key);
    }
  }
}

/**
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed - Whether the request is within the limit.
 * @property {number} limit - Configured maximum requests per window.
 * @property {number} remaining - Requests remaining in the current window.
 * @property {number} resetAtUnix - Window reset time as Unix epoch seconds.
 * @property {number} retryAfterSeconds - Seconds until the client may retry.
 * @property {Record<string, string>} headers - Rate-limit response headers.
 */

/**
 * Check and enforce per-client rate limits using an in-memory sliding window.
 *
 * The store is periodically cleaned when it exceeds 5000 entries or
 * randomly at ~2% of requests to prevent unbounded memory growth.
 *
 * @param {Request} request - Incoming HTTP request.
 * @param {Record<string, string>} env - Environment bindings.
 * @param {Object} config
 * @param {string} config.scope - Rate-limit scope (e.g. "chat", "config").
 * @param {number} config.limitDefault - Default max requests per window.
 * @param {string} config.limitEnvName - Env var name overriding the limit.
 * @param {number} config.windowMsDefault - Default window duration in ms.
 * @param {string} config.windowMsEnvName - Env var name overriding the window.
 * @returns {RateLimitResult}
 */
export function checkRateLimit(request, env, { scope, limitDefault, limitEnvName, windowMsDefault, windowMsEnvName }) {
  const limit = parsePositiveInteger(env[limitEnvName], limitDefault, 1, 500);
  const windowMs = parsePositiveInteger(env[windowMsEnvName], windowMsDefault, 1000, 60 * 60 * 1000);
  const now = Date.now();

  if (RATE_STORE.size > 5000 || Math.random() < 0.02) {
    cleanupRateStore(now);
  }

  const key = `${scope}:${getClientIdentifier(request)}`;
  const current = RATE_STORE.get(key);
  let bucket = current;

  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt: now + windowMs
    };
  }

  bucket.count += 1;
  RATE_STORE.set(key, bucket);

  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  /** @type {Record<string, string>} */
  const headers = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000))
  };

  if (!allowed) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }

  return {
    allowed,
    limit,
    remaining,
    resetAtUnix: Math.ceil(bucket.resetAt / 1000),
    retryAfterSeconds,
    headers
  };
}
