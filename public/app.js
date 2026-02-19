const state = {
  chatHistory: [],
  totalSeconds: 180,
  remainingSeconds: 180,
  timerHandle: null,
  breathTick: 0,
  adsEnabled: false,
  apiBase: "",
  adConfig: null,
  userApiKey: "",
  hasServerApiKey: false,
  keyValidationTimer: null,
  keyValidationAbort: null,
  keyValidationSeq: 0,
  lastValidatedCandidate: "",
  lastValidationResult: null
};

const USER_API_KEY_STORAGE_KEY = "theSaviorUserOpenAIKey";

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

function resolveApiBase() {
  const runtime = window.THE_SAVIOR_RUNTIME || {};
  const configured = safeText(runtime.apiBaseUrl || "");
  const hasCapacitor = Boolean(
    window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform()
  );

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (hasCapacitor) {
    return "https://the-savior.pages.dev";
  }

  return "";
}

function apiUrl(path) {
  return `${state.apiBase}${path}`;
}

function renderResult(element, text) {
  if (!element) return;
  element.textContent = text;
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

function getStoredUserApiKey() {
  return normalizeApiKey(localStorage.getItem(USER_API_KEY_STORAGE_KEY) || "");
}

function saveUserApiKey(value) {
  const key = normalizeApiKey(value);
  if (!key) return;
  localStorage.setItem(USER_API_KEY_STORAGE_KEY, key);
  state.userApiKey = key;
}

function clearUserApiKey() {
  localStorage.removeItem(USER_API_KEY_STORAGE_KEY);
  state.userApiKey = "";
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
    updateUserApiKeyStatus(`개인 API 키 사용 중 (${maskApiKey(state.userApiKey)})`, "good");
    return;
  }

  if (state.hasServerApiKey) {
    updateUserApiKeyStatus("개인 API 키가 없어 서버 기본 키로 동작합니다.", "default");
    return;
  }

  updateUserApiKeyStatus("개인 API 키를 저장해야 AI 기능이 동작합니다.", "warning");
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

function renderValidationStatus(result, saved = false) {
  if (!result || result.aborted) return;

  if (result.valid && result.usable) {
    const suffix = saved ? " 저장되었습니다." : "";
    updateUserApiKeyStatus((result.message || "유효한 API 키입니다.") + suffix, "good");
    return;
  }

  if (result.valid && !result.usable) {
    const suffix = saved ? " 키는 저장되었지만 결제/한도 확인이 필요합니다." : "";
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
      const candidate = normalizeApiKey(input.value || "");
      const result = await verifyUserApiKeyCandidate(candidate);
      renderValidationStatus(result, false);
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
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
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
    renderValidationStatus(result, true);
  });

  refreshUserApiKeyStatus();
}

async function requestAI(payload) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (state.userApiKey) {
    headers["X-User-OpenAI-Key"] = state.userApiKey;
  }

  const response = await fetch(apiUrl("/api/chat"), {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.error || "요청에 실패했습니다.");
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
  if (!form || !output) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mood = safeText($("mood")?.value || "");
    const stress = safeText($("stress")?.value || "5");
    const note = safeText($("checkinNote")?.value || "");

    renderResult(output, "생성 중입니다...");
    try {
      const result = await requestAI({
        mode: "checkin",
        mood,
        stress,
        note
      });
      renderResult(output, result.reply || "결과가 비어 있습니다.");
      updateStreakOnSuccess();
    } catch (error) {
      renderResult(output, `오류: ${error instanceof Error ? error.message : "unknown"}`);
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

function setupChatForm() {
  const form = $("chatForm");
  const input = $("chatInput");
  if (!form || !input) return;

  addBubble(
    "assistant",
    "오늘 마음 상태를 짧게 알려주세요. 지금 가능한 안정 루틴을 함께 정리해 드릴게요."
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = safeText(input.value);
    if (!message) return;

    addBubble("user", message);
    state.chatHistory.push({ role: "user", content: message });
    input.value = "";

    addBubble("assistant", "생각을 정리 중입니다...");
    const waitingBubble = $("chatBox")?.lastElementChild;

    try {
      const result = await requestAI({
        mode: "coach",
        message,
        history: state.chatHistory
      });

      const reply = result.reply || "응답이 비어 있습니다.";
      if (waitingBubble) waitingBubble.textContent = reply;
      state.chatHistory.push({ role: "assistant", content: reply });
      state.chatHistory = state.chatHistory.slice(-8);
    } catch (error) {
      if (waitingBubble) {
        waitingBubble.textContent = `오류: ${error instanceof Error ? error.message : "unknown"}`;
      }
    }
  });
}

function setupJournalForm() {
  const form = $("journalForm");
  const input = $("journalInput");
  const output = $("journalOutput");
  if (!form || !input || !output) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const entry = safeText(input.value);
    if (!entry) return;

    renderResult(output, "저널을 분석 중입니다...");

    try {
      const result = await requestAI({
        mode: "journal",
        entry
      });
      renderResult(output, result.reply || "결과가 비어 있습니다.");
    } catch (error) {
      renderResult(output, `오류: ${error instanceof Error ? error.message : "unknown"}`);
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

async function loadConfig() {
  try {
    const response = await fetch(apiUrl("/api/config"), { method: "GET" });
    if (!response.ok) {
      refreshUserApiKeyStatus();
      return;
    }

    const config = await response.json();
    state.adConfig = config;
    state.hasServerApiKey = Boolean(config.hasServerApiKey);
    refreshUserApiKeyStatus();
    applyAdsPolicy(config);
  } catch (error) {
    console.error("Config load failed", error);
    refreshUserApiKeyStatus();
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

function init() {
  state.apiBase = resolveApiBase();
  state.userApiKey = getStoredUserApiKey();
  setCurrentYear();
  setStressPreview();
  loadStreak();
  setupUserApiKeyForm();
  setupCheckinForm();
  setupChatForm();
  setupJournalForm();
  setupTimer();
  setupRevealAnimation();
  loadConfig();
}

document.addEventListener("DOMContentLoaded", init);
