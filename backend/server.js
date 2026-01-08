const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Frontend Files Serve
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

var players = {};
const MAX_PLAYERS = 5; // <--- YAHAN LIMIT SET KI HAI

// --- STAR OBJECT ---
var star = {
    x: Math.floor(Math.random() * 700) + 50,
    y: Math.floor(Math.random() * 500) + 50,
    active: true 
};

io.on('connection', (socket) => {
    
    // --- STEP 1: HOUSEFULL CHECK ---
    const currentCount = Object.keys(players).length;
    
    if (currentCount >= MAX_PLAYERS) {
        console.log(`⚠️ Connection Rejected: Server Full (${currentCount}/${MAX_PLAYERS})`);
        // Player ko batao ki server full hai
        socket.emit('serverMsg', 'Server Full! Max 5 players allowed.');
        // Turant disconnect kar do
        socket.disconnect();
        return; // Aage ka code mat चलाओ
    }

    // --- STEP 2: AGAR JAGAH HAI TOH AANE DO ---
    console.log('✅ Naya Player aaya:', socket.id, `(Total: ${currentCount + 1})`);

    players[socket.id] = {
        x: 400,
        y: 300,
        playerId: socket.id,
        score: 0
    };

    socket.emit('currentPlayers', players);
    socket.emit('starLocation', star);
    
    socket.on('requestStar', () => {
        socket.emit('starLocation', star);
    });

    socket.on('requestPlayers', () => {
        socket.emit('currentPlayers', players);
    });

    socket.broadcast.emit('newPlayer', players[socket.id]);
    io.emit('scoreUpdate', players);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // --- COIN LOGIC ---
    socket.on('starCollected', function () {
        if (!star.active) return; 

        if (players[socket.id]) {
            star.active = false;
            players[socket.id].score += 5;
            io.emit('scoreUpdate', players);

            if (players[socket.id].score >= 50) {
                io.emit('gameOver', socket.id);
                setTimeout(() => {
                    console.log('🔄 Game Resetting...');
                    Object.keys(players).forEach(id => {
                        players[id].score = 0;
                        players[id].x = 400;
                        players[id].y = 300;
                    });
                    star.x = Math.floor(Math.random() * 700) + 50;
                    star.y = Math.floor(Math.random() * 500) + 50;
                    star.active = true;
                    io.emit('gameReset');
                    io.emit('currentPlayers', players);
                    io.emit('scoreUpdate', players);
                    io.emit('starLocation', star);
                }, 5000);
            } else {
                star.x = Math.floor(Math.random() * 700) + 50;
                star.y = Math.floor(Math.random() * 500) + 50;
                star.active = true;
                io.emit('starLocation', star);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player chala gaya:', socket.id);
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
            io.emit('scoreUpdate', players);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`SERVER ON HAI! Port ${PORT} par.`);
});