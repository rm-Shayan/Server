import { ApiError } from "../Utilities/ApiError.js";

// Express error-handling middleware
export const ApiErrorMiddleware = (err, req, res, next) => {
  // Default values
  let statusCode = 500;
  let message = "Something went wrong";

  // If it's an instance of ApiError
  if (err instanceof ApiError) {
    statusCode = err.statusCode || 500;
    message = err.message || "Something went wrong";
  } else if (err.name === "ValidationError") {
    // Mongoose validation error
    statusCode = 400;
    message = Object.values(err.errors).map((val) => val.message).join(", ");
  } else if (err.code && err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
  } else if (err.message) {
    message = err.message;
  }

  // Send JSON response
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    // show stack only in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
