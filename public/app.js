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
  adConfig: null,
  userApiKey: "",
  userApiKeyPersistent: false,
  hasServerApiKey: false,
  llmProviderPreference: "auto",
  ollamaEnabled: false,
  ollamaModel: "",
  keyValidationTimer: null,
  keyValidationAbort: null,
  keyValidationSeq: 0,
  lastValidatedCandidate: "",
  lastValidationResult: null
};

const USER_API_KEY_STORAGE_KEY = "theSaviorUserOpenAIKey";
const USER_API_KEY_SESSION_STORAGE_KEY = "theSaviorUserOpenAIKeySession";
const USER_API_KEY_PERSIST_FLAG_KEY = "theSaviorRememberUserOpenAIKey";
const CHAT_HISTORY_SESSION_KEY = "theSaviorChatHistory";
const CHECKIN_OUTPUT_SESSION_KEY = "theSaviorCheckinOutput";
const JOURNAL_OUTPUT_SESSION_KEY = "theSaviorJournalOutput";
const CHECKIN_HISTORY_STORAGE_KEY = "theSaviorCheckinHistory";
const ACTIVITY_SUMMARY_STORAGE_KEY = "theSaviorActivitySummary";
const DEFAULT_NATIVE_API_BASE = "https://the-savior-9z8.pages.dev";
const AI_REQUEST_TIMEOUT_MS = 25_000;

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
    return DEFAULT_NATIVE_API_BASE;
  }

  if (window.location && /^https?:$/i.test(window.location.protocol)) {
    return window.location.origin.replace(/\/+$/, "");
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
  label.textContent = `API 기준 주소: ${state.apiBase || "(미설정)"}`;
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

function getPersistPreference() {
  return readStorage(localStorage, USER_API_KEY_PERSIST_FLAG_KEY) === "1";
}

function getStoredUserApiKey() {
  const sessionKey = normalizeApiKey(readStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY));
  if (sessionKey) {
    state.userApiKeyPersistent = getPersistPreference();
    return sessionKey;
  }

  const shouldPersist = getPersistPreference();
  const localKey = normalizeApiKey(readStorage(localStorage, USER_API_KEY_STORAGE_KEY));
  if (localKey && shouldPersist) {
    writeStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY, localKey);
    state.userApiKeyPersistent = true;
    return localKey;
  }

  if (localKey) {
    // Legacy migration: previously persisted keys are downgraded to session-only by default.
    writeStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY, localKey);
    removeStorage(localStorage, USER_API_KEY_STORAGE_KEY);
    state.userApiKeyPersistent = false;
    return localKey;
  }

  state.userApiKeyPersistent = false;
  return "";
}

function saveUserApiKey(value, { persistent = false } = {}) {
  const key = normalizeApiKey(value);
  if (!key) return;

  writeStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY, key);
  if (persistent) {
    writeStorage(localStorage, USER_API_KEY_STORAGE_KEY, key);
    writeStorage(localStorage, USER_API_KEY_PERSIST_FLAG_KEY, "1");
  } else {
    removeStorage(localStorage, USER_API_KEY_STORAGE_KEY);
    removeStorage(localStorage, USER_API_KEY_PERSIST_FLAG_KEY);
  }

  state.userApiKey = key;
  state.userApiKeyPersistent = persistent;
}

function clearUserApiKey() {
  removeStorage(sessionStorage, USER_API_KEY_SESSION_STORAGE_KEY);
  removeStorage(localStorage, USER_API_KEY_STORAGE_KEY);
  removeStorage(localStorage, USER_API_KEY_PERSIST_FLAG_KEY);
  state.userApiKey = "";
  state.userApiKeyPersistent = false;
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
    const persistenceLabel = state.userApiKeyPersistent ? "이 브라우저에 저장됨" : "현재 세션에서만 사용";
    updateUserApiKeyStatus(`개인 API 키 사용 중 (${maskApiKey(state.userApiKey)} · ${persistenceLabel})`, "good");
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
  const persistent = Boolean(typeof options === "object" ? options.persistent : false);

  if (result.valid && result.usable) {
    const suffix = saved ? (persistent ? " 이 브라우저에 저장되었습니다." : " 현재 세션에 저장되었습니다.") : "";
    updateUserApiKeyStatus((result.message || "유효한 API 키입니다.") + suffix, "good");
    return;
  }

  if (result.valid && !result.usable) {
    const suffix = saved
      ? persistent
        ? " 키는 저장되었지만 결제/한도 확인이 필요합니다."
        : " 키는 세션에 저장되었지만 결제/한도 확인이 필요합니다."
      : "";
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
  const remember = $("rememberUserApiKey");
  const save = $("saveUserApiKeyBtn");
  const validate = $("validateUserApiKeyBtn");
  const toggle = $("toggleUserApiKeyBtn");
  const clear = $("clearUserApiKeyBtn");

  if (remember) {
    remember.checked = state.userApiKeyPersistent;
  }

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
      if (remember) remember.checked = false;
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

      const persistent = Boolean(remember && remember.checked);
      saveUserApiKey(candidate, { persistent });
      if (input) {
        input.value = "";
        input.type = "password";
      }
      if (toggle) toggle.textContent = "보기";
      renderValidationStatus(result, { saved: true, persistent });
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
      return;
    }

    const payload = await response.json();
    if (!payload || payload.status !== "ok") return;

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
    // Ignore health check errors. Config status already covers user-facing state.
  }
}

async function loadConfig() {
  try {
    const response = await fetch(apiUrl("/api/config"), { method: "GET" });
    if (!response.ok) {
      refreshUserApiKeyStatus();
      setRuntimeStatus("서비스 구성 정보를 불러오지 못했습니다.", "error");
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
    if (state.userApiKey || state.hasServerApiKey || state.ollamaEnabled) {
      setRuntimeStatus("AI 응답 준비 완료", "good");
    } else {
      setRuntimeStatus("API 키가 없어 AI 기능이 제한됩니다.", "warning");
    }
    loadHealth();
  } catch (error) {
    console.error("Config load failed", error);
    refreshUserApiKeyStatus();
    setRuntimeStatus("네트워크 오류로 구성 로드에 실패했습니다.", "error");
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
          userApiKeyPersistent: Boolean(state.userApiKeyPersistent),
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
      const remember = $("rememberUserApiKey");
      const toggle = $("toggleUserApiKeyBtn");
      if (keyInput) {
        keyInput.value = "";
        keyInput.type = "password";
      }
      if (remember) remember.checked = false;
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
  state.apiBase = resolveApiBase();
  state.userApiKey = getStoredUserApiKey();
  setRuntimeStatus("서비스 구성 정보를 확인 중입니다.", "warning");
  setApiBaseStatus();
  setCurrentYear();
  setStressPreview();
  setupCharacterCounters();
  loadStreak();
  renderInsights();
  restoreSessionSnapshots();
  setupCopyButtons();
  setupDataActions();
  setupUserApiKeyForm();
  setupCheckinForm();
  setupChatForm();
  setupQuickPrompts();
  setupJournalForm();
  setupTimer();
  setupRevealAnimation();
  setupNetworkStatus();
  loadConfig();
}

document.addEventListener("DOMContentLoaded", init);
