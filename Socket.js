import { Server } from "socket.io";
import { Message } from "./Models/message.model.js";
import { ChatRoom } from "./Models/Chatroom.model.js";

let io = null;

/**
 * Initialize Socket.io server
 * @param {http.Server} server HTTP server instance
 */
const initSocket = (server) => {
  if (io) {
    console.warn("Socket.io already initialized!");
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173", // frontend origin
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // 🔹 Default namespace "/"
  io.on("connection", (socket) => {
    console.log("Default namespace: User connected:", socket.id);

    socket.on("message", (msg) => {
      console.log("Default message:", msg);
      io.emit("message", msg);
    });

    socket.on("disconnect", () => {
      console.log("Default namespace: User disconnected:", socket.id);
    });
  });

  // 🔹 Chat namespace "/chat"
  const chatNamespace = io.of("/chat");

  chatNamespace.on("connection", (socket) => {
    console.log("Chat namespace: User connected:", socket.id);

    // ✅ Join specific chat room
    socket.on("joinRoom", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });


    // ✅ Leave room
socket.on("leaveRoom", async ({ roomId, userId }) => {
  socket.leave(roomId); // socket leaves the room

  const room = await ChatRoom.findById(roomId);
  if (!room) return;

  room.members = room.members.filter(m => m.toString() !== userId.toString());
  await room.save();

  // 🔹 Emit to remaining members only
  chatNamespace.to(roomId).emit("roomUpdated", {
    roomId,
    lastMessage: null, // ya last message fetch kar sakte ho
    updatedAt: new Date(),
  });

  // 🔹 Delete if no members left
  if (room.members.length === 0) {
    await ChatRoom.findByIdAndDelete(roomId);
    await ChatRoomMember.deleteMany({ chatRoom: roomId });
    chatNamespace.emit("roomDeleted", { roomId });
  }
});



    // ✅ New Message
    socket.on("chatMessage", async ({ roomId, senderId, text }) => {
      try {
        const newMessage = await Message.create({
          roomId,
          sender: senderId,
          text,
        });
        await newMessage.populate("sender", "name avatar");

        // Emit new message
        chatNamespace.to(roomId).emit("chatMessage", {
          action: "newMessage",
          message: newMessage,
          roomId,
        });

        // 🔹 Emit roomUpdated
        chatNamespace.to(roomId.toString()).emit("roomUpdated", {
          roomId,
          lastMessage: newMessage
            ? {
                _id: newMessage._id,
                text: newMessage.text,
                sender: {
                  _id: newMessage.sender._id,
                  name: newMessage.sender.name,
                  avatar: newMessage.sender.avatar,
                },
                createdAt: newMessage.createdAt,
              }
            : null,
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error("Error saving message:", err);
      }
    });

    // ✅ Edit Message
    socket.on("editMessage", async ({ roomId, messageId, newText }) => {
      try {
        const updated = await Message.findByIdAndUpdate(
          messageId,
          { text: newText, isEdited: true },
          { new: true }
        ).populate("sender", "name avatar");

        if (updated) {
          chatNamespace.to(roomId).emit("chatMessage", {
            action: "editMessage",
            message: updated,
            roomId,
          });

          // 🔹 Emit roomUpdated
          chatNamespace.emit("roomUpdated", {
            roomId,
            lastMessage: {
              _id: updated._id,
              text: updated.text,
              sender: {
                _id: updated.sender._id,
                name: updated.sender.name,
                avatar: updated.sender.avatar,
              },
              createdAt: updated.createdAt,
            },
            updatedAt: new Date(),
          });
        }
      } catch (err) {
        console.error("Error editing message:", err);
      }
    });

    // ✅ Delete Message
    socket.on("deleteMessage", async ({ roomId, messageId, authUserId }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;

        if (msg.delBy.includes(authUserId)) {
          await msg.deleteOne();
          chatNamespace.to(roomId).emit("chatMessage", {
            action: "deleteMessage",
            messageId,
            message: null,
            roomId,
          });
        } else {
          msg.delBy.push(authUserId);
          await msg.save();

          chatNamespace.to(roomId).emit("chatMessage", {
            action: "deleteMessage",
            messageId,
            message: {
              ...msg.toObject(),
              text: "",
            },
            roomId,
          });
        }

        // 🔹 Emit roomUpdated after deletion
        const lastMsg = await Message.find({ roomId })
          .sort({ createdAt: -1 })
          .limit(1)
          .populate("sender", "name avatar");

        chatNamespace.emit("roomUpdated", {
          roomId,
          lastMessage: lastMsg[0]
            ? {
                _id: lastMsg[0]._id,
                text: lastMsg[0].text,
                sender: {
                  _id: lastMsg[0].sender._id,
                  name: lastMsg[0].sender.name,
                  avatar: lastMsg[0].sender.avatar,
                },
                createdAt: lastMsg[0].createdAt,
              }
            : null,
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error("Error deleting message:", err);
      }
    });

    // ✅ Room created
    socket.on("roomCreated", (room) => {
      if (room && Array.isArray(room.members)) {
        room.members.forEach((memberId) => {
          chatNamespace.to(memberId.toString()).emit("roomCreated", room);
        });
      }
    });

    socket.on("messagesRead", async ({ userId, roomId }) => {
      try {
        // ✅ Use $addToSet to avoid duplicates
        await Message.updateMany(
          { chatRoom: roomId, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );

        // ✅ Get latest message
        const lastMsg = await Message.findOne({ chatRoom: roomId })
          .sort({ createdAt: -1 })
          .populate("sender", "name avatar");

        // ✅ Notify clients
        chatNamespace.to(roomId).emit("messagesRead", { userId, roomId });

        // ✅ Update room preview
        chatNamespace.to(roomId).emit("roomUpdated", {
          roomId,
          lastMessage: lastMsg
            ? {
                _id: lastMsg._id,
                text: lastMsg.text,
                sender: {
                  _id: lastMsg.sender._id,
                  name: lastMsg.sender.name,
                  avatar: lastMsg.sender.avatar,
                },
                createdAt: lastMsg.createdAt,
                readBy: lastMsg.readBy,
              }
            : null,
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("Chat namespace: User disconnected:", socket.id);
    });
  });

  return io;
};

/**
 * Get Socket.io instance safely
 */
const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};

export { initSocket, getIO };
