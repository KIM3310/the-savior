const state = {
  chatHistory: [],
  chatBusy: false,
  checkinBusy: false,
  journalBusy: false,
  totalSeconds: 180,
  remainingSeconds: 180,
  timerHandle: null,
  breathTick: 0,
  adsEnabled: false,
  apiBase: "",
  apiMisconfigured: false,
  backendReachable: false,
  reviewOnly: false,
  adConfig: null,
  userApiKey: "",
  hasServerApiKey: false,
  llmProviderPreference: "auto",
  ollamaEnabled: false,
  ollamaModel: "",
  runtimeBrief: null,
  reviewPack: null,
  keyValidationTimer: null,
  keyValidationAbort: null,
  keyValidationSeq: 0,
  lastValidatedCandidate: "",
  lastValidationResult: null
};

const USER_API_KEY_SESSION_STORAGE_KEY = "theSaviorUserOpenAIKeySession";
const USER_API_KEY_LEGACY_STORAGE_KEY = "theSaviorUserOpenAIKey";
const USER_API_KEY_LEGACY_PERSIST_FLAG_KEY = "theSaviorRememberUserOpenAIKey";
const CHAT_HISTORY_SESSION_KEY = "theSaviorChatHistory";
const CHECKIN_OUTPUT_SESSION_KEY = "theSaviorCheckinOutput";
const JOURNAL_OUTPUT_SESSION_KEY = "theSaviorJournalOutput";
const CHECKIN_HISTORY_STORAGE_KEY = "theSaviorCheckinHistory";
const ACTIVITY_SUMMARY_STORAGE_KEY = "theSaviorActivitySummary";
const DEFAULT_NATIVE_API_BASE = "https://the-savior-9z8.pages.dev";
const AI_REQUEST_TIMEOUT_MS = 25_000;
const HERO_GROUNDING_CASES = {
  presentation: {
    mood: "불안",
    stress: 8,
    note: "발표 직전이라 호흡이 짧아지고 손이 차가워졌어요.",
    summary: "발표 직전 긴장을 위한 시작점입니다. 불안 8/10으로 체크인을 채우고 바로 1분 감정 체크로 내려갑니다."
  },
  overload: {
    mood: "피곤",
    stress: 7,
    note: "할 일이 한꺼번에 몰려 머리가 멈춘 느낌이에요. 우선순위부터 정리하고 싶어요.",
    summary: "과부하를 정리하는 시작점입니다. 피곤 7/10 상태로 체크인을 채우고 메모를 남긴 뒤 바로 루틴을 만들 수 있습니다."
  },
  sleep: {
    mood: "슬픔",
    stress: 6,
    note: "자기 전에 생각이 멈추지 않아 몸은 피곤한데 마음이 가라앉지 않아요.",
    summary: "잠들기 전 진정을 위한 시작점입니다. 저녁 감정선을 그대로 기록하고 호흡 세션으로 이어가기 좋습니다."
  }
};

function $(id) {
  return document.getElementById(id);
}

function setCurrentYear() {
  const currentYear = $("currentYear");
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
}

function setStressPreview() {
  const stress = $("stress");
  const value = $("stressValue");
  if (!stress || !value) return;
  value.textContent = stress.value;
  stress.addEventListener("input", () => {
    value.textContent = stress.value;
  });
}

function safeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function resolveRuntimeConnection() {
  const runtime = window.THE_SAVIOR_RUNTIME || {};
  const configured = safeText(runtime.apiBaseUrl || "");
  const hasCapacitor = Boolean(
    window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform()
  );
  const isHttpWeb = Boolean(
    window.location &&
      /^https?:$/i.test(window.location.protocol)
  );

  if (configured) {
    return {
      apiBase: configured.replace(/\/+$/, ""),
      apiMisconfigured: false,
      backendReachable: false,
      reviewOnly: false
    };
  }

  if (hasCapacitor) {
    return {
      apiBase: DEFAULT_NATIVE_API_BASE,
      apiMisconfigured: false,
      backendReachable: false,
      reviewOnly: false
    };
  }

  if (isHttpWeb && window.location) {
    return {
      apiBase: window.location.origin.replace(/\/+$/, ""),
      apiMisconfigured: false,
      backendReachable: false,
      reviewOnly: false
    };
  }

  return {
    apiBase: "",
    apiMisconfigured: true,
    backendReachable: false,
    reviewOnly: true
  };
}

function apiUrl(path) {
  return `${state.apiBase}${path}`;
}

function renderResult(element, text) {
  if (!element) return;
  element.textContent = text;
}

function setRuntimeStatus(message, tone = "default") {
  const pill = $("runtimeStatus");
  if (!pill) return;
  pill.classList.remove("is-good", "is-warning", "is-error");
  if (tone === "good") pill.classList.add("is-good");
  if (tone === "warning") pill.classList.add("is-warning");
  if (tone === "error") pill.classList.add("is-error");
  pill.textContent = message;
}

function setApiBaseStatus() {
  const label = $("apiBaseStatus");
  if (!label) return;
  const statusSuffix = state.apiMisconfigured
    ? " · production 설정 필요"
    : state.reviewOnly && !state.backendReachable
      ? " · review-only"
      : state.backendReachable
        ? " · live"
        : " · 연결 확인 중";
  label.textContent = `API 기준 주소: ${state.apiBase || "(미설정)"}${statusSuffix}`;
}

function renderFirstSessionGuide() {
  const mode = state.apiMisconfigured
    ? "misconfigured"
    : state.reviewOnly && !state.backendReachable
      ? "review-only"
      : state.backendReachable
        ? "live"
        : "checking";

  let headline = "처음 한 번은 연결 상태부터 차분히 확인하세요";
  let summary = "runtime 준비가 끝나면 check-in, coach, journal 순서로 이어집니다.";
  let path = "runtime 확인 중";
  let nextStep = "runtime 연결을 확인해 주세요.";
  let boundary = "live AI가 없을 때도 review surface와 입력 준비는 먼저 확인할 수 있습니다.";
  let proof = "runtime brief 확인 중";

  if (state.apiMisconfigured) {
    headline = "먼저 API 연결 주소를 정리하세요";
    summary = "같은 도메인 Functions가 없으면 runtime-config.js에 API 기준 주소를 넣은 뒤 다시 시작하면 됩니다.";
    path = "review-only";
    nextStep = "runtime-config.js 또는 배포 구성을 먼저 확인하세요.";
    boundary = "지금은 review-only 상태이므로 감정 입력 초안과 reviewer surface만 안전하게 점검하세요.";
    proof = "proof surfaces unavailable";
  } else if (!state.backendReachable) {
    headline = "지금은 리뷰 표면부터 확인하는 상태입니다";
    summary = "health, runtime brief, review pack이 먼저 보이고 live check-in은 API 연결 후 열립니다.";
    path = "review-only";
    nextStep = "Health / Runtime Brief를 확인한 뒤 live 연결을 기다리세요.";
    boundary = "live provider가 아직 없어도 runtime, fallback, safety boundary 검토는 그대로 진행할 수 있습니다.";
    proof = "health first";
  } else if (state.userApiKey) {
    headline = "개인 API 키로 바로 첫 체크인을 시작할 수 있습니다";
    summary = "현재 세션에서만 키를 사용하므로 감정 체크 → 코치 → 저널 흐름을 바로 검증할 수 있습니다.";
    path = "BYOK session";
    nextStep = "Check-in에서 현재 감정과 스트레스를 입력해 첫 응답을 받아보세요.";
    boundary = "세션 키는 현재 브라우저 세션에만 머물러 reviewer-safe 검토와 개인 시작선을 함께 지켜줍니다.";
    proof = "runtime brief + review pack ready";
  } else if (state.llmProviderPreference === "ollama" && state.ollamaEnabled) {
    headline = "로컬 모델 경로가 열려 있어 OpenAI 키 없이도 시작할 수 있습니다";
    summary = "Ollama 로컬 모델이 감정 체크와 코치 응답을 담당하므로 첫 사용 장벽이 낮습니다.";
    path = "Ollama local";
    nextStep = "Check-in에서 짧은 상황 설명을 넣고 로컬 응답 품질을 먼저 확인하세요.";
    boundary = "로컬 모델 경로라서 첫 감정 입력을 차분히 검토한 뒤 필요할 때만 더 강한 provider로 넘어가면 됩니다.";
    proof = "local model + review surfaces ready";
  } else if (state.hasServerApiKey) {
    headline = "서버 키 폴백으로 바로 첫 흐름을 확인할 수 있습니다";
    summary = "BYOK가 없어도 첫 check-in, coach, journal 흐름을 검토한 뒤 필요할 때만 개인 키를 연결하면 됩니다.";
    path = "Server fallback";
    nextStep = "Check-in을 먼저 실행하고 이후 필요하면 API Key 섹션에서 개인 키로 전환하세요.";
    boundary = "서버 키는 첫 흐름 확인용이고, 개인 키는 필요할 때만 추가해 reviewer-safe handoff를 유지할 수 있습니다.";
    proof = "server-key + review pack ready";
  } else if (state.ollamaEnabled) {
    headline = "OpenAI 키 없이도 로컬 모델 경로를 선택할 수 있습니다";
    summary = "Ollama가 켜져 있으면 로컬 모델로 시작하고, 더 강한 응답이 필요할 때만 개인 키를 더하면 됩니다.";
    path = "Optional Ollama";
    nextStep = "Check-in 또는 API Key 섹션 중 더 편한 시작점을 고르세요.";
    boundary = "로컬 모델과 review surface가 먼저 열려 있어, 감정선과 운영 검토를 무리 없이 분리할 수 있습니다.";
    proof = "review pack ready";
  } else {
    headline = "개인 API 키를 한 번 넣으면 바로 첫 세션을 시작할 수 있습니다";
    summary = "현재는 live AI 경로가 비어 있으므로 API Key 섹션에서 세션용 키를 넣는 것이 가장 빠른 시작점입니다.";
    path = "BYOK required";
    nextStep = "API Key 섹션에서 세션 키를 입력한 뒤 Check-in으로 돌아오세요.";
    boundary = "키를 넣기 전에는 reviewer surface와 감정 초안만 차분히 준비하고, live AI는 나중에 여세요.";
    proof = "runtime live, AI path pending";
  }

  if (state.runtimeBrief?.status !== "ok" || state.reviewPack?.status !== "ok") {
    proof = state.backendReachable ? "proof surfaces loading" : proof;
  }

  fillText("firstSessionHeadline", headline, headline);
  fillText("firstSessionSummary", summary, summary);
  fillText("firstSessionMode", mode, mode);
  fillText("firstSessionPath", path, path);
  fillText("firstSessionNext", nextStep, nextStep);
  fillText("firstSessionBoundary", boundary, boundary);
  fillText("firstSessionProof", proof, proof);
}

function setAiSurfacesEnabled(enabled, lockedLabel) {
  [
    ["checkinForm", lockedLabel],
    ["chatForm", lockedLabel],
    ["journalForm", lockedLabel],
    ["userApiKeyForm", lockedLabel],
  ].forEach(([formId, label]) => {
    const form = $(formId);
    if (!form) return;
    form.querySelectorAll("input, textarea, select, button").forEach((field) => {
      field.disabled = !enabled;
    });
    const submit = form.querySelector("button[type='submit']");
    if (submit) {
      if (!submit.dataset.defaultText) {
        submit.dataset.defaultText = submit.textContent || "";
      }
      submit.textContent = enabled ? submit.dataset.defaultText : label;
    }
  });
}

function applyAiAvailability() {
  if (state.apiMisconfigured) {
    state.backendReachable = false;
    state.reviewOnly = true;
    setAiSurfacesEnabled(false, "백엔드 설정 필요");
    setRuntimeStatus("리뷰 전용 화면 · 같은 도메인 API가 없으면 runtime-config.js로 연결 주소를 지정해 주세요.", "warning");
    setApiBaseStatus();
    renderFirstSessionGuide();
    return;
  }

  if (!state.backendReachable) {
    state.reviewOnly = true;
    setAiSurfacesEnabled(false, "백엔드 연결 필요");
    setRuntimeStatus("리뷰 화면을 준비하는 중입니다. API 연결이 되면 live 기능이 함께 열립니다.", "warning");
    setApiBaseStatus();
    renderFirstSessionGuide();
    return;
  }

  state.reviewOnly = false;
  setAiSurfacesEnabled(true, "");
  setApiBaseStatus();
  renderFirstSessionGuide();
}

function setBriefBadge(message, tone = "default") {
  const badge = $("briefBadge");
  if (!badge) return;
  badge.classList.remove("is-good", "is-warning");
  if (tone === "good") badge.classList.add("is-good");
  if (tone === "warning") badge.classList.add("is-warning");
  badge.textContent = message;
}

function fillText(id, value, fallback = "-") {
  const element = $(id);
  if (!element) return;
  const text = safeText(typeof value === "string" ? value : String(value ?? ""));
  element.textContent = text || fallback;
}

function renderBriefList(id, items, fallbackText) {
  const list = $(id);
  if (!list) return;

  const values = Array.isArray(items) && items.length ? items : [fallbackText];
  list.innerHTML = "";
  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = safeText(item || "") || fallbackText;
    list.appendChild(li);
  });
}

function renderProofAssets(id, items, fallbackText) {
  const list = $(id);
  if (!list) return;

  const values = Array.isArray(items) && items.length
    ? items.map((item) => {
        const label = safeText(item?.label || "Asset");
        const path = safeText(item?.path || "");
        const why = safeText(item?.why || "");
        return why ? `${label} (${path}) - ${why}` : `${label} (${path})`;
      })
    : [fallbackText];

  list.innerHTML = "";
  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderRuntimeBrief(payload) {
  state.runtimeBrief = payload || null;

  if (!payload || payload.status !== "ok") {
    setBriefBadge("brief-unavailable", "warning");
    fillText("briefHeadline", "운영 브리프를 아직 가져오지 못했습니다. 잠시 후 다시 보이거나 health/config 경로에서 먼저 확인할 수 있습니다.");
    fillText("briefSchema", "unavailable");
    fillText("briefMode", "degraded");
    fillText("briefProvider", "network-check-required");
    fillText("briefRouteCount", "0");
    renderBriefList("briefReviewFlow", [], "runtime brief fetch 실패 시 health/meta부터 확인합니다.");
    renderBriefList("briefTwoMinuteReview", [], "health, runtime brief, review pack, live/fallback 검토 순으로 확인합니다.");
    renderBriefList("briefOperatorRules", [], "BYOK, fallback, crisis escalation 정책을 수동 검토합니다.");
    renderProofAssets("briefProofAssets", [], "핵심 증거 surface를 불러오지 못했습니다.");
    renderBriefList("briefWatchouts", [], "런타임 surface가 없으면 배포 전 검증 증거가 약해집니다.");
    return;
  }

  const reportContract = payload.report_contract || {};
  const llm = payload.llm || {};
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  const providerParts = [safeText(llm.providerPreference || "auto")];
  if (llm.ollamaEnabled && safeText(llm.ollamaModel || "")) {
    providerParts.push(safeText(llm.ollamaModel || ""));
  }
  providerParts.push(llm.canServeWithoutUserKey ? "ready" : "BYOK required");

  setBriefBadge(
    safeText(payload.readiness_contract || "runtime-brief"),
    llm.canServeWithoutUserKey ? "good" : "warning"
  );
  fillText("briefHeadline", payload.headline, "runtime brief unavailable");
  fillText("briefSchema", reportContract.schema, "unknown");
  fillText("briefMode", llm.runtimeMode, "runtime-key");
  fillText("briefProvider", providerParts.join(" · "), "auto");
  fillText("briefRouteCount", routes.length > 0 ? `${routes.length} routes` : "0");
  renderBriefList("briefReviewFlow", payload.review_flow, "review flow unavailable");
  renderBriefList("briefTwoMinuteReview", payload.two_minute_review, "two-minute review unavailable");
  renderBriefList("briefOperatorRules", payload.operator_rules, "operator rules unavailable");
  renderProofAssets("briefProofAssets", payload.proof_assets, "proof assets unavailable");
  renderBriefList("briefWatchouts", payload.watchouts, "watchouts unavailable");
}

function renderReviewPack(payload) {
  state.reviewPack = payload || null;

  if (!payload || payload.status !== "ok") {
    fillText("reviewPackBadge", "review-unavailable");
    fillText("reviewPackHeadline", "리뷰 패키지를 아직 가져오지 못했습니다. health/meta/runtime surface를 먼저 확인해 주세요.");
    fillText("reviewPackRuntime", "degraded");
    fillText("reviewPackLlmReady", "check-required");
    fillText("reviewPackAdsense", "unknown");
    fillText("reviewPackRoutes", "0");
    renderBriefList("reviewPackSafety", [], "safety boundary fetch 실패 시 crisis/fallback 정책을 수동 확인합니다.");
    renderBriefList("reviewPackRevenue", [], "monetization boundary를 수동 검토합니다.");
    renderBriefList("reviewPackTwoMinuteReview", [], "health, runtime brief, review pack, live/fallback 검토 순으로 확인합니다.");
    renderBriefList("reviewPackSequence", [], "review pack fetch 실패 시 health/meta/runtime-brief부터 확인합니다.");
    renderProofAssets("reviewPackProofAssets", [], "review pack proof assets unavailable");
    return;
  }

  const proof = payload.proof_bundle || {};
  fillText("reviewPackBadge", payload.readiness_contract, "review-pack");
  fillText("reviewPackHeadline", payload.headline, "review pack unavailable");
  fillText("reviewPackRuntime", proof.runtimeMode, "runtime-key");
  fillText("reviewPackLlmReady", proof.llmReady ? "ready" : "fallback-only");
  fillText("reviewPackAdsense", proof.adsenseConfigured ? "configured" : "not-configured");
  fillText("reviewPackRoutes", Array.isArray(proof.review_routes) ? `${proof.review_routes.length} routes` : "0");
  renderBriefList("reviewPackSafety", payload.safety_boundary, "safety boundary unavailable");
  renderBriefList("reviewPackRevenue", payload.revenue_boundary, "revenue boundary unavailable");
  renderBriefList("reviewPackTwoMinuteReview", payload.two_minute_review, "two-minute review unavailable");
  renderBriefList("reviewPackSequence", payload.review_sequence, "review sequence unavailable");
  renderProofAssets("reviewPackProofAssets", payload.proof_assets, "proof assets unavailable");
}

async function copyProviderPostureSnapshot() {
  const brief = state.runtimeBrief || {};
  const llm = brief.llm || {};
  const diagnostics = brief.diagnostics || {};
  const monetization = brief.monetization || {};
  const reviewPack = state.reviewPack || {};
  const lines = [
    "the-savior provider posture",
    `Headline: ${brief.headline || "-"}`,
    `Provider preference: ${llm.providerPreference || state.llmProviderPreference || "-"}`,
    `Runtime mode: ${diagnostics.runtimeMode || llm.runtimeMode || "-"}`,
    `Provider ready: ${llm.canServeWithoutUserKey ? "yes" : "no"}`,
    `Server key: ${llm.hasServerApiKey ? "enabled" : "disabled"}`,
    `Ollama: ${llm.ollamaEnabled ? `enabled (${llm.ollamaModel || state.ollamaModel || "-"})` : "disabled"}`,
    `AdSense: ${monetization.adsenseConfigured ? "configured" : "not configured"}`,
    "",
    "Boundary checks",
    ...((reviewPack.safety_boundary || []).slice(0, 2).map((item) => `- ${item}`)),
    ...((reviewPack.revenue_boundary || []).slice(0, 1).map((item) => `- ${item}`)),
  ];
  const ok = await copyTextToClipboard(lines.join("\n"));
  setRuntimeStatus(ok ? "Provider posture를 복사했습니다." : "Provider posture 복사에 실패했습니다.", ok ? "good" : "warning");
}

async function copyCrisisSnapshot() {
  const brief = state.runtimeBrief || {};
  const reviewPack = state.reviewPack || {};
  const diagnostics = brief.diagnostics || {};
  const proof = reviewPack.proof_bundle || {};
  const lines = [
    "the-savior crisis snapshot",
    `Headline: ${reviewPack.headline || brief.headline || "-"}`,
    `Runtime mode: ${diagnostics.runtimeMode || proof.runtimeMode || "-"}`,
    `Provider ready: ${proof.llmReady ? "yes" : "no"}`,
    `AdSense: ${proof.adsenseConfigured ? "configured" : "not configured"}`,
    "",
    "Safety boundary",
    ...((reviewPack.safety_boundary || []).slice(0, 3).map((item) => `- ${item}`)),
    "",
    "Revenue boundary",
    ...((reviewPack.revenue_boundary || []).slice(0, 2).map((item) => `- ${item}`)),
    "",
    "Focused routes",
    ...((proof.review_routes || []).slice(0, 4).map((item) => `- ${item}`)),
  ];
  const ok = await copyTextToClipboard(lines.join("\n"));
  setRuntimeStatus(ok ? "Crisis snapshot을 복사했습니다." : "Crisis snapshot 복사에 실패했습니다.", ok ? "good" : "warning");
}

async function copyReviewerBundle() {
  const brief = state.runtimeBrief || {};
  const reviewPack = state.reviewPack || {};
  const proof = reviewPack.proof_bundle || {};
  const shareRoutes = Array.isArray(proof.review_routes) ? proof.review_routes : [];
  const lines = [
    "the-savior reviewer bundle",
    `Headline: ${reviewPack.headline || brief.headline || "-"}`,
    `API base: ${state.apiBase || "(unset)"}`,
    `Runtime posture: ${state.reviewOnly ? "review-only" : state.backendReachable ? "live" : "checking"}`,
    `Provider preference: ${brief.llm?.providerPreference || state.llmProviderPreference || "-"}`,
    "",
    "Review routes",
    ...(shareRoutes.length > 0 ? shareRoutes.map((item) => `- ${item}`) : ["- Review routes unavailable."]),
    "",
    "Safety boundary",
    ...((reviewPack.safety_boundary || []).slice(0, 2).map((item) => `- ${item}`)),
    "",
    "Revenue boundary",
    ...((reviewPack.revenue_boundary || []).slice(0, 2).map((item) => `- ${item}`)),
  ];
  const ok = await copyTextToClipboard(lines.join("\n"));
  setRuntimeStatus(ok ? "Reviewer bundle을 복사했습니다." : "Reviewer bundle 복사에 실패했습니다.", ok ? "good" : "warning");
}

function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent || "";
  }
  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.defaultText;
}

function updateCounter(inputId, counterId) {
  const input = $(inputId);
  const counter = $(counterId);
  if (!input || !counter) return;
  const max = Number.parseInt(input.getAttribute("maxlength") || "0", 10);
  const current = input.value.length;
  counter.textContent = String(current);
  if (max > 0 && current > max * 0.9) {
    counter.style.color = "#dfb182";
  } else {
    counter.style.color = "";
  }
}

function setupCharacterCounters() {
  const pairs = [
    ["checkinNote", "checkinNoteCount"],
    ["chatInput", "chatInputCount"],
    ["journalInput", "journalInputCount"]
  ];

  pairs.forEach(([inputId, counterId]) => {
    const input = $(inputId);
    if (!input) return;
    const handler = () => updateCounter(inputId, counterId);
    input.addEventListener("input", handler);
    handler();
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", async (event) => {
    const target = event.target;
    const tagName = String(target?.tagName || "").toLowerCase();
    const isTypingTarget =
      Boolean(target?.isContentEditable) ||
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select";
    if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "r") {
      event.preventDefault();
      const routes = state.reviewPack?.proof_bundle?.review_routes || [];
      const payload = ["the-savior review routes", ...routes.map((item) => `- ${item}`)].join("\n");
      const ok = await copyTextToClipboard(payload);
      setRuntimeStatus(ok ? "Review routes를 복사했습니다." : "Review routes 복사에 실패했습니다.", ok ? "good" : "warning");
    } else if (key === "p") {
      event.preventDefault();
      await copyProviderPostureSnapshot();
    } else if (key === "c") {
      event.preventDefault();
      await copyCrisisSnapshot();
    } else if (key === "b") {
      event.preventDefault();
      await copyReviewerBundle();
    } else if (key === "t") {
      event.preventDefault();
      const start = $("startTimer");
      const pause = $("pauseTimer");
      if (state.timerHandle) {
        pause?.click();
      } else {
        start?.click();
      }
    } else if (key === "?") {
      event.preventDefault();
      setRuntimeStatus("Shortcuts: Shift+R routes · Shift+P posture · Shift+C crisis · Shift+B reviewer bundle · Shift+T breathing timer", "good");
    }
  });
}

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isLikelyOpenAIKey(value) {
  const key = normalizeApiKey(value);
  return key.startsWith("sk-") && !/\s/.test(key) && key.length >= 20 && key.length <= 260;
}

function maskApiKey(value) {
  const key = normalizeApiKey(value);
  if (!key) return "";
  if (key.length <= 12) return `${key.slice(0, 4)}...`;
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

function readStorage(storage, key) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage quota/private mode errors.
  }
}

function removeStorage(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage access errors.
  }
}

function readJsonStorage(storage, key, fallbackValue) {
  const raw = readStorage(storage, key);
  if (!raw) return fallbackValue;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeJsonStorage(storage, key, value) {
  try {
    writeStorage(storage, key, JSON.stringify(value));
  } catch {
    // Ignore serialization issues.
  }
}

function getStoredUserApiKey() {
  const sessionKey = normalizeApiKey(readStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY));
  if (sessionKey) {
    return sessionKey;
  }

  const localKey = normalizeApiKey(readStorage(localStorage, USER_API_KEY_LEGACY_STORAGE_KEY));
  if (localKey) {
    writeStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY, localKey);
    removeStorage(localStorage, USER_API_KEY_LEGACY_STORAGE_KEY);
    removeStorage(localStorage, USER_API_KEY_LEGACY_PERSIST_FLAG_KEY);
    return localKey;
  }

  removeStorage(localStorage, USER_API_KEY_LEGACY_PERSIST_FLAG_KEY);
  return "";
}

function saveUserApiKey(value) {
  const key = normalizeApiKey(value);
  if (!key) return;

  writeStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY, key);
  removeStorage(localStorage, USER_API_KEY_LEGACY_STORAGE_KEY);
  removeStorage(localStorage, USER_API_KEY_LEGACY_PERSIST_FLAG_KEY);

  state.userApiKey = key;
}

function clearUserApiKey() {
  removeStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY);
  removeStorage(localStorage, USER_API_KEY_LEGACY_STORAGE_KEY);
  removeStorage(localStorage, USER_API_KEY_LEGACY_PERSIST_FLAG_KEY);
  state.userApiKey = "";
}

function persistChatHistory() {
  try {
    const trimmed = Array.isArray(state.chatHistory) ? state.chatHistory.slice(-8) : [];
    writeStorage(sessionStorage, CHAT_HISTORY_SESSION_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore serialization/storage errors.
  }
}

function restoreChatHistory() {
  const raw = readStorage(sessionStorage, CHAT_HISTORY_SESSION_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && (item.role === "assistant" || item.role === "user"))
      .map((item) => ({
        role: item.role,
        content: safeText(item.content || "")
      }))
      .filter((item) => item.content);
  } catch {
    return [];
  }
}

function clearChatHistoryStorage() {
  removeStorage(sessionStorage, CHAT_HISTORY_SESSION_KEY);
}

function persistResultSnapshot({ checkinText, journalText }) {
  if (typeof checkinText === "string") {
    writeStorage(sessionStorage, CHECKIN_OUTPUT_SESSION_KEY, checkinText);
  }
  if (typeof journalText === "string") {
    writeStorage(sessionStorage, JOURNAL_OUTPUT_SESSION_KEY, journalText);
  }
}

function restoreResultSnapshot() {
  return {
    checkinText: readStorage(sessionStorage, CHECKIN_OUTPUT_SESSION_KEY),
    journalText: readStorage(sessionStorage, JOURNAL_OUTPUT_SESSION_KEY)
  };
}

async function copyTextToClipboard(text) {
  const value = safeText(text || "");
  if (!value) return false;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below.
  }

  try {
    const temp = document.createElement("textarea");
    temp.value = value;
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.focus();
    temp.select();
    const success = document.execCommand("copy");
    document.body.removeChild(temp);
    return Boolean(success);
  } catch {
    return false;
  }
}

function parseStressValue(value) {
  const num = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(num)) return null;
  if (num < 1 || num > 10) return null;
  return num;
}

function getCheckinHistory() {
  const raw = readJsonStorage(localStorage, CHECKIN_HISTORY_STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      date: safeText(item?.date || ""),
      mood: safeText(item?.mood || ""),
      stress: parseStressValue(item?.stress),
      fallback: Boolean(item?.fallback),
      createdAt: safeText(item?.createdAt || "")
    }))
    .filter((item) => item.date);
}

function saveCheckinHistory(items) {
  writeJsonStorage(localStorage, CHECKIN_HISTORY_STORAGE_KEY, items);
}

function getActivitySummary() {
  const parsed = readJsonStorage(localStorage, ACTIVITY_SUMMARY_STORAGE_KEY, {});
  const chatCount = Number.parseInt(String(parsed.chatCount ?? "0"), 10);
  const journalCount = Number.parseInt(String(parsed.journalCount ?? "0"), 10);
  return {
    chatCount: Number.isFinite(chatCount) && chatCount > 0 ? chatCount : 0,
    journalCount: Number.isFinite(journalCount) && journalCount > 0 ? journalCount : 0,
    lastUpdated: safeText(parsed.lastUpdated || "")
  };
}

function saveActivitySummary(summary) {
  writeJsonStorage(localStorage, ACTIVITY_SUMMARY_STORAGE_KEY, summary);
}

function incrementActivityCounter(type) {
  const summary = getActivitySummary();
  if (type === "chat") summary.chatCount += 1;
  if (type === "journal") summary.journalCount += 1;
  summary.lastUpdated = new Date().toISOString();
  saveActivitySummary(summary);
}

function recordCheckinHistoryEntry({ mood, stress, fallback }) {
  const history = getCheckinHistory();
  history.push({
    date: getKstDateKey(),
    mood: safeText(mood || "").slice(0, 30) || "미입력",
    stress: parseStressValue(stress),
    fallback: Boolean(fallback),
    createdAt: new Date().toISOString()
  });
  const trimmed = history.slice(-180);
  saveCheckinHistory(trimmed);
}

function withinRecentDays(dateKey, days) {
  const todayTs = Date.parse(getKstDateKey());
  const entryTs = Date.parse(dateKey);
  if (!Number.isFinite(todayTs) || !Number.isFinite(entryTs)) return false;
  const diff = Math.floor((todayTs - entryTs) / 86400000);
  return diff >= 0 && diff < days;
}

function formatDayLabel(dateKey) {
  if (!dateKey || dateKey.length < 10) return dateKey || "-";
  return `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)}`;
}

function average(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function calculateInsight(history) {
  const recent14 = history.filter((item) => withinRecentDays(item.date, 14));
  const recent7 = recent14.filter((item) => withinRecentDays(item.date, 7));
  const prev7 = history.filter((item) => {
    const todayTs = Date.parse(getKstDateKey());
    const ts = Date.parse(item.date);
    if (!Number.isFinite(todayTs) || !Number.isFinite(ts)) return false;
    const diff = Math.floor((todayTs - ts) / 86400000);
    return diff >= 7 && diff < 14;
  });

  const recentStress = recent7.map((item) => item.stress).filter((value) => Number.isFinite(value));
  const prevStress = prev7.map((item) => item.stress).filter((value) => Number.isFinite(value));
  const avgRecent = average(recentStress);
  const avgPrev = average(prevStress);

  let trendText = "데이터 수집 중";
  if (avgRecent !== null && avgPrev !== null) {
    const delta = avgRecent - avgPrev;
    if (delta <= -0.6) trendText = "완화 추세 ↘";
    else if (delta >= 0.6) trendText = "상승 추세 ↗";
    else trendText = "안정 유지 →";
  } else if (avgRecent !== null) {
    trendText = "기준 데이터 축적 중";
  }

  const moodCounter = new Map();
  recent14.forEach((item) => {
    const mood = item.mood || "미입력";
    moodCounter.set(mood, (moodCounter.get(mood) || 0) + 1);
  });

  let topMood = "-";
  let topCount = 0;
  moodCounter.forEach((count, mood) => {
    if (count > topCount) {
      topMood = mood;
      topCount = count;
    }
  });

  return {
    recent14,
    recent7Avg: avgRecent,
    topMood,
    trendText
  };
}

function renderCheckinHistoryList(items) {
  const list = $("checkinHistoryList");
  if (!list) return;
  list.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "아직 기록이 없습니다.";
    list.appendChild(li);
    return;
  }

  items.slice(0, 8).forEach((item) => {
    const li = document.createElement("li");
    const stressText = Number.isFinite(item.stress) ? `스트레스 ${item.stress}` : "스트레스 미입력";
    const fallbackText = item.fallback ? " · 기본코칭" : "";
    li.textContent = `${formatDayLabel(item.date)} · ${item.mood || "미입력"} · ${stressText}${fallbackText}`;
    list.appendChild(li);
  });
}

function renderInsights() {
  const history = getCheckinHistory();
  const activity = getActivitySummary();
  const insight = calculateInsight(history);
  const recent14Sorted = [...insight.recent14].sort((a, b) => Date.parse(b.createdAt || b.date) - Date.parse(a.createdAt || a.date));

  const checkinCount = $("insightCheckinCount");
  const avgStress = $("insightAvgStress");
  const topMood = $("insightTopMood");
  const trend = $("insightTrend");
  const chatCount = $("insightChatCount");
  const journalCount = $("insightJournalCount");

  if (checkinCount) checkinCount.textContent = `${insight.recent14.length}회`;
  if (avgStress) {
    avgStress.textContent = insight.recent7Avg === null ? "-" : `${insight.recent7Avg.toFixed(1)} / 10`;
  }
  if (topMood) topMood.textContent = insight.topMood;
  if (trend) trend.textContent = insight.trendText;
  if (chatCount) chatCount.textContent = `${activity.chatCount}회`;
  if (journalCount) journalCount.textContent = `${activity.journalCount}회`;

  renderCheckinHistoryList(recent14Sorted);
}

function fallbackNoticeText(result) {
  if (!result || !result.fallback) return "";
  if (result.fallbackReason === "api_key_missing") {
    return "API 키가 없어 기본 코칭 모드로 제공되었습니다.";
  }
  if (result.fallbackReason === "ollama_unavailable") {
    return "Ollama 설정을 찾지 못해 기본 코칭 모드로 제공되었습니다.";
  }
  if (typeof result.fallbackReason === "string" && result.fallbackReason.startsWith("ollama_")) {
    return "Ollama 연결 이슈로 기본 코칭 모드가 제공되었습니다.";
  }
  return "AI 연결 이슈로 기본 코칭 모드가 제공되었습니다.";
}

function applyFallbackDecoration(reply, result) {
  const text = safeText(reply || "");
  const notice = fallbackNoticeText(result);
  if (!notice) return text;
  return `${text}\n\n[안내] ${notice}`;
}

function applyRuntimeStatusFromResult(result, defaultSuccessMessage) {
  const notice = fallbackNoticeText(result);
  if (notice) {
    setRuntimeStatus(notice, "warning");
    return;
  }

  const provider = safeText(result && result.provider ? result.provider : "");
  if (provider === "ollama") {
    const model = safeText(result && result.model ? result.model : state.ollamaModel);
    const suffix = model ? ` · Ollama (${model})` : " · Ollama";
    setRuntimeStatus(`${defaultSuccessMessage}${suffix}`, "good");
    return;
  }

  if (provider === "openai") {
    setRuntimeStatus(`${defaultSuccessMessage} · OpenAI`, "good");
    return;
  }

  setRuntimeStatus(defaultSuccessMessage, "good");
}

function updateUserApiKeyStatus(message, tone = "default") {
  const status = $("userApiKeyStatus");
  if (!status) return;

  status.classList.remove("is-warning", "is-good", "is-checking");
  if (tone === "warning") status.classList.add("is-warning");
  if (tone === "good") status.classList.add("is-good");
  if (tone === "checking") status.classList.add("is-checking");
  status.textContent = message;
}

function refreshUserApiKeyStatus() {
  if (state.userApiKey) {
    updateUserApiKeyStatus(`개인 API 키 사용 중 (${maskApiKey(state.userApiKey)} · 현재 세션에서만 사용)`, "good");
    return;
  }

  if (state.llmProviderPreference === "ollama" && state.ollamaEnabled) {
    const model = safeText(state.ollamaModel);
    const modelSuffix = model ? ` (${model})` : "";
    updateUserApiKeyStatus(`Ollama 로컬 모델${modelSuffix}로 동작합니다. OpenAI 키 없이 사용 가능합니다.`, "good");
    return;
  }

  if (state.hasServerApiKey) {
    updateUserApiKeyStatus("개인 API 키가 없어 서버 기본 키로 동작합니다.", "default");
    return;
  }

  if (state.ollamaEnabled) {
    const model = safeText(state.ollamaModel);
    const modelSuffix = model ? ` (${model})` : "";
    updateUserApiKeyStatus(`로컬 Ollama${modelSuffix}를 사용할 수 있습니다. OpenAI 키 입력은 선택입니다.`, "default");
    return;
  }

  updateUserApiKeyStatus("개인 API 키를 입력해 세션으로 저장하면 AI 기능이 동작합니다.", "warning");
}

function clearScheduledKeyValidation() {
  if (!state.keyValidationTimer) return;
  clearTimeout(state.keyValidationTimer);
  state.keyValidationTimer = null;
}

function abortInFlightKeyValidation() {
  if (!state.keyValidationAbort) return;
  state.keyValidationAbort.abort();
  state.keyValidationAbort = null;
}

function rememberValidationResult(candidate, result) {
  state.lastValidatedCandidate = candidate;
  state.lastValidationResult = result;
}

function getRememberedValidationResult(candidate) {
  if (candidate && state.lastValidatedCandidate === candidate && state.lastValidationResult) {
    return state.lastValidationResult;
  }
  return null;
}

function renderValidationStatus(result, options = {}) {
  if (!result || result.aborted) return;
  const saved = Boolean(typeof options === "object" ? options.saved : options);

  if (result.valid && result.usable) {
    const suffix = saved ? " 현재 세션에 저장되었습니다." : "";
    updateUserApiKeyStatus((result.message || "유효한 API 키입니다.") + suffix, "good");
    return;
  }

  if (result.valid && !result.usable) {
    const suffix = saved ? " 키는 세션에 저장되었지만 결제/한도 확인이 필요합니다." : "";
    updateUserApiKeyStatus((result.message || "키 확인됨. 결제/한도 상태를 확인해 주세요.") + suffix, "warning");
    return;
  }

  updateUserApiKeyStatus(result.message || "유효하지 않은 API 키입니다.", "warning");
}

async function verifyUserApiKeyCandidate(candidate, { fromRealtime = false } = {}) {
  const normalized = normalizeApiKey(candidate);
  if (!isLikelyOpenAIKey(normalized)) {
    return {
      valid: false,
      usable: false,
      message: "유효한 OpenAI API 키 형식이 아닙니다. `sk-`로 시작하는 키를 확인해 주세요."
    };
  }

  const cached = getRememberedValidationResult(normalized);
  if (cached) {
    return cached;
  }

  abortInFlightKeyValidation();
  const controller = new AbortController();
  state.keyValidationAbort = controller;
  state.keyValidationSeq += 1;
  const currentSeq = state.keyValidationSeq;

  if (fromRealtime) {
    updateUserApiKeyStatus("키 유효성 확인 중...", "checking");
  }

  try {
    const response = await fetch(apiUrl("/api/key-check"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({ key: normalized })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (currentSeq !== state.keyValidationSeq) {
      return { aborted: true };
    }

    const result = {
      valid: Boolean(payload && payload.valid),
      usable: Boolean(payload && payload.usable),
      message:
        (payload && (payload.message || payload.detail || payload.error)) ||
        (response.ok ? "키 확인에 성공했습니다." : "키 확인에 실패했습니다.")
    };

    rememberValidationResult(normalized, result);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { aborted: true };
    }

    return {
      valid: false,
      usable: false,
      message: "키 확인 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    };
  } finally {
    if (state.keyValidationAbort === controller) {
      state.keyValidationAbort = null;
    }
  }
}

function scheduleRealtimeValidation(inputValue) {
  const candidate = normalizeApiKey(inputValue || "");
  clearScheduledKeyValidation();

  if (!candidate) {
    refreshUserApiKeyStatus();
    return;
  }

  if (candidate === state.userApiKey) {
    refreshUserApiKeyStatus();
    return;
  }

  if (!isLikelyOpenAIKey(candidate)) {
    updateUserApiKeyStatus("형식을 확인하는 중입니다. `sk-`로 시작하는 키를 입력해 주세요.", "warning");
    return;
  }

  state.keyValidationTimer = setTimeout(async () => {
    const input = $("userApiKeyInput");
    const liveValue = normalizeApiKey(input?.value || "");
    if (liveValue !== candidate) return;

    const result = await verifyUserApiKeyCandidate(candidate, { fromRealtime: true });
    if (!result.aborted) {
      renderValidationStatus(result, false);
    }
  }, 700);
}

function setupUserApiKeyForm() {
  const form = $("userApiKeyForm");
  if (!form) return;

  const input = $("userApiKeyInput");
  const save = $("saveUserApiKeyBtn");
  const validate = $("validateUserApiKeyBtn");
  const toggle = $("toggleUserApiKeyBtn");
  const clear = $("clearUserApiKeyBtn");

  if (input) {
    input.addEventListener("input", () => {
      scheduleRealtimeValidation(input.value);
    });
  }

  if (validate && input) {
    validate.addEventListener("click", async () => {
      setButtonLoading(validate, true, "확인 중...");
      try {
        const candidate = normalizeApiKey(input.value || "");
        const result = await verifyUserApiKeyCandidate(candidate);
        renderValidationStatus(result, false);
        if (!result.aborted) {
          setRuntimeStatus(result.valid ? "API 키 유효성 확인 완료" : "API 키 유효성 확인 실패", result.valid ? "good" : "warning");
        }
      } finally {
        setButtonLoading(validate, false, "확인 중...");
      }
    });
  }

  if (toggle && input) {
    toggle.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      toggle.textContent = isPassword ? "숨기기" : "보기";
    });
  }

  if (clear && input) {
    clear.addEventListener("click", () => {
      clearScheduledKeyValidation();
      abortInFlightKeyValidation();
      clearUserApiKey();
      input.value = "";
      input.type = "password";
      if (toggle) toggle.textContent = "보기";
      state.lastValidatedCandidate = "";
      state.lastValidationResult = null;
      refreshUserApiKeyStatus();
      setRuntimeStatus("저장된 개인 API 키를 삭제했습니다.", "good");
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (save) setButtonLoading(save, true, "저장 중...");
    try {
      clearScheduledKeyValidation();
      const candidate = normalizeApiKey(input?.value || "");

      if (!isLikelyOpenAIKey(candidate)) {
        updateUserApiKeyStatus("유효한 OpenAI API 키 형식이 아닙니다. `sk-`로 시작하는 키를 확인해 주세요.", "warning");
        return;
      }

      const result = await verifyUserApiKeyCandidate(candidate);
      if (!result.valid) {
        renderValidationStatus(result, false);
        return;
      }

      saveUserApiKey(candidate);
      if (input) {
        input.value = "";
        input.type = "password";
      }
      if (toggle) toggle.textContent = "보기";
      renderValidationStatus(result, { saved: true });
      setRuntimeStatus("개인 API 키 저장이 완료되었습니다.", "good");
    } finally {
      if (save) setButtonLoading(save, false, "저장 중...");
    }
  });

  refreshUserApiKeyStatus();
}

async function requestAI(payload) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("오프라인 상태입니다. 네트워크 연결을 확인해 주세요.");
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (state.userApiKey) {
    headers["X-User-OpenAI-Key"] = state.userApiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  let response = null;
  try {
    response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
    }
    throw new Error("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    clearTimeout(timeout);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const requestId = response.headers.get("x-request-id") || "";
    const errorMessage = (data && (data.error || data.detail)) || `요청에 실패했습니다. (${response.status})`;
    throw new Error(requestId ? `${errorMessage} [request:${requestId}]` : errorMessage);
  }

  if (!data || typeof data !== "object") {
    throw new Error("응답 형식이 올바르지 않습니다.");
  }

  return data;
}

function getKstDateKey() {
  const now = new Date();
  const kstOffset = 9 * 60;
  const localOffset = now.getTimezoneOffset();
  const kstTime = new Date(now.getTime() + (kstOffset + localOffset) * 60000);
  return kstTime.toISOString().slice(0, 10);
}

function updateStreakOnSuccess() {
  const today = getKstDateKey();
  const lastDate = localStorage.getItem("theSaviorLastCheckin") || "";
  const current = Number(localStorage.getItem("theSaviorStreak") || "0");

  let next = current;
  if (!lastDate) {
    next = 1;
  } else if (lastDate === today) {
    next = current;
  } else {
    const dayGap = Math.floor((Date.parse(today) - Date.parse(lastDate)) / 86400000);
    next = dayGap === 1 ? current + 1 : 1;
  }

  localStorage.setItem("theSaviorStreak", String(next));
  localStorage.setItem("theSaviorLastCheckin", today);

  const streakCount = $("streakCount");
  if (streakCount) streakCount.textContent = String(next);
}

function loadStreak() {
  const streakCount = $("streakCount");
  if (!streakCount) return;
  streakCount.textContent = localStorage.getItem("theSaviorStreak") || "0";
}

function setupCheckinForm() {
  const form = $("checkinForm");
  const output = $("checkinOutput");
  const submit = form ? form.querySelector("button[type='submit']") : null;
  if (!form || !output || !submit) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.checkinBusy) return;

    const mood = safeText($("mood")?.value || "");
    const stress = safeText($("stress")?.value || "5");
    const note = safeText($("checkinNote")?.value || "");

    state.checkinBusy = true;
    setButtonLoading(submit, true, "생성 중...");
    renderResult(output, "생성 중입니다...");
    try {
      const result = await requestAI({
        mode: "checkin",
        mood,
        stress,
        note
      });
      const reply = applyFallbackDecoration(result.reply || "결과가 비어 있습니다.", result);
      renderResult(output, reply);
      persistResultSnapshot({ checkinText: reply });
      recordCheckinHistoryEntry({
        mood,
        stress,
        fallback: Boolean(result && result.fallback)
      });
      renderInsights();
      updateStreakOnSuccess();
      applyRuntimeStatusFromResult(result, "체크인 루틴이 생성되었습니다.");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown";
      renderResult(output, `오류: ${messageText}`);
      setRuntimeStatus(`체크인 요청 실패: ${messageText}`, "error");
    } finally {
      state.checkinBusy = false;
      setButtonLoading(submit, false, "생성 중...");
    }
  });
}

function addBubble(role, text) {
  const chatBox = $("chatBox");
  if (!chatBox) return;

  const bubble = document.createElement("article");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function updateChatMeta() {
  const meta = $("chatMeta");
  if (!meta) return;
  const turns = state.chatHistory.length;
  meta.textContent = turns > 0 ? `최근 대화 ${turns}턴` : "최근 대화 없음";
}

function restoreChatUi() {
  const chatBox = $("chatBox");
  if (!chatBox) return;
  chatBox.innerHTML = "";

  if (!state.chatHistory.length) {
    addBubble(
      "assistant",
      "오늘 마음 상태를 짧게 알려주세요. 지금 가능한 안정 루틴을 함께 정리해 드릴게요."
    );
    return;
  }

  state.chatHistory.forEach((turn) => {
    addBubble(turn.role, turn.content);
  });
}

function setupChatForm() {
  const form = $("chatForm");
  const input = $("chatInput");
  const submit = form ? form.querySelector("button[type='submit']") : null;
  const clear = $("clearChatBtn");
  if (!form || !input || !submit) return;

  state.chatHistory = restoreChatHistory();
  restoreChatUi();
  updateChatMeta();
  updateCounter("chatInput", "chatInputCount");

  if (clear) {
    clear.addEventListener("click", () => {
      state.chatHistory = [];
      clearChatHistoryStorage();
      restoreChatUi();
      updateChatMeta();
      setRuntimeStatus("대화 기록을 초기화했습니다.", "good");
    });
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.chatBusy) return;

    const message = safeText(input.value);
    if (!message) return;
    state.chatBusy = true;
    setButtonLoading(submit, true, "응답 생성 중...");

    addBubble("user", message);
    state.chatHistory.push({ role: "user", content: message });
    state.chatHistory = state.chatHistory.slice(-8);
    persistChatHistory();
    updateChatMeta();
    input.value = "";
    updateCounter("chatInput", "chatInputCount");

    addBubble("assistant", "생각을 정리 중입니다...");
    const waitingBubble = $("chatBox")?.lastElementChild;

    try {
      const result = await requestAI({
        mode: "coach",
        message,
        history: state.chatHistory
      });

      const reply = applyFallbackDecoration(result.reply || "응답이 비어 있습니다.", result);
      if (waitingBubble) waitingBubble.textContent = reply;
      state.chatHistory.push({ role: "assistant", content: reply });
      state.chatHistory = state.chatHistory.slice(-8);
      persistChatHistory();
      updateChatMeta();
      incrementActivityCounter("chat");
      renderInsights();
      applyRuntimeStatusFromResult(result, "AI 코치 응답이 준비되었습니다.");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown";
      if (waitingBubble) {
        waitingBubble.textContent = `오류: ${messageText}`;
      }
      setRuntimeStatus(`대화 요청 실패: ${messageText}`, "error");
    } finally {
      state.chatBusy = false;
      setButtonLoading(submit, false, "응답 생성 중...");
    }
  });
}

function setupQuickPrompts() {
  const promptButtons = document.querySelectorAll(".quick-prompt");
  const input = $("chatInput");
  if (!promptButtons.length || !input) return;

  promptButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const message = safeText(button.getAttribute("data-message") || "");
      if (!message) return;
      input.value = message;
      updateCounter("chatInput", "chatInputCount");
      input.focus();
      setRuntimeStatus("빠른 프롬프트가 입력되었습니다. 바로 전송할 수 있습니다.", "good");
    });
  });
}

function applyHeroGroundingPreset(key, { scroll = true } = {}) {
  const preset = HERO_GROUNDING_CASES[key];
  const summary = $("heroGroundingSummary");
  const mood = $("mood");
  const stress = $("stress");
  const note = $("checkinNote");
  if (!preset || !summary || !mood || !stress || !note) return;

  mood.value = preset.mood;
  stress.value = String(preset.stress);
  note.value = preset.note;
  summary.textContent = preset.summary;
  const stressValue = $("stressValue");
  if (stressValue) stressValue.textContent = String(preset.stress);
  fillText("heroGroundingMood", `감정 · ${preset.mood}`);
  fillText("heroGroundingStress", `스트레스 · ${preset.stress}/10`);
  fillText("heroGroundingPrompt", preset.note);
  document.querySelectorAll("[data-grounding-case]").forEach((item) => {
    item.classList.toggle("is-active", safeText(item.getAttribute("data-grounding-case") || "") === key);
  });
  updateCounter("checkinNote", "checkinNoteCount");
  if (scroll) {
    $("checkin")?.scrollIntoView({ behavior: "smooth", block: "start" });
    note.focus();
    setRuntimeStatus("체크인 시작값을 채웠습니다. 메모를 다듬고 바로 안정 루틴을 받아보세요.", "good");
  }
}

function setupHeroGrounding() {
  const buttons = document.querySelectorAll("[data-grounding-case]");
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = safeText(button.getAttribute("data-grounding-case") || "");
      applyHeroGroundingPreset(key);
    });
  });

  applyHeroGroundingPreset("presentation", { scroll: false });
}

function setupJournalForm() {
  const form = $("journalForm");
  const input = $("journalInput");
  const output = $("journalOutput");
  const submit = form ? form.querySelector("button[type='submit']") : null;
  if (!form || !input || !output || !submit) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.journalBusy) return;

    const entry = safeText(input.value);
    if (!entry) return;

    state.journalBusy = true;
    setButtonLoading(submit, true, "분석 중...");
    renderResult(output, "저널을 분석 중입니다...");

    try {
      const result = await requestAI({
        mode: "journal",
        entry
      });
      const reply = applyFallbackDecoration(result.reply || "결과가 비어 있습니다.", result);
      renderResult(output, reply);
      persistResultSnapshot({ journalText: reply });
      incrementActivityCounter("journal");
      renderInsights();
      applyRuntimeStatusFromResult(result, "저널 인사이트가 생성되었습니다.");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown";
      renderResult(output, `오류: ${messageText}`);
      setRuntimeStatus(`저널 요청 실패: ${messageText}`, "error");
    } finally {
      state.journalBusy = false;
      setButtonLoading(submit, false, "분석 중...");
    }
  });
}

function toClock(total) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function breathPhase(secondIndex) {
  const cycle = secondIndex % 14;
  if (cycle < 4) return "들이마시기";
  if (cycle < 8) return "머무르기";
  return "내쉬기";
}

function renderTimer() {
  const timerText = $("timerText");
  const phaseText = $("phaseText");
  if (timerText) timerText.textContent = toClock(state.remainingSeconds);
  if (phaseText) phaseText.textContent = state.remainingSeconds <= 0 ? "완료" : breathPhase(state.breathTick);
}

function stopTimer() {
  if (!state.timerHandle) return;
  clearInterval(state.timerHandle);
  state.timerHandle = null;
}

function setupTimer() {
  const start = $("startTimer");
  const pause = $("pauseTimer");
  const reset = $("resetTimer");
  if (!start || !pause || !reset) return;

  renderTimer();

  start.addEventListener("click", () => {
    if (state.timerHandle) return;

    state.timerHandle = setInterval(() => {
      state.remainingSeconds -= 1;
      state.breathTick += 1;
      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = 0;
        stopTimer();
      }
      renderTimer();
    }, 1000);
  });

  pause.addEventListener("click", () => {
    stopTimer();
  });

  reset.addEventListener("click", () => {
    stopTimer();
    state.remainingSeconds = state.totalSeconds;
    state.breathTick = 0;
    renderTimer();
  });
}

function enableAdsense(config) {
  const { adsenseClient, adsenseSlots } = config;
  if (!adsenseClient || state.adsEnabled) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);

  document.querySelectorAll(".adsbygoogle").forEach((unit) => {
    const position = unit.getAttribute("data-position");
    const slot = position === "bottom" ? adsenseSlots.bottom : adsenseSlots.top;
    if (!slot) return;

    unit.setAttribute("data-ad-client", adsenseClient);
    unit.setAttribute("data-ad-slot", slot);
    unit.setAttribute("data-ad-format", "auto");
    unit.setAttribute("data-full-width-responsive", "true");
    unit.classList.add("ad-live");

    try {
      // eslint-disable-next-line no-undef
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.error("AdSense render error", error);
    }
  });

  state.adsEnabled = true;
}

function getAdsConsent() {
  return localStorage.getItem("theSaviorAdsConsent");
}

function setAdsConsent(value) {
  localStorage.setItem("theSaviorAdsConsent", value);
}

function dismissConsentBanner(banner) {
  if (!banner) return;
  banner.hidden = true;
  banner.style.display = "none";
}

function setupConsentBanner(config) {
  const banner = $("consentBanner");
  if (!banner) return;

  const accept = $("consentAccept");
  const reject = $("consentReject");

  banner.style.display = "";
  banner.hidden = false;

  if (banner.dataset.bound === "1") return;
  banner.dataset.bound = "1";

  if (accept) {
    accept.addEventListener("click", (event) => {
      event.preventDefault();
      setAdsConsent("accepted");
      dismissConsentBanner(banner);
      enableAdsense(config);
    });
  }

  if (reject) {
    reject.addEventListener("click", (event) => {
      event.preventDefault();
      setAdsConsent("rejected");
      dismissConsentBanner(banner);
    });
  }
}

function applyAdsPolicy(config) {
  if (!config.adsenseClient) return;

  const consent = getAdsConsent();
  if (consent === "accepted") {
    enableAdsense(config);
    return;
  }

  if (consent === "rejected") {
    return;
  }

  setupConsentBanner(config);
}

async function loadHealth() {
  try {
    const response = await fetch(apiUrl("/api/health"), { method: "GET" });
    if (!response.ok) {
      state.backendReachable = false;
      applyAiAvailability();
      return;
    }

    const payload = await response.json();
    if (!payload || payload.status !== "ok") {
      state.backendReachable = false;
      applyAiAvailability();
      return;
    }

    state.backendReachable = true;
    applyAiAvailability();

    const build = payload.build || {};
    const branch = safeText(build.branch || "");
    const commit = safeText(build.commit || "");
    if (branch || commit) {
      const label = $("apiBaseStatus");
      if (label) {
        const extra = `${branch || "branch?"}${commit ? `@${commit}` : ""}`;
        label.textContent = `API 기준 주소: ${state.apiBase || "(미설정)"} · build ${extra}`;
      }
    }
  } catch {
    state.backendReachable = false;
    applyAiAvailability();
  }
}

async function loadRuntimeBrief() {
  setBriefBadge("brief-loading", "warning");
  try {
    const response = await fetch(apiUrl("/api/runtime-brief"), { method: "GET" });
    if (!response.ok) {
      renderRuntimeBrief(null);
      return;
    }

    const payload = await response.json();
    renderRuntimeBrief(payload);
  } catch {
    renderRuntimeBrief(null);
  }
}

async function loadReviewPack() {
  try {
    const response = await fetch(apiUrl("/api/review-pack"), { method: "GET" });
    if (!response.ok) {
      renderReviewPack(null);
      return;
    }

    const payload = await response.json();
    renderReviewPack(payload);
  } catch {
    renderReviewPack(null);
  }
}

async function loadConfig() {
  if (!state.apiBase) {
    state.backendReachable = false;
    refreshUserApiKeyStatus();
    renderRuntimeBrief(null);
    renderReviewPack(null);
    applyAiAvailability();
    return;
  }

  try {
    const response = await fetch(apiUrl("/api/config"), { method: "GET" });
    if (!response.ok) {
      state.backendReachable = false;
      refreshUserApiKeyStatus();
      renderRuntimeBrief(null);
      renderReviewPack(null);
      applyAiAvailability();
      return;
    }

    const config = await response.json();
    const resolvedFromConfig = safeText(config.apiBaseUrl || "").replace(/\/+$/, "");
    if (resolvedFromConfig && state.apiBase !== resolvedFromConfig) {
      const isNative = Boolean(
        window.Capacitor &&
          typeof window.Capacitor.isNativePlatform === "function" &&
          window.Capacitor.isNativePlatform()
      );
      if (!state.apiBase || isNative) {
        state.apiBase = resolvedFromConfig;
      }
    }
    setApiBaseStatus();

    state.adConfig = config;
    state.hasServerApiKey = Boolean(config.hasServerApiKey);
    state.llmProviderPreference = safeText(config.llmProviderPreference || "auto").toLowerCase() || "auto";
    state.ollamaEnabled = Boolean(config.ollamaEnabled);
    state.ollamaModel = safeText(config.ollamaModel || "");
    refreshUserApiKeyStatus();
    applyAdsPolicy(config);
    state.backendReachable = true;
    if (state.userApiKey || state.hasServerApiKey || state.ollamaEnabled) {
      setRuntimeStatus("AI 응답 준비 완료", "good");
    } else {
      setRuntimeStatus("API 키가 없어 AI 기능이 제한됩니다.", "warning");
    }
    applyAiAvailability();
    loadHealth();
    loadRuntimeBrief();
    loadReviewPack();
  } catch (error) {
    console.error("Config load failed", error);
    state.backendReachable = false;
    refreshUserApiKeyStatus();
    renderRuntimeBrief(null);
    renderReviewPack(null);
    applyAiAvailability();
  }
}

function setupRevealAnimation() {
  const elements = document.querySelectorAll(".reveal");
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
        }
      });
    },
    { threshold: 0.1 }
  );

  elements.forEach((element) => observer.observe(element));
}

function restoreSessionSnapshots() {
  const { checkinText, journalText } = restoreResultSnapshot();
  if (checkinText) {
    renderResult($("checkinOutput"), checkinText);
  }
  if (journalText) {
    renderResult($("journalOutput"), journalText);
  }
}

function setupCopyButtons() {
  const copyCheckinBtn = $("copyCheckinBtn");
  const copyJournalBtn = $("copyJournalBtn");
  const copyRuntimeBriefBtn = $("copyRuntimeBriefBtn");
  const copyReviewRoutesBtn = $("copyReviewRoutesBtn");
  const copyReviewPackBtn = $("copyReviewPackBtn");
  const copyProviderPostureBtn = $("copyProviderPostureBtn");
  const copyCrisisSnapshotBtn = $("copyCrisisSnapshotBtn");
  const copyReviewerBundleBtn = $("copyReviewerBundleBtn");
  const checkinOutput = $("checkinOutput");
  const journalOutput = $("journalOutput");

  if (copyCheckinBtn && checkinOutput) {
    copyCheckinBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(checkinOutput.textContent || "");
      setRuntimeStatus(ok ? "체크인 결과를 복사했습니다." : "체크인 결과 복사에 실패했습니다.", ok ? "good" : "warning");
    });
  }

  if (copyJournalBtn && journalOutput) {
    copyJournalBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(journalOutput.textContent || "");
      setRuntimeStatus(ok ? "저널 결과를 복사했습니다." : "저널 결과 복사에 실패했습니다.", ok ? "good" : "warning");
    });
  }

  if (copyRuntimeBriefBtn) {
    copyRuntimeBriefBtn.addEventListener("click", async () => {
      const payload = state.runtimeBrief
        ? JSON.stringify(state.runtimeBrief, null, 2)
        : "";
      const ok = await copyTextToClipboard(payload);
      setRuntimeStatus(ok ? "Runtime brief를 복사했습니다." : "Runtime brief 복사에 실패했습니다.", ok ? "good" : "warning");
    });
  }

  if (copyReviewRoutesBtn) {
    copyReviewRoutesBtn.addEventListener("click", async () => {
      const routes = state.reviewPack?.proof_bundle?.review_routes || [];
      const payload = ["the-savior review routes", ...routes.map((item) => `- ${item}`)].join("\n");
      const ok = await copyTextToClipboard(payload);
      setRuntimeStatus(ok ? "Review routes를 복사했습니다." : "Review routes 복사에 실패했습니다.", ok ? "good" : "warning");
    });
  }

  if (copyReviewPackBtn) {
    copyReviewPackBtn.addEventListener("click", async () => {
      const payload = state.reviewPack
        ? JSON.stringify(state.reviewPack, null, 2)
        : "";
      const ok = await copyTextToClipboard(payload);
      setRuntimeStatus(ok ? "Review pack을 복사했습니다." : "Review pack 복사에 실패했습니다.", ok ? "good" : "warning");
    });
  }

  if (copyProviderPostureBtn) {
    copyProviderPostureBtn.addEventListener("click", copyProviderPostureSnapshot);
  }

  if (copyCrisisSnapshotBtn) {
    copyCrisisSnapshotBtn.addEventListener("click", copyCrisisSnapshot);
  }

  if (copyReviewerBundleBtn) {
    copyReviewerBundleBtn.addEventListener("click", copyReviewerBundle);
  }
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function setupDataActions() {
  const exportBtn = $("exportDataBtn");
  const resetBtn = $("resetDataBtn");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        profile: {
          hasUserApiKey: Boolean(state.userApiKey),
          userApiKeyStorage: state.userApiKey ? "session" : "none",
          apiBase: state.apiBase || ""
        },
        streak: {
          count: localStorage.getItem("theSaviorStreak") || "0",
          lastDate: localStorage.getItem("theSaviorLastCheckin") || ""
        },
        checkinHistory: getCheckinHistory(),
        activitySummary: getActivitySummary(),
        chatHistory: restoreChatHistory(),
        snapshots: restoreResultSnapshot(),
        adsConsent: getAdsConsent() || ""
      };

      const dateKey = new Date().toISOString().slice(0, 10);
      downloadJsonFile(`the-savior-data-${dateKey}.json`, payload);
      setRuntimeStatus("내 데이터 파일을 다운로드했습니다.", "good");
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const confirmed = window.confirm(
        "로컬 데이터(체크인 기록/대화 기록/저널 결과/API 키 포함)를 초기화할까요?"
      );
      if (!confirmed) return;

      removeStorage(localStorage, "theSaviorStreak");
      removeStorage(localStorage, "theSaviorLastCheckin");
      removeStorage(localStorage, "theSaviorAdsConsent");
      removeStorage(localStorage, CHECKIN_HISTORY_STORAGE_KEY);
      removeStorage(localStorage, ACTIVITY_SUMMARY_STORAGE_KEY);
      removeStorage(sessionStorage, CHECKIN_OUTPUT_SESSION_KEY);
      removeStorage(sessionStorage, JOURNAL_OUTPUT_SESSION_KEY);
      clearChatHistoryStorage();
      clearUserApiKey();

      const keyInput = $("userApiKeyInput");
      const toggle = $("toggleUserApiKeyBtn");
      if (keyInput) {
        keyInput.value = "";
        keyInput.type = "password";
      }
      if (toggle) toggle.textContent = "보기";

      state.lastValidatedCandidate = "";
      state.lastValidationResult = null;
      state.chatHistory = [];
      restoreChatUi();
      updateChatMeta();
      loadStreak();
      renderInsights();
      refreshUserApiKeyStatus();
      renderResult($("checkinOutput"), "입력 후 결과가 여기에 표시됩니다.");
      renderResult($("journalOutput"), "저널을 입력하면 결과가 여기에 표시됩니다.");
      setRuntimeStatus("로컬 사용자 데이터가 초기화되었습니다.", "good");
    });
  }
}

function setupNetworkStatus() {
  const sync = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setRuntimeStatus("오프라인 상태입니다. 네트워크를 확인해 주세요.", "error");
    }
  };

  window.addEventListener("online", () => {
    setRuntimeStatus("네트워크 연결이 복구되었습니다.", "good");
    loadConfig();
  });
  window.addEventListener("offline", () => {
    setRuntimeStatus("오프라인 상태입니다. 네트워크를 확인해 주세요.", "error");
  });
  sync();
}

function init() {
  const runtimeConnection = resolveRuntimeConnection();
  state.apiBase = runtimeConnection.apiBase;
  state.apiMisconfigured = runtimeConnection.apiMisconfigured;
  state.backendReachable = runtimeConnection.backendReachable;
  state.reviewOnly = runtimeConnection.reviewOnly;
  state.userApiKey = getStoredUserApiKey();
  setRuntimeStatus("서비스 구성 정보를 확인 중입니다.", "warning");
  setApiBaseStatus();
  renderFirstSessionGuide();
  setCurrentYear();
  setStressPreview();
  setupCharacterCounters();
  loadStreak();
  renderInsights();
  restoreSessionSnapshots();
  setupCopyButtons();
  setupKeyboardShortcuts();
  setupDataActions();
  setupUserApiKeyForm();
  setupCheckinForm();
  setupChatForm();
  setupQuickPrompts();
  setupHeroGrounding();
  setupJournalForm();
  setupTimer();
  setupRevealAnimation();
  setupNetworkStatus();
  applyAiAvailability();
  loadConfig();
}

document.addEventListener("DOMContentLoaded", init);
