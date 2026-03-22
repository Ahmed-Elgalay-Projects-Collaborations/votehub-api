import env from "../config/env.js";
import { logSecurityEvent } from "./securityEventService.js";
import { ApiError } from "../utils/apiError.js";

const attemptsByKey = new Map();

const normalizeEmail = (email = "") => String(email || "").trim().toLowerCase();

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || "unknown-ip";
};

const buildAttemptKey = (ip, email = "*") => `${ip}:${email || "*"}`;

const getOrCreateState = (key) => {
  const existing = attemptsByKey.get(key);
  if (existing) {
    return existing;
  }

  const created = {
    failedAt: [],
    blockedUntil: 0,
    breachCount: 0,
    lastFailureAt: 0
  };
  attemptsByKey.set(key, created);
  return created;
};

const pruneWindow = (state) => {
  const cutoff = Date.now() - env.loginLockWindowSeconds * 1000;
  state.failedAt = state.failedAt.filter((timestamp) => timestamp >= cutoff);

  if (state.lastFailureAt && Date.now() - state.lastFailureAt > env.loginLockMaxSeconds * 1000) {
    state.breachCount = 0;
  }
};

const calculateLockSeconds = (breachCount, isAdmin = false) => {
  const multiplier = 2 ** Math.max(breachCount - 1, 0);
  const baseLock = env.loginLockWindowSeconds * multiplier;
  const adminAdjusted = isAdmin ? baseLock * 2 : baseLock;
  return Math.min(adminAdjusted, env.loginLockMaxSeconds);
};

const getThreshold = (isAdmin = false) =>
  isAdmin ? Math.max(Math.floor(env.loginMaxFailedAttempts / 2), 5) : env.loginMaxFailedAttempts;

const assertStateAllowed = (state) => {
  if (!state.blockedUntil) {
    return;
  }

  if (state.blockedUntil <= Date.now()) {
    state.blockedUntil = 0;
    return;
  }

  const retryAfterSeconds = Math.ceil((state.blockedUntil - Date.now()) / 1000);
  throw new ApiError(429, `Too many failed login attempts. Retry in ${retryAfterSeconds} seconds.`, "LOGIN_BLOCKED", {
    retryAfterSeconds
  });
};

const getTrackedStates = (req, email) => {
  const ip = getClientIp(req);
  const normalizedEmail = normalizeEmail(email || req.body?.email);

  const keys = [buildAttemptKey(ip, "*")];
  if (normalizedEmail) {
    keys.push(buildAttemptKey(ip, normalizedEmail));
  }

  return { ip, normalizedEmail, keys, states: keys.map((key) => getOrCreateState(key)) };
};

const getHighestFailureCount = (states) => {
  if (!states.length) {
    return 0;
  }

  return Math.max(
    ...states.map((state) => {
      pruneWindow(state);
      return state.failedAt.length;
    })
  );
};

export const assertLoginAllowed = async (req, email = null) => {
  const { states } = getTrackedStates(req, email);

  for (const state of states) {
    try {
      assertStateAllowed(state);
    } catch (error) {
      if (error instanceof ApiError) {
        logSecurityEvent("login_block_active", req, { retryAfterSeconds: error.details?.retryAfterSeconds || 0 });
      }
      throw error;
    }
  }
};

export const recordFailedLogin = async (req, email, { isAdmin = false } = {}) => {
  const { normalizedEmail, states } = getTrackedStates(req, email);
  const threshold = getThreshold(isAdmin);

  for (const state of states) {
    pruneWindow(state);
    state.failedAt.push(Date.now());
    state.lastFailureAt = Date.now();

    if (state.failedAt.length >= threshold) {
      state.breachCount += 1;
      const lockSeconds = calculateLockSeconds(state.breachCount, isAdmin);
      state.blockedUntil = Date.now() + lockSeconds * 1000;
      state.failedAt = [];

      logSecurityEvent("login_rate_limit_triggered", req, {
        email: normalizedEmail || undefined,
        retryAfterSeconds: lockSeconds,
        breachCount: state.breachCount,
        progressive: true
      });

      throw new ApiError(429, `Too many failed login attempts. Retry in ${lockSeconds} seconds.`, "LOGIN_RATE_LIMITED", {
        retryAfterSeconds: lockSeconds
      });
    }
  }

  logSecurityEvent("failed_login_attempt", req, {
    email: normalizedEmail || undefined,
    consumedPoints: getHighestFailureCount(states),
    remainingPoints: Math.max(threshold - getHighestFailureCount(states), 0)
  });
};

export const resetFailedLogins = async (req, email = null) => {
  const { keys } = getTrackedStates(req, email);

  for (const key of keys) {
    attemptsByKey.delete(key);
  }
};

export const getFailedLoginAttempts = (req, email = null) => {
  const { states } = getTrackedStates(req, email);
  return getHighestFailureCount(states);
};
