import { createHash } from "crypto";
import mongoose from "mongoose";
import env from "../config/env.js";
import Election from "../models/Election.js";
import Vote from "../models/Vote.js";
import { ApiError } from "../utils/apiError.js";

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

export const castVote = async ({ electionId, voterId, optionIds, ipAddress, userAgent }) => {
  const election = await getElectionOrThrow(electionId);
  const now = new Date();

  if (election.status !== "open") {
    throw new ApiError(400, "Election is not open for voting", "ELECTION_NOT_OPEN");
  }

  if (now < election.startsAt || now > election.endsAt) {
    throw new ApiError(400, "Election is outside the valid voting window", "ELECTION_WINDOW_CLOSED");
  }

  const uniqueOptionIds = [...new Set(optionIds)];
  if (uniqueOptionIds.length === 0) {
    throw new ApiError(400, "At least one option must be selected", "NO_OPTIONS_SELECTED");
  }

  if (uniqueOptionIds.length > election.maxSelections) {
    throw new ApiError(400, `You can select up to ${election.maxSelections} option(s)`, "TOO_MANY_OPTIONS");
  }

  const allowedOptionIds = new Set(election.options.map((option) => option.id));
  const containsUnknownOption = uniqueOptionIds.some((optionId) => !allowedOptionIds.has(String(optionId)));
  if (containsUnknownOption) {
    throw new ApiError(400, "One or more selected options are invalid", "INVALID_OPTION_SELECTION");
  }

  try {
    const vote = await Vote.create({
      election: election.id,
      voter: voterId,
      optionIds: uniqueOptionIds,
      ipHash: hashIp(ipAddress || "unknown"),
      userAgent: userAgent || ""
    });

    return vote;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "You have already voted in this election", "DUPLICATE_VOTE");
    }

    throw error;
  }
};

export const listVotesForUser = async (voterId) =>
  Vote.find({ voter: voterId })
    .populate("election", "title type status startsAt endsAt")
    .sort({ createdAt: -1 });

export const listVotesByElection = async (electionId) =>
  Vote.find({ election: electionId })
    .populate("voter", "fullName email")
    .sort({ createdAt: -1 });

