import { expect } from "chai";
import AuditLogEntry from "../../../src/models/AuditLogEntry.js";
import User from "../../../src/models/User.js";
import Vote from "../../../src/models/Vote.js";
import { apiRequest, createClient } from "../../helpers/client.js";
import {
  createAdminUser,
  createVerifiedSession,
  enrollAdminSessionWithOtp,
  issueAdminStepUpToken,
  loginUser,
  registerAndVerifyUser,
  registerUser
} from "../../helpers/auth.js";
import { createElectionAsAdmin, createOpenElectionAsAdmin } from "../../helpers/elections.js";
import { buildAdminPayload, buildElectionPayload, buildUserPayload } from "../../helpers/factories.js";

const extractOptionId = (election) => election?.options?.[0]?._id || election?.options?.[0]?.id || null;

const buildAdminSession = async (client) => {
  const adminPayload = buildAdminPayload();
  await createAdminUser(adminPayload);
  const enrolled = await enrollAdminSessionWithOtp(client, adminPayload);

  return {
    ...adminPayload,
    ...enrolled
  };
};

describe("Security API behavior", () => {
  it("blocks state-changing requests without CSRF token in cookie-auth mode", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterClient = createClient();
    const voterPayload = buildUserPayload("csrf-voter");
    await createVerifiedSession(voterClient, voterPayload);

    const electionDetails = await apiRequest(voterClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionId = extractOptionId(electionDetails.body.data.election);

    const withoutCsrf = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      body: { optionIds: [optionId] }
    });

    expect(withoutCsrf.status).to.equal(403);
    expect(withoutCsrf.body.error.code).to.equal("CSRF_TOKEN_INVALID");
  });

  it("rejects malformed or injection-style auth input", async () => {
    const client = createClient();

    const response = await apiRequest(client, "post", "/api/v1/auth/login", {
      body: {
        email: { $ne: null },
        password: "AnythingA1"
      }
    });

    expect(response.status).to.equal(400);
    expect(response.body.error.code).to.equal("VALIDATION_ERROR");
  });

  it("sanitizes XSS payloads in registration input", async () => {
    const client = createClient();
    const payload = {
      ...buildUserPayload("xss-register"),
      fullName: "<script>alert('xss')</script>Alice Secure"
    };

    const response = await registerUser(client, payload);
    expect(response.status).to.equal(201);

    const user = await User.findOne({ email: payload.email }).select("fullName");
    expect(user.fullName).to.not.contain("<script>");
    expect(user.fullName).to.not.contain("<");
  });

  it("triggers honeypot protection for trap header and suspicious paths", async () => {
    const client = createClient();

    const trapResponse = await apiRequest(client, "get", "/api/v1/health", {
      headers: { "X-VoteHub-Trap": "triggered" }
    });
    expect(trapResponse.status).to.equal(400);
    expect(trapResponse.body.error.code).to.equal("INVALID_REQUEST_PAYLOAD");

    const pathProbe = await apiRequest(client, "get", "/api/v1/.env");
    expect(pathProbe.status).to.equal(404);
    expect(pathProbe.body.error.code).to.equal("NOT_FOUND");
  });

  it("applies login lockout after repeated failed attempts", async () => {
    const client = createClient();
    const payload = buildUserPayload("lockout-user");
    await registerAndVerifyUser(client, payload);

    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const response = await loginUser(client, {
        email: payload.email,
        password: "WrongPasswordA1"
      });
      expect(response.status).to.equal(401);
    }

    const thresholdResponse = await loginUser(client, {
      email: payload.email,
      password: "WrongPasswordA1"
    });
    expect(thresholdResponse.status).to.equal(429);
    expect(thresholdResponse.body.error.code).to.equal("LOGIN_RATE_LIMITED");
    expect(thresholdResponse.body.error.details.retryAfterSeconds).to.be.at.least(850);
  });

  it("blocks risky clients after repeated honeypot triggers", async () => {
    const client = createClient();
    const criticalThreshold = Number(process.env.RISK_CRITICAL_THRESHOLD || 70);
    const attemptsToBlock = Math.ceil(criticalThreshold / 25) + 3;

    for (let index = 0; index < attemptsToBlock; index += 1) {
      const response = await apiRequest(client, "get", "/api/v1/health", {
        headers: { "X-VoteHub-Trap": `trap-${index}` }
      });
      expect(response.status).to.equal(400);
    }

    const blockedLogin = await apiRequest(client, "post", "/api/v1/auth/login", {
      body: {
        email: "blocked@example.com",
        password: "AnyPasswordA1"
      }
    });

    expect(blockedLogin.status).to.equal(429);
    expect(blockedLogin.body.error.code).to.equal("RISK_BLOCKED");
  });

  it("creates signed admin audit records and verifies audit-chain integrity", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const createResponse = await createElectionAsAdmin(adminClient, adminSession, buildElectionPayload());
    expect(createResponse.status).to.equal(201);

    const auditRecord = await AuditLogEntry.findOne({ eventType: "admin.election_created" }).sort({ createdAt: -1 });
    expect(auditRecord).to.not.equal(null);
    expect(auditRecord.actionSignature).to.be.a("string");
    expect(auditRecord.previousHash).to.be.a("string");
    expect(auditRecord.currentHash).to.be.a("string");

    const stepUpToken = await issueAdminStepUpToken(adminClient, {
      csrfToken: adminSession.csrfToken,
      currentPassword: adminSession.password,
      otpSecret: adminSession.otpSecret
    });

    const verifyResponse = await apiRequest(adminClient, "get", "/api/v1/auth/admin/audit/verify", {
      headers: {
        "X-Admin-Step-Up-Token": stepUpToken
      }
    });

    expect(verifyResponse.status).to.equal(200);
    expect(verifyResponse.body.data.integrity.valid).to.equal(true);
  });

  it("prevents replay of admin step-up tokens", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    await createElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const stepUpToken = await issueAdminStepUpToken(adminClient, {
      csrfToken: adminSession.csrfToken,
      currentPassword: adminSession.password,
      otpSecret: adminSession.otpSecret
    });

    const firstUse = await apiRequest(adminClient, "get", "/api/v1/auth/admin/audit/verify", {
      headers: {
        "X-Admin-Step-Up-Token": stepUpToken
      }
    });
    expect(firstUse.status).to.equal(200);

    const replayUse = await apiRequest(adminClient, "get", "/api/v1/auth/admin/audit/verify", {
      headers: {
        "X-Admin-Step-Up-Token": stepUpToken
      }
    });
    expect(replayUse.status).to.equal(409);
    expect(replayUse.body.error.code).to.equal("REPLAY_DETECTED");
  });

  it("stores encrypted vote selections instead of plain option IDs", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterClient = createClient();
    const voterPayload = buildUserPayload("encrypted-voter");
    const voterSession = await createVerifiedSession(voterClient, voterPayload);

    const electionDetails = await apiRequest(voterClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionId = electionDetails.body.data.election.options[0]._id;
    const castResponse = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      body: { optionIds: [optionId] }
    });
    expect(castResponse.status).to.equal(201);

    const voteId = castResponse.body.data.receipt.payload.voteId;
    const vote = await Vote.findById(voteId).select("+encryptedOptionIds");
    expect(vote.encryptedOptionIds).to.be.a("string");
    expect(vote.encryptedOptionIds).to.not.contain(optionId);
  });

  it("exposes Prometheus metrics endpoint with expected security metrics", async () => {
    const client = createClient();
    const response = await apiRequest(client, "get", "/metrics");

    expect(response.status).to.equal(200);
    expect(response.text).to.contain("votehub_http_request_duration_seconds");
    expect(response.text).to.contain("votehub_security_events_total");
    expect(response.text).to.contain("votehub_login_attempts_total");
    expect(response.text).to.contain("votehub_http_responses_total");
  });
});
