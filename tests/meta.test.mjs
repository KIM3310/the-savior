import test from "node:test";
import assert from "node:assert/strict";

import { onRequestGet, onRequestOptions } from "../functions/api/meta.js";

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
  const response = await onRequestGet(
    createContext("https://the-savior-9z8.pages.dev/api/meta", {
      OPENAI_API_KEY: "sk-test",
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
  assert.equal(response.headers.get("X-Request-Id"), response.headers.get("x-request-id"));
});

test("meta route supports CORS preflight", async () => {
  const response = await onRequestOptions(createContext());

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Allow"), "GET, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://allowed.example");
});
