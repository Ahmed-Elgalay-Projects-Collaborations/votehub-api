import {
  archiveElection,
  changeElectionStatus,
  createElection,
  getElectionById,
  getElectionResults,
  listElections,
  updateElection
} from "../services/electionService.js";
import asyncHandler from "../utils/asyncHandler.js";

export const listAllElections = asyncHandler(async (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  const adminView = req.user?.role === "admin";

  const elections = await listElections({ includeArchived, adminView });

  res.status(200).json({
    success: true,
    data: {
      elections
    },
    requestId: req.id
  });
});

export const getElection = asyncHandler(async (req, res) => {
  const election = await getElectionById(req.params.electionId, req.user?.role || "voter");
  res.status(200).json({
    success: true,
    data: {
      election
    },
    requestId: req.id
  });
});

export const createElectionController = asyncHandler(async (req, res) => {
  const election = await createElection(req.body, req.user.id);
  res.status(201).json({
    success: true,
    data: {
      election
    },
    requestId: req.id
  });
});

export const updateElectionController = asyncHandler(async (req, res) => {
  const election = await updateElection(req.params.electionId, req.body);
  res.status(200).json({
    success: true,
    data: {
      election
    },
    requestId: req.id
  });
});

export const changeElectionStatusController = asyncHandler(async (req, res) => {
  const election = await changeElectionStatus(req.params.electionId, req.body.status);
  res.status(200).json({
    success: true,
    data: {
      election
    },
    requestId: req.id
  });
});

export const archiveElectionController = asyncHandler(async (req, res) => {
  const election = await archiveElection(req.params.electionId);
  res.status(200).json({
    success: true,
    data: {
      election
    },
    requestId: req.id
  });
});

export const getElectionResultsController = asyncHandler(async (req, res) => {
  const results = await getElectionResults(req.params.electionId, req.user?.role || "voter");
  res.status(200).json({
    success: true,
    data: {
      results
    },
    requestId: req.id
  });
});
