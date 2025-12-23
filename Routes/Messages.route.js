import express from "express";
import { verifyJWT } from "../Middlewares/auth.middleware.js";
import {
  sendMessage,
  getMessages,
  deleteMessage,
  editMessage,
  markAsRead
} from "../Controllers/Message.controller.js";

const router = express.Router();

// ✅ Message bhejna
// (better: roomId URL params se lo instead of body)
router.post("/send", verifyJWT, sendMessage);

// ✅ Room ke messages fetch karna (pagination ke sath)
router.get("/:roomId", verifyJWT, getMessages);

// ✅ Message update/edit karna
router.put("/edit/:messageId", verifyJWT, editMessage);

// ✅ Message delete karna
router.delete("/delete/:messageId", verifyJWT, deleteMessage);

// ✅ Messages ko read mark karna
router.put("/read", verifyJWT, markAsRead);

export default router;
