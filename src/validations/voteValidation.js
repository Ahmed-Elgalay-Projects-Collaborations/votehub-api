import { body } from "express-validator";

export const castVoteValidation = [
  body("optionIds").isArray({ min: 1 }).withMessage("optionIds must be a non-empty array"),
  body("optionIds.*").isMongoId().withMessage("each option id must be a valid id")
];

