import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone:{type:Number},
    avatar: { type: String, default: "" },
    status: { type: String, default: "offline" },
    refreshToken: { type: String }, // store refresh token
  },
  { timestamps: true }
);


userSchema.pre("save", async function(next) {
  // 'this' refers to the current document
  if (!this.isModified("password")) return next(); // Only hash if password is new/modified

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});


// ✅ Password compare
userSchema.methods.checkPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};


// ✅ Generate Access Token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { id: this._id, email: this.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE }
  );
};

// ✅ Generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
  const refreshToken = jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE }
  );
  this.refreshToken = refreshToken; // DB me store karna
  return refreshToken;
};

userSchema.methods.verifyRefreshToken = function (token) {
  try {
    return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    return null;
  }
};

export const User = mongoose.model("User", userSchema);
