import mongoose from "mongoose";

const chatRoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // group ka naam ya "Direct Chat"
    isGroup: { type: Boolean, default: false }, // true: group, false: direct chat
    members: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    ],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" }, // last message
    avatar: { type: String, default: "" }, // group image
  },
  { timestamps: true }
);


export const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);
