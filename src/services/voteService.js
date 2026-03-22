import { createHash } from "crypto";
import mongoose from "mongoose";
import env from "../config/env.js";
import Election from "../models/Election.js";
import Vote from "../models/Vote.js";
import { consumeOneTimeToken } from "./replayProtectionService.js";
import { logSecurityEvent } from "./securityEventService.js";
import { generateVoteReceipt, verifyVoteReceiptSignature } from "./voteReceiptService.js";
import { ApiError } from "../utils/apiError.js";
import { decryptJson, encryptJson, hashValue } from "../utils/securityCrypto.js";

const getElectionOrThrow = async (electionId) => {
  if (!mongoose.Types.ObjectId.isValid(electionId)) {
    throw new ApiError(400, "Invalid election id", "INVALID_ELECTION_ID");
  }

  const election = await Election.findById(electionId);
  if (!election) {
    throw new ApiError(404, "Election not found", "ELECTION_NOT_FOUND");
  }

  return election;
};

const hashIp = (ipAddress) => createHash("sha256").update(`${ipAddress}:${env.auditSalt}`).digest("hex");

const buildOptionDigest = ({ electionId, voterId, optionIds }) => hashValue(`${electionId}:${voterId}:${optionIds.join(",")}`);

const mapVoteDocument = (voteDocument) => {
  const decryptedOptionIds = decryptJson(voteDocument.encryptedOptionIds, "vote") || [];

  return {
    id: voteDocument.id,
    election: voteDocument.election,
    voter: voteDocument.voter,
    optionIds: decryptedOptionIds,
    createdAt: voteDocument.createdAt,
    updatedAt: voteDocument.updatedAt
  };
};

const rejectVote = (req, statusCode, message, code, metadata = {}) => {
  logSecurityEvent("vote_rejected", req, metadata);
  throw new ApiError(statusCode, message, code);
};

export const castVote = async ({ electionId, voterId, optionIds, ipAddress, userAgent, idempotencyKey = null, req = null }) => {
  const election = await getElectionOrThrow(electionId);
  const now = new Date();

  if (election.status !== "open") {
    rejectVote(req, 400, "Election is not open for voting", "ELECTION_NOT_OPEN", { electionId, reason: "status_not_open" });
  }

  if (now < election.startsAt || now > election.endsAt) {
    rejectVote(req, 400, "Election is outside the valid voting window", "ELECTION_WINDOW_CLOSED", {
      electionId,
      reason: "outside_window"
    });
  }

  const uniqueOptionIds = [...new Set(optionIds.map((value) => String(value)))];
  if (uniqueOptionIds.length === 0) {
    rejectVote(req, 400, "At least one option must be selected", "NO_OPTIONS_SELECTED", { electionId, reason: "empty_selection" });
  }

  if (uniqueOptionIds.length > election.maxSelections) {
    rejectVote(req, 400, `You can select up to ${election.maxSelections} option(s)`, "TOO_MANY_OPTIONS", {
      electionId,
      reason: "too_many_options"
    });
  }

  const allowedOptionIds = new Set(election.options.map((option) => option.id));
  const containsUnknownOption = uniqueOptionIds.some((optionId) => !allowedOptionIds.has(optionId));
  if (containsUnknownOption) {
    rejectVote(req, 400, "One or more selected options are invalid", "INVALID_OPTION_SELECTION", {
      electionId,
      reason: "invalid_option"
    });
  }

  if (idempotencyKey) {
    await consumeOneTimeToken({
      tokenValue: `${voterId}:${electionId}:${idempotencyKey}`,
      tokenType: `vote_submission:${voterId}:${electionId}`
    });
  }

  const encryptedOptionIds = encryptJson(uniqueOptionIds, "vote");
  const optionIdsDigest = buildOptionDigest({
    electionId,
    voterId,
    optionIds: uniqueOptionIds
  });

  try {
    const vote = await Vote.create({
      election: election.id,
      voter: voterId,
      encryptedOptionIds,
      optionIdsDigest,
      ipHash: hashIp(ipAddress || "unknown"),
      userAgent: userAgent || ""
    });

    const receipt = generateVoteReceipt(vote);
    vote.receiptDigest = hashValue(`${JSON.stringify(receipt.payload)}:${receipt.signature}`);
    await vote.save();

    return {
      vote: mapVoteDocument({
        ...vote.toObject(),
        encryptedOptionIds
      }),
      receipt
    };
  } catch (error) {
    if (error?.code === 11000) {
      rejectVote(req, 409, "You have already voted in this election", "DUPLICATE_VOTE", {
        electionId,
        reason: "duplicate_vote"
      });
    }

    throw error;
  }
};

export const listVotesForUser = async (voterId) => {
  const votes = await Vote.find({ voter: voterId })
    .select("+encryptedOptionIds")
    .populate("election", "title type status startsAt endsAt")
    .sort({ createdAt: -1 });

  return votes.map((vote) => mapVoteDocument(vote));
};

export const listVotesByElection = async (electionId) => {
  const votes = await Vote.find({ election: electionId })
    .select("+encryptedOptionIds")
    .populate("voter", "fullName email")
    .sort({ createdAt: -1 });

  return votes.map((vote) => mapVoteDocument(vote));
};

export const verifyVoteReceiptForUser = async ({ receipt, userRole, userId }) => {
  const signatureValid = verifyVoteReceiptSignature(receipt);
  if (!signatureValid) {
    throw new ApiError(400, "Receipt signature is invalid", "RECEIPT_SIGNATURE_INVALID");
  }

  const vote = await Vote.findById(receipt.payload.voteId).select("election voter optionIdsDigest createdAt receiptDigest");
  if (!vote) {
    throw new ApiError(404, "Referenced vote was not found", "VOTE_NOT_FOUND");
  }

  if (userRole !== "admin" && String(vote.voter) !== String(userId)) {
    throw new ApiError(403, "Forbidden", "FORBIDDEN");
  }

  const expectedReceipt = generateVoteReceipt(vote);
  const expectedDigest = hashValue(`${JSON.stringify(expectedReceipt.payload)}:${expectedReceipt.signature}`);
  const storedDigestMatches = vote.receiptDigest && vote.receiptDigest === expectedDigest;
  const payloadMatchesVote =
    String(receipt.payload.electionId) === String(vote.election) &&
    String(receipt.payload.recordedAt) === String(expectedReceipt.payload.recordedAt) &&
    String(receipt.payload.integrityHash) === String(expectedReceipt.payload.integrityHash);

  return {
    valid: expectedReceipt.signature === receipt.signature && storedDigestMatches && payloadMatchesVote,
    voteId: vote.id,
    electionId: String(vote.election),
    recordedAt: vote.createdAt
  };
};
