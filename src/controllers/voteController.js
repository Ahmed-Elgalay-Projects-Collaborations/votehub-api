import { listVotesByElection, listVotesForUser, castVote } from "../services/voteService.js";
import { logSecurityEvent } from "../services/securityEventService.js";
import asyncHandler from "../utils/asyncHandler.js";

export const castVoteController = asyncHandler(async (req, res) => {
  const vote = await castVote({
    electionId: req.params.electionId,
    voterId: req.user.id,
    optionIds: req.body.optionIds,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"]
  });

  logSecurityEvent("vote_cast", req, { electionId: req.params.electionId }, "info");

  res.status(201).json({
    success: true,
    data: {
      vote
    },
    requestId: req.id
  });
});

export const myVotesController = asyncHandler(async (req, res) => {
  const votes = await listVotesForUser(req.user.id);
  res.status(200).json({
    success: true,
    data: {
      votes
    },
    requestId: req.id
  });
});

export const electionVotesController = asyncHandler(async (req, res) => {
  const votes = await listVotesByElection(req.params.electionId);
  res.status(200).json({
    success: true,
    data: {
      votes
    },
    requestId: req.id
  });
});

