const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require("dotenv").config();
const path = require('path');

const server = http.createServer(app);
const io = new Server(server);

const { ACTIONS } = require('../client/src/Actions');


// 🔧 Middlewares
app.use(express.json());
app.use(cors());

// ⚙️ Code Execution Route (Judge0 API)
const JUDGE0_API_URL = "https://judge0-ce.p.rapidapi.com/submissions";

app.post('/run', async (req, res) => {
    const { language_id, source_code, stdin } = req.body;
    console.log("Backend received:", { language_id, source_code, stdin });

    try {
        const { data } = await axios.post(
            `${JUDGE0_API_URL}?base64_encoded=false&wait=true`,
            {
                language_id,
                source_code,
                stdin: stdin || "",
            },
            {
                headers: {
                    "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
                    "X-RapidAPI-Key": process.env.JUDGE0_API_KEY,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("Judge0 Response:", data);
        res.json({
            stdout: data.stdout,
            stderr: data.stderr,
            status: data.status?.description || "Unknown Status",
        });
    } catch (error) {
        console.error("Execution failed:", error.response?.data || error.message);
        res.status(500).json({ error: "Execution failed" });
    }
});

// 💬 WebSocket (Socket.IO) Logic
const userSocketMap = {}; // Map of connected users by socket ID
const roomCodeMap = {}; // In-memory storage for room codes

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(socketId => ({
        socketId,
        username: userSocketMap[socketId],
    }));
}

function getCurrentCodeForRoom(roomId) {
    return roomCodeMap[roomId] || ''; // Return current code for the room or an empty string if none exists
}

function storeCurrentCodeForRoom(roomId, code) {
    roomCodeMap[roomId] = code; // Store the code in memory
}

io.on('connection', (socket) => {
    console.log('Socket connected', socket.id);

    // Join room and sync existing code
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        console.log(`User ${username} joining room: ${roomId}`);
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        // Get all connected clients in the room
        const clients = getAllConnectedClients(roomId);

        // Emit to all clients that a new user has joined
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id
            });
        });

        // Sync code on rejoin (send the current code to the rejoining user)
        const currentCode = getCurrentCodeForRoom(roomId); // Retrieve the current code for the room
        console.log(`Sending current code to new user in room ${roomId}: ${currentCode}`); // Debugging log
        socket.emit(ACTIONS.CODE_CHANGE, { code: currentCode });
    });

    // Sync code change across clients
    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        console.log(`Code changed in room ${roomId}: ${code}`); // Log code change
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
        storeCurrentCodeForRoom(roomId, code); // Store the code in memory for future sync
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        if (code !== null) {
            io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
        }
    });

    // Handle disconnection
    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));