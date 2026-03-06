import test from "node:test";
import assert from "node:assert/strict";

import { onRequestGet as getHealth } from "../functions/api/health.js";
import { onRequestGet as getMeta, onRequestOptions } from "../functions/api/meta.js";

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
  assert.equal(body.diagnostics.runtimeMode, "server-key");
  assert.equal(body.diagnostics.llmReady, true);
  assert.match(body.diagnostics.nextAction, /\/api\/chat|\/api\/config/);
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
  assert.match(body.diagnostics.nextAction, /\/api\/chat/);
});

test("meta route supports CORS preflight", async () => {
  const response = await onRequestOptions(createContext());

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Allow"), "GET, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://allowed.example");
});
