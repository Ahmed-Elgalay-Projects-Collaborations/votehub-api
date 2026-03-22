import { Router } from "express";
import { issueCsrfToken, login, logout, me, register } from "../controllers/authController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { loginAbuseGuardMiddleware } from "../middlewares/loginAbuseGuardMiddleware.js";
import { validateRequestMiddleware } from "../middlewares/validateRequestMiddleware.js";
import { loginValidation, registerValidation } from "../validations/authValidation.js";

const router = Router();

router.post("/register", registerValidation, validateRequestMiddleware, register);
router.post("/login", loginAbuseGuardMiddleware, loginValidation, validateRequestMiddleware, login);
router.post("/logout", requireAuth, logout);
router.get("/csrf-token", requireAuth, issueCsrfToken);
router.get("/me", requireAuth, me);

export default router;
