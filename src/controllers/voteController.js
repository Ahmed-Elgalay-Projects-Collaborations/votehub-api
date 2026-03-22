import { listVotesByElection, listVotesForUser, castVote, verifyVoteReceiptForUser } from "../services/voteService.js";
import { logSecurityEvent } from "../services/securityEventService.js";
import asyncHandler from "../utils/asyncHandler.js";

export const castVoteController = asyncHandler(async (req, res) => {
  const voteResult = await castVote({
    electionId: req.params.electionId,
    voterId: req.user.id,
    optionIds: req.body.optionIds,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    idempotencyKey: req.headers["idempotency-key"],
    req
  });

  logSecurityEvent("vote_cast", req, { electionId: req.params.electionId, voteId: voteResult.vote.id }, "info");

  res.status(201).json({
    success: true,
    data: {
      vote: voteResult.vote,
      receipt: voteResult.receipt
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

export const verifyVoteReceiptController = asyncHandler(async (req, res) => {
  const verification = await verifyVoteReceiptForUser({
    receipt: req.body.receipt,
    userRole: req.user.role,
    userId: req.user.id
  });

  logSecurityEvent("vote_receipt_verified", req, {
    voteId: verification.voteId,
    isValid: verification.valid
  });

  res.status(200).json({
    success: true,
    data: {
      verification
    },
    requestId: req.id
  });
});
