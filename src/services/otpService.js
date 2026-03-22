import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { RateLimiterMemory } from "rate-limiter-flexible";
import User from "../models/User.js";
import env from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import { createRandomToken, decryptSecret, encryptSecret, hashValue } from "../utils/securityCrypto.js";
import { signOtpChallengeToken, verifyOtpChallengeToken } from "../utils/jwt.js";
import { assertOneTimeTokenUnused } from "./replayProtectionService.js";

authenticator.options = {
  step: 30,
  digits: 6,
  window: 1
};

const otpAttemptLimiter = new RateLimiterMemory({
  points: env.otpMaxFailedAttempts,
  duration: env.otpLockWindowSeconds,
  blockDuration: env.otpLockWindowSeconds
});

const buildRecoveryCodes = async (count = 8) => {
  const plainCodes = Array.from({ length: count }, () => createRandomToken(4).toUpperCase());
  const hashedCodes = await Promise.all(plainCodes.map((code) => bcrypt.hash(hashValue(code), 12)));
  return { plainCodes, hashedCodes };
};

const verifyAndConsumeRecoveryCode = async (recoveryCode, user) => {
  if (!recoveryCode || !Array.isArray(user.otpRecoveryCodes) || user.otpRecoveryCodes.length === 0) {
    return false;
  }

  const hashedInput = hashValue(recoveryCode);
  for (let index = 0; index < user.otpRecoveryCodes.length; index += 1) {
    const isMatch = await bcrypt.compare(hashedInput, user.otpRecoveryCodes[index]);
    if (isMatch) {
      user.otpRecoveryCodes.splice(index, 1);
      await user.save();
      return true;
    }
  }

  return false;
};

export const isOtpRequired = (user) => user.role === "admin" || user.otpEnabled;

export const hasOtpSecretConfigured = (user) => Boolean(decryptSecret(user.otpSecretEncrypted));

export const buildOtpChallenge = (user, setupRequired = false) =>
  signOtpChallengeToken({
    sub: user.id,
    role: user.role,
    setupRequired
  });

export const resolveUserFromOtpChallenge = async (challengeToken) => {
  let payload;
  try {
    payload = verifyOtpChallengeToken(challengeToken);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired OTP challenge", "OTP_CHALLENGE_INVALID");
  }

  const user = await User.findById(payload.sub).select("+otpSecretEncrypted +otpTempSecretEncrypted +otpRecoveryCodes +password");
  if (!user || !user.isActive) {
    throw new ApiError(401, "Invalid OTP challenge context", "OTP_CHALLENGE_INVALID");
  }

  if (!payload.jti) {
    throw new ApiError(401, "Invalid OTP challenge context", "OTP_CHALLENGE_INVALID");
  }

  await assertOneTimeTokenUnused({
    tokenValue: payload.jti,
    tokenType: `otp_challenge:${payload.sub}`
  });

  return { user, payload };
};

export const startOtpSetup = async (user) => {
  const secret = authenticator.generateSecret();
  user.otpTempSecretEncrypted = encryptSecret(secret);
  await user.save();

  const otpauthUrl = authenticator.keyuri(user.email, env.otpIssuer, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    manualEntryKey: secret,
    otpauthUrl,
    qrCodeDataUrl
  };
};

export const verifyOtpSetup = async (user, otpCode) => {
  const tempSecret = decryptSecret(user.otpTempSecretEncrypted);
  if (!tempSecret) {
    throw new ApiError(400, "OTP setup was not started", "OTP_SETUP_NOT_STARTED");
  }

  const isValid = authenticator.check(otpCode, tempSecret);
  if (!isValid) {
    throw new ApiError(400, "Invalid OTP code", "OTP_INVALID");
  }

  const recoveryCodes = await buildRecoveryCodes();

  user.otpSecretEncrypted = encryptSecret(tempSecret);
  user.otpTempSecretEncrypted = "";
  user.otpEnabled = true;
  user.otpRecoveryCodes = recoveryCodes.hashedCodes;
  await user.save();

  return {
    recoveryCodes: recoveryCodes.plainCodes
  };
};

export const verifyOtpCodeForLogin = async (user, otpCode, recoveryCode) => {
  const secret = decryptSecret(user.otpSecretEncrypted);
  if (!secret) {
    throw new ApiError(400, "OTP is not configured for this account", "OTP_NOT_CONFIGURED");
  }

  if (otpCode && authenticator.check(otpCode, secret)) {
    return { success: true, usedRecoveryCode: false };
  }

  const recoverySuccess = await verifyAndConsumeRecoveryCode(recoveryCode, user);
  if (recoverySuccess) {
    return { success: true, usedRecoveryCode: true };
  }

  throw new ApiError(401, "Invalid OTP code", "OTP_INVALID");
};

export const disableOtpForUser = async (user) => {
  if (user.role === "admin") {
    throw new ApiError(403, "Admin accounts must keep OTP enabled", "ADMIN_OTP_MANDATORY");
  }

  user.otpEnabled = false;
  user.otpSecretEncrypted = "";
  user.otpTempSecretEncrypted = "";
  user.otpRecoveryCodes = [];
  await user.save();
};

export const assertOtpAttemptAllowed = async (userId) => {
  const state = await otpAttemptLimiter.get(String(userId));
  if (!state) {
    return;
  }

  if (state.consumedPoints >= env.otpMaxFailedAttempts && state.msBeforeNext > 0) {
    const retryAfterSeconds = Math.ceil(state.msBeforeNext / 1000);
    throw new ApiError(429, `Too many failed OTP attempts. Retry in ${retryAfterSeconds} seconds.`, "OTP_RATE_LIMITED", {
      retryAfterSeconds
    });
  }
};

export const recordFailedOtpAttempt = async (userId) => {
  try {
    await otpAttemptLimiter.consume(String(userId));
  } catch (rateLimitResponse) {
    const retryAfterSeconds = Math.ceil((rateLimitResponse.msBeforeNext || 0) / 1000);
    throw new ApiError(429, `Too many failed OTP attempts. Retry in ${retryAfterSeconds} seconds.`, "OTP_RATE_LIMITED", {
      retryAfterSeconds
    });
  }
};

export const resetOtpAttempts = async (userId) => {
  await otpAttemptLimiter.delete(String(userId));
};
