import { Router } from "express";
import { electionVotesController, myVotesController } from "../controllers/voteController.js";
import { authorizeRoles, requireAuth } from "../middlewares/authMiddleware.js";
import { validateRequestMiddleware } from "../middlewares/validateRequestMiddleware.js";
import { electionIdParamValidation } from "../validations/electionValidation.js";

const router = Router();

router.get("/me", requireAuth, myVotesController);
router.get("/elections/:electionId", requireAuth, authorizeRoles("admin"), electionIdParamValidation, validateRequestMiddleware, electionVotesController);

export default router;

