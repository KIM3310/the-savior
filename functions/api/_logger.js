/**
 * Structured logging module for The Savior runtime.
 *
 * Replaces raw console.log with level-aware, JSON-structured log entries
 * suitable for Cloudflare Workers observability and external log drains.
 *
 * @module _logger
 */

/**
 * @typedef {"debug" | "info" | "warn" | "error"} LogLevel
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} timestamp - ISO 8601 timestamp.
 * @property {LogLevel} level - Severity level.
 * @property {string} service - Always "the-savior".
 * @property {string} [requestId] - Correlation ID for the current request.
 * @property {string} [scope] - Logical scope (e.g. "chat", "health", "security").
 * @property {string} message - Human-readable log message.
 * @property {Record<string, unknown>} [data] - Structured payload for machine consumption.
 * @property {number} [durationMs] - Optional elapsed time in milliseconds.
 */

/** @type {Record<LogLevel, number>} */
const LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Resolve the minimum log level from the environment.
 * Defaults to "info" in production, "debug" when LOG_LEVEL is explicitly set.
 *
 * @param {Record<string, string>} [env]
 * @returns {LogLevel}
 */
function resolveMinLevel(env) {
  const raw = String(env?.LOG_LEVEL || "")
    .trim()
    .toLowerCase();
  if (raw in LEVEL_PRIORITY) return /** @type {LogLevel} */ (raw);
  return "info";
}

/**
 * Sanitize a value so it never contains API key fragments in log output.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function redactSecrets(value) {
  if (typeof value === "string") {
    return value.replace(/sk-[A-Za-z0-9_-]{10,}/g, "sk-***REDACTED***");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    /** @type {Record<string, unknown>} */
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      cleaned[k] = redactSecrets(v);
    }
    return cleaned;
  }
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  return value;
}

/**
 * Build a structured log entry.
 *
 * @param {LogLevel} level
 * @param {string} message
 * @param {Object} [options]
 * @param {string} [options.requestId]
 * @param {string} [options.scope]
 * @param {Record<string, unknown>} [options.data]
 * @param {number} [options.durationMs]
 * @returns {LogEntry}
 */
function buildEntry(level, message, options = {}) {
  /** @type {LogEntry} */
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "the-savior",
    message
  };
  if (options.requestId) entry.requestId = options.requestId;
  if (options.scope) entry.scope = options.scope;
  if (options.data) entry.data = /** @type {Record<string, unknown>} */ (redactSecrets(options.data));
  if (typeof options.durationMs === "number") entry.durationMs = options.durationMs;
  return entry;
}

/**
 * Emit a log entry to the appropriate console method.
 *
 * @param {LogEntry} entry
 */
function emit(entry) {
  const serialized = JSON.stringify(entry);
  switch (entry.level) {
    case "error":
      // biome-ignore lint/suspicious/noConsole: structured runtime logs must reach the platform sink
      console.error(serialized);
      break;
    case "warn":
      // biome-ignore lint/suspicious/noConsole: structured runtime logs must reach the platform sink
      console.warn(serialized);
      break;
    case "debug":
      // biome-ignore lint/suspicious/noConsole: structured runtime logs must reach the platform sink
      console.debug(serialized);
      break;
    default:
      // biome-ignore lint/suspicious/noConsole: structured runtime logs must reach the platform sink
      console.info(serialized);
  }
}

/**
 * Create a scoped logger instance bound to a specific request context.
 *
 * @param {Object} [context]
 * @param {string} [context.requestId] - Correlation ID for the request.
 * @param {string} [context.scope] - Logical scope name.
 * @param {Record<string, string>} [context.env] - Environment bindings.
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function, time: Function }}
 */
export function createLogger(context = {}) {
  const minLevel = resolveMinLevel(context.env);
  const minPriority = LEVEL_PRIORITY[minLevel];
  const defaults = {
    requestId: context.requestId || "",
    scope: context.scope || ""
  };

  /**
   * Log at the given level if it meets the minimum threshold.
   *
   * @param {LogLevel} level
   * @param {string} message
   * @param {Record<string, unknown>} [data]
   */
  function log(level, message, data) {
    if (LEVEL_PRIORITY[level] < minPriority) return;
    const entry = buildEntry(level, message, {
      ...defaults,
      data
    });
    emit(entry);
  }

  return {
    /**
     * Log a debug-level message.
     * @param {string} message
     * @param {Record<string, unknown>} [data]
     */
    debug(message, data) {
      log("debug", message, data);
    },

    /**
     * Log an info-level message.
     * @param {string} message
     * @param {Record<string, unknown>} [data]
     */
    info(message, data) {
      log("info", message, data);
    },

    /**
     * Log a warn-level message.
     * @param {string} message
     * @param {Record<string, unknown>} [data]
     */
    warn(message, data) {
      log("warn", message, data);
    },

    /**
     * Log an error-level message.
     * @param {string} message
     * @param {Record<string, unknown>} [data]
     */
    error(message, data) {
      log("error", message, data);
    },

    /**
     * Start a timer and return a function to log the elapsed duration.
     *
     * @param {string} label - Description of the operation being timed.
     * @returns {(data?: Record<string, unknown>) => void} Call to emit the timing log.
     */
    time(label) {
      const start = Date.now();
      return (data) => {
        const durationMs = Date.now() - start;
        const entry = buildEntry("info", label, {
          ...defaults,
          data,
          durationMs
        });
        if (LEVEL_PRIORITY.info >= minPriority) {
          emit(entry);
        }
      };
    }
  };
}

/**
 * Redact secrets from a string value (exported for testing).
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export { redactSecrets };
