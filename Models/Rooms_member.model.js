import mongoose from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";

const chatRoomMemberSchema = new mongoose.Schema(
  {
    chatRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    status: { type: String, enum: ["online", "offline"], default: "offline" },
    joinedAt: { type: Date, default: Date.now },
    lastOnlineAt: { type: Date, default: Date.now }, // ✅ fixed
  },
  { timestamps: true }
);

chatRoomMemberSchema.plugin(aggregatePaginate);
export const ChatRoomMember = mongoose.model("ChatRoomMember", chatRoomMemberSchema);
