import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
const runtimeConfigJs = readFileSync(
  path.join(ROOT, "public", "runtime-config.js"),
  "utf8"
);

test("runtime config keeps web production in explicit api-base mode", () => {
  assert.match(runtimeConfigJs, /Web production should set this explicitly/);
  assert.match(appJs, /apiMisconfigured/);
  assert.match(appJs, /리뷰 전용 화면/);
  assert.match(appJs, /백엔드 설정 필요/);
  assert.match(appJs, /백엔드 연결 필요/);
});
