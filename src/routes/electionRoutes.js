import { Router } from "express";
import {
  archiveElectionController,
  changeElectionStatusController,
  createElectionController,
  getElection,
  getElectionResultsController,
  listAllElections,
  updateElectionController
} from "../controllers/electionController.js";
import { castVoteController } from "../controllers/voteController.js";
import { optionalAuth, requireAuth, requirePollCreator } from "../middlewares/authMiddleware.js";
import { requireAdminStepUpIfAdmin } from "../middlewares/adminStepUpMiddleware.js";
import { validateRequestMiddleware } from "../middlewares/validateRequestMiddleware.js";
import {
  changeElectionStatusValidation,
  createElectionValidation,
  electionIdParamValidation,
  listElectionsValidation,
  updateElectionValidation
} from "../validations/electionValidation.js";
import { castVoteValidation } from "../validations/voteValidation.js";

const router = Router();

router.get("/", optionalAuth, listElectionsValidation, validateRequestMiddleware, listAllElections);
router.get("/:electionId", optionalAuth, electionIdParamValidation, validateRequestMiddleware, getElection);
router.get("/:electionId/results", optionalAuth, electionIdParamValidation, validateRequestMiddleware, getElectionResultsController);
router.post(
  "/:electionId/votes",
  requireAuth,
  electionIdParamValidation,
  castVoteValidation,
  validateRequestMiddleware,
  castVoteController
);

router.post(
  "/",
  requireAuth,
  requirePollCreator,
  requireAdminStepUpIfAdmin,
  createElectionValidation,
  validateRequestMiddleware,
  createElectionController
);
router.patch(
  "/:electionId",
  requireAuth,
  requirePollCreator,
  requireAdminStepUpIfAdmin,
  electionIdParamValidation,
  updateElectionValidation,
  validateRequestMiddleware,
  updateElectionController
);
router.patch(
  "/:electionId/status",
  requireAuth,
  requirePollCreator,
  requireAdminStepUpIfAdmin,
  electionIdParamValidation,
  changeElectionStatusValidation,
  validateRequestMiddleware,
  changeElectionStatusController
);
router.delete(
  "/:electionId",
  requireAuth,
  requirePollCreator,
  requireAdminStepUpIfAdmin,
  electionIdParamValidation,
  validateRequestMiddleware,
  archiveElectionController
);

export default router;
