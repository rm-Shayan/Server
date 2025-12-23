  export const getCookieOptions = (isAccess = false) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    maxAge: isAccess ? 15 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
  });


// export const getCookieOptions = (isAccess = false) => ({
//     httpOnly: true,
//     secure: false,           // local dev me false
//     sameSite: 'lax',         // cross-site POST me sometimes 'none' chahiye
//     maxAge: isAccess ? 15 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
// });