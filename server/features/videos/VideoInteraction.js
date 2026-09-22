const mongoose = require("mongoose");

const videoInteractionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student_management",
      required: true
    },
    videoId: {
      type: String,
      required: true
    },
    eventType: {
      type: String,
      enum: ["click", "watch", "like", "dislike"],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    videoTitle: {
      type: String,
      required: true
    },
    VideoURL: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: String,
      required: true
    },
    score: {
      type: Number,
      required: true
    },
    durationSeconds: {
      type: Number,
      default: 0
    },
    //XP already credited for this interaction, so re-reporting the
    //same watch time never awards it twice
    xpAwarded: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "VideoInteraction",
  videoInteractionSchema
);
