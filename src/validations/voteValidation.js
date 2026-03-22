import { body } from "express-validator";

export const castVoteValidation = [
  body("optionIds").isArray({ min: 1 }).withMessage("optionIds must be a non-empty array"),
  body("optionIds.*").isMongoId().withMessage("each option id must be a valid id")
];

export const verifyVoteReceiptValidation = [
  body("receipt").isObject().withMessage("receipt is required"),
  body("receipt.payload").isObject().withMessage("receipt.payload is required"),
  body("receipt.payload.voteId").isMongoId().withMessage("receipt.payload.voteId must be valid"),
  body("receipt.payload.electionId").isMongoId().withMessage("receipt.payload.electionId must be valid"),
  body("receipt.payload.recordedAt").isISO8601().withMessage("receipt.payload.recordedAt must be a valid timestamp"),
  body("receipt.payload.integrityHash").isString().isLength({ min: 32, max: 256 }).withMessage("receipt.payload.integrityHash is invalid"),
  body("receipt.signature").isString().isLength({ min: 32, max: 256 }).withMessage("receipt.signature is invalid")
];
