import { RateLimiterMemory } from "rate-limiter-flexible";
import env from "../config/env.js";
import { logSecurityEvent } from "./securityEventService.js";
import { ApiError } from "../utils/apiError.js";

const failedLoginLimiter = new RateLimiterMemory({
  points: env.loginMaxFailedAttempts,
  duration: env.loginLockWindowSeconds,
  blockDuration: env.loginLockWindowSeconds
});

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || "unknown-ip";
};
const blockedUntilByIp = new Map();

export const assertLoginAllowed = async (req) => {
  const ip = getClientIp(req);
  const blockedUntil = blockedUntilByIp.get(ip);

  if (blockedUntil && blockedUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((blockedUntil - Date.now()) / 1000);
    logSecurityEvent("login_block_active", req, { retryAfterSeconds });
    throw new ApiError(
      429,
      `Too many failed login attempts. Retry in ${retryAfterSeconds} seconds.`,
      "LOGIN_BLOCKED",
      { retryAfterSeconds }
    );
  }

  if (blockedUntil && blockedUntil <= Date.now()) {
    blockedUntilByIp.delete(ip);
  }

  const consumed = await failedLoginLimiter.get(ip);
  if (!consumed) {
    return;
  }

  if (consumed.consumedPoints >= env.loginMaxFailedAttempts && consumed.msBeforeNext > 0) {
    const retryAfterSeconds = Math.ceil(consumed.msBeforeNext / 1000);
    blockedUntilByIp.set(ip, Date.now() + env.loginLockWindowSeconds * 1000);
    logSecurityEvent("login_block_active", req, { retryAfterSeconds });
    throw new ApiError(
      429,
      `Too many failed login attempts. Retry in ${retryAfterSeconds} seconds.`,
      "LOGIN_BLOCKED",
      { retryAfterSeconds }
    );
  }
};

export const recordFailedLogin = async (req, email) => {
  const ip = getClientIp(req);
  try {
    await failedLoginLimiter.consume(ip);
    const consumed = await failedLoginLimiter.get(ip);

    if (consumed?.consumedPoints >= env.loginMaxFailedAttempts) {
      const retryAfterSeconds = env.loginLockWindowSeconds;
      blockedUntilByIp.set(ip, Date.now() + retryAfterSeconds * 1000);
      await failedLoginLimiter.delete(ip);

      logSecurityEvent("login_rate_limit_triggered", req, {
        email,
        retryAfterSeconds
      });

      throw new ApiError(
        429,
        `Too many failed login attempts. Retry in ${retryAfterSeconds} seconds.`,
        "LOGIN_RATE_LIMITED",
        { retryAfterSeconds }
      );
    }

    logSecurityEvent("failed_login_attempt", req, {
      email,
      consumedPoints: consumed?.consumedPoints || 0,
      remainingPoints: consumed ? Math.max(env.loginMaxFailedAttempts - consumed.consumedPoints, 0) : 0
    });
  } catch (rateLimitResponse) {
    if (rateLimitResponse instanceof ApiError) {
      throw rateLimitResponse;
    }

    const retryAfterSeconds = Math.ceil((rateLimitResponse.msBeforeNext || 0) / 1000);
    blockedUntilByIp.set(ip, Date.now() + env.loginLockWindowSeconds * 1000);
    logSecurityEvent("login_rate_limit_triggered", req, {
      email,
      retryAfterSeconds
    });
    throw new ApiError(
      429,
      `Too many failed login attempts. Retry in ${retryAfterSeconds} seconds.`,
      "LOGIN_RATE_LIMITED",
      { retryAfterSeconds }
    );
  }
};

export const resetFailedLogins = async (req) => {
  const ip = getClientIp(req);
  blockedUntilByIp.delete(ip);
  await failedLoginLimiter.delete(ip);
};
