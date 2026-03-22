import User from "../models/User.js";
import { authenticateUser, issueLoginPayload, registerUser } from "../services/authService.js";
import { recordFailedLogin, resetFailedLogins } from "../services/loginAttemptService.js";
import { logSecurityEvent } from "../services/securityEventService.js";
import env from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { clearAuthCookies, createCsrfToken, setAuthCookies, setCsrfCookie } from "../utils/authCookies.js";

const buildAuthResponse = (payload, csrfToken) => ({
  user: payload.user,
  ...(env.enableCookieAuth ? { csrfToken } : {}),
  ...(!env.enableCookieAuth ? { accessToken: payload.accessToken } : {})
});

export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;
  const payload = await registerUser({ fullName, email, password, role: "voter" });
  const csrfToken = env.enableCookieAuth ? createCsrfToken() : null;

  if (env.enableCookieAuth) {
    setAuthCookies(res, payload.accessToken, csrfToken);
  }

  res.status(201).json({
    success: true,
    data: buildAuthResponse(payload, csrfToken),
    requestId: req.id
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticateUser({ email, password });

  if (!user) {
    await recordFailedLogin(req, email);
    throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  await resetFailedLogins(req);
  const payload = issueLoginPayload(user);
  const csrfToken = env.enableCookieAuth ? createCsrfToken() : null;

  if (env.enableCookieAuth) {
    setAuthCookies(res, payload.accessToken, csrfToken);
  }

  logSecurityEvent("login_success", req, { userId: user.id }, "info");

  res.status(200).json({
    success: true,
    data: buildAuthResponse(payload, csrfToken),
    requestId: req.id
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new ApiError(404, "User not found", "USER_NOT_FOUND");
  }

  res.status(200).json({
    success: true,
    data: {
      user: user.toSafeObject()
    },
    requestId: req.id
  });
});

export const logout = asyncHandler(async (req, res) => {
  clearAuthCookies(res);

  logSecurityEvent("logout_success", req, {}, "info");

  res.status(200).json({
    success: true,
    data: {
      message: "Logged out successfully"
    },
    requestId: req.id
  });
});

export const issueCsrfToken = asyncHandler(async (req, res) => {
  if (!env.enableCookieAuth) {
    throw new ApiError(400, "CSRF token endpoint is only required for cookie auth mode", "CSRF_NOT_REQUIRED");
  }

  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);

  res.status(200).json({
    success: true,
    data: {
      csrfToken
    },
    requestId: req.id
  });
});
