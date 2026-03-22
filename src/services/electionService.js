import mongoose from "mongoose";
import Election from "../models/Election.js";
import Vote from "../models/Vote.js";
import { ApiError } from "../utils/apiError.js";

const ensureElectionExists = async (electionId) => {
  if (!mongoose.Types.ObjectId.isValid(electionId)) {
    throw new ApiError(400, "Invalid election id", "INVALID_ELECTION_ID");
  }

  const election = await Election.findById(electionId);
  if (!election) {
    throw new ApiError(404, "Election not found", "ELECTION_NOT_FOUND");
  }

  return election;
};

export const listElections = async ({ includeArchived = false, adminView = false } = {}) => {
  const query = {};
  if (!includeArchived) {
    query.status = { $ne: "archived" };
  }

  if (!adminView) {
    query.status = { $in: ["open", "closed"] };
  }

  return Election.find(query)
    .select("-__v")
    .populate("createdBy", "fullName email")
    .sort({ createdAt: -1 });
};

export const getElectionById = async (electionId, viewerRole = "voter") => {
  const election = await ensureElectionExists(electionId);

  if (viewerRole !== "admin" && (election.status === "draft" || election.status === "archived")) {
    throw new ApiError(404, "Election not found", "ELECTION_NOT_FOUND");
  }

  return election;
};

export const createElection = async (payload, userId) => {
  const startsAt = new Date(payload.startsAt);
  const endsAt = new Date(payload.endsAt);
  const maxSelections = payload.maxSelections || 1;

  if (startsAt >= endsAt) {
    throw new ApiError(400, "startsAt must be earlier than endsAt", "INVALID_ELECTION_WINDOW");
  }

  if (maxSelections > payload.options.length) {
    throw new ApiError(400, "maxSelections cannot exceed the number of options", "INVALID_MAX_SELECTIONS");
  }

  return Election.create({
    ...payload,
    startsAt,
    endsAt,
    createdBy: userId
  });
};

export const updateElection = async (electionId, payload) => {
  const election = await ensureElectionExists(electionId);

  if (election.status === "closed" || election.status === "archived") {
    throw new ApiError(400, "Closed or archived elections cannot be modified", "ELECTION_LOCKED");
  }

  const startsAt = payload.startsAt ? new Date(payload.startsAt) : election.startsAt;
  const endsAt = payload.endsAt ? new Date(payload.endsAt) : election.endsAt;

  if (startsAt >= endsAt) {
    throw new ApiError(400, "startsAt must be earlier than endsAt", "INVALID_ELECTION_WINDOW");
  }

  const maxSelections = payload.maxSelections || election.maxSelections;
  const nextOptions = payload.options || election.options;

  if (maxSelections > nextOptions.length) {
    throw new ApiError(400, "maxSelections cannot exceed the number of options", "INVALID_MAX_SELECTIONS");
  }

  Object.assign(election, payload);
  await election.save();

  return election;
};

export const changeElectionStatus = async (electionId, status) => {
  const election = await ensureElectionExists(electionId);

  if (election.status === status) {
    return election;
  }

  const allowedTransitions = {
    draft: new Set(["open", "archived"]),
    open: new Set(["closed", "archived"]),
    closed: new Set(["archived"]),
    archived: new Set([])
  };

  if (!allowedTransitions[election.status].has(status)) {
    throw new ApiError(
      400,
      `Cannot transition election status from ${election.status} to ${status}`,
      "INVALID_STATUS_TRANSITION"
    );
  }

  election.status = status;
  await election.save();
  return election;
};

export const archiveElection = async (electionId) => {
  const election = await ensureElectionExists(electionId);
  election.status = "archived";
  await election.save();
  return election;
};

export const getElectionResults = async (electionId, viewerRole = "voter") => {
  const election = await ensureElectionExists(electionId);

  if (election.resultsVisibility === "after_close" && election.status !== "closed" && viewerRole !== "admin") {
    throw new ApiError(403, "Election results are not visible yet", "RESULTS_HIDDEN");
  }

  const voteAggregation = await Vote.aggregate([
    { $match: { election: election._id } },
    { $unwind: "$optionIds" },
    { $group: { _id: "$optionIds", count: { $sum: 1 } } }
  ]);

  const voteMap = new Map(voteAggregation.map((item) => [String(item._id), item.count]));
  const totalVotes = voteAggregation.reduce((sum, item) => sum + item.count, 0);

  const options = election.options.map((option) => ({
    optionId: option.id,
    label: option.label,
    count: voteMap.get(option.id) || 0
  }));

  return {
    electionId: election.id,
    status: election.status,
    totalVotes,
    options
  };
};
