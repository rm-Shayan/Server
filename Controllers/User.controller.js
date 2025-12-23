import { User } from "../Models/User.model.js";
import {
  sendOTPToUser,
  sendWelcomeToUser,

} from "../Services/Mail.service.js";
import { asyncHandler } from "../Utilities/asyncHandler.js";
import { ApiError } from "../Utilities/ApiError.js";
import jwt from "jsonwebtoken";
import { ApiResponse } from "../Utilities/ApiResponse.js";
import { sanitizeUser } from "../Utilities/SanitizeUser.js";
import { generateOTP } from "../Utilities/mail.js";
import { getCookieOptions } from "../Utilities/cookieOption.js";

// Helper: Generate access & refresh tokens
const generateAccessAndRefresh = async (user) => {
  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save();

    return { accessToken, refreshToken };
  } catch (err) {
    throw new ApiError(500, "Failed to generate tokens");
  }
};

// ===================== REQUEST OTP / REGISTER =====================


export const RequestOTP = asyncHandler(async (req, res) => {
  const { email, name, password } = req.body;

  if (!email) throw new ApiError(400, "Email is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError(400, "Invalid email format");

  let user = await User.findOne({ email });

  if (!user) {
    // New registration
    if (!name || !password) throw new ApiError(400, "Name and password required");
    if (password.length < 6) throw new ApiError(400, "Password must be at least 6 characters");

    user = await User.create({ name, email, password }); // password pre-save hook se hash hoga
  }

  // OTP create
  const otp = generateOTP();

  // JWT token banega (expiry 5 min)
  const otpToken = jwt.sign(
    { email, otp },
    process.env.OTP_SECRET,
    { expiresIn: "5m" } // ✅ 5 minutes expiry
  );

  await sendOTPToUser(user, otp);

  return res.status(200).json(
    new ApiResponse(true, "OTP sent to email successfully", {
      email,
      otpToken, // ✅ client ke paas yeh hoga verify karne ke liye
    })
  );
});

// ===================== VERIFY OTP & LOGIN =====================

export const VerifyOTPAndLogin = asyncHandler(async (req, res) => {
  const { otpToken, otp } = req.body;

  if (!otpToken || !otp) throw new ApiError(400, "OTP token and OTP are required");

  let decoded;
  try {
    decoded = jwt.verify(otpToken, process.env.OTP_SECRET);
  } catch (err) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  if (decoded.otp !== otp) {
    throw new ApiError(400, "Incorrect OTP");
  }

  const user = await User.findOne({ email: decoded.email });
  if (!user) throw new ApiError(404, "User not found");

  // ✅ tokens generate
  const { accessToken, refreshToken } = await generateAccessAndRefresh(user);
  console.log("Tokens generated:", accessToken, refreshToken);

  // ✅ set cookies
  res.cookie("refreshToken", refreshToken, getCookieOptions(false));
  res.cookie("accessToken", accessToken, getCookieOptions(true));

  // ✅ mark verified if new
  if (!user.isVerified) {
    await sendWelcomeToUser(user);
    user.isVerified = true;
    await user.save();
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { accessToken, user: sanitizeUser(user) },
      "OTP verified. Login successful."
    )
  );
});


// ===================== PASSWORD LOGIN =====================
export const Login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) throw new ApiError(400, "Email and password are required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "User not found");

  const isMatch = await user.checkPassword(password);
  if (!isMatch) throw new ApiError(400, "Incorrect password");

  // OTP generate (crypto based function ya Math.random use karo)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // JWT with OTP (5 min expiry)
  const otpToken = jwt.sign(
    { email, otp },
    process.env.OTP_SECRET,
    { expiresIn: "5m" }
  );

  await sendOTPToUser(user, otp);

  return res.status(200).json(
    new ApiResponse(200, {
      email,
      otpToken, // ✅ client verify ke liye isko store karega
    }, "Password verified. OTP sent to email.")
  );
});


// ===================== REFRESH ACCESS TOKEN =====================
// auth.js
export const RefreshAccessToken = asyncHandler(async (req, res) => {
  const tokenFromCookie = req.cookies?.refreshToken;
  if (!tokenFromCookie) throw new ApiError(401, "Refresh token missing");

  let decoded;
  try {
    decoded = jwt.verify(tokenFromCookie, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new ApiError(403, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new ApiError(404, "User not found");

  if (user.refreshToken !== tokenFromCookie) {
    throw new ApiError(403, "Refresh token does not match");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefresh(user);

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie("refreshToken", refreshToken, getCookieOptions(false));
  res.cookie("accessToken", accessToken, getCookieOptions(true));

  return res.status(200).json(
    new ApiResponse(200, { accessToken }, "Access token refreshed")
  );
});

// Logout
export const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  // ❌ DB se refresh token hatao
  user.refreshToken = null;
  await user.save();

  // ❌ cookies clear
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "none",
  });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "none",
  });

  return res
    .status(200)
    .json(new ApiResponse(true, "Logged out successfully"));
});

export const getUser = asyncHandler(async (req, res, next) => {
  const user = req?.user;

  console.log("User from verifyJWT →", req.user);
  if (!user) {
    return next(new ApiError(400, "Unauthorized"));
  }

  // Properly sanitize before sending
  const safeUser = sanitizeUser(user);

  return res
    .status(200)
    .json(new ApiResponse(200, safeUser, "Data retrieved successfully"));
});
