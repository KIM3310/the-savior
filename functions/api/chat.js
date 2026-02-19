import { RequestValidationError, checkRateLimit, getRequestId, readJsonBody, resolveCors } from "./_security.js";

const MODEL_NAME = "gpt-4.1-mini";
const MAX_INPUT_CHARS = 2000;
const OPENAI_TIMEOUT_MS = 20_000;
const CORS_OPTIONS = {
  methods: "POST, OPTIONS",
  allowHeaders: "Content-Type, X-User-OpenAI-Key"
};

class OpenAIRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "OpenAIRequestError";
    this.status = status;
  }
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

function sanitizeText(value, limit = MAX_INPUT_CHARS) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-6)
    .map((item) => ({
      role: item && item.role === "assistant" ? "assistant" : "user",
      content: sanitizeText(item && item.content ? item.content : "", 400)
    }))
    .filter((item) => item.content.length > 0);
}

function hasCrisisSignal(text) {
  if (!text) return false;
  const crisisPattern = /(자해|극단적 선택|죽고 싶|목숨을 끊|해치고 싶|suicide|kill myself|harm myself|end my life)/i;
  return crisisPattern.test(text);
}

function crisisResponse() {
  return {
    reply:
      "지금 메시지에서 긴급한 위험 신호가 보여요. 저는 위기 대응 전문가가 아니라서 즉시 사람의 도움을 받는 것이 가장 중요합니다.\n\n- 한국: 자살예방상담전화 1393, 정신건강상담전화 1577-0199\n- 미국: 988 Suicide & Crisis Lifeline (전화/문자 988)\n- 생명 위협이 있으면 즉시 119 또는 911에 연락하세요.\n\n가능하면 지금 곁에 있는 신뢰할 수 있는 사람에게 바로 알려주세요.",
    escalated: true
  };
}

function isFallbackEnabled(env) {
  const raw = String(env.ENABLE_CHAT_FALLBACK || "").toLowerCase();
  if (!raw) return true;
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function parseStress(value) {
  const num = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(num)) return null;
  if (num < 1 || num > 10) return null;
  return num;
}

function stressLabel(score) {
  if (score === null) return "보통";
  if (score >= 8) return "높음";
  if (score >= 5) return "중간";
  return "낮음";
}

function buildFallbackReply(mode, payload, reason) {
  if (mode === "checkin") {
    const mood = sanitizeText(payload.mood || "", 30) || "미입력";
    const stress = parseStress(payload.stress);
    const note = sanitizeText(payload.note || payload.message || "", 120);
    const label = stressLabel(stress);
    const noteSuffix = note ? `메모 핵심: ${note}` : "메모: 없음";

    return [
      "1) 현재 상태 요약",
      `지금 감정은 '${mood}', 스트레스 강도는 '${label}'으로 해석됩니다.`,
      `${noteSuffix}`,
      "",
      "2) 3분 안정 루틴",
      "1. 60초: 어깨를 내리고 4초 들숨, 6초 날숨을 6회 반복",
      "2. 60초: 현재 감각 3가지(보이는 것/들리는 것/닿는 것) 관찰",
      "3. 60초: 오늘 반드시 할 1가지 행동을 한 문장으로 선언",
      "",
      "3) 오늘의 자비 문장",
      "\"완벽하지 않아도, 지금의 나를 부드럽게 돌본다.\"",
      "",
      "4) 다음 행동",
      "물을 한 컵 마시고 10분 내 가장 작은 할 일을 시작하세요."
    ].join("\n");
  }

  if (mode === "journal") {
    const entry = sanitizeText(payload.entry || payload.message || "", 320);
    const excerpt = entry ? entry.slice(0, 70) : "기록 없음";

    return [
      "1) 감정 패턴",
      `최근 기록에서 드러난 핵심 감정: ${excerpt}`,
      "",
      "2) 생각 습관 점검",
      "지금 떠오르는 생각 중 '사실'과 '해석'을 각각 한 줄로 분리해 보세요.",
      "",
      "3) 불교 기반 재해석",
      "감정은 고정된 정체성이 아니라 잠시 지나가는 흐름이라는 관점으로 바라보세요.",
      "",
      "4) 내일의 실천 1가지",
      "내일 시작 10분 안에 할 수 있는 가장 작은 행동 1개를 캘린더에 예약하세요."
    ].join("\n");
  }

  const message = sanitizeText(payload.message || "", 240) || "입력 없음";
  const reasonHint =
    reason === "api_key_missing"
      ? "현재 API 키가 없어 기본 코칭 모드로 안내합니다."
      : "현재 AI 연결이 불안정해 기본 코칭 모드로 안내합니다.";

  return [
    "짧은 공감",
    `지금 메시지(“${message}”)에서 부담이 느껴집니다. ${reasonHint}`,
    "",
    "지금 가능한 행동",
    "1) 90초 동안 4초 들숨/6초 날숨 호흡 반복",
    "2) 지금 통제 가능한 것 1개와 미룰 것 1개를 분리",
    "3) 15분 타이머를 켜고 가장 작은 행동 1개 실행",
    "",
    "마지막 한 줄 격려",
    "천천히 가도 괜찮습니다. 오늘의 한 걸음이 방향을 만듭니다."
  ].join("\n");
}

function buildFallbackPayload(mode, sourcePayload, reason) {
  return {
    reply: buildFallbackReply(mode, sourcePayload || {}, reason),
    escalated: false,
    mode,
    fallback: true,
    fallbackReason: reason
  };
}

function shouldFallbackForError(error, mappedStatus, env) {
  if (!isFallbackEnabled(env)) return false;
  if (error instanceof OpenAIRequestError) return true;
  return mappedStatus === 429 || mappedStatus === 502 || mappedStatus === 504;
}

function buildSystemPrompt(mode) {
  const base = [
    "You are The Savior, a Korean-language Buddhist-inspired wellness coach.",
    "Goals: emotional grounding, breath practice, compassionate reflection, practical next action.",
    "Rules:",
    "- Do not provide medical diagnosis, legal advice, or guaranteed outcomes.",
    "- Do not claim supernatural certainty.",
    "- Keep tone warm, direct, and concise.",
    "- Output in Korean unless user explicitly asks otherwise.",
    "- Include actionable steps with clear time boxes.",
    "- If severe risk is implied, advise contacting emergency/hotline resources."
  ].join("\n");

  if (mode === "checkin") {
    return `${base}\n\nReturn format:\n1) 현재 상태 요약(2문장)\n2) 3분 안정 루틴(번호 3개)\n3) 오늘의 자비 문장(1문장)\n4) 다음 행동(1문장)`;
  }

  if (mode === "journal") {
    return `${base}\n\nReturn format:\n1) 감정 패턴\n2) 생각 습관 점검\n3) 불교 기반 재해석\n4) 내일의 실천 1가지`;
  }

  return `${base}\n\nReturn format:\n- 짧은 공감 1문장\n- 지금 가능한 행동 2~3개\n- 마지막에 한 줄 격려`;
}

function buildUserPrompt(mode, payload) {
  if (mode === "checkin") {
    const mood = sanitizeText(payload.mood, 60);
    const stress = String(payload.stress ?? "").slice(0, 4);
    const note = sanitizeText(payload.note || payload.message || "", 600);

    return [
      "[체크인 입력]",
      `감정: ${mood || "미입력"}`,
      `스트레스(1~10): ${stress || "미입력"}`,
      `메모: ${note || "없음"}`
    ].join("\n");
  }

  if (mode === "journal") {
    const entry = sanitizeText(payload.entry || payload.message || "", 1800);
    return `[저널 원문]\n${entry || "(내용 없음)"}`;
  }

  const message = sanitizeText(payload.message || "", 1200);
  const history = sanitizeHistory(payload.history);
  const historyBlock = history
    .map((turn, idx) => `${idx + 1}. ${turn.role === "assistant" ? "코치" : "사용자"}: ${turn.content}`)
    .join("\n");

  return [
    "[최근 대화 맥락]",
    historyBlock || "없음",
    "[새 메시지]",
    message || "(입력 없음)"
  ].join("\n");
}

function extractTextFromResponse(apiPayload) {
  if (typeof apiPayload.output_text === "string" && apiPayload.output_text.trim()) {
    return apiPayload.output_text.trim();
  }

  if (!Array.isArray(apiPayload.output)) return "";

  const chunks = [];
  for (const item of apiPayload.output) {
    if (!item || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isLikelyOpenAIKey(value) {
  const key = normalizeApiKey(value);
  return key.startsWith("sk-") && !/\s/.test(key) && key.length >= 20 && key.length <= 260;
}

function resolveApiKey(request, env) {
  const userKeyRaw = request.headers.get("x-user-openai-key") || "";
  const serverKeyRaw = typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY : "";
  const userKey = isLikelyOpenAIKey(userKeyRaw) ? normalizeApiKey(userKeyRaw) : "";
  const serverKey = isLikelyOpenAIKey(serverKeyRaw) ? normalizeApiKey(serverKeyRaw) : "";
  return userKey || serverKey;
}

async function runOpenAI(apiKey, systemPrompt, userPrompt) {
  if (!apiKey) {
    throw new Error("OpenAI API key is not available.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.7,
        max_output_tokens: 500,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }]
          }
        ]
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenAIRequestError("OpenAI API timed out.", 504);
    }
    throw new OpenAIRequestError("OpenAI API request failed.", 502);
  } finally {
    clearTimeout(timeout);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage = payload && payload.error && payload.error.message ? payload.error.message : "OpenAI API request failed.";
    throw new OpenAIRequestError(apiMessage, response.status);
  }

  const text = extractTextFromResponse(payload);
  if (!text) {
    throw new Error("Model response was empty.");
  }

  return text;
}

function mapClientError(error) {
  if (error instanceof RequestValidationError) {
    return {
      status: error.status,
      message: error.message
    };
  }

  if (error instanceof OpenAIRequestError) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: 400,
        message: "OpenAI API 키 인증에 실패했습니다. 개인 키 또는 서버 키를 다시 확인해 주세요."
      };
    }

    if (error.status === 429) {
      return {
        status: 429,
        message: "OpenAI 사용량 한도 또는 결제 상태로 요청이 제한되었습니다. 잠시 후 다시 시도해 주세요."
      };
    }

    if (error.status === 504) {
      return {
        status: 504,
        message: "AI 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
      };
    }

    if (error.status >= 500) {
      return {
        status: 502,
        message: "AI 응답 생성 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
      };
    }
  }

  return {
    status: 500,
    message: "요청 처리 중 문제가 발생했습니다."
  };
}

function isDebugErrorsEnabled(env) {
  return String(env.DEBUG_ERRORS || "").toLowerCase() === "true";
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
    return jsonResponse({ error: "허용되지 않은 요청 출처입니다." }, 403, {
      corsHeaders: cors.headers,
      extraHeaders: { "X-Request-Id": requestId }
    });
  }

  const rate = checkRateLimit(context.request, context.env, {
    scope: "chat",
    limitDefault: 20,
    limitEnvName: "CHAT_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "CHAT_RATE_LIMIT_WINDOW_MS"
  });
  if (!rate.allowed) {
    return jsonResponse(
      {
        error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
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

  let parsedPayload = null;
  let mode = "coach";

  try {
    const payload = await readJsonBody(context.request, { maxBytes: 14_000 });
    parsedPayload = payload;

    const modeRaw = sanitizeText(payload && payload.mode ? payload.mode : "coach", 20).toLowerCase();
    mode = modeRaw === "checkin" || modeRaw === "journal" ? modeRaw : "coach";

    const sourceText = sanitizeText(
      payload && (payload.message || payload.entry || payload.note)
        ? payload.message || payload.entry || payload.note
        : ""
    );

    if (!sourceText && mode !== "checkin") {
      return jsonResponse({ error: "메시지를 입력해 주세요." }, 400, {
        corsHeaders: cors.headers,
        extraHeaders: {
          ...rate.headers,
          "X-Request-Id": requestId
        }
      });
    }

    if (hasCrisisSignal(sourceText)) {
      return jsonResponse(crisisResponse(), 200, {
        corsHeaders: cors.headers,
        extraHeaders: {
          ...rate.headers,
          "X-Request-Id": requestId
        }
      });
    }

    const apiKey = resolveApiKey(context.request, context.env);
    if (!apiKey) {
      if (isFallbackEnabled(context.env)) {
        return jsonResponse(buildFallbackPayload(mode, parsedPayload, "api_key_missing"), 200, {
          corsHeaders: cors.headers,
          extraHeaders: {
            ...rate.headers,
            "X-Request-Id": requestId
          }
        });
      }

      return jsonResponse(
        {
          error: "OpenAI API 키가 설정되지 않았습니다.",
          detail: "내 API 키를 입력하거나 서버 기본 키를 설정해 주세요."
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

    const systemPrompt = buildSystemPrompt(mode);
    const userPrompt = buildUserPrompt(mode, payload || {});
    const reply = await runOpenAI(apiKey, systemPrompt, userPrompt);

    return jsonResponse(
      {
        reply,
        escalated: false,
        mode
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
  } catch (error) {
    const mapped = mapClientError(error);
    if (parsedPayload && shouldFallbackForError(error, mapped.status, context.env)) {
      const fallbackReason =
        error instanceof OpenAIRequestError
          ? `openai_${error.status || "error"}`
          : mapped.status === 429
            ? "rate_limited"
            : "temporary_failure";

      return jsonResponse(buildFallbackPayload(mode, parsedPayload, fallbackReason), 200, {
        corsHeaders: cors.headers,
        extraHeaders: {
          ...rate.headers,
          "X-Request-Id": requestId
        }
      });
    }

    const payload = {
      error: mapped.message
    };

    if (isDebugErrorsEnabled(context.env) && error instanceof Error) {
      payload.detail = error.message;
    }

    return jsonResponse(
      payload,
      mapped.status,
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
