import test from "node:test";
import assert from "node:assert/strict";

import { onRequestPost } from "../functions/api/chat.js";

function buildChatRequest(payload, headers = {}) {
  return new Request("https://the-savior-9z8.pages.dev/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(payload)
  });
}

test("chat checkin escalates when mood contains crisis signal", async () => {
  const request = buildChatRequest({
    mode: "checkin",
    mood: "죽고 싶어요",
    stress: "9",
    note: ""
  });

  const response = await onRequestPost({ request, env: {} });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.escalated, true);
  assert.equal(typeof body.reply, "string");
  assert.match(body.reply, /988|1393|1577-0199/);
});

test("chat coach escalates when recent history contains crisis signal", async () => {
  const request = buildChatRequest({
    mode: "coach",
    message: "도움이 필요해요",
    history: [{ role: "user", content: "I want to end my life" }]
  });

  const response = await onRequestPost({ request, env: {} });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.escalated, true);
});
