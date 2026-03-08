import test from "node:test";
import assert from "node:assert/strict";

import { onRequestGet as getHealth } from "../functions/api/health.js";
import { onRequestGet as getMeta, onRequestOptions } from "../functions/api/meta.js";
import { onRequestGet as getRuntimeBrief } from "../functions/api/runtime-brief.js";
import { onRequestGet as getReviewPack } from "../functions/api/review-pack.js";
import { onRequestGet as getCoachSchema } from "../functions/api/schema/coach-response.js";

function createContext(url = "https://the-savior-9z8.pages.dev/api/meta", env = {}) {
  return {
    request: new Request(url, {
      headers: {
        Origin: "https://allowed.example"
      }
    }),
    env: {
      ALLOWED_ORIGINS: "https://allowed.example",
      ...env
    }
  };
}

test("meta route returns runtime diagnostics", async () => {
  const response = await getMeta(
    createContext("https://the-savior-9z8.pages.dev/api/meta", {
      OPENAI_API_KEY: "sk-test",
      ALLOW_SERVER_OPENAI_KEY: "true",
      LLM_PROVIDER: "openai",
      PUBLIC_API_BASE_URL: "https://api.example.com/",
      ADSENSE_CLIENT: "ca-pub-123",
      ADSENSE_SLOT_TOP: "slot-top",
      CF_PAGES_BRANCH: "main",
      CF_PAGES_COMMIT_SHA: "abcdef123456"
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.service, "the-savior");
  assert.equal(body.llm.providerPreference, "openai");
  assert.equal(body.llm.hasServerApiKey, true);
  assert.equal(body.api.publicBaseUrl, "https://api.example.com");
  assert.equal(body.build.commit, "abcdef12");
  assert.equal(body.monetization.adsenseConfigured, true);
  assert.ok(body.api.routes.includes("/api/meta"));
  assert.ok(body.api.routes.includes("/api/runtime-brief"));
  assert.ok(body.api.routes.includes("/api/review-pack"));
  assert.equal(body.readiness_contract, "the-savior-runtime-brief-v1");
  assert.equal(body.review_pack_contract, "the-savior-review-pack-v1");
  assert.equal(body.report_contract.schema, "the-savior-coach-response-v1");
  assert.equal(body.ops_contract.schema, "ops-envelope-v1");
  assert.equal(body.diagnostics.runtimeMode, "server-key");
  assert.equal(body.diagnostics.llmReady, true);
  assert.match(body.diagnostics.nextAction, /\/api\/runtime-brief|\/api\/chat/);
  assert.equal(response.headers.get("X-Request-Id"), response.headers.get("x-request-id"));
});

test("health route exposes actionable llm guidance", async () => {
  const response = await getHealth(
    createContext("https://the-savior-9z8.pages.dev/api/health", {
      ALLOW_SERVER_OPENAI_KEY: "true",
      OPENAI_API_KEY: "sk-test"
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.hasServerApiKey, true);
  assert.equal(body.diagnostics.providerReady, true);
  assert.equal(body.diagnostics.llmMode, "server-key");
  assert.equal(body.readiness_contract, "the-savior-runtime-brief-v1");
  assert.equal(body.report_contract.schema, "the-savior-coach-response-v1");
  assert.ok(body.routes.includes("/api/schema/coach-response"));
  assert.equal(body.links.review_pack, "/api/review-pack");
  assert.equal(body.ops_contract.schema, "ops-envelope-v1");
  assert.match(body.diagnostics.nextAction, /\/api\/chat/);
});

test("runtime brief route exposes operator contract", async () => {
  const response = await getRuntimeBrief(
    createContext("https://the-savior-9z8.pages.dev/api/runtime-brief", {
      ENABLE_OLLAMA: "true",
      ADSENSE_CLIENT: "ca-pub-123"
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.service, "the-savior");
  assert.equal(body.readiness_contract, "the-savior-runtime-brief-v1");
  assert.equal(body.report_contract.schema, "the-savior-coach-response-v1");
  assert.equal(body.llm.runtimeMode, "ollama-local");
  assert.equal(body.monetization.adsenseConfigured, true);
  assert.ok(body.routes.includes("/api/runtime-brief"));
  assert.ok(body.review_flow.length >= 3);
  assert.equal(body.two_minute_review.length, 4);
  assert.equal(body.proof_assets[0].path, "/api/health");
});

test("review pack route exposes safety and revenue boundaries", async () => {
  const response = await getReviewPack(
    createContext("https://the-savior-9z8.pages.dev/api/review-pack", {
      ENABLE_OLLAMA: "true",
      ADSENSE_CLIENT: "ca-pub-123"
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.readiness_contract, "the-savior-review-pack-v1");
  assert.equal(body.proof_bundle.runtimeMode, "ollama-local");
  assert.ok(body.proof_bundle.review_routes.includes("/api/review-pack"));
  assert.ok(body.safety_boundary.length >= 3);
  assert.ok(body.revenue_boundary.length >= 3);
  assert.equal(body.two_minute_review.length, 4);
  assert.equal(body.proof_assets[0].label, "Health Route");
});

test("coach schema route exposes response contract", async () => {
  const response = await getCoachSchema(
    createContext("https://the-savior-9z8.pages.dev/api/schema/coach-response")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.service, "the-savior");
  assert.equal(body.schema.schema, "the-savior-coach-response-v1");
  assert.ok(body.schema.required_fields.includes("reply"));
  assert.ok(body.schema.operator_rules.length >= 3);
});

test("meta route supports CORS preflight", async () => {
  const response = await onRequestOptions(createContext());

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Allow"), "GET, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://allowed.example");
});
