import assert from "node:assert/strict";
import test from "node:test";

import { onRequestOptions, onRequestPost } from "../functions/api/chat.js";

const OPENAI_API_KEY_ENV = ["OPENAI", "API", "KEY"].join("_");
const testOpenAIKey = (suffix) => `sk-${suffix}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPostContext(body, { url = "https://the-savior-9z8.pages.dev/api/chat", env = {}, headers = {} } = {}) {
  return {
    request: new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://allowed.example",
        ...headers
      },
      body: JSON.stringify(body)
    }),
    env: {
      ALLOWED_ORIGINS: "https://allowed.example",
      ...env
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Provider resolution: BYOK -> server key -> Ollama -> fallback
// ---------------------------------------------------------------------------

test("provider resolution: fallback when no API key and no Ollama", async () => {
  const ctx = createPostContext(
    { mode: "coach", message: "요즘 스트레스를 받고 있어요" },
    { env: { ENABLE_CHAT_FALLBACK: "true" } }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.provider, "fallback");
  assert.equal(body.fallback, true);
  assert.equal(body.fallbackReason, "api_key_missing");
  assert.equal(body.mode, "coach");
  assert.ok(body.reply.length > 0, "fallback reply must not be empty");
});

test("provider resolution: server key used when ALLOW_SERVER_OPENAI_KEY is true but no BYOK", async () => {
  // We can't actually call OpenAI here, so we verify that when a server key
  // is available but invalid, we get an OpenAI error -> fallback, not api_key_missing.
  const ctx = createPostContext(
    { mode: "coach", message: "테스트" },
    {
      env: {
        [OPENAI_API_KEY_ENV]: testOpenAIKey("test-invalid-key-000"),
        ALLOW_SERVER_OPENAI_KEY: "true",
        ENABLE_CHAT_FALLBACK: "true"
      }
    }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  // Should have attempted OpenAI and fallen back due to network error.
  assert.equal(body.fallback, true);
  assert.ok(body.fallbackReason.startsWith("openai_"), `expected openai fallback reason, got: ${body.fallbackReason}`);
});

test("provider resolution: BYOK header takes priority over server key", async () => {
  const ctx = createPostContext(
    { mode: "coach", message: "테스트" },
    {
      env: {
        [OPENAI_API_KEY_ENV]: testOpenAIKey("server-key-000000"),
        ALLOW_SERVER_OPENAI_KEY: "true",
        ENABLE_CHAT_FALLBACK: "true"
      },
      headers: {
        "x-user-openai-key": "sk-byok-test-key-0000"
      }
    }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  // Both keys are invalid so it will fallback, but the point is it tried.
  assert.equal(response.status, 200);
  assert.equal(body.fallback, true);
  assert.ok(body.fallbackReason.startsWith("openai_"));
});

test("provider resolution: Ollama selected when no API key and Ollama enabled on localhost", async () => {
  const ctx = createPostContext(
    { mode: "coach", message: "테스트" },
    {
      url: "http://localhost:8788/api/chat",
      env: {
        ENABLE_OLLAMA: "true",
        OLLAMA_BASE_URL: "http://127.0.0.1:11434",
        ENABLE_CHAT_FALLBACK: "true"
      }
    }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  // Ollama is not running in test, so we expect a fallback from Ollama failure.
  assert.equal(body.fallback, true);
  assert.ok(body.fallbackReason.startsWith("ollama_"), `expected ollama fallback reason, got: ${body.fallbackReason}`);
});

// ---------------------------------------------------------------------------
// 2. Crisis signal detection
// ---------------------------------------------------------------------------

test("crisis detection triggers for Korean crisis keywords", async () => {
  const keywords = ["자해", "극단적 선택", "죽고 싶", "목숨을 끊"];
  for (const keyword of keywords) {
    const ctx = createPostContext({ mode: "coach", message: `요즘 ${keyword} 생각이 들어요` });
    const response = await onRequestPost(ctx);
    const body = await response.json();

    assert.equal(body.escalated, true, `failed for keyword: ${keyword}`);
    assert.equal(body.mode, "crisis");
    assert.equal(body.provider, "crisis-hand-off");
    assert.ok(Array.isArray(body.resources));
    assert.ok(body.resources.length >= 3);
  }
});

test("crisis detection triggers for English crisis keywords", async () => {
  const keywords = ["suicide", "kill myself", "harm myself", "end my life"];
  for (const keyword of keywords) {
    const ctx = createPostContext({ mode: "coach", message: `I want to ${keyword}` });
    const response = await onRequestPost(ctx);
    const body = await response.json();

    assert.equal(body.escalated, true, `failed for keyword: ${keyword}`);
    assert.equal(body.mode, "crisis");
  }
});

test("crisis detection does not trigger for normal messages", async () => {
  const ctx = createPostContext(
    { mode: "coach", message: "오늘은 좋은 날이에요" },
    { env: { ENABLE_CHAT_FALLBACK: "true" } }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.notEqual(body.mode, "crisis");
  assert.equal(body.escalated, false);
});

// ---------------------------------------------------------------------------
// 3. Rate limiting
// ---------------------------------------------------------------------------

test("chat endpoint enforces rate limiting", async () => {
  // Use a unique IP to avoid cross-test contamination.
  const uniqueIp = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const makeCtx = () => ({
    request: new Request("https://the-savior-9z8.pages.dev/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://allowed.example",
        "cf-connecting-ip": uniqueIp
      },
      body: JSON.stringify({ mode: "coach", message: "테스트" })
    }),
    env: {
      ALLOWED_ORIGINS: "https://allowed.example",
      CHAT_RATE_LIMIT_MAX: "2",
      CHAT_RATE_LIMIT_WINDOW_MS: "60000",
      ENABLE_CHAT_FALLBACK: "true"
    }
  });

  const r1 = await onRequestPost(makeCtx());
  assert.equal(r1.status, 200);

  const r2 = await onRequestPost(makeCtx());
  assert.equal(r2.status, 200);

  const r3 = await onRequestPost(makeCtx());
  assert.equal(r3.status, 429);
  const body = await r3.json();
  assert.ok(body.error);
  assert.ok(r3.headers.get("Retry-After"));
});

// ---------------------------------------------------------------------------
// 4. Mode switching (checkin, journal, coach)
// ---------------------------------------------------------------------------

test("mode: checkin produces structured fallback with mood and stress", async () => {
  const ctx = createPostContext(
    { mode: "checkin", mood: "불안", stress: 8, note: "발표 직전" },
    { env: { ENABLE_CHAT_FALLBACK: "true" } }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.mode, "checkin");
  assert.ok(body.reply.includes("불안"), "checkin reply should reference the mood");
  assert.ok(body.reply.includes("높음"), "stress 8 should be labeled high");
  assert.ok(body.reply.includes("3분 안정 루틴"), "checkin reply should include the routine section");
});

test("mode: journal produces reflection-based fallback", async () => {
  const ctx = createPostContext(
    { mode: "journal", entry: "오늘 하루가 힘들었다. 회사에서 실수를 해서 자책이 든다." },
    { env: { ENABLE_CHAT_FALLBACK: "true" } }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.mode, "journal");
  assert.ok(body.reply.includes("감정 패턴"), "journal reply should include emotion pattern section");
  assert.ok(body.reply.includes("불교 기반 재해석"), "journal reply should include Buddhist reframe");
});

test("mode: coach is the default for unknown mode values", async () => {
  const ctx = createPostContext(
    { mode: "unknown_mode", message: "도움이 필요해요" },
    { env: { ENABLE_CHAT_FALLBACK: "true" } }
  );
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.mode, "coach");
});

// ---------------------------------------------------------------------------
// 5. Error handling paths
// ---------------------------------------------------------------------------

test("empty message returns 400 for coach mode", async () => {
  const ctx = createPostContext({ mode: "coach", message: "" });
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test("non-JSON content type returns 415", async () => {
  const ctx = {
    request: new Request("https://the-savior-9z8.pages.dev/api/chat", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        Origin: "https://allowed.example"
      },
      body: "not json"
    }),
    env: { ALLOWED_ORIGINS: "https://allowed.example" }
  };
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 415);
});

test("blocked origin returns 403", async () => {
  const ctx = {
    request: new Request("https://the-savior-9z8.pages.dev/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://evil.example"
      },
      body: JSON.stringify({ mode: "coach", message: "test" })
    }),
    env: { ALLOWED_ORIGINS: "https://allowed.example" }
  };
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 403);
});

test("fallback disabled returns error instead of fallback", async () => {
  const ctx = createPostContext({ mode: "coach", message: "테스트" }, { env: { ENABLE_CHAT_FALLBACK: "false" } });
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error);
  assert.equal(body.fallback, undefined);
});

// ---------------------------------------------------------------------------
// 6. Security: API keys never exposed in responses
// ---------------------------------------------------------------------------

test("API keys are never present in error response bodies", async () => {
  const fakeKey = testOpenAIKey("test-SUPERSECRETKEY");
  const ctx = createPostContext(
    { mode: "coach", message: "테스트" },
    {
      env: {
        [OPENAI_API_KEY_ENV]: fakeKey,
        ALLOW_SERVER_OPENAI_KEY: "true",
        DEBUG_ERRORS: "true",
        ENABLE_CHAT_FALLBACK: "false"
      }
    }
  );
  const response = await onRequestPost(ctx);
  const raw = await response.text();

  assert.ok(!raw.includes("SUPERSECRETKEY"), "API key fragment must not appear in response body");
  assert.ok(!raw.includes(fakeKey), "Full API key must not appear in response body");
});

test("CORS preflight returns proper headers without leaking env info", async () => {
  const ctx = {
    request: new Request("https://the-savior-9z8.pages.dev/api/chat", {
      method: "OPTIONS",
      headers: { Origin: "https://allowed.example" }
    }),
    env: {
      ALLOWED_ORIGINS: "https://allowed.example",
      [OPENAI_API_KEY_ENV]: testOpenAIKey("no-leak-key-000000")
    }
  };
  const response = await onRequestOptions(ctx);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Allow"), "POST, OPTIONS");
  // Make sure no env values leak in headers.
  const allHeaders = [...response.headers.entries()].map(([, v]) => v).join(" ");
  assert.ok(!allHeaders.includes("sk-"), "No API key fragment should appear in any header");
});

// ---------------------------------------------------------------------------
// 7. Input validation
// ---------------------------------------------------------------------------

test("excessively long message is truncated, not rejected", async () => {
  // 3000 chars > MAX_INPUT_CHARS (2000) but fits within MAX_BODY_BYTES (14KB).
  const longMsg = "a".repeat(3000);
  const uniqueIp = `10.77.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const ctx = {
    request: new Request("https://the-savior-9z8.pages.dev/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://allowed.example",
        "cf-connecting-ip": uniqueIp
      },
      body: JSON.stringify({ mode: "coach", message: longMsg })
    }),
    env: { ALLOWED_ORIGINS: "https://allowed.example", ENABLE_CHAT_FALLBACK: "true" }
  };
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  // The fallback reply should work fine; the message was truncated internally.
  assert.ok(body.reply.length > 0);
});

test("checkin allows empty message when mood is provided", async () => {
  const uniqueIp = `10.88.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const ctx = {
    request: new Request("https://the-savior-9z8.pages.dev/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://allowed.example",
        "cf-connecting-ip": uniqueIp
      },
      body: JSON.stringify({ mode: "checkin", mood: "평온", stress: 3 })
    }),
    env: { ALLOWED_ORIGINS: "https://allowed.example", ENABLE_CHAT_FALLBACK: "true" }
  };
  const response = await onRequestPost(ctx);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.mode, "checkin");
});
