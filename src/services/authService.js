import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import env from "../config/env.js";
import { appendAuditLog } from "./auditLogService.js";
import { ApiError } from "../utils/apiError.js";
import { signAccessToken } from "../utils/jwt.js";
import { appLogger } from "../config/logger.js";

const buildAuthPayload = (user) => ({
  accessToken: signAccessToken({
    sub: user.id,
    role: user.role
  }),
  user: user.toSafeObject()
});

export const registerUser = async ({ fullName, email, password, role = "voter" }) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "Email is already registered", "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    fullName,
    email,
    password: passwordHash,
    role,
    emailVerified: false
  });

  return buildAuthPayload(user);
};

export const authenticateUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select("+password +otpSecretEncrypted +otpTempSecretEncrypted +otpRecoveryCodes");

  if (!user || !user.isActive) {
    return null;
  }

  const isValidPassword = await user.comparePassword(password);
  if (!isValidPassword) {
    return null;
  }

  return user;
};

export const issueLoginPayload = (user) => buildAuthPayload(user);

export const recordSuccessfulLoginContext = async (user, { ipAddress, userAgent }) => {
  user.lastLoginAt = new Date();
  user.lastLoginIp = ipAddress || null;
  user.lastLoginUserAgent = userAgent || null;
  await user.save();
};

export const ensureDefaultAdmin = async () => {
  if (!env.defaultAdminEmail || !env.defaultAdminPassword) {
    return;
  }

  const existingAdmin = await User.findOne({ email: env.defaultAdminEmail });
  if (existingAdmin) {
    return;
  }

  const passwordHash = await bcrypt.hash(env.defaultAdminPassword, 12);
  await User.create({
    fullName: "VoteHub Admin",
    email: env.defaultAdminEmail,
    password: passwordHash,
    role: "admin",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    otpEnabled: true
  });

  appLogger.warn("Default admin account created from environment variables");
};

export const setUserPollCreationPermission = async ({ targetUserId, canCreatePolls, req = null }) => {
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw new ApiError(400, "Invalid user id", "INVALID_USER_ID");
  }

  const user = await User.findById(targetUserId);
  if (!user) {
    throw new ApiError(404, "User not found", "USER_NOT_FOUND");
  }

  if (user.role === "admin") {
    throw new ApiError(400, "Poll creation permission cannot be changed for admin users", "ADMIN_PERMISSION_IMMUTABLE");
  }

  user.canCreatePolls = Boolean(canCreatePolls);
  await user.save();

  await appendAuditLog({
    eventType: "admin.user_poll_permission_updated",
    req,
    actorId: req?.user?.id || null,
    actorRole: req?.user?.role || null,
    metadata: {
      targetUserId: user.id,
      canCreatePolls: user.canCreatePolls
    },
    signAction: true
  });

  return user.toSafeObject();
};
