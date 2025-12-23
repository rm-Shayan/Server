import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { initSocket } from "./Socket.js";
import { ApiErrorMiddleware } from "./Middlewares/ApiErrror.middleware.js";
import AuthRoutes from "./Routes/User.route.js";
import ChatRoomRoutes from "./Routes/ChatRooms.route.js";
import MessageRoutes from "./Routes/Messages.route.js";

export  const app = express();
export const server = createServer(app);


// 🔹 Middlewares
app.use(cookieParser());
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// ✅ Proper CORS config
const allowOrigin = ["http://localhost:5173", "http://localhost:3400"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowOrigin.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // <-- must be true
  })
);


// 🔹 Routes
app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/chatRooms", ChatRoomRoutes);
app.use("/api/v1/messages", MessageRoutes);

// 🔹 Dummy test route
app.use("/", (_, res) => {
  res.send(`<script src="/socket.io/socket.io.js"></script>
            <script>console.log("Socket.IO ready");</script>`);
});

// 🔹 404 fallback
app.use((_, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// 🔹 Error middleware
app.use(ApiErrorMiddleware);

// 🔹 Initialize Socket.IO
initSocket(server);
