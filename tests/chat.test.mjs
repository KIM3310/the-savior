import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "../functions/api/chat.js";

function createPostContext(body, url = "https://the-savior-9z8.pages.dev/api/chat", env = {}) {
  return {
    request: new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://allowed.example"
      },
      body: JSON.stringify(body)
    }),
    env: {
      ALLOWED_ORIGINS: "https://allowed.example",
      ...env
    }
  };
}

test("chat route returns contract-complete crisis response", async () => {
  const response = await onRequestPost(
    createPostContext({
      mode: "coach",
      message: "요즘 너무 위험한 생각이 들고 죽고 싶어요"
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.escalated, true);
  assert.equal(body.mode, "crisis");
  assert.equal(body.provider, "crisis-hand-off");
  assert.ok(Array.isArray(body.resources));
  assert.ok(body.resources.length >= 3);
  assert.ok(Array.isArray(body.next_steps));
  assert.ok(body.next_steps.length >= 2);
  assert.match(body.reply, /1393|988|119|911/);
});
