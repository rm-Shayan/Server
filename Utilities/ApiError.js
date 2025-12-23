export class ApiError extends Error {
  constructor(statusCode, msg = "Something went wrong", errors = []) {
    super(msg);  // yahan msg bhejna hoga, na ke undefined "message"

    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}
