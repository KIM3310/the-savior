import { RequestValidationError, checkRateLimit, getRequestId, readJsonBody, resolveCors } from "./_security.js";

const OPENAI_TIMEOUT_MS = 10_000;
const CORS_OPTIONS = {
  methods: "POST, OPTIONS",
  allowHeaders: "Content-Type"
};

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

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isLikelyOpenAIKey(value) {
  const key = normalizeApiKey(value);
  return key.startsWith("sk-") && !/\s/.test(key) && key.length >= 20 && key.length <= 260;
}

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.message === "string") return payload.message;
  if (payload.error && typeof payload.error.message === "string") return payload.error.message;
  return "";
}

async function verifyApiKeyWithOpenAI(apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        valid: false,
        usable: false,
        message: "키 유효성 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
      };
    }

    return {
      valid: false,
      usable: false,
      message: "키 유효성 확인 중 네트워크 오류가 발생했습니다."
    };
  } finally {
    clearTimeout(timeout);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const detail = extractErrorMessage(payload);
  if (response.ok) {
    return {
      valid: true,
      usable: true,
      message: "유효한 API 키입니다."
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      valid: false,
      usable: false,
      message: "인증에 실패했습니다. API 키를 다시 확인해 주세요."
    };
  }

  if (response.status === 429) {
    return {
      valid: true,
      usable: false,
      message: "키는 확인되었지만 사용량 한도 또는 결제 상태 확인이 필요합니다."
    };
  }

  return {
    valid: false,
    usable: false,
    message: detail ? "키 유효성 확인 중 OpenAI 응답 오류가 발생했습니다." : "키 유효성 확인 중 오류가 발생했습니다."
  };
}

export async function onRequestOptions(context) {
  const requestId = getRequestId(context.request);
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    return new Response(null, {
      status: 403,
      headers: {
        Allow: "POST, OPTIONS",
        "X-Request-Id": requestId,
        ...cors.headers
      }
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "X-Request-Id": requestId,
      ...cors.headers
    }
  });
}

export async function onRequestPost(context) {
  const requestId = getRequestId(context.request);
  const cors = resolveCors(context.request, context.env, CORS_OPTIONS);
  if (!cors.allowed) {
    return jsonResponse({ valid: false, usable: false, message: "허용되지 않은 요청 출처입니다." }, 403, {
      corsHeaders: cors.headers,
      extraHeaders: { "X-Request-Id": requestId }
    });
  }

  const rate = checkRateLimit(context.request, context.env, {
    scope: "keycheck",
    limitDefault: 25,
    limitEnvName: "KEYCHECK_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "KEYCHECK_RATE_LIMIT_WINDOW_MS"
  });
  if (!rate.allowed) {
    return jsonResponse(
      {
        valid: false,
        usable: false,
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
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

  try {
    const payload = await readJsonBody(context.request, { maxBytes: 2000 });

    const candidate = normalizeApiKey(payload && payload.key ? payload.key : "");

    if (!isLikelyOpenAIKey(candidate)) {
      return jsonResponse(
        {
          valid: false,
          usable: false,
          message: "유효한 OpenAI API 키 형식이 아닙니다. `sk-`로 시작하는 키를 확인해 주세요."
        },
        400,
        {
          corsHeaders: cors.headers,
          extraHeaders: {
            ...rate.headers,
            "X-Request-Id": requestId
          }
        }
      );
    }

    const result = await verifyApiKeyWithOpenAI(candidate);
    const status = result.valid ? 200 : 400;
    return jsonResponse(result, status, {
      corsHeaders: cors.headers,
      extraHeaders: {
        ...rate.headers,
        "X-Request-Id": requestId
      }
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return jsonResponse(
        {
          valid: false,
          usable: false,
          message: error.message
        },
        error.status,
        {
          corsHeaders: cors.headers,
          extraHeaders: {
            ...rate.headers,
            "X-Request-Id": requestId
          }
        }
      );
    }

    return jsonResponse(
      {
        valid: false,
        usable: false,
        message: "요청 처리 중 문제가 발생했습니다."
      },
      500,
      {
        corsHeaders: cors.headers,
        extraHeaders: {
          ...rate.headers,
          "X-Request-Id": requestId
        }
      }
    );
  }
}
