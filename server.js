require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const allowedOrigins = ["https://realtime-code-editor-henna.vercel.app", "http://localhost:3000"];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
}));

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Backend is running.");
});

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
                stdin,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-RapidAPI-Key': process.env.RAPID_API_KEY,
                    'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
                }
            }
        );

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Code execution failed" });
    }
});

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join', ({ roomId, username }) => {
        socket.join(roomId);
        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(socketId => ({
            socketId,
            username,
        }));

        clients.forEach(({ socketId }) => {
            io.to(socketId).emit('joined', {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on('code-change', ({ roomId, code }) => {
        socket.in(roomId).emit('code-change', { code });
    });

    socket.on('sync-code', ({ socketId, code }) => {
        io.to(socketId).emit('code-change', { code });
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach(roomId => {
            socket.to(roomId).emit('disconnected', {
                socketId: socket.id,
                username: "Someone",
            });
        });
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));