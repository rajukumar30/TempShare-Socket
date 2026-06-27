import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const SOCKET_SECRET = process.env.SOCKET_SERVER_SECRET ?? "";
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ?? "http://localhost:3000"
).split(",");

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

const roomPresence = new Map<string, Set<string>>();

function broadcastPresence(roomCode: string) {
  const count = roomPresence.get(roomCode)?.size ?? 0;
  io.to(roomCode).emit("presence-updated", { count });
}

io.on("connection", (socket) => {
  let currentRoom: string | null = null;

  socket.on("join-room", (roomCode: string) => {
    if (!roomCode || typeof roomCode !== "string") return;

    if (currentRoom) {
      socket.leave(currentRoom);
      roomPresence.get(currentRoom)?.delete(socket.id);
      if (roomPresence.get(currentRoom)?.size === 0) {
        roomPresence.delete(currentRoom);
      }
      broadcastPresence(currentRoom);
    }

    currentRoom = roomCode.toUpperCase();
    socket.join(currentRoom);

    if (!roomPresence.has(currentRoom)) {
      roomPresence.set(currentRoom, new Set());
    }
    roomPresence.get(currentRoom)!.add(socket.id);
    broadcastPresence(currentRoom);
  });

  socket.on("leave-room", () => {
    if (!currentRoom) return;
    socket.leave(currentRoom);
    roomPresence.get(currentRoom)?.delete(socket.id);
    if (roomPresence.get(currentRoom)?.size === 0) {
      roomPresence.delete(currentRoom);
    }
    broadcastPresence(currentRoom);
    currentRoom = null;
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    roomPresence.get(currentRoom)?.delete(socket.id);
    if (roomPresence.get(currentRoom)?.size === 0) {
      roomPresence.delete(currentRoom);
    }
    broadcastPresence(currentRoom);
  });
});

app.use(
  cors({
    origin: allowedOrigins,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/notify", (req, res) => {
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!SOCKET_SECRET || auth !== SOCKET_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { event, roomCode, data } = req.body as {
    event: string;
    roomCode: string;
    data?: Record<string, unknown>;
  };

  if (!event || !roomCode) {
    res.status(400).json({ error: "Missing event or roomCode" });
    return;
  }

  io.to(roomCode.toUpperCase()).emit(event, data ?? {});
  res.json({ success: true });
});

httpServer.listen(PORT, () => {
  console.log(`Socket server listening on port ${PORT}`);
});
