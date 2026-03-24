import { expect } from "chai";
import { apiRequest, createClient } from "../../helpers/client.js";
import User from "../../../src/models/User.js";
import {
  createAdminUser,
  createVerifiedSession,
  enrollAdminSessionWithOtp,
  issueAdminStepUpToken,
  updateUserPollPermissionAsAdmin
} from "../../helpers/auth.js";
import { createElectionAsAdmin, createOpenElectionAsAdmin, extractElectionId, transitionElectionStatusAsAdmin } from "../../helpers/elections.js";
import { buildAdminPayload, buildElectionPayload, buildUserPayload } from "../../helpers/factories.js";

const buildAdminSession = async (client) => {
  const adminPayload = buildAdminPayload();
  await createAdminUser(adminPayload);
  const enrolled = await enrollAdminSessionWithOtp(client, adminPayload);

  return {
    ...enrolled,
    ...adminPayload
  };
};

describe("Elections API", () => {
  it("rejects users without poll creation permission", async () => {
    const voterClient = createClient();
    const voterPayload = buildUserPayload("election-voter");
    const session = await createVerifiedSession(voterClient, voterPayload);

    const response = await apiRequest(voterClient, "post", "/api/v1/elections", {
      csrfToken: session.csrfToken,
      body: buildElectionPayload()
    });

    expect(response.status).to.equal(403);
    expect(response.body.error.code).to.equal("POLL_CREATION_FORBIDDEN");
  });

  it("allows admin to grant poll permission and user can manage own poll", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);

    const voterClient = createClient();
    const voterPayload = buildUserPayload("poll-owner");
    const voterSession = await createVerifiedSession(voterClient, voterPayload);
    const voter = await User.findOne({ email: voterPayload.email }).select("_id");

    const grantResponse = await updateUserPollPermissionAsAdmin(adminClient, {
      csrfToken: adminSession.csrfToken,
      currentPassword: adminSession.password,
      otpSecret: adminSession.otpSecret,
      userId: voter.id,
      canCreatePolls: true
    });

    expect(grantResponse.status).to.equal(200);
    expect(grantResponse.body.data.user.canCreatePolls).to.equal(true);

    const createResponse = await apiRequest(voterClient, "post", "/api/v1/elections", {
      csrfToken: voterSession.csrfToken,
      body: buildElectionPayload({ title: "Owner Draft Poll" })
    });
    expect(createResponse.status).to.equal(201);

    const electionId = extractElectionId(createResponse);
    const updateResponse = await apiRequest(voterClient, "patch", `/api/v1/elections/${electionId}`, {
      csrfToken: voterSession.csrfToken,
      body: {
        title: "Owner Updated Poll"
      }
    });

    expect(updateResponse.status).to.equal(200);
    expect(updateResponse.body.data.election.title).to.equal("Owner Updated Poll");

    const getOwnDraft = await apiRequest(voterClient, "get", `/api/v1/elections/${electionId}`);
    expect(getOwnDraft.status).to.equal(200);

    const ownList = await apiRequest(voterClient, "get", "/api/v1/elections");
    const listed = ownList.body?.data?.elections?.some((election) => String(election.id || election._id) === String(electionId));
    expect(listed).to.equal(true);
  });

  it("blocks users from modifying polls they do not own", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);

    const ownerClient = createClient();
    const ownerPayload = buildUserPayload("poll-owner-a");
    const ownerSession = await createVerifiedSession(ownerClient, ownerPayload);
    const owner = await User.findOne({ email: ownerPayload.email }).select("_id");

    const otherClient = createClient();
    const otherPayload = buildUserPayload("poll-owner-b");
    const otherSession = await createVerifiedSession(otherClient, otherPayload);
    const other = await User.findOne({ email: otherPayload.email }).select("_id");

    for (const userId of [owner.id, other.id]) {
      const grantResponse = await updateUserPollPermissionAsAdmin(adminClient, {
        csrfToken: adminSession.csrfToken,
        currentPassword: adminSession.password,
        otpSecret: adminSession.otpSecret,
        userId,
        canCreatePolls: true
      });
      expect(grantResponse.status).to.equal(200);
    }

    const ownerCreate = await apiRequest(ownerClient, "post", "/api/v1/elections", {
      csrfToken: ownerSession.csrfToken,
      body: buildElectionPayload({ title: "Owner Private Draft" })
    });
    expect(ownerCreate.status).to.equal(201);

    const electionId = extractElectionId(ownerCreate);
    const otherPatch = await apiRequest(otherClient, "patch", `/api/v1/elections/${electionId}`, {
      csrfToken: otherSession.csrfToken,
      body: { title: "Unauthorized Update" }
    });

    expect(otherPatch.status).to.equal(403);
    expect(otherPatch.body.error.code).to.equal("FORBIDDEN");
  });

  it("creates election and enforces lifecycle transitions", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);

    const createResponse = await createElectionAsAdmin(adminClient, adminSession, buildElectionPayload());
    expect(createResponse.status).to.equal(201);
    expect(createResponse.body.data.election.status).to.equal("draft");

    const electionId = extractElectionId(createResponse);

    const publishResponse = await transitionElectionStatusAsAdmin(adminClient, adminSession, electionId, "published");
    expect(publishResponse.status).to.equal(200);
    expect(publishResponse.body.data.election.status).to.equal("published");

    const openResponse = await transitionElectionStatusAsAdmin(adminClient, adminSession, electionId, "open");
    expect(openResponse.status).to.equal(200);
    expect(openResponse.body.data.election.status).to.equal("open");

    const closeResponse = await transitionElectionStatusAsAdmin(adminClient, adminSession, electionId, "closed");
    expect(closeResponse.status).to.equal(200);
    expect(closeResponse.body.data.election.status).to.equal("closed");
  });

  it("requires admin step-up token for admin election mutations", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);

    const response = await apiRequest(adminClient, "post", "/api/v1/elections", {
      csrfToken: adminSession.csrfToken,
      body: buildElectionPayload()
    });

    expect(response.status).to.equal(401);
    expect(response.body.error.code).to.equal("ADMIN_STEP_UP_REQUIRED");
  });

  it("rejects invalid status transitions", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const createResponse = await createElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const electionId = extractElectionId(createResponse);
    const invalidTransition = await transitionElectionStatusAsAdmin(adminClient, adminSession, electionId, "closed");

    expect(invalidTransition.status).to.equal(400);
    expect(invalidTransition.body.error.code).to.equal("INVALID_STATUS_TRANSITION");
  });

  it("locks critical election fields after opening", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const { electionId } = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const stepUpToken = await issueAdminStepUpToken(adminClient, {
      csrfToken: adminSession.csrfToken,
      currentPassword: adminSession.password,
      otpSecret: adminSession.otpSecret
    });

    const updateResponse = await apiRequest(adminClient, "patch", `/api/v1/elections/${electionId}`, {
      csrfToken: adminSession.csrfToken,
      headers: {
        "X-Admin-Step-Up-Token": stepUpToken
      },
      body: {
        startsAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      }
    });

    expect(updateResponse.status).to.equal(400);
    expect(updateResponse.body.error.code).to.equal("ELECTION_CRITICAL_FIELDS_LOCKED");
  });

  it("hides draft election details from non-admin users", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const createResponse = await createElectionAsAdmin(adminClient, adminSession, buildElectionPayload());
    const electionId = extractElectionId(createResponse);

    const voterClient = createClient();
    const response = await apiRequest(voterClient, "get", `/api/v1/elections/${electionId}`);

    expect(response.status).to.equal(404);
    expect(response.body.error.code).to.equal("ELECTION_NOT_FOUND");
  });

  it("validates malformed election IDs", async () => {
    const client = createClient();
    const response = await apiRequest(client, "get", "/api/v1/elections/not-a-valid-id");

    expect(response.status).to.equal(400);
    expect(response.body.error.code).to.equal("VALIDATION_ERROR");
  });
});
