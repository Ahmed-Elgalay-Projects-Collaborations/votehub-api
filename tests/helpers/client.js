import request from "supertest";

let ipCursor = 10;

export const nextIp = () => {
  const ip = `203.0.113.${ipCursor}`;
  ipCursor += 1;
  return ip;
};

export const createClient = ({ ip = nextIp(), origin = "http://localhost:3000", userAgent = "VoteHubTest/1.0" } = {}) => {
  if (!globalThis.__TEST_APP) {
    throw new Error("Test app is not initialized.");
  }

  return {
    agent: request.agent(globalThis.__TEST_APP),
    ip,
    origin,
    userAgent
  };
};

const withBaseHeaders = (req, client) =>
  req
    .set("Origin", client.origin)
    .set("X-Forwarded-For", client.ip)
    .set("User-Agent", client.userAgent)
    .set("Accept", "application/json");

export const apiRequest = (
  client,
  method,
  path,
  { body = undefined, csrfToken = null, bearerToken = null, idempotencyKey = null, headers = {} } = {}
) => {
  let req = withBaseHeaders(client.agent[method](path), client);

  if (csrfToken) {
    req = req.set("X-CSRF-Token", csrfToken);
  }

  if (bearerToken) {
    req = req.set("Authorization", `Bearer ${bearerToken}`);
  }

  if (idempotencyKey) {
    req = req.set("Idempotency-Key", idempotencyKey);
  }

  for (const [key, value] of Object.entries(headers)) {
    req = req.set(key, value);
  }

  if (body !== undefined) {
    return req.send(body);
  }

  return req;
};

