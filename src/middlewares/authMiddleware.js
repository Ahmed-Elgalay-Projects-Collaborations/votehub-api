import User from "../models/User.js";
import env from "../config/env.js";
import { logSecurityEvent } from "../services/securityEventService.js";
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
    const user = await User.findById(payload.sub).select("_id email role isActive");

    if (!user || !user.isActive) {
      logSecurityEvent("invalid_token_user", req, { sub: payload.sub });
      throw new ApiError(401, "Invalid authentication context", "INVALID_TOKEN_CONTEXT");
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role
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
