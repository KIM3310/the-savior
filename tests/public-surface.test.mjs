import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const stylesCss = readFileSync(path.join(ROOT, "public", "styles.css"), "utf8");
const privacyHtml = readFileSync(path.join(ROOT, "public", "privacy.html"), "utf8");
const privacyDraft = readFileSync(path.join(ROOT, "docs", "PRIVACY_POLICY_DRAFT.md"), "utf8");
const publicServiceOffer = readFileSync(path.join(ROOT, "public", "service-offer.json"), "utf8");
const docsServiceOffer = readFileSync(path.join(ROOT, "docs", "service-offer.json"), "utf8");
const siteServiceOffer = readFileSync(path.join(ROOT, "site", "service-offer.json"), "utf8");
const publicLlms = readFileSync(path.join(ROOT, "public", "llms.txt"), "utf8");
const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
const siteIndexHtml = readFileSync(path.join(ROOT, "site", "index.html"), "utf8");
const appJs = readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
const chatJs = readFileSync(path.join(ROOT, "functions", "api", "chat.js"), "utf8");
const robotsTxt = readFileSync(path.join(ROOT, "public", "robots.txt"), "utf8");
const sitemapXml = readFileSync(path.join(ROOT, "public", "sitemap.xml"), "utf8");
const adsTxt = readFileSync(path.join(ROOT, "public", "ads.txt"), "utf8");
const productionSmoke = readFileSync(path.join(ROOT, "scripts", "smoke_production.sh"), "utf8");
const SITE_ORIGIN = "https://the-savior-9z8.pages.dev";

test("public landing separates end-user front door from status page", () => {
  const heroIndex = indexHtml.indexOf('<section class="hero');
  const architectureGatewayIndex = indexHtml.indexOf('id="architecture-gateway"');
  const runtimeBriefIndex = indexHtml.indexOf('id="runtime-brief"');

  assert.notEqual(heroIndex, -1);
  assert.notEqual(architectureGatewayIndex, -1);
  assert.notEqual(runtimeBriefIndex, -1);
  assert.ok(heroIndex < architectureGatewayIndex);
  assert.ok(architectureGatewayIndex < runtimeBriefIndex);

  assert.match(indexHtml, /For You/);
  assert.match(indexHtml, /For Operators/);
  assert.match(indexHtml, /운영 검토 표면/);
  assert.match(indexHtml, /Operations Surface/);
});

test("public styles include bounded audience split treatment", () => {
  assert.match(stylesCss, /\.audience-split\s*\{/);
  assert.match(stylesCss, /\.architecture-shell\s*\{/);
  assert.match(stylesCss, /\.audience-card-review\s*\{/);
  assert.match(stylesCss, /\.first-session-guide\s*\{/);
  assert.match(stylesCss, /\.first-session-grid\s*\{/);
});

test("hero grounding surface exposes preview pills and default preset wiring", () => {
  assert.match(indexHtml, /heroGroundingMood/);
  assert.match(indexHtml, /heroGroundingStress/);
  assert.match(indexHtml, /heroGroundingPrompt/);
  assert.match(stylesCss, /\.hero-grounding-preview\s*\{/);
  assert.match(stylesCss, /\.hero-grounding-pill\s*\{/);
  assert.match(appJs, /applyHeroGroundingPreset\("presentation", \{ scroll: false \}\)/);
});

test("operations surface includes first-session readiness guide wiring", () => {
  assert.match(indexHtml, /firstSessionHeadline/);
  assert.match(indexHtml, /firstSessionMode/);
  assert.match(indexHtml, /firstSessionNext/);
  assert.match(indexHtml, /firstSessionBoundary/);
  assert.match(indexHtml, /firstSessionProof/);
  assert.match(appJs, /function renderFirstSessionGuide/);
  assert.match(appJs, /renderFirstSessionGuide\(\);/);
  assert.match(appJs, /firstSessionBoundary/);
  assert.match(appJs, /firstSessionProof/);
});

test("privacy disclosures match browser storage and the runtime provider matrix", () => {
  assert.match(appJs, /writeStorage\(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY/);
  assert.match(appJs, /writeStorage\(sessionStorage, CHAT_HISTORY_SESSION_KEY/);
  assert.match(appJs, /writeJsonStorage\(localStorage, CHECKIN_HISTORY_STORAGE_KEY/);
  assert.match(appJs, /writeJsonStorage\(localStorage, ACTIVITY_SUMMARY_STORAGE_KEY/);

  assert.match(privacyHtml, /sessionStorage/);
  assert.match(privacyHtml, /localStorage/);
  assert.doesNotMatch(privacyHtml, /API 키는 브라우저 로컬 저장소에 저장/);

  for (const provider of ["OpenAI", "OpenRouter", "Gemini", "Ollama", "deterministic fallback"]) {
    assert.match(chatJs, new RegExp(provider.replace("deterministic fallback", "fallback"), "i"));
    assert.match(privacyHtml, new RegExp(provider, "i"));
    assert.match(privacyDraft, new RegExp(provider, "i"));
  }
});

test("Cloudflare search discovery covers the public policy surface", () => {
  assert.match(indexHtml, new RegExp(`<link rel="canonical" href="${SITE_ORIGIN}/"`));
  assert.match(indexHtml, new RegExp(`property="og:url" content="${SITE_ORIGIN}/"`));
  assert.match(indexHtml, /<meta name="google-adsense-account" content="ca-pub-4973160293737562" \/>/);
  assert.match(
    indexHtml,
    /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-4973160293737562/
  );
  assert.match(robotsTxt, new RegExp(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
  assert.equal(adsTxt, "google.com, pub-4973160293737562, DIRECT, f08c47fec0942fa0\n");

  const routes = ["about", "privacy", "terms", "contact", "pricing", "resources", "media-credits"];
  for (const route of routes) {
    assert.match(sitemapXml, new RegExp(`<loc>${SITE_ORIGIN}/${route}</loc>`));
  }
});

test("public canonical metadata uses the real Pages URL consistently", () => {
  const surfaces = [
    indexHtml,
    siteIndexHtml,
    publicServiceOffer,
    docsServiceOffer,
    siteServiceOffer,
    publicLlms,
    readme
  ];

  for (const surface of surfaces) {
    assert.doesNotMatch(surface, /https:\/\/kim3310\.github\.io\/the-savior\//);
  }

  for (const source of [publicServiceOffer, docsServiceOffer, siteServiceOffer]) {
    const offer = JSON.parse(source);
    assert.equal(offer.canonical_url, `${SITE_ORIGIN}/`);
    assert.equal(offer.structured_data.url, `${SITE_ORIGIN}/`);
    assert.equal(offer.structured_data.offers[0].url, `${SITE_ORIGIN}/`);
  }

  assert.match(publicLlms, new RegExp(`Canonical URL: ${SITE_ORIGIN}/`));
  assert.match(readme, new RegExp(`Canonical URL: ${SITE_ORIGIN}/`));
  assert.match(siteIndexHtml, new RegExp(`<link rel="canonical" href="${SITE_ORIGIN}/"`));
});

test("production smoke validates response identity and ads.txt", () => {
  assert.match(productionSmoke, /\/ads\.txt/);
  assert.match(productionSmoke, /google\.com, pub-4973160293737562, DIRECT, f08c47fec0942fa0/);
  assert.match(productionSmoke, /%\{content_type\}/);
  assert.match(productionSmoke, /%\{url_effective\}/);
  assert.match(productionSmoke, /<h1>개인정보처리방침<\/h1>/);
  assert.match(productionSmoke, /\/robots\.txt/);
  assert.match(productionSmoke, /\/sitemap\.xml/);
});
