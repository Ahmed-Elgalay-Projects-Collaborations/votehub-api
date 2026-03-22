import env from "../config/env.js";
import { logSecurityEvent } from "../services/securityEventService.js";
import { ApiError } from "../utils/apiError.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/resend-verification",
  "/api/v1/auth/otp/verify-login"
]);
const CHALLENGE_FLOW_PATHS = new Set(["/api/v1/auth/otp/setup", "/api/v1/auth/otp/verify-setup"]);

const normalizePath = (path = "") => (path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path);

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }
  return env.corsOrigins.includes(origin);
};

const getOriginFromReferer = (referer) => {
  try {
    return new URL(referer).origin;
  } catch (error) {
    return null;
  }
};

export const csrfHardeningMiddleware = (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin;
  const refererOrigin = req.headers.referer ? getOriginFromReferer(req.headers.referer) : null;
  const secFetchSite = req.headers["sec-fetch-site"];
  const hasAuthorization = Boolean(req.headers.authorization);

  if (secFetchSite === "cross-site" && hasAuthorization) {
    logSecurityEvent("csrf_hardening_blocked_request", req, {
      reason: "sec_fetch_cross_site"
    });
    return next(new ApiError(403, "Cross-site state-changing request blocked", "CSRF_BLOCKED"));
  }

  if (!isAllowedOrigin(origin) || !isAllowedOrigin(refererOrigin)) {
    logSecurityEvent("csrf_hardening_blocked_request", req, {
      origin,
      refererOrigin,
      reason: "origin_not_allowed"
    });
    return next(new ApiError(403, "Request origin is not allowed", "CSRF_ORIGIN_BLOCKED"));
  }

  if (!env.enableCookieAuth) {
    return next();
  }

  if (CSRF_EXEMPT_PATHS.has(normalizePath(req.path))) {
    return next();
  }

  if (CHALLENGE_FLOW_PATHS.has(normalizePath(req.path)) && req.body?.challengeToken) {
    return next();
  }

  const authCookieToken = req.cookies?.[env.authCookieName];
  if (!authCookieToken) {
    return next();
  }

  const csrfCookieToken = req.cookies?.[env.csrfCookieName];
  const csrfHeaderToken = req.headers["x-csrf-token"];

  if (!csrfCookieToken || !csrfHeaderToken || csrfCookieToken !== csrfHeaderToken) {
    logSecurityEvent("csrf_token_validation_failed", req, {
      hasCsrfCookie: Boolean(csrfCookieToken),
      hasCsrfHeader: Boolean(csrfHeaderToken)
    });
    return next(new ApiError(403, "Invalid or missing CSRF token", "CSRF_TOKEN_INVALID"));
  }

  return next();
};
