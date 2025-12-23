import { ChatRoom } from "../Models/Chatroom.model.js";
import { ChatRoomMember } from "../Models/Rooms_member.model.js";
import { ApiError } from "../Utilities/ApiError.js";
import { ApiResponse } from "../Utilities/ApiResponse.js";
import { asyncHandler } from "../Utilities/asyncHandler.js";
import { User } from "../Models/User.model.js";
import mongoose from "mongoose";
import { sanitizeUser } from "../Utilities/SanitizeUser.js";
import { Message } from "../Models/message.model.js";
import {getIO} from "../Socket.js"


// ✅ Helper: get chat namespace
const getChatNamespace = () => getIO().of("/chat");
// ================= CREATE ROOM =================

export const createRoom = asyncHandler(async (req, res) => {
  const { name, members, isGroup } = req.body;
  const userId = req.user._id;

  if (!Array.isArray(members) || members.length === 0) {
    throw new ApiError(400, "At least one member is required");
  }

  // ✅ Remove duplicates & convert to strings
  const uniqueMembers = [...new Set(members.map(m => m.toString()))];

  // ❌ Prevent self-chat (direct)
  if (!isGroup && uniqueMembers.length === 1 && uniqueMembers[0] === userId.toString()) {
    throw new ApiError(400, "You cannot start a direct chat with yourself");
  }

  // ✅ Always include the creator
  if (!uniqueMembers.includes(userId.toString())) {
    uniqueMembers.push(userId.toString());
  }

  // ✅ Validate users exist
  const foundUsers = await User.find({ _id: { $in: uniqueMembers } })
    .select("_id name avatar")
    .lean();
  if (foundUsers.length !== uniqueMembers.length) {
    throw new ApiError(404, "Some members do not exist");
  }

  let room;
  if (isGroup) {
    // ✅ Validate group name
    if (!name?.trim()) throw new ApiError(400, "Group chat must have a name");
    if (name.trim().length < 3 || name.trim().length > 50) {
      throw new ApiError(400, "Group name must be 3–50 characters long");
    }

    // ✅ Group size validation
    if (uniqueMembers.length < 3) {
      throw new ApiError(400, "Group chat must have at least 3 members (including you)");
    }

    const existingGroup = await ChatRoom.findOne({
      isGroup: true,
      name: name.trim(),
      members: { $all: uniqueMembers, $size: uniqueMembers.length },
    });
    if (existingGroup) {
      return res.status(200).json(
        new ApiResponse(200, existingGroup, "Group with same name & members already exists")
      );
    }

    room = await ChatRoom.create({ name: name.trim(), isGroup: true, members: uniqueMembers });
  } else {
    // ✅ Direct chat validation
    if (uniqueMembers.length !== 2) {
      throw new ApiError(400, "Direct chat must have exactly 1 other member");
    }

    const otherUserId = uniqueMembers.find(id => id.toString() !== userId.toString());
    const otherUser = foundUsers.find(u => u._id.toString() === otherUserId.toString());
    if (!otherUser) throw new ApiError(404, "User not found");

    const existingRoom = await ChatRoom.findOne({
      isGroup: false,
      members: { $all: [userId, otherUserId], $size: 2 },
    });
    if (existingRoom) {
      return res.status(200).json(
        new ApiResponse(200, existingRoom, "Direct chat already exists")
      );
    }

    room = await ChatRoom.create({
      name: otherUser.name,
      isGroup: false,
      members: [userId, otherUserId],
    });
  }

  // ✅ Insert members with joinedAt & roles
  const chatRoomMembers = room.members.map(mId => ({
    chatRoom: room._id,
    user: mId,
    role: mId.toString() === userId.toString() ? "admin" : "member",
    status: mId.toString() === userId.toString() ? "online" : "offline",
    joinedAt: mId.toString() === userId.toString() ? new Date() : null,
  }));

  await ChatRoomMember.insertMany(chatRoomMembers);

  // Normalize members
  const membersData = await ChatRoomMember.find({ chatRoom: room._id }).lean();
  const fullUsers = await User.find({ _id: { $in: membersData.map(m => m.user) } })
    .select("_id name avatar ")
    .lean();

  const normalizedMembers = membersData.map(m => {
  const user = room.members.find(u => u._id.toString() === m.user.toString());
  const joinedAtISO = m.joinedAt ? new Date(m.joinedAt).toISOString() : null;
  const lastOnlineISO = m.lastOnlineAt ? new Date(m.lastOnlineAt).toISOString() : null;

  return {
    _id: m.user.toString(),
    name: user?.name || "Unknown",
    avatar: user?.avatar || "",
    role: m.role || "member",
    status: m.status || "offline",
    joinedAt: joinedAtISO,
    lastOnlineAt: lastOnlineISO,   // ✅ fixed
    isAccepted: !!joinedAtISO,
    admin: m.role === "admin",
  };
});


  // System message
  const otherUserName =
    !room.isGroup &&
    normalizedMembers.find(u => u._id !== userId.toString())?.name;

  const systemMessage = await Message.create({
    chatRoom: room._id,
    sender: userId,
    text: room.isGroup
      ? `${req.user.name} created group "${room.name}"`
      : `${req.user.name} started a chat with ${otherUserName || "Unknown User"}`,
    type: "system",
  });

  room.lastMessage = systemMessage._id;
  await room.save();

  const responseRoom = {
    ...room.toObject(),
    members: normalizedMembers,
    lastMessage: {
      _id: systemMessage._id,
      text: systemMessage.text,
      sender: null,
      type: "system",
      createdAt: systemMessage.createdAt,
    },
    displayName: room.isGroup
      ? room.name
      : otherUserName || "Unknown User",
    displayAvatar: room.isGroup
      ? room.avatar || null
      : normalizedMembers.find(u => u._id !== userId.toString())?.avatar,
  };

  getIO().to(room._id.toString()).emit("roomCreated", responseRoom);

  res.status(201).json(new ApiResponse(201, responseRoom, "Room created successfully"));
});


// ✅ Get all rooms for user
export const getUserRooms = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page || "1", 10);
  const limit = parseInt(req.query.limit || "10", 10);
  const options = { page, limit };

  const aggregate = ChatRoomMember.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },

    // Join ChatRoom
    {
      $lookup: {
        from: "chatrooms",
        localField: "chatRoom",
        foreignField: "_id",
        as: "chatRoom",
      },
    },
    { $unwind: "$chatRoom" },

    // Join ChatRoomMembers for all members
   {
  $lookup: {
    from: "chatroommembers",
    let: { chatRoomId: "$chatRoom._id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$chatRoom", "$$chatRoomId"] } } },
      { $project: { user: 1, joinedAt: 1, role: 1, status: 1, lastOnlineAt: 1 } }, // ✅ added
    ],
    as: "membersData",
  },
},

    // Populate users info
    {
      $lookup: {
        from: "users",
        let: { memberIds: "$chatRoom.members" },
        pipeline: [
          { $match: { $expr: { $in: ["$_id", "$$memberIds"] } } },
          { $project: { _id: 1, name: 1, avatar: 1 } },
        ],
        as: "chatRoom.members",
      },
    },

    // Populate lastMessage
    {
      $lookup: {
        from: "messages",
        localField: "chatRoom.lastMessage",
        foreignField: "_id",
        as: "lastMessage",
      },
    },
    { $unwind: { path: "$lastMessage", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.sender",
        foreignField: "_id",
        as: "lastMessage.senderInfo",
      },
    },
    { $unwind: { path: "$lastMessage.senderInfo", preserveNullAndEmptyArrays: true } },

    // Unread count
    {
      $lookup: {
        from: "messages",
        let: { roomId: "$chatRoom._id", userId: new mongoose.Types.ObjectId(userId) },
        pipeline: [
          { $match: { $expr: { $eq: ["$chatRoom", "$$roomId"] } } },
          { $match: { $expr: { $not: { $in: ["$$userId", "$readBy"] } } } },
          { $count: "unreadCount" },
        ],
        as: "unread",
      },
    },

    // Add FE fields
    {
      $addFields: {
        unreadCount: { $ifNull: [{ $arrayElemAt: ["$unread.unreadCount", 0] }, 0] },
        "chatRoom.displayName": {
          $cond: [
            { $eq: ["$chatRoom.isGroup", true] },
            "$chatRoom.name",
            {
              $let: {
                vars: {
                  otherUser: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$chatRoom.members",
                          as: "member",
                          cond: { $ne: ["$$member._id", new mongoose.Types.ObjectId(userId)] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: "$$otherUser.name",
              },
            },
          ],
        },
        "chatRoom.displayAvatar": {
          $cond: [
            { $eq: ["$chatRoom.isGroup", true] },
            { $ifNull: ["$chatRoom.avatar", ""] },
            {
              $let: {
                vars: {
                  otherUser: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$chatRoom.members",
                          as: "member",
                          cond: { $ne: ["$$member._id", new mongoose.Types.ObjectId(userId)] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: { $ifNull: ["$$otherUser.avatar", ""] },
              },
            },
          ],
        },
        "chatRoom.lastMessageId": "$lastMessage._id",
        "chatRoom.lastMessageText": { $ifNull: ["$lastMessage.text", ""] },
        "chatRoom.lastMessageAt": { $ifNull: ["$lastMessage.createdAt", "$chatRoom.updatedAt"] },
        "chatRoom.lastMessageSender": {
          _id: "$lastMessage.senderInfo._id",
          name: "$lastMessage.senderInfo.name",
          avatar: "$lastMessage.senderInfo.avatar",
        },
      },
    },

    { $sort: { "chatRoom.lastMessageAt": -1, "chatRoom.updatedAt": -1 } },
  ]);

  const result = await ChatRoomMember.aggregatePaginate(aggregate, options);

// ✅ Fix for getUserRooms

 const normalizedRooms = result.docs.map(doc => {
    const members = doc.membersData.map(m => {
      const user = doc.chatRoom.members.find(
        u => u._id.toString() === m.user.toString()
      );
      return {
        _id: m.user.toString(),
        name: user?.name || "Unknown",
        avatar: user?.avatar || "",
        role: m.role || "member",
        status: m.status || "offline",
        joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
        lastOnlineAt: m.lastOnlineAt ? new Date(m.lastOnlineAt).toISOString() : null,
        isAccepted: !!m.joinedAt,
        admin: m.role === "admin",
      };
    });

    return {
      _id: doc.chatRoom._id,
      isGroup: doc.chatRoom.isGroup,
      name: doc.chatRoom.name,
      avatar: doc.chatRoom.avatar || null,
      members,
      unreadCount: doc.unreadCount || 0,
      displayName: doc.chatRoom.displayName,
      displayAvatar: doc.chatRoom.displayAvatar,
      lastMessage: doc.chatRoom.lastMessageId
        ? {
            _id: doc.chatRoom.lastMessageId,
            text: doc.chatRoom.lastMessageText,
            createdAt: doc.chatRoom.lastMessageAt,
            sender: doc.chatRoom.lastMessageSender,
          }
        : null,
    };
  });



  // 🔥 Debug: log full normalized data
  console.log("===== Normalized Rooms =====");
  console.log(JSON.stringify(normalizedRooms, null, 2));
  console.log("============================");

  res.status(200).json(
    new ApiResponse(200, { ...result, docs: normalizedRooms }, "User rooms fetched with pagination")
  );
});


// ✅ Join Room

export const joinRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user._id;

  const room = await ChatRoom.findById(roomId);
  if (!room) throw new ApiError(404, "Room not found");

  let member = await ChatRoomMember.findOne({ chatRoom: roomId, user: userId });
  if (!member) {
    member = await ChatRoomMember.create({
      chatRoom: roomId,
      user: userId,
      role: "member",
      status: "online",
      joinedAt: new Date(),
    });
  } else {
    member.status = "online";
    if (!member.joinedAt) member.joinedAt = new Date();
    await member.save();
  }

  if (!room.members.includes(userId)) {
    room.members.push(userId);
    await room.save();
  }

  const membersData = await ChatRoomMember.find({ chatRoom: room._id }).lean();
  const fullUsers = await User.find({ _id: { $in: room.members } })
    .select("_id name avatar")
    .lean();

    const normalizedMembers = membersData.map(m => {
  const user = room.members.find(u => u._id.toString() === m.user.toString());
  const joinedAtISO = m.joinedAt ? new Date(m.joinedAt).toISOString() : null;
  const lastOnlineISO = m.lastOnlineAt ? new Date(m.lastOnlineAt).toISOString() : null;

  return {
    _id: m.user.toString(),
    name: user?.name || "Unknown",
    avatar: user?.avatar || "",
    role: m.role || "member",
    status: m.status || "offline",
    joinedAt: joinedAtISO,
    lastOnlineAt: lastOnlineISO,   // ✅ fixed
    isAccepted: !!joinedAtISO,
    admin: m.role === "admin",
  };
});


  const lastMessage = await Message.findOne({ chatRoom: room._id })
    .sort({ createdAt: -1 })
    .lean();

  const responseRoom = {
    ...room.toObject(),
    members: normalizedMembers,
    lastMessage: lastMessage
      ? {
          _id: lastMessage._id,
          text: lastMessage.text,
          sender: lastMessage.sender || null,
          type: lastMessage.type,
          createdAt: lastMessage.createdAt,
        }
      : null,
    displayName: room.isGroup
      ? room.name
      : normalizedMembers.find(u => u._id.toString() !== userId.toString())?.name,
    displayAvatar: room.isGroup
      ? room.avatar || null
      : normalizedMembers.find(u => u._id.toString() !== userId.toString())?.avatar,
  };

  getIO().to(roomId.toString()).emit("roomUpdated", {
    action: "memberJoined",
    room: responseRoom,
    userId,
  });

  res.status(200).json(new ApiResponse(200, responseRoom, "Joined room successfully"));
});


// Leave Room
export const leaveRoom = asyncHandler(async (req, res) => {
  console.log("REQ BODY:", req.body);
  console.log("REQ USER:", req.user);

  const { roomId, userId: fallbackUserId } = req.body;
  const userId = req.user?._id || fallbackUserId;
  if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

  const room = await ChatRoom.findById(roomId);
  if (!room) throw new ApiError(404, "Room not found");

  // Remove user from room members
  room.members = room.members.filter(m => m.toString() !== userId.toString());
  await room.save();

  // Remove ChatRoomMember record
  await ChatRoomMember.deleteOne({ chatRoom: roomId, user: userId });

  const io = getIO();
  const chatNamespace = io.of("/chat");

  // If no members left, delete room
  if (room.members.length === 0) {
    await ChatRoom.findByIdAndDelete(roomId);
    await ChatRoomMember.deleteMany({ chatRoom: roomId });
    chatNamespace.emit("roomDeleted", { roomId });
  }

  res.status(200).json(new ApiResponse(200, room, "Left room successfully"));
});

// ✅ Delete Room

export const deleteRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user._id;

  const room = await ChatRoom.findById(roomId);
  if (!room) throw new ApiError(404, "Room not found");

  // Check if current user is admin (for group)
  const member = await ChatRoomMember.findOne({ chatRoom: roomId, user: userId });

  const io = getIO();

  // Admin delete flow
  if (room.isGroup && member?.role === "admin") {
    // Delete room, members, and messages
    await ChatRoom.findByIdAndDelete(roomId);
    await ChatRoomMember.deleteMany({ chatRoom: roomId });
    await Message.deleteMany({ room: roomId });

    // Notify all members
    room.members.forEach((m) => {
      io.to(m.toString()).emit("roomDeleted", { roomId });
    });

    return res.status(200).json(new ApiResponse(true, "Room deleted by admin"));
  }

  // Non-admin leave flow
  // Remove the user from room members
  room.members = room.members.filter((m) => m.toString() !== userId.toString());
  await room.save();

  // Remove ChatRoomMember record
  await ChatRoomMember.deleteOne({ chatRoom: roomId, user: userId });

  // Notify others that member left
  io.to(roomId.toString()).emit("roomUpdated", {
    action: "memberLeft",
    room,
    userId,
  });

  // Delete room if no members left
  if (room.members.length === 0) {
    await ChatRoom.findByIdAndDelete(roomId);
    await ChatRoomMember.deleteMany({ chatRoom: roomId });
    await Message.deleteMany({ room: roomId });

    io.to(roomId.toString()).emit("roomDeleted", { roomId });
  }

  res.status(200).json(new ApiResponse(true, "Left room successfully", room));
});

// ====================fetch partcular contact ============

export const fetchParticularContacts = asyncHandler(async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    throw new ApiError(400, "Either email or phone number is required");
  }

  // ✅ Self-check (user cannot add himself)
  if (
    (email && email === req.user?.email) ||
    (phoneNumber && phoneNumber === req.user?.phoneNumber)
  ) {
    throw new ApiError(400, "You cannot add yourself as a contact");
  }

  // ✅ Build query safely
  const query = {};
  if (email) query.email = email;
  if (phoneNumber) query.phoneNumber = phoneNumber;

  const user = await User.findOne(query);

  if (!user) {
    throw new ApiError(404, "No user found with given email/phone");
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, sanitizeUser(user), "User retrieved successfully")
    );
});

// ================= FETCH ALL CONTACTS (by email/phone search) =================
export const fetchAllContacts = asyncHandler(async (req, res) => {
  const { query } = req.query; // frontend se `?query=value` bhejo

  if (!query) {
    throw new ApiError(400, "Search query is required");
  }

  const users = await User.find({
    $or: [
      { email: { $regex: query, $options: "i" } },
      { phoneNumber: { $regex: query, $options: "i" } },
    ],
  }).select("name email phoneNumber");

  res
    .status(200)
    .json(new ApiResponse(true, "Contacts retrieved successfully", users));
});

export const StatusOfRoomMembers = asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  // Room check
  const room = await ChatRoom.findById(roomId);
  if (!room) throw new ApiError(404, "Room not found");

  // Members with status + lastOnlineAt
  const members = await ChatRoomMember.find({ chatRoom: roomId })
    .populate("user", "name email avatar")
    .select("status role lastOnlineAt");

  const formattedMembers = members.map((m) => ({
    _id: m.user._id,
    name: m.user.name,
    email: m.user.email,
    avatar: m.user.avatar,
    role: m.role,
    status: m.status, // online / offline
    lastOnlineAt: m.status === "online" ? null : m.lastOnlineAt, 
    // 👉 agar banda online hai to lastOnlineAt ki zarurat nahi, warna show karo
  }));

  res
    .status(200)
    .json(new ApiResponse(200, formattedMembers, "Room members with status fetched"));
});

export const updateStatusOfMember = asyncHandler(async (req, res) => {
  const { roomId, status } = req.body; // roomId & new status (online/offline)
  const userId = req.user._id;


  console.log("Request body:", req.body);
  // ✅ Validate input

  if (!roomId) throw new ApiError(400, "roomId is required");
  if (!["online", "offline"].includes(status)) {
    throw new ApiError(400, "Invalid status value. Must be 'online' or 'offline'");
  }

  // 🔹 Debug log
  console.log("Update status request:", { roomId, status, userId });

  // Find the member safely
  const member = await ChatRoomMember.findOne({ chatRoom: roomId, user: userId });
  if (!member) {
    console.error("Member not found in room:", { roomId, userId });
    return res.status(404).json({ message: "Member not found in this room" });
  }

  try {
    // Update status & lastOnlineAt
    member.status = status;
    if (status === "offline") member.lastOnlineAt = new Date();

    await member.save();

    // Populate user data safely
    const populated = await member.populate("user", "name email avatar");

    // Emit to other members
    getChatNamespace().to(roomId.toString()).emit("memberStatusUpdated", {
      userId,
      roomId,
      status,
      lastOnlineAt: member.lastOnlineAt,
    });

    // ✅ Send response
    res.status(200).json(
      new ApiResponse(
        200,
        {
          _id: populated.user._id,
          name: populated.user.name,
          email: populated.user.email,
          avatar: populated.user.avatar,
          status: member.status,
          lastOnlineAt: member.lastOnlineAt,
          role: member.role,
        },
        "Member status updated successfully"
      )
    );
  } catch (err) {
    console.error("Error updating member status:", err);
    throw new ApiError(500, "Failed to update member status");
  }
});
