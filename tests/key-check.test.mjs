import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "../functions/api/key-check.js";

function createPostContext(key, { requestId = "test-request" } = {}) {
  return {
    request: new Request("https://the-savior-9z8.pages.dev/api/key-check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://allowed.example",
        "X-Request-Id": requestId
      },
      body: JSON.stringify({ key })
    }),
    env: {
      ALLOWED_ORIGINS: "https://allowed.example"
    }
  };
}

test("key-check validates OpenRouter keys against OpenRouter models endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ data: [] }, { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await onRequestPost(
    createPostContext("sk-or-test-key-0000000000", { requestId: "openrouter-test" })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.valid, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/models");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-or-test-key-0000000000");
});

test("key-check validates regular OpenAI keys against OpenAI models endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ data: [] }, { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await onRequestPost(createPostContext("sk-test-key-0000000000", { requestId: "openai-test" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.valid, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/models");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test-key-0000000000");
});
