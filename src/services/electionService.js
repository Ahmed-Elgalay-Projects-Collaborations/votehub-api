import mongoose from "mongoose";
import Election from "../models/Election.js";
import Vote from "../models/Vote.js";
import { appendAuditLog } from "./auditLogService.js";
import { ApiError } from "../utils/apiError.js";
import { decryptJson } from "../utils/securityCrypto.js";

const ELECTION_TRANSITIONS = {
  draft: new Set(["published", "archived"]),
  published: new Set(["open", "archived"]),
  open: new Set(["closed", "archived"]),
  closed: new Set(["archived"]),
  archived: new Set()
};

const CRITICAL_OPEN_FIELDS = new Set(["type", "options", "startsAt", "endsAt", "maxSelections"]);

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

const auditElectionAction = async ({ req, eventType, metadata, signAction = false }) => {
  if (!req?.user?.id) {
    return;
  }

  await appendAuditLog({
    eventType,
    req,
    actorId: req.user.id,
    actorRole: req.user.role,
    metadata,
    signAction
  });
};

const canCreatePoll = (actor) => actor?.role === "admin" || Boolean(actor?.canCreatePolls);

const ensurePollCreatorPermission = (actor) => {
  if (canCreatePoll(actor)) {
    return;
  }

  throw new ApiError(403, "Poll creation permission is required", "POLL_CREATION_FORBIDDEN");
};

const ensureOwnershipOrAdmin = (election, actor) => {
  if (actor?.role === "admin") {
    return;
  }

  if (!actor?.id || String(election.createdBy) !== String(actor.id)) {
    throw new ApiError(403, "Forbidden", "FORBIDDEN");
  }
};

const validateElectionWindow = (startsAt, endsAt) => {
  if (startsAt >= endsAt) {
    throw new ApiError(400, "startsAt must be earlier than endsAt", "INVALID_ELECTION_WINDOW");
  }
};

const assertSelectionLimit = (maxSelections, options) => {
  if (maxSelections > options.length) {
    throw new ApiError(400, "maxSelections cannot exceed the number of options", "INVALID_MAX_SELECTIONS");
  }
};

export const listElections = async ({ includeArchived = false, adminView = false, viewerId = null } = {}) => {
  const query = {};

  if (adminView) {
    if (!includeArchived) {
      query.status = { $ne: "archived" };
    }
  } else if (viewerId) {
    query.$or = [
      { status: { $in: ["published", "open", "closed"] } },
      { createdBy: viewerId }
    ];
  } else {
    query.status = { $in: ["published", "open", "closed"] };
  }

  return Election.find(query)
    .select("-__v")
    .populate("createdBy", "fullName email")
    .sort({ createdAt: -1 });
};

export const getElectionById = async (electionId, { viewerRole = "voter", viewerId = null } = {}) => {
  const election = await ensureElectionExists(electionId);

  const isOwner = viewerId && String(election.createdBy) === String(viewerId);
  if (viewerRole !== "admin" && !isOwner && (election.status === "draft" || election.status === "archived")) {
    throw new ApiError(404, "Election not found", "ELECTION_NOT_FOUND");
  }

  return election;
};

export const createElection = async (payload, actor, { req } = {}) => {
  ensurePollCreatorPermission(actor);

  const startsAt = new Date(payload.startsAt);
  const endsAt = new Date(payload.endsAt);
  const maxSelections = payload.maxSelections || 1;

  validateElectionWindow(startsAt, endsAt);
  assertSelectionLimit(maxSelections, payload.options);

  const election = await Election.create({
    ...payload,
    startsAt,
    endsAt,
    createdBy: actor.id
  });

  await auditElectionAction({
    req,
    eventType: actor.role === "admin" ? "admin.election_created" : "user.poll_created",
    metadata: {
      electionId: election.id,
      status: election.status,
      type: election.type
    },
    signAction: actor.role === "admin"
  });

  return election;
};

export const updateElection = async (electionId, payload, actor, { req } = {}) => {
  ensurePollCreatorPermission(actor);
  const election = await ensureElectionExists(electionId);
  ensureOwnershipOrAdmin(election, actor);

  if (election.status === "closed" || election.status === "archived") {
    throw new ApiError(400, "Closed or archived elections cannot be modified", "ELECTION_LOCKED");
  }

  if (election.status === "open") {
    const attemptedCriticalUpdate = Object.keys(payload).some((field) => CRITICAL_OPEN_FIELDS.has(field));
    if (attemptedCriticalUpdate) {
      throw new ApiError(400, "Critical election fields cannot be modified after opening", "ELECTION_CRITICAL_FIELDS_LOCKED");
    }
  }

  const startsAt = payload.startsAt ? new Date(payload.startsAt) : election.startsAt;
  const endsAt = payload.endsAt ? new Date(payload.endsAt) : election.endsAt;
  validateElectionWindow(startsAt, endsAt);

  const maxSelections = payload.maxSelections || election.maxSelections;
  const nextOptions = payload.options || election.options;
  assertSelectionLimit(maxSelections, nextOptions);

  Object.assign(election, payload);
  await election.save();

  await auditElectionAction({
    req,
    eventType: actor.role === "admin" ? "admin.election_updated" : "user.poll_updated",
    metadata: {
      electionId: election.id,
      status: election.status,
      updatedFields: Object.keys(payload)
    },
    signAction: actor.role === "admin"
  });

  return election;
};

export const changeElectionStatus = async (electionId, status, actor, { req } = {}) => {
  ensurePollCreatorPermission(actor);
  const election = await ensureElectionExists(electionId);
  ensureOwnershipOrAdmin(election, actor);

  if (election.status === status) {
    return election;
  }

  const allowedTransitions = ELECTION_TRANSITIONS[election.status] || new Set();
  if (!allowedTransitions.has(status)) {
    throw new ApiError(
      400,
      `Cannot transition election status from ${election.status} to ${status}`,
      "INVALID_STATUS_TRANSITION"
    );
  }

  if (status === "open") {
    const now = new Date();
    if (now < election.startsAt || now > election.endsAt) {
      throw new ApiError(400, "Election can only be opened within its configured time window", "ELECTION_WINDOW_INVALID_FOR_OPEN");
    }
  }

  const previousStatus = election.status;
  election.status = status;
  await election.save();

  await auditElectionAction({
    req,
    eventType: actor.role === "admin" ? "admin.election_status_changed" : "user.poll_status_changed",
    metadata: {
      electionId: election.id,
      fromStatus: previousStatus,
      toStatus: status
    },
    signAction: actor.role === "admin"
  });

  return election;
};

export const archiveElection = async (electionId, actor, { req } = {}) => {
  ensurePollCreatorPermission(actor);
  const election = await ensureElectionExists(electionId);
  ensureOwnershipOrAdmin(election, actor);

  if (election.status === "archived") {
    return election;
  }

  const previousStatus = election.status;
  election.status = "archived";
  await election.save();

  await auditElectionAction({
    req,
    eventType: actor.role === "admin" ? "admin.election_archived" : "user.poll_archived",
    metadata: {
      electionId: election.id,
      fromStatus: previousStatus
    },
    signAction: actor.role === "admin"
  });

  return election;
};

export const getElectionResults = async (electionId, viewerRole = "voter") => {
  const election = await ensureElectionExists(electionId);

  if (election.resultsVisibility === "after_close" && election.status !== "closed" && viewerRole !== "admin") {
    throw new ApiError(403, "Election results are not visible yet", "RESULTS_HIDDEN");
  }

  const votes = await Vote.find({ election: election._id }).select("+encryptedOptionIds");
  const voteMap = new Map();
  let totalVotes = 0;

  for (const vote of votes) {
    const decryptedOptionIds = decryptJson(vote.encryptedOptionIds, "vote") || [];
    for (const optionId of decryptedOptionIds) {
      const key = String(optionId);
      voteMap.set(key, (voteMap.get(key) || 0) + 1);
      totalVotes += 1;
    }
  }

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
