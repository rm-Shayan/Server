// utils/sanitizeUser.js
export const sanitizeUser = (user) => {
  if (!user) return null;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};
