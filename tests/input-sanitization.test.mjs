import assert from "node:assert/strict";
import test from "node:test";

import { getRequestId, RequestValidationError, readJsonBody } from "../functions/api/_security.js";

// ---------------------------------------------------------------------------
// 1. readJsonBody edge cases
// ---------------------------------------------------------------------------

test("readJsonBody rejects empty body", async () => {
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: ""
  });
  await assert.rejects(
    () => readJsonBody(req),
    (err) => err instanceof RequestValidationError && err.status === 400
  );
});

test("readJsonBody rejects whitespace-only body", async () => {
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "   \n  "
  });
  await assert.rejects(
    () => readJsonBody(req),
    (err) => err instanceof RequestValidationError && err.status === 400
  );
});

test("readJsonBody rejects malformed JSON", async () => {
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid json"
  });
  await assert.rejects(
    () => readJsonBody(req),
    (err) => err instanceof RequestValidationError && err.status === 400
  );
});

test("readJsonBody rejects primitive JSON values", async () => {
  for (const primitive of ['"string"', "42", "true", "null"]) {
    const req = new Request("https://example.com/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: primitive
    });
    await assert.rejects(
      () => readJsonBody(req),
      (err) => err instanceof RequestValidationError && err.status === 400,
      `Should reject primitive: ${primitive}`
    );
  }
});

test("readJsonBody accepts valid JSON object", async () => {
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello", mode: "coach" })
  });
  const result = await readJsonBody(req);
  assert.equal(result.message, "hello");
  assert.equal(result.mode, "coach");
});

test("readJsonBody enforces maxBytes on actual content", async () => {
  const bigPayload = JSON.stringify({ data: "x".repeat(200) });
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bigPayload
  });
  await assert.rejects(
    () => readJsonBody(req, { maxBytes: 50 }),
    (err) => err instanceof RequestValidationError && err.status === 413
  );
});

test("readJsonBody rejects content-type with charset but no json", async () => {
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: JSON.stringify({ test: true })
  });
  await assert.rejects(
    () => readJsonBody(req),
    (err) => err instanceof RequestValidationError && err.status === 415
  );
});

test("readJsonBody accepts content-type with charset and json", async () => {
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true })
  });
  const result = await readJsonBody(req);
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// 2. getRequestId validation
// ---------------------------------------------------------------------------

test("getRequestId rejects IDs with special characters", () => {
  const req = new Request("https://example.com/api", {
    headers: { "x-request-id": "req/<script>alert(1)</script>" }
  });
  const id = getRequestId(req);
  assert.ok(!id.includes("<script>"), "Script tags must be rejected");
  assert.ok(!id.includes("/"), "Slashes must be rejected");
});

test("getRequestId rejects overly long IDs", () => {
  const longId = "a".repeat(100);
  const req = new Request("https://example.com/api", {
    headers: { "x-request-id": longId }
  });
  const id = getRequestId(req);
  assert.notEqual(id, longId, "IDs over 80 chars should be replaced");
});

test("getRequestId accepts valid alphanumeric IDs", () => {
  const validId = "req-2024-abc.123:456";
  const req = new Request("https://example.com/api", {
    headers: { "x-request-id": validId }
  });
  assert.equal(getRequestId(req), validId);
});

test("getRequestId generates UUID when header is missing", () => {
  const req = new Request("https://example.com/api");
  const id = getRequestId(req);
  assert.ok(id.length > 0, "Should generate a non-empty ID");
  assert.ok(/^[A-Za-z0-9._:-]+$/.test(id), "Generated ID should be safe");
});

// ---------------------------------------------------------------------------
// 3. RequestValidationError
// ---------------------------------------------------------------------------

test("RequestValidationError carries status and message", () => {
  const err = new RequestValidationError("test error", 413);
  assert.equal(err.message, "test error");
  assert.equal(err.status, 413);
  assert.equal(err.name, "RequestValidationError");
  assert.ok(err instanceof Error);
});

test("RequestValidationError defaults to 400", () => {
  const err = new RequestValidationError("bad request");
  assert.equal(err.status, 400);
});
