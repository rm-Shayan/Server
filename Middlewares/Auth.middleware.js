// Middlewares/Auth.middleware.js
import { User } from "../Models/User.model.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../Utilities/ApiError.js";
import { asyncHandler } from "../Utilities/asyncHandler.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  // 1. Token from headers OR cookies
  let token = req.cookies?.accessToken || req.headers["authorization"];

  if (!token) return next(new ApiError(401, "Access token missing"));

  // If token comes as "Bearer <token>", split it
  if (token.startsWith("Bearer ")) {
    token = token.split(" ")[1];
  }

  // 2. Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    return next(new ApiError(401, "Invalid or expired access token"));
  }

  if (!decoded || !decoded.id) {
    return next(new ApiError(401, "Invalid token payload"));
  }

  // 3. Find user in DB
  const user = await User.findById(decoded.id).select("-password -refreshToken");
  if (!user) {
    return next(new ApiError(401, "User not found or deleted"));
  }

  // 4. Attach user to request
  req.user = user;

  next();
});
