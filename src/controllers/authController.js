import User from "../models/User.js";
import { authenticateUser, issueLoginPayload, recordSuccessfulLoginContext, registerUser } from "../services/authService.js";
import { verifyEmailByToken, resendVerificationEmail, sendVerificationEmail } from "../services/emailVerificationService.js";
import { getFailedLoginAttempts, recordFailedLogin, resetFailedLogins } from "../services/loginAttemptService.js";
import {
  assertOtpAttemptAllowed,
  buildOtpChallenge,
  disableOtpForUser,
  hasOtpSecretConfigured,
  isOtpRequired,
  recordFailedOtpAttempt,
  resetOtpAttempts,
  resolveUserFromOtpChallenge,
  startOtpSetup,
  verifyOtpCodeForLogin,
  verifyOtpSetup
} from "../services/otpService.js";
import { issueAdminStepUpToken } from "../services/adminStepUpService.js";
import { consumeOneTimeToken } from "../services/replayProtectionService.js";
import { clearRiskForPrincipal, evaluateLoginRisk, isRiskBlocked } from "../services/riskScoringService.js";
import { verifyAuditLogIntegrity } from "../services/auditLogService.js";
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

const finalizeAuthenticatedSession = (res, payload) => {
  const csrfToken = env.enableCookieAuth ? createCsrfToken() : null;

  if (env.enableCookieAuth) {
    setAuthCookies(res, payload.accessToken, csrfToken);
  }

  return buildAuthResponse(payload, csrfToken);
};

const resolveOtpActor = async (req) => {
  if (req.user?.id) {
    const user = await User.findById(req.user.id).select("+otpSecretEncrypted +otpTempSecretEncrypted +otpRecoveryCodes +password");
    if (!user) {
      throw new ApiError(404, "User not found", "USER_NOT_FOUND");
    }
    return { user, fromChallenge: false, challengePayload: null };
  }

  const challengeToken = req.body.challengeToken;
  if (!challengeToken) {
    throw new ApiError(401, "Authentication or OTP challenge token is required", "OTP_CONTEXT_REQUIRED");
  }

  const { user, payload } = await resolveUserFromOtpChallenge(challengeToken);
  return { user, fromChallenge: true, challengePayload: payload };
};

export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;
  const payload = await registerUser({ fullName, email, password, role: "voter" });

  await sendVerificationEmail({ id: payload.user.id, email: payload.user.email, emailVerified: false }, req);

  res.status(201).json({
    success: true,
    data: {
      user: payload.user,
      message: "Registration successful. Please verify your email before login."
    },
    requestId: req.id
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const token = req.query.token;
  if (!token) {
    throw new ApiError(400, "Verification token is required", "VERIFICATION_TOKEN_REQUIRED");
  }

  await verifyEmailByToken(token, req);

  res.status(200).json({
    success: true,
    data: {
      message: "Email verified successfully."
    },
    requestId: req.id
  });
});

export const resendVerification = asyncHandler(async (req, res) => {
  await resendVerificationEmail(req.body.email, req);

  res.status(200).json({
    success: true,
    data: {
      message: "If the account exists and is unverified, a verification email has been sent."
    },
    requestId: req.id
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticateUser({ email, password });

  if (!user) {
    const candidate = await User.findOne({ email: String(email || "").trim().toLowerCase() }).select("role");
    await recordFailedLogin(req, email, { isAdmin: candidate?.role === "admin" });
    throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (!user.emailVerified) {
    logSecurityEvent("unverified_login_attempt", req, { userId: user.id });
    throw new ApiError(403, "Please verify your email before logging in", "EMAIL_NOT_VERIFIED");
  }

  const riskBlock = isRiskBlocked({ ip: req.ip, userId: user.id });
  if (riskBlock.blocked) {
    logSecurityEvent("risk_block_triggered", req, {
      scope: "login",
      retryAfterSeconds: riskBlock.retryAfterSeconds
    });
    throw new ApiError(429, `Temporarily blocked due to suspicious activity. Retry in ${riskBlock.retryAfterSeconds} seconds.`, "RISK_BLOCKED", {
      retryAfterSeconds: riskBlock.retryAfterSeconds
    });
  }

  const failedAttempts = getFailedLoginAttempts(req, email);
  const risk = evaluateLoginRisk({
    user,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    failedAttempts
  });

  await resetFailedLogins(req, email);

  const requiresRiskStepUp = ["medium", "high", "critical"].includes(risk.level);
  const otpRequired = isOtpRequired(user) || requiresRiskStepUp;
  if (otpRequired) {
    const hasOtpSecret = hasOtpSecretConfigured(user);
    const setupRequired = !hasOtpSecret;

    if (user.role === "admin" && setupRequired) {
      logSecurityEvent("admin_login_without_otp_attempt", req, { userId: user.id });
    }

    if (requiresRiskStepUp) {
      logSecurityEvent("risk_based_auth_escalation", req, {
        userId: user.id,
        riskLevel: risk.level,
        riskScore: risk.score
      });
    }

    const otpChallengeToken = buildOtpChallenge(user, setupRequired);

    res.status(200).json({
      success: true,
      data: {
        otpRequired: true,
        otpSetupRequired: setupRequired,
        riskLevel: risk.level,
        otpChallengeToken
      },
      requestId: req.id
    });
    return;
  }

  const payload = issueLoginPayload(user);
  const authResponse = finalizeAuthenticatedSession(res, payload);
  await recordSuccessfulLoginContext(user, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"]
  });
  clearRiskForPrincipal({ ip: req.ip, userId: user.id });

  logSecurityEvent("login_success", req, { userId: user.id }, "info");

  res.status(200).json({
    success: true,
    data: authResponse,
    requestId: req.id
  });
});

export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { otpChallengeToken, otpCode, recoveryCode } = req.body;
  let challengeContext;
  try {
    challengeContext = await resolveUserFromOtpChallenge(otpChallengeToken);
  } catch (error) {
    if (error.code === "REPLAY_DETECTED") {
      logSecurityEvent("otp_challenge_replay_detected", req, { scope: "login" });
    }
    throw error;
  }

  const { user, payload: challengePayload } = challengeContext;
  await assertOtpAttemptAllowed(user.id);

  try {
    await verifyOtpCodeForLogin(user, otpCode, recoveryCode);
  } catch (error) {
    logSecurityEvent("otp_failed_attempt", req, { userId: user.id });
    try {
      await recordFailedOtpAttempt(user.id);
    } catch (rateLimitedError) {
      logSecurityEvent("login_rate_limit_triggered", req, { scope: "otp", userId: user.id });
      throw rateLimitedError;
    }
    throw error;
  }

  await resetOtpAttempts(user.id);
  try {
    await consumeOneTimeToken({
      tokenValue: challengePayload.jti,
      tokenType: `otp_challenge:${user.id}`,
      expiresAt: challengePayload.exp ? new Date(challengePayload.exp * 1000) : null
    });
  } catch (error) {
    if (error.code === "REPLAY_DETECTED") {
      logSecurityEvent("otp_challenge_replay_detected", req, { scope: "login_post_verify" });
    }
    throw error;
  }

  const payload = issueLoginPayload(user);
  const authResponse = finalizeAuthenticatedSession(res, payload);
  await recordSuccessfulLoginContext(user, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"]
  });
  clearRiskForPrincipal({ ip: req.ip, userId: user.id });

  logSecurityEvent("login_success", req, { userId: user.id, method: "otp" }, "info");

  res.status(200).json({
    success: true,
    data: authResponse,
    requestId: req.id
  });
});

export const startOtpEnrollment = asyncHandler(async (req, res) => {
  const { user } = await resolveOtpActor(req);
  const enrollment = await startOtpSetup(user);

  res.status(200).json({
    success: true,
    data: enrollment,
    requestId: req.id
  });
});

export const verifyOtpEnrollment = asyncHandler(async (req, res) => {
  let otpActor;
  try {
    otpActor = await resolveOtpActor(req);
  } catch (error) {
    if (error.code === "REPLAY_DETECTED") {
      logSecurityEvent("otp_challenge_replay_detected", req, { scope: "setup" });
    }
    throw error;
  }

  const { user, fromChallenge, challengePayload } = otpActor;
  const { otpCode } = req.body;

  let setupResult;
  try {
    setupResult = await verifyOtpSetup(user, otpCode);
  } catch (error) {
    logSecurityEvent("otp_failed_attempt", req, { userId: user.id, context: "setup" });
    throw error;
  }

  logSecurityEvent("otp_enabled", req, { userId: user.id }, "info");

  if (fromChallenge) {
    try {
      await consumeOneTimeToken({
        tokenValue: challengePayload?.jti || req.body.challengeToken,
        tokenType: `otp_challenge:${user.id}`,
        expiresAt: challengePayload?.exp ? new Date(challengePayload.exp * 1000) : null
      });
    } catch (error) {
      if (error.code === "REPLAY_DETECTED") {
        logSecurityEvent("otp_challenge_replay_detected", req, { scope: "setup_post_verify" });
      }
      throw error;
    }

    const payload = issueLoginPayload(user);
    const authResponse = finalizeAuthenticatedSession(res, payload);
    await recordSuccessfulLoginContext(user, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    clearRiskForPrincipal({ ip: req.ip, userId: user.id });

    res.status(200).json({
      success: true,
      data: {
        ...authResponse,
        recoveryCodes: setupResult.recoveryCodes
      },
      requestId: req.id
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      message: "OTP has been enabled successfully.",
      recoveryCodes: setupResult.recoveryCodes
    },
    requestId: req.id
  });
});

export const disableOtp = asyncHandler(async (req, res) => {
  const { currentPassword, otpCode, recoveryCode } = req.body;
  const user = await User.findById(req.user.id).select("+password +otpSecretEncrypted +otpRecoveryCodes");

  if (!user) {
    throw new ApiError(404, "User not found", "USER_NOT_FOUND");
  }

  const passwordMatches = await user.comparePassword(currentPassword);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  try {
    await verifyOtpCodeForLogin(user, otpCode, recoveryCode);
  } catch (error) {
    logSecurityEvent("otp_failed_attempt", req, { userId: user.id, context: "disable" });
    throw error;
  }

  await disableOtpForUser(user);
  logSecurityEvent("otp_disabled", req, { userId: user.id }, "info");

  res.status(200).json({
    success: true,
    data: {
      message: "OTP disabled successfully."
    },
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

export const issueAdminStepUp = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Admin privileges are required", "ADMIN_REQUIRED");
  }

  const { currentPassword, otpCode, recoveryCode } = req.body;
  const user = await User.findById(req.user.id).select("+password +otpSecretEncrypted +otpRecoveryCodes");

  if (!user) {
    throw new ApiError(404, "User not found", "USER_NOT_FOUND");
  }

  const passwordMatches = await user.comparePassword(currentPassword);
  if (!passwordMatches) {
    logSecurityEvent("admin_step_up_failed", req, { reason: "invalid_password" });
    throw new ApiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  try {
    await verifyOtpCodeForLogin(user, otpCode, recoveryCode);
  } catch (error) {
    logSecurityEvent("admin_step_up_failed", req, { reason: "invalid_otp" });
    throw error;
  }

  const stepUpToken = issueAdminStepUpToken(user);

  logSecurityEvent("admin_step_up_issued", req, { userId: user.id }, "info");

  res.status(200).json({
    success: true,
    data: {
      stepUpToken,
      expiresIn: env.adminStepUpExpiresIn
    },
    requestId: req.id
  });
});

export const verifyAuditChain = asyncHandler(async (req, res) => {
  const result = await verifyAuditLogIntegrity();
  logSecurityEvent("audit_chain_verified", req, { valid: result.valid }, "info");

  res.status(200).json({
    success: true,
    data: {
      integrity: result
    },
    requestId: req.id
  });
});
