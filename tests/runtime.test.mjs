import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoachResponseSchema,
  buildEscalationReadiness,
  buildProgressTrends,
  buildReviewPack,
  buildRuntimeBrief,
  buildRuntimeDiagnostics,
  COACH_RESPONSE_SCHEMA,
  hasEnabledServerApiKey,
  isLocalHostname,
  isOllamaEnabled,
  normalizeProvider,
  parseBoolFlag,
  READINESS_CONTRACT,
  REVIEW_PACK_CONTRACT,
  RUNTIME_ROUTES,
  sanitizeBaseUrl
} from "../functions/api/_runtime.js";

// ---------------------------------------------------------------------------
// 1. sanitizeBaseUrl
// ---------------------------------------------------------------------------

test("sanitizeBaseUrl trims whitespace and trailing slashes", () => {
  assert.equal(sanitizeBaseUrl("  https://example.com///  "), "https://example.com");
  assert.equal(sanitizeBaseUrl("https://example.com"), "https://example.com");
  assert.equal(sanitizeBaseUrl(""), "");
});

test("sanitizeBaseUrl returns empty string for non-string input", () => {
  assert.equal(sanitizeBaseUrl(null), "");
  assert.equal(sanitizeBaseUrl(undefined), "");
  assert.equal(sanitizeBaseUrl(123), "");
});

// ---------------------------------------------------------------------------
// 2. normalizeProvider
// ---------------------------------------------------------------------------

test("normalizeProvider recognizes openai and ollama", () => {
  assert.equal(normalizeProvider("openai"), "openai");
  assert.equal(normalizeProvider("OPENAI"), "openai");
  assert.equal(normalizeProvider("ollama"), "ollama");
  assert.equal(normalizeProvider("OLLAMA"), "ollama");
});

test("normalizeProvider defaults to auto for unknown values", () => {
  assert.equal(normalizeProvider("unknown"), "auto");
  assert.equal(normalizeProvider(""), "auto");
  assert.equal(normalizeProvider(null), "auto");
});

// ---------------------------------------------------------------------------
// 3. parseBoolFlag
// ---------------------------------------------------------------------------

test("parseBoolFlag recognizes truthy values", () => {
  assert.equal(parseBoolFlag("1"), true);
  assert.equal(parseBoolFlag("true"), true);
  assert.equal(parseBoolFlag("TRUE"), true);
  assert.equal(parseBoolFlag("yes"), true);
  assert.equal(parseBoolFlag("on"), true);
});

test("parseBoolFlag returns false for falsy values", () => {
  assert.equal(parseBoolFlag("0"), false);
  assert.equal(parseBoolFlag("false"), false);
  assert.equal(parseBoolFlag(""), false);
  assert.equal(parseBoolFlag(null), false);
  assert.equal(parseBoolFlag(undefined), false);
});

// ---------------------------------------------------------------------------
// 4. hasEnabledServerApiKey
// ---------------------------------------------------------------------------

test("hasEnabledServerApiKey requires both flag and key", () => {
  assert.equal(hasEnabledServerApiKey({ ALLOW_SERVER_OPENAI_KEY: "true", OPENAI_API_KEY: "sk-test" }), true);
  assert.equal(hasEnabledServerApiKey({ ALLOW_SERVER_OPENAI_KEY: "true" }), false);
  assert.equal(hasEnabledServerApiKey({ OPENAI_API_KEY: "sk-test" }), false);
  assert.equal(hasEnabledServerApiKey({}), false);
});

// ---------------------------------------------------------------------------
// 5. isLocalHostname
// ---------------------------------------------------------------------------

test("isLocalHostname identifies local addresses", () => {
  assert.equal(isLocalHostname("localhost"), true);
  assert.equal(isLocalHostname("127.0.0.1"), true);
  assert.equal(isLocalHostname("::1"), true);
  assert.equal(isLocalHostname("example.com"), false);
  assert.equal(isLocalHostname(""), false);
  assert.equal(isLocalHostname(null), false);
});

// ---------------------------------------------------------------------------
// 6. isOllamaEnabled
// ---------------------------------------------------------------------------

test("isOllamaEnabled respects explicit flag", () => {
  assert.equal(isOllamaEnabled({ ENABLE_OLLAMA: "true" }, "https://example.com/api"), true);
  assert.equal(isOllamaEnabled({ ENABLE_OLLAMA: "false" }, "http://localhost:8788/api"), false);
  assert.equal(isOllamaEnabled({ ENABLE_OLLAMA: "0" }, "http://localhost:8788/api"), false);
  assert.equal(isOllamaEnabled({ ENABLE_OLLAMA: "off" }, "http://localhost:8788/api"), false);
});

test("isOllamaEnabled infers from localhost when no flag", () => {
  assert.equal(isOllamaEnabled({}, "http://localhost:8788/api"), true);
  assert.equal(isOllamaEnabled({}, "https://example.com/api"), false);
});

test("isOllamaEnabled handles invalid URL gracefully", () => {
  assert.equal(isOllamaEnabled({}, "not-a-url"), false);
});

// ---------------------------------------------------------------------------
// 7. buildCoachResponseSchema
// ---------------------------------------------------------------------------

test("buildCoachResponseSchema returns correct contract structure", () => {
  const schema = buildCoachResponseSchema();
  assert.equal(schema.schema, COACH_RESPONSE_SCHEMA);
  assert.ok(schema.required_fields.includes("reply"));
  assert.ok(schema.required_fields.includes("escalated"));
  assert.ok(schema.required_fields.includes("mode"));
  assert.ok(schema.required_fields.includes("provider"));
  assert.ok(schema.fallback_fields.includes("fallback"));
  assert.ok(schema.operator_rules.length >= 3);
});

// ---------------------------------------------------------------------------
// 8. buildRuntimeDiagnostics
// ---------------------------------------------------------------------------

test("buildRuntimeDiagnostics returns server-key mode when server key enabled", () => {
  const result = buildRuntimeDiagnostics({
    hasServerApiKey: true,
    monetizationReady: false,
    ollamaEnabled: false,
    providerPreference: "auto"
  });
  assert.equal(result.runtimeMode, "server-key");
  assert.equal(result.llmReady, true);
});

test("buildRuntimeDiagnostics returns ollama-local mode when appropriate", () => {
  const result = buildRuntimeDiagnostics({
    hasServerApiKey: false,
    monetizationReady: false,
    ollamaEnabled: true,
    providerPreference: "auto"
  });
  assert.equal(result.runtimeMode, "ollama-local");
  assert.equal(result.llmReady, true);
});

test("buildRuntimeDiagnostics returns runtime-key when no LLM available", () => {
  const result = buildRuntimeDiagnostics({
    hasServerApiKey: false,
    monetizationReady: false,
    ollamaEnabled: false,
    providerPreference: "auto"
  });
  assert.equal(result.runtimeMode, "runtime-key");
  assert.equal(result.llmReady, false);
  assert.match(result.nextAction, /BYOK|enable/i);
});

test("buildRuntimeDiagnostics prefers runtime-key when ollama enabled but provider is openai", () => {
  const result = buildRuntimeDiagnostics({
    hasServerApiKey: false,
    monetizationReady: false,
    ollamaEnabled: true,
    providerPreference: "openai"
  });
  assert.equal(result.runtimeMode, "runtime-key");
});

// ---------------------------------------------------------------------------
// 9. buildRuntimeBrief
// ---------------------------------------------------------------------------

test("buildRuntimeBrief returns complete payload with all required fields", () => {
  const brief = buildRuntimeBrief({ ENABLE_OLLAMA: "true" }, "http://localhost:8788/api");
  assert.equal(brief.status, "ok");
  assert.equal(brief.service, "the-savior");
  assert.equal(brief.readiness_contract, READINESS_CONTRACT);
  assert.ok(brief.headline);
  assert.ok(brief.report_contract);
  assert.ok(brief.llm);
  assert.ok(brief.monetization);
  assert.ok(Array.isArray(brief.routes));
  assert.ok(brief.routes.length >= 8);
  assert.ok(brief.diagnostics);
  assert.ok(brief.links);
});

// ---------------------------------------------------------------------------
// 10. buildReviewPack
// ---------------------------------------------------------------------------

test("buildReviewPack returns complete operator payload", () => {
  const pack = buildReviewPack({}, "https://example.com/api");
  assert.equal(pack.status, "ok");
  assert.equal(pack.readiness_contract, REVIEW_PACK_CONTRACT);
  assert.ok(pack.proof_bundle);
  assert.ok(Array.isArray(pack.safety_boundary));
  assert.ok(Array.isArray(pack.revenue_boundary));
  assert.ok(Array.isArray(pack.review_sequence));
  assert.ok(pack.safety_boundary.length >= 3);
  assert.ok(pack.revenue_boundary.length >= 3);
});

// ---------------------------------------------------------------------------
// 11. buildEscalationReadiness
// ---------------------------------------------------------------------------

test("buildEscalationReadiness returns crisis guardrails", () => {
  const result = buildEscalationReadiness({}, "https://example.com/api");
  assert.equal(result.status, "ok");
  assert.equal(result.contract_version, "the-savior-escalation-readiness-v1");
  assert.ok(result.summary);
  assert.equal(result.summary.fallback_visible, true);
  assert.ok(Array.isArray(result.guardrails));
  assert.ok(result.guardrails.length >= 3);
});

// ---------------------------------------------------------------------------
// 12. buildProgressTrends
// ---------------------------------------------------------------------------

test("buildProgressTrends returns coaching session items", () => {
  const result = buildProgressTrends({}, "https://example.com/api");
  assert.equal(result.status, "ok");
  assert.equal(result.contract_version, "the-savior-progress-trends-v1");
  assert.ok(result.summary);
  assert.equal(result.summary.sessions, 3);
  assert.ok(Array.isArray(result.items));
  assert.equal(result.items.length, 3);
});

// ---------------------------------------------------------------------------
// 13. Constants
// ---------------------------------------------------------------------------

test("RUNTIME_ROUTES contains all expected routes", () => {
  const expected = [
    "/api/health",
    "/api/config",
    "/api/chat",
    "/api/meta",
    "/api/runtime-brief",
    "/api/escalation-readiness",
    "/api/review-pack",
    "/api/schema/coach-response",
    "/api/progress-trends",
    "/api/key-check"
  ];
  for (const route of expected) {
    assert.ok(RUNTIME_ROUTES.includes(route), `Missing route: ${route}`);
  }
});
