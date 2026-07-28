import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { onRequestGet as getConfig } from "../functions/api/config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
const runtimeConfigJs = readFileSync(path.join(ROOT, "public", "runtime-config.js"), "utf8");

test("runtime config prefers same-origin web deployments before explicit override", () => {
  assert.match(runtimeConfigJs, /same-origin Pages Functions surface/);
  assert.match(appJs, /apiMisconfigured/);
  assert.match(appJs, /isHttpWeb/);
  assert.match(appJs, /같은 도메인 API가 없으면 runtime-config\.js/);
  assert.match(appJs, /백엔드 설정 필요/);
  assert.match(appJs, /백엔드 연결 필요/);
});

test("runtime config reports Gemini as a ready server provider", async () => {
  const request = new Request("https://the-savior-9z8.pages.dev/api/config", {
    headers: { Origin: "https://the-savior-9z8.pages.dev" }
  });
  const response = await getConfig({
    request,
    env: {
      ALLOWED_ORIGINS: "https://the-savior-9z8.pages.dev",
      GEMINI_API_KEY: "gemini-test-key",
      LLM_PROVIDER: "gemini"
    }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.hasServerApiKey, true);
  assert.equal(body.hasServerGeminiKey, true);
  assert.equal(body.hasServerOpenRouterKey, false);
  assert.equal(body.llmProviderPreference, "gemini");
});

test("runtime config ignores whitespace-only server API keys", async () => {
  const request = new Request("https://the-savior-9z8.pages.dev/api/config", {
    headers: { Origin: "https://the-savior-9z8.pages.dev" }
  });
  const response = await getConfig({
    request,
    env: {
      ALLOWED_ORIGINS: "https://the-savior-9z8.pages.dev",
      ALLOW_SERVER_OPENAI_KEY: "true",
      OPENAI_API_KEY: "   ",
      OPENROUTER_API_KEY: "\n\t",
      GEMINI_API_KEY: " "
    }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.hasServerApiKey, false);
  assert.equal(body.hasServerGeminiKey, false);
  assert.equal(body.hasServerOpenRouterKey, false);
});
