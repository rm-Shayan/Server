import express from "express";
import {Login,RequestOTP,VerifyOTPAndLogin,RefreshAccessToken,getUser} from "../Controllers/User.controller.js"
import { verifyJWT } from "../Middlewares/auth.middleware.js";
const router=express.Router()


// ===================== AUTH ROUTES =====================

// Register or request OTP
router.post("/request-otp", RequestOTP);

// Verify OTP and login
router.post("/verify-otp", VerifyOTPAndLogin);

// Password login (OTP sent after password verification)
router.post("/login", Login);
router.get("/currentUser", verifyJWT, getUser);
router.get("/refresh/token", RefreshAccessToken);

export default router;
