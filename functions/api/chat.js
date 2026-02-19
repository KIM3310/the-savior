const MODEL_NAME = "gpt-4.1-mini";
const MAX_INPUT_CHARS = 2000;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
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

async function runOpenAI(env, systemPrompt, userPrompt) {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
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

  const payload = await response.json();
  if (!response.ok) {
    const apiMessage = payload && payload.error && payload.error.message ? payload.error.message : "OpenAI API request failed.";
    throw new Error(apiMessage);
  }

  const text = extractTextFromResponse(payload);
  if (!text) {
    throw new Error("Model response was empty.");
  }

  return text;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Allow": "POST, OPTIONS"
    }
  });
}

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const modeRaw = sanitizeText(payload && payload.mode ? payload.mode : "coach", 20).toLowerCase();
    const mode = modeRaw === "checkin" || modeRaw === "journal" ? modeRaw : "coach";

    const sourceText = sanitizeText(
      payload && (payload.message || payload.entry || payload.note)
        ? payload.message || payload.entry || payload.note
        : ""
    );

    if (!sourceText && mode !== "checkin") {
      return jsonResponse({ error: "메시지를 입력해 주세요." }, 400);
    }

    if (hasCrisisSignal(sourceText)) {
      return jsonResponse(crisisResponse(), 200);
    }

    const systemPrompt = buildSystemPrompt(mode);
    const userPrompt = buildUserPrompt(mode, payload || {});
    const reply = await runOpenAI(context.env, systemPrompt, userPrompt);

    return jsonResponse({ reply, escalated: false, mode });
  } catch (error) {
    return jsonResponse(
      {
        error: "요청 처리 중 문제가 발생했습니다.",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      500
    );
  }
}
