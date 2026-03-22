import EmailVerificationToken from "../models/EmailVerificationToken.js";
import User from "../models/User.js";
import env from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import { createRandomToken, hashValue } from "../utils/securityCrypto.js";
import { sendEmail } from "./emailService.js";
import { consumeOneTimeToken } from "./replayProtectionService.js";
import { logSecurityEvent } from "./securityEventService.js";

const buildVerificationUrl = (rawToken) => {
  const separator = env.emailVerificationUrlBase.includes("?") ? "&" : "?";
  return `${env.emailVerificationUrlBase}${separator}token=${encodeURIComponent(rawToken)}`;
};

const verificationExpiryDate = () => new Date(Date.now() + env.emailVerificationTokenExpiresMinutes * 60 * 1000);

export const sendVerificationEmail = async (user, req = null) => {
  if (!user || user.emailVerified) {
    return { sent: false };
  }

  await EmailVerificationToken.deleteMany({ user: user.id, usedAt: null });

  const rawToken = createRandomToken(32);
  const tokenHash = hashValue(rawToken);

  await EmailVerificationToken.create({
    user: user.id,
    tokenHash,
    expiresAt: verificationExpiryDate()
  });

  const verificationUrl = buildVerificationUrl(rawToken);
  await sendEmail({
    to: user.email,
    subject: "VoteHub email verification",
    text: `Verify your VoteHub account using this link: ${verificationUrl}`,
    html: `<p>Verify your VoteHub account:</p><p><a href="${verificationUrl}">Verify Email</a></p>`
  });

  logSecurityEvent("verification_email_sent", req, { userId: user.id }, "info");
  return { sent: true };
};

export const verifyEmailByToken = async (rawToken, req = null) => {
  const tokenHash = hashValue(rawToken);
  const tokenRecord = await EmailVerificationToken.findOne({ tokenHash }).populate("user");

  if (!tokenRecord) {
    logSecurityEvent("suspicious_verification_token_usage", req, { reason: "token_not_found" });
    logSecurityEvent("email_verification_failed", req, { reason: "token_not_found" });
    throw new ApiError(400, "Invalid or expired verification token", "INVALID_VERIFICATION_TOKEN");
  }

  if (tokenRecord.usedAt) {
    logSecurityEvent("suspicious_verification_token_usage", req, { reason: "token_reused" });
    logSecurityEvent("email_verification_failed", req, { reason: "token_reused", userId: tokenRecord.user?.id });
    throw new ApiError(400, "Verification token has already been used", "VERIFICATION_TOKEN_USED");
  }

  if (tokenRecord.expiresAt <= new Date()) {
    logSecurityEvent("email_verification_failed", req, { reason: "token_expired", userId: tokenRecord.user?.id });
    throw new ApiError(400, "Invalid or expired verification token", "VERIFICATION_TOKEN_EXPIRED");
  }

  try {
    await consumeOneTimeToken({
      tokenValue: tokenHash,
      tokenType: "email_verification",
      expiresAt: tokenRecord.expiresAt
    });
  } catch (error) {
    if (error.code === "REPLAY_DETECTED") {
      logSecurityEvent("suspicious_verification_token_usage", req, { reason: "replay_detected" });
      throw new ApiError(400, "Verification token has already been used", "VERIFICATION_TOKEN_USED");
    }
    throw error;
  }

  const user = tokenRecord.user;
  if (!user) {
    logSecurityEvent("email_verification_failed", req, { reason: "user_not_found" });
    throw new ApiError(400, "Invalid verification state", "INVALID_VERIFICATION_STATE");
  }

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  tokenRecord.usedAt = new Date();
  await tokenRecord.save();
  await EmailVerificationToken.deleteMany({ user: user.id, _id: { $ne: tokenRecord.id } });

  logSecurityEvent("email_verification_success", req, { userId: user.id }, "info");
  return user;
};

export const resendVerificationEmail = async (email, req = null) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { requested: true };
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user || user.emailVerified) {
    return { requested: true };
  }

  await sendVerificationEmail(user, req);
  return { requested: true };
};
