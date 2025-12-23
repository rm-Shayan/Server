export const asyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await Promise.resolve(fn(req, res, next));
    } catch (err) {
      next(err); // Passes the error to Express's error-handling middleware
    }
  };
};
