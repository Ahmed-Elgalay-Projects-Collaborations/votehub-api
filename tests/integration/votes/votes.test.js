import { expect } from "chai";
import { apiRequest, createClient } from "../../helpers/client.js";
import { createAdminUser, createVerifiedSession, enrollAdminSessionWithOtp } from "../../helpers/auth.js";
import { createElectionAsAdmin, createOpenElectionAsAdmin, extractElectionId } from "../../helpers/elections.js";
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

describe("Votes API", () => {
  it("casts a vote and returns a signed receipt", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterClient = createClient();
    const voterPayload = buildUserPayload("vote-cast");
    const voterSession = await createVerifiedSession(voterClient, voterPayload);

    const electionDetails = await apiRequest(voterClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionId = extractOptionId(electionDetails.body.data.election);

    const castResponse = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      body: {
        optionIds: [optionId]
      }
    });

    expect(castResponse.status).to.equal(201);
    expect(castResponse.body.data.receipt.payload.voteId).to.be.a("string");
    expect(castResponse.body.data.receipt.signature).to.be.a("string");
  });

  it("rejects duplicate votes in the same election", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterClient = createClient();
    const voterPayload = buildUserPayload("vote-duplicate");
    const voterSession = await createVerifiedSession(voterClient, voterPayload);
    const electionDetails = await apiRequest(voterClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionId = extractOptionId(electionDetails.body.data.election);

    const firstVote = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      body: { optionIds: [optionId] }
    });
    expect(firstVote.status).to.equal(201);

    const duplicateVote = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      body: { optionIds: [optionId] }
    });
    expect(duplicateVote.status).to.equal(409);
    expect(duplicateVote.body.error.code).to.equal("DUPLICATE_VOTE");
  });

  it("rejects vote submission when election is not open", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const createResponse = await createElectionAsAdmin(adminClient, adminSession, buildElectionPayload());
    const electionId = extractElectionId(createResponse);
    const optionId = extractOptionId(createResponse.body?.data?.election);

    const voterClient = createClient();
    const voterPayload = buildUserPayload("vote-closed");
    const voterSession = await createVerifiedSession(voterClient, voterPayload);

    const voteResponse = await apiRequest(voterClient, "post", `/api/v1/elections/${electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      body: {
        optionIds: [optionId]
      }
    });

    expect(voteResponse.status).to.equal(400);
    expect(voteResponse.body.error.code).to.equal("ELECTION_NOT_OPEN");
  });

  it("verifies signed vote receipts for owner and blocks other users", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterOneClient = createClient();
    const voterOnePayload = buildUserPayload("vote-receipt-owner");
    const voterOneSession = await createVerifiedSession(voterOneClient, voterOnePayload);
    const electionDetails = await apiRequest(voterOneClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionId = extractOptionId(electionDetails.body.data.election);

    const castResponse = await apiRequest(voterOneClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterOneSession.csrfToken,
      body: { optionIds: [optionId] }
    });
    const receipt = castResponse.body.data.receipt;

    const verifyOwner = await apiRequest(voterOneClient, "post", "/api/v1/votes/receipts/verify", {
      csrfToken: voterOneSession.csrfToken,
      body: { receipt }
    });
    expect(verifyOwner.status).to.equal(200);
    expect(verifyOwner.body.data.verification.valid).to.equal(true);

    const voterTwoClient = createClient();
    const voterTwoPayload = buildUserPayload("vote-receipt-other");
    const voterTwoSession = await createVerifiedSession(voterTwoClient, voterTwoPayload);

    const verifyOther = await apiRequest(voterTwoClient, "post", "/api/v1/votes/receipts/verify", {
      csrfToken: voterTwoSession.csrfToken,
      body: { receipt }
    });
    expect(verifyOther.status).to.equal(403);
    expect(verifyOther.body.error.code).to.equal("FORBIDDEN");
  });

  it("rejects tampered vote receipts", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterClient = createClient();
    const voterPayload = buildUserPayload("vote-receipt-tamper");
    const voterSession = await createVerifiedSession(voterClient, voterPayload);
    const electionDetails = await apiRequest(voterClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionId = extractOptionId(electionDetails.body.data.election);

    const castResponse = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      body: { optionIds: [optionId] }
    });

    const tamperedReceipt = {
      ...castResponse.body.data.receipt,
      payload: {
        ...castResponse.body.data.receipt.payload,
        integrityHash: "a".repeat(64)
      }
    };

    const verifyTampered = await apiRequest(voterClient, "post", "/api/v1/votes/receipts/verify", {
      csrfToken: voterSession.csrfToken,
      body: { receipt: tamperedReceipt }
    });

    expect(verifyTampered.status).to.equal(400);
    expect(verifyTampered.body.error.code).to.equal("RECEIPT_SIGNATURE_INVALID");
  });

  it("rejects replay-like vote submission when idempotency key is reused", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterClient = createClient();
    const voterPayload = buildUserPayload("vote-replay");
    const voterSession = await createVerifiedSession(voterClient, voterPayload);
    const electionDetails = await apiRequest(voterClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionId = extractOptionId(electionDetails.body.data.election);

    const idempotencyKey = "replay-test-key";
    const first = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      idempotencyKey,
      body: { optionIds: [optionId] }
    });
    expect(first.status).to.equal(201);

    const replay = await apiRequest(voterClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterSession.csrfToken,
      idempotencyKey,
      body: { optionIds: [optionId] }
    });
    expect(replay.status).to.equal(409);
    expect(replay.body.error.code).to.equal("REPLAY_DETECTED");
  });

  it("returns only the authenticated user's votes on /votes/me", async () => {
    const adminClient = createClient();
    const adminSession = await buildAdminSession(adminClient);
    const election = await createOpenElectionAsAdmin(adminClient, adminSession, buildElectionPayload());

    const voterOneClient = createClient();
    const voterOnePayload = buildUserPayload("vote-own-1");
    const voterOneSession = await createVerifiedSession(voterOneClient, voterOnePayload);

    const voterTwoClient = createClient();
    const voterTwoPayload = buildUserPayload("vote-own-2");
    const voterTwoSession = await createVerifiedSession(voterTwoClient, voterTwoPayload);

    const electionDetailsOne = await apiRequest(voterOneClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionOne = extractOptionId(electionDetailsOne.body.data.election);
    await apiRequest(voterOneClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterOneSession.csrfToken,
      body: { optionIds: [optionOne] }
    });

    const electionDetailsTwo = await apiRequest(voterTwoClient, "get", `/api/v1/elections/${election.electionId}`);
    const optionTwo = electionDetailsTwo.body.data.election.options[1]?._id || electionDetailsTwo.body.data.election.options[1]?.id;
    await apiRequest(voterTwoClient, "post", `/api/v1/elections/${election.electionId}/votes`, {
      csrfToken: voterTwoSession.csrfToken,
      body: { optionIds: [optionTwo] }
    });

    const voterOneVotes = await apiRequest(voterOneClient, "get", "/api/v1/votes/me");
    expect(voterOneVotes.status).to.equal(200);
    expect(voterOneVotes.body.data.votes).to.have.length(1);
    expect(voterOneVotes.body.data.votes[0].voter).to.be.a("string");
  });
});
