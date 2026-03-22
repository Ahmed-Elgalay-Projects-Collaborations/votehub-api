import { assertLoginAllowed } from "../services/loginAttemptService.js";

export const loginAbuseGuardMiddleware = async (req, res, next) => {
  try {
    await assertLoginAllowed(req);
    next();
  } catch (error) {
    next(error);
  }
};
