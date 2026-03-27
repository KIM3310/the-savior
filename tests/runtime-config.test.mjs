import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
