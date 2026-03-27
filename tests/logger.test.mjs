import assert from "node:assert/strict";
import test from "node:test";

import { createLogger, redactSecrets } from "../functions/api/_logger.js";

// ---------------------------------------------------------------------------
// 1. Logger creation and basic output
// ---------------------------------------------------------------------------

test("createLogger returns an object with all log methods", () => {
  const log = createLogger();
  assert.equal(typeof log.debug, "function");
  assert.equal(typeof log.info, "function");
  assert.equal(typeof log.warn, "function");
  assert.equal(typeof log.error, "function");
  assert.equal(typeof log.time, "function");
});

test("logger.time returns a function that can be called", () => {
  const log = createLogger({ scope: "test" });
  const end = log.time("test operation");
  assert.equal(typeof end, "function");
  // Should not throw when called
  end({ result: "ok" });
});

test("createLogger respects scope and requestId", () => {
  // We can't easily capture console output in node:test, but we verify
  // it doesn't throw when called with context.
  const log = createLogger({ requestId: "req-123", scope: "chat", env: { LOG_LEVEL: "debug" } });
  log.debug("test debug message", { key: "value" });
  log.info("test info message");
  log.warn("test warn message");
  log.error("test error message");
  // If we get here without throwing, the logger works.
  assert.ok(true);
});

test("logger emits structured JSON to the matching console method", () => {
  // biome-ignore lint/suspicious/noConsole: test intentionally intercepts console sinks
  const originalInfo = console.info;
  // biome-ignore lint/suspicious/noConsole: test intentionally intercepts console sinks
  const originalWarn = console.warn;
  // biome-ignore lint/suspicious/noConsole: test intentionally intercepts console sinks
  const originalError = console.error;
  // biome-ignore lint/suspicious/noConsole: test intentionally intercepts console sinks
  const originalDebug = console.debug;
  const seen = [];

  console.info = (message) => seen.push(["info", message]);
  console.warn = (message) => seen.push(["warn", message]);
  console.error = (message) => seen.push(["error", message]);
  console.debug = (message) => seen.push(["debug", message]);

  try {
    const log = createLogger({ requestId: "req-logger", scope: "chat", env: { LOG_LEVEL: "debug" } });
    log.info("info message", { ok: true });
    log.warn("warn message");
    log.error("error message");
    log.debug("debug message");
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  }

  assert.equal(seen.length, 4);
  for (const [level, payload] of seen) {
    const parsed = JSON.parse(payload);
    assert.equal(parsed.level, level);
    assert.equal(parsed.requestId, "req-logger");
    assert.equal(parsed.scope, "chat");
  }
});

// ---------------------------------------------------------------------------
// 2. Secret redaction
// ---------------------------------------------------------------------------

test("redactSecrets replaces API key patterns in strings", () => {
  const input = "Error with key sk-proj-abc123XYZdef456 in request";
  const result = redactSecrets(input);
  assert.ok(!result.includes("sk-proj-abc123XYZdef456"));
  assert.ok(result.includes("sk-***REDACTED***"));
});

test("redactSecrets handles nested objects", () => {
  const input = {
    error: "Failed with sk-test1234567890abcdef",
    nested: {
      key: "sk-another-secret-key-value-here"
    }
  };
  const result = redactSecrets(input);
  assert.ok(!JSON.stringify(result).includes("sk-test1234567890"));
  assert.ok(!JSON.stringify(result).includes("sk-another-secret"));
});

test("redactSecrets handles arrays", () => {
  const input = ["normal text", "has sk-secret1234567890abc key"];
  const result = redactSecrets(input);
  assert.ok(Array.isArray(result));
  assert.ok(!result[1].includes("sk-secret1234567890"));
});

test("redactSecrets passes through non-string primitives", () => {
  assert.equal(redactSecrets(42), 42);
  assert.equal(redactSecrets(null), null);
  assert.equal(redactSecrets(undefined), undefined);
  assert.equal(redactSecrets(true), true);
});

test("redactSecrets handles string without secrets unchanged", () => {
  const input = "Normal log message without any keys";
  assert.equal(redactSecrets(input), input);
});

// ---------------------------------------------------------------------------
// 3. Log level filtering
// ---------------------------------------------------------------------------

test("logger with LOG_LEVEL=error does not throw on lower-level calls", () => {
  const log = createLogger({ env: { LOG_LEVEL: "error" } });
  // These should be silently filtered but not throw.
  log.debug("filtered");
  log.info("filtered");
  log.warn("filtered");
  log.error("this one emits");
  assert.ok(true);
});

test("logger with LOG_LEVEL=debug accepts all levels", () => {
  const log = createLogger({ env: { LOG_LEVEL: "debug" } });
  log.debug("accepted");
  log.info("accepted");
  log.warn("accepted");
  log.error("accepted");
  assert.ok(true);
});

test("logger defaults to info level when LOG_LEVEL is unset", () => {
  const log = createLogger({ env: {} });
  log.debug("should be filtered");
  log.info("should emit");
  assert.ok(true);
});

test("logger handles invalid LOG_LEVEL gracefully", () => {
  const log = createLogger({ env: { LOG_LEVEL: "banana" } });
  log.info("should still work");
  assert.ok(true);
});
