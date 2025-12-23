import { Message } from "../Models/message.model.js";
import { ChatRoom } from "../Models/Chatroom.model.js";
import { ApiError } from "../Utilities/ApiError.js";
import { ApiResponse } from "../Utilities/ApiResponse.js";
import { asyncHandler } from "../Utilities/asyncHandler.js";
import { getIO } from "../Socket.js";

// ✅ Helper: get chat namespace
const getChatNamespace = () => getIO().of("/chat");

// 🔹 1. Send Message (Optimistic & Error-Proof)
export const sendMessage = asyncHandler(async (req, res) => {
  const { roomId, text, attachments = [] } = req.body;
  const userId = req.user._id;

  if (!roomId || !text) throw new ApiError(400, "roomId and text are required");

  const chatRoom = await ChatRoom.findById(roomId);
  if (!chatRoom) throw new ApiError(404, "Room not found");

  const message = await Message.create({
    chatRoom: roomId,
    sender: userId,
    text,
    attachments,
  });

  await message.populate("sender", "name avatar");

// ✅ Update lastMessage in ChatRoom
chatRoom.lastMessage = message._id;
chatRoom.updatedAt = new Date();
await chatRoom.save();

  const chatNamespace = getChatNamespace();

 chatNamespace.to(roomId.toString()).emit("chatMessage", {
  action: "newMessage",
  message,
  roomId,
});

chatNamespace.emit("roomUpdated", {
  roomId,
  lastMessage: {
    _id: message._id,
    text: message.text,
    sender: { _id: message.sender._id, name: message.sender.name, avatar: message.sender.avatar },
    createdAt: message.createdAt,
  },
  updatedAt: chatRoom.updatedAt,
});

  res.status(201).json(new ApiResponse(201, message, "Message sent successfully"));
});

// 🔹 2. Get Messages (with pagination)
export const getMessages = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!roomId) throw new ApiError(400, "roomId is required");

  const messages = await Message.find({ chatRoom: roomId })
    .populate("sender", "name avatar")
    .sort({ createdAt: 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit, 10));

  res.status(200).json(new ApiResponse(200, messages, "Messages fetched"));
});

// 🔹 3. Mark as Read

export const markAsRead = asyncHandler(async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user._id;

  if (!roomId) throw new ApiError(400, "roomId is required");

  // 🔹 Step 1: DB update (mark all unread messages in this room as read by this user)
  const result = await Message.updateMany(
    { chatRoom: roomId, readBy: { $ne: userId } }, // <-- corrected field
    { $addToSet: { readBy: userId } }
  );

  console.log("Updated messages:", result);

  // 🔹 Step 2: Emit socket event so all clients update UI
  getChatNamespace().to(roomId.toString()).emit("messagesRead", { userId, roomId });

  res.status(200).json(new ApiResponse(200, "Messages marked as read"));
});


// 🔹 4. Delete Message
export const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user._id;

  const message = await Message.findById(messageId);
  if (!message) throw new ApiError(404, "Message not found");

  const chatNamespace = getChatNamespace();

  if (message.sender.toString() === userId.toString()) {
    await message.deleteOne();

    chatNamespace.to(message.chatRoom.toString()).emit("chatMessage", {
      action: "deleteMessage",
      messageId,
      message: null,
    });
  } else {
    // Receiver delete → update delBy array
    if (!message.delBy.some((item) => item.userId.toString() === userId.toString())) {
      message.delBy.push({ userId });
      await message.save();
    }

    chatNamespace.to(message.chatRoom.toString()).emit("chatMessage", {
      action: "deleteMessage",
      messageId,
      message,
    });
  }

  // Emit roomUpdated after deletion
 const lastMsg = await Message.find({ chatRoom: message.chatRoom })
  .sort({ createdAt: -1 })
  .limit(1)
  .populate("sender", "name avatar");

// ✅ Update ChatRoom with new lastMessage
await ChatRoom.findByIdAndUpdate(message.chatRoom, {
  lastMessage: lastMsg[0]?._id || null,
  updatedAt: new Date(),
});

chatNamespace.emit("roomUpdated", {
  roomId: message.chatRoom,
  lastMessage: lastMsg[0]
    ? {
        _id: lastMsg[0]._id,
        text: lastMsg[0].text,
        sender: { _id: lastMsg[0].sender._id, name: lastMsg[0].sender.name, avatar: lastMsg[0].sender.avatar },
        createdAt: lastMsg[0].createdAt,
      }
    : null,
  updatedAt: new Date(),
});

  res.status(200).json(new ApiResponse(200, message, "Message deleted successfully"));
});

// 🔹 5. Edit Message
export const editMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { text, attachments = [] } = req.body;
  const userId = req.user._id;

  const message = await Message.findById(messageId);
  if (!message) throw new ApiError(404, "Message not found");

  if (message.sender.toString() !== userId.toString()) {
    throw new ApiError(403, "You can edit only your own messages");
  }

  message.text = text ?? message.text;
  message.attachments = attachments.length ? attachments : message.attachments;
  message.isEdited = true;
  await message.save();

  const chatNamespace = getChatNamespace();

  chatNamespace.to(message.chatRoom.toString()).emit("messageEdited", {
    message,
    roomId: message.chatRoom,
  });

  // Emit roomUpdated after edit
 const latestMsg = await Message.find({ chatRoom: message.chatRoom })
  .sort({ createdAt: -1 })
  .limit(1);

if (latestMsg[0]?._id.toString() === message._id.toString()) {
  await ChatRoom.findByIdAndUpdate(message.chatRoom, {
    lastMessage: message._id,
    updatedAt: new Date(),
  });
}

chatNamespace.emit("roomUpdated", {
  roomId: message.chatRoom,
  lastMessage: {
    _id: message._id,
    text: message.text,
    sender: { _id: message.sender._id, name: message.sender.name, avatar: message.sender.avatar },
    createdAt: message.createdAt,
  },
  updatedAt: new Date(),
});

  res.status(201).json(new ApiResponse(201, message, "Message updated successfully"));
});
