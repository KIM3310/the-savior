import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const stylesCss = readFileSync(path.join(ROOT, "public", "styles.css"), "utf8");

test("public landing separates end-user front door from reviewer surface", () => {
  const heroIndex = indexHtml.indexOf('<section class="hero');
  const reviewerGatewayIndex = indexHtml.indexOf('id="reviewer-gateway"');
  const runtimeBriefIndex = indexHtml.indexOf('id="runtime-brief"');

  assert.notEqual(heroIndex, -1);
  assert.notEqual(reviewerGatewayIndex, -1);
  assert.notEqual(runtimeBriefIndex, -1);
  assert.ok(heroIndex < reviewerGatewayIndex);
  assert.ok(reviewerGatewayIndex < runtimeBriefIndex);

  assert.match(indexHtml, /For You/);
  assert.match(indexHtml, /For Reviewers/);
  assert.match(indexHtml, /리뷰어 검토 표면/);
  assert.match(indexHtml, /Review Surface/);
});

test("public styles include bounded audience split treatment", () => {
  assert.match(stylesCss, /\.audience-split\s*\{/);
  assert.match(stylesCss, /\.reviewer-shell\s*\{/);
  assert.match(stylesCss, /\.audience-card-review\s*\{/);
});
