import User from "../models/User.js";
import env from "../config/env.js";
import { logSecurityEvent } from "../services/securityEventService.js";
import { isRiskBlocked } from "../services/riskScoringService.js";
import { ApiError } from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.js";

const getBearerToken = (authorizationHeader = "") => {
  if (!authorizationHeader.startsWith("Bearer ")) {
    return null;
  }
  return authorizationHeader.slice(7).trim();
};

const getRequestToken = (req) => {
  if (env.enableCookieAuth) {
    const cookieToken = req.cookies?.[env.authCookieName];
    if (cookieToken) {
      return cookieToken;
    }
  }

  return getBearerToken(req.headers.authorization);
};

const resolveAuthenticatedUser = async (req, token) => {
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select("_id email role isActive emailVerified otpEnabled canCreatePolls");

    if (!user || !user.isActive) {
      logSecurityEvent("invalid_token_user", req, { sub: payload.sub });
      throw new ApiError(401, "Invalid authentication context", "INVALID_TOKEN_CONTEXT");
    }

    if (!user.emailVerified) {
      logSecurityEvent("unverified_user_access_attempt", req, { sub: payload.sub });
      throw new ApiError(403, "Email verification is required", "EMAIL_NOT_VERIFIED");
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      canCreatePolls: user.role === "admin" ? true : Boolean(user.canCreatePolls),
      emailVerified: user.emailVerified,
      otpEnabled: user.otpEnabled || user.role === "admin"
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logSecurityEvent("token_validation_failed", req, { reason: error.message });
    throw new ApiError(401, "Invalid or expired token", "TOKEN_INVALID");
  }
};

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = getRequestToken(req);
  if (!token) {
    logSecurityEvent("missing_auth_token", req, {}, "info");
    throw new ApiError(401, "Authentication required", "AUTH_REQUIRED");
  }

  await resolveAuthenticatedUser(req, token);

  const userBlocked = isRiskBlocked({ ip: req.ip, userId: req.user.id });
  const ipBlocked = isRiskBlocked({ ip: req.ip });
  const blocked = userBlocked.blocked ? userBlocked : ipBlocked;

  if (blocked.blocked) {
    const scope = userBlocked.blocked ? "user" : "ip";
    logSecurityEvent("risk_block_triggered", req, {
      scope,
      retryAfterSeconds: blocked.retryAfterSeconds
    });
    throw new ApiError(429, `Access temporarily blocked. Retry in ${blocked.retryAfterSeconds} seconds.`, "RISK_BLOCKED", {
      retryAfterSeconds: blocked.retryAfterSeconds
    });
  }

  return next();
});

export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = getRequestToken(req);
  if (!token) {
    return next();
  }

  await resolveAuthenticatedUser(req, token);
  return next();
});

export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required", "AUTH_REQUIRED"));
  }

  if (!allowedRoles.includes(req.user.role)) {
    logSecurityEvent("forbidden_resource_access", req, {
      role: req.user.role,
      allowedRoles
    });
    return next(new ApiError(403, "Forbidden", "FORBIDDEN"));
  }

  return next();
};

export const requirePollCreator = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required", "AUTH_REQUIRED"));
  }

  if (req.user.role === "admin" || req.user.canCreatePolls) {
    return next();
  }

  logSecurityEvent("forbidden_poll_creation_access", req, {
    role: req.user.role,
    canCreatePolls: req.user.canCreatePolls
  });
  return next(new ApiError(403, "Poll creation permission is required", "POLL_CREATION_FORBIDDEN"));
};
