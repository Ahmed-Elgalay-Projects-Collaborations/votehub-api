import { apiRequest } from "./client.js";
import { buildElectionPayload } from "./factories.js";
import { issueAdminStepUpToken } from "./auth.js";

export const extractElectionId = (response) => response?.body?.data?.election?.id || response?.body?.data?.election?._id || null;

export const createElectionAsAdmin = async (client, adminSession, payload = buildElectionPayload()) => {
  const stepUpToken = await issueAdminStepUpToken(client, {
    csrfToken: adminSession.csrfToken,
    currentPassword: adminSession.password,
    otpSecret: adminSession.otpSecret
  });

  const response = await apiRequest(client, "post", "/api/v1/elections", {
    csrfToken: adminSession.csrfToken,
    headers: {
      "X-Admin-Step-Up-Token": stepUpToken
    },
    body: payload
  });

  return response;
};

export const transitionElectionStatusAsAdmin = async (client, adminSession, electionId, status) => {
  const stepUpToken = await issueAdminStepUpToken(client, {
    csrfToken: adminSession.csrfToken,
    currentPassword: adminSession.password,
    otpSecret: adminSession.otpSecret
  });

  return apiRequest(client, "patch", `/api/v1/elections/${electionId}/status`, {
    csrfToken: adminSession.csrfToken,
    headers: {
      "X-Admin-Step-Up-Token": stepUpToken
    },
    body: { status }
  });
};

export const createOpenElectionAsAdmin = async (client, adminSession, payload = buildElectionPayload()) => {
  const createResponse = await createElectionAsAdmin(client, adminSession, payload);
  const electionId = extractElectionId(createResponse);

  await transitionElectionStatusAsAdmin(client, adminSession, electionId, "published");
  const openResponse = await transitionElectionStatusAsAdmin(client, adminSession, electionId, "open");

  return {
    createResponse,
    openResponse,
    electionId
  };
};
