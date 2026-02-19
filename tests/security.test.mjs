import test from "node:test";
import assert from "node:assert/strict";

import { RequestValidationError, checkRateLimit, getRequestId, readJsonBody, resolveCors } from "../functions/api/_security.js";

test("resolveCors allows configured origin and blocks unknown origin", () => {
  const env = { ALLOWED_ORIGINS: "https://allowed.example" };
  const options = { methods: "POST, OPTIONS", allowHeaders: "Content-Type" };

  const allowedReq = new Request("https://the-savior-9z8.pages.dev/api/chat", {
    headers: { Origin: "https://allowed.example" }
  });
  const blockedReq = new Request("https://the-savior-9z8.pages.dev/api/chat", {
    headers: { Origin: "https://evil.example" }
  });

  const allowed = resolveCors(allowedReq, env, options);
  const blocked = resolveCors(blockedReq, env, options);

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.headers["Access-Control-Allow-Origin"], "https://allowed.example");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.headers["Access-Control-Allow-Origin"], undefined);
});

test("checkRateLimit enforces max and emits Retry-After header when blocked", () => {
  const scope = `test-rate-${Date.now()}-${Math.random()}`;
  const req = new Request("https://the-savior-9z8.pages.dev/api/chat", {
    headers: { "cf-connecting-ip": "203.0.113.10" }
  });
  const env = {
    TEST_RATE_LIMIT_MAX: "2",
    TEST_RATE_LIMIT_WINDOW_MS: "60000"
  };

  const first = checkRateLimit(req, env, {
    scope,
    limitDefault: 2,
    limitEnvName: "TEST_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "TEST_RATE_LIMIT_WINDOW_MS"
  });
  const second = checkRateLimit(req, env, {
    scope,
    limitDefault: 2,
    limitEnvName: "TEST_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "TEST_RATE_LIMIT_WINDOW_MS"
  });
  const blocked = checkRateLimit(req, env, {
    scope,
    limitDefault: 2,
    limitEnvName: "TEST_RATE_LIMIT_MAX",
    windowMsDefault: 60_000,
    windowMsEnvName: "TEST_RATE_LIMIT_WINDOW_MS"
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.equal(typeof blocked.headers["Retry-After"], "string");
});

test("readJsonBody validates content-type, size, and object payload", async () => {
  const validReq = new Request("https://the-savior-9z8.pages.dev/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "coach", message: "hello" })
  });
  const validPayload = await readJsonBody(validReq, { maxBytes: 1000 });
  assert.equal(validPayload.mode, "coach");

  const invalidTypeReq = new Request("https://the-savior-9z8.pages.dev/api/chat", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}"
  });
  await assert.rejects(
    async () => readJsonBody(invalidTypeReq),
    (error) => error instanceof RequestValidationError && error.status === 415
  );

  const oversizedReq = new Request("https://the-savior-9z8.pages.dev/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "5000"
    },
    body: JSON.stringify({ x: "too-big" })
  });
  await assert.rejects(
    async () => readJsonBody(oversizedReq, { maxBytes: 100 }),
    (error) => error instanceof RequestValidationError && error.status === 413
  );

  const arrayPayloadReq = new Request("https://the-savior-9z8.pages.dev/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(["not-object"])
  });
  await assert.rejects(
    async () => readJsonBody(arrayPayloadReq),
    (error) => error instanceof RequestValidationError && error.status === 400
  );
});

test("getRequestId prefers incoming valid request id", () => {
  const req = new Request("https://the-savior-9z8.pages.dev/api/config", {
    headers: { "x-request-id": "abc-123" }
  });
  assert.equal(getRequestId(req), "abc-123");
});
