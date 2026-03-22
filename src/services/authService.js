import bcrypt from "bcryptjs";
import User from "../models/User.js";
import env from "../config/env.js";
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
