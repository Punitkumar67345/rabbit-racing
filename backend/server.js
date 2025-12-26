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

// --- STAR OBJECT (Active Flag ke saath) ---
var star = {
  x: Math.floor(Math.random() * 700) + 50,
  y: Math.floor(Math.random() * 500) + 50,
  active: true // TRUE matlab coin abhi wahan hai
};

io.on('connection', (socket) => {
    console.log('Naya Player aaya:', socket.id);

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

    // --- STRICT COIN COLLECTION LOGIC ---
    socket.on('starCollected', function () {
        // 1. Check karo: Kya coin abhi active hai?
        // Agar active FALSE hai, iska matlab kisi ne (ya isi player ne) abhi uthaya hai.
        // TOH RUK JAO (Return). Point mat do.
        if (!star.active) {
            return; 
        }

        if (players[socket.id]) {
            // 2. Turant Coin ko Inactive kar do (Taaki dubara count na ho)
            star.active = false;

            // 3. Score Badhao
            players[socket.id].score += 10;
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
                    
                    // Reset ke waqt naya coin aur Active TRUE
                    star.x = Math.floor(Math.random() * 700) + 50;
                    star.y = Math.floor(Math.random() * 500) + 50;
                    star.active = true;

                    io.emit('gameReset');
                    io.emit('currentPlayers', players);
                    io.emit('scoreUpdate', players);
                    io.emit('starLocation', star);
                }, 5000);

            } else {
                // Game chal raha hai -> Naya coin banao
                star.x = Math.floor(Math.random() * 700) + 50;
                star.y = Math.floor(Math.random() * 500) + 50;
                star.active = true; // Wapas Active kar do
                
                io.emit('starLocation', star);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player chala gaya:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
        io.emit('scoreUpdate', players);
    });
});

server.listen(3000, () => {
    console.log('SERVER ON HAI! Port 3000 par.');
});