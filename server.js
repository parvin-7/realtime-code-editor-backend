require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const allowedOrigins = ["http://localhost:3000","https://codistcodeeditor.netlify.app/"];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

app.use((req, res, next) => {
    console.log('Incoming request:', req.method, req.url, 'Origin:', req.headers.origin);
    next();
});

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
}));

app.get("/", (req, res) => {
    res.send("Backend is running.");
});

app.post('/run', express.json(), async (req, res) => {
    const { language_id, source_code, stdin } = req.body;
    console.log("Backend received:", { language_id, source_code, stdin });

    try {
        const options = {
            method: 'POST',
            url: 'https://judge0-ce.p.rapidapi.com/submissions',
            params: { base64_encoded: 'false', fields: '*', wait: true },
            headers: {
                'content-type': 'application/json',
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': process.env.RAPID_API_KEY,
                'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
            },
            data: JSON.stringify({
                language_id: language_id,
                source_code: source_code,
                stdin: stdin
            })
        };

        const response = await axios.request(options);
        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Execution failed" });
    }
});

const userSocketMap = new Map();

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join', ({ roomId, username }) => {
        userSocketMap.set(socket.id, username);
        socket.join(roomId);
        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(socketId => ({
            socketId,
            username: userSocketMap.get(socketId),
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
        console.log('Received CODE_CHANGE:', { roomId, code });
        socket.to(roomId).emit('code-change', { code });
    });

    socket.on('sync-code', ({ socketId, code }) => {
        console.log('Received SYNC_CODE:', { socketId, code });
        io.to(socketId).emit('code-change', { code });
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach(roomId => {
            socket.to(roomId).emit('disconnected', {
                socketId: socket.id,
                username: userSocketMap.get(socket.id) || "Someone",
            });
        });
        userSocketMap.delete(socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));