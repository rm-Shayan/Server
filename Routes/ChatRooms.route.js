import express from "express";
import {
  createRoom,
  getUserRooms,
  joinRoom,
  leaveRoom,
  deleteRoom,
  StatusOfRoomMembers,
  fetchAllContacts,
  fetchParticularContacts, 
  updateStatusOfMember  // <-- import kiya
} from "../Controllers/ChatRoom.controller.js";
import { verifyJWT } from "../Middlewares/auth.middleware.js";

const router = express.Router();

// ✅ Create a new room (direct / group)
router.post("/create", verifyJWT, createRoom);

// ✅ Get all rooms for logged-in user (with pagination & last message)
router.get("/", verifyJWT, getUserRooms);

// ✅ Join a room (accept invite or search & join)
router.post("/join", verifyJWT, joinRoom);

// ✅ Fetch all contacts
router.get("/fetchContacts", verifyJWT, fetchAllContacts);

// ✅ Fetch one contact by email/phone
router.post("/fetch/particularone", verifyJWT, fetchParticularContacts);

// ✅ Leave a room
router.post("/leave", verifyJWT, leaveRoom);

// ✅ Delete a room
router.delete("/delete", verifyJWT, deleteRoom);

// ✅ Get members' online/offline status in a room
router.get("/:roomId/members/status", verifyJWT, StatusOfRoomMembers);
router.put("/:roomId/members/statusUpdate", verifyJWT, updateStatusOfMember);

export default router;
