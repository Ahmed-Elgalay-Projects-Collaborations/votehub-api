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
import { authorizeRoles, optionalAuth, requireAuth } from "../middlewares/authMiddleware.js";
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

router.post("/", requireAuth, authorizeRoles("admin"), createElectionValidation, validateRequestMiddleware, createElectionController);
router.patch(
  "/:electionId",
  requireAuth,
  authorizeRoles("admin"),
  electionIdParamValidation,
  updateElectionValidation,
  validateRequestMiddleware,
  updateElectionController
);
router.patch(
  "/:electionId/status",
  requireAuth,
  authorizeRoles("admin"),
  electionIdParamValidation,
  changeElectionStatusValidation,
  validateRequestMiddleware,
  changeElectionStatusController
);
router.delete(
  "/:electionId",
  requireAuth,
  authorizeRoles("admin"),
  electionIdParamValidation,
  validateRequestMiddleware,
  archiveElectionController
);

export default router;
