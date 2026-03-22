import { expect } from "chai";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { apiRequest, createClient } from "../../helpers/client.js";
import { buildAdminPayload, buildUserPayload } from "../../helpers/factories.js";
import {
  createAdminUser,
  createVerifiedSession,
  enrollAdminSessionWithOtp,
  loginAdminWithOtp,
  loginUser,
  registerAndVerifyUser,
  registerUser,
  verifyEmailForUser
} from "../../helpers/auth.js";
import User from "../../../src/models/User.js";

describe("Auth API", () => {
  it("registers and verifies a user using the verification endpoint", async () => {
    const client = createClient();
    const payload = buildUserPayload("auth-register");

    const registerResponse = await registerUser(client, payload);
    expect(registerResponse.status).to.equal(201);
    expect(registerResponse.body.success).to.equal(true);

    const user = await User.findOne({ email: payload.email }).select("_id emailVerified");
    expect(user).to.not.equal(null);
    expect(user.emailVerified).to.equal(false);

    const verifyResponse = await verifyEmailForUser(client, user.id);
    expect(verifyResponse.status).to.equal(200);
    expect(verifyResponse.body.success).to.equal(true);

    const updated = await User.findById(user.id).select("emailVerified");
    expect(updated.emailVerified).to.equal(true);
  });

  it("rejects login for unverified accounts", async () => {
    const client = createClient();
    const payload = buildUserPayload("auth-unverified");

    await registerUser(client, payload);
    const loginResponse = await loginUser(client, payload);

    expect(loginResponse.status).to.equal(403);
    expect(loginResponse.body.error.code).to.equal("EMAIL_NOT_VERIFIED");
  });

  it("logs in verified users and allows profile access", async () => {
    const client = createClient();
    const payload = buildUserPayload("auth-session");
    await registerAndVerifyUser(client, payload);

    const loginResponse = await loginUser(client, payload);
    expect(loginResponse.status).to.equal(200);
    expect(loginResponse.body.data.user.email).to.equal(payload.email.toLowerCase());
    expect(loginResponse.body.data.csrfToken).to.be.a("string");

    const meResponse = await apiRequest(client, "get", "/api/v1/auth/me");
    expect(meResponse.status).to.equal(200);
    expect(meResponse.body.data.user.email).to.equal(payload.email.toLowerCase());
  });

  it("rejects invalid credentials", async () => {
    const client = createClient();
    const payload = buildUserPayload("auth-invalid");
    await registerAndVerifyUser(client, payload);

    const response = await loginUser(client, {
      email: payload.email,
      password: "WrongPasswordA1"
    });

    expect(response.status).to.equal(401);
    expect(response.body.error.code).to.equal("INVALID_CREDENTIALS");
  });

  it("invalidates cookie session on logout", async () => {
    const client = createClient();
    const payload = buildUserPayload("auth-logout");
    const { csrfToken } = await createVerifiedSession(client, payload);

    const logoutResponse = await apiRequest(client, "post", "/api/v1/auth/logout", {
      csrfToken
    });
    expect(logoutResponse.status).to.equal(200);

    const meAfterLogout = await apiRequest(client, "get", "/api/v1/auth/me");
    expect(meAfterLogout.status).to.equal(401);
    expect(meAfterLogout.body.error.code).to.equal("AUTH_REQUIRED");
  });

  it("rejects invalid and expired JWT bearer tokens on protected routes", async () => {
    const client = createClient();
    const invalidResponse = await apiRequest(client, "get", "/api/v1/auth/me", {
      bearerToken: "not-a-valid-token"
    });

    expect(invalidResponse.status).to.equal(401);
    expect(invalidResponse.body.error.code).to.equal("TOKEN_INVALID");

    const expiredToken = jwt.sign(
      {
        sub: "507f1f77bcf86cd799439011",
        role: "voter"
      },
      process.env.JWT_SECRET,
      { expiresIn: -1 }
    );

    const expiredResponse = await apiRequest(client, "get", "/api/v1/auth/me", {
      bearerToken: expiredToken
    });

    expect(expiredResponse.status).to.equal(401);
    expect(expiredResponse.body.error.code).to.equal("TOKEN_INVALID");
  });

  it("supports OTP enrollment and OTP login verification for non-admin users", async () => {
    const client = createClient();
    const payload = buildUserPayload("auth-otp-voter");
    const { csrfToken } = await createVerifiedSession(client, payload);

    const setupResponse = await apiRequest(client, "post", "/api/v1/auth/otp/setup", {
      csrfToken,
      body: {}
    });
    expect(setupResponse.status).to.equal(200);
    expect(setupResponse.body.data.manualEntryKey).to.be.a("string");

    const otpCode = authenticator.generate(setupResponse.body.data.manualEntryKey);
    const verifySetupResponse = await apiRequest(client, "post", "/api/v1/auth/otp/verify-setup", {
      csrfToken,
      body: { otpCode }
    });

    expect(verifySetupResponse.status).to.equal(200);
    expect(verifySetupResponse.body.data.recoveryCodes).to.be.an("array").with.length.greaterThan(0);

    const logoutResponse = await apiRequest(client, "post", "/api/v1/auth/logout", {
      csrfToken
    });
    expect(logoutResponse.status).to.equal(200);

    const loginChallengeResponse = await loginUser(client, payload);
    expect(loginChallengeResponse.status).to.equal(200);
    expect(loginChallengeResponse.body.data.otpRequired).to.equal(true);

    const verifyLoginResponse = await apiRequest(client, "post", "/api/v1/auth/otp/verify-login", {
      body: {
        otpChallengeToken: loginChallengeResponse.body.data.otpChallengeToken,
        otpCode: authenticator.generate(setupResponse.body.data.manualEntryKey)
      }
    });
    expect(verifyLoginResponse.status).to.equal(200);
    expect(verifyLoginResponse.body.data.user.email).to.equal(payload.email.toLowerCase());
  });

  it("enforces mandatory OTP for admins and blocks OTP disable", async () => {
    const client = createClient();
    const adminPayload = buildAdminPayload();
    await createAdminUser(adminPayload);

    const enrolled = await enrollAdminSessionWithOtp(client, adminPayload);
    expect(enrolled.verifySetupResponse.status).to.equal(200);
    expect(enrolled.csrfToken).to.be.a("string");

    const disableResponse = await apiRequest(client, "post", "/api/v1/auth/otp/disable", {
      csrfToken: enrolled.csrfToken,
      body: {
        currentPassword: adminPayload.password,
        otpCode: authenticator.generate(enrolled.otpSecret)
      }
    });

    expect(disableResponse.status).to.equal(403);
    expect(disableResponse.body.error.code).to.equal("ADMIN_OTP_MANDATORY");

    const freshClient = createClient();
    const loginWithOtp = await loginAdminWithOtp(freshClient, adminPayload, enrolled.otpSecret);
    expect(loginWithOtp.verifyResponse.status).to.equal(200);
    expect(loginWithOtp.verifyResponse.body.data.user.role).to.equal("admin");
  });
});
