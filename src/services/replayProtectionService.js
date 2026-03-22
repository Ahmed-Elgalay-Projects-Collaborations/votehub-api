import UsedToken from "../models/UsedToken.js";
import env from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import { hashValue } from "../utils/securityCrypto.js";

const defaultExpiryDate = () => new Date(Date.now() + env.replayProtectionTtlSeconds * 1000);

const resolveTokenHash = (tokenValue) => hashValue(String(tokenValue));

export const consumeOneTimeToken = async ({ tokenValue, tokenType, expiresAt = null }) => {
  if (!tokenValue || !tokenType) {
    throw new ApiError(400, "Invalid replay-protection token input", "REPLAY_TOKEN_INVALID");
  }

  const tokenHash = resolveTokenHash(tokenValue);

  try {
    await UsedToken.create({
      tokenHash,
      tokenType,
      expiresAt: expiresAt || defaultExpiryDate()
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "Replay attempt detected", "REPLAY_DETECTED");
    }

    throw error;
  }
};

export const assertOneTimeTokenUnused = async ({ tokenValue, tokenType }) => {
  if (!tokenValue || !tokenType) {
    throw new ApiError(400, "Invalid replay-protection token input", "REPLAY_TOKEN_INVALID");
  }

  const tokenHash = resolveTokenHash(tokenValue);
  const existing = await UsedToken.findOne({ tokenHash, tokenType }).select("_id");

  if (existing) {
    throw new ApiError(409, "Replay attempt detected", "REPLAY_DETECTED");
  }
};
