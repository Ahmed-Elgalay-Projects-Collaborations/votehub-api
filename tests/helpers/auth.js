import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import EmailVerificationToken from "../../src/models/EmailVerificationToken.js";
import User from "../../src/models/User.js";
import { createRandomToken, hashValue } from "../../src/utils/securityCrypto.js";
import { apiRequest } from "./client.js";

export const registerUser = (client, payload) =>
  apiRequest(client, "post", "/api/v1/auth/register", {
    body: payload
  });

export const createEmailVerificationTokenForUser = async (userId, expiresInMinutes = 60) => {
  const rawToken = createRandomToken(32);
  await EmailVerificationToken.create({
    user: userId,
    tokenHash: hashValue(rawToken),
    expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000)
  });

  return rawToken;
};

export const verifyEmailForUser = async (client, userId) => {
  const rawToken = await createEmailVerificationTokenForUser(userId);
  return apiRequest(client, "get", `/api/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}`);
};

export const registerAndVerifyUser = async (client, payload) => {
  const registerResponse = await registerUser(client, payload);
  const user = await User.findOne({ email: payload.email }).select("_id email");
  if (!user) {
    throw new Error("Unable to find newly registered user.");
  }

  const verifyResponse = await verifyEmailForUser(client, user.id);

  return {
    registerResponse,
    verifyResponse,
    user
  };
};

export const loginUser = (client, { email, password }) =>
  apiRequest(client, "post", "/api/v1/auth/login", {
    body: { email, password }
  });

export const createVerifiedSession = async (client, payload) => {
  await registerAndVerifyUser(client, payload);
  const loginResponse = await loginUser(client, payload);

  if (loginResponse.body?.data?.otpRequired) {
    throw new Error("Expected direct login session but OTP challenge was required.");
  }

  return {
    loginResponse,
    csrfToken: loginResponse.body?.data?.csrfToken || null
  };
};

export const createAdminUser = async ({ fullName, email, password }) => {
  const passwordHash = await bcrypt.hash(password, 12);
  return User.create({
    fullName,
    email,
    password: passwordHash,
    role: "admin",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    otpEnabled: true
  });
};

export const enrollAdminSessionWithOtp = async (client, credentials) => {
  const loginResponse = await loginUser(client, credentials);
  const challengeToken = loginResponse.body?.data?.otpChallengeToken;

  if (!challengeToken) {
    throw new Error("Expected OTP challenge token for admin login.");
  }

  const setupResponse = await apiRequest(client, "post", "/api/v1/auth/otp/setup", {
    body: { challengeToken }
  });
  const otpSecret = setupResponse.body?.data?.manualEntryKey;

  if (!otpSecret) {
    throw new Error("OTP setup did not return a manual entry key.");
  }

  const otpCode = authenticator.generate(otpSecret);
  const verifySetupResponse = await apiRequest(client, "post", "/api/v1/auth/otp/verify-setup", {
    body: { challengeToken, otpCode }
  });

  return {
    loginResponse,
    setupResponse,
    verifySetupResponse,
    otpSecret,
    csrfToken: verifySetupResponse.body?.data?.csrfToken || null
  };
};

export const loginAdminWithOtp = async (client, credentials, otpSecret) => {
  const loginResponse = await loginUser(client, credentials);
  const challengeToken = loginResponse.body?.data?.otpChallengeToken;
  if (!challengeToken) {
    throw new Error("Expected admin OTP challenge token.");
  }

  const otpCode = authenticator.generate(otpSecret);
  const verifyResponse = await apiRequest(client, "post", "/api/v1/auth/otp/verify-login", {
    body: {
      otpChallengeToken: challengeToken,
      otpCode
    }
  });

  return {
    loginResponse,
    verifyResponse,
    csrfToken: verifyResponse.body?.data?.csrfToken || null
  };
};

export const issueAdminStepUpToken = async (client, { csrfToken, currentPassword, otpSecret }) => {
  const otpCode = authenticator.generate(otpSecret);

  const response = await apiRequest(client, "post", "/api/v1/auth/admin/step-up", {
    csrfToken,
    body: {
      currentPassword,
      otpCode
    }
  });

  return response.body?.data?.stepUpToken || null;
};

export const updateUserPollPermissionAsAdmin = async (
  client,
  { csrfToken, currentPassword, otpSecret, userId, canCreatePolls }
) => {
  const stepUpToken = await issueAdminStepUpToken(client, {
    csrfToken,
    currentPassword,
    otpSecret
  });

  return apiRequest(client, "patch", `/api/v1/auth/admin/users/${userId}/poll-permission`, {
    csrfToken,
    headers: {
      "X-Admin-Step-Up-Token": stepUpToken
    },
    body: {
      canCreatePolls
    }
  });
};
