import mongoose from "mongoose";

const voteSchema = new mongoose.Schema(
  {
    election: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: true,
      index: true
    },
    voter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    optionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      }
    ],
    ipHash: {
      type: String,
      default: "",
      select: false
    },
    userAgent: {
      type: String,
      default: "",
      select: false
    }
  },
  {
    timestamps: true
  }
);

voteSchema.index({ election: 1, voter: 1 }, { unique: true });

const Vote = mongoose.model("Vote", voteSchema);
export default Vote;
