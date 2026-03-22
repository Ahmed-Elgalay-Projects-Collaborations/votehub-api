import { Router } from "express";
import { electionVotesController, myVotesController, verifyVoteReceiptController } from "../controllers/voteController.js";
import { authorizeRoles, requireAuth } from "../middlewares/authMiddleware.js";
import { requireAdminStepUp } from "../middlewares/adminStepUpMiddleware.js";
import { validateRequestMiddleware } from "../middlewares/validateRequestMiddleware.js";
import { electionIdParamValidation } from "../validations/electionValidation.js";
import { verifyVoteReceiptValidation } from "../validations/voteValidation.js";

const router = Router();

router.get("/me", requireAuth, myVotesController);
router.get(
  "/elections/:electionId",
  requireAuth,
  authorizeRoles("admin"),
  requireAdminStepUp,
  electionIdParamValidation,
  validateRequestMiddleware,
  electionVotesController
);
router.post("/receipts/verify", requireAuth, verifyVoteReceiptValidation, validateRequestMiddleware, verifyVoteReceiptController);

export default router;
