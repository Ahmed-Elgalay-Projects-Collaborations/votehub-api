import mongoose from "mongoose";

const electionOptionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    }
  },
  { _id: true }
);

const electionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 200
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    type: {
      type: String,
      enum: ["campaign", "poll", "election"],
      required: true
    },
    options: {
      type: [electionOptionSchema],
      validate: {
        validator: (options) => Array.isArray(options) && options.length >= 2,
        message: "An election requires at least two options."
      }
    },
    status: {
      type: String,
      enum: ["draft", "published", "open", "closed", "archived"],
      default: "draft",
      index: true
    },
    startsAt: {
      type: Date,
      required: true
    },
    endsAt: {
      type: Date,
      required: true
    },
    maxSelections: {
      type: Number,
      default: 1,
      min: 1
    },
    resultsVisibility: {
      type: String,
      enum: ["always", "after_close"],
      default: "after_close"
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  {
    timestamps: true
  }
);

electionSchema.index({ type: 1, status: 1, startsAt: 1, endsAt: 1 });

const Election = mongoose.model("Election", electionSchema);
export default Election;
