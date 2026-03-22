import { body, param, query } from "express-validator";

export const electionIdParamValidation = [param("electionId").isMongoId().withMessage("Invalid election id")];

export const listElectionsValidation = [query("includeArchived").optional().isBoolean().withMessage("includeArchived must be boolean")];

export const createElectionValidation = [
  body("title").trim().isLength({ min: 5, max: 200 }).withMessage("title must be between 5 and 200 characters"),
  body("description").optional().trim().isLength({ max: 2000 }).withMessage("description must not exceed 2000 characters"),
  body("type").isIn(["campaign", "poll", "election"]).withMessage("type must be campaign, poll, or election"),
  body("options").isArray({ min: 2 }).withMessage("options must include at least two entries"),
  body("options.*.label").trim().isLength({ min: 1, max: 200 }).withMessage("each option label must be between 1 and 200 characters"),
  body("options.*.description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("each option description must not exceed 500 characters"),
  body("startsAt").isISO8601().withMessage("startsAt must be a valid ISO8601 date"),
  body("endsAt").isISO8601().withMessage("endsAt must be a valid ISO8601 date"),
  body("maxSelections")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("maxSelections must be an integer between 1 and 50"),
  body("resultsVisibility")
    .optional()
    .isIn(["always", "after_close"])
    .withMessage("resultsVisibility must be always or after_close")
];

export const updateElectionValidation = [
  body("title").optional().trim().isLength({ min: 5, max: 200 }).withMessage("title must be between 5 and 200 characters"),
  body("description").optional().trim().isLength({ max: 2000 }).withMessage("description must not exceed 2000 characters"),
  body("type").optional().isIn(["campaign", "poll", "election"]).withMessage("type must be campaign, poll, or election"),
  body("options").optional().isArray({ min: 2 }).withMessage("options must include at least two entries"),
  body("options.*.label")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("each option label must be between 1 and 200 characters"),
  body("options.*.description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("each option description must not exceed 500 characters"),
  body("startsAt").optional().isISO8601().withMessage("startsAt must be a valid ISO8601 date"),
  body("endsAt").optional().isISO8601().withMessage("endsAt must be a valid ISO8601 date"),
  body("maxSelections")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("maxSelections must be an integer between 1 and 50"),
  body("resultsVisibility")
    .optional()
    .isIn(["always", "after_close"])
    .withMessage("resultsVisibility must be always or after_close")
];

export const changeElectionStatusValidation = [
  body("status")
    .isIn(["draft", "published", "open", "closed", "archived"])
    .withMessage("status must be draft, published, open, closed, or archived")
];
