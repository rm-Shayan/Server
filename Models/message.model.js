import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isEdited: { type: Boolean, default: false },
    attachments: [{ type: String }],
    delBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        deletedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);


export const Message = mongoose.model("Message", messageSchema);
