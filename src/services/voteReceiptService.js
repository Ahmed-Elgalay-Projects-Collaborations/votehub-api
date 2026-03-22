import { createHmac } from "crypto";
import env from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import { hashValue } from "../utils/securityCrypto.js";

const RECEIPT_VERSION = 1;

const sortObjectKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = sortObjectKeys(value[key]);
        return accumulator;
      }, {});
  }

  return value;
};

const signPayload = (payload) =>
  createHmac("sha256", env.receiptSigningKey)
    .update(JSON.stringify(sortObjectKeys(payload)))
    .digest("hex");

const buildIntegrityHash = (vote) =>
  hashValue(
    [
      vote.id,
      String(vote.election),
      String(vote.voter),
      vote.optionIdsDigest || "",
      vote.createdAt?.toISOString?.() || new Date(vote.createdAt).toISOString()
    ].join(":")
  );

export const generateVoteReceipt = (vote) => {
  const payload = {
    version: RECEIPT_VERSION,
    voteId: String(vote.id),
    electionId: String(vote.election),
    recordedAt: new Date(vote.createdAt).toISOString(),
    integrityHash: buildIntegrityHash(vote)
  };

  return {
    payload,
    signature: signPayload(payload)
  };
};

export const verifyVoteReceiptSignature = (receipt) => {
  if (!receipt?.payload || !receipt?.signature) {
    throw new ApiError(400, "Invalid receipt format", "INVALID_RECEIPT_FORMAT");
  }

  const expected = signPayload(receipt.payload);
  return expected === receipt.signature;
};

