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

const RATE_STORE_KEY = "__THE_SAVIOR_RATE_STORE__";
const RATE_STORE = globalThis[RATE_STORE_KEY] || new Map();
if (!globalThis[RATE_STORE_KEY]) {
  globalThis[RATE_STORE_KEY] = RATE_STORE;
}

export class RequestValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.status = status;
  }
}

function normalizeOrigin(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

function parsePositiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function normalizeRequestId(value) {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";
  if (candidate.length > 80) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(candidate)) return "";
  return candidate;
}

export function getRequestId(request) {
  const incoming = normalizeRequestId(request.headers.get("x-request-id") || "");
  if (incoming) return incoming;
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

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

function readAllowedOrigins(request, env) {
  const raw = typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : "";
  const requestOrigin = normalizeOrigin(new URL(request.url).origin);
  const explicitOrigins = raw
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  const allowAll = explicitOrigins.includes("*");
  if (allowAll) {
    return { allowAll: true, origins: new Set() };
  }

  if (explicitOrigins.length > 0) {
    const origins = new Set(explicitOrigins);
    origins.add(requestOrigin);
    return { allowAll: false, origins };
  }

  const fallbackOrigins = new Set([requestOrigin]);
  DEV_ALLOWED_ORIGINS.forEach((origin) => fallbackOrigins.add(normalizeOrigin(origin)));
  return { allowAll: false, origins: fallbackOrigins };
}

export function resolveCors(request, env, { methods, allowHeaders }) {
  const requestOrigin = normalizeOrigin(request.headers.get("Origin") || "");
  const { allowAll, origins } = readAllowedOrigins(request, env);
  const originAllowed = !requestOrigin || allowAll || origins.has(requestOrigin);

  const headers = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": allowHeaders,
    Vary: "Origin"
  };

  if (allowAll) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (requestOrigin && origins.has(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  }

  return {
    allowed: originAllowed,
    headers
  };
}

function getClientIdentifier(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const forwardedIp = forwarded.split(",")[0].trim();
  const cfIp = request.headers.get("cf-connecting-ip") || "";
  const ip = cfIp || forwardedIp || "unknown";
  return ip;
}

function cleanupRateStore(now) {
  for (const [key, bucket] of RATE_STORE.entries()) {
    if (!bucket || typeof bucket.resetAt !== "number" || bucket.resetAt <= now) {
      RATE_STORE.delete(key);
    }
  }
}

export function checkRateLimit(
  request,
  env,
  { scope, limitDefault, limitEnvName, windowMsDefault, windowMsEnvName }
) {
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
